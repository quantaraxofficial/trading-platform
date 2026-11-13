"""Student categories in Django admin: groups of traders ("Batch A", "Weekend class"…). Made and
filled on their own page (adding students there), from Trader profiles (select some, then "Add to a
category…" / "Remove from a category…"), or on a trader's own page; Trader profiles shows each one's
categories and filters by them."""

from django import forms
from django.contrib import admin, messages
from django.contrib.admin import helpers
from django.db.models import Count
from django.template.response import TemplateResponse
from django.urls import reverse
from django.utils.html import format_html, format_html_join

from .models import TraderCategory, TraderProfile


class CategoryChoiceForm(forms.Form):
    category = forms.ModelChoiceField(queryset=TraderCategory.objects.none(), required=False, empty_label='— choose —')
    new_name = forms.CharField(max_length=80, required=False, label='or a new category')

    def __init__(self, *args, adding=True, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields['category'].queryset = TraderCategory.objects.order_by('name')
        if not adding:
            del self.fields['new_name']

    def clean(self):
        data = super().clean()
        if not data.get('category') and not (data.get('new_name') or '').strip():
            raise forms.ValidationError('Choose a category' + (' or name a new one' if 'new_name' in self.fields else ''))
        return data


class TraderCategoriesMixin:
    """For TraderProfileAdmin: the categories column, and the add / remove actions"""

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('categories')

    @admin.display(description='Categories')
    def categories_col(self, obj):
        cats = list(obj.categories.all())
        if not cats:
            return '—'
        url = reverse('admin:core_traderprofile_changelist')
        return format_html_join(' ', '<a class="tp-chip" href="{}?categories__id__exact={}">{}</a>', ((url, c.id, c.name) for c in cats))

    def get_actions(self, request):
        actions = super().get_actions(request)
        for name, adding, text in (('add_to_category', True, 'Add to a category…'), ('remove_from_category', False, 'Remove from a category…')):
            actions[name] = (lambda ma, req, qs, adding=adding, name=name: ma._category_action(req, qs, adding, name), name, text)
        return actions

    def _category_action(self, request, queryset, adding, name):
        form = CategoryChoiceForm(request.POST if 'apply' in request.POST else None, adding=adding)
        if 'apply' in request.POST and form.is_valid():
            cat = form.cleaned_data.get('category')
            if not cat:
                cat, _ = TraderCategory.objects.get_or_create(name=form.cleaned_data['new_name'].strip()[:80])
            n = queryset.count()
            (cat.traders.add if adding else cat.traders.remove)(*queryset)
            self.message_user(request, f'{"Added" if adding else "Removed"} {n} trader(s) {"to" if adding else "from"} “{cat.name}”.', messages.SUCCESS)
            return None  # back to the list
        ctx = {
            **self.admin_site.each_context(request),
            'title': 'Add to a category' if adding else 'Remove from a category',
            'opts': self.model._meta, 'form': form, 'queryset': queryset, 'action': name, 'adding': adding,
            'action_checkbox_name': helpers.ACTION_CHECKBOX_NAME,
        }
        return TemplateResponse(request, 'admin/core/category_action.html', ctx)


class StudentsInline(admin.TabularInline):
    model = TraderProfile.categories.through
    extra = 1
    autocomplete_fields = ('traderprofile',)
    verbose_name = 'student'
    verbose_name_plural = 'Students in this category'
    classes = ('tp-students',)  # (its rows' technical names hidden: core/admin_theme)

    def formfield_for_foreignkey(self, db_field, request, **kwargs):
        if db_field.name == 'traderprofile':
            kwargs['label'] = 'Student'
        return super().formfield_for_foreignkey(db_field, request, **kwargs)


@admin.register(TraderCategory)
class TraderCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'students', 'note', 'created_at')
    search_fields = ('name', 'note')
    ordering = ('name',)
    fields = ('name', 'note')
    inlines = [StudentsInline]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(n=Count('traders'))

    @admin.display(description='Students', ordering='n')
    def students(self, obj):
        url = reverse('admin:core_traderprofile_changelist')
        return format_html('<a href="{}?categories__id__exact={}">{}</a>', url, obj.id, obj.n)
