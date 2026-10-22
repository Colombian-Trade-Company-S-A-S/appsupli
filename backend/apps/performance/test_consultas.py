"""
Que ningún listado de Objetivos y KPIs haga una consulta por fila (N+1).

Cada prueba mide las consultas de un endpoint con pocos datos, agrega más y
vuelve a medir: si el número crece con las filas, alguna relación se está
pidiendo fila por fila. No se fija un número exacto —eso rompería con
cualquier cambio inocente—, solo que no dependa de cuántas filas haya.
"""
from datetime import date
from decimal import Decimal

import pytest

from apps.accounts.models import User
from apps.core.consultas import Medicion, mismo_costo
from apps.performance.models import (
    AccionHistorial,
    EstadoValidacion,
    Evidencia,
    HistorialResultado,
    Objetivo,
    Resultado,
)
from apps.performance.periodos import primer_dia
from apps.performance.tests import (
    RUTA,
    cliente_de,
    crear_usuario,
    objetivo_de,
)

pytestmark = pytest.mark.django_db


def medir(usuario, ruta: str) -> Medicion:
    """Las consultas de un GET, con un usuario recién leído (sin cachés de la petición anterior)."""
    cliente = cliente_de(User.objects.get(pk=usuario.pk))
    with Medicion() as medicion:
        respuesta = cliente.get(ruta)
    assert respuesta.status_code == 200, respuesta.data
    return medicion


def con_resultado(objetivo: Objetivo, jefe) -> Objetivo:
    """Un objetivo con todo lo que se serializa: resultado, evidencia, historial y feedback."""
    resultado = Resultado.objects.create(
        objetivo=objetivo,
        resultado_ejecutado=Decimal('1'),
        porcentaje_cumplimiento=Decimal('100'),
        cargado_por=objetivo.colaborador,
        estado_validacion=EstadoValidacion.VALIDADO,
        validado_por=jefe,
        feedback='Bien',
        feedback_por=jefe,
    )
    Evidencia.objects.create(resultado=resultado, link_soporte='https://supli.sharepoint.com/a')
    HistorialResultado.objects.create(
        resultado=resultado, accion=AccionHistorial.CARGADO, autor=objetivo.colaborador
    )
    HistorialResultado.objects.create(
        resultado=resultado, accion=AccionHistorial.VALIDADO, autor=jefe
    )
    return objetivo


def test_los_objetivos_de_una_persona_no_consultan_por_fila(equipo):
    jefe, julian, _daniel = equipo
    mes = primer_dia(date.today())
    con_resultado(objetivo_de(julian, jefe, '10', periodo=mes), jefe)
    ruta = f'{RUTA}/objetivos?colaborador={julian.pk}&periodo={mes:%Y-%m}'
    pocos = medir(jefe, ruta)

    for _ in range(4):
        con_resultado(objetivo_de(julian, jefe, '10', periodo=mes), jefe)

    mismo_costo(pocos, medir(jefe, ruta))


def test_mis_objetivos_no_consultan_por_fila(equipo):
    jefe, julian, _daniel = equipo
    con_resultado(objetivo_de(julian, jefe, '10'), jefe)
    pocos = medir(julian, f'{RUTA}/mis-objetivos')

    for _ in range(4):
        con_resultado(objetivo_de(julian, jefe, '10'), jefe)

    mismo_costo(pocos, medir(julian, f'{RUTA}/mis-objetivos'))


@pytest.mark.parametrize(
    'ruta',
    ['opciones', 'resumen', 'acumulado?tipo=mes', 'acumulado?tipo=mes&alcance=top'],
)
def test_lo_del_equipo_no_consulta_por_persona(equipo, app_performance, ruta):
    """Opciones, portada, semáforo y Top: el costo no crece con el tamaño del equipo."""
    jefe, julian, daniel = equipo
    mes = primer_dia(date.today())
    for persona in (julian, daniel):
        con_resultado(objetivo_de(persona, jefe, '100', periodo=mes), jefe)
    pocos = medir(jefe, f'{RUTA}/{ruta}')

    for i in range(4):
        persona = crear_usuario(f'equipo{i}@supli.tech', app_performance, jefe=jefe)
        con_resultado(objetivo_de(persona, jefe, '100', periodo=mes), jefe)

    mismo_costo(pocos, medir(jefe, f'{RUTA}/{ruta}'))


def test_el_resumen_del_mes_no_consulta_por_persona(equipo, app_performance):
    jefe, julian, _daniel = equipo
    objetivo = objetivo_de(julian, jefe, '100')
    ruta = f'{RUTA}/periodos/{objetivo.periodo:%Y-%m}/resumen'
    pocos = medir(jefe, ruta)

    for i in range(4):
        persona = crear_usuario(f'mes{i}@supli.tech', app_performance, jefe=jefe)
        objetivo_de(persona, jefe, '100')

    mismo_costo(pocos, medir(jefe, ruta))


def test_la_respuesta_de_una_decision_no_crece_con_el_historial(equipo):
    """Validar devuelve el resultado con su historial: no puede pedir un autor por paso."""
    jefe, julian, _daniel = equipo

    def costo_de_validar(pasos_previos: int) -> Medicion:
        objetivo = con_resultado(objetivo_de(julian, jefe, '10'), jefe)
        for _ in range(pasos_previos):
            HistorialResultado.objects.create(
                resultado=objetivo.resultado, accion=AccionHistorial.FEEDBACK, autor=jefe
            )
        cliente = cliente_de(User.objects.get(pk=jefe.pk))
        with Medicion() as medicion:
            respuesta = cliente.post(
                f'{RUTA}/objetivos/{objetivo.pk}/validar', {'estado': 'validado'}, format='json'
            )
        assert respuesta.status_code == 200, respuesta.data
        return medicion

    mismo_costo(costo_de_validar(0), costo_de_validar(5))
