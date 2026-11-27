"""
Crea la aplicación de BI Trade Marketing.

    python manage.py seed_bi_trade_app
    python manage.py seed_bi_trade_app --todos

Crea la aplicación y sus permisos (ver `apps.bi_trade.permisos`): cada
informe, y dentro de él qué puede cargar o editar y si puede compartirlo. Se
reparten desde Administración, al editar el usuario. A quien se le da la app
con `--asignar-a` o `--todos` se le dan también todos los informes, sin
permisos de edición.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Application, Permission, User
from apps.bi_trade.permisos import CATALOGO, INFORMES


class Command(BaseCommand):
    help = 'Crea/actualiza la aplicación de BI Trade Marketing.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--asignar-a',
            dest='asignar_a',
            nargs='*',
            default=[],
            help='Correos a los que darles acceso a la app.',
        )
        parser.add_argument(
            '--todos',
            action='store_true',
            help='Da acceso a la app a todos los usuarios activos.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        app, creada = Application.objects.update_or_create(
            code='bi-trade',
            defaults={
                'name': 'BI Trade Marketing',
                'description': 'Inteligencia de negocio para trade marketing.',
                'base_path': '/inicio/bi-trade',
                'icon': 'bar-chart-3',
                'order': 200,
                'is_active': True,
            },
        )
        # El catálogo trae cada informe antes que los permisos que van dentro.
        creados: dict[str, Permission] = {}
        for permiso in CATALOGO:
            creados[permiso.code], _ = Permission.objects.update_or_create(
                code=permiso.code,
                defaults={
                    'application': app,
                    'name': permiso.name,
                    'group': permiso.group,
                    'order': permiso.order,
                    'description': permiso.description,
                    'parent': creados[permiso.parent] if permiso.parent else None,
                },
            )
        informes = list(Permission.objects.filter(code__in=INFORMES.values()))

        self.stdout.write(
            self.style.SUCCESS(f'Aplicación "{app.name}" {"creada" if creada else "actualizada"}.')
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
            usuario.extra_permissions.add(*informes)
        if destinatarios:
            self.stdout.write(
                self.style.SUCCESS(f'{destinatarios.count()} usuario(s) con acceso a la app.')
            )
