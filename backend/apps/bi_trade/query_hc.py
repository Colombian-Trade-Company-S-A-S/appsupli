"""
Lectores de los «queries» del portal de Homecenter: inventario y ventas.

Son los archivos que descarga el portal, no plantillas nuestras: una fila por
producto y tienda (y por día), con muchas columnas que aquí no se usan. De
cada archivo importan pocas, y las comparten:

  · `Código SKU`  → `id_producto_hc`
  · `EAN Tienda`  → `id_punto_venta_hc`. Vacío es la bodega del proveedor o
    la venta a distancia, que en la app es la tienda `TIENDA_SIN_EAN`.
  · `Fecha`       → el día de la fila.
  · Las unidades: `Unidades` en el inventario, `Unidades Vendidas` en las
    ventas. Solo entran las de 1 o más: cero y negativos (devoluciones,
    ajustes) no son stock ni venta.

La segunda fila de los dos archivos repite los tipos («Fecha», «Texto»…): no
tiene fecha ni número y se salta como cualquier fila vacía.
"""
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime

from openpyxl import load_workbook

#: La tienda a la que va una fila sin `EAN Tienda`.
TIENDA_SIN_EAN = '7703670900993'

COLUMNA_FECHA = 'Fecha'
COLUMNA_SKU = 'Código SKU'
COLUMNA_TIENDA = 'EAN Tienda'
COLUMNA_UNIDADES_INVENTARIO = 'Unidades'
COLUMNA_UNIDADES_VENTA = 'Unidades Vendidas'


class ErrorDeQuery(Exception):
    """El archivo no es el querie esperado. Lleva el mensaje para la persona."""


@dataclass
class FilaQuery:
    fecha: date
    sku: str
    tienda: str
    unidades: int


@dataclass
class LecturaQuery:
    """Lo que trae el querie de inventario."""

    #: (sku, tienda) → unidades, solo del día más reciente y solo las de 1 o más.
    inventario: Counter = field(default_factory=Counter)
    #: El día que se cargó.
    fecha: date | None = None
    #: Los días que traía el archivo, del más viejo al más nuevo.
    fechas: list[date] = field(default_factory=list)
    #: Filas del día cargado.
    filas_del_dia: int = 0
    #: Filas de ese día con cero unidades o negativas: no entran.
    sin_unidades: int = 0
    #: Filas de ese día sin `EAN Tienda`, que fueron a `TIENDA_SIN_EAN`.
    sin_tienda: int = 0
    #: Filas de días anteriores: no entran.
    de_otros_dias: int = 0


@dataclass
class LecturaVentasQuery:
    """Lo que trae el querie de ventas."""

    #: Una por fila del archivo con 1 unidad o más. No se suman: dos filas
    #: iguales el mismo día son dos ventas (por ejemplo, de canales distintos).
    ventas: list[FilaQuery] = field(default_factory=list)
    filas_leidas: int = 0
    #: Devoluciones y ajustes: cero unidades o negativas.
    sin_unidades: int = 0
    #: Filas sin `EAN Tienda`, que fueron a `TIENDA_SIN_EAN`.
    sin_tienda: int = 0


def _normalizar(texto) -> str:
    return ' '.join(str(texto or '').split()).casefold()


def _texto(valor) -> str:
    """Un código como texto. Excel a veces lo guarda como número: 7703670900993.0."""
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    return str(valor).strip() if valor is not None else ''


def _fecha(valor) -> date | None:
    if isinstance(valor, datetime):
        return valor.date()
    if isinstance(valor, date):
        return valor
    texto = _texto(valor)
    for formato in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y'):
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            continue
    return None


def _unidades(valor) -> int | None:
    """Las unidades de la fila, o `None` si la celda no es un número."""
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int | float):
        return int(valor)
    try:
        return int(float(_texto(valor)))
    except ValueError:
        return None


def _leer_filas(archivo, columna_unidades: str) -> list[FilaQuery]:
    """Todas las filas con fecha, SKU y unidades, con la tienda ya resuelta."""
    try:
        libro = load_workbook(archivo, data_only=True, read_only=True)
    except Exception as exc:  # noqa: BLE001 — openpyxl lanza de todo con archivos corruptos
        raise ErrorDeQuery('No se pudo abrir el archivo. Debe ser un Excel .xlsx.') from exc
    try:
        filas = libro.worksheets[0].iter_rows(values_only=True)
        encabezados = {
            _normalizar(celda): i for i, celda in enumerate(next(filas, ())) if celda
        }
        columnas = (COLUMNA_FECHA, COLUMNA_SKU, COLUMNA_TIENDA, columna_unidades)
        faltantes = [c for c in columnas if _normalizar(c) not in encabezados]
        if faltantes:
            raise ErrorDeQuery(
                'Al archivo le faltan columnas: '
                + ', '.join(faltantes)
                + '. Súbelo tal como sale del portal de Homecenter.'
            )
        i_fecha, i_sku, i_tienda, i_unidades = (encabezados[_normalizar(c)] for c in columnas)
        ultima = max(i_fecha, i_sku, i_tienda, i_unidades)

        leidas = []
        for fila in filas:
            if fila is None or len(fila) <= ultima:
                continue
            fecha = _fecha(fila[i_fecha])
            unidades = _unidades(fila[i_unidades])
            sku = _texto(fila[i_sku])
            if fecha is None or unidades is None or not sku:
                continue
            leidas.append(FilaQuery(fecha, sku, _texto(fila[i_tienda]), unidades))
        return leidas
    finally:
        libro.close()


def leer_query(archivo) -> LecturaQuery:
    """
    El querie de inventario.

    Puede traer varios días, una foto del stock por día. El inventario de la
    app es el stock de hoy, así que se toma solo el día más reciente: sumar los
    días contaría el mismo stock varias veces.
    """
    filas = _leer_filas(archivo, COLUMNA_UNIDADES_INVENTARIO)
    if not filas:
        raise ErrorDeQuery('El archivo no trae filas de inventario con fecha y unidades.')

    lectura = LecturaQuery(fechas=sorted({fila.fecha for fila in filas}))
    lectura.fecha = lectura.fechas[-1]
    for fila in filas:
        if fila.fecha != lectura.fecha:
            lectura.de_otros_dias += 1
            continue
        lectura.filas_del_dia += 1
        if not fila.tienda:
            lectura.sin_tienda += 1
        if fila.unidades < 1:
            lectura.sin_unidades += 1
            continue
        # Un mismo producto en la misma tienda dos veces el mismo día (otra
        # ubicación dentro de la tienda) es stock de los dos lados: se suma.
        lectura.inventario[(fila.sku, fila.tienda or TIENDA_SIN_EAN)] += fila.unidades
    return lectura


def leer_query_ventas(archivo) -> LecturaVentasQuery:
    """El querie de ventas: todas sus fechas, solo las filas con 1 unidad o más."""
    filas = _leer_filas(archivo, COLUMNA_UNIDADES_VENTA)
    if not filas:
        raise ErrorDeQuery('El archivo no trae filas de ventas con fecha y unidades.')

    lectura = LecturaVentasQuery(filas_leidas=len(filas))
    for fila in filas:
        if fila.unidades < 1:
            lectura.sin_unidades += 1
            continue
        if not fila.tienda:
            lectura.sin_tienda += 1
            fila.tienda = TIENDA_SIN_EAN
        lectura.ventas.append(fila)
    return lectura
