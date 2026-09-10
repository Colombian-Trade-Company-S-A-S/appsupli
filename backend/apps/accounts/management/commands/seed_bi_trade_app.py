"""
Crea la aplicación de BI Trade Marketing.

    python manage.py seed_bi_trade_app
    python manage.py seed_bi_trade_app --todos

Crea la aplicación y su permiso de escritura. Consultar los tableros solo
exige tener la app; crear, editar o borrar puntos de venta, productos y ventas
exige además `bi-trade:data:manage`, que se reparte con roles desde
Administración.
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import Application, Permission, User


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
        Permission.objects.update_or_create(
            code='bi-trade:data:manage',
            defaults={
                'name': 'Editar puntos de venta, productos y ventas',
                'application': app,
            },
        )

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
        if destinatarios:
            self.stdout.write(
                self.style.SUCCESS(f'{destinatarios.count()} usuario(s) con acceso a la app.')
            )
