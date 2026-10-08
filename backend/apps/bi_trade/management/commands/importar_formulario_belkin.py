"""
Trae al plan Belkin las respuestas del formulario anterior (Microsoft Forms).

    python manage.py importar_formulario_belkin \\
        --archivo "…/PLAN RECOMIENDAME BELKIN.xlsx" --desde 2026-09-01 --hasta 2026-09-30 \\
        [--simular] [--reemplazar]

Lee la tabla «Ventas_Formulario». Allá el punto y el producto venían pegados
con una barra invertida («Cav Andino \\ C159», «7020178 \\ Spigen…»): se
toma el código y se cruza con las listas del plan. Una fila cuyo punto o
producto no esté en la lista no entra y se cuenta.

El asesor se escribía a mano, y el mismo llegaba de varias formas («Jhon
Cubillos», «John Cubillos»). Se busca por apellido entre los asesores del
punto; si no está ahí pero sí en un solo punto, se le crea en este con el
mismo nombre —el asesor tiene que ser del punto del registro—; y si no
aparece en ninguno, se crea con lo que se escribió. Al final se lista cómo
quedó cada nombre, para revisarlo.

Si en el rango ya hay registros importados (del formulario, sin usuario ni
enlace), se detiene; con `--reemplazar` los borra y vuelve a cargar. Lo que se
registró en la app no se toca.
"""
import re
import unicodedata
from datetime import date, datetime

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from openpyxl import load_workbook

from apps.bi_trade.models import (
    AsesorApple,
    FuenteRegistroBelkin,
    ProductoBelkin,
    PuntoVentaBelkin,
    RegistroBelkin,
)

from .cargar_catalogo_belkin import _texto, leer_tabla

BARRA = '\\'
COLUMNAS_PUNTO = ('Zona Norte:', 'Zona Sur:')
COLUMNAS_PRODUCTO = ('Case Apple', 'Lámina', 'Cable', 'Cargador')
COLUMNA_FECHA = 'Fecha de la Recomendación:'
COLUMNA_ASESOR = 'Nombre y Apellido Asesor Apple:'
COLUMNA_OBSERVACION = '¿Alguna Observación?, es opcional.'


def _fecha(texto: str) -> date:
    try:
        return date.fromisoformat(texto)
    except ValueError as exc:
        raise CommandError(f'«{texto}» no es una fecha AAAA-MM-DD.') from exc


def _tokens(nombre: str) -> list[str]:
    """«Duván  RIAÑO» → ['duvan', 'riano']: sin tildes, sin mayúsculas."""
    plano = unicodedata.normalize('NFD', nombre).encode('ascii', 'ignore').decode().lower()
    return [t for t in re.split(r'[^a-z]+', plano) if len(t) > 1]


class Command(BaseCommand):
    help = 'Importa al plan Belkin las respuestas del formulario anterior en un rango de fechas.'

    def add_arguments(self, parser):
        parser.add_argument('--archivo', required=True)
        parser.add_argument('--desde', required=True, help='AAAA-MM-DD, incluido.')
        parser.add_argument('--hasta', required=True, help='AAAA-MM-DD, incluido.')
        parser.add_argument('--simular', action='store_true')
        parser.add_argument(
            '--reemplazar',
            action='store_true',
            help='Borra lo importado antes en el rango y lo vuelve a cargar.',
        )

    def handle(self, *args, archivo, desde, hasta, simular, reemplazar, **options):
        desde, hasta = _fecha(desde), _fecha(hasta)
        try:
            libro = load_workbook(archivo, data_only=True)
        except Exception as exc:  # noqa: BLE001 — openpyxl lanza de todo
            raise CommandError(f'No se pudo abrir {archivo}: {exc}') from exc
        filas = leer_tabla(libro, 'Ventas_Formulario')

        importados = RegistroBelkin.objects.filter(
            fuente=FuenteRegistroBelkin.FORMULARIO,
            fecha_recomendacion__range=(desde, hasta),
            registrado_por__isnull=True,
            enlace__isnull=True,
        )

        with transaction.atomic():
            if importados.exists():
                if not reemplazar:
                    raise CommandError(
                        f'Ya hay {importados.count()} registros importados entre {desde} y '
                        f'{hasta}. Usa --reemplazar para borrarlos y cargarlos de nuevo.'
                    )
                borrados, _ = importados.delete()
                self.stdout.write(f'Borrados {borrados} registros importados antes.')

            self._importar(filas, desde, hasta)
            if simular:
                transaction.set_rollback(True)
                self.stdout.write(self.style.WARNING('Simulación: no se guardó nada.'))

    def _importar(self, filas: list[dict], desde: date, hasta: date) -> None:
        puntos = {p.pk: p for p in PuntoVentaBelkin.objects.all()}
        productos = set(ProductoBelkin.objects.values_list('pk', flat=True))
        self._asesores = list(AsesorApple.objects.all())
        self._cache: dict[tuple, tuple[AsesorApple, str]] = {}
        self._como_quedo: dict[tuple, str] = {}

        nuevos = []
        sin_punto, sin_producto, fuera = set(), set(), 0
        for fila in filas:
            fecha = fila.get(COLUMNA_FECHA)
            if isinstance(fecha, datetime):
                fecha = fecha.date()
            if not isinstance(fecha, date) or not desde <= fecha <= hasta:
                continue

            celda_punto = next((_texto(fila.get(c)) for c in COLUMNAS_PUNTO if fila.get(c)), '')
            codigo_punto = celda_punto.split(BARRA)[-1].strip().upper()
            celda_producto = next(
                (_texto(fila.get(c)) for c in COLUMNAS_PRODUCTO if fila.get(c)), ''
            )
            codigo_producto = celda_producto.split(BARRA)[0].strip()

            punto = puntos.get(codigo_punto)
            if punto is None:
                sin_punto.add(celda_punto or '(vacío)')
                continue
            if punto.id_regional_id is None:
                fuera += 1
                continue
            if codigo_producto not in productos:
                sin_producto.add(celda_producto or '(vacío)')
                continue

            nuevos.append(
                RegistroBelkin(
                    id_punto_venta=punto,
                    id_asesor=self._asesor(punto, _texto(fila.get(COLUMNA_ASESOR))),
                    id_producto_id=codigo_producto,
                    fecha_recomendacion=fecha,
                    observacion=_texto(fila.get(COLUMNA_OBSERVACION)),
                    fuente=FuenteRegistroBelkin.FORMULARIO,
                )
            )

        RegistroBelkin.objects.bulk_create(nuevos, batch_size=500)

        self.stdout.write('Cómo quedó cada asesor escrito en el formulario:')
        for (codigo, escrito), destino in sorted(self._como_quedo.items()):
            self.stdout.write(f'  {codigo:<6} «{escrito}» → {destino}')
        self.stdout.write(f'Registros cargados: {len(nuevos)} ({desde} a {hasta}).')
        if fuera:
            self.stdout.write(f'Omitidos por ser de un punto fuera de Coltrade: {fuera}.')
        if sin_punto:
            self.stdout.write(f'Puntos que no están en la lista: {", ".join(sorted(sin_punto))}.')
        if sin_producto:
            self.stdout.write(
                f'Productos que no están en la lista: {", ".join(sorted(sin_producto))}.'
            )

    def _asesor(self, punto: PuntoVentaBelkin, escrito: str) -> AsesorApple | None:
        """El asesor del punto que corresponde a lo que se escribió a mano."""
        tokens = _tokens(escrito)
        if not tokens:
            return None
        clave = (punto.pk, ' '.join(tokens))
        if clave not in self._cache:
            self._cache[clave] = self._buscar_o_crear(punto, escrito, tokens[-1])
        asesor, como = self._cache[clave]
        self._como_quedo[(punto.pk, escrito)] = como
        return asesor

    def _buscar_o_crear(self, punto, escrito: str, apellido: str) -> tuple[AsesorApple, str]:
        # El apellido es lo que menos varía: «Jhon» y «John» Cubillos.
        con_apellido = [a for a in self._asesores if apellido in _tokens(a.nombre)]
        en_el_punto = [a for a in con_apellido if a.id_punto_venta_id == punto.pk]
        en_otros = {a.nombre for a in con_apellido}

        if len(en_el_punto) == 1:
            return en_el_punto[0], en_el_punto[0].nombre
        if not en_el_punto and len(en_otros) == 1:
            nombre = en_otros.pop()
            como = f'{nombre} (es de otro punto: se crea también en este)'
        else:
            nombre = ' '.join(parte.capitalize() for parte in escrito.split())
            como = f'{nombre} (nuevo)'
        asesor = AsesorApple.objects.create(nombre=nombre, id_punto_venta=punto)
        self._asesores.append(asesor)
        return asesor, como
