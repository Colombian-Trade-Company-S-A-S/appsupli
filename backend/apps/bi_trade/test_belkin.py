"""Plan Recomiéndame Belkin: el formulario y sus catálogos."""
from io import StringIO

import pytest
from django.core.management import call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.bi_trade.models import (
    AsesorApple,
    CategoriaBelkin,
    EnlacePublico,
    ProductoBelkin,
    PuntoVentaBelkin,
    RegionalBelkin,
    RegistroBelkin,
)
from apps.bi_trade.tests import app_bi_trade, cliente_de, crear_usuario  # noqa: F401

pytestmark = pytest.mark.django_db

RUTA = '/api/bi-trade/belkin'


@pytest.fixture
def catalogo_belkin():
    norte = RegionalBelkin.objects.create(nombre='Zona Norte')
    sur = RegionalBelkin.objects.create(nombre='Zona Sur')
    andino = PuntoVentaBelkin.objects.create(
        id_punto_venta='C159', nombre_pdv='Cav Andino', id_regional=norte
    )
    plaza_claro = PuntoVentaBelkin.objects.create(
        id_punto_venta='C108', nombre_pdv='Cav Bogota Plaza Claro', id_regional=sur
    )
    case = CategoriaBelkin.objects.create(nombre='Case Apple')
    lamina = CategoriaBelkin.objects.create(nombre='Lámina')
    producto = ProductoBelkin.objects.create(
        id_producto='7020178',
        nombre_producto='Spigen Iphone 12 / 12 Pro Case Crystal Flex',
        id_categoria=case,
    )
    asesor = AsesorApple.objects.create(nombre='Duvan Riaño', id_punto_venta=plaza_claro)
    return {
        'norte': norte,
        'sur': sur,
        'andino': andino,
        'plaza_claro': plaza_claro,
        'case': case,
        'lamina': lamina,
        'producto': producto,
        'asesor': asesor,
    }


def _recomendacion(punto, producto, asesor=None):
    return {
        'idPuntoVenta': punto.pk,
        'idAsesor': asesor.pk if asesor else None,
        'idProducto': producto.pk,
        'fechaRecomendacion': str(timezone.localdate()),
        'observacion': '  Cliente volvió por otro  ',
    }


def test_el_formulario_guarda_el_codigo_y_lee_regional_y_categoria(
    app_bi_trade, catalogo_belkin  # noqa: F811
):
    c = catalogo_belkin
    promotor = crear_usuario('promotor@supli.tech', app_bi_trade)

    respuesta = cliente_de(promotor).post(
        f'{RUTA}/registros',
        _recomendacion(c['plaza_claro'], c['producto'], c['asesor']),
        format='json',
    )

    assert respuesta.status_code == 201, respuesta.data
    cuerpo = respuesta.json()
    assert cuerpo['puntoVentaEtiqueta'] == 'Cav Bogota Plaza Claro \\ C108'
    assert cuerpo['productoEtiqueta'] == '7020178 \\ Spigen Iphone 12 / 12 Pro Case Crystal Flex'
    assert cuerpo['regional'] == 'Zona Sur'
    assert cuerpo['categoria'] == 'Case Apple'
    assert cuerpo['asesor'] == 'Duvan Riaño'
    assert cuerpo['observacion'] == 'Cliente volvió por otro'
    assert RegistroBelkin.objects.get().registrado_por == promotor


def test_el_asesor_es_opcional(app_bi_trade, catalogo_belkin):  # noqa: F811
    c = catalogo_belkin
    respuesta = cliente_de(crear_usuario('promotor@supli.tech', app_bi_trade)).post(
        f'{RUTA}/registros', _recomendacion(c['andino'], c['producto']), format='json'
    )

    assert respuesta.status_code == 201, respuesta.data
    assert respuesta.json()['asesor'] == ''


def test_el_asesor_tiene_que_ser_del_punto_elegido(app_bi_trade, catalogo_belkin):  # noqa: F811
    c = catalogo_belkin
    respuesta = cliente_de(crear_usuario('promotor@supli.tech', app_bi_trade)).post(
        f'{RUTA}/registros',
        _recomendacion(c['andino'], c['producto'], c['asesor']),
        format='json',
    )

    assert respuesta.status_code == 400
    assert 'idAsesor' in respuesta.json()['errors']
    assert RegistroBelkin.objects.count() == 0


def test_mover_el_punto_o_el_producto_mueve_lo_ya_cargado(
    app_bi_trade, catalogo_belkin  # noqa: F811
):
    """Cav Andino pasa a Zona Sur y el case a Lámina: lo viejo se va con ellos."""
    c = catalogo_belkin
    editor = crear_usuario('editor@supli.tech', app_bi_trade, ['bi-trade:data:manage'])
    cliente = cliente_de(editor)
    cliente.post(f'{RUTA}/registros', _recomendacion(c['andino'], c['producto']), format='json')

    assert cliente.patch(
        f'{RUTA}/puntos-venta/C159', {'idRegional': c['sur'].pk}, format='json'
    ).status_code == 200
    assert cliente.patch(
        f'{RUTA}/productos/7020178', {'idCategoria': c['lamina'].pk}, format='json'
    ).status_code == 200

    registro = cliente.get(f'{RUTA}/registros').json()['items'][0]
    assert registro['regional'] == 'Zona Sur'
    assert registro['categoria'] == 'Lámina'

    # Y el formulario también los muestra en su nuevo grupo.
    opciones = cliente.get(f'{RUTA}/opciones').json()
    andino = next(p for p in opciones['puntosVenta'] if p['value'] == 'C159')
    assert andino['idRegional'] == c['sur'].pk
    case = next(p for p in opciones['productos'] if p['value'] == '7020178')
    assert case['idCategoria'] == c['lamina'].pk


def test_las_opciones_traen_cada_asesor_con_su_punto(app_bi_trade, catalogo_belkin):  # noqa: F811
    c = catalogo_belkin
    AsesorApple.objects.create(nombre='Inactivo', id_punto_venta=c['plaza_claro'], activo=False)

    opciones = cliente_de(crear_usuario('promotor@supli.tech', app_bi_trade)).get(
        f'{RUTA}/opciones'
    ).json()

    assert opciones['asesores'] == [
        {'value': c['asesor'].pk, 'label': 'Duvan Riaño', 'idPuntoVenta': 'C108'}
    ]
    assert {r['label'] for r in opciones['regionales']} == {'Zona Norte', 'Zona Sur'}
    assert {cat['label'] for cat in opciones['categorias']} == {'Case Apple', 'Lámina'}


def test_un_punto_puede_tener_varios_asesores_sin_repetir_nombre(
    app_bi_trade, catalogo_belkin  # noqa: F811
):
    cliente = cliente_de(
        crear_usuario('editor@supli.tech', app_bi_trade, ['bi-trade:data:manage'])
    )

    otro = cliente.post(
        f'{RUTA}/asesores', {'nombre': 'Kerlys Babilonia', 'idPuntoVenta': 'C108'}, format='json'
    )
    repetido = cliente.post(
        f'{RUTA}/asesores', {'nombre': 'DUVAN  Riaño', 'idPuntoVenta': 'C108'}, format='json'
    )

    assert otro.status_code == 201
    assert repetido.status_code == 400
    assert cliente.get(f'{RUTA}/puntos-venta/C108').json()['asesoresCount'] == 2


def test_administrar_los_catalogos_pide_permiso(app_bi_trade, catalogo_belkin):  # noqa: F811
    promotor = cliente_de(crear_usuario('promotor@supli.tech', app_bi_trade))
    for ruta, cuerpo in (
        ('regionales', {'nombre': 'Zona Costa'}),
        ('categorias', {'nombre': 'Audífonos'}),
        ('asesores', {'nombre': 'Ana', 'idPuntoVenta': 'C108'}),
    ):
        assert promotor.post(f'{RUTA}/{ruta}', cuerpo, format='json').status_code == 403


def test_no_se_borra_lo_que_ya_se_usa(app_bi_trade, catalogo_belkin):  # noqa: F811
    c = catalogo_belkin
    cliente = cliente_de(
        crear_usuario('editor@supli.tech', app_bi_trade, ['bi-trade:data:manage'])
    )
    cliente.post(
        f'{RUTA}/registros',
        _recomendacion(c['plaza_claro'], c['producto'], c['asesor']),
        format='json',
    )

    for ruta in (
        f'{RUTA}/regionales/{c["sur"].pk}',
        f'{RUTA}/puntos-venta/C108',
        f'{RUTA}/asesores/{c["asesor"].pk}',
        f'{RUTA}/categorias/{c["case"].pk}',
        f'{RUTA}/productos/7020178',
    ):
        respuesta = cliente.delete(ruta)
        assert respuesta.status_code == 400, ruta
        assert 'Desactívalo' in respuesta.json()['message']

    # Lo que no se usa sí se borra.
    assert cliente.delete(f'{RUTA}/categorias/{c["lamina"].pk}').status_code == 204


def test_la_carga_inicial_es_idempotente():
    call_command('seed_plan_belkin', stdout=StringIO())
    call_command('seed_plan_belkin', stdout=StringIO())

    assert RegionalBelkin.objects.count() == 2
    assert PuntoVentaBelkin.objects.count() == 27
    assert PuntoVentaBelkin.objects.get(pk='C159').id_regional.nombre == 'Zona Norte'
    assert ProductoBelkin.objects.get(pk='7020178').id_categoria.nombre == 'Case Apple'
    assert CategoriaBelkin.objects.count() == 4



# ── El formulario abierto por enlace ───────────────────────────────────────
# Igual que el de Partners: sin cuenta ni contraseña, y solo para enviar.

RUTA_FORMULARIO = '/api/publico/formulario'


def _enlace(app, canal):
    editor = crear_usuario(f'editor-{canal}@supli.tech', app, ['bi-trade:data:manage'])
    datos = (
        cliente_de(editor)
        .post('/api/bi-trade/enlaces', {'nombre': 'Asesores Norte', 'canal': canal}, format='json')
        .json()
    )
    assert datos['clave'] == ''
    return datos['token']


def test_el_formulario_publico_se_diligencia_sin_cuenta_ni_clave(
    app_bi_trade, catalogo_belkin  # noqa: F811
):
    c = catalogo_belkin
    token = _enlace(app_bi_trade, 'belkin')
    anonimo = APIClient()

    opciones = anonimo.get(f'{RUTA_FORMULARIO}/belkin/{token}/opciones')
    assert opciones.status_code == 200
    assert len(opciones.json()['puntosVenta']) == 2

    respuesta = anonimo.post(
        f'{RUTA_FORMULARIO}/belkin/{token}/registros',
        _recomendacion(c['plaza_claro'], c['producto'], c['asesor']),
        format='json',
    )

    assert respuesta.status_code == 201, respuesta.data
    assert respuesta.json()['origen'] == 'Enlace · Asesores Norte'
    registro = RegistroBelkin.objects.get()
    assert registro.registrado_por is None
    assert EnlacePublico.objects.get(pk=registro.enlace_id).accesos == 1


def test_por_el_formulario_belkin_no_se_puede_hacer_nada_mas(app_bi_trade):  # noqa: F811
    token = _enlace(app_bi_trade, 'belkin')
    anonimo = APIClient()

    # Ni el tablero, ni lo ya cargado, ni el formulario del otro plan.
    assert anonimo.get(f'/api/publico/bi-trade/{token}').status_code == 404
    assert anonimo.get(f'{RUTA_FORMULARIO}/belkin/{token}/registros').status_code == 405
    assert anonimo.get(f'{RUTA_FORMULARIO}/{token}/opciones').status_code == 404
    # Y no tiene contraseña que regenerar.
    editor = cliente_de(EnlacePublico.objects.get(token=token).creado_por)
    enlace = EnlacePublico.objects.get(token=token)
    assert editor.post(f'/api/bi-trade/enlaces/{enlace.pk}/regenerar-clave').status_code == 400


def test_un_enlace_de_partners_no_abre_el_formulario_belkin(app_bi_trade):  # noqa: F811
    token = _enlace(app_bi_trade, 'partners')
    assert APIClient().get(f'{RUTA_FORMULARIO}/belkin/{token}/opciones').status_code == 404


def test_un_enlace_revocado_ya_no_abre(app_bi_trade, catalogo_belkin):  # noqa: F811
    token = _enlace(app_bi_trade, 'belkin')
    EnlacePublico.objects.filter(token=token).update(activo=False)
    assert APIClient().get(f'{RUTA_FORMULARIO}/belkin/{token}/opciones').status_code == 404
