"""Collab charts: a chart shared by link, where everyone in it sees the same symbol, interval,
indicators and drawings live, with a group chat and voice (the live part runs over the WebSocket
in consumers.py; these endpoints create rooms, open them, and manage who's in them).

Every endpoint takes the caller's user id in the path and needs one of their session keys, like
the rest of the per-user API.
"""
import base64
import secrets

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.db.models import Q
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from pycrdt import Doc, Map, Text
from rest_framework.response import Response

from .auth import require_session
from .models import CollabJoinRequest, CollabMember, CollabMessage, CollabRoom, TraderProfile

MAX_DRAWINGS_BYTES = 2_000_000
# A member's permissions the owner can switch on and off (also in Django Admin)
PERMISSION_FIELDS = ('can_replay', 'can_invite', 'can_voice', 'can_alert', 'can_pine')
ROLE_OF_LINK = {'view': 'viewer', 'edit': 'editor'}
MAX_INVITES = 20

# The colour each person gets on the chart (their cursor, their avatar, their name in chat)
COLORS = ['#2962ff', '#e91e63', '#ff9800', '#089981', '#9c27b0', '#00bcd4', '#f23645', '#795548', '#3f51b5', '#8bc34a']


def color_of(uid):
    return COLORS[sum(ord(c) for c in uid) % len(COLORS)]


def group_name(room):
    return f"collab_{room.id}"


def perms_of(m):
    """What a member may do besides viewing and chatting (the owner may do everything)"""
    owner = m.role == 'owner'
    return {
        "edit": owner or m.role == 'editor',
        "replay": owner or m.can_replay,
        "invite": owner or m.can_invite,
        # The owner can turn everyone's mic off at once (allow_voice) or one person's (can_voice)
        "voice": owner or (m.room.allow_voice and m.can_voice),
        "alert": owner or m.can_alert,
        "pine": owner or m.can_pine,
    }


def defaults_for(role):
    """New members' permissions: editors can drive the replay and share alerts, everyone can talk,
    only the owner adds people"""
    return {"can_replay": role == 'editor', "can_invite": False, "can_voice": True, "can_alert": role == 'editor', "can_pine": role == 'editor'}


def member_json(m):
    return {
        "uid": m.profile.uid, "name": m.profile.name or m.profile.email.split('@')[0], "email": m.profile.email,
        "role": m.role, "color": color_of(m.profile.uid), "pending": m.last_seen is None and m.role != 'owner',
        "perms": perms_of(m), "mic": m.role == 'owner' or m.can_voice,
    }


def person_json(p):
    return {"uid": p.uid, "name": display_name(p), "email": p.email, "color": color_of(p.uid)}


def request_json(r):
    return {**person_json(r.profile), "status": r.status, "time": int(r.created_at.timestamp() * 1000)}


def room_json(room, me=None):
    members = room.members.select_related('profile').order_by('invited_at')
    mine = next((m for m in members if me and m.profile_id == me.id), None)
    perms = perms_of(mine) if mine else None
    out = {
        "token": room.token, "name": room.name, "kind": room.kind, "link_access": room.link_access, "active": room.active,
        "owner": room.owner.uid, "symbol": room.symbol, "interval": room.interval,
        "created_at": room.created_at.isoformat(),
        "allow_requests": room.allow_requests, "allow_voice": room.allow_voice,
        "role": mine.role if mine else None,
        "perms": perms,
        "members": [member_json(m) for m in members],
        "requests": [], "kicked": [],
    }
    # Who's asking to join, for those who can let them in; who was kicked out, for the owner
    if perms and perms["invite"]:
        out["requests"] = [request_json(r) for r in room.join_requests.filter(status='pending').select_related('profile')]
    if mine and mine.role == 'owner':
        out["kicked"] = [person_json(p) for p in room.kicked.all()]
    return out


def notify_room(room, event):
    """Tells everyone connected to the room about a change made here (access, members, ended)"""
    layer = get_channel_layer()
    if layer:
        async_to_sync(layer.group_send)(group_name(room), event)


def system_message(room, text):
    msg = CollabMessage.objects.create(room=room, kind='system', text=text)
    notify_room(room, {"type": "chat.saved", "message": message_json(msg), "exclude": None})


def message_json(msg):
    return {
        "id": msg.id, "kind": msg.kind, "text": msg.text, "time": int(msg.created_at.timestamp() * 1000),
        "author": msg.author.uid if msg.author else None,
        "author_name": (msg.author.name or msg.author.email.split('@')[0]) if msg.author else None,
    }


def display_name(profile):
    return profile.name or profile.email.split('@')[0]


MAX_PINE_CODE = 200_000
SCRIPT_LANGUAGES = ('pine', 'python', 'mql5')


def clean_language(lang):
    """The language a shared script is written in (Pine Script, Python or MQL5)"""
    return lang if lang in SCRIPT_LANGUAGES else 'pine'


def clean_pine(p):
    """A script for the shared chart, or None: {code, scriptName, language, overrides, colors, capital}"""
    if not isinstance(p, dict) or not isinstance(p.get('code'), str) or not p['code'].strip():
        return None
    if len(p['code']) > MAX_PINE_CODE:
        return None
    capital = p.get('capital')
    return {
        "code": p['code'],
        "scriptName": str(p.get('scriptName') or 'Script')[:100],
        "language": clean_language(p.get('language')),
        "overrides": p['overrides'] if isinstance(p.get('overrides'), dict) else {},
        "colors": p['colors'] if isinstance(p.get('colors'), dict) else {},
        "capital": capital if isinstance(capital, (int, float)) and not isinstance(capital, bool) else None,
    }


@api_view(['GET', 'POST'])
def collab_rooms(request, uid):
    """GET: the collab charts this user owns or was added to, and the invites they haven't opened.
    POST {name?, symbol, interval, indicators, drawings, pine?}: starts a collab from the user's chart.
    POST {kind: "pine", name?, pine: {code, scriptName}}: shares only a Pine script, to edit together."""
    me, denied = require_session(request, uid)
    if denied:
        return denied

    if request.method == 'GET':
        memberships = CollabMember.objects.filter(profile=me, room__active=True).select_related('room', 'room__owner').order_by('-room__updated_at')
        return Response({
            "rooms": [{"token": m.room.token, "name": m.room.name, "kind": m.room.kind, "role": m.role, "owner_name": display_name(m.room.owner),
                       "symbol": m.room.symbol, "pending": m.last_seen is None and m.role != 'owner',
                       "requests": m.room.join_requests.filter(status='pending').count() if perms_of(m)["invite"] else 0}
                      for m in memberships],
        })

    data = request.data
    if data.get('kind') == 'pine':
        return _create_pine_room(me, data)
    symbol, interval = str(data.get('symbol') or '')[:40], str(data.get('interval') or '')[:20]
    if not symbol or not interval:
        return Response({"error": "symbol and interval are required"}, status=status.HTTP_400_BAD_REQUEST)
    indicators = data.get('indicators') if isinstance(data.get('indicators'), list) else []
    drawings = data.get('drawings') if isinstance(data.get('drawings'), list) else []
    if len(str(drawings)) > MAX_DRAWINGS_BYTES:
        return Response({"error": "Too many drawings to share"}, status=status.HTTP_400_BAD_REQUEST)
    name = str(data.get('name') or '').strip()[:120] or f"{symbol} · {display_name(me)}"
    pine = clean_pine(data.get('pine'))
    room = CollabRoom.objects.create(
        token=secrets.token_urlsafe(16)[:22], owner=me, name=name, symbol=symbol, interval=interval,
        indicators=indicators, drawings={symbol: drawings}, pine=pine, **room_settings(data),
    )
    CollabMember.objects.create(room=room, profile=me, role='owner', last_seen=timezone.now())
    CollabMessage.objects.create(room=room, kind='system', text=f"{display_name(me)} started the collab")
    return Response(room_json(room, me), status=status.HTTP_201_CREATED)


def room_settings(data):
    """The owner's choices made when starting a collab (each can be changed later)"""
    out = {}
    if data.get('link_access') in dict(CollabRoom.LINK_ACCESS):
        out['link_access'] = data['link_access']
    for field in ('allow_requests', 'allow_voice'):
        if isinstance(data.get(field), bool):
            out[field] = data[field]
    return out


def _create_pine_room(me, data):
    """A collab of just a Pine script: the people in it edit the code together (and chat / talk);
    nobody's chart is shared"""
    pine = clean_pine(data.get('pine'))
    script = pine['scriptName'] if pine else 'Pine script'
    name = str(data.get('name') or '').strip()[:120] or script
    doc = Doc()
    if pine:
        with doc.transaction():
            doc.get('code', type=Text).insert(0, pine['code'])
            doc.get('meta', type=Map)['language'] = pine['language']
    room = CollabRoom.objects.create(
        token=secrets.token_urlsafe(16)[:22], owner=me, name=name, kind='pine',
        symbol=str(data.get('symbol') or '')[:40], interval=str(data.get('interval') or '')[:20],
        pine_doc=base64.b64encode(doc.get_update()).decode(), **room_settings(data),
    )
    CollabMember.objects.create(room=room, profile=me, role='owner', last_seen=timezone.now())
    CollabMessage.objects.create(room=room, kind='system', text=f"{display_name(me)} shared the script \u201c{script}\u201d")
    return Response(room_json(room, me), status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH'])
def collab_room(request, uid, token):
    """GET: opens a collab chart (joining it through the link when its access allows).
    PATCH {name?, link_access?, active?}: the owner changes it; active=false ends the collab."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    room = CollabRoom.objects.filter(token=token).select_related('owner').first()
    if not room or not room.active:
        return Response({"error": "This collab has ended or the link is wrong"}, status=status.HTTP_404_NOT_FOUND)
    member = CollabMember.objects.filter(room=room, profile=me).first()

    if request.method == 'GET':
        if member is None:
            role = ROLE_OF_LINK.get(room.link_access)
            kicked = room.kicked.filter(id=me.id).exists()
            if kicked or not role:
                return Response(no_access_json(room, me, kicked), status=status.HTTP_403_FORBIDDEN)
            member = CollabMember.objects.create(room=room, profile=me, role=role, **defaults_for(role))
            CollabJoinRequest.objects.filter(room=room, profile=me).delete()
        first_visit = member.last_seen is None
        member.last_seen = timezone.now()
        member.save(update_fields=['last_seen'])
        if first_visit and member.role != 'owner':
            system_message(room, f"{display_name(me)} joined")
            notify_room(room, {"type": "access.changed"})
        return Response(room_json(room, me))

    if not member or member.role != 'owner':
        return Response({"error": "Only the owner can change this collab"}, status=status.HTTP_403_FORBIDDEN)
    data = request.data
    if 'name' in data:
        name = str(data.get('name') or '').strip()[:120]
        if name:
            room.name = name
    if data.get('link_access') in dict(CollabRoom.LINK_ACCESS):
        room.link_access = data['link_access']
    for field in ('allow_requests', 'allow_voice'):
        if isinstance(data.get(field), bool) and data[field] != getattr(room, field):
            setattr(room, field, data[field])
            if field == 'allow_voice':
                system_message(room, f"{display_name(me)} turned {'on' if data[field] else 'off'} everyone's mic")
    if data.get('active') is False:
        room.active = False
    room.save()
    notify_room(room, {"type": "access.changed"} if room.active else {"type": "room.ended"})
    return Response(room_json(room, me))


def no_access_json(room, me, kicked):
    """What someone who opened the link without access is told: kicked out, or not invited (and
    whether they may ask to be let in, and what became of their request)"""
    if kicked:
        return {"error": "You were removed from this collab.", "kicked": True, "room_name": room.name,
                "owner_name": display_name(room.owner), "can_request": False, "request": None}
    req = CollabJoinRequest.objects.filter(room=room, profile=me).first()
    return {"error": "You weren't invited to this collab.", "not_invited": True, "room_name": room.name,
            "owner_name": display_name(room.owner), "can_request": room.allow_requests,
            "request": req.status if req else None}


@api_view(['POST', 'DELETE'])
def collab_request(request, uid, token):
    """POST: someone without access asks to be let in (when the owner allows asking).
    DELETE: they take the request back."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    room = CollabRoom.objects.filter(token=token, active=True).select_related('owner').first()
    if not room:
        return Response({"error": "This collab has ended or the link is wrong"}, status=status.HTTP_404_NOT_FOUND)
    if CollabMember.objects.filter(room=room, profile=me).exists():
        return Response({"error": "You're already in this collab"}, status=status.HTTP_400_BAD_REQUEST)
    if request.method == 'DELETE':
        CollabJoinRequest.objects.filter(room=room, profile=me, status='pending').delete()
        notify_room(room, {"type": "access.changed"})
        return Response(no_access_json(room, me, False))
    if room.kicked.filter(id=me.id).exists():
        return Response(no_access_json(room, me, True), status=status.HTTP_403_FORBIDDEN)
    if not room.allow_requests:
        return Response({**no_access_json(room, me, False), "error": "The owner isn't taking requests to join"}, status=status.HTTP_403_FORBIDDEN)
    req, created = CollabJoinRequest.objects.get_or_create(room=room, profile=me)
    if not created and req.status != 'pending':
        req.status = 'pending'
        req.save(update_fields=['status'])
        created = True
    if created:
        notify_room(room, {"type": "join.request", "request": request_json(req)})
    return Response(no_access_json(room, me, False), status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@api_view(['POST'])
def collab_request_answer(request, uid, token, member_uid):
    """{action: "approve" (role?) | "decline" | "block"}: the owner, or anyone allowed to add
    people, answers someone's request to join. Only the owner adds editors or blocks."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    room = CollabRoom.objects.filter(token=token, active=True).first()
    mine = room and CollabMember.objects.filter(room=room, profile=me).select_related('room').first()
    if not mine or not perms_of(mine)["invite"]:
        return Response({"error": "You can't let people into this collab"}, status=status.HTTP_403_FORBIDDEN)
    req = CollabJoinRequest.objects.filter(room=room, profile__uid=member_uid, status='pending').select_related('profile').first()
    if not req:
        return Response({"error": "That request isn't waiting any more"}, status=status.HTTP_404_NOT_FOUND)
    action = request.data.get('action')
    person = req.profile
    if action == 'approve':
        role = request.data.get('role') if request.data.get('role') in ('editor', 'viewer') else ROLE_OF_LINK.get(room.link_access, 'editor')
        if role == 'editor' and mine.role != 'owner':
            role = 'viewer'
        req.delete()
        room.kicked.remove(person)
        if not CollabMember.objects.filter(room=room, profile=person).exists():
            CollabMember.objects.create(room=room, profile=person, role=role, invited_by=me, **defaults_for(role))
        system_message(room, f"{display_name(me)} let {display_name(person)} in")
    elif action == 'decline':
        req.status = 'declined'
        req.save(update_fields=['status'])
    elif action == 'block':
        if mine.role != 'owner':
            return Response({"error": "Only the owner can block people"}, status=status.HTTP_403_FORBIDDEN)
        req.delete()
        room.kicked.add(person)
    else:
        return Response({"error": "action must be approve, decline or block"}, status=status.HTTP_400_BAD_REQUEST)
    notify_room(room, {"type": "access.changed"})
    return Response(room_json(room, me))


@api_view(['DELETE'])
def collab_unkick(request, uid, token, member_uid):
    """The owner lets someone they kicked out (or blocked) open the link and ask to join again"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    room = CollabRoom.objects.filter(token=token, active=True).first()
    if not room or room.owner_id != me.id:
        return Response({"error": "Only the owner can do this"}, status=status.HTTP_403_FORBIDDEN)
    room.kicked.remove(*TraderProfile.objects.filter(uid=member_uid))
    notify_room(room, {"type": "access.changed"})
    return Response(room_json(room, me))


@api_view(['PATCH'])
def collab_members(request, uid, token):
    """{uids: [...] | "all", role?, can_voice?, can_pine?, ...}: the owner changes several people's
    access at once (e.g. turns off the mics of the people picked, or makes everyone viewers)"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    room = CollabRoom.objects.filter(token=token, active=True).first()
    if not room or room.owner_id != me.id:
        return Response({"error": "Only the owner can change people's permissions"}, status=status.HTTP_403_FORBIDDEN)
    data = request.data
    targets = CollabMember.objects.filter(room=room).exclude(role='owner')
    uids = data.get('uids')
    if uids != 'all':
        if not isinstance(uids, list) or not uids:
            return Response({"error": "Pick at least one person"}, status=status.HTTP_400_BAD_REQUEST)
        targets = targets.filter(profile__uid__in=[str(u) for u in uids])
    changes = {}
    if 'role' in data:
        if data['role'] not in ('editor', 'viewer'):
            return Response({"error": "role must be editor or viewer"}, status=status.HTTP_400_BAD_REQUEST)
        changes['role'] = data['role']
    for field in PERMISSION_FIELDS:
        if field in data:
            if not isinstance(data[field], bool):
                return Response({"error": f"{field} must be true or false"}, status=status.HTTP_400_BAD_REQUEST)
            changes[field] = data[field]
    if not changes:
        return Response({"error": "Nothing to change"}, status=status.HTTP_400_BAD_REQUEST)
    # One update and one notice, rather than one per person
    if targets.update(**changes):
        notify_room(room, {"type": "access.changed"})
    return Response(room_json(room, me))


@api_view(['POST'])
def collab_invite(request, uid, token):
    """{people: ["email or name", …], role: "editor"|"viewer"}: adds people who have an account.
    The owner, and anyone the owner lets add people, can; only the owner can add editors."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    room = CollabRoom.objects.filter(token=token, active=True).first()
    member = room and CollabMember.objects.filter(room=room, profile=me).first()
    if not member or not perms_of(member)["invite"]:
        return Response({"error": "You can't add people to this collab"}, status=status.HTTP_403_FORBIDDEN)
    role = request.data.get('role') if request.data.get('role') in ('editor', 'viewer') else 'editor'
    if role == 'editor' and member.role != 'owner':
        role = 'viewer'
    people = request.data.get('people')
    if not isinstance(people, list) or not people:
        return Response({"error": "Add at least one email or name"}, status=status.HTTP_400_BAD_REQUEST)

    added, errors = [], []
    for raw in people[:MAX_INVITES]:
        query = str(raw or '').strip()
        if not query:
            continue
        if '@' in query:
            matches = list(TraderProfile.objects.filter(email__iexact=query)[:2])
        else:
            matches = list(TraderProfile.objects.filter(name__iexact=query)[:2])
        if not matches:
            errors.append({"query": query, "error": "No account with this email" if '@' in query else "No one with this name — try their email"})
            continue
        if len(matches) > 1:
            errors.append({"query": query, "error": "More than one person has this name — use their email"})
            continue
        person = matches[0]
        if person.id == me.id:
            errors.append({"query": query, "error": "That's you"})
            continue
        if room.kicked.filter(id=person.id).exists():
            if member.role != 'owner':
                errors.append({"query": query, "error": "The owner removed them from this collab"})
                continue
            room.kicked.remove(person)   # the owner adding someone back lifts the kick
        CollabJoinRequest.objects.filter(room=room, profile=person).delete()
        existing = CollabMember.objects.filter(room=room, profile=person).first()
        if existing:
            if existing.role != 'owner' and existing.role != role and member.role == 'owner':
                existing.role = role
                existing.save(update_fields=['role'])
            added.append(member_json(existing))
            continue
        m = CollabMember.objects.create(room=room, profile=person, role=role, invited_by=me, **defaults_for(role))
        added.append(member_json(m))
        system_message(room, f"{display_name(me)} added {display_name(person)}")
    if added:
        notify_room(room, {"type": "access.changed"})
    return Response({"added": added, "errors": errors, "room": room_json(room, me)})


@api_view(['PATCH', 'DELETE'])
def collab_member(request, uid, token, member_uid):
    """PATCH {role?, can_replay?, can_invite?, can_voice?}: the owner changes what someone may do.
    DELETE: the owner removes someone, or someone leaves. DELETE ?kick=1: the owner kicks them
    out, which also keeps them from coming back through the link or asking to."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    room = CollabRoom.objects.filter(token=token).first()
    mine = room and CollabMember.objects.filter(room=room, profile=me).first()
    target = room and CollabMember.objects.filter(room=room, profile__uid=member_uid).select_related('profile').first()
    if not mine or not target:
        return Response({"error": "Not found"}, status=status.HTTP_404_NOT_FOUND)
    if target.role == 'owner':
        return Response({"error": "The owner can't be changed or removed"}, status=status.HTTP_400_BAD_REQUEST)
    if mine.role != 'owner' and target.id != mine.id:
        return Response({"error": "Only the owner can change other people's access"}, status=status.HTTP_403_FORBIDDEN)

    if request.method == 'PATCH':
        if mine.role != 'owner':
            return Response({"error": "Only the owner can change people's permissions"}, status=status.HTTP_403_FORBIDDEN)
        data = request.data
        if 'role' in data:
            if data['role'] not in ('editor', 'viewer'):
                return Response({"error": "role must be editor or viewer"}, status=status.HTTP_400_BAD_REQUEST)
            target.role = data['role']
        for field in PERMISSION_FIELDS:
            if field in data:
                if not isinstance(data[field], bool):
                    return Response({"error": f"{field} must be true or false"}, status=status.HTTP_400_BAD_REQUEST)
                setattr(target, field, data[field])
        target.save()
    else:
        name = display_name(target.profile)
        kick = request.query_params.get('kick') in ('1', 'true') and mine.role == 'owner'
        if kick:
            room.kicked.add(target.profile)
        target.delete()
        system_message(room, f"{name} left" if target.profile_id == me.id
                       else f"{display_name(me)} {'kicked out' if kick else 'removed'} {name}")
    notify_room(room, {"type": "access.changed"})
    return Response(room_json(room, me))


@api_view(['GET'])
def collab_people(request, uid):
    """?q=…: people this user has collaborated with before whose name or email matches, for
    suggestions in the Add people box (never the whole user list)."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    q = str(request.query_params.get('q') or '').strip()
    if len(q) < 1:
        return Response({"people": []})
    rooms = CollabMember.objects.filter(profile=me).values_list('room_id', flat=True)
    people = (TraderProfile.objects.filter(collabs__room_id__in=rooms).exclude(id=me.id)
              .filter(Q(name__icontains=q) | Q(email__icontains=q)).distinct()[:8])
    return Response({"people": [{"uid": p.uid, "name": display_name(p), "email": p.email, "color": color_of(p.uid)} for p in people]})


@api_view(['POST'])
def collab_transfer(request, uid, token):
    """{uid}: the owner hands the collab to someone in it. They become the owner; the old owner
    stays with every permission but the owner's."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    room = CollabRoom.objects.filter(token=token, active=True).first()
    mine = room and CollabMember.objects.filter(room=room, profile=me).first()
    if not mine or mine.role != 'owner':
        return Response({"error": "Only the owner can hand the collab over"}, status=status.HTTP_403_FORBIDDEN)
    target = CollabMember.objects.filter(room=room, profile__uid=request.data.get('uid')).select_related('profile').first()
    if not target or target.id == mine.id:
        return Response({"error": "Pick someone in this collab"}, status=status.HTTP_400_BAD_REQUEST)
    target.role = 'owner'
    for field in PERMISSION_FIELDS:
        setattr(target, field, True)
    target.save()
    mine.role = 'editor'
    for field in PERMISSION_FIELDS:
        setattr(mine, field, True)
    mine.save()
    room.owner = target.profile
    room.save(update_fields=['owner', 'updated_at'])
    system_message(room, f"{display_name(me)} made {display_name(target.profile)} the owner")
    notify_room(room, {"type": "access.changed"})
    return Response(room_json(room, me))


@receiver(post_save, sender=CollabMember)
@receiver(post_delete, sender=CollabMember)
def _member_changed(sender, instance, update_fields=None, **kwargs):
    """Someone's access changed (here, or in Django Admin): everyone connected re-checks theirs"""
    if update_fields and set(update_fields) <= {'last_seen'}:
        return   # just "opened the collab", not an access change
    try:
        notify_room(instance.room, {"type": "access.changed"})
    except CollabRoom.DoesNotExist:
        pass


@receiver(post_save, sender=CollabRoom)
def _room_changed(sender, instance, created, **kwargs):
    """A room ended or its link access changed (e.g. in Django Admin)"""
    if created:
        return
    notify_room(instance, {"type": "access.changed"} if instance.active else {"type": "room.ended"})
