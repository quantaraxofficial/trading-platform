"""Group chats in the Chats panel: a named group of people from your collabs (or your other
groups) talking together, apart from any collab. Whoever makes one is its admin; admins rename
it, add and remove people, make others admins, set its theme (colours, font, a background photo)
and can delete it. Anyone can leave; when the last admin leaves, the longest-standing member
becomes admin. Only the group's members read its messages and open its files.
"""
import base64
import hashlib
import os
import secrets

from django.db.models import Q
from django.http import FileResponse, HttpResponse
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .auth import require_session
from .collab import IMAGE_RE, clean_chat_theme, color_of, display_name
from .collab_files import ALLOWED, AUDIO_TYPES, IMAGE_TYPES, MAX_FILE_BYTES, audio_fields, audio_ok, clean_name, image_size, storage
from .chat_presence import is_typing, prefs, receipts_between, seen_json, touch
from .models import ChatGroup, ChatGroupMember, ChatGroupMessage, CollabMember, TraderProfile

MAX_MEMBERS = 50
MAX_CHARS = 2000
THREAD_MESSAGES = 200


def contacts_of(me):
    """Who you can add to a group: people in your collabs and in your other groups"""
    rooms = CollabMember.objects.filter(profile=me, room__active=True).values_list('room_id', flat=True)
    groups = ChatGroupMember.objects.filter(profile=me).values_list('group_id', flat=True)
    return TraderProfile.objects.filter(Q(collabs__room_id__in=rooms) | Q(chat_groups__group_id__in=groups)).exclude(id=me.id).distinct()


def _person(p):
    return {"uid": p.uid, "name": display_name(p), "email": p.email, "color": color_of(p.uid)}


def message_json(m):
    out = {
        "id": m.id, "kind": m.kind, "text": m.text, "time": int(m.created_at.timestamp() * 1000),
        "author": m.author.uid if m.author else None,
        "author_name": display_name(m.author) if m.author else None,
    }
    if m.attachment:
        out["attachment"] = {**{k: m.attachment.get(k) for k in ('name', 'size', 'type', 'image', 'width', 'height')},
                             **({"audio": True, "duration": m.attachment.get('duration')} if m.attachment.get('audio') else {})}
    return out


def theme_json(g):
    t = g.theme
    if not t:
        return None
    out = {k: v for k, v in t.items() if k != 'image'}
    out['image_v'] = hashlib.sha1(t['image'].encode()).hexdigest()[:12] if t.get('image') else None
    return out


def group_json(g, mine):
    members = g.members.select_related('profile')
    return {
        "token": g.token, "name": g.name, "theme": theme_json(g), "role": mine.role,
        "members": [{**_person(m.profile), "role": m.role} for m in members],
        "created_at": g.created_at.isoformat(),
    }


def unread_of(g, mine):
    since = mine.last_read_at or mine.joined_at
    return g.messages.filter(created_at__gt=since).exclude(author=mine.profile).count()


def system(g, text):
    ChatGroupMessage.objects.create(group=g, kind='system', text=text)
    ChatGroup.objects.filter(id=g.id).update(updated_at=timezone.now())


def _mine(request, uid, token):
    me, denied = require_session(request, uid)
    if denied:
        return None, None, None, denied
    g = ChatGroup.objects.filter(token=token).first()
    mine = g and ChatGroupMember.objects.filter(group=g, profile=me).select_related('profile').first()
    if not mine:
        return None, None, None, Response({"error": "You're not in this group"}, status=status.HTTP_404_NOT_FOUND)
    return me, g, mine, None


def _admin_only(mine):
    if mine.role != 'admin':
        return Response({"error": "Only the group's admins can do this"}, status=status.HTTP_403_FORBIDDEN)
    return None


def _ensure_admin(g):
    """A group always has an admin: the longest-standing member takes over"""
    if not g.members.filter(role='admin').exists():
        first = g.members.order_by('joined_at').first()
        if first:
            first.role = 'admin'
            first.save(update_fields=['role'])
            system(g, f"{display_name(first.profile)} is now an admin")


@api_view(['GET', 'POST'])
def groups(request, uid):
    """GET: your groups (newest activity first) with the last message and how many you haven't
    read. POST {name, people: [uid…]}: makes a group with them (you're its admin)."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'GET':
        out = []
        for mine in ChatGroupMember.objects.filter(profile=me).select_related('group'):
            g = mine.group
            last = g.messages.select_related('author').order_by('-created_at').first()
            out.append({
                "token": g.token, "name": g.name, "role": mine.role, "members": g.members.count(),
                "people": [_person(m.profile) for m in g.members.select_related('profile')[:4]],
                "last": message_json(last) if last else None, "unread": unread_of(g, mine),
                "updated_at": int(g.updated_at.timestamp() * 1000),
            })
        out.sort(key=lambda c: (c["last"] or {}).get("time") or c["updated_at"], reverse=True)
        return Response({"groups": out, "unread": sum(c["unread"] for c in out)})

    name = str(request.data.get('name') or '').strip()[:80]
    people = request.data.get('people')
    if not name:
        return Response({"error": "Name the group"}, status=status.HTTP_400_BAD_REQUEST)
    if not isinstance(people, list) or not people:
        return Response({"error": "Add at least one person"}, status=status.HTTP_400_BAD_REQUEST)
    allowed = {p.uid: p for p in contacts_of(me).filter(uid__in=[str(u) for u in people])}
    if len(allowed) != len(set(str(u) for u in people)):
        return Response({"error": "You can add only people from your collabs and groups"}, status=status.HTTP_400_BAD_REQUEST)
    if len(allowed) + 1 > MAX_MEMBERS:
        return Response({"error": f"A group can have up to {MAX_MEMBERS} people"}, status=status.HTTP_400_BAD_REQUEST)
    g = ChatGroup.objects.create(token=secrets.token_urlsafe(12)[:16], name=name, created_by=me)
    mine = ChatGroupMember.objects.create(group=g, profile=me, role='admin', last_read_at=timezone.now())
    for p in allowed.values():
        ChatGroupMember.objects.create(group=g, profile=p)
    system(g, f"{display_name(me)} made the group with {', '.join(display_name(p) for p in allowed.values())}")
    return Response(group_json(g, mine), status=status.HTTP_201_CREATED)


@api_view(['GET'])
def group_contacts(request, uid):
    """Who you can put in a group"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    return Response({"people": sorted((_person(p) for p in contacts_of(me)), key=lambda p: p["name"].lower())})


@api_view(['GET', 'PATCH', 'DELETE'])
def group(request, uid, token):
    """GET: the group and its recent messages (reading marks them read).
    PATCH {name?, theme?, keep_image?}: an admin renames it or sets its theme.
    DELETE: an admin deletes it, with its messages and files."""
    me, g, mine, denied = _mine(request, uid, token)
    if denied:
        return denied
    if request.method == 'GET':
        msgs = list(g.messages.select_related('author').order_by('-created_at')[:THREAD_MESSAGES])
        mine.last_read_at = timezone.now()
        mine.save(update_fields=['last_read_at'])
        touch(me)
        others = [m for m in g.members.select_related('profile', 'profile__presence') if m.profile_id != me.id]
        key = f"group:{g.token}"
        readers = [m for m in others if receipts_between(me, m.profile)]
        out = []
        for msg in reversed(msgs):
            j = message_json(msg)
            if msg.author_id == me.id:
                j["read_by"] = [m.profile.uid for m in readers if m.last_read_at and m.last_read_at >= msg.created_at]
            out.append(j)
        return Response({**group_json(g, mine), "messages": out, "key": key,
                         "presence": {m.profile.uid: seen_json(me, m.profile) for m in others},
                         "typing": [display_name(m.profile) for m in others if is_typing(m.profile, key)],
                         "receipts": prefs(me).read_receipts})
    denied = _admin_only(mine)
    if denied:
        return denied
    if request.method == 'DELETE':
        g.delete()
        return Response({"deleted": True})
    data = request.data
    if 'name' in data:
        name = str(data.get('name') or '').strip()[:80]
        if name and name != g.name:
            g.name = name
            system(g, f"{display_name(me)} renamed the group to {name}")
    if 'theme' in data:
        keep = (g.theme or {}).get('image') if data.get('keep_image') else None
        g.theme = clean_chat_theme(data.get('theme'), keep_image=keep)
        system(g, f"{display_name(me)} {'changed the theme to ' + g.theme['name'] if g.theme else 'reset the theme'}")
    g.save()
    return Response(group_json(g, mine))


@api_view(['POST'])
def group_add(request, uid, token):
    """{people: [uid…]}: an admin adds people from their collabs and groups"""
    me, g, mine, denied = _mine(request, uid, token)
    if denied:
        return denied
    denied = _admin_only(mine)
    if denied:
        return denied
    people = request.data.get('people')
    if not isinstance(people, list) or not people:
        return Response({"error": "Pick people to add"}, status=status.HTTP_400_BAD_REQUEST)
    found = list(contacts_of(me).filter(uid__in=[str(u) for u in people]).exclude(chat_groups__group=g))
    if g.members.count() + len(found) > MAX_MEMBERS:
        return Response({"error": f"A group can have up to {MAX_MEMBERS} people"}, status=status.HTTP_400_BAD_REQUEST)
    for p in found:
        ChatGroupMember.objects.create(group=g, profile=p)
    if found:
        system(g, f"{display_name(me)} added {', '.join(display_name(p) for p in found)}")
    return Response(group_json(g, mine))


@api_view(['PATCH', 'DELETE'])
def group_member(request, uid, token, member_uid):
    """PATCH {role: admin|member}: an admin makes someone an admin or not.
    DELETE: an admin removes someone, or you leave."""
    me, g, mine, denied = _mine(request, uid, token)
    if denied:
        return denied
    target = g.members.filter(profile__uid=member_uid).select_related('profile').first()
    if not target:
        return Response({"error": "They're not in this group"}, status=status.HTTP_404_NOT_FOUND)
    leaving = target.id == mine.id
    if not leaving:
        denied = _admin_only(mine)
        if denied:
            return denied
    if request.method == 'PATCH':
        role = request.data.get('role')
        if role not in ('admin', 'member'):
            return Response({"error": "role must be admin or member"}, status=status.HTTP_400_BAD_REQUEST)
        if leaving and role == 'admin' and mine.role != 'admin':
            return Response({"error": "Only the group's admins can do this"}, status=status.HTTP_403_FORBIDDEN)
        target.role = role
        target.save(update_fields=['role'])
        system(g, f"{display_name(target.profile)} is {'now an admin' if role == 'admin' else 'no longer an admin'}")
        _ensure_admin(g)
        return Response(group_json(g, mine))
    name = display_name(target.profile)
    target.delete()
    if not g.members.exists():
        g.delete()
        return Response({"left": True})
    system(g, f"{name} left" if leaving else f"{display_name(me)} removed {name}")
    _ensure_admin(g)
    if leaving:
        return Response({"left": True})
    return Response(group_json(g, mine))


@api_view(['POST'])
def group_send(request, uid, token):
    """{text}: a message to the group"""
    me, g, mine, denied = _mine(request, uid, token)
    if denied:
        return denied
    text = str(request.data.get('text') or '').strip()[:MAX_CHARS]
    if not text:
        return Response({"error": "Write a message"}, status=status.HTTP_400_BAD_REQUEST)
    m = ChatGroupMessage.objects.create(group=g, author=me, kind='text', text=text)
    ChatGroup.objects.filter(id=g.id).update(updated_at=timezone.now())
    mine.last_read_at = timezone.now()
    mine.save(update_fields=['last_read_at'])
    return Response(message_json(m), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def group_upload(request, uid, token):
    """multipart {file, text?}: shares a picture or document in the group (the same kinds and
    limits as collab chats)"""
    me, g, mine, denied = _mine(request, uid, token)
    if denied:
        return denied
    f = request.FILES.get('file')
    if not f:
        return Response({"error": "Pick a file to share"}, status=status.HTTP_400_BAD_REQUEST)
    if f.size > MAX_FILE_BYTES:
        return Response({"error": f"Files can be up to {MAX_FILE_BYTES // (1024 * 1024)} MB"}, status=status.HTTP_400_BAD_REQUEST)
    name = clean_name(f.name)
    ext = os.path.splitext(name)[1].lower()
    if ext not in ALLOWED:
        return Response({"error": "That kind of file can't be shared here"}, status=status.HTTP_400_BAD_REQUEST)
    is_image = ext in IMAGE_TYPES
    size = image_size(f) if is_image else None
    if is_image and not size:
        return Response({"error": "That picture couldn't be read"}, status=status.HTTP_400_BAD_REQUEST)
    is_audio = ext in AUDIO_TYPES
    if is_audio and not audio_ok(f):
        return Response({"error": "That recording couldn't be read"}, status=status.HTTP_400_BAD_REQUEST)
    path = storage().save(f"groups/{g.id}/{secrets.token_hex(8)}_{name}", f)
    m = ChatGroupMessage.objects.create(group=g, author=me, kind='file', text=str(request.data.get('text') or '').strip()[:MAX_CHARS], attachment={
        "path": path, "name": name, "size": f.size, "type": ALLOWED[ext], "image": is_image,
        "width": size[0] if size else None, "height": size[1] if size else None, **audio_fields(request, is_audio),
    })
    ChatGroup.objects.filter(id=g.id).update(updated_at=timezone.now())
    return Response(message_json(m), status=status.HTTP_201_CREATED)


@api_view(['GET'])
def group_file(request, uid, token, message_id):
    """A file shared in the group, for its members: pictures inline, documents as downloads"""
    me, g, mine, denied = _mine(request, uid, token)
    if denied:
        return denied
    m = g.messages.filter(id=message_id, kind='file').first()
    a = m and m.attachment
    store = storage()
    if not a or not store.exists(a.get('path') or ''):
        return Response({"error": "That file isn't here any more"}, status=status.HTTP_404_NOT_FOUND)
    # Pictures show and voice messages play in the page; documents download
    inline = bool(a.get('image') or a.get('audio')) and request.query_params.get('download') not in ('1', 'true')
    resp = FileResponse(store.open(a['path'], 'rb'), content_type=a.get('type') or 'application/octet-stream', as_attachment=not inline, filename=a.get('name') or 'file')
    resp['X-Content-Type-Options'] = 'nosniff'
    resp['Cache-Control'] = 'private, max-age=86400'
    resp['Content-Security-Policy'] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"
    return resp


@api_view(['GET'])
def group_theme_image(request, uid, token):
    """The group theme's background photo, for its members"""
    me, g, mine, denied = _mine(request, uid, token)
    if denied:
        return denied
    match = IMAGE_RE.match((g.theme or {}).get('image') or '')
    if not match:
        return Response({"error": "No photo"}, status=status.HTTP_404_NOT_FOUND)
    resp = HttpResponse(base64.b64decode(match.group(2)), content_type=match.group(1))
    resp['X-Content-Type-Options'] = 'nosniff'
    resp['Cache-Control'] = 'private, max-age=31536000'
    return resp


@receiver(post_delete, sender=ChatGroupMessage)
def _remove_file(sender, instance, **kwargs):
    a = instance.attachment
    if a and a.get('path'):
        try:
            storage().delete(a['path'])
        except Exception:
            pass
