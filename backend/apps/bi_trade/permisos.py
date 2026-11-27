"""
Los permisos de BI Trade Marketing, por informe.

Cada informe —Claro, Homecenter, Falabella, Tmk, Plan Partners y Plan Belkin—
es un permiso: ver su tablero y sus listados. Dentro de él van los permisos de
lo que la persona puede hacer en ese informe y en ningún otro:

  · Canales (Claro, HC, Falabella, Tmk): cargar y editar ventas, inventario y
    metas; editar productos y precios, y puntos de venta; compartir el tablero.
  · Planes (Partners, Belkin): administrar el plan y compartir.

Con «cargar ventas» de HC y no de Claro, carga ventas de Homecenter y de nada
más. Los de adentro solo valen con su informe: sin verlo, no hay qué editar.

«Administrador de BI Trade» (`bi-trade:data:manage`, el código de antes) da
todo: todos los informes, toda la edición y compartir.

Este es el catálogo que siembran `seed_bi_trade_app` y las migraciones de
permisos; las vistas lo leen por las funciones de aquí.
"""
from dataclasses import dataclass

APP_CODE = 'bi-trade'

GRUPO_TOTAL = 'Acceso total'
GRUPO_INFORMES = 'Informes'
GRUPO_EDICION = 'Qué puede cargar y editar'
GRUPO_COMPARTIR = 'Compartir'

#: Todo BI Trade: todos los informes, toda la edición y compartir.
ADMIN_BI = 'bi-trade:data:manage'

#: informe → nombre. El informe es el tramo de la ruta (`/api/bi-trade/hc/…`).
NOMBRES = {
    'claro': 'BI Claro punto de venta',
    'hc': 'Informe de Ventas HC',
    'falabella': 'Informe de Ventas Falabella',
    'tmk': 'Informe Tmk Ecommerce Claro',
    'partners': 'Plan Partners',
    'belkin': 'Plan Recomiéndame Belkin',
}

CANALES = ('claro', 'hc', 'falabella', 'tmk')
PLANES = ('partners', 'belkin')

#: Lo que se edita en cada informe.
MODULOS = {
    **{canal: ('ventas', 'inventario', 'metas', 'productos', 'puntos-venta') for canal in CANALES},
    **{plan: ('plan',) for plan in PLANES},
}


def codigo_informe(informe: str) -> str:
    return f'bi-trade:informe:{informe}'


def codigo_editar(informe: str, modulo: str) -> str:
    return f'bi-trade:{informe}:{modulo}:editar'


def codigo_compartir(informe: str) -> str:
    return f'bi-trade:{informe}:compartir'


#: informe → código para verlo.
INFORMES = {informe: codigo_informe(informe) for informe in NOMBRES}


@dataclass(frozen=True)
class PermisoBi:
    code: str
    name: str
    group: str
    order: int
    description: str
    #: El código del permiso dentro del que va (su informe).
    parent: str | None = None


_TABLERO = {
    'claro': 'avance del mes, cumplimiento diario, concurso de tickets y el detalle de cada '
    'punto y regional',
    'hc': 'avance del mes y cumplimiento diario, por regional y por tienda',
    'falabella': 'avance del mes y cumplimiento diario, por regional y por tienda',
    'tmk': 'avance del mes y cumplimiento diario, por regional y por punto',
}

_IMPORTAR_VENTAS = {
    'claro': 'con la plantilla o con el informe del ERP (también el que llega al correo)',
    'hc': 'con la plantilla o con el reporte de ventas del portal de Homecenter',
    'falabella': 'con la plantilla o con el reporte de ventas del portal de Falabella',
    'tmk': 'con la plantilla o con el informe del ERP (también el que llega al correo)',
}

_METAS = {
    'claro': 'Cargar y corregir las metas del mes por punto y producto, y las campañas del '
    'concurso de tickets.',
    'hc': 'Cargar y corregir la meta de cada tienda por mes, en pesos.',
    'falabella': 'Cargar y corregir las metas del mes contra las que se mide el cumplimiento.',
    'tmk': 'Cargar y corregir las metas del mes contra las que se mide el cumplimiento.',
}

_PLAN = {
    'partners': (
        'Ve el tablero del plan y sus registros, y puede registrar desde la app como en el '
        'formulario.',
        'Manejar sus regionales, puntos de venta, productos y metas, e importar, corregir o '
        'borrar registros.',
        'Crear y revocar el enlace del formulario, para que alguien sin cuenta registre.',
    ),
    'belkin': (
        'Ve el tablero del plan, sus asesores y sus registros, y puede registrar desde la app '
        'como en el formulario.',
        'Manejar sus regionales, puntos de venta, asesores, categorías y productos, e importar, '
        'corregir o borrar registros.',
        'Crear y revocar los enlaces del tablero (con contraseña) y del formulario, para '
        'mostrarlo o registrar sin cuenta.',
    ),
}


def _canal(informe: str, orden: int) -> list[PermisoBi]:
    padre = codigo_informe(informe)
    return [
        PermisoBi(
            padre, NOMBRES[informe], GRUPO_INFORMES, orden,
            f'Ve el tablero ({_TABLERO[informe]}) y sus listados de ventas, productos, puntos de '
            'venta, inventario y metas, sin poder cambiarlos. Puede descargarlos en Excel.',
        ),
        PermisoBi(
            codigo_editar(informe, 'ventas'), 'Cargar y editar ventas', GRUPO_EDICION, orden + 1,
            f'Crear, corregir y borrar ventas, e importarlas {_IMPORTAR_VENTAS[informe]}.',
            padre,
        ),
        PermisoBi(
            codigo_editar(informe, 'inventario'), 'Cargar y editar inventario', GRUPO_EDICION,
            orden + 2,
            'Cargar el stock de cada tienda —con la plantilla o con el reporte— y corregirlo. '
            'Cargar un reporte de inventario reemplaza el que había.',
            padre,
        ),
        PermisoBi(
            codigo_editar(informe, 'metas'), 'Cargar y editar metas', GRUPO_EDICION, orden + 3,
            _METAS[informe], padre,
        ),
        PermisoBi(
            codigo_editar(informe, 'productos'), 'Editar productos y precios', GRUPO_EDICION,
            orden + 4,
            'Crear y corregir productos, sus precios y las marcas. Con esto también puede crear '
            'los productos que faltan al importar. Cambiar un precio cambia cuánto vale lo '
            'vendido en el tablero.',
            padre,
        ),
        PermisoBi(
            codigo_editar(informe, 'puntos-venta'), 'Editar puntos de venta', GRUPO_EDICION,
            orden + 5,
            'Crear y corregir puntos de venta, su regional y sus materiales. Con esto también '
            'puede crear los que faltan al importar.',
            padre,
        ),
        PermisoBi(
            codigo_compartir(informe), 'Compartir este tablero', GRUPO_COMPARTIR, orden + 6,
            'Crear y revocar enlaces con contraseña para mostrar el tablero a alguien sin cuenta.',
            padre,
        ),
    ]


def _plan(informe: str, orden: int) -> list[PermisoBi]:
    padre = codigo_informe(informe)
    ver, administrar, compartir = _PLAN[informe]
    return [
        PermisoBi(padre, NOMBRES[informe], GRUPO_INFORMES, orden, ver),
        PermisoBi(
            codigo_editar(informe, 'plan'), 'Administrar el plan', GRUPO_EDICION, orden + 1,
            administrar, padre,
        ),
        PermisoBi(
            codigo_compartir(informe), 'Compartir', GRUPO_COMPARTIR, orden + 2, compartir, padre
        ),
    ]


CATALOGO: tuple[PermisoBi, ...] = (
    PermisoBi(
        ADMIN_BI, 'Administrador de BI Trade', GRUPO_TOTAL, 1,
        'Todo BI Trade sin marcar nada más: ve todos los informes, carga y edita todo y puede '
        'compartir. Para quien administra el módulo.',
    ),
    *_canal('claro', 10),
    *_canal('hc', 20),
    *_canal('falabella', 30),
    *_canal('tmk', 40),
    *_plan('partners', 50),
    *_plan('belkin', 60),
)
