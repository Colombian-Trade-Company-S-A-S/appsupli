"""
La marca del producto pasa a ser una llave al catálogo (por su nombre, así la
columna no cambia) y cada canal estrena su tabla de precios por periodo.

Va aparte de la 0024 porque en Postgres no se puede alterar una tabla en la
misma transacción en que se actualizaron sus filas.
"""

import django.core.validators
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bi_trade', '0024_catalogo_de_marcas'),
    ]

    operations = [
        migrations.AlterField(
            model_name='producto',
            name='marca',
            field=models.ForeignKey(blank=True, db_column='marca', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='productos_claro', to='bi_trade.marca', to_field='nombre', verbose_name='marca'),
        ),
        migrations.AlterField(
            model_name='productofalabella',
            name='marca',
            field=models.ForeignKey(blank=True, db_column='marca', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='productos_falabella', to='bi_trade.marca', to_field='nombre', verbose_name='marca'),
        ),
        migrations.AlterField(
            model_name='productohc',
            name='marca',
            field=models.ForeignKey(blank=True, db_column='marca', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='productos_hc', to='bi_trade.marca', to_field='nombre', verbose_name='marca'),
        ),
        migrations.AlterField(
            model_name='productotmk',
            name='marca',
            field=models.ForeignKey(blank=True, db_column='marca', null=True, on_delete=django.db.models.deletion.PROTECT, related_name='productos_tmk', to='bi_trade.marca', to_field='nombre', verbose_name='marca'),
        ),
        migrations.CreateModel(
            name='PrecioProducto',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='creado el')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='actualizado el')),
                ('id_precio', models.AutoField(primary_key=True, serialize=False, verbose_name='id del precio')),
                ('desde', models.DateField(verbose_name='vigente desde')),
                ('hasta', models.DateField(blank=True, help_text='Vacío: sigue vigente.', null=True, verbose_name='vigente hasta')),
                ('precio_venta_coltrade', models.PositiveIntegerField(validators=[django.core.validators.MaxValueValidator(100000000)], verbose_name='precio de venta Coltrade')),
                ('id_producto', models.ForeignKey(db_column='id_producto', on_delete=django.db.models.deletion.CASCADE, related_name='precios', to='bi_trade.producto', verbose_name='producto')),
            ],
            options={
                'verbose_name': 'precio por periodo',
                'verbose_name_plural': 'precios por periodo',
                'db_table': 'bi_trade_precios',
                'ordering': ('id_producto', '-desde'),
                'abstract': False,
                'indexes': [models.Index(fields=['id_producto', 'desde'], name='precio_claro_prod_desde')],
                'constraints': [models.CheckConstraint(condition=models.Q(('hasta__isnull', True), ('hasta__gte', models.F('desde')), _connector='OR'), name='precio_claro_hasta_desde')],
            },
        ),
        migrations.CreateModel(
            name='PrecioProductoFalabella',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='creado el')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='actualizado el')),
                ('id_precio', models.AutoField(primary_key=True, serialize=False, verbose_name='id del precio')),
                ('desde', models.DateField(verbose_name='vigente desde')),
                ('hasta', models.DateField(blank=True, help_text='Vacío: sigue vigente.', null=True, verbose_name='vigente hasta')),
                ('precio_venta_coltrade', models.PositiveIntegerField(validators=[django.core.validators.MaxValueValidator(100000000)], verbose_name='precio de venta Coltrade')),
                ('id_producto', models.ForeignKey(db_column='id_producto_falabella', on_delete=django.db.models.deletion.CASCADE, related_name='precios', to='bi_trade.productofalabella', verbose_name='producto')),
            ],
            options={
                'verbose_name': 'precio por periodo Falabella',
                'verbose_name_plural': 'precios por periodo Falabella',
                'db_table': 'bi_trade_precios_falabella',
                'ordering': ('id_producto', '-desde'),
                'abstract': False,
                'indexes': [models.Index(fields=['id_producto', 'desde'], name='precio_falabella_prod_desde')],
                'constraints': [models.CheckConstraint(condition=models.Q(('hasta__isnull', True), ('hasta__gte', models.F('desde')), _connector='OR'), name='precio_falabella_hasta_desde')],
            },
        ),
        migrations.CreateModel(
            name='PrecioProductoHc',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='creado el')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='actualizado el')),
                ('id_precio', models.AutoField(primary_key=True, serialize=False, verbose_name='id del precio')),
                ('desde', models.DateField(verbose_name='vigente desde')),
                ('hasta', models.DateField(blank=True, help_text='Vacío: sigue vigente.', null=True, verbose_name='vigente hasta')),
                ('precio_venta_coltrade', models.PositiveIntegerField(validators=[django.core.validators.MaxValueValidator(100000000)], verbose_name='precio de venta Coltrade')),
                ('id_producto', models.ForeignKey(db_column='id_producto_hc', on_delete=django.db.models.deletion.CASCADE, related_name='precios', to='bi_trade.productohc', verbose_name='producto')),
            ],
            options={
                'verbose_name': 'precio por periodo Homecenter',
                'verbose_name_plural': 'precios por periodo Homecenter',
                'db_table': 'bi_trade_precios_hc',
                'ordering': ('id_producto', '-desde'),
                'abstract': False,
                'indexes': [models.Index(fields=['id_producto', 'desde'], name='precio_hc_prod_desde')],
                'constraints': [models.CheckConstraint(condition=models.Q(('hasta__isnull', True), ('hasta__gte', models.F('desde')), _connector='OR'), name='precio_hc_hasta_desde')],
            },
        ),
        migrations.CreateModel(
            name='PrecioProductoTmk',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='creado el')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='actualizado el')),
                ('id_precio', models.AutoField(primary_key=True, serialize=False, verbose_name='id del precio')),
                ('desde', models.DateField(verbose_name='vigente desde')),
                ('hasta', models.DateField(blank=True, help_text='Vacío: sigue vigente.', null=True, verbose_name='vigente hasta')),
                ('precio_venta_coltrade', models.PositiveIntegerField(validators=[django.core.validators.MaxValueValidator(100000000)], verbose_name='precio de venta Coltrade')),
                ('id_producto', models.ForeignKey(db_column='id_producto_tmk', on_delete=django.db.models.deletion.CASCADE, related_name='precios', to='bi_trade.productotmk', verbose_name='producto')),
            ],
            options={
                'verbose_name': 'precio por periodo Tmk',
                'verbose_name_plural': 'precios por periodo Tmk',
                'db_table': 'bi_trade_precios_tmk',
                'ordering': ('id_producto', '-desde'),
                'abstract': False,
                'indexes': [models.Index(fields=['id_producto', 'desde'], name='precio_tmk_prod_desde')],
                'constraints': [models.CheckConstraint(condition=models.Q(('hasta__isnull', True), ('hasta__gte', models.F('desde')), _connector='OR'), name='precio_tmk_hasta_desde')],
            },
        ),
    ]
