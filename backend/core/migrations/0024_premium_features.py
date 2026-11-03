from django.db import migrations, models

# Premium: 30-second charts, custom intervals, more than 3 indicators / active alerts / charts in a
# layout, bar replay. Collab is free.
FEATURES = [
    ("seconds", "30-second charts", "Second intervals (30s)", None),
    ("custom_interval", "Custom intervals", "Intervals outside the standard list (7m, 2h 30m…), and adding them", None),
    ("indicators", "Indicators on a chart", "More indicators on a chart than the free limit", 3),
    ("alerts", "Active alerts", "More active alerts than the free limit", 3),
    ("charts", "Charts in a layout", "More charts in a layout than the free limit", 3),
]


def seed(apps, schema_editor):
    LockedFeature = apps.get_model('core', 'LockedFeature')
    for key, label, description, limit in FEATURES:
        LockedFeature.objects.get_or_create(key=key, defaults={"label": label, "description": description, "locked": True, "free_limit": limit})
    LockedFeature.objects.filter(key="collab").update(locked=False)


def unseed(apps, schema_editor):
    LockedFeature = apps.get_model('core', 'LockedFeature')
    LockedFeature.objects.filter(key__in=[f[0] for f in FEATURES]).delete()
    LockedFeature.objects.filter(key="collab").update(locked=True)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0023_seed_plan'),
    ]

    operations = [
        migrations.AddField(
            model_name='lockedfeature',
            name='free_limit',
            field=models.PositiveIntegerField(blank=True, help_text='Without a subscription: up to this many (blank: none at all)', null=True),
        ),
        migrations.RunPython(seed, unseed),
    ]
