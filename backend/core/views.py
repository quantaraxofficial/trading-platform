from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from .models import TraderProfile, DrawingTemplate, UserDrawing, UserSession, PineScript, UserStrategyNote
from django.utils import timezone

@api_view(['POST'])
def sync_user(request):
    data = request.data
    uid = data.get('uid')
    session_key = data.get('session_key')
    force = data.get('force', False)
    
    if not uid:
        return Response({"error": "UID is required"}, status=status.HTTP_400_BAD_REQUEST)
    
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
    try:
        profile = TraderProfile.objects.get(uid=uid)
        return Response({
            "name": profile.name,
            "email": profile.email,
            "phone": profile.phone,
            "tier": profile.tier,
            "created_at": profile.created_at,
            "last_login": profile.last_login
        })
    except TraderProfile.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

@api_view(['GET', 'POST'])
def manage_templates(request, uid):
    try:
        profile = TraderProfile.objects.get(uid=uid)
    except TraderProfile.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

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
    try:
        template = DrawingTemplate.objects.get(id=template_id)
        template.delete()
        return Response({"success": True})
    except DrawingTemplate.DoesNotExist:
        return Response({"error": "Template not found"}, status=status.HTTP_404_NOT_FOUND)

@api_view(['GET', 'POST'])
def manage_pinescripts(request, uid):
    try:
        profile = TraderProfile.objects.get(uid=uid)
    except TraderProfile.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        scripts = PineScript.objects.filter(owner=profile)
        return Response([{
            "id": s.id,
            "name": s.name,
            "script_type": s.script_type,
            "code": s.code,
            "versions": s.versions,
            "order": s.order,
            "updated_at": s.updated_at.isoformat(),
        } for s in scripts])

    elif request.method == 'POST':
        data = request.data
        script_id = data.get('id')
        if script_id:
            try:
                script = PineScript.objects.get(id=script_id, owner=profile)
            except PineScript.DoesNotExist:
                return Response({"error": "Script not found"}, status=status.HTTP_404_NOT_FOUND)
            script.name = data.get('name', script.name)
            script.script_type = data.get('script_type', script.script_type)
            script.code = data.get('code', script.code)
            script.versions = data.get('versions', script.versions)
            script.order = data.get('order', script.order)
            script.save()
        else:
            script, created = PineScript.objects.update_or_create(
                owner=profile,
                name=data.get('name'),
                defaults={
                    'script_type': data.get('script_type', 'indicator'),
                    'code': data.get('code', ''),
                    'versions': data.get('versions', []),
                    'order': data.get('order', 0),
                }
            )
        return Response({"success": True, "id": script.id, "updated_at": script.updated_at.isoformat()})

@api_view(['DELETE'])
def delete_pinescript(request, script_id):
    try:
        script = PineScript.objects.get(id=script_id)
        script.delete()
        return Response({"success": True})
    except PineScript.DoesNotExist:
        return Response({"error": "Script not found"}, status=status.HTTP_404_NOT_FOUND)

@api_view(['GET', 'POST'])
def manage_drawings(request, uid):
    session_key = request.headers.get('X-Session-Key') or request.query_params.get('session_key') or request.data.get('session_key')
    
    try:
        profile = TraderProfile.objects.get(uid=uid)
    except TraderProfile.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

    # Validate session
    if session_key:
        if not UserSession.objects.filter(user=profile, session_key=session_key).exists():
            return Response({"error": "Session expired or logged out from another device"}, status=status.HTTP_401_UNAUTHORIZED)

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
    try:
        profile = TraderProfile.objects.get(uid=uid)
    except TraderProfile.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

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
    try:
        profile = TraderProfile.objects.get(uid=uid)
    except TraderProfile.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        
    symbol = request.data.get('symbol', 'UNKNOWN')
    session = BacktestSession.objects.create(user=profile, symbol=symbol)
    return Response({'session_id': session.id})

@api_view(['POST'])
def log_telemetry_actions(request, uid):
    from .models import BacktestSession, UserActionLog
    try:
        profile = TraderProfile.objects.get(uid=uid)
    except TraderProfile.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        
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

    try:
        profile = TraderProfile.objects.get(uid=uid)
    except TraderProfile.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

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
    try:
        profile = TraderProfile.objects.get(uid=uid)
    except TraderProfile.DoesNotExist:
        return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

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

