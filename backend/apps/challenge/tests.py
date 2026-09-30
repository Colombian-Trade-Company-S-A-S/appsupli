"""
Pruebas de Supli Challenge: la rúbrica, el ciclo de vida y el ganador.

Cada prueba apunta a una regla de la sección B del documento de definiciones,
y el número de la regla va en el nombre cuando aplica.
"""
from datetime import date, timedelta
from decimal import Decimal

import pytest
from django.core.management import call_command
from rest_framework.test import APIClient

from apps.accounts.models import Application, Area, Permission, Role, User
from apps.challenge.models import (
    BONUS_DESEMPATE,
    CriterioReto,
    EstadoParticipacion,
    EstadoReto,
    JuradoReto,
    Participacion,
    Reto,
    SolicitudRevision,
    Valoracion,
)
from apps.challenge.puntajes import puntaje_de_niveles, puntaje_final

pytestmark = pytest.mark.django_db

RUTA = '/api/challenge'
CIERRE = (date.today() + timedelta(days=20)).isoformat()


@pytest.fixture
def app_challenge():
    app = Application.objects.create(
        code='supli-challenge',
        name='Supli Challenge',
        base_path='/inicio/challenge',
        order=320,
    )
    for code, name in (
        ('challenge:retos:manage', 'Administrar retos'),
        ('challenge:valoraciones:crear', 'Valorar participaciones'),
    ):
        Permission.objects.create(code=code, name=name, application=app)
    return app


def crear_usuario(email, app=None, permisos=(), area=None, cargo=''):
    usuario = User.objects.create_user(
        email=email,
        username=email.split('@')[0],
        first_name=email.split('@')[0].title(),
        password='clave-de-prueba-123',
        position=cargo,
        area=area,
    )
    if app:
        usuario.applications.add(app)
    if permisos:
        rol = Role.objects.create(code=f'rol-{usuario.pk}', name='rol')
        rol.permissions.set(Permission.objects.filter(code__in=permisos))
        usuario.roles.add(rol)
    return usuario


def cliente_de(usuario) -> APIClient:
    cliente = APIClient()
    cliente.force_authenticate(user=usuario)
    return cliente


@pytest.fixture
def gente(app_challenge):
    """People, tres evaluadores y dos colaboradores.

    Son tres evaluadores porque el jurado se sortea entre ellos: así siempre
    quedan dos más para completar las tres valoraciones que pide la regla B9.
    """
    people = crear_usuario('people@supli.tech', app_challenge, ['challenge:retos:manage'])
    uno = crear_usuario('eval1@supli.tech', app_challenge, ['challenge:valoraciones:crear'])
    dos = crear_usuario('eval2@supli.tech', app_challenge, ['challenge:valoraciones:crear'])
    crear_usuario('eval3@supli.tech', app_challenge, ['challenge:valoraciones:crear'])
    ana = crear_usuario('ana@supli.tech', app_challenge, cargo='Promotor')
    mario = crear_usuario('mario@supli.tech', app_challenge, cargo='Asesor PDV')
    return people, uno, dos, ana, mario


def los_tres_evaluadores(reto_id) -> list[User]:
    """El jurado sorteado del reto más los otros dos evaluadores de Supli."""
    jurado = JuradoReto.objects.get(reto_id=reto_id).usuario
    otros = [
        usuario
        for usuario in User.objects.filter(email__startswith='eval').order_by('email')
        if usuario != jurado
    ]
    return [jurado, *otros[:2]]


def datos_de_reto(**extra) -> dict:
    datos = {
        'titulo': 'Vive el principio: foco en el cliente',
        'descripcion': 'Comparte una acción concreta donde priorizaste al cliente interno.',
        'categoria': 'cultura',
        'cierraEl': CIERRE,
        'formatosEvidencia': ['texto', 'enlace'],
        'visibilidadEvidencia': 'participantes',
    }
    datos.update(extra)
    return datos


def crear_reto(people, **extra) -> dict:
    respuesta = cliente_de(people).post(f'{RUTA}/retos', datos_de_reto(**extra), format='json')
    assert respuesta.status_code == 201, respuesta.data
    return respuesta.json()


def publicar(people, reto_id):
    return cliente_de(people).post(f'{RUTA}/retos/{reto_id}/publicar', {}, format='json')


def participar(usuario, reto_id, texto='Atendí el caso del cliente en el mismo día.'):
    return cliente_de(usuario).post(
        f'{RUTA}/retos/{reto_id}/participaciones',
        {'formato': 'texto', 'entregaTexto': texto},
        format='json',
    )


def valorar(evaluador, participacion_id, niveles, **extra):
    criterios = list(
        CriterioReto.objects.filter(
            reto__participaciones__id=participacion_id
        ).order_by('orden', 'id')
    )
    cuerpo = {
        'puntajes': [
            {'criterio': criterio.pk, 'nivel': nivel}
            for criterio, nivel in zip(criterios, niveles, strict=True)
        ],
        **extra,
    }
    return cliente_de(evaluador).post(
        f'{RUTA}/participaciones/{participacion_id}/valorar', cuerpo, format='json'
    )


# ── La rúbrica (B2) ────────────────────────────────────────────────────────


def test_el_puntaje_es_el_promedio_por_diez():
    """El ejemplo del documento: 8+9+7+8+9 = 41; 41 ÷ 5 = 8,2; × 10 = 82."""
    assert puntaje_de_niveles([8, 9, 7, 8, 9]) == Decimal('82.00')
    assert puntaje_de_niveles([10, 10, 10, 10, 10]) == Decimal('100.00')
    assert puntaje_de_niveles([1, 1, 1, 1, 1]) == Decimal('10.00')


def test_el_puntaje_final_promedia_a_los_tres_evaluadores():
    assert puntaje_final([Decimal('82'), Decimal('90'), Decimal('80')]) == Decimal('84.00')
    # Sin valoraciones no hay puntaje: «sin valorar» no es cero.
    assert puntaje_final([]) is None


def test_un_reto_nuevo_trae_los_cinco_criterios(gente):
    people, *_ = gente
    reto = crear_reto(people)

    criterios = [criterio['nombre'] for criterio in reto['criterios']]
    assert criterios == [
        'Conexión con el principio',
        'Valor generado',
        'Claridad',
        'Evidencia',
        'Aprendizaje',
    ]
    # Los tres del desempate son conexión, valor y evidencia (B4).
    desempate = [c['nombre'] for c in reto['criterios'] if c['desempate']]
    assert desempate == ['Conexión con el principio', 'Valor generado', 'Evidencia']


# ── Ciclo de vida y reglas congeladas (B1, B8) ─────────────────────────────


def test_solo_people_crea_retos(gente):
    _people, _uno, _dos, ana, _mario = gente

    respuesta = cliente_de(ana).post(f'{RUTA}/retos', datos_de_reto(), format='json')

    assert respuesta.status_code == 403


def test_el_borrador_no_le_aparece_a_nadie_mas(gente):
    people, _uno, _dos, ana, _mario = gente
    crear_reto(people)

    assert cliente_de(ana).get(f'{RUTA}/retos').json() == []
    assert len(cliente_de(people).get(f'{RUTA}/retos').json()) == 1


def test_al_publicar_se_congelan_las_reglas_y_el_plazo_solo_se_amplia(gente):
    people, *_ = gente
    reto = crear_reto(people)
    assert publicar(people, reto['id']).status_code == 200
    cliente = cliente_de(people)

    reglas = cliente.patch(
        f'{RUTA}/retos/{reto["id"]}', {'categoria': 'kms'}, format='json'
    )
    assert reglas.status_code == 400
    assert 'reglas quedaron fijas' in str(reglas.data)

    recorte = cliente.patch(
        f'{RUTA}/retos/{reto["id"]}',
        {'cierraEl': (date.today() + timedelta(days=2)).isoformat()},
        format='json',
    )
    assert recorte.status_code == 400
    assert 'solo se amplía' in str(recorte.data)

    ampliacion = cliente.patch(
        f'{RUTA}/retos/{reto["id"]}',
        {'cierraEl': (date.today() + timedelta(days=40)).isoformat(), 'titulo': 'Título corregido'},
        format='json',
    )
    assert ampliacion.status_code == 200, ampliacion.data
    # Todo cambio queda en el historial que ve el colaborador (B1).
    cambios = Reto.objects.get(pk=reto['id']).cambios.all()
    assert cambios.count() == 1
    assert 'el nombre' in cambios.first().descripcion


def test_el_reto_pasa_por_sus_cuatro_estados(gente):
    people, uno, dos, ana, _mario = gente
    reto = crear_reto(people)
    cliente = cliente_de(people)

    publicar(people, reto['id'])
    assert Reto.objects.get(pk=reto['id']).estado == EstadoReto.PUBLICADO

    participacion = participar(ana, reto['id']).json()
    assert cliente.post(f'{RUTA}/retos/{reto["id"]}/cerrar', {}, format='json').status_code == 200

    # Con entregas sin valorar no se finaliza: el ganador saldría incompleto.
    sin_valorar = cliente.post(f'{RUTA}/retos/{reto["id"]}/finalizar', {}, format='json')
    assert sin_valorar.status_code == 400
    assert 'sin valorar' in str(sin_valorar.data)

    for evaluador in los_tres_evaluadores(reto['id']):
        valorar(evaluador, participacion['id'], [8, 8, 8, 8, 8])

    finalizado = cliente.post(f'{RUTA}/retos/{reto["id"]}/finalizar', {}, format='json')
    assert finalizado.status_code == 200, finalizado.data
    assert Reto.objects.get(pk=reto['id']).estado == EstadoReto.FINALIZADO


def test_reabrir_un_reto_cerrado_exige_motivo_y_queda_registrado(gente):
    people, *_ = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    cliente = cliente_de(people)
    cliente.post(f'{RUTA}/retos/{reto["id"]}/cerrar', {}, format='json')

    assert cliente.post(f'{RUTA}/retos/{reto["id"]}/reabrir', {}, format='json').status_code == 400

    reabierto = cliente.post(
        f'{RUTA}/retos/{reto["id"]}/reabrir',
        {'motivo': 'Se amplía el plazo, validado con el Leadership Team.'},
        format='json',
    )
    assert reabierto.status_code == 200
    assert Reto.objects.get(pk=reto['id']).estado == EstadoReto.PUBLICADO
    assert 'Leadership Team' in Reto.objects.get(pk=reto['id']).cambios.first().descripcion


def test_al_publicar_se_sortea_el_jurado_del_reto(gente):
    people, *_ = gente
    reto = crear_reto(people)

    publicar(people, reto['id'])

    jurados = JuradoReto.objects.filter(reto_id=reto['id'])
    assert jurados.count() == 1
    assert jurados.first().usuario != people


# ── Participación y público ────────────────────────────────────────────────


def test_solo_participa_quien_es_del_publico(app_challenge, gente):
    people, _uno, _dos, ana, mario = gente
    tecnologia = Area.objects.create(name='Tecnología')
    ana.area = tecnologia
    ana.save(update_fields=['area'])
    reto = crear_reto(people, alcance='areas', areas=[tecnologia.pk])
    publicar(people, reto['id'])

    assert participar(ana, reto['id']).status_code == 201
    assert participar(mario, reto['id']).status_code == 403
    # Y a quien no es del público, el reto ni le aparece.
    assert cliente_de(mario).get(f'{RUTA}/retos').json() == []


def test_la_evidencia_debe_venir_en_un_formato_permitido(gente):
    people, _uno, _dos, ana, _mario = gente
    reto = crear_reto(people, formatosEvidencia=['enlace'])
    publicar(people, reto['id'])

    texto = cliente_de(ana).post(
        f'{RUTA}/retos/{reto["id"]}/participaciones',
        {'formato': 'texto', 'entregaTexto': 'Lo hice'},
        format='json',
    )
    assert texto.status_code == 400
    assert 'acepta' in str(texto.data)

    enlace = cliente_de(ana).post(
        f'{RUTA}/retos/{reto["id"]}/participaciones',
        {'formato': 'enlace', 'entregaLink': 'https://supli.sharepoint.com/evidencia'},
        format='json',
    )
    assert enlace.status_code == 201, enlace.data


def test_no_se_participa_en_un_reto_cerrado(gente):
    people, _uno, _dos, ana, _mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    cliente_de(people).post(f'{RUTA}/retos/{reto["id"]}/cerrar', {}, format='json')

    assert participar(ana, reto['id']).status_code == 403


def test_la_evidencia_se_esconde_segun_la_visibilidad_del_reto(gente):
    """B6: en «solo líder y People», los demás ven la fila pero no el soporte."""
    people, _uno, _dos, ana, mario = gente
    reto = crear_reto(people, visibilidadEvidencia='lider_people')
    publicar(people, reto['id'])
    participar(ana, reto['id'], texto='Mi evidencia confidencial')

    de_mario = cliente_de(mario).get(f'{RUTA}/retos/{reto["id"]}/participaciones').json()
    de_people = cliente_de(people).get(f'{RUTA}/retos/{reto["id"]}/participaciones').json()
    de_ana = cliente_de(ana).get(f'{RUTA}/retos/{reto["id"]}/participaciones').json()

    assert de_mario[0]['entregaTexto'] == ''
    assert de_people[0]['entregaTexto'] == 'Mi evidencia confidencial'
    # El dueño siempre ve lo suyo.
    assert de_ana[0]['entregaTexto'] == 'Mi evidencia confidencial'


# ── Valoración, descalificación y ganador (B3, B4, B9) ─────────────────────


def test_tres_evaluadores_y_el_puntaje_final_es_su_promedio(gente):
    people, uno, dos, ana, _mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    participacion = participar(ana, reto['id']).json()
    primero, segundo, tercero = los_tres_evaluadores(reto['id'])

    valorar(primero, participacion['id'], [8, 9, 7, 8, 9])  # 82
    guardada = Participacion.objects.get(pk=participacion['id'])
    assert guardada.estado == EstadoParticipacion.ENTREGADA
    valorar(segundo, participacion['id'], [9, 9, 9, 9, 9])  # 90
    ultima = valorar(tercero, participacion['id'], [8, 8, 8, 8, 8])  # 80

    assert ultima.status_code == 200, ultima.data
    guardada = Participacion.objects.get(pk=participacion['id'])
    assert guardada.puntaje_final == Decimal('84.00')
    assert guardada.estado == EstadoParticipacion.VALORADA
    assert Valoracion.objects.filter(participacion=guardada, es_jurado=True).count() == 1


def test_nadie_valora_su_propia_participacion(gente):
    people, uno, _dos, _ana, _mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    propia = participar(uno, reto['id']).json()

    assert valorar(uno, propia['id'], [9, 9, 9, 9, 9]).status_code == 403


def test_hay_que_calificar_todos_los_criterios(gente):
    people, uno, _dos, ana, _mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    participacion = participar(ana, reto['id']).json()
    criterio = CriterioReto.objects.filter(reto_id=reto['id']).first()

    respuesta = cliente_de(uno).post(
        f'{RUTA}/participaciones/{participacion["id"]}/valorar',
        {'puntajes': [{'criterio': criterio.pk, 'nivel': 9}]},
        format='json',
    )

    assert respuesta.status_code == 400
    assert 'todos los criterios' in str(respuesta.data)


def test_marcar_no_cumple_descalifica_con_cero(gente):
    """B9: la evidencia que no corresponde obtiene 0 sin valorar criterios."""
    people, uno, _dos, ana, _mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    participacion = participar(ana, reto['id']).json()

    respuesta = cliente_de(uno).post(
        f'{RUTA}/participaciones/{participacion["id"]}/valorar',
        {'noCumple': True, 'comentario': 'La evidencia no corresponde al reto.'},
        format='json',
    )

    assert respuesta.status_code == 200, respuesta.data
    guardada = Participacion.objects.get(pk=participacion['id'])
    assert guardada.estado == EstadoParticipacion.DESCALIFICADA
    assert guardada.puntaje_final == Decimal('0.00')
    assert 'no corresponde' in guardada.motivo_descalificacion


def test_hay_un_solo_ganador_y_es_el_de_mayor_puntaje(gente):
    people, uno, dos, ana, mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    de_ana = participar(ana, reto['id']).json()
    de_mario = participar(mario, reto['id']).json()

    for evaluador in (uno, dos):
        valorar(evaluador, de_ana['id'], [8, 8, 8, 8, 8])  # 80
        valorar(evaluador, de_mario['id'], [9, 9, 9, 9, 9])  # 90

    ganadores = Participacion.objects.filter(reto_id=reto['id'], es_ganador=True)
    assert ganadores.count() == 1
    assert ganadores.first().participante == mario


def test_el_empate_se_rompe_con_tres_criterios_y_da_bonus(gente):
    """B4: gana quien acumule más en conexión, valor y evidencia, y suma +20."""
    people, uno, _dos, ana, mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    de_ana = participar(ana, reto['id']).json()
    de_mario = participar(mario, reto['id']).json()

    # Los dos promedian 8 (80 puntos), pero reparten distinto los niveles: Ana
    # es más fuerte en conexión, valor y evidencia, que son los del desempate.
    evaluador = los_tres_evaluadores(reto['id'])[0]
    valorar(evaluador, de_ana['id'], [10, 10, 5, 10, 5])
    valorar(evaluador, de_mario['id'], [5, 5, 10, 10, 10])

    ganadora = Participacion.objects.get(pk=de_ana['id'])
    perdedora = Participacion.objects.get(pk=de_mario['id'])
    assert ganadora.puntaje_final == perdedora.puntaje_final == Decimal('80.00')
    assert ganadora.es_ganador is True
    assert perdedora.es_ganador is False
    assert ganadora.bonus == BONUS_DESEMPATE
    assert ganadora.puntaje_con_bonus == Decimal('100.00')


def test_una_descalificada_no_gana_aunque_sea_la_unica(gente):
    people, uno, _dos, ana, _mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    participacion = participar(ana, reto['id']).json()

    cliente_de(uno).post(
        f'{RUTA}/participaciones/{participacion["id"]}/valorar',
        {'noCumple': True, 'comentario': 'No cumple el formato.'},
        format='json',
    )

    assert Participacion.objects.filter(reto_id=reto['id'], es_ganador=True).count() == 0


def test_la_revision_solo_se_pide_con_un_nivel_de_siete_o_menos(gente):
    """B3: del 8 para arriba se considera alta y no se habilita la revisión."""
    people, uno, _dos, ana, mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    alta = participar(ana, reto['id']).json()
    baja = participar(mario, reto['id']).json()
    valorar(uno, alta['id'], [9, 9, 9, 9, 9])
    valorar(uno, baja['id'], [7, 8, 9, 9, 9])

    sin_derecho = cliente_de(ana).post(
        f'{RUTA}/participaciones/{alta["id"]}/revision', {'motivo': 'quiero más'}, format='json'
    )
    assert sin_derecho.status_code == 403

    con_derecho = cliente_de(mario).post(
        f'{RUTA}/participaciones/{baja["id"]}/revision',
        {'motivo': 'La claridad no refleja el detalle que entregué.'},
        format='json',
    )
    assert con_derecho.status_code == 201, con_derecho.data

    # Y People la responde.
    solicitud = SolicitudRevision.objects.get()
    atendida = cliente_de(people).post(
        f'{RUTA}/revisiones/{solicitud.pk}/atender',
        {'respuesta': 'Se revisó con el evaluador y se mantiene el nivel.'},
        format='json',
    )
    assert atendida.status_code == 200
    assert SolicitudRevision.objects.get().estado == 'atendida'


def test_el_colaborador_ve_el_detalle_de_su_valoracion(gente):
    """B3: se muestra criterio, nivel y comentario, no solo el puntaje."""
    people, uno, _dos, ana, _mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    participacion = participar(ana, reto['id']).json()
    valorar(uno, participacion['id'], [8, 9, 7, 8, 9], comentario='Suma un dato de impacto.')

    filas = cliente_de(ana).get(f'{RUTA}/retos/{reto["id"]}/participaciones').json()

    valoracion = filas[0]['valoraciones'][0]
    assert valoracion['comentario'] == 'Suma un dato de impacto.'
    assert [p['nivel'] for p in valoracion['puntajes']] == [8, 9, 7, 8, 9]
    assert valoracion['puntajes'][0]['criterioNombre'] == 'Conexión con el principio'


# ── Vistas de lectura ──────────────────────────────────────────────────────


def test_mis_retos_resume_lo_propio(gente):
    people, uno, dos, ana, _mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    participacion = participar(ana, reto['id']).json()
    for evaluador in (uno, dos):
        valorar(evaluador, participacion['id'], [9, 9, 9, 9, 9])

    datos = cliente_de(ana).get(f'{RUTA}/mis-retos').json()

    assert datos['retos'] == 1
    assert datos['ganados'] == 1
    assert datos['participaciones'][0]['retoTitulo'] == reto['titulo']


def test_el_top_ordena_por_puntos_y_dice_mi_posicion(gente):
    people, uno, dos, ana, mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    de_ana = participar(ana, reto['id']).json()
    de_mario = participar(mario, reto['id']).json()
    for evaluador in (uno, dos):
        valorar(evaluador, de_ana['id'], [7, 7, 7, 7, 7])
        valorar(evaluador, de_mario['id'], [9, 9, 9, 9, 9])
    cliente_de(people).post(f'{RUTA}/retos/{reto["id"]}/cerrar', {}, format='json')

    datos = cliente_de(ana).get(f'{RUTA}/top').json()

    assert [fila['nombre'] for fila in datos['ranking']] == [mario.full_name, ana.full_name]
    assert datos['miPosicion'] == 2


def test_el_resultado_trae_al_ganador_y_el_ranking(gente):
    people, uno, dos, ana, mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    de_ana = participar(ana, reto['id']).json()
    de_mario = participar(mario, reto['id']).json()
    for evaluador in (uno, dos):
        valorar(evaluador, de_ana['id'], [10, 10, 10, 10, 10])
        valorar(evaluador, de_mario['id'], [6, 6, 6, 6, 6])

    datos = cliente_de(ana).get(f'{RUTA}/retos/{reto["id"]}/resultado').json()

    assert datos['ganador']['participanteNombre'] == ana.full_name
    assert datos['huboDesempate'] is False
    assert [fila['total'] for fila in datos['ranking']] == [100.0, 60.0]


def test_sin_el_modulo_no_se_entra():
    intruso = User.objects.create_user(
        email='fuera@supli.tech', username='fuera', first_name='Fuera', password='clave-123456'
    )

    assert cliente_de(intruso).get(f'{RUTA}/retos').status_code == 403


def test_el_seed_deja_el_modulo_con_sus_roles():
    call_command('seed_challenge_app', verbosity=0)

    app = Application.objects.get(code='supli-challenge')
    assert app.permissions.count() == 2
    assert Role.objects.filter(code__startswith='challenge-').count() == 2
