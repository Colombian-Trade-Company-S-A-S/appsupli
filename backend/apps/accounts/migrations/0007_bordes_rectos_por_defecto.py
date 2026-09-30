from django.db import migrations, models


def pasar_a_recto(apps, schema_editor):
    """Todas las cuentas arrancan con bordes rectos; cada quien puede cambiarlo."""
    apps.get_model('accounts', 'User').objects.exclude(radius='sharp').update(radius='sharp')


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0006_apariencia_de_marca'),
    ]

    operations = [
        migrations.RunPython(pasar_a_recto, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='user',
            name='radius',
            field=models.CharField(choices=[('sharp', 'Recto'), ('default', 'Normal'), ('rounded', 'Redondeado')], default='sharp', max_length=10, verbose_name='redondeado'),
        ),
    ]
