"""
Que ningún listado de Supli Challenge haga una consulta por fila (N+1).

Cada prueba mide las consultas de un endpoint con pocos datos, agrega más y
vuelve a medir: si el número crece con las filas, alguna relación se está
pidiendo fila por fila. No se fija un número exacto, solo que no dependa de
cuántas filas haya.
"""
import pytest

from apps.accounts.models import Area, User
from apps.challenge.models import CriterioReto, Participacion
from apps.challenge.tests import (
    RUTA,
    cerrar_y_finalizar,
    cliente_de,
    crear_reto,
    crear_usuario,
    participar,
    publicar,
    valorar,
)
from apps.core.consultas import Medicion, mismo_costo

pytestmark = pytest.mark.django_db

NIVELES = [8, 8, 8, 8, 8]


def _medir(usuario, metodo: str, ruta: str, datos=None, esperado=200) -> Medicion:
    """Las consultas de una petición, con un usuario recién leído (sin cachés de la anterior)."""
    cliente = cliente_de(User.objects.get(pk=usuario.pk))
    with Medicion() as medicion:
        respuesta = getattr(cliente, metodo)(ruta, datos or {}, format='json')
    assert respuesta.status_code == esperado, respuesta.data
    return medicion


def consultas(usuario, ruta: str) -> Medicion:
    return _medir(usuario, 'get', ruta)


def participantes(app, cuantos: int, desde: int = 0) -> list[User]:
    """Colaboradores con área: las respuestas la muestran y no debe pedirse por fila."""
    area, _ = Area.objects.get_or_create(name='Ventas')
    return [crear_usuario(f'p{desde + i}@supli.tech', app, area=area) for i in range(cuantos)]


def test_la_cartelera_no_consulta_por_reto(gente):
    """Con retos para personas puntuales, que es el caso que más pregunta por el público."""
    people, uno, _dos, ana, _mario = gente

    def nuevo_reto():
        reto = crear_reto(people, alcance='personas', personas=[ana.pk])
        publicar(people, reto['id'])

    nuevo_reto()
    pocos_ana, pocos_evaluador = consultas(ana, f'{RUTA}/retos'), consultas(uno, f'{RUTA}/retos')
    for _ in range(4):
        nuevo_reto()

    mismo_costo(pocos_ana, consultas(ana, f'{RUTA}/retos'))
    mismo_costo(pocos_evaluador, consultas(uno, f'{RUTA}/retos'))


@pytest.mark.parametrize('quien', ['evaluador', 'participante'])
def test_las_respuestas_de_un_reto_no_consultan_por_fila(gente, app_challenge, quien):
    people, uno, _dos, ana, _mario = gente
    reto = crear_reto(people)
    publicar(people, reto['id'])
    mirando = uno if quien == 'evaluador' else ana
    participar(ana, reto['id'])

    def entregas(personas):
        for persona in personas:
            entrega = participar(persona, reto['id']).json()
            valorar(uno, entrega['id'], NIVELES)

    entregas(participantes(app_challenge, 1))
    ruta = f'{RUTA}/retos/{reto["id"]}/participaciones'
    pocos = consultas(mirando, ruta)
    entregas(participantes(app_challenge, 4, desde=10))

    mismo_costo(pocos, consultas(mirando, ruta))


def test_el_resultado_publicado_no_consulta_por_fila(gente, app_challenge):
    people, uno, _dos, ana, _mario = gente

    def reto_finalizado(cuantos: int) -> int:
        reto = crear_reto(people)
        publicar(people, reto['id'])
        for persona in participantes(app_challenge, cuantos, desde=cuantos * 100):
            entrega = participar(persona, reto['id']).json()
            valorar(uno, entrega['id'], NIVELES)
        cerrar_y_finalizar(people, reto['id'])
        return reto['id']

    pocos = consultas(ana, f'{RUTA}/retos/{reto_finalizado(1)}/resultado')
    mismo_costo(pocos, consultas(ana, f'{RUTA}/retos/{reto_finalizado(5)}/resultado'))


def test_mi_participacion_y_el_top_no_consultan_por_reto(gente):
    people, uno, _dos, ana, mario = gente

    def reto_con_ana():
        reto = crear_reto(people)
        publicar(people, reto['id'])
        for persona in (ana, mario):
            entrega = participar(persona, reto['id']).json()
            valorar(uno, entrega['id'], NIVELES)
        cerrar_y_finalizar(people, reto['id'])

    reto_con_ana()
    pocos_mios, pocos_top = consultas(ana, f'{RUTA}/mis-retos'), consultas(ana, f'{RUTA}/top')
    for _ in range(4):
        reto_con_ana()

    mismo_costo(pocos_mios, consultas(ana, f'{RUTA}/mis-retos'))
    mismo_costo(pocos_top, consultas(ana, f'{RUTA}/top'))


def test_publicar_no_consulta_por_cada_candidato_a_jurado(gente, app_challenge):
    """El sorteo del jurado mira a todos los usuarios: no puede preguntar uno por uno."""
    people, *_ = gente

    def costo_de_publicar() -> Medicion:
        reto = crear_reto(people)
        return _medir(people, 'post', f'{RUTA}/retos/{reto["id"]}/publicar')

    pocos = costo_de_publicar()
    participantes(app_challenge, 8)

    mismo_costo(pocos, costo_de_publicar())


def test_valorar_y_finalizar_no_consultan_por_cada_entrega(gente, app_challenge):
    people, uno, _dos, _ana, _mario = gente

    def reto_con(cuantos: int, desde: int) -> tuple[int, int]:
        reto = crear_reto(people)
        publicar(people, reto['id'])
        ultima = None
        for persona in participantes(app_challenge, cuantos, desde=desde):
            ultima = participar(persona, reto['id']).json()
        return reto['id'], ultima['id']

    reto_chico, entrega_chica = reto_con(1, 0)
    reto_grande, entrega_grande = reto_con(5, 50)
    ruta = f'{RUTA}/participaciones/{{}}/valorar'
    cuerpo_chico = _niveles_de(entrega_chica)
    cuerpo_grande = _niveles_de(entrega_grande)

    mismo_costo(
        _medir(uno, 'post', ruta.format(entrega_chica), cuerpo_chico),
        _medir(uno, 'post', ruta.format(entrega_grande), cuerpo_grande),
    )

    for reto_id in (reto_chico, reto_grande):
        cliente_de(people).post(f'{RUTA}/retos/{reto_id}/cerrar', {}, format='json')
    # En el grande quedan entregas sin valorar: se valoran para poder finalizar.
    for entrega in Participacion.objects.filter(reto_id=reto_grande, valoraciones__isnull=True):
        valorar(uno, entrega.pk, NIVELES)
    mismo_costo(
        _medir(people, 'post', f'{RUTA}/retos/{reto_chico}/finalizar'),
        _medir(people, 'post', f'{RUTA}/retos/{reto_grande}/finalizar'),
    )


def _niveles_de(participacion_id: int) -> dict:
    criterios = CriterioReto.objects.filter(
        reto__participaciones__id=participacion_id
    ).order_by('orden', 'id')
    return {
        'puntajes': [
            {'criterio': criterio.pk, 'nivel': nivel}
            for criterio, nivel in zip(criterios, NIVELES, strict=True)
        ]
    }
