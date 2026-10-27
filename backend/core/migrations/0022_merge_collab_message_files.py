from django.db import migrations


class Migration(migrations.Migration):
    """Joins collab chat files (0021_collab_message_files) with GitHub + collab requests (0021_merge_github_collab_requests)"""

    dependencies = [
        ('core', '0021_collab_message_files'),
        ('core', '0021_merge_github_collab_requests'),
    ]

    operations = []
