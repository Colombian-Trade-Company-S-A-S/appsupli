"""
La lectura de Planner: toma la foto de la semana de cada plan medido.

    sincronizar('diaria')      → 02:00 COT, cada noche. Foto «actual».
    sincronizar('cierre')      → en el corte (lunes 9:00, martes si es festivo):
                                 la foto de cierre de la semana anterior.
    sincronizar('linea_base')  → en el mismo corte: la línea base de la nueva.
    sincronizar('manual')      → el botón «Sincronizar ahora». Foto «actual».
                                 Corre en segundo plano (leer_en_segundo_plano).

En cada lectura, además de la foto:

- La trazabilidad de las tareas (decisión 2): cuándo entró cada una a la
  medición y sus cambios de depósito.
- Los Hitos de la semana con los ítems de su checklist (decisión 3).
- El panel de calidad del dato y el recálculo de la semana y la anterior.

Solo se leen los planes de las URLs de Planner (Gestión de usuarios) de las
personas que se miden: correo @supli.tech y switch «Planner» (decisión 5).
Antes de leer, los planes se ponen al día con esas URLs; el nombre del plan y
su grupo salen de la misma lectura.

Lo que ya está guardado de la semana se lee de una vez para todos los planes
y lo nuevo se guarda por lotes: la base está en Render y cada consulta suelta
cuesta (con 28 planes, una lectura hacía unas 900).
"""

from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from django.conf import settings
from django.db import connections, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .api_permissions import personas_medidas
from .calculo import parametros_de, recalcular_semana
from .enlaces import reconciliar_planes
from .graph import GraphClient, GraphError, rutas_de_plan
from .models import (
    Deposito,
    HitoPlanner,
    IncidenciaCalidad,
    MovimientoTarea,
    PlanPlanner,
    RecalculoPlanner,
    Sincronizacion,
    Snapshot,
    TareaMedicion,
    TareaSnapshot,
)
from .semanas import Semana, deposito_estandar, semana_de_deposito, semana_del_corte

logger = logging.getLogger(__name__)

ETIQUETAS_CLAVE = ('WEEKLY', 'DAILY', 'HITO')

TIPO_FOTO = {
    Sincronizacion.Tipo.DIARIA: Snapshot.Tipo.ACTUAL,
    Sincronizacion.Tipo.MANUAL: Snapshot.Tipo.ACTUAL,
    Sincronizacion.Tipo.LINEA_BASE: Snapshot.Tipo.LINEA_BASE,
    Sincronizacion.Tipo.CIERRE: Snapshot.Tipo.CIERRE,
}

# Lo que cada lectura deja en el plan.
CAMPOS_LECTURA = [
    'tareas',
    'ultima_tarea_creada',
    'accesible',
    'error_lectura',
    'ultima_lectura_at',
    'updated_at',
]

Incidencia = tuple[str, str, str]  # (tipo, severidad, detalle)
I = IncidenciaCalidad  # noqa: E741


def planes_medidos():
    """Los planes que se leen: activos y de una persona que se mide (@supli.tech y switch)."""
    return (
        PlanPlanner.objects.filter(activo=True, colaborador__in=personas_medidas())
        .select_related('colaborador')
        .defer('colaborador__foto')
    )


#: Una lectura viva late antes de cada plan y de cada tanda de Graph (entre
#: latido y latido pasan segundos; una tanda que Graph limita puede tardar más).
#: Sin latido en este tiempo, ya no corre: se reinició el servidor.
SIN_LATIDO = timedelta(minutes=3)

#: Al pedir detenerla, si no late hace más que esto no hay quién la detenga:
#: se cierra de una vez como «Detenida», sin esperar.
LATIDO_RECIENTE = timedelta(seconds=20)

#: Si se pidió detener y en este tiempo no se cerró sola, se da por detenida.
ESPERA_DETENER = timedelta(seconds=30)


class LecturaDetenida(Exception):
    """Alguien tocó «Detener actualización»: la lectura para donde va."""


def ultima_senal(lectura: Sincronizacion):
    """El último latido, o el arranque si todavía no alcanzó a latir."""
    return lectura.latido_at or lectura.iniciada_at


def esta_viva(lectura: Sincronizacion, ahora: datetime | None = None) -> bool:
    """Si sigue corriendo: sin terminar, latiendo y sin un «detener» vencido."""
    ahora = ahora or timezone.now()
    if lectura.terminada_at is not None:
        return False
    if lectura.detener_at is not None and lectura.detener_at < ahora - ESPERA_DETENER:
        return False
    return ultima_senal(lectura) >= ahora - SIN_LATIDO


def lectura_en_curso() -> Sincronizacion | None:
    """La lectura de Planner que está corriendo ahora, si hay una."""
    ahora = timezone.now()
    candidatas = (
        Sincronizacion.objects.filter(terminada_at__isnull=True)
        .filter(Q(latido_at__gte=ahora - SIN_LATIDO) | Q(iniciada_at__gte=ahora - SIN_LATIDO))
        .exclude(tipo=Sincronizacion.Tipo.INVENTARIO)
        .exclude(detener_at__lt=ahora - ESPERA_DETENER)
    )
    return next((s for s in candidatas if esta_viva(s, ahora)), None)


def pedir_que_se_detenga(lectura: Sincronizacion, quien) -> Sincronizacion:
    """
    Marca la lectura para que se detenga y termine como «Detenida»: lo que ya
    guardó queda, el resto se lee en la próxima lectura.

    Si está latiendo, para ella misma antes del siguiente plan (en segundos).
    Si no late hace rato, no hay quién la detenga (se reinició el servidor):
    se cierra aquí, de una vez.
    """
    ahora = timezone.now()
    if lectura.detener_at is None:
        lectura.detener_at = ahora
        lectura.detenida_por = quien
    campos = ['detener_at', 'detenida_por']
    if lectura.terminada_at is None and ultima_senal(lectura) < ahora - LATIDO_RECIENTE:
        lectura.estado = Sincronizacion.Estado.DETENIDA
        lectura.error = _texto_detenida(lectura) + ' Ya no estaba corriendo.'
        lectura.terminada_at = ahora
        campos += ['estado', 'error', 'terminada_at']
    lectura.save(update_fields=campos)
    return lectura


def _texto_detenida(lectura: Sincronizacion) -> str:
    quien = lectura.detenida_por.full_name if lectura.detenida_por else 'alguien'
    return (
        f'La detuvo {quien}. Lo que alcanzó a guardar queda; el resto se lee en la '
        'próxima lectura.'
    )


#: Entre latido y latido, como mínimo: «Detener» responde en un par de
#: segundos sin una consulta a la base por cada plan.
CADA_LATIDO = 2.0  # segundos


def _latir(registro: Sincronizacion) -> None:
    """
    Anota que la lectura sigue viva y, en la misma consulta, revisa si
    pidieron detenerla: el UPDATE no toca la fila si ya tiene «detener».
    Se llama seguido (antes de cada plan y de cada tanda de Graph), pero va a
    la base como mucho cada `CADA_LATIDO` segundos.
    """
    ahora = time.monotonic()
    ultimo = getattr(registro, '_ultimo_latido', None)
    if ultimo is not None and ahora - ultimo < CADA_LATIDO:
        return
    registro._ultimo_latido = ahora
    vivas = Sincronizacion.objects.filter(pk=registro.pk, detener_at__isnull=True).update(
        latido_at=timezone.now()
    )
    if not vivas:
        raise LecturaDetenida


def leer_en_segundo_plano(registro: Sincronizacion) -> None:
    """
    Corre la lectura de `registro` en otro hilo y vuelve de una vez.

    «Sincronizar ahora» no espera la lectura, que tarda minutos: la pantalla
    consulta la bitácora hasta que termina. En las pruebas corre en el mismo
    hilo, para que vea la base de la prueba.
    """
    if not settings.PLANNER_LEER_EN_SEGUNDO_PLANO:
        _correr(registro)
        return

    def correr(pk: int) -> None:
        try:
            _correr(Sincronizacion.objects.get(pk=pk))  # el del hilo, no el de la petición
        except Exception:
            logger.exception('La lectura de Planner %s se interrumpió', pk)
        finally:
            connections.close_all()

    hilo = threading.Thread(
        target=correr, args=(registro.pk,), name=f'planner-lectura-{registro.pk}', daemon=True
    )
    # Arranca cuando el registro ya está guardado (el hilo lo busca en la base).
    transaction.on_commit(hilo.start)


def _correr(registro: Sincronizacion) -> None:
    """La lectura del botón: las semanas que se eligieron, o la de su registro."""
    if registro.resumen.get('pedidas'):
        sincronizar_semanas(registro)
    else:
        sincronizar(registro.tipo, registro=registro)


@dataclass(frozen=True)
class Objetivo:
    """Una semana que se guarda en una lectura, y con qué foto."""

    semana: Semana
    tipo_foto: str
    #: Reemplaza la foto de cierre o la línea base aunque ya existan.
    forzar: bool = False
    #: Recalcula aunque los resultados ya fueran finales, y lo deja en la
    #: bitácora de recálculos (decisión 7): la semana cerrada leída a mano.
    excepcional: bool = False


def objetivo_manual(semana: Semana, ahora: datetime | None = None) -> Objetivo:
    """
    Lo que hace «Sincronizar» con una semana elegida.

    En curso: la foto «actual», como cada noche. Ya cerrada: se vuelve a tomar
    su foto de cierre con lo que hay hoy en Planner (también si el corte no la
    tomó) y se recalcula aunque ya estuviera cerrada.
    """
    if semana.cerrada(ahora):
        return Objetivo(semana, Snapshot.Tipo.CIERRE, forzar=True, excepcional=True)
    return Objetivo(semana, Snapshot.Tipo.ACTUAL)


def sincronizar_semanas(
    registro: Sincronizacion,
    cliente: GraphClient | None = None,
    ahora: datetime | None = None,
) -> Sincronizacion:
    """
    «Sincronizar» con las semanas elegidas (`registro.resumen['pedidas']`).

    Planner se lee una sola vez y de esa lectura se guarda cada semana: elegir
    tres no cuesta tres lecturas. Las semanas cerradas se recalculan y el
    recálculo queda en la bitácora con el motivo (decisión 7).
    """
    ahora = ahora or timezone.now()
    pedidas = [Semana.desde_codigo(c) for c in registro.resumen['pedidas']]
    objetivos = [objetivo_manual(s, ahora) for s in sorted(set(pedidas))]
    motivo = registro.resumen.get('motivo', '')
    _leer_con_bitacora(registro, objetivos, cliente or GraphClient(), ahora, motivo=motivo)
    return registro


def sincronizar(
    tipo: str,
    ejecutada_por=None,
    semana: Semana | None = None,
    cliente: GraphClient | None = None,
    ahora: datetime | None = None,
    forzar: bool = False,
    registro: Sincronizacion | None = None,
) -> Sincronizacion:
    """
    Lee los planes medidos y guarda la foto de la semana.

    La línea base y el cierre se toman una sola vez: si ya existen, no se
    reemplazan salvo con `forzar` (así, correr el comando dos veces el jueves
    no mueve la línea base del lunes).

    `registro` es la entrada de la bitácora ya creada (la del botón, que se
    crea antes de lanzar el hilo). Si algo inesperado corta la lectura, queda
    en la bitácora con error en vez de quedar «en curso».
    """
    ahora = ahora or timezone.now()
    if semana is None and registro is not None and registro.semana:
        semana = Semana(registro.anio, registro.semana)
    semana = semana or semana_del_corte(tipo, ahora)
    if registro is None:
        registro = Sincronizacion.objects.create(
            tipo=tipo, anio=semana.anio, semana=semana.numero, ejecutada_por=ejecutada_por
        )
    # La de cada noche y la del corte recalculan también la semana anterior.
    objetivos = [Objetivo(semana, TIPO_FOTO[tipo], forzar)]
    _leer_con_bitacora(registro, objetivos, cliente or GraphClient(), ahora, con_anterior=True)
    return registro


def _leer_con_bitacora(registro, objetivos, cliente, ahora, **opciones) -> None:
    """
    Si algo inesperado corta la lectura, queda con error en la bitácora. Si la
    detuvieron a mano, queda «Detenida».
    """
    try:
        _leer(registro, objetivos, cliente, ahora, **opciones)
    except LecturaDetenida:
        registro.refresh_from_db(fields=['detenida_por', 'detener_at'])
        registro.estado = Sincronizacion.Estado.DETENIDA
        registro.error = _texto_detenida(registro)
        registro.terminada_at = timezone.now()
        registro.save(update_fields=['estado', 'error', 'terminada_at'])
    except Exception as e:
        registro.estado = Sincronizacion.Estado.ERROR
        registro.error = f'La lectura se interrumpió: {e}'
        registro.terminada_at = timezone.now()
        registro.save(update_fields=['estado', 'error', 'terminada_at'])
        raise


def _leer(
    registro: Sincronizacion,
    objetivos: list[Objetivo],
    cliente: GraphClient,
    ahora: datetime,
    con_anterior: bool = False,
    motivo: str = '',
) -> None:
    """
    Lee Planner una vez y guarda la foto de cada semana de `objetivos`.

    Graph se consulta una sola vez por lectura, sea una semana o varias: las
    tareas son las mismas y cada semana toma las de su depósito.

    Late (y revisa si la detuvieron) al empezar, antes de cada tanda de Graph
    y antes de cada plan: «Detener actualización» responde en segundos.
    """
    _latir(registro)
    reconciliar_planes()
    planes = list(planes_medidos())
    resumen = {'planes': len(planes), 'fotos': 0, 'omitidas': 0, 'inaccesibles': 0, 'tareas': 0}
    if len(objetivos) > 1 or registro.resumen.get('pedidas'):
        resumen['semanas'] = [o.semana.etiqueta for o in objetivos]
    errores: list[dict] = []
    detectadas: list[tuple[PlanPlanner | None, object, Incidencia, Semana]] = []
    hitos_por_leer: list[HitoPlanner] = []
    # La semana de lo que no es de una semana (quien no tiene plan): la más reciente.
    ultima = max(o.semana for o in objetivos)

    try:
        rutas = [ruta for plan in planes for ruta in rutas_de_plan(plan.plan_id)]
        respuestas = (
            cliente.lote(rutas, entre_tandas=lambda: _latir(registro)) if rutas else []
        )
    except GraphError as e:
        registro.estado = Sincronizacion.Estado.ERROR
        registro.error = str(e)
        registro.terminada_at = timezone.now()
        registro.resumen = resumen
        registro.save()
        logger.warning('Lectura de Planner fallida: %s', e)
        return

    # Lo guardado de cada semana, leído de una vez; los depósitos son del plan,
    # no de la semana: se leen una vez y los comparten.
    depositos = _depositos(planes)
    previos = {o: _previo(planes, o.semana, o.tipo_foto, depositos) for o in objetivos}
    leidos: list[PlanPlanner] = []
    for i, plan in enumerate(planes):
        # «Detener actualización» se revisa antes de cada plan: cada plan se
        # guarda entero o no se toca.
        _latir(registro)
        buckets, detalles, tareas, datos_plan = respuestas[4 * i : 4 * i + 4]
        fallida = next((r for r in (buckets, detalles, tareas, datos_plan) if not r.ok), None)
        if fallida is not None:
            plan.accesible = False
            plan.error_lectura = fallida.error[:255]
            plan.save(update_fields=['accesible', 'error_lectura', 'updated_at'])
            resumen['inaccesibles'] += 1
            nombre = plan.titulo or _nombre(plan.colaborador)
            errores.append({'plan': nombre, 'error': fallida.error})
            detectadas.append(
                (
                    plan,
                    plan.colaborador,
                    (
                        I.Tipo.PLAN_INACCESIBLE,
                        I.Severidad.CRITICA,
                        f'No se pudo leer el plan de la URL de Planner de {nombre} '
                        f'({fallida.status}). No entra en el cálculo hasta corregir el enlace '
                        'en Gestión de usuarios o el permiso en Microsoft.',
                    ),
                    ultima,
                )
            )
            continue
        _datos_del_plan(plan, datos_plan.cuerpo)
        guardado = False
        for objetivo in objetivos:
            try:
                with transaction.atomic():
                    tomada, incidencias, n_tareas, hitos = _guardar_plan(
                        plan,
                        objetivo.semana,
                        objetivo.tipo_foto,
                        registro,
                        buckets.cuerpo['value'],
                        detalles.cuerpo,
                        tareas.cuerpo['value'],
                        ahora,
                        objetivo.forzar,
                        previos[objetivo],
                    )
            except Exception as e:  # un plan raro no tumba la lectura de los demás
                logger.exception('Error guardando el plan %s', plan.plan_id)
                error = str(e)[:300]
                if len(objetivos) > 1:
                    error = f'{objetivo.semana.etiqueta}: {error}'
                errores.append({'plan': plan.titulo, 'error': error})
                continue
            guardado = True
            resumen['fotos' if tomada else 'omitidas'] += 1
            resumen['tareas'] += n_tareas
            hitos_por_leer += hitos
            detectadas += [(plan, plan.colaborador, inc, objetivo.semana) for inc in incidencias]
        if guardado:
            leidos.append(plan)

    momento = timezone.now()
    for plan in leidos:
        plan.updated_at = momento  # bulk_update no lo pone solo
    PlanPlanner.objects.bulk_update(leidos, CAMPOS_LECTURA)
    _latir(registro)
    _leer_checklists(cliente, hitos_por_leer)
    _nombres_de_grupos(cliente, planes)

    # Quien se mide y no tiene plan relacionado.
    con_plan = {p.colaborador_id for p in planes}
    for persona in personas_medidas().exclude(pk__in=con_plan):
        detectadas.append(
            (
                None,
                persona,
                (
                    I.Tipo.SIN_PLAN,
                    I.Severidad.CRITICA,
                    'Sin URL de Planner en Gestión de usuarios. No entra en el cálculo.',
                ),
                ultima,
            )
        )

    _registrar_incidencias(detectadas)
    _latir(registro)
    _recalcular(objetivos, ahora, con_anterior, motivo, registro)

    registro.planes_leidos = len(planes) - resumen['inaccesibles']
    registro.resumen = resumen
    registro.errores = errores
    registro.estado = (
        Sincronizacion.Estado.OK
        if not errores
        else Sincronizacion.Estado.PARCIAL
        if registro.planes_leidos
        else Sincronizacion.Estado.ERROR
    )
    registro.terminada_at = timezone.now()
    registro.save()


def _recalcular(objetivos, ahora, con_anterior: bool, motivo: str, registro) -> None:
    """
    Recalcula cada semana leída una sola vez (y la anterior, en las lecturas
    de cada noche y del corte). Las cerradas que se volvieron a leer a mano se
    recalculan aunque ya fueran finales, y queda en la bitácora con el motivo.
    """
    semanas = {o.semana: o.excepcional for o in objetivos}
    if con_anterior:
        for o in objetivos:
            semanas.setdefault(o.semana.anterior(), False)
    for semana, excepcional in sorted(semanas.items()):
        n = recalcular_semana(semana, ahora, forzar=excepcional)
        if excepcional:
            RecalculoPlanner.objects.create(
                anio=semana.anio,
                semana=semana.numero,
                motivo=(motivo or 'Lectura a mano de una semana cerrada.')[:2000],
                parametros=parametros_de(semana),
                resultados=n,
                autorizado_por=registro.ejecutada_por,
            )


@dataclass
class _Previo:
    """Lo que ya está guardado de la semana, leído de una vez para todos los planes."""

    depositos: dict[int, set] = field(default_factory=dict)  # plan → {(bucket, nombre)}
    fotos: dict[int, Snapshot] = field(default_factory=dict)  # plan → foto de este tipo
    ids_base: dict[int, set] = field(default_factory=dict)  # plan → Weekly de la línea base
    seguidas: dict[int, dict] = field(default_factory=dict)  # plan → task_id → TareaMedicion
    hitos: dict[int, dict] = field(default_factory=dict)  # colaborador → task_id → Hito


def _depositos(planes: list[PlanPlanner]) -> dict[int, set]:
    """Los depósitos guardados de cada plan: {plan: {(bucket, nombre)}}."""
    depositos: dict[int, set] = defaultdict(set)
    for plan_id, bucket_id, nombre in Deposito.objects.filter(plan__in=planes).values_list(
        'plan_id', 'bucket_id', 'nombre'
    ):
        depositos[plan_id].add((bucket_id, nombre))
    return depositos


def _previo(
    planes: list[PlanPlanner], semana: Semana, tipo_foto: str, depositos: dict[int, set]
) -> _Previo:
    if not planes:
        return _Previo(depositos=depositos)
    de_la_semana = {'anio': semana.anio, 'semana': semana.numero}
    previo = _Previo(
        depositos=depositos,
        ids_base=defaultdict(set),
        seguidas=defaultdict(dict),
        hitos=defaultdict(dict),
    )
    previo.fotos = {
        s.plan_id: s
        for s in Snapshot.objects.filter(plan__in=planes, tipo=tipo_foto, **de_la_semana)
    }
    if tipo_foto != Snapshot.Tipo.LINEA_BASE:
        # Las de la línea base que se movieron a otro depósito siguen contando
        # para el Weekly: se guardan en la foto, marcadas fuera de la semana.
        for plan_id, task_id in TareaSnapshot.objects.filter(
            snapshot__plan__in=planes,
            snapshot__anio=semana.anio,
            snapshot__semana=semana.numero,
            snapshot__tipo=Snapshot.Tipo.LINEA_BASE,
            es_weekly=True,
            en_semana=True,
        ).values_list('snapshot__plan_id', 'task_id'):
            previo.ids_base[plan_id].add(task_id)
    for t in TareaMedicion.objects.filter(plan__in=planes, **de_la_semana):
        previo.seguidas[t.plan_id][t.task_id] = t
    for h in HitoPlanner.objects.filter(
        colaborador__in=[p.colaborador_id for p in planes], **de_la_semana
    ):
        previo.hitos[h.colaborador_id][h.task_id] = h
    return previo


def _nombre(persona) -> str:
    return persona.full_name if persona else ''


def _datos_del_plan(plan: PlanPlanner, datos: dict) -> None:
    """El nombre del plan y su grupo, tal como están hoy en Planner."""
    titulo = (datos.get('title') or '').strip()[:255]
    grupo = ((datos.get('container') or {}).get('containerId') or datos.get('owner') or '')[:64]
    cambios = {'accesible': True, 'error_lectura': ''}
    if titulo:
        cambios['titulo'] = titulo
    if grupo and grupo != plan.grupo_id:
        cambios.update(grupo_id=grupo, grupo_nombre='')
    cambiados = [c for c, v in cambios.items() if getattr(plan, c) != v]
    for campo in cambiados:
        setattr(plan, campo, cambios[campo])
    if cambiados:
        plan.save(update_fields=[*cambiados, 'updated_at'])


def _nombres_de_grupos(cliente: GraphClient, planes: list[PlanPlanner]) -> None:
    """El nombre del grupo de Microsoft 365 de cada plan que todavía no lo tiene."""
    faltan = sorted({p.grupo_id for p in planes if p.grupo_id and not p.grupo_nombre})
    if not faltan:
        return
    try:
        respuestas = cliente.lote([f'/groups/{g}?$select=id,displayName' for g in faltan])
    except GraphError:
        logger.warning('No se pudieron leer los nombres de los grupos de Planner')
        return
    for grupo_id, respuesta in zip(faltan, respuestas, strict=True):
        nombre = (respuesta.cuerpo.get('displayName') or '')[:255] if respuesta.ok else ''
        if nombre:
            PlanPlanner.objects.filter(grupo_id=grupo_id).update(grupo_nombre=nombre)


def _etiquetas(detalles: dict) -> dict[str, str]:
    """categoryN → nombre en mayúsculas, solo las que tienen nombre."""
    return {
        cat: str(nombre).strip().upper()
        for cat, nombre in (detalles.get('categoryDescriptions') or {}).items()
        if nombre and str(nombre).strip()
    }


def _fecha(valor: str | None):
    return parse_datetime(valor) if valor else None


def _guardar_plan(
    plan, semana, tipo_foto, registro, buckets, detalles, tareas, ahora, forzar, previo: _Previo
):
    """
    Guarda depósitos, la foto de la semana, la trazabilidad y los Hitos.

    Devuelve (tomada, incidencias, n.º de tareas, Hitos cuya checklist hay que leer).
    """
    incidencias: list[Incidencia] = []

    # Depósitos tal como están hoy (se reescriben solo si cambiaron). Se anota
    # lo nuevo: la siguiente semana de la misma lectura ya no los reescribe.
    actuales = {(b['id'], b['name'][:255]) for b in buckets}
    if actuales != previo.depositos.get(plan.id, set()):
        previo.depositos[plan.id] = actuales
        Deposito.objects.filter(plan=plan).delete()
        Deposito.objects.bulk_create(
            [
                Deposito(
                    plan=plan,
                    bucket_id=b['id'],
                    nombre=b['name'][:255],
                    semana=semana_de_deposito(b['name']),
                    estandar=deposito_estandar(b['name']),
                )
                for b in buckets
            ]
        )
    nombres_deposito = {b['id']: b['name'] for b in buckets}
    de_la_semana = {
        b['id']: b['name'] for b in buckets if semana_de_deposito(b['name']) == semana.numero
    }
    if not de_la_semana:
        incidencias.append(
            (
                I.Tipo.SIN_DEPOSITO,
                I.Severidad.CRITICA,
                f'No hay depósito «{semana.etiqueta}» en el plan.',
            )
        )
    for nombre in de_la_semana.values():
        if not deposito_estandar(nombre):
            incidencias.append(
                (
                    I.Tipo.DEPOSITO_NO_ESTANDAR,
                    I.Severidad.ALERTA,
                    f'«{nombre.strip()}» no coincide con el estándar «{semana.etiqueta}». '
                    'Se lee igual; se corrige en Planner.',
                )
            )

    etiquetas = _etiquetas(detalles)
    faltan = [e for e in ETIQUETAS_CLAVE if e not in etiquetas.values()]
    if faltan:
        incidencias.append(
            (
                I.Tipo.ETIQUETAS_FALTANTES,
                I.Severidad.CRITICA,
                f'El plan no tiene las etiquetas {", ".join(faltan)}.',
            )
        )

    # Meta del plan (para el panel y la lista de planes): se guarda al final,
    # con la de los demás planes leídos (CAMPOS_LECTURA).
    creadas = [t.get('createdDateTime') for t in tareas if t.get('createdDateTime')]
    plan.tareas = len(tareas)
    plan.ultima_tarea_creada = _fecha(max(creadas)).date() if creadas else None
    plan.accesible = True
    plan.error_lectura = ''
    plan.ultima_lectura_at = ahora

    def nombres_de(t) -> list[str]:
        return sorted(
            {
                etiquetas[c]
                for c, puesta in (t.get('appliedCategories') or {}).items()
                if puesta and c in etiquetas
            }
        )

    _rastrear(
        plan,
        semana,
        tipo_foto,
        tareas,
        de_la_semana,
        nombres_deposito,
        nombres_de,
        ahora,
        previo.seguidas.get(plan.id, {}),
    )

    existente = previo.fotos.get(plan.id)
    if existente and tipo_foto != Snapshot.Tipo.ACTUAL and not forzar:
        return False, incidencias, 0, []

    # Las de la línea base que se movieron a otro depósito siguen contando
    # para el Weekly: se guardan, marcadas fuera de la semana.
    ids_base = previo.ids_base.get(plan.id, set())

    filas, sin_etiqueta, sin_checklist, hitos = [], 0, 0, []
    weekly = items_daily = 0
    for t in tareas:
        en_semana = t.get('bucketId') in de_la_semana
        if not en_semana and t['id'] not in ids_base:
            continue
        nombres = nombres_de(t)
        es_w, es_d, es_h = ('WEEKLY' in nombres), ('DAILY' in nombres), ('HITO' in nombres)
        total = t.get('checklistItemCount') or 0
        activos = t.get('activeChecklistItemCount') or 0
        if en_semana:
            if not (es_w or es_d or es_h):
                sin_etiqueta += 1
            if es_d and not total:
                sin_checklist += 1
            if es_h:
                hitos.append(t)
            weekly += 1 if es_w else 0
            items_daily += total if es_d else 0
        filas.append(
            TareaSnapshot(
                task_id=t['id'],
                titulo=(t.get('title') or '')[:500],
                bucket_id=t.get('bucketId') or '',
                en_semana=en_semana,
                etiquetas=nombres,
                es_weekly=es_w,
                es_daily=es_d,
                es_hito=es_h,
                completada=t.get('percentComplete') == 100,
                checklist_total=total,
                checklist_marcados=max(0, total - activos),
                creada_at=_fecha(t.get('createdDateTime')),
                completada_at=_fecha(t.get('completedDateTime')),
            )
        )

    if existente:
        # La misma foto, con las tareas de hoy.
        TareaSnapshot.objects.filter(snapshot=existente).delete()
        existente.tomado_at, existente.sincronizacion = ahora, registro
        existente.save(update_fields=['tomado_at', 'sincronizacion'])
        foto = existente
    else:
        foto = Snapshot.objects.create(
            plan=plan,
            anio=semana.anio,
            semana=semana.numero,
            tipo=tipo_foto,
            tomado_at=ahora,
            sincronizacion=registro,
        )
    for fila in filas:
        fila.snapshot = foto
    TareaSnapshot.objects.bulk_create(filas)

    if sin_etiqueta:
        incidencias.append(
            (
                I.Tipo.SIN_ETIQUETA,
                I.Severidad.ALERTA,
                f'{sin_etiqueta} tarea(s) de {semana.etiqueta} sin WEEKLY, DAILY ni HITO. '
                'Excluidas.',
            )
        )
    if sin_checklist:
        incidencias.append(
            (
                I.Tipo.SIN_CHECKLIST,
                I.Severidad.ALERTA,
                f'{sin_checklist} tarea(s) DAILY sin ítems: no cuentan para % Daily.',
            )
        )
    if de_la_semana and not hitos:
        incidencias.append(
            (
                I.Tipo.SIN_HITO,
                I.Severidad.ALERTA,
                f'Sin tarea HITO en {semana.etiqueta}: el Hito no quedó registrado.',
            )
        )
    vacios = [h for h in hitos if not (h.get('checklistItemCount') or 0)]
    if vacios:
        incidencias.append(
            (
                I.Tipo.HITO_SIN_CHECKLIST,
                I.Severidad.ALERTA,
                f'{len(vacios)} tarea(s) HITO de {semana.etiqueta} sin ítems en la '
                'checklist: no cuentan como Hito registrado.',
            )
        )
    if de_la_semana and (not weekly or not items_daily):
        falta = ' ni '.join(n for n, v in (('Weekly', weekly), ('Daily', items_daily)) if not v)
        incidencias.append(
            (
                I.Tipo.COMPONENTE_SIN_DATO,
                I.Severidad.ALERTA,
                f'{semana.etiqueta} sin {falta}: ese componente sale del índice y su peso '
                'se reparte entre los demás.',
            )
        )

    hitos_guardados = _guardar_hitos(plan, semana, hitos, previo.hitos.get(plan.colaborador_id, {}))
    return True, incidencias, len(filas), hitos_guardados


def _rastrear(
    plan, semana, tipo_foto, tareas, de_la_semana, nombres_deposito, nombres_de, ahora, seguidas
):
    """
    La trazabilidad de la semana (decisión 2).

    Una tarea con etiqueta que aparece en el depósito de la semana entra a la
    medición en esa lectura (si estaba en la línea base, desde el corte). A las
    que ya se siguen se les anota cada cambio de depósito, también cuando salen
    de la semana. `seguidas` son las que ya se siguen ({task_id: tarea}).
    """
    nuevas, cambiadas, movimientos = [], [], []
    for t in tareas:
        bucket = t.get('bucketId') or ''
        nombre_bucket = (nombres_deposito.get(bucket) or '')[:255]
        seguida = seguidas.get(t['id'])
        nombres = nombres_de(t)
        if seguida is None:
            if bucket not in de_la_semana or not nombres:
                continue
            nuevas.append(
                TareaMedicion(
                    plan=plan,
                    anio=semana.anio,
                    semana=semana.numero,
                    task_id=t['id'],
                    titulo=(t.get('title') or '')[:500],
                    etiquetas=nombres,
                    creada_at=_fecha(t.get('createdDateTime')),
                    entro_at=ahora,
                    en_linea_base=tipo_foto == Snapshot.Tipo.LINEA_BASE,
                    bucket_id=bucket,
                    bucket_nombre=nombre_bucket,
                    completada=t.get('percentComplete') == 100,
                )
            )
            continue
        cambio = False
        if seguida.bucket_id != bucket:
            movimientos.append(
                MovimientoTarea(
                    tarea=seguida,
                    desde_bucket=seguida.bucket_nombre or seguida.bucket_id,
                    hacia_bucket=nombre_bucket or bucket,
                    detectado_at=ahora,
                )
            )
            seguida.bucket_id, seguida.bucket_nombre = bucket, nombre_bucket
            cambio = True
        if (
            tipo_foto == Snapshot.Tipo.LINEA_BASE
            and bucket in de_la_semana
            and not seguida.en_linea_base
        ):
            seguida.en_linea_base = True
            cambio = True
        completada = t.get('percentComplete') == 100
        if seguida.completada != completada:
            seguida.completada = completada
            cambio = True
        titulo = (t.get('title') or '')[:500]
        if seguida.titulo != titulo:
            seguida.titulo = titulo
            cambio = True
        if cambio:
            cambiadas.append(seguida)
    TareaMedicion.objects.bulk_create(nuevas)
    TareaMedicion.objects.bulk_update(
        cambiadas, ['bucket_id', 'bucket_nombre', 'en_linea_base', 'completada', 'titulo']
    )
    MovimientoTarea.objects.bulk_create(movimientos)


def _guardar_hitos(
    plan, semana: Semana, hitos: list[dict], existentes: dict[str, HitoPlanner]
) -> list[HitoPlanner]:
    """
    Deja los Hitos de la semana tal como están; los ítems se leen después.

    `existentes` son los que ya había de la persona en la semana ({task_id: Hito}).
    """
    momento = timezone.now()
    nuevos, cambiados, vistos = [], [], []
    for h in hitos:
        datos = {
            'plan_id': plan.id,
            'titulo': (h.get('title') or '').strip()[:500],
            'total_items': h.get('checklistItemCount') or 0,
        }
        hito = existentes.get(h['id'])
        if hito is None:
            hito = HitoPlanner(
                colaborador_id=plan.colaborador_id,
                anio=semana.anio,
                semana=semana.numero,
                task_id=h['id'],
                **datos,
            )
            nuevos.append(hito)
        elif any(getattr(hito, campo) != valor for campo, valor in datos.items()):
            for campo, valor in datos.items():
                setattr(hito, campo, valor)
            hito.actualizado_at = momento  # bulk_update no lo pone solo
            cambiados.append(hito)
        vistos.append(hito)
    HitoPlanner.objects.bulk_create(nuevos)
    HitoPlanner.objects.bulk_update(cambiados, ['plan', 'titulo', 'total_items', 'actualizado_at'])
    siguen = {h['id'] for h in hitos}
    sobran = [hito.pk for task_id, hito in existentes.items() if task_id not in siguen]
    if sobran:
        HitoPlanner.objects.filter(pk__in=sobran).delete()
    return [h for h in vistos if h.total_items]


def _leer_checklists(cliente: GraphClient, hitos: list[HitoPlanner]) -> None:
    """
    Lee el texto de los ítems de la checklist de cada Hito, para mostrarlos.

    Si Graph falla, el Hito sigue contando como registrado: el conteo de ítems
    ya llegó con la tarea. Solo se queda sin el texto hasta la próxima lectura.
    """
    if not hitos:
        return
    try:
        respuestas = cliente.lote([f'/planner/tasks/{h.task_id}/details' for h in hitos])
    except GraphError as e:
        logger.warning('No se pudieron leer las checklists de los Hitos: %s', e)
        return
    momento = timezone.now()
    leidos = []
    for hito, respuesta in zip(hitos, respuestas, strict=False):
        if not respuesta.ok:
            continue
        checklist = (respuesta.cuerpo.get('checklist') or {}).values()
        items = [
            {'titulo': (item.get('title') or '').strip(), 'marcado': bool(item.get('isChecked'))}
            for item in sorted(checklist, key=lambda i: i.get('orderHint') or '')
        ]
        hito.items = items
        hito.total_items = len(items) or hito.total_items
        hito.actualizado_at = momento
        leidos.append(hito)
    HitoPlanner.objects.bulk_update(leidos, ['items', 'total_items', 'actualizado_at'])


def _registrar_incidencias(detectadas) -> None:
    """
    Abre lo que se detectó y cierra lo que ya no aparece.

    Cada detección trae su semana: una lectura puede guardar varias. Una
    incidencia es la misma si coincide en tipo, plan, persona, semana y
    detalle: así no se duplica cada noche. Los planes duplicados los detecta
    el inventario, no la lectura semanal: esas no se cierran aquí.
    """
    abiertas = {
        (i.tipo, i.plan_id, i.colaborador_id, i.anio, i.semana, i.detalle): i.pk
        for i in IncidenciaCalidad.objects.filter(abierta=True).exclude(
            tipo=IncidenciaCalidad.Tipo.PLAN_DUPLICADO
        )
    }
    vistas, nuevas = set(), {}
    for plan, persona, (tipo, severidad, detalle), semana in detectadas:
        detalle = detalle[:500]
        clave = (
            tipo,
            plan.pk if plan else None,
            persona.pk if persona else None,
            semana.anio,
            semana.numero,
            detalle,
        )
        if clave in abiertas:
            vistas.add(abiertas[clave])
        elif clave not in nuevas:
            nuevas[clave] = IncidenciaCalidad(
                tipo=tipo,
                severidad=severidad,
                plan=plan,
                colaborador=persona,
                anio=semana.anio,
                semana=semana.numero,
                detalle=detalle,
            )
    IncidenciaCalidad.objects.bulk_create(nuevas.values())
    cerrar = [pk for pk in abiertas.values() if pk not in vistas]
    if cerrar:
        IncidenciaCalidad.objects.filter(pk__in=cerrar).update(
            abierta=False, resuelta_at=timezone.now()
        )
