from django import forms
from django.contrib import admin, messages
from django.db import transaction
from django.shortcuts import redirect
from django.template.response import TemplateResponse
from django.urls import path
from django.utils import timezone
from django.utils.html import format_html
from .models import TraderProfile, BacktestSession, UserActionLog, FailedRequest, FeedbackMessage, CollabRoom, CollabMember, CollabMessage, CollabJoinRequest
from .models import LockedFeature, PlanSettings, Subscription
from .models import BacktestRun, TradeJournal, ReplaySession, SavedReplay
from . import access

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

class SubscriptionInline(admin.TabularInline):
    """Their paid periods (add one here, or use the actions on the list)"""
    model = Subscription
    extra = 0
    fields = ('starts_at', 'ends_at', 'months', 'days', 'amount', 'note', 'created_at')
    readonly_fields = ('created_at',)


class AccessFilter(admin.SimpleListFilter):
    title = 'subscription'
    parameter_name = 'access'

    def lookups(self, request, model_admin):
        return [('active', 'Active'), ('ending', 'Ends within 7 days'), ('ended', 'Ended'), ('never', 'Never subscribed')]

    def queryset(self, request, qs):
        from django.db.models import Max
        now = timezone.now()
        qs = qs.annotate(_until=Max('subscriptions__ends_at'))
        if self.value() == 'active':
            return qs.filter(_until__gt=now)
        if self.value() == 'ending':
            return qs.filter(_until__gt=now, _until__lte=now + timezone.timedelta(days=7))
        if self.value() == 'ended':
            return qs.filter(_until__lte=now)
        if self.value() == 'never':
            return qs.filter(_until__isnull=True)
        return qs


class CreateAccountForm(forms.Form):
    name = forms.CharField(max_length=255)
    login = forms.CharField(max_length=254, label="Email or user ID",
                            help_text="An email, or a user ID (3–32 letters, digits, . - _) they sign in with instead")
    months = forms.TypedChoiceField(choices=[(1, '1 month'), (3, '3 months'), (6, '6 months'), (12, '12 months'), (-1, 'Unlimited'), (0, 'Days only (below)')], coerce=int, initial=1)
    days = forms.IntegerField(min_value=0, max_value=3650, initial=0, required=False, help_text="Extra days (added to the months)")
    amount = forms.CharField(max_length=40, required=False, help_text="What they paid, for your records (e.g. ₹1,500 UPI)")
    note = forms.CharField(max_length=300, required=False)
    phone = forms.CharField(max_length=20, required=False)
    plan = forms.ChoiceField(choices=[('pro', 'Premium (everything)'), ('basic', 'Premium without voice & live replay')], initial='pro',
                             help_text="Without voice & live replay: no voice assistant and no replay like the live market")

    def clean_login(self):
        v = self.cleaned_data['login']
        try:
            email = access.sign_in_email(v)
        except ValueError as e:
            raise forms.ValidationError(str(e))
        if '@' in v:
            forms.EmailField().clean(email)
        return email

    def clean(self):
        d = super().clean()
        if not (d.get('months') or d.get('days')):
            raise forms.ValidationError("Give at least some months or days")
        return d


def _extend_action(months):
    def action(modeladmin, request, queryset):
        for p in queryset:
            access.extend(p, months=months, note=f"Extended {months} month{'s' if months > 1 else ''} from admin")
        modeladmin.message_user(request, f"Extended {queryset.count()} account(s) by {months} month{'s' if months > 1 else ''}", messages.SUCCESS)
    action.__name__ = f"extend_{months}"
    action.short_description = f"Extend subscription by {months} month{'s' if months > 1 else ''}"
    return action


@admin.register(TraderProfile)
class TraderProfileAdmin(admin.ModelAdmin):
    list_display = ('name', 'sign_in', 'phone', 'access_status', 'access_until_col', 'tier', 'created_at', 'last_login')
    list_filter = (AccessFilter, 'tier', 'created_at')
    search_fields = ('name', 'email', 'phone', 'uid')
    ordering = ('-created_at',)
    inlines = [SubscriptionInline]
    actions = [_extend_action(1), _extend_action(3), _extend_action(6), _extend_action(12), 'end_access', 'send_reset']

    @admin.display(description='Subscription')
    def access_status(self, obj):
        a = access.access_of(obj)
        if a['unlimited']:
            return format_html('<b style="color:#1e8e3e">{}</b>', 'Active · unlimited')
        if a['active']:
            color = '#b26a00' if a['days_left'] <= 7 else '#1e8e3e'
            return format_html('<b style="color:{}">Active · {} day{} left</b>', color, a['days_left'], '' if a['days_left'] == 1 else 's')
        return format_html('<span style="color:#c5221f">{}</span>', 'Ended' if a['until'] else 'None')

    @admin.display(description='Email / user ID', ordering='email')
    def sign_in(self, obj):
        uid = access.user_id_of(obj.email)
        return format_html('<b>{}</b> <span style="color:#888">(user ID)</span>', uid) if uid else obj.email

    @admin.display(description='Until')
    def access_until_col(self, obj):
        u = access.access_until(obj)
        return u.strftime('%d %b %Y') if u else '—'

    @admin.action(description="End subscription now")
    def end_access(self, request, queryset):
        for p in queryset:
            access.end_now(p)
        self.message_user(request, f"Ended access for {queryset.count()} account(s)", messages.WARNING)

    @admin.action(description="Send a password reset email")
    def send_reset(self, request, queryset):
        sent = 0
        for p in queryset:
            if access.user_id_of(p.email):
                self.message_user(request, f"{p.name}: signs in with a user ID, so there's no email to send to (create a new password for them in Firebase)", messages.WARNING)
                continue
            try:
                access.send_password_reset(p.email)
                sent += 1
            except access.FirebaseError as e:
                self.message_user(request, f"{p.email}: {e}", messages.ERROR)
        if sent:
            self.message_user(request, f"Sent {sent} password reset email(s)", messages.SUCCESS)

    def get_urls(self):
        return [path('create-account/', self.admin_site.admin_view(self.create_account), name='core_traderprofile_create_account')] + super().get_urls()

    def create_account(self, request):
        """After a payment: the buyer's sign-in (email, generated password) and their subscription"""
        ctx = {**self.admin_site.each_context(request), "title": "Create account", "opts": self.model._meta}
        form = CreateAccountForm(request.POST or None)
        if request.method == 'POST' and form.is_valid():
            d = form.cleaned_data
            email = d['login']
            user_id = access.user_id_of(email)
            if TraderProfile.objects.filter(email__iexact=email).exists():
                ctx.update(form=form, error=f"An account with this {'user ID' if user_id else 'email'} already exists here: open it and extend its subscription instead")
                return TemplateResponse(request, "admin/core/create_account.html", ctx)
            password = access.new_password()
            try:
                uid = access.create_login(email, password, d['name'])
            except (access.FirebaseError, Exception) as e:
                ctx.update(form=form, error=f"Couldn't create the sign-in: {e}")
                return TemplateResponse(request, "admin/core/create_account.html", ctx)
            with transaction.atomic():
                p = TraderProfile.objects.create(uid=uid, name=d['name'], email=email, phone=d.get('phone') or '', tier=d.get('plan') or 'pro')
                if d['months'] == -1:
                    sub = access.extend(p, days=access.UNLIMITED_DAYS, amount=d.get('amount') or '', note=d.get('note') or 'Unlimited, created from admin')
                else:
                    sub = access.extend(p, months=d['months'], days=d.get('days') or 0, amount=d.get('amount') or '', note=d.get('note') or 'Created from admin')
            ctx["created"] = {"name": p.name, "email": email, "user_id": user_id, "unlimited": d['months'] == -1, "password": password, "until": sub.ends_at, "profile_id": p.id}
            return TemplateResponse(request, "admin/core/create_account.html", ctx)
        ctx["form"] = form
        return TemplateResponse(request, "admin/core/create_account.html", ctx)


@admin.register(LockedFeature)
class LockedFeatureAdmin(admin.ModelAdmin):
    """What needs an active subscription (switch `locked` off to open a feature to everyone)"""
    list_display = ('label', 'key', 'locked', 'free_limit', 'description')
    list_editable = ('locked', 'free_limit')


@admin.register(PlanSettings)
class PlanSettingsAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'renew_message')

    def has_add_permission(self, request):
        return not PlanSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False

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
