"""Profiles' photos, social links and posts.

- Your photo: uploaded, re-encoded (at most 512 px; what the camera wrote into it — GPS location,
  device — is dropped), shown to everyone on your profile, in search and beside what you publish.
- Links to your other social media: Instagram, X, YouTube, TikTok, Telegram, Facebook, LinkedIn,
  Discord, Threads, a website; a handle ("@name") or a link.
- Posts: up to 10 photos and videos with a caption, public (everyone, found by everyone's search)
  or for your followers only (you and the people who follow you). Photos are re-encoded the same
  way (their location data dropped); videos are kept as they are. The files are kept outside the
  public media folder and served only to people who may see the post (videos with byte ranges,
  so they can be skipped through).
- Search: posts by words in the caption, #hashtags or the author, among the posts you may see.
- Likes and comments from people who may see the post; each post says who may comment (everyone
  who sees it, the author's followers, or nobody) and whether it may be shared. Its author is told
  (notifications) and may delete any comment on it; commenters may delete their own.
- Sharing: a post's link (/p/<id>), or the post — or someone's profile — sent into your chats on
  the site (personal chats, group chats, collabs) as a card. Whoever opens it still needs to be
  allowed to see the post (a followers-only post stays with followers).
"""
import io
import os
import re
import secrets
from urllib.parse import urlparse

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import FileSystemStorage
from django.db.models import F as models_F, Q
from django.http import FileResponse, HttpResponse, StreamingHttpResponse
from rest_framework import status
from rest_framework.decorators import api_view, parser_classes
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from django.utils import timezone

from .auth import require_session
from .models import (ChatGroup, ChatGroupMember, ChatGroupMessage, CollabMember, CollabMessage, CollabRoom, Follow, Post, PostComment,
                     PostLike, PostMedia, TraderProfile)

MAX_FILES = 10
MAX_IMAGE_BYTES = 15 * 1024 * 1024
MAX_VIDEO_BYTES = 100 * 1024 * 1024
MAX_AVATAR_BYTES = 8 * 1024 * 1024
MAX_CAPTION = 2200
MAX_COMMENT = 1000
MAX_SHARE_TARGETS = 20
PAGE = 24
IMAGE_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
VIDEO_TYPES = {'.mp4': 'video/mp4', '.m4v': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm'}
HASHTAG_RE = re.compile(r'#(\w{1,40})', re.UNICODE)

# kind → (label, profile address for a handle, the sites a link may be on)
LINK_KINDS = {
    'instagram': ("Instagram", "https://instagram.com/{}", ("instagram.com",)),
    'x': ("X", "https://x.com/{}", ("x.com", "twitter.com")),
    'youtube': ("YouTube", "https://youtube.com/@{}", ("youtube.com", "youtu.be")),
    'tiktok': ("TikTok", "https://tiktok.com/@{}", ("tiktok.com",)),
    'telegram': ("Telegram", "https://t.me/{}", ("t.me", "telegram.me", "telegram.org")),
    'facebook': ("Facebook", "https://facebook.com/{}", ("facebook.com", "fb.com")),
    'linkedin': ("LinkedIn", "https://linkedin.com/in/{}", ("linkedin.com",)),
    'discord': ("Discord", "https://discord.gg/{}", ("discord.gg", "discord.com")),
    'threads': ("Threads", "https://threads.net/@{}", ("threads.net", "threads.com")),
    'website': ("Website", None, ()),
}
MAX_LINKS = 10


def storage():
    location = getattr(settings, 'POST_FILES_ROOT', None) or os.path.join(settings.BASE_DIR, 'private_uploads', 'posts')
    return FileSystemStorage(location=location)


# ---------------------------------------------------------------- pictures

def _reencode(f, max_side):
    """The picture re-encoded (turned upright, at most max_side, without its EXIF / GPS data):
    (bytes, ext, mime, w, h); GIFs are kept as they are (their animation); None if unreadable"""
    from PIL import Image, ImageOps
    try:
        f.seek(0)
        with Image.open(f) as im:
            im.verify()
        f.seek(0)
        im = Image.open(f)
        fmt = (im.format or '').upper()
        if fmt not in ('JPEG', 'PNG', 'WEBP', 'GIF', 'MPO'):
            return None
        if fmt == 'GIF':
            f.seek(0)
            return f.read(), '.gif', 'image/gif', im.width, im.height
        im = ImageOps.exif_transpose(im)
        im.thumbnail((max_side, max_side))
        out = io.BytesIO()
        if im.mode in ('RGBA', 'LA', 'P') and fmt in ('PNG', 'WEBP'):
            im.convert('RGBA').save(out, 'PNG', optimize=True)
            return out.getvalue(), '.png', 'image/png', im.width, im.height
        im.convert('RGB').save(out, 'JPEG', quality=88, optimize=True)
        return out.getvalue(), '.jpg', 'image/jpeg', im.width, im.height
    except Exception:
        return None


def _video_ok(f, ext):
    f.seek(0)
    head = f.read(16)
    f.seek(0)
    return head.startswith(b'\x1aE\xdf\xa3') if ext == '.webm' else head[4:8] == b'ftyp'


# ---------------------------------------------------------------- profile: photo and links

def avatar_url(p):
    if not p.avatar:
        return ''
    from .social import username_of
    return f"/api/users/social/avatar/{username_of(p)}/?v={p.avatar_version}"


def clean_links(raw):
    """[{kind, url}] from what was typed (a handle or a link), or an error message"""
    if not isinstance(raw, list):
        return None, "Links are a list"
    out = []
    for item in raw[:MAX_LINKS]:
        if not isinstance(item, dict):
            continue
        kind, value = str(item.get('kind') or ''), str(item.get('url') or item.get('value') or '').strip()
        if not value:
            continue
        if kind not in LINK_KINDS:
            return None, "Unknown link kind"
        label, pattern, hosts = LINK_KINDS[kind]
        if re.match(r'^[a-z][a-z0-9+.-]*:', value, re.I) and not value.lower().startswith(('http://', 'https://')):
            return None, f"{label}: a link starts with https://"
        if value.lower().startswith(('http://', 'https://')) or (not pattern and '.' in value):
            url = value if value.lower().startswith('http') else f"https://{value}"
            host = (urlparse(url).hostname or '').lower()
            if not host or '.' not in host:
                return None, f"{label}: that isn't a link"
            if hosts and not any(host == h or host.endswith('.' + h) for h in hosts):
                return None, f"{label}: the link should be on {hosts[0]}"
            url = 'https://' + url.split('://', 1)[1]
        else:
            handle = value.lstrip('@').strip('/')
            if not pattern or not re.match(r'^[\w.\-]{1,60}$', handle):
                return None, f"{label}: type the link or your @handle"
            url = pattern.format(handle)
        out.append({"kind": kind, "url": url[:300]})
    return out, None


def links_json(p):
    return [{**l, "label": LINK_KINDS.get(l.get("kind"), ("Link",))[0]} for l in (p.links or []) if isinstance(l, dict)]


@api_view(['POST', 'DELETE'])
@parser_classes([MultiPartParser, FormParser])
def my_avatar(request, uid):
    """multipart {file}: your profile photo. DELETE: removes it (your initials again)."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    old = me.avatar
    if request.method == 'DELETE':
        me.avatar = ''
    else:
        f = request.FILES.get('file')
        if not f:
            return Response({"error": "Pick a photo"}, status=status.HTTP_400_BAD_REQUEST)
        if f.size > MAX_AVATAR_BYTES:
            return Response({"error": f"A photo can be up to {MAX_AVATAR_BYTES // (1024 * 1024)} MB"}, status=status.HTTP_400_BAD_REQUEST)
        pic = _reencode(f, 512)
        if not pic:
            return Response({"error": "That photo couldn't be read (JPG, PNG, WebP or GIF)"}, status=status.HTTP_400_BAD_REQUEST)
        data, ext = pic[0], pic[1]
        me.avatar = storage().save(f"avatars/{me.id}_{secrets.token_hex(6)}{ext}", ContentFile(data))
    me.avatar_version += 1
    me.save(update_fields=['avatar', 'avatar_version'])
    if old:
        storage().delete(old)
    return Response({"avatar": avatar_url(me)})


@api_view(['GET'])
def avatar(request, username):
    """Someone's profile photo (everyone may see it)"""
    p = TraderProfile.objects.filter(username=str(username).lower()).only('avatar').first()
    if not p or not p.avatar or not storage().exists(p.avatar):
        return HttpResponse(status=404)
    ext = os.path.splitext(p.avatar)[1]
    r = FileResponse(storage().open(p.avatar, 'rb'), content_type={'.png': 'image/png', '.gif': 'image/gif'}.get(ext, 'image/jpeg'))
    r['Cache-Control'] = 'public, max-age=31536000, immutable'   # (the address changes with each new photo)
    r['X-Content-Type-Options'] = 'nosniff'
    return r


# ---------------------------------------------------------------- posts

def following_ids(viewer):
    return set(Follow.objects.filter(follower=viewer).values_list('following_id', flat=True))


def can_see(post, viewer, following=None):
    if post.owner_id == viewer.id or post.visibility == 'public':
        return True
    following = following if following is not None else following_ids(viewer)
    return post.owner_id in following


def visible_posts(viewer):
    return Post.objects.filter(Q(visibility='public') | Q(owner=viewer) | Q(visibility='followers', owner__followers_set__follower=viewer)).distinct()


def tags_of(caption):
    tags = list(dict.fromkeys(t.lower() for t in HASHTAG_RE.findall(caption or '')))
    return (" " + " ".join(tags) + " ") if tags else ""


def can_comment(post, viewer, following=None):
    if post.comments == 'off':
        return False
    if post.comments == 'followers' and post.owner_id != viewer.id:
        following = following if following is not None else following_ids(viewer)
        return post.owner_id in following
    return can_see(post, viewer, following)


def post_json(p, viewer, following=None):
    from .social import person_json
    return {
        "id": p.id, "caption": p.caption, "visibility": p.visibility, "author": person_json(p.owner), "mine": p.owner_id == viewer.id,
        "created_at": int(p.created_at.timestamp() * 1000), "edited": (p.updated_at - p.created_at).total_seconds() > 5,
        "media": [{"id": m.id, "kind": m.kind, "mime": m.mime, "width": m.width, "height": m.height} for m in p.media.all()],
        "comments_setting": p.comments, "allow_sharing": p.allow_sharing, "can_comment": can_comment(p, viewer, following),
        "likes": p.likes.count(), "liked": p.likes.filter(profile=viewer).exists(),
        "comments": p.comments_set.count() if p.comments != 'off' else 0, "shares": p.shares,
    }


@api_view(['GET', 'POST'])
@parser_classes([MultiPartParser, FormParser, JSONParser])
def posts(request, uid):
    """GET ?q= (words, #hashtag, @author or a name) &author=username &scope=following &before=id: the
    posts you may see, newest first, 24 at a time. POST multipart {caption, visibility, files…}: a post."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'GET':
        qs = visible_posts(me).select_related('owner').prefetch_related('media')
        author = str(request.query_params.get('author') or '').strip().lstrip('@').lower()
        if author:
            qs = qs.filter(owner__username=author)
        if request.query_params.get('scope') == 'following':
            qs = qs.filter(Q(owner__in=following_ids(me)) | Q(owner=me))
        for word in str(request.query_params.get('q') or '').split()[:6]:
            if word.startswith('#') and len(word) > 1:
                qs = qs.filter(tags__icontains=f" {word[1:].lower()} ")
            elif word.startswith('@') and len(word) > 1:
                qs = qs.filter(owner__username__icontains=word[1:].lower())
            else:
                qs = qs.filter(Q(caption__icontains=word) | Q(owner__name__icontains=word) | Q(owner__username__icontains=word.lower()))
        try:
            before = int(request.query_params.get('before') or 0)
        except ValueError:
            before = 0
        if before:
            qs = qs.filter(id__lt=before)
        page = list(qs.order_by('-id')[:PAGE + 1])
        following = following_ids(me)
        return Response({"posts": [post_json(p, me, following) for p in page[:PAGE]], "more": len(page) > PAGE})

    caption = str(request.data.get('caption') or '').strip()[:MAX_CAPTION]
    visibility = str(request.data.get('visibility') or 'public')
    if visibility not in dict(Post.VISIBILITY):
        return Response({"error": "A post is public or for followers only"}, status=status.HTTP_400_BAD_REQUEST)
    files = request.FILES.getlist('files')
    if not files:
        return Response({"error": "Add at least one photo or video"}, status=status.HTTP_400_BAD_REQUEST)
    if len(files) > MAX_FILES:
        return Response({"error": f"A post can have up to {MAX_FILES} photos and videos"}, status=status.HTTP_400_BAD_REQUEST)
    ready = []
    for f in files:
        ext = os.path.splitext(str(f.name or ''))[1].lower()
        if ext in VIDEO_TYPES:
            if f.size > MAX_VIDEO_BYTES:
                return Response({"error": f"Videos can be up to {MAX_VIDEO_BYTES // (1024 * 1024)} MB"}, status=status.HTTP_400_BAD_REQUEST)
            if not _video_ok(f, ext):
                return Response({"error": f"{f.name} couldn't be read as a video (MP4, MOV or WebM)"}, status=status.HTTP_400_BAD_REQUEST)
            ready.append(("video", f, ext, VIDEO_TYPES[ext], None, None))
        elif ext in IMAGE_EXT:
            if f.size > MAX_IMAGE_BYTES:
                return Response({"error": f"Photos can be up to {MAX_IMAGE_BYTES // (1024 * 1024)} MB"}, status=status.HTTP_400_BAD_REQUEST)
            pic = _reencode(f, 2048)
            if not pic:
                return Response({"error": f"{f.name} couldn't be read as a photo"}, status=status.HTTP_400_BAD_REQUEST)
            ready.append(("image", ContentFile(pic[0]), pic[1], pic[2], pic[3], pic[4]))
        else:
            return Response({"error": "Photos (JPG, PNG, WebP, GIF) and videos (MP4, MOV, WebM) can be posted"}, status=status.HTTP_400_BAD_REQUEST)
    comments = str(request.data.get('comments') or 'everyone')
    if comments not in dict(Post.COMMENTS):
        return Response({"error": "Comments are everyone, followers or off"}, status=status.HTTP_400_BAD_REQUEST)
    sharing = str(request.data.get('allow_sharing', 'true')).lower() not in ('false', '0', 'no', 'off')
    post = Post.objects.create(owner=me, caption=caption, visibility=visibility, tags=tags_of(caption)[:600], comments=comments, allow_sharing=sharing)
    st = storage()
    for i, (kind, content, ext, mime, w, h) in enumerate(ready):
        path = st.save(f"{me.id}/{post.id}_{i}_{secrets.token_hex(6)}{ext}", content)
        PostMedia.objects.create(post=post, kind=kind, path=path, mime=mime, width=w, height=h, size=st.size(path), order=i)
    return Response({"post": post_json(post, me)}, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH', 'DELETE'])
def post(request, uid, pid):
    """GET: one post (if you may see it). PATCH {caption?, visibility?, comments?, allow_sharing?} / DELETE: yours."""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    p = Post.objects.filter(id=pid).select_related('owner').first()
    if not p or not can_see(p, me):
        return Response({"error": "That post isn't there, or isn't shared with you"}, status=status.HTTP_404_NOT_FOUND)
    if request.method == 'GET':
        return Response({"post": post_json(p, me)})
    if p.owner_id != me.id:
        return Response({"error": "Only its author can change it"}, status=status.HTTP_403_FORBIDDEN)
    if request.method == 'DELETE':
        st = storage()
        for m in p.media.all():
            st.delete(m.path)
        p.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
    d = request.data
    if 'caption' in d:
        p.caption = str(d.get('caption') or '').strip()[:MAX_CAPTION]
        p.tags = tags_of(p.caption)[:600]
    if 'visibility' in d:
        if d.get('visibility') not in dict(Post.VISIBILITY):
            return Response({"error": "A post is public or for followers only"}, status=status.HTTP_400_BAD_REQUEST)
        p.visibility = d.get('visibility')
    if 'comments' in d:
        if d.get('comments') not in dict(Post.COMMENTS):
            return Response({"error": "Comments are everyone, followers or off"}, status=status.HTTP_400_BAD_REQUEST)
        p.comments = d.get('comments')
    if 'allow_sharing' in d:
        p.allow_sharing = bool(d.get('allow_sharing'))
    p.save()
    return Response({"post": post_json(p, me)})


RANGE_RE = re.compile(r'bytes=(\d*)-(\d*)')


@api_view(['GET'])
def post_media(request, uid, pid, mid):
    """A post's photo or video, for someone who may see the post (videos: byte ranges too)"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    m = PostMedia.objects.filter(id=mid, post_id=pid).select_related('post').first()
    if not m or not can_see(m.post, me):
        return HttpResponse(status=404)
    st = storage()
    if not st.exists(m.path):
        return HttpResponse(status=404)
    size = st.size(m.path)
    rng = RANGE_RE.match(request.headers.get('Range') or '')
    if rng and (rng.group(1) or rng.group(2)):
        if rng.group(1):
            start = int(rng.group(1))
            end = min(int(rng.group(2)) if rng.group(2) else size - 1, size - 1)
        else:
            start, end = max(0, size - int(rng.group(2))), size - 1
        if start > end or start >= size:
            r = HttpResponse(status=416)
            r['Content-Range'] = f'bytes */{size}'
            return r
        fh = st.open(m.path, 'rb')
        fh.seek(start)
        length = end - start + 1

        def chunks(left=length):
            try:
                while left > 0:
                    b = fh.read(min(65536, left))
                    if not b:
                        break
                    left -= len(b)
                    yield b
            finally:
                fh.close()
        r = StreamingHttpResponse(chunks(), status=206, content_type=m.mime)
        r['Content-Range'] = f'bytes {start}-{end}/{size}'
        r['Content-Length'] = str(length)
    else:
        r = FileResponse(st.open(m.path, 'rb'), content_type=m.mime)
        r['Content-Length'] = str(size)
    r['Accept-Ranges'] = 'bytes'
    r['Cache-Control'] = 'private, max-age=86400'
    r['X-Content-Type-Options'] = 'nosniff'
    return r


# ---------------------------------------------------------------- likes and comments

def _visible(request, uid, pid):
    me, denied = require_session(request, uid)
    if denied:
        return None, None, denied
    p = Post.objects.filter(id=pid).select_related('owner').first()
    if not p or not can_see(p, me):
        return None, None, Response({"error": "That post isn't there, or isn't shared with you"}, status=status.HTTP_404_NOT_FOUND)
    return me, p, None


def _excerpt(text, n=60):
    text = ' '.join(str(text or '').split())
    return text if len(text) <= n else text[:n - 1] + '…'


@api_view(['POST', 'DELETE'])
def like(request, uid, pid):
    """Likes the post (DELETE: not any more); the likes now"""
    from .social import notify
    me, p, denied = _visible(request, uid, pid)
    if denied:
        return denied
    if request.method == 'POST':
        from .models import Notification
        _, made = PostLike.objects.get_or_create(post=p, profile=me)
        # (one notice per person and post, however often they like it again)
        if made and not Notification.objects.filter(recipient=p.owner, actor=me, kind='like', data__post=p.id).exists():
            notify(p.owner, me, 'like', f"{me.name} liked your post{': ' + _excerpt(p.caption, 40) if p.caption else ''}", post=p.id)
    else:
        PostLike.objects.filter(post=p, profile=me).delete()
    return Response({"liked": request.method == 'POST', "likes": p.likes.count()})


def comment_json(c, viewer, post):
    from .social import person_json
    return {"id": c.id, "text": c.text, "author": person_json(c.author), "at": int(c.created_at.timestamp() * 1000),
            "can_delete": c.author_id == viewer.id or post.owner_id == viewer.id}


@api_view(['GET', 'POST'])
def comments(request, uid, pid):
    """GET: the comments (oldest first). POST {text}: a comment, if the post's settings let you."""
    from .social import notify
    me, p, denied = _visible(request, uid, pid)
    if denied:
        return denied
    if request.method == 'GET':
        if p.comments == 'off':
            return Response({"comments": [], "can_comment": False, "setting": p.comments})
        qs = p.comments_set.select_related('author')[:500]
        return Response({"comments": [comment_json(c, me, p) for c in qs], "can_comment": can_comment(p, me), "setting": p.comments})
    if not can_comment(p, me):
        return Response({"error": "Comments are off on this post" if p.comments == 'off' else "Only its author's followers can comment"},
                        status=status.HTTP_403_FORBIDDEN)
    text = str(request.data.get('text') or '').strip()[:MAX_COMMENT]
    if not text:
        return Response({"error": "Write a comment"}, status=status.HTTP_400_BAD_REQUEST)
    c = PostComment.objects.create(post=p, author=me, text=text)
    notify(p.owner, me, 'comment', f"{me.name} commented: {_excerpt(text)}", post=p.id)
    return Response({"comment": comment_json(c, me, p), "comments": p.comments_set.count()}, status=status.HTTP_201_CREATED)


@api_view(['DELETE'])
def comment(request, uid, pid, cid):
    """Deletes a comment: yours, or any on your post"""
    me, p, denied = _visible(request, uid, pid)
    if denied:
        return denied
    c = PostComment.objects.filter(id=cid, post=p).first()
    if not c:
        return Response(status=status.HTTP_204_NO_CONTENT)
    if c.author_id != me.id and p.owner_id != me.id:
        return Response({"error": "Only its writer or the post's author can delete it"}, status=status.HTTP_403_FORBIDDEN)
    c.delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- sharing into the site's chats

def post_card(p):
    from .social import person_json
    m = p.media.first()
    return {"type": "post", "post": p.id, "author": person_json(p.owner), "caption": _excerpt(p.caption, 140), "visibility": p.visibility,
            "media": {"id": m.id, "kind": m.kind, "width": m.width, "height": m.height} if m else None, "count": p.media.count()}


def profile_card(t):
    from .social import person_json
    return {"type": "profile", "person": person_json(t), "followers": Follow.objects.filter(following=t).count(),
            "posts": Post.objects.filter(owner=t, visibility='public').count()}


def send_card(me, targets, card, text, note=''):
    """Puts the card into each chat (a personal or group chat: kind group; a collab: kind collab) you're
    in; (sent, problems)"""
    from .collab import message_json, notify_room
    sent, problems = 0, []
    note = str(note or '').strip()[:500]
    body = f"{note}\n{text}" if note else text
    for t in (targets if isinstance(targets, list) else [])[:MAX_SHARE_TARGETS]:
        kind, token = str((t or {}).get('kind') or ''), str((t or {}).get('token') or '')
        if kind == 'group':
            g = ChatGroup.objects.filter(token=token).first()
            if not g or not ChatGroupMember.objects.filter(group=g, profile=me).exists():
                problems.append("a chat you're not in")
                continue
            ChatGroupMessage.objects.create(group=g, author=me, kind='share', text=body, attachment={**card, "note": note})
            ChatGroup.objects.filter(id=g.id).update(updated_at=timezone.now())
        elif kind == 'collab':
            room = CollabRoom.objects.filter(token=token, active=True).first()
            if not room or not CollabMember.objects.filter(room=room, profile=me).exists():
                problems.append("a collab you're not in")
                continue
            msg = CollabMessage.objects.create(room=room, author=me, kind='share', text=body, attachment={**card, "note": note})
            notify_room(room, {"type": "chat.saved", "message": message_json(msg), "exclude": None})
        else:
            problems.append("an unknown chat")
            continue
        sent += 1
    return sent, problems


@api_view(['POST'])
def share_post(request, uid, pid):
    """{targets: [{kind: group|collab, token}], note?}: sends the post into those chats. {link: true}:
    counts a copied link."""
    from .social import notify
    me, p, denied = _visible(request, uid, pid)
    if denied:
        return denied
    if not p.allow_sharing and p.owner_id != me.id:
        return Response({"error": "Its author has turned sharing off for this post"}, status=status.HTTP_403_FORBIDDEN)
    if request.data.get('link'):
        Post.objects.filter(id=p.id).update(shares=models_F('shares') + 1)
        return Response({"shares": Post.objects.get(id=p.id).shares})
    sent, problems = send_card(me, request.data.get('targets'), post_card(p),
                               f"{me.name} shared a post by {p.owner.name}: /p/{p.id}", request.data.get('note'))
    if not sent:
        return Response({"error": "Choose a chat to send it to" if not problems else f"Couldn't send it to {problems[0]}"}, status=status.HTTP_400_BAD_REQUEST)
    Post.objects.filter(id=p.id).update(shares=models_F('shares') + sent)
    notify(p.owner, me, 'share', f"{me.name} shared your post{': ' + _excerpt(p.caption, 40) if p.caption else ''}", post=p.id)
    return Response({"sent": sent, "problems": problems, "shares": Post.objects.get(id=p.id).shares})


@api_view(['POST'])
def share_profile(request, uid, username):
    """{targets, note?}: sends someone's profile into those chats"""
    me, denied = require_session(request, uid)
    if denied:
        return denied
    t = TraderProfile.objects.filter(username=str(username or '').lower()).first()
    if not t:
        return Response({"error": "No one has that username"}, status=status.HTTP_404_NOT_FOUND)
    sent, problems = send_card(me, request.data.get('targets'), profile_card(t), f"{me.name} shared {t.name}'s profile: /u/{t.username}", request.data.get('note'))
    if not sent:
        return Response({"error": "Choose a chat to send it to" if not problems else f"Couldn't send it to {problems[0]}"}, status=status.HTTP_400_BAD_REQUEST)
    return Response({"sent": sent, "problems": problems})


@api_view(['GET'])
def share_targets(request, uid):
    """Your chats to share into: personal chats, group chats and collabs (most recent first)"""
    from .copy_share import _group_name
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
