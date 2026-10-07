"""Who is calling: Firebase ID-token checks for sign-in, and session checks for every per-user
endpoint.

Signing in (sync/) needs a Firebase ID token proving the caller is that user; only then is a
session key registered for them. Every other endpoint that takes a user id needs one of that
user's session keys (query `session_key`, header `X-Session-Key`, or body `session_key`).
"""
from django.conf import settings
from rest_framework import status
from rest_framework.response import Response

from .models import TraderProfile, UserSession

_google_request = None


def verified_uid(id_token):
    """The Firebase user id a valid ID token was issued to, else None"""
    global _google_request
    if not id_token or not isinstance(id_token, str):
        return None
    try:
        from google.oauth2 import id_token as google_id_token
        from google.auth.transport import requests as google_requests
        if _google_request is None:
            _google_request = google_requests.Request()  # caches Google's signing keys
        claims = google_id_token.verify_firebase_token(id_token, _google_request, audience=settings.FIREBASE_PROJECT_ID)
        return claims.get('user_id') or claims.get('sub') if claims else None
    except Exception:
        return None


def session_key_of(request):
    key = request.headers.get('X-Session-Key') or request.query_params.get('session_key')
    if not key and isinstance(getattr(request, 'data', None), dict):
        key = request.data.get('session_key')
    return key


def require_session(request, uid):
    """(profile, None) when the request carries a session of user `uid`, else (None, error response)"""
    try:
        profile = TraderProfile.objects.get(uid=uid)
    except TraderProfile.DoesNotExist:
        return None, Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)
    key = session_key_of(request)
    if not key or not UserSession.objects.filter(user=profile, session_key=key).exists():
        return None, Response({"error": "Session expired or logged out from another device"}, status=status.HTTP_401_UNAUTHORIZED)
    return profile, None


def session_owner(request):
    """The user whose session the request carries (for endpoints addressed by an object id)"""
    key = session_key_of(request)
    if not key:
        return None
    s = UserSession.objects.filter(session_key=key).select_related('user').first()
    return s.user if s else None
