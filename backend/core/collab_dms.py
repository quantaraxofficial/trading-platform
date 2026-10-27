"""Private chats: one-to-one conversations between two people in a collab (the right toolbar's
Chats panel). Each conversation belongs to a collab both people are in; it's kept with that
collab's chat but only the two of them ever see it. They work without opening the collab: the
panel reads and sends here, and anyone connected to the collab gets them live as well.
"""
from django.db.models import Q
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session
from .collab import color_of, display_name, message_json, notify_room
from .chat_presence import dm_key, is_typing, receipts_between, seen_json, touch
from .models import CollabMember, CollabMessage, CollabRoom

MAX_CHARS = 2000
THREAD_MESSAGES = 200


def _person(p):
    return {"uid": p.uid, "name": display_name(p), "email": p.email, "color": color_of(p.uid)}


@api_view(['GET'])
def dm_conversations(request, uid):
    """Your private conversations, newest first: who with, in which collab, the last message, and
    how many you haven't read"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    rooms = set(CollabMember.objects.filter(profile=me, room__active=True).values_list('room_id', flat=True))
    msgs = (CollabMessage.objects.filter(room_id__in=rooms, recipient__isnull=False).filter(Q(author=me) | Q(recipient=me))
            .select_related('author', 'recipient', 'room').order_by('-created_at')[:2000])
    convs = {}
    for m in msgs:
        partner = m.recipient if m.author_id == me.id else m.author
        if partner is None:
            continue
        key = (m.room_id, partner.id)
        c = convs.get(key)
        if c is None:
            c = convs[key] = {
                "token": m.room.token, "room_name": m.room.name, "room_kind": m.room.kind,
                "partner": _person(partner), "last": message_json(m), "unread": 0,
            }
        if m.recipient_id == me.id and m.read_at is None:
            c["unread"] += 1
    out = sorted(convs.values(), key=lambda c: c["last"]["time"], reverse=True)
    return Response({"conversations": out, "unread": sum(c["unread"] for c in out)})


@api_view(['GET'])
def dm_people(request, uid):
    """Who you can message: everyone in your collabs, with the collabs you share"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    mine = CollabMember.objects.filter(profile=me, room__active=True).select_related('room')
    rooms = {m.room_id: m.room for m in mine}
    people = {}
    for m in CollabMember.objects.filter(room_id__in=rooms.keys()).exclude(profile=me).select_related('profile'):
        p = people.setdefault(m.profile_id, {**_person(m.profile), "collabs": []})
        r = rooms[m.room_id]
        p["collabs"].append({"token": r.token, "name": r.name, "kind": r.kind})
    return Response({"people": sorted(people.values(), key=lambda p: p["name"].lower())})


def _thread(request, uid, token, partner_uid):
    me, denied = require_session(request, uid)
    if denied:
        return None, None, None, denied
    room = CollabRoom.objects.filter(token=token, active=True).first()
    if not room or not CollabMember.objects.filter(room=room, profile=me).exists():
        return None, None, None, Response({"error": "You're not in this collab"}, status=status.HTTP_403_FORBIDDEN)
    partner = CollabMember.objects.filter(room=room, profile__uid=partner_uid).select_related('profile').first()
    if not partner or partner.profile_id == me.id:
        return None, None, None, Response({"error": "They aren't in this collab any more"}, status=status.HTTP_404_NOT_FOUND)
    return me, room, partner.profile, None


@api_view(['GET', 'POST'])
def dm_thread(request, uid, token, partner_uid):
    """GET: the conversation with one person in a collab (reading it marks it read).
    POST {text}: sends them a private message."""
    me, room, partner, denied = _thread(request, uid, token, partner_uid)
    if denied:
        return denied
    pair = Q(author=me, recipient=partner) | Q(author=partner, recipient=me)
    if request.method == 'GET':
        msgs = list(CollabMessage.objects.filter(room=room).filter(pair).select_related('author', 'recipient').order_by('-created_at')[:THREAD_MESSAGES])
        CollabMessage.objects.filter(room=room, author=partner, recipient=me, read_at__isnull=True).update(read_at=timezone.now())
        touch(me)
        receipts = receipts_between(me, partner)
        out = []
        for m in reversed(msgs):
            j = message_json(m)
            if m.author_id == me.id:
                j["read"] = bool(m.read_at) if receipts else None   # None: read receipts are off
            out.append(j)
        return Response({"token": room.token, "room_name": room.name, "partner": _person(partner), "messages": out,
                         "key": dm_key(room.token, me.uid, partner.uid),
                         "presence": {**seen_json(me, partner), "typing": is_typing(partner, dm_key(room.token, me.uid, partner.uid))}})
    text = str(request.data.get('text') or '').strip()[:MAX_CHARS]
    if not text:
        return Response({"error": "Write a message"}, status=status.HTTP_400_BAD_REQUEST)
    msg = CollabMessage.objects.create(room=room, author=me, recipient=partner, kind='text', text=text)
    CollabRoom.objects.filter(id=room.id).update(updated_at=timezone.now())
    notify_room(room, {"type": "chat.saved", "message": message_json(msg), "exclude": None, "only": [me.uid, partner.uid]})
    return Response(message_json(msg), status=status.HTTP_201_CREATED)
