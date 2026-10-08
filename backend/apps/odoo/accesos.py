"""
Accesos para quienes llegaron de Odoo sin clave: se les genera una y sale en un Excel.

La contraseña solo existe en ese archivo: en la base queda cifrada, como
cualquier otra, y no se puede volver a leer. Si el archivo se pierde, se
genera de nuevo desde el formulario del usuario.
"""
from django.conf import settings
from django.utils import timezone
from django.utils.crypto import get_random_string

from apps.accounts.models import User
from apps.core.excel import ColumnaExport, construir_export

# Sin caracteres que se confunden al dictarlos o copiarlos: 0/O, 1/l/I.
ALFABETO = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'

COLUMNAS = [
    ColumnaExport('Nombre', 'nombre'),
    ColumnaExport('Correo (usuario de ingreso)', 'correo'),
    ColumnaExport('Contraseña', 'clave'),
    ColumnaExport('Cargo', 'cargo'),
    ColumnaExport('Área', 'area'),
    ColumnaExport('Dirección', 'direccion'),
    ColumnaExport('Jefe directo', 'jefe'),
    ColumnaExport('Aplicaciones', 'aplicaciones'),
    ColumnaExport('Enlace', 'enlace'),
]


def pendientes_de_acceso():
    """Quienes vienen de Odoo, están activos, tienen correo y todavía no tienen clave."""
    candidatos = (
        User.objects.filter(odoo_id__isnull=False, is_active=True, email__isnull=False)
        .select_related('area', 'manager')
        .prefetch_related('applications')
        .order_by('first_name', 'last_name')
    )
    return [u for u in candidatos if not u.has_usable_password()]


def generar_accesos() -> tuple[int, bytes]:
    filas = []
    for usuario in pendientes_de_acceso():
        clave = get_random_string(12, ALFABETO)
        usuario.set_password(clave)
        usuario.save(update_fields=['password', 'updated_at'])
        filas.append({
            'nombre': usuario.full_name,
            'correo': usuario.email,
            'clave': clave,
            'cargo': usuario.position,
            'area': usuario.area.name if usuario.area else '',
            'direccion': usuario.direccion,
            'jefe': usuario.manager.full_name if usuario.manager else '',
            'aplicaciones': ', '.join(a.name for a in usuario.applications.all()) or 'Sin asignar',
            'enlace': settings.FRONTEND_URL,
        })
    return len(filas), construir_export('Accesos', COLUMNAS, filas)


def nombre_archivo() -> str:
    return f'accesos-appsupli-{timezone.localtime():%Y%m%d-%H%M}.xlsx'
