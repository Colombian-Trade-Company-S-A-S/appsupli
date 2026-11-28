"""
Pruebas de Ejecución Planner: calendario, fórmulas, sincronización y API,
con las decisiones de People (respuestas v3).

Graph se reemplaza por un cliente falso: las pruebas nunca salen a internet.
"""

from datetime import date, datetime, timedelta
from decimal import Decimal
from io import StringIO
from unittest import mock

import openpyxl
import pytest
from django.core.management import CommandError, call_command
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import Application, Permission, Role, User
from apps.planner import semanas as sem
from apps.planner.calculo import indice, porcentaje
from apps.planner.enlaces import plan_id_de_url
from apps.planner.graph import Respuesta
from apps.planner.models import (
    HitoPlanner,
    IncidenciaCalidad,
    Parametros,
    PlanPlanner,
    RecalculoPlanner,
    ResultadoSemana,
    Sincronizacion,
    Snapshot,
    TareaMedicion,
)
from apps.planner.semanas import COT, Semana, semana_de_deposito, semanas_del_mes
from apps.planner.sync import sincronizar

RUTA = '/api/performance/planner'
W46 = Semana(2026, 46)
PLAN_JULIAN = 'JhPlanJulianHerreno2026abcd'
URL_JULIAN = f'https://planner.cloud.microsoft/ui/web/plan/{PLAN_JULIAN}/view/board?tid=t1'


# ── Calendario ────────────────────────────────────────────────────────────


def test_festivos_de_noviembre_2026():
    assert sem.es_festivo(date(2026, 11, 2))  # Todos los Santos, trasladado
    assert sem.es_festivo(date(2026, 11, 16))  # Independencia de Cartagena, trasladado
    assert not sem.es_festivo(date(2026, 11, 9))


def test_el_corte_es_el_lunes_a_las_9_o_el_martes_si_es_festivo():
    """Decisión 1: un solo corte cierra la semana anterior y abre la nueva."""
    assert Semana(2026, 45).linea_base == datetime(2026, 11, 3, 9, 0, tzinfo=COT)
    assert Semana(2026, 46).linea_base == datetime(2026, 11, 9, 9, 0, tzinfo=COT)
    assert Semana(2026, 47).linea_base == datetime(2026, 11, 17, 9, 0, tzinfo=COT)
    # El cierre de una semana es el corte que abre la siguiente.
    assert Semana(2026, 46).cierre == datetime(2026, 11, 17, 9, 0, tzinfo=COT)


def test_la_semana_va_de_corte_a_corte():
    # El lunes 9 antes de las 9:00 todavía es la WEEK 45; después, la 46.
    assert Semana.actual(datetime(2026, 11, 9, 8, 30, tzinfo=COT)) == Semana(2026, 45)
    assert Semana.actual(datetime(2026, 11, 9, 9, 0, tzinfo=COT)) == W46
    # El lunes 16 es festivo: la WEEK 46 sigue abierta hasta el martes 17 a las 9.
    assert Semana.actual(datetime(2026, 11, 17, 8, 0, tzinfo=COT)) == W46
    assert sem.es_dia_de_corte(datetime(2026, 11, 17, 9, 0, tzinfo=COT))
    assert not sem.es_dia_de_corte(datetime(2026, 11, 16, 9, 0, tzinfo=COT))


def test_el_corte_cierra_la_anterior_y_abre_la_nueva():
    ahora = datetime(2026, 11, 9, 9, 0, tzinfo=COT)
    assert sem.semana_del_corte('cierre', ahora) == Semana(2026, 45)
    assert sem.semana_del_corte('linea_base', ahora) == W46


@pytest.mark.parametrize(
    'nombre, esperado',
    [
        ('WEEK 45', 45),
        ('W45', 45),
        ('W 45', 45),
        ('Week 45', 45),
        ('45', 45),
        (' week 7 ', 7),
        ('NOVIEMBRE 2026', None),
        ('2026', None),
        ('WEEK 60', None),
        ('', None),
    ],
)
def test_deposito_de_semana_acepta_las_variantes(nombre, esperado):
    assert semana_de_deposito(nombre) == esperado


def test_semanas_del_mes_son_las_que_tienen_el_lunes_en_el_mes():
    assert [s.numero for s in semanas_del_mes(2026, 11)] == [45, 46, 47, 48, 49]
    assert Semana(2026, 40).mes == (2026, 9)  # su lunes es el 28 de septiembre


def test_2026_tiene_week_53():
    assert Semana.desde_codigo('2026-W53').lunes == date(2026, 12, 28)
    with pytest.raises(ValueError):
        Semana.desde_codigo('2025-W53')


# ── Fórmulas ──────────────────────────────────────────────────────────────


@pytest.mark.django_db
def test_primera_prueba_unitaria_de_la_guia_da_81_3():
    """5 de 6 WEEKLY, 7 de 10 ítems y Hito registrado dan 81,3."""
    p = Parametros.vigentes()
    valor = indice(porcentaje(5, 6), porcentaje(7, 10), Decimal('100'), p)
    assert round(valor, 1) == Decimal('81.3')


@pytest.mark.django_db
def test_sin_weekly_o_sin_daily_su_peso_se_reparte():
    """Fila 11 (provisional): el componente sin dato sale y su peso se reparte."""
    p = Parametros.vigentes()  # 40 / 40 / 20
    # Sin Weekly: Daily 100 y Hito 100 → (40·100 + 20·100) / 60 = 100.
    assert indice(None, Decimal('100'), Decimal('100'), p) == Decimal('100')
    # Sin Daily: Weekly 50 y sin Hito → 40·50 / 60 = 33,33.
    assert round(indice(Decimal('50'), None, Decimal('0'), p), 2) == Decimal('33.33')
    # Sin Weekly ni Daily: la semana no tiene índice.
    assert indice(None, None, Decimal('100'), p) is None


# ── Sincronización con un Graph falso ─────────────────────────────────────


class GraphFalso:
    """
    Responde como Graph a partir de {plan_id: (buckets, etiquetas, tareas)} y,
    para las checklists de los Hitos, {task_id: [títulos de los ítems]}.
    """

    def __init__(self, planes, checklists=None):
        self.planes = planes
        self.checklists = checklists or {}

    def lote(self, rutas, entre_tandas=None):
        if entre_tandas:
            entre_tandas()
        salida = []
        for ruta in rutas:
            partes = ruta.split('/')
            if partes[1].startswith('groups'):
                salida.append(Respuesta(200, {'displayName': 'Equipo BI'}))
                continue
            if ruta.startswith('/planner/tasks/'):
                items = self.checklists.get(partes[3], [])
                salida.append(
                    Respuesta(
                        200,
                        {
                            'checklist': {
                                f'i{n}': {'title': t, 'isChecked': False, 'orderHint': f'{n:03d}'}
                                for n, t in enumerate(items)
                            }
                        },
                    )
                )
                continue
            plan_id = partes[3]
            if plan_id not in self.planes:
                salida.append(Respuesta(403, {'error': {'code': 'Forbidden', 'message': 'No'}}))
                continue
            buckets, etiquetas, tareas = self.planes[plan_id]
            if ruta.endswith('/buckets'):
                salida.append(Respuesta(200, {'value': buckets}))
            elif ruta.endswith('/details'):
                salida.append(Respuesta(200, {'categoryDescriptions': etiquetas}))
            elif len(partes) == 4:
                titulo = f'Plan {plan_id[:6]}-2026'
                cuerpo = {'id': plan_id, 'title': titulo, 'container': {'containerId': 'g1'}}
                salida.append(Respuesta(200, cuerpo))
            else:
                salida.append(Respuesta(200, {'value': tareas}))
        return salida


ETIQUETAS = {'category1': 'WEEKLY', 'category2': 'DAILY', 'category3': 'HITO', 'category4': 'MONTH'}
BUCKETS = [
    {'id': 'b45', 'name': 'WEEK 45'},
    {'id': 'b46', 'name': 'W46'},
    {'id': 'bmes', 'name': 'NOVIEMBRE 2026'},
]


def tarea(id, bucket, *cats, hecha=False, items=0, activos=0, titulo=None):
    return {
        'id': id,
        'title': titulo or id,
        'bucketId': bucket,
        'appliedCategories': {c: True for c in cats},
        'percentComplete': 100 if hecha else 0,
        'checklistItemCount': items,
        'activeChecklistItemCount': activos,
        'createdDateTime': '2026-11-09T14:00:00Z',
    }


def crear_usuario(email, jefe=None, cargo='Analista', app=None, se_mide=True):
    u = User.objects.create_user(
        email=email,
        username=email.split('@')[0],
        first_name=email.split('@')[0].title(),
        password='clave-de-prueba-123',
        position=cargo,
    )
    u.manager = jefe
    u.medir_planner = se_mide
    u.save(update_fields=['manager', 'medir_planner'])
    if app:
        u.applications.add(app)
    return u


@pytest.fixture
def app_planner():
    contenedor = Application.objects.create(
        code='supli-performance',
        name='Supli Performance',
        base_path='/inicio/performance',
        order=300,
    )
    app = Application.objects.create(
        code='ejecucion-planner',
        name='Ejecución Planner',
        base_path='/inicio/performance/planner',
        order=15,
        parent=contenedor,
    )
    for code in ('planner:gestionar', 'planner:ver_todo'):
        Permission.objects.create(code=code, name=code, application=app)
    return app


@pytest.fixture
def equipo(app_planner):
    """CEO → Laura (líder) → Julián y Daniel. Johana es People."""
    ceo = crear_usuario('fabio@supli.tech', cargo='CEO', app=app_planner, se_mide=False)
    lider = crear_usuario('laura@supli.tech', jefe=ceo, cargo='Tech Manager', app=app_planner)
    julian = crear_usuario('julian@supli.tech', jefe=lider, cargo='BI Analyst', app=app_planner)
    daniel = crear_usuario('daniel@supli.tech', jefe=lider, cargo='BI Manager', app=app_planner)
    people = crear_usuario(
        'johana@supli.tech', cargo='People Manager', app=app_planner, se_mide=False
    )
    rol = Role.objects.create(code='performance-people', name='People')
    rol.permissions.set(
        Permission.objects.filter(code__in=['planner:gestionar', 'planner:ver_todo'])
    )
    people.roles.add(rol)
    julian.planner_url = URL_JULIAN
    julian.save(update_fields=['planner_url'])
    PlanPlanner.objects.create(plan_id=PLAN_JULIAN, titulo='', colaborador=julian)
    return lider, julian, daniel, people


EN_W46 = datetime(2026, 11, 10, 12, 0, tzinfo=COT)


def _leer(tipo, tareas, checklists=None, semana=W46, ahora=EN_W46, forzar=False):
    graph = GraphFalso({PLAN_JULIAN: (BUCKETS, ETIQUETAS, tareas)}, checklists)
    return sincronizar(tipo, semana=semana, cliente=graph, ahora=ahora, forzar=forzar)


@pytest.mark.django_db
def test_las_agregadas_despues_del_corte_entran_en_la_medicion(equipo):
    """Decisión 2: lo creado después del corte cuenta en esa misma semana."""
    _, julian, daniel, _ = equipo
    _leer(
        'linea_base',
        [
            tarea('w1', 'b46', 'category1'),
            tarea('w2', 'b46', 'category1'),
            tarea('w3', 'b46', 'category1'),
            tarea('d1', 'b46', 'category2', items=10, activos=10),
            tarea('h1', 'b46', 'category3', titulo='Publicar el dashboard', items=2, activos=2),
            tarea('vieja', 'b45', 'category1', hecha=True),
        ],
    )
    # Durante la semana: w1 y w2 hechas; w3 se movió a otro depósito y se hizo
    # (sigue contando en su semana); se agregó w4 y w5 (cuentan); 7 de 10 ítems.
    _leer(
        'diaria',
        [
            tarea('w1', 'b46', 'category1', hecha=True),
            tarea('w2', 'b46', 'category1', hecha=True),
            tarea('w3', 'bmes', 'category1', hecha=True),
            tarea('w4', 'b46', 'category1', hecha=True),
            tarea('w5', 'b46', 'category1'),
            tarea('d1', 'b46', 'category2', items=10, activos=3),
            tarea('h1', 'b46', 'category3', titulo='Publicar el dashboard', items=2, activos=2),
        ],
        checklists={'h1': ['Definir métricas', 'Publicar']},
    )

    r = ResultadoSemana.objects.get(colaborador=julian, anio=2026, semana=46)
    assert (r.weekly_base, r.weekly_agregadas, r.weekly_total) == (3, 2, 5)
    assert r.weekly_completadas == 4
    assert r.pct_weekly == Decimal('80.00')
    assert (r.daily_marcados, r.daily_items) == (7, 10)
    # El Hito tiene ítems: queda registrado sin que nadie lo valide.
    assert r.hito == Decimal('100') and r.hitos_registrados == 1
    assert r.indice == Decimal('80.00')  # 0,4·80 + 0,4·70 + 0,2·100
    assert not r.base_aproximada and not r.final

    hito = HitoPlanner.objects.get(colaborador=julian, anio=2026, semana=46)
    assert [i['titulo'] for i in hito.items] == ['Definir métricas', 'Publicar']

    # Trazabilidad: w4 entró después del corte; w3 se movió de depósito.
    w4 = TareaMedicion.objects.get(task_id='w4')
    assert not w4.en_linea_base and w4.creada_at is not None
    w3 = TareaMedicion.objects.get(task_id='w3')
    assert w3.en_linea_base
    assert [(m.desde_bucket, m.hacia_bucket) for m in w3.movimientos.all()] == [
        ('W46', 'NOVIEMBRE 2026')
    ]
    # El depósito «W46» se lee igual, pero queda la alerta de formato.
    assert IncidenciaCalidad.objects.filter(tipo='deposito_no_estandar', abierta=True).exists()
    # Daniel se mide y no tiene plan: incidencia crítica.
    assert IncidenciaCalidad.objects.filter(
        tipo='sin_plan', colaborador=daniel, abierta=True
    ).exists()


@pytest.mark.django_db
def test_hito_sin_items_no_queda_registrado(equipo):
    _, julian, _, _ = equipo
    _leer(
        'diaria',
        [
            tarea('w1', 'b46', 'category1', hecha=True),
            tarea('d1', 'b46', 'category2', items=4, activos=0),
            tarea('h1', 'b46', 'category3', titulo='Hito vacío'),
        ],
    )
    r = ResultadoSemana.objects.get(colaborador=julian)
    assert r.hito == 0 and r.hitos_registrados == 0
    assert IncidenciaCalidad.objects.filter(tipo='hito_sin_checklist', abierta=True).exists()


@pytest.mark.django_db
def test_varios_hitos_basta_con_uno_registrado(equipo):
    """Decisión 12 (provisional): con varios Hitos, cuenta si al menos uno tiene ítems."""
    _, julian, _, _ = equipo
    _leer(
        'diaria',
        [
            tarea('w1', 'b46', 'category1', hecha=True),
            tarea('h1', 'b46', 'category3', items=1, activos=1),
            tarea('h2', 'b46', 'category3', items=3, activos=3),
            tarea('h3', 'b46', 'category3'),
        ],
    )
    r = ResultadoSemana.objects.get(colaborador=julian)
    assert r.hito == Decimal('100') and r.hitos_registrados == 2
    assert HitoPlanner.objects.filter(colaborador=julian).count() == 3


@pytest.mark.django_db
def test_semana_sin_daily_reparte_el_peso_y_avisa(equipo):
    _, julian, _, _ = equipo
    _leer('diaria', [tarea('w1', 'b46', 'category1', hecha=True), tarea('w2', 'b46', 'category1')])
    r = ResultadoSemana.objects.get(colaborador=julian)
    assert r.pct_daily is None
    assert r.indice == Decimal('33.33')  # 40·50 / (40 + 20), sin Hito
    assert IncidenciaCalidad.objects.filter(tipo='componente_sin_dato', abierta=True).exists()


@pytest.mark.django_db
def test_linea_base_no_se_reemplaza_sin_forzar(equipo):
    _, julian, _, _ = equipo
    _leer('linea_base', [tarea('w1', 'b46', 'category1')])
    registro = _leer(
        'linea_base', [tarea('w1', 'b46', 'category1'), tarea('w2', 'b46', 'category1')]
    )
    assert registro.resumen['omitidas'] == 1
    foto = Snapshot.objects.get(plan__colaborador=julian, tipo='linea_base')
    assert foto.tareas.count() == 1


@pytest.mark.django_db
def test_sin_linea_base_se_usa_la_lectura_y_se_avisa(equipo):
    _, julian, _, _ = equipo
    _leer('diaria', [tarea('w1', 'b46', 'category1', hecha=True), tarea('w2', 'b46', 'category1')])
    r = ResultadoSemana.objects.get(colaborador=julian)
    assert r.base_aproximada and r.pct_weekly == Decimal('50.00')


@pytest.mark.django_db
def test_plan_inaccesible_queda_marcado(equipo):
    _, julian, _, _ = equipo
    registro = sincronizar('diaria', semana=W46, cliente=GraphFalso({}), ahora=EN_W46)
    assert registro.estado == 'error'
    plan = PlanPlanner.objects.get(colaborador=julian)
    assert not plan.accesible
    assert IncidenciaCalidad.objects.filter(tipo='plan_inaccesible', abierta=True).exists()


@pytest.mark.django_db
def test_solo_se_mide_a_quien_tiene_el_switch_planner(equipo):
    """Decisión 5: el switch «Planner» de Gestión de usuarios define quién entra."""
    _, julian, _, _ = equipo
    julian.medir_planner = False
    julian.save(update_fields=['medir_planner'])
    registro = _leer('diaria', [tarea('w1', 'b46', 'category1')])
    assert registro.resumen['planes'] == 0
    assert not ResultadoSemana.objects.filter(colaborador=julian).exists()
    # Fabio y Johana no se miden: no salen como «sin plan».
    assert not IncidenciaCalidad.objects.filter(
        tipo='sin_plan', colaborador__email='fabio@supli.tech'
    ).exists()


@pytest.mark.django_db
def test_sin_correo_supli_no_se_mide_aunque_tenga_el_switch(equipo):
    _, julian, _, _ = equipo
    julian.email = 'julian@gmail.com'
    julian.save(update_fields=['email'])
    registro = _leer('diaria', [tarea('w1', 'b46', 'category1')])
    assert registro.resumen['planes'] == 0
    assert not ResultadoSemana.objects.filter(colaborador=julian).exists()


# ── El plan sale de la URL de Planner de cada persona ─────────────────────


def test_el_plan_id_sale_de_los_enlaces_de_planner():
    assert plan_id_de_url(URL_JULIAN) == PLAN_JULIAN
    assert (
        plan_id_de_url(
            'https://planner.cloud.microsoft/webui/plan/xJBXjvz_ukuauF7QqLDcJGUAHKVC/view/grid?tid=t'
        )
        == 'xJBXjvz_ukuauF7QqLDcJGUAHKVC'
    )
    assert (
        plan_id_de_url(
            'https://tasks.office.com/supli.tech/Home/PlanViews/ot357h_0GkuuPc5M4q3_VWUAF-Uc?Type=PlanLink'
        )
        == 'ot357h_0GkuuPc5M4q3_VWUAF-Uc'
    )
    assert (
        plan_id_de_url(
            'https://tasks.office.com/supli.tech/es-ES/Home/Planner/#/plantaskboard'
            '?groupId=g1&planId=Dio8uv-V6U6Wd7dd67YevWUACTRv'
        )
        == 'Dio8uv-V6U6Wd7dd67YevWUACTRv'
    )
    assert plan_id_de_url('https://planner.cloud.microsoft/webui/mytasks') is None
    assert plan_id_de_url('') is None


@pytest.mark.django_db
def test_la_lectura_trae_el_nombre_y_el_grupo_del_plan(equipo):
    _leer('diaria', [tarea('w1', 'b46', 'category1')])
    plan = PlanPlanner.objects.get(plan_id=PLAN_JULIAN)
    assert plan.titulo == f'Plan {PLAN_JULIAN[:6]}-2026'
    assert (plan.grupo_id, plan.grupo_nombre) == ('g1', 'Equipo BI')


@pytest.mark.django_db
def test_sin_url_queda_sin_plan_en_la_siguiente_lectura(equipo):
    _, julian, _, _ = equipo
    julian.planner_url = ''
    julian.save(update_fields=['planner_url'])
    registro = _leer('diaria', [tarea('w1', 'b46', 'category1')])
    assert registro.resumen['planes'] == 0
    # Nunca se leyó: no queda nada de ese plan.
    assert not PlanPlanner.objects.filter(plan_id=PLAN_JULIAN).exists()
    assert IncidenciaCalidad.objects.filter(
        tipo='sin_plan', colaborador=julian, abierta=True
    ).exists()


@pytest.mark.django_db
def test_el_plan_se_cambia_desde_gestion_de_usuarios(equipo):
    _, julian, daniel, people = equipo
    admin = User.objects.create_superuser(
        email='admin@supli.tech', username='admin', first_name='Admin', password='clave-123456'
    )
    cliente = APIClient()
    cliente.force_authenticate(user=admin)
    nuevo = 'NuevoPlanJulian2027abcdefgh'
    url_nueva = f'https://planner.cloud.microsoft/webui/plan/{nuevo}/view/board?tid=t1'

    r = cliente.patch(f'/api/admin/users/{julian.id}', {'plannerUrl': url_nueva}, format='json')
    assert r.status_code == 200
    assert PlanPlanner.objects.get(colaborador=julian, activo=True).plan_id == nuevo
    assert not PlanPlanner.objects.get(plan_id=PLAN_JULIAN).activo

    # El mismo plan no puede ser de dos personas, y el enlace tiene que ser de un plan.
    r = cliente.patch(f'/api/admin/users/{daniel.id}', {'plannerUrl': url_nueva}, format='json')
    assert r.status_code == 400 and 'planner_url' in r.data['errors']
    r = cliente.patch(
        f'/api/admin/users/{daniel.id}',
        {'plannerUrl': 'https://planner.cloud.microsoft/webui/mytasks'},
        format='json',
    )
    assert r.status_code == 400

    # People ve el plan de cada persona, solo para consultar.
    vista = APIClient()
    vista.force_authenticate(user=people)
    filas = {f['id']: f for f in vista.get(f'{RUTA}/planes').data['personas']}
    assert filas[julian.id]['estado'] == 'Sin leer'
    assert filas[julian.id]['plan']['plan_id'] == nuevo
    assert filas[daniel.id]['estado'] == 'Sin URL'

    # Sin enlace, sin plan.
    r = cliente.patch(f'/api/admin/users/{julian.id}', {'plannerUrl': ''}, format='json')
    assert r.status_code == 200
    assert not PlanPlanner.objects.filter(colaborador=julian, activo=True).exists()


def _excel(ruta, filas):
    libro = openpyxl.Workbook()
    libro.active.append(['Colaborador', 'URL Planner'])
    for fila in filas:
        libro.active.append(fila)
    libro.save(ruta)
    return str(ruta)


@pytest.mark.django_db
def test_las_urls_se_cargan_desde_el_excel(equipo, tmp_path):
    _, julian, daniel, _ = equipo
    daniel.first_name, daniel.last_name = 'Daniel', 'Correa Arias'
    daniel.save(update_fields=['first_name', 'last_name'])
    url = 'https://planner.cloud.microsoft/ui/web/plan/DanielCorreaPlan2026abcdef/view/board?tid=t1'

    # Una fila que no cruza: no se guarda nada.
    malo = _excel(tmp_path / 'malo.xlsx', [('DANIEL CORREA ARIAS', url), ('Nadie Conocido', url)])
    with pytest.raises(CommandError):
        call_command('cargar_urls_planner', malo, stdout=StringIO())
    daniel.refresh_from_db()
    assert daniel.planner_url == ''

    # El Excel es la lista completa: Daniel queda con su plan y Julián, sin URL ni plan.
    bueno = _excel(tmp_path / 'bueno.xlsx', [('DANIEL CORREA ARIAS', url)])
    call_command('cargar_urls_planner', bueno, stdout=StringIO())
    daniel.refresh_from_db()
    julian.refresh_from_db()
    assert daniel.planner_url == url and julian.planner_url == ''
    assert PlanPlanner.objects.get(colaborador=daniel, activo=True).plan_id == (
        'DanielCorreaPlan2026abcdef'
    )
    assert not PlanPlanner.objects.filter(colaborador=julian, activo=True).exists()


@pytest.mark.django_db
def test_el_corte_cierra_la_semana_anterior_y_toma_la_linea_base(equipo):
    _, julian, _, _ = equipo
    tareas = [tarea('w1', 'b45', 'category1', hecha=True), tarea('w2', 'b46', 'category1')]
    graph = GraphFalso({PLAN_JULIAN: (BUCKETS, ETIQUETAS, tareas)})
    with mock.patch('apps.planner.sync.GraphClient', return_value=graph):
        call_command(
            'sync_planner', tipo='corte', semana='2026-W46', forzar=True, stdout=StringIO()
        )
    assert Snapshot.objects.filter(semana=45, tipo='cierre').exists()
    assert Snapshot.objects.filter(semana=46, tipo='linea_base').exists()
    cerrada = ResultadoSemana.objects.get(colaborador=julian, semana=45)
    assert cerrada.final and cerrada.pct_weekly == Decimal('100.00')


# ── API ───────────────────────────────────────────────────────────────────


def cliente(usuario):
    c = APIClient()
    c.force_authenticate(user=usuario)
    return c


def _en(fecha):
    """Congela el «hoy» del calendario de la medición."""
    return mock.patch.object(
        sem, '_local', lambda ahora=None: ahora.astimezone(COT) if ahora else fecha
    )


@pytest.fixture
def semana_medida(equipo):
    _leer(
        'linea_base',
        [
            tarea('w1', 'b46', 'category1', hecha=True),
            tarea('h1', 'b46', 'category3', titulo='Cerrar NDA', items=1, activos=1),
        ],
        checklists={'h1': ['Enviar al cliente']},
    )


@pytest.mark.django_db
def test_el_lider_ve_todo_su_equipo_y_el_director_toda_su_direccion(equipo, semana_medida):
    """Decisiones 4, 8 y 9: cada quien ve todo lo que tiene debajo."""
    lider, julian, daniel, people = equipo
    ceo = User.objects.get(email='fabio@supli.tech')
    r = cliente(lider).get(f'{RUTA}/dashboard', {'semana': W46.codigo})
    assert r.status_code == 200 and r.data['alcance'] == 'equipo'
    assert {f['nombre'] for f in r.data['filas']} == {'Julian', 'Daniel'}
    # El CEO (sin permiso de ver todo) ve a todos los que tiene debajo, no solo a Laura.
    r = cliente(ceo).get(f'{RUTA}/dashboard', {'semana': W46.codigo, 'nivel': 'persona'})
    assert {f['nombre'] for f in r.data['filas']} == {'Laura', 'Julian', 'Daniel'}
    assert cliente(ceo).get(f'{RUTA}/personas/{julian.id}').status_code == 200
    # El colaborador no puede ver el detalle de un compañero ni de su jefe.
    assert cliente(julian).get(f'{RUTA}/personas/{daniel.id}').status_code == 403
    assert cliente(julian).get(f'{RUTA}/personas/{lider.id}').status_code == 403


@pytest.mark.django_db
def test_people_ve_la_compania_por_direccion(equipo, semana_medida):
    lider, _, _, people = equipo
    r = cliente(people).get(f'{RUTA}/dashboard', {'semana': W46.codigo})
    assert r.data['alcance'] == 'compania' and r.data['nivel'] == 'org'
    # La dirección es la de Laura (reporta al CEO), con su equipo debajo.
    direcciones = {f['clave']: f for f in r.data['filas']}
    assert str(lider.id) in direcciones
    assert direcciones[str(lider.id)]['personas'] == 3
    # La lista de personas trae su área y su dirección, para filtrar en pantalla.
    r = cliente(people).get(f'{RUTA}/dashboard', {'semana': W46.codigo, 'nivel': 'persona'})
    julian = next(f for f in r.data['filas'] if f['nombre'] == 'Julian')
    assert julian['direccion_clave'] == str(lider.id)
    assert julian['area'] and julian['direccion']


@pytest.mark.django_db
def test_mi_cumplimiento_trae_hitos_y_trazabilidad(equipo, semana_medida):
    _, julian, _, _ = equipo
    r = cliente(julian).get(f'{RUTA}/mi-cumplimiento', {'semana': W46.codigo})
    assert r.status_code == 200
    assert r.data['actual']['pct_weekly'] == 100.0
    assert r.data['actual']['hito_registrado'] is True
    assert r.data['hitos'][0]['items'] == [{'titulo': 'Enviar al cliente', 'marcado': False}]
    assert {t['titulo'] for t in r.data['tareas']} == {'w1', 'Cerrar NDA'}
    assert len(r.data['historia']) == 8


@pytest.mark.django_db
def test_los_parametros_rigen_solo_hacia_adelante(equipo):
    """Decisión 7: versiones con vigencia; los cambios no tocan semanas ya empezadas."""
    _, julian, _, people = equipo
    datos = {
        'peso_weekly': 50,
        'peso_daily': 30,
        'peso_hito': 20,
        'verde_desde': 80,
        'ambar_desde': 60,
    }
    with _en(EN_W46):
        assert cliente(julian).post(f'{RUTA}/parametros', datos, format='json').status_code == 403
        # La semana en curso ya empezó: no se puede.
        r = cliente(people).post(
            f'{RUTA}/parametros', {**datos, 'vigente_desde': '2026-11-09'}, format='json'
        )
        assert r.status_code == 400
        r = cliente(people).post(f'{RUTA}/parametros', datos, format='json')
        assert r.status_code == 201, r.data
        assert r.data['vigente_desde'] == '2026-11-16'
    # La WEEK 46 sigue con la versión estándar; la 47 ya usa la nueva.
    assert Parametros.para_fecha(date(2026, 11, 9)).peso_weekly == Decimal('40')
    assert Parametros.para_fecha(date(2026, 11, 16)).peso_weekly == Decimal('50')
    assert Parametros.para_fecha(date(2026, 11, 9)).vigente_hasta == date(2026, 11, 15)


@pytest.mark.django_db
def test_el_recalculo_excepcional_pide_motivo_y_queda_auditado(equipo, semana_medida):
    lider, julian, _, people = equipo
    ruta = f'{RUTA}/parametros/recalcular'
    assert cliente(lider).post(ruta, {'semana': W46.codigo, 'motivo': 'x' * 20}).status_code == 403
    assert cliente(people).post(ruta, {'semana': W46.codigo, 'motivo': 'corto'}).status_code == 400
    r = cliente(people).post(
        ruta, {'semana': W46.codigo, 'motivo': 'Se corrigió el plan de Julián.'}
    )
    assert r.status_code == 201, r.data
    registro = RecalculoPlanner.objects.get()
    assert registro.autorizado_por == people and registro.resultados == 1


@pytest.mark.django_db
def test_gestion_solo_para_people(equipo):
    lider, _, _, people = equipo
    assert cliente(lider).get(f'{RUTA}/conexion').status_code == 403
    assert cliente(people).get(f'{RUTA}/conexion').status_code == 200
    assert cliente(lider).get(f'{RUTA}/planes').status_code == 403
    r = cliente(people).get(f'{RUTA}/planes')
    assert r.status_code == 200
    sin_url = {p['nombre'] for p in r.data['personas'] if p['estado'] == 'Sin URL'}
    assert {'Daniel', 'Laura'} <= sin_url


@pytest.mark.django_db
def test_el_plan_ya_no_se_relaciona_desde_planner(equipo):
    """El plan se cambia en Gestión de usuarios; aquí ya no hay ni inventario ni edición."""
    _, _, _, people = equipo
    plan = PlanPlanner.objects.get(plan_id=PLAN_JULIAN)
    assert cliente(people).patch(f'{RUTA}/planes/{plan.id}', {}, format='json').status_code == 404
    assert cliente(people).post(f'{RUTA}/inventario').status_code == 404


@pytest.mark.django_db
def test_las_incidencias_no_se_duplican_y_se_cierran_al_corregir(equipo):
    """Cada lectura abre lo que detecta una sola vez y cierra lo que ya no aparece."""
    sin_hito = [tarea('w1', 'b46', 'category1'), tarea('d1', 'b46', 'category2', items=2)]
    _leer('diaria', sin_hito)
    _leer('diaria', sin_hito)
    abiertas = IncidenciaCalidad.objects.filter(abierta=True, tipo=IncidenciaCalidad.Tipo.SIN_HITO)
    assert abiertas.count() == 1
    _leer('diaria', [*sin_hito, tarea('h1', 'b46', 'category3', items=1)])
    assert not abiertas.exists()
    assert IncidenciaCalidad.objects.get(tipo=IncidenciaCalidad.Tipo.SIN_HITO).resuelta_at


@pytest.mark.django_db
def test_sincronizar_ahora_responde_de_una_vez_y_no_lanza_dos(equipo):
    """La lectura corre en segundo plano (en las pruebas, en el mismo hilo)."""
    _, _, _, people = equipo
    graph = GraphFalso({PLAN_JULIAN: (BUCKETS, ETIQUETAS, [tarea('w1', 'b46', 'category1')])})
    with mock.patch('apps.planner.sync.GraphClient', return_value=graph):
        r = cliente(people).post(f'{RUTA}/sincronizar')
    assert r.status_code == 202 and r.data['ya_en_curso'] is False
    lectura = Sincronizacion.objects.get(pk=r.data['id'])
    assert lectura.terminada_at and lectura.planes_leidos == 1
    assert lectura.ejecutada_por == people

    # Con una lectura corriendo, el botón devuelve esa y no empieza otra.
    corriendo = Sincronizacion.objects.create(tipo=Sincronizacion.Tipo.DIARIA)
    r = cliente(people).post(f'{RUTA}/sincronizar')
    assert r.status_code == 200 and r.data['ya_en_curso'] is True
    assert r.data['id'] == corriendo.id and r.data['en_curso'] is True
    assert r.data['estado_label'] == 'En curso'
    assert Sincronizacion.objects.count() == 2


@pytest.mark.django_db
def test_una_lectura_caida_se_ve_interrumpida_y_no_bloquea(equipo):
    """Si el servidor se reinició a mitad de una lectura, no queda «en curso» para siempre."""
    _, _, _, people = equipo
    caida = Sincronizacion.objects.create(tipo=Sincronizacion.Tipo.MANUAL)
    Sincronizacion.objects.filter(pk=caida.pk).update(
        iniciada_at=timezone.now() - timedelta(hours=1)
    )
    ultima = cliente(people).get(f'{RUTA}/conexion').data['ultima_lectura']
    assert ultima['en_curso'] is False
    assert ultima['estado'] == 'error' and ultima['estado_label'] == 'Interrumpida'
    graph = GraphFalso({PLAN_JULIAN: (BUCKETS, ETIQUETAS, [])})
    with mock.patch('apps.planner.sync.GraphClient', return_value=graph):
        assert cliente(people).post(f'{RUTA}/sincronizar').status_code == 202


@pytest.mark.django_db
def test_un_error_inesperado_deja_la_lectura_con_error(equipo):
    """Lo que no se espera corta la lectura, pero queda en la bitácora, no «en curso»."""
    with (
        mock.patch('apps.planner.sync.recalcular_semana', side_effect=RuntimeError('se cayó')),
        pytest.raises(RuntimeError),
    ):
        _leer('diaria', [tarea('w1', 'b46', 'category1')])
    lectura = Sincronizacion.objects.get()
    assert lectura.estado == Sincronizacion.Estado.ERROR and lectura.terminada_at
    assert 'se cayó' in lectura.error


# ── Sincronizar las semanas elegidas ──────────────────────────────────────

W45 = Semana(2026, 45)
EN_W47 = datetime(2026, 11, 18, 12, 0, tzinfo=COT)


class GraphQueCuenta(GraphFalso):
    """El falso de siempre, contando cuántas veces se leen los planes."""

    lecturas_de_planes = 0

    def lote(self, rutas, entre_tandas=None):
        if any(r.startswith('/planner/plans/') for r in rutas):
            self.lecturas_de_planes += 1
        return super().lote(rutas, entre_tandas)


def _graph_dos_semanas():
    tareas = [
        tarea('w45', 'b45', 'category1', hecha=True),
        tarea('w46', 'b46', 'category1'),
        tarea('d46', 'b46', 'category2', items=2, activos=1),
    ]
    return GraphQueCuenta({PLAN_JULIAN: (BUCKETS, ETIQUETAS, tareas)})


@pytest.mark.django_db
def test_varias_semanas_se_guardan_de_una_sola_lectura_de_planner(equipo):
    from apps.planner.sync import sincronizar_semanas

    _, julian, _, people = equipo
    graph = _graph_dos_semanas()
    registro = Sincronizacion.objects.create(
        tipo=Sincronizacion.Tipo.MANUAL,
        ejecutada_por=people,
        resumen={'pedidas': [W46.codigo, W45.codigo], 'motivo': 'El corte de la W45 falló.'},
    )
    sincronizar_semanas(registro, cliente=graph, ahora=EN_W47)

    assert graph.lecturas_de_planes == 1
    # Las dos ya cerraron el 18 de noviembre: se toma su foto de cierre.
    assert Snapshot.objects.filter(semana=45, tipo='cierre').exists()
    assert Snapshot.objects.filter(semana=46, tipo='cierre').exists()
    w45 = ResultadoSemana.objects.get(colaborador=julian, semana=45)
    assert w45.final and w45.pct_weekly == Decimal('100.00')
    # Cada semana cerrada recalculada queda en la bitácora, con el motivo.
    recalculos = RecalculoPlanner.objects.order_by('semana')
    assert [r.semana for r in recalculos] == [45, 46]
    assert all(r.motivo == 'El corte de la W45 falló.' for r in recalculos)
    assert all(r.autorizado_por == people for r in recalculos)
    registro.refresh_from_db()
    assert registro.resumen['semanas'] == ['WEEK 45', 'WEEK 46']
    assert registro.estado == Sincronizacion.Estado.OK


@pytest.mark.django_db
def test_la_semana_en_curso_se_lee_como_cada_noche_sin_recalculo_excepcional(equipo):
    from apps.planner.sync import sincronizar_semanas

    registro = Sincronizacion.objects.create(
        tipo=Sincronizacion.Tipo.MANUAL, resumen={'pedidas': [W46.codigo]}
    )
    sincronizar_semanas(registro, cliente=_graph_dos_semanas(), ahora=EN_W46)
    assert Snapshot.objects.filter(semana=46, tipo='actual').exists()
    assert not Snapshot.objects.filter(tipo='cierre').exists()
    assert not RecalculoPlanner.objects.exists()


@pytest.mark.django_db
def test_sincronizar_pide_motivo_para_las_cerradas_y_solo_semanas_de_la_lista(equipo):
    _, _, _, people = equipo
    # W45 con fotos: aparece en la lista; el «hoy» es la W46.
    _leer('diaria', [tarea('w45', 'b45', 'category1')], semana=W45, ahora=EN_W46)
    ruta = f'{RUTA}/sincronizar'
    with _en(EN_W46):
        opciones = cliente(people).get(f'{RUTA}/conexion').data['semanas_sincronizables']
        assert [s['etiqueta'] for s in opciones] == ['WEEK 46', 'WEEK 45']
        assert opciones[0]['en_curso'] and opciones[1]['cerrada']

        sin_motivo = cliente(people).post(ruta, {'semanas': [W45.codigo]}, format='json')
        assert sin_motivo.status_code == 400 and 'motivo' in sin_motivo.data['errors']
        fuera = cliente(people).post(ruta, {'semanas': ['2026-W10']}, format='json')
        assert fuera.status_code == 400

        with mock.patch('apps.planner.sync.GraphClient', return_value=_graph_dos_semanas()):
            r = cliente(people).post(
                ruta,
                {'semanas': [W45.codigo, W46.codigo], 'motivo': 'Se corrigieron tareas.'},
                format='json',
            )
    assert r.status_code == 202, r.data
    assert r.data['semana'] == 'WEEK 45, WEEK 46'
    lectura = Sincronizacion.objects.get(pk=r.data['id'])
    assert lectura.terminada_at and lectura.resumen['semanas'] == ['WEEK 45', 'WEEK 46']
    assert RecalculoPlanner.objects.filter(semana=45).exists()


# ── Detener actualización ─────────────────────────────────────────────────


class GraphQueDetiene(GraphFalso):
    """Mientras se lee Planner, alguien toca «Detener actualización»."""

    def __init__(self, registro, quien, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.registro, self.quien = registro, quien

    def lote(self, rutas, entre_tandas=None):
        from apps.planner.sync import pedir_que_se_detenga

        pedir_que_se_detenga(Sincronizacion.objects.get(pk=self.registro.pk), self.quien)
        return super().lote(rutas, entre_tandas)


@pytest.fixture
def latido_en_cada_punto():
    """En producción late como mucho cada 2 s; aquí, en cada punto de control."""
    with mock.patch('apps.planner.sync.CADA_LATIDO', 0):
        yield


@pytest.mark.django_db
def test_detener_para_la_lectura_y_queda_detenida(equipo, latido_en_cada_punto):
    from apps.planner.sync import sincronizar_semanas

    _, _, _, people = equipo
    registro = Sincronizacion.objects.create(
        tipo=Sincronizacion.Tipo.MANUAL, ejecutada_por=people, resumen={'pedidas': [W46.codigo]}
    )
    tareas = [tarea('w1', 'b46', 'category1')]
    graph = GraphQueDetiene(registro, people, {PLAN_JULIAN: (BUCKETS, ETIQUETAS, tareas)})
    sincronizar_semanas(registro, cliente=graph, ahora=EN_W46)

    registro.refresh_from_db()
    assert registro.estado == Sincronizacion.Estado.DETENIDA and registro.terminada_at
    assert 'Johana' in registro.error
    # Se detuvo antes del primer plan: no guardó nada.
    assert not Snapshot.objects.exists()


@pytest.mark.django_db
def test_el_boton_detener_pide_parar_la_lectura_en_curso(equipo):
    lider, _, _, people = equipo
    ruta = f'{RUTA}/sincronizar/detener'
    assert cliente(people).post(ruta).status_code == 400  # no hay ninguna corriendo
    corriendo = Sincronizacion.objects.create(tipo=Sincronizacion.Tipo.MANUAL)
    assert cliente(lider).post(ruta).status_code == 403

    r = cliente(people).post(ruta)
    assert r.status_code == 200
    assert r.data['deteniendo'] is True and r.data['estado_label'] == 'Deteniendo'
    corriendo.refresh_from_db()
    assert corriendo.detener_at and corriendo.detenida_por == people

    # Si no se cerró sola (el servidor se reinició), al rato se da por detenida
    # y no bloquea la siguiente.
    Sincronizacion.objects.filter(pk=corriendo.pk).update(
        detener_at=timezone.now() - timedelta(minutes=5)
    )
    ultima = cliente(people).get(f'{RUTA}/conexion').data['ultima_lectura']
    assert ultima['en_curso'] is False
    assert ultima['estado'] == 'detenida' and ultima['estado_label'] == 'Detenida'
    graph = GraphFalso({PLAN_JULIAN: (BUCKETS, ETIQUETAS, [])})
    with mock.patch('apps.planner.sync.GraphClient', return_value=graph):
        assert cliente(people).post(f'{RUTA}/sincronizar').status_code == 202


@pytest.mark.django_db
def test_detener_una_lectura_que_ya_no_corre_la_cierra_de_una_vez(equipo):
    """El caso del servidor reiniciado: nadie la va a detener, así que se cierra al instante."""
    _, _, _, people = equipo
    muerta = Sincronizacion.objects.create(tipo=Sincronizacion.Tipo.MANUAL)
    Sincronizacion.objects.filter(pk=muerta.pk).update(
        latido_at=timezone.now() - timedelta(minutes=1)
    )
    r = cliente(people).post(f'{RUTA}/sincronizar/detener')
    assert r.status_code == 200
    assert r.data['en_curso'] is False and r.data['estado'] == 'detenida'
    muerta.refresh_from_db()
    assert muerta.terminada_at and 'Ya no estaba corriendo' in muerta.error
    graph = GraphFalso({PLAN_JULIAN: (BUCKETS, ETIQUETAS, [])})
    with mock.patch('apps.planner.sync.GraphClient', return_value=graph):
        assert cliente(people).post(f'{RUTA}/sincronizar').status_code == 202


@pytest.mark.django_db
def test_sin_latido_la_lectura_no_bloquea_la_siguiente(equipo):
    from apps.planner.sync import lectura_en_curso

    _, _, _, people = equipo
    viva = Sincronizacion.objects.create(tipo=Sincronizacion.Tipo.MANUAL)
    Sincronizacion.objects.filter(pk=viva.pk).update(latido_at=timezone.now())
    assert lectura_en_curso() == viva
    hace_rato = timezone.now() - timedelta(minutes=4)
    Sincronizacion.objects.filter(pk=viva.pk).update(latido_at=hace_rato, iniciada_at=hace_rato)
    assert lectura_en_curso() is None
    ultima = cliente(people).get(f'{RUTA}/conexion').data['ultima_lectura']
    assert ultima['estado_label'] == 'Interrumpida'


@pytest.mark.django_db
def test_detener_a_mitad_deja_lo_guardado_y_no_toca_el_siguiente_plan(
    equipo, latido_en_cada_punto
):
    """Para antes del siguiente plan: el que ya guardó queda entero, el resto no se toca."""
    from apps.planner import sync

    lider, julian, daniel, people = equipo
    plan_daniel = 'DnPlanDanielCorrea2026abcde'
    daniel.planner_url = f'https://planner.cloud.microsoft/ui/web/plan/{plan_daniel}/view/board'
    daniel.save(update_fields=['planner_url'])
    PlanPlanner.objects.create(plan_id=plan_daniel, titulo='', colaborador=daniel)
    tareas = [tarea('w1', 'b46', 'category1')]
    graph = GraphFalso(
        {PLAN_JULIAN: (BUCKETS, ETIQUETAS, tareas), plan_daniel: (BUCKETS, ETIQUETAS, tareas)}
    )
    registro = Sincronizacion.objects.create(
        tipo=Sincronizacion.Tipo.MANUAL, ejecutada_por=people, resumen={'pedidas': [W46.codigo]}
    )
    original = sync._guardar_plan

    def guardar_y_detener(*args, **kwargs):
        resultado = original(*args, **kwargs)
        # Alguien toca «Detener» mientras se guardaba el primer plan.
        sync.pedir_que_se_detenga(Sincronizacion.objects.get(pk=registro.pk), people)
        return resultado

    with mock.patch.object(sync, '_guardar_plan', side_effect=guardar_y_detener):
        sync.sincronizar_semanas(registro, cliente=graph, ahora=EN_W46)

    registro.refresh_from_db()
    assert registro.estado == Sincronizacion.Estado.DETENIDA
    assert Snapshot.objects.count() == 1  # solo el primer plan
    assert not ResultadoSemana.objects.exists()  # no llegó a recalcular


@pytest.mark.django_db
def test_el_latido_va_a_la_base_como_mucho_cada_dos_segundos(equipo):
    from apps.planner import sync

    registro = Sincronizacion.objects.create(tipo=Sincronizacion.Tipo.MANUAL)
    with mock.patch.object(sync.time, 'monotonic', side_effect=[100.0, 101.0, 102.5]):
        sync._latir(registro)  # late
        primero = Sincronizacion.objects.get(pk=registro.pk).latido_at
        sync._latir(registro)  # 1 s después: no va a la base
        assert Sincronizacion.objects.get(pk=registro.pk).latido_at == primero
        sync._latir(registro)  # 2,5 s después: late otra vez
    assert Sincronizacion.objects.get(pk=registro.pk).latido_at > primero
