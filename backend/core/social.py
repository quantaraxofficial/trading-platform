"""People and published scripts.

- Search people by name or @username; open someone's profile: their bio, followers, the scripts
  they've published that you can see, and — only if they've turned each on — their trading stats,
  saved strategy backtests and backtest sessions. Emails and account ids are never shown.
- From a profile: follow (you're told when they publish a new indicator or strategy), message
  (a one-to-one chat in the Chats panel) or invite them to one of your collabs — as their privacy
  settings allow (everyone / people they follow / nobody).
- Publish an indicator or strategy from the Pine editor: public (in everyone's Indicators search
  and on your profile) or private (only you and the people you invite). Its code can be open to
  everyone who can use it, hidden (only you), or open only to people you choose; whoever may not
  read it gets the compiled script instead (comments and the author's names gone) and runs that.
  Pine Script only: MQL5 compiles to JavaScript and Python runs as itself, so theirs stays open.
- Republishing the same script makes a new version. Followers are told about every new version of
  a public script, invitees about every version of a private one shared with them.
"""
import json
import re
import secrets

from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session
from .collab import defaults_for, display_name, notify_room, perms_of, system_message
from .models import (BacktestRun, ChatGroup, ChatGroupMember, CollabMember, Follow, Notification, PublishedScript, ReplaySession,
                     TraderProfile)

PRIVACY = ('everyone', 'following', 'nobody')
CODE_ACCESS = ('open', 'hidden', 'allowed')
MAX_COMPILED = 2_000_000
USERNAME_RE = re.compile(r'^[a-z0-9_]{3,30}$')
MAX_CODE = 200_000


# ---------------------------------------------------------------- usernames

def make_username(profile):
    """A free @username from the person's name (or email), e.g. 'Asha Rao' → asha_rao, asha_rao2…"""
    base = re.sub(r'[^a-z0-9]+', '_', (profile.name or profile.email.split('@')[0] or 'trader').lower()).strip('_')[:24] or 'trader'
    if len(base) < 3:
        base = (base + '_trader')[:24]
    name, n = base, 1
    while TraderProfile.objects.filter(username=name).exclude(id=profile.id).exists():
        n += 1
        name = f"{base[:24 - len(str(n))]}{n}"
    return name


def username_of(profile):
    if not profile.username:
        profile.username = make_username(profile)
        profile.save(update_fields=['username'])
    return profile.username


def person_json(p):
    return {"username": username_of(p), "name": display_name(p), "bio": p.bio}


def allowed(setting, owner, viewer):
    """Whether `viewer` may message / invite `owner`, by owner's setting"""
    if viewer.id == owner.id:
        return False
    if setting == 'everyone':
        return True
    if setting == 'following':
        return Follow.objects.filter(follower=owner, following=viewer).exists()
    return False


def notify(recipient, actor, kind, text, **data):
    if recipient.id != getattr(actor, 'id', None):
        Notification.objects.create(recipient=recipient, actor=actor, kind=kind, text=text[:300], data=data)


def _target(username):
    return TraderProfile.objects.filter(username=str(username or '').lower()).first()


# ---------------------------------------------------------------- people

@api_view(['GET'])
def search(request, uid):
    """?q=: people whose name or @username has it (up to 30), with follower counts"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    q = str(request.query_params.get('q') or '').strip().lstrip('@')
    if len(q) < 1:
        return Response({"people": []})
    for p in TraderProfile.objects.filter(username__isnull=True, name__icontains=q)[:50]:
        username_of(p)   # (people from before usernames get theirs when first found)
    found = (TraderProfile.objects.filter(Q(name__icontains=q) | Q(username__icontains=q.lower()))
             .annotate(n_followers=Count('followers_set', distinct=True), n_scripts=Count('published_scripts', filter=Q(published_scripts__visibility='public'), distinct=True))
             .order_by('-n_followers', 'name')[:30])
    mine = set(Follow.objects.filter(follower=me).values_list('following_id', flat=True))
    return Response({"people": [{**person_json(p), "followers": p.n_followers, "scripts": p.n_scripts, "is_me": p.id == me.id, "i_follow": p.id in mine} for p in found]})


def can_use(s, viewer):
    return s.owner_id == viewer.id or s.visibility == 'public' or s.invited.filter(id=viewer.id).exists()


def can_view_code(s, viewer):
    """Whether its code may reach this person's browser"""
    if s.owner_id == viewer.id or s.code_access == 'open':
        return True
    return s.code_access == 'allowed' and s.code_viewers.filter(id=viewer.id).exists()


def visible_scripts(owner, viewer):
    qs = PublishedScript.objects.filter(owner=owner)
    if owner.id != viewer.id:
        qs = qs.filter(Q(visibility='public') | Q(invited=viewer)).distinct()
    return qs.order_by('-updated_at')


def script_json(s, viewer=None, with_code=False):
    d = {"id": s.id, "name": s.name, "kind": s.kind, "language": s.language, "description": s.description, "visibility": s.visibility,
         "version": s.version, "uses": s.uses, "author": person_json(s.owner), "mine": bool(viewer and s.owner_id == viewer.id),
         "source_key": s.source_key if viewer and s.owner_id == viewer.id else None,
         "created_at": int(s.created_at.timestamp() * 1000), "updated_at": int(s.updated_at.timestamp() * 1000)}
    d["code_access"] = s.code_access
    d["can_view_code"] = bool(viewer and can_view_code(s, viewer))
    if viewer and s.owner_id == viewer.id:
        if s.visibility == 'private':
            d["invited"] = [person_json(p) for p in s.invited.all()]
        if s.code_access == 'allowed':
            d["code_viewers"] = [person_json(p) for p in s.code_viewers.all()]
    if with_code:
        if d["can_view_code"]:
            d["code"] = s.code
        else:
            d["compiled"] = s.compiled   # (never the code)
    return d


@api_view(['GET'])
def profile(request, uid, username):
    """Someone's public profile (what they've chosen to show, and what you may do from it)"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    p = _target(username)
    if not p:
        return Response({"error": "No one has that username"}, status=status.HTTP_404_NOT_FOUND)
    is_me = p.id == me.id
    out = {**person_json(p), "joined": int(p.created_at.timestamp() * 1000), "is_me": is_me,
           "followers": Follow.objects.filter(following=p).count(), "following": Follow.objects.filter(follower=p).count(),
           "i_follow": Follow.objects.filter(follower=me, following=p).exists(), "follows_me": Follow.objects.filter(follower=p, following=me).exists(),
           "can_message": allowed(p.allow_messages, p, me), "can_invite": allowed(p.allow_invites, p, me),
           "scripts": [script_json(s, me) for s in visible_scripts(p, me).select_related('owner')[:100]]}
    if (p.show_trading_stats or is_me) and p.stats_snapshot:
        out["stats"] = {**p.stats_snapshot, "updated_at": int(p.stats_updated_at.timestamp() * 1000) if p.stats_updated_at else None, "shown": p.show_trading_stats}
    if p.show_backtests or is_me:
        out["backtests"] = {"shown": p.show_backtests, "items": [{
            "name": b.name, "symbol": b.symbol, "timeframe": b.timeframe, "language": b.language, "trades": b.trade_count, "net": b.net_profit,
            "return_pct": round(b.net_profit / b.initial_capital * 100, 2) if b.initial_capital else None,
            "period_from": b.period_from, "period_to": b.period_to} for b in BacktestRun.objects.filter(owner=p)[:30]]}
    if p.show_sessions or is_me:
        items = []
        for r in ReplaySession.objects.filter(owner=p)[:30]:
            trades = [t for t in ((r.book or {}).get("trades") or []) if isinstance(t, dict) and t.get("exitTime") is not None]
            net = sum(float(t.get("pnl") or 0) for t in trades)
            items.append({"name": r.name, "symbol": r.symbol, "timeframe": r.interval_label or r.interval, "status": r.status, "trades": len(trades),
                          "wins": sum(1 for t in trades if float(t.get("pnl") or 0) > 0), "net": round(net, 2),
                          "return_pct": round(net / r.initial_balance * 100, 2) if r.initial_balance else None, "time_spent": r.time_spent})
        out["sessions"] = {"shown": p.show_sessions, "items": items}
    return Response({"profile": out})


@api_view(['GET', 'PATCH'])
def me_settings(request, uid):
    """Your profile settings. PATCH: username, bio, show_trading_stats, show_backtests,
    show_sessions, allow_messages, allow_invites"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'PATCH':
        d = request.data
        if 'username' in d:
            u = str(d.get('username') or '').strip().lstrip('@').lower()
            if not USERNAME_RE.match(u):
                return Response({"error": "A username is 3–30 letters, numbers or _"}, status=status.HTTP_400_BAD_REQUEST)
            if TraderProfile.objects.filter(username=u).exclude(id=me.id).exists():
                return Response({"error": "That username is taken"}, status=status.HTTP_409_CONFLICT)
            me.username = u
        if 'bio' in d:
            me.bio = str(d.get('bio') or '')[:300]
        for f in ('show_trading_stats', 'show_backtests', 'show_sessions'):
            if f in d:
                setattr(me, f, d.get(f) is True)
        for f in ('allow_messages', 'allow_invites'):
            if f in d:
                if d.get(f) not in PRIVACY:
                    return Response({"error": f"{f} is everyone, following or nobody"}, status=status.HTTP_400_BAD_REQUEST)
                setattr(me, f, d.get(f))
        me.save()
    username_of(me)
    return Response({"me": {**person_json(me), "show_trading_stats": me.show_trading_stats, "show_backtests": me.show_backtests,
                            "show_sessions": me.show_sessions, "allow_messages": me.allow_messages, "allow_invites": me.allow_invites,
                            "stats_updated_at": int(me.stats_updated_at.timestamp() * 1000) if me.stats_updated_at else None}})


@api_view(['PUT', 'DELETE'])
def me_stats(request, uid):
    """PUT {label, metrics: {...}, equity: [[time, value]…]}: the trading stats your profile shows
    (from Analytics, for the account you choose). DELETE: removes them."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'DELETE':
        me.stats_snapshot, me.stats_updated_at = None, None
        me.save(update_fields=['stats_snapshot', 'stats_updated_at'])
        return Response(status=status.HTTP_204_NO_CONTENT)
    d = request.data
    metrics = d.get('metrics') if isinstance(d.get('metrics'), dict) else {}
    clean = {}
    for k, v in list(metrics.items())[:40]:
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            clean[str(k)[:40]] = round(float(v), 4)
    equity = []
    for pt in (d.get('equity') or [])[:200]:
        try:
            equity.append([int(pt[0]), round(float(pt[1]), 2)])
        except (TypeError, ValueError, IndexError):
            continue
    me.stats_snapshot = {"label": str(d.get('label') or 'Trading')[:80], "currency": str(d.get('currency') or 'USD')[:5], "metrics": clean, "equity": equity}
    me.stats_updated_at = timezone.now()
    me.save(update_fields=['stats_snapshot', 'stats_updated_at'])
    return Response({"stats": me.stats_snapshot})


@api_view(['POST', 'DELETE'])
def follow(request, uid, username):
    """POST: follow them (they're told). DELETE: stop following."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    p = _target(username)
    if not p:
        return Response({"error": "No one has that username"}, status=status.HTTP_404_NOT_FOUND)
    if p.id == me.id:
        return Response({"error": "That's you"}, status=status.HTTP_400_BAD_REQUEST)
    if request.method == 'DELETE':
        Follow.objects.filter(follower=me, following=p).delete()
    elif Follow.objects.get_or_create(follower=me, following=p)[1]:
        notify(p, me, 'follow', f"{display_name(me)} started following you", username=username_of(me))
    return Response({"i_follow": request.method == 'POST', "followers": Follow.objects.filter(following=p).count()})


@api_view(['GET'])
def follow_list(request, uid, username):
    """?which=followers|following: who follows them, or whom they follow"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    p = _target(username)
    if not p:
        return Response({"error": "No one has that username"}, status=status.HTTP_404_NOT_FOUND)
    if request.query_params.get('which') == 'following':
        people = [f.following for f in Follow.objects.filter(follower=p).select_related('following')[:200]]
    else:
        people = [f.follower for f in Follow.objects.filter(following=p).select_related('follower')[:200]]
    return Response({"people": [person_json(x) for x in people]})


@api_view(['POST'])
def message(request, uid, username):
    """Opens (or starts) your one-to-one chat with them: its token for the Chats panel"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    p = _target(username)
    if not p:
        return Response({"error": "No one has that username"}, status=status.HTTP_404_NOT_FOUND)
    key = "|".join(sorted([me.uid, p.uid]))
    g = ChatGroup.objects.filter(direct_key=key).first()
    if not g:
        if not allowed(p.allow_messages, p, me):
            return Response({"error": f"{display_name(p)} doesn't take messages from you"}, status=status.HTTP_403_FORBIDDEN)
        g = ChatGroup.objects.create(token=secrets.token_urlsafe(12)[:16], name=f"{display_name(me)} & {display_name(p)}", created_by=me, direct_key=key)
        ChatGroupMember.objects.create(group=g, profile=me, role='admin', last_read_at=timezone.now())
        ChatGroupMember.objects.create(group=g, profile=p, role='admin')
    else:
        for person in (me, p):   # (someone who left comes back to the same conversation)
            ChatGroupMember.objects.get_or_create(group=g, profile=person, defaults={"role": "admin"})
    return Response({"token": g.token})


@api_view(['GET', 'POST'])
def invite(request, uid, username):
    """GET: your collabs you can add them to. POST {token, role?}: adds them (they're told)."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    p = _target(username)
    if not p:
        return Response({"error": "No one has that username"}, status=status.HTTP_404_NOT_FOUND)
    mine = [m for m in CollabMember.objects.filter(profile=me, room__active=True).select_related('room') if perms_of(m)["invite"]]
    if request.method == 'GET':
        inside = set(CollabMember.objects.filter(profile=p).values_list('room_id', flat=True))
        return Response({"collabs": [{"token": m.room.token, "name": m.room.name, "kind": m.room.kind, "member": m.room_id in inside,
                                      "can_editor": m.role == 'owner'} for m in mine], "allowed": allowed(p.allow_invites, p, me)})
    if not allowed(p.allow_invites, p, me):
        return Response({"error": f"{display_name(p)} doesn't take collab invites from you"}, status=status.HTTP_403_FORBIDDEN)
    m = next((x for x in mine if x.room.token == request.data.get('token')), None)
    if not m:
        return Response({"error": "You can't add people to that collab"}, status=status.HTTP_403_FORBIDDEN)
    room = m.room
    if room.kicked.filter(id=p.id).exists() and m.role != 'owner':
        return Response({"error": "The owner removed them from this collab"}, status=status.HTTP_403_FORBIDDEN)
    role = request.data.get('role') if request.data.get('role') in ('editor', 'viewer') else 'viewer'
    if role == 'editor' and m.role != 'owner':
        role = 'viewer'
    if CollabMember.objects.filter(room=room, profile=p).exists():
        return Response({"error": f"{display_name(p)} is already in {room.name}"}, status=status.HTTP_409_CONFLICT)
    room.kicked.remove(p)
    CollabMember.objects.create(room=room, profile=p, role=role, invited_by=me, **defaults_for(role))
    system_message(room, f"{display_name(me)} added {display_name(p)}")
    notify_room(room, {"type": "access.changed"})
    notify(p, me, 'invite', f"{display_name(me)} added you to the collab {room.name}", token=room.token)
    return Response({"ok": True, "collab": room.name, "role": role}, status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
def notifications(request, uid):
    """GET: your latest notifications and how many are unread. POST {ids?}: marks them (or all) read."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'POST':
        qs = Notification.objects.filter(recipient=me, read_at__isnull=True)
        ids = request.data.get('ids')
        if isinstance(ids, list):
            qs = qs.filter(id__in=[int(i) for i in ids if str(i).isdigit()])
        qs.update(read_at=timezone.now())
    items = Notification.objects.filter(recipient=me).select_related('actor')[:50]
    return Response({"unread": Notification.objects.filter(recipient=me, read_at__isnull=True).count(), "items": [{
        "id": n.id, "kind": n.kind, "text": n.text, "data": n.data, "read": n.read_at is not None, "at": int(n.created_at.timestamp() * 1000),
        "actor": person_json(n.actor) if n.actor else None} for n in items]})


# ---------------------------------------------------------------- published scripts

@api_view(['GET'])
def scripts(request, uid):
    """?scope=community|following|shared|mine &kind=indicator|strategy &q= &sort=top|new: published
    scripts, with their authors (community: most used first, or newest with sort=new)"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    scope = request.query_params.get('scope') or 'community'
    if scope == 'mine':
        qs = PublishedScript.objects.filter(owner=me)
    elif scope == 'shared':
        qs = PublishedScript.objects.filter(visibility='private', invited=me)
    elif scope == 'following':
        qs = PublishedScript.objects.filter(visibility='public', owner__followers_set__follower=me)
    else:
        qs = PublishedScript.objects.filter(visibility='public')
    kind = request.query_params.get('kind')
    if kind in ('indicator', 'strategy'):
        qs = qs.filter(kind=kind)
    q = str(request.query_params.get('q') or '').strip()
    if q:
        qs = qs.filter(Q(name__icontains=q) | Q(description__icontains=q) | Q(owner__name__icontains=q) | Q(owner__username__icontains=q.lstrip('@').lower()))
    top = scope == 'community' and request.query_params.get('sort') != 'new'   # (sort=new: newest first)
    qs = qs.select_related('owner').distinct().order_by(*(['-uses', '-updated_at'] if top else ['-created_at']))
    return Response({"scripts": [script_json(s, me) for s in qs[:100]]})


@api_view(['POST'])
def publish(request, uid):
    """{source_key, name, kind, language, description, code, visibility, invite: [username…]}:
    publishes (or republishes, as a new version) a script from the editor"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    d = request.data
    key = str(d.get('source_key') or '').strip()[:120]
    name = str(d.get('name') or '').strip()[:100]
    code = str(d.get('code') or '')
    if not key or not name or not code.strip():
        return Response({"error": "Save the script with a name before publishing it"}, status=status.HTTP_400_BAD_REQUEST)
    if len(code) > MAX_CODE:
        return Response({"error": "The script is too long to publish"}, status=status.HTTP_400_BAD_REQUEST)
    visibility = d.get('visibility') if d.get('visibility') in ('public', 'private') else 'public'
    kind = d.get('kind') if d.get('kind') in ('indicator', 'strategy') else 'indicator'
    language = d.get('language') if d.get('language') in ('pine', 'python', 'mql5') else 'pine'
    code_access = d.get('code_access') if d.get('code_access') in CODE_ACCESS else 'open'
    compiled, err = _compiled_of(d.get('compiled'), language)
    if err:
        return Response({"error": err}, status=status.HTTP_400_BAD_REQUEST)
    if code_access != 'open' and not compiled:
        return Response({"error": "Only Pine Script code can be hidden (MQL5 and Python scripts run as themselves)"}, status=status.HTTP_400_BAD_REQUEST)
    s = PublishedScript.objects.filter(owner=me, source_key=key).first()
    first = s is None
    was_public = bool(s and s.visibility == 'public')
    if first:
        s = PublishedScript(owner=me, source_key=key)
    else:
        s.version += 1
    s.name, s.kind, s.language, s.code, s.visibility, s.code_access, s.compiled = name, kind, language, code, visibility, code_access, compiled
    s.description = str(d.get('description') or '')[:5000]
    s.save()
    was_invited = set(s.invited.values_list('id', flat=True))
    newly_invited = _set_invited(s, me, d.get('invite')) if visibility == 'private' else []
    if visibility == 'public':
        s.invited.clear()
    _set_code_viewers(s, me, d.get('code_viewers'))
    label = 'strategy' if kind == 'strategy' else 'indicator'
    if visibility == 'public':
        # followers hear of every version (a new script, or a new version of one)
        text = (f"{display_name(me)} published a new {label}: {name}" if first or not was_public
                else f"{display_name(me)} published version {s.version} of the {label} {name}")
        for f in Follow.objects.filter(following=me).select_related('follower'):
            notify(f.follower, me, 'script', text, script=s.id, username=username_of(me), version=s.version)
    else:
        for p in newly_invited:
            notify(p, me, 'shared', f"{display_name(me)} shared the private {label} {name} with you", script=s.id, username=username_of(me))
        for p in s.invited.filter(id__in=was_invited):
            notify(p, me, 'script', f"{display_name(me)} published version {s.version} of the private {label} {name}", script=s.id,
                   username=username_of(me), version=s.version)
    return Response({"script": script_json(s, me), "first": first}, status=status.HTTP_201_CREATED if first else status.HTTP_200_OK)


def _compiled_of(value, language):
    """The compiled form sent with a Pine script ({format: 'pine-ast-1', stmts, meta}), checked
    for shape and size; (None, None) when there's none to keep"""
    if language != 'pine' or value in (None, ''):
        return None, None
    if not isinstance(value, dict) or value.get('format') != 'pine-ast-1' or not isinstance(value.get('stmts'), list) or not isinstance(value.get('meta'), dict):
        return None, "The compiled script isn't readable"
    if len(json.dumps(value)) > MAX_COMPILED:
        return None, "The compiled script is too large"
    return value, None


def _set_code_viewers(s, me, usernames):
    """The people who may read a script's code ('allowed'), by username"""
    if s.code_access != 'allowed':
        s.code_viewers.clear()
        return
    if usernames is None:
        return
    wanted = {str(u).strip().lstrip('@').lower() for u in usernames if str(u).strip()} if isinstance(usernames, list) else set()
    s.code_viewers.set(TraderProfile.objects.filter(username__in=wanted).exclude(id=me.id) if wanted else [])


def _set_invited(s, me, usernames):
    """The people a private script is shared with (by username); the newly added ones back"""
    wanted = {str(u).strip().lstrip('@').lower() for u in (usernames or []) if str(u).strip()} if isinstance(usernames, list) else set()
    people = list(TraderProfile.objects.filter(username__in=wanted).exclude(id=me.id)) if wanted else []
    before = set(s.invited.values_list('id', flat=True))
    s.invited.set(people)
    return [p for p in people if p.id not in before]


@api_view(['GET', 'PATCH', 'DELETE'])
def published(request, uid, sid):
    """GET ?use=1: a script you can see, with its code (use=1 counts it being added to a chart).
    PATCH (yours): name, description, visibility, invite. DELETE (yours): unpublishes it."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    s = PublishedScript.objects.filter(id=sid).select_related('owner').first()
    if not s or not can_use(s, me):
        return Response({"error": "That script isn't there, or isn't shared with you"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'GET':
        if request.query_params.get('use') and s.owner_id != me.id:
            PublishedScript.objects.filter(id=s.id).update(uses=s.uses + 1)
            s.uses += 1
        return Response({"script": script_json(s, me, with_code=True)})
    if s.owner_id != me.id:
        return Response({"error": "Only its author can change it"}, status=status.HTTP_403_FORBIDDEN)
    if request.method == 'DELETE':
        s.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    d = request.data
    if 'name' in d and str(d['name']).strip():
        s.name = str(d['name']).strip()[:100]
    if 'description' in d:
        s.description = str(d.get('description') or '')[:5000]
    was_public = s.visibility == 'public'
    if d.get('visibility') in ('public', 'private'):
        s.visibility = d['visibility']
    if d.get('code_access') in CODE_ACCESS:
        if d['code_access'] != 'open' and not s.compiled:
            why = "Republish it from the Pine editor first, so a compiled copy can be shared" if s.language == 'pine' else "Only Pine Script code can be hidden (MQL5 and Python scripts run as themselves)"
            return Response({"error": why}, status=status.HTTP_400_BAD_REQUEST)
        s.code_access = d['code_access']
    s.save()
    if 'code_access' in d or 'code_viewers' in d:
        _set_code_viewers(s, me, d.get('code_viewers'))
    label = 'strategy' if s.kind == 'strategy' else 'indicator'
    if s.visibility == 'private':
        for p in _set_invited(s, me, d.get('invite')) if 'invite' in d else []:
            notify(p, me, 'shared', f"{display_name(me)} shared the private {label} {s.name} with you", script=s.id, username=username_of(me))
    else:
        s.invited.clear()
        if not was_public:
            for f in Follow.objects.filter(following=me).select_related('follower'):
                notify(f.follower, me, 'script', f"{display_name(me)} published a new {label}: {s.name}", script=s.id, username=username_of(me))
    return Response({"script": script_json(s, me)})

