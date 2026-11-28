import { useAuth } from '@/core/auth';

/**
 * Los permisos de Administración (los mismos de `apps.accounts.permisos_admin`).
 * Cada sección se abre con su permiso de ver, y el de cambiar va dentro.
 *
 * Lo que ninguno da, porque es solo del administrador: volver administrador a
 * alguien, dar accesos (apps, roles y permisos), editar la cuenta de otro
 * administrador y eliminar apps o roles.
 */
export const PERMISOS_ADMIN = {
  verUsuarios: 'admin:users:view',
  editarUsuarios: 'admin:users:manage',
  verAreas: 'admin:areas:view',
  verApps: 'admin:applications:view',
  editarApps: 'admin:applications:manage',
  verRoles: 'admin:roles:view',
  editarRoles: 'admin:roles:manage',
  odoo: 'admin:odoo:manage',
} as const;

/** Con cualquiera se entra a Administración. */
export const TODOS_LOS_PERMISOS_ADMIN = Object.values(PERMISOS_ADMIN);

/** Ver la lista y el detalle de las personas (editar lo incluye). */
export const PARA_VER_USUARIOS = [PERMISOS_ADMIN.verUsuarios, PERMISOS_ADMIN.editarUsuarios];

/** Ver las aplicaciones y el detalle de cada una (editar lo incluye). */
export const PARA_VER_APPS = [PERMISOS_ADMIN.verApps, PERMISOS_ADMIN.editarApps];

/** Qué puede hacer la persona en sesión dentro de Administración. */
export function usePermisosAdmin() {
  const { user, can } = useAuth();
  const P = PERMISOS_ADMIN;
  return {
    esAdmin: !!user?.isAdmin,
    verUsuarios: can(P.verUsuarios) || can(P.editarUsuarios),
    editarUsuarios: can(P.editarUsuarios),
    verAreas: can(P.verAreas),
    verApps: can(P.verApps) || can(P.editarApps),
    editarApps: can(P.editarApps),
    verRoles: can(P.verRoles) || can(P.editarRoles),
    editarRoles: can(P.editarRoles),
    odoo: can(P.odoo),
    /** Los códigos de los roles que tiene: con «editar roles» no se tocan. */
    misRoles: user?.roles ?? [],
  };
}
