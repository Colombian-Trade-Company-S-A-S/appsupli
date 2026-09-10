"""
Importa los usuarios desde el Excel de credenciales.

    python manage.py import_users "C:/ruta/credenciales.xlsx"

Columnas esperadas: Nombre · Apellido · Email · Username · Contrasena nueva ·
Area · Cargo · Tipo de usuario · Jefe directo · Telefono · Activo

Es idempotente: vuelve a correrlo y actualiza los datos sin duplicar.
Las contraseñas solo se fijan al crear el usuario (no pisa cambios posteriores).
"""
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.accounts.models import Area, User

KIND_BY_LABEL = {
    'admin': User.Kind.ADMIN,
    'lider': User.Kind.LEADER,
    'líder': User.Kind.LEADER,
    'colaborador': User.Kind.COLLABORATOR,
}


def clean(value) -> str:
    return str(value).replace('\xa0', ' ').strip() if value is not None else ''


class Command(BaseCommand):
    help = 'Crea o actualiza usuarios a partir del Excel de credenciales.'

    def add_arguments(self, parser):
        parser.add_argument('archivo', type=str, help='Ruta del .xlsx')
        parser.add_argument(
            '--reset-passwords',
            action='store_true',
            help='También reescribe la contraseña de los usuarios que ya existen.',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        try:
            import openpyxl
        except ImportError as exc:
            raise CommandError('Falta openpyxl: pip install openpyxl') from exc

        ruta = Path(options['archivo'])
        if not ruta.exists():
            raise CommandError(f'No existe el archivo: {ruta}')

        hoja = openpyxl.load_workbook(ruta, data_only=True).active
        filas = list(hoja.iter_rows(values_only=True))[1:]

        creados, actualizados = 0, 0
        jefes: dict[str, str] = {}  # email → nombre del jefe

        for fila in filas:
            email = clean(fila[2]).lower()
            if not email:
                continue

            nombre, apellido = clean(fila[0]), clean(fila[1])
            tipo = KIND_BY_LABEL.get(clean(fila[7]).lower(), User.Kind.COLLABORATOR)
            es_admin = tipo == User.Kind.ADMIN

            datos = {
                'username': clean(fila[3]) or email.split('@')[0],
                'first_name': nombre,
                'last_name': apellido,
                'area': (
                    Area.objects.get_or_create(name=clean(fila[5]))[0] if clean(fila[5]) else None
                ),
                'position': clean(fila[6]),
                'kind': tipo,
                'phone': clean(fila[9]),
                'is_active': clean(fila[10]).lower() in ('si', 'sí', 'true', '1'),
                # El admin de la plataforma también entra al admin de Django.
                'is_staff': es_admin,
                'is_superuser': es_admin,
            }

            usuario = User.objects.filter(email=email).first()
            if usuario:
                for campo, valor in datos.items():
                    setattr(usuario, campo, valor)
                if options['reset_passwords']:
                    usuario.set_password(clean(fila[4]))
                usuario.save()
                actualizados += 1
            else:
                usuario = User(email=email, **datos)
                usuario.set_password(clean(fila[4]))
                usuario.save()
                creados += 1

            if clean(fila[8]):
                jefes[email] = clean(fila[8])

        self._asignar_jefes(jefes)

        self.stdout.write(self.style.SUCCESS(f'{creados} creados · {actualizados} actualizados'))
        admins = User.objects.filter(kind=User.Kind.ADMIN)
        self.stdout.write(f'Admins: {", ".join(a.email for a in admins) or "ninguno"}')

    def _asignar_jefes(self, jefes: dict[str, str]) -> None:
        """El Excel trae el jefe por nombre; se resuelve contra los ya creados."""
        por_nombre = {u.full_name.lower(): u for u in User.objects.all()}
        sin_resolver = []

        for email, nombre_jefe in jefes.items():
            jefe = por_nombre.get(nombre_jefe.lower())
            if jefe:
                User.objects.filter(email=email).update(manager=jefe)
            else:
                sin_resolver.append(nombre_jefe)

        if sin_resolver:
            self.stdout.write(
                self.style.WARNING(f'Jefes no encontrados: {", ".join(sorted(set(sin_resolver)))}')
            )
