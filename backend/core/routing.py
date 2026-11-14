from django.urls import path

from .consumers import CollabConsumer, TicksConsumer

websocket_urlpatterns = [
    path('ws/collab/<str:token>/', CollabConsumer.as_asgi()),
    path('ws/ticks/<str:symbol>/', TicksConsumer.as_asgi()),
]
