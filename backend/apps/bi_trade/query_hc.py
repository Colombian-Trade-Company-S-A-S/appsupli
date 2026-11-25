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
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime

from openpyxl import load_workbook

from .catalogo_reporte import nombre_propio

#: La tienda a la que va una fila sin `EAN Tienda` (o sin `EAN Ubicación`).
TIENDA_SIN_EAN = '7703670900993'
#: Su nombre, si hay que crearla: así la llama el reporte de ventas.
NOMBRE_TIENDA_SIN_EAN = 'Venta Distancia Bogota'

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


@contextmanager
def _hoja(archivo, columnas: tuple[str, ...]):
    """
    Los encabezados (normalizados → índice) y las filas de la primera hoja.

    Exige `columnas`; las demás se buscan con `encabezados.get`. Cierra el
    libro al salir.
    """
    try:
        libro = load_workbook(archivo, data_only=True, read_only=True)
    except Exception as exc:  # noqa: BLE001 — openpyxl lanza de todo con archivos corruptos
        raise ErrorDeQuery('No se pudo abrir el archivo. Debe ser un Excel .xlsx.') from exc
    try:
        filas = libro.worksheets[0].iter_rows(values_only=True)
        encabezados = {
            _normalizar(celda): i for i, celda in enumerate(next(filas, ())) if celda
        }
        faltantes = [c for c in columnas if _normalizar(c) not in encabezados]
        if faltantes:
            raise ErrorDeQuery(
                'Al archivo le faltan columnas: '
                + ', '.join(faltantes)
                + '. Súbelo tal como sale del portal de Homecenter.'
            )
        yield encabezados, filas
    finally:
        libro.close()


def _leer_filas(archivo, columna_unidades: str) -> list[FilaQuery]:
    """Todas las filas con fecha, SKU y unidades, con la tienda ya resuelta."""
    columnas = (COLUMNA_FECHA, COLUMNA_SKU, COLUMNA_TIENDA, columna_unidades)
    with _hoja(archivo, columnas) as (encabezados, filas):
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


# ── El reporte de ventas completo: el botón «Importar» del tablero HC ───────
#
# Es el mismo archivo del querie de ventas («Ventas Sell Out Precio Prov.»),
# leído con más columnas: el `Canal` de cada fila, para elegir cuáles entran, y
# los datos para crear los productos y las tiendas que falten:
#
#   Producto                                Tienda
#   · `Código SKU`           → código       · `EAN Tienda`    → código
#   · `Código EAN`           → EAN          · `Nombre Tienda` → nombre
#   · `Referencia Proveedor` → SKU Coltrade
#   · `Desc. SKU`            → nombre, en nombre propio y sin los asteriscos
#   · `Marca`                → marca
#   · `Ventas Precio Proveedor` ÷ `Unidades Vendidas` → precio Coltrade y HC.
#     El valor es el de toda la fila: se lleva a una unidad, de la venta más
#     reciente del producto.

COLUMNA_CANAL = 'Canal'
COLUMNA_NOMBRE_TIENDA = 'Nombre Tienda'
COLUMNA_DESCRIPCION = 'Desc. SKU'
COLUMNA_EAN = 'Código EAN'
COLUMNA_REFERENCIA = 'Referencia Proveedor'
COLUMNA_MARCA = 'Marca'
COLUMNA_VALOR = 'Ventas Precio Proveedor'

#: Cómo se muestra una fila que no trae canal.
SIN_CANAL = 'Sin canal'


@dataclass
class FilaReporteVentas:
    """Una fila del reporte con fecha, SKU y unidades."""

    fecha: date
    sku: str
    tienda: str
    unidades: int
    canal: str
    nombre_tienda: str = ''
    descripcion: str = ''
    ean: str = ''
    referencia: str = ''
    marca: str = ''
    #: `Ventas Precio Proveedor` de la fila: el de todas sus unidades.
    valor: float | None = None


@dataclass
class ProductoHcDelReporte:
    sku: str
    nombre: str
    ean: str | None
    sku_coltrade: str | None
    marca: str
    #: El valor de una unidad, en pesos; `None` si el archivo no lo trae.
    precio: int | None = None


@dataclass
class SeleccionVentas:
    """Las ventas de los canales elegidos, y lo que haría falta para cargarlas."""

    ventas: list[FilaQuery] = field(default_factory=list)
    #: Filas de los canales elegidos.
    filas_leidas: int = 0
    #: De esas, devoluciones y ajustes: cero unidades o negativas.
    sin_unidades: int = 0
    #: Filas sin `EAN Tienda`, que fueron a `TIENDA_SIN_EAN`.
    sin_tienda: int = 0
    #: Filas de canales que no se eligieron.
    fuera_de_canal: int = 0
    #: sku → producto, de las ventas que entran.
    productos: dict[str, ProductoHcDelReporte] = field(default_factory=dict)
    #: EAN de tienda → nombre, de las ventas que entran.
    tiendas: dict[str, str] = field(default_factory=dict)


def _nombre_tienda(nombre: str, tienda: str) -> str:
    """El nombre de una tienda por crear: nombre propio, con «La» y «De» en mayúscula."""
    return nombre_propio(nombre, 100, conectores=False) or tienda


def _valor(valor) -> float | None:
    if isinstance(valor, bool):
        return None
    if isinstance(valor, int | float):
        return float(valor)
    try:
        return float(_texto(valor).replace(',', '.'))
    except ValueError:
        return None


def leer_reporte_ventas(archivo) -> list[FilaReporteVentas]:
    """Todas las filas de ventas del reporte, de todos los canales y unidades."""
    columnas = (COLUMNA_FECHA, COLUMNA_SKU, COLUMNA_TIENDA, COLUMNA_UNIDADES_VENTA)
    opcionales = (
        COLUMNA_CANAL, COLUMNA_NOMBRE_TIENDA, COLUMNA_DESCRIPCION, COLUMNA_EAN,
        COLUMNA_REFERENCIA, COLUMNA_MARCA, COLUMNA_VALOR,
    )
    with _hoja(archivo, columnas) as (encabezados, filas):
        i_fecha, i_sku, i_tienda, i_unidades = (encabezados[_normalizar(c)] for c in columnas)
        extra = {c: encabezados.get(_normalizar(c)) for c in opcionales}
        ultima = max(i_fecha, i_sku, i_tienda, i_unidades)

        def celda(fila, columna):
            i = extra[columna]
            return fila[i] if i is not None and i < len(fila) else None

        leidas = []
        for fila in filas:
            if fila is None or len(fila) <= ultima:
                continue
            fecha = _fecha(fila[i_fecha])
            unidades = _unidades(fila[i_unidades])
            sku = _texto(fila[i_sku])
            if fecha is None or unidades is None or not sku:
                continue
            leidas.append(
                FilaReporteVentas(
                    fecha=fecha,
                    sku=sku,
                    tienda=_texto(fila[i_tienda]),
                    unidades=unidades,
                    canal=_texto(celda(fila, COLUMNA_CANAL)) or SIN_CANAL,
                    nombre_tienda=_texto(celda(fila, COLUMNA_NOMBRE_TIENDA)),
                    descripcion=_texto(celda(fila, COLUMNA_DESCRIPCION)),
                    ean=_texto(celda(fila, COLUMNA_EAN)),
                    referencia=_texto(celda(fila, COLUMNA_REFERENCIA)),
                    marca=_texto(celda(fila, COLUMNA_MARCA)),
                    valor=_valor(celda(fila, COLUMNA_VALOR)),
                )
            )
    if not leidas:
        raise ErrorDeQuery('El archivo no trae filas de ventas con fecha y unidades.')
    return leidas


def canales_del_reporte(filas: list[FilaReporteVentas]) -> list[dict]:
    """Los canales del archivo con lo que traen para cargar: ventas de 1 unidad o más."""
    ventas, unidades = Counter(), Counter()
    for fila in filas:
        ventas[fila.canal] += 0  # el canal aparece aunque solo traiga devoluciones
        if fila.unidades >= 1:
            ventas[fila.canal] += 1
            unidades[fila.canal] += fila.unidades
    return [
        {'canal': canal, 'ventas': ventas[canal], 'unidades': unidades[canal]}
        for canal in sorted(ventas, key=lambda c: (-unidades[c], c))
    ]


def seleccionar_ventas(
    filas: list[FilaReporteVentas], canales: set[str] | None = None
) -> SeleccionVentas:
    """
    Las ventas de los canales elegidos (todos si `canales` va vacío), solo las
    de 1 unidad o más, con los productos y tiendas que traen.
    """
    seleccion = SeleccionVentas()
    # sku → (fecha más reciente, valores unitarios de ese día)
    valores: dict[str, tuple[date, list[float]]] = {}
    for fila in filas:
        if canales and fila.canal not in canales:
            seleccion.fuera_de_canal += 1
            continue
        seleccion.filas_leidas += 1
        if fila.unidades < 1:
            seleccion.sin_unidades += 1
            continue
        tienda, nombre_tienda = fila.tienda, fila.nombre_tienda
        if not tienda:
            seleccion.sin_tienda += 1
            tienda, nombre_tienda = TIENDA_SIN_EAN, NOMBRE_TIENDA_SIN_EAN
        seleccion.ventas.append(FilaQuery(fila.fecha, fila.sku, tienda, fila.unidades))
        seleccion.tiendas.setdefault(tienda, _nombre_tienda(nombre_tienda, tienda))
        seleccion.productos.setdefault(
            fila.sku,
            ProductoHcDelReporte(
                sku=fila.sku,
                nombre=nombre_propio(fila.descripcion) or fila.sku,
                ean=fila.ean[:60] or None,
                sku_coltrade=fila.referencia.strip()[:60] or None,
                marca=fila.marca,
            ),
        )
        if fila.valor is None or fila.valor < 0:
            continue
        unitario = fila.valor / fila.unidades
        anterior = valores.get(fila.sku)
        if anterior is None or fila.fecha > anterior[0]:
            valores[fila.sku] = (fila.fecha, [unitario])
        elif fila.fecha == anterior[0]:
            anterior[1].append(unitario)

    for sku, (_dia, unitarios) in valores.items():
        seleccion.productos[sku].precio = round(sum(unitarios) / len(unitarios))
    return seleccion


# ── El reporte de inventario: el botón «Importar» del tablero HC ────────────
#
# Otro archivo del portal («Inventario»), con una fila por producto y
# ubicación por día:
#
#   · `Código SKU`                    → `id_producto_hc`
#   · `EAN Ubicación`                 → `id_punto_venta_hc`. Vacío son las
#     bodegas (de tránsito, de reclamaciones…), que van a `TIENDA_SIN_EAN`.
#   · `Inventario Unidades Tienda`    → `cantidad_inventario`. Lo que hay en
#     la tienda, sin bodega ni tránsito. Solo entran las de 1 o más.
#
# Puede traer varios días: como el querie de inventario, solo cuenta el más
# reciente. De esas mismas filas (1 unidad o más) salen los productos y las
# tiendas que falten:
#
#   Producto                                Tienda
#   · `Código SKU`           → código       · `EAN Ubicación` → código
#   · `EAN 13 Calculado`     → EAN          · `Ubicación`     → nombre
#   · `Referencia Proveedor` → SKU Coltrade
#   · `Descripción SKU`      → nombre, en nombre propio
#   · `Marca`                → marca
#
# El reporte no trae valor: los productos se crean con precio 0, y después se
# les pone precio con la plantilla de productos sin precio (ver
# `ProductoHcViewSet.plantilla_sin_precio`).

COLUMNA_UBICACION = 'EAN Ubicación'
COLUMNA_NOMBRE_UBICACION = 'Ubicación'
COLUMNA_UNIDADES_TIENDA = 'Inventario Unidades Tienda'
COLUMNA_DESCRIPCION_INVENTARIO = 'Descripción SKU'
COLUMNA_EAN_13 = 'EAN 13 Calculado'


@dataclass
class LecturaReporteInventario:
    #: (sku, tienda) → unidades del día más reciente, solo las de 1 o más.
    inventario: Counter = field(default_factory=Counter)
    fecha: date | None = None
    fechas: list[date] = field(default_factory=list)
    filas_del_dia: int = 0
    sin_unidades: int = 0
    #: Filas del día sin `EAN Ubicación`, que fueron a `TIENDA_SIN_EAN`.
    sin_tienda: int = 0
    de_otros_dias: int = 0
    productos: dict[str, ProductoHcDelReporte] = field(default_factory=dict)
    tiendas: dict[str, str] = field(default_factory=dict)


def leer_reporte_inventario(archivo) -> LecturaReporteInventario:
    """El inventario del día más reciente del reporte, solo con 1 unidad o más."""
    columnas = (COLUMNA_FECHA, COLUMNA_SKU, COLUMNA_UBICACION, COLUMNA_UNIDADES_TIENDA)
    opcionales = (
        COLUMNA_NOMBRE_UBICACION, COLUMNA_DESCRIPCION_INVENTARIO, COLUMNA_EAN_13,
        COLUMNA_REFERENCIA, COLUMNA_MARCA,
    )
    with _hoja(archivo, columnas) as (encabezados, filas):
        i_fecha, i_sku, i_tienda, i_unidades = (encabezados[_normalizar(c)] for c in columnas)
        extra = {c: encabezados.get(_normalizar(c)) for c in opcionales}
        ultima = max(i_fecha, i_sku, i_tienda, i_unidades)

        def celda(fila, columna) -> str:
            i = extra[columna]
            return _texto(fila[i]) if i is not None and i < len(fila) else ''

        leidas = []
        for fila in filas:
            if fila is None or len(fila) <= ultima:
                continue
            fecha = _fecha(fila[i_fecha])
            unidades = _unidades(fila[i_unidades])
            sku = _texto(fila[i_sku])
            if fecha is None or unidades is None or not sku:
                continue
            leidas.append(
                (fecha, sku, _texto(fila[i_tienda]), unidades, {c: celda(fila, c) for c in extra})
            )
    if not leidas:
        raise ErrorDeQuery('El archivo no trae filas de inventario con fecha y unidades.')

    lectura = LecturaReporteInventario(fechas=sorted({f[0] for f in leidas}))
    lectura.fecha = lectura.fechas[-1]
    for fecha, sku, tienda, unidades, datos in leidas:
        if fecha != lectura.fecha:
            lectura.de_otros_dias += 1
            continue
        lectura.filas_del_dia += 1
        nombre_tienda = datos[COLUMNA_NOMBRE_UBICACION]
        if not tienda:
            lectura.sin_tienda += 1
            tienda, nombre_tienda = TIENDA_SIN_EAN, NOMBRE_TIENDA_SIN_EAN
        if unidades < 1:
            lectura.sin_unidades += 1
            continue
        # Un mismo producto dos veces en la misma tienda (las bodegas sin EAN
        # van todas a la misma) es stock de los dos lados: se suma.
        lectura.inventario[(sku, tienda)] += unidades
        lectura.tiendas.setdefault(tienda, _nombre_tienda(nombre_tienda, tienda))
        lectura.productos.setdefault(
            sku,
            ProductoHcDelReporte(
                sku=sku,
                nombre=nombre_propio(datos[COLUMNA_DESCRIPCION_INVENTARIO]) or sku,
                ean=datos[COLUMNA_EAN_13][:60] or None,
                sku_coltrade=datos[COLUMNA_REFERENCIA][:60] or None,
                marca=datos[COLUMNA_MARCA],
                # Sin valor en el reporte: 0 hasta que se le ponga precio.
                precio=0,
            ),
        )
    return lectura
