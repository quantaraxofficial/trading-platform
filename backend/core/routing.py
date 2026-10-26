from django.urls import path

from .consumers import CollabConsumer

websocket_urlpatterns = [
    path('ws/collab/<str:token>/', CollabConsumer.as_asgi()),
]
