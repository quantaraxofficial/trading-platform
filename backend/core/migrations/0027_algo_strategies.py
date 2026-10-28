import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0026_broker_accounts'),
    ]

    operations = [
        migrations.CreateModel(
            name='AlgoStrategy',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=200)),
                ('name', models.CharField(max_length=100)),
                ('symbol', models.CharField(max_length=40)),
                ('timeframe', models.CharField(max_length=20)),
                ('lots', models.FloatField(default=0.01)),
                ('enabled', models.BooleanField(default=False)),
                ('real_confirmed', models.BooleanField(default=False)),
                ('last_key', models.CharField(blank=True, max_length=80)),
                ('failed_key', models.CharField(blank=True, max_length=80)),
                ('failed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='algo_strategies', to='core.traderprofile')),
            ],
            options={
                'unique_together': {('owner', 'key')},
            },
        ),
        migrations.CreateModel(
            name='AlgoLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('at', models.DateTimeField(auto_now_add=True)),
                ('action', models.CharField(max_length=20)),
                ('message', models.CharField(max_length=300)),
                ('ok', models.BooleanField(default=True)),
                ('strategy', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='log', to='core.algostrategy')),
            ],
            options={
                'ordering': ['-at', '-id'],
            },
        ),
    ]
