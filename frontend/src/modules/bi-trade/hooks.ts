import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/shared/api/http-client';
import { biTradeApi, type FiltrosDashboard } from './api';

export const biTradeKeys = {
  todo: ['bi-trade'] as const,
  opciones: () => ['bi-trade', 'opciones'] as const,
  dashboard: (filtros: FiltrosDashboard) => ['bi-trade', 'dashboard', filtros] as const,
  puntosVenta: (filtros?: Record<string, unknown>) =>
    ['bi-trade', 'puntos-venta', filtros ?? {}] as const,
  productos: (filtros?: Record<string, unknown>) =>
    ['bi-trade', 'productos', filtros ?? {}] as const,
  ventas: (filtros?: Record<string, unknown>) => ['bi-trade', 'ventas', filtros ?? {}] as const,
};

const mensajeDeError = (error: unknown) => {
  if (error instanceof ApiError) {
    const porCampo = error.errors && Object.values(error.errors)[0]?.[0];
    return porCampo ?? error.message;
  }
  return 'Ocurrió un error inesperado';
};

/** Invalida las consultas del módulo y avisa con un toast. */
export function useBiTradeMutation<TVars, TData>(
  fn: (vars: TVars) => Promise<TData>,
  exito: string,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: biTradeKeys.todo });
      toast.success(exito);
    },
    onError: (error) => toast.error(mensajeDeError(error)),
  });
}

export const useOpciones = () =>
  useQuery({
    queryKey: biTradeKeys.opciones(),
    queryFn: biTradeApi.opciones,
    staleTime: 5 * 60 * 1000,
  });

export const useDashboard = (filtros: FiltrosDashboard) =>
  useQuery({
    queryKey: biTradeKeys.dashboard(filtros),
    queryFn: () => biTradeApi.dashboard(filtros),
  });

export const usePuntosVenta = (filtros: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: biTradeKeys.puntosVenta(filtros),
    queryFn: () => biTradeApi.puntosVenta.list(filtros),
  });

export const useProductos = (filtros: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: biTradeKeys.productos(filtros),
    queryFn: () => biTradeApi.productos.list(filtros),
  });

export const useVentas = (filtros: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: biTradeKeys.ventas(filtros),
    queryFn: () => biTradeApi.ventas.list(filtros),
  });
