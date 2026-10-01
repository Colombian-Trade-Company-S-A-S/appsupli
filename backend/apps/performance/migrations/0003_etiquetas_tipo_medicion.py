# Solo cambian las etiquetas que ve el jefe; los códigos guardados son los mismos,
# así que en la base no pasa nada.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('performance', '0002_periodo_edicion_habilitada_and_more'),
    ]

    operations = [
        migrations.AlterField(
            model_name='objetivo',
            name='tipo_medicion',
            field=models.CharField(choices=[('binario', 'Cumple o no cumple'), ('proporcional', 'Meta a alcanzar'), ('proporcional_inverso', 'Meta a reducir'), ('cualitativa', 'Cualitativa — entregables / hitos (2 criterios)'), ('formula', 'Cálculo personalizado')], max_length=30, verbose_name='tipo de medición'),
        ),
    ]
