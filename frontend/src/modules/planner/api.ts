import { api } from '@/shared/api/http-client';

const RUTA = '/performance/planner';

/** El color del índice con los cortes que define People (verde ≥ 80, ámbar ≥ 60 por defecto). */
export type SemaforoPlanner = 'verde' | 'ambar' | 'rojo';

export interface SemanaInfo {
  /** «2026-W46» */
  codigo: string;
  /** «WEEK 46» */
  etiqueta: string;
  /** «9–15 nov» */
  rango: string;
  /** El corte que la abre: lunes 9:00 (martes si el lunes es festivo). */
  lineaBase: string;
  /** El corte que la cierra: el que abre la semana siguiente. */
  cierre: string;
  cerrada: boolean;
}

export interface ParametrosPlanner {
  id: number;
  pesoWeekly: number;
  pesoDaily: number;
  pesoHito: number;
  verdeDesde: number;
  ambarDesde: number;
  /** AAAA-MM-DD: el lunes desde el que rige. */
  vigenteDesde: string;
  /** El último día en que rige; null mientras no haya otra versión. */
  vigenteHasta: string | null;
  creadoPor: string;
  createdAt: string | null;
}

export interface CapacidadesPlanner {
  puedeGestionar: boolean;
  puedeVerTodo: boolean;
  esLider: boolean;
}

export interface OpcionesPlanner {
  semanaActual: SemanaInfo;
  semanas: SemanaInfo[];
  meses: Array<{ codigo: string; anio: number; mes: number }>;
  parametros: ParametrosPlanner;
  capacidades: CapacidadesPlanner;
  miPlan: { titulo: string; grupo: string } | null;
  /** Si la persona entra en la medición: correo @supli.tech y switch «Planner» encendido. */
  meMido: boolean;
}

/** Una semana de una persona. Sin `conDato`, todavía no hay lectura de Planner. */
export interface SemanaPersona {
  semana: string;
  etiqueta: string;
  rango: string;
  conDato: boolean;
  /** Las WEEKLY que estaban en el corte. */
  weeklyBase?: number;
  /** Las WEEKLY creadas después del corte: también cuentan. */
  weeklyAgregadas?: number;
  weeklyTotal?: number;
  weeklyCompletadas?: number;
  dailyItems?: number;
  dailyMarcados?: number;
  pctWeekly?: number | null;
  pctDaily?: number | null;
  hito?: number;
  /** Hay al menos una tarea HITO con ítems en la checklist. */
  hitoRegistrado: boolean;
  hitosRegistrados: number;
  /** null si la semana no tuvo Weekly ni Daily que medir. */
  indice?: number | null;
  semaforo?: SemaforoPlanner | null;
  final?: boolean;
  baseAproximada?: boolean;
  parametrosId?: number;
}

/** Una tarea HITO de la semana, con los ítems de su checklist. */
export interface HitoSemana {
  titulo: string;
  registrado: boolean;
  totalItems: number;
  items: Array<{ titulo: string; marcado: boolean }>;
}

/** La trazabilidad de una tarea en la medición de la semana. */
export interface TareaTrazada {
  titulo: string;
  etiquetas: string[];
  creadaAt: string | null;
  entroAt: string;
  enLineaBase: boolean;
  deposito: string;
  completada: boolean;
  movimientos: Array<{ desde: string; hacia: string; at: string }>;
}

export interface Cumplimiento {
  persona: {
    id: number;
    nombre: string;
    cargo: string;
    area: string;
    lider: string;
    seMide: boolean;
  };
  plan: { titulo: string; grupo: string } | null;
  semana: SemanaInfo;
  actual: SemanaPersona;
  historia: SemanaPersona[];
  hitos: HitoSemana[];
  tareas: TareaTrazada[];
  /** La versión de parámetros que rige la semana elegida. */
  parametros: ParametrosPlanner;
  indiceMensual: number | null;
  semanasDelMes: number;
  semaforoMensual: SemaforoPlanner | null;
}

export type NivelDashboard = 'org' | 'direccion' | 'area' | 'persona';

export interface FilaDashboard {
  id?: number;
  nombre: string;
  tipo: 'direccion' | 'area' | 'persona';
  /** Lo que se manda para bajar de nivel: el directivo, el área o la persona. */
  clave: string;
  cargo?: string;
  /** Solo en las filas de persona: para filtrar la lista sin volver a pedirla. */
  area?: string;
  direccion?: string;
  direccionClave?: string;
  lider: string;
  personas: number;
  pctWeekly: number | null;
  pctDaily: number | null;
  hitoRegistrado: number | null;
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
    hitoRegistrado: number | null;
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

export interface Lectura {
  id: number;
  tipo: string;
  tipoLabel: string;
  semana: string;
  iniciadaAt: string;
  terminadaAt: string | null;
  ejecutadaPor: string;
  /** Corriendo ahora: la pantalla consulta hasta que termina. */
  enCurso: boolean;
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

export type EstadoPlan = 'Leído' | 'Sin leer' | 'Inaccesible' | 'URL no válida' | 'Sin URL';

/** El plan de una persona, tal como sale de su URL de Planner (Gestión de usuarios). */
export interface PlanDePersona {
  id: number;
  nombre: string;
  cargo: string;
  area: string;
  seMide: boolean;
  url: string;
  estado: EstadoPlan;
  plan: {
    planId: string;
    titulo: string;
    grupo: string;
    errorLectura: string;
    tareas: number;
    ultimaTareaCreada: string | null;
    ultimaLecturaAt: string | null;
  } | null;
}

export interface Planes {
  personas: PlanDePersona[];
}

/** Un recálculo excepcional, con quién lo autorizó y por qué. */
export interface Recalculo {
  id: number;
  semana: string;
  etiqueta: string;
  motivo: string;
  parametrosId: number;
  resultados: number;
  autorizadoPor: string;
  hechoAt: string;
}

export interface ParametrosRespuesta {
  vigentes: ParametrosPlanner;
  versiones: Array<ParametrosPlanner & { programada: boolean }>;
  /** El primer lunes en que puede regir una versión nueva. */
  proximoLunes: string;
  recalculos: Recalculo[];
}

export type ParametrosPayload = Pick<
  ParametrosPlanner,
  'pesoWeekly' | 'pesoDaily' | 'pesoHito' | 'verdeDesde' | 'ambarDesde' | 'vigenteDesde'
>;

export const plannerApi = {
  opciones: () => api.get<OpcionesPlanner>(`${RUTA}/opciones`),
  miCumplimiento: (semana?: string) =>
    api.get<Cumplimiento>(`${RUTA}/mi-cumplimiento`, semana ? { semana } : undefined),
  persona: (id: number, semana?: string) =>
    api.get<Cumplimiento>(`${RUTA}/personas/${id}`, semana ? { semana } : undefined),
  dashboard: (filtros: FiltrosDashboard) => api.get<Dashboard>(`${RUTA}/dashboard`, { ...filtros }),
  conexion: (probar = false) =>
    api.get<Conexion>(`${RUTA}/conexion`, probar ? { probar: 1 } : undefined),
  /** Empieza la lectura en segundo plano; si ya hay una corriendo, devuelve esa. */
  sincronizar: () => api.post<Lectura & { yaEnCurso: boolean }>(`${RUTA}/sincronizar`),
  planes: () => api.get<Planes>(`${RUTA}/planes`),
  parametros: () => api.get<ParametrosRespuesta>(`${RUTA}/parametros`),
  guardarParametros: (payload: ParametrosPayload) =>
    api.post<ParametrosPlanner>(`${RUTA}/parametros`, payload),
  recalcular: (semana: string, motivo: string) =>
    api.post<Recalculo & { mensaje: string }>(`${RUTA}/parametros/recalcular`, { semana, motivo }),
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
