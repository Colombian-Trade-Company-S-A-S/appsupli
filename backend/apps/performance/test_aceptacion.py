"""
Pruebas de la aceptación de objetivos: el colaborador acepta o rechaza, uno
por uno, lo que le asigna su jefe; rechazar exige el motivo, el jefe corrige y
todo queda en el historial.
"""
import pytest

from apps.performance.models import EstadoAceptacion, HistorialObjetivo, Objetivo
from apps.performance.tests import (
    MES,
    OCTUBRE,
    RUTA,
    _fila,
    _importar,
    _pendientes,
    _rol_ceo,
    _terminar_el_mes,
    cliente_de,
    crear_usuario,
    objetivo_de,
)

pytestmark = pytest.mark.django_db


def _asignar(jefe, colaborador, peso='100', texto='Entregar el portal de autogestión BI'):
    respuesta = cliente_de(jefe).post(
        f'{RUTA}/objetivos',
        {
            'colaborador': colaborador.pk,
            'periodo': OCTUBRE.isoformat(),
            'objetivo': texto,
            'kpi': 'Portal en producción',
            'peso': peso,
        },
        format='json',
    )
    assert respuesta.status_code == 201, respuesta.data
    return respuesta.json()


def _responder(usuario, objetivo_id, estado, motivo=''):
    return cliente_de(usuario).post(
        f'{RUTA}/objetivos/{objetivo_id}/responder',
        {'estado': estado, 'motivo': motivo},
        format='json',
    )


def _acciones(objetivo_id):
    return list(
        HistorialObjetivo.objects.filter(objetivo_id=objetivo_id).values_list('accion', flat=True)
    )


def test_el_objetivo_nace_por_aceptar_y_lo_responde_solo_el_colaborador(equipo):
    jefe, julian, _daniel = equipo

    creado = _asignar(jefe, julian)

    assert creado['estadoAceptacion'] == EstadoAceptacion.PENDIENTE
    assert creado['puedeResponder'] is False  # quien pregunta es el jefe
    assert [p['accion'] for p in creado['historial']] == ['asignado']
    assert creado['historial'][0]['autorNombre'] == jefe.full_name
    propio = cliente_de(julian).get(f'{RUTA}/mis-objetivos?periodo={MES}').json()[0]
    assert propio['puedeResponder'] is True


def test_el_colaborador_acepta_su_objetivo_y_queda_aceptado(equipo):
    jefe, julian, _daniel = equipo
    creado = _asignar(jefe, julian)

    respuesta = _responder(julian, creado['id'], 'aceptado')

    assert respuesta.status_code == 200, respuesta.data
    assert respuesta.json()['estadoAceptacion'] == EstadoAceptacion.ACEPTADO
    assert respuesta.json()['puedeResponder'] is False
    assert _acciones(creado['id']) == ['asignado', 'aceptado']
    # Lo aceptado se queda: no se vuelve a responder.
    otra_vez = _responder(julian, creado['id'], 'rechazado', 'Lo pensé mejor')
    assert otra_vez.status_code == 400
    assert 'Ya aceptaste' in str(otra_vez.data)


def test_rechazar_exige_motivo_y_el_jefe_lo_corrige(equipo):
    jefe, julian, _daniel = equipo
    creado = _asignar(jefe, julian, texto='Vender 500 láminas')

    sin_motivo = _responder(julian, creado['id'], 'rechazado', '   ')
    assert sin_motivo.status_code == 400
    assert 'motivo' in sin_motivo.data['errors']
    assert Objetivo.objects.get().estado_aceptacion == EstadoAceptacion.PENDIENTE

    rechazo = _responder(julian, creado['id'], 'rechazado', 'La meta es el doble del mes pasado')
    assert rechazo.status_code == 200, rechazo.data
    assert rechazo.json()['estadoAceptacion'] == EstadoAceptacion.RECHAZADO
    # Rechazado, espera al jefe: el colaborador no lo vuelve a responder.
    assert 'tu jefe lo corrija' in str(_responder(julian, creado['id'], 'aceptado').data)

    corregido = cliente_de(jefe).patch(
        f'{RUTA}/objetivos/{creado["id"]}',
        {'objetivo': 'Vender 300 láminas', 'comentario': 'Ajusté la meta a lo del mes pasado.'},
        format='json',
    )
    assert corregido.status_code == 200, corregido.data
    assert corregido.json()['estadoAceptacion'] == EstadoAceptacion.PENDIENTE

    pasos = list(HistorialObjetivo.objects.filter(objetivo_id=creado['id']))
    assert [p.accion for p in pasos] == ['asignado', 'rechazado', 'corregido']
    # El historial guarda qué fue lo que se rechazó y qué quedó después.
    assert pasos[1].comentario == 'La meta es el doble del mes pasado'
    assert pasos[1].texto_objetivo == 'Vender 500 láminas'
    assert pasos[1].autor == julian
    assert pasos[2].texto_objetivo == 'Vender 300 láminas'
    assert pasos[2].comentario == 'Ajusté la meta a lo del mes pasado.'

    assert _responder(julian, creado['id'], 'aceptado').status_code == 200
    assert _acciones(creado['id'])[-1] == 'aceptado'


def test_cambiar_un_objetivo_aceptado_lo_devuelve_a_por_aceptar(equipo):
    jefe, julian, _daniel = equipo
    creado = _asignar(jefe, julian, peso='60')
    _responder(julian, creado['id'], 'aceptado')
    ruta = f'{RUTA}/objetivos/{creado["id"]}'

    # Guardar sin cambiar nada no toca lo que ya se aceptó…
    igual = cliente_de(jefe).patch(ruta, {'peso': '60.00'}, format='json')
    assert igual.json()['estadoAceptacion'] == EstadoAceptacion.ACEPTADO

    # …pero cambiar el peso sí: lo aceptado ya no es lo que dice la fila.
    cambiado = cliente_de(jefe).patch(ruta, {'peso': '70'}, format='json')
    assert cambiado.json()['estadoAceptacion'] == EstadoAceptacion.PENDIENTE
    assert _acciones(creado['id']) == ['asignado', 'aceptado', 'corregido']


def test_nadie_responde_por_el_colaborador(app_performance, equipo):
    jefe, julian, daniel = equipo
    people = crear_usuario(
        'people@supli.tech', app_performance, permisos=['performance:objetivos:manage_all']
    )
    creado = _asignar(jefe, julian)

    for otro in (jefe, daniel, people):
        assert _responder(otro, creado['id'], 'aceptado').status_code == 403
    assert Objetivo.objects.get().estado_aceptacion == EstadoAceptacion.PENDIENTE


def test_quien_se_define_sus_objetivos_no_se_los_acepta(app_performance, equipo):
    ceo = crear_usuario('ceo@supli.tech', app_performance, cargo='CEO')
    _rol_ceo(ceo)

    creado = _asignar(ceo, ceo)

    assert creado['estadoAceptacion'] == EstadoAceptacion.ACEPTADO
    assert creado['puedeResponder'] is False


def test_no_se_responde_un_mes_que_ya_termino(equipo):
    jefe, julian, _daniel = equipo
    creado = _asignar(jefe, julian)
    _terminar_el_mes(OCTUBRE)

    respuesta = _responder(julian, creado['id'], 'aceptado')

    assert respuesta.status_code == 400
    assert 'ya terminó' in str(respuesta.data)


def test_los_objetivos_de_antes_de_la_aceptacion_no_entran_al_flujo(equipo):
    jefe, julian, _daniel = equipo
    viejo = objetivo_de(julian, jefe, '100', estado_aceptacion=None)

    assert _responder(julian, viejo.pk, 'aceptado').status_code == 400
    propio = cliente_de(julian).get(f'{RUTA}/mis-objetivos?periodo={MES}').json()[0]
    assert propio['estadoAceptacion'] is None
    assert propio['puedeResponder'] is False

    # Si el jefe lo edita, sigue fuera del flujo.
    cliente_de(jefe).patch(f'{RUTA}/objetivos/{viejo.pk}', {'peso': '90'}, format='json')
    viejo.refresh_from_db()
    assert viejo.estado_aceptacion is None


def test_lo_cargado_por_excel_queda_por_aceptar(equipo):
    jefe, julian, _daniel = equipo

    respuesta = _importar(cliente_de(jefe), julian, [_fila('Uno', '40'), _fila('Dos', '60')])

    assert respuesta.status_code == 200, respuesta.data
    objetivos = Objetivo.objects.filter(colaborador=julian)
    assert {o.estado_aceptacion for o in objetivos} == {EstadoAceptacion.PENDIENTE}
    assert HistorialObjetivo.objects.filter(objetivo__in=objetivos, accion='asignado').count() == 2


def test_lo_rechazado_le_aparece_al_jefe_en_pendientes_y_en_la_portada(equipo):
    jefe, julian, _daniel = equipo
    uno = _asignar(jefe, julian, peso='50', texto='Uno')
    _asignar(jefe, julian, peso='50', texto='Dos')
    _responder(julian, uno['id'], 'rechazado', 'No depende de mí')

    por_asignar = _pendientes(jefe, OCTUBRE)['porAsignar']
    fila = next(f for f in por_asignar if f['colaborador'] == julian.pk)
    assert fila['rechazados'] == 1
    assert 'rechazado' in fila['detalle']
    assert fila['responsable'] == jefe.full_name

    del_jefe = cliente_de(jefe).get(f'{RUTA}/resumen').json()
    assert del_jefe['rechazadosEquipo'] == [{'periodo': OCTUBRE.isoformat(), 'cantidad': 1}]
    de_julian = cliente_de(julian).get(f'{RUTA}/resumen').json()
    assert de_julian['porAceptar'] == [{'periodo': OCTUBRE.isoformat(), 'cantidad': 1}]
