"""
`manage.py sync_planner` — lee Planner y guarda la foto de la semana.

Para la tarea programada (cron de Render), en hora de Colombia:

    02:00 todos los días  → sync_planner --tipo diaria
    lunes 18:00           → sync_planner --tipo linea_base
    domingo 23:59         → sync_planner --tipo cierre

Render programa en UTC: 07:00, 23:00 y 04:59 del lunes, respectivamente. La
línea base conviene programarla lunes y martes a las 23:00 UTC: el comando
decide si ese día toca (si el lunes es festivo, la toma el martes).
"""
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.planner.models import Sincronizacion
from apps.planner.semanas import COT, Semana
from apps.planner.sync import sincronizar


class Command(BaseCommand):
    help = 'Lee los planes de Planner relacionados y guarda la foto de la semana.'

    def add_arguments(self, parser):
        parser.add_argument('--tipo', choices=['diaria', 'linea_base', 'cierre'], default='diaria')
        parser.add_argument('--semana', help='Semana a leer, p. ej. 2026-W46. Por defecto, la que corresponde.')
        parser.add_argument('--forzar', action='store_true',
                            help='Reemplaza la línea base o el cierre si ya existen.')

    def handle(self, *args, **opciones):
        tipo = opciones['tipo']
        semana = Semana.desde_codigo(opciones['semana']) if opciones['semana'] else None
        if tipo == 'linea_base' and semana is None and not opciones['forzar']:
            hoy = timezone.now().astimezone(COT).date()
            if hoy != Semana.de_fecha(hoy).dia_linea_base:
                self.stdout.write('Hoy no toca la línea base (es festivo o ya se tomó el lunes).')
                return
        registro = sincronizar(tipo, semana=semana, forzar=opciones['forzar'])
        for clave, valor in registro.resumen.items():
            self.stdout.write(f'  {clave}: {valor}')
        for error in registro.errores:
            self.stdout.write(self.style.WARNING(f"  {error.get('plan')}: {error.get('error')}"))
        if registro.estado == Sincronizacion.Estado.ERROR:
            raise CommandError(registro.error or 'La lectura falló.')
        self.stdout.write(self.style.SUCCESS(f'{registro.get_tipo_display()} de WEEK {registro.semana} lista.'))
