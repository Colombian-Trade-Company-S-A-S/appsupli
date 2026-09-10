"""
Crea la aplicación de Valoración, sus permisos y los roles del módulo.

    python manage.py seed_valoracion_app
    python manage.py seed_valoracion_app --asignar-a correo@supli.tech

Es idempotente: se puede correr las veces que haga falta. No crea usuarios ni
datos de negocio, solo la estructura de accesos.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Application, Permission, Role, User

PERMISOS = [
    ('valoracion:config:manage', 'Configurar competencias y preguntas'),
    ('valoracion:cycles:manage', 'Gestionar ciclos, asignaciones y consolidación'),
    ('valoracion:results:view_all', 'Ver los resultados de toda la compañía'),
    ('valoracion:results:publish', 'Habilitar o bloquear los resultados al equipo'),
    ('valoracion:dashboard:view', 'Ver el dashboard y los informes'),
    ('valoracion:plans:manage', 'Gestionar planes de acción'),
    ('valoracion:hierarchy:manage', 'Editar cargos y jefes directos'),
]

# Los tres perfiles del módulo. Un líder no necesita rol: sus permisos salen
# de tener personas a cargo (`User.manager`).
ROLES = [
    (
        'valoracion-people',
        'Valoración · Admin People',
        'Acceso total al módulo: configuración, ciclos, resultados y publicación.',
        [code for code, _ in PERMISOS],
    ),
    (
        'valoracion-bi-tech',
        'Valoración · BI / Tech',
        'Configura el modelo de evaluación y ve los informes.',
        [
            'valoracion:config:manage',
            'valoracion:dashboard:view',
            'valoracion:results:publish',
        ],
    ),
    (
        'valoracion-ceo',
        'Valoración · Dirección',
        'Visibilidad total de resultados, solo lectura.',
        ['valoracion:results:view_all', 'valoracion:dashboard:view'],
    ),
]


class Command(BaseCommand):
    help = 'Crea/actualiza la aplicación de Valoración con sus permisos y roles.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--asignar-a',
            dest='asignar_a',
            nargs='*',
            default=[],
            help='Correos a los que darles acceso a la app (además del rol que tengan).',
        )
        parser.add_argument(
            '--todos',
            action='store_true',
            help='Da acceso a la app a todos los usuarios activos (todos evalúan).',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        app, creada = Application.objects.update_or_create(
            code='valoracion',
            defaults={
                'name': 'Valoración',
                'description': (
                    'Evaluación de desempeño 180°: ciclos, resultados y planes de acción.'
                ),
                'base_path': '/inicio/valoracion',
                'icon': 'gauge',
                'order': 300,
                'is_active': True,
            },
        )

        permisos = {}
        for code, name in PERMISOS:
            permiso, _ = Permission.objects.update_or_create(
                code=code, defaults={'name': name, 'application': app}
            )
            permisos[code] = permiso

        for code, name, description, codigos in ROLES:
            rol, _ = Role.objects.update_or_create(
                code=code, defaults={'name': name, 'description': description}
            )
            rol.permissions.set([permisos[c] for c in codigos])

        self.stdout.write(
            self.style.SUCCESS(
                f'Aplicación "{app.name}" {"creada" if creada else "actualizada"} '
                f'con {len(PERMISOS)} permisos y {len(ROLES)} roles.'
            )
        )

        destinatarios = User.objects.none()
        if options['todos']:
            destinatarios = User.objects.filter(is_active=True)
        elif options['asignar_a']:
            correos = [c.lower() for c in options['asignar_a']]
            destinatarios = User.objects.filter(email__in=correos)
            faltantes = set(correos) - set(destinatarios.values_list('email', flat=True))
            for correo in sorted(faltantes):
                self.stdout.write(self.style.WARNING(f'No existe ningún usuario con {correo}.'))

        for usuario in destinatarios:
            usuario.applications.add(app)
        if destinatarios:
            self.stdout.write(
                self.style.SUCCESS(f'{destinatarios.count()} usuario(s) con acceso a la app.')
            )
