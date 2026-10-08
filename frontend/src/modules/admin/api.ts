import { api, httpClient } from '@/shared/api/http-client';

export interface AdminArea {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  /** Viene de Odoo. Las demás son de antes de la integración. */
  odoo: boolean;
  userCount: number;
}

export interface AdminPermission {
  id: number;
  code: string;
  name: string;
  application: number;
  applicationName: string;
}

export interface AdminApplication {
  id: number;
  code: string;
  name: string;
  description: string;
  basePath: string;
  icon: string;
  order: number;
  isActive: boolean;
  permissions: AdminPermission[];
  userCount: number;
}

export interface AdminRole {
  id: number;
  code: string;
  name: string;
  description: string;
  permissions: number[];
  permissionCodes: string[];
  userCount: number;
}

export type UserKind = 'admin' | 'lider' | 'colaborador';

export interface AdminUser {
  id: number;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  area: number | null;
  areaName: string;
  position: string;
  kind: UserKind;
  phone: string;
  cedula: string;
  direccion: string;
  organizacion: string;
  regional: string;
  odooId: number | null;
  departamentoNombre: string;
  sincronizadoOdooAt: string | null;
  manager: number | null;
  managerName: string;
  isActive: boolean;
  isAdmin: boolean;
  lastLoginAt: string | null;
  applications: number[];
  applicationNames: string[];
  roles: number[];
  roleNames: string[];
  extraPermissions: number[];
}

/**
 * Campos que el formulario envía. Área, cargo, jefe y el resto del organigrama
 * no están: vienen de Odoo y el backend los trata como de solo lectura.
 */
export type AdminUserPayload = Partial<
  Pick<
    AdminUser,
    | 'email'
    | 'username'
    | 'firstName'
    | 'lastName'
    | 'kind'
    | 'phone'
    | 'isActive'
    | 'applications'
    | 'roles'
    | 'extraPermissions'
  >
> & { password?: string };

// ── Odoo ───────────────────────────────────────────────────────────────────
/** Solo si Odoo responde: los datos de la instancia no salen del servidor. */
export interface EstadoOdoo {
  configurado: boolean;
  conectado: boolean;
  mensaje: string;
  ultimaSincronizacion: SincronizacionOdoo | null;
}

export interface ExcepcionOdoo {
  tipo: string;
  odooId: number;
  nombre: string;
  detalle: string;
}

export interface SincronizacionOdoo {
  id: number;
  iniciadaAt: string;
  terminadaAt: string | null;
  ejecutadaPorNombre: string;
  crear: boolean;
  actualizar: boolean;
  desactivar: boolean;
  eliminar: boolean;
  simulacion: boolean;
  estado: 'ok' | 'error';
  resumen: Partial<Record<string, number>>;
  excepciones: ExcepcionOdoo[];
  error: string;
}

export interface OpcionesSincronizacion {
  crear: boolean;
  actualizar: boolean;
  desactivar: boolean;
  eliminar: boolean;
  simular: boolean;
}

const recurso = <T, P>(ruta: string) => ({
  list: (params?: Record<string, unknown>) => api.getList<T>(ruta, params),
  create: (payload: P) => api.post<T>(ruta, payload),
  update: (id: number, payload: P) => api.patch<T>(`${ruta}/${id}`, payload),
  remove: (id: number) => api.delete<void>(`${ruta}/${id}`),
});

export const adminApi = {
  // Sin crear ni borrar: las personas entran y salen con la sincronización de Odoo.
  users: {
    list: (params?: Record<string, unknown>) => api.getList<AdminUser>('/admin/users', params),
    update: (id: number, payload: AdminUserPayload) =>
      api.patch<AdminUser>(`/admin/users/${id}`, payload),
    toggleActive: (id: number) => api.post<AdminUser>(`/admin/users/${id}/toggle-active`),
  },
  // Solo lectura: las áreas vienen de Odoo.
  areas: { list: () => api.getList<AdminArea>('/admin/areas') },
  applications: recurso<AdminApplication, Partial<AdminApplication>>('/admin/applications'),
  roles: recurso<AdminRole, Partial<AdminRole>>('/admin/roles'),
  permissions: {
    list: () => api.getList<AdminPermission>('/admin/permissions'),
  },
  odoo: {
    estado: () => api.get<EstadoOdoo>('/admin/odoo/estado'),
    sincronizar: (opciones: OpcionesSincronizacion) =>
      api.post<SincronizacionOdoo>('/admin/odoo/sincronizar', opciones),
    sincronizaciones: () => api.get<SincronizacionOdoo[]>('/admin/odoo/sincronizaciones'),
    accesosPendientes: () => api.get<{ pendientes: number }>('/admin/odoo/accesos'),
    /** Genera la clave de quien no tiene y descarga el Excel. Solo se ve una vez. */
    descargarAccesos: async () => {
      const respuesta = await httpClient.post('/admin/odoo/accesos', undefined, {
        responseType: 'blob',
      });
      const cabecera = String(respuesta.headers['content-disposition'] ?? '');
      const nombre = /filename="?([^"]+)"?/.exec(cabecera)?.[1] ?? 'accesos-appsupli.xlsx';
      const objeto = URL.createObjectURL(respuesta.data as Blob);
      const enlace = document.createElement('a');
      enlace.href = objeto;
      enlace.download = nombre;
      enlace.click();
      URL.revokeObjectURL(objeto);
    },
  },
};
