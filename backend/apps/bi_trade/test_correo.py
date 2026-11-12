"""El informe del ERP traído del buzón compartido, con Microsoft Graph simulado."""
from datetime import date
from unittest import mock

import pytest

from apps.bi_trade.correo import ErrorDeCorreo, buscar_informe, descargar_informe, fecha_del_nombre
from apps.bi_trade.models import VentaTmk
from apps.bi_trade.tests import (  # noqa: F401 — las fixtures se usan por nombre
    _informe,
    app_bi_trade,
    catalogo_tmk,
    con_metas_tmk,
    editor,
)
from apps.planner.graph import GraphError, Respuesta

pytestmark = pytest.mark.django_db

NOMBRE = 'Informe Inventarios Tecnologia Coltrade_20261104.xlsx'
CLARO = 'michael.rojas@claro.com.co'


def _correo(id_, de=CLARO, recibido='2026-11-04T11:00:00Z'):
    return {
        'id': id_,
        'subject': 'Informe',
        'receivedDateTime': recibido,
        'from': {'emailAddress': {'address': de}},
    }


class GraphFalso:
    """Un buzón con correos y adjuntos fijos. Registra qué se pidió."""

    def __init__(self, correos, adjuntos, contenido=b'xlsx', status=200):
        self.correos = correos
        self.adjuntos = adjuntos  # {id_correo: [{'id', 'name', 'size'}]}
        self.contenido = contenido
        self.status = status
        self.pedidos = []

    def _pedir(self, metodo, ruta):
        self.pedidos.append(ruta)
        if self.status != 200:
            return Respuesta(self.status, {'error': {'code': 'ErrorAccessDenied'}})
        if '/attachments/' in ruta:
            id_correo = ruta.split('/messages/')[1].split('/')[0]
            id_adjunto = ruta.split('/attachments/')[1].split('?')[0]
            adjunto = next(a for a in self.adjuntos[id_correo] if a['id'] == id_adjunto)
            return Respuesta(200, adjunto)
        return Respuesta(200, {'value': self.correos})

    def get(self, ruta):
        id_correo = ruta.split('/messages/')[1].split('/')[0]
        return Respuesta(200, {'value': self.adjuntos.get(id_correo, [])})

    def descargar(self, ruta):
        self.pedidos.append(ruta)
        return self.contenido


def test_el_nombre_del_adjunto_trae_la_fecha():
    assert fecha_del_nombre(NOMBRE) == date(2026, 11, 4)
    assert fecha_del_nombre('otro.xlsx') is None


def test_busca_el_informe_mas_reciente_del_remitente():
    graph = GraphFalso(
        correos=[_correo('a', de='otra@persona.com'), _correo('b'), _correo('c')],
        adjuntos={
            'a': [{'id': 'x', 'name': NOMBRE, 'size': 10}],
            'b': [
                {'id': 'y1', 'name': 'foto.png', 'size': 5},
                {'id': 'y2', 'name': NOMBRE, 'size': 9},
            ],
            'c': [{'id': 'z', 'name': NOMBRE, 'size': 8}],
        },
    )

    informe = buscar_informe(graph)

    # El de otra persona se salta; del de Claro se toma el adjunto del informe.
    assert (informe.mensaje, informe.adjunto) == ('b', 'y2')
    assert informe.fecha_archivo == date(2026, 11, 4)
    assert 'informesclaro%40supli.tech' in graph.pedidos[0]


def test_sin_informe_en_el_buzon_lo_dice():
    graph = GraphFalso(correos=[_correo('b')], adjuntos={'b': [{'id': 'y', 'name': 'otro.xlsx'}]})
    with pytest.raises(ErrorDeCorreo, match='ninguno trae el adjunto'):
        buscar_informe(graph)

    with pytest.raises(ErrorDeCorreo, match='No hay correos'):
        buscar_informe(GraphFalso(correos=[], adjuntos={}))


def test_sin_permiso_sobre_el_buzon_lo_dice():
    with pytest.raises(ErrorDeCorreo, match='TI'):
        buscar_informe(GraphFalso(correos=[], adjuntos={}, status=403))


def test_solo_se_baja_un_adjunto_que_se_llame_como_el_informe():
    graph = GraphFalso(
        correos=[_correo('b')], adjuntos={'b': [{'id': 'y', 'name': 'nomina.xlsx'}]}
    )
    with pytest.raises(ErrorDeCorreo, match='no es el informe'):
        descargar_informe('b', 'y', graph)
    assert not any(p.endswith('$value') for p in graph.pedidos)


def test_importar_desde_el_correo_usa_la_importacion_de_siempre(editor, catalogo_tmk):  # noqa: F811
    """Con mensaje y adjunto en vez del archivo, Tmk importa lo que trae el correo."""
    con_metas_tmk((2026, 3))
    archivo = _informe([('TMKP-001', 'TMK-301', '601', date(2026, 3, 4))])
    graph = GraphFalso(
        correos=[_correo('b')],
        adjuntos={'b': [{'id': 'y', 'name': NOMBRE, 'size': 9}]},
        contenido=archivo.read(),
    )

    with mock.patch('apps.bi_trade.correo.GraphClient', return_value=graph):
        respuesta = editor.post(
            '/api/bi-trade/tmk/importar-informe',
            {'mensaje': 'b', 'adjunto': 'y', 'anio': 2026, 'mes': 3, 'modo': 'completar'},
            format='multipart',
        )

    assert respuesta.status_code == 200, respuesta.json()
    assert VentaTmk.objects.get().cantidad_vendida == 1


def test_el_endpoint_muestra_el_informe_del_buzon(editor):  # noqa: F811
    graph = GraphFalso(
        correos=[_correo('b')], adjuntos={'b': [{'id': 'y', 'name': NOMBRE, 'size': 2048}]}
    )
    with mock.patch('apps.bi_trade.correo.GraphClient', return_value=graph):
        datos = editor.get('/api/bi-trade/informe-correo').json()

    assert datos['nombre'] == NOMBRE and datos['fechaArchivo'] == '2026-11-04'
    assert datos['mensaje'] == 'b' and datos['adjunto'] == 'y'


def test_sin_credenciales_de_microsoft_falla_sin_romper(editor):  # noqa: F811
    """En pruebas no hay claves: el error llega como mensaje, no como 500."""
    respuesta = editor.get('/api/bi-trade/informe-correo')
    assert respuesta.status_code == 400


def test_graph_error_se_traduce():
    graph = GraphFalso(correos=[], adjuntos={})
    graph._pedir = mock.Mock(side_effect=GraphError('caído', 503))
    with pytest.raises(ErrorDeCorreo, match='No se pudo leer el correo'):
        buscar_informe(graph)
