"""
ASGI config for quantarax_backend project: HTTP goes to Django, WebSockets (collab charts) to
Channels.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'quantarax_backend.settings')

# Django has to be set up before the consumers (and the models they import) load
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter  # noqa: E402
from channels.security.websocket import OriginValidator  # noqa: E402
from django.conf import settings  # noqa: E402

from core.routing import websocket_urlpatterns  # noqa: E402

# Only the site's own pages may open a collab socket (any origin while CORS allows all, in DEBUG)
allowed_origins = ['*'] if getattr(settings, 'CORS_ALLOW_ALL_ORIGINS', False) else list(getattr(settings, 'CORS_ALLOWED_ORIGINS', []))

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    'websocket': OriginValidator(URLRouter(websocket_urlpatterns), allowed_origins),
})
