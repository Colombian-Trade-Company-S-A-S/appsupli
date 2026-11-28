"""
Los permisos de Administración.

Quien no es administrador entra al módulo con cualquiera de ellos y ve solo
las pestañas que le tocan. Cada sección tiene su permiso de ver y, dentro,
el de cambiar (con `parent`, como los informes de BI Trade).

Lo que ninguno da, porque es solo del administrador de la plataforma:

- volver administrador a alguien (o quitárselo),
- cambiar la contraseña de otra persona,
- dar accesos a una persona: apps, roles y permisos sueltos,
- editar la cuenta de un administrador,
- eliminar apps o roles.
"""
from dataclasses import dataclass

APP_CODE = 'admin'

VER_USUARIOS = 'admin:users:view'
EDITAR_USUARIOS = 'admin:users:manage'
VER_AREAS = 'admin:areas:view'
VER_APPS = 'admin:applications:view'
EDITAR_APPS = 'admin:applications:manage'
VER_ROLES = 'admin:roles:view'
EDITAR_ROLES = 'admin:roles:manage'
ODOO = 'admin:odoo:manage'

SECCIONES = 'Secciones'
CAMBIAR = 'Qué puede cambiar'


@dataclass(frozen=True)
class PermisoAdmin:
    code: str
    name: str
    order: int
    description: str
    group: str = SECCIONES
    parent: str | None = None


#: Padres primero: al crearlos, cada hijo encuentra a su padre.
CATALOGO = (
    PermisoAdmin(
        VER_USUARIOS,
        'Ver el listado de usuarios',
        10,
        'La lista de personas y el detalle de cada una: área, cargo, jefe, contacto y accesos.',
    ),
    PermisoAdmin(
        EDITAR_USUARIOS,
        'Editar usuarios',
        11,
        'Sus datos de cuenta, la medición en Planner y activarlos o inactivarlos. No cambia '
        'contraseñas, no da accesos ni vuelve administrador a nadie.',
        CAMBIAR,
        VER_USUARIOS,
    ),
    PermisoAdmin(VER_AREAS, 'Ver el listado de áreas', 20, 'Las áreas que llegan de Odoo.'),
    PermisoAdmin(
        VER_APPS,
        'Ver el listado de aplicaciones',
        30,
        'Las aplicaciones de la plataforma y cuántos permisos y personas tiene cada una.',
    ),
    PermisoAdmin(
        EDITAR_APPS,
        'Crear o editar aplicaciones',
        31,
        'Crear aplicaciones y cambiar su nombre, ruta, orden o si están activas. '
        'Eliminarlas es del administrador.',
        CAMBIAR,
        VER_APPS,
    ),
    PermisoAdmin(VER_ROLES, 'Ver los roles', 40, 'Los roles y qué permisos da cada uno.'),
    PermisoAdmin(
        EDITAR_ROLES,
        'Crear o editar roles',
        41,
        'Crear roles y cambiar su nombre o sus permisos, salvo los roles que tiene la '
        'persona misma. Eliminarlos y asignarlos es del administrador.',
        CAMBIAR,
        VER_ROLES,
    ),
    PermisoAdmin(
        ODOO,
        'Odoo completo',
        50,
        'Probar la conexión, sincronizar (crea, actualiza e inactiva personas según Odoo) y '
        'generar los accesos de quien no tiene clave. Vale aunque no tenga «Editar usuarios».',
    ),
)

#: Todos: con cualquiera se entra a Administración y se leen sus catálogos.
TODOS = tuple(p.code for p in CATALOGO)
