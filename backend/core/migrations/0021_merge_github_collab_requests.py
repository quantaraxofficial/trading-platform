from django.db import migrations


class Migration(migrations.Migration):
    """Joins GitHub for scripts (0020_github) with collab join requests (0020_collab_requests)"""

    dependencies = [
        ('core', '0020_github'),
        ('core', '0020_collab_requests'),
    ]

    operations = []
