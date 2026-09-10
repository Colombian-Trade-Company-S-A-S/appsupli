"""Pruebas de BI Trade Marketing: CRUD, permisos y agregados del tablero."""
from datetime import date

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Application, Permission, Role, User
from apps.bi_trade.models import Materiales, Producto, PuntoVenta, Regional, Venta

pytestmark = pytest.mark.django_db


@pytest.fixture
def app_bi_trade():
    app = Application.objects.create(
        code='bi-trade', name='BI Trade Marketing', base_path='/inicio/bi-trade', order=200
    )
    Permission.objects.create(
        code='bi-trade:data:manage', name='Editar datos', application=app
    )
    return app


def crear_usuario(email, app=None, permisos=()):
    usuario = User.objects.create_user(
        email=email,
        username=email.split('@')[0],
        first_name=email.split('@')[0].title(),
        password='clave-de-prueba-123',
    )
    if app:
        usuario.applications.add(app)
    if permisos:
        rol = Role.objects.create(code=f'rol-{usuario.pk}', name='rol')
        rol.permissions.set(Permission.objects.filter(code__in=permisos))
        usuario.roles.add(rol)
    return usuario


def cliente_de(usuario) -> APIClient:
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente


@pytest.fixture
def catalogo():
    pdv_norte = PuntoVenta.objects.create(
        id_punto_venta='PDV-001',
        nombre_pdv='Claro Unicentro',
        regional=Regional.ZONA_NORTE,
        materiales=Materiales.TODOS,
    )
    pdv_sur = PuntoVenta.objects.create(
        id_punto_venta='PDV-002',
        nombre_pdv='Claro Jardín Plaza',
        regional=Regional.ZONA_SUR,
        materiales=Materiales.INCOMPLETOS,
    )
    caro = Producto.objects.create(
        id_producto='SKU-1',
        nombre_producto='iPhone 15',
        marca='Apple',
        precio_venta_claro=5_000_000,
        precio_venta_coltrade=4_000_000,
        puntaje=99,
    )
    barato = Producto.objects.create(
        id_producto='SKU-2',
        nombre_producto='Redmi Note 13',
        marca='Xiaomi',
        precio_venta_claro=900_000,
        precio_venta_coltrade=800_000,
    )
    return pdv_norte, pdv_sur, caro, barato


# ── Modelos ────────────────────────────────────────────────────────────────

def test_las_llaves_primarias_son_los_codigos_del_negocio(catalogo):
    pdv, _sur, producto, _barato = catalogo
    assert pdv.pk == 'PDV-001'
    assert producto.pk == 'SKU-1'


def test_el_total_de_una_venta_usa_el_precio_coltrade(catalogo):
    pdv, _sur, producto, _barato = catalogo
    venta = Venta.objects.create(
        id_producto=producto,
        id_punto_venta=pdv,
        fecha_venta=date(2026, 3, 15),
        cantidad_vendida=3,
    )
    assert venta.total_coltrade == 12_000_000


def test_regional_y_materiales_pueden_ir_vacios():
    punto = PuntoVenta.objects.create(id_punto_venta='PDV-X', nombre_pdv='Sin clasificar')
    assert punto.regional is None
    assert punto.materiales is None


# ── Permisos ───────────────────────────────────────────────────────────────

def test_sin_la_app_no_se_entra(app_bi_trade):
    fuera = crear_usuario('fuera@supli.tech')
    assert cliente_de(fuera).get('/api/bi-trade/dashboard').status_code == 403


def test_consultar_solo_pide_la_app_pero_escribir_pide_permiso(app_bi_trade, catalogo):
    lector = crear_usuario('lector@supli.tech', app_bi_trade)
    editor = crear_usuario('editor@supli.tech', app_bi_trade, ['bi-trade:data:manage'])

    assert cliente_de(lector).get('/api/bi-trade/productos').status_code == 200

    cuerpo = {
        'idProducto': 'SKU-9',
        'nombreProducto': 'Producto nuevo',
        'marca': 'Motorola',
        'precioVentaClaro': 1_000_000,
        'precioVentaColtrade': 900_000,
    }
    ruta = '/api/bi-trade/productos'
    assert cliente_de(lector).post(ruta, cuerpo, format='json').status_code == 403
    assert cliente_de(editor).post(ruta, cuerpo, format='json').status_code == 201


# ── CRUD ───────────────────────────────────────────────────────────────────

def test_no_se_repite_el_codigo_de_un_punto_de_venta(app_bi_trade, catalogo):
    editor = crear_usuario('editor@supli.tech', app_bi_trade, ['bi-trade:data:manage'])
    respuesta = cliente_de(editor).post(
        '/api/bi-trade/puntos-venta',
        {'idPuntoVenta': 'PDV-001', 'nombrePdv': 'Otro nombre'},
        format='json',
    )
    assert respuesta.status_code == 400


def test_no_se_borra_un_producto_con_ventas(app_bi_trade, catalogo):
    pdv, _sur, producto, _barato = catalogo
    Venta.objects.create(
        id_producto=producto,
        id_punto_venta=pdv,
        fecha_venta=date(2026, 1, 5),
        cantidad_vendida=1,
    )
    editor = crear_usuario('editor@supli.tech', app_bi_trade, ['bi-trade:data:manage'])

    respuesta = cliente_de(editor).delete(f'/api/bi-trade/productos/{producto.pk}')
    assert respuesta.status_code == 400
    assert Producto.objects.filter(pk=producto.pk).exists()


def test_registrar_una_venta_devuelve_su_total(app_bi_trade, catalogo):
    pdv, _sur, producto, _barato = catalogo
    editor = crear_usuario('editor@supli.tech', app_bi_trade, ['bi-trade:data:manage'])

    respuesta = cliente_de(editor).post(
        '/api/bi-trade/ventas',
        {
            'idProducto': producto.pk,
            'idPuntoVenta': pdv.pk,
            'fechaVenta': '2026-04-01',
            'cantidadVendida': 2,
        },
        format='json',
    )
    assert respuesta.status_code == 201
    assert respuesta.data['total_coltrade'] == 8_000_000
    assert respuesta.data['nombre_pdv'] == 'Claro Unicentro'


def test_la_cantidad_vendida_no_puede_ser_cero(app_bi_trade, catalogo):
    pdv, _sur, producto, _barato = catalogo
    editor = crear_usuario('editor@supli.tech', app_bi_trade, ['bi-trade:data:manage'])
    respuesta = cliente_de(editor).post(
        '/api/bi-trade/ventas',
        {
            'idProducto': producto.pk,
            'idPuntoVenta': pdv.pk,
            'fechaVenta': '2026-04-01',
            'cantidadVendida': 0,
        },
        format='json',
    )
    assert respuesta.status_code == 400


# ── Tablero ────────────────────────────────────────────────────────────────

def test_el_tablero_suma_unidades_e_ingresos(app_bi_trade, catalogo):
    pdv_norte, pdv_sur, caro, barato = catalogo
    Venta.objects.create(  # 8.000.000
        id_producto=caro,
        id_punto_venta=pdv_norte,
        fecha_venta=date(2026, 1, 10),
        cantidad_vendida=2,
    )
    Venta.objects.create(  # 4.000.000
        id_producto=barato,
        id_punto_venta=pdv_sur,
        fecha_venta=date(2026, 2, 10),
        cantidad_vendida=5,
    )

    lector = crear_usuario('lector@supli.tech', app_bi_trade)
    datos = cliente_de(lector).get('/api/bi-trade/dashboard').data

    assert datos['totales']['unidades'] == 7
    assert datos['totales']['ingresos'] == 12_000_000
    assert datos['totales']['operaciones'] == 2
    # La marca más cara encabeza el ranking por ingresos.
    assert datos['por_marca'][0]['label'] == 'Apple'
    assert datos['por_marca'][0]['participacion'] == pytest.approx(66.7)
    # Dos meses distintos, en orden cronológico.
    assert [fila['unidades'] for fila in datos['evolucion']] == [2, 5]


def test_el_tablero_se_puede_filtrar_por_regional(app_bi_trade, catalogo):
    pdv_norte, pdv_sur, caro, barato = catalogo
    Venta.objects.create(
        id_producto=caro,
        id_punto_venta=pdv_norte,
        fecha_venta=date(2026, 1, 10),
        cantidad_vendida=2,
    )
    Venta.objects.create(
        id_producto=barato,
        id_punto_venta=pdv_sur,
        fecha_venta=date(2026, 2, 10),
        cantidad_vendida=5,
    )

    lector = crear_usuario('lector@supli.tech', app_bi_trade)
    datos = cliente_de(lector).get('/api/bi-trade/dashboard', {'regional': 'Zona Sur'}).data

    assert datos['totales']['unidades'] == 5
    assert datos['totales']['ingresos'] == 4_000_000


def test_el_tablero_no_revienta_sin_ventas(app_bi_trade):
    lector = crear_usuario('lector@supli.tech', app_bi_trade)
    datos = cliente_de(lector).get('/api/bi-trade/dashboard').data

    assert datos['totales']['unidades'] == 0
    assert datos['totales']['ingresos'] == 0
    assert datos['totales']['ticket_promedio'] == 0
    assert datos['evolucion'] == []
