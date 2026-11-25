"""
La meta de HC pasa a ser de la tienda, por mes y en pesos (`total_meta`).

Antes era de cada producto en unidades, como en Claro. Homecenter manda un
valor por tienda y mes, así que ahora se guarda eso.

Va en dos tiempos, para no tumbar el backend publicado mientras se despliega
(la base local es la de producción y Render corre las migraciones al arrancar):

  · Ahora: entra `total_meta` (con 0 por defecto en la base), la llave pasa a
    (punto, mes) y las columnas viejas —`id_producto_hc`, `meta_cantidad`—
    quedan en la base pero opcionales. Django deja de verlas, el código de
    antes las sigue encontrando y no se cae.
  · Después, con el cambio ya publicado, se pueden borrar esas dos columnas.

No había metas de HC cargadas: no se pierde nada.
"""
import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('bi_trade', '0028_cadena_de_asesores'),
    ]

    operations = [
        migrations.AddField(
            model_name='metacomercialhc',
            name='total_meta',
            field=models.PositiveBigIntegerField(
                db_default=0,
                validators=[django.core.validators.MaxValueValidator(100_000_000_000)],
                verbose_name='meta en dinero',
            ),
        ),
        # Primero la llave nueva: la vieja nombra `id_producto`, que sale después.
        migrations.AlterUniqueTogether(
            name='metacomercialhc',
            unique_together={('id_punto_venta', 'fecha_meta')},
        ),
        migrations.AlterModelOptions(
            name='metacomercialhc',
            options={
                'ordering': ('-fecha_meta', 'id_punto_venta__nombre_pdv'),
                'verbose_name': 'meta Homecenter',
                'verbose_name_plural': 'metas Homecenter',
            },
        ),
        # Las columnas de la meta por producto: fuera del modelo, pero en la base
        # (vacías y opcionales) hasta que el código nuevo esté publicado.
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.AlterField(
                    model_name='metacomercialhc',
                    name='id_producto',
                    field=models.ForeignKey(
                        db_column='id_producto_hc',
                        null=True,
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name='metas',
                        to='bi_trade.productohc',
                        verbose_name='producto',
                    ),
                ),
                migrations.AlterField(
                    model_name='metacomercialhc',
                    name='meta_cantidad',
                    field=models.PositiveIntegerField(null=True, verbose_name='meta de unidades'),
                ),
            ],
            state_operations=[
                migrations.RemoveField(model_name='metacomercialhc', name='id_producto'),
                migrations.RemoveField(model_name='metacomercialhc', name='meta_cantidad'),
            ],
        ),
    ]
