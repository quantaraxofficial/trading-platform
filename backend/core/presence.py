"""Who's on the site right now: the app pings every minute while it's open in a visible tab
(POST /api/users/presence/<uid>/ {where: "/chart"}); someone seen in the last ACTIVE_WINDOW is
active now (Django Admin: Trader profiles, the "Active now" filter and the count above the list)."""
from datetime import timedelta

from django.utils import timezone
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .auth import require_session
from zoneinfo import ZoneInfo

from django.db.models import F

from .models import SiteTime, TraderProfile

IST = ZoneInfo("Asia/Kolkata")

ACTIVE_WINDOW = timedelta(minutes=2)


def active_now():
    return TraderProfile.objects.filter(last_seen__gte=timezone.now() - ACTIVE_WINDOW).order_by("-last_seen")


@api_view(["POST"])
def ping(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied
    where = str((request.data or {}).get("where") or "")[:40]
    now = timezone.now()
    # (.update: no other field's auto timestamps touched)
    TraderProfile.objects.filter(pk=profile.pk).update(last_seen=now, last_where=where)
    count_time(profile, profile.last_seen, now)
    # who's on the site, per 5 minutes (Django Admin → Site analytics)
    from .traffic import note_presence
    note_presence(profile, now, where)
    return Response({"ok": True})


# Pings come every minute while the site is open in a visible tab: the time since the previous one is
# time on the site (at most MAX_GAP: a longer gap means it was closed or hidden in between)
MAX_GAP = 150


def count_time(profile, previous, now):
    if not previous:
        return
    gap = (now - previous).total_seconds()
    if not 0 < gap <= MAX_GAP:
        return
    day = now.astimezone(IST).date()
    row, _ = SiteTime.objects.get_or_create(profile=profile, day=day)
    SiteTime.objects.filter(pk=row.pk).update(seconds=F("seconds") + int(round(gap)))
