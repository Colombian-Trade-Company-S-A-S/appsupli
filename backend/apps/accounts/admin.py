"""
Desde aquí se administra TODO el acceso:
usuario → aplicaciones, roles y permisos adicionales.
"""
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import Application, Area, Permission, Role, User


class PermissionInline(admin.TabularInline):
    model = Permission
    extra = 0


@admin.register(Application)
class ApplicationAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'base_path', 'order', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name', 'code')
    prepopulated_fields = {'code': ('name',)}
    inlines = [PermissionInline]


@admin.register(Area)
class AreaAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('name',)


@admin.register(Permission)
class PermissionAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'application')
    list_filter = ('application',)
    search_fields = ('code', 'name')


@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    list_display = ('name', 'code', 'permission_count')
    search_fields = ('name', 'code')
    filter_horizontal = ('permissions',)
    prepopulated_fields = {'code': ('name',)}

    @admin.display(description='permisos')
    def permission_count(self, obj: Role) -> int:
        return obj.permissions.count()


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ('first_name', 'last_name')
    list_display = ('full_name', 'email', 'area', 'position', 'kind', 'is_active')
    list_filter = ('is_active', 'kind', 'area', 'roles', 'applications')
    autocomplete_fields = ('manager', 'area')
    search_fields = ('first_name', 'last_name', 'email', 'username')
    filter_horizontal = ('applications', 'roles', 'extra_permissions', 'groups', 'user_permissions')

    fieldsets = (
        (None, {'fields': ('email', 'username', 'password')}),
        ('Datos personales', {
            'fields': (
                'first_name', 'last_name', 'area', 'position', 'phone', 'manager', 'avatar_url',
            )
        }),
        ('Accesos', {
            'fields': ('kind', 'applications', 'roles', 'extra_permissions'),
            'description': 'El tipo <b>Admin</b> entra a todas las apps con todos los permisos.',
        }),
        ('Estado', {'fields': ('is_active', 'is_staff', 'is_superuser')}),
        ('Fechas', {'fields': ('last_login_at', 'created_at', 'updated_at')}),
    )
    readonly_fields = ('last_login_at', 'created_at', 'updated_at')

    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('email', 'username', 'first_name', 'last_name', 'password1', 'password2'),
        }),
    )
