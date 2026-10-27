from django.apps import AppConfig


class CoreConfig(AppConfig):
    name = 'core'

    def ready(self):
        # Signal handlers that must run however the app is started (server, shell, admin):
        # a collab or group chat message's shared file is removed with it
        from . import chat_groups, collab_files  # noqa: F401
