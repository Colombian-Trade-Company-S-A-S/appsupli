"""
Escribe las guías de uso de BI Trade en PDF, una por informe.

Son las mismas que baja el botón «Exportar PDF de uso» de cada tablero. Por
defecto van a la carpeta «BI Trade Marketing» de la raíz del repo; con
`--carpeta` a otra.
"""
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

from apps.bi_trade.guias import ORDEN, nombre_de, pdf_de


class Command(BaseCommand):
    help = 'Escribe en PDF la guía de uso de cada informe de BI Trade.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--carpeta',
            default=str(Path(settings.BASE_DIR).parent / 'BI Trade Marketing'),
            help='Dónde dejar los PDF. Por defecto, «BI Trade Marketing» en la raíz del repo.',
        )

    def handle(self, *args, carpeta, **options):
        destino = Path(carpeta)
        destino.mkdir(parents=True, exist_ok=True)
        for numero, informe in enumerate(ORDEN, 1):
            archivo = destino / f'{numero}. {nombre_de(informe)}'
            archivo.write_bytes(pdf_de(informe))
            self.stdout.write(f'{archivo.name}')
        self.stdout.write(self.style.SUCCESS(f'{len(ORDEN)} guías en {destino}'))
