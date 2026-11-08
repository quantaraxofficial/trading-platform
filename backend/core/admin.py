from django.contrib import admin
from .models import TraderProfile, BacktestSession, UserActionLog, FailedRequest, CollabRoom, CollabMember, CollabMessage, CollabJoinRequest, GitHubLink, BrokerAccount, AlgoStrategy, AlgoLog, BacktestRun, TradeJournal, ReplaySession, SavedReplay, CopyChannel, CopySubscription, CopySignal, CopyExecution, Follow, PublishedScript, Notification
from .models import FeedbackMessage

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

@admin.register(TraderProfile)
class TraderProfileAdmin(admin.ModelAdmin):
    list_display = ('name', 'email', 'phone', 'tier', 'created_at', 'last_login')
    list_filter = ('tier', 'created_at')
    search_fields = ('name', 'email', 'phone', 'uid')
    ordering = ('-created_at',)

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


@admin.register(ReplaySession)
class ReplaySessionAdmin(admin.ModelAdmin):
    list_display = ("owner", "name", "symbol", "interval", "status", "time_spent", "updated_at")
    list_filter = ("status",)
    search_fields = ("owner__name", "name", "symbol")
    exclude = ("account", "book")


@admin.register(SavedReplay)
class SavedReplayAdmin(admin.ModelAdmin):
    list_display = ("owner", "symbol", "interval", "time", "saved_at")
    search_fields = ("owner__name", "symbol")


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
