from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0018_collabroom_kind'),
    ]

    operations = [
        migrations.AddField(
            model_name='pinescript',
            name='language',
            field=models.CharField(choices=[('pine', 'Pine Script'), ('python', 'Python'), ('mql5', 'MQL5')], default='pine', max_length=10),
        ),
    ]
