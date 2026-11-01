from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from core import tick_health

urlpatterns = [
    # Tick-feed health dashboard (MT5 -> ClickHouse), admin-login-protected.
    path(f'{settings.ADMIN_URL}tick-health/', tick_health.tick_health, name='tick_health'),
    path(f'{settings.ADMIN_URL}tick-health/json/', tick_health.tick_health_json, name='tick_health_json'),
    # The admin, at ADMIN_URL (admin/ unless set)
    path(settings.ADMIN_URL, admin.site.urls),
    path('api/users/', include('core.urls')),
]

# Serve uploaded feedback screenshots in development (in production, put media
# storage behind a real web server or object storage)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
