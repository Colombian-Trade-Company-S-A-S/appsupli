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
(devoluciones, ajustes, stock en rojo) no son venta ni stock. Tampoco entra
Falabella.com —la tienda .com y su alterno, por el nombre del local—: lo que
se mide son las tiendas.

De las mismas filas sale lo que falte en la app, para crearlo:

  · El producto: `Producto` es el nombre (en nombre propio, como el resto del
    catálogo), `Marca` la marca, y el precio —Falabella y Coltrade— el valor
    de UNA unidad. El archivo trae el de toda la fila:
      - en ventas, la `Venta neta` ÷ `Unidades`, promediando todas las ventas
        del producto en el archivo (no el costo: el tablero mide lo vendido);
      - en inventario, `Stock a costo Disponible` ÷ `Stock Disponible`,
        sumando todos los locales donde hay stock.
  · La tienda: `ID Local` y `Local` (el nombre).

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

from .catalogo_reporte import nombre_propio

COLUMNA_FECHA = 'Fecha'
COLUMNA_SKU = 'SKU'
COLUMNA_LOCAL = 'ID Local'
COLUMNA_UNIDADES = 'Unidades'
COLUMNA_PRODUCTO = 'ID Producto'
COLUMNA_STOCK = 'Stock Disponible'
# Para crear los productos que falten. Si el archivo no las trae, se importa
# igual, solo que sin ofrecer crear nada.
COLUMNA_NOMBRE = 'Producto'
COLUMNA_MARCA = 'Marca'
COLUMNA_VENTA_NETA = 'Venta neta'
COLUMNA_COSTO_STOCK = 'Stock a costo Disponible'
# El nombre del local: para crear la tienda y para reconocer Falabella.com.
COLUMNA_NOMBRE_LOCAL = 'Local'

#: Lo mínimo para que una fila entre, en ventas y en inventario.
UNIDADES_MINIMAS = 1

#: Los reportes pesan unos KB; esto solo frena un archivo equivocado.
TAMANO_MAXIMO = 20 * 1024 * 1024

#: Miles con punto, decimales con coma: «1.234» o «1.234,5».
_MILES = re.compile(r'^-?\d{1,3}(\.\d{3})+(,\d+)?$')

#: Largo del nombre en el modelo de producto.
LARGO_NOMBRE = 60


class ErrorDeReporte(Exception):
    """El archivo no es el reporte esperado. Lleva el mensaje para la persona."""


@dataclass
class FilaVenta:
    fecha: date
    sku: str
    local: str
    unidades: int


@dataclass
class ProductoDelReporte:
    """Un producto como lo trae el reporte, para crearlo si no existe."""

    sku: str
    nombre: str
    marca: str
    #: El costo de una unidad, en pesos; `None` si el archivo no lo trae.
    precio: int | None


@dataclass
class LecturaVentas:
    """Lo que trae el reporte de ventas diarias."""

    #: Una por fila con 1 unidad o más. No se suman: dos filas iguales el
    #: mismo día son dos ventas.
    ventas: list[FilaVenta] = field(default_factory=list)
    filas_leidas: int = 0
    #: Devoluciones y ajustes: cero unidades o negativas.
    sin_unidades: int = 0
    #: Filas de Falabella.com: no entran.
    de_falabella_com: int = 0
    #: sku → producto, de las filas que entran.
    productos: dict[str, ProductoDelReporte] = field(default_factory=dict)
    #: ID Local → nombre, de las filas que entran (si el archivo trae `Local`).
    tiendas: dict[str, str] = field(default_factory=dict)


@dataclass
class LecturaInventario:
    """Lo que trae el reporte de inventario."""

    #: (sku, local) → unidades, solo de las filas con 1 o más.
    inventario: Counter = field(default_factory=Counter)
    filas_leidas: int = 0
    #: Filas con stock cero o negativo: no entran.
    sin_unidades: int = 0
    #: Filas de Falabella.com: no entran.
    de_falabella_com: int = 0
    #: sku → producto, de las filas con stock de 1 o más.
    productos: dict[str, ProductoDelReporte] = field(default_factory=dict)
    #: ID Local → nombre, de las filas que entran (si el archivo trae `Local`).
    tiendas: dict[str, str] = field(default_factory=dict)


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


def _posiciones(encabezados: list[str]) -> dict[str, int]:
    return {_normalizar(celda): i for i, celda in enumerate(encabezados) if celda}


def _indices(encabezados: list[str], columnas: tuple[str, ...], reporte: str) -> list[int]:
    posiciones = _posiciones(encabezados)
    faltantes = [c for c in columnas if _normalizar(c) not in posiciones]
    if faltantes:
        raise ErrorDeReporte(
            'Al archivo le faltan columnas: '
            + ', '.join(f'«{c}»' for c in faltantes)
            + f'. Súbelo tal como sale del portal de Falabella ({reporte}).'
        )
    return [posiciones[_normalizar(c)] for c in columnas]


def _indices_opcionales(encabezados: list[str], columnas: tuple[str, ...]) -> list[int] | None:
    """Las columnas del producto, o `None` si falta alguna: entonces no se crea nada."""
    posiciones = _posiciones(encabezados)
    if any(_normalizar(c) not in posiciones for c in columnas):
        return None
    return [posiciones[_normalizar(c)] for c in columnas]


def _celda(fila: list[str], i: int) -> str:
    return fila[i] if i < len(fila) else ''


def _fecha(texto: str) -> date | None:
    texto = texto.strip()
    for formato in ('%Y-%m-%d', '%d/%m/%Y', '%d-%m-%Y', '%Y/%m/%d'):
        try:
            return datetime.strptime(texto, formato).date()
        except ValueError:
            continue
    return None


def _numero(texto: str) -> float | None:
    """El número de la celda, o `None` si no lo es. «1.234» son mil; «$» se ignora."""
    texto = texto.strip().replace(' ', '').replace('$', '')
    if _MILES.match(texto):
        texto = texto.replace('.', '').replace(',', '.')
    elif ',' in texto:
        texto = texto.replace(',', '.')
    try:
        return float(texto)
    except ValueError:
        return None


def _unidades(texto: str) -> int | None:
    """Las unidades de la celda, o `None` si no es un número."""
    numero = _numero(texto)
    return int(numero) if numero is not None else None


def _codigo(texto: str) -> str:
    """Un código como texto. Si pasó por Excel puede venir como 123.0."""
    texto = texto.strip()
    return texto[:-2] if texto.endswith('.0') and texto[:-2].isdigit() else texto


def es_falabella_com(nombre_local: str) -> bool:
    """«TIENDA FALABELLA .COM», «FALABELLA. COM ALTERNO»: la venta por internet."""
    return 'FALABELLA.COM' in re.sub(r'\s', '', nombre_local or '').upper()


def _nombre_tienda(nombre: str, local: str) -> str:
    return nombre_propio(nombre, 100, conectores=False) or local


# ── Lectores ───────────────────────────────────────────────────────────────


def leer_ventas(archivo) -> LecturaVentas:
    """
    Las ventas diarias: todas sus fechas, solo las filas con 1 unidad o más y
    sin las de Falabella.com.
    """
    encabezados, filas = _filas_csv(archivo)
    columnas = (COLUMNA_FECHA, COLUMNA_SKU, COLUMNA_LOCAL, COLUMNA_UNIDADES)
    i_fecha, i_sku, i_local, i_unidades = _indices(encabezados, columnas, 'Ventas diarias')
    del_producto = _indices_opcionales(
        encabezados, (COLUMNA_NOMBRE, COLUMNA_MARCA, COLUMNA_VENTA_NETA)
    )
    con_nombre = _indices_opcionales(encabezados, (COLUMNA_NOMBRE_LOCAL,))
    i_nombre_local = con_nombre[0] if con_nombre else None
    ultima = max(i_fecha, i_sku, i_local, i_unidades)

    lectura = LecturaVentas()
    # sku → [venta neta, unidades] de todas sus ventas: el precio es el promedio.
    netas: dict[str, list[float]] = {}
    for fila in filas:
        if len(fila) <= ultima:
            continue
        fecha = _fecha(fila[i_fecha])
        unidades = _unidades(fila[i_unidades])
        sku, local = _codigo(fila[i_sku]), _codigo(fila[i_local])
        if fecha is None or unidades is None or not sku or not local:
            continue
        nombre_local = _celda(fila, i_nombre_local) if i_nombre_local is not None else ''
        if es_falabella_com(nombre_local):
            lectura.de_falabella_com += 1
            continue
        lectura.filas_leidas += 1
        if unidades < UNIDADES_MINIMAS:
            lectura.sin_unidades += 1
            continue
        lectura.ventas.append(FilaVenta(fecha, sku, local, unidades))
        if i_nombre_local is not None:
            lectura.tiendas.setdefault(local, _nombre_tienda(nombre_local, local))

        if del_producto is None:
            continue
        i_nombre, i_marca, i_neta = del_producto
        lectura.productos.setdefault(
            sku,
            ProductoDelReporte(
                sku, nombre_propio(_celda(fila, i_nombre)), _celda(fila, i_marca).strip(), None
            ),
        )
        neta = _numero(_celda(fila, i_neta))
        if neta is None or neta < 0:
            continue
        # La venta neta de la fila es la de todas sus unidades: se suma todo y
        # al final se divide, para que el precio sea el promedio del archivo.
        acumulado = netas.setdefault(sku, [0.0, 0.0])
        acumulado[0] += neta
        acumulado[1] += unidades

    for sku, (neta, unidades) in netas.items():
        lectura.productos[sku].precio = round(neta / unidades)

    if not lectura.filas_leidas:
        raise ErrorDeReporte('El archivo no trae filas de ventas con fecha, SKU, local y unidades.')
    return lectura


def leer_inventario(archivo) -> LecturaInventario:
    """
    El inventario: la foto del stock disponible, sin fecha.

    Si un producto aparece dos veces en el mismo local, se suma: es stock de
    los dos lados. El stock de Falabella.com no entra, como sus ventas.
    """
    encabezados, filas = _filas_csv(archivo)
    columnas = (COLUMNA_PRODUCTO, COLUMNA_LOCAL, COLUMNA_STOCK)
    i_producto, i_local, i_stock = _indices(encabezados, columnas, 'Análisis semanal')
    del_producto = _indices_opcionales(
        encabezados, (COLUMNA_NOMBRE, COLUMNA_MARCA, COLUMNA_COSTO_STOCK)
    )
    con_nombre = _indices_opcionales(encabezados, (COLUMNA_NOMBRE_LOCAL,))
    i_nombre_local = con_nombre[0] if con_nombre else None
    ultima = max(i_producto, i_local, i_stock)

    lectura = LecturaInventario()
    # sku → [costo total, unidades], de las filas con stock y costo.
    costos: dict[str, list[float]] = {}
    for fila in filas:
        if len(fila) <= ultima:
            continue
        unidades = _unidades(fila[i_stock])
        sku, local = _codigo(fila[i_producto]), _codigo(fila[i_local])
        if unidades is None or not sku or not local:
            continue
        nombre_local = _celda(fila, i_nombre_local) if i_nombre_local is not None else ''
        if es_falabella_com(nombre_local):
            lectura.de_falabella_com += 1
            continue
        lectura.filas_leidas += 1
        if unidades < UNIDADES_MINIMAS:
            lectura.sin_unidades += 1
            continue
        lectura.inventario[(sku, local)] += unidades
        if i_nombre_local is not None:
            lectura.tiendas.setdefault(local, _nombre_tienda(nombre_local, local))

        if del_producto is None:
            continue
        i_nombre, i_marca, i_costo = del_producto
        lectura.productos.setdefault(
            sku,
            ProductoDelReporte(
                sku, nombre_propio(_celda(fila, i_nombre)), _celda(fila, i_marca).strip(), None
            ),
        )
        costo = _numero(_celda(fila, i_costo))
        if costo is None or costo < 0:
            continue
        # El costo es el de todo el stock del local: se suma y al final se divide.
        acumulado = costos.setdefault(sku, [0.0, 0.0])
        acumulado[0] += costo
        acumulado[1] += unidades

    for sku, (costo, unidades) in costos.items():
        lectura.productos[sku].precio = round(costo / unidades)

    if not lectura.filas_leidas:
        raise ErrorDeReporte('El archivo no trae filas de inventario con producto, local y stock.')
    return lectura
