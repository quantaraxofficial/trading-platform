from django.contrib import admin
from .models import TraderProfile, BacktestSession, UserActionLog, FailedRequest, CollabRoom, CollabMember, CollabMessage

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
    list_display = ("name", "owner", "symbol", "interval", "link_access", "active", "updated_at")
    list_filter = ("active", "link_access")
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


@admin.register(CollabMessage)
class CollabMessageAdmin(admin.ModelAdmin):
    list_display = ("created_at", "room", "author", "kind", "text")
    list_filter = ("kind",)
    search_fields = ("text", "room__name", "author__name")
