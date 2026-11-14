from django.contrib import admin
from .models import TraderProfile, BacktestSession, UserActionLog, FailedRequest, CollabRoom, CollabMember, CollabMessage, CollabJoinRequest, GitHubLink, BrokerAccount, AlgoStrategy, AlgoLog, BacktestRun, TradeJournal, ReplaySession, SavedReplay, CopyChannel, CopySubscription, CopySignal, CopyExecution, Follow, PublishedScript, Notification
from .models import FeedbackMessage, Payment, Earning
from django.contrib import messages
from django.template.response import TemplateResponse
from django.utils import timezone
from django.utils.html import format_html, format_html_join


class ActiveNowFilter(admin.SimpleListFilter):
    """Who has the site open right now (core/presence.py)"""
    title = 'activity'
    parameter_name = 'online'

    def lookups(self, request, model_admin):
        return [('now', 'Active now'), ('today', 'Seen in the last 24 hours')]

    def queryset(self, request, qs):
        from .presence import ACTIVE_WINDOW
        now = timezone.now()
        if self.value() == 'now':
            return qs.filter(last_seen__gte=now - ACTIVE_WINDOW)
        if self.value() == 'today':
            return qs.filter(last_seen__gte=now - timezone.timedelta(days=1))
        return qs


class PaymentInline(admin.TabularInline):
    """What they've paid (adds up in Earnings)"""
    model = Payment
    extra = 0
    fields = ('paid_at', 'amount', 'currency', 'method', 'note')

@admin.register(FailedRequest)
class FailedRequestAdmin(admin.ModelAdmin):
    """Why a user's request did not come back: who, which endpoint, status, and the reason."""
    list_display = ("created_at", "user", "source", "path", "method", "status_code", "reason_code", "ip")
    list_filter = ("source", "status_code", "reason_code", "user")
    date_hierarchy = "created_at"  # day/week/month drill-down (change_list block; the default admin index template doesn't render list_filter)
    search_fields = ("path", "reason_message", "user__name", "user__email", "session_key")
    readonly_fields = ("created_at", "user", "session_key", "source", "path",
                       "method", "status_code", "reason_code", "reason_message",
                       "user_agent", "ip")
    ordering = ("-created_at",)

    def has_add_permission(self, request):
        return False   # records are system-generated, not hand-entered
    def has_change_permission(self, request, obj=None):
        return False   # read-only detail view

from .categories_admin import TraderCategoriesMixin  # noqa: E402  (student categories)


@admin.register(TraderProfile)
class TraderProfileAdmin(TraderCategoriesMixin, admin.ModelAdmin):
    list_display = ('name', 'online', 'email', 'phone', 'tier', 'came_from', 'categories_col', 'created_at', 'last_login', 'presence_dot')
    list_filter = (ActiveNowFilter, 'tier', 'source_kind', 'categories', 'created_at')
    filter_horizontal = ('categories',)
    search_fields = ('name', 'email', 'phone', 'uid', 'source', 'campaign')
    exclude = ('arrival',)
    readonly_fields = ('arrival_details',)

    @admin.display(description='Came from', ordering='source_kind')
    def came_from(self, obj):
        from .arrival import label
        return label(obj) or '—'

    @admin.display(description='Arrival details')
    def arrival_details(self, obj):
        # what their browser noted on the first visit (the link's utm_ fields, a referral code, the site before)
        names = {'utm_source': 'Source', 'utm_medium': 'Medium', 'utm_campaign': 'Campaign', 'utm_term': 'Term',
                 'utm_content': 'Content', 'ref': 'Referral code', 'gclid': 'Google ad click', 'fbclid': 'Facebook click',
                 'referrer': 'From the site', 'landing': 'Landed on', 'at': 'First visit'}
        a = obj.arrival or {}
        if not a:
            return 'Not recorded (signed up before this was kept)' if not obj.source_kind else '—'
        return format_html_join('', '<div><span class="tp-muted">{}:</span> {}</div>',
                                ((names.get(k, k), 'yes' if v is True else v) for k, v in a.items()))
    ordering = ('-created_at',)
    inlines = [PaymentInline]

    @admin.display(description='')
    def presence_dot(self, obj):
        # a glowing green dot while they're on the site (the last 2 minutes), red otherwise
        from .presence import ACTIVE_WINDOW
        on = bool(obj.last_seen and timezone.now() - obj.last_seen <= ACTIVE_WINDOW)
        return format_html('<span class="tp-dot {}" title="{}"></span>', 'on' if on else 'off', 'Active now' if on else 'Not on the site')

    @admin.display(description='Online', ordering='-last_seen')
    def online(self, obj):
        from .presence import ACTIVE_WINDOW
        if not obj.last_seen:
            return '—'
        ago = timezone.now() - obj.last_seen
        if ago <= ACTIVE_WINDOW:
            return format_html('<b style="color:#1a7f37">● Active now</b>{}', f' · {obj.last_where}' if obj.last_where else '')
        mins = int(ago.total_seconds() // 60)
        return f'{mins} min ago' if mins < 60 else f'{mins // 60} h ago' if mins < 1440 else f'{mins // 1440} d ago'

    def changelist_view(self, request, extra_context=None):
        # how many are on the site right now, and who, above the list
        from .presence import active_now
        people = list(active_now()[:50])
        if people:
            names = ', '.join(f'{p.name} ({p.last_where or "site"})' for p in people)
            self.message_user(request, f'Active now: {len(people)} — {names}', messages.INFO)
        else:
            self.message_user(request, 'Active now: 0', messages.INFO)
        return super().changelist_view(request, extra_context)

@admin.register(BacktestSession)
class BacktestSessionAdmin(admin.ModelAdmin):
    list_display = ('user', 'symbol', 'start_time', 'end_time', 'is_active')
    list_filter = ('is_active', 'start_time')
    search_fields = ('user__name', 'symbol')

@admin.register(UserActionLog)
class UserActionLogAdmin(admin.ModelAdmin):
    list_display = ('session', 'action_type', 'timestamp')
    list_filter = ('action_type', 'timestamp')
    search_fields = ('session__user__name', 'action_type')


class CollabMemberInline(admin.TabularInline):
    model = CollabMember
    fk_name = "room"
    extra = 0
    fields = ("profile", "role", "can_replay", "can_invite", "can_voice", "can_alert", "can_pine", "invited_by", "invited_at", "last_seen")
    readonly_fields = ("invited_at", "last_seen")
    raw_id_fields = ("profile", "invited_by")


@admin.register(CollabRoom)
class CollabRoomAdmin(admin.ModelAdmin):
    """Collab charts: who owns them, who's in them, and their link access."""
    list_display = ("name", "owner", "symbol", "interval", "link_access", "allow_requests", "allow_voice", "active", "updated_at")
    list_filter = ("active", "link_access", "allow_requests", "allow_voice")
    raw_id_fields = ("owner", "kicked")
    search_fields = ("name", "token", "owner__name", "owner__email")
    readonly_fields = ("token", "created_at", "updated_at")
    exclude = ("pine_doc",)
    inlines = [CollabMemberInline]


@admin.register(CollabMember)
class CollabMemberAdmin(admin.ModelAdmin):
    """Who is in which collab chart and what each may do; changes reach people who are online
    right away."""
    list_display = ("profile", "room", "role", "can_replay", "can_invite", "can_voice", "can_alert", "can_pine", "last_seen")
    list_editable = ("role", "can_replay", "can_invite", "can_voice", "can_alert", "can_pine")
    list_filter = ("role", "room")
    search_fields = ("profile__name", "profile__email", "room__name")
    raw_id_fields = ("profile", "invited_by", "room")


@admin.register(CollabJoinRequest)
class CollabJoinRequestAdmin(admin.ModelAdmin):
    """People who opened a collab's link without access and asked to be let in"""
    list_display = ("profile", "room", "status", "created_at")
    list_filter = ("status",)
    search_fields = ("profile__name", "profile__email", "room__name")
    raw_id_fields = ("profile", "room")


@admin.register(CollabMessage)
class CollabMessageAdmin(admin.ModelAdmin):
    list_display = ("created_at", "room", "author", "kind", "text")
    list_filter = ("kind",)
    search_fields = ("text", "room__name", "author__name")


@admin.register(GitHubLink)
class GitHubLinkAdmin(admin.ModelAdmin):
    """Connected GitHub accounts (the token is encrypted and not shown)"""
    list_display = ("owner", "login", "created_at")
    search_fields = ("owner__name", "owner__email", "login")
    exclude = ("token",)
    readonly_fields = ("owner", "login", "avatar_url", "created_at")


@admin.register(BrokerAccount)
class BrokerAccountAdmin(admin.ModelAdmin):
    """Linked broker accounts (the password is encrypted and not shown)"""
    list_display = ("owner", "platform", "login", "server", "mode", "currency", "last_connected_at")
    list_filter = ("platform", "mode")
    search_fields = ("owner__name", "owner__email", "login", "server")
    exclude = ("password",)
    readonly_fields = ("owner", "platform", "login", "server", "name", "company", "currency", "leverage", "mode", "created_at", "last_connected_at")


@admin.register(AlgoStrategy)
class AlgoStrategyAdmin(admin.ModelAdmin):
    """Chart strategies auto-trading linked MT5 accounts"""
    list_display = ("owner", "name", "symbol", "timeframe", "lots", "enabled", "last_key", "updated_at")
    list_filter = ("enabled",)
    search_fields = ("owner__name", "name", "symbol")


@admin.register(AlgoLog)
class AlgoLogAdmin(admin.ModelAdmin):
    list_display = ("strategy", "at", "action", "ok", "message")
    list_filter = ("action", "ok")


@admin.register(BacktestRun)
class BacktestRunAdmin(admin.ModelAdmin):
    list_display = ("owner", "name", "symbol", "timeframe", "trade_count", "net_profit", "created_at")
    search_fields = ("owner__name", "name", "symbol")
    exclude = ("trades",)


@admin.register(TradeJournal)
class TradeJournalAdmin(admin.ModelAdmin):
    list_display = ("owner", "source", "trade_key", "symbol", "rating", "updated_at")
    list_filter = ("source",)


def _india(unix_s):
    """A unix time (seconds) as a date and time in India (the admin's time zone)"""
    if not unix_s:
        return "—"
    from datetime import datetime, timezone as dt_timezone
    return timezone.localtime(datetime.fromtimestamp(unix_s, tz=dt_timezone.utc)).strftime("%d %b %Y, %H:%M")


def _duration(seconds):
    """Seconds as 3 h 50 min, 6 min or 40 s"""
    seconds = int(seconds or 0)
    h, m = seconds // 3600, (seconds % 3600) // 60
    if h:
        return f"{h} h {m} min"
    return f"{m} min" if m else f"{seconds} s"


@admin.register(ReplaySession)
class ReplaySessionAdmin(admin.ModelAdmin):
    list_display = ("owner", "name", "symbol", "interval", "status", "spent", "at_bar", "updated_at")
    list_filter = ("status",)
    search_fields = ("owner__name", "name", "symbol")
    exclude = ("account", "book")
    readonly_fields = ("spent", "started_at_bar", "at_bar")

    @admin.display(description="Time spent", ordering="time_spent")
    def spent(self, obj):
        return _duration(obj.time_spent)

    @admin.display(description="Started at (bar)", ordering="start_time")
    def started_at_bar(self, obj):
        return _india(obj.start_time)

    @admin.display(description="Now at (bar)", ordering="current_time")
    def at_bar(self, obj):
        return _india(obj.current_time)


@admin.register(SavedReplay)
class SavedReplayAdmin(admin.ModelAdmin):
    list_display = ("owner", "symbol", "interval", "bar_time", "saved")
    search_fields = ("owner__name", "symbol")
    readonly_fields = ("bar_time", "saved")

    @admin.display(description="Replay at (bar)", ordering="time")
    def bar_time(self, obj):
        return _india(obj.time)

    @admin.display(description="Saved at", ordering="saved_at")
    def saved(self, obj):
        return _india((obj.saved_at or 0) / 1000)


@admin.register(CopyChannel)
class CopyChannelAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "code", "default_risk", "mirror_mt5", "active", "created_at")
    search_fields = ("name", "owner__name", "code")


@admin.register(CopySubscription)
class CopySubscriptionAdmin(admin.ModelAdmin):
    list_display = ("channel", "subscriber", "auto_copy", "risk_mode", "risk_percent", "max_risk", "terminal_status", "terminal_seen")
    list_filter = ("auto_copy", "terminal_status")


@admin.register(CopySignal)
class CopySignalAdmin(admin.ModelAdmin):
    list_display = ("id", "channel", "kind", "source", "symbol", "side", "entry", "sl", "tp", "risk_percent", "created_at")
    list_filter = ("kind", "source")


@admin.register(CopyExecution)
class CopyExecutionAdmin(admin.ModelAdmin):
    list_display = ("signal", "subscription", "status", "symbol", "volume", "price", "latency_ms", "created_at")
    list_filter = ("status",)


@admin.register(Follow)
class FollowAdmin(admin.ModelAdmin):
    list_display = ("follower", "following", "created_at")


@admin.register(PublishedScript)
class PublishedScriptAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "kind", "language", "visibility", "version", "uses", "updated_at")
    list_filter = ("kind", "visibility", "language")
    search_fields = ("name", "owner__name", "owner__username")


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ("recipient", "kind", "text", "read_at", "created_at")
    list_filter = ("kind",)


@admin.register(FeedbackMessage)
class FeedbackMessageAdmin(admin.ModelAdmin):
    """Bug reports / feedback the users send from the chart's Send-feedback button.
    New reports land here; `is_read` lets you tick off the ones you've handled."""
    list_display = ("created_at", "user", "message_snippet", "symbol", "interval", "image_count", "is_read")
    list_filter = ("is_read", "created_at", "symbol")
    search_fields = ("message", "user__name", "user__email", "session_key", "page_url")
    date_hierarchy = "created_at"
    ordering = ("-created_at",)
    actions = ["mark_read", "mark_unread"]
    readonly_fields = ("created_at", "user", "session_key", "message", "images_full",
                      "symbol", "interval", "page_url", "user_agent", "ip")

    @admin.display(description="Message")
    def message_snippet(self, obj):
        return (obj.message or "")[:80]

    @admin.display(description="Images")
    def image_count(self, obj):
        return len(obj.images or [])

    @admin.display(description="Images")
    def images_full(self, obj):
        if not obj.images:
            return "—"
        urls = "".join(
            f'<a href="{url}" target="_blank" style="display:block;margin:4px 0">'
            f'<img src="{url}" style="max-width:220px;max-height:140px;border:1px solid #ccc;border-radius:4px"></a>'
            for url in obj.images
        )
        return format_html("<div>{}</div>", urls)

    @admin.action(description="Mark selected as read")
    def mark_read(self, request, queryset):
        queryset.update(is_read=True)

    @admin.action(description="Mark selected as unread")
    def mark_unread(self, request, queryset):
        queryset.update(is_read=False)

    def has_add_permission(self, request):
        return False   # records come from the app, not the admin
    def has_change_permission(self, request, obj=None):
        # only the admin checkbox (is_read) is editable; content is readonly
        return True
    def get_readonly_fields(self, request, obj=None):
        # everything except the read flag
        return [f for f in self.readonly_fields if f != "is_read"]



@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    """Money received: add one each time someone pays (Earnings adds them up)"""
    list_display = ('paid_at', 'profile', 'amount', 'currency', 'method', 'note')
    list_filter = ('currency', 'method')
    date_hierarchy = 'paid_at'
    search_fields = ('profile__name', 'profile__email', 'note', 'method')
    autocomplete_fields = ('profile',)


@admin.register(Earning)
class EarningAdmin(admin.ModelAdmin):
    """What we've earned: today, this month, last month, this year, all time, and a year month by
    month (core/earnings.py), from the payments. Read only: payments are entered in Payments."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        from . import earnings
        try:
            year = int(request.GET.get("year") or 0) or None
        except ValueError:
            year = None
        ctx = {**self.admin_site.each_context(request), "title": "Earnings", "opts": self.model._meta, **earnings.report(year)}
        return TemplateResponse(request, "admin/core/earnings.html", ctx)



from .models import VoiceRequest


@admin.register(VoiceRequest)
class VoiceRequestAdmin(admin.ModelAdmin):
    """What traders asked the voice assistant that it can't do yet: teach it, then mark it Trained"""
    list_display = ('created_at', 'task', 'said', 'profile', 'status')
    list_filter = ('status', 'created_at')
    list_editable = ('status',)
    search_fields = ('task', 'said', 'profile__name', 'profile__email')
    readonly_fields = ('profile', 'said', 'task', 'reply', 'created_at')
    fields = ('task', 'said', 'reply', 'profile', 'created_at', 'status', 'note')
    actions = ('mark_trained', 'mark_ignored')

    def has_add_permission(self, request):
        return False

    @admin.action(description="Mark as trained")
    def mark_trained(self, request, queryset):
        queryset.update(status='trained')

    @admin.action(description="Mark as ignored")
    def mark_ignored(self, request, queryset):
        queryset.update(status='ignored')



from .models import TimeOnSite, TraderSource


@admin.register(TimeOnSite)
class TimeOnSiteAdmin(admin.ModelAdmin):
    """How long traders had the site open: today, this week, month, year, all time; per trader and the
    last 30 days (core/sitetime.py). Read only."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        from django.template.response import TemplateResponse
        from . import sitetime
        ctx = {**self.admin_site.each_context(request), "title": "Time on site", "opts": self.model._meta,
               **sitetime.report(request.GET.get("sort") or "today")}
        return TemplateResponse(request, "admin/core/time_on_site.html", ctx)


@admin.register(TraderSource)
class TraderSourceAdmin(admin.ModelAdmin):
    """Where traders came from: sign-ups by kind (ad, referral, social…) and by source and campaign,
    the last 30 days / this month / this year / all time, and the latest sign-ups (core/arrival.py). Read only."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def changelist_view(self, request, extra_context=None):
        from django.template.response import TemplateResponse
        from . import arrival
        ctx = {**self.admin_site.each_context(request), "title": "Where traders came from", "opts": self.model._meta, **arrival.report()}
        return TemplateResponse(request, "admin/core/trader_source.html", ctx)


# The admin is TradePilot's (its look: core/admin_theme)
admin.site.site_title = "TradePilot admin"
admin.site.site_header = "TradePilot admin"
