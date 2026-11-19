"""
API de Ejecución Planner (/api/performance/planner/…).

Las pestañas del prototipo, una por bloque:

    Cómo funciona     → opciones (ciclo, fórmulas y parámetros vigentes)
    Mi cumplimiento   → mi-cumplimiento
    Dashboard         → dashboard, personas/<id>
    Conexión y calidad→ conexion, sincronizar (en segundo plano), planes (solo
                        lectura: el plan de cada persona sale de su URL de Planner)
    Parámetros        → parametros, parametros/recalcular

El Hito ya no se valida (decisión 3 de People): no hay pestaña de validación.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import ProtectedError, Q
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
    direccion_de,
    jerarquia,
    personas_medidas,
    personas_planner,
    puede_gestionar,
    puede_ver,
    puede_ver_todo,
    se_mide,
)
from .calculo import indice_mensual, parametros_de, promedio, recalcular_semana, semaforo
from .graph import GraphClient
from .models import (
    HitoPlanner,
    IncidenciaCalidad,
    Parametros,
    PlanPlanner,
    RecalculoPlanner,
    ResultadoSemana,
    Sincronizacion,
    TareaMedicion,
)
from .semanas import Semana, semana_del_corte, semanas_del_mes
from .sync import LECTURA_MAXIMA, lectura_en_curso, leer_en_segundo_plano

ACCESO = [HasPlannerApp]
GESTION = [HasPlannerApp, CanGestionarPlanner]
SEMANAS_EN_HISTORIA = 8
SIN_DIRECCION = 'sin'
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
    return {
        'codigo': semana.codigo,
        'etiqueta': semana.etiqueta,
        'rango': semana.rango,
        # El corte que la abre y el que la cierra (lunes 9:00; martes si es festivo).
        'linea_base': semana.linea_base.isoformat(),
        'cierre': semana.cierre.isoformat(),
        'cerrada': semana.cerrada(),
    }


def _parametros_json(p: Parametros) -> dict:
    return {
        'id': p.pk,
        'peso_weekly': _num(p.peso_weekly),
        'peso_daily': _num(p.peso_daily),
        'peso_hito': _num(p.peso_hito),
        'verde_desde': _num(p.verde_desde),
        'ambar_desde': _num(p.ambar_desde),
        'vigente_desde': p.vigente_desde.isoformat(),
        'vigente_hasta': p.vigente_hasta.isoformat() if p.vigente_hasta else None,
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


def _fila_semana(resultado: ResultadoSemana | None, semana: Semana) -> dict:
    base = {'semana': semana.codigo, 'etiqueta': semana.etiqueta, 'rango': semana.rango}
    if resultado is None:
        return {**base, 'con_dato': False, 'hito_registrado': False, 'hitos_registrados': 0}
    return {
        **base,
        'con_dato': True,
        'weekly_base': resultado.weekly_base,
        'weekly_agregadas': resultado.weekly_agregadas,
        'weekly_total': resultado.weekly_total,
        'weekly_completadas': resultado.weekly_completadas,
        'daily_items': resultado.daily_items,
        'daily_marcados': resultado.daily_marcados,
        'pct_weekly': _num(resultado.pct_weekly),
        'pct_daily': _num(resultado.pct_daily),
        'hito': _num(resultado.hito),
        'hito_registrado': resultado.hito == Decimal('100'),
        'hitos_registrados': resultado.hitos_registrados,
        'indice': _num(resultado.indice),
        'semaforo': semaforo(resultado.indice, resultado.parametros),
        'final': resultado.final,
        'base_aproximada': resultado.base_aproximada,
        'parametros_id': resultado.parametros_id,
    }


def _historia(colaborador: User, hasta: Semana) -> list[dict]:
    semanas = [hasta]
    for _ in range(SEMANAS_EN_HISTORIA - 1):
        semanas.append(semanas[-1].anterior())
    semanas.reverse()
    resultados = {
        (r.anio, r.semana): r
        for r in ResultadoSemana.objects.filter(
            colaborador=colaborador, anio__in={s.anio for s in semanas}
        ).select_related('parametros')
    }
    return [_fila_semana(resultados.get((s.anio, s.numero)), s) for s in semanas]


def _hitos_de(colaborador: User, semana: Semana) -> list[dict]:
    return [
        {
            'titulo': h.titulo,
            'registrado': h.registrado,
            'total_items': h.total_items,
            'items': h.items,
        }
        for h in HitoPlanner.objects.filter(
            colaborador=colaborador, anio=semana.anio, semana=semana.numero
        )
    ]


def _tareas_de(plan: PlanPlanner | None, semana: Semana) -> list[dict]:
    """La trazabilidad de la semana: cuándo entró cada tarea y por dónde se movió."""
    if plan is None:
        return []
    return [
        {
            'titulo': t.titulo,
            'etiquetas': t.etiquetas,
            'creada_at': t.creada_at.isoformat() if t.creada_at else None,
            'entro_at': t.entro_at.isoformat(),
            'en_linea_base': t.en_linea_base,
            'deposito': t.bucket_nombre,
            'completada': t.completada,
            'movimientos': [
                {'desde': m.desde_bucket, 'hacia': m.hacia_bucket, 'at': m.detectado_at.isoformat()}
                for m in t.movimientos.all()
            ],
        }
        for t in TareaMedicion.objects.filter(
            plan=plan, anio=semana.anio, semana=semana.numero
        ).prefetch_related('movimientos')
    ]


# ── Opciones y mi cumplimiento ────────────────────────────────────────────


@api_view(['GET'])
@permission_classes(ACCESO)
def opciones(request):
    """Lo que todas las pestañas necesitan: semanas, parámetros, capacidades y el ciclo."""
    actual = Semana.actual()
    plan = PlanPlanner.objects.filter(colaborador=request.user, activo=True).first()
    meses = sorted({s.mes for s in _semanas_disponibles()}, reverse=True)
    return Response(
        {
            'semana_actual': _semana_json(actual),
            'semanas': [_semana_json(s) for s in _semanas_disponibles()],
            'meses': [{'codigo': f'{a}-{m:02d}', 'anio': a, 'mes': m} for a, m in meses],
            'parametros': _parametros_json(Parametros.vigentes()),
            'capacidades': capacidades(request.user),
            'mi_plan': {'titulo': plan.titulo, 'grupo': plan.grupo_nombre} if plan else None,
            'me_mido': se_mide(request.user),
        }
    )


@api_view(['GET'])
@permission_classes(ACCESO)
def mi_cumplimiento(request):
    """El índice semanal y mensual propio, con las últimas semanas y el detalle de la elegida."""
    # Con su área y su jefe en la misma consulta (el usuario de la petición no los trae).
    yo = (
        User.objects.select_related('area', 'manager')
        .defer('manager__foto')
        .get(pk=request.user.pk)
    )
    return Response(_cumplimiento_de(yo, _semana(request)))


def _cumplimiento_de(persona: User, semana: Semana) -> dict:
    parametros = parametros_de(semana)
    historia = _historia(persona, semana)
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
            'se_mide': se_mide(persona),
        },
        'plan': {'titulo': plan.titulo, 'grupo': plan.grupo_nombre} if plan else None,
        'semana': _semana_json(semana),
        'actual': historia[-1],
        'historia': historia,
        'hitos': _hitos_de(persona, semana),
        'tareas': _tareas_de(plan, semana),
        'parametros': _parametros_json(parametros),
        'indice_mensual': _num(mensual),
        'semanas_del_mes': len(semanas_del_mes(anio, mes)),
        'semaforo_mensual': semaforo(mensual, Parametros.para_fecha(date(anio, mes, 1))),
    }


# ── Dashboard ─────────────────────────────────────────────────────────────


def _entradas(personas: list[User], semanas: list[Semana]) -> dict[int, list[ResultadoSemana]]:
    """Por persona, sus resultados de las semanas del periodo."""
    ids = [p.id for p in personas]
    salida: dict[int, list[ResultadoSemana]] = defaultdict(list)
    for r in ResultadoSemana.objects.filter(
        colaborador_id__in=ids,
        anio__in={s.anio for s in semanas},
        semana__in={s.numero for s in semanas},
    ):
        if Semana(r.anio, r.semana) in semanas:
            salida[r.colaborador_id].append(r)
    return salida


def _agregar(resultados: list[ResultadoSemana]) -> dict | None:
    """Promedios de un grupo (persona, área, dirección u organización), como en el prototipo."""
    if not resultados:
        return None
    hitos = sum(1 for r in resultados if r.hito == Decimal('100'))
    alertas = sum(
        (1 if r.hito != Decimal('100') else 0)
        + (1 if r.weekly_total == 0 or r.daily_items == 0 else 0)
        for r in resultados
    )
    return {
        'pct_weekly': _num(promedio(r.pct_weekly for r in resultados)),
        'pct_daily': _num(promedio(r.pct_daily for r in resultados)),
        'hito_registrado': round(hitos * 100 / len(resultados), 1),
        'indice': _num(promedio(r.indice for r in resultados)),
        'alertas': alertas,
    }


def _fila_grupo(nombre, tipo, clave, miembros, por_persona, lider, parametros) -> dict:
    resultados = [r for m in miembros for r in por_persona.get(m.id, [])]
    agregado = _agregar(resultados) or {}
    return {
        'nombre': nombre,
        'tipo': tipo,
        'clave': clave,
        'lider': lider,
        'personas': len(miembros),
        'pct_weekly': agregado.get('pct_weekly'),
        'pct_daily': agregado.get('pct_daily'),
        'hito_registrado': agregado.get('hito_registrado'),
        'indice': agregado.get('indice'),
        'semaforo': semaforo(agregado.get('indice'), parametros),
        'alertas': agregado.get('alertas', 0),
    }


@api_view(['GET'])
@permission_classes(ACCESO)
def dashboard(request):
    """
    El índice por compañía → dirección → área → persona (decisiones 4, 8 y 9).

    Cada quien ve lo que tiene debajo: el líder todo su equipo, el director
    toda su dirección, y People y el CEO toda la compañía. La dirección es la
    del organigrama: quien reporta a la cabeza de la compañía y todos los que
    tiene debajo. El ranking (la lista de personas) respeta el mismo alcance.

    `nivel`: org (por dirección), direccion (por área), area (personas) o
    persona (todas las personas del alcance). `direccion` es el id del
    directivo; `area`, el nombre del área.
    """
    user = request.user
    periodo = request.query_params.get('periodo', 'semana')
    semana = _semana(request)
    if periodo == 'mes':
        try:
            anio, mes = (int(x) for x in request.query_params.get('mes', '').split('-'))
        except ValueError:
            anio, mes = semana.mes
        semanas = semanas_del_mes(anio, mes)
        etiqueta = f'{mes:02d}/{anio}'
        parametros = Parametros.para_fecha(date(anio, mes, 1))
    else:
        semanas = [semana]
        etiqueta = f'{semana.etiqueta} · {semana.rango}'
        parametros = parametros_de(semana)

    ver_todo = puede_ver_todo(user)
    jefes = jerarquia()
    personas = list(
        alcance(user, jefes)
        .filter(pk__in=personas_medidas())
        .select_related('area', 'manager')
        .defer('manager__foto')
    )
    direcciones = {p.id: direccion_de(p.id, jefes) for p in personas}

    areas_del_alcance = {p.area_id for p in personas}
    por_defecto = 'org' if ver_todo else ('direccion' if len(areas_del_alcance) > 1 else 'persona')
    nivel = request.query_params.get('nivel') or por_defecto
    direccion = request.query_params.get('direccion')
    area = request.query_params.get('area')

    if direccion and nivel in ('direccion', 'area'):
        clave = None if direccion == SIN_DIRECCION else int(direccion)
        personas = [p for p in personas if direcciones[p.id] == clave]
    if area and nivel == 'area':
        personas = [p for p in personas if (p.area.name if p.area_id else SIN_AREA) == area]

    por_persona = _entradas(personas, semanas)
    todas = [r for filas in por_persona.values() for r in filas]
    directivos = {
        u.id: u
        for u in User.objects.filter(pk__in={d for d in direcciones.values() if d}).select_related(
            'area'
        )
    }

    def nombre_direccion(clave: int | None) -> str:
        jefe = directivos.get(clave)
        return f'{jefe.area.name if jefe.area_id else _nombre(jefe)}' if jefe else 'Sin dirección'

    filas = []
    if nivel == 'org':
        grupos = defaultdict(list)
        for p in personas:
            grupos[direcciones[p.id]].append(p)
        for clave, miembros in grupos.items():
            jefe = directivos.get(clave)
            nombre = nombre_direccion(clave)
            filas.append(
                _fila_grupo(
                    nombre,
                    'direccion',
                    str(clave) if clave else SIN_DIRECCION,
                    miembros,
                    por_persona,
                    _nombre(jefe) if jefe else '—',
                    parametros,
                )
            )
    elif nivel == 'direccion':
        grupos = defaultdict(list)
        for p in personas:
            grupos[p.area.name if p.area_id else SIN_AREA].append(p)
        for nombre, miembros in grupos.items():
            lider = Counter(_nombre(m.manager) for m in miembros if m.manager_id).most_common(1)
            filas.append(
                _fila_grupo(
                    nombre,
                    'area',
                    nombre,
                    miembros,
                    por_persona,
                    lider[0][0] if lider else '—',
                    parametros,
                )
            )
    else:
        for p in personas:
            fila = _fila_grupo(
                _nombre(p),
                'persona',
                str(p.id),
                [p],
                por_persona,
                _nombre(p.manager) if p.manager_id else '—',
                parametros,
            )
            fila['id'] = p.id
            fila['cargo'] = p.position
            # Para filtrar la lista en el navegador sin volver a pedirla.
            fila['area'] = p.area.name if p.area_id else SIN_AREA
            fila['direccion'] = nombre_direccion(direcciones[p.id])
            fila['direccion_clave'] = str(direcciones[p.id]) if direcciones[p.id] else SIN_DIRECCION
            filas.append(fila)
    # El ranking: de mayor a menor índice; los que no tienen dato, al final.
    filas.sort(key=lambda f: (f['indice'] is None, -(f['indice'] or 0), f['nombre']))

    agregado = _agregar(todas)
    return Response(
        {
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
                'hito_registrado': agregado and agregado['hito_registrado'],
                'alertas': agregado['alertas'] if agregado else 0,
                'semaforo': semaforo(agregado and agregado['indice'], parametros),
            },
            'filas': filas,
            'parametros': _parametros_json(parametros),
        }
    )


@api_view(['GET'])
@permission_classes(ACCESO)
def persona(request, pk: int):
    """El detalle de una persona: sus últimas semanas. Cada quien, solo lo que tiene debajo."""
    colaborador = (
        User.objects.select_related('area', 'manager').defer('manager__foto').filter(pk=pk).first()
    )
    if colaborador is None:
        raise NotFound('No existe esa persona.')
    if not puede_ver(request.user, colaborador):
        raise PermissionDenied('No puedes ver la ejecución de esta persona.')
    return Response(_cumplimiento_de(colaborador, _semana(request)))


# ── Conexión, calidad y planes (People) ───────────────────────────────────


def _lectura_json(s: Sincronizacion) -> dict:
    # Sin terminar: en curso, o caída si ya pasó el máximo (se reinició el servidor).
    en_curso = s.terminada_at is None and s.iniciada_at >= timezone.now() - LECTURA_MAXIMA
    caida = s.terminada_at is None and not en_curso
    return {
        'id': s.id,
        'tipo': s.tipo,
        'tipo_label': s.get_tipo_display(),
        'semana': f'WEEK {s.semana}' if s.semana else '',
        'iniciada_at': s.iniciada_at.isoformat(),
        'terminada_at': s.terminada_at.isoformat() if s.terminada_at else None,
        'ejecutada_por': _nombre(s.ejecutada_por) or 'Tarea programada',
        'en_curso': en_curso,
        'estado': Sincronizacion.Estado.ERROR if caida else s.estado,
        'estado_label': (
            'En curso' if en_curso else 'Interrumpida' if caida else s.get_estado_display()
        ),
        'planes_leidos': s.planes_leidos,
        'resumen': s.resumen,
        'errores': s.errores,
        'error': s.error,
    }


@api_view(['GET'])
@permission_classes(GESTION)
def conexion(request):
    """Última lectura, planes relacionados, incidencias abiertas y la bitácora."""
    lecturas = list(
        Sincronizacion.objects.select_related('ejecutada_por').defer('ejecutada_por__foto')[:15]
    )
    ultima = next((s for s in lecturas if s.tipo != Sincronizacion.Tipo.INVENTARIO), None)
    medidas = personas_medidas()
    con_plan = medidas.filter(planes_planner__activo=True).distinct().count()
    abiertas = (
        IncidenciaCalidad.objects.filter(abierta=True)
        .select_related('plan', 'colaborador')
        .defer('colaborador__foto')
    )
    estado = GraphClient().estado() if request.query_params.get('probar') else None
    return Response(
        {
            'estado_graph': estado,
            'ultima_lectura': _lectura_json(ultima) if ultima else None,
            'personas_medidas': medidas.count(),
            'personas_con_plan': con_plan,
            'planes_relacionados': PlanPlanner.objects.filter(
                activo=True, colaborador__isnull=False
            ).count(),
            'incidencias_abiertas': abiertas.count(),
            'incidencias_criticas': abiertas.filter(
                severidad=IncidenciaCalidad.Severidad.CRITICA
            ).count(),
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
        }
    )


@api_view(['POST'])
@permission_classes(GESTION)
def sincronizar(request):
    """
    «Sincronizar ahora»: lee Planner y actualiza la semana en curso.

    La lectura tarda minutos, así que corre en segundo plano y la respuesta
    sale de una vez (202): la pantalla consulta la conexión hasta que termina.
    Si ya hay una lectura corriendo, devuelve esa en vez de empezar otra.
    """
    en_curso = lectura_en_curso()
    if en_curso:
        return Response({**_lectura_json(en_curso), 'ya_en_curso': True})
    tipo = Sincronizacion.Tipo.MANUAL
    semana = semana_del_corte(tipo, timezone.now())
    registro = Sincronizacion.objects.create(
        tipo=tipo, anio=semana.anio, semana=semana.numero, ejecutada_por=request.user
    )
    leer_en_segundo_plano(registro)
    return Response({**_lectura_json(registro), 'ya_en_curso': False}, status=202)


def _estado_plan(persona: User, plan: PlanPlanner | None) -> str:
    if not persona.planner_url:
        return 'Sin URL'
    if plan is None:
        return 'URL no válida'
    if not plan.accesible:
        return 'Inaccesible'
    if plan.ultima_lectura_at is None:
        return 'Sin leer'
    return 'Leído'


@api_view(['GET'])
@permission_classes(GESTION)
def planes(request):
    """
    El plan de cada persona con correo @supli.tech, tal como sale de su URL.

    Solo lectura: el plan se cambia en Gestión de usuarios (campo «URL de
    Planner»).
    """
    personas = list(personas_planner().select_related('area').order_by('first_name', 'last_name'))
    activos = {
        p.colaborador_id: p
        for p in PlanPlanner.objects.filter(activo=True, colaborador__in=[u.id for u in personas])
    }
    filas = []
    for u in personas:
        p = activos.get(u.id)
        filas.append(
            {
                'id': u.id,
                'nombre': _nombre(u),
                'cargo': u.position,
                'area': u.area.name if u.area_id else '',
                'se_mide': u.medir_planner,
                'url': u.planner_url,
                'estado': _estado_plan(u, p),
                'plan': {
                    'plan_id': p.plan_id,
                    'titulo': p.titulo,
                    'grupo': p.grupo_nombre,
                    'error_lectura': p.error_lectura,
                    'tareas': p.tareas,
                    'ultima_tarea_creada': (
                        p.ultima_tarea_creada.isoformat() if p.ultima_tarea_creada else None
                    ),
                    'ultima_lectura_at': (
                        p.ultima_lectura_at.isoformat() if p.ultima_lectura_at else None
                    ),
                }
                if p
                else None,
            }
        )
    return Response({'personas': filas})


# ── Parámetros (People) ───────────────────────────────────────────────────


def _proximo_lunes() -> date:
    """El primer lunes en que puede regir una versión nueva: el de la semana siguiente."""
    return Semana.actual().siguiente().lunes


def _recalculo_json(r: RecalculoPlanner) -> dict:
    return {
        'id': r.id,
        'semana': Semana(r.anio, r.semana).codigo,
        'etiqueta': f'WEEK {r.semana}',
        'motivo': r.motivo,
        'parametros_id': r.parametros_id,
        'resultados': r.resultados,
        'autorizado_por': _nombre(r.autorizado_por),
        'hecho_at': r.hecho_at.isoformat(),
    }


@api_view(['GET', 'POST'])
@permission_classes(ACCESO)
def parametros(request):
    """
    GET: la versión vigente, las versiones con su vigencia y los recálculos.
    POST (People): una versión nueva, que rige desde un lunes futuro (decisión 7).

    Los pesos deben sumar 100 y el corte verde ser mayor que el ámbar. La
    versión nueva no toca nada ya calculado: rige desde la semana que se elija,
    que tiene que ser una que todavía no empieza. La versión anterior queda
    vigente hasta el día antes.
    """
    if request.method == 'GET':
        hoy = Semana.actual().lunes
        return Response(
            {
                'vigentes': _parametros_json(Parametros.vigentes()),
                'versiones': [
                    {**_parametros_json(p), 'programada': p.vigente_desde > hoy}
                    for p in Parametros.objects.select_related('creado_por').defer(
                        'creado_por__foto'
                    )[:20]
                ],
                'proximo_lunes': _proximo_lunes().isoformat(),
                'recalculos': [
                    _recalculo_json(r)
                    for r in RecalculoPlanner.objects.select_related('autorizado_por').defer(
                        'autorizado_por__foto'
                    )[:20]
                ],
            }
        )
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

    minimo = _proximo_lunes()
    try:
        pedido = date.fromisoformat(str(request.data.get('vigente_desde') or minimo))
    except ValueError:
        errores['vigente_desde'] = ['La fecha no es válida.']
        pedido = minimo
    # Rige desde el lunes de la semana elegida.
    desde = pedido - timedelta(days=pedido.weekday())
    if desde < minimo:
        errores['vigente_desde'] = [
            'Los cambios rigen solo para semanas futuras: elige desde el '
            f'{minimo:%d/%m/%Y} en adelante.'
        ]
    if errores:
        raise ValidationError(errores)

    with transaction.atomic():
        # Si todavía no había ninguna versión, las semanas anteriores quedan con
        # la estándar: así ninguna semana se queda sin parámetros.
        Parametros.para_fecha(desde - timedelta(days=1))
        # Las versiones programadas desde esa semana en adelante se reemplazan.
        try:
            Parametros.objects.filter(vigente_desde__gte=desde).delete()
        except ProtectedError:
            raise ValidationError(
                {
                    'vigente_desde': [
                        'Ya hay resultados calculados con una versión de esa fecha en adelante.'
                    ]
                }
            ) from None
        Parametros.objects.filter(
            Q(vigente_hasta__isnull=True) | Q(vigente_hasta__gte=desde), vigente_desde__lt=desde
        ).update(vigente_hasta=desde - timedelta(days=1))
        nuevos = Parametros.objects.create(creado_por=request.user, vigente_desde=desde, **valores)
    return Response(_parametros_json(nuevos), status=201)


@api_view(['POST'])
@permission_classes(GESTION)
def recalcular(request):
    """
    Recálculo excepcional de una semana: `{semana, motivo}` (decisión 7).

    Recalcula también los resultados ya cerrados, con la versión de parámetros
    que rige esa semana, y queda en la bitácora con quién lo autorizó y por qué.
    """
    try:
        semana = Semana.desde_codigo(request.data.get('semana') or '')
    except ValueError as e:
        raise ValidationError({'semana': [str(e)]}) from None
    motivo = (request.data.get('motivo') or '').strip()
    if len(motivo) < 10:
        raise ValidationError(
            {'motivo': ['Explica el motivo del recálculo (mínimo 10 caracteres).']}
        )
    with transaction.atomic():
        n = recalcular_semana(semana, forzar=True)
        registro = RecalculoPlanner.objects.create(
            anio=semana.anio,
            semana=semana.numero,
            motivo=motivo[:2000],
            parametros=parametros_de(semana),
            resultados=n,
            autorizado_por=request.user,
        )
    return Response(
        {
            **_recalculo_json(registro),
            'mensaje': f'{semana.etiqueta} recalculada: {n} resultado(s).',
        },
        status=201,
    )
