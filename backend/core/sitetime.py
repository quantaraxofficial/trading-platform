"""Time on the site (Django Admin → Time on site): every trader's time with the site open, today,
this week (from Monday), this month, this year and in all, in Indian time; and each of the last 30
days. Counted by core/presence.py from the once-a-minute pings."""
from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone

from .models import SiteTime
from .presence import IST

PERIODS = [("today", "Today"), ("week", "This week"), ("month", "This month"), ("year", "This year"), ("total", "All time")]


def duration(seconds):
    """3 h 25 min · 12 min · 40 s"""
    s = int(seconds or 0)
    if s < 60:
        return f"{s} s" if s else "—"
    h, m = divmod(s // 60, 60)
    if h >= 72:
        return f"{h:,} h"
    return f"{h} h {m} min" if h else f"{m} min"


def report(sort="today", now=None):
    today = (now or timezone.now()).astimezone(IST).date()
    starts = {"today": today, "week": today - timedelta(days=today.weekday()), "month": today.replace(day=1), "year": today.replace(month=1, day=1)}
    sums = {k: Sum("seconds", filter=Q(day__gte=d)) for k, d in starts.items()}
    people = {f"n_{k}": Count("profile", distinct=True, filter=Q(day__gte=d, seconds__gt=0)) for k, d in starts.items()}
    totals = SiteTime.objects.aggregate(**sums, total=Sum("seconds"), **people, n_total=Count("profile", distinct=True))
    cards = [{"label": label, "time": duration(totals.get(k)), "people": totals.get(f"n_{k}") or 0} for k, label in PERIODS]

    sort = sort if sort in dict(PERIODS) else "today"
    rows = list(SiteTime.objects.values("profile_id", "profile__name", "profile__email")
                .annotate(**sums, total=Sum("seconds")).order_by(f"-{sort}", "-total")[:500])
    for r in rows:
        r["cells"] = [duration(r.get(k)) for k, _ in PERIODS]
        r["avg"] = duration((r.get("month") or 0) / max(1, today.day))

    daily = {r["day"]: r for r in SiteTime.objects.filter(day__gt=today - timedelta(days=30))
             .values("day").annotate(s=Sum("seconds"), n=Count("profile", distinct=True))}
    top = max([r["s"] or 0 for r in daily.values()] + [1])
    days = []
    for i in range(29, -1, -1):
        d = today - timedelta(days=i)
        r = daily.get(d, {"s": 0, "n": 0})
        days.append({"day": d, "time": duration(r["s"]), "people": r["n"], "bar": int((r["s"] or 0) / top * 100)})
    return {"cards": cards, "rows": rows, "periods": PERIODS, "sort": sort, "days": days, "today": today}
