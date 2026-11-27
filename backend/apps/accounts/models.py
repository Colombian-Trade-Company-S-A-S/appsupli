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
from datetime import timedelta

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
    odoo = models.BooleanField(
        'viene de Odoo', default=False,
        help_text='La marca la sincronización. Las áreas solo se crean y cambian desde Odoo.',
    )

    class Meta:
        verbose_name = 'área'
        verbose_name_plural = 'áreas'
        ordering = ('name',)

    def __str__(self) -> str:
        return self.name


class Departamento(TimeStampedModel):
    """
    Departamento tal como está en Odoo, con su padre para reconstruir el árbol.

    La raíz de una rama con hijos es la dirección; el segundo nivel, el área; la
    hoja, el equipo. Una raíz sin hijos (TECH, PEOPLE…) es un área que no cuelga
    de ninguna dirección. No se parte `complete_name` por «/»: hay nombres que
    lo llevan dentro.
    """

    odoo_id = models.PositiveIntegerField('id en Odoo', unique=True)
    nombre = models.CharField('nombre', max_length=200)
    padre = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='hijos',
        verbose_name='departamento padre',
    )
    activo = models.BooleanField('activo', default=True)

    class Meta:
        verbose_name = 'departamento'
        verbose_name_plural = 'departamentos'
        ordering = ('nombre',)

    def __str__(self) -> str:
        return ' / '.join(d.nombre for d in self.ruta())

    def ruta(self) -> list['Departamento']:
        """De la raíz a este departamento. Corta si Odoo trajera un ciclo."""
        cadena, actual, vistos = [], self, set()
        while actual and actual.pk not in vistos:
            vistos.add(actual.pk)
            cadena.append(actual)
            actual = actual.padre
        return cadena[::-1]


#: El código de la app de Administración: es la única que no se reparte, porque
#: solo entra la cuenta de tipo Administrador (`User.is_admin`).
APP_ADMINISTRACION = 'admin'


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
    # Para quien reparte accesos sin saber de código: qué puede hacer la
    # persona con este permiso, en sus palabras. Se ve al editar un usuario.
    description = models.TextField('qué permite', blank=True)
    # Cómo se agrupan dentro de la app al editar un usuario: «Informes que puede
    # ver», «Qué puede cargar y editar»… Vacío, van sueltos.
    group = models.CharField('grupo', max_length=80, blank=True)
    order = models.PositiveIntegerField('orden', default=100)
    # Un permiso que solo tiene sentido con otro: en BI Trade, «cargar ventas de
    # HC» va dentro de «ver el informe de HC». Al editar un usuario se muestra
    # adentro del otro, y quitar el de afuera quita también los de adentro.
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='hijos',
        verbose_name='va dentro de',
    )

    class Meta:
        verbose_name = 'permiso'
        verbose_name_plural = 'permisos'
        ordering = ('application__order', 'order', 'code')

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
    """Solo los colores de marca del brandbook de Supli."""

    VIOLET = 'violet', 'Morado'
    INDIGO = 'indigo', 'Morado oscuro'
    BLUE = 'blue', 'Azul'


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

    # Nulo a propósito: los asesores y promotores de punto de venta no tienen
    # correo corporativo, y aun así tienen que existir en la plataforma —su
    # jefe les registra objetivos y entran en los rankings—. Sin correo no se
    # puede iniciar sesión, que es justo la situación de ese personal hasta que
    # se defina cómo va a ingresar.
    email = models.EmailField(
        'correo corporativo', unique=True, null=True, blank=True,
        help_text='Vacío solo para quien no tiene cuenta corporativa (asesores y promotores).',
    )
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
    # La foto de perfil vive en la base y no en disco: el disco de Render se
    # borra en cada despliegue. Es pequeña (el navegador la reduce antes de
    # subirla y la de Odoo llega en 512 px). Se sincroniza con Odoo en ambos
    # sentidos: la que se sube acá se escribe en el empleado de Odoo, y la que
    # cambian en Odoo llega con la sincronización.
    foto = models.BinaryField('foto de perfil', null=True, blank=True, editable=False)
    foto_tipo = models.CharField('tipo de la foto', max_length=30, blank=True, editable=False)
    foto_actualizada_at = models.DateTimeField(
        'foto actualizada el', null=True, blank=True, editable=False
    )

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
    pais = models.CharField(
        'país', max_length=80, blank=True,
        help_text='Colombia, Perú… Lo mantiene Odoo cuando entre la integración.',
    )
    # Ejecución Planner: si la persona entra en la medición (decisión 5 de
    # People). Lo enciende quien administra los usuarios.
    # `db_default`: la versión anterior de la app no conoce estas columnas y
    # tiene que poder seguir creando usuarios mientras se despliega la nueva.
    medir_planner = models.BooleanField(
        'se mide en Planner',
        default=False,
        db_default=False,
        help_text='Encendido: su plan de Planner entra en la medición semanal.',
    )
    planner_url = models.URLField(
        'URL de Planner',
        max_length=500,
        blank=True,
        default='',
        db_default='',
        help_text='El enlace de su plan en Planner. Es el plan que mide Ejecución Planner.',
    )

    # ── Odoo: la copia local de lo que dice Recursos Humanos ──────────────
    # La sincronización solo lee de Odoo y escribe aquí. Si Odoo se cae, la
    # plataforma sigue con la última copia.
    odoo_id = models.PositiveIntegerField(
        'id en Odoo', unique=True, null=True, blank=True,
        help_text='Vacío para quien no viene de Odoo (cuentas de servicio, admin).',
    )
    cedula = models.CharField('cédula', max_length=30, blank=True)
    departamento = models.ForeignKey(
        Departamento,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='personas',
        verbose_name='departamento',
    )
    sincronizado_odoo_at = models.DateTimeField('última sincronización con Odoo', null=True, blank=True)

    # ── Apariencia: viaja con la cuenta, no con el navegador ──────────────
    theme = models.CharField('tema', max_length=10, choices=Theme.choices, default=Theme.DARK)
    accent = models.CharField(
        'color de acento', max_length=20, choices=Accent.choices, default=Accent.VIOLET
    )
    radius = models.CharField(
        'redondeado', max_length=10, choices=Radius.choices, default=Radius.SHARP
    )

    # ── App instalable ────────────────────────────────────────────────────
    # El aviso sale en el primer inicio de sesión y después cada 15 días,
    # esté instalada o no: sin instalar se le ofrece; instalada, se le recuerda
    # cómo instalarla en otro equipo, por si cambió de celular o de computador.
    app_instalada = models.BooleanField('instaló la app', default=False)
    aviso_app_visto_at = models.DateTimeField(
        'último aviso de la app',
        null=True,
        blank=True,
        help_text='Vacío: nunca lo ha visto y le sale al entrar. Vuelve a salir a los 15 días.',
    )
    # Ya no se usa (era la cuenta de inicios de sesión). Se quita en una
    # migración posterior, cuando la versión anterior de la app ya no corra.
    inicios_para_aviso_app = models.PositiveSmallIntegerField(
        'inicios de sesión para volver a ofrecer la app (en desuso)',
        default=0,
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
        return f'{self.full_name} <{self.email}>' if self.email else self.full_name

    @property
    def puede_iniciar_sesion(self) -> bool:
        """Sin correo no hay forma de entrar, aunque la persona sí exista acá."""
        return bool(self.email) and self.is_active

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
        propias = (
            active.filter(
                models.Q(users=self)
                | models.Q(permissions__roles__users=self)
                | models.Q(permissions__users=self)
            )
            # A Administración solo entra la cuenta de tipo Administrador (así lo
            # exigen su API y su ruta): aunque alguien la tenga asignada o tenga
            # alguno de sus permisos, no se le ofrece en el menú.
            .exclude(code=APP_ADMINISTRACION)
            .distinct()
        )
        # Un sub-módulo arrastra a su contenedor: sin él, el menú no tendría
        # de dónde colgarlo aunque la persona sí tenga acceso al sub-módulo.
        ids = set(propias.values_list('id', flat=True))
        ids |= set(propias.exclude(parent=None).values_list('parent_id', flat=True))
        return active.filter(id__in=ids)

    def has_app_access(self, code: str) -> bool:
        return self.get_accessible_applications().filter(code=code).exists()

    DIAS_ENTRE_AVISOS_APP = 15

    def registrar_inicio_de_sesion(self) -> None:
        """Marca el ingreso."""
        self.last_login_at = timezone.now()
        self.save(update_fields=['last_login_at', 'updated_at'])

    @property
    def aviso_app(self) -> str | None:
        """
        Qué aviso le toca al entrar: `ofrecer` (sin instalar), `recordar`
        (instalada) o ninguno. Sale si nunca lo ha visto —su primer inicio de
        sesión— o si pasaron 15 días desde la última vez que lo respondió.
        """
        if self.aviso_app_visto_at and timezone.now() - self.aviso_app_visto_at < timedelta(
            days=self.DIAS_ENTRE_AVISOS_APP
        ):
            return None
        return 'recordar' if self.app_instalada else 'ofrecer'

    def decidir_instalacion(self, decision: str) -> None:
        """
        `instalada`: la instaló. `despues`: no la quiso aún. `visto`: leyó el
        recordatorio. En los tres casos el aviso vuelve a salir en 15 días.
        """
        if decision == 'instalada':
            self.app_instalada = True
        self.aviso_app_visto_at = timezone.now()
        self.save(update_fields=['app_instalada', 'aviso_app_visto_at', 'updated_at'])
