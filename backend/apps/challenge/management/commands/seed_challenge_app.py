"""
Arma «Supli Challenge» en el menú, con sus permisos y roles.

    python manage.py seed_challenge_app
    python manage.py seed_challenge_app --asignar-a correo@supli.tech

Challenge vive junto a Performance dentro de «Cultura y desempeño», pero es su
propio módulo: tiene sus retos, sus evaluadores y su ranking.

Es idempotente. No crea retos ni usuarios, solo la estructura de accesos.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Application, Permission, Role, User

from ...api_permissions import APP_CODE, MANAGE, VALORAR

PERMISOS = [
    (MANAGE, 'Crear, publicar, cerrar y finalizar retos'),
    (VALORAR, 'Valorar las participaciones de los retos'),
]

ROLES = [
    (
        'challenge-people',
        'Supli Challenge · People',
        'Crea los retos, los abre, los cierra y responde las solicitudes de revisión.',
        [MANAGE, VALORAR],
    ),
    (
        'challenge-evaluador',
        'Supli Challenge · Evaluador',
        'Valora las participaciones con la rúbrica del reto.',
        [VALORAR],
    ),
]


class Command(BaseCommand):
    help = 'Crea el módulo Supli Challenge con sus permisos y roles.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--asignar-a',
            dest='asignar_a',
            nargs='*',
            default=[],
            help='Correos a los que darles acceso a Supli Challenge.',
        )

    @transaction.atomic
    def handle(self, *args, **opciones):
        app, creada = Application.objects.get_or_create(
            code=APP_CODE,
            defaults={
                'name': 'Supli Challenge',
                'description': 'Retos de cultura y participación: participa, valora y celebra.',
                'base_path': '/inicio/challenge',
                'icon': 'trophy',
                'order': 320,
            },
        )
        self.stdout.write(f'{"Creado" if creada else "Ya existía"}: {app.name}')

        for code, nombre in PERMISOS:
            Permission.objects.update_or_create(
                code=code, defaults={'name': nombre, 'application': app}
            )
        self.stdout.write(f'Permisos listos: {len(PERMISOS)}')

        for code, nombre, descripcion, permisos in ROLES:
            rol, _ = Role.objects.update_or_create(
                code=code, defaults={'name': nombre, 'description': descripcion}
            )
            rol.permissions.set(Permission.objects.filter(code__in=permisos))
            self.stdout.write(f'Rol listo: {rol.name}')

        for correo in opciones['asignar_a']:
            usuario = User.objects.filter(email__iexact=correo).first()
            if usuario is None:
                self.stderr.write(f'No existe el usuario {correo}')
                continue
            usuario.applications.add(app)
            self.stdout.write(f'Acceso dado a {correo}')

        self.stdout.write(self.style.SUCCESS('Supli Challenge quedó montado.'))
