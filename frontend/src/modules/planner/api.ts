import { api } from '@/shared/api/http-client';

const RUTA = '/performance/planner';

/** El color del índice con los cortes que define People (verde ≥ 80, ámbar ≥ 60 por defecto). */
export type SemaforoPlanner = 'verde' | 'ambar' | 'rojo';
export type EstadoHito = 'pendiente' | 'cumplido' | 'no_cumplido' | 'sin_validar' | 'sin_registrar';

export interface SemanaInfo {
  /** «2026-W46» */
  codigo: string;
  /** «WEEK 46» */
  etiqueta: string;
  /** «9–15 nov» */
  rango: string;
  lineaBase: string;
  cierre: string;
  ventanaDesde: string;
  ventanaHasta: string;
  cerrada: boolean;
  ventanaAbierta: boolean;
}

export interface ParametrosPlanner {
  id: number;
  pesoWeekly: number;
  pesoDaily: number;
  pesoHito: number;
  verdeDesde: number;
  ambarDesde: number;
  creadoPor: string;
  createdAt: string | null;
}

export interface CapacidadesPlanner {
  puedeGestionar: boolean;
  puedeVerTodo: boolean;
  esLider: boolean;
  autovalidaHito: boolean;
}

export interface OpcionesPlanner {
  semanaActual: SemanaInfo;
  semanas: SemanaInfo[];
  meses: Array<{ codigo: string; anio: number; mes: number }>;
  parametros: ParametrosPlanner;
  capacidades: CapacidadesPlanner;
  miPlan: { titulo: string; grupo: string } | null;
}

/** Una semana de una persona. Sin `conDato`, todavía no hay lectura de Planner. */
export interface SemanaPersona {
  semana: string;
  etiqueta: string;
  rango: string;
  conDato: boolean;
  weeklyBase?: number;
  weeklyCompletadas?: number;
  dailyItems?: number;
  dailyMarcados?: number;
  pctWeekly?: number | null;
  pctDaily?: number | null;
  hito?: number;
  hitoEstado: EstadoHito;
  hitoEstadoLabel: string;
  hitoTexto: string;
  indice?: number;
  semaforo?: SemaforoPlanner | null;
  final?: boolean;
  baseAproximada?: boolean;
}

export interface Cumplimiento {
  persona: { id: number; nombre: string; cargo: string; area: string; lider: string };
  plan: { titulo: string; grupo: string } | null;
  semana: SemanaInfo;
  actual: SemanaPersona;
  historia: SemanaPersona[];
  indiceMensual: number | null;
  semanasDelMes: number;
  semaforoMensual: SemaforoPlanner | null;
}

export type NivelDashboard = 'org' | 'direccion' | 'area' | 'persona';

export interface FilaDashboard {
  id?: number;
  nombre: string;
  tipo: 'direccion' | 'area' | 'persona';
  cargo?: string;
  lider: string;
  personas: number;
  pctWeekly: number | null;
  pctDaily: number | null;
  hitoCumplido: number | null;
  indice: number | null;
  semaforo: SemaforoPlanner | null;
  alertas: number;
}

export interface Dashboard {
  periodo: 'semana' | 'mes';
  etiqueta: string;
  nivel: NivelDashboard;
  direccion: string | null;
  area: string | null;
  alcance: 'compania' | 'equipo';
  kpis: {
    indice: number | null;
    pctWeekly: number | null;
    pctDaily: number | null;
    hitosPorValidar: number;
    alertas: number;
    semaforo: SemaforoPlanner | null;
  };
  filas: FilaDashboard[];
  parametros: ParametrosPlanner;
}

export interface FiltrosDashboard {
  periodo: 'semana' | 'mes';
  semana?: string;
  mes?: string;
  nivel?: NivelDashboard;
  direccion?: string;
  area?: string;
}

export interface Hito {
  id: number;
  personaId: number;
  persona: string;
  lider: string;
  texto: string;
  estado: EstadoHito;
  estadoLabel: string;
  comentario: string;
  validadoPor: string;
  validadoAt: string | null;
  puedeValidar: boolean;
}

export interface Hitos {
  semana: SemanaInfo;
  ventanaAbierta: boolean;
  puedeFueraDeVentana: boolean;
  lideres: Array<{ id: number; nombre: string }>;
  hitos: Hito[];
}

export interface Lectura {
  id: number;
  tipo: string;
  tipoLabel: string;
  semana: string;
  iniciadaAt: string;
  terminadaAt: string | null;
  ejecutadaPor: string;
  estado: 'ok' | 'parcial' | 'error';
  estadoLabel: string;
  planesLeidos: number;
  resumen: Record<string, number>;
  errores: Array<{ plan?: string; grupo?: string; error: string }>;
  error: string;
}

export interface Incidencia {
  id: number;
  tipo: string;
  tipoLabel: string;
  severidad: 'critica' | 'alerta';
  quien: string;
  persona: string;
  detalle: string;
  semana: string;
  detectadaAt: string;
}

export interface Conexion {
  estadoGraph: { configurado: boolean; conectado: boolean; mensaje: string } | null;
  ultimaLectura: Lectura | null;
  personasMedidas: number;
  personasConPlan: number;
  planesRelacionados: number;
  incidenciasAbiertas: number;
  incidenciasCriticas: number;
  incidencias: Incidencia[];
  lecturas: Lectura[];
}

export interface PlanRelacion {
  id: number;
  planId: string;
  titulo: string;
  grupo: string;
  colaboradorId: number | null;
  colaborador: string;
  area: string;
  activo: boolean;
  accesible: boolean;
  errorLectura: string;
  tareas: number;
  ultimaTareaCreada: string | null;
  ultimaLecturaAt: string | null;
  estado: 'Relacionado' | 'Sin persona' | 'Inactivo' | 'Inaccesible';
}

export interface Planes {
  planes: PlanRelacion[];
  sinPlan: Array<{ id: number; nombre: string; cargo: string; area: string }>;
  personas: Array<{ id: number; nombre: string; cargo: string; tienePlan: boolean }>;
}

export type ParametrosPayload = Pick<
  ParametrosPlanner,
  'pesoWeekly' | 'pesoDaily' | 'pesoHito' | 'verdeDesde' | 'ambarDesde'
>;

export const plannerApi = {
  opciones: () => api.get<OpcionesPlanner>(`${RUTA}/opciones`),
  miCumplimiento: (semana?: string) =>
    api.get<Cumplimiento>(`${RUTA}/mi-cumplimiento`, semana ? { semana } : undefined),
  persona: (id: number, semana?: string) =>
    api.get<Cumplimiento>(`${RUTA}/personas/${id}`, semana ? { semana } : undefined),
  dashboard: (filtros: FiltrosDashboard) => api.get<Dashboard>(`${RUTA}/dashboard`, { ...filtros }),
  hitos: (semana?: string, lider?: number) =>
    api.get<Hitos>(`${RUTA}/hitos`, { ...(semana ? { semana } : {}), ...(lider ? { lider } : {}) }),
  validarHito: (id: number, estado: 'cumplido' | 'no_cumplido', comentario: string) =>
    api.post<{ id: number; estado: EstadoHito; estadoLabel: string; mensaje: string }>(
      `${RUTA}/hitos/${id}/validar`,
      { estado, comentario },
    ),
  conexion: (probar = false) =>
    api.get<Conexion>(`${RUTA}/conexion`, probar ? { probar: 1 } : undefined),
  sincronizar: () => api.post<Lectura>(`${RUTA}/sincronizar`),
  inventario: () => api.post<Lectura>(`${RUTA}/inventario`, { vincular: true }),
  planes: () => api.get<Planes>(`${RUTA}/planes`),
  editarPlan: (id: number, cambios: { colaborador?: number | null; activo?: boolean }) =>
    api.patch<PlanRelacion>(`${RUTA}/planes/${id}`, cambios),
  parametros: () =>
    api.get<{ vigentes: ParametrosPlanner; versiones: ParametrosPlanner[] }>(`${RUTA}/parametros`),
  guardarParametros: (payload: ParametrosPayload) =>
    api.post<ParametrosPlanner>(`${RUTA}/parametros`, payload),
};

/** «81,3» con una decimal, como el prototipo; «—» si no hay dato. */
export const formatoIndice = (valor: number | null | undefined) =>
  valor === null || valor === undefined
    ? '—'
    : valor.toLocaleString('es-CO', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** «83%» redondeado; «—» si no hay dato. */
export const formatoPct = (valor: number | null | undefined) =>
  valor === null || valor === undefined ? '—' : `${Math.round(valor)}%`;

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export const nombreMes = (anio: number, mes: number) => `${MESES[mes - 1]} ${anio}`;

/** «9 nov» a partir de «2026-11-09». */
export const diaCorto = (iso: string) => {
  const [, mes, dia] = iso.slice(0, 10).split('-');
  return `${Number(dia)} ${MESES[Number(mes) - 1]?.slice(0, 3) ?? mes}`;
};
