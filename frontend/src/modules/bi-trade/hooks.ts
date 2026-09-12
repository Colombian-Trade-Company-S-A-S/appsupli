import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, type Paginated } from '@/shared/api/http-client';
import {
  biTradeApi,
  partnersApi,
  partnersTableroApi,
  type FiltrosAvance,
  type FiltrosConcurso,
  type FiltrosCumplimiento,
  type FiltrosDia,
  type FiltrosDashboard,
  type FiltrosPartners,
} from './api';
import { useFuente, type FuenteDatos } from './fuente';

export const biTradeKeys = {
  todo: ['bi-trade'] as const,
  opciones: () => ['bi-trade', 'opciones'] as const,
  dashboard: (filtros: FiltrosDashboard) => ['bi-trade', 'dashboard', filtros] as const,
  puntosVenta: (filtros?: Record<string, unknown>) =>
    ['bi-trade', 'puntos-venta', filtros ?? {}] as const,
  productos: (filtros?: Record<string, unknown>) =>
    ['bi-trade', 'productos', filtros ?? {}] as const,
  ventas: (filtros?: Record<string, unknown>) => ['bi-trade', 'ventas', filtros ?? {}] as const,
  inventario: (filtros?: Record<string, unknown>) =>
    ['bi-trade', 'inventario', filtros ?? {}] as const,
  metas: (filtros?: Record<string, unknown>) => ['bi-trade', 'metas', filtros ?? {}] as const,
  cumplimiento: (filtros: FiltrosCumplimiento) => ['bi-trade', 'cumplimiento', filtros] as const,
  avanceMensual: (filtros: FiltrosAvance) => ['bi-trade', 'avance-mensual', filtros] as const,
  pagina: (recurso: string, filtros: Record<string, unknown>) =>
    ['bi-trade', recurso, 'pagina', filtros] as const,
  resumen: (recurso: string, filtros: Record<string, unknown>) =>
    ['bi-trade', recurso, 'resumen', filtros] as const,
  campanas: () => ['bi-trade', 'campanas'] as const,
  tickets: (filtros: FiltrosConcurso) => ['bi-trade', 'tickets', filtros] as const,
  cumplimientoDiario: (filtros: FiltrosDia) =>
    ['bi-trade', 'cumplimiento-diario', filtros] as const,
  partnersOpciones: () => ['bi-trade', 'partners', 'opciones'] as const,
  partnersRegistros: (filtros: Record<string, unknown>) =>
    ['bi-trade', 'partners', 'registros', filtros] as const,
  partnersCatalogo: (lista: string) => ['bi-trade', 'partners', 'catalogo', lista] as const,
  partnersTablero: (filtros: FiltrosPartners) =>
    ['bi-trade', 'partners', 'tablero', filtros] as const,
  partnersPeriodos: () => ['bi-trade', 'partners', 'periodos'] as const,
};

/**
 * La llave de una consulta según de dónde salgan los datos.
 *
 * La app invalida todo lo que empiece por `['bi-trade']` después de cada
 * guardado; el tablero público no debe entrar en esa limpieza ni compartir
 * caché con la app, y cada enlace es una fuente distinta.
 */
const llave = (fuente: FuenteDatos, key: readonly unknown[]): readonly unknown[] => {
  if (fuente.soloLectura) return ['publico', fuente.clave, ...key];
  // Homecenter cuelga de `['bi-trade', 'hc', …]` y Falabella de
  // `['bi-trade', 'falabella', …]`: entran en la limpieza de `['bi-trade']`
  // tras cada guardado, pero no comparten caché con Claro ni entre ellos.
  if (fuente.canal !== 'claro') return ['bi-trade', fuente.canal, ...key.slice(1)];
  return key;
};

const mensajeDeError = (error: unknown) => {
  if (error instanceof ApiError) {
    const porCampo = error.errors && Object.values(error.errors)[0]?.[0];
    return porCampo ?? error.message;
  }
  return 'Ocurrió un error inesperado';
};

/**
 * Invalida las consultas del módulo y avisa con un toast.
 *
 * `exito` acepta una función para poder mostrar el mensaje que devuelve el
 * backend —cuántos registros se borraron, por ejemplo— en vez de un texto fijo.
 */
export function useBiTradeMutation<TVars, TData>(
  fn: (vars: TVars) => Promise<TData>,
  exito: string | ((data: TData) => string),
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: biTradeKeys.todo });
      toast.success(typeof exito === 'function' ? exito(data) : exito);
    },
    onError: (error) => toast.error(mensajeDeError(error)),
  });
}

export function useOpciones() {
  const fuente = useFuente();
  return useQuery({
    queryKey: llave(fuente, biTradeKeys.opciones()),
    queryFn: () => fuente.opciones(),
    staleTime: 5 * 60 * 1000,
  });
}

export const useDashboard = (filtros: FiltrosDashboard) =>
  useQuery({
    queryKey: biTradeKeys.dashboard(filtros),
    queryFn: () => biTradeApi.dashboard(filtros),
  });

export function usePuntosVenta(filtros: Record<string, unknown> = {}) {
  const fuente = useFuente();
  return useQuery({
    queryKey: llave(fuente, biTradeKeys.puntosVenta(filtros)),
    queryFn: () => fuente.puntosVenta(filtros),
  });
}

export function useProductos(filtros: Record<string, unknown> = {}) {
  const fuente = useFuente();
  return useQuery({
    queryKey: llave(fuente, biTradeKeys.productos(filtros)),
    queryFn: () => fuente.productos(filtros),
  });
}

export const useVentas = (filtros: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: biTradeKeys.ventas(filtros),
    queryFn: () => biTradeApi.ventas.list(filtros),
  });

export const useCumplimiento = (filtros: FiltrosCumplimiento) =>
  useQuery({
    queryKey: biTradeKeys.cumplimiento(filtros),
    queryFn: () => biTradeApi.cumplimiento(filtros),
  });

export const useInventario = (filtros: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: biTradeKeys.inventario(filtros),
    queryFn: () => biTradeApi.inventario.list(filtros),
  });

export const useMetas = (filtros: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: biTradeKeys.metas(filtros),
    queryFn: () => biTradeApi.metas.list(filtros),
  });

export function useAvanceMensual(filtros: FiltrosAvance) {
  const fuente = useFuente();
  return useQuery({
    queryKey: llave(fuente, biTradeKeys.avanceMensual(filtros)),
    queryFn: () => fuente.avanceMensual(filtros),
  });
}

/** Los recursos que tienen listado paginado, resumen y exportación. */
type RecursoListado = 'ventas' | 'inventario' | 'metas';

/**
 * Una página del listado.
 *
 * `placeholderData` conserva la página anterior mientras llega la nueva: sin
 * eso la tabla se vacía en cada clic de paginación y da un salto.
 */
export function useListado<T>(recurso: RecursoListado, filtros: Record<string, unknown>) {
  const fuente = useFuente();
  const recursos = fuente.recursos ?? biTradeApi;
  return useQuery({
    queryKey: llave(fuente, biTradeKeys.pagina(recurso, filtros)),
    queryFn: () => recursos[recurso].listPagina(filtros) as Promise<Paginated<T>>,
    placeholderData: (anterior) => anterior,
  });
}

/** Los totales de todo lo filtrado, al margen de la página que se esté viendo. */
export function useResumen<R>(recurso: RecursoListado, filtros: Record<string, unknown>) {
  const fuente = useFuente();
  const recursos = fuente.recursos ?? biTradeApi;
  return useQuery({
    queryKey: llave(fuente, biTradeKeys.resumen(recurso, filtros)),
    queryFn: () => recursos[recurso].resumen<R>(filtros),
  });
}

/**
 * Una descarga de archivo, con su estado de espera y sus avisos.
 *
 * No usa `useBiTradeMutation` porque esa invalida todas las consultas del
 * módulo al terminar: bajar un Excel no cambia ningún dato, así que volver a
 * pedir el tablero entero sería trabajo perdido.
 */
export function useDescarga<TVars>(fn: (vars: TVars) => Promise<unknown>, exito: string) {
  return useMutation({
    mutationFn: fn,
    onSuccess: () => toast.success(exito),
    onError: (error) => toast.error(mensajeDeError(error)),
  });
}

export function useCampanas() {
  const fuente = useFuente();
  return useQuery({
    queryKey: llave(fuente, biTradeKeys.campanas()),
    queryFn: () => fuente.campanas(),
  });
}

export function useConcurso(filtros: FiltrosConcurso) {
  const fuente = useFuente();
  return useQuery({
    queryKey: llave(fuente, biTradeKeys.tickets(filtros)),
    queryFn: () => fuente.tickets(filtros),
  });
}

/**
 * El cumplimiento de un día.
 *
 * `placeholderData` conserva el día anterior mientras llega el nuevo: sin eso
 * la pantalla se vacía en cada clic de las flechas del selector.
 */
export function useCumplimientoDiario(filtros: FiltrosDia) {
  const fuente = useFuente();
  return useQuery({
    queryKey: llave(fuente, biTradeKeys.cumplimientoDiario(filtros)),
    queryFn: () => fuente.cumplimientoDiario(filtros),
    placeholderData: (anterior) => anterior,
  });
}

/** Los desplegables del formulario del plan Partners. Cambian poco. */
export const useOpcionesPartners = () =>
  useQuery({
    queryKey: biTradeKeys.partnersOpciones(),
    queryFn: () => partnersApi.opciones(),
    staleTime: 5 * 60 * 1000,
  });

/** Una página de los registros del plan, del más reciente al más viejo. */
export const useRegistrosPartners = (filtros: Record<string, unknown> = {}) =>
  useQuery({
    queryKey: biTradeKeys.partnersRegistros(filtros),
    queryFn: () => partnersApi.registros.listPagina(filtros),
    placeholderData: (anterior) => anterior,
  });

/**
 * Las listas completas del plan, para administrarlas.
 *
 * A diferencia de `useOpcionesPartners`, traen también lo desactivado: es lo
 * que hay que ver para volver a activarlo o borrarlo.
 */
export const useRegionalesPartners = () =>
  useQuery({
    queryKey: biTradeKeys.partnersCatalogo('regionales'),
    queryFn: () => partnersApi.regionales.list(),
  });

export const usePuntosVentaPartners = () =>
  useQuery({
    queryKey: biTradeKeys.partnersCatalogo('puntos-venta'),
    queryFn: () => partnersApi.puntosVenta.list(),
  });

export const useProductosPartners = () =>
  useQuery({
    queryKey: biTradeKeys.partnersCatalogo('productos'),
    queryFn: () => partnersApi.productos.list(),
  });

/**
 * El tablero del plan Partners.
 *
 * `placeholderData` conserva el mes anterior mientras llega el nuevo: sin eso
 * la pantalla entera parpadea en cada cambio de filtro.
 */
export const useTableroPartners = (filtros: FiltrosPartners) =>
  useQuery({
    queryKey: biTradeKeys.partnersTablero(filtros),
    queryFn: () => partnersTableroApi.dashboard(filtros),
    placeholderData: (anterior) => anterior,
  });

/** Los meses que ya tienen metas cargadas, para el selector del tablero. */
export const usePeriodosPartners = () =>
  useQuery({
    queryKey: biTradeKeys.partnersPeriodos(),
    queryFn: () => partnersTableroApi.metas.periodos(),
  });
