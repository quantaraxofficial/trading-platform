from django.db import models

class TraderProfile(models.Model):
    uid = models.CharField(max_length=128, unique=True)
    name = models.CharField(max_length=255)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True, null=True)
    tier = models.CharField(max_length=20, default='free', choices=[('free', 'Free'), ('pro', 'Pro')])
    created_at = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(auto_now=True)
    # The public profile (core/social.py): how people find you (@username), a bio, what it shows
    # (each off until you turn it on) and who may message you or invite you to a collab
    username = models.CharField(max_length=30, unique=True, null=True, blank=True)
    bio = models.CharField(max_length=300, blank=True)
    show_trading_stats = models.BooleanField(default=False)
    show_backtests = models.BooleanField(default=False)
    show_sessions = models.BooleanField(default=False)
    allow_messages = models.CharField(max_length=10, default='everyone')   # everyone / following / nobody
    allow_invites = models.CharField(max_length=10, default='everyone')
    stats_snapshot = models.JSONField(null=True, blank=True)   # the trading stats you chose to show
    stats_updated_at = models.DateTimeField(null=True, blank=True)

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
    # The group chat's look, set by the admin or a controller (core/collab.py clean_chat_theme):
    # colours, and a background photo (a data URL, served on its own)
    chat_theme = models.JSONField(null=True, blank=True)
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
    # How far they've read the collab's group chat (for "Seen by")
    chat_read_at = models.DateTimeField(null=True, blank=True)

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
    # ('signal': a copy channel's signal posted here, its card in `attachment`, see copy_share.py)
    kind = models.CharField(max_length=10, choices=[('text', 'Text'), ('system', 'System'), ('file', 'File'), ('signal', 'Signal')], default='text')
    text = models.TextField(blank=True)
    # A shared file: {path (in the private collab-files folder), name, size, type, image, width, height}
    attachment = models.JSONField(null=True, blank=True)
    # A private message to one person in the collab (only they and the author see it); empty: the group
    recipient = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, null=True, blank=True, related_name='+')
    read_at = models.DateTimeField(null=True, blank=True)   # when the recipient of a private one read it
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']

    def __str__(self):
        return f"{self.room.name}: {self.text[:40]}"


class ChatGroup(models.Model):
    """A group chat made in the Chats panel: people from your collabs (or groups) talking together,
    apart from any collab. Its admins name it, choose who's in it and set its theme."""
    token = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=80)
    created_by = models.ForeignKey(TraderProfile, on_delete=models.SET_NULL, null=True, related_name='+')
    # Its look (same shape as a collab's chat_theme: colours, font, a background photo)
    theme = models.JSONField(null=True, blank=True)
    # A one-to-one chat started from someone's profile: the two uids, sorted ("a|b")
    direct_key = models.CharField(max_length=260, unique=True, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name


class ChatGroupMember(models.Model):
    ROLES = [('admin', 'Admin'), ('member', 'Member')]
    group = models.ForeignKey(ChatGroup, on_delete=models.CASCADE, related_name='members')
    profile = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='chat_groups')
    role = models.CharField(max_length=10, choices=ROLES, default='member')
    joined_at = models.DateTimeField(auto_now_add=True)
    last_read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('group', 'profile')
        ordering = ['joined_at']


class ChatGroupMessage(models.Model):
    """A message in a group chat: text, a shared picture / document (attachment, as in collab
    chats), or a notice such as "Asha added Ravi"."""
    group = models.ForeignKey(ChatGroup, on_delete=models.CASCADE, related_name='messages')
    author = models.ForeignKey(TraderProfile, on_delete=models.SET_NULL, null=True, blank=True, related_name='+')
    kind = models.CharField(max_length=10, choices=[('text', 'Text'), ('system', 'System'), ('file', 'File'), ('signal', 'Signal')], default='text')
    text = models.TextField(blank=True)
    attachment = models.JSONField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class ChatPresence(models.Model):
    """Someone's presence in chats: when they were last on the site, what they're typing in (a
    conversation's key, for a few seconds), and their privacy choices: whether others see their
    read receipts, that they're typing, and their last seen / online. Read receipts and last seen
    work both ways: turned off, you don't see other people's either."""
    profile = models.OneToOneField(TraderProfile, on_delete=models.CASCADE, related_name='presence')
    last_seen = models.DateTimeField(null=True, blank=True)
    typing_key = models.CharField(max_length=120, blank=True, default='')
    typing_at = models.DateTimeField(null=True, blank=True)
    read_receipts = models.BooleanField(default=True)
    show_typing = models.BooleanField(default=True)
    show_last_seen = models.BooleanField(default=True)


class BrokerAccount(models.Model):
    """A broker account linked to the site to trade on (core/broker_mt5.py): for MetaTrader 5 the
    account number, its server and its password (encrypted; never sent to the browser), and
    what the broker said about it when it was last reached."""
    PLATFORMS = [('mt5', 'MetaTrader 5')]
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='broker_accounts')
    platform = models.CharField(max_length=10, choices=PLATFORMS, default='mt5')
    login = models.BigIntegerField()
    server = models.CharField(max_length=100)
    password = models.TextField()
    name = models.CharField(max_length=100, blank=True)
    company = models.CharField(max_length=100, blank=True)
    currency = models.CharField(max_length=10, blank=True)
    leverage = models.IntegerField(default=0)
    mode = models.CharField(max_length=10, default='real')   # demo / contest / real
    created_at = models.DateTimeField(auto_now_add=True)
    last_connected_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('owner', 'platform')

    def __str__(self):
        return f"{self.owner.name}: {self.get_platform_display()} {self.login} @ {self.server}"


class AlgoStrategy(models.Model):
    """A chart strategy (Pine / Python / MQL5) that trades your linked MT5 account
    (core/broker_algo.py): its identity on the chart (script, symbol, timeframe), the lots it
    trades, whether it's on, and the strategy position it last acted on — so the same signal is
    never traded twice, however many times the chart reports it."""
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='algo_strategies')
    key = models.CharField(max_length=200)   # "<script>|<symbol>|<timeframe>"
    name = models.CharField(max_length=100)
    symbol = models.CharField(max_length=40)
    timeframe = models.CharField(max_length=20)
    lots = models.FloatField(default=0.01)
    enabled = models.BooleanField(default=False)
    real_confirmed = models.BooleanField(default=False)   # "I understand this trades real money"
    last_key = models.CharField(max_length=80, blank=True)   # "long@<entry time>", "short@…" or "flat"
    failed_key = models.CharField(max_length=80, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('owner', 'key')

    def __str__(self):
        return f"{self.owner.name}: {self.name} on {self.symbol} {self.timeframe}"


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


class Follow(models.Model):
    """Following someone: you're told when they publish a new indicator or strategy"""
    follower = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='following_set')
    following = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='followers_set')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('follower', 'following')


class PublishedScript(models.Model):
    """An indicator or strategy published from the Pine editor (core/social.py): public — anyone
    finds it in Indicators and on its author's profile — or private — only its author and the
    people they invite. Republishing the same editor script makes a new version."""
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='published_scripts')
    source_key = models.CharField(max_length=120)          # the editor script it comes from
    name = models.CharField(max_length=100)
    kind = models.CharField(max_length=10, default='indicator')   # indicator / strategy
    language = models.CharField(max_length=10, default='pine')
    description = models.TextField(blank=True)
    code = models.TextField()
    visibility = models.CharField(max_length=10, default='public')   # public / private
    invited = models.ManyToManyField(TraderProfile, blank=True, related_name='shared_scripts')
    # Who may read its code: everyone who can use it ('open'), only its author ('hidden'), or the
    # author and code_viewers ('allowed'). Everyone else gets `compiled` instead — the parsed program
    # with comments and the author's names gone (lib/pineScriptEngine compilePineForSharing) — and
    # their chart runs that. Pine Script only (MQL5 compiles to JavaScript, Python runs as itself).
    code_access = models.CharField(max_length=10, default='open')
    code_viewers = models.ManyToManyField(TraderProfile, blank=True, related_name='code_shared_scripts')
    compiled = models.JSONField(null=True, blank=True)
    version = models.IntegerField(default=1)
    uses = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('owner', 'source_key')


class Notification(models.Model):
    """Something to tell someone: a person they follow published a script, someone followed them,
    shared a private script with them, or invited them to a collab"""
    recipient = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='notifications')
    actor = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, null=True, blank=True, related_name='+')
    kind = models.CharField(max_length=20)
    text = models.CharField(max_length=300)
    data = models.JSONField(default=dict)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-id']


class CopyChannel(models.Model):
    """A trade-copying channel (core/copier.py): a provider's signals — from their own MT5 account
    (mirrored) or sent from the site — are placed straight on every subscriber's broker account,
    sized by risk % of the subscriber's own equity."""
    owner = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='copy_channels')
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    code = models.CharField(max_length=12, unique=True)        # what subscribers join with
    default_risk = models.FloatField(default=1.0)               # % of equity per trade, when a signal doesn't say
    max_slippage = models.FloatField(default=25.0)              # % of the stop distance a copy may be late by
    mirror_mt5 = models.BooleanField(default=False)             # copy the owner's own MT5 trades
    mirror_since = models.DateTimeField(null=True, blank=True)  # positions opened before this aren't copied
    active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)


class CopySubscription(models.Model):
    """Someone following a channel: whether their broker account copies it automatically, and their
    own limits — risk per trade, open trades, a daily loss limit, the symbols they take"""
    channel = models.ForeignKey(CopyChannel, on_delete=models.CASCADE, related_name='subscriptions')
    subscriber = models.ForeignKey(TraderProfile, on_delete=models.CASCADE, related_name='copy_subscriptions')
    auto_copy = models.BooleanField(default=False)
    risk_mode = models.CharField(max_length=10, default='signal')   # 'signal': the signal's risk %; 'fixed': risk_percent
    risk_percent = models.FloatField(default=1.0)
    max_risk = models.FloatField(default=2.0)                   # never more than this % per trade
    no_sl_lots = models.FloatField(default=0)                   # lots for a signal without a stop loss (0: skip it)
    max_open = models.IntegerField(default=5)
    daily_loss_limit = models.FloatField(default=5.0)           # % of balance; 0: none
    symbols = models.JSONField(default=list)                    # [] = all
    real_confirmed = models.BooleanField(default=False)
    terminal_status = models.CharField(max_length=20, default='off')   # off / starting / connected / error
    terminal_error = models.CharField(max_length=300, blank=True)
    terminal_seen = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('channel', 'subscriber')


class CopySignal(models.Model):
    """One instruction from the provider: open (symbol, side, entry, SL, TP, risk %), modify (new
    SL / TP) or close (all or a fraction) of the position the provider calls `ref`"""
    KINDS = [('open', 'Open'), ('modify', 'Modify'), ('close', 'Close')]
    channel = models.ForeignKey(CopyChannel, on_delete=models.CASCADE, related_name='signals')
    kind = models.CharField(max_length=10, choices=KINDS)
    ref = models.CharField(max_length=40)                       # the provider's position (MT5 ticket, or a site id)
    source = models.CharField(max_length=10, default='site')    # site / mt5
    symbol = models.CharField(max_length=40, blank=True)
    side = models.CharField(max_length=4, blank=True)           # buy / sell
    entry = models.FloatField(null=True, blank=True)
    sl = models.FloatField(null=True, blank=True)
    tp = models.FloatField(null=True, blank=True)
    risk_percent = models.FloatField(null=True, blank=True)
    fraction = models.FloatField(default=1.0)                   # close: how much of the position
    volume = models.FloatField(null=True, blank=True)           # the provider's lots (MT5 mirror), for partial closes
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']


class CopyExecution(models.Model):
    """What a signal did on one subscriber's broker account"""
    signal = models.ForeignKey(CopySignal, on_delete=models.CASCADE, related_name='executions')
    subscription = models.ForeignKey(CopySubscription, on_delete=models.CASCADE, related_name='executions')
    status = models.CharField(max_length=10)                    # filled / modified / closed / skipped / failed
    ticket = models.BigIntegerField(null=True, blank=True)      # the subscriber's position
    symbol = models.CharField(max_length=40, blank=True)
    volume = models.FloatField(null=True, blank=True)
    price = models.FloatField(null=True, blank=True)
    sl = models.FloatField(null=True, blank=True)
    tp = models.FloatField(null=True, blank=True)
    message = models.CharField(max_length=300, blank=True)
    latency_ms = models.IntegerField(null=True, blank=True)     # from the signal to the broker's answer
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-id']
        unique_together = ('signal', 'subscription')


class CopyConnection(models.Model):
    """Where a copy channel's signals are posted as well (core/copy_share.py): a Telegram channel or
    group (through the owner's bot), a Discord channel (its webhook), WhatsApp numbers (the owner's
    WhatsApp Cloud API number), or one of the owner's chats here: a group, a personal chat or a
    collab. The tokens are kept encrypted and never sent back to the browser."""
    KINDS = [('telegram', 'Telegram'), ('discord', 'Discord'), ('whatsapp', 'WhatsApp'), ('group', 'Group chat'), ('collab', 'Collab chat')]
    channel = models.ForeignKey(CopyChannel, on_delete=models.CASCADE, related_name='connections')
    kind = models.CharField(max_length=10, choices=KINDS)
    label = models.CharField(max_length=200, blank=True)        # what it is, as the platform names it
    target = models.CharField(max_length=260, blank=True)       # Telegram chat id / WhatsApp number id / a chat's token
    secret = models.TextField(blank=True)                       # encrypted: bot token / webhook URL / access token
    options = models.JSONField(default=dict, blank=True)        # WhatsApp: recipients, template, language
    post_open = models.BooleanField(default=True)
    post_modify = models.BooleanField(default=True)
    post_close = models.BooleanField(default=True)
    enabled = models.BooleanField(default=True)
    last_at = models.DateTimeField(null=True, blank=True)
    last_ok = models.BooleanField(null=True)
    last_error = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']


class CopyPost(models.Model):
    """One signal posted to one connection: its id there (to reply to the trade's first post on
    Telegram), or why it failed"""
    connection = models.ForeignKey(CopyConnection, on_delete=models.CASCADE, related_name='posts')
    signal = models.ForeignKey(CopySignal, on_delete=models.CASCADE, related_name='posts')
    ok = models.BooleanField(default=False)
    external_id = models.CharField(max_length=100, blank=True)
    error = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('connection', 'signal')


class CopierHeartbeat(models.Model):
    """The copier service (manage.py run_copier) saying it's alive, and how many terminals it runs"""
    host = models.CharField(max_length=100, unique=True)
    seen = models.DateTimeField()
    terminals = models.IntegerField(default=0)
    connected = models.IntegerField(default=0)


class AlgoLog(models.Model):
    """What an auto-traded strategy did on the broker: switched on/off, opened, closed, skipped, failed"""
    strategy = models.ForeignKey(AlgoStrategy, on_delete=models.CASCADE, related_name='log')
    at = models.DateTimeField(auto_now_add=True)
    action = models.CharField(max_length=20)
    message = models.CharField(max_length=300)
    ok = models.BooleanField(default=True)

    class Meta:
        ordering = ['-at', '-id']
