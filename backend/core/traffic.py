"""Traffic recording for Django Admin → Site analytics (core/site_analytics.py):

- who's on the site, per 5 minutes: each presence ping (core/presence.py) notes the signed-in person
  in that slot (TrafficSlot), so a slot's rows are how many were on the site at once; signed-out
  visitors the same from the visit ping (Visitor, VisitorSlot: a random id their browser keeps)
- each API endpoint's requests per minute: how many, their time, the slow ones, errors (EndpointMinute)
- the server, per minute (ServerMinute): requests served, 5xx errors, response times
  (TrafficMiddleware), the live connections open (collab and price sockets: consumers.py), the
  machine's load and memory, and how many people were on the site then (signed in and visitors)
- a sampler thread checks the machine every 10 s: the minute's peak load and memory, and whether the
  server itself froze (the sampler waking late); it writes every minute's row, requests or not, so a
  minute with no row means the server was down or hung
- browsers report their own freezes (the page not responding: core/presence.py lag), counted per
  minute and kept one by one (ClientLag)

Old rows go after RETENTION_DAYS (once a day)."""
import os
import sys
import threading
import time
from collections import Counter
from datetime import datetime, timedelta, timezone as dt_timezone

SLOT_SECONDS = 300
RETENTION_DAYS = {"slots": 400, "minutes": 120, "endpoints": 30, "lag": 60}
SLOW_MS = 1000
SAMPLE_S = 10

_lock = threading.Lock()
_minute = None                       # the minute being counted (unix minutes)
_buf = {"requests": 0, "errors": 0, "ms_total": 0.0, "ms_max": 0.0}
_routes: dict = {}                   # (route, method) -> [count, total ms, max ms, slow, errors] this minute
_peaks = {"load": None, "mem": None, "stall_ms": 0.0}
_lag = {"reports": 0, "max_ms": 0.0}
WS = {"collab": 0, "ticks": 0}       # live connections open now
_last_prune = 0.0
_sampler = None


# ---- the machine (Linux: /proc; elsewhere unknown)

def load_pct():
    try:
        return round(os.getloadavg()[0] / (os.cpu_count() or 1) * 100, 1)
    except (AttributeError, OSError):
        return None


def mem_pct():
    try:
        info = {}
        with open("/proc/meminfo") as f:
            for line in f:
                k, v = line.split(":", 1)
                info[k] = int(v.split()[0])
        total, available = info.get("MemTotal"), info.get("MemAvailable")
        return round((1 - available / total) * 100, 1) if total and available is not None else None
    except (OSError, ValueError):
        return None


def _cpu_now():
    """The CPUs' busy share since the last call (Linux /proc/stat), %: a truer peak than the load average"""
    global _cpu_prev
    try:
        with open("/proc/stat") as f:
            parts = [int(x) for x in f.readline().split()[1:]]
        idle, total = parts[3] + (parts[4] if len(parts) > 4 else 0), sum(parts)
        prev, _cpu_prev = _cpu_prev, (idle, total)
        if not prev or total <= prev[1]:
            return None
        return round(100 * (1 - (idle - prev[0]) / (total - prev[1])), 1)
    except (OSError, ValueError, IndexError):
        return None


_cpu_prev = None


# ---- live connections

def ws_opened(kind):
    with _lock:
        WS[kind] = WS.get(kind, 0) + 1


def ws_closed(kind):
    with _lock:
        WS[kind] = max(0, WS.get(kind, 0) - 1)


# ---- the minute: counted in memory, written when the next one starts

def _roll(m):
    """(under the lock) the minute that just ended, when m is a new one"""
    global _minute
    if _minute is None:
        _minute = m
        return None
    if m == _minute:
        return None
    done = (_minute, dict(_buf), dict(WS), dict(_routes), dict(_peaks), dict(_lag))
    _buf.update(requests=0, errors=0, ms_total=0.0, ms_max=0.0)
    _routes.clear()
    _peaks.update(load=None, mem=None, stall_ms=0.0)
    _lag.update(reports=0, max_ms=0.0)
    _minute = m
    return done


def note_request(ms, status_code, route=None, method="GET"):
    m = int(time.time() // 60)
    with _lock:
        done = _roll(m)
        _buf["requests"] += 1
        if status_code >= 500:
            _buf["errors"] += 1
        _buf["ms_total"] += ms
        _buf["ms_max"] = max(_buf["ms_max"], ms)
        if route:
            r = _routes.setdefault((route[:160], (method or "GET")[:8]), [0, 0.0, 0.0, 0, 0])
            r[0] += 1
            r[1] += ms
            r[2] = max(r[2], ms)
            r[3] += ms >= SLOW_MS
            r[4] += status_code >= 500
    if done:
        _write(*done)


def note_client_lag(worst_ms):
    with _lock:
        done = _roll(int(time.time() // 60))
        _lag["reports"] += 1
        _lag["max_ms"] = max(_lag["max_ms"], float(worst_ms))
    if done:
        _write(*done)


def _people_now():
    """How many signed-in people and signed-out visitors had the site open in the last 2 minutes"""
    from django.utils import timezone
    from .models import TraderProfile, Visitor
    since = timezone.now() - timedelta(minutes=2)
    return (TraderProfile.objects.filter(last_seen__gte=since).count(),
            Visitor.objects.filter(last_seen__gte=since, profile__isnull=True).count())


def _write(minute, b, ws, routes=None, peaks=None, lag=None):
    from .models import EndpointMinute, ServerMinute
    at = datetime.fromtimestamp(minute * 60, tz=dt_timezone.utc)
    try:
        if routes:
            EndpointMinute.objects.bulk_create([
                EndpointMinute(minute=at, route=route, method=method, count=c, total_ms=round(t, 1), max_ms=round(mx, 1), slow=sl, errors=er)
                for (route, method), (c, t, mx, sl, er) in routes.items()], ignore_conflicts=True)
    except Exception:
        pass
    try:
        n = b["requests"]
        peaks, lag = peaks or {}, lag or {}
        try:
            users, visitors = _people_now()
        except Exception:
            users = visitors = None
        load, mem = load_pct(), mem_pct()
        ServerMinute.objects.update_or_create(minute=at, defaults={
            "requests": n, "errors": b["errors"], "avg_ms": round(b["ms_total"] / n, 1) if n else 0,
            "max_ms": round(b["ms_max"], 1), "ws_collab": ws.get("collab", 0), "ws_ticks": ws.get("ticks", 0),
            "load_pct": load, "mem_pct": mem,
            "peak_load": max(x for x in (peaks.get("load"), load) if x is not None) if (peaks.get("load") is not None or load is not None) else None,
            "peak_mem": max(x for x in (peaks.get("mem"), mem) if x is not None) if (peaks.get("mem") is not None or mem is not None) else None,
            "stall_ms": round(peaks.get("stall_ms") or 0, 1), "users": users, "visitors": visitors,
            "lag_reports": lag.get("reports", 0), "lag_max_ms": round(lag.get("max_ms", 0), 1)})
        _prune()
    except Exception:
        pass   # analytics never break a request


def _prune():
    global _last_prune
    if time.time() - _last_prune < 86400:
        return
    _last_prune = time.time()
    from django.utils import timezone
    from .models import ClientLag, EndpointMinute, ServerMinute, TrafficSlot, VisitorSlot
    now = timezone.now()
    TrafficSlot.objects.filter(slot__lt=now - timedelta(days=RETENTION_DAYS["slots"])).delete()
    VisitorSlot.objects.filter(slot__lt=now - timedelta(days=RETENTION_DAYS["slots"])).delete()
    ServerMinute.objects.filter(minute__lt=now - timedelta(days=RETENTION_DAYS["minutes"])).delete()
    EndpointMinute.objects.filter(minute__lt=now - timedelta(days=RETENTION_DAYS["endpoints"])).delete()
    ClientLag.objects.filter(at__lt=now - timedelta(days=RETENTION_DAYS["lag"])).delete()


# ---- the sampler: the machine every 10 s, and every minute's row

def _sample_loop():
    from django.db import close_old_connections
    _cpu_now()
    expected = time.monotonic() + SAMPLE_S
    while True:
        time.sleep(max(0.5, expected - time.monotonic()))
        now = time.monotonic()
        # (woken late: the server process didn't get to run: a freeze)
        stall = max(0.0, (now - expected) * 1000)
        expected = now + SAMPLE_S
        cpu, mem = _cpu_now(), mem_pct()
        with _lock:
            if cpu is not None:
                _peaks["load"] = cpu if _peaks["load"] is None else max(_peaks["load"], cpu)
            if mem is not None:
                _peaks["mem"] = mem if _peaks["mem"] is None else max(_peaks["mem"], mem)
            if stall > 2000:
                _peaks["stall_ms"] = max(_peaks["stall_ms"], stall)
            done = _roll(int(time.time() // 60))
        if done:
            close_old_connections()
            _write(*done)


def start_sampler():
    """Once per server process (not for tests or management commands)"""
    global _sampler
    if _sampler or "test" in sys.argv or os.environ.get("TRAFFIC_SAMPLER") == "0":
        return
    _sampler = threading.Thread(target=_sample_loop, name="traffic-sampler", daemon=True)
    _sampler.start()


def current():
    """This minute so far (not written yet) and what's open now"""
    with _lock:
        b, ws = dict(_buf), dict(WS)
        counting = _minute == int(time.time() // 60)
    n = b["requests"] if counting else 0
    return {"requests": n, "errors": b["errors"] if counting else 0,
            "avg_ms": round(b["ms_total"] / n, 1) if n else None, "ws_collab": ws.get("collab", 0),
            "ws_ticks": ws.get("ticks", 0), "load_pct": load_pct(), "mem_pct": mem_pct(), "cpus": os.cpu_count()}


# ---- who's on the site

def slot_of(when):
    t = int(when.timestamp()) // SLOT_SECONDS * SLOT_SECONDS
    return datetime.fromtimestamp(t, tz=dt_timezone.utc)


def note_presence(profile, when, where=""):
    from .models import TrafficSlot
    try:
        TrafficSlot.objects.get_or_create(slot=slot_of(when), profile=profile, defaults={"where": where[:40]})
    except Exception:
        pass   # (two pings at once: the other one wrote it)


def note_visit(vid, where, referrer, device, when):
    """A signed-out browser on the site (the visit ping): remembered by its random id, per 5 minutes"""
    from .models import Visitor, VisitorSlot
    try:
        v = Visitor.objects.filter(vid=vid).first()
        if v is None:
            v = Visitor.objects.create(vid=vid, last_seen=when, first_path=where[:80], referrer=referrer[:120], device=device[:255])
        else:
            Visitor.objects.filter(pk=v.pk).update(last_seen=when)
        VisitorSlot.objects.get_or_create(slot=slot_of(when), visitor=v, defaults={"where": where[:40]})
    except Exception:
        pass   # (two pings at once: the other one wrote it)


class TrafficMiddleware:
    """Counts every request and its time (the admin's own pages and static files aside); starts the sampler"""

    def __init__(self, get_response):
        self.get_response = get_response
        from django.conf import settings
        self.skip = ("/static/", "/media/", "/" + getattr(settings, "ADMIN_URL", "admin/"))
        start_sampler()

    def __call__(self, request):
        if request.path.startswith(self.skip):
            return self.get_response(request)
        start = time.perf_counter()
        response = self.get_response(request)
        # (the endpoint as its URL pattern, so every user's /user/<uid>/ counts as one)
        match = getattr(request, "resolver_match", None)
        route = getattr(match, "route", None) or ("(no such page)" if getattr(response, "status_code", 200) == 404 else None)
        note_request((time.perf_counter() - start) * 1000, getattr(response, "status_code", 200), route, request.method)
        return response
