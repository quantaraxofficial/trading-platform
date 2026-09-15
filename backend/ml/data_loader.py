import os
import django
import sys
import pandas as pd
import json
from datetime import datetime

# Setup Django Environment to access models
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'quantarax_backend.settings')
django.setup()

from core.models import UserActionLog, BacktestSession

def fetch_telemetry_data(user_uid=None):
    """
    Fetches raw telemetry data from the Django database.
    """
    query = UserActionLog.objects.all()
    if user_uid:
        query = query.filter(session__user__uid=user_uid)
        
    query = query.order_by('session_id', 'timestamp')
    
    data = []
    for log in query:
        data.append({
            'session_id': log.session_id,
            'timestamp': log.timestamp.isoformat(),
            'action_type': log.action_type,
            'action_data': log.action_data,
            'market_state': log.market_state
        })
        
    return pd.DataFrame(data)

def preprocess_for_behavioral_cloning(df):
    """
    Converts raw telemetry logs into State/Action pairs for the ML model.
    State: Numerical representation of the chart (timeframe, drawings present).
    Action: The action the user took.
    """
    if df.empty:
        return None, None
        
    # We will build a simple state vector.
    # Feature 1: Current Timeframe (One-hot encoded or integer mapped)
    # Feature 2: Has active long position? (0 or 1)
    # Feature 3: Has active short position? (0 or 1)
    # Target: The action taken (encoded as an integer classification)
    
    # This is a highly simplified feature extraction. 
    # A real RL agent would use CNNs on the `market_state` OHLCV array.
    
    states = []
    actions = []
    
    # State tracking variables per session
    current_timeframe = '15m'
    active_longs = 0
    active_shorts = 0
    
    action_map = {
        'TIMEFRAME_CHANGED': 0,
        'DRAWING_ADDED': 1,
        'DRAWING_MODIFIED': 2,
        'DRAWING_DELETED': 3
    }
    
    for _, row in df.iterrows():
        # 1. Capture current state BEFORE the action
        timeframe_val = 15 if current_timeframe == '15m' else (60 if current_timeframe == '1h' else 5)
        state_vector = [timeframe_val, active_longs, active_shorts]
        
        # 2. Process the action to update the state for the NEXT step
        action_type = row['action_type']
        action_data = row.get('action_data', {})
        
        if action_type == 'TIMEFRAME_CHANGED':
            current_timeframe = action_data.get('interval', current_timeframe)
        elif action_type == 'DRAWING_ADDED':
            dtype = action_data.get('type')
            if dtype == 'long_position':
                active_longs += 1
            elif dtype == 'short_position':
                active_shorts += 1
        elif action_type == 'DRAWING_DELETED':
            # Simplified decrement
            pass
            
        # 3. Append to our training set
        target_action = action_map.get(action_type, -1)
        if target_action != -1:
            states.append(state_vector)
            actions.append(target_action)
            
    return pd.DataFrame(states, columns=['timeframe', 'active_longs', 'active_shorts']), pd.Series(actions)

if __name__ == "__main__":
    df = fetch_telemetry_data()
    print(f"Loaded {len(df)} telemetry logs.")
    if not df.empty:
        X, y = preprocess_for_behavioral_cloning(df)
        print("Feature Vector (State):")
        print(X.head())
        print("\nTarget Vector (Action):")
        print(y.head())
