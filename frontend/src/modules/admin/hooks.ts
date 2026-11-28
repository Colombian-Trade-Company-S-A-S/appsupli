import { useMemo } from 'react';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/shared/api/http-client';
import { adminApi } from './api';

export const adminKeys = {
  todo: ['admin'] as const,
  users: (filtros?: Record<string, unknown>) => ['admin', 'users', filtros ?? {}] as const,
  user: (id: number) => ['admin', 'user', id] as const,
  areas: () => ['admin', 'areas'] as const,
  applications: () => ['admin', 'applications'] as const,
  accesosApp: (id: number) => ['admin', 'applications', id, 'accesos'] as const,
  roles: () => ['admin', 'roles'] as const,
  permissions: () => ['admin', 'permissions'] as const,
  sincronizaciones: () => ['admin', 'odoo', 'sincronizaciones'] as const,
  accesosPendientes: () => ['admin', 'odoo', 'accesos'] as const,
};

/**
 * Áreas, apps, roles y permisos casi no cambian, y cada cambio hecho aquí los
 * invalida: no hace falta volver a pedirlos cada 30 s al moverse entre páginas.
 */
const CATALOGO_MS = 5 * 60_000;

// Cada consulta se define una vez: la usan los hooks y la precarga.
const consultas = {
  user: (id: number) =>
    queryOptions({
      queryKey: adminKeys.user(id),
      queryFn: () => adminApi.users.get(id),
      enabled: Number.isFinite(id) && id > 0,
    }),
  areas: () =>
    queryOptions({
      queryKey: adminKeys.areas(),
      queryFn: () => adminApi.areas.list(),
      staleTime: CATALOGO_MS,
    }),
  applications: () =>
    queryOptions({
      queryKey: adminKeys.applications(),
      queryFn: () => adminApi.applications.list(),
      staleTime: CATALOGO_MS,
    }),
  accesosApp: (id: number) =>
    queryOptions({
      queryKey: adminKeys.accesosApp(id),
      queryFn: () => adminApi.applications.accesos(id),
      enabled: Number.isFinite(id) && id > 0,
    }),
  roles: () =>
    queryOptions({
      queryKey: adminKeys.roles(),
      queryFn: () => adminApi.roles.list(),
      staleTime: CATALOGO_MS,
    }),
  permissions: () =>
    queryOptions({
      queryKey: adminKeys.permissions(),
      queryFn: () => adminApi.permissions.list(),
      staleTime: CATALOGO_MS,
    }),
};

export function useAdminUsers(filtros: Record<string, unknown>) {
  return useQuery({
    queryKey: adminKeys.users(filtros),
    queryFn: () => adminApi.users.list({ ...filtros, page_size: 200 }),
    // Mientras llega el resultado de un filtro nuevo se queda la lista
    // anterior: sin esto la tabla se vacía y vuelve el esqueleto cada vez.
    placeholderData: (anterior) => anterior,
  });
}

/** Una persona, para su página de detalle. */
export const useAdminUser = (id: number) => useQuery(consultas.user(id));

export const useAreas = () => useQuery(consultas.areas());

export const useApplications = () => useQuery(consultas.applications());

/** Quién entra a una app y con qué (asignada, roles, permisos sueltos). */
export const useAccesosApp = (id: number) => useQuery(consultas.accesosApp(id));

export const useRoles = () => useQuery(consultas.roles());

export const usePermissions = () => useQuery(consultas.permissions());

/** Las páginas de Administración que se abren desde una lista. */
const paginas = {
  detalle: () => import('./pages/UsuarioDetallePage'),
  editar: () => import('./pages/UsuarioEditarPage'),
  aplicacion: () => import('./pages/AplicacionDetallePage'),
};

/**
 * Adelanta lo que va a necesitar la página a la que la persona está por ir
 * (al pasar el cursor o enfocar el enlace): el código de la página y sus
 * datos. Así, al hacer clic, se abre ya armada en vez de mostrar el
 * esqueleto mientras baja todo. Lo que ya está fresco no se vuelve a pedir.
 */
export function usePrecarga() {
  const queryClient = useQueryClient();
  // Estable: las filas memorizadas de las tablas no se redibujan por ella.
  return useMemo(
    () => ({
      usuario: (id: number, a: 'detalle' | 'editar') => {
        void paginas[a]();
        void queryClient.prefetchQuery(consultas.user(id));
        void queryClient.prefetchQuery(consultas.applications());
        void queryClient.prefetchQuery(consultas.roles());
        if (a === 'detalle') void queryClient.prefetchQuery(consultas.permissions());
      },
      aplicacion: (id: number) => {
        void paginas.aplicacion();
        void queryClient.prefetchQuery(consultas.accesosApp(id));
        void queryClient.prefetchQuery(consultas.roles());
      },
    }),
    [queryClient],
  );
}

export const useSincronizacionesOdoo = () =>
  useQuery({
    queryKey: adminKeys.sincronizaciones(),
    queryFn: () => adminApi.odoo.sincronizaciones(),
  });

export const useAccesosPendientes = () =>
  useQuery({
    queryKey: adminKeys.accesosPendientes(),
    queryFn: () => adminApi.odoo.accesosPendientes(),
  });

export const mensajeDeError = (error: unknown) => {
  if (error instanceof ApiError) {
    const porCampo = error.errors && Object.values(error.errors)[0]?.[0];
    return porCampo ?? error.message;
  }
  return 'Ocurrió un error inesperado';
};

/**
 * Envuelve una mutación del módulo: invalida las consultas de admin y avisa
 * con un toast. Así cada pantalla solo describe qué hace, no cómo se refresca.
 */
export function useAdminMutation<TVars, TData>(fn: (vars: TVars) => Promise<TData>, exito: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.todo });
      toast.success(exito);
    },
    onError: (error) => toast.error(mensajeDeError(error)),
  });
}
