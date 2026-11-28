"""
Crea la aplicación de Administración y sus permisos.

    python manage.py seed_admin_app

Es idempotente. El administrador de la plataforma entra a todo; los demás,
con alguno de estos permisos, a las secciones que les tocan (ver
`apps.accounts.permisos_admin`).
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Application, Permission
from apps.accounts.permisos_admin import CATALOGO


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
        creados: dict[str, Permission] = {}
        for permiso in CATALOGO:
            creados[permiso.code], _ = Permission.objects.update_or_create(
                code=permiso.code,
                defaults={
                    'name': permiso.name,
                    'group': permiso.group,
                    'order': permiso.order,
                    'description': permiso.description,
                    'application': app,
                    'parent': creados.get(permiso.parent) if permiso.parent else None,
                },
            )

        self.stdout.write(
            self.style.SUCCESS(
                f'Aplicación "{app.name}" {"creada" if creada else "actualizada"} '
                f'con {len(CATALOGO)} permisos.'
            )
        )
