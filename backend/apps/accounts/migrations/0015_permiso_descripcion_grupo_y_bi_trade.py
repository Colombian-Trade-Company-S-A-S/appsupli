"""
Los permisos explican qué hacen y se agrupan dentro de su app; BI Trade pasa a
tener permisos por informe, por módulo y para compartir.

  · `description`, `group` y `order` en el permiso: al editar un usuario, cada
    app muestra sus permisos agrupados y con lo que permite cada uno.
  · Se escribe la descripción de los permisos que ya existían.
  · BI Trade: se crean los permisos del catálogo (ver `apps.bi_trade.permisos`;
    aquí va una copia fija, como toda migración). Ver un informe ahora es un
    permiso: a quien ya tenía la app se le dan todos, para que siga viendo lo
    mismo que antes.
"""
from django.db import migrations, models

#: código → (grupo, orden, descripción) de los permisos que ya había.
DESCRIPCIONES = {
    'admin:users:view': ('Administración', 10, 'Ver la lista de usuarios y su detalle.'),
    'admin:users:manage': (
        'Administración', 20, 'Crear, editar e inactivar usuarios, y repartir sus accesos.'
    ),
    'admin:areas:manage': ('Administración', 30, 'Crear y editar las áreas de la compañía.'),
    'admin:applications:manage': (
        'Administración', 40, 'Crear y editar las aplicaciones, sus permisos y lo que explican.'
    ),
    'admin:roles:manage': ('Administración', 50, 'Crear y editar los roles: paquetes de permisos.'),
    'performance:objetivos:autogestion': (
        'Objetivos', 10,
        'Definir sus propios objetivos y cargar su resultado, que queda aprobado al cargarlo: '
        'nadie más lo aprueba. Es para quien no tiene jefe que le apruebe, como el CEO.',
    ),
    'performance:objetivos:manage_all': (
        'Objetivos', 20,
        'Poner o cambiar objetivos a cualquier persona, no solo a su equipo, y cargar o aprobar '
        'el resultado de cualquiera.',
    ),
    'performance:objetivos:view_all': (
        'Objetivos', 30,
        'Ver los objetivos y resultados de toda la compañía, sin poder cambiarlos.',
    ),
    'performance:periodos:manage': (
        'Periodo de medición', 40,
        'Abrir el mes de medición, iniciarlo y cerrarlo. Al iniciarlo, los objetivos quedan '
        'congelados: ya no se pueden cambiar.',
    ),
    'planner:ver_todo': (
        'Ejecución Planner', 10,
        'Ver cómo va la ejecución en Planner de todas las personas medidas, no solo la propia o '
        'la de su equipo.',
    ),
    'planner:gestionar': (
        'Ejecución Planner', 20,
        'Administrar la medición: qué planes se miden, los parámetros, la sincronización con '
        'Planner y la revisión de calidad de las tareas.',
    ),
    'valoracion:config:manage': (
        'Configuración', 10,
        'Cambiar qué se evalúa: las competencias y las preguntas de las evaluaciones.',
    ),
    'valoracion:hierarchy:manage': (
        'Configuración', 20,
        'Cambiar el cargo y el jefe directo de las personas. De esto depende qué equipo ve cada '
        'líder, así que conviene tocarlo con cuidado.',
    ),
    'valoracion:cycles:manage': (
        'Ciclos', 30,
        'Lanzar un ciclo de evaluación: decidir quién evalúa a quién y, al final, consolidar las '
        'respuestas.',
    ),
    'valoracion:plans:manage': (
        'Ciclos', 40,
        'Crear y hacer seguimiento a los planes de acción que salen de los resultados.',
    ),
    'valoracion:dashboard:view': (
        'Resultados', 50, 'Ver el dashboard con los gráficos e informes de toda la evaluación.'
    ),
    'valoracion:results:view_all': (
        'Resultados', 60,
        'Ver el resultado de cualquier persona de la compañía, no solo el propio o el de su '
        'equipo.',
    ),
    'valoracion:results:publish': (
        'Resultados', 70,
        'Decidir cuándo las personas pueden ver sus resultados: los habilita o los bloquea.',
    ),
    'challenge:retos:manage': (
        'Retos', 10,
        'Crear retos, publicarlos, calificar las participaciones, cerrarlos y responder cuando '
        'alguien pide revisar su calificación.',
    ),
    'challenge:valoraciones:crear': (
        'Retos', 20,
        'Ya no da acceso a calificar: califica solo quien tiene «Administrar retos» (People). '
        'Se puede quitar.',
    ),
}

INFORMES = 'Informes que puede ver'
EDICION = 'Qué puede cargar y editar'

#: El catálogo de BI Trade: (código, nombre, grupo, orden, descripción).
BI_TRADE = (
    ('bi-trade:informe:claro', 'Ver BI Claro punto de venta', INFORMES, 10,
     'Abre el tablero de Claro: avance del mes, cumplimiento diario, concurso de tickets y el '
     'detalle de cada punto y regional. También ve sus listados de ventas, productos, puntos de '
     'venta, inventario y metas, sin poder cambiarlos. Puede descargarlos en Excel.'),
    ('bi-trade:informe:hc', 'Ver Informe de Ventas HC', INFORMES, 20,
     'Abre el tablero de Homecenter (avance del mes y cumplimiento diario, por regional y tienda) '
     'y sus listados, sin poder cambiarlos. Puede descargarlos en Excel.'),
    ('bi-trade:informe:falabella', 'Ver Informe de Ventas Falabella', INFORMES, 30,
     'Abre el tablero de Falabella (avance del mes y cumplimiento diario, por regional y tienda) '
     'y sus listados, sin poder cambiarlos. Puede descargarlos en Excel.'),
    ('bi-trade:informe:tmk', 'Ver Informe Tmk Ecommerce Claro', INFORMES, 40,
     'Abre el tablero de Tmk Ecommerce Claro y sus listados, sin poder cambiarlos. Puede '
     'descargarlos en Excel.'),
    ('bi-trade:informe:partners', 'Ver Plan Partners', INFORMES, 50,
     'Abre el tablero de Plan Partners y sus registros. También puede registrar desde la app, '
     'como en el formulario; corregir o borrar registros pide «Administrar los planes».'),
    ('bi-trade:informe:belkin', 'Ver Plan Recomiéndame Belkin', INFORMES, 60,
     'Abre el tablero del plan Recomiéndame Belkin, sus asesores y sus registros. También puede '
     'registrar desde la app; corregir o borrar pide «Administrar los planes».'),
    ('bi-trade:ventas:editar', 'Cargar y editar ventas', EDICION, 110,
     'Crear, corregir y borrar ventas, e importarlas: con la plantilla, con el informe del ERP '
     '(Claro y Tmk) y con los reportes del portal (Falabella y Homecenter). Solo en los informes '
     'que puede ver.'),
    ('bi-trade:inventario:editar', 'Cargar y editar inventario', EDICION, 120,
     'Cargar el stock de cada tienda —con la plantilla o con los reportes del portal— y '
     'corregirlo. Cargar el reporte de inventario reemplaza todo el que había. Solo en los '
     'informes que puede ver.'),
    ('bi-trade:metas:editar', 'Cargar y editar metas', EDICION, 130,
     'Cargar y corregir las metas del mes contra las que se mide el cumplimiento, y en Claro las '
     'campañas del concurso de tickets. Solo en los informes que puede ver.'),
    ('bi-trade:productos:editar', 'Editar productos, precios y marcas', EDICION, 140,
     'Crear y corregir productos, sus precios por periodo y la lista de marcas. Con esto también '
     'puede crear los productos que faltan al importar un reporte. Cambiar un precio cambia '
     'cuánto vale lo vendido en el tablero.'),
    ('bi-trade:puntos-venta:editar', 'Editar puntos de venta', EDICION, 150,
     'Crear y corregir puntos de venta (tiendas), su regional y sus materiales. Con esto también '
     'puede crear las tiendas que faltan al importar un reporte.'),
    ('bi-trade:planes:editar', 'Administrar los planes (Partners y Belkin)', EDICION, 160,
     'Manejar Plan Partners y Plan Belkin: sus regionales, puntos, asesores, productos y metas, '
     'e importar, corregir o borrar registros.'),
    ('bi-trade:data:manage', 'Editar todo en BI Trade', EDICION, 190,
     'Equivale a marcar todos los permisos de edición de arriba. No da acceso a informes: esos '
     'se marcan aparte.'),
    ('bi-trade:compartir', 'Compartir tableros', 'Compartir', 210,
     'Crear, ver y revocar enlaces públicos con contraseña para mostrar un tablero a alguien sin '
     'cuenta, y los enlaces de los formularios de los planes. Solo de los informes que puede '
     'ver.'),
)


def adelante(apps, schema_editor):
    Application = apps.get_model('accounts', 'Application')
    Permission = apps.get_model('accounts', 'Permission')
    User = apps.get_model('accounts', 'User')

    for code, (grupo, orden, descripcion) in DESCRIPCIONES.items():
        Permission.objects.filter(code=code).update(
            group=grupo, order=orden, description=descripcion
        )

    # En una base nueva (las pruebas) la app la crea su semilla, con el catálogo.
    app = Application.objects.filter(code='bi-trade').first()
    if app is None:
        return
    informes = []
    for code, nombre, grupo, orden, descripcion in BI_TRADE:
        permiso, _ = Permission.objects.update_or_create(
            code=code,
            defaults={
                'application': app,
                'name': nombre,
                'group': grupo,
                'order': orden,
                'description': descripcion,
            },
        )
        if code.startswith('bi-trade:informe:'):
            informes.append(permiso)

    # Antes, tener la app era ver todos los informes: quien la tenía los sigue viendo.
    for usuario in User.objects.filter(applications=app).distinct():
        usuario.extra_permissions.add(*informes)

    # Y compartir venía con «Editar todo»: quien lo tiene —suelto o por un rol—
    # sigue pudiendo compartir.
    compartir = Permission.objects.get(code='bi-trade:compartir')
    editores = User.objects.filter(
        models.Q(extra_permissions__code='bi-trade:data:manage')
        | models.Q(roles__permissions__code='bi-trade:data:manage')
    ).distinct()
    for usuario in editores:
        usuario.extra_permissions.add(compartir)


class Migration(migrations.Migration):
    dependencies = [
        ('accounts', '0014_aviso_app_cada_15_dias'),
    ]

    operations = [
        migrations.AddField(
            model_name='permission',
            name='description',
            field=models.TextField(blank=True, verbose_name='qué permite'),
        ),
        migrations.AddField(
            model_name='permission',
            name='group',
            field=models.CharField(blank=True, max_length=80, verbose_name='grupo'),
        ),
        migrations.AddField(
            model_name='permission',
            name='order',
            field=models.PositiveIntegerField(default=100, verbose_name='orden'),
        ),
        migrations.AlterModelOptions(
            name='permission',
            options={
                'ordering': ('application__order', 'order', 'code'),
                'verbose_name': 'permiso',
                'verbose_name_plural': 'permisos',
            },
        ),
        migrations.RunPython(adelante, migrations.RunPython.noop),
    ]
