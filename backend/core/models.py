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

class GitHubLink(models.Model):
    """A user's connected GitHub account, for pushing and pulling scripts. The token (a personal
    access token the user created) is encrypted (core/github.py) and never sent to the browser."""
    owner = models.OneToOneField(TraderProfile, on_delete=models.CASCADE, related_name='github')
    login = models.CharField(max_length=100)
    avatar_url = models.CharField(max_length=300, blank=True)
    token = models.TextField()
    created_at = models.DateTimeField()

    def __str__(self):
        return f"{self.owner.name} as {self.login}"


class PineScript(models.Model):
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='pine_scripts')
    name = models.CharField(max_length=100)
    script_type = models.CharField(max_length=20, default='indicator')
    # The language the script is written in: Pine Script, Python or MQL5
    language = models.CharField(max_length=10, default='pine', choices=[('pine', 'Pine Script'), ('python', 'Python'), ('mql5', 'MQL5')])
    code = models.TextField(blank=True)
    versions = models.JSONField(default=list, blank=True) # [{code, savedAt}]
    order = models.IntegerField(default=0)
    # The GitHub file it's linked to, for one-click push / pull: {repo, branch, path, sha}
    github = models.JSONField(default=dict, blank=True)
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
    """A group-chat message in a collab chart, or a notice such as "Asha joined"."""
    room = models.ForeignKey(CollabRoom, on_delete=models.CASCADE, related_name='messages')
    author = models.ForeignKey(TraderProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    kind = models.CharField(max_length=10, choices=[('text', 'Text'), ('system', 'System')], default='text')
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.room.name}: {self.text[:40]}"
