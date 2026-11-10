from django.db import models

class TraderProfile(models.Model):
    uid = models.CharField(max_length=128, unique=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    # (with a subscription, every tier has premium; 'basic' has it without the voice assistant and the
    # replay like the live market: core/access.py's extras)
    tier = models.CharField(max_length=20, default='free', choices=[('free', 'Free'), ('pro', 'Pro'), ('basic', 'Premium without voice & live replay')])
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

class FailedRequest(models.Model):
    """A single user request that did NOT come back to the user successfully.

    Captured two ways: a Django after-response middleware records every failed
    /api/users/* call (source='backend'), and a browser self-report endpoint records
    failures the middleware never sees — Next.js /api/* data-route errors and cloud-sync
    misses (source='frontend'). Only failures are stored; successes are dropped on the way.
    """
    class Source(models.TextChoices):
        BACKEND = "backend", "Backend (Django)"
        FRONTEND = "frontend", "Frontend (browser)"

    user = models.ForeignKey(TraderProfile, on_delete=models.SET_NULL,
                             null=True, blank=True, related_name='failed_requests')
    session_key = models.CharField(max_length=255, blank=True)
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.BACKEND)
    path = models.CharField(max_length=300)            # /api/users/drawings/<uid>/ or /api/stock-data
    method = models.CharField(max_length=10)
    status_code = models.PositiveIntegerField(default=0)
    reason_code = models.CharField(max_length=60, default="")    # stable code, e.g. session_expired
    reason_message = models.CharField(max_length=500, blank=True)  # the human-readable "why"
    user_agent = models.CharField(max_length=300, blank=True)
    ip = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["created_at"]),
                   models.Index(fields=["status_code"]),
                   models.Index(fields=["source", "created_at"])]

    def __str__(self):
        return f"{self.source} {self.method} {self.path} -> {self.status_code} ({self.reason_code})"

class FeedbackMessage(models.Model):
    """A user's bug report or feedback message, viewable in the Django admin.

    Accepts text, an attached image (PNG/JPG screenshot), and the chart context
    at the time of submission (symbol, interval, page URL). No session or login
    required — anonymous users can submit too (session_key may be empty).
    """
    user = models.ForeignKey(TraderProfile, on_delete=models.SET_NULL,
                             null=True, blank=True, related_name='feedback')
    session_key = models.CharField(max_length=255, blank=True)
    message   = models.TextField()
    images    = models.JSONField(default=list, blank=True)  # ["/media/feedback/...", ...] uploaded files
    symbol    = models.CharField(max_length=50, blank=True)
    interval  = models.CharField(max_length=20, blank=True)
    page_url  = models.CharField(max_length=500, blank=True)
    user_agent= models.CharField(max_length=300, blank=True)
    ip        = models.GenericIPAddressField(null=True, blank=True)
    created_at= models.DateTimeField(auto_now_add=True)
    is_read   = models.BooleanField(default=False)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["created_at"]),
                   models.Index(fields=["is_read", "created_at"])]

    def __str__(self):
        who = self.user.name if self.user else f"(anonymous {self.session_key[:8]})"
        return f"{who} — {self.message[:50]}"


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


class CollabRoom(models.Model):
    """A chart several people work on together: everyone in it sees the same symbol, interval,
    indicators and drawings live, plus a group chat and voice. Opened through its link
    (`?collab=<token>`); `link_access` says what someone who wasn't invited gets from the link."""
    LINK_ACCESS = [('restricted', 'Only people added'), ('view', 'Anyone with the link can view'), ('edit', 'Anyone with the link can edit')]
    # What's shared: the whole chart, or only a Pine script being edited together
    KINDS = [('chart', 'Chart'), ('pine', 'Pine script')]
    token = models.CharField(max_length=32, unique=True)
    kind = models.CharField(max_length=10, choices=KINDS, default='chart')
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='owned_collabs')
    name = models.CharField(max_length=120)
    link_access = models.CharField(max_length=10, choices=LINK_ACCESS, default='edit')
    symbol = models.CharField(max_length=40)
    interval = models.CharField(max_length=20)
    indicators = models.JSONField(default=list, blank=True)
    drawings = models.JSONField(default=dict, blank=True)   # symbol -> that symbol's drawings
    # The Pine script on the shared chart ({code, scriptName, overrides, colors, capital}) and the
    # alerts shared with everyone in the collab
    pine = models.JSONField(null=True, blank=True)
    alerts = models.JSONField(default=list, blank=True)
    # The Pine Editor's code, edited live by everyone allowed to (a Yjs document, base64)
    pine_doc = models.TextField(blank=True, default='')
    # Someone opening the link without access may ask the owner to let them in
    allow_requests = models.BooleanField(default=True)
    # Off: nobody but the owner can use their mic (each member's can_voice applies when on)
    allow_voice = models.BooleanField(default=True)
    # Kicked out: can't come back through the link or ask to, until added again
    kicked = models.ManyToManyField(TraderProfile, blank=True, related_name='+')
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.name} ({self.owner.name})"


class CollabMember(models.Model):
    """Someone with access to a collab chart. `last_seen` stays empty until they first open it, so
    an invite they haven't opened yet can be shown to them."""
    ROLES = [('owner', 'Owner'), ('editor', 'Can edit'), ('viewer', 'Can view')]
    room = models.ForeignKey(CollabRoom, on_delete=models.CASCADE, related_name='members')
    profile = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='collabs')
    role = models.CharField(max_length=10, choices=ROLES, default='editor')
    # What else the owner lets them do (the owner can do everything)
    can_replay = models.BooleanField(default=True)    # drive the replay everyone follows
    can_invite = models.BooleanField(default=False)   # add people
    can_voice = models.BooleanField(default=True)     # talk in the voice call
    can_alert = models.BooleanField(default=True)     # create alerts shared with the collab
    can_pine = models.BooleanField(default=True)      # edit the Pine Editor's code live
    invited_by = models.ForeignKey(TraderProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    invited_at = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('room', 'profile')

    def __str__(self):
        return f"{self.profile.name} in {self.room.name} ({self.role})"


class CollabJoinRequest(models.Model):
    """Someone without access who opened a collab's link and asked to be let in. The owner (or
    anyone allowed to add people) approves it, which adds them, or declines it."""
    STATUSES = [('pending', 'Waiting'), ('declined', 'Declined')]
    room = models.ForeignKey(CollabRoom, on_delete=models.CASCADE, related_name='join_requests')
    profile = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='+')
    status = models.CharField(max_length=10, choices=STATUSES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('room', 'profile')
        ordering = ['created_at']

    def __str__(self):
        return f"{self.profile.name} asks to join {self.room.name} ({self.status})"


class CollabMessage(models.Model):
    """A group-chat message in a collab chart (text, or a shared image / document with an optional
    caption), or a notice such as "Asha joined"."""
    room = models.ForeignKey(CollabRoom, on_delete=models.CASCADE, related_name='messages')
    author = models.ForeignKey(TraderProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    kind = models.CharField(max_length=10, choices=[('text', 'Text'), ('system', 'System'), ('file', 'File')], default='text')
    text = models.TextField(blank=True)
    # A shared file: {path (in the private collab-files folder), name, size, type, image, width, height}
    attachment = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.room.name}: {self.text[:40]}"


class Subscription(models.Model):
    """A paid period of access (core/access.py), entered in Django admin when someone pays: from,
    to, how many months / days, what they paid, a note. Someone's access runs to the latest end."""
    profile = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='subscriptions')
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    months = models.IntegerField(default=0)
    days = models.IntegerField(default=0)
    amount = models.CharField(max_length=40, blank=True)   # what they paid, as you note it (e.g. "₹1,500 UPI")
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-ends_at']

    def __str__(self):
        return f"{self.profile.name}: until {self.ends_at:%d %b %Y}"


class LockedFeature(models.Model):
    """A part of the site only someone with an active subscription may use (when `locked` is on).
    The site checks these keys: seconds, custom_interval, indicators, alerts, charts, replay, collab.
    With a free limit, people without a subscription may still have that many (3 indicators…)."""
    key = models.CharField(max_length=40, unique=True)
    label = models.CharField(max_length=100)
    locked = models.BooleanField(default=True)
    free_limit = models.PositiveIntegerField(null=True, blank=True, help_text="Without a subscription: up to this many (blank: none at all)")
    description = models.CharField(max_length=300, blank=True)

    def __str__(self):
        return f"{self.label} ({'locked' if self.locked else 'open'} without a subscription)"


class PlanSettings(models.Model):
    """One row: what someone whose subscription ended is told (how to renew)"""
    renew_message = models.TextField(default="Your subscription has ended. Contact us to renew it.")

    class Meta:
        verbose_name = "Plan settings"
        verbose_name_plural = "Plan settings"

    def __str__(self):
        return "Plan settings"


class BacktestRun(models.Model):
    """A strategy backtest saved from the chart's Strategy Tester for Analytics (core/analytics.py):
    the script, symbol and timeframe it ran on, its capital, and its list of trades as the report had it"""
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='backtest_runs')
    name = models.CharField(max_length=120)
    script = models.CharField(max_length=120, blank=True)
    language = models.CharField(max_length=10, default='pine')
    symbol = models.CharField(max_length=40)
    timeframe = models.CharField(max_length=20, blank=True)
    initial_capital = models.FloatField(default=0)
    net_profit = models.FloatField(default=0)
    trade_count = models.IntegerField(default=0)
    period_from = models.BigIntegerField(null=True, blank=True)   # ms
    period_to = models.BigIntegerField(null=True, blank=True)
    trades = models.JSONField(default=list)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class ReplaySession(models.Model):
    """A backtest session (core/analytics.py): bar replay on one symbol you come back to — where it
    is (the bar, timeframe and zoom), its own trading account as it stands (balance, positions,
    orders, trades), its own drawings, what you're testing (strategy, rules, tags, notes), how long you've spent on it,
    and whether it's active, paused or completed"""
    STATUSES = [('active', 'Active'), ('paused', 'Paused'), ('completed', 'Completed')]
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='replay_sessions')
    name = models.CharField(max_length=120)
    symbol = models.CharField(max_length=40)
    interval = models.CharField(max_length=20)            # the chart's interval ("15min", "1day"…)
    interval_label = models.CharField(max_length=20, blank=True)
    start_time = models.BigIntegerField()                 # the bar it started from (seconds)
    current_time = models.BigIntegerField()               # the bar it's on now (seconds)
    visible_bars = models.IntegerField(null=True, blank=True)   # the zoom: bars across the chart
    # How much market time it's meant to cover (optional): e.g. 3 months; end_time is the bar
    # that is (start + length, calendar months / years), so what's left = end_time - current_time
    length_value = models.IntegerField(null=True, blank=True)
    length_unit = models.CharField(max_length=10, blank=True)   # hours, days, weeks, months, years
    end_time = models.BigIntegerField(null=True, blank=True)
    initial_balance = models.FloatField(default=10000)
    account = models.JSONField(null=True, blank=True)     # the replay account (paper engine's Account)
    book = models.JSONField(null=True, blank=True)        # its positions, orders, trades… (engine's Book)
    drawings = models.JSONField(default=list)             # its own chart drawings (not the symbol's)
    strategy = models.CharField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    rules = models.JSONField(default=list)
    tags = models.JSONField(default=list)
    notes = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=STATUSES, default='active')
    time_spent = models.IntegerField(default=0)           # seconds spent replaying it
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']


class SavedReplay(models.Model):
    """Bar replay's "Save this replay" (when leaving one): per symbol, the bar it was on and the
    timeframe, so it can be continued later from the replay's starting-point menu"""
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='saved_replays')
    symbol = models.CharField(max_length=40)
    interval = models.CharField(max_length=20)
    time = models.BigIntegerField()             # the bar (seconds)
    saved_at = models.BigIntegerField()         # when it was saved (ms)

    class Meta:
        unique_together = ('owner', 'symbol')


class TradeJournal(models.Model):
    """Your journal for one trade (paper, MT5 or a saved backtest's): what you planned and saw,
    how it went, emotions, lessons, R:R notes, tags, the execution checklist and your 1–10 rating"""
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='trade_journals')
    source = models.CharField(max_length=20)       # paper / mt5 / backtest
    trade_key = models.CharField(max_length=120)   # the trade's id within its source
    symbol = models.CharField(max_length=40, blank=True)
    pre_trade = models.TextField(blank=True)
    post_trade = models.TextField(blank=True)
    emotions = models.TextField(blank=True)
    lessons = models.TextField(blank=True)
    rr_notes = models.TextField(blank=True)
    tags = models.JSONField(default=list)
    checklist = models.JSONField(default=dict)     # {followed_plan, proper_risk, good_entry, patient_exit}: bool
    rating = models.IntegerField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('owner', 'source', 'trade_key')


# ---------------------------------------------------------------- the mobile terminal (/m)
# A demo trading account per person for the mobile terminal (core/mobile.py): its positions (kept
# when closed, for History), pending orders and deals. Fills are at the live MT5 bid / ask on the
# server; SL, TP and pending orders trigger there as the ticks come in.

class MobileAccount(models.Model):
    profile = models.OneToOneField(TraderProfile, on_delete=models.CASCADE, related_name='mobile_account')
    balance = models.DecimalField(max_digits=16, decimal_places=2, default=100000)
    deposit = models.DecimalField(max_digits=16, decimal_places=2, default=100000)
    currency = models.CharField(max_length=8, default='USD')
    leverage = models.IntegerField(default=100)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.profile.name}: {self.balance} {self.currency}"


class MobilePosition(models.Model):
    account = models.ForeignKey(MobileAccount, on_delete=models.CASCADE, related_name='positions')
    symbol = models.CharField(max_length=20)
    side = models.CharField(max_length=4, choices=[('buy', 'Buy'), ('sell', 'Sell')])
    volume = models.DecimalField(max_digits=10, decimal_places=2)
    open_price = models.FloatField()
    sl = models.FloatField(null=True, blank=True)
    tp = models.FloatField(null=True, blank=True)
    open_time = models.DateTimeField()
    # closed: when, at what price, why (client / sl / tp), the profit
    close_time = models.DateTimeField(null=True, blank=True)
    close_price = models.FloatField(null=True, blank=True)
    close_reason = models.CharField(max_length=10, blank=True)
    profit = models.DecimalField(max_digits=16, decimal_places=2, null=True, blank=True)

    class Meta:
        ordering = ['-open_time']
        indexes = [models.Index(fields=['account', 'close_time']), models.Index(fields=['symbol', 'close_time'])]


class MobileOrder(models.Model):
    KINDS = [('buy_limit', 'Buy Limit'), ('sell_limit', 'Sell Limit'), ('buy_stop', 'Buy Stop'), ('sell_stop', 'Sell Stop'), ('buy', 'Buy'), ('sell', 'Sell')]
    account = models.ForeignKey(MobileAccount, on_delete=models.CASCADE, related_name='orders')
    symbol = models.CharField(max_length=20)
    kind = models.CharField(max_length=12, choices=KINDS)
    volume = models.DecimalField(max_digits=10, decimal_places=2)
    price = models.FloatField()
    sl = models.FloatField(null=True, blank=True)
    tp = models.FloatField(null=True, blank=True)
    # placed (pending) → filled / cancelled; a market order is filled at once
    status = models.CharField(max_length=10, default='placed')
    created_at = models.DateTimeField()
    done_at = models.DateTimeField(null=True, blank=True)
    position = models.ForeignKey(MobilePosition, on_delete=models.SET_NULL, null=True, blank=True, related_name='orders')

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['account', 'status']), models.Index(fields=['symbol', 'status'])]


class MobileDeal(models.Model):
    account = models.ForeignKey(MobileAccount, on_delete=models.CASCADE, related_name='deals')
    symbol = models.CharField(max_length=20)
    side = models.CharField(max_length=4)
    volume = models.DecimalField(max_digits=10, decimal_places=2)
    price = models.FloatField()
    entry = models.CharField(max_length=4)        # in / out
    profit = models.DecimalField(max_digits=16, decimal_places=2, default=0)
    position = models.ForeignKey(MobilePosition, on_delete=models.SET_NULL, null=True, blank=True, related_name='deals')
    order = models.ForeignKey(MobileOrder, on_delete=models.SET_NULL, null=True, blank=True, related_name='deals')
    reason = models.CharField(max_length=10, blank=True)
    time = models.DateTimeField()

    class Meta:
        ordering = ['-time']
