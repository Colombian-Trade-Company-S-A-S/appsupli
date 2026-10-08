"""
Cliente de Odoo: solo lectura, por XML-RPC estándar.

No hay ningún método que escriba en Odoo. La cuenta de integración podría
hacerlo —Odoo da permisos por modelo, no por campo—, así que la garantía de
«solo leer» es este archivo: lo único que se llama es `search_read`.
"""
import time
import xmlrpc.client
from dataclasses import dataclass

from django.conf import settings

CAMPOS_EMPLEADO = [
    'id', 'name', 'active', 'work_email', 'identification_id', 'job_id', 'job_title',
    'department_id', 'parent_id', 'company_id', 'work_location_id', 'write_date',
]
CAMPOS_DEPARTAMENTO = ['id', 'name', 'parent_id', 'active']


class OdooError(Exception):
    """Odoo no respondió, no autenticó o rechazó la consulta."""


class _ConTiempoLimite:
    """Sin tiempo límite, un Odoo colgado deja colgada la petición de appsupli."""

    def __init__(self, timeout: float):
        super().__init__()
        self.timeout = timeout

    def make_connection(self, host):
        conexion = super().make_connection(host)
        conexion.timeout = self.timeout
        return conexion


class _Transporte(_ConTiempoLimite, xmlrpc.client.SafeTransport):
    pass


class _TransporteHttp(_ConTiempoLimite, xmlrpc.client.Transport):
    pass


@dataclass
class EstadoOdoo:
    configurado: bool
    conectado: bool
    url: str
    base: str
    usuario: str
    version: str = ''
    latencia_ms: int | None = None
    empleados_activos: int | None = None
    mensaje: str = ''


class OdooClient:
    def __init__(self, url=None, base=None, usuario=None, secreto=None, timeout=None):
        self.url = (url if url is not None else settings.ODOO_URL).rstrip('/')
        self.base = base if base is not None else settings.ODOO_DB
        self.usuario = usuario if usuario is not None else settings.ODOO_USER
        self._secreto = secreto if secreto is not None else settings.ODOO_SECRET
        self._timeout = timeout or settings.ODOO_TIMEOUT
        self._uid = None

    @property
    def configurado(self) -> bool:
        return all((self.url, self.base, self.usuario, self._secreto))

    def _proxy(self, ruta: str):
        transporte = (_Transporte if self.url.startswith('https') else _TransporteHttp)(self._timeout)
        return xmlrpc.client.ServerProxy(f'{self.url}{ruta}', transport=transporte, allow_none=True)

    def _llamar(self, funcion, *args):
        """Traduce cualquier falla de red o de Odoo a `OdooError` con un mensaje legible."""
        try:
            return funcion(*args)
        except xmlrpc.client.Fault as error:
            raise OdooError(f'Odoo rechazó la consulta: {error.faultString.strip().splitlines()[-1]}') from error
        except xmlrpc.client.ProtocolError as error:
            if error.errcode == 404:
                raise OdooError(
                    'La instancia de Odoo no existe o no expone la API (404). Revisa ODOO_URL.'
                ) from error
            raise OdooError(f'Odoo respondió con error HTTP {error.errcode}.') from error
        except (OSError, TimeoutError) as error:
            raise OdooError(f'No hubo conexión con Odoo: {error}') from error

    def version(self) -> str:
        info = self._llamar(self._proxy('/xmlrpc/2/common').version)
        return str(info.get('server_version', ''))

    def autenticar(self) -> int:
        if not self.configurado:
            raise OdooError('Faltan variables de Odoo en el entorno (ODOO_URL, ODOO_DB, ODOO_USER, ODOO_SECRET).')
        if self._uid is None:
            uid = self._llamar(
                self._proxy('/xmlrpc/2/common').authenticate, self.base, self.usuario, self._secreto, {}
            )
            if not uid:
                raise OdooError('Odoo rechazó el usuario o la clave de la cuenta de integración.')
            self._uid = uid
        return self._uid

    def leer(self, modelo: str, campos: list[str], dominio=None, incluir_archivados=False) -> list[dict]:
        uid = self.autenticar()
        opciones = {'fields': campos}
        if incluir_archivados:
            opciones['context'] = {'active_test': False}
        return self._llamar(
            self._proxy('/xmlrpc/2/object').execute_kw,
            self.base, uid, self._secreto, modelo, 'search_read', [dominio or []], opciones,
        )

    def contar(self, modelo: str, dominio=None) -> int:
        uid = self.autenticar()
        return self._llamar(
            self._proxy('/xmlrpc/2/object').execute_kw,
            self.base, uid, self._secreto, modelo, 'search_count', [dominio or []],
        )

    # ── Lo que consume la sincronización ─────────────────────────────────
    def departamentos(self) -> list[dict]:
        return self.leer('hr.department', CAMPOS_DEPARTAMENTO, incluir_archivados=True)

    def empleados(self) -> list[dict]:
        # Con los archivados: son las bajas, y hay que marcarlas acá.
        return self.leer('hr.employee', CAMPOS_EMPLEADO, incluir_archivados=True)

    def estado(self) -> EstadoOdoo:
        """Prueba la conexión de punta a punta sin lanzar errores: es para mostrarlo."""
        estado = EstadoOdoo(
            configurado=self.configurado, conectado=False,
            url=self.url, base=self.base, usuario=self.usuario,
        )
        if not self.configurado:
            estado.mensaje = 'Faltan variables de Odoo en el entorno del servidor.'
            return estado
        inicio = time.monotonic()
        try:
            estado.version = self.version()
            self.autenticar()
            estado.empleados_activos = self.contar('hr.employee')
        except OdooError as error:
            estado.mensaje = str(error)
        else:
            estado.conectado = True
            estado.mensaje = 'Conexión correcta.'
        estado.latencia_ms = round((time.monotonic() - inicio) * 1000)
        return estado
