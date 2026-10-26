from django.db import migrations


class Migration(migrations.Migration):
    """Joins the feedback (aditya-students) and collab (merge-main-left-toolbar-tools) migrations"""

    dependencies = [
        ('core', '0014_feedbackmessage'),
        ('core', '0017_collab_pine_doc'),
    ]

    operations = []
