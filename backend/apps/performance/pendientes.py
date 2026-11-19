"""
Quién tiene algo pendiente en un mes de Objetivos y KPIs.

Son tres listas, una por cada paso del ciclo, y cada fila dice quién tiene
que actuar:

    Por asignar  → la persona no tiene objetivos, no suman 100% o rechazó
                   alguno: le toca a su jefe (al CEO, los suyos).
    Por cargar   → objetivos sin % de cumplimiento, sin evidencia o devueltos:
                   le toca al colaborador (a asesores y promotores, su jefe).
    Por aprobar  → resultados cargados que nadie ha aprobado: le toca a quien
                   aprueba (el jefe; con asesores, el Trade Marketing Manager).

People y el CEO ven la compañía; un líder, sus directos y los asesores que
aprueba. Lo que no es de nadie no se muestra: una persona sin objetivos no
aparece en «por cargar», porque no tiene qué cargar.
"""
from decimal import Decimal

from django.db.models import Prefetch, Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.accounts.models import User

from .api_permissions import (
    HasPerformanceApp,
    aprobador_de,
    asesores_y_promotores,
    es_asesor_o_promotor,
    es_lider,
    puede_ver_todo,
)
from .models import PONDERACION_COMPLETA, EstadoAceptacion, EstadoValidacion, Objetivo
from .periodos import etiqueta_mes, mes_terminado, primer_dia
from .views import _a_periodo


def _a_mes(texto: str | None):
    return _a_periodo(texto or primer_dia(timezone.localdate()).isoformat())


def _personas_a_revisar(user):
    """`(alcance, queryset)` de las personas que esta persona puede revisar."""
    if puede_ver_todo(user):
        return 'compania', User.objects.filter(is_active=True)
    if es_lider(user):
        return 'equipo', User.objects.filter(
            Q(manager=user) | (Q(manager__manager=user) & asesores_y_promotores()),
            is_active=True,
        )
    raise PermissionDenied('Los pendientes los ven los líderes, People y el CEO.')


def _ficha(persona) -> dict:
    return {
        'colaborador': persona.pk,
        'nombre': persona.full_name,
        'cargo': persona.position,
        'area': persona.area.name if persona.area_id else '',
        'jefe': persona.manager.full_name if persona.manager_id else '',
    }


def _sin_evidencia(resultado) -> bool:
    return not any(e.link_soporte for e in resultado.evidencias.all())


@api_view(['GET'])
@permission_classes([IsAuthenticated, HasPerformanceApp])
def pendientes(request):
    """`?periodo=2026-11`. Las tres listas de pendientes del mes, con su responsable."""
    mes = _a_mes(request.query_params.get('periodo'))
    alcance, consulta = _personas_a_revisar(request.user)
    personas = list(
        consulta.select_related('area', 'manager__manager').order_by('first_name', 'last_name')
    )
    ids = [p.pk for p in personas]

    objetivos_por_persona: dict[int, list] = {}
    for objetivo in (
        Objetivo.objects.filter(colaborador_id__in=ids, periodo=mes)
        .select_related('resultado')
        .prefetch_related(Prefetch('resultado__evidencias'))
    ):
        objetivos_por_persona.setdefault(objetivo.colaborador_id, []).append(objetivo)

    # El cumplimiento se carga y se aprueba cuando el mes terminó: antes no hay
    # nada por cargar ni por aprobar, solo objetivos por asignar.
    medicion_iniciada = mes_terminado(mes, timezone.localdate())
    por_asignar, por_cargar, por_aprobar = [], [], []

    for persona in personas:
        objetivos = objetivos_por_persona.get(persona.pk, [])
        peso = sum((o.peso for o in objetivos), Decimal('0'))

        incompleto = abs(peso - PONDERACION_COMPLETA) >= Decimal('0.005')
        # Lo que el colaborador rechazó también le toca al jefe: corregirlo.
        rechazados = sum(
            1 for o in objetivos if o.estado_aceptacion == EstadoAceptacion.RECHAZADO
        )
        if incompleto or rechazados:
            responsable = persona.manager or persona
            partes = []
            if incompleto:
                partes.append(
                    'Sin objetivos asignados'
                    if not objetivos
                    else f'{len(objetivos)} objetivo(s) que suman {peso:g}%; deben sumar 100%'
                )
            if rechazados:
                partes.append(f'{rechazados} rechazado(s) por el colaborador: corregirlos')
            por_asignar.append(
                {
                    **_ficha(persona),
                    'responsable': responsable.full_name,
                    'objetivos': len(objetivos),
                    'peso_asignado': float(peso),
                    'rechazados': rechazados,
                    'detalle': ' · '.join(partes),
                }
            )

        if not medicion_iniciada or not objetivos:
            continue

        sin_resultado = sin_evidencia = devueltos = 0
        por_validar = 0
        for objetivo in objetivos:
            resultado = getattr(objetivo, 'resultado', None)
            if resultado is None or resultado.porcentaje_cumplimiento is None:
                sin_resultado += 1
                continue
            if resultado.estado_validacion == EstadoValidacion.RECHAZADO:
                devueltos += 1
                continue
            if _sin_evidencia(resultado):
                sin_evidencia += 1
            if resultado.estado_validacion == EstadoValidacion.PENDIENTE:
                por_validar += 1

        if sin_resultado or sin_evidencia or devueltos:
            # A asesores y promotores les registra el resultado su jefe.
            carga = (
                persona.manager
                if es_asesor_o_promotor(persona) and persona.manager
                else persona
            )
            partes = []
            if sin_resultado:
                partes.append(f'{sin_resultado} sin % de cumplimiento')
            if sin_evidencia:
                partes.append(f'{sin_evidencia} sin evidencia')
            if devueltos:
                partes.append(f'{devueltos} devuelto(s) para corregir')
            por_cargar.append(
                {
                    **_ficha(persona),
                    'responsable': carga.full_name,
                    'objetivos': len(objetivos),
                    'sin_resultado': sin_resultado,
                    'sin_evidencia': sin_evidencia,
                    'devueltos': devueltos,
                    'detalle': ' · '.join(partes),
                }
            )

        if por_validar:
            aprobador = aprobador_de(persona)
            por_aprobar.append(
                {
                    **_ficha(persona),
                    'responsable': aprobador.full_name if aprobador else 'Sin aprobador',
                    'objetivos': len(objetivos),
                    'por_validar': por_validar,
                    'detalle': f'{por_validar} resultado(s) esperando aprobación',
                }
            )

    return Response(
        {
            'periodo': mes,
            'periodo_label': etiqueta_mes(mes),
            'alcance': alcance,
            'personas': len(personas),
            'medicion_iniciada': medicion_iniciada,
            'por_asignar': por_asignar,
            'por_cargar': por_cargar,
            'por_aprobar': por_aprobar,
        }
    )
