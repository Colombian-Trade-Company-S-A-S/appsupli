"""
Modelo de accesos de la plataforma.

    Application  → una app/módulo (BI, Ventas, Inventario...)
    Permission   → una acción dentro de una app ("sales:orders:approve")
    Role         → un paquete de permisos que se asigna a personas
    User         → empleado; acumula accesos por rol + asignaciones directas

Un usuario entra a una app si:
  · es admin (acceso total), o
  · la app está en `applications` (acceso directo), o
  · algún permiso efectivo suyo pertenece a esa app.
"""
from django.contrib.auth.models import AbstractBaseUser, PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel

from .managers import UserManager


class Area(TimeStampedModel):
    """Área o departamento de la compañía (Ventas, Tech, Accounting...)."""

    name = models.CharField('nombre', max_length=100, unique=True)
    description = models.TextField('descripción', blank=True)
    is_active = models.BooleanField('activa', default=True)

    class Meta:
        verbose_name = 'área'
        verbose_name_plural = 'áreas'
        ordering = ('name',)

    def __str__(self) -> str:
        return self.name


class Application(TimeStampedModel):
    """Cada área/aplicación de la empresa dentro de la plataforma."""

    code = models.SlugField('código', max_length=50, unique=True)
    name = models.CharField('nombre', max_length=120)
    description = models.TextField('descripción', blank=True)
    # Ruta e ícono con los que el frontend arma el sidebar.
    base_path = models.CharField('ruta base', max_length=100, help_text='Ej: /ventas')
    icon = models.CharField('ícono', max_length=50, blank=True, help_text='Nombre en lucide-react')
    order = models.PositiveIntegerField('orden', default=100)
    is_active = models.BooleanField('activa', default=True)
    parent = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='children',
        verbose_name='contenedor',
        help_text='Si se llena, esta app es un sub-módulo y cuelga de la otra en el menú.',
    )

    class Meta:
        verbose_name = 'aplicación'
        verbose_name_plural = 'aplicaciones'
        ordering = ('order', 'name')

    def __str__(self) -> str:
        return self.name


class Permission(TimeStampedModel):
    """Acción concreta dentro de una app. Convención: `app:recurso:accion`."""

    application = models.ForeignKey(
        Application, on_delete=models.CASCADE, related_name='permissions', verbose_name='aplicación'
    )
    code = models.CharField('código', max_length=120, unique=True)
    name = models.CharField('nombre', max_length=150)

    class Meta:
        verbose_name = 'permiso'
        verbose_name_plural = 'permisos'
        ordering = ('application__order', 'code')

    def __str__(self) -> str:
        return self.code


class Role(TimeStampedModel):
    """Paquete de permisos reutilizable (Analista BI, Jefe de ventas...)."""

    code = models.SlugField('código', max_length=50, unique=True)
    name = models.CharField('nombre', max_length=120)
    description = models.TextField('descripción', blank=True)
    permissions = models.ManyToManyField(
        Permission, related_name='roles', blank=True, verbose_name='permisos'
    )

    class Meta:
        verbose_name = 'rol'
        verbose_name_plural = 'roles'
        ordering = ('name',)

    def __str__(self) -> str:
        return self.name


class Theme(models.TextChoices):
    LIGHT = 'light', 'Claro'
    DARK = 'dark', 'Oscuro'
    SYSTEM = 'system', 'Sistema'


class Accent(models.TextChoices):
    NEUTRAL = 'neutral', 'Neutro'
    INDIGO = 'indigo', 'Índigo'
    BLUE = 'blue', 'Azul'
    EMERALD = 'emerald', 'Verde'
    AMBER = 'amber', 'Ámbar'
    ROSE = 'rose', 'Rosa'
    VIOLET = 'violet', 'Violeta'


class Radius(models.TextChoices):
    SHARP = 'sharp', 'Recto'
    DEFAULT = 'default', 'Normal'
    ROUNDED = 'rounded', 'Redondeado'


class User(AbstractBaseUser, PermissionsMixin, TimeStampedModel):
    """Empleado de la compañía."""

    class Kind(models.TextChoices):
        ADMIN = 'admin', 'Admin'
        LEADER = 'lider', 'Líder'
        COLLABORATOR = 'colaborador', 'Colaborador'

    email = models.EmailField('correo corporativo', unique=True)
    username = models.CharField('usuario', max_length=80, unique=True)
    first_name = models.CharField('nombres', max_length=100)
    last_name = models.CharField('apellidos', max_length=100, blank=True)

    area = models.ForeignKey(
        Area,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='users',
        verbose_name='área',
    )
    position = models.CharField('cargo', max_length=120, blank=True)
    kind = models.CharField(
        'tipo de usuario', max_length=20, choices=Kind.choices, default=Kind.COLLABORATOR
    )
    manager = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='team',
        verbose_name='jefe directo',
    )
    phone = models.CharField('teléfono', max_length=30, blank=True)
    avatar_url = models.URLField('avatar', blank=True)

    # ── Organigrama extendido ────────────────────────────────────────────
    # Los pide Supli Performance para filtrar el Performance. Quedan vacíos
    # a propósito: People los diligencia cuando tenga la estructura lista, y
    # mientras tanto ningún filtro depende de ellos.
    direccion = models.CharField('dirección', max_length=120, blank=True)
    organizacion = models.CharField('organización', max_length=120, blank=True)
    regional = models.CharField('regional', max_length=120, blank=True)
    punto_venta = models.CharField(
        'CAV / punto de venta', max_length=120, blank=True,
        help_text='Solo aplica para asesores y promotores.',
    )

    # ── Apariencia: viaja con la cuenta, no con el navegador ──────────────
    theme = models.CharField('tema', max_length=10, choices=Theme.choices, default=Theme.SYSTEM)
    accent = models.CharField(
        'color de acento', max_length=20, choices=Accent.choices, default=Accent.NEUTRAL
    )
    radius = models.CharField(
        'redondeado', max_length=10, choices=Radius.choices, default=Radius.DEFAULT
    )

    # ── Accesos: esto es lo que se asigna desde el admin ──────────────────
    roles = models.ManyToManyField(Role, related_name='users', blank=True, verbose_name='roles')
    applications = models.ManyToManyField(
        Application,
        related_name='users',
        blank=True,
        verbose_name='aplicaciones',
        help_text='Apps a las que entra directamente, además de las que le den sus roles.',
    )
    extra_permissions = models.ManyToManyField(
        Permission,
        related_name='users',
        blank=True,
        verbose_name='permisos adicionales',
        help_text='Permisos sueltos que se suman a los de sus roles.',
    )

    is_active = models.BooleanField('activo', default=True)
    is_staff = models.BooleanField('acceso al admin de Django', default=False)
    last_login_at = models.DateTimeField('último ingreso', null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username', 'first_name']

    class Meta:
        verbose_name = 'usuario'
        verbose_name_plural = 'usuarios'
        ordering = ('first_name', 'last_name')

    def __str__(self) -> str:
        return f'{self.full_name} <{self.email}>'

    @property
    def full_name(self) -> str:
        return f'{self.first_name} {self.last_name}'.strip()

    @property
    def is_admin(self) -> bool:
        """Acceso total a todo: el administrador de la plataforma."""
        return self.is_superuser or self.kind == self.Kind.ADMIN

    def get_effective_permissions(self) -> list[str]:
        """Permisos de sus roles + los adicionales. El admin los tiene todos."""
        if self.is_admin:
            return sorted(Permission.objects.values_list('code', flat=True))
        from_roles = Permission.objects.filter(roles__users=self).values_list('code', flat=True)
        extra = self.extra_permissions.values_list('code', flat=True)
        return sorted(set(from_roles) | set(extra))

    def get_accessible_applications(self):
        """Apps activas a las que puede entrar."""
        active = Application.objects.filter(is_active=True)
        if self.is_admin:
            return active
        propias = active.filter(
            models.Q(users=self)
            | models.Q(permissions__roles__users=self)
            | models.Q(permissions__users=self)
        ).distinct()
        # Un sub-módulo arrastra a su contenedor: sin él, el menú no tendría
        # de dónde colgarlo aunque la persona sí tenga acceso al sub-módulo.
        ids = set(propias.values_list('id', flat=True))
        ids |= set(propias.exclude(parent=None).values_list('parent_id', flat=True))
        return active.filter(id__in=ids)

    def has_app_access(self, code: str) -> bool:
        return self.get_accessible_applications().filter(code=code).exists()

    def touch_last_login(self) -> None:
        self.last_login_at = timezone.now()
        self.save(update_fields=['last_login_at', 'updated_at'])
