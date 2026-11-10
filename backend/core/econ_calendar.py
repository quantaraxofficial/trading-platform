"""Economic calendar for the chart page's Economic calendar panel and the chart's event marks.

Source: Forex Factory's public weekly feed (nfs.faireconomy.media), which covers the current week
(Sunday to Saturday, New York time): each event's title, currency, UTC time, impact, forecast and
previous value. The feed has no actual values, so `actual` stays empty until a source with
actuals is added; the frontend shows "—" for it.

The feed only ever holds this week, so every fetch is merged into a file kept on the backend's
private volume: past weeks stay available (a history that grows from the day this went live), and
this week's events are replaced by the feed's (a rescheduled or cancelled event doesn't linger).

Fetched at most every 30 minutes, under a lock, with a 5-minute back-off after a failure (Forex
Factory asks for no more than a couple of requests every five minutes). A failed fetch serves
what's stored.

  GET /api/users/calendar/economic/?from=<unix s>&to=<unix s>
  → {"events": [{id, title, currency, time, all_day, tentative, impact, actual, forecast,
                 previous, url}], "coverage": {"from", "to"}, "updated", "source"}
"""
import hashlib
import json
import logging
import os
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

import requests
from django.conf import settings
from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

log = logging.getLogger(__name__)

FEED_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.xml"
REFRESH_S = 30 * 60
RETRY_S = 5 * 60
KEEP_S = 400 * 86400          # history kept: a little over a year
MAX_SPAN_S = 120 * 86400      # the most one request may ask for

_lock = threading.Lock()
_state: dict = {"loaded": False, "events": {}, "fetched": 0.0, "tried": 0.0}


def _store_path() -> Path:
    # The private volume in production (/data/private), else the backend's private_uploads folder
    root = os.environ.get("COLLAB_FILES_ROOT")
    base = Path(root).parent if root else Path(settings.BASE_DIR) / "private_uploads"
    base.mkdir(parents=True, exist_ok=True)
    return base / "economic_calendar.json"


def _load() -> None:
    if _state["loaded"]:
        return
    _state["loaded"] = True
    try:
        data = json.loads(_store_path().read_text(encoding="utf-8"))
        _state["events"] = {e["id"]: e for e in data.get("events", [])}
        _state["fetched"] = float(data.get("fetched", 0))
    except FileNotFoundError:
        pass
    except Exception:
        log.exception("economic calendar: couldn't read the stored events")


def _save() -> None:
    p = _store_path()
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps({"fetched": _state["fetched"], "events": list(_state["events"].values())}), encoding="utf-8")
    tmp.replace(p)


def _text(el, tag: str) -> str:
    v = el.findtext(tag)
    return (v or "").strip()


def parse_feed(raw: bytes) -> list[dict]:
    """The feed's XML → events. Its dates and times are UTC ("11-09-2026", "1:30pm"); a time can
    also be "All Day", "Tentative" or "Day 1"…"""
    out = []
    for el in ET.fromstring(raw).iter("event"):
        title, cur = _text(el, "title"), _text(el, "country").upper()
        date_s, time_s = _text(el, "date"), _text(el, "time")
        try:
            day = datetime.strptime(date_s, "%m-%d-%Y").replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        t, all_day, tentative = day, False, False
        try:
            hm = datetime.strptime(time_s.lower(), "%I:%M%p")
            t = day.replace(hour=hm.hour, minute=hm.minute)
        except ValueError:
            all_day = time_s.lower() != "tentative"
            tentative = time_s.lower() == "tentative"
        ts = int(t.timestamp())
        impact = _text(el, "impact").lower()
        out.append({
            "id": hashlib.sha1(f"{cur}|{title}|{date_s}".encode()).hexdigest()[:16],
            "title": title,
            "currency": cur,
            "time": ts,
            "all_day": all_day,
            "tentative": tentative,
            "impact": impact if impact in ("low", "medium", "high", "holiday") else "low",
            "actual": _text(el, "actual"),
            "forecast": _text(el, "forecast"),
            "previous": _text(el, "previous"),
            "url": _text(el, "url"),
        })
    return out


def _refresh() -> None:
    now = time.time()
    if now - _state["fetched"] < REFRESH_S or now - _state["tried"] < RETRY_S:
        return
    _state["tried"] = now
    try:
        r = requests.get(FEED_URL, timeout=12, headers={"User-Agent": "TradePilot economic calendar"})
        r.raise_for_status()
        fresh = parse_feed(r.content)
    except Exception as e:
        log.warning("economic calendar: fetch failed: %s", e)
        return
    if not fresh:
        return
    # The feed is this week as it stands now: replace what's stored for the days it covers
    lo = min(e["time"] for e in fresh) // 86400 * 86400
    hi = max(e["time"] for e in fresh) // 86400 * 86400 + 86400
    events = {k: e for k, e in _state["events"].items() if not (lo <= e["time"] < hi) and e["time"] > now - KEEP_S}
    for e in fresh:
        old = _state["events"].get(e["id"])
        if old and old.get("actual") and not e["actual"]:
            e["actual"] = old["actual"]
        events[e["id"]] = e
    _state["events"] = events
    _state["fetched"] = now
    try:
        _save()
    except Exception:
        log.exception("economic calendar: couldn't store the events")


def events_between(frm: int, to: int) -> dict:
    with _lock:
        _load()
        _refresh()
        evs = _state["events"].values()
        times = [e["time"] for e in evs]
        picked = sorted((e for e in evs if frm <= e["time"] < to), key=lambda e: (e["time"], e["currency"], e["title"]))
        return {
            "events": picked,
            "coverage": {"from": min(times) if times else None, "to": max(times) if times else None},
            "updated": int(_state["fetched"]) or None,
            "source": "Forex Factory",
        }


@api_view(["GET"])
@authentication_classes([])
@permission_classes([AllowAny])
def economic(request):
    now = int(time.time())
    try:
        frm = int(request.GET.get("from", now - 7 * 86400))
        to = int(request.GET.get("to", now + 7 * 86400))
    except ValueError:
        return Response({"error": "from and to are unix seconds"}, status=400)
    if to <= frm:
        return Response({"error": "to must be after from"}, status=400)
    to = min(to, frm + MAX_SPAN_S)
    resp = Response(events_between(frm, to))
    resp["Cache-Control"] = "public, max-age=300"
    return resp
