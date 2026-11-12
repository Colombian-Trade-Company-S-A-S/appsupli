import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/shared/api/http-client';
import { plannerApi, type FiltrosDashboard, type ParametrosPayload } from './api';

export const plannerKeys = {
  todo: ['planner'] as const,
  opciones: () => ['planner', 'opciones'] as const,
  mi: (semana?: string) => ['planner', 'mi', semana ?? 'actual'] as const,
  persona: (id: number, semana?: string) => ['planner', 'persona', id, semana ?? 'actual'] as const,
  dashboard: (filtros: FiltrosDashboard) => ['planner', 'dashboard', filtros] as const,
  hitos: (semana?: string, lider?: number) =>
    ['planner', 'hitos', semana ?? '', lider ?? 0] as const,
  conexion: () => ['planner', 'conexion'] as const,
  planes: () => ['planner', 'planes'] as const,
  parametros: () => ['planner', 'parametros'] as const,
};

export const useOpcionesPlanner = () =>
  useQuery({
    queryKey: plannerKeys.opciones(),
    queryFn: () => plannerApi.opciones(),
    staleTime: 5 * 60 * 1000,
  });

export const useMiCumplimiento = (semana?: string) =>
  useQuery({
    queryKey: plannerKeys.mi(semana),
    queryFn: () => plannerApi.miCumplimiento(semana),
    placeholderData: keepPreviousData,
  });

export const useCumplimientoPersona = (id: number | null, semana?: string) =>
  useQuery({
    queryKey: plannerKeys.persona(id ?? 0, semana),
    queryFn: () => plannerApi.persona(id as number, semana),
    enabled: id !== null,
  });

export const useDashboardPlanner = (filtros: FiltrosDashboard) =>
  useQuery({
    queryKey: plannerKeys.dashboard(filtros),
    queryFn: () => plannerApi.dashboard(filtros),
    placeholderData: keepPreviousData,
  });

export const useHitos = (semana?: string, lider?: number) =>
  useQuery({
    queryKey: plannerKeys.hitos(semana, lider),
    queryFn: () => plannerApi.hitos(semana, lider),
    placeholderData: keepPreviousData,
  });

export const useConexion = (probar = false) =>
  useQuery({
    queryKey: [...plannerKeys.conexion(), probar],
    queryFn: () => plannerApi.conexion(probar),
  });

export const usePlanes = () =>
  useQuery({ queryKey: plannerKeys.planes(), queryFn: () => plannerApi.planes() });

export const useParametrosPlanner = () =>
  useQuery({ queryKey: plannerKeys.parametros(), queryFn: () => plannerApi.parametros() });

const mensajeDeError = (error: unknown, porDefecto: string) => {
  if (error instanceof ApiError) {
    const porCampo = error.errors && Object.values(error.errors)[0]?.[0];
    return porCampo ?? error.message;
  }
  return porDefecto;
};

/** Toda escritura refresca el módulo entero: un Hito validado cambia el índice y el dashboard. */
function usePlannerMutation<TDatos, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TDatos>,
  exito: string | ((datos: TDatos) => string),
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (datos) => {
      queryClient.invalidateQueries({ queryKey: plannerKeys.todo });
      toast.success(typeof exito === 'function' ? exito(datos) : exito);
    },
    onError: (error) => toast.error(mensajeDeError(error, 'No se pudo guardar.')),
  });
}

export const useValidarHito = () =>
  usePlannerMutation(
    ({
      id,
      estado,
      comentario,
    }: {
      id: number;
      estado: 'cumplido' | 'no_cumplido';
      comentario: string;
    }) => plannerApi.validarHito(id, estado, comentario),
    (datos) => `${datos.mensaje} Ya se refleja en el dashboard.`,
  );

export const useSincronizar = () =>
  usePlannerMutation(
    () => plannerApi.sincronizar(),
    (lectura) =>
      lectura.estado === 'error'
        ? `La lectura falló: ${lectura.error || 'revisa la bitácora.'}`
        : `Sincronización lista: ${lectura.planesLeidos} planes leídos.`,
  );

export const useInventario = () =>
  usePlannerMutation(
    () => plannerApi.inventario(),
    (lectura) =>
      `Inventario listo: ${lectura.resumen.planes ?? 0} planes, ${lectura.resumen.vinculados ?? 0} relacionados.`,
  );

export const useEditarPlan = () =>
  usePlannerMutation(
    ({ id, ...cambios }: { id: number; colaborador?: number | null; activo?: boolean }) =>
      plannerApi.editarPlan(id, cambios),
    'Relación guardada',
  );

export const useGuardarParametros = () =>
  usePlannerMutation(
    (payload: ParametrosPayload) => plannerApi.guardarParametros(payload),
    'Versión guardada. Ya aplica a las semanas abiertas.',
  );
