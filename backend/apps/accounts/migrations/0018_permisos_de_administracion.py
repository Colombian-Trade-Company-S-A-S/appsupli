"""
Los permisos de Administración pasan a ir por sección, cada uno con su efecto.

  · Usuarios, áreas, aplicaciones, roles y Odoo: cada sección tiene su
    permiso de ver y, dentro (con `parent`), el de cambiar. Odoo es uno solo.
  · «Administrar áreas» pasa a ser «Ver el listado de áreas»: las áreas
    vienen de Odoo y no se editan aquí.
  · Quien tenía el de cambiar una sección queda también con el de verla:
    adentro no vale sin el de afuera.

El catálogo va copiado aquí, fijo, como toda migración (el vivo está en
`apps.accounts.permisos_admin`).
"""
from django.db import migrations

SECCIONES = 'Secciones'
CAMBIAR = 'Qué puede cambiar'

#: (código, nombre, grupo, orden, descripción, código del padre), padres primero.
CATALOGO = (
    (
        'admin:users:view',
        'Ver el listado de usuarios',
        SECCIONES,
        10,
        'La lista de personas y el detalle de cada una: área, cargo, jefe, contacto y accesos.',
        None,
    ),
    (
        'admin:users:manage',
        'Editar usuarios',
        CAMBIAR,
        11,
        'Sus datos de cuenta, la medición en Planner y activarlos o inactivarlos. No cambia '
        'contraseñas, no da accesos ni vuelve administrador a nadie.',
        'admin:users:view',
    ),
    (
        'admin:areas:view',
        'Ver el listado de áreas',
        SECCIONES,
        20,
        'Las áreas que llegan de Odoo.',
        None,
    ),
    (
        'admin:applications:view',
        'Ver el listado de aplicaciones',
        SECCIONES,
        30,
        'Las aplicaciones de la plataforma y cuántos permisos y personas tiene cada una.',
        None,
    ),
    (
        'admin:applications:manage',
        'Crear o editar aplicaciones',
        CAMBIAR,
        31,
        'Crear aplicaciones y cambiar su nombre, ruta, orden o si están activas. '
        'Eliminarlas es del administrador.',
        'admin:applications:view',
    ),
    (
        'admin:roles:view',
        'Ver los roles',
        SECCIONES,
        40,
        'Los roles y qué permisos da cada uno.',
        None,
    ),
    (
        'admin:roles:manage',
        'Crear o editar roles',
        CAMBIAR,
        41,
        'Crear roles y cambiar su nombre o sus permisos, salvo los roles que tiene la '
        'persona misma. Eliminarlos y asignarlos es del administrador.',
        'admin:roles:view',
    ),
    (
        'admin:odoo:manage',
        'Odoo completo',
        SECCIONES,
        50,
        'Probar la conexión, sincronizar (crea, actualiza e inactiva personas según Odoo) y '
        'generar los accesos de quien no tiene clave. Vale aunque no tenga «Editar usuarios».',
        None,
    ),
)


def adelante(apps, schema_editor):
    Application = apps.get_model('accounts', 'Application')
    Permission = apps.get_model('accounts', 'Permission')

    app = Application.objects.filter(code='admin').first()
    if app is None:
        return  # Base nueva: lo crea `seed_admin_app`.

    # Mismo permiso, otro código: quien lo tenía lo conserva.
    if not Permission.objects.filter(code='admin:areas:view').exists():
        Permission.objects.filter(code='admin:areas:manage').update(code='admin:areas:view')
    Permission.objects.filter(code='admin:areas:manage').delete()

    creados = {}
    for code, name, group, order, description, padre in CATALOGO:
        creados[code], _ = Permission.objects.update_or_create(
            code=code,
            defaults={
                'name': name,
                'group': group,
                'order': order,
                'description': description,
                'application': app,
                'parent': creados.get(padre),
            },
        )

    # Quien puede cambiar una sección, también la ve: adentro no vale solo.
    for code, *_, padre in CATALOGO:
        if not padre:
            continue
        hijo, afuera = creados[code], creados[padre]
        afuera.users.add(*hijo.users.all())
        afuera.roles.add(*hijo.roles.all())


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0017_permisos_bi_por_informe'),
    ]

    operations = [
        migrations.RunPython(adelante, migrations.RunPython.noop),
    ]
