"""A copy channel's signals posted out as well as copied (core/copier.py): every open, stop move and
close, to wherever the channel's owner connected it:

- Telegram: their own bot (a token from @BotFather), made an admin of their channel or a member of
  their group; the chat is "@channelname" or its numeric id. A stop move or a close is posted as a
  reply to the trade's first post.
- Discord: a channel's webhook (Channel settings → Integrations → Webhooks → Copy webhook URL).
- WhatsApp: the WhatsApp Cloud API (Meta for Developers: a phone number id and an access token)
  sending to a list of numbers. WhatsApp only lets a business start a conversation with an
  approved template; with one set (a body with one {{1}}), the signal fills it in; without one,
  plain messages only reach people who wrote to that number in the last 24 hours. WhatsApp groups
  and channels can't be posted to through any official API.
- Here: one of the owner's group chats, personal chats or collabs, as a signal card whose "Copy this
  channel" button follows it.

Posting runs on a queue in the background, so it never slows the copying down. Every post's result
is kept (CopyPost) and the connection shows its last one.
"""
import base64
import hashlib
import html
import json
import logging
import queue
import re
import threading
import time

import requests
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
from django.db import close_old_connections
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session
from .models import (ChatGroup, ChatGroupMember, ChatGroupMessage, CollabMember, CollabMessage, CollabRoom, CopyChannel, CopyConnection,
                     CopyPost, CopySignal)

log = logging.getLogger(__name__)
TIMEOUT = 15
TELEGRAM = "https://api.telegram.org"
GRAPH = "https://graph.facebook.com"
DISCORD_WEBHOOK = re.compile(r"^https://(?:(?:ptb|canary)\.)?discord(?:app)?\.com/api/(?:v\d+/)?webhooks/(\d+)/([\w-]+)$")
TELEGRAM_TOKEN = re.compile(r"^\d{5,}:[\w-]{30,}$")
TELEGRAM_CHAT = re.compile(r"^(@[A-Za-z][\w]{3,}|-?\d{5,})$")


class ShareError(Exception):
    pass


# ---------------------------------------------------------------- the tokens, encrypted

def _fernet():
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(f"copy-connection:{settings.SECRET_KEY}".encode()).digest()))


def seal(d):
    return _fernet().encrypt(json.dumps(d).encode()).decode()


def unseal(blob):
    try:
        return json.loads(_fernet().decrypt(blob.encode()).decode())
    except (InvalidToken, ValueError):
        return {}


# ---------------------------------------------------------------- what's posted

def _price(v):
    return "—" if v is None else ("%.8f" % v).rstrip("0").rstrip(".")


def card_of(sig, opened):
    """The signal as data: the chats' card here, and what the texts are made from"""
    ch = sig.channel
    return {
        "signal": sig.id, "kind": sig.kind, "ref": sig.ref, "symbol": sig.symbol,
        "side": (opened.side if opened else sig.side) or "", "entry": sig.entry if sig.kind == "open" else None,
        "sl": sig.sl, "tp": sig.tp, "risk": sig.risk_percent if sig.kind == "open" else None,
        "fraction": sig.fraction if sig.kind == "close" else None,
        "channel": {"id": ch.id, "name": ch.name, "code": ch.code, "owner": ch.owner.name or ch.owner.email.split("@")[0]},
    }


def render(card, style="plain", code=False):
    """The post's text. style: html (Telegram), md (Discord), wa (WhatsApp), plain (chats here, previews)"""
    def esc(s):
        s = str(s)
        if style == "html":
            return html.escape(s)
        if style == "md":
            return re.sub(r"([\\*_~`|>#\[\]()])", r"\\\1", s)
        return s

    def b(s):
        return {"html": f"<b>{s}</b>", "md": f"**{s}**", "wa": f"*{s}*"}.get(style, s)

    side = card["side"].upper()
    sym = esc(card["symbol"])
    stops = f"SL {_price(card['sl'])} · TP {_price(card['tp'])}"
    if card["kind"] == "open":
        lines = [f"{'🟢' if card['side'] == 'buy' else '🔴'} {b(f'{side} {sym}')}",
                 f"Entry {'market' if card['entry'] is None else _price(card['entry'])}", stops]
        if card["risk"]:
            lines.append(f"Risk {card['risk']:g}% of equity")
    elif card["kind"] == "modify":
        lines = [f"✏️ {b(f'{sym} {side}'.strip())}: stops moved", stops]
    else:
        if card["fraction"] is not None and card["fraction"] < 0.999:
            pct = round(card["fraction"] * 100)
            lines = [f"🔸 {b(f'{pct}% closed')} {sym} {side}".rstrip()]
        else:
            lines = [f"✅ {b('Closed')} {sym} {side}".rstrip()]
    lines.append(f"{esc(card['channel']['name'])} · trade #{esc(card['ref'])}")
    if code:
        lines.append(f"Copy it automatically: join code {b(card['channel']['code'])}")
    return "\n".join(lines)


# ---------------------------------------------------------------- the platforms

def _json(r):
    try:
        return r.json()
    except ValueError:
        return {}


def _telegram(token, method, body):
    for attempt in (0, 1):
        r = requests.post(f"{TELEGRAM}/bot{token}/{method}", json=body, timeout=TIMEOUT)
        d = _json(r)
        if d.get("ok"):
            return d["result"]
        wait = (d.get("parameters") or {}).get("retry_after")
        if r.status_code == 429 and wait and wait <= 10 and attempt == 0:
            time.sleep(wait)
            continue
        desc = d.get("description") or f"HTTP {r.status_code}"
        if r.status_code == 401 or r.status_code == 404 and method == "getMe":
            desc = "Telegram doesn't accept this bot token"
        elif "chat not found" in desc:
            desc = "Telegram can't find that chat: add the bot to it (an admin of a channel) and check the @name or id"
        elif "not enough rights" in desc or "bot is not a member" in desc or "have no rights" in desc:
            desc = "The bot can't post there: make it an admin of the channel (or a member of the group)"
        raise ShareError(desc)


def _discord(url, body=None, method="post"):
    for attempt in (0, 1):
        if method == "get":
            r = requests.get(url, timeout=TIMEOUT)
        else:
            r = requests.post(url + "?wait=true", json=body, timeout=TIMEOUT)
        d = _json(r)
        if r.status_code in (200, 201, 204):
            return d
        wait = d.get("retry_after")
        if r.status_code == 429 and wait and wait <= 10 and attempt == 0:
            time.sleep(wait)
            continue
        if r.status_code in (401, 404):
            raise ShareError("Discord doesn't know this webhook (deleted, or the URL is wrong)")
        raise ShareError(d.get("message") or f"Discord answered {r.status_code}")


def _graph_version():
    return getattr(settings, "WHATSAPP_GRAPH_VERSION", "v23.0")


def _whatsapp(token, path, body=None):
    url = f"{GRAPH}/{_graph_version()}/{path}"
    headers = {"Authorization": f"Bearer {token}"}
    r = requests.post(url, json=body, headers=headers, timeout=TIMEOUT) if body is not None else requests.get(url, headers=headers, timeout=TIMEOUT)
    d = _json(r)
    if r.status_code == 200:
        return d
    e = d.get("error") or {}
    if r.status_code == 401 or e.get("code") == 190:
        raise ShareError("WhatsApp doesn't accept this access token (expired? a temporary token lasts 24 hours)")
    raise ShareError(e.get("error_user_msg") or e.get("message") or f"WhatsApp answered {r.status_code}")


def _digits(n):
    return re.sub(r"\D", "", str(n))


# ---------------------------------------------------------------- connecting

def connect(channel, kind, d):
    """Checks a new connection with the platform; (label, target, secret dict, options)"""
    owner = channel.owner
    if kind == "telegram":
        token = str(d.get("token") or "").strip()
        chat = str(d.get("chat") or "").strip()
        if chat.startswith("https://t.me/"):
            chat = "@" + chat.rsplit("/", 1)[-1]
        if not TELEGRAM_TOKEN.match(token):
            raise ShareError("That isn't a bot token (it looks like 123456789:AA…, from @BotFather)")
        if not TELEGRAM_CHAT.match(chat):
            raise ShareError("The chat is a channel's @name, or a group's id (like -1001234567890)")
        bot = _telegram(token, "getMe", {})
        info = _telegram(token, "getChat", {"chat_id": chat})
        name = info.get("title") or info.get("username") or chat
        return f"{name} (via @{bot.get('username')})", str(info.get("id") or chat), {"token": token}, {}
    if kind == "discord":
        url = str(d.get("webhook") or "").strip()
        if not DISCORD_WEBHOOK.match(url):
            raise ShareError("That isn't a Discord webhook URL (https://discord.com/api/webhooks/…)")
        hook = _discord(url, method="get")
        return f"Webhook “{hook.get('name') or 'webhook'}”", str(hook.get("channel_id") or ""), {"url": url}, {}
    if kind == "whatsapp":
        number_id = _digits(d.get("number_id"))
        token = str(d.get("token") or "").strip()
        if not number_id or not token:
            raise ShareError("Give the phone number id and the access token (Meta for Developers → WhatsApp → API setup)")
        options = _whatsapp_options(d)
        info = _whatsapp(token, f"{number_id}?fields=display_phone_number,verified_name")
        name = info.get("verified_name") or "WhatsApp"
        return f"{name} ({info.get('display_phone_number') or number_id})", number_id, {"token": token}, options
    if kind == "group":
        g = ChatGroup.objects.filter(token=str(d.get("token") or "")).first()
        if not g or not ChatGroupMember.objects.filter(group=g, profile=owner).exists():
            raise ShareError("You're not in that chat")
        return _group_name(g, owner), g.token, {}, {}
    if kind == "collab":
        room = CollabRoom.objects.filter(token=str(d.get("token") or ""), active=True).first()
        if not room or not CollabMember.objects.filter(room=room, profile=owner).exists():
            raise ShareError("You're not in that collab (or it has ended)")
        return room.name, room.token, {}, {}
    raise ShareError("Connect Telegram, Discord, WhatsApp, a chat or a collab")


def _whatsapp_options(d, old=None):
    o = dict(old or {})
    if "recipients" in d:
        raw = d.get("recipients")
        items = raw if isinstance(raw, list) else re.split(r"[,\n;]+", str(raw or ""))
        nums = []
        for n in items:
            n = _digits(n)
            if not n:
                continue
            if not 8 <= len(n) <= 15:
                raise ShareError(f"{n} isn't a full number: write it with the country code, like 919876543210")
            if n not in nums:
                nums.append(n)
        if not nums:
            raise ShareError("Add the numbers to send to (with the country code)")
        if len(nums) > 200:
            raise ShareError("At most 200 numbers")
        o["recipients"] = nums
    if "template" in d:
        o["template"] = re.sub(r"[^a-z0-9_]", "", str(d.get("template") or "").strip().lower())[:100]
    if "language" in d:
        o["language"] = re.sub(r"[^A-Za-z_]", "", str(d.get("language") or ""))[:10] or "en_US"
    return o


def _group_name(g, me):
    if g.direct_key:
        other = g.members.exclude(profile=me).select_related("profile").first()
        return f"Chat with {(other.profile.name or other.profile.email.split('@')[0]) if other else 'someone'}"
    return g.name


# ---------------------------------------------------------------- posting

def _send(conn, sig, card, reply_to=None):
    """Posts one signal to one connection; its id there"""
    code = bool(conn.options.get("show_code"))
    secret = unseal(conn.secret) if conn.secret else {}
    if conn.kind == "telegram":
        body = {"chat_id": conn.target, "text": render(card, "html", code), "parse_mode": "HTML", "disable_web_page_preview": True}
        if reply_to:
            body["reply_parameters"] = {"message_id": int(reply_to), "allow_sending_without_reply": True}
        return str(_telegram(secret.get("token", ""), "sendMessage", body).get("message_id", ""))
    if conn.kind == "discord":
        d = _discord(secret.get("url", ""), {"content": render(card, "md", code)[:2000], "username": card["channel"]["name"][:80],
                                              "allowed_mentions": {"parse": []}})
        return str(d.get("id", ""))
    if conn.kind == "whatsapp":
        tpl, lang = conn.options.get("template"), conn.options.get("language") or "en_US"
        text = render(card, "wa", code)
        ids, failed = [], []
        for n in conn.options.get("recipients", []):
            if tpl:
                # (a template's variable can't hold line breaks)
                one_line = re.sub(r"\s*\n\s*", " · ", text)
                body = {"messaging_product": "whatsapp", "to": n, "type": "template",
                        "template": {"name": tpl, "language": {"code": lang}, "components": [{"type": "body", "parameters": [{"type": "text", "text": one_line}]}]}}
            else:
                body = {"messaging_product": "whatsapp", "to": n, "type": "text", "text": {"body": text, "preview_url": False}}
            try:
                d = _whatsapp(secret.get("token", ""), f"{conn.target}/messages", body)
                ids.append(((d.get("messages") or [{}])[0]).get("id", ""))
            except ShareError as e:
                failed.append(f"{n}: {e}")
        if failed:
            raise ShareError(f"{len(ids)} of {len(ids) + len(failed)} sent. " + "; ".join(failed)[:250])
        return ids[0] if ids else ""
    if conn.kind == "group":
        g = ChatGroup.objects.filter(token=conn.target).first()
        owner = conn.channel.owner
        if not g or not ChatGroupMember.objects.filter(group=g, profile=owner).exists():
            raise ShareError("You're not in this chat any more")
        m = ChatGroupMessage.objects.create(group=g, author=owner, kind="signal", text=render(card), attachment=card)
        ChatGroup.objects.filter(id=g.id).update(updated_at=timezone.now())
        return str(m.id)
    if conn.kind == "collab":
        from .collab import message_json, notify_room
        room = CollabRoom.objects.filter(token=conn.target, active=True).first()
        owner = conn.channel.owner
        if not room or not CollabMember.objects.filter(room=room, profile=owner).exists():
            raise ShareError("This collab has ended, or you're not in it any more")
        m = CollabMessage.objects.create(room=room, author=owner, kind="signal", text=render(card), attachment=card)
        notify_room(room, {"type": "chat.saved", "message": message_json(m), "exclude": None})
        return str(m.id)
    raise ShareError("Unknown connection")


WANTS = {"open": "post_open", "modify": "post_modify", "close": "post_close"}


def post_signal(signal_id):
    """Posts a signal to every connection of its channel that takes that kind of signal"""
    sig = CopySignal.objects.filter(id=signal_id).select_related("channel", "channel__owner").first()
    if not sig:
        return
    conns = [c for c in sig.channel.connections.filter(enabled=True) if getattr(c, WANTS.get(sig.kind, "post_open"))]
    if not conns:
        return
    opened = sig if sig.kind == "open" else CopySignal.objects.filter(channel=sig.channel, kind="open", ref=sig.ref).first()
    card = card_of(sig, opened)
    for c in conns:
        if CopyPost.objects.filter(connection=c, signal=sig).exists():
            continue
        reply_to = None
        if c.kind == "telegram" and opened and opened.id != sig.id:
            first = CopyPost.objects.filter(connection=c, signal=opened, ok=True).first()
            reply_to = first.external_id if first and first.external_id.isdigit() else None
        try:
            ext, ok, err = _send(c, sig, card, reply_to), True, ""
        except ShareError as e:
            ext, ok, err = "", False, str(e)[:300]
        except requests.RequestException as e:
            ext, ok, err = "", False, f"Couldn't reach {c.get_kind_display()}: {type(e).__name__}"
        except Exception as e:   # one connection never stops the others
            log.exception("copy share: posting signal %s to connection %s", sig.id, c.id)
            ext, ok, err = "", False, f"Failed: {e}"[:300]
        CopyPost.objects.create(connection=c, signal=sig, ok=ok, external_id=ext, error=err)
        CopyConnection.objects.filter(id=c.id).update(last_at=timezone.now(), last_ok=ok, last_error=err)


def send_test(conn):
    """A test post, straight away (raises ShareError with the platform's reason)"""
    ch = conn.channel
    if conn.kind in ("group", "collab"):
        fake = CopySignal(channel=ch, kind="open", ref="test", symbol="XAUUSD", side="buy", entry=None, sl=2340.0, tp=2370.0, risk_percent=ch.default_risk)
        fake.id = 0
        card = card_of(fake, fake)
        card["test"] = True
        return _send(conn, fake, card)
    text = {
        "telegram": f"✅ <b>{html.escape(ch.name)}</b> is connected: its signals will be posted here.",
        "discord": f"✅ **{ch.name}** is connected: its signals will be posted here.",
        "whatsapp": f"✅ *{ch.name}* is connected: its signals will be posted here.",
    }[conn.kind]
    secret = unseal(conn.secret) if conn.secret else {}
    if conn.kind == "telegram":
        return str(_telegram(secret.get("token", ""), "sendMessage", {"chat_id": conn.target, "text": text, "parse_mode": "HTML"}).get("message_id", ""))
    if conn.kind == "discord":
        return str(_discord(secret.get("url", ""), {"content": text, "username": ch.name[:80], "allowed_mentions": {"parse": []}}).get("id", ""))
    # WhatsApp: through the template when there is one (that's what works outside 24 hours)
    fake = CopySignal(channel=ch, kind="open", ref="test", symbol="XAUUSD", side="buy", sl=2340.0, tp=2370.0, risk_percent=ch.default_risk)
    fake.id = 0
    return _send(conn, fake, card_of(fake, fake))


# ---------------------------------------------------------------- the queue

_queue = queue.Queue()
_worker = None
_worker_lock = threading.Lock()


def _run():
    while True:
        sid = _queue.get()
        try:
            close_old_connections()
            post_signal(sid)
        except Exception:
            log.exception("copy share: signal %s", sid)
        finally:
            close_old_connections()


def broadcast(signal):
    """Posts it in the background (in order), or right away when COPY_SHARE_SYNC is set (tests)"""
    if getattr(settings, "COPY_SHARE_SYNC", False):
        post_signal(signal.id)
        return
    global _worker
    with _worker_lock:
        if _worker is None or not _worker.is_alive():
            _worker = threading.Thread(target=_run, name="copy-share", daemon=True)
            _worker.start()
    _queue.put(signal.id)


# ---------------------------------------------------------------- the API

def connection_json(c):
    o = c.options or {}
    return {"id": c.id, "kind": c.kind, "label": c.label, "target": c.target,
            "post_open": c.post_open, "post_modify": c.post_modify, "post_close": c.post_close, "enabled": c.enabled,
            "show_code": bool(o.get("show_code")), "recipients": o.get("recipients", []), "template": o.get("template", ""),
            "language": o.get("language", ""), "last_at": int(c.last_at.timestamp() * 1000) if c.last_at else None,
            "last_ok": c.last_ok, "last_error": c.last_error}


def _own_channel(request, uid, cid):
    me, denied = require_session(request, uid)
    if denied:
        return None, None, denied
    c = CopyChannel.objects.filter(owner=me, id=cid).select_related("owner").first()
    if not c:
        return me, None, Response({"error": "That channel isn't yours, or isn't there any more"}, status=status.HTTP_404_NOT_FOUND)
    return me, c, None


@api_view(['GET', 'POST'])
def connections(request, uid, cid):
    """GET: where the channel posts. POST {kind, …}: connects one — telegram {token, chat}, discord
    {webhook}, whatsapp {number_id, token, recipients, template?, language?}, group / collab {token}"""
    me, ch, denied = _own_channel(request, uid, cid)
    if denied:
        return denied
    if request.method == 'GET':
        return Response({"connections": [connection_json(c) for c in ch.connections.all()]})
    d = request.data
    kind = str(d.get("kind") or "")
    if ch.connections.count() >= 20:
        return Response({"error": "A channel can post to at most 20 places"}, status=status.HTTP_400_BAD_REQUEST)
    try:
        label, target, secret, options = connect(ch, kind, d)
    except ShareError as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    except requests.RequestException:
        return Response({"error": "Couldn't reach it to check the connection: try again"}, status=status.HTTP_502_BAD_GATEWAY)
    if target and ch.connections.filter(kind=kind, target=target).exists():
        return Response({"error": "This channel already posts there"}, status=status.HTTP_409_CONFLICT)
    options["show_code"] = d.get("show_code") is True
    c = CopyConnection.objects.create(channel=ch, kind=kind, label=label[:200], target=target[:260], secret=seal(secret) if secret else "", options=options)
    return Response({"connection": connection_json(c)}, status=status.HTTP_201_CREATED)


@api_view(['PATCH', 'DELETE'])
def connection(request, uid, cid, xid):
    """PATCH: enabled, post_open / post_modify / post_close, show_code; WhatsApp: recipients,
    template, language. DELETE: disconnects it (the token is deleted with it)."""
    me, ch, denied = _own_channel(request, uid, cid)
    if denied:
        return denied
    c = ch.connections.filter(id=xid).first()
    if not c:
        return Response({"error": "Not connected any more"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'DELETE':
        c.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    d = request.data
    for f in ("enabled", "post_open", "post_modify", "post_close"):
        if f in d:
            setattr(c, f, d.get(f) is True)
    if "show_code" in d:
        c.options = {**c.options, "show_code": d.get("show_code") is True}
    if c.kind == "whatsapp" and any(k in d for k in ("recipients", "template", "language")):
        try:
            c.options = _whatsapp_options(d, c.options)
        except ShareError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    c.save()
    return Response({"connection": connection_json(c)})


@api_view(['POST'])
def connection_test(request, uid, cid, xid):
    """Posts a test message there now"""
    me, ch, denied = _own_channel(request, uid, cid)
    if denied:
        return denied
    c = ch.connections.filter(id=xid).first()
    if not c:
        return Response({"error": "Not connected any more"}, status=status.HTTP_404_NOT_FOUND)
    try:
        send_test(c)
        ok, err = True, ""
    except ShareError as e:
        ok, err = False, str(e)[:300]
    except requests.RequestException as e:
        ok, err = False, f"Couldn't reach {c.get_kind_display()}: {type(e).__name__}"
    CopyConnection.objects.filter(id=c.id).update(last_at=timezone.now(), last_ok=ok, last_error=err)
    c.refresh_from_db()
    if not ok:
        return Response({"error": err, "connection": connection_json(c)}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"connection": connection_json(c)})


@api_view(['GET'])
def share_targets(request, uid):
    """Your chats here a channel can post to: groups, personal chats and collabs"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    out = []
    for m in ChatGroupMember.objects.filter(profile=me).select_related("group").order_by("-group__updated_at"):
        g = m.group
        out.append({"kind": "group", "personal": bool(g.direct_key), "token": g.token, "name": _group_name(g, me)})
    for m in CollabMember.objects.filter(profile=me, room__active=True).select_related("room").order_by("-room__id"):
        out.append({"kind": "collab", "personal": False, "token": m.room.token, "name": m.room.name})
    return Response({"targets": out})
