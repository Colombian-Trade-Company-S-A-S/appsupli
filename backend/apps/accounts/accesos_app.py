"""
Los accesos de una app vistos desde la app: quién entra y con qué.

Es lo mismo que se edita en la ficha de cada persona, pero al revés: aquí se
parte de la app y se reparte entre las personas. Darlos y quitarlos es solo
del administrador de la plataforma.

Una persona entra a una app si la tiene asignada, si tiene alguno de sus
permisos sueltos o si tiene un rol que da alguno (como en `User`).
"""
from django.conf import settings
from django.db import transaction
from django.db.models import Prefetch, Q
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from .models import Application, Area, Permission, Role, User

#: Lo que se lee de cada persona: la foto no viaja, basta su fecha.
COLUMNAS = (
    'id', 'email', 'first_name', 'last_name', 'position', 'kind', 'is_superuser',
    'foto_actualizada_at', 'area', 'area__name',
)


def roles_de(app: Application) -> list[int]:
    """Los roles que dan algún permiso de la app."""
    return list(
        Role.objects.filter(permissions__application=app).values_list('pk', flat=True).distinct()
    )


def personas_con_acceso(app: Application) -> list[dict]:
    """
    Las personas activas que entran a la app, cada una con cómo entra: si la
    tiene asignada, qué roles de la app tiene y qué permisos sueltos. Cuatro
    consultas para cualquier número de personas; los roles de la app van como
    subconsulta, sin un viaje aparte a la base.
    """
    from .fotos import ruta_de_foto  # noqa: PLC0415 — fotos importa los serializers

    roles = Role.objects.filter(permissions__application=app).values('pk')
    personas = (
        User.objects.filter(is_active=True)
        .filter(
            Q(applications=app) | Q(roles__in=roles) | Q(extra_permissions__application=app)
        )
        .distinct()
        .select_related('area')
        .only(*COLUMNAS)
        .prefetch_related(
            Prefetch(
                'applications',
                queryset=Application.objects.filter(pk=app.pk).only('id'),
                to_attr='app_asignada',
            ),
            Prefetch('roles', queryset=Role.objects.filter(pk__in=roles).only('id'), to_attr='rs'),
            Prefetch(
                'extra_permissions',
                queryset=Permission.objects.filter(application=app).only('id'),
                to_attr='ps',
            ),
        )
        .order_by('first_name', 'last_name')
    )
    return [
        {
            'id': p.pk,
            'full_name': p.full_name,
            'first_name': p.first_name,
            'email': p.email,
            'position': p.position,
            'area_name': p.area.name if p.area else '',
            'foto': ruta_de_foto(p),
            'destacado': (p.email or '').lower() in settings.USUARIOS_DESTACADOS,
            'is_admin': p.is_admin,
            'asignada': bool(p.app_asignada),
            'roles': [r.pk for r in p.rs],
            'permisos': [x.pk for x in p.ps],
        }
        for p in personas
    ]


class CambioDeAccesoSerializer(serializers.Serializer):
    """Qué se le da o se le quita a quién: la app, uno de sus roles o uno de sus permisos."""

    usuario = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(is_active=True))
    tipo = serializers.ChoiceField(choices=('app', 'rol', 'permiso'))
    id = serializers.IntegerField(required=False)


class AsignacionMasivaSerializer(serializers.Serializer):
    """A todos o a un área: solo la app, para que entren."""

    todos = serializers.BooleanField(required=False, default=False)
    area = serializers.PrimaryKeyRelatedField(
        queryset=Area.objects.all(), required=False, allow_null=True
    )

    def validate(self, datos):
        if not datos.get('todos') and not datos.get('area'):
            raise ValidationError('Elige «todos» o un área.')
        return datos


def asignar_a_muchos(app: Application, area: Area | None = None) -> int:
    """
    Le asigna la app a todos (o a los de un área): solo entrar, sin roles ni
    permisos. A quien está activo y puede iniciar sesión; los administradores
    ya entran a todo. Quien ya la tiene queda igual. Devuelve cuántos se sumaron.
    """
    personas = (
        User.objects.filter(is_active=True, is_superuser=False)
        .exclude(kind=User.Kind.ADMIN)
        .exclude(email__isnull=True)
        .exclude(email='')
        .exclude(applications=app)
    )
    if area is not None:
        personas = personas.filter(area=area)
    nuevas = list(personas.values_list('pk', flat=True))
    app.users.add(*nuevas)
    return len(nuevas)


def _rol(app: Application, pk: int | None) -> Role:
    rol = Role.objects.filter(pk=pk, permissions__application=app).distinct().first()
    if rol is None:
        raise ValidationError({'id': 'Ese rol no da permisos en esta aplicación.'})
    return rol


def _permiso(app: Application, pk: int | None) -> Permission:
    permiso = Permission.objects.filter(pk=pk, application=app).first()
    if permiso is None:
        raise ValidationError({'id': 'Ese permiso no es de esta aplicación.'})
    return permiso


@transaction.atomic
def dar_acceso(app: Application, usuario: User, tipo: str, pk: int | None) -> None:
    """
    Como marcar la casilla en la ficha de la persona: un permiso de adentro
    trae el de afuera (solo no vale) y un permiso suelto trae la app.
    """
    if tipo == 'app':
        usuario.applications.add(app)
    elif tipo == 'rol':
        usuario.roles.add(_rol(app, pk))
    else:
        permiso = _permiso(app, pk)
        usuario.extra_permissions.add(permiso, *([permiso.parent] if permiso.parent else []))
        usuario.applications.add(app)


@transaction.atomic
def quitar_acceso(app: Application, usuario: User, tipo: str, pk: int | None) -> None:
    """
    - `permiso`: el suelto y los que van dentro de él.
    - `rol`: el rol entero (también lo que da en otras apps).
    - `app`: todo lo que tiene en la app: asignación, permisos sueltos y los
      roles que dan permisos en ella. Así deja de entrar.
    """
    if tipo == 'permiso':
        permiso = _permiso(app, pk)
        usuario.extra_permissions.remove(permiso, *permiso.hijos.all())
    elif tipo == 'rol':
        usuario.roles.remove(_rol(app, pk))
    else:
        usuario.applications.remove(app)
        usuario.extra_permissions.remove(*Permission.objects.filter(application=app))
        usuario.roles.remove(*roles_de(app))
