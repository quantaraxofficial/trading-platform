"""The live part of collab charts: one WebSocket per person per open collab chart
(ws/collab/<token>/?uid=…&session_key=…).

The room's shared chart (symbol, interval, indicators, drawings per symbol) is kept in memory
while anyone is connected and written to the database a moment after it changes. Cursors,
voice-call signalling and each person's paper trades are passed straight through to the
others. Chat messages are saved, then sent to everyone.

Runs in one server process (the in-memory channel layer); with several processes the room
state and the channel layer would move to Redis.
"""
import asyncio
import base64
import json
import secrets
import time
from urllib.parse import unquote

from channels.db import database_sync_to_async
from pycrdt import Doc, Map, Text
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.utils import timezone

from .collab import clean_pine, color_of, display_name, group_name, message_json, perms_of, room_json
from .models import CollabMember, CollabMessage, CollabRoom, UserSession

SAVE_DELAY = 1.5          # seconds after the last change before the room is written to the DB
MAX_MESSAGE_BYTES = 512_000
MAX_CHAT_CHARS = 2000
HISTORY_MESSAGES = 100
EDIT_TYPES = {'chart', 'indicators', 'drawings.upsert', 'drawings.delete', 'drawings.replace', 'pine'}
MAX_ALERTS = 100
MAX_PINE_DOC_CHARS = 200_000
ALERT_OPERATORS = {'Crossing', 'Crossing Up', 'Crossing Down', 'Greater Than', 'Less Than'}
ALERT_TRIGGERS = {'Once only', 'Every time'}
# Several browsers report the same crossing: one firing per alert within this many seconds (a
# level alert set to "Every time" fires at most once a minute, as for personal alerts)
# A Pine-script collab shares only the code: the chart's messages are ignored there
CHART_ONLY = {'chart', 'indicators', 'drawings.upsert', 'drawings.delete', 'drawings.replace', 'pine',
              'replay', 'alert.add', 'alert.remove', 'alert.update', 'alert.fired', 'trades', 'cursor'}
CROSSING_GAP = 10
LEVEL_GAP = 60


class RoomState:
    """A room's shared chart and who's in it, while anyone is connected"""

    def __init__(self, room):
        self.room_id = room.id
        self.symbol = room.symbol
        self.interval = room.interval
        self.indicators = list(room.indicators or [])
        self.drawings = {k: list(v) for k, v in (room.drawings or {}).items() if isinstance(v, list)}
        self.pine = room.pine
        self.alerts = [a for a in (room.alerts or []) if isinstance(a, dict)]
        # The Pine Editor's code, edited live (Yjs): started from the chart's script
        self.pine_doc = Doc()
        self.pine_text = self.pine_doc.get('code', type=Text)
        if room.pine_doc:
            try:
                self.pine_doc.apply_update(base64.b64decode(room.pine_doc))
            except Exception:
                pass
        elif room.pine and room.pine.get('code'):
            with self.pine_doc.transaction():
                self.pine_text.insert(0, room.pine['code'])
                self.pine_doc.get('meta', type=Map)['language'] = room.pine.get('language') or 'pine'
        self.peers = {}        # channel name -> {id, uid, name, color, role, perms, voice, muted}
        self.trades = {}       # uid -> {symbol, lines, name, color}
        # The replay everyone follows: {driver (channel name or None), driver_uid, driver_name,
        # time (the last bar shown), playing, speed}, or None
        self.replay = None
        self.save_task = None

    def pine_doc_state(self):
        return base64.b64encode(self.pine_doc.get_update()).decode()

    def chart(self):
        return {"symbol": self.symbol, "interval": self.interval, "indicators": self.indicators,
                "drawings": self.drawings.get(self.symbol, []), "pine": self.pine}


ROOMS: dict[int, RoomState] = {}
ROOMS_LOCK = asyncio.Lock()


def _merge_drawings(current, incoming):
    """Adds or replaces drawings by id; the most recently changed copy of a drawing wins"""
    by_id = {d.get('id'): i for i, d in enumerate(current) if isinstance(d, dict)}
    out = list(current)
    for d in incoming:
        if not isinstance(d, dict) or not d.get('id'):
            continue
        i = by_id.get(d['id'])
        if i is None:
            by_id[d['id']] = len(out)
            out.append(d)
        elif (d.get('modifiedAt') or 0) >= (out[i].get('modifiedAt') or 0):
            out[i] = d
    return out


class CollabConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        self.token = self.scope['url_route']['kwargs']['token']
        qs = dict(p.split('=', 1) for p in self.scope.get('query_string', b'').decode().split('&') if '=' in p)
        uid, key = unquote(qs.get('uid', '')), unquote(qs.get('session_key', ''))
        found = await self._load_member(uid, key)
        if not found:
            await self.close(code=4403)
            return
        self.room, self.member = found
        self.uid = uid
        self.group = group_name(self.room)
        async with ROOMS_LOCK:
            state = ROOMS.get(self.room.id)
            if state is None:
                state = ROOMS[self.room.id] = RoomState(self.room)
        self.state = state
        self.peer = {
            "id": self.channel_name, "uid": uid, "name": display_name(self.member.profile),
            "color": color_of(uid), "role": self.member.role, "perms": perms_of(self.member), "voice": False, "muted": False,
        }
        state.peers[self.channel_name] = self.peer
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()
        room = await self._room_json()
        messages = await self._recent_messages()
        await self.send_json({
            "type": "init", "you": self.channel_name, "room": room, "chart": state.chart(),
            "peers": list(state.peers.values()), "trades": state.trades, "messages": messages, "replay": state.replay,
            "alerts": state.alerts, "pinedoc": state.pine_doc_state(),
        })
        await self._broadcast({"type": "peer.joined", "peer": self.peer}, exclude=self.channel_name)

    async def disconnect(self, code):
        state = getattr(self, 'state', None)
        if not state:
            return
        state.peers.pop(self.channel_name, None)
        if not any(p['uid'] == self.uid for p in state.peers.values()):
            state.trades.pop(self.uid, None)
        await self.channel_layer.group_discard(self.group, self.channel_name)
        await self._broadcast({"type": "peer.left", "id": self.channel_name, "uid": self.uid})
        await self._release_replay()
        if not state.peers:
            # Last one out: save now and let the room go
            await self._save_now()
            async with ROOMS_LOCK:
                if not state.peers and ROOMS.get(state.room_id) is state:
                    ROOMS.pop(state.room_id, None)

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data or len(text_data) > MAX_MESSAGE_BYTES:
            return
        try:
            msg = json.loads(text_data)
        except ValueError:
            return
        if isinstance(msg, dict):
            await self.receive_json(msg)

    async def receive_json(self, msg, **kwargs):
        kind = msg.get('type')
        state = self.state
        perms = self.peer['perms']
        if self.room.kind == 'pine' and kind in CHART_ONLY:
            return
        if kind in EDIT_TYPES and not perms['edit']:
            await self.send_json({"type": "error", "error": "You can view this chart but not change it"})
            return

        if kind == 'chart':
            if isinstance(msg.get('symbol'), str) and msg['symbol']:
                state.symbol = msg['symbol'][:40]
            if isinstance(msg.get('interval'), str) and msg['interval']:
                state.interval = msg['interval'][:20]
            self._schedule_save()
            # A new symbol or interval ends the replay (its bars are gone)
            if state.replay:
                state.replay = None
                await self._broadcast({"type": "replay", "replay": None})
            # The sender gets it too: it carries the room's drawings for the symbol switched to
            await self._broadcast({"type": "chart", "symbol": state.symbol, "interval": state.interval,
                                   "drawings": state.drawings.get(state.symbol, []), "by": self.uid})
        elif kind == 'indicators' and isinstance(msg.get('indicators'), list):
            state.indicators = msg['indicators']
            self._schedule_save()
            await self._broadcast({"type": "indicators", "indicators": state.indicators, "by": self.uid}, exclude=self.channel_name)
        elif kind in ('drawings.upsert', 'drawings.delete', 'drawings.replace'):
            symbol = msg.get('symbol') if isinstance(msg.get('symbol'), str) else state.symbol
            current = state.drawings.get(symbol, [])
            if kind == 'drawings.upsert' and isinstance(msg.get('drawings'), list):
                state.drawings[symbol] = _merge_drawings(current, msg['drawings'])
            elif kind == 'drawings.delete' and isinstance(msg.get('ids'), list):
                gone = set(msg['ids'])
                state.drawings[symbol] = [d for d in current if d.get('id') not in gone]
            elif kind == 'drawings.replace' and isinstance(msg.get('drawings'), list):
                state.drawings[symbol] = [d for d in msg['drawings'] if isinstance(d, dict)]
            else:
                return
            self._schedule_save()
            out = {k: v for k, v in msg.items() if k in ('type', 'drawings', 'ids')}
            await self._broadcast({**out, "symbol": symbol, "by": self.uid}, exclude=self.channel_name)
        elif kind == 'cursor':
            await self._broadcast({"type": "cursor", "id": self.channel_name, "uid": self.uid,
                                   "symbol": msg.get('symbol'), "time": msg.get('time'), "price": msg.get('price')},
                                  exclude=self.channel_name)
        elif kind == 'trades':
            lines = msg.get('lines') if isinstance(msg.get('lines'), list) else []
            snap = {"symbol": msg.get('symbol'), "lines": lines[:50], "name": self.peer['name'], "color": self.peer['color']}
            state.trades[self.uid] = snap
            await self._broadcast({"type": "trades", "uid": self.uid, "trades": snap}, exclude=self.channel_name)
        elif kind == 'chat':
            text = str(msg.get('text') or '').strip()[:MAX_CHAT_CHARS]
            if not text:
                return
            saved = await self._save_message(text)
            await self._broadcast({"type": "chat", "message": saved, "client_id": msg.get('client_id')})
        elif kind == 'voice':
            # Without mic permission they can still listen in, always muted
            self.peer['voice'] = bool(msg.get('voice'))
            self.peer['muted'] = bool(msg.get('muted')) or not perms['voice']
            await self._broadcast({"type": "peer.updated", "peer": self.peer}, exclude=self.channel_name)
        elif kind == 'replay':
            await self._on_replay(msg)
        elif kind == 'pine':
            state.pine = clean_pine(msg.get('pine'))
            self._schedule_save()
            await self._broadcast({"type": "pine", "pine": state.pine, "by": self.uid}, exclude=self.channel_name)
        elif kind in ('alert.add', 'alert.remove', 'alert.update', 'alert.fired'):
            await self._on_alert(kind, msg)
        elif kind in ('pinedoc.update', 'pinedoc.seed'):
            await self._on_pine_doc(kind, msg)
        elif kind == 'pinedoc.cursor':
            # Where this person's cursor / selection is in the shared code (anyone, editing or not)
            await self._broadcast({"type": "pinedoc.cursor", "id": self.channel_name, "uid": self.uid,
                                   "anchor": msg.get('anchor'), "head": msg.get('head')}, exclude=self.channel_name)
        elif kind == 'rtc':
            to = msg.get('to')
            if not self.peer['voice']:
                return
            if isinstance(to, str) and to in state.peers and isinstance(msg.get('data'), dict):
                await self.channel_layer.send(to, {"type": "relay", "payload": {"type": "rtc", "from": self.channel_name, "data": msg['data']}})
        elif kind == 'ping':
            await self.send_json({"type": "pong", "t": msg.get('t')})

    # ---- events from the channel layer

    async def relay(self, event):
        if event.get('exclude') and event['exclude'] == self.channel_name:
            return
        await self.send_json(event['payload'])

    async def chat_saved(self, event):
        await self.send_json({"type": "chat", "message": event['message']})

    async def access_changed(self, event):
        """Members or access changed through the API: re-check this person's access"""
        member = await self._reload_member()
        if member is None or member == 'kicked':
            await self.send_json({"type": "removed", "kicked": member == 'kicked'})
            await self.close(code=4403)
            return
        self.peer['role'] = member.role
        self.peer['perms'] = perms_of(member)
        if self.peer['voice'] and not self.peer['perms']['voice'] and not self.peer['muted']:
            # Their mic goes off; they stay in the call, listening
            self.peer['muted'] = True
            await self.send_json({"type": "voice.revoked", "error": "The owner turned off your mic"})
        if not self.peer['perms']['replay']:
            await self._release_replay()
        await self._broadcast({"type": "peer.updated", "peer": self.peer}, exclude=self.channel_name)
        await self.send_json({"type": "room", "room": await self._room_json(), "peers": list(self.state.peers.values())})

    async def join_request(self, event):
        """Someone without access asked to be let in: tell those who can let them in"""
        if self.peer['perms'].get('invite'):
            await self.send_json({"type": "join.request", "request": event['request']})
            await self.send_json({"type": "room", "room": await self._room_json(), "peers": list(self.state.peers.values())})

    async def room_ended(self, event):
        await self.send_json({"type": "ended"})
        await self.close(code=4410)

    # ---- the Pine Editor's code, edited live

    async def _on_pine_doc(self, kind, msg):
        state = self.state
        if not self.peer['perms'].get('pine'):
            await self.send_json({"type": "pinedoc.denied", "error": "The owner hasn't let you edit the Pine Script",
                                  "state": state.pine_doc_state()})
            return
        if kind == 'pinedoc.seed':
            # The first one to open the editor fills an empty document with their code (once)
            text = msg.get('text')
            if not isinstance(text, str) or not text or len(state.pine_text) > 0 or len(text) > MAX_PINE_DOC_CHARS:
                return
            before = state.pine_doc.get_state()
            with state.pine_doc.transaction():
                state.pine_text.insert(0, text)
            update = base64.b64encode(state.pine_doc.get_update(before)).decode()
            self._schedule_save()
            await self._broadcast({"type": "pinedoc.update", "u": update})
            return
        u = msg.get('u')
        if not isinstance(u, str) or len(u) > 2 * MAX_PINE_DOC_CHARS:
            return
        try:
            state.pine_doc.apply_update(base64.b64decode(u))
        except Exception:
            # Out of step with the room: start again from its copy
            await self.send_json({"type": "pinedoc.reset", "state": state.pine_doc_state()})
            return
        if len(state.pine_text) > MAX_PINE_DOC_CHARS:
            await self.send_json({"type": "error", "error": "The script is too long to share"})
        self._schedule_save()
        await self._broadcast({"type": "pinedoc.update", "u": u}, exclude=self.channel_name)

    # ---- shared alerts

    async def _on_alert(self, kind, msg):
        state = self.state
        now = time.time()
        if kind == 'alert.add':
            if not self.peer['perms'].get('alert'):
                await self.send_json({"type": "error", "error": "The owner hasn't let you share alerts"})
                return
            a = msg.get('alert') if isinstance(msg.get('alert'), dict) else {}
            value = a.get('value')
            if (not isinstance(a.get('symbol'), str) or a.get('condition') not in ALERT_OPERATORS
                    or not isinstance(value, (int, float)) or isinstance(value, bool)):
                return
            if len(state.alerts) >= MAX_ALERTS:
                await self.send_json({"type": "error", "error": f"A collab can share up to {MAX_ALERTS} alerts"})
                return
            expiration = a.get('expiration') if isinstance(a.get('expiration'), (int, float)) else None
            state.alerts.append({
                "id": secrets.token_hex(6), "symbol": a['symbol'][:40], "condition": a['condition'], "value": value,
                "trigger": a.get('trigger') if a.get('trigger') in ALERT_TRIGGERS else 'Once only',
                "expiration": expiration, "message": str(a.get('message') or '')[:500],
                "status": 'active', "created_at": int(now * 1000), "last_triggered_at": None,
                "created_by": self.uid, "created_by_name": self.peer['name'], "color": self.peer['color'],
            })
            await self._alerts_changed()
            return

        target = next((a for a in state.alerts if a.get('id') == msg.get('id')), None)
        if not target:
            return
        mine_or_owner = target.get('created_by') == self.uid or self.peer['role'] == 'owner'
        if kind == 'alert.remove':
            if not mine_or_owner:
                return
            state.alerts = [a for a in state.alerts if a is not target]
            await self._alerts_changed()
        elif kind == 'alert.update':
            if not mine_or_owner or msg.get('status') not in ('active', 'stopped'):
                return
            target['status'] = msg['status']
            if msg['status'] == 'active' and target.get('expiration') and target['expiration'] < now * 1000:
                target['expiration'] = int((now + 30 * 86400) * 1000)   # a restart gets a fresh month
            await self._alerts_changed()
        elif kind == 'alert.fired':
            # Reported by whichever browsers saw the price get there; it fires once
            price = msg.get('price')
            if target.get('status') != 'active' or not isinstance(price, (int, float)):
                return
            if target.get('expiration') and target['expiration'] < now * 1000:
                target['status'] = 'expired'
                await self._alerts_changed()
                return
            level = target['condition'] in ('Greater Than', 'Less Than')
            gap = LEVEL_GAP if level else CROSSING_GAP
            last = target.get('last_triggered_at')
            if last and now * 1000 - last < gap * 1000:
                return
            target['last_triggered_at'] = int(now * 1000)
            if target.get('trigger') != 'Every time':
                target['status'] = 'triggered'
            text = target.get('message') or f"{target['symbol']} {target['condition']} {target['value']}"
            saved = await self._save_message(f"🔔 Alert: {text} — at {price} · set by {target.get('created_by_name')}", kind='system')
            await self._broadcast({"type": "chat", "message": saved})
            await self._broadcast({"type": "alert.fired", "alert": target, "price": price, "time": int(now * 1000)})
            await self._alerts_changed()

    async def _alerts_changed(self):
        self._schedule_save()
        await self._broadcast({"type": "alerts", "alerts": self.state.alerts})

    # ---- the shared replay

    async def _on_replay(self, msg):
        """{action: "update", time, playing, speed, take?} from the one driving it (or someone with
        replay permission taking it over), {action: "stop"} to end it for everyone"""
        state = self.state
        current = state.replay
        is_owner = self.peer['role'] == 'owner'
        if not self.peer['perms']['replay']:
            await self.send_json({"type": "error", "error": "The owner hasn't let you control the replay"})
            return
        if msg.get('action') == 'stop':
            if current and current.get('driver') not in (None, self.channel_name) and not is_owner:
                return
            state.replay = None
            await self._broadcast({"type": "replay", "replay": None, "by": self.uid})
            return
        if msg.get('action') != 'update' or not isinstance(msg.get('time'), (int, float)):
            return
        if current and current.get('driver') not in (None, self.channel_name) and not msg.get('take'):
            return   # someone else is driving: taking over has to be asked for
        speed = msg.get('speed') if isinstance(msg.get('speed'), (int, float)) and 0 < msg['speed'] <= 100 else 1
        state.replay = {
            "driver": self.channel_name, "driver_uid": self.uid, "driver_name": self.peer['name'],
            "time": msg['time'], "playing": bool(msg.get('playing')), "speed": speed,
        }
        await self._broadcast({"type": "replay", "replay": state.replay}, exclude=self.channel_name)

    async def _release_replay(self):
        """The driver left or lost permission: the replay stays where it is, paused, for someone
        else to pick up"""
        state = self.state
        if state.replay and state.replay.get('driver') == self.channel_name:
            state.replay = {**state.replay, "driver": None, "playing": False}
            await self._broadcast({"type": "replay", "replay": state.replay})

    # ---- helpers

    async def _broadcast(self, payload, exclude=None):
        await self.channel_layer.group_send(self.group, {"type": "relay", "payload": payload, "exclude": exclude})

    def _schedule_save(self):
        state = self.state
        if state.save_task and not state.save_task.done():
            state.save_task.cancel()
        state.save_task = asyncio.ensure_future(self._save_later(state))

    async def _save_later(self, state):
        try:
            await asyncio.sleep(SAVE_DELAY)
        except asyncio.CancelledError:
            return
        await self._write(state)

    async def _save_now(self):
        state = self.state
        if state.save_task and not state.save_task.done():
            state.save_task.cancel()
            await self._write(state)

    @database_sync_to_async
    def _write(self, state):
        CollabRoom.objects.filter(id=state.room_id).update(
            symbol=state.symbol, interval=state.interval, indicators=state.indicators,
            drawings=state.drawings, pine=state.pine, alerts=state.alerts, pine_doc=state.pine_doc_state(),
            updated_at=timezone.now())

    @database_sync_to_async
    def _load_member(self, uid, key):
        if not uid or not key:
            return None
        session = UserSession.objects.filter(session_key=key, user__uid=uid).select_related('user').first()
        if not session:
            return None
        room = CollabRoom.objects.filter(token=self.token, active=True).select_related('owner').first()
        if not room:
            return None
        member = CollabMember.objects.filter(room=room, profile=session.user).select_related('profile', 'room').first()
        return (room, member) if member else None

    @database_sync_to_async
    def _reload_member(self):
        room = CollabRoom.objects.filter(id=self.room.id, active=True).first()
        if not room:
            return None
        member = CollabMember.objects.filter(room=room, profile=self.member.profile).select_related('room').first()
        if member is None and room.kicked.filter(id=self.member.profile_id).exists():
            return 'kicked'
        return member

    @database_sync_to_async
    def _room_json(self):
        room = CollabRoom.objects.select_related('owner').get(id=self.room.id)
        return room_json(room, self.member.profile)

    @database_sync_to_async
    def _recent_messages(self):
        msgs = list(CollabMessage.objects.filter(room_id=self.room.id).select_related('author').order_by('-created_at')[:HISTORY_MESSAGES])
        return [message_json(m) for m in reversed(msgs)]

    @database_sync_to_async
    def _save_message(self, text, kind='text'):
        msg = CollabMessage.objects.create(room_id=self.room.id, author=self.member.profile if kind == 'text' else None, kind=kind, text=text)
        CollabRoom.objects.filter(id=self.room.id).update(updated_at=timezone.now())
        return message_json(msg)
