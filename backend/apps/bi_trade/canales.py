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
    #: Los catálogos fijos de sus formularios (regionales, materiales).
    opciones: dict
    #: Si mide en puntos. Solo Claro: los canales aparte van en dinero y
    #: unidades: sus productos no tienen puntaje y nada suyo habla de puntos.
    con_puntos: bool = True


CLARO = Canal(
    codigo='claro',
    nombre='Claro',
    prefijo_archivo='',
    punto=PuntoVenta,
    producto=Producto,
    venta=Venta,
    inventario=Inventario,
    meta=MetaComercial,
    opciones=OPCIONES,
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
    opciones=OPCIONES_HC,
    con_puntos=False,
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
    opciones=OPCIONES_FALABELLA,
    con_puntos=False,
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
    opciones=OPCIONES_TMK,
    con_puntos=False,
)

CANALES = {canal.codigo: canal for canal in (CLARO, HC, FALABELLA, TMK)}
