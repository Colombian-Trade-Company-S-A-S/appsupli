"""
`parent` en el permiso: uno que solo tiene sentido dentro de otro (en BI Trade,
«cargar ventas de HC» va dentro de «ver el informe de HC»).

Va sola, sin datos: en PostgreSQL el índice de la llave no se puede crear en
la misma transacción en que se tocan filas de la tabla. Los datos van en la
siguiente.
"""
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0015_permiso_descripcion_grupo_y_bi_trade'),
    ]

    operations = [
        migrations.AddField(
            model_name='permission',
            name='parent',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='hijos',
                to='accounts.permission',
                verbose_name='va dentro de',
            ),
        ),
    ]
