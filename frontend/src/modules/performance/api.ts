import { api, httpClient } from '@/shared/api/http-client';

const RUTA = '/performance';

export type EstadoPeriodo = 'definicion' | 'en_medicion' | 'cerrado';
export type EstadoObjetivo = 'borrador' | 'activo' | 'congelado';
/** El color del cumplimiento: verde ≥ 100, naranja 85–99.9, rojo < 85. */
export type Semaforo = 'verde' | 'naranja' | 'rojo';
export type EstadoValidacion = 'pendiente' | 'validado' | 'rechazado';
/** Los cortes de acumulación: el Q es trimestral. */
export type TipoCorte = 'mes' | 'trimestre' | 'semestre' | 'anio';

/** Una persona del equipo, con lo que hace falta para ubicarla. */
export interface Persona {
  id: number;
  nombre: string;
  cargo: string;
  area: string;
  jefe: string;
  jefeId: number | null;
  /** Asesores y promotores: su % lo registra el jefe y lo aprueba el jefe de su jefe. */
  asesorOPromotor: boolean;
  /** Quién aprueba su resultado. */
  aprobador: string;
  direccion: string;
  organizacion: string;
  regional: string;
  puntoVenta: string;
}

/** Un objetivo con su KPI: la fila que se define y se pondera. Se mide en % de cumplimiento. */
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
  fuenteDatos: string;
  responsableResultado: number | null;
  responsableNombre: string;
  /** Quién aprueba el resultado: el jefe, o el Trade Marketing Manager con asesores y promotores. */
  aprobadorNombre: string;
  estado: EstadoObjetivo;
  editable: boolean;
  /** Si quien consulta puede registrar el % de este objetivo. */
  puedeCargar: boolean;
  /** Si quien consulta puede aprobarlo o devolverlo. */
  puedeValidar: boolean;
  resultado: Resultado | null;
  cumplimiento: number | null;
  semaforo: Semaforo | null;
  createdAt: string;
}

/** El soporte de un resultado: siempre un enlace a SharePoint u OneDrive. */
export interface Evidencia {
  id?: number;
  nombre: string;
  linkSoporte: string;
  createdAt?: string;
}

/** El % de cumplimiento de un objetivo (0 a 100), registrado con su evidencia. */
export interface Resultado {
  id: number;
  objetivo: number;
  porcentajeCumplimiento: string | null;
  semaforo: Semaforo | null;
  cargadoPor: number | null;
  cargadoPorNombre: string;
  fechaCarga: string | null;
  estadoValidacion: EstadoValidacion;
  estadoValidacionLabel: string;
  validadoPor: number | null;
  validadoPorNombre: string;
  fechaValidacion: string | null;
  observacion: string;
  /** El comentario del jefe sobre lo cargado (aparte de la observación del colaborador). */
  feedback: string;
  feedbackPor: number | null;
  feedbackPorNombre: string;
  feedbackFecha: string | null;
  evidencias: Evidencia[];
  /** Cada paso del resultado, del más viejo al más nuevo. */
  historial: PasoHistorial[];
}

export type AccionHistorial = 'cargado' | 'corregido' | 'validado' | 'rechazado' | 'feedback';

/** Un paso del resultado: qué pasó, quién, cuándo y con qué comentario o motivo. */
export interface PasoHistorial {
  id: number;
  accion: AccionHistorial;
  accionLabel: string;
  autor: number | null;
  autorNombre: string;
  comentario: string;
  porcentajeCumplimiento: string | null;
  /** Las evidencias de ese momento; `null` en registros viejos, donde no se sabe. */
  evidencias: Array<{ nombre: string; linkSoporte: string }> | null;
  createdAt: string;
}

export interface ResultadoPayload {
  /** De 0 a 100. */
  porcentajeCumplimiento: string;
  observacion?: string;
  evidencias?: Array<{ nombre?: string; linkSoporte: string }>;
}

/** El responsable no va: el backend pone siempre al jefe directo. */
export interface ObjetivoPayload {
  colaborador: number;
  periodo: string;
  objetivo: string;
  kpi: string;
  peso: string;
  fuenteDatos: string;
}

export interface PeriodoDisponible {
  periodo: string;
  estado: EstadoPeriodo;
  estadoLabel: string;
  /** Los objetivos se editan hasta el último día del mes anterior (A9). */
  editable: boolean;
  motivo: string;
  /** Si la edición que habilitó People sigue abierta hoy. */
  edicionHabilitada: boolean;
  /** Último día de esa edición, incluido; `null` si no tiene fecha. */
  edicionHasta: string | null;
  motivoHabilitacion: string;
  ultimoDiaParaEditar: string;
}

/** Un corte de tiempo del selector: mes, Q, semestre o año. */
export interface Corte {
  tipo: TipoCorte;
  tipoLabel: string;
  indice: number;
  anio: number;
  label: string;
  desde: string;
  hasta: string;
}

/** Los cortes del semáforo, para pintar la leyenda con los mismos números. */
export interface CortesSemaforo {
  verdeDesde: number;
  naranjaDesde: number;
  etiquetas: Opcion[];
}

/** El cumplimiento de una persona en un corte de tiempo. */
export interface CumplimientoPersona {
  colaborador: number;
  colaboradorNombre: string;
  cargo: string;
  objetivos: number;
  medidos: number;
  cumplimiento: number | null;
  semaforo: Semaforo | null;
}

export interface Acumulado {
  tipo: TipoCorte;
  tipoLabel: string;
  anio: number;
  indice: number;
  label: string;
  desde: string;
  hasta: string;
  meses: string[];
  promedio: number | null;
  semaforoPromedio: Semaforo | null;
  top: CumplimientoPersona | null;
  brechas: number;
  cortes: CortesSemaforo;
  colaboradores: CumplimientoPersona[];
  /** De quién son los resultados: la compañía (People/admin) o el equipo a cargo. */
  alcance: 'compania' | 'equipo';
  capacidades: Capacidades;
}

export interface Opcion {
  value: string;
  label: string;
}

export interface OpcionesPerformance {
  periodos: PeriodoDisponible[];
  /** Las personas a cargo directo: con quienes se trabaja uno por uno. */
  equipo: Persona[];
  /** Toda la compañía: la trae quien la ve (People y el CEO); solo People le define a todos. */
  compania: Persona[];
  /**
   * A quiénes les aprueba el resultado sin ser su jefe: el Trade Marketing
   * Manager con los asesores y promotores de sus líderes. No les define objetivos.
   */
  apruebaResultados: Persona[];
  maximoObjetivos: number;
  ponderacionCompleta: number;
  /** El % de cumplimiento va de 0 a este valor. */
  cumplimientoMaximo: number;
  cortes: Corte[];
  semaforo: CortesSemaforo;
  capacidades: Capacidades;
}

export interface Capacidades {
  puedeDefinirACualquiera: boolean;
  puedeVerTodo: boolean;
  puedeGestionarPeriodos: boolean;
  /** El CEO: define sus propios objetivos y su resultado queda aprobado al cargarlo. */
  puedeAutogestionar: boolean;
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
  editable: boolean;
  motivo: string;
  edicionHabilitada: boolean;
  edicionHasta: string | null;
  ponderacionCompleta: number;
  colaboradores: Ponderacion[];
}

export interface ResumenModulo {
  periodo: string;
  estado: EstadoPeriodo;
  estadoLabel: string;
  editable: boolean;
  motivo: string;
  edicionHabilitada: boolean;
  edicionHasta: string | null;
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

/** Lo que responde la carga de objetivos por Excel. */
export interface ResultadoCarga {
  created: number;
  deleted: number;
  pesoAsignado: number;
  pesoDisponible: number;
  completo: boolean;
  message: string;
}

/**
 * Descarga un archivo del backend respetando el nombre que él propone.
 *
 * El `blob` no se puede pedir con `api.get`, que asume JSON, y el nombre sale
 * de la cabecera `Content-Disposition` para que la plantilla llegue fechada.
 */
async function descargarArchivo(url: string, nombrePorDefecto: string) {
  const respuesta = await httpClient.get(url, { responseType: 'blob' });
  const cabecera = String(respuesta.headers['content-disposition'] ?? '');
  const nombre = /filename="?([^"]+)"?/.exec(cabecera)?.[1] ?? nombrePorDefecto;

  const objeto = URL.createObjectURL(respuesta.data as Blob);
  const enlace = document.createElement('a');
  enlace.href = objeto;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(objeto);
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
  /** La excepción del A9: People reabre un mes ya congelado hasta un día (`AAAA-MM-DD`). */
  habilitarEdicion: (periodo: string, habilitada: boolean, hasta = '', motivo = '') =>
    api.post<PeriodoDisponible & { mensaje: string }>(`${RUTA}/periodos/${periodo}/edicion`, {
      habilitada,
      hasta,
      motivo,
    }),
  cargarResultado: (objetivo: number, payload: ResultadoPayload) =>
    api.put<Resultado>(`${RUTA}/objetivos/${objetivo}/resultado`, payload),
  validarResultado: (objetivo: number, estado: EstadoValidacion, observacion = '') =>
    api.post<Resultado>(`${RUTA}/objetivos/${objetivo}/validar`, { estado, observacion }),
  acumulado: (corte: { tipo: TipoCorte; anio?: number; indice?: number }, top = false) =>
    api.get<Acumulado>(`${RUTA}/acumulado`, {
      ...corte,
      ...(top ? { alcance: 'top' } : {}),
    } as Record<string, unknown>),
  descargarPlantilla: () =>
    descargarArchivo(`${RUTA}/objetivos/plantilla`, 'plantilla-objetivos.xlsx'),
  /** Sube el .xlsx de la plantilla con los objetivos de una persona. */
  importarObjetivos: (
    archivo: File,
    colaborador: number,
    periodo: string,
    modo: 'agregar' | 'reemplazar',
  ) => {
    const cuerpo = new FormData();
    cuerpo.append('archivo', archivo);
    cuerpo.append('colaborador', String(colaborador));
    cuerpo.append('periodo', periodo);
    cuerpo.append('modo', modo);
    return httpClient
      .post<ResultadoCarga>(`${RUTA}/objetivos/importar`, cuerpo, {
        // Sin `Content-Type`: el navegador lo pone con el boundary del
        // multipart. Si se fija a mano, el backend no separa las partes.
        headers: { 'Content-Type': undefined },
        timeout: 120_000,
      })
      .then((r) => r.data);
  },
};

/** `2026-10-01` → `2026-10`: lo que esperan las rutas de periodo. */
export const mesDe = (periodo: string) => periodo.slice(0, 7);

/**
 * El mes en curso como «AAAA-MM», con la fecha local: `toISOString` está en
 * UTC y en Colombia, de noche el último día del mes, ya daría el siguiente.
 */
export const mesEnCurso = () => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * El periodo que se abre por defecto: el mes en curso. La lista viene del más
 * nuevo al más viejo, así que sin esto se abriría un mes que todavía no llega.
 */
export const periodoPorDefecto = (periodos: PeriodoDisponible[]) =>
  (periodos.find((p) => mesDe(p.periodo) === mesEnCurso()) ?? periodos[0])?.periodo ?? '';

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

/** `2026-11-05` → `5 de noviembre`, partiendo el texto por la misma razón. */
export const diaLegible = (dia: string) => {
  const [, mes, numero] = dia.split('-');
  return `${Number(numero)} de ${(MESES[Number(mes) - 1] ?? mes).toLowerCase()}`;
};
