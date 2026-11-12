"""
`manage.py inventario_planner` — descubre los planes de todos los grupos de
Microsoft 365 y relaciona con su persona los que tienen su nombre.

    python manage.py inventario_planner               # guarda y relaciona
    python manage.py inventario_planner --simular     # solo cuenta, no guarda
    python manage.py inventario_planner --sin-vincular
"""
from django.core.management.base import BaseCommand, CommandError

from apps.planner.inventario import descubrir_planes
from apps.planner.models import Sincronizacion


class Command(BaseCommand):
    help = 'Guarda todos los planes de Planner de la empresa y propone su persona por el nombre.'

    def add_arguments(self, parser):
        parser.add_argument('--simular', action='store_true', help='Calcula sin guardar nada.')
        parser.add_argument('--sin-vincular', action='store_true', help='Guarda los planes sin relacionarlos.')

    def handle(self, *args, **opciones):
        registro = descubrir_planes(vincular=not opciones['sin_vincular'], simular=opciones['simular'])
        if registro.estado == Sincronizacion.Estado.ERROR:
            raise CommandError(registro.error)
        for clave, valor in registro.resumen.items():
            self.stdout.write(f'  {clave}: {valor}')
        self.stdout.write(self.style.SUCCESS('Vista previa lista.' if opciones['simular'] else 'Inventario listo.'))
