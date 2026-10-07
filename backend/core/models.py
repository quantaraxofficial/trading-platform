from django.db import models

class TraderProfile(models.Model):
    uid = models.CharField(max_length=128, unique=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    tier = models.CharField(max_length=20, default='free', choices=[('free', 'Free'), ('pro', 'Pro')])
    created_at = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.email})"

class DrawingTemplate(models.Model):
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='templates')
    name = models.CharField(max_length=100)
    tool_type = models.CharField(max_length=50) # e.g., 'line', 'rectangle'
    settings = models.JSONField() # Store all visual settings as JSON
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('owner', 'name', 'tool_type')

    def __str__(self):
        return f"{self.name} ({self.tool_type}) - {self.owner.name}"

class UserDrawing(models.Model):
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='drawings')
    symbol = models.CharField(max_length=20)
    data = models.JSONField() # Store the list of drawings for this symbol
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('owner', 'symbol')

    def __str__(self):
        return f"{self.symbol} - {self.owner.name}"

class PineScript(models.Model):
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='pine_scripts')
    name = models.CharField(max_length=100)
    script_type = models.CharField(max_length=20, default='indicator')
    code = models.TextField(blank=True)
    versions = models.JSONField(default=list, blank=True) # [{code, savedAt}]
    order = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('owner', 'name')

    def __str__(self):
        return f"{self.name} ({self.script_type}) - {self.owner.name}"

class UserSession(models.Model):
    user = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='sessions')
    session_key = models.CharField(max_length=255, unique=True)
    device_info = models.CharField(max_length=255, blank=True)
    last_active = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.user.name} - {self.session_key}"

class ChartState(models.Model):
    owner = models.OneToOneField(TraderProfile, on_delete=models.CASCADE, related_name='chart_state')
    symbol = models.CharField(max_length=20, default='XAU/USD')
    interval = models.CharField(max_length=20, default='15m')
    timestamp = models.BigIntegerField(null=True, blank=True)
    bar_spacing = models.FloatField(null=True, blank=True)
    indicators = models.JSONField(default=list, blank=True)
    favorite_timeframes = models.JSONField(default=list, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.owner.name} Chart State'

class BacktestSession(models.Model):
    user = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='backtest_sessions')
    symbol = models.CharField(max_length=20)
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self):
        return f"{self.user.name} - {self.symbol} ({self.start_time})"

class UserStrategyNote(models.Model):
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='strategy_notes')
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.owner.name} strategy note ({self.created_at})"

class UserActionLog(models.Model):
    session = models.ForeignKey(BacktestSession, on_delete=models.CASCADE, related_name='actions')
    timestamp = models.DateTimeField(auto_now_add=True)
    action_type = models.CharField(max_length=50) # 'TIMEFRAME_CHANGE', 'TOOL_SELECTED', 'DRAWING_ADDED', 'TRADE_EXECUTED'
    action_data = models.JSONField() # Payload of the action (e.g. timeframe, shape coordinates)
    market_state = models.JSONField(null=True, blank=True) # Optional: current OHLCV or technical state snapshot

    def __str__(self):
        return f"{self.action_type} at {self.timestamp}"

class UserSetting(models.Model):
    """One synced app setting of a user (a saved layout list, watchlists, chart settings…), so they
    follow the user across devices. `value` is the JSON text the browser keeps for that key;
    `updated_at` is the browser's own change time (ms), the newer copy wins."""
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='settings')
    key = models.CharField(max_length=100)
    value = models.TextField()
    updated_at = models.BigIntegerField(default=0)

    class Meta:
        unique_together = ('owner', 'key')

    def __str__(self):
        return f"{self.owner.name}: {self.key}"
