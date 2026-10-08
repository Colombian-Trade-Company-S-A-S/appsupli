"""
`manage.py sync_odoo` — la misma sincronización del botón de Administración.

Sirve para dispararla desde una tarea programada (cron de Render o GitHub
Actions). Sin opciones hace las tres: crear, actualizar y desactivar.
"""
from django.core.management.base import BaseCommand, CommandError

from apps.odoo.sync import sincronizar


class Command(BaseCommand):
    help = 'Trae empleados y departamentos de Odoo y los guarda en la base de appsupli.'

    def add_arguments(self, parser):
        parser.add_argument('--solo-crear', action='store_true', help='Solo crea los que faltan.')
        parser.add_argument('--solo-actualizar', action='store_true', help='Solo actualiza los que ya están.')
        parser.add_argument('--sin-desactivar', action='store_true', help='No desactiva las bajas.')
        parser.add_argument(
            '--eliminar', action='store_true',
            help='Borra, con sus registros, a quien no está en Odoo (nunca a un admin).',
        )
        parser.add_argument('--simular', action='store_true', help='Calcula los cambios sin guardar nada.')

    def handle(self, *args, **opciones):
        solo = opciones['solo_crear'] or opciones['solo_actualizar']
        registro = sincronizar(
            crear=opciones['solo_crear'] or not solo,
            actualizar=opciones['solo_actualizar'] or not solo,
            desactivar=not (solo or opciones['sin_desactivar']),
            eliminar=opciones['eliminar'],
            simular=opciones['simular'],
        )
        if registro.estado != registro.Estado.OK:
            raise CommandError(registro.error)
        for clave, valor in sorted(registro.resumen.items()):
            self.stdout.write(f'  {clave}: {valor}')
        self.stdout.write(f'  excepciones: {len(registro.excepciones)}')
        self.stdout.write(self.style.SUCCESS('Vista previa lista.' if registro.simulacion else 'Sincronización lista.'))
