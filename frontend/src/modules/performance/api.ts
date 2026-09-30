import { api, httpClient } from '@/shared/api/http-client';

const RUTA = '/performance';

export type TipoMedicion =
  'binario' | 'proporcional' | 'proporcional_inverso' | 'cualitativa' | 'formula';
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

/** Lo ejecutado de un objetivo. El porcentaje lo calcula el backend. */
export interface Resultado {
  id: number;
  objetivo: number;
  resultadoEjecutado: string | null;
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
  evidencias: Evidencia[];
}

export interface ResultadoPayload {
  resultadoEjecutado: string;
  observacion?: string;
  evidencias?: Array<{ nombre?: string; linkSoporte: string }>;
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
  /** Los objetivos se editan hasta el último día del mes anterior (A9). */
  editable: boolean;
  motivo: string;
  edicionHabilitada: boolean;
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
  capacidades: Capacidades;
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
  criteriosCualitativos: number;
  cortes: Corte[];
  semaforo: CortesSemaforo;
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
  editable: boolean;
  motivo: string;
  edicionHabilitada: boolean;
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
  /** La excepción del A9: People reabre un mes ya congelado, con su motivo. */
  habilitarEdicion: (periodo: string, habilitada: boolean, motivo = '') =>
    api.post<PeriodoDisponible & { mensaje: string }>(`${RUTA}/periodos/${periodo}/edicion`, {
      habilitada,
      motivo,
    }),
  cargarResultado: (objetivo: number, payload: ResultadoPayload) =>
    api.put<Resultado>(`${RUTA}/objetivos/${objetivo}/resultado`, payload),
  validarResultado: (objetivo: number, estado: EstadoValidacion, observacion = '') =>
    api.post<Resultado>(`${RUTA}/objetivos/${objetivo}/validar`, { estado, observacion }),
  acumulado: (corte: { tipo: TipoCorte; anio?: number; indice?: number }) =>
    api.get<Acumulado>(`${RUTA}/acumulado`, corte as Record<string, unknown>),
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
