"""Images and documents shared in a collab's group chat.

A member uploads a file (with an optional caption); it becomes a chat message everyone in the
room sees at once. The files are kept outside the public media folder and served only to people
in that collab (with their session key), as downloads, except pictures, which show inline.
"""
import os
import secrets

from django.conf import settings
from django.core.files.storage import FileSystemStorage
from django.db.models.signals import post_delete
from django.dispatch import receiver
from django.http import FileResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .auth import require_session
from .collab import message_json, notify_room
from .models import CollabMember, CollabMessage, CollabRoom

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_CAPTION = 2000
# Pictures shown in the chat (no SVG: it can carry scripts)
IMAGE_TYPES = {'.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp'}
# Documents offered as downloads
DOCUMENT_TYPES = {
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json', '.md': 'text/markdown',
    '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.odt': 'application/vnd.oasis.opendocument.text', '.ods': 'application/vnd.oasis.opendocument.spreadsheet',
    '.rtf': 'application/rtf', '.zip': 'application/zip',
    '.pine': 'text/plain', '.py': 'text/plain', '.mq5': 'text/plain', '.mqh': 'text/plain', '.mq4': 'text/plain',
}
# Voice messages (recorded in the chat) and audio clips
AUDIO_TYPES = {'.webm': 'audio/webm', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav'}
ALLOWED = {**IMAGE_TYPES, **DOCUMENT_TYPES, **AUDIO_TYPES}
MAX_VOICE_SECONDS = 600


def storage():
    """Where shared files live: not under MEDIA_ROOT, which is served to anyone in development"""
    location = getattr(settings, 'COLLAB_FILES_ROOT', None) or os.path.join(settings.BASE_DIR, 'private_uploads', 'collab')
    return FileSystemStorage(location=location)


def clean_name(name):
    base = os.path.basename(str(name or 'file').replace('\\', '/')).replace('\x00', '')
    keep = ''.join(c if c.isalnum() or c in ' ._-()[]' else '_' for c in base).strip(' .') or 'file'
    stem, ext = os.path.splitext(keep)
    return stem[:100] + ext[:10].lower()


def image_size(f):
    """(width, height) when the upload really is a picture of the type its name says, else None"""
    try:
        from PIL import Image
        f.seek(0)
        with Image.open(f) as im:
            im.verify()
        f.seek(0)
        with Image.open(f) as im:
            fmt, size = (im.format or '').upper(), im.size
        f.seek(0)
        return size if fmt in ('PNG', 'JPEG', 'GIF', 'WEBP') else None
    except Exception:
        f.seek(0)
        return None


def audio_ok(f):
    """The upload really is audio of the kind its name says (by its first bytes)"""
    f.seek(0)
    head = f.read(16)
    f.seek(0)
    return (head.startswith(b'\x1aE\xdf\xa3') or head.startswith(b'OggS') or head[4:8] == b'ftyp'
            or head.startswith(b'ID3') or head[:2] in (b'\xff\xfb', b'\xff\xf3', b'\xff\xf2')
            or (head.startswith(b'RIFF') and head[8:12] == b'WAVE'))


def audio_fields(request, is_audio):
    """A voice message's attachment fields: audio, and its length in seconds (from the recorder)"""
    if not is_audio:
        return {}
    try:
        seconds = max(0.0, min(float(request.data.get('duration') or 0), MAX_VOICE_SECONDS))
    except (TypeError, ValueError):
        seconds = 0.0
    return {"audio": True, "duration": round(seconds, 1) or None}


def _member(request, uid, token):
    me, denied = require_session(request, uid)
    if denied:
        return None, None, denied
    room = CollabRoom.objects.filter(token=token, active=True).first()
    member = room and CollabMember.objects.filter(room=room, profile=me).select_related('profile').first()
    if not member:
        return None, None, Response({"error": "You're not in this collab"}, status=status.HTTP_403_FORBIDDEN)
    return room, member, None


@api_view(['POST'])
@parser_classes([MultiPartParser, FormParser])
def collab_upload(request, uid, token):
    """multipart {file, text?, to?}: shares an image or document in the group chat, or privately
    with one person in the collab (to: their uid)"""
    room, member, denied = _member(request, uid, token)
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
        return Response({"error": "That kind of file can't be shared here. Images (PNG, JPG, GIF, WebP), documents (PDF, Word, Excel, PowerPoint, text, CSV, ZIP, scripts) and voice messages can."},
                        status=status.HTTP_400_BAD_REQUEST)
    is_image = ext in IMAGE_TYPES
    size = image_size(f) if is_image else None
    if is_image and not size:
        return Response({"error": "That picture couldn't be read"}, status=status.HTTP_400_BAD_REQUEST)
    is_audio = ext in AUDIO_TYPES
    if is_audio and not audio_ok(f):
        return Response({"error": "That recording couldn't be read"}, status=status.HTTP_400_BAD_REQUEST)
    recipient = None
    to = str(request.data.get('to') or '').strip()
    if to:
        target = CollabMember.objects.filter(room=room, profile__uid=to).select_related('profile').first()
        if not target or target.profile_id == member.profile_id:
            return Response({"error": "You can share privately only with people in this collab"}, status=status.HTTP_400_BAD_REQUEST)
        recipient = target.profile
    path = storage().save(f"{room.id}/{secrets.token_hex(8)}_{name}", f)
    caption = str(request.data.get('text') or '').strip()[:MAX_CAPTION]
    msg = CollabMessage.objects.create(room=room, author=member.profile, recipient=recipient, kind='file', text=caption, attachment={
        "path": path, "name": name, "size": f.size, "type": ALLOWED[ext], "image": is_image,
        "width": size[0] if size else None, "height": size[1] if size else None, **audio_fields(request, is_audio),
    })
    CollabRoom.objects.filter(id=room.id).update(updated_at=timezone.now())
    notify_room(room, {"type": "chat.saved", "message": message_json(msg), "exclude": None,
                       "only": [member.profile.uid, recipient.uid] if recipient else None})
    return Response(message_json(msg), status=status.HTTP_201_CREATED)


@api_view(['GET'])
def collab_file(request, uid, token, message_id):
    """A shared file, for people in the collab: pictures inline, documents as downloads"""
    room, member, denied = _member(request, uid, token)
    if denied:
        return denied
    msg = CollabMessage.objects.filter(id=message_id, room=room, kind='file').first()
    # A privately shared file: only its two people
    if msg and msg.recipient_id and member.profile_id not in (msg.author_id, msg.recipient_id):
        msg = None
    a = msg and msg.attachment
    store = storage()
    if not a or not a.get('path') or not store.exists(a['path']):
        return Response({"error": "That file isn't here any more"}, status=status.HTTP_404_NOT_FOUND)
    # Pictures show and voice messages play in the page; documents download
    inline = bool(a.get('image') or a.get('audio')) and request.query_params.get('download') not in ('1', 'true')
    resp = FileResponse(store.open(a['path'], 'rb'), content_type=a.get('type') or 'application/octet-stream',
                        as_attachment=not inline, filename=a.get('name') or 'file')
    resp['X-Content-Type-Options'] = 'nosniff'
    resp['Cache-Control'] = 'private, max-age=86400'
    resp['Content-Security-Policy'] = "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'"
    return resp


@receiver(post_delete, sender=CollabMessage)
def _remove_file(sender, instance, **kwargs):
    """A shared file goes when its message does (or the collab is deleted)"""
    a = instance.attachment
    if a and a.get('path'):
        try:
            storage().delete(a['path'])
        except Exception:
            pass
