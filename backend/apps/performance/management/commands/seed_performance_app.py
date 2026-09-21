"""
Arma «Supli Performance» como contenedor con sus dos sub-módulos.

    python manage.py seed_performance_app
    python manage.py seed_performance_app --asignar-a correo@supli.tech
    python manage.py seed_performance_app --como-valoracion

Deja el menú como lo pide la especificación (§3): Supli Performance es la
puerta de entrada y adentro cuelgan Objetivos y KPIs (nuevo) y Valoración (la
que ya existía, que solo se reubica). Valoración no se toca: conserva su
código, su ruta y los accesos que ya tenía.

Es idempotente. No crea usuarios ni datos de negocio, solo la estructura de
accesos.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Application, Permission, Role, User

from ...api_permissions import APP_CODE, MANAGE_ALL, PERIODOS, VIEW_ALL

CONTENEDOR = 'supli-performance'

PERMISOS = [
    (MANAGE_ALL, 'Definir objetivos de cualquier persona'),
    (VIEW_ALL, 'Ver los objetivos de toda la organización'),
    (PERIODOS, 'Abrir, activar y cerrar el periodo de medición'),
]

# El líder no necesita rol: sus permisos salen de tener personas a cargo
# (`User.manager`), igual que en valoración.
ROLES = [
    (
        'performance-people',
        'Supli Performance · People Manager',
        'Define objetivos de cualquiera, abre y activa el mes de medición.',
        [code for code, _ in PERMISOS],
    ),
    (
        'performance-direccion',
        'Supli Performance · Dirección',
        'Visibilidad de los objetivos de toda la organización, solo lectura.',
        [VIEW_ALL],
    ),
]


class Command(BaseCommand):
    help = 'Crea el contenedor Supli Performance, el sub-módulo Objetivos y KPIs y sus roles.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--asignar-a',
            dest='asignar_a',
            nargs='*',
            default=[],
            help='Correos a los que darles acceso a Objetivos y KPIs.',
        )
        parser.add_argument(
            '--como-valoracion',
            action='store_true',
            help='Le da Objetivos y KPIs a quien ya tenga acceso a Valoración.',
        )
        parser.add_argument(
            '--todos',
            action='store_true',
            help='Da acceso a Objetivos y KPIs a todos los usuarios activos.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        contenedor, _ = Application.objects.update_or_create(
            code=CONTENEDOR,
            defaults={
                'name': 'Supli Performance',
                'description': (
                    'Performance del equipo: la valoración cualitativa y la medición '
                    'de objetivos y KPIs, en un mismo lugar.'
                ),
                # El contenedor no es una página: al abrirlo se despliegan sus
                # sub-módulos. La ruta lleva al primero de ellos.
                'base_path': '/inicio/performance',
                'icon': 'gauge',
                'order': 300,
                'is_active': True,
                'parent': None,
            },
        )

        objetivos, creada = Application.objects.update_or_create(
            code=APP_CODE,
            defaults={
                'name': 'Objetivos y KPIs',
                'description': (
                    'Definición de objetivos por persona y mes, con su KPI, meta, peso '
                    'y criterio de medición.'
                ),
                'base_path': '/inicio/performance/objetivos',
                'icon': 'target',
                'order': 10,
                'is_active': True,
                'parent': contenedor,
            },
        )

        # Valoración se reubica bajo el contenedor sin cambiar de código ni de
        # ruta: quien ya tenía acceso lo conserva, solo cambia dónde se ve.
        valoracion = Application.objects.filter(code='valoracion').first()
        if valoracion:
            valoracion.name = 'Valoración'
            valoracion.parent = contenedor
            valoracion.order = 20
            valoracion.save(update_fields=['name', 'parent', 'order', 'updated_at'])
            self.stdout.write(self.style.SUCCESS('Valoración quedó dentro de Supli Performance.'))

        permisos = {}
        for code, name in PERMISOS:
            permiso, _ = Permission.objects.update_or_create(
                code=code, defaults={'name': name, 'application': objetivos}
            )
            permisos[code] = permiso

        for code, name, description, codigos in ROLES:
            rol, _ = Role.objects.update_or_create(
                code=code, defaults={'name': name, 'description': description}
            )
            rol.permissions.set([permisos[c] for c in codigos])

        self.stdout.write(
            self.style.SUCCESS(
                f'Sub-módulo "{objetivos.name}" {"creado" if creada else "actualizado"} '
                f'con {len(PERMISOS)} permisos y {len(ROLES)} roles.'
            )
        )

        destinatarios = User.objects.none()
        if options['todos']:
            destinatarios = User.objects.filter(is_active=True)
        elif options['como_valoracion'] and valoracion:
            destinatarios = User.objects.filter(is_active=True, applications=valoracion)
        elif options['asignar_a']:
            correos = [c.lower() for c in options['asignar_a']]
            destinatarios = User.objects.filter(email__in=correos)
            faltantes = set(correos) - set(destinatarios.values_list('email', flat=True))
            for correo in sorted(faltantes):
                self.stdout.write(self.style.WARNING(f'No existe ningún usuario con {correo}.'))

        for usuario in destinatarios:
            usuario.applications.add(objetivos)
        if destinatarios:
            self.stdout.write(
                self.style.SUCCESS(
                    f'{destinatarios.count()} usuario(s) con acceso a Objetivos y KPIs.'
                )
            )
