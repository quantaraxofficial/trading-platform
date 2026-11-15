from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import path, include


from core import admin_notices

urlpatterns = [
    # The admin's notifications: the bell and the toasts (core/admin_notices.py), staff only
    path(f'{settings.ADMIN_URL}notices/', admin.site.admin_view(admin_notices.notices_json), name='admin_notices'),
    path(f'{settings.ADMIN_URL}notices/seen/', admin.site.admin_view(admin_notices.mark_all_seen), name='admin_notices_seen'),
    path(f'{settings.ADMIN_URL}notices/open/<str:kind>/', admin.site.admin_view(admin_notices.open_kind), name='admin_notice_open_kind'),
    path(f'{settings.ADMIN_URL}notices/open/<str:kind>/<int:obj_id>/', admin.site.admin_view(admin_notices.open_item), name='admin_notice_open_item'),
    # The admin, at ADMIN_URL (admin/ unless set)
    path(settings.ADMIN_URL, admin.site.urls),
    path('api/users/', include('core.urls')),
]

# Serve uploaded feedback screenshots in development (in production, put media
# storage behind a real web server or object storage)
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
