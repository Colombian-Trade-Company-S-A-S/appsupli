"""Precios Coltrade por periodo y catálogo de marcas, en los cuatro canales."""

from datetime import date

import pytest

from apps.bi_trade.calendario import dias_habiles
from apps.bi_trade.models import (
    Marca,
    MetaComercial,
    PrecioProducto,
    PrecioProductoHc,
    Producto,
    ProductoHc,
    PuntoVenta,
    PuntoVentaHc,
    Regional,
    RegionalHc,
    Venta,
    VentaHc,
)
from apps.bi_trade.tests import (  # noqa: F401
    _archivo_xlsx,
    app_bi_trade,
    cliente_de,
    crear_usuario,
    marca,
)

pytestmark = pytest.mark.django_db


@pytest.fixture
def blue(app_bi_trade):  # noqa: F811
    """Un producto de 40.000 en un punto de venta, y quien puede editar."""
    punto = PuntoVenta.objects.create(
        id_punto_venta='PDV-1', nombre_pdv='Cav Norte', regional=Regional.ZONA_NORTE
    )
    producto = Producto.objects.create(
        id_producto='BLUE',
        nombre_producto='Blue',
        marca=marca('Aiwa'),
        precio_venta_claro=50_000,
        precio_venta_coltrade=40_000,
    )
    editor = cliente_de(crear_usuario('editor@supli.tech', app_bi_trade, ['bi-trade:data:manage']))
    return punto, producto, editor


def _promedio_de_noviembre() -> int:
    """48.000 del 1 al 15 y 44.000 del 16 en adelante, por días hábiles."""
    habiles = dias_habiles(2026, 11)
    primera = sum(1 for dia in habiles if dia.day <= 15)
    return round((primera * 48_000 + (len(habiles) - primera) * 44_000) / len(habiles))


# ── El precio de cada día ──────────────────────────────────────────────────


def test_cada_venta_vale_el_precio_de_su_dia(blue):
    punto, producto, editor = blue
    PrecioProducto.objects.create(
        id_producto=producto, desde=date(2026, 10, 1), precio_venta_coltrade=48_000
    )
    Venta.objects.create(
        id_producto=producto,
        id_punto_venta=punto,
        fecha_venta=date(2026, 9, 15),
        cantidad_vendida=2,
    )
    Venta.objects.create(
        id_producto=producto,
        id_punto_venta=punto,
        fecha_venta=date(2026, 10, 5),
        cantidad_vendida=1,
    )

    filas = {v['fechaVenta']: v for v in editor.get('/api/bi-trade/ventas').json()['items']}

    # Septiembre no tiene periodo: vale el precio del producto.
    assert (filas['2026-09-15']['precioVentaColtrade'], filas['2026-09-15']['totalColtrade']) == (
        40_000,
        80_000,
    )
    assert (filas['2026-10-05']['precioVentaColtrade'], filas['2026-10-05']['totalColtrade']) == (
        48_000,
        48_000,
    )
    assert editor.get('/api/bi-trade/ventas/resumen').json()['ingresos'] == 128_000
    # El tablero de Claro solo cuenta lo que tiene meta ese mes en ese punto.
    MetaComercial.objects.create(
        id_producto=producto, id_punto_venta=punto, fecha_meta=date(2026, 10, 1), meta_cantidad=1
    )
    octubre = editor.get('/api/bi-trade/avance-mensual?anio=2026&mes=10').json()
    assert octubre['totales']['ventasDinero'] == 48_000


def test_la_meta_de_un_mes_partido_vale_el_promedio_de_sus_dias_habiles(blue):
    punto, producto, editor = blue
    PrecioProducto.objects.create(
        id_producto=producto,
        desde=date(2026, 11, 1),
        hasta=date(2026, 11, 15),
        precio_venta_coltrade=48_000,
    )
    PrecioProducto.objects.create(
        id_producto=producto, desde=date(2026, 11, 16), precio_venta_coltrade=44_000
    )
    for mes in (10, 11, 12):
        MetaComercial.objects.create(
            id_producto=producto,
            id_punto_venta=punto,
            fecha_meta=date(2026, mes, 1),
            meta_cantidad=10,
        )
    noviembre = _promedio_de_noviembre()
    assert 44_000 < noviembre < 48_000

    metas = {m['fechaMeta']: m for m in editor.get('/api/bi-trade/metas').json()['items']}
    # Octubre, sin periodo: el precio del producto. Diciembre: el que sigue vigente.
    assert metas['2026-10-01']['metaDinero'] == 400_000
    assert (metas['2026-11-01']['precioVentaColtrade'], metas['2026-11-01']['metaDinero']) == (
        noviembre,
        10 * noviembre,
    )
    assert metas['2026-12-01']['metaDinero'] == 440_000
    avance = editor.get('/api/bi-trade/avance-mensual?anio=2026&mes=11').json()
    assert avance['totales']['metaDinero'] == 10 * noviembre
    # El formulario pregunta el mismo precio antes de guardar.
    vigente = '/api/bi-trade/precios/vigente?producto=BLUE&fecha=2026-11-01'
    assert editor.get(f'{vigente}&mes=1').json()['precio'] == noviembre
    assert editor.get(vigente).json() == {'precio': 48_000, 'precioBase': 40_000}
    # El registro suelto, sin la anotación del listado, da lo mismo.
    assert MetaComercial.objects.get(fecha_meta=date(2026, 11, 1)).meta_dinero == 10 * noviembre


def test_el_producto_muestra_su_precio_de_hoy(blue):
    _punto, producto, editor = blue
    PrecioProducto.objects.create(
        id_producto=producto, desde=date(2000, 1, 1), precio_venta_coltrade=45_000
    )

    fila = editor.get('/api/bi-trade/productos').json()[0]

    assert (fila['precioVentaColtrade'], fila['precioHoy'], fila['preciosCount']) == (
        40_000,
        45_000,
        1,
    )


# ── Los periodos no se pisan ───────────────────────────────────────────────


def test_dos_periodos_del_mismo_producto_no_se_pisan(blue):
    _punto, _producto, editor = blue
    ruta = '/api/bi-trade/precios'
    octubre = {'idProducto': 'BLUE', 'desde': '2026-10-01', 'precioVentaColtrade': 48_000}

    assert editor.post(ruta, octubre, format='json').status_code == 201
    # Sin «hasta», octubre sigue vigente: noviembre lo pisa.
    pisa = editor.post(
        ruta,
        {'idProducto': 'BLUE', 'desde': '2026-11-01', 'precioVentaColtrade': 44_000},
        format='json',
    )
    assert pisa.status_code == 400
    assert 'Se cruza con el precio de 2026-10-01 a en adelante' in pisa.json()['errors']['desde'][0]

    # Cerrando octubre, noviembre entra.
    id_octubre = PrecioProducto.objects.get().pk
    assert (
        editor.patch(f'{ruta}/{id_octubre}', {'hasta': '2026-10-31'}, format='json').status_code
        == 200
    )
    nuevo = {'idProducto': 'BLUE', 'desde': '2026-11-01', 'precioVentaColtrade': 44_000}
    assert editor.post(ruta, nuevo, format='json').status_code == 201
    al_reves = {
        'idProducto': 'BLUE',
        'desde': '2026-12-01',
        'hasta': '2026-11-01',
        'precioVentaColtrade': 1,
    }
    assert 'hasta' in editor.post(ruta, al_reves, format='json').json()['errors']


def test_importar_precios_revisa_que_no_se_pisen_ni_entre_si(blue):
    _punto, _producto, editor = blue
    encabezados = ['id_producto', 'desde', 'hasta', 'precio_venta_coltrade']
    ruta = '/api/bi-trade/precios/importar'

    pisados = _archivo_xlsx(
        encabezados,
        [
            ('BLUE', date(2026, 10, 1), date(2026, 10, 31), 48_000),
            ('BLUE', date(2026, 10, 20), None, 44_000),
        ],
    )
    respuesta = editor.post(ruta, {'archivo': pisados}, format='multipart')
    assert respuesta.status_code == 400
    assert respuesta.json()['filas'][0]['fila'] == 3
    assert PrecioProducto.objects.count() == 0

    buenos = [
        ('BLUE', date(2026, 10, 1), date(2026, 10, 31), 48_000),
        ('BLUE', date(2026, 11, 1), None, 44_000),
    ]
    respuesta = editor.post(
        ruta, {'archivo': _archivo_xlsx(encabezados, buenos)}, format='multipart'
    )
    assert respuesta.status_code == 200, respuesta.json()
    assert PrecioProducto.objects.count() == 2

    # El mismo producto y la misma fecha de inicio actualizan, no duplican.
    otra_vez = [('BLUE', date(2026, 11, 1), None, 45_000)]
    respuesta = editor.post(
        ruta, {'archivo': _archivo_xlsx(encabezados, otra_vez)}, format='multipart'
    )
    assert respuesta.json()['updated'] == 1
    assert PrecioProducto.objects.get(desde=date(2026, 11, 1)).precio_venta_coltrade == 45_000


def test_homecenter_tiene_sus_propios_precios(app_bi_trade):  # noqa: F811
    tienda = PuntoVentaHc.objects.create(
        id_punto_venta='HC-1', nombre_pdv='Calle 80', regional=RegionalHc.choices[0][0]
    )
    torre = ProductoHc.objects.create(
        id_producto='HCP-1', nombre_producto='Torre', precio_venta_coltrade=100
    )
    VentaHc.objects.create(
        id_producto=torre, id_punto_venta=tienda, fecha_venta=date(2026, 10, 2), cantidad_vendida=3
    )
    editor = cliente_de(crear_usuario('editor@supli.tech', app_bi_trade, ['bi-trade:data:manage']))

    archivo = _archivo_xlsx(
        ['id_producto_hc', 'desde', 'hasta', 'precio_venta_coltrade'],
        [('HCP-1', date(2026, 10, 1), None, 150)],
    )
    assert (
        editor.post(
            '/api/bi-trade/hc/precios/importar', {'archivo': archivo}, format='multipart'
        ).status_code
        == 200
    )

    assert PrecioProductoHc.objects.get().precio_venta_coltrade == 150
    assert not PrecioProducto.objects.exists()
    assert editor.get('/api/bi-trade/hc/ventas/resumen').json()['ingresos'] == 450


# ── Marcas ─────────────────────────────────────────────────────────────────


def test_la_marca_se_elige_de_la_lista_sin_importar_mayusculas_ni_tildes(blue):
    _punto, _producto, editor = blue
    marca('Bélkin')
    producto = {
        'idProducto': 'SKU-2',
        'nombreProducto': 'Cargador',
        'precioVentaClaro': 1,
        'precioVentaColtrade': 1,
    }

    creado = editor.post(
        '/api/bi-trade/productos', {**producto, 'marca': '  belkin '}, format='json'
    )
    assert creado.status_code == 201, creado.json()
    assert creado.json()['marca'] == 'Bélkin'

    otro = {**producto, 'idProducto': 'SKU-3', 'marca': 'Belkn'}
    error = editor.post('/api/bi-trade/productos', otro, format='json').json()
    assert 'no está en la lista de marcas' in error['errors']['marca'][0]


def test_renombrar_una_marca_la_cambia_en_todos_los_canales(blue):
    _punto, producto, editor = blue
    ProductoHc.objects.create(id_producto='HCP-1', nombre_producto='Torre', marca=marca('Aiwa'))
    aiwa = Marca.objects.get(nombre='Aiwa')

    respuesta = editor.patch(f'/api/bi-trade/marcas/{aiwa.pk}', {'nombre': 'AIWA'}, format='json')

    assert respuesta.status_code == 200, respuesta.json()
    producto.refresh_from_db()
    assert producto.marca_id == 'AIWA'
    assert ProductoHc.objects.get().marca_id == 'AIWA'
    assert editor.get('/api/bi-trade/marcas').json() == [
        {'idMarca': aiwa.pk, 'nombre': 'AIWA', 'productosCount': 2}
    ]


def test_no_se_crea_una_marca_repetida_y_las_repetidas_se_fusionan(blue):
    _punto, producto, editor = blue
    generica = marca('Generica')
    generico = marca('Generico')
    ProductoHc.objects.create(id_producto='HCP-1', nombre_producto='Cable', marca=generico)
    Producto.objects.filter(pk=producto.pk).update(marca=generico)

    repetida = editor.post('/api/bi-trade/marcas', {'nombre': 'GENÉRICA'}, format='json')
    assert 'Ya existe la marca «Generica»' in repetida.json()['errors']['nombre'][0]
    # Con productos no se borra: se fusiona.
    assert editor.delete(f'/api/bi-trade/marcas/{generico.pk}').status_code == 400

    fusion = editor.post(
        f'/api/bi-trade/marcas/{generico.pk}/fusionar', {'destino': 'Generica'}, format='json'
    )

    assert fusion.status_code == 200
    assert fusion.json()['movidos'] == 2
    assert not Marca.objects.filter(pk=generico.pk).exists()
    assert ProductoHc.objects.get().marca_id == generica.nombre
    producto.refresh_from_db()
    assert producto.marca_id == 'Generica'
