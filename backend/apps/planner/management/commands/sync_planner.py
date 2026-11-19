"""
Lee Planner desde una tarea programada (cron de Render).

    python manage.py sync_planner --tipo diaria   # todas las noches, 02:00 COT
    python manage.py sync_planner --tipo corte    # lunes y martes, 09:00 COT

El corte (decisión 1 de People) es el lunes a las 9:00, o el martes a las 9:00
si el lunes es festivo. Por eso el cron corre los dos días y el comando no
hace nada el día que no toca. En una sola corrida cierra la semana anterior y
toma la línea base de la nueva.

`--tipo cierre` y `--tipo linea_base` hacen solo una de las dos partes (para
reponer un corte a mano), y `--forzar` reemplaza una foto que ya existe.
"""

from datetime import datetime

from django.core.management.base import BaseCommand, CommandError

from apps.planner.models import Sincronizacion
from apps.planner.semanas import COT, Semana, es_dia_de_corte
from apps.planner.sync import sincronizar

TIPOS = ('diaria', 'corte', 'linea_base', 'cierre')


class Command(BaseCommand):
    help = 'Lee los planes de Planner y guarda la foto de la semana.'

    def add_arguments(self, parser):
        parser.add_argument('--tipo', choices=TIPOS, default='diaria')
        parser.add_argument(
            '--semana', help='Semana ISO, p. ej. 2026-W46 (por defecto, la que toca).'
        )
        parser.add_argument(
            '--forzar', action='store_true', help='Reemplaza una foto que ya existe.'
        )

    def handle(self, *args, tipo, semana, forzar, **opciones):
        elegida = None
        if semana:
            try:
                elegida = Semana.desde_codigo(semana)
            except ValueError as e:
                raise CommandError(str(e)) from None

        if tipo == 'corte':
            if not es_dia_de_corte() and not forzar:
                self.stdout.write(
                    'Hoy no hay corte (es el lunes, o el martes si el lunes es festivo).'
                )
                return
            # La semana del día del corte, aunque el reloj del cron vaya unos
            # segundos antes de las 9.
            nueva = elegida or Semana.de_fecha(datetime.now(tz=COT).date())
            self._correr(Sincronizacion.Tipo.CIERRE, nueva.anterior(), forzar)
            self._correr(Sincronizacion.Tipo.LINEA_BASE, nueva, forzar)
            return

        tipos = {
            'diaria': Sincronizacion.Tipo.DIARIA,
            'linea_base': Sincronizacion.Tipo.LINEA_BASE,
            'cierre': Sincronizacion.Tipo.CIERRE,
        }
        self._correr(tipos[tipo], elegida, forzar)

    def _correr(self, tipo, semana, forzar):
        registro = sincronizar(tipo, semana=semana, forzar=forzar)
        self.stdout.write(
            f'{registro.get_tipo_display()} WEEK {registro.semana}: '
            f'{registro.get_estado_display()} · '
            f'{registro.planes_leidos} plan(es) · {registro.resumen}'
        )
        if registro.estado == Sincronizacion.Estado.ERROR:
            raise CommandError(registro.error or 'La lectura falló.')
