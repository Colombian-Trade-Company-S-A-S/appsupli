import { useEffect, useRef } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/shared/api/http-client';
import { plannerApi, type FiltrosDashboard, type Lectura, type ParametrosPayload } from './api';

export const plannerKeys = {
  todo: ['planner'] as const,
  opciones: () => ['planner', 'opciones'] as const,
  mi: (semana?: string) => ['planner', 'mi', semana ?? 'actual'] as const,
  persona: (id: number, semana?: string) => ['planner', 'persona', id, semana ?? 'actual'] as const,
  dashboard: (filtros: FiltrosDashboard) => ['planner', 'dashboard', filtros] as const,
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
    // Al cambiar de semana se queda lo anterior mientras llega; al cambiar de persona, no.
    placeholderData: (anterior, consulta) => (consulta?.queryKey[2] === id ? anterior : undefined),
  });

/**
 * Pide el detalle de una persona antes de que lo abran (al pasar el mouse o
 * enfocar su fila): así el panel abre ya con los datos.
 */
export function usePrecargarPersona() {
  const queryClient = useQueryClient();
  return (id: number, semana?: string) =>
    queryClient.prefetchQuery({
      queryKey: plannerKeys.persona(id, semana),
      queryFn: () => plannerApi.persona(id, semana),
      staleTime: 30_000,
    });
}

export const useDashboardPlanner = (filtros: FiltrosDashboard) =>
  useQuery({
    queryKey: plannerKeys.dashboard(filtros),
    queryFn: () => plannerApi.dashboard(filtros),
    placeholderData: keepPreviousData,
  });

/** Mientras haya una lectura corriendo, se consulta cada pocos segundos hasta que termine. */
export const useConexion = (probar = false) =>
  useQuery({
    queryKey: [...plannerKeys.conexion(), probar],
    queryFn: () => plannerApi.conexion(probar),
    refetchInterval: (consulta) => (consulta.state.data?.ultimaLectura?.enCurso ? 4000 : false),
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

/** Toda escritura refresca el módulo entero: una lectura o un recálculo cambian el índice y el dashboard. */
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

/**
 * «Sincronizar ahora»: solo empieza la lectura, que corre en segundo plano y
 * tarda unos minutos. El aviso de que terminó lo da `useAvisoDeLectura`.
 */
export const useSincronizar = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => plannerApi.sincronizar(),
    onSuccess: (lectura) => {
      queryClient.invalidateQueries({ queryKey: plannerKeys.conexion() });
      toast.info(
        lectura.yaEnCurso
          ? 'Ya hay una lectura de Planner en curso: espera a que termine.'
          : 'Leyendo Planner en segundo plano. Tarda unos minutos; puedes seguir usando la app.',
      );
    },
    onError: (error) => toast.error(mensajeDeError(error, 'No se pudo empezar la lectura.')),
  });
};

/**
 * Avisa cuando termina la lectura que se estaba siguiendo en pantalla y
 * refresca el módulo: el índice y el dashboard cambian con cada lectura.
 */
export function useAvisoDeLectura(ultima: Lectura | null | undefined) {
  const queryClient = useQueryClient();
  const siguiendo = useRef<number | null>(null);
  useEffect(() => {
    if (!ultima) return;
    if (ultima.enCurso) {
      siguiendo.current = ultima.id;
      return;
    }
    if (siguiendo.current !== ultima.id) return;
    siguiendo.current = null;
    queryClient.invalidateQueries({ queryKey: plannerKeys.todo });
    if (ultima.estado === 'error') {
      toast.error(`La lectura de Planner falló: ${ultima.error || 'revisa la bitácora.'}`);
    } else if (ultima.estado === 'parcial') {
      toast.warning(
        `Lectura lista con errores: ${ultima.planesLeidos} planes leídos. Revisa la bitácora.`,
      );
    } else {
      toast.success(`Lectura lista: ${ultima.planesLeidos} planes leídos.`);
    }
  }, [ultima, queryClient]);
}

export const useGuardarParametros = () =>
  usePlannerMutation(
    (payload: ParametrosPayload) => plannerApi.guardarParametros(payload),
    (datos) => `Versión guardada: rige desde el ${datos.vigenteDesde}. Lo ya calculado no cambia.`,
  );

/** El recálculo excepcional de una semana ya cerrada: queda en la bitácora. */
export const useRecalcular = () =>
  usePlannerMutation(
    ({ semana, motivo }: { semana: string; motivo: string }) =>
      plannerApi.recalcular(semana, motivo),
    (datos) => datos.mensaje,
  );
