"""
Vuelve a correr el motor de cálculo sobre los ciclos indicados.

    python manage.py recalcular_valoracion            # todos los ciclos
    python manage.py recalcular_valoracion --ciclo 3

Sirve tras corregir pesos, reabrir evaluaciones o cambiar el banco de preguntas.
"""
from django.core.management.base import BaseCommand

from apps.valoracion import scoring
from apps.valoracion.models import Cycle


class Command(BaseCommand):
    help = 'Recalcula los resultados consolidados de la valoración.'

    def add_arguments(self, parser):
        parser.add_argument('--ciclo', type=int, dest='ciclo', help='ID de un ciclo puntual.')

    def handle(self, *args, **options):
        ciclos = Cycle.objects.all()
        if options.get('ciclo'):
            ciclos = ciclos.filter(pk=options['ciclo'])
            if not ciclos.exists():
                self.stderr.write(self.style.ERROR(f'No existe el ciclo {options["ciclo"]}.'))
                return

        total = 0
        for ciclo in ciclos:
            procesados = scoring.recompute_cycle(ciclo)
            total += procesados
            self.stdout.write(f'{ciclo.name}: {procesados} persona(s).')

        self.stdout.write(self.style.SUCCESS(f'Listo. {total} resultado(s) recalculados.'))
