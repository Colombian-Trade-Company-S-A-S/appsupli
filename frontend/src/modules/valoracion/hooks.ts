import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/shared/api/http-client';
import { valoracionApi, type Segmentacion } from './api';

export const valoracionKeys = {
  todo: ['valoracion'] as const,
  resumen: () => ['valoracion', 'resumen'] as const,
  opciones: () => ['valoracion', 'opciones'] as const,
  configuracion: () => ['valoracion', 'configuracion'] as const,
  competencias: () => ['valoracion', 'competencias'] as const,
  preguntas: (filtros?: Record<string, unknown>) =>
    ['valoracion', 'preguntas', filtros ?? {}] as const,
  ciclos: () => ['valoracion', 'ciclos'] as const,
  ciclo: (id: number) => ['valoracion', 'ciclos', id] as const,
  asignaciones: (cicloId: number) => ['valoracion', 'ciclos', cicloId, 'asignaciones'] as const,
  pendientes: (cicloId: number) => ['valoracion', 'ciclos', cicloId, 'pendientes'] as const,
  misEvaluaciones: () => ['valoracion', 'mis-evaluaciones'] as const,
  evaluacion: (id: number) => ['valoracion', 'mis-evaluaciones', id] as const,
  misResultados: () => ['valoracion', 'mis-resultados'] as const,
  resultado: (id: number, filtros?: Record<string, unknown>) =>
    ['valoracion', 'resultados', id, filtros ?? {}] as const,
  equipo: (filtros: Segmentacion) => ['valoracion', 'equipo', filtros] as const,
  dashboard: (filtros: Segmentacion) => ['valoracion', 'dashboard', filtros] as const,
  persona: (id: number, filtros: Segmentacion) =>
    ['valoracion', 'dashboard', 'persona', id, filtros] as const,
  consolidado: (filtros: Segmentacion) => ['valoracion', 'consolidado', filtros] as const,
  planes: (filtros?: Record<string, unknown>) => ['valoracion', 'planes', filtros ?? {}] as const,
  jerarquia: (filtros?: Record<string, unknown>) =>
    ['valoracion', 'jerarquia', filtros ?? {}] as const,
};

const mensajeDeError = (error: unknown) => {
  if (error instanceof ApiError) {
    const porCampo = error.errors && Object.values(error.errors)[0]?.[0];
    return porCampo ?? error.message;
  }
  return 'Ocurrió un error inesperado';
};

/**
 * Envuelve una mutación del módulo: invalida sus consultas y avisa con un
 * toast. Cada pantalla solo describe qué hace, no cómo se refresca.
 */
export function useValoracionMutation<TVars, TData>(
  fn: (vars: TVars) => Promise<TData>,
  exito: string | ((data: TData) => string),
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: valoracionKeys.todo });
      toast.success(typeof exito === 'function' ? exito(data) : exito);
    },
    onError: (error) => toast.error(mensajeDeError(error)),
  });
}

export const useResumen = () =>
  useQuery({ queryKey: valoracionKeys.resumen(), queryFn: valoracionApi.resumen });

export const useOpciones = () =>
  useQuery({
    queryKey: valoracionKeys.opciones(),
    queryFn: valoracionApi.opciones,
    // Áreas, cargos y personas cambian poco: no hace falta refrescarlos siempre.
    staleTime: 5 * 60 * 1000,
  });

export const useConfiguracion = () =>
  useQuery({ queryKey: valoracionKeys.configuracion(), queryFn: valoracionApi.configuracion.get });

export const useCompetencias = () =>
  useQuery({ queryKey: valoracionKeys.competencias(), queryFn: () => valoracionApi.competencias.list() });

export const usePreguntas = (filtros: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: valoracionKeys.preguntas(filtros),
    queryFn: () => valoracionApi.preguntas.list(filtros),
  });

export const useCiclos = () =>
  useQuery({ queryKey: valoracionKeys.ciclos(), queryFn: () => valoracionApi.ciclos.list() });

export const useCiclo = (id: number) =>
  useQuery({ queryKey: valoracionKeys.ciclo(id), queryFn: () => valoracionApi.ciclos.get(id) });

export const useAsignaciones = (cicloId: number) =>
  useQuery({
    queryKey: valoracionKeys.asignaciones(cicloId),
    queryFn: () => valoracionApi.ciclos.asignaciones(cicloId),
  });

export const usePendientes = (cicloId: number, activo = true) =>
  useQuery({
    queryKey: valoracionKeys.pendientes(cicloId),
    queryFn: () => valoracionApi.ciclos.pendientes(cicloId),
    enabled: activo,
  });

export const useMisEvaluaciones = () =>
  useQuery({
    queryKey: valoracionKeys.misEvaluaciones(),
    queryFn: () => valoracionApi.misEvaluaciones.list(),
  });

export const useEvaluacion = (id: number) =>
  useQuery({
    queryKey: valoracionKeys.evaluacion(id),
    queryFn: () => valoracionApi.misEvaluaciones.get(id),
    // El formulario es el borrador vivo: no se recarga por detrás mientras
    // alguien está escribiendo, o se le borrarían las respuestas de la mano.
    refetchOnWindowFocus: false,
    staleTime: Infinity,
  });

export const useMisResultados = () =>
  useQuery({ queryKey: valoracionKeys.misResultados(), queryFn: valoracionApi.resultados.mios });

export const useResultado = (id: number, filtros: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: valoracionKeys.resultado(id, filtros),
    queryFn: () => valoracionApi.resultados.detalle(id, filtros),
  });

export const useResultadosEquipo = (filtros: Segmentacion) =>
  useQuery({
    queryKey: valoracionKeys.equipo(filtros),
    queryFn: () => valoracionApi.resultados.equipo(filtros),
  });

export const useDashboard = (filtros: Segmentacion) =>
  useQuery({
    queryKey: valoracionKeys.dashboard(filtros),
    queryFn: () => valoracionApi.informes.dashboard(filtros),
  });

export const usePersona = (id: number, filtros: Segmentacion) =>
  useQuery({
    queryKey: valoracionKeys.persona(id, filtros),
    queryFn: () => valoracionApi.informes.persona(id, filtros),
  });

export const useConsolidado = (filtros: Segmentacion) =>
  useQuery({
    queryKey: valoracionKeys.consolidado(filtros),
    queryFn: () => valoracionApi.informes.consolidado(filtros),
  });

export const usePlanes = (filtros: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: valoracionKeys.planes(filtros),
    queryFn: () => valoracionApi.planes.list(filtros),
  });

export const useJerarquia = (filtros: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: valoracionKeys.jerarquia(filtros),
    queryFn: () => valoracionApi.jerarquia.list(filtros),
  });
