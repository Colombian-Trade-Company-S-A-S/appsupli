import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError } from '@/shared/api/http-client';
import {
  mesDe,
  performanceApi,
  type EstadoValidacion,
  type ObjetivoPayload,
  type ResultadoPayload,
  type TipoCorte,
} from './api';

export const performanceKeys = {
  todo: ['performance'] as const,
  opciones: () => ['performance', 'opciones'] as const,
  resumen: (periodo?: string) => ['performance', 'resumen', periodo ?? 'actual'] as const,
  objetivos: (filtros: Record<string, unknown>) => ['performance', 'objetivos', filtros] as const,
  misObjetivos: (periodo?: string) => ['performance', 'mis-objetivos', periodo ?? ''] as const,
  periodo: (periodo: string, colaborador?: number) =>
    ['performance', 'periodo', periodo, colaborador ?? 'equipo'] as const,
  acumulado: (corte: Record<string, unknown>) => ['performance', 'acumulado', corte] as const,
};

export const useOpcionesPerformance = () =>
  useQuery({
    queryKey: performanceKeys.opciones(),
    queryFn: () => performanceApi.opciones(),
    staleTime: 5 * 60 * 1000,
  });

export const useResumenPerformance = (periodo?: string) =>
  useQuery({
    queryKey: performanceKeys.resumen(periodo),
    queryFn: () => performanceApi.resumen(periodo),
  });

export const useObjetivos = (filtros: { colaborador?: number; periodo?: string }) =>
  useQuery({
    queryKey: performanceKeys.objetivos(filtros),
    queryFn: () => performanceApi.objetivos(filtros),
    enabled: !!filtros.colaborador,
  });

export const useMisObjetivos = (periodo?: string) =>
  useQuery({
    queryKey: performanceKeys.misObjetivos(periodo),
    queryFn: () => performanceApi.misObjetivos(periodo),
  });

export const useResumenPeriodo = (periodo: string, colaborador?: number) =>
  useQuery({
    queryKey: performanceKeys.periodo(periodo, colaborador),
    queryFn: () => performanceApi.resumenPeriodo(mesDe(periodo), colaborador),
    enabled: !!periodo,
  });

const mensajeDeError = (error: unknown, porDefecto: string) => {
  if (error instanceof ApiError) {
    const porCampo = error.errors && Object.values(error.errors)[0]?.[0];
    return porCampo ?? error.message;
  }
  return porDefecto;
};

/**
 * Mutación del módulo: refresca todo lo que dependa de los objetivos.
 *
 * Guardar un objetivo cambia también el banner del 100% y la portada, así que
 * se invalida el módulo entero en vez de ir llave por llave.
 */
export function usePerformanceMutation<TDatos, TVariables>(
  mutationFn: (variables: TVariables) => Promise<TDatos>,
  exito: string | ((datos: TDatos) => string),
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (datos) => {
      queryClient.invalidateQueries({ queryKey: performanceKeys.todo });
      toast.success(typeof exito === 'function' ? exito(datos) : exito);
    },
    onError: (error) => toast.error(mensajeDeError(error, 'No se pudo guardar.')),
  });
}

export const useCrearObjetivo = () =>
  usePerformanceMutation(
    (payload: ObjetivoPayload) => performanceApi.crear(payload),
    'Objetivo guardado',
  );

export const useEditarObjetivo = () =>
  usePerformanceMutation(
    ({ id, ...payload }: Partial<ObjetivoPayload> & { id: number }) =>
      performanceApi.editar(id, payload),
    'Objetivo actualizado',
  );

export const useEliminarObjetivo = () =>
  usePerformanceMutation((id: number) => performanceApi.eliminar(id), 'Objetivo eliminado');

/** El cumplimiento del equipo en un corte: mes, Q, semestre o año (A8). */
export const useAcumulado = (corte: { tipo: TipoCorte; anio?: number; indice?: number }) =>
  useQuery({
    queryKey: performanceKeys.acumulado(corte),
    queryFn: () => performanceApi.acumulado(corte),
  });

export const useCargarResultado = () =>
  usePerformanceMutation(
    ({ objetivo, ...payload }: ResultadoPayload & { objetivo: number }) =>
      performanceApi.cargarResultado(objetivo, payload),
    'Resultado cargado',
  );

export const useValidarResultado = () =>
  usePerformanceMutation(
    ({
      objetivo,
      estado,
      observacion,
    }: {
      objetivo: number;
      estado: EstadoValidacion;
      observacion?: string;
    }) => performanceApi.validarResultado(objetivo, estado, observacion),
    (resultado) =>
      resultado.estadoValidacion === 'validado' ? 'Resultado validado' : 'Resultado devuelto',
  );

/** La excepción del A9: solo People, y siempre con motivo. */
export const useHabilitarEdicion = () =>
  usePerformanceMutation(
    ({ periodo, habilitada, motivo }: { periodo: string; habilitada: boolean; motivo?: string }) =>
      performanceApi.habilitarEdicion(mesDe(periodo), habilitada, motivo),
    (datos) => datos.mensaje,
  );

export const useDescargarPlantilla = () =>
  usePerformanceMutation(() => performanceApi.descargarPlantilla(), 'Plantilla descargada');

export const useImportarObjetivos = () =>
  usePerformanceMutation(
    ({
      archivo,
      colaborador,
      periodo,
      modo,
    }: {
      archivo: File;
      colaborador: number;
      periodo: string;
      modo: 'agregar' | 'reemplazar';
    }) => performanceApi.importarObjetivos(archivo, colaborador, periodo, modo),
    (datos) => datos.message,
  );
