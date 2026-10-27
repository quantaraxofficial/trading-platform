"""Read receipts, typing and last seen, for collab chats, group chats and private chats, and
everyone's privacy choices for them (the Chats panel's Privacy settings):

- read receipts: who has read your messages; off, nobody sees when you've read theirs, and you
  don't see theirs either
- typing: others see "… is typing"; off, nobody sees when you are
- last seen / online: off, nobody sees yours, and you don't see other people's

The browser reports that it's open (every ~25 s) and what it's typing in (a conversation's key);
the conversation endpoints and the collab connection add the rest, with these choices applied.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session
from .models import ChatPresence

ONLINE_SECONDS = 70      # a heartbeat every ~25 s: three missed and you're away
TYPING_SECONDS = 6
KEY_MAX = 120


class _Defaults:
    """Someone who never set anything: everything shared, not seen yet"""
    last_seen = None
    typing_key = ''
    typing_at = None
    read_receipts = True
    show_typing = True
    show_last_seen = True


def prefs(profile):
    try:
        return profile.presence
    except ChatPresence.DoesNotExist:
        return _Defaults()


def touch(profile, typing=None):
    """They're here (and, with typing, typing in that conversation; "" stops it)"""
    p, _ = ChatPresence.objects.get_or_create(profile=profile)
    now = timezone.now()
    p.last_seen = now
    fields = ['last_seen']
    if typing is not None:
        p.typing_key = str(typing)[:KEY_MAX]
        p.typing_at = now if typing else None
        fields += ['typing_key', 'typing_at']
    p.save(update_fields=fields)
    try:
        profile.presence = p
    except Exception:
        pass
    return p


def receipts_between(a, b):
    return prefs(a).read_receipts and prefs(b).read_receipts


def seen_json(viewer, person):
    """{online, last_seen (ms)} if both share their last seen; else hidden"""
    if not (prefs(viewer).show_last_seen and prefs(person).show_last_seen):
        return {"online": None, "last_seen": None, "hidden": True}
    t = prefs(person).last_seen
    if not t:
        return {"online": False, "last_seen": None}
    return {"online": timezone.now() - t < timedelta(seconds=ONLINE_SECONDS), "last_seen": int(t.timestamp() * 1000)}


def is_typing(person, key):
    p = prefs(person)
    return bool(p.show_typing and p.typing_key == key and p.typing_at and timezone.now() - p.typing_at < timedelta(seconds=TYPING_SECONDS))


def dm_key(token, a_uid, b_uid):
    x, y = sorted([a_uid, b_uid])
    return f"dm:{token}:{x}:{y}"


def privacy_json(p):
    return {"read_receipts": p.read_receipts, "show_typing": p.show_typing, "show_last_seen": p.show_last_seen}


@api_view(['GET', 'PATCH'])
def chat_privacy(request, uid):
    """GET / PATCH {read_receipts?, show_typing?, show_last_seen?}: your privacy choices"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'GET':
        return Response(privacy_json(prefs(me)))
    p, _ = ChatPresence.objects.get_or_create(profile=me)
    for field in ('read_receipts', 'show_typing', 'show_last_seen'):
        if isinstance(request.data.get(field), bool):
            setattr(p, field, request.data[field])
    if not p.show_typing:
        p.typing_key, p.typing_at = '', None
    p.save()
    return Response(privacy_json(p))


@api_view(['POST'])
def presence(request, uid):
    """{typing?: key | ""}: the site is open here (and what you're typing in)"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    typing = request.data.get('typing') if isinstance(request.data.get('typing'), str) else None
    touch(me, typing=typing)
    return Response({"ok": True})
