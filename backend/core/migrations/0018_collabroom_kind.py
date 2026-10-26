from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0017_collab_pine_doc'),
    ]

    operations = [
        migrations.AddField(
            model_name='collabroom',
            name='kind',
            field=models.CharField(choices=[('chart', 'Chart'), ('pine', 'Pine script')], default='chart', max_length=10),
        ),
    ]
