"""
Lectores de los reportes del portal de Falabella: ventas diarias e inventario.

Son los .csv que descarga el portal, no plantillas nuestras, con muchas
columnas que aquí no se usan. De cada uno importan pocas:

  Ventas diarias
    · `SKU`       → `id_producto_falabella`
    · `ID Local`  → `id_punto_venta_falabella`
    · `Fecha`     → `fecha_venta`
    · `Unidades`  → `cantidad_vendida`

  Análisis semanal (inventario)
    · `ID Producto`       → `id_producto_falabella`
    · `ID Local`          → `id_punto_venta_falabella`
    · `Stock Disponible`  → `cantidad_inventario`

La tienda es `ID Local` en los dos: es el código que traen las ventas, y el
inventario lo trae también. El inventario trae además `ID Tienda`, que agrupa
varios locales (la tienda .com y su alterno, todos los CD…) y no cruzaría con
las tiendas de las ventas.

En los dos solo entran las filas con 1 unidad o más: cero y negativos
(devoluciones, ajustes, stock en rojo) no son venta ni stock.

El portal escribe mal algunas filas de ventas: cuando el costo trae decimales
envuelve la fila entera entre comillas, y queda como una sola celda. Esa
celda se vuelve a leer como CSV.
"""
import csv
import io
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime

COLUMNA_FECHA = 'Fecha'
COLUMNA_SKU = 'SKU'
COLUMNA_LOCAL = 'ID Local'
COLUMNA_UNIDADES = 'Unidades'
COLUMNA_PRODUCTO = 'ID Producto'
COLUMNA_STOCK = 'Stock Disponible'

#: Lo mínimo para que una fila entre, en ventas y en inventario.
UNIDADES_MINIMAS = 1

#: Los reportes pesan unos KB; esto solo frena un archivo equivocado.
TAMANO_MAXIMO = 20 * 1024 * 1024

#: Miles con punto, decimales con coma: «1.234» o «1.234,5».
_MILES = re.compile(r'^-?\d{1,3}(\.\d{3})+(,\d+)?$')


class ErrorDeReporte(Exception):
    """El archivo no es el reporte esperado. Lleva el mensaje para la persona."""


@dataclass
class FilaVenta:
    fecha: date
    sku: str
    local: str
    unidades: int


@dataclass
class LecturaVentas:
    """Lo que trae el reporte de ventas diarias."""

    #: Una por fila con 1 unidad o más. No se suman: dos filas iguales el
    #: mismo día son dos ventas.
    ventas: list[FilaVenta] = field(default_factory=list)
    filas_leidas: int = 0
    #: Devoluciones y ajustes: cero unidades o negativas.
    sin_unidades: int = 0


@dataclass
class LecturaInventario:
    """Lo que trae el reporte de inventario."""

    #: (sku, local) → unidades, solo de las filas con 1 o más.
    inventario: Counter = field(default_factory=Counter)
    filas_leidas: int = 0
    #: Filas con stock cero o negativo: no entran.
    sin_unidades: int = 0


def _normalizar(texto) -> str:
    """Sin tildes, mayúsculas ni espacios de más: «Categoría» = «categoria»."""
    sin_tildes = unicodedata.normalize('NFKD', str(texto or '')).encode('ascii', 'ignore')
    return ' '.join(sin_tildes.decode().split()).casefold()


def _decodificar(crudo: bytes) -> str:
    """El portal baja en UTF-8; Excel, al volver a guardar, en Windows-1252."""
    for codificacion in ('utf-8-sig', 'cp1252'):
        try:
            return crudo.decode(codificacion)
        except UnicodeDecodeError:
            continue
    return crudo.decode('latin-1')


def _filas_csv(archivo) -> tuple[list[str], list[list[str]]]:
    """El encabezado y las filas, ya con las filas envueltas en comillas abiertas."""
    crudo = archivo.read(TAMANO_MAXIMO + 1)
    if len(crudo) > TAMANO_MAXIMO:
        raise ErrorDeReporte('El archivo es demasiado grande para ser un reporte de Falabella.')
    texto = _decodificar(crudo)
    primera = texto.split('\n', 1)[0]
    # Excel en español guarda con punto y coma.
    separador = ';' if primera.count(';') > primera.count(',') else ','

    filas = csv.reader(io.StringIO(texto, newline=''), delimiter=separador)
    encabezados = next(filas, [])
    if len(encabezados) < 2:
        raise ErrorDeReporte('El archivo está vacío o no es un .csv.')

    leidas = []
    for fila in filas:
        if len(fila) == 1 and separador in fila[0]:
            fila = next(csv.reader([fila[0]], delimiter=separador), [])
        if any(celda.strip() for celda in fila):
            leidas.append(fila)
    return encabezados, leidas


def _indices(encabezados: list[str], columnas: tuple[str, ...], reporte: str) -> list[int]:
    posiciones = {_normalizar(celda): i for i, celda in enumerate(encabezados) if celda}
    faltantes = [c for c in columnas if _normalizar(c) not in posiciones]
    if faltantes:
        raise ErrorDeReporte(
            'Al archivo le faltan columnas: '
            + ', '.join(f'«{c}»' for c in faltantes)
            + f'. Súbelo tal como sale del portal de Falabella ({reporte}).'
        )
    return [posiciones[_normalizar(c)] for c in columnas]


def _fecha(texto: str) -> date | None:
    texto = texto.strip()
    for formato in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            continue
    return None


def _unidades(texto: str) -> int | None:
    """Las unidades de la celda, o `None` si no es un número. «1.234» son mil."""
    texto = texto.strip().replace(' ', '')
    if _MILES.match(texto):
        texto = texto.replace('.', '').replace(',', '.')
    elif ',' in texto:
        texto = texto.replace(',', '.')
    try:
        return int(float(texto))
    except ValueError:
        return None


def _codigo(texto: str) -> str:
    """Un código como texto. Si pasó por Excel puede venir como 123.0."""
    texto = texto.strip()
    return texto[:-2] if texto.endswith('.0') and texto[:-2].isdigit() else texto


def leer_ventas(archivo) -> LecturaVentas:
    """Las ventas diarias: todas sus fechas, solo las filas con 1 unidad o más."""
    encabezados, filas = _filas_csv(archivo)
    columnas = (COLUMNA_FECHA, COLUMNA_SKU, COLUMNA_LOCAL, COLUMNA_UNIDADES)
    i_fecha, i_sku, i_local, i_unidades = _indices(encabezados, columnas, 'Ventas diarias')
    ultima = max(i_fecha, i_sku, i_local, i_unidades)

    lectura = LecturaVentas()
    for fila in filas:
        if len(fila) <= ultima:
            continue
        fecha = _fecha(fila[i_fecha])
        unidades = _unidades(fila[i_unidades])
        sku, local = _codigo(fila[i_sku]), _codigo(fila[i_local])
        if fecha is None or unidades is None or not sku or not local:
            continue
        lectura.filas_leidas += 1
        if unidades < UNIDADES_MINIMAS:
            lectura.sin_unidades += 1
            continue
        lectura.ventas.append(FilaVenta(fecha, sku, local, unidades))

    if not lectura.filas_leidas:
        raise ErrorDeReporte('El archivo no trae filas de ventas con fecha, SKU, local y unidades.')
    return lectura


def leer_inventario(archivo) -> LecturaInventario:
    """
    El inventario: la foto del stock disponible, sin fecha.

    Si un producto aparece dos veces en el mismo local, se suma: es stock de
    los dos lados.
    """
    encabezados, filas = _filas_csv(archivo)
    columnas = (COLUMNA_PRODUCTO, COLUMNA_LOCAL, COLUMNA_STOCK)
    i_producto, i_local, i_stock = _indices(encabezados, columnas, 'Análisis semanal')
    ultima = max(i_producto, i_local, i_stock)

    lectura = LecturaInventario()
    for fila in filas:
        if len(fila) <= ultima:
            continue
        unidades = _unidades(fila[i_stock])
        sku, local = _codigo(fila[i_producto]), _codigo(fila[i_local])
        if unidades is None or not sku or not local:
            continue
        lectura.filas_leidas += 1
        if unidades < UNIDADES_MINIMAS:
            lectura.sin_unidades += 1
            continue
        lectura.inventario[(sku, local)] += unidades

    if not lectura.filas_leidas:
        raise ErrorDeReporte('El archivo no trae filas de inventario con producto, local y stock.')
    return lectura
