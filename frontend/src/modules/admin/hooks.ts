import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/shared/api/http-client';
import { adminApi } from './api';

export const adminKeys = {
  todo: ['admin'] as const,
  users: (filtros?: Record<string, unknown>) => ['admin', 'users', filtros ?? {}] as const,
  areas: () => ['admin', 'areas'] as const,
  applications: () => ['admin', 'applications'] as const,
  roles: () => ['admin', 'roles'] as const,
  permissions: () => ['admin', 'permissions'] as const,
};

export function useAdminUsers(filtros: Record<string, unknown>) {
  return useQuery({
    queryKey: adminKeys.users(filtros),
    queryFn: () => adminApi.users.list({ ...filtros, page_size: 200 }),
  });
}

export const useAreas = () =>
  useQuery({ queryKey: adminKeys.areas(), queryFn: () => adminApi.areas.list() });

export const useApplications = () =>
  useQuery({ queryKey: adminKeys.applications(), queryFn: () => adminApi.applications.list() });

export const useRoles = () =>
  useQuery({ queryKey: adminKeys.roles(), queryFn: () => adminApi.roles.list() });

export const usePermissions = () =>
  useQuery({ queryKey: adminKeys.permissions(), queryFn: () => adminApi.permissions.list() });

const mensajeDeError = (error: unknown) => {
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
export function useAdminMutation<TVars, TData>(
  fn: (vars: TVars) => Promise<TData>,
  exito: string,
) {
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
