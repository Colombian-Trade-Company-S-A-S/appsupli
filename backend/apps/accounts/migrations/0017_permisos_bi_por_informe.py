"""
Los permisos de BI Trade pasan a ir por informe.

  · Dentro de cada informe van sus permisos (con `parent`, que agrega la
    migración anterior): cargar y editar ventas, inventario, metas, productos
    y puntos de venta, o administrar el plan, y compartir. Los de antes
    valían en todos los informes que la persona veía: quien tenía uno queda
    con el de cada informe que ve, y los de antes se borran.
  · «Editar todo» (`bi-trade:data:manage`) pasa a ser «Administrador de BI
    Trade»: todos los informes, toda la edición y compartir.

El catálogo va copiado aquí, fijo, como toda migración (el vivo está en
`apps.bi_trade.permisos`).
"""
from django.db import migrations

ADMIN_BI = 'bi-trade:data:manage'

NOMBRES = {
    'claro': 'BI Claro punto de venta',
    'hc': 'Informe de Ventas HC',
    'falabella': 'Informe de Ventas Falabella',
    'tmk': 'Informe Tmk Ecommerce Claro',
    'partners': 'Plan Partners',
    'belkin': 'Plan Recomiéndame Belkin',
}
CANALES = ('claro', 'hc', 'falabella', 'tmk')
MODULOS = {
    **{canal: ('ventas', 'inventario', 'metas', 'productos', 'puntos-venta') for canal in CANALES},
    'partners': ('plan',),
    'belkin': ('plan',),
}

#: Los de antes, que valían en todo informe visible → el módulo de ahora.
VIEJOS_EDICION = {
    'bi-trade:ventas:editar': 'ventas',
    'bi-trade:inventario:editar': 'inventario',
    'bi-trade:metas:editar': 'metas',
    'bi-trade:productos:editar': 'productos',
    'bi-trade:puntos-venta:editar': 'puntos-venta',
    'bi-trade:planes:editar': 'plan',
}
VIEJO_COMPARTIR = 'bi-trade:compartir'

TABLERO = {
    'claro': 'avance del mes, cumplimiento diario, concurso de tickets y el detalle de cada '
    'punto y regional',
    'hc': 'avance del mes y cumplimiento diario, por regional y por tienda',
    'falabella': 'avance del mes y cumplimiento diario, por regional y por tienda',
    'tmk': 'avance del mes y cumplimiento diario, por regional y por punto',
}
IMPORTAR_VENTAS = {
    'claro': 'con la plantilla o con el informe del ERP (también el que llega al correo)',
    'hc': 'con la plantilla o con el reporte de ventas del portal de Homecenter',
    'falabella': 'con la plantilla o con el reporte de ventas del portal de Falabella',
    'tmk': 'con la plantilla o con el informe del ERP (también el que llega al correo)',
}
METAS = {
    'claro': 'Cargar y corregir las metas del mes por punto y producto, y las campañas del '
    'concurso de tickets.',
    'hc': 'Cargar y corregir la meta de cada tienda por mes, en pesos.',
    'falabella': 'Cargar y corregir las metas del mes contra las que se mide el cumplimiento.',
    'tmk': 'Cargar y corregir las metas del mes contra las que se mide el cumplimiento.',
}
PLAN = {
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


def informe(nombre):
    return f'bi-trade:informe:{nombre}'


def editar(nombre, modulo):
    return f'bi-trade:{nombre}:{modulo}:editar'


def compartir(nombre):
    return f'bi-trade:{nombre}:compartir'


def catalogo():
    """(código, nombre, grupo, orden, descripción, código del padre), padres primero."""
    filas = [
        (
            ADMIN_BI, 'Administrador de BI Trade', 'Acceso total', 1,
            'Todo BI Trade sin marcar nada más: ve todos los informes, carga y edita todo y '
            'puede compartir. Para quien administra el módulo.', None,
        )
    ]
    edicion, grupo_compartir = 'Qué puede cargar y editar', 'Compartir'
    for orden, canal in zip((10, 20, 30, 40), CANALES, strict=True):
        padre = informe(canal)
        filas += [
            (
                padre, NOMBRES[canal], 'Informes', orden,
                f'Ve el tablero ({TABLERO[canal]}) y sus listados de ventas, productos, puntos '
                'de venta, inventario y metas, sin poder cambiarlos. Puede descargarlos en '
                'Excel.', None,
            ),
            (
                editar(canal, 'ventas'), 'Cargar y editar ventas', edicion, orden + 1,
                f'Crear, corregir y borrar ventas, e importarlas {IMPORTAR_VENTAS[canal]}.',
                padre,
            ),
            (
                editar(canal, 'inventario'), 'Cargar y editar inventario', edicion, orden + 2,
                'Cargar el stock de cada tienda —con la plantilla o con el reporte— y '
                'corregirlo. Cargar un reporte de inventario reemplaza el que había.', padre,
            ),
            (
                editar(canal, 'metas'), 'Cargar y editar metas', edicion, orden + 3,
                METAS[canal], padre,
            ),
            (
                editar(canal, 'productos'), 'Editar productos y precios', edicion, orden + 4,
                'Crear y corregir productos, sus precios y las marcas. Con esto también puede '
                'crear los productos que faltan al importar. Cambiar un precio cambia cuánto '
                'vale lo vendido en el tablero.', padre,
            ),
            (
                editar(canal, 'puntos-venta'), 'Editar puntos de venta', edicion, orden + 5,
                'Crear y corregir puntos de venta, su regional y sus materiales. Con esto '
                'también puede crear los que faltan al importar.', padre,
            ),
            (
                compartir(canal), 'Compartir este tablero', grupo_compartir, orden + 6,
                'Crear y revocar enlaces con contraseña para mostrar el tablero a alguien sin '
                'cuenta.', padre,
            ),
        ]
    for orden, plan in ((50, 'partners'), (60, 'belkin')):
        padre = informe(plan)
        ver, administrar, texto_compartir = PLAN[plan]
        filas += [
            (padre, NOMBRES[plan], 'Informes', orden, ver, None),
            (
                editar(plan, 'plan'), 'Administrar el plan', edicion, orden + 1, administrar,
                padre,
            ),
            (compartir(plan), 'Compartir', grupo_compartir, orden + 2, texto_compartir, padre),
        ]
    return filas


def adelante(apps, schema_editor):
    Application = apps.get_model('accounts', 'Application')
    Permission = apps.get_model('accounts', 'Permission')
    Role = apps.get_model('accounts', 'Role')

    # En una base nueva (las pruebas) la app la crea su semilla, con el catálogo.
    app = Application.objects.filter(code='bi-trade').first()
    if app is None:
        return

    creados = {}
    for code, nombre, grupo, orden, descripcion, padre in catalogo():
        creados[code], _ = Permission.objects.update_or_create(
            code=code,
            defaults={
                'application': app,
                'name': nombre,
                'group': grupo,
                'order': orden,
                'description': descripcion,
                'parent': creados[padre] if padre else None,
            },
        )

    viejos = {**VIEJOS_EDICION, VIEJO_COMPARTIR: None}

    def nuevos(code, informes):
        """Los permisos de ahora que reemplazan a `code` en esos informes."""
        modulo = viejos[code]
        if modulo is None:
            return [creados[compartir(i)] for i in informes]
        return [creados[editar(i, modulo)] for i in informes if modulo in MODULOS[i]]

    for viejo in Permission.objects.filter(code__in=viejos):
        # Valía en los informes que la persona veía: queda en cada uno de esos.
        for usuario in viejo.users.all():
            codigos = set(usuario.extra_permissions.values_list('code', flat=True)) | set(
                Permission.objects.filter(roles__users=usuario).values_list('code', flat=True)
            )
            usuario.extra_permissions.add(
                *nuevos(viejo.code, [i for i in NOMBRES if informe(i) in codigos])
            )
        # Un rol no tiene informes propios: queda con el de todos.
        for rol in Role.objects.filter(permissions=viejo):
            rol.permissions.add(*nuevos(viejo.code, list(NOMBRES)))
        viejo.delete()


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0016_permiso_va_dentro_de'),
    ]

    operations = [
        migrations.RunPython(adelante, migrations.RunPython.noop),
    ]
