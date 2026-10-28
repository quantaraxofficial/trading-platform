from django.db import migrations

FEATURES = [
    ("collab", "Collab", "Shared charts: creating, opening and joining collabs"),
    ("replay", "Bar replay", "Replaying the chart bar by bar"),
]


def seed(apps, schema_editor):
    LockedFeature = apps.get_model('core', 'LockedFeature')
    PlanSettings = apps.get_model('core', 'PlanSettings')
    for key, label, description in FEATURES:
        LockedFeature.objects.get_or_create(key=key, defaults={"label": label, "description": description, "locked": True})
    if not PlanSettings.objects.exists():
        PlanSettings.objects.create()


def unseed(apps, schema_editor):
    apps.get_model('core', 'LockedFeature').objects.filter(key__in=[k for k, _, _ in FEATURES]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0022_subscriptions'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
