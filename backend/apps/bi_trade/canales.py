"""
Los canales del BI: Claro, Homecenter, Falabella y Tmk Ecommerce Claro.

Cada canal tiene sus propias tablas, pero el tablero es el mismo: la meta del
mes repartida entre los días hábiles, el cumplimiento del día, los cortes por
regional y punto de venta. Un `Canal` dice de qué tablas sale cada cosa, y el
cálculo recibe el canal en vez de nombrar los modelos: así hay un solo cálculo
y lo que se corrija queda corregido en todos.
"""
from dataclasses import dataclass

from django.db import models

from .models import (
    Inventario,
    InventarioFalabella,
    InventarioHc,
    InventarioTmk,
    MetaComercial,
    MetaComercialFalabella,
    MetaComercialHc,
    MetaComercialTmk,
    PrecioProducto,
    PrecioProductoFalabella,
    PrecioProductoHc,
    PrecioProductoTmk,
    Producto,
    ProductoFalabella,
    ProductoHc,
    ProductoTmk,
    PuntoVenta,
    PuntoVentaFalabella,
    PuntoVentaHc,
    PuntoVentaTmk,
    Venta,
    VentaFalabella,
    VentaHc,
    VentaTmk,
)
from .serializers import OPCIONES, OPCIONES_FALABELLA, OPCIONES_HC, OPCIONES_TMK


@dataclass(frozen=True)
class Canal:
    codigo: str
    nombre: str
    #: Va delante del nombre de los archivos que se descargan: `hc-avance-…`.
    prefijo_archivo: str
    punto: type[models.Model]
    producto: type[models.Model]
    venta: type[models.Model]
    inventario: type[models.Model]
    meta: type[models.Model]
    #: Los precios Coltrade por periodo de sus productos (ver `precios`).
    precio: type[models.Model]
    #: Los catálogos fijos de sus formularios (regionales, materiales).
    opciones: dict
    #: Si mide en puntos. Solo Claro: los canales aparte van en dinero y
    #: unidades: sus productos no tienen puntaje y nada suyo habla de puntos.
    con_puntos: bool = True
    #: Si solo cuenta lo que tiene meta: al importar ventas y en el tablero, solo
    #: entra un producto con meta ese mes en ese punto de venta. Claro, Tmk y
    #: Falabella (en Falabella, solo en el tablero: ver `carga_sin_meta`).
    solo_con_meta: bool = False
    #: Si al importar entran también las ventas sin meta, aunque el tablero solo
    #: cuente lo que la tiene. Así, poner la meta después no obliga a volver a
    #: subir las ventas. Solo Falabella.
    carga_sin_meta: bool = False

    #: Si la meta es de la tienda en dinero (`total_meta`), no de cada producto
    #: en unidades. Solo HC. Entonces no se filtra ni se agrupa por producto o
    #: marca: la meta de la tienda es una sola, y con un filtro de marca se
    #: mide lo vendido de esa marca contra la meta completa de la tienda.
    meta_por_punto: bool = False

    @property
    def importa_solo_con_meta(self) -> bool:
        """Si al importar ventas se dejan fuera las de productos sin meta."""
        return self.solo_con_meta and not self.carga_sin_meta


CLARO = Canal(
    codigo='claro',
    nombre='Claro',
    prefijo_archivo='',
    punto=PuntoVenta,
    producto=Producto,
    venta=Venta,
    inventario=Inventario,
    meta=MetaComercial,
    precio=PrecioProducto,
    opciones=OPCIONES,
    solo_con_meta=True,
)

HC = Canal(
    codigo='hc',
    nombre='Homecenter',
    prefijo_archivo='hc-',
    punto=PuntoVentaHc,
    producto=ProductoHc,
    venta=VentaHc,
    inventario=InventarioHc,
    meta=MetaComercialHc,
    precio=PrecioProductoHc,
    opciones=OPCIONES_HC,
    con_puntos=False,
    # La meta llega por tienda y mes, en pesos.
    meta_por_punto=True,
)

FALABELLA = Canal(
    codigo='falabella',
    nombre='Falabella',
    prefijo_archivo='falabella-',
    punto=PuntoVentaFalabella,
    producto=ProductoFalabella,
    venta=VentaFalabella,
    inventario=InventarioFalabella,
    meta=MetaComercialFalabella,
    precio=PrecioProductoFalabella,
    opciones=OPCIONES_FALABELLA,
    con_puntos=False,
    # Como Claro y Tmk, el tablero solo cuenta lo que tiene meta: Falabella.com
    # y las tiendas sin meta no inflan el cumplimiento. Pero, a diferencia de
    # ellos, al importar entra todo, tenga meta o no.
    solo_con_meta=True,
    carga_sin_meta=True,
)

TMK = Canal(
    codigo='tmk',
    nombre='Tmk Ecommerce Claro',
    prefijo_archivo='tmk-',
    punto=PuntoVentaTmk,
    producto=ProductoTmk,
    venta=VentaTmk,
    inventario=InventarioTmk,
    meta=MetaComercialTmk,
    precio=PrecioProductoTmk,
    opciones=OPCIONES_TMK,
    con_puntos=False,
    # Como Claro: del informe del ERP solo cuenta lo que tiene meta en Tmk.
    solo_con_meta=True,
)

CANALES = {canal.codigo: canal for canal in (CLARO, HC, FALABELLA, TMK)}
