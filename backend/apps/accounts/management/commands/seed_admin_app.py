"""
Crea la aplicación de Administración y sus permisos.

    python manage.py seed_admin_app

Es idempotente. El módulo lo ven los usuarios con `kind=admin`, que tienen
acceso a todo; también puede asignarse a alguien puntual desde el admin.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Application, Permission

PERMISOS = [
    ('admin:users:view', 'Ver usuarios'),
    ('admin:users:manage', 'Crear, editar e inactivar usuarios'),
    ('admin:areas:manage', 'Administrar áreas'),
    ('admin:applications:manage', 'Administrar aplicaciones y permisos'),
    ('admin:roles:manage', 'Administrar roles'),
]


class Command(BaseCommand):
    help = 'Crea/actualiza la aplicación de Administración y sus permisos.'

    @transaction.atomic
    def handle(self, *args, **options):
        app, creada = Application.objects.update_or_create(
            code='admin',
            defaults={
                'name': 'Administración',
                'description': 'Usuarios, áreas, aplicaciones, permisos y roles.',
                'base_path': '/inicio/admin',
                'icon': 'settings',
                'order': 900,
                'is_active': True,
            },
        )
        for code, name in PERMISOS:
            Permission.objects.update_or_create(
                code=code, defaults={'name': name, 'application': app}
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Aplicación "{app.name}" {"creada" if creada else "actualizada"} '
                f'con {len(PERMISOS)} permisos.'
            )
        )
