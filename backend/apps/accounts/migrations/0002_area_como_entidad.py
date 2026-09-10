"""Convierte el campo de texto `area` en una entidad propia, conservando los datos."""

import django.db.models.deletion
from django.db import migrations, models


def texto_a_areas(apps, schema_editor):
    """Crea un Area por cada valor distinto y reconecta a los usuarios."""
    Area = apps.get_model('accounts', 'Area')
    User = apps.get_model('accounts', 'User')

    for nombre in (
        User.objects.exclude(area_anterior='')
        .values_list('area_anterior', flat=True)
        .distinct()
    ):
        area, _ = Area.objects.get_or_create(name=nombre.strip())
        User.objects.filter(area_anterior=nombre).update(area=area)


def areas_a_texto(apps, schema_editor):
    """Marcha atrás: devuelve el nombre del área al campo de texto."""
    User = apps.get_model('accounts', 'User')
    for user in User.objects.select_related('area'):
        User.objects.filter(pk=user.pk).update(area_anterior=user.area.name if user.area else '')


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Area',
            fields=[
                (
                    'id',
                    models.BigAutoField(
                        auto_created=True, primary_key=True, serialize=False, verbose_name='ID'
                    ),
                ),
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='creado el')),
                (
                    'updated_at',
                    models.DateTimeField(auto_now=True, verbose_name='actualizado el'),
                ),
                ('name', models.CharField(max_length=100, unique=True, verbose_name='nombre')),
                ('description', models.TextField(blank=True, verbose_name='descripción')),
                ('is_active', models.BooleanField(default=True, verbose_name='activa')),
            ],
            options={
                'verbose_name': 'área',
                'verbose_name_plural': 'áreas',
                'ordering': ('name',),
            },
        ),
        # 1. El texto se aparta, 2. entra la relación, 3. se migran los datos,
        # 4. se elimina el texto.
        migrations.RenameField(model_name='user', old_name='area', new_name='area_anterior'),
        migrations.AddField(
            model_name='user',
            name='area',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='users',
                to='accounts.area',
                verbose_name='área',
            ),
        ),
        migrations.RunPython(texto_a_areas, areas_a_texto),
        migrations.RemoveField(model_name='user', name='area_anterior'),
    ]
