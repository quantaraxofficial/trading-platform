"""Django Admin → Site analytics: what the dashboard shows, as JSON, refreshed live by the page
(templates/admin/core/site_analytics.html): live() every 10 s, report(days) every minute.

Where it comes from: who's on the site per 5 minutes and the pages they're on (TrafficSlot, from the
presence pings), the server minute by minute (ServerMinute: requests, response times, errors, live
connections, load, memory: core/traffic.py), time on site per day (SiteTime), sign-ups (TraderProfile),
devices (UserSession: the browser at sign-in), and what people make (backtest sessions, collabs,
scripts…). Times are India's."""
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone as dt_timezone
from zoneinfo import ZoneInfo

from django.db.models import Count, Max, Sum
from django.utils import timezone

from . import traffic
from .models import (BacktestRun, ChartState, CollabMessage, CollabRoom, FailedRequest, FeedbackMessage, PineScript,
                     ReplaySession, SavedReplay, ServerMinute, SiteTime, TradeJournal, TraderProfile, TrafficSlot, UserSession,
                     Payment, Post, PostComment, ChatGroupMessage, CopyChannel, CopySignal, BrokerAccount, OptimizerRun,
                     Visitor, VisitorSlot, EndpointMinute)

IST = ZoneInfo("Asia/Kolkata")
SLOT = traffic.SLOT_SECONDS
DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")


def _ms(dt):
    return int(dt.timestamp() * 1000)


def _floor_slot(dt):
    return traffic.slot_of(dt)


def _ist(dt):
    return dt.astimezone(IST)


# ------------------------------------------------------------------ live (every 10 s)

def live(now=None):
    now = now or timezone.now()
    from .presence import ACTIVE_WINDOW
    active = list(TraderProfile.objects.filter(last_seen__gte=now - ACTIVE_WINDOW).order_by("-last_seen")
                  .values("name", "email", "last_where", "last_seen")[:200])
    where = Counter((a["last_where"] or "/").split("?")[0] or "/" for a in active)
    cur = traffic.current()
    # the last hour, minute by minute (written minutes, then this one so far)
    hour_ago = now - timedelta(hours=1)
    minutes = {_ms(r["minute"]): r for r in ServerMinute.objects.filter(minute__gte=hour_ago)
               .values("minute", "requests", "avg_ms", "load_pct", "mem_pct", "ws_collab", "ws_ticks")}
    start = (int(hour_ago.timestamp()) // 60 + 1) * 60
    per_minute = []
    this_minute = int(now.timestamp()) // 60 * 60
    for t in range(start, this_minute + 1, 60):
        r = minutes.get(t * 1000)
        if t == this_minute:
            per_minute.append([t * 1000, cur["requests"], cur["avg_ms"], cur["load_pct"], cur["mem_pct"]])
        else:
            per_minute.append([t * 1000, r["requests"] if r else 0, r["avg_ms"] if r else None,
                               r["load_pct"] if r else None, r["mem_pct"] if r else None])
    # on the site, per 5 minutes, the last 2 hours
    since = _floor_slot(now - timedelta(hours=2))
    counts = dict(TrafficSlot.objects.filter(slot__gte=since).values_list("slot").annotate(n=Count("id")))
    on_site = []
    t = since
    while t <= now:
        on_site.append([_ms(t), counts.get(t, 0)])
        t += timedelta(seconds=SLOT)
    from .presence import ACTIVE_WINDOW as _W
    visitors_now = Visitor.objects.filter(last_seen__gte=now - _W, profile__isnull=True).count()
    v_counts = dict(VisitorSlot.objects.filter(slot__gte=since).values_list("slot").annotate(n=Count("id")))
    return {
        "at": _ms(now),
        "visitors_now": visitors_now,
        "visitors_on_site": [[p[0], v_counts.get(datetime.fromtimestamp(p[0] / 1000, tz=dt_timezone.utc), 0)] for p in on_site],
        "active_now": len(active),
        "active": [{"name": a["name"] or a["email"].split("@")[0], "where": a["last_where"] or "/",
                    "ago": int((now - a["last_seen"]).total_seconds())} for a in active[:12]],
        "pages_now": where.most_common(8),
        "requests_this_minute": cur["requests"], "avg_ms": cur["avg_ms"], "errors_this_minute": cur["errors"],
        "ws": {"collab": cur["ws_collab"], "ticks": cur["ws_ticks"]},
        "load_pct": cur["load_pct"], "mem_pct": cur["mem_pct"], "cpus": cur["cpus"],
        "per_minute": per_minute, "on_site": on_site,
    }


# ------------------------------------------------------------------ the period (every minute)

def _device(ua):
    u = (ua or "").lower()
    if not u:
        return "Unknown", "Unknown", "Unknown"
    kind = "Tablet" if ("ipad" in u or ("android" in u and "mobile" not in u)) else "Mobile" if ("mobi" in u or "iphone" in u) else "Desktop"
    browser = ("Edge" if "edg/" in u else "Opera" if ("opr/" in u or "opera" in u) else "Samsung Internet" if "samsungbrowser" in u
               else "Firefox" if ("firefox" in u or "fxios" in u) else "Chrome" if ("chrome" in u or "crios" in u)
               else "Safari" if "safari" in u else "Other")
    os_ = ("iOS" if ("iphone" in u or "ipad" in u) else "Android" if "android" in u else "Windows" if "windows" in u
           else "macOS" if "mac os" in u else "Linux" if "linux" in u else "Other")
    return kind, browser, os_


def report(days=30, now=None):
    now = now or timezone.now()
    days = max(1, min(int(days), 365))
    since = now - timedelta(days=days)
    today = _ist(now).date()
    first_day = today - timedelta(days=days - 1)

    # ---- traffic: people on the site at once (5-minute slots)
    slot_counts = dict(TrafficSlot.objects.filter(slot__gte=since).values_list("slot").annotate(n=Count("id")))
    first_slot = min(slot_counts) if slot_counts else None

    # the last 48 hours, every 5 minutes
    s48 = _floor_slot(now - timedelta(hours=48))
    concurrent_48h, t = [], s48
    while t <= now:
        concurrent_48h.append([_ms(t), slot_counts.get(t, 0) if since <= t else 0])
        t += timedelta(seconds=SLOT)

    # weekday × hour: on average (and at most) how many at once
    cell_sum, cell_max = defaultdict(int), defaultdict(int)
    hour_peak = defaultdict(int)          # each clock hour's peak (for the capacity scatter)
    day_peak = defaultdict(int)
    for slot, n in slot_counts.items():
        li = _ist(slot)
        key = (li.weekday(), li.hour)
        cell_sum[key] += n
        cell_max[key] = max(cell_max[key], n)
        hour_peak[slot.replace(minute=0, second=0, microsecond=0)] = max(hour_peak[slot.replace(minute=0, second=0, microsecond=0)], n)
        day_peak[li.date()] = max(day_peak[li.date()], n)
    occurrences = defaultdict(int)
    if first_slot:
        h = _ist(max(since, first_slot)).replace(minute=0, second=0, microsecond=0)
        end = _ist(now)
        while h <= end:
            occurrences[(h.weekday(), h.hour)] += 1
            h += timedelta(hours=1)
    heatmap = [[round(cell_sum[(d, hr)] / (12 * occurrences[(d, hr)]), 2) if occurrences[(d, hr)] else 0 for hr in range(24)] for d in range(7)]
    heatmap_peak = [[cell_max[(d, hr)] for hr in range(24)] for d in range(7)]
    busiest = sorted(((heatmap[d][hr], d, hr) for d in range(7) for hr in range(24) if heatmap[d][hr] > 0), reverse=True)[:6]

    # ---- the server: per hour (last 48 h) and per day
    minutes = list(ServerMinute.objects.filter(minute__gte=since)
                   .values("minute", "requests", "errors", "avg_ms", "max_ms", "ws_collab", "ws_ticks", "load_pct", "mem_pct"))
    hourly = defaultdict(lambda: {"req": 0, "mins": 0, "req_max": 0, "ms_w": 0.0, "ms_max": 0.0, "load": None, "mem": None, "ws": 0, "err": 0})
    daily_srv = defaultdict(lambda: {"req": 0, "err": 0, "load": None, "mem": None, "ws": 0, "ms_w": 0.0})
    for m in minutes:
        hk = m["minute"].replace(minute=0, second=0, microsecond=0)
        hb = hourly[hk]
        hb["req"] += m["requests"]
        hb["mins"] += 1
        hb["req_max"] = max(hb["req_max"], m["requests"])
        hb["ms_w"] += m["avg_ms"] * m["requests"]
        hb["ms_max"] = max(hb["ms_max"], m["max_ms"])
        hb["err"] += m["errors"]
        hb["ws"] = max(hb["ws"], m["ws_collab"] + m["ws_ticks"])
        for k, f in (("load", "load_pct"), ("mem", "mem_pct")):
            if m[f] is not None:
                hb[k] = max(hb[k] or 0, m[f])
        db = daily_srv[_ist(m["minute"]).date()]
        db["req"] += m["requests"]
        db["err"] += m["errors"]
        db["ms_w"] += m["avg_ms"] * m["requests"]
        db["ws"] = max(db["ws"], m["ws_collab"] + m["ws_ticks"])
        for k, f in (("load", "load_pct"), ("mem", "mem_pct")):
            if m[f] is not None:
                db[k] = max(db[k] or 0, m[f])
    h48 = now.replace(minute=0, second=0, microsecond=0) - timedelta(hours=47)
    server_48h = []
    for i in range(48):
        hk = h48 + timedelta(hours=i)
        hb = hourly.get(hk)
        server_48h.append({"t": _ms(hk), "req_per_min": round(hb["req"] / max(1, hb["mins"]), 1) if hb else 0,
                           "req_max": hb["req_max"] if hb else 0, "avg_ms": round(hb["ms_w"] / hb["req"], 1) if hb and hb["req"] else None,
                           "max_ms": round(hb["ms_max"], 1) if hb else None, "load": hb["load"] if hb else None,
                           "mem": hb["mem"] if hb else None, "ws": hb["ws"] if hb else 0})
    # users at once vs the machine's load, per hour: how load grows with people (capacity)
    capacity_points = [[hour_peak[hk], hourly[hk]["load"]] for hk in hour_peak if hk in hourly and hourly[hk]["load"] is not None]

    # ---- people: active per day (time on site), new, returning
    st = list(SiteTime.objects.filter(day__gte=first_day).values("day", "profile_id", "seconds"))
    created = dict(TraderProfile.objects.values_list("id", "created_at"))
    active_by_day = defaultdict(set)
    for r in st:
        active_by_day[r["day"]].add(r["profile_id"])
    signups = Counter(_ist(c).date() for c in created.values() if c and _ist(c).date() >= first_day)
    daily = []
    for i in range(days):
        d = first_day + timedelta(days=i)
        act = active_by_day.get(d, set())
        new = sum(1 for p in act if created.get(p) and _ist(created[p]).date() == d)
        srv = daily_srv.get(d)
        daily.append({"d": d.isoformat(), "active": len(act), "new_active": new, "returning": len(act) - new,
                      "signups": signups.get(d, 0), "peak": day_peak.get(d, 0),
                      "requests": srv["req"] if srv else 0, "errors": srv["err"] if srv else 0,
                      "load": srv["load"] if srv else None, "mem": srv["mem"] if srv else None, "ws": srv["ws"] if srv else 0,
                      "avg_ms": round(srv["ms_w"] / srv["req"], 1) if srv and srv["req"] else None})

    def active_since(n_days):
        return SiteTime.objects.filter(day__gte=today - timedelta(days=n_days - 1)).values("profile_id").distinct().count()

    dau, wau, mau = active_since(1), active_since(7), active_since(30)

    # time on site: per active day, the spread and the people who spend the most
    minutes_per_day = [r["seconds"] / 60 for r in st if r["seconds"] > 0]
    edges = [(0, 5, "< 5 min"), (5, 15, "5–15"), (15, 30, "15–30"), (30, 60, "30–60"), (60, 120, "1–2 h"), (120, 240, "2–4 h"), (240, 10 ** 9, "4 h +")]
    time_hist = [[label, sum(1 for m in minutes_per_day if lo <= m < hi)] for lo, hi, label in edges]
    top_ids = Counter()
    for r in st:
        top_ids[r["profile_id"]] += r["seconds"]
    names = {p["id"]: p["name"] or p["email"].split("@")[0] for p in TraderProfile.objects.filter(id__in=[i for i, _ in top_ids.most_common(10)]).values("id", "name", "email")}
    top_users = [[names.get(i, "?"), round(s / 3600, 1), len({r["day"] for r in st if r["profile_id"] == i})] for i, s in top_ids.most_common(10)]

    # weekly cohorts: of those who signed up in a week, how many were on the site N weeks later
    week0 = today - timedelta(days=today.weekday())
    cohorts = []
    all_days = defaultdict(set)
    for r in SiteTime.objects.filter(day__gte=week0 - timedelta(weeks=8)).values("profile_id", "day"):
        all_days[r["profile_id"]].add(r["day"])
    for w in range(7, -1, -1):
        start = week0 - timedelta(weeks=w)
        members = [p for p, c in created.items() if c and start <= _ist(c).date() < start + timedelta(days=7)]
        row = []
        for k in range(w + 1):
            ws, we = start + timedelta(weeks=k), start + timedelta(weeks=k, days=7)
            back = sum(1 for p in members if any(ws <= d < we for d in all_days.get(p, ())))
            row.append(round(100 * back / len(members)) if members else None)
        cohorts.append({"week": start.isoformat(), "size": len(members), "weeks": row})

    # the path from sign-up to paying (people who signed up in the period)
    cohort = [p for p, c in created.items() if c and c >= since]
    seen_days = defaultdict(set)
    for r in SiteTime.objects.filter(profile_id__in=cohort).values("profile_id", "day"):
        seen_days[r["profile_id"]].add(r["day"])
    made = set(ReplaySession.objects.filter(owner_id__in=cohort).values_list("owner_id", flat=True)) \
        | set(CollabRoom.objects.filter(owner_id__in=cohort).values_list("owner_id", flat=True)) \
        | set(PineScript.objects.filter(owner_id__in=cohort).values_list("owner_id", flat=True)) \
        | set(BacktestRun.objects.filter(owner_id__in=cohort).values_list("owner_id", flat=True))
    paid = set(Payment.objects.filter(profile_id__in=cohort).values_list("profile_id", flat=True))
    funnel = [["Signed up", len(cohort)], ["Used the site", sum(1 for p in cohort if seen_days.get(p))],
              ["Came back another day", sum(1 for p in cohort if len(seen_days.get(p, ())) >= 2)],
              ["Built something", sum(1 for p in cohort if p in made)], ["Paid", sum(1 for p in cohort if p in paid)]]

    # ---- what they use
    where = Counter()
    for w_, n in TrafficSlot.objects.filter(slot__gte=since).values_list("where").annotate(n=Count("id")):
        where[(w_ or "/").split("?")[0] or "/"] += n
    pages = [[k, round(v * SLOT / 3600, 1)] for k, v in where.most_common(8)]          # hours spent there
    symbols = [[s or "?", n] for s, n in ChartState.objects.values_list("symbol").annotate(n=Count("id")).order_by("-n")[:8]]
    intervals = [[s or "?", n] for s, n in ChartState.objects.values_list("interval").annotate(n=Count("id")).order_by("-n")[:8]]
    saved_since = int(since.timestamp() * 1000)
    features = [
        ["Backtest sessions", ReplaySession.objects.filter(created_at__gte=since).count()],
        ["Strategy backtests saved", BacktestRun.objects.filter(created_at__gte=since).count()],
        ["Replays saved", SavedReplay.objects.filter(saved_at__gte=saved_since).count()],
        ["Collabs started", CollabRoom.objects.filter(created_at__gte=since).count()],
        ["Collab chat messages", CollabMessage.objects.filter(created_at__gte=since, kind="text").count()],
        ["Pine scripts saved", PineScript.objects.filter(created_at__gte=since).count()],
        ["Journal entries", TradeJournal.objects.filter(updated_at__gte=since).count()],
        ["Feedback sent", FeedbackMessage.objects.filter(created_at__gte=since).count()],
        ["Posts", Post.objects.filter(created_at__gte=since).count()],
        ["Post comments", PostComment.objects.filter(created_at__gte=since).count()],
        ["Group chat messages", ChatGroupMessage.objects.filter(created_at__gte=since).count()],
        ["Copy channels started", CopyChannel.objects.filter(created_at__gte=since).count()],
        ["Copy signals sent", CopySignal.objects.filter(created_at__gte=since).count()],
        ["Broker accounts linked", BrokerAccount.objects.filter(created_at__gte=since).count()],
        ["Optimizer runs", OptimizerRun.objects.filter(created_at__gte=since).count()],
    ]
    devices, browsers, systems = Counter(), Counter(), Counter()
    for ua in UserSession.objects.values_list("device_info", flat=True):
        k, b, o = _device(ua)
        devices[k] += 1
        browsers[b] += 1
        systems[o] += 1
    tiers = [[t or "free", n] for t, n in TraderProfile.objects.values_list("tier").annotate(n=Count("id")).order_by("-n")]
    # (merge: payments, not subscriptions: who paid in the last 31 days)
    paying_now = Payment.objects.filter(paid_at__gte=now - timedelta(days=31), profile__isnull=False).values("profile_id").distinct().count()
    failing = [[p, n] for p, n in FailedRequest.objects.filter(created_at__gte=since).values_list("path").annotate(n=Count("id")).order_by("-n")[:6]]

    # ---- the period before, for growth
    prev_since = since - timedelta(days=days)
    signups_now = sum(1 for c in created.values() if c and c >= since)
    signups_prev = sum(1 for c in created.values() if c and prev_since <= c < since)
    active_prev = SiteTime.objects.filter(day__gte=first_day - timedelta(days=days), day__lt=first_day).values("profile_id").distinct().count()
    active_period = len({r["profile_id"] for r in st})

    peak_now = max(slot_counts.values()) if slot_counts else 0
    max_load = max((m["load_pct"] for m in minutes if m["load_pct"] is not None), default=None)
    max_mem = max((m["mem_pct"] for m in minutes if m["mem_pct"] is not None), default=None)
    total_req = sum(m["requests"] for m in minutes)
    total_err = sum(m["errors"] for m in minutes)

    out = {
        "days": days, "at": _ms(now), "tracking_since": _ms(first_slot) if first_slot else None,
        "kpis": {"users": len(created), "signups": signups_now, "signups_prev": signups_prev, "dau": dau, "wau": wau, "mau": mau,
                 "active": active_period, "active_prev": active_prev, "peak_concurrent": peak_now,
                 "avg_minutes": round(sum(minutes_per_day) / len(minutes_per_day), 1) if minutes_per_day else 0,
                 "requests": total_req, "error_rate": round(100 * total_err / total_req, 2) if total_req else 0,
                 "max_load": max_load, "max_mem": max_mem, "paying_now": paying_now},
        "concurrent_48h": concurrent_48h, "heatmap": heatmap, "heatmap_peak": heatmap_peak,
        "busiest": [{"day": DAYS[d], "hour": hr, "avg": v, "peak": heatmap_peak[d][hr]} for v, d, hr in busiest],
        "server_48h": server_48h, "daily": daily, "capacity_points": capacity_points,
        "time_hist": time_hist, "top_users": top_users, "cohorts": cohorts, "funnel": funnel,
        "pages": pages, "symbols": symbols, "intervals": intervals, "features": features,
        "devices": devices.most_common(), "browsers": browsers.most_common(6), "systems": systems.most_common(6),
        "tiers": tiers, "failing": failing,
    }
    out["capacity"] = _capacity(capacity_points, traffic.current().get("cpus"))
    out["visitors"] = _visitors(since, first_day, days, now)
    out["not_premium"] = _not_premium(now)
    out["at_risk"] = _at_risk(today)
    out["endpoints"] = _endpoints(since)
    out["insights"] = _insights(out)
    return out


def _capacity(points, cpus):
    """How load grows with people on the site (a straight line through the hourly points), and how
    many at once would bring the machine to 70 % load"""
    pts = [(u, l) for u, l in points if u > 0 and l is not None]
    if len(pts) < 6 or len({u for u, _ in pts}) < 3:
        return {"enough": False, "cpus": cpus}
    n = len(pts)
    mx = sum(u for u, _ in pts) / n
    my = sum(l for _, l in pts) / n
    sxx = sum((u - mx) ** 2 for u, _ in pts)
    slope = sum((u - mx) * (l - my) for u, l in pts) / sxx if sxx else 0
    base = my - slope * mx
    users_at_70 = int((70 - base) / slope) if slope > 0.01 else None
    return {"enough": True, "cpus": cpus, "base": round(base, 1), "per_user": round(slope, 2), "users_at_70": users_at_70}


def _insights(r):
    k, out = r["kpis"], []
    if r["busiest"]:
        b = r["busiest"][0]
        out.append(("traffic", f"Busiest time: {b['day']} {b['hour']:02d}:00–{(b['hour'] + 1) % 24:02d}:00 IST, {b['avg']:.1f} people on the site at once on average (up to {b['peak']})."))
        quiet = [(v, d, h) for d, row in enumerate(r["heatmap"]) for h, v in enumerate(row)]
        if quiet:
            v, d, h = min(quiet)
            out.append(("traffic", f"Quietest: {DAYS[d]} {h:02d}:00 IST — the time for deploys, backups and maintenance."))
    else:
        out.append(("traffic", "Traffic is recorded from now on (people on the site every 5 minutes, the server every minute): the busy-hour charts fill in over the next days."))
    if k["max_load"] is not None:
        level = "critical" if k["max_load"] >= 85 or (k["max_mem"] or 0) >= 90 else "warning" if k["max_load"] >= 70 or (k["max_mem"] or 0) >= 80 else "good"
        text = {"critical": "The VM ran near its limit — scale up (more CPU / memory) or move ClickHouse to its own machine.",
                "warning": "The VM gets busy at peaks — plan a bigger machine before traffic grows much more.",
                "good": "The VM has room to spare at the busiest times."}[level]
        out.append((level, f"Highest load {k['max_load']:.0f}% of the CPUs, memory up to {k['max_mem'] or 0:.0f}%. {text}"))
    cap = r["capacity"]
    if cap.get("enough") and cap.get("users_at_70"):
        out.append(("capacity", f"Each person on the site adds about {cap['per_user']}% CPU load on top of a base of {cap['base']}%: about {cap['users_at_70']} people at once would bring the VM to 70%."))
    if k["signups_prev"] or k["signups"]:
        change = (k["signups"] - k["signups_prev"]) / k["signups_prev"] * 100 if k["signups_prev"] else None
        out.append(("growth", f"{k['signups']} sign-ups in these {r['days']} days" + (f" ({change:+.0f}% on the {r['days']} days before)." if change is not None else ".")))
    if k["mau"]:
        out.append(("engagement", f"Stickiness (daily ÷ monthly active): {100 * k['dau'] / k['mau']:.0f}% — above 20% is good for a tool people use daily."))
    if r["pages"]:
        out.append(("usage", f"Most time is spent on {r['pages'][0][0]} ({r['pages'][0][1]} h in the period)."))
    mobile = dict(r["devices"]).get("Mobile", 0)
    total_dev = sum(n for _, n in r["devices"])
    if total_dev:
        out.append(("devices", f"{100 * mobile / total_dev:.0f}% of sign-ins are on phones."))
    v = r.get("visitors") or {}
    if v.get("new"):
        best = max(v.get("referrers") or [["", 0, 0, 0]], key=lambda x: (x[2], x[1]))
        out.append(("visitors", f"{v['new']} new visitors, {v['signed_up']} signed up ({v['conversion']}%)"
                    + (f"; most sign-ups came from {best[0]} ({best[2]})." if best[2] else ".")))
    npm = r.get("not_premium") or {}
    if npm.get("active_14d"):
        out.append(("plans", f"{npm['active_14d']} people without premium used the site in the last 14 days — the ones to offer it to."))
    ar = r.get("at_risk") or {}
    if ar.get("count"):
        out.append(("warning", f"{ar['count']} people who used to come often haven't been back for {ar['away_days']}+ days — reach out to them (list below)."))
    ep = r.get("endpoints") or []
    if ep and ep[0]["share"] >= 20:
        out.append(("server", f"{ep[0]['method']} {ep[0]['route']} takes {ep[0]['share']}% of the server's time ({ep[0]['n']} requests, {ep[0]['avg_ms']:.0f} ms each): speed it up first."))
    if k["error_rate"] >= 1:
        out.append(("warning", f"{k['error_rate']}% of requests failed with a server error — see the failing endpoints."))
    return [{"kind": a, "text": b} for a, b in out]


# ------------------------------------------------------------------ visitors, plans, at risk, endpoints

def _premium_ids(now):
    """The accounts that count as premium: (merge) paid in the last 31 days or on a paid tier"""
    paid = set(Payment.objects.filter(paid_at__gte=now - timedelta(days=31), profile__isnull=False).values_list("profile_id", flat=True))
    return paid | set(TraderProfile.objects.exclude(tier="free").values_list("pk", flat=True))


def _visitors(since, first_day, days, now):
    """Signed-out visitors: how many, new ones, where they landed and came from, how many signed up"""
    new = Visitor.objects.filter(first_seen__gte=since)
    n_new = new.count()
    converted = new.filter(signed_up_at__isnull=False)
    n_conv = converted.count()
    seen = VisitorSlot.objects.filter(slot__gte=since)
    daily = defaultdict(set)
    for slot, vid in seen.values_list("slot", "visitor_id"):
        daily[_ist(slot).date()].add(vid)
    signups_by_day = Counter(_ist(t).date() for t in converted.values_list("signed_up_at", flat=True))
    series = []
    for i in range(days):
        d = first_day + timedelta(days=i)
        series.append({"d": d.isoformat(), "visitors": len(daily.get(d, ())), "signed_up": signups_by_day.get(d, 0)})
    direct = "(direct / typed in)"
    landing = Counter((p or "/").split("?")[0] for p in new.values_list("first_path", flat=True))
    by_ref = defaultdict(lambda: [0, 0])
    for r, up in new.values_list("referrer", "signed_up_at"):
        k = r or direct
        by_ref[k][0] += 1
        by_ref[k][1] += up is not None
    devices = Counter(_device(ua)[0] for ua in new.values_list("device", flat=True))
    hours = sorted((t - f).total_seconds() / 3600 for f, t in converted.values_list("first_seen", "signed_up_at") if t and f)
    premium = _premium_ids(now)
    became = set(converted.values_list("profile_id", flat=True))
    return {"unique": seen.values("visitor_id").distinct().count(), "new": n_new, "signed_up": n_conv,
            "conversion": round(100 * n_conv / n_new, 1) if n_new else 0, "became_premium": len(became & premium),
            "daily": series, "landing": landing.most_common(8),
            "referrers": sorted([[k, v[0], v[1], round(100 * v[1] / v[0], 1) if v[0] else 0] for k, v in by_ref.items()], key=lambda r: -r[1])[:8],
            "devices": devices.most_common(), "hours_to_sign_up": round(hours[len(hours) // 2], 1) if hours else None}


def _person(p, extra=None):
    from django.urls import reverse
    out = {"name": p.name or p.email.split("@")[0], "email": p.email, "phone": p.phone or "",
           "url": reverse("admin:core_traderprofile_change", args=[p.pk])}
    out.update(extra or {})
    return out


def _not_premium(now):
    """Signed up but not premium: how many, how many still use the site, and the most active of them
    (the ones worth offering premium to)"""
    premium = _premium_ids(now)
    ids = set(TraderProfile.objects.values_list("pk", flat=True))
    today = _ist(now).date()
    secs, days_on = defaultdict(int), defaultdict(set)
    for pid, day, sec in SiteTime.objects.filter(day__gte=today - timedelta(days=29)).values_list("profile_id", "day", "seconds"):
        if pid not in premium:
            secs[pid] += sec
            days_on[pid].add(day)
    active14 = sum(1 for ds in days_on.values() if max(ds) >= today - timedelta(days=13))
    top = sorted(secs.items(), key=lambda kv: -kv[1])[:25]
    people = {p.pk: p for p in TraderProfile.objects.filter(pk__in=[k for k, _ in top])}
    return {"total": len(ids), "premium": len(premium & ids), "not_premium": len(ids - premium), "active_14d": active14,
            "people": [_person(people[k], {"hours": round(v / 3600, 1), "days": len(days_on[k]), "last": max(days_on[k]).isoformat()})
                       for k, v in top if k in people]}


def _at_risk(today, away_days=14, lookback=30, min_days=4):
    """People who used to come often (on the site at least min_days days in the lookback days before
    their last visit) and haven't been back for away_days: the ones to reach out to"""
    cutoff = today - timedelta(days=away_days)
    by_person = defaultdict(list)
    for pid, day, sec in SiteTime.objects.filter(day__gte=cutoff - timedelta(days=lookback + 90)).values_list("profile_id", "day", "seconds"):
        by_person[pid].append((day, sec))
    rows = []
    for pid, visits in by_person.items():
        last = max(d for d, _ in visits)
        if last >= cutoff:
            continue
        before = [(d, sec) for d, sec in visits if last - timedelta(days=lookback) < d <= last]
        if len(before) < min_days:
            continue
        rows.append((pid, last, len(before), sum(sec for _, sec in before)))
    rows.sort(key=lambda r: (-r[2], r[1]))
    people = {p.pk: p for p in TraderProfile.objects.filter(pk__in=[r[0] for r in rows[:50]])}
    premium = _premium_ids(timezone.now())
    return {"count": len(rows), "away_days": away_days, "min_days": min_days, "lookback": lookback,
            "people": [_person(people[pid], {"last": last.isoformat(), "away": (today - last).days, "days_before": n,
                                             "hours_before": round(sec / 3600, 1), "premium": pid in premium})
                       for pid, last, n, sec in rows[:50] if pid in people]}


def _endpoints(since):
    """Each API endpoint in the period: requests, average and slowest time, the slow ones (over a
    second), errors, and its share of the server's time: the ones to speed up first"""
    rows = (EndpointMinute.objects.filter(minute__gte=since).values("route", "method")
            .annotate(n=Sum("count"), total=Sum("total_ms"), mx=Max("max_ms"), slow=Sum("slow"), err=Sum("errors")))
    rows = [r for r in rows if r["n"]]
    grand = sum(r["total"] for r in rows) or 1
    out = [{"route": "/" + r["route"].lstrip("/"), "method": r["method"], "n": r["n"], "avg_ms": round(r["total"] / r["n"], 1),
            "max_ms": round(r["mx"]), "slow_pct": round(100 * r["slow"] / r["n"], 1), "errors": r["err"],
            "share": round(100 * r["total"] / grand, 1), "total_s": round(r["total"] / 1000, 1)} for r in rows]
    out.sort(key=lambda r: -r["total_s"])
    return out[:20]

