"""
Arma el catálogo de marcas con las que ya estaban escritas en los productos.

Cada nombre distinto queda como una marca, salvo los que solo cambian en
mayúsculas, tildes o espacios («BELKIN», «Belkin »): esos son la misma, y
gana la forma más usada. Lo que no es una marca —«#N/A», vacío— queda sin
marca. No se juntan nombres distintos aunque parezcan la misma marca
(«Generico», «Generica»): eso lo decide una persona, fusionándolas en la app.

En la 0025 la columna pasa a ser la llave al catálogo; aquí solo se deja lista.
"""
import unicodedata
from collections import Counter

from django.db import migrations, models

#: Lo que llegó en la columna de marca y no es una marca.
SIN_MARCA = {'', '#n/a', 'n/a', 'na', '-', 'sin marca'}

PRODUCTOS = ('Producto', 'ProductoHc', 'ProductoFalabella', 'ProductoTmk')


def _limpio(nombre) -> str:
    return ' '.join(str(nombre or '').split())


def _clave(nombre: str) -> str:
    plano = unicodedata.normalize('NFD', nombre).encode('ascii', 'ignore').decode()
    return plano.casefold()


def poblar_marcas(apps, schema_editor):
    Marca = apps.get_model('bi_trade', 'Marca')
    modelos = [apps.get_model('bi_trade', nombre) for nombre in PRODUCTOS]

    usos = Counter()
    for modelo in modelos:
        for nombre, cuantos in modelo.objects.values_list('marca').annotate(n=models.Count('pk')):
            limpio = _limpio(nombre)
            if limpio.casefold() not in SIN_MARCA:
                usos[limpio] += cuantos

    # La forma más usada de cada nombre es la que queda.
    canonica: dict[str, str] = {}
    for nombre, _cuantos in usos.most_common():
        canonica.setdefault(_clave(nombre), nombre)
    Marca.objects.bulk_create(Marca(nombre=nombre) for nombre in sorted(set(canonica.values())))

    for modelo in modelos:
        for nombre in modelo.objects.values_list('marca', flat=True).distinct():
            limpio = _limpio(nombre)
            destino = None if limpio.casefold() in SIN_MARCA else canonica[_clave(limpio)]
            if destino != nombre:
                modelo.objects.filter(marca=nombre).update(marca=destino)


class Migration(migrations.Migration):

    dependencies = [
        ('bi_trade', '0023_enlace_tablero_belkin'),
    ]

    operations = [
        migrations.CreateModel(
            name='Marca',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='creado el')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='actualizado el')),
                ('id_marca', models.AutoField(primary_key=True, serialize=False, verbose_name='id de la marca')),
                ('nombre', models.CharField(max_length=60, unique=True, verbose_name='nombre')),
            ],
            options={
                'verbose_name': 'marca',
                'verbose_name_plural': 'marcas',
                'db_table': 'bi_trade_marcas',
                'ordering': ('nombre',),
            },
        ),
        # «Sin marca» tiene que poder guardarse en los canales que la exigían.
        *[
            migrations.AlterField(
                model_name=modelo,
                name='marca',
                field=models.CharField(blank=True, max_length=60, null=True, verbose_name='marca'),
            )
            for modelo in ('producto', 'productofalabella', 'productotmk')
        ],
        migrations.RunPython(poblar_marcas, migrations.RunPython.noop),
    ]
