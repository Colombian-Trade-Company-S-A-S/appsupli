"""
La aceptación del objetivo por parte de quien lo recibe.

    · Todo objetivo nuevo nace «por aceptar». El colaborador lo acepta o lo
      rechaza, uno por uno; para rechazarlo tiene que escribir el motivo.
    · Si lo rechaza, su jefe lo corrige y vuelve a quedar por aceptar.
    · Cualquier cambio del jefe —texto, KPI, peso o fuente— lo devuelve a «por
      aceptar»: lo que se aceptó ya no es lo que dice la fila.
    · Quien se define sus propios objetivos (el CEO) no se los acepta a sí
      mismo: nacen aceptados.
    · Se responde mientras el mes no termina; después ya se está midiendo.
    · No bloquea nada: un objetivo sin aceptar se mide igual. Sirve para que el
      acuerdo entre jefe y colaborador quede explícito y con historial.

Cada paso queda en `HistorialObjetivo` con el texto, el KPI y el peso de ese
momento, para ver qué fue lo que se rechazó aunque el jefe ya lo haya cambiado.
"""
from datetime import date

from .models import EstadoAceptacion, HistorialObjetivo
from .periodos import etiqueta_mes, mes_terminado

#: Lo que, si el jefe lo cambia, devuelve el objetivo a «por aceptar».
CAMPOS_DEL_ACUERDO = ('colaborador_id', 'objetivo', 'kpi', 'peso', 'fuente_datos')


def estado_inicial(colaborador, autor) -> str:
    """Con qué estado queda un objetivo que alguien acaba de asignar o de cambiar."""
    if colaborador.pk == autor.pk:
        return EstadoAceptacion.ACEPTADO
    return EstadoAceptacion.PENDIENTE


def foto(objetivo) -> tuple:
    """Lo acordado, para saber si una edición lo cambió."""
    return tuple(getattr(objetivo, campo) for campo in CAMPOS_DEL_ACUERDO)


def paso(objetivo, accion: str, autor, comentario: str = '') -> HistorialObjetivo:
    """Un paso del historial, sin guardar, con el objetivo tal como está ahora."""
    return HistorialObjetivo(
        objetivo=objetivo,
        accion=accion,
        autor=autor,
        comentario=comentario or '',
        texto_objetivo=objetivo.objetivo,
        kpi=objetivo.kpi,
        peso=objetivo.peso,
    )


def registrar(objetivo, accion: str, autor, comentario: str = '') -> HistorialObjetivo:
    registro = paso(objetivo, accion, autor, comentario)
    registro.save()
    return registro


def por_que_no_responde(user, objetivo, hoy: date) -> str:
    """
    Por qué esta persona no puede aceptar ni rechazar el objetivo; vacío si puede.

    El texto es el que ve la persona: dice qué pasa, no solo que está bloqueado.
    """
    if objetivo.colaborador_id != user.pk:
        return 'Solo la persona a la que se le asignó el objetivo lo acepta o lo rechaza.'
    if objetivo.estado_aceptacion is None:
        return (
            'Este objetivo se definió antes de que existiera la aceptación: '
            'no hay nada que responder.'
        )
    if objetivo.estado_aceptacion == EstadoAceptacion.ACEPTADO:
        return 'Ya aceptaste este objetivo.'
    if objetivo.estado_aceptacion == EstadoAceptacion.RECHAZADO:
        return 'Ya lo rechazaste: queda esperando a que tu jefe lo corrija.'
    if mes_terminado(objetivo.periodo, hoy):
        return (
            f'{etiqueta_mes(objetivo.periodo)} ya terminó: '
            'sus objetivos ya no se aceptan ni se rechazan.'
        )
    return ''


def puede_responder(user, objetivo, hoy: date) -> bool:
    return not por_que_no_responde(user, objetivo, hoy)
