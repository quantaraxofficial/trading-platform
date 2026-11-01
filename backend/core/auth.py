"""Who is calling: Firebase ID-token checks for sign-in, and session checks for every per-user
endpoint.

Signing in (sync/) needs a Firebase ID token proving the caller is that user (signature, expiry,
audience and issuer all checked); only then does the server issue a session key, made here with a
cryptographic random generator (never one the browser picked). Every other endpoint that takes a
user id needs one of that user's session keys (header `X-Session-Key`, query `session_key`, or body
`session_key`). A session left unused for SESSION_IDLE_DAYS ends.
"""
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response

from .models import TraderProfile, UserSession

_google_request = None
SESSION_IDLE_DAYS = 30
TOUCH_EVERY = timedelta(hours=1)   # how often a session's last use is written down


def verified_claims(id_token):
    """The claims of a valid Firebase ID token for this project, else None"""
    global _google_request
    if not id_token or not isinstance(id_token, str) or len(id_token) > 4096:
        return None
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        if _google_request is None:
            _google_request = google_requests.Request()  # caches Google's signing keys
        claims = google_id_token.verify_firebase_token(id_token, _google_request, audience=settings.FIREBASE_PROJECT_ID)
    except Exception:
        return None
    if not claims or claims.get('iss') != f"https://securetoken.google.com/{settings.FIREBASE_PROJECT_ID}":
        return None
    if not (claims.get('user_id') or claims.get('sub')):
        return None
    return claims


def verified_uid(id_token):
    """The Firebase user id a valid ID token was issued to, else None"""
    claims = verified_claims(id_token)
    return (claims.get('user_id') or claims.get('sub')) if claims else None


def new_session_key():
    return secrets.token_urlsafe(32)


def session_key_of(request):
    key = request.headers.get('X-Session-Key') or request.query_params.get('session_key')
    if not key and isinstance(getattr(request, 'data', None), dict):
        key = request.data.get('session_key')
    return key if isinstance(key, str) and 0 < len(key) <= 255 else None


def live_session(qs):
    """The session if it's still in use (touching it now and then); an idle one is ended"""
    s = qs.select_related('user').first()
    if not s:
        return None
    now = timezone.now()
    if s.last_active and now - s.last_active > timedelta(days=SESSION_IDLE_DAYS):
        s.delete()
        return None
    if not s.last_active or now - s.last_active > TOUCH_EVERY:
        UserSession.objects.filter(id=s.id).update(last_active=now)
    return s


def require_session(request, uid):
    """(profile, None) when the request carries a session of user `uid`, else (None, error response)"""
    key = session_key_of(request)
    s = live_session(UserSession.objects.filter(user__uid=uid, session_key=key)) if key and uid else None
    if not s:
        # (the same answer whether or not the user exists: ids can't be probed)
        return None, Response({"error": "Session expired or logged out from another device"}, status=status.HTTP_401_UNAUTHORIZED)
    return s.user, None


def session_owner(request):
    """The user whose session the request carries (for endpoints addressed by an object id)"""
    key = session_key_of(request)
    if not key:
        return None
    s = live_session(UserSession.objects.filter(session_key=key))
    return s.user if s else None
