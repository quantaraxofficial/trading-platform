from django.db import migrations


class Migration(migrations.Migration):
    """Joins this branch's 0018 (feedback + collab merge) with collab's 0018 (room kind)"""

    dependencies = [
        ('core', '0018_merge_feedback_collab'),
        ('core', '0018_collabroom_kind'),
    ]

    operations = []
