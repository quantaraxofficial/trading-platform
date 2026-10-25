"""Read-only admin page: is the MT5 -> ClickHouse tick feed healthy?

Mounted under /admin/ (see core/urls additions in quantarax_backend/urls.py).
Shows the last-seen bar per symbol, total stored size (vs. the 200 GB cap),
and any zero-tick 30-second windows (= a feed gap worth investigating).
"""
from django.contrib import admin
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator
from django.contrib.admin.views.decorators import staff_member_required

from pipeline.admin import feed_health
from pipeline.config import CONFIG


@staff_member_required
def tick_health(request):
    """HTML view at /admin/tick-health/ — a simple table the operator can open
    without hunting through ClickHouse. Admin-login-protected (staff only)."""
    health = feed_health()
    cap_gb = 200
    return render(request, "admin/tick_health.html", {
        "health": health,
        "config": {
            "symbols": CONFIG.SYMBOLS,
            "resample": CONFIG.RESAMPLE_SECONDS,
            "ttl_days": CONFIG.DATA_TTL_DAYS,
        },
        "cap_gb": cap_gb,
    })


@staff_member_required
@require_http_methods(["GET"])
def tick_health_json(request):
    """Machine-readable version for a dashboard to poll: /admin/tick-health/json/"""
    return JsonResponse(feed_health(), safe=False, json_dumps_params={"default": str})
