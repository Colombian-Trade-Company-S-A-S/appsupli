from django.db import migrations, models

ACENTOS_DE_MARCA = ('violet', 'indigo', 'blue')


def pasar_a_marca(apps, schema_editor):
    """Quien no eligió tema queda en oscuro; los acentos viejos pasan a morado."""
    User = apps.get_model('accounts', 'User')
    User.objects.filter(theme='system').update(theme='dark')
    User.objects.exclude(accent__in=ACENTOS_DE_MARCA).update(accent='violet')


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0005_user_pais_alter_user_email'),
    ]

    operations = [
        migrations.RunPython(pasar_a_marca, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='user',
            name='theme',
            field=models.CharField(choices=[('light', 'Claro'), ('dark', 'Oscuro'), ('system', 'Sistema')], default='dark', max_length=10, verbose_name='tema'),
        ),
        migrations.AlterField(
            model_name='user',
            name='accent',
            field=models.CharField(choices=[('violet', 'Morado'), ('indigo', 'Morado oscuro'), ('blue', 'Azul')], default='violet', max_length=20, verbose_name='color de acento'),
        ),
    ]
