from django.contrib import admin
from .models import TraderProfile, BacktestSession, UserActionLog

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
