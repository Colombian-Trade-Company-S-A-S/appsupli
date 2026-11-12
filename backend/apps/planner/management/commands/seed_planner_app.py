"""
Crea el sub-módulo «Ejecución Planner» dentro de Supli Performance.

    python manage.py seed_planner_app
    python manage.py seed_planner_app --como-objetivos   # a quien ya tiene Objetivos y KPIs
    python manage.py seed_planner_app --asignar-a correo@supli.tech

Agrega sus permisos a los roles que ya existen en Performance: People
administra; CEO y Dirección ven toda la organización. Es idempotente.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Application, Permission, Role, User
from apps.planner.api_permissions import APP_CODE, GESTIONAR, VER_TODO

PERMISOS = [
    (GESTIONAR, 'Administrar Ejecución Planner (planes, parámetros, sincronización y calidad)'),
    (VER_TODO, 'Ver la ejecución Planner de toda la organización'),
]

ROLES = {
    'performance-people': [GESTIONAR, VER_TODO],
    'performance-ceo': [VER_TODO],
    'performance-direccion': [VER_TODO],
}


class Command(BaseCommand):
    help = 'Crea el sub-módulo Ejecución Planner y sus permisos.'

    def add_arguments(self, parser):
        parser.add_argument('--como-objetivos', action='store_true',
                            help='Da acceso a quien ya tenga Objetivos y KPIs.')
        parser.add_argument('--asignar-a', dest='asignar_a', nargs='*', default=[],
                            help='Correos a los que dar acceso.')

    @transaction.atomic
    def handle(self, *args, **opciones):
        contenedor = Application.objects.filter(code='supli-performance').first()
        if contenedor is None:
            self.stdout.write(self.style.ERROR('Primero corre seed_performance_app.'))
            return
        app, creada = Application.objects.update_or_create(
            code=APP_CODE,
            defaults={
                'name': 'Ejecución Planner',
                'description': (
                    'Cómo se ejecutan las tareas de Microsoft Planner: Weekly y Daily por persona, '
                    'y Hitos validados por el líder. Solo lee Planner.'
                ),
                'base_path': '/inicio/performance/planner',
                'icon': 'calendar-check',
                'order': 15,
                'is_active': True,
                'parent': contenedor,
            },
        )
        permisos = {}
        for code, name in PERMISOS:
            permisos[code], _ = Permission.objects.update_or_create(
                code=code, defaults={'name': name, 'application': app}
            )
        for rol_code, codigos in ROLES.items():
            rol = Role.objects.filter(code=rol_code).first()
            if rol:
                rol.permissions.add(*[permisos[c] for c in codigos])
        self.stdout.write(self.style.SUCCESS(f'Sub-módulo "{app.name}" {"creado" if creada else "actualizado"}.'))

        destinatarios = User.objects.none()
        if opciones['como_objetivos']:
            destinatarios = User.objects.filter(is_active=True, applications__code='objetivos-kpis')
        elif opciones['asignar_a']:
            destinatarios = User.objects.filter(email__in=[c.lower() for c in opciones['asignar_a']])
        for usuario in destinatarios:
            usuario.applications.add(app)
        if destinatarios:
            self.stdout.write(self.style.SUCCESS(f'{destinatarios.count()} usuario(s) con acceso.'))
