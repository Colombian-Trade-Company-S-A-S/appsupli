"""
La regional del plan Partners pasa de ser una lista fija en el código a una
tabla, para poder agregar y quitar zonas desde el formulario.

El orden importa: primero se crean las regionales con los nombres que ya tenían
los puntos de venta y se apunta cada uno a la suya; solo después se borra la
columna de texto. Al revés se perdería a qué zona pertenece cada punto.
"""
import django.db.models.deletion
from django.db import migrations, models


def texto_a_tabla(apps, schema_editor):
    """Crea una regional por cada nombre que ya estuviera escrito."""
    RegionalPartner = apps.get_model('bi_trade', 'RegionalPartner')
    PuntoVentaPartner = apps.get_model('bi_trade', 'PuntoVentaPartner')
    RegistroPartner = apps.get_model('bi_trade', 'RegistroPartner')

    regionales = {}
    for modelo in (PuntoVentaPartner, RegistroPartner):
        for fila in modelo.objects.exclude(regional=''):
            if fila.regional not in regionales:
                regionales[fila.regional], _ = RegionalPartner.objects.get_or_create(
                    nombre=fila.regional
                )
            fila.id_regional = regionales[fila.regional]
            fila.save(update_fields=['id_regional'])


def tabla_a_texto(apps, schema_editor):
    """Vuelta atrás: devuelve el nombre de la regional a la columna de texto."""
    PuntoVentaPartner = apps.get_model('bi_trade', 'PuntoVentaPartner')
    RegistroPartner = apps.get_model('bi_trade', 'RegistroPartner')

    for modelo in (PuntoVentaPartner, RegistroPartner):
        for fila in modelo.objects.filter(id_regional__isnull=False).select_related('id_regional'):
            fila.regional = fila.id_regional.nombre
            fila.save(update_fields=['regional'])


class Migration(migrations.Migration):

    dependencies = [
        ('bi_trade', '0011_productopartner_puntoventapartner_registropartner'),
    ]

    operations = [
        migrations.CreateModel(
            name='RegionalPartner',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='creado el')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='actualizado el')),
                (
                    'id_regional',
                    models.AutoField(
                        primary_key=True, serialize=False, verbose_name='id de la regional'
                    ),
                ),
                ('nombre', models.CharField(max_length=80, unique=True, verbose_name='nombre')),
                (
                    'activa',
                    models.BooleanField(
                        default=True,
                        help_text='Si se desactiva, deja de aparecer en el formulario.',
                        verbose_name='activa',
                    ),
                ),
            ],
            options={
                'verbose_name': 'regional del plan Partners',
                'verbose_name_plural': 'regionales del plan Partners',
                'db_table': 'bi_trade_regionales_partners',
                'ordering': ('nombre',),
            },
        ),
        # Nulable mientras se traspasan los datos; al final queda obligatoria.
        migrations.AddField(
            model_name='puntoventapartner',
            name='id_regional',
            field=models.ForeignKey(
                db_column='id_regional',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='puntos_venta',
                to='bi_trade.regionalpartner',
                verbose_name='regional',
            ),
        ),
        migrations.AddField(
            model_name='registropartner',
            name='id_regional',
            field=models.ForeignKey(
                db_column='id_regional',
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='registros',
                to='bi_trade.regionalpartner',
                verbose_name='regional',
            ),
        ),
        migrations.RunPython(texto_a_tabla, tabla_a_texto),
        migrations.RemoveField(
            model_name='puntoventapartner',
            name='regional',
        ),
        migrations.RemoveField(
            model_name='registropartner',
            name='regional',
        ),
        migrations.AlterField(
            model_name='puntoventapartner',
            name='id_regional',
            field=models.ForeignKey(
                db_column='id_regional',
                on_delete=django.db.models.deletion.PROTECT,
                related_name='puntos_venta',
                to='bi_trade.regionalpartner',
                verbose_name='regional',
            ),
        ),
        migrations.AlterField(
            model_name='registropartner',
            name='id_regional',
            field=models.ForeignKey(
                db_column='id_regional',
                on_delete=django.db.models.deletion.PROTECT,
                related_name='registros',
                to='bi_trade.regionalpartner',
                verbose_name='regional',
            ),
        ),
    ]
