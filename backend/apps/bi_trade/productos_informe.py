"""
Los productos que el informe del ERP vende en Tmk y no existen en la app.

En Tmk entra toda venta de un producto que exista, tenga meta o no. Los que
no existen se ofrecen para crear antes de importar, y quien importa elige
cuáles. El informe dice cómo se llama el producto («Texto breve de material»)
y de qué marca es, pero no su precio Coltrade —su «Precio Venta» es el precio
al público—, así que el precio lo escribe quien importa; si no, queda en 0
hasta que se le ponga en Productos.

El flujo es el de los reportes de Falabella y HC, con una diferencia: aquí se
elige producto por producto, no todos o ninguno.

1. Sin `productos`, si falta alguno, 409 `productos_por_crear` con la lista:
   código, nombre y marca como quedarían, y las unidades que entran con él.
   No se ha guardado nada.
2. `productos=crear` con `crear` —los elegidos en JSON, cada uno con
   `codigo`, `nombre` y `precio`— los crea en la misma transacción que las
   ventas. `productos=omitir`, o `crear` vacío, importa sin ellos.

Solo se ofrece lo que entraría al crearlo: ventas del mes elegido, en un
punto de venta de Tmk, en un día que la importación va a cargar (en modo
completar, los días que ya tienen ventas no se tocan).
"""
import json
from collections import Counter
from dataclasses import dataclass

from rest_framework import status
from rest_framework.response import Response

from .canales import Canal
from .catalogo_reporte import MarcasDelReporte
from .informe import Lectura, MaterialDelInforme
from .models import PRECIO_MAXIMO

#: El largo de la llave y del nombre del producto en la base.
LARGO_CODIGO = 60
LARGO_NOMBRE = 60

#: Lo que se devuelve cuando no se creó nada.
NADA_CREADO = {
    'productos_creados': 0,
    'productos_sin_precio': 0,
    'marcas_creadas': [],
}


class ErrorDeEleccion(Exception):
    """Lo que se mandó en `crear` no sirve. Lleva el mensaje para la persona."""


def nombre_del_erp(texto: str) -> str:
    """
    «TORRE SONID AWPOC10L 800W» → «Torre Sonid Awpoc10L 800W», cortado a 60.

    Así están escritos los productos que ya hay en Tmk: cada tramo de letras
    con la primera en mayúscula.
    """
    return ' '.join(str(texto or '').split()).title()[:LARGO_NOMBRE].rstrip()


@dataclass
class ProductoPorCrear:
    codigo: str
    nombre: str
    #: La marca tal como la escribe el archivo («AIWA»); se resuelve al catálogo al crear.
    marca_archivo: str
    #: Las unidades que entran con él si se crea.
    unidades: int


class ProductosDelInforme:
    """Los productos que faltan en el canal para cargar todas las ventas del mes."""

    def __init__(
        self,
        lectura: Lectura,
        anio: int,
        mes: int,
        sobrescribir: bool,
        productos: set[str],
        puntos: set[str],
        canal: Canal,
    ):
        self.canal = canal
        dias_ocupados = (
            set()
            if sobrescribir
            else set(
                canal.venta.objects.filter(fecha_venta__year=anio, fecha_venta__month=mes)
                .values_list('fecha_venta', flat=True)
                .distinct()
            )
        )
        unidades: Counter = Counter()
        for (producto, centro, fecha), cantidad in lectura.ventas.items():
            if (fecha.year, fecha.month) != (anio, mes) or fecha in dias_ocupados:
                continue
            if producto in productos or centro not in puntos or len(producto) > LARGO_CODIGO:
                continue
            unidades[producto] += cantidad

        self.faltantes: dict[str, ProductoPorCrear] = {}
        for codigo in sorted(unidades):
            material = lectura.materiales.get(codigo) or MaterialDelInforme()
            self.faltantes[codigo] = ProductoPorCrear(
                codigo=codigo,
                nombre=nombre_del_erp(material.nombre) or codigo,
                marca_archivo=material.marca,
                unidades=unidades[codigo],
            )

    def __bool__(self) -> bool:
        return bool(self.faltantes)

    def pregunta(self) -> Response:
        """409 `productos_por_crear`: no es un error y no se ha tocado nada."""
        marcas = MarcasDelReporte()
        filas = []
        for producto in self.faltantes.values():
            marca = marcas.resolver(producto.marca_archivo)
            filas.append(
                {
                    'id_producto': producto.codigo,
                    'nombre_producto': producto.nombre,
                    'marca': marca,
                    'marca_nueva': marcas.es_nueva(marca),
                    'unidades': producto.unidades,
                }
            )
        cuantos = len(filas)
        return Response(
            {
                'code': 'productos_por_crear',
                'message': (
                    f'{cuantos} producto(s) vendido(s) en {self.canal.nombre} no existen en la '
                    'app. Elige cuáles crear antes de importar.'
                ),
                'productos_por_crear': filas,
                'marcas_nuevas': sorted(marcas.nuevas.values()),
            },
            status=status.HTTP_409_CONFLICT,
        )

    def elegidos(self, crudo) -> 'Eleccion':
        """
        Los productos que se eligió crear, ya validados, sin guardar todavía.

        `crudo` es la lista en JSON (así llega en el multipart) o ya como
        lista. Un código que no está entre los que faltan se ignora: no se
        crea nada que el archivo no esté vendiendo. El nombre vacío toma el
        que se propuso; el precio vacío es 0.
        """
        if crudo in (None, ''):
            lista = []
        elif isinstance(crudo, str):
            try:
                lista = json.loads(crudo)
            except ValueError as exc:
                raise ErrorDeEleccion('La lista de productos por crear no se pudo leer.') from exc
        else:
            lista = crudo
        if not isinstance(lista, list):
            raise ErrorDeEleccion('La lista de productos por crear no se pudo leer.')

        marcas = MarcasDelReporte()
        nuevos = []
        vistos = set()
        for item in lista:
            if not isinstance(item, dict):
                raise ErrorDeEleccion('La lista de productos por crear no se pudo leer.')
            codigo = str(item.get('codigo') or '').strip()
            propuesto = self.faltantes.get(codigo)
            if propuesto is None or codigo in vistos:
                continue
            vistos.add(codigo)

            nombre = ' '.join(str(item.get('nombre') or '').split()) or propuesto.nombre
            if len(nombre) > LARGO_NOMBRE:
                raise ErrorDeEleccion(
                    f'El nombre de {codigo} pasa de {LARGO_NOMBRE} caracteres.'
                )
            precio = _precio(item.get('precio'), codigo)
            nuevos.append(
                self.canal.producto(
                    id_producto=codigo,
                    nombre_producto=nombre,
                    marca_id=marcas.resolver(propuesto.marca_archivo),
                    precio_venta_tmk=precio,
                    precio_venta_coltrade=precio,
                )
            )
        return Eleccion(self.canal, nuevos, marcas)


def _precio(valor, codigo: str) -> int:
    if valor in (None, ''):
        return 0
    if isinstance(valor, bool):
        raise ErrorDeEleccion(f'El precio de {codigo} no es un número.')
    try:
        precio = valor if isinstance(valor, int) else int(str(valor).strip())
    except ValueError as exc:
        raise ErrorDeEleccion(
            f'El precio de {codigo} debe ser un número entero, sin puntos ni decimales.'
        ) from exc
    if not 0 <= precio <= PRECIO_MAXIMO:
        raise ErrorDeEleccion(f'El precio de {codigo} debe estar entre 0 y 100.000.000.')
    return precio


class Eleccion:
    """Los productos elegidos y las marcas que hay que crear con ellos."""

    def __init__(self, canal: Canal, productos: list, marcas: MarcasDelReporte):
        self.canal = canal
        self.productos = productos
        self.marcas = marcas

    def __bool__(self) -> bool:
        return bool(self.productos)

    @property
    def codigos(self) -> set[str]:
        return {producto.id_producto for producto in self.productos}

    def crear(self) -> dict:
        self.marcas.crear()
        # Si otra carga creó el mismo un instante antes, no es un error: ya existe.
        self.canal.producto.objects.bulk_create(self.productos, ignore_conflicts=True)
        return {
            'productos_creados': len(self.productos),
            'productos_sin_precio': sum(1 for p in self.productos if not p.precio_venta_coltrade),
            'marcas_creadas': sorted(self.marcas.nuevas.values()),
        }
