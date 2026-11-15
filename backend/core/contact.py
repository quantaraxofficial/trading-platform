"""The Contact page's form (src/app/contact): POST /api/users/contact/ {name, email, message}. Kept for
Django Admin (Contact messages); a new one shows in the admin's bell and as a toast (core/admin_notices).
Anyone can send one (signed in, it's linked to their profile); a few an hour per address at most."""
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response

from .throttles import ContactThrottle

MAX_NAME, MAX_EMAIL, MAX_MESSAGE = 120, 254, 5000


@api_view(["POST"])
@throttle_classes([ContactThrottle])
def send(request):
    from .auth import session_owner
    from .models import ContactMessage
    data = request.data if isinstance(request.data, dict) else {}
    name = str(data.get("name") or "").strip()
    email = str(data.get("email") or "").strip()
    message = str(data.get("message") or "").strip()
    errors = {}
    if not name:
        errors["name"] = "Please enter your name."
    elif len(name) > MAX_NAME:
        errors["name"] = f"At most {MAX_NAME} characters."
    try:
        if len(email) > MAX_EMAIL:
            raise ValidationError("too long")
        validate_email(email)
    except ValidationError:
        errors["email"] = "Please enter a valid email address."
    if not message:
        errors["message"] = "Please write a message."
    elif len(message) > MAX_MESSAGE:
        errors["message"] = f"At most {MAX_MESSAGE} characters."
    if errors:
        return Response({"ok": False, "errors": errors}, status=400)
    xff = (request.META.get("HTTP_X_FORWARDED_FOR") or "").split(",")[0].strip()
    ContactMessage.objects.create(
        name=name, email=email, message=message, profile=session_owner(request),
        ip=xff or request.META.get("REMOTE_ADDR") or None,
        user_agent=(request.headers.get("User-Agent") or "")[:300],
    )
    return Response({"ok": True})
