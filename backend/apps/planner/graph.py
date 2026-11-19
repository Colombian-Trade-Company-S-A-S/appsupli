"""
Cliente de Microsoft Graph para Planner: solo lectura.

La app de Entra `appsupli-planner-sync` tiene permisos de aplicación
`Tasks.Read.All` y `Group.Read.All`. Aquí solo hay GET: la garantía de «solo
leer» es este archivo, igual que con Odoo. El secreto vive en las variables
`PLANNER_*` y nunca se registra en la bitácora ni en los errores.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass

from django.conf import settings

GRAPH = 'https://graph.microsoft.com/v1.0'
LOTE_MAXIMO = 20  # Graph acepta hasta 20 pedidos por $batch
REINTENTOS = 4


class GraphError(Exception):
    """Graph no respondió, no autenticó o rechazó la consulta."""

    def __init__(self, mensaje: str, status: int | None = None):
        super().__init__(mensaje)
        self.status = status


@dataclass
class Respuesta:
    status: int
    cuerpo: dict

    @property
    def ok(self) -> bool:
        return 200 <= self.status < 300

    @property
    def error(self) -> str:
        err = self.cuerpo.get('error') or {}
        return f"{err.get('code', self.status)}: {str(err.get('message', ''))[:200]}"


class GraphClient:
    def __init__(self, tenant=None, cliente=None, secreto=None, timeout=None):
        self.tenant = tenant or settings.PLANNER_TENANT_ID
        self.cliente = cliente or settings.PLANNER_CLIENT_ID
        self.secreto = secreto or settings.PLANNER_CLIENT_SECRET
        self.timeout = timeout or settings.PLANNER_TIMEOUT
        self._token: str | None = None
        self._vence = 0.0

    @property
    def configurado(self) -> bool:
        return bool(self.tenant and self.cliente and self.secreto)

    # ── Autenticación ──────────────────────────────────────────────────────

    def token(self) -> str:
        if self._token and time.time() < self._vence - 60:
            return self._token
        if not self.configurado:
            raise GraphError('Faltan las variables PLANNER_TENANT_ID, PLANNER_CLIENT_ID o PLANNER_CLIENT_SECRET.')
        datos = urllib.parse.urlencode({
            'client_id': self.cliente,
            'client_secret': self.secreto,
            'scope': 'https://graph.microsoft.com/.default',
            'grant_type': 'client_credentials',
        }).encode()
        url = f'https://login.microsoftonline.com/{self.tenant}/oauth2/v2.0/token'
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=datos), timeout=self.timeout) as r:
                cuerpo = json.load(r)
        except urllib.error.HTTPError as e:
            cuerpo = _json(e.read())
            # La descripción de Entra no trae el secreto; solo el código y el motivo.
            raise GraphError(
                f"Microsoft rechazó la autenticación: {cuerpo.get('error')} "
                f"{str(cuerpo.get('error_description', ''))[:160]}",
                e.code,
            ) from None
        except (urllib.error.URLError, TimeoutError) as e:
            raise GraphError(f'No se pudo conectar con Microsoft: {e}') from None
        self._token = cuerpo['access_token']
        self._vence = time.time() + int(cuerpo.get('expires_in', 3600))
        return self._token

    # ── Lectura ────────────────────────────────────────────────────────────

    def _pedir(self, metodo: str, url: str, cuerpo: dict | None = None) -> Respuesta:
        url = url if url.startswith('http') else GRAPH + url
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        for intento in range(REINTENTOS + 1):
            req = urllib.request.Request(url, data=datos, method=metodo, headers={
                'Authorization': f'Bearer {self.token()}',
                'Content-Type': 'application/json',
            })
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return Respuesta(r.status, _json(r.read()))
            except urllib.error.HTTPError as e:
                if e.code in (429, 503, 504) and intento < REINTENTOS:
                    time.sleep(_espera(e.headers.get('Retry-After'), intento))
                    continue
                return Respuesta(e.code, _json(e.read()))
            except (urllib.error.URLError, TimeoutError) as e:
                if intento < REINTENTOS:
                    time.sleep(_espera(None, intento))
                    continue
                raise GraphError(f'No se pudo conectar con Microsoft Graph: {e}') from None
        raise GraphError('Microsoft Graph no respondió después de varios intentos.')

    def descargar(self, ruta: str) -> bytes:
        """Un GET que devuelve el contenido tal cual (un adjunto, por ejemplo)."""
        url = ruta if ruta.startswith('http') else GRAPH + ruta
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {self.token()}'})
        try:
            with urllib.request.urlopen(req, timeout=max(self.timeout, 60)) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            raise GraphError(Respuesta(e.code, _json(e.read())).error, e.code) from None
        except (urllib.error.URLError, TimeoutError) as e:
            raise GraphError(f'No se pudo conectar con Microsoft Graph: {e}') from None

    def get(self, ruta: str) -> Respuesta:
        """Un GET. Si la respuesta trae `value`, sigue las páginas hasta el final."""
        respuesta = self._pedir('GET', ruta)
        return self._todas_las_paginas(respuesta)

    def _todas_las_paginas(self, respuesta: Respuesta) -> Respuesta:
        if not respuesta.ok or 'value' not in respuesta.cuerpo:
            return respuesta
        items = list(respuesta.cuerpo['value'])
        siguiente = respuesta.cuerpo.get('@odata.nextLink')
        while siguiente:
            pagina = self._pedir('GET', siguiente)
            if not pagina.ok:
                return pagina
            items += pagina.cuerpo.get('value', [])
            siguiente = pagina.cuerpo.get('@odata.nextLink')
        return Respuesta(respuesta.status, {**respuesta.cuerpo, 'value': items})

    def lote(self, rutas: list[str]) -> list[Respuesta]:
        """
        Varios GET en pocas llamadas ($batch de a 20), en el mismo orden pedido.

        Con decenas de planes, pedir uno por uno no cabe en el tiempo de una
        petición web; en lotes, sí. Las páginas siguientes de cada respuesta se
        piden aparte.
        """
        respuestas: list[Respuesta] = []
        for inicio in range(0, len(rutas), LOTE_MAXIMO):
            grupo = rutas[inicio:inicio + LOTE_MAXIMO]
            pedido = {'requests': [
                {'id': str(i), 'method': 'GET', 'url': ruta} for i, ruta in enumerate(grupo)
            ]}
            resultado = self._pedir('POST', '/$batch', pedido)
            if not resultado.ok:
                raise GraphError(f'El lote de Graph falló: {resultado.error}', resultado.status)
            por_id = {r['id']: r for r in resultado.cuerpo.get('responses', [])}
            pendientes = []
            for i, ruta in enumerate(grupo):
                r = por_id.get(str(i), {'status': 500, 'body': {}})
                if r['status'] == 429:
                    pendientes.append(i)
                respuestas.append(Respuesta(r['status'], r.get('body') or {}))
            # Lo que Graph limitó dentro del lote se reintenta uno por uno.
            for i in pendientes:
                respuestas[inicio + i] = self._pedir('GET', grupo[i])
        return [self._todas_las_paginas(r) for r in respuestas]

    # ── Consultas de Planner ───────────────────────────────────────────────

    def grupos(self) -> list[dict]:
        r = self.get(
            "/groups?$filter=groupTypes/any(c:c+eq+'Unified')&$select=id,displayName&$top=999"
        )
        if not r.ok:
            raise GraphError(f'No se pudieron listar los grupos: {r.error}', r.status)
        return r.cuerpo['value']

    def estado(self) -> dict:
        """Prueba la conexión: autentica y pide los grupos (solo cuántos hay)."""
        if not self.configurado:
            return {'configurado': False, 'conectado': False, 'mensaje': 'Faltan las variables PLANNER_*.'}
        try:
            cantidad = len(self.grupos())
        except GraphError as e:
            return {'configurado': True, 'conectado': False, 'mensaje': str(e)}
        return {'configurado': True, 'conectado': True, 'mensaje': f'Conectado: {cantidad} grupos de Microsoft 365.'}


CAMPOS_TAREA = (
    'id,title,bucketId,appliedCategories,percentComplete,createdDateTime,completedDateTime,'
    'checklistItemCount,activeChecklistItemCount'
)


def rutas_de_plan(plan_id: str) -> list[str]:
    """
    Lo que se lee de cada plan: depósitos, etiquetas, tareas (con el conteo de
    checklist) y el plan mismo (su nombre y su grupo).
    """
    return [
        f'/planner/plans/{plan_id}/buckets',
        f'/planner/plans/{plan_id}/details',
        f'/planner/plans/{plan_id}/tasks?$select={CAMPOS_TAREA}',
        f'/planner/plans/{plan_id}',
    ]


def _json(contenido: bytes) -> dict:
    try:
        return json.loads(contenido or b'{}')
    except ValueError:
        return {}


def _espera(retry_after: str | None, intento: int) -> float:
    try:
        return min(float(retry_after), 30.0)
    except (TypeError, ValueError):
        return min(2 ** intento, 16)
