import { api } from '@/shared/api/http-client';

export interface AdminArea {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
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

/** Campos que el formulario envía; el backend ignora los de solo lectura. */
export type AdminUserPayload = Partial<
  Pick<
    AdminUser,
    | 'email'
    | 'username'
    | 'firstName'
    | 'lastName'
    | 'area'
    | 'position'
    | 'kind'
    | 'phone'
    | 'manager'
    | 'isActive'
    | 'applications'
    | 'roles'
    | 'extraPermissions'
  >
> & { password?: string };

const recurso = <T, P>(ruta: string) => ({
  list: (params?: Record<string, unknown>) => api.getList<T>(ruta, params),
  create: (payload: P) => api.post<T>(ruta, payload),
  update: (id: number, payload: P) => api.patch<T>(`${ruta}/${id}`, payload),
  remove: (id: number) => api.delete<void>(`${ruta}/${id}`),
});

export const adminApi = {
  users: {
    ...recurso<AdminUser, AdminUserPayload>('/admin/users'),
    toggleActive: (id: number) => api.post<AdminUser>(`/admin/users/${id}/toggle-active`),
  },
  areas: recurso<AdminArea, Partial<AdminArea>>('/admin/areas'),
  applications: recurso<AdminApplication, Partial<AdminApplication>>('/admin/applications'),
  roles: recurso<AdminRole, Partial<AdminRole>>('/admin/roles'),
  permissions: {
    list: () => api.getList<AdminPermission>('/admin/permissions'),
  },
};
