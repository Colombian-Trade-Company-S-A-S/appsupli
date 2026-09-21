import { api } from '@/shared/api/http-client';

const RUTA = '/performance';

export type TipoMedicion = 'binario' | 'proporcional' | 'proporcional_inverso' | 'formula';
export type EstadoPeriodo = 'definicion' | 'en_medicion' | 'cerrado';
export type EstadoObjetivo = 'borrador' | 'activo' | 'congelado';

/** Una persona del equipo, con lo que hace falta para ubicarla. */
export interface Persona {
  id: number;
  nombre: string;
  cargo: string;
  area: string;
  jefe: string;
  direccion: string;
  organizacion: string;
  regional: string;
  puntoVenta: string;
}

/** Un objetivo con su KPI: la fila que se define y se pondera. */
export interface Objetivo {
  id: number;
  colaborador: number;
  colaboradorNombre: string;
  colaboradorCargo: string;
  registradoPor: number;
  registradoPorNombre: string;
  periodo: string;
  objetivo: string;
  kpi: string;
  peso: string;
  tipoMedicion: TipoMedicion;
  tipoMedicionLabel: string;
  unidad: string;
  unidadLabel: string;
  metaValor: string | null;
  umbralCumplimiento: string | null;
  permiteSobrecumplimiento: boolean;
  topeCumplimiento: string;
  formula: string;
  fuenteDatos: string;
  responsableResultado: number | null;
  responsableNombre: string;
  estado: EstadoObjetivo;
  editable: boolean;
  createdAt: string;
}

export interface ObjetivoPayload {
  colaborador: number;
  periodo: string;
  objetivo: string;
  kpi: string;
  peso: string;
  tipoMedicion: TipoMedicion;
  unidad: string;
  metaValor: string | null;
  umbralCumplimiento: string | null;
  permiteSobrecumplimiento: boolean;
  topeCumplimiento: string;
  formula: string;
  fuenteDatos: string;
  responsableResultado: number | null;
}

export interface PeriodoDisponible {
  periodo: string;
  estado: EstadoPeriodo;
  estadoLabel: string;
}

export interface Opcion {
  value: string;
  label: string;
}

export interface OpcionesPerformance {
  periodos: PeriodoDisponible[];
  tiposMedicion: Opcion[];
  unidades: Opcion[];
  equipo: Persona[];
  maximoObjetivos: number;
  ponderacionCompleta: number;
  capacidades: Capacidades;
}

export interface Capacidades {
  puedeDefinirACualquiera: boolean;
  puedeVerTodo: boolean;
  puedeGestionarPeriodos: boolean;
  esLider: boolean;
}

/** Cuánto lleva asignado una persona en el mes: el banner del 100%. */
export interface Ponderacion {
  colaborador: number;
  colaboradorNombre: string;
  cargo: string;
  objetivos: number;
  pesoAsignado: number;
  pesoDisponible: number;
  completo: boolean;
  maximoObjetivos: number;
}

export interface ResumenPeriodo {
  periodo: string;
  estado: EstadoPeriodo;
  estadoLabel: string;
  ponderacionCompleta: number;
  colaboradores: Ponderacion[];
}

export interface ResumenModulo {
  periodo: string;
  estado: EstadoPeriodo;
  estadoLabel: string;
  misObjetivos: number;
  miPonderacion: number;
  equipo: number;
  equipoCompleto: number;
  equipoSinObjetivos: number;
  capacidades: Capacidades;
}

export interface ResultadoActivacion {
  periodo: string;
  estado: EstadoPeriodo;
  congelados: number;
  colaboradores: number;
  mensaje: string;
}

/** Lo que responde el 422 cuando alguien no suma 100%. */
export interface PesoIncompleto {
  error: 'PESO_INCOMPLETO';
  mensaje: string;
  pendientes: Array<Ponderacion & { mensaje: string }>;
}

export const performanceApi = {
  opciones: () => api.get<OpcionesPerformance>(`${RUTA}/opciones`),
  resumen: (periodo?: string) =>
    api.get<ResumenModulo>(`${RUTA}/resumen`, periodo ? { periodo } : undefined),
  objetivos: (filtros: { colaborador?: number; periodo?: string }) =>
    api.get<Objetivo[]>(`${RUTA}/objetivos`, filtros),
  misObjetivos: (periodo?: string) =>
    api.get<Objetivo[]>(`${RUTA}/mis-objetivos`, periodo ? { periodo } : undefined),
  crear: (payload: ObjetivoPayload) => api.post<Objetivo>(`${RUTA}/objetivos`, payload),
  editar: (id: number, payload: Partial<ObjetivoPayload>) =>
    api.patch<Objetivo>(`${RUTA}/objetivos/${id}`, payload),
  eliminar: (id: number) => api.delete<void>(`${RUTA}/objetivos/${id}`),
  resumenPeriodo: (periodo: string, colaborador?: number) =>
    api.get<ResumenPeriodo>(
      `${RUTA}/periodos/${periodo}/resumen`,
      colaborador ? { colaborador } : undefined,
    ),
  activarPeriodo: (periodo: string) =>
    api.post<ResultadoActivacion>(`${RUTA}/periodos/${periodo}/activar`),
};

/** `2026-10-01` → `2026-10`: lo que esperan las rutas de periodo. */
export const mesDe = (periodo: string) => periodo.slice(0, 7);

const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

/**
 * `2026-10-01` → `Octubre 2026`.
 *
 * Se parte el texto en vez de usar `new Date`: un `2026-10-01` se lee como
 * medianoche UTC y en Colombia se vería como septiembre, que es justo el mes
 * equivocado.
 */
export const etiquetaMes = (periodo: string) => {
  const [anio, mes] = periodo.split('-');
  return `${MESES[Number(mes) - 1] ?? mes} ${anio}`;
};
