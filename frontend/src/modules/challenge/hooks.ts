import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/shared/api/http-client';
import {
  challengeApi,
  type ParticipacionPayload,
  type RetoPayload,
  type ValoracionPayload,
} from './api';

export const challengeKeys = {
  todo: ['challenge'] as const,
  opciones: () => ['challenge', 'opciones'] as const,
  retos: (filtros: Record<string, unknown>) => ['challenge', 'retos', filtros] as const,
  reto: (id: number) => ['challenge', 'reto', id] as const,
  participaciones: (reto: number) => ['challenge', 'participaciones', reto] as const,
  resultado: (reto: number) => ['challenge', 'resultado', reto] as const,
  misRetos: () => ['challenge', 'mis-retos'] as const,
  top: () => ['challenge', 'top'] as const,
};

export const useOpcionesChallenge = () =>
  useQuery({
    queryKey: challengeKeys.opciones(),
    queryFn: () => challengeApi.opciones(),
    staleTime: 5 * 60 * 1000,
  });

export const useRetos = (filtros: { categoria?: string; estado?: string } = {}) =>
  useQuery({
    queryKey: challengeKeys.retos(filtros),
    queryFn: () => challengeApi.retos(filtros),
  });

export const useReto = (id?: number) =>
  useQuery({
    queryKey: challengeKeys.reto(id ?? 0),
    queryFn: () => challengeApi.reto(id as number),
    enabled: !!id,
  });

export const useParticipaciones = (reto?: number) =>
  useQuery({
    queryKey: challengeKeys.participaciones(reto ?? 0),
    queryFn: () => challengeApi.participaciones(reto as number),
    enabled: !!reto,
  });

export const useResultado = (reto?: number) =>
  useQuery({
    queryKey: challengeKeys.resultado(reto ?? 0),
    queryFn: () => challengeApi.resultado(reto as number),
    enabled: !!reto,
  });

export const useMisRetos = () =>
  useQuery({ queryKey: challengeKeys.misRetos(), queryFn: () => challengeApi.misRetos() });

export const useTopChallenge = () =>
  useQuery({ queryKey: challengeKeys.top(), queryFn: () => challengeApi.top() });

const mensajeDeError = (error: unknown, porDefecto: string) => {
  if (error instanceof ApiError) {
    const porCampo = error.errors && Object.values(error.errors)[0]?.[0];
    return porCampo ?? error.message;
  }
  return porDefecto;
};

/**
 * Mutación del módulo: refresca todo lo que dependa de los retos.
 *
 * Una valoración cambia el puntaje, el ganador y el Top a la vez, así que se
 * invalida el módulo entero en vez de ir llave por llave.
 */
export function useChallengeMutation<TDatos, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TDatos>,
  exito: string | ((datos: TDatos) => string),
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (datos) => {
      queryClient.invalidateQueries({ queryKey: challengeKeys.todo });
      toast.success(typeof exito === 'function' ? exito(datos) : exito);
    },
    onError: (error) => toast.error(mensajeDeError(error, 'No se pudo guardar.')),
  });
}

export const useCrearReto = () =>
  useChallengeMutation((payload: RetoPayload) => challengeApi.crear(payload), 'Reto guardado');

export const useEditarReto = () =>
  useChallengeMutation(
    ({ id, ...payload }: Partial<RetoPayload> & { id: number }) => challengeApi.editar(id, payload),
    'Reto actualizado',
  );

export const useEliminarReto = () =>
  useChallengeMutation((id: number) => challengeApi.eliminar(id), 'Borrador eliminado');

export const usePublicarReto = () =>
  useChallengeMutation(
    (id: number) => challengeApi.publicar(id),
    'Reto abierto: sus reglas quedaron fijas',
  );

export const useCerrarReto = () =>
  useChallengeMutation((id: number) => challengeApi.cerrar(id), 'Reto cerrado');

export const useFinalizarReto = () =>
  useChallengeMutation((id: number) => challengeApi.finalizar(id), 'Reto finalizado');

export const useReabrirReto = () =>
  useChallengeMutation(
    ({ id, motivo }: { id: number; motivo: string }) => challengeApi.reabrir(id, motivo),
    'Reto reabierto: quedó registrado',
  );

export const useParticipar = () =>
  useChallengeMutation(
    ({ reto, ...payload }: ParticipacionPayload & { reto: number }) =>
      challengeApi.participar(reto, payload),
    'Evidencia enviada',
  );

export const useValorar = () =>
  useChallengeMutation(
    ({ participacion, ...payload }: ValoracionPayload & { participacion: number }) =>
      challengeApi.valorar(participacion, payload),
    (datos) =>
      datos.estado === 'descalificada' ? 'Participación descalificada' : 'Valoración guardada',
  );

export const usePedirRevision = () =>
  useChallengeMutation(
    ({ participacion, motivo }: { participacion: number; motivo: string }) =>
      challengeApi.pedirRevision(participacion, motivo),
    'Solicitud enviada a People',
  );
