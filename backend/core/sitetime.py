"""Time on the site (Django Admin → Time on site): every trader's time with the site open, today,
this week (from Monday), this month, this year and in all, in Indian time; and each of the last 30
days. Counted by core/presence.py from the once-a-minute pings."""
from datetime import timedelta

from django.db.models import Count, Q, Sum
from django.utils import timezone

from .models import SiteTime
from .presence import IST

PERIODS = [("today", "Today"), ("yesterday", "Yesterday"), ("week", "This week"), ("month", "This month"), ("year", "This year"), ("total", "All time")]


def duration(seconds):
    """3 h 25 min · 12 min · 40 s"""
    s = int(seconds or 0)
    if s < 60:
        return f"{s} s" if s else "—"
    h, m = divmod(s // 60, 60)
    if h >= 72:
        return f"{h:,} h"
    return f"{h} h {m} min" if h else f"{m} min"


def _cell(open_s, active_s):
    """A period's time: open, and how much of it they were using the site (active) vs only had it open"""
    open_s, active_s = int(open_s or 0), min(int(active_s or 0), int(open_s or 0))
    return {"time": duration(open_s), "active": duration(active_s), "idle": duration(open_s - active_s),
            "pct": round(100 * active_s / open_s) if open_s else None, "seconds": open_s, "active_seconds": active_s}


def parse_day(text):
    from datetime import date
    try:
        return date.fromisoformat(str(text or "")[:10])
    except ValueError:
        return None


def report(sort="today", now=None, picked=None):
    """picked: a day (a date) to see too, as a column and a card"""
    today = (now or timezone.now()).astimezone(IST).date()
    yesterday = today - timedelta(days=1)
    when = {"today": Q(day__gte=today), "yesterday": Q(day=yesterday),
            "week": Q(day__gte=today - timedelta(days=today.weekday())), "month": Q(day__gte=today.replace(day=1)),
            "year": Q(day__gte=today.replace(month=1, day=1)), "total": Q()}
    periods = list(PERIODS)
    if picked and picked not in (today, yesterday):
        when["picked"] = Q(day=picked)
        periods.insert(2, ("picked", picked.strftime("%a %d %b %Y")))
    elif picked:
        # (today and yesterday have their own columns)
        if sort == "picked":
            sort = "today" if picked == today else "yesterday"
        picked = None
    sums = {}
    for k, q in when.items():
        sums[k] = Sum("seconds", filter=q) if k != "total" else Sum("seconds")
        sums[f"a_{k}"] = Sum("active_seconds", filter=q) if k != "total" else Sum("active_seconds")
    people = {f"n_{k}": Count("profile", distinct=True, filter=q & Q(seconds__gt=0)) for k, q in when.items()}
    totals = SiteTime.objects.aggregate(**sums, **people)
    cards = [{"key": k, "label": label, **_cell(totals.get(k), totals.get(f"a_{k}")), "people": totals.get(f"n_{k}") or 0} for k, label in periods]

    sort = sort if sort in dict(periods) else "today"
    rows = list(SiteTime.objects.values("profile_id", "profile__name", "profile__email")
                .annotate(**sums).order_by(f"-{sort}", "-total")[:500])
    for r in rows:
        r["cells"] = [{"key": k, **_cell(r.get(k), r.get(f"a_{k}"))} for k, _ in periods]
        r["avg"] = duration((r.get("month") or 0) / max(1, today.day))

    daily = {r["day"]: r for r in SiteTime.objects.filter(day__gt=today - timedelta(days=30))
             .values("day").annotate(s=Sum("seconds"), a=Sum("active_seconds"), n=Count("profile", distinct=True))}
    top = max([r["s"] or 0 for r in daily.values()] + [1])
    days = []
    for i in range(29, -1, -1):
        d = today - timedelta(days=i)
        r = daily.get(d, {"s": 0, "a": 0, "n": 0})
        c = _cell(r["s"], r["a"])
        days.append({"day": d, **c, "people": r["n"], "bar": int((r["s"] or 0) / top * 100),
                     "bar_active": int(min(r["a"] or 0, r["s"] or 0) / top * 100)})
    # (active time is counted from when it was added: before, a day has none)
    since = SiteTime.objects.filter(active_seconds__gt=0).order_by("day").values_list("day", flat=True).first()
    return {"cards": cards, "rows": rows, "periods": periods, "sort": sort, "days": days, "today": today,
            "yesterday": yesterday, "picked": picked, "picked_iso": picked.isoformat() if picked else "", "active_since": since}
