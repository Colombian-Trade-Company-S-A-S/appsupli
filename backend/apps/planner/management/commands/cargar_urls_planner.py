"""
`manage.py cargar_urls_planner <excel>` — pone la URL de Planner de cada
persona desde un Excel con las columnas «Colaborador» y «URL Planner».

    python manage.py cargar_urls_planner "Listado de URLs Planner.xlsx" --simular
    python manage.py cargar_urls_planner "Listado de URLs Planner.xlsx"

La persona se busca por su nombre completo, sin tildes ni mayúsculas. El Excel
es la lista completa: quien no está queda sin URL y, por lo tanto, sin plan.
Después de cargar, los planes se ponen al día con las URLs.

Con --simular no escribe nada (sirve aunque la base todavía no tenga el campo).
"""

import re
import unicodedata
from pathlib import Path

import openpyxl
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import User
from apps.planner.enlaces import plan_id_de_url, reconciliar_planes


def fichas(texto: str) -> frozenset[str]:
    """Las palabras de un nombre, sin tildes ni mayúsculas."""
    plano = unicodedata.normalize('NFKD', texto or '').encode('ascii', 'ignore').decode().lower()
    return frozenset(t for t in re.split(r'[^a-z0-9]+', plano) if len(t) > 1)


def persona_de(nombre: str, usuarios: list[User]) -> tuple[User | None, str]:
    """Primero el nombre exacto; si no, el único cuyo nombre contiene todas las palabras."""
    buscadas = fichas(nombre)
    if len(buscadas) < 2:
        return None, 'nombre incompleto'
    completos = {u.id: fichas(f'{u.first_name} {u.last_name}') for u in usuarios}
    exactos = [u for u in usuarios if completos[u.id] == buscadas]
    if len(exactos) == 1:
        return exactos[0], ''
    parecidos = [u for u in usuarios if buscadas <= completos[u.id]]
    if len(parecidos) == 1:
        return parecidos[0], ''
    return None, 'varias personas posibles' if exactos or parecidos else 'no está en la app'


class Command(BaseCommand):
    help = 'Pone la URL de Planner de cada persona desde un Excel (Colaborador, URL Planner).'

    def add_arguments(self, parser):
        parser.add_argument('excel', help='Ruta del Excel.')
        parser.add_argument('--simular', action='store_true', help='Muestra lo que haría.')

    def handle(self, *args, **opciones):
        ruta = Path(opciones['excel'])
        if not ruta.exists():
            raise CommandError(f'No existe el archivo {ruta}.')
        filas = self._leer(ruta)
        usuarios = list(
            User.objects.filter(is_active=True).only('id', 'first_name', 'last_name', 'email')
        )

        cargar: dict[int, tuple[User, str]] = {}
        planes: dict[str, str] = {}
        problemas = []
        for nombre, url in filas:
            persona, motivo = persona_de(nombre, usuarios)
            plan_id = plan_id_de_url(url)
            if persona is None:
                problemas.append(f'{nombre}: {motivo}')
            elif not plan_id:
                problemas.append(f'{nombre}: el enlace no es de un plan')
            elif plan_id in planes:
                problemas.append(f'{nombre}: el mismo plan que {planes[plan_id]}')
            elif persona.id in cargar:
                problemas.append(f'{nombre}: la persona aparece dos veces')
            else:
                planes[plan_id] = nombre
                cargar[persona.id] = (persona, url.strip())

        self.stdout.write(f'Filas: {len(filas)} · se cargan: {len(cargar)}')
        for problema in problemas:
            self.stdout.write(self.style.WARNING(f'  ✗ {problema}'))
        if problemas:
            raise CommandError('Corrige esas filas del Excel y vuelve a correrlo.')
        if opciones['simular']:
            for persona, _ in cargar.values():
                self.stdout.write(f'  ✓ {persona.first_name} {persona.last_name} <{persona.email}>')
            self.stdout.write(self.style.SUCCESS('Simulación lista: no se guardó nada.'))
            return

        with transaction.atomic():
            for persona, url in cargar.values():
                User.objects.filter(pk=persona.pk).update(planner_url=url)
            sin_url = User.objects.exclude(pk__in=cargar).exclude(planner_url='')
            vaciadas = sin_url.update(planner_url='')
            reconciliar_planes()
        self.stdout.write(f'Personas que quedaron sin URL (no están en el Excel): {vaciadas}')
        self.stdout.write(self.style.SUCCESS('URLs de Planner cargadas.'))

    def _leer(self, ruta: Path) -> list[tuple[str, str]]:
        hoja = openpyxl.load_workbook(ruta, read_only=True, data_only=True).active
        filas = hoja.iter_rows(values_only=True)
        encabezado = [str(c or '').strip().lower() for c in next(filas, [])]
        try:
            col_nombre = encabezado.index('colaborador')
            col_url = next(i for i, c in enumerate(encabezado) if 'url' in c)
        except (ValueError, StopIteration):
            raise CommandError(
                'El Excel necesita las columnas «Colaborador» y «URL Planner».'
            ) from None
        return [
            (str(f[col_nombre]).strip(), str(f[col_url] or '').strip())
            for f in filas
            if f and f[col_nombre]
        ]
