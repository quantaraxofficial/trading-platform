"""Traffic recording for Django Admin → Site analytics (core/site_analytics.py):

- who's on the site, per 5 minutes: each presence ping (core/presence.py) notes the signed-in person
  in that slot (TrafficSlot), so a slot's rows are how many were on the site at once
- the server, per minute: requests served, 5xx errors, response times (TrafficMiddleware), the live
  connections open (collab and price sockets: consumers.py) and the machine's load and memory
  (ServerMinute). Counted in memory and written once a minute, on the next minute's first request.

Old rows go after RETENTION_DAYS (once a day)."""
import os
import threading
import time
from datetime import datetime, timedelta, timezone as dt_timezone

SLOT_SECONDS = 300
RETENTION_DAYS = {"slots": 400, "minutes": 120}

_lock = threading.Lock()
_minute = None                       # the minute being counted (unix minutes)
_buf = {"requests": 0, "errors": 0, "ms_total": 0.0, "ms_max": 0.0}
WS = {"collab": 0, "ticks": 0}       # live connections open now
_last_prune = 0.0


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


# ---- live connections

def ws_opened(kind):
    with _lock:
        WS[kind] = WS.get(kind, 0) + 1


def ws_closed(kind):
    with _lock:
        WS[kind] = max(0, WS.get(kind, 0) - 1)


# ---- requests

def note_request(ms, status_code):
    global _minute
    m = int(time.time() // 60)
    done = None
    with _lock:
        if _minute is None:
            _minute = m
        if m != _minute:
            done = (_minute, dict(_buf), dict(WS))
            _buf.update(requests=0, errors=0, ms_total=0.0, ms_max=0.0)
            _minute = m
        _buf["requests"] += 1
        if status_code >= 500:
            _buf["errors"] += 1
        _buf["ms_total"] += ms
        _buf["ms_max"] = max(_buf["ms_max"], ms)
    if done:
        _write(*done)


def _write(minute, b, ws):
    from .models import ServerMinute
    try:
        n = b["requests"]
        ServerMinute.objects.update_or_create(
            minute=datetime.fromtimestamp(minute * 60, tz=dt_timezone.utc),
            defaults={"requests": n, "errors": b["errors"], "avg_ms": round(b["ms_total"] / n, 1) if n else 0,
                      "max_ms": round(b["ms_max"], 1), "ws_collab": ws.get("collab", 0), "ws_ticks": ws.get("ticks", 0),
                      "load_pct": load_pct(), "mem_pct": mem_pct()})
        _prune()
    except Exception:
        pass   # analytics never break a request


def _prune():
    global _last_prune
    if time.time() - _last_prune < 86400:
        return
    _last_prune = time.time()
    from django.utils import timezone
    from .models import ServerMinute, TrafficSlot
    now = timezone.now()
    TrafficSlot.objects.filter(slot__lt=now - timedelta(days=RETENTION_DAYS["slots"])).delete()
    ServerMinute.objects.filter(minute__lt=now - timedelta(days=RETENTION_DAYS["minutes"])).delete()


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


class TrafficMiddleware:
    """Counts every request and its time (the admin's own pages and static files aside)"""

    def __init__(self, get_response):
        self.get_response = get_response
        from django.conf import settings
        self.skip = ("/static/", "/media/", "/" + getattr(settings, "ADMIN_URL", "admin/"))

    def __call__(self, request):
        if request.path.startswith(self.skip):
            return self.get_response(request)
        start = time.perf_counter()
        response = self.get_response(request)
        note_request((time.perf_counter() - start) * 1000, getattr(response, "status_code", 200))
        return response
