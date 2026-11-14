from rest_framework import status
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response
from .models import TraderProfile, DrawingTemplate, UserDrawing, UserSession, PineScript, UserStrategyNote, UserSetting, FailedRequest, FeedbackMessage
from django.utils import timezone
from django.conf import settings
from .auth import verified_claims, require_session, session_owner, session_key_of, live_session, new_session_key
from .throttles import FeedbackThrottle, ReportThrottle, SignInThrottle
from .middleware import get_client_ip
from django.core.cache import cache
from django.core.files.storage import default_storage
import secrets
from .middleware import get_client_ip

@api_view(['POST'])
@throttle_classes([SignInThrottle])
def sync_user(request):
    """Signing in on this browser: {uid, id_token, session_key?, name?, phone?, device_info?, force?,
    arrival?}. The Firebase ID token must be that user's; the email is taken from it (never from the
    request). An existing session key of theirs is refreshed; otherwise the server issues a new one
    (two devices at most; force replaces the oldest) and sends it back as `session_key`."""
    data = request.data if isinstance(request.data, dict) else {}
    uid = str(data.get('uid') or '')[:128]
    force = data.get('force') is True

    if not uid:
        return Response({"error": "UID is required"}, status=status.HTTP_400_BAD_REQUEST)

    # Only the user themself can open a session: the Firebase ID token must be theirs. (Local test
    # accounts are allowed only with ALLOW_UNVERIFIED_SIGNIN on, which settings refuse outside DEBUG.)
    claims = None
    if not settings.ALLOW_UNVERIFIED_SIGNIN:
        claims = verified_claims(data.get('id_token'))
        if not claims or (claims.get('user_id') or claims.get('sub')) != uid:
            return Response({"error": "Sign-in could not be verified"}, status=status.HTTP_401_UNAUTHORIZED)
    email = (claims.get('email') if claims else data.get('email')) or ''
    defaults = {'email': str(email)[:254], 'last_login': timezone.now()}
    name = str(data.get('name') or '').strip()[:255]
    if name:
        defaults['name'] = name
    if data.get('phone'):
        defaults['phone'] = str(data.get('phone'))[:20]
    profile, created = TraderProfile.objects.update_or_create(uid=uid, defaults=defaults)
    # a new trader: where they came from (an ad, a referral, a link…), noted by their browser
    if created:
        from .arrival import record
        record(profile, data.get('arrival'))

    # Session management: a key of theirs is refreshed, anything else gets a fresh server-made key
    key = session_key_of(request)
    session = live_session(UserSession.objects.filter(user=profile, session_key=key)) if key else None
    if session:
        UserSession.objects.filter(id=session.id).update(last_active=timezone.now())
        new_key = session.session_key
    else:
        current_sessions = UserSession.objects.filter(user=profile).order_by('last_active')
        if current_sessions.count() >= 2:
            if not force:
                return Response({
                    "limit_reached": True,
                    "message": "You have already reached the limit of number of devices per account."
                })
            for old in current_sessions[:current_sessions.count() - 1]:
                old.delete()   # room for this one (the oldest go)
        new_key = new_session_key()
        UserSession.objects.create(user=profile, session_key=new_key, device_info=str(data.get('device_info') or '')[:255])

    return Response({
        "success": True,
        "tier": profile.tier,
        "is_new": created,
        "session_key": new_key,
    })

@api_view(['GET'])
def get_user_data(request, uid):
    from .posts import avatar_url
    profile, denied = require_session(request, uid)
    if denied:
        return denied
    try:
        return Response({
            "name": profile.name,
            "email": profile.email,
            "phone": profile.phone,
            "tier": profile.tier,
            "created_at": profile.created_at,
            "last_login": profile.last_login,
            # the photo they uploaded on their profile (core/posts.py), else ""
            "avatar": avatar_url(profile),
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
    try:
        template = DrawingTemplate.objects.get(id=template_id, owner=owner)
        template.delete()
        return Response({"success": True})
    except DrawingTemplate.DoesNotExist:
        return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)

SCRIPT_LANGUAGES = ('pine', 'python', 'mql5')


@api_view(['GET', 'POST'])
def manage_pinescripts(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied

    if request.method == 'GET':
        scripts = PineScript.objects.filter(owner=profile)
        return Response([{
            "id": s.id,
            "name": s.name,
            "script_type": s.script_type,
            "language": s.language,
            "code": s.code,
            "versions": s.versions,
            "order": s.order,
            "github": s.github or None,
            "updated_at": s.updated_at.isoformat(),
        } for s in scripts])

    elif request.method == 'POST':
        data = request.data
        script_id = data.get('id')
        language = data.get('language') if data.get('language') in SCRIPT_LANGUAGES else None
        if script_id:
            try:
                script = PineScript.objects.get(id=script_id, owner=profile)
            except PineScript.DoesNotExist:
                return Response({"error": "Script not found"}, status=status.HTTP_404_NOT_FOUND)
            script.name = data.get('name', script.name)
            script.script_type = data.get('script_type', script.script_type)
            script.language = language or script.language
            script.code = data.get('code', script.code)
            script.versions = data.get('versions', script.versions)
            script.order = data.get('order', script.order)
            if 'github' in data:
                script.github = clean_github_link(data.get('github'))
            script.save()
        else:
            script, created = PineScript.objects.update_or_create(
                owner=profile,
                name=data.get('name'),
                defaults={
                    'script_type': data.get('script_type', 'indicator'),
                    'language': language or 'pine',
                    'code': data.get('code', ''),
                    'versions': data.get('versions', []),
                    'order': data.get('order', 0),
                    'github': clean_github_link(data.get('github')),
                }
            )
        return Response({"success": True, "id": script.id, "updated_at": script.updated_at.isoformat()})

def clean_github_link(g):
    """A script's GitHub link as stored: {repo, branch, path, sha}, or {} for none"""
    if not isinstance(g, dict) or not all(isinstance(g.get(k), str) and g.get(k) for k in ('repo', 'branch', 'path')):
        return {}
    return {k: str(g.get(k) or '')[:400] for k in ('repo', 'branch', 'path', 'sha')}


@api_view(['DELETE'])
def delete_pinescript(request, script_id):
    owner = session_owner(request)
    if owner is None:
        return Response({"error": "Session expired or logged out from another device"}, status=status.HTTP_401_UNAUTHORIZED)
    try:
        script = PineScript.objects.get(id=script_id, owner=owner)
        script.delete()
        return Response({"success": True})
    except PineScript.DoesNotExist:
        return Response({"error": "Script not found"}, status=status.HTTP_404_NOT_FOUND)

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
        try:
            drawing = UserDrawing.objects.get(owner=profile, symbol=symbol)
            return Response(drawing.data)
        except UserDrawing.DoesNotExist:
            return Response([])

    elif request.method == 'POST':
        data = request.data.get('drawings', [])
        drawing, created = UserDrawing.objects.update_or_create(
            owner=profile,
            symbol=symbol,
            defaults={'data': data}
        )
        return Response({"success": True})

import os
from cashfree_pg.models.create_order_request import CreateOrderRequest
from cashfree_pg.api_client import Cashfree
from cashfree_pg.models.customer_details import CustomerDetails
from cashfree_pg.models.order_meta import OrderMeta
import uuid

# Initialize Cashfree (Sandbox for development)
Cashfree.XClientId = os.getenv("CASHFREE_APP_ID", "TEST_APP_ID")
Cashfree.XClientSecret = os.getenv("CASHFREE_SECRET_KEY", "TEST_SECRET_KEY")
Cashfree.XEnvironment = Cashfree.SANDBOX

@api_view(['POST'])
def create_cashfree_order(request):
    try:
        user_id = request.data.get('uid', 'test_user')
        amount = request.data.get('amount', 99.00)
        
        # Check if keys are default test placeholders
        if Cashfree.XClientId == "TEST_APP_ID" or Cashfree.XClientSecret == "TEST_SECRET_KEY":
            return Response({
                "error": "Cashfree API credentials are not configured. Please add CASHFREE_APP_ID and CASHFREE_SECRET_KEY to your backend .env file."
            }, status=status.HTTP_400_BAD_REQUEST)
        
        customer_details = CustomerDetails(
            customer_id=user_id,
            customer_phone="9999999999",
            customer_email="john@example.com"
        )
        
        order_meta = OrderMeta(
            return_url="http://localhost:3000/profile?order_id={order_id}"
        )
        
        create_order_request = CreateOrderRequest(
            order_id=f"order_{uuid.uuid4().hex[:8]}",
            order_amount=amount,
            order_currency="INR",
            customer_details=customer_details,
            order_meta=order_meta
        )
        
        # Instantiate Cashfree specifying the environment
        response = Cashfree(XEnvironment=Cashfree.SANDBOX).PGCreateOrder("2023-08-01", create_order_request, None, None)
        
        return Response({
            "payment_session_id": response.data.payment_session_id,
            "order_id": response.data.order_id
        })
    except Exception as e:
        err_msg = str(e)
        if "401" in err_msg or "Unauthorized" in err_msg or "authentication Failed" in err_msg:
            return Response({
                "error": "Cashfree authentication failed. Please check if CASHFREE_APP_ID and CASHFREE_SECRET_KEY are valid Sandbox credentials in your backend .env file."
            }, status=status.HTTP_400_BAD_REQUEST)
            
        return Response({"error": err_msg}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET', 'POST'])
def manage_chart_state(request, uid):
    profile, denied = require_session(request, uid)
    if denied:
        return denied

    from .models import ChartState
    if request.method == 'GET':
        try:
            state = ChartState.objects.get(owner=profile)
            return Response({
                'symbol': state.symbol,
                'interval': state.interval,
                'timestamp': state.timestamp,
                'bar_spacing': state.bar_spacing,
                'indicators': state.indicators or [],
                'favorite_timeframes': state.favorite_timeframes or []
            })
        except ChartState.DoesNotExist:
            return Response({})

    elif request.method == 'POST':
        data = request.data
        defaults = {
            'symbol': data.get('symbol', 'XAU/USD'),
            'interval': data.get('interval', '15m'),
            'timestamp': data.get('timestamp')
        }
        if 'bar_spacing' in data:
            defaults['bar_spacing'] = data.get('bar_spacing')
        if 'indicators' in data:
            defaults['indicators'] = data.get('indicators', [])
        if 'favorite_timeframes' in data:
            defaults['favorite_timeframes'] = data.get('favorite_timeframes', [])
            
        state, created = ChartState.objects.update_or_create(
            owner=profile,
            defaults=defaults
        )
        return Response({'success': True})

@api_view(['POST'])
def start_backtest_session(request, uid):
    from .models import BacktestSession
    profile, denied = require_session(request, uid)
    if denied:
        return denied
        
    symbol = request.data.get('symbol', 'UNKNOWN')
    session = BacktestSession.objects.create(user=profile, symbol=symbol)
    return Response({'session_id': session.id})

@api_view(['POST'])
@throttle_classes([ReportThrottle])
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

@api_view(['GET'])
def get_agent_insights(request, uid):
    """
    Summarizes what the agent has actually observed from this user's own
    UserActionLog history (timeframe habits, drawing-tool usage, long/short
    bias) into plain-language sentences, plus any strategy notes they've
    told it directly. This is real aggregation over real logged actions —
    not a canned or fabricated summary.
    """
    from .models import BacktestSession, UserActionLog
    from collections import Counter

    profile, denied = require_session(request, uid)
    if denied:
        return denied

    logs = UserActionLog.objects.filter(session__user=profile)
    total_actions = logs.count()
    session_count = BacktestSession.objects.filter(user=profile).count()

    action_type_counts = Counter(logs.values_list('action_type', flat=True))

    timeframe_counts = Counter()
    for row in logs.filter(action_type='TIMEFRAME_CHANGED').values_list('action_data', flat=True):
        interval = (row or {}).get('interval')
        if interval:
            timeframe_counts[interval] += 1

    drawing_type_counts = Counter()
    for row in logs.filter(action_type='DRAWING_ADDED').values_list('action_data', flat=True):
        dtype = (row or {}).get('type')
        if dtype:
            drawing_type_counts[dtype] += 1

    long_count = drawing_type_counts.get('long_position', 0)
    short_count = drawing_type_counts.get('short_position', 0)

    notes_qs = UserStrategyNote.objects.filter(owner=profile)[:5]
    notes = [{'text': n.text, 'created_at': n.created_at.isoformat()} for n in notes_qs]

    messages = []
    if total_actions == 0:
        messages.append("I haven't seen any activity from you yet — once you start switching timeframes and drawing on the chart, I'll start picking up on your habits.")
    else:
        messages.append(f"I've been watching {total_actions} action{'s' if total_actions != 1 else ''} across {session_count} session{'s' if session_count != 1 else ''} so far.")

        if timeframe_counts:
            top_tf, top_tf_count = timeframe_counts.most_common(1)[0]
            messages.append(f"You reach for the {top_tf} timeframe more than any other ({top_tf_count} time{'s' if top_tf_count != 1 else ''}).")

        analysis_tool_counts = Counter({
            k: v for k, v in drawing_type_counts.items() if k not in ('long_position', 'short_position')
        })
        if analysis_tool_counts:
            top_tool, top_tool_count = analysis_tool_counts.most_common(1)[0]
            readable_tool = top_tool.replace('_', ' ')
            messages.append(f"Your most-used drawing tool is {readable_tool} ({top_tool_count} time{'s' if top_tool_count != 1 else ''}).")

        if long_count or short_count:
            if long_count > short_count:
                messages.append(f"You've drawn {long_count} long position{'s' if long_count != 1 else ''} versus {short_count} short{'s' if short_count != 1 else ''} — leaning bullish.")
            elif short_count > long_count:
                messages.append(f"You've drawn {short_count} short position{'s' if short_count != 1 else ''} versus {long_count} long{'s' if long_count != 1 else ''} — leaning bearish.")
            else:
                messages.append(f"You've drawn an even {long_count} long{'s' if long_count != 1 else ''} and {short_count} short{'s' if short_count != 1 else ''} — no clear directional bias yet.")

    if notes:
        messages.append(f"You've also told me {len(notes)} thing{'s' if len(notes) != 1 else ''} about your strategy directly — I'm factoring that in too.")

    return Response({
        'total_actions': total_actions,
        'session_count': session_count,
        'action_type_counts': dict(action_type_counts),
        'timeframe_counts': dict(timeframe_counts),
        'drawing_type_counts': dict(drawing_type_counts),
        'long_count': long_count,
        'short_count': short_count,
        'notes': notes,
        'messages': messages,
    })

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

# --- Phase 3: Bot Prediction Inference ---
try:
    import torch
    import torch.nn as nn
except ImportError:
    torch = None
    nn = None
import os
from django.conf import settings

bot_model = None

if torch and nn:
    class TradingBotImitationModel(nn.Module):
        def __init__(self, input_size=3, hidden_size=64, num_classes=4):
            super(TradingBotImitationModel, self).__init__()
            self.network = nn.Sequential(
                nn.Linear(input_size, hidden_size),
                nn.ReLU(),
                nn.Linear(hidden_size, hidden_size),
                nn.ReLU(),
                nn.Linear(hidden_size, num_classes)
            )
        def forward(self, x):
            return self.network(x)

    # Load model globally to avoid reloading on every request
    try:
        weights_path = os.path.join(settings.BASE_DIR, 'trading_bot_imitation_weights.pth')
        if os.path.exists(weights_path):
            bot_model = TradingBotImitationModel()
            bot_model.load_state_dict(torch.load(weights_path))
            bot_model.eval()
    except Exception as e:
        print("Warning: Failed to load PyTorch bot model:", e)

@api_view(['POST'])
def predict_bot_action(request):
    """
    Takes the current frontend state and predicts the next action using Behavioral Cloning.
    Expected JSON: { 'timeframe': '15m', 'active_longs': 0, 'active_shorts': 0 }
    """
    if bot_model is None or torch is None:
        return Response({'error': 'Bot model not loaded on server'}, status=500)
        
    data = request.data
    timeframe = data.get('timeframe', '15m')
    tf_val = 15 if timeframe == '15m' else (60 if timeframe == '1h' else 5)
    longs = int(data.get('active_longs', 0))
    shorts = int(data.get('active_shorts', 0))
    
    # Create State Tensor [1, 3]
    state_tensor = torch.FloatTensor([[tf_val, longs, shorts]])
    
    with torch.no_grad():
        prediction = bot_model(state_tensor)
        predicted_action_idx = torch.argmax(prediction, dim=1).item()
        
    # Map back to action
    action_map = {
        0: 'TIMEFRAME_CHANGED',
        1: 'DRAWING_ADDED',
        2: 'DRAWING_MODIFIED',
        3: 'DRAWING_DELETED'
    }
    action_type = action_map.get(predicted_action_idx, 'TIMEFRAME_CHANGED')
    
    return Response({
        'predicted_action': action_type,
        'state_used': [tf_val, longs, shorts]
    })



# Settings that follow the user across devices (layouts, watchlists, chart settings, templates…).
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



FAVORITES_KEY = 'favorite_tools'


@api_view(['GET', 'POST'])
def favorite_tools(request, uid):
    """The favourite drawing tools (the favourites toolbar), in their order, kept in the account so they
    follow the trader to other devices. GET: the list ([] when none yet). POST {"favorites": [tool, …]}."""
    import json
    profile, denied = require_session(request, uid)
    if denied:
        return denied
    if request.method == 'GET':
        s = UserSetting.objects.filter(owner=profile, key=FAVORITES_KEY).first()
        try:
            favs = json.loads(s.value) if s else []
        except ValueError:
            favs = []
        return Response(favs if isinstance(favs, list) else [])
    favs = request.data.get('favorites') if isinstance(request.data, dict) else None
    if not isinstance(favs, list) or len(favs) > 200 or not all(isinstance(t, str) and 0 < len(t) <= 60 for t in favs):
        return Response({"error": "favorites must be a list of tool names"}, status=status.HTTP_400_BAD_REQUEST)
    favs = list(dict.fromkeys(favs))
    UserSetting.objects.update_or_create(owner=profile, key=FAVORITES_KEY,
                                         defaults={'value': json.dumps(favs), 'updated_at': int(timezone.now().timestamp() * 1000)})
    return Response(favs)


# --- Feedback / bug reports (from the chart's Send feedback button, or the voice assistant) ---

FEEDBACK_MAX_IMAGES = 5
FEEDBACK_MAX_IMAGE_BYTES = 5 * 1024 * 1024


def _real_image(f):
    """The image format if the upload really is a picture (decoded, not just named like one)"""
    try:
        from PIL import Image
        f.seek(0)
        with Image.open(f) as im:
            fmt = (im.format or '').lower()
            im.verify()
        f.seek(0)
        return fmt if fmt in ('png', 'jpeg', 'webp', 'gif') else None
    except Exception:
        return None


@api_view(['POST'])
@throttle_classes([FeedbackThrottle])
def submit_feedback(request):
    """Bug report / feedback from the chart's 'Send feedback' button.

    Signed-in users attribute to their TraderProfile; anonymous ones keep only
    the session key. `images` is a repeatable multipart file field. Always 200
    on success — the browser posts it fire-and-forget, same as track_failure."""
    # (anonymous reports are allowed: at most 10 an hour from one address)
    ip_key = f"feedback:{get_client_ip(request)}"
    sent = cache.get(ip_key, 0)
    if sent >= 10:
        return Response({"error": "Too many reports; try again later"}, status=status.HTTP_429_TOO_MANY_REQUESTS)
    cache.set(ip_key, sent + 1, 3600)
    owner = session_owner(request)
    session_key = session_key_of(request) or ""

    # Screenshots: a few, not too big, and really pictures (re-checked by decoding), stored under
    # names the server makes; anything else is dropped without failing the report
    image_urls = []
    try:
        for f in request.FILES.getlist('images')[:FEEDBACK_MAX_IMAGES]:
            if f.size > FEEDBACK_MAX_IMAGE_BYTES:
                continue
            fmt = _real_image(f)
            if not fmt:
                continue
            safe_name = f"fb_{secrets.token_hex(12)}.{'jpg' if fmt == 'jpeg' else fmt}"
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
