from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from core import tick_health

urlpatterns = [
    path('admin/', admin.site.urls),
    # Tick-feed health dashboard (MT5 -> ClickHouse), admin-login-protected.
    path('admin/tick-health/', tick_health.tick_health, name='tick_health'),
    path('admin/tick-health/json/', tick_health.tick_health_json, name='tick_health_json'),
    path('api/users/', include('core.urls')),
]

# Serve uploaded feedback screenshots in development (in production, put media
# storage behind a real web server or object storage)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
