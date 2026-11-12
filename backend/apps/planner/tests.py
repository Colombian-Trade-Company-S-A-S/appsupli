"""
Pruebas de Ejecución Planner: calendario, fórmulas, sincronización y API.

Graph se reemplaza por un cliente falso: las pruebas nunca salen a internet.
"""
from datetime import date, datetime
from decimal import Decimal
from unittest import mock

import pytest
from rest_framework.test import APIClient

from apps.accounts.models import Application, Permission, Role, User
from apps.planner import semanas as sem
from apps.planner.calculo import indice, porcentaje
from apps.planner.graph import Respuesta
from apps.planner.inventario import persona_del_titulo
from apps.planner.models import (
    EstadoHito,
    IncidenciaCalidad,
    Parametros,
    PlanPlanner,
    ResultadoSemana,
    Snapshot,
    ValidacionHito,
)
from apps.planner.semanas import COT, Semana, semana_de_deposito, semanas_del_mes
from apps.planner.sync import sincronizar

RUTA = '/api/performance/planner'
W46 = Semana(2026, 46)


# ── Calendario ────────────────────────────────────────────────────────────


def test_festivos_de_noviembre_2026():
    assert sem.es_festivo(date(2026, 11, 2))   # Todos los Santos, trasladado
    assert sem.es_festivo(date(2026, 11, 16))  # Independencia de Cartagena, trasladado
    assert not sem.es_festivo(date(2026, 11, 9))


def test_linea_base_pasa_al_martes_si_el_lunes_es_festivo():
    assert Semana(2026, 45).dia_linea_base == date(2026, 11, 3)
    assert Semana(2026, 46).dia_linea_base == date(2026, 11, 9)
    assert Semana(2026, 47).dia_linea_base == date(2026, 11, 17)
    assert Semana(2026, 46).linea_base == datetime(2026, 11, 9, 18, 0, tzinfo=COT)
    assert Semana(2026, 47).cierre == datetime(2026, 11, 22, 23, 59, tzinfo=COT)


def test_ventana_de_hitos_es_la_semana_siguiente_y_se_corre_con_festivo():
    assert Semana(2026, 45).ventana_hitos == (date(2026, 11, 9), date(2026, 11, 11))
    # El lunes 16 es festivo: la ventana de la WEEK 46 va del martes 17 al jueves 19.
    assert Semana(2026, 46).ventana_hitos == (date(2026, 11, 17), date(2026, 11, 19))
    # La de la WEEK 47 cae en la semana de salida (23 al 25).
    assert Semana(2026, 47).ventana_hitos == (date(2026, 11, 23), date(2026, 11, 25))


@pytest.mark.parametrize('nombre, esperado', [
    ('WEEK 45', 45), ('W45', 45), ('W 45', 45), ('Week 45', 45), ('45', 45), (' week 7 ', 7),
    ('NOVIEMBRE 2026', None), ('2026', None), ('WEEK 60', None), ('', None),
])
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
    """5 de 6 WEEKLY, 7 de 10 ítems y Hito cumplido dan 81,3."""
    p = Parametros.vigentes()
    valor = indice(porcentaje(5, 6), porcentaje(7, 10), Decimal('100'), p)
    assert round(valor, 1) == Decimal('81.3')


@pytest.mark.django_db
def test_componente_sin_dato_cuenta_cero_y_el_indice_se_topa_en_100():
    p = Parametros.vigentes()
    assert indice(None, Decimal('100'), Decimal('100'), p) == Decimal('60')
    p.peso_weekly, p.peso_daily, p.peso_hito = Decimal('60'), Decimal('60'), Decimal('0')
    assert indice(Decimal('100'), Decimal('100'), Decimal('0'), p) == Decimal('100')


def test_persona_del_titulo():
    laura = User(id=1, first_name='Laura Catalina', last_name='Ayala Parra')
    laura2 = User(id=2, first_name='Laura', last_name='Gómez')
    alejo = User(id=3, first_name='Alejandro', last_name='Vera Valbuena')
    alejo2 = User(id=4, first_name='Alejandro', last_name='Ruiz')
    personas = [laura, laura2, alejo, alejo2]
    assert persona_del_titulo('Laura Ayala-2026', personas) == (laura, 'Exacta')
    assert persona_del_titulo('Copia de Vera Valbuena Alejandro -2026', personas)[0] == alejo
    assert persona_del_titulo('Alejandro', personas) == (None, 'Solo un nombre')
    assert persona_del_titulo('Tech', personas)[0] is None


# ── Sincronización con un Graph falso ─────────────────────────────────────


class GraphFalso:
    """Responde como Graph a partir de un diccionario {plan_id: (buckets, etiquetas, tareas)}."""

    def __init__(self, planes):
        self.planes = planes

    def lote(self, rutas):
        salida = []
        for ruta in rutas:
            plan_id = ruta.split('/')[3]
            if plan_id not in self.planes:
                salida.append(Respuesta(403, {'error': {'code': 'Forbidden', 'message': 'No'}}))
                continue
            buckets, etiquetas, tareas = self.planes[plan_id]
            if ruta.endswith('/buckets'):
                salida.append(Respuesta(200, {'value': buckets}))
            elif ruta.endswith('/details'):
                salida.append(Respuesta(200, {'categoryDescriptions': etiquetas}))
            else:
                salida.append(Respuesta(200, {'value': tareas}))
        return salida


ETIQUETAS = {'category1': 'WEEKLY', 'category2': 'DAILY', 'category3': 'HITO', 'category4': 'MONTH'}
BUCKETS = [{'id': 'b45', 'name': 'WEEK 45'}, {'id': 'b46', 'name': 'W46'}, {'id': 'bmes', 'name': 'NOVIEMBRE 2026'}]


def tarea(id, bucket, *cats, hecha=False, items=0, activos=0, titulo=None):
    return {
        'id': id, 'title': titulo or id, 'bucketId': bucket,
        'appliedCategories': {c: True for c in cats},
        'percentComplete': 100 if hecha else 0,
        'checklistItemCount': items, 'activeChecklistItemCount': activos,
        'createdDateTime': '2026-11-09T14:00:00Z',
    }


def crear_usuario(email, jefe=None, cargo='Analista', app=None):
    u = User.objects.create_user(email=email, username=email.split('@')[0],
                                 first_name=email.split('@')[0].title(), password='clave-de-prueba-123',
                                 position=cargo)
    if jefe:
        u.manager = jefe
        u.save(update_fields=['manager'])
    if app:
        u.applications.add(app)
    return u


@pytest.fixture
def app_planner():
    contenedor = Application.objects.create(code='supli-performance', name='Supli Performance',
                                            base_path='/inicio/performance', order=300)
    app = Application.objects.create(code='ejecucion-planner', name='Ejecución Planner',
                                     base_path='/inicio/performance/planner', order=15, parent=contenedor)
    for code in ('planner:gestionar', 'planner:ver_todo'):
        Permission.objects.create(code=code, name=code, application=app)
    return app


@pytest.fixture
def equipo(app_planner):
    lider = crear_usuario('laura@supli.tech', cargo='Tech Manager', app=app_planner)
    julian = crear_usuario('julian@supli.tech', jefe=lider, cargo='BI Analyst', app=app_planner)
    daniel = crear_usuario('daniel@supli.tech', jefe=lider, cargo='BI Manager', app=app_planner)
    people = crear_usuario('johana@supli.tech', cargo='People Manager', app=app_planner)
    rol = Role.objects.create(code='performance-people', name='People')
    rol.permissions.set(Permission.objects.filter(code__in=['planner:gestionar', 'planner:ver_todo']))
    people.roles.add(rol)
    PlanPlanner.objects.create(plan_id='p-julian', titulo='Julián Herreño-2026', colaborador=julian)
    return lider, julian, daniel, people


EN_W46 = datetime(2026, 11, 10, 12, 0, tzinfo=COT)


@pytest.mark.django_db
def test_sync_calcula_weekly_contra_la_linea_base(equipo):
    lider, julian, daniel, people = equipo
    base = [
        tarea('w1', 'b46', 'category1'), tarea('w2', 'b46', 'category1'), tarea('w3', 'b46', 'category1'),
        tarea('d1', 'b46', 'category2', items=10, activos=10),
        tarea('h1', 'b46', 'category3', titulo='Publicar el dashboard'),
        tarea('vieja', 'b45', 'category1', hecha=True),
    ]
    sincronizar('linea_base', semana=W46, cliente=GraphFalso({'p-julian': (BUCKETS, ETIQUETAS, base)}), ahora=EN_W46)

    # Durante la semana: w1 y w2 hechas, w3 se movió a otro depósito y se hizo,
    # y se agregó w4 (no cuenta). La checklist tiene 7 de 10 marcados.
    despues = [
        tarea('w1', 'b46', 'category1', hecha=True), tarea('w2', 'b46', 'category1', hecha=True),
        tarea('w3', 'bmes', 'category1', hecha=True), tarea('w4', 'b46', 'category1', hecha=True),
        tarea('d1', 'b46', 'category2', items=10, activos=3),
        tarea('h1', 'b46', 'category3', titulo='Publicar el dashboard'),
    ]
    sincronizar('diaria', semana=W46, cliente=GraphFalso({'p-julian': (BUCKETS, ETIQUETAS, despues)}), ahora=EN_W46)

    r = ResultadoSemana.objects.get(colaborador=julian, anio=2026, semana=46)
    assert (r.weekly_base, r.weekly_completadas) == (3, 3)
    assert r.pct_weekly == Decimal('100.00')
    assert (r.daily_marcados, r.daily_items) == (7, 10)
    assert r.hito == 0  # pendiente: todavía no se valida
    assert r.indice == Decimal('68.00')  # 0,4·100 + 0,4·70 + 0,2·0
    assert not r.base_aproximada and not r.final
    hito = ValidacionHito.objects.get(colaborador=julian, anio=2026, semana=46)
    assert hito.estado == EstadoHito.PENDIENTE and hito.texto == 'Publicar el dashboard'
    # El depósito «W46» se lee igual, pero queda la alerta de formato.
    assert IncidenciaCalidad.objects.filter(tipo='deposito_no_estandar', abierta=True).exists()
    # Daniel tiene el sub-módulo y no tiene plan: incidencia crítica.
    assert IncidenciaCalidad.objects.filter(tipo='sin_plan', colaborador=daniel, abierta=True).exists()


@pytest.mark.django_db
def test_linea_base_no_se_reemplaza_sin_forzar(equipo):
    _, julian, _, _ = equipo
    uno = [tarea('w1', 'b46', 'category1')]
    dos = [tarea('w1', 'b46', 'category1'), tarea('w2', 'b46', 'category1')]
    sincronizar('linea_base', semana=W46, cliente=GraphFalso({'p-julian': (BUCKETS, ETIQUETAS, uno)}), ahora=EN_W46)
    registro = sincronizar('linea_base', semana=W46, cliente=GraphFalso({'p-julian': (BUCKETS, ETIQUETAS, dos)}),
                           ahora=EN_W46)
    assert registro.resumen['omitidas'] == 1
    foto = Snapshot.objects.get(plan__colaborador=julian, tipo='linea_base')
    assert foto.tareas.count() == 1


@pytest.mark.django_db
def test_sin_linea_base_se_usa_la_lectura_y_se_avisa(equipo):
    _, julian, _, _ = equipo
    tareas = [tarea('w1', 'b46', 'category1', hecha=True), tarea('w2', 'b46', 'category1')]
    sincronizar('diaria', semana=W46, cliente=GraphFalso({'p-julian': (BUCKETS, ETIQUETAS, tareas)}), ahora=EN_W46)
    r = ResultadoSemana.objects.get(colaborador=julian)
    assert r.base_aproximada and r.pct_weekly == Decimal('50.00')
    # Sin tarea HITO ni DAILY: Sin registrar (0) y Daily en 0.
    assert ValidacionHito.objects.get(colaborador=julian).estado == EstadoHito.SIN_REGISTRAR


@pytest.mark.django_db
def test_plan_inaccesible_queda_marcado(equipo):
    _, julian, _, _ = equipo
    registro = sincronizar('diaria', semana=W46, cliente=GraphFalso({}), ahora=EN_W46)
    assert registro.estado == 'error'
    plan = PlanPlanner.objects.get(colaborador=julian)
    assert not plan.accesible
    assert IncidenciaCalidad.objects.filter(tipo='plan_inaccesible', abierta=True).exists()


# ── API ───────────────────────────────────────────────────────────────────


def cliente(usuario):
    c = APIClient()
    c.force_authenticate(user=usuario)
    return c


def _en(fecha):
    """Congela el «hoy» del calendario de la medición."""
    return mock.patch.object(sem, '_local', lambda ahora=None: ahora.astimezone(COT) if ahora else fecha)


@pytest.fixture
def semana_con_hito(equipo):
    _, julian, _, _ = equipo
    tareas = [tarea('w1', 'b46', 'category1', hecha=True), tarea('h1', 'b46', 'category3', titulo='Cerrar NDA')]
    sincronizar('linea_base', semana=W46, cliente=GraphFalso({'p-julian': (BUCKETS, ETIQUETAS, tareas)}),
                ahora=EN_W46)
    return ValidacionHito.objects.get(colaborador=julian, anio=2026, semana=46)


@pytest.mark.django_db
def test_lider_valida_el_hito_de_su_equipo_dentro_de_la_ventana(equipo, semana_con_hito):
    lider, julian, _, _ = equipo
    with _en(datetime(2026, 11, 18, 10, 0, tzinfo=COT)):  # miércoles 18: ventana 17–19
        r = cliente(lider).post(f'{RUTA}/hitos/{semana_con_hito.id}/validar', {'estado': 'cumplido'}, format='json')
    assert r.status_code == 200, r.data
    resultado = ResultadoSemana.objects.get(colaborador=julian, semana=46)
    assert resultado.hito == Decimal('100.00')


@pytest.mark.django_db
def test_lider_no_valida_fuera_de_la_ventana_pero_people_si(equipo, semana_con_hito):
    lider, _, _, people = equipo
    with _en(datetime(2026, 11, 21, 10, 0, tzinfo=COT)):  # sábado 21: ventana cerrada
        r = cliente(lider).post(f'{RUTA}/hitos/{semana_con_hito.id}/validar', {'estado': 'cumplido'}, format='json')
        assert r.status_code == 400
        r = cliente(people).post(f'{RUTA}/hitos/{semana_con_hito.id}/validar', {'estado': 'no_cumplido'},
                                 format='json')
        assert r.status_code == 200


@pytest.mark.django_db
def test_nadie_mas_valida_el_hito(equipo, semana_con_hito):
    _, julian, daniel, _ = equipo
    with _en(datetime(2026, 11, 18, 10, 0, tzinfo=COT)):
        for quien in (julian, daniel):
            r = cliente(quien).post(f'{RUTA}/hitos/{semana_con_hito.id}/validar', {'estado': 'cumplido'},
                                    format='json')
            assert r.status_code == 403


@pytest.mark.django_db
def test_dashboard_del_lider_es_su_equipo_directo_y_people_ve_la_organizacion(equipo, semana_con_hito):
    lider, julian, _, people = equipo
    r = cliente(lider).get(f'{RUTA}/dashboard', {'semana': W46.codigo})
    assert r.status_code == 200
    assert r.data['alcance'] == 'equipo'
    assert [f['nombre'] for f in r.data['filas']] == ['Julian']
    r = cliente(people).get(f'{RUTA}/dashboard', {'semana': W46.codigo})
    assert r.data['alcance'] == 'compania' and r.data['nivel'] == 'org'
    # El colaborador no puede ver el detalle de un compañero.
    assert cliente(julian).get(f'{RUTA}/personas/{lider.id}').status_code == 403


@pytest.mark.django_db
def test_mi_cumplimiento(equipo, semana_con_hito):
    _, julian, _, _ = equipo
    r = cliente(julian).get(f'{RUTA}/mi-cumplimiento', {'semana': W46.codigo})
    assert r.status_code == 200
    assert r.data['actual']['pct_weekly'] == 100.0
    assert len(r.data['historia']) == 8


@pytest.mark.django_db
def test_parametros_validan_suma_y_cortes(equipo):
    _, julian, _, people = equipo
    datos = {'peso_weekly': 50, 'peso_daily': 30, 'peso_hito': 10, 'verde_desde': 80, 'ambar_desde': 60}
    assert cliente(julian).post(f'{RUTA}/parametros', datos, format='json').status_code == 403
    assert cliente(people).post(f'{RUTA}/parametros', datos, format='json').status_code == 400
    datos['peso_hito'] = 20
    r = cliente(people).post(f'{RUTA}/parametros', datos, format='json')
    assert r.status_code == 201
    assert Parametros.vigentes().peso_weekly == Decimal('50')


@pytest.mark.django_db
def test_gestion_solo_para_people(equipo):
    lider, _, _, people = equipo
    assert cliente(lider).get(f'{RUTA}/conexion').status_code == 403
    assert cliente(people).get(f'{RUTA}/conexion').status_code == 200
    r = cliente(people).get(f'{RUTA}/planes')
    assert r.status_code == 200
    assert {p['nombre'] for p in r.data['sin_plan']} >= {'Daniel', 'Laura'}


@pytest.mark.django_db
def test_una_persona_no_puede_tener_dos_planes_activos(equipo):
    _, julian, _, people = equipo
    otro = PlanPlanner.objects.create(plan_id='p-otro', titulo='Julián 2025')
    r = cliente(people).patch(f'{RUTA}/planes/{otro.id}', {'colaborador': julian.id}, format='json')
    assert r.status_code == 400
