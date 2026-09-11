"""
Agrega `fecha_meta` y la mete en la llave única.

Las metas que ya existían no tienen fecha, así que se les asigna el primer día
del mes en que se agregó el campo: es un valor de relleno, revisable desde el
CRUD. La fecha va escrita a mano y no calculada para que la migración dé el
mismo resultado hoy y dentro de un año.
"""
import datetime

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [('bi_trade', '0002_inventario_metacomercial')]

    operations = [
        migrations.AddField(
            model_name='metacomercial',
            name='fecha_meta',
            field=models.DateField(default=datetime.date(2026, 9, 1), verbose_name='fecha de la meta'),
            preserve_default=False,
        ),
        migrations.AlterUniqueTogether(
            name='metacomercial',
            unique_together={('id_producto', 'id_punto_venta', 'fecha_meta')},
        ),
        migrations.AlterModelOptions(
            name='metacomercial',
            options={
                'ordering': ('-fecha_meta', 'id_punto_venta__nombre_pdv', 'id_producto__nombre_producto'),
                'verbose_name': 'meta',
                'verbose_name_plural': 'metas',
            },
        ),
    ]
