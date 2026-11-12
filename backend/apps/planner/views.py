"""
API de Ejecución Planner (/api/performance/planner/…).

Las pestañas del prototipo, una por bloque:

    Cómo funciona     → opciones (ciclo, fórmulas y parámetros vigentes)
    Mi cumplimiento   → mi-cumplimiento
    Dashboard         → dashboard, personas/<id>
    Validar Hitos     → hitos, hitos/<id>/validar
    Conexión y calidad→ conexion, sincronizar, inventario, planes
    Parámetros        → parametros
"""
from __future__ import annotations

from collections import Counter, defaultdict
from decimal import Decimal

from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.decorators import api_view, permission_classes
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.response import Response

from apps.accounts.models import User

from .api_permissions import (
    CanGestionarPlanner,
    HasPlannerApp,
    alcance,
    capacidades,
    personas_medidas,
    puede_gestionar,
    puede_validar_hito,
    puede_ver,
    puede_ver_todo,
)
from .calculo import calcular_resultado, indice_mensual, promedio, recalcular_semana, semaforo
from .graph import GraphClient
from .inventario import descubrir_planes
from .models import (
    EstadoHito,
    IncidenciaCalidad,
    Parametros,
    PlanPlanner,
    ResultadoSemana,
    Sincronizacion,
    ValidacionHito,
)
from .semanas import Semana, semanas_del_mes

ACCESO = [HasPlannerApp]
GESTION = [HasPlannerApp, CanGestionarPlanner]
SEMANAS_EN_HISTORIA = 8
SIN_DIRECCION = 'Sin dirección'
SIN_AREA = 'Sin área'


# ── Utilidades ────────────────────────────────────────────────────────────


def _num(valor) -> float | None:
    return None if valor is None else float(valor)


def _nombre(user) -> str:
    return f'{user.first_name} {user.last_name}'.strip() if user else ''


def _semana(request, por_defecto: Semana | None = None) -> Semana:
    codigo = request.query_params.get('semana')
    if not codigo:
        return por_defecto or Semana.actual()
    try:
        return Semana.desde_codigo(codigo)
    except ValueError as e:
        raise ValidationError({'semana': [str(e)]}) from None


def _semana_json(semana: Semana) -> dict:
    inicio, fin = semana.ventana_hitos
    return {
        'codigo': semana.codigo,
        'etiqueta': semana.etiqueta,
        'rango': semana.rango,
        'linea_base': semana.linea_base.isoformat(),
        'cierre': semana.cierre.isoformat(),
        'ventana_desde': inicio.isoformat(),
        'ventana_hasta': fin.isoformat(),
        'cerrada': semana.cerrada(),
        'ventana_abierta': semana.ventana_abierta(),
    }


def _parametros_json(p: Parametros) -> dict:
    return {
        'id': p.pk,
        'peso_weekly': _num(p.peso_weekly),
        'peso_daily': _num(p.peso_daily),
        'peso_hito': _num(p.peso_hito),
        'verde_desde': _num(p.verde_desde),
        'ambar_desde': _num(p.ambar_desde),
        'creado_por': _nombre(p.creado_por),
        'created_at': p.created_at.isoformat() if p.created_at else None,
    }


def _semanas_disponibles() -> list[Semana]:
    """La semana actual y las que ya tienen resultados, de la más reciente a la más vieja."""
    vistas = {Semana.actual()}
    vistas |= {
        Semana(a, s) for a, s in ResultadoSemana.objects.values_list('anio', 'semana').distinct()
    }
    return sorted(vistas, reverse=True)[:26]


def _estado_hito(colaborador_id: int, semana: Semana, hitos: dict) -> tuple[str, str, str]:
    validacion = hitos.get((colaborador_id, semana.anio, semana.numero))
    if not validacion:
        return EstadoHito.SIN_REGISTRAR, EstadoHito.SIN_REGISTRAR.label, ''
    return validacion.estado, validacion.get_estado_display(), validacion.texto


def _fila_semana(resultado: ResultadoSemana | None, semana: Semana, hitos: dict,
                 parametros: Parametros, colaborador_id: int) -> dict:
    estado, estado_label, texto = _estado_hito(colaborador_id, semana, hitos)
    if resultado is None:
        return {
            'semana': semana.codigo, 'etiqueta': semana.etiqueta, 'rango': semana.rango,
            'con_dato': False, 'hito_estado': estado, 'hito_estado_label': estado_label, 'hito_texto': texto,
        }
    return {
        'semana': semana.codigo,
        'etiqueta': semana.etiqueta,
        'rango': semana.rango,
        'con_dato': True,
        'weekly_base': resultado.weekly_base,
        'weekly_completadas': resultado.weekly_completadas,
        'daily_items': resultado.daily_items,
        'daily_marcados': resultado.daily_marcados,
        'pct_weekly': _num(resultado.pct_weekly),
        'pct_daily': _num(resultado.pct_daily),
        'hito': _num(resultado.hito),
        'hito_estado': estado,
        'hito_estado_label': estado_label,
        'hito_texto': texto,
        'indice': _num(resultado.indice),
        'semaforo': semaforo(resultado.indice, parametros),
        'final': resultado.final,
        'base_aproximada': resultado.base_aproximada,
    }


def _historia(colaborador: User, hasta: Semana, parametros: Parametros) -> list[dict]:
    semanas = [hasta]
    for _ in range(SEMANAS_EN_HISTORIA - 1):
        semanas.append(semanas[-1].anterior())
    semanas.reverse()
    resultados = {
        (r.anio, r.semana): r
        for r in ResultadoSemana.objects.filter(colaborador=colaborador, anio__in={s.anio for s in semanas})
    }
    hitos = {
        (v.colaborador_id, v.anio, v.semana): v
        for v in ValidacionHito.objects.filter(colaborador=colaborador, anio__in={s.anio for s in semanas})
    }
    return [
        _fila_semana(resultados.get((s.anio, s.numero)), s, hitos, parametros, colaborador.id)
        for s in semanas
    ]


# ── Opciones y mi cumplimiento ────────────────────────────────────────────


@api_view(['GET'])
@permission_classes(ACCESO)
def opciones(request):
    """Lo que todas las pestañas necesitan: semanas, parámetros, capacidades y el ciclo."""
    actual = Semana.actual()
    plan = PlanPlanner.objects.filter(colaborador=request.user, activo=True).first()
    meses = sorted({s.mes for s in _semanas_disponibles()}, reverse=True)
    return Response({
        'semana_actual': _semana_json(actual),
        'semanas': [_semana_json(s) for s in _semanas_disponibles()],
        'meses': [{'codigo': f'{a}-{m:02d}', 'anio': a, 'mes': m} for a, m in meses],
        'parametros': _parametros_json(Parametros.vigentes()),
        'capacidades': capacidades(request.user),
        'mi_plan': {'titulo': plan.titulo, 'grupo': plan.grupo_nombre} if plan else None,
    })


@api_view(['GET'])
@permission_classes(ACCESO)
def mi_cumplimiento(request):
    """El índice semanal y mensual propio, con las últimas semanas y el detalle de la elegida."""
    return Response(_cumplimiento_de(request.user, _semana(request)))


def _cumplimiento_de(persona: User, semana: Semana) -> dict:
    parametros = Parametros.vigentes()
    historia = _historia(persona, semana, parametros)
    anio, mes = semana.mes
    mensual = indice_mensual(persona.id, anio, mes)
    plan = PlanPlanner.objects.filter(colaborador=persona, activo=True).first()
    return {
        'persona': {
            'id': persona.id,
            'nombre': _nombre(persona),
            'cargo': persona.position,
            'area': persona.area.name if persona.area_id else '',
            'lider': _nombre(persona.manager) if persona.manager_id else '',
        },
        'plan': {'titulo': plan.titulo, 'grupo': plan.grupo_nombre} if plan else None,
        'semana': _semana_json(semana),
        'actual': historia[-1],
        'historia': historia,
        'indice_mensual': _num(mensual),
        'semanas_del_mes': len(semanas_del_mes(anio, mes)),
        'semaforo_mensual': semaforo(mensual, parametros),
    }


# ── Dashboard ─────────────────────────────────────────────────────────────


def _entradas(personas: list[User], semanas: list[Semana]) -> dict[int, list[dict]]:
    """Por persona, sus semanas del periodo con su resultado y el estado del Hito."""
    ids = [p.id for p in personas]
    anios = {s.anio for s in semanas}
    numeros = {s.numero for s in semanas}
    resultados = defaultdict(dict)
    for r in ResultadoSemana.objects.filter(colaborador_id__in=ids, anio__in=anios, semana__in=numeros):
        resultados[r.colaborador_id][(r.anio, r.semana)] = r
    hitos = {
        (v.colaborador_id, v.anio, v.semana): v.estado
        for v in ValidacionHito.objects.filter(colaborador_id__in=ids, anio__in=anios, semana__in=numeros)
    }
    salida = {}
    for persona in personas:
        filas = []
        for s in semanas:
            r = resultados[persona.id].get((s.anio, s.numero))
            if r is None:
                continue
            estado = hitos.get((persona.id, s.anio, s.numero), EstadoHito.SIN_REGISTRAR)
            filas.append({'r': r, 'estado': estado})
        salida[persona.id] = filas
    return salida


def _agregar(entradas: list[dict]) -> dict | None:
    """Promedios de un grupo (persona, área, dirección u organización), como en el prototipo."""
    if not entradas:
        return None
    hitos_ok = sum(1 for e in entradas if e['r'].hito == Decimal('100'))
    alertas = sum(
        (1 if e['r'].daily_items == 0 else 0)
        + (1 if e['estado'] in (EstadoHito.PENDIENTE, EstadoHito.SIN_VALIDAR) else 0)
        for e in entradas
    )
    return {
        'pct_weekly': _num(promedio(e['r'].pct_weekly for e in entradas)),
        'pct_daily': _num(promedio(e['r'].pct_daily for e in entradas)),
        'hito_cumplido': round(hitos_ok * 100 / len(entradas), 1),
        'indice': _num(promedio(e['r'].indice for e in entradas)),
        'alertas': alertas,
    }


@api_view(['GET'])
@permission_classes(ACCESO)
def dashboard(request):
    """
    El índice por organización → dirección → área → persona.

    People, CEO y Dirección empiezan en la organización y bajan de nivel. Un
    líder ve directamente a sus personas a cargo, como en Objetivos y KPIs.
    """
    user = request.user
    parametros = Parametros.vigentes()
    periodo = request.query_params.get('periodo', 'semana')
    semana = _semana(request)
    if periodo == 'mes':
        try:
            anio, mes = (int(x) for x in request.query_params.get('mes', '').split('-'))
        except ValueError:
            anio, mes = semana.mes
        semanas = semanas_del_mes(anio, mes)
        etiqueta = f'{mes:02d}/{anio}'
    else:
        semanas = [semana]
        etiqueta = f'{semana.etiqueta} · {semana.rango}'

    ver_todo = puede_ver_todo(user)
    personas = alcance(user).select_related('area', 'manager')
    if not ver_todo:
        personas = personas.filter(manager=user)
    nivel = request.query_params.get('nivel', 'org' if ver_todo else 'persona')
    direccion = request.query_params.get('direccion')
    area = request.query_params.get('area')
    if ver_todo:
        if nivel in ('direccion', 'area') and direccion is not None:
            personas = personas.filter(direccion=('' if direccion == SIN_DIRECCION else direccion))
        if nivel == 'area' and area is not None:
            personas = personas.filter(area__isnull=True) if area == SIN_AREA else personas.filter(area__name=area)
    else:
        nivel = 'persona'
    personas = list(personas.filter(Q(resultados_planner__isnull=False) | Q(planes_planner__activo=True)).distinct())
    por_persona = _entradas(personas, semanas)
    todas = [e for filas in por_persona.values() for e in filas]

    filas = []
    if nivel == 'org':
        grupos = defaultdict(list)
        for p in personas:
            grupos[p.direccion or SIN_DIRECCION].append(p)
        for nombre, miembros in sorted(grupos.items()):
            filas.append(_fila_grupo(nombre, 'direccion', miembros, por_persona, '—', parametros))
    elif nivel == 'direccion':
        grupos = defaultdict(list)
        for p in personas:
            grupos[p.area.name if p.area_id else SIN_AREA].append(p)
        for nombre, miembros in sorted(grupos.items()):
            lider = Counter(_nombre(m.manager) for m in miembros if m.manager_id).most_common(1)
            filas.append(_fila_grupo(nombre, 'area', miembros, por_persona,
                                     lider[0][0] if lider else '—', parametros))
    else:
        for p in sorted(personas, key=_nombre):
            fila = _fila_grupo(_nombre(p), 'persona', [p], por_persona,
                               _nombre(p.manager) if p.manager_id else '—', parametros)
            fila['id'] = p.id
            fila['cargo'] = p.position
            filas.append(fila)

    agregado = _agregar(todas)
    pendientes = ValidacionHito.objects.filter(
        colaborador__in=personas, estado=EstadoHito.PENDIENTE,
        anio__in={s.anio for s in semanas}, semana__in={s.numero for s in semanas},
    ).count()
    return Response({
        'periodo': periodo,
        'etiqueta': etiqueta,
        'nivel': nivel,
        'direccion': direccion,
        'area': area,
        'alcance': 'compania' if ver_todo else 'equipo',
        'kpis': {
            'indice': agregado and agregado['indice'],
            'pct_weekly': agregado and agregado['pct_weekly'],
            'pct_daily': agregado and agregado['pct_daily'],
            'hitos_por_validar': pendientes,
            'alertas': agregado['alertas'] if agregado else 0,
            'semaforo': semaforo(agregado and agregado['indice'], parametros),
        },
        'filas': filas,
        'parametros': _parametros_json(parametros),
    })


def _fila_grupo(nombre, tipo, miembros, por_persona, lider, parametros) -> dict:
    entradas = [e for m in miembros for e in por_persona.get(m.id, [])]
    agregado = _agregar(entradas) or {}
    return {
        'nombre': nombre,
        'tipo': tipo,
        'lider': lider,
        'personas': len(miembros),
        'pct_weekly': agregado.get('pct_weekly'),
        'pct_daily': agregado.get('pct_daily'),
        'hito_cumplido': agregado.get('hito_cumplido'),
        'indice': agregado.get('indice'),
        'semaforo': semaforo(agregado.get('indice'), parametros),
        'alertas': agregado.get('alertas', 0),
    }


@api_view(['GET'])
@permission_classes(ACCESO)
def persona(request, pk: int):
    """El detalle de una persona: sus últimas semanas. Para el líder, solo su equipo."""
    colaborador = User.objects.select_related('area', 'manager').filter(pk=pk).first()
    if colaborador is None:
        raise NotFound('No existe esa persona.')
    if not puede_ver(request.user, colaborador):
        raise PermissionDenied('No puedes ver la ejecución de esta persona.')
    return Response(_cumplimiento_de(colaborador, _semana(request)))


# ── Validar Hitos ─────────────────────────────────────────────────────────


def _semana_a_validar() -> Semana:
    """La semana anterior: su Hito se valida de lunes a miércoles de esta semana."""
    return Semana.actual().anterior()


@api_view(['GET'])
@permission_classes(ACCESO)
def hitos(request):
    """
    Los Hitos de una semana para validar.

    El líder ve los de su equipo a cargo directo; People los de todos (o los
    de un líder, con `lider`). Se validan de lunes a miércoles de la semana
    siguiente; People puede corregir fuera de la ventana.
    """
    user = request.user
    semana = _semana(request, _semana_a_validar())
    qs = ValidacionHito.objects.filter(anio=semana.anio, semana=semana.numero).select_related(
        'colaborador', 'colaborador__manager', 'validado_por'
    )
    if puede_gestionar(user):
        lider = request.query_params.get('lider')
        if lider:
            qs = qs.filter(colaborador__manager_id=lider)
    else:
        filtro = Q(colaborador__manager=user)
        if capacidades(user)['autovalida_hito']:
            filtro |= Q(colaborador=user)
        qs = qs.filter(filtro)
    lideres = []
    if puede_gestionar(user):
        lideres = [
            {'id': u.id, 'nombre': _nombre(u)}
            for u in User.objects.filter(
                pk__in=ValidacionHito.objects.filter(anio=semana.anio, semana=semana.numero)
                .values('colaborador__manager')
            ).order_by('first_name')
        ]
    abierta = semana.ventana_abierta()
    return Response({
        'semana': _semana_json(semana),
        'ventana_abierta': abierta,
        'puede_fuera_de_ventana': puede_gestionar(user),
        'lideres': lideres,
        'hitos': [
            {
                'id': v.id,
                'persona_id': v.colaborador_id,
                'persona': _nombre(v.colaborador),
                'lider': _nombre(v.colaborador.manager) if v.colaborador.manager_id else '',
                'texto': v.texto,
                'estado': v.estado,
                'estado_label': v.get_estado_display(),
                'comentario': v.comentario,
                'validado_por': _nombre(v.validado_por),
                'validado_at': v.validado_at.isoformat() if v.validado_at else None,
                'puede_validar': (abierta or puede_gestionar(user))
                and v.estado != EstadoHito.SIN_REGISTRAR
                and puede_validar_hito(user, v.colaborador),
            }
            for v in sorted(qs, key=lambda v: _nombre(v.colaborador))
        ],
    })


@api_view(['POST'])
@permission_classes(ACCESO)
def validar_hito(request, pk: int):
    """Marca el Hito como Cumplido o No cumplido, con un comentario opcional."""
    validacion = ValidacionHito.objects.select_related('colaborador').filter(pk=pk).first()
    if validacion is None:
        raise NotFound('No existe ese Hito.')
    user = request.user
    if not puede_validar_hito(user, validacion.colaborador):
        raise PermissionDenied('Solo el líder de esta persona o People validan su Hito.')
    semana = Semana(validacion.anio, validacion.semana)
    if not semana.ventana_abierta() and not puede_gestionar(user):
        inicio, fin = semana.ventana_hitos
        raise ValidationError({'estado': [
            f'La ventana de validación de {semana.etiqueta} fue del {inicio:%d/%m} al {fin:%d/%m}.'
        ]})
    if validacion.estado == EstadoHito.SIN_REGISTRAR:
        raise ValidationError({'estado': ['Esta persona no registró Hito en Planner esa semana.']})
    estado = request.data.get('estado')
    if estado not in (EstadoHito.CUMPLIDO, EstadoHito.NO_CUMPLIDO):
        raise ValidationError({'estado': ['Debe ser «cumplido» o «no_cumplido».']})
    validacion.estado = estado
    validacion.comentario = (request.data.get('comentario') or '').strip()[:2000]
    validacion.validado_por = user
    validacion.validado_at = timezone.now()
    validacion.save()
    plan = PlanPlanner.objects.filter(colaborador=validacion.colaborador, activo=True).first()
    if plan:
        calcular_resultado(plan, semana, Parametros.vigentes())
    return Response({
        'id': validacion.id,
        'estado': validacion.estado,
        'estado_label': validacion.get_estado_display(),
        'mensaje': f'Hito de {_nombre(validacion.colaborador)}: {validacion.get_estado_display().lower()}.',
    })


# ── Conexión, calidad y planes (People) ───────────────────────────────────


def _lectura_json(s: Sincronizacion) -> dict:
    return {
        'id': s.id,
        'tipo': s.tipo,
        'tipo_label': s.get_tipo_display(),
        'semana': f'WEEK {s.semana}' if s.semana else '',
        'iniciada_at': s.iniciada_at.isoformat(),
        'terminada_at': s.terminada_at.isoformat() if s.terminada_at else None,
        'ejecutada_por': _nombre(s.ejecutada_por) or 'Tarea programada',
        'estado': s.estado,
        'estado_label': s.get_estado_display(),
        'planes_leidos': s.planes_leidos,
        'resumen': s.resumen,
        'errores': s.errores,
        'error': s.error,
    }


@api_view(['GET'])
@permission_classes(GESTION)
def conexion(request):
    """Última lectura, planes relacionados, incidencias abiertas y la bitácora."""
    lecturas = list(Sincronizacion.objects.select_related('ejecutada_por')[:15])
    ultima = next((s for s in lecturas if s.tipo != Sincronizacion.Tipo.INVENTARIO), None)
    medidas = personas_medidas()
    con_plan = medidas.filter(planes_planner__activo=True).distinct().count()
    abiertas = IncidenciaCalidad.objects.filter(abierta=True).select_related('plan', 'colaborador')
    estado = GraphClient().estado() if request.query_params.get('probar') else None
    return Response({
        'estado_graph': estado,
        'ultima_lectura': _lectura_json(ultima) if ultima else None,
        'personas_medidas': medidas.count(),
        'personas_con_plan': con_plan,
        'planes_relacionados': PlanPlanner.objects.filter(activo=True, colaborador__isnull=False).count(),
        'incidencias_abiertas': abiertas.count(),
        'incidencias_criticas': abiertas.filter(severidad=IncidenciaCalidad.Severidad.CRITICA).count(),
        'incidencias': [
            {
                'id': i.id,
                'tipo': i.tipo,
                'tipo_label': i.get_tipo_display(),
                'severidad': i.severidad,
                'quien': i.plan.titulo if i.plan else _nombre(i.colaborador),
                'persona': _nombre(i.colaborador),
                'detalle': i.detalle,
                'semana': f'WEEK {i.semana}' if i.semana else '',
                'detectada_at': i.detectada_at.isoformat(),
            }
            for i in abiertas[:200]
        ],
        'lecturas': [_lectura_json(s) for s in lecturas],
    })


@api_view(['POST'])
@permission_classes(GESTION)
def sincronizar(request):
    """«Sincronizar ahora»: lee Planner y actualiza la semana en curso."""
    from .sync import sincronizar as correr

    registro = correr(Sincronizacion.Tipo.MANUAL, ejecutada_por=request.user)
    return Response(_lectura_json(registro))


@api_view(['POST'])
@permission_classes(GESTION)
def inventario(request):
    """Descubre los planes de todos los grupos y relaciona los que tienen el nombre de alguien."""
    registro = descubrir_planes(ejecutada_por=request.user, vincular=bool(request.data.get('vincular', True)))
    return Response(_lectura_json(registro))


def _plan_json(p: PlanPlanner) -> dict:
    if not p.activo:
        estado = 'Inactivo'
    elif not p.accesible:
        estado = 'Inaccesible'
    elif p.colaborador_id is None:
        estado = 'Sin persona'
    else:
        estado = 'Relacionado'
    return {
        'id': p.id,
        'plan_id': p.plan_id,
        'titulo': p.titulo,
        'grupo': p.grupo_nombre,
        'colaborador_id': p.colaborador_id,
        'colaborador': _nombre(p.colaborador),
        'area': p.colaborador.area.name if p.colaborador and p.colaborador.area_id else '',
        'activo': p.activo,
        'accesible': p.accesible,
        'error_lectura': p.error_lectura,
        'tareas': p.tareas,
        'ultima_tarea_creada': p.ultima_tarea_creada.isoformat() if p.ultima_tarea_creada else None,
        'ultima_lectura_at': p.ultima_lectura_at.isoformat() if p.ultima_lectura_at else None,
        'estado': estado,
    }


@api_view(['GET'])
@permission_classes(GESTION)
def planes(request):
    """La relación plan–persona y quién falta por relacionar."""
    todos = PlanPlanner.objects.select_related('colaborador', 'colaborador__area')
    relacionados = set(
        PlanPlanner.objects.filter(activo=True, colaborador__isnull=False).values_list('colaborador_id', flat=True)
    )
    sin_plan = personas_medidas().exclude(pk__in=relacionados).select_related('area').order_by('first_name')
    candidatos = (
        User.objects.filter(is_active=True).select_related('area').order_by('first_name', 'last_name')
    )
    return Response({
        'planes': [_plan_json(p) for p in todos],
        'sin_plan': [
            {'id': u.id, 'nombre': _nombre(u), 'cargo': u.position, 'area': u.area.name if u.area_id else ''}
            for u in sin_plan
        ],
        'personas': [
            {'id': u.id, 'nombre': _nombre(u), 'cargo': u.position, 'tiene_plan': u.id in relacionados}
            for u in candidatos
        ],
    })


@api_view(['PATCH'])
@permission_classes(GESTION)
def plan(request, pk: int):
    """People cambia a quién pertenece un plan, o si se mide."""
    p = PlanPlanner.objects.select_related('colaborador').filter(pk=pk).first()
    if p is None:
        raise NotFound('No existe ese plan.')
    if 'colaborador' in request.data:
        valor = request.data.get('colaborador')
        p.colaborador = User.objects.filter(pk=valor, is_active=True).first() if valor else None
        if valor and p.colaborador is None:
            raise ValidationError({'colaborador': ['No existe esa persona o está inactiva.']})
    if 'activo' in request.data:
        p.activo = bool(request.data.get('activo'))
    try:
        with transaction.atomic():
            p.save()
    except IntegrityError:
        raise ValidationError({'colaborador': [
            'Esa persona ya tiene otro plan activo. Desactiva el otro primero.'
        ]}) from None
    p.refresh_from_db()
    return Response(_plan_json(p))


# ── Parámetros (People) ───────────────────────────────────────────────────


@api_view(['GET', 'POST'])
@permission_classes(ACCESO)
def parametros(request):
    """
    GET: los vigentes y las versiones anteriores. POST (People): guarda una versión nueva.

    Los pesos deben sumar 100 y el corte verde ser mayor que el ámbar. Al
    guardar se recalculan las semanas que todavía no son finales.
    """
    if request.method == 'GET':
        return Response({
            'vigentes': _parametros_json(Parametros.vigentes()),
            'versiones': [_parametros_json(p) for p in Parametros.objects.select_related('creado_por')[:10]],
        })
    if not puede_gestionar(request.user):
        raise PermissionDenied('Solo People define los pesos y los cortes.')
    campos = ('peso_weekly', 'peso_daily', 'peso_hito', 'verde_desde', 'ambar_desde')
    try:
        valores = {c: Decimal(str(request.data.get(c))) for c in campos}
    except Exception:
        raise ValidationError({'peso_weekly': ['Todos los valores deben ser números.']}) from None
    errores = {}
    for campo, valor in valores.items():
        if not Decimal('0') <= valor <= Decimal('100'):
            errores[campo] = ['Debe estar entre 0 y 100.']
    if valores['peso_weekly'] + valores['peso_daily'] + valores['peso_hito'] != Decimal('100'):
        errores['peso_weekly'] = ['Los pesos deben sumar 100%.']
    if valores['verde_desde'] <= valores['ambar_desde']:
        errores['verde_desde'] = ['El corte verde debe ser mayor que el ámbar.']
    if errores:
        raise ValidationError(errores)
    nuevos = Parametros.objects.create(creado_por=request.user, **valores)
    actual = Semana.actual()
    recalcular_semana(actual)
    recalcular_semana(actual.anterior())
    return Response(_parametros_json(nuevos), status=201)
