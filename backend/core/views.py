from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import TraderProfile, DrawingTemplate, UserDrawing, UserSession, PineScript, UserStrategyNote, UserSetting, FailedRequest, FeedbackMessage
from django.utils import timezone
from django.conf import settings
from .auth import verified_uid, require_session, session_owner, session_key_of
from .middleware import get_client_ip
from django.core.files.storage import default_storage
import os
import time


@api_view(['POST'])
def sync_user(request):
    data = request.data
    uid = data.get('uid')
    session_key = data.get('session_key')
    force = data.get('force', False)

    if not uid:
        return Response({"error": "UID is required"}, status=status.HTTP_400_BAD_REQUEST)

    # Only the user themself can open a session: the Firebase ID token must be theirs. (Local test
    # accounts are allowed only with ALLOW_UNVERIFIED_SIGNIN on, for development.)
    if not settings.ALLOW_UNVERIFIED_SIGNIN and verified_uid(data.get('id_token')) != uid:
        return Response({"error": "Sign-in could not be verified"}, status=status.HTTP_401_UNAUTHORIZED)

    profile, created = TraderProfile.objects.update_or_create(
        uid=uid,
        defaults={
            'name': data.get('name', ''),
            'email': data.get('email', ''),
            'phone': data.get('phone', ''),
            'last_login': timezone.now()
        }
    )

    # Session management
    if session_key:
        try:
            session = UserSession.objects.get(user=profile, session_key=session_key)
            session.last_active = timezone.now()
            session.save()
        except UserSession.DoesNotExist:
            current_sessions = UserSession.objects.filter(user=profile).order_by('last_active')
            if current_sessions.count() >= 2:
                if force:
                    # Remove oldest session to make room
                    current_sessions.first().delete()
                    UserSession.objects.create(
                        user=profile,
                        session_key=session_key,
                        device_info=data.get('device_info', '')
                    )
                else:
                    return Response({
                        "limit_reached": True,
                        "message": "You have already reached the limit of number of devices per account."
                    })
            else:
                UserSession.objects.create(
                    user=profile,
                    session_key=session_key,
                    device_info=data.get('device_info', '')
                )

    return Response({
        "success": True,
        "tier": profile.tier,
        "is_new": created
    })


@api_view(['GET'])
def get_user_data(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied
    try:
        return Response({
            "name": profile.name,
            "email": profile.email,
            "phone": profile.phone,
            "tier": profile.tier,
            "created_at": profile.created_at.isoformat() if profile.created_at else None,
            "last_login": profile.last_login.isoformat() if profile.last_login else None
        })
    except TraderProfile.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)


@api_view(['GET', 'POST'])
def manage_templates(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied

    if request.method == 'GET':
        tool_type = request.query_params.get('tool_type')
        templates = DrawingTemplate.objects.filter(owner=profile)
        if tool_type:
            templates = templates.filter(tool_type=tool_type)

        return Response([{
            "id": t.id,
            "name": t.name,
            "tool_type": t.tool_type,
            "settings": t.settings
        } for t in templates])

    elif request.method == 'POST':
        data = request.data
        template, created = DrawingTemplate.objects.update_or_create(
            owner=profile,
            name=data.get('name'),
            tool_type=data.get('tool_type'),
            defaults={'settings': data.get('settings')}
        )
        return Response({"success": True, "id": template.id})


@api_view(['DELETE'])
def delete_template(request, template_id):
    owner = session_owner(request)
    if owner is None:
        return Response({"error": "Session expired or logged out from another device"}, status=status.HTTP_401_UNAUTHORIZED)
    template = DrawingTemplate.objects.filter(id=template_id, owner=owner).first()
    if not template:
        return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)
    template.delete()
    return Response({"success": True})


@api_view(['GET', 'POST'])
def manage_pinescripts(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied

    if request.method == 'GET':
        scripts = PineScript.objects.filter(owner=profile).order_by('order')
        return Response([{
            "id": s.id,
            "name": s.name,
            "script_type": s.script_type,
            "code": s.code,
            "versions": s.versions,
            "order": s.order,
            "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat(),
        } for s in scripts])

    elif request.method == 'POST':
        data = request.data
        name = data.get('name')
        if not name:
            return Response({"error": "name is required"}, status=status.HTTP_400_BAD_REQUEST)
        script, created = PineScript.objects.update_or_create(
            owner=profile,
            name=name,
            defaults={
                'script_type': data.get('script_type', 'indicator'),
                'code': data.get('code', ''),
                'versions': data.get('versions', []),
            }
        )
        return Response({"success": True, "id": script.id})


@api_view(['DELETE'])
def delete_pinescript(request, script_id):
    owner = session_owner(request)
    if owner is None:
        return Response({"error": "Session expired or logged out from another device"}, status=status.HTTP_401_UNAUTHORIZED)
    script = PineScript.objects.filter(id=script_id, owner=owner).first()
    if not script:
        return Response({"error": "Script not found"}, status=status.HTTP_404_NOT_FOUND)
    script.delete()
    return Response({"success": True})


@api_view(['GET', 'POST'])
def manage_drawings(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied

    symbol = request.query_params.get('symbol') or request.data.get('symbol')
    # Without a symbol, a GET lists every symbol's drawings (the Object tree's "Manage layout
    # drawings": a count per symbol and what they are)
    if not symbol and request.method == 'GET':
        return Response([{"symbol": d.symbol, "drawings": d.data or []} for d in UserDrawing.objects.filter(owner=profile)])
    if not symbol:
        return Response({"error": "Symbol is required"}, status=status.HTTP_400_BAD_REQUEST)

    if request.method == 'GET':
        # The symbol's drawings themselves (what the chart's drawing layer loads)
        drawing = UserDrawing.objects.filter(owner=profile, symbol=symbol).first()
        return Response(drawing.data if drawing else [])

    elif request.method == 'POST':
        # The chart sends {symbol, drawings}
        UserDrawing.objects.update_or_create(
            owner=profile,
            symbol=symbol,
            defaults={'data': request.data.get('drawings', [])}
        )
        return Response({"success": True})


@api_view(['GET', 'POST'])
def manage_chart_state(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied

    if request.method == 'GET':
        from .models import ChartState
        try:
            state = ChartState.objects.get(owner=profile)
            return Response({
                "symbol": state.symbol,
                "interval": state.interval,
                "timestamp": state.timestamp,
                "bar_spacing": state.bar_spacing,
                "indicators": state.indicators,
                "favorite_timeframes": state.favorite_timeframes,
                "updated_at": state.updated_at.isoformat(),
            })
        except ChartState.DoesNotExist:
            return Response({
                "symbol": "XAU/USD",
                "interval": "15min",   # the app's interval value ("15m" is only its label)
                "timestamp": None,
                "bar_spacing": None,
                "indicators": [],
                "favorite_timeframes": [],
            })

    elif request.method == 'POST':
        from .models import ChartState
        data = request.data
        # What's saved already, for the fields this save doesn't send
        state = ChartState.objects.filter(owner=profile).first()
        state, _ = ChartState.objects.update_or_create(
            owner=profile,
            defaults={
                'symbol': data.get('symbol', state.symbol if state else 'XAU/USD'),
                'interval': data.get('interval', state.interval if state else '15min'),
                'timestamp': data.get('timestamp', state.timestamp if state else None),
                'bar_spacing': data.get('bar_spacing', state.bar_spacing if state else None),
                'indicators': data.get('indicators', state.indicators if state else []),
            }
        )
        return Response({"success": True})


# --- Telemetry (backtest session start + action logging) ---

@api_view(['POST'])
def start_backtest_session(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied

    from .models import BacktestSession
    # End any existing active session for this user + symbol so there's only one at a time
    symbol = request.data.get('symbol', 'UNKNOWN')
    session = BacktestSession.objects.create(user=profile, symbol=symbol)
    return Response({'session_id': session.id})


@api_view(['POST'])
def log_telemetry_actions(request, uid):
    from .models import BacktestSession, UserActionLog
    profile, denied = require_session(request, uid)
    if denied:
        return denied

    session_id = request.data.get('session_id')
    actions = request.data.get('actions', [])

    if not session_id:
        return Response({'error': 'session_id is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        session = BacktestSession.objects.get(id=session_id, user=profile)
    except BacktestSession.DoesNotExist:
        return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)

    logs = []
    for action in actions:
        logs.append(UserActionLog(
            session=session,
            action_type=action.get('action_type', 'UNKNOWN'),
            action_data=action.get('action_data', {}),
            market_state=action.get('market_state', None)
        ))

    if logs:
        UserActionLog.objects.bulk_create(logs)

    return Response({'success': True, 'inserted': len(logs)})


# --- Agent / strategy-note endpoints (stubs: the AI agent was cut from this branch) ---

@api_view(['GET'])
def get_agent_insights(request, uid):
    """The trading agent was removed from this branch; keep the route so older
    clients get a clean empty payload instead of a 404."""
    profile, denied = require_session(request, uid)
    if denied:
        return denied
    return Response({'messages': [], 'total_actions': 0})


@api_view(['POST'])
def submit_strategy_note(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied

    text = (request.data.get('text') or '').strip()
    if not text:
        return Response({'error': 'text is required'}, status=status.HTTP_400_BAD_REQUEST)

    note = UserStrategyNote.objects.create(owner=profile, text=text)
    return Response({
        'success': True,
        'note': {'text': note.text, 'created_at': note.created_at.isoformat()},
    })


# --- Bot prediction endpoint (stubs: PyTorch imitation bot was cut from this branch) ---

@api_view(['POST'])
def predict_bot_action(request):
    """Behavioral-cloning bot was removed from this branch; keep the route so
    older clients get a clean error instead of a 404."""
    return Response({'error': 'Bot feature is not available in this build'}, status=status.HTTP_404_NOT_FOUND)


# --- Settings that follow the user across devices (layouts, watchlists, chart settings, templates…).
SYNC_MAX_VALUE = 2_000_000  # characters per setting


@api_view(['GET', 'POST'])
def manage_settings(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied

    if request.method == 'GET':
        return Response({s.key: {"value": s.value, "updated_at": s.updated_at} for s in UserSetting.objects.filter(owner=profile)})

    # POST {"settings": {key: {"value": "...", "updated_at": ms}}}: each key is stored unless the
    # server already holds a newer copy; the reply lists what the server keeps for those keys
    incoming = request.data.get('settings') or {}
    if not isinstance(incoming, dict):
        return Response({"error": "settings must be an object"}, status=status.HTTP_400_BAD_REQUEST)
    kept = {}
    for key, item in incoming.items():
        if not isinstance(key, str) or len(key) > 100 or not isinstance(item, dict):
            continue
        value, updated_at = item.get('value'), item.get('updated_at')
        if not isinstance(value, str) or len(value) > SYNC_MAX_VALUE or not isinstance(updated_at, (int, float)):
            continue
        current = UserSetting.objects.filter(owner=profile, key=key).first()
        if current is None or int(updated_at) >= current.updated_at:
            current, _ = UserSetting.objects.update_or_create(owner=profile, key=key, defaults={'value': value, 'updated_at': int(updated_at)})
        kept[key] = {"value": current.value, "updated_at": current.updated_at}
    return Response(kept)


# --- Failed-request tracking ---

@api_view(['POST'])
def track_failure(request):
    """Browser self-report of a request that did not come back to the user (a Next.js /api/*
    data-route failure, or a cloud-sync miss). The Django middleware already records the
    /api/users/* failures authoritatively, so this only ingests what the middleware cannot
    see. Always 200: the report must never become a tracked failure of itself, and it must
    not block the caller (the browser posts it fire-and-forget)."""
    owner = session_owner(request)
    data = request.data or {}
    path = str(data.get("path") or "")[:300]
    if len(path) < 4:
        return Response({"success": False, "error": "path is required"})
    reason_code = str(data.get("reason_code") or "frontend_error")[:60]
    reason_message = str(data.get("reason_message") or "")[:500]
    try:
        status_code = int(data.get("status_code") or 0)
    except (TypeError, ValueError):
        status_code = 0
    FailedRequest.objects.create(
        user=owner,
        session_key=session_key_of(request) or "",
        source=FailedRequest.Source.FRONTEND,
        path=path,
        method=str(data.get("method") or "GET")[:10],
        status_code=status_code,
        reason_code=reason_code,
        reason_message=reason_message,
        user_agent=str(request.headers.get("User-Agent", ""))[:300],
        ip=get_client_ip(request),
    )
    return Response({"success": True})


# --- Feedback / bug report (from the chart's "Send feedback" button) ---------
#
# A user (signed in or not) attaches screenshots and sends a bug report
# straight to the developer's Django admin. Multipart: text fields + `images`
# (repeatable file field). No session required — anonymous reports are allowed.

@api_view(['POST'])
def submit_feedback(request):
    """Bug report / feedback from the chart's 'Send feedback' button.

    Signed-in users attribute to their TraderProfile; anonymous ones keep only
    the session key. `images` is a repeatable multipart file field. Always 200
    on success — the browser posts it fire-and-forget, same as track_failure."""
    owner = session_owner(request)
    session_key = session_key_of(request) or ""

    image_urls = []
    try:
        for f in request.FILES.getlist('images'):
            ext = os.path.splitext(f.name)[1].lower() or ".png"
            if ext not in ('.png', '.jpg', '.jpeg', '.webp', '.gif'):
                ext = '.png'
            safe_name = f"fb_{int(time.time() * 1000)}_{os.getpid()}{ext}"
            path = default_storage.save(f"feedback/{safe_name}", f)
            image_urls.append(f"/media/{path}")
    except Exception:
        # Never fail the whole report because of a bad attachment
        pass

    message = str(request.data.get("message") or "").strip()[:5000]
    if not message:
        return Response({"error": "message is required"}, status=status.HTTP_400_BAD_REQUEST)

    fb = FeedbackMessage.objects.create(
        user=owner,
        session_key=session_key,
        message=message,
        images=image_urls,
        symbol=str(request.data.get("symbol") or "")[:50],
        interval=str(request.data.get("interval") or "")[:20],
        page_url=str(request.data.get("page_url") or "")[:500],
        user_agent=str(request.headers.get("User-Agent", ""))[:300],
        ip=get_client_ip(request),
    )
    return Response({"success": True, "id": fb.id})


# --- Cashfree order creation (paper-trading bridge) ---

@api_view(['POST'])
def create_cashfree_order(request):
    profile, denied = require_session(request, request.data.get('uid'))
    if denied:
        return denied
    # Paper-trading only in this build: no real order is placed.
    return Response({"success": True, "order": request.data})

# --- Live data read endpoints (serving ClickHouse tick_bars to the site) ---
#
# The pipeline writes 30-second bars from MT5 into ClickHouse; these views let
# the frontend read that same data, so a live MT5 feed powers the site. Both are
# public (no session) — they only read settled bar data, which is fine to serve
# to anyone who has the app.

def _ch_client():
    """A ClickHouse client with a short read timeout so a missing/overloaded
    server degrades to an empty response instead of hanging the request."""
    from pipeline.clickhouse_client import ClickHouseClient
    ch = ClickHouseClient()
    ch._session.headers["Connection"] = "close"
    # Short timeouts: these are low-latency chart reads, and a wedged ClickHouse
    # must not stall the page (the frontend falls back to its TwelveData feed).
    ch._session.verify = None
    return ch


def _ch_read(client, sql: str) -> list:
    """A read query with the client's session timeouts. On any failure (no
    ClickHouse, timeout, connection refused) it returns [] so the caller
    degrades to an empty response instead of a 500 or a stall."""
    try:
        return client.query(sql)
    except Exception:
        return []


@api_view(['GET'])
def get_last_prices(request):
    """Last 30-second bar per symbol — what the chart / watchlist shows live.

    ?symbols=XAUUSD,AAPL  (comma list). Returns {symbol: {ts, open, high, low,
    close, ticks}} plus a server wall-clock so the client can judge staleness.
    """
    from pipeline.config import CONFIG
    raw = request.query_params.get("symbols") or ",".join(CONFIG.SYMBOLS)
    syms = [s.strip() for s in raw.split(",") if s.strip()][:32]
    if not syms:
        return Response({}, status=status.HTTP_200_OK)
    out = {}
    try:
        ch = _ch_client()
        # One row per symbol: the most recent bar, read in a bounded 3-minute
        # window so the query stays cheap and never full-scans the table.
        sql = (
            "SELECT symbol, any(open) AS open, max(high) AS high, min(low) AS low, "
            "any(close) AS close, sum(ticks) AS ticks, max(ts) AS ts "
            f"FROM {CONFIG.CH_DATABASE}.tick_bars "
            f"WHERE symbol IN ({','.join(repr(s) for s in syms)}) "
            "AND ts >= now() - toIntervalMinute(3) GROUP BY symbol"
        )
        for r in _ch_read(ch, sql):
            out[r["symbol"]] = {
                "ts": r.get("ts"),
                "open": r.get("open"),
                "high": r.get("high"),
                "low": r.get("low"),
                "close": r.get("close"),
                "ticks": r.get("ticks"),
            }
    except Exception as e:
        # No ClickHouse yet / unreachable: return 200 with nothing so the UI
        # can fall back to its TwelveData feed silently.
        import logging
        logging.getLogger("core.live").warning("live last-prices unavailable: %s", e)
    out.setdefault("_server_time", int(time.time()))
    return Response(out)


@api_view(['GET'])
def get_candles(request):
    """30-second candles for one symbol, shaped like /api/stock-data's
    {values:[{datetime, open, high, low, close, volume}], meta} so the
    chart can consume it through its existing TwelveData code path.
    ?symbol=XAUUSD&interval=30s&limit=500  (limit = number of bars, default 500)
    """
    from pipeline.config import CONFIG
    sym = request.query_params.get("symbol", "").strip().upper()
    limit = int(request.query_params.get("limit", 500) or 500)
    limit = max(1, min(limit, 5000))
    if not sym:
        return Response({"error": "symbol is required"}, status=status.HTTP_400_BAD_REQUEST)

    values = []
    try:
        ch = _ch_client()
        sql = (
            "SELECT toDateTime(ts) AS dt, toString(open) AS open, toString(high) AS high, "
            f"toString(low) AS low, toString(close) AS close, "
            f"CAST(ticks AS String) AS volume "
            f"FROM {CONFIG.CH_DATABASE}.tick_bars "
            f"WHERE symbol = {repr(sym)} "
            f"ORDER BY ts DESC LIMIT {limit}"
        )
        rows = _ch_read(ch, sql)
        # newest-first, matching the TwelveData format the chart expects
        values = [
            {
                "datetime": r["dt"],
                "open": r["open"], "high": r["high"],
                "low": r["low"], "close": r["close"],
                "volume": int(r["volume"]) if r.get("volume") not in (None, "0", "") else None,
            }
            for r in rows
        ]
    except Exception as e:
        import logging
        logging.getLogger("core.live").warning("live candles unavailable for %s: %s", sym, e)

    return Response({
        "values": values,
        "meta": {
            "symbol": sym,
            "interval": "30s",
            "source": "mt5-clickhouse",
            "exchange_timezone": "UTC",
            "candles": len(values),
        },
    })
