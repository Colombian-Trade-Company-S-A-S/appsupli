import { api, httpClient } from '@/shared/api/http-client';

/** Escala oficial: el valor 1-5 y su significado. */
export type Nivel =
  | 'referente'
  | 'consolidado'
  | 'desarrollo'
  | 'acompanamiento'
  | 'intervencion';

export type TipoEvaluacion = 'lider' | 'operativo';
export type TipoCiclo = TipoEvaluacion | 'mixta';
export type TipoPregunta = 'likert' | 'abierta';
export type RolEvaluador = 'jefe' | 'equipo' | 'autoevaluacion';
export type EstadoAsignacion = 'pendiente' | 'en_progreso' | 'completada';
export type EstadoCiclo = 'programado' | 'activo' | 'cerrado' | 'cancelado' | 'finalizado';
export type EstadoPlan = 'pendiente' | 'en_proceso' | 'cumplido' | 'vencido';

export interface Capacidades {
  canConfigure: boolean;
  canManageCycles: boolean;
  canViewAll: boolean;
  canViewDashboard: boolean;
  canPublishResults: boolean;
  canManageHierarchy: boolean;
  canManagePlans: boolean;
  canViewResults: boolean;
  isLeader: boolean;
  resultsPublished: boolean;
}

export interface Avance {
  total: number;
  completed: number;
  pending: number;
  percentage: number;
  complete?: boolean;
}

export interface Competencia {
  id: number;
  code: string;
  name: string;
  label: string;
  description: string;
  order: number;
  isActive: boolean;
  questionCount: number;
}

export interface Pregunta {
  id: number;
  competency: number;
  competencyCode: string;
  competencyLabel: string;
  statement: string;
  evaluationType: TipoEvaluacion;
  evaluationTypeLabel: string;
  questionType: TipoPregunta;
  questionTypeLabel: string;
  weight: string;
  order: number;
  isRequired: boolean;
  isActive: boolean;
}

export interface Ciclo {
  id: number;
  name: string;
  description: string;
  evaluationType: TipoCiclo;
  evaluationTypeLabel: string;
  startDate: string;
  endDate: string;
  status: EstadoCiclo;
  statusLabel: string;
  effectiveStatus: EstadoCiclo | 'vencido';
  effectiveStatusLabel: string;
  isAnonymous: boolean;
  commentsRequired: boolean;
  managerWeight: number;
  teamWeight: number;
  excludedQuestions: number[];
  createdByName: string;
  isOpen: boolean;
  progress: Avance;
}

export interface Asignacion {
  id: number;
  cycle: number;
  cycleName: string;
  evaluator: number;
  evaluatorName: string;
  evaluatee: number;
  evaluateeName: string;
  evaluateePosition: string;
  evaluatorRole: RolEvaluador;
  evaluatorRoleLabel: string;
  evaluationType: TipoEvaluacion;
  evaluationTypeLabel: string;
  status: EstadoAsignacion;
  statusLabel: string;
  isActive: boolean;
  agreements: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface MiEvaluacion {
  id: number;
  cycle: number;
  cycleName: string;
  cycleEndDate: string;
  evaluateeName: string;
  evaluateePosition: string;
  evaluateeArea: string;
  evaluatorRole: RolEvaluador;
  evaluatorRoleLabel: string;
  evaluationType: TipoEvaluacion;
  evaluationTypeLabel: string;
  status: EstadoAsignacion;
  statusLabel: string;
  completedAt: string | null;
  questionsTotal: number;
  questionsAnswered: number;
  canAnswer: boolean;
  blockedReason: string | null;
}

/** El formulario de respuesta. Nunca trae la competencia: es interna. */
export interface FormularioEvaluacion {
  assignment: MiEvaluacion;
  cycle: {
    id: number;
    name: string;
    description: string;
    endDate: string;
    isAnonymous: boolean;
    commentsRequired: boolean;
  };
  agreements: string;
  scale: Array<{ value: number; label: string }>;
  questions: Array<{
    id: number;
    statement: string;
    questionType: TipoPregunta;
    isRequired: boolean;
    order: number;
    value: number | null;
    text: string;
  }>;
}

export interface RespuestaGuardado {
  status: EstadoAsignacion;
  completed: boolean;
  missingQuestions: number[];
  missingAgreements: boolean;
  answered: number;
  total: number;
  message: string;
}

export interface CompetenciaResultado {
  code: string;
  name: string;
  label: string;
  order: number;
  average: number;
  percentage: number;
  level: Nivel;
  levelLabel?: string;
  items?: number;
  answers?: number;
}

export interface Resultado {
  id: number;
  cycle: number;
  cycleName: string;
  evaluatee: number;
  evaluateeName: string;
  evaluateePosition: string;
  evaluateeArea: string;
  evaluationType: TipoEvaluacion;
  evaluationTypeLabel: string;
  score: string;
  percentage: string;
  level: Nivel;
  levelLabel: string;
  managerScore: string;
  teamScore: string;
  selfScore: string;
  evaluatorsTotal: number;
  evaluatorsManager: number;
  evaluatorsTeam: number;
  evaluatorsSelf: number;
  competencyDetail: CompetenciaResultado[];
  strengths: string[];
  gaps: string[];
  computedAt: string;
}

export interface ItemResultado {
  questionId: number;
  competencyCode: string;
  competencyLabel: string;
  statement: string;
  answersCount: number;
  average: number;
  percentage: number;
  level: Nivel;
  levelLabel: string;
  scaleLabel: string;
  managerAverage: number | null;
  teamAverage: number | null;
  selfAverage: number | null;
  managerCount: number;
  teamCount: number;
  selfCount: number;
  selfGap: number | null;
  distribution: Array<{ value: number; label: string; count: number }>;
}

export interface DetalleResultado {
  result: Resultado;
  items: ItemResultado[];
  competencies: CompetenciaResultado[];
  bestItems: ItemResultado[];
  worstItems: ItemResultado[];
  ratings: Array<{
    evaluator: string;
    role: RolEvaluador;
    roleLabel: string;
    percentage: number;
    score: number;
    completedAt: string | null;
  }>;
  openAnswers: Array<{ statement: string; text: string; evaluator: string; roleLabel: string }>;
  agreements: Array<{ evaluator: string; roleLabel: string; text: string }>;
  evaluatorsCount: number;
  filteredCount: number;
  evaluatorRole: RolEvaluador | '';
  showEvaluator: boolean;
  canManagePlans: boolean;
}

/** Una persona con todas sus calificaciones resumidas en un solo número. */
export interface FilaConsolidada {
  personId: number;
  person: string;
  email: string;
  area: string;
  areaId: number | null;
  position: string;
  kind: string;
  kindLabel: string;
  manager: string;
  managerId: number | null;
  evaluationType: TipoEvaluacion;
  cycles: number;
  cycleNames: string;
  lastCycle: string;
  evaluations: number;
  percentage: number;
  score: number;
  level: Nivel;
  levelLabel: string;
  managerAverage: number | null;
  teamAverage: number | null;
  selfAverage: number | null;
  managerCount: number;
  teamCount: number;
  selfCount: number;
  trend: number;
  competencies: CompetenciaResultado[];
  resultIds: number[];
  history: Array<{
    cycle: string;
    cycleId: number;
    resultId: number;
    percentage: number;
    level: Nivel;
    evaluators: number;
  }>;
}

export interface Segmentacion {
  cycle?: string;
  area?: string;
  team?: string;
  kind?: string;
  position?: string;
  person?: string;
  evaluationType?: string;
  level?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface Agrupacion {
  key: string | number | null;
  label: string;
  average: number;
  count: number;
  level: Nivel;
}

export interface Dashboard {
  filters: Segmentacion;
  totals: { results: number; people: number; ratings: number; cycles: number };
  companyAverage: number;
  companyLevel: Nivel;
  companyLevelLabel: string;
  leadersAverage: number;
  leadersCount: number;
  trend: number;
  distribution: Array<{ level: Nivel; label: string; count: number; percentage: number }>;
  byArea: Agrupacion[];
  byKind: Agrupacion[];
  byTeam: Agrupacion[];
  byPosition: Agrupacion[];
  competencies: Array<CompetenciaResultado & { people: number }>;
  evolution: Array<{ cycle: string; date: string; average: number; count: number }>;
  topPerformers: FilaConsolidada[];
  lowestPerformers: FilaConsolidada[];
  topStrengths: Array<{ statement: string; count: number }>;
  topGaps: Array<{ statement: string; count: number }>;
}

export interface PlanAccion {
  id: number;
  result: number;
  evaluateeName: string;
  cycleName: string;
  description: string;
  owner: number;
  ownerName: string;
  dueDate: string;
  status: EstadoPlan;
  statusLabel: string;
  evidenceUrl: string;
  notes: string;
  createdByName: string;
  isOverdue: boolean;
  createdAt: string;
}

export interface FilaJerarquia {
  id: number;
  fullName: string;
  email: string;
  areaName: string;
  position: string;
  kind: string;
  manager: number | null;
  managerName: string;
  teamCount: number;
}

export interface Persona {
  id: number;
  fullName: string;
  email: string;
  position: string;
  kind: string;
  area: number | null;
  areaName: string;
  manager: number | null;
  managerName: string;
  isActive: boolean;
}

export interface Opciones {
  evaluationTypes: Array<{ value: string; label: string }>;
  cycleTypes: Array<{ value: string; label: string }>;
  questionTypes: Array<{ value: string; label: string }>;
  evaluatorRoles: Array<{ value: string; label: string }>;
  assignmentStatus: Array<{ value: string; label: string }>;
  levels: Array<{ value: Nivel; label: string }>;
  areas: Array<{ value: number; label: string }>;
  positions: string[];
  teams: Array<{ value: number; label: string }>;
  people: Persona[];
  cycles: Array<{ value: number; label: string }>;
}

export interface Resumen {
  capabilities: Capacidades;
  myPending: number;
  myTotal: number;
  myResults: number;
  teamSize: number;
  settings: {
    resultsPublished: boolean;
    publishedAt: string | null;
    updatedByName: string;
    updatedAt: string;
  };
  progress: Avance;
  activeCycles: Ciclo[];
  catalog?: {
    competencies: number;
    questions: number;
    cycles: number;
    peopleEvaluated: number;
  };
}

export interface Configuracion {
  resultsPublished: boolean;
  publishedAt: string | null;
  updatedByName: string;
  updatedAt: string;
  progress: Avance;
  canPublish: boolean;
  message?: string;
}

const RUTA = '/valoracion';

const recurso = <T, P>(ruta: string) => ({
  list: (params?: Record<string, unknown>) => api.getList<T>(`${RUTA}${ruta}`, params),
  get: (id: number) => api.get<T>(`${RUTA}${ruta}/${id}`),
  create: (payload: P) => api.post<T>(`${RUTA}${ruta}`, payload),
  update: (id: number, payload: P) => api.patch<T>(`${RUTA}${ruta}/${id}`, payload),
  remove: (id: number) => api.delete<void>(`${RUTA}${ruta}/${id}`),
});

/**
 * Los query params viajan en snake_case: el traductor a camelCase del backend
 * solo actúa sobre el cuerpo de la petición, no sobre la query string.
 */
const aParams = (filtros: Segmentacion): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(filtros)
      .filter(([, valor]) => valor !== '' && valor != null)
      .map(([clave, valor]) => [clave.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), valor]),
  );

/**
 * Descarga un CSV respetando la segmentación aplicada en pantalla.
 *
 * Va por el cliente HTTP y no por un enlace directo: la descarga necesita la
 * cabecera `Authorization`, que un `<a href>` no lleva.
 */
export async function descargarCsv(
  recursoCsv: 'exportar' | 'exportar-items',
  filtros: Segmentacion,
) {
  const respuesta = await httpClient.get(`${RUTA}/consolidado/${recursoCsv}`, {
    params: aParams(filtros),
    responseType: 'blob',
  });
  const cabecera = String(respuesta.headers['content-disposition'] ?? '');
  const nombre = /filename="?([^"]+)"?/.exec(cabecera)?.[1] ?? `valoracion-${recursoCsv}.csv`;

  const url = URL.createObjectURL(respuesta.data as Blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}

export const valoracionApi = {
  resumen: () => api.get<Resumen>(`${RUTA}/resumen`),
  opciones: () => api.get<Opciones>(`${RUTA}/opciones`),

  configuracion: {
    get: () => api.get<Configuracion>(`${RUTA}/configuracion`),
    publicar: (resultsPublished: boolean) =>
      api.patch<Configuracion>(`${RUTA}/configuracion`, { resultsPublished }),
  },

  competencias: recurso<Competencia, Partial<Competencia>>('/competencias'),
  preguntas: recurso<Pregunta, Partial<Pregunta>>('/preguntas'),

  ciclos: {
    ...recurso<Ciclo, Partial<Ciclo>>('/ciclos'),
    asignaciones: (id: number, params?: Record<string, unknown>) =>
      api.get<Asignacion[]>(`${RUTA}/ciclos/${id}/asignaciones`, params),
    generarAsignaciones: (id: number, payload: { areas?: number[]; selfEvaluation?: boolean }) =>
      api.post<{ created: number; skipped: number; message: string }>(
        `${RUTA}/ciclos/${id}/generar-asignaciones`,
        payload,
      ),
    consolidar: (id: number) =>
      api.post<{ processed: number; message: string }>(`${RUTA}/ciclos/${id}/consolidar`),
    pendientes: (id: number) =>
      api.get<{ items: Array<Asignacion & { answered: number; evaluatorEmail: string }>; total: number; progress: Avance }>(
        `${RUTA}/ciclos/${id}/pendientes`,
      ),
  },

  asignaciones: {
    ...recurso<Asignacion, Partial<Asignacion>>('/asignaciones'),
    reabrir: (id: number) =>
      api.post<Asignacion & { message: string }>(`${RUTA}/asignaciones/${id}/reabrir`),
    toggleActiva: (id: number) => api.post<Asignacion>(`${RUTA}/asignaciones/${id}/toggle-activa`),
  },

  misEvaluaciones: {
    list: (params?: Record<string, unknown>) =>
      api.getList<MiEvaluacion>(`${RUTA}/mis-evaluaciones`, params),
    get: (id: number) => api.get<FormularioEvaluacion>(`${RUTA}/mis-evaluaciones/${id}`),
    guardar: (
      id: number,
      payload: {
        action: 'borrador' | 'enviar';
        agreements: string;
        answers: Array<{ question: number; value: number | null; text: string }>;
      },
    ) => api.post<RespuestaGuardado>(`${RUTA}/mis-evaluaciones/${id}/guardar`, payload),
  },

  resultados: {
    list: (params?: Record<string, unknown>) => api.getList<Resultado>(`${RUTA}/resultados`, params),
    detalle: (id: number, params?: Record<string, unknown>) =>
      api.get<DetalleResultado>(`${RUTA}/resultados/${id}`, params),
    mios: () =>
      api.get<{ results: Resultado[]; consolidated: FilaConsolidada | null }>(
        `${RUTA}/resultados/mis-resultados`,
      ),
    equipo: (filtros: Segmentacion) =>
      api.get<{
        results: Resultado[];
        consolidated: FilaConsolidada[];
        filters: Segmentacion;
        average: number;
        scope: 'company' | 'team';
      }>(`${RUTA}/resultados/equipo`, aParams(filtros)),
  },

  planes: recurso<PlanAccion, Partial<PlanAccion>>('/planes-accion'),

  jerarquia: {
    list: (params?: Record<string, unknown>) =>
      api.getList<FilaJerarquia>(`${RUTA}/jerarquia`, params),
    update: (id: number, payload: { position?: string; manager?: number | null }) =>
      api.patch<FilaJerarquia>(`${RUTA}/jerarquia/${id}`, payload),
  },

  informes: {
    dashboard: (filtros: Segmentacion) =>
      api.get<Dashboard>(`${RUTA}/dashboard`, aParams(filtros)),
    persona: (id: number, filtros: Segmentacion) =>
      api.get<{
        person: {
          id: number;
          fullName: string;
          position: string;
          area: string;
          manager: string;
          kind?: string;
          email?: string;
        };
        filters: Segmentacion;
        consolidated: FilaConsolidada | null;
        results: Resultado[];
        items: Array<Record<string, unknown>>;
        bestItems?: Array<Record<string, unknown>>;
        worstItems?: Array<Record<string, unknown>>;
        actionPlans: PlanAccion[];
      }>(`${RUTA}/dashboard/persona/${id}`, aParams(filtros)),
    consolidado: (filtros: Segmentacion) =>
      api.get<{
        filters: Segmentacion;
        items: FilaConsolidada[];
        total: number;
        average: number;
        competencies: Array<CompetenciaResultado & { people: number }>;
      }>(`${RUTA}/consolidado`, aParams(filtros)),
  },
};
