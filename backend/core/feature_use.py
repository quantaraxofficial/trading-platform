"""Features used (core/models.FeatureUse): what each person uses on the site and how much, for a
trader profile's page in Django Admin (a pie with the shares) and Site analytics (everyone's). The
site sends the counts with its presence ping (core/presence.py); the ids are src/app/lib/featureUse.ts's."""
from collections import Counter
from zoneinfo import ZoneInfo

from django.db.models import F, Sum
from django.utils import timezone
from django.utils.html import escape

IST = ZoneInfo("Asia/Kolkata")

# id -> what Django Admin calls it
FEATURES = {
    "drawing": "Drawing tools",
    "indicator": "Indicators",
    "chart_type": "Chart types",
    "replay": "Bar replay",
    "backtest_session": "Backtest sessions",
    "collab": "Collab",
    "alert": "Alerts",
    "orders": "Paper trading orders",
    "voice": "Voice assistant",
    "snapshot": "Snapshots",
    "layout": "Layouts saved",
    "watchlist": "Watchlists",
    "calendar": "Economic calendar",
    "analytics": "Analytics page",
    "journal": "Trade journal",
    "pine": "Pine Editor",
    "settings_file": "Settings download / import",
    "background_image": "Background image",
}
MAX_PER_PING = 50       # (one a minute at most per feature: more is junk)


def record(profile, counts, now=None):
    """Adds a ping's {feature: n} for today."""
    if not isinstance(counts, dict):
        return 0
    from .models import FeatureUse
    day = (now or timezone.now()).astimezone(IST).date()
    added = 0
    for feature, n in list(counts.items())[:len(FEATURES)]:
        try:
            n = int(n)
        except (TypeError, ValueError):
            continue
        if feature not in FEATURES or not 0 < n <= MAX_PER_PING:
            continue
        row, _ = FeatureUse.objects.get_or_create(profile=profile, feature=feature, day=day)
        FeatureUse.objects.filter(pk=row.pk).update(count=F("count") + n)
        added += n
    return added


def totals(queryset):
    """[(label, count, percent)] of a FeatureUse queryset, most used first."""
    c = Counter()
    for feature, n in queryset.values_list("feature").annotate(n=Sum("count")):
        c[FEATURES.get(feature, feature)] += n or 0
    total = sum(c.values())
    return [(label, n, round(100 * n / total, 1)) for label, n in c.most_common() if n] if total else []


# ---- the pie (an SVG drawn here, so the admin page needs no chart library)
COLORS = ["#7c3aed", "#2962ff", "#089981", "#f59e0b", "#f23645", "#06b6d4", "#ec4899", "#84cc16",
          "#8b5cf6", "#0ea5e9", "#14b8a6", "#f97316", "#a855f7", "#64748b", "#eab308", "#22c55e", "#e11d48", "#6366f1"]


def pie_svg(rows, size=220, unit="uses"):
    """rows from totals(): an SVG pie (a donut) with each slice's colour in the same order as legend()."""
    import math
    total = sum(n for _, n, _ in rows)
    if not total:
        return ""
    r, cx = size / 2 - 4, size / 2
    inner = r * 0.55
    parts, a0 = [], -math.pi / 2
    if len(rows) == 1:
        parts.append(f'<circle cx="{cx}" cy="{cx}" r="{(r + inner) / 2:.2f}" fill="none" stroke="{COLORS[0]}" stroke-width="{r - inner:.2f}"><title>{escape(rows[0][0])}: {rows[0][1]} (100%)</title></circle>')
    else:
        for i, (label, n, pct) in enumerate(rows):
            a1 = a0 + 2 * math.pi * n / total
            big = 1 if a1 - a0 > math.pi else 0
            p = lambda rr, a: f"{cx + rr * math.cos(a):.2f},{cx + rr * math.sin(a):.2f}"
            d = f"M{p(r, a0)} A{r:.2f},{r:.2f} 0 {big} 1 {p(r, a1)} L{p(inner, a1)} A{inner:.2f},{inner:.2f} 0 {big} 0 {p(inner, a0)} Z"
            parts.append(f'<path d="{d}" fill="{COLORS[i % len(COLORS)]}" stroke="rgba(0,0,0,0.35)" stroke-width="1"><title>{escape(label)}: {n} ({pct}%)</title></path>')
            a0 = a1
    parts.append(f'<text x="{cx}" y="{cx - 2}" text-anchor="middle" font-size="22" font-weight="600" fill="currentColor">{total}</text>')
    parts.append(f'<text x="{cx}" y="{cx + 16}" text-anchor="middle" font-size="11" fill="#888">{unit}</text>')
    return f'<svg viewBox="0 0 {size} {size}" width="{size}" height="{size}" role="img" aria-label="Features used">{"".join(parts)}</svg>'


def pie(rows, unit="uses"):
    """For the templates: the SVG and the legend rows with their colours."""
    return {"svg": pie_svg(rows, unit=unit), "legend": [{"label": l, "count": n, "pct": p, "color": COLORS[i % len(COLORS)]} for i, (l, n, p) in enumerate(rows)],
            "total": sum(n for _, n, _ in rows), "kinds": len(rows), "of": len(FEATURES)}


# ---- a trader profile's page in Django Admin: what they've done on the site

def _made(profile):
    """What they've made or saved (from the site's own data, so it shows for everyone, including
    before features were counted): [(label, count, percent)]."""
    from .models import CollabMember, TradeJournal
    drawings = 0
    for data in profile.drawings.values_list("data", flat=True):
        drawings += len(data) if isinstance(data, list) else 0
    c = [
        ("Drawings", drawings),
        ("Backtest sessions", profile.replay_sessions.count()),
        ("Replays saved", profile.saved_replays.count()),
        ("Strategy backtests", profile.backtest_runs.count()),
        ("Collabs (started or joined)", CollabMember.objects.filter(profile=profile).values("room").distinct().count()),
        ("Pine scripts", profile.pine_scripts.count()),
        ("Journal entries", TradeJournal.objects.filter(owner=profile).count()),
        ("Voice requests noted", profile.voice_requests.count()),
        ("Feedback sent", profile.feedback.count()),
    ]
    total = sum(n for _, n in c)
    return [(l, n, round(100 * n / total, 1)) for l, n in sorted(c, key=lambda x: -x[1]) if n] if total else []


def trader_activity(profile, india, duration, picked=None):
    """The context for templates/admin/core/traderprofile/change_form.html. india(unix seconds) and
    duration(seconds) are the admin's formatters."""
    from .models import FailedRequest, FeatureUse
    uses = FeatureUse.objects.filter(profile=profile)
    first = uses.order_by("day").values_list("day", flat=True).first()
    sessions = [{
        "id": s.id, "name": s.name or s.symbol, "symbol": s.symbol, "interval": s.interval_label or s.interval,
        "status": s.get_status_display(), "spent": duration(s.time_spent), "at": india(s.current_time),
        "balance": (s.account or {}).get("balance") if isinstance(s.account, dict) else None,
        "trades": len((s.book or {}).get("trades") or []) if isinstance(s.book, dict) else 0,
        "updated": timezone.localtime(s.updated_at).strftime("%d %b %Y, %H:%M"),
    } for s in profile.replay_sessions.all()[:100]]
    replays = [{"id": r.id, "symbol": r.symbol, "interval": r.interval, "at": india(r.time), "saved": india((r.saved_at or 0) / 1000)}
               for r in profile.saved_replays.order_by("-saved_at")[:100]]
    failed_qs = FailedRequest.objects.filter(user=profile)
    failed = [{"id": f.id, "when": timezone.localtime(f.created_at).strftime("%d %b %Y, %H:%M"), "source": f.get_source_display(),
               "method": f.method, "path": f.path, "status": f.status_code, "reason": f.reason_code, "message": f.reason_message}
              for f in failed_qs[:50]]
    return {
        "features": pie(totals(uses)), "features_since": first,
        "made": pie(_made(profile), unit="items"),
        "sessions": sessions, "sessions_total": profile.replay_sessions.count(),
        "replays": replays, "replays_total": profile.saved_replays.count(),
        "failed": failed, "failed_total": failed_qs.count(),
        "time": trader_time(profile, picked),
    }


# ---- a trader's time on the site (core/models.SiteTime): the periods, the last 30 days, a picked day

def _days_svg(days, width=640, height=150):
    """days: [{day, open, active}] oldest first: bars of the time open, the active part in green."""
    if not days:
        return ""
    top = max([d["open"] for d in days] + [60])
    n = len(days)
    gap, base = 3, height - 20
    w = (width - gap * (n - 1)) / n
    out = []
    for i, d in enumerate(days):
        x = i * (w + gap)
        h_open = (base - 6) * d["open"] / top
        h_act = (base - 6) * min(d["active"], d["open"]) / top
        tip = f'{d["day"].strftime("%a %d %b")}: {d["open_text"]} open, {d["active_text"]} active'
        out.append(f'<g><title>{escape(tip)}</title>'
                   f'<rect x="{x:.1f}" y="{base - h_open:.1f}" width="{w:.1f}" height="{max(h_open, 0):.1f}" rx="2" fill="#7c3aed" fill-opacity="0.45"/>'
                   f'<rect x="{x:.1f}" y="{base - h_act:.1f}" width="{w:.1f}" height="{max(h_act, 0):.1f}" rx="2" fill="#4ade80"/>'
                   f'<rect x="{x:.1f}" y="0" width="{w:.1f}" height="{base}" fill="transparent"/></g>')
        if i % 5 == 0 or i == n - 1:
            out.append(f'<text x="{x + w / 2:.1f}" y="{height - 4}" text-anchor="middle" font-size="10" fill="#9ca3af">{d["day"].strftime("%d %b")}</text>')
    out.append(f'<line x1="0" y1="{base}" x2="{width}" y2="{base}" stroke="#9ca3af" stroke-opacity="0.4"/>')
    return f'<svg viewBox="0 0 {width} {height}" width="100%" style="max-width:{width}px" role="img" aria-label="Time on the site, the last 30 days">{"".join(out)}</svg>'


def trader_time(profile, picked=None, now=None):
    from datetime import timedelta
    from .models import SiteTime
    from .sitetime import duration
    today = (now or timezone.now()).astimezone(IST).date()
    rows = {r.day: r for r in SiteTime.objects.filter(profile=profile)}
    yesterday = today - timedelta(days=1)

    def cell(label, days):
        o = sum(r.seconds for d, r in rows.items() if days(d))
        a = sum(min(r.active_seconds, r.seconds) for d, r in rows.items() if days(d))
        return {"label": label, "time": duration(o), "active": duration(a), "idle": duration(o - a),
                "pct": round(100 * a / o) if o else None, "seconds": o, "active_seconds": a}

    week, month, year = today - timedelta(days=today.weekday()), today.replace(day=1), today.replace(month=1, day=1)
    cards = [cell("Today", lambda d: d == today), cell("Yesterday", lambda d: d == yesterday), cell("This week", lambda d: d >= week),
             cell("This month", lambda d: d >= month), cell("This year", lambda d: d >= year), cell("All time", lambda d: True)]
    days = []
    for i in range(29, -1, -1):
        d = today - timedelta(days=i)
        r = rows.get(d)
        o, a = (r.seconds, min(r.active_seconds, r.seconds)) if r else (0, 0)
        days.append({"day": d, "open": o, "active": a, "open_text": duration(o), "active_text": duration(a)})
    out = {"cards": cards, "chart": _days_svg(days), "today": today, "days_seen": sum(1 for r in rows.values() if r.seconds),
           "first": min(rows) if rows else None, "picked": None}
    if picked:
        out["picked"] = {"day": picked, **cell(picked.strftime("%a %d %b %Y"), lambda d: d == picked)}
    return out
