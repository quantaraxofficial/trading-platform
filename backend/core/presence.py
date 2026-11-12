"""Who's on the site right now: the app pings every minute while it's open in a visible tab
(POST /api/users/presence/<uid>/ {where: "/chart"}); someone seen in the last ACTIVE_WINDOW is
active now (Django Admin: Trader profiles, the "Active now" filter and the count above the list)."""
from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session
from .models import TraderProfile

ACTIVE_WINDOW = timedelta(minutes=2)


def active_now():
    return TraderProfile.objects.filter(last_seen__gte=timezone.now() - ACTIVE_WINDOW).order_by("-last_seen")


@api_view(["POST"])
def ping(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied
    where = str((request.data or {}).get("where") or "")[:40]
    # (.update: no other field's auto timestamps touched)
    TraderProfile.objects.filter(pk=profile.pk).update(last_seen=timezone.now(), last_where=where)
    return Response({"ok": True})
