"""
El informe del ERP de Claro, traído del buzón compartido.

Claro manda el informe por correo; una regla de Exchange lo copia al buzón
`INFORME_CLARO_BUZON`, y la app de Entra de Planner lo lee con permiso de
aplicación restringido por Exchange a ese único buzón. Aquí solo se busca el
correo y se baja el adjunto: lo que se hace con él es la importación de
siempre (`importar_informe_de`), igual que si se hubiera subido a mano.

Lo usan Claro y Tmk Ecommerce Claro: reciben el mismo archivo y cada uno lo
cruza con sus propios productos y puntos de venta.
"""
from __future__ import annotations

import re
import unicodedata
import urllib.parse
from dataclasses import dataclass
from datetime import date, timedelta

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.planner.graph import GraphClient, GraphError

#: Hasta dónde se busca hacia atrás. El informe llega casi todos los días.
DIAS_ATRAS = 45
#: Cuántos correos con adjuntos se revisan, del más reciente al más viejo.
CORREOS_A_REVISAR = 25
TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


class ErrorDeCorreo(Exception):
    """Algo que la persona tiene que saber; el mensaje ya viene listo para mostrar."""


@dataclass
class InformeEnCorreo:
    mensaje: str
    adjunto: str
    nombre: str
    tamano: int
    recibido: str
    asunto: str
    remitente: str
    #: La fecha del nombre del adjunto (`…_20261104.xlsx`), si la trae.
    fecha_archivo: date | None


def _normalizar(texto: str) -> str:
    sin_tildes = unicodedata.normalize('NFD', texto or '')
    return ''.join(c for c in sin_tildes if unicodedata.category(c) != 'Mn').lower().strip()


def es_el_informe(nombre: str) -> bool:
    nombre = _normalizar(nombre)
    return nombre.startswith(_normalizar(settings.INFORME_CLARO_ADJUNTO)) and nombre.endswith(
        '.xlsx'
    )


def fecha_del_nombre(nombre: str) -> date | None:
    """`Informe …_20261104.xlsx` → 4 de noviembre de 2026."""
    partes = re.search(r'(\d{4})(\d{2})(\d{2})\.xlsx$', (nombre or '').strip(), re.IGNORECASE)
    if not partes:
        return None
    try:
        return date(int(partes[1]), int(partes[2]), int(partes[3]))
    except ValueError:
        return None


def _ruta_buzon() -> str:
    return f'/users/{urllib.parse.quote(settings.INFORME_CLARO_BUZON)}'


def _traducir(error: GraphError) -> ErrorDeCorreo:
    if error.status in (401, 403):
        return ErrorDeCorreo(
            f'Microsoft no dejó leer el buzón {settings.INFORME_CLARO_BUZON}. '
            'Hay que revisar con TI el permiso de la app sobre ese buzón.'
        )
    if error.status == 404:
        return ErrorDeCorreo(f'El buzón {settings.INFORME_CLARO_BUZON} no existe en Microsoft 365.')
    return ErrorDeCorreo(f'No se pudo leer el correo: {error}')


def buscar_informe(cliente: GraphClient | None = None) -> InformeEnCorreo:
    """El informe más reciente del buzón: el primer adjunto que se llame como el informe."""
    cliente = cliente or GraphClient()
    remitente = settings.INFORME_CLARO_REMITENTE.strip().lower()
    desde = (timezone.now() - timedelta(days=DIAS_ATRAS)).strftime('%Y-%m-%dT%H:%M:%SZ')
    # Graph exige que lo que va en $orderby aparezca primero en el $filter.
    parametros = urllib.parse.urlencode(
        {
            '$filter': f'receivedDateTime ge {desde} and hasAttachments eq true',
            '$orderby': 'receivedDateTime desc',
            '$top': str(CORREOS_A_REVISAR),
            '$select': 'id,subject,receivedDateTime,from',
        }
    )
    try:
        respuesta = cliente._pedir('GET', f'{_ruta_buzon()}/messages?{parametros}')
        if not respuesta.ok:
            raise GraphError(respuesta.error, respuesta.status)
        correos = respuesta.cuerpo.get('value', [])
        del_remitente = 0
        for correo in correos:
            de = (correo.get('from') or {}).get('emailAddress', {}).get('address', '').lower()
            if remitente and de != remitente:
                continue
            del_remitente += 1
            adjuntos = cliente.get(
                f'{_ruta_buzon()}/messages/{urllib.parse.quote(correo["id"])}'
                '/attachments?$select=id,name,size'
            )
            if not adjuntos.ok:
                raise GraphError(adjuntos.error, adjuntos.status)
            for adjunto in adjuntos.cuerpo.get('value', []):
                if es_el_informe(adjunto.get('name', '')):
                    return InformeEnCorreo(
                        mensaje=correo['id'],
                        adjunto=adjunto['id'],
                        nombre=adjunto['name'],
                        tamano=adjunto.get('size') or 0,
                        recibido=correo.get('receivedDateTime', ''),
                        asunto=correo.get('subject') or '',
                        remitente=de,
                        fecha_archivo=fecha_del_nombre(adjunto['name']),
                    )
    except GraphError as error:
        raise _traducir(error) from error

    quien = settings.INFORME_CLARO_REMITENTE or 'nadie'
    if del_remitente:
        raise ErrorDeCorreo(
            f'Hay correos de {quien} en el buzón, pero ninguno trae el adjunto '
            f'«{settings.INFORME_CLARO_ADJUNTO}…xlsx».'
        )
    raise ErrorDeCorreo(
        f'No hay correos de {quien} con adjuntos en el buzón {settings.INFORME_CLARO_BUZON} '
        f'en los últimos {DIAS_ATRAS} días.'
    )


def descargar_informe(
    mensaje: str, adjunto: str, cliente: GraphClient | None = None
) -> SimpleUploadedFile:
    """
    Baja el adjunto y lo devuelve como un archivo subido, listo para importar.

    Vuelve a mirar el nombre: solo se baja algo que se llame como el informe,
    aunque quien pida mande otro identificador.
    """
    cliente = cliente or GraphClient()
    base = (
        f'{_ruta_buzon()}/messages/{urllib.parse.quote(mensaje)}'
        f'/attachments/{urllib.parse.quote(adjunto)}'
    )
    try:
        datos = cliente._pedir('GET', f'{base}?$select=id,name,size')
        if not datos.ok:
            raise GraphError(datos.error, datos.status)
        nombre = datos.cuerpo.get('name', '')
        if not es_el_informe(nombre):
            raise ErrorDeCorreo('Ese adjunto no es el informe del ERP.')
        contenido = cliente.descargar(f'{base}/$value')
    except GraphError as error:
        raise _traducir(error) from error
    return SimpleUploadedFile(nombre, contenido, content_type=TIPO_XLSX)
