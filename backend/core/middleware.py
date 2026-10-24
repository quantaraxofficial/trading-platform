"""After-response middleware: record every FAILED /api/users/* request so the admin panel
shows why a response did not reach the user.

Only failures (HTTP status >= 400) are stored. The reason is derived from the response
body's `error` field (DRF returns {"error": "..."} on every failure here) and mapped to a
stable `reason_code`. The ingestion endpoint (track-failure/) is excluded so a self-report
can never be recorded as its own failure.

All DB writes are best-effort: a logging failure must never break the real response the
user was about to receive.
"""
from django.utils.deprecation import MiddlewareMixin

from .models import FailedRequest


# The one endpoint we do not track (it IS the tracking sink; a 200 there is never a failure).
_TRACKING_PATH = "/api/users/track-failure/"
_TRACK_PREFIX = "/api/users/"


def get_client_ip(request):
    """The caller's IP: first hop of X-Forwarded-For when present, else REMOTE_ADDR.
    Returns None when the value is not a valid IPv4/IPv6 address, so the
    GenericIPAddressField never receives garbage."""
    import ipaddress
    raw = None
    fwd = request.META.get("HTTP_X_FORWARDED_FOR")
    if fwd:
        raw = fwd.split(",")[0].strip()[:32]
    if not raw:
        raw = request.META.get("REMOTE_ADDR")
    if not raw:
        return None
    try:
        ipaddress.ip_address(raw)
        return raw
    except ValueError:
        return None


def _query_param(request, name):
    """Read a query-string param off any Django request (WSGI or DRF), defensively.

    Django's WSGIRequest does not expose `.QUERY_STRING` as an attribute — it lives in
    `META['QUERY_STRING']`. Fall back to that so the session key passed as `?session_key=`
    (exactly how cloudSync calls the backend) is found in the middleware too."""
    qs = request.META.get("QUERY_STRING") or getattr(request, "QUERY_STRING", "") or ""
    if not qs:
        return None
    from urllib.parse import parse_qs
    vals = parse_qs(qs, keep_blank_values=False).get(name)
    return vals[0] if vals else None


# Known backend error strings (from auth.py / views.py) -> stable reason codes, for quick
# filtering in the admin. Anything unmatched falls back to a class code.
_REASON_BY_MESSAGE = {
    "Session expired or logged out from another device": "session_expired",
    "Sign-in could not be verified": "signin_unverified",
    "User not found": "user_not_found",
    "Symbol is required": "bad_request",
    "session_id is required": "bad_request",
    "Session not found": "not_found",
    "Template not found": "not_found",
    "Script not found": "not_found",
    "text is required": "bad_request",
    "settings must be an object": "bad_request",
    "Cashfree API credentials are not configured. Please add CASHFREE_APP_ID and CASHFREE_SECRET_KEY to your backend .env file.": "cashfree_not_configured",
    "Cashfree authentication failed. Please check if CASHFREE_APP_ID and CASHFREE_SECRET_KEY are valid Sandbox credentials in your backend .env file.": "cashfree_auth_failed",
    "Bot model not loaded on server": "bot_model_not_loaded",
}


def reason_for(status_code: int, error_message: str):
    """(reason_code, reason_message) for a failed response. Prefer the exact known string,
    else fall back to a class code that still tells you the shape of the failure."""
    code = _REASON_BY_MESSAGE.get(error_message)
    if code:
        return code, error_message
    if status_code >= 500:
        return "server_error", error_message or "Internal server error"
    if status_code == 404:
        return "not_found", error_message or "Resource not found"
    if status_code == 401:
        return "session_expired", error_message or "Unauthorized"
    if status_code == 400:
        return "bad_request", error_message or "Bad request"
    return "error", (error_message or f"HTTP {status_code}")[:500]


class FailedRequestMiddleware(MiddlewareMixin):
    def process_response(self, request, response):
        path = request.path or ""
        if not path.startswith(_TRACK_PREFIX) or path.startswith(_TRACKING_PATH):
            return response
        if response.status_code < 400:
            return response
        try:
            # Best effort: the failure record must never break the response it is recording.
            body = getattr(response, "data", None)
            error_message = ""
            if isinstance(body, dict):
                error_message = str(body.get("error") or "")
            elif isinstance(body, str):
                error_message = body
            reason_code, reason_message = reason_for(response.status_code, error_message)

            # Attribute to the user this request was addressed to, when we can.
            # A plain Django WSGIRequest carries the session key in the X-Session-Key header
            # or the session_key query param — read both defensively (no DRF query_params here).
            from .models import TraderProfile
            owner = None
            session_key = (
                request.headers.get("X-Session-Key")
                or request.META.get("HTTP_X_SESSION_KEY")
                or _query_param(request, "session_key")
                or ""
            )
            if session_key:
                from .models import UserSession
                sess = UserSession.objects.filter(session_key=session_key).select_related("user").first()
                owner = sess.user if sess else None
            if owner is None:
                uid = request.resolver_match.kwargs.get("uid") if request.resolver_match else None
                if uid:
                    owner = TraderProfile.objects.filter(uid=uid).first()

            FailedRequest.objects.create(
                user=owner,
                session_key=session_key,
                source=FailedRequest.Source.BACKEND,
                path=path[:300],
                method=request.method[:10],
                status_code=response.status_code,
                reason_code=reason_code,
                reason_message=reason_message,
                user_agent=str(request.headers.get("User-Agent", ""))[:300],
                ip=get_client_ip(request),
            )
        except Exception:
            # Never let tracking take down a real request.
            import logging
            logging.getLogger("core.middleware").exception("FailedRequest recording failed")
        return response

