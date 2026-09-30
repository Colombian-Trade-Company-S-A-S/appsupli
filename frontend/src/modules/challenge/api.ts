import { api } from '@/shared/api/http-client';

const RUTA = '/challenge';

export type Categoria = 'cultura' | 'ritmo' | 'infraestructura' | 'kms' | 'aprende' | 'impulsa';
export type EstadoReto = 'borrador' | 'publicado' | 'cerrado' | 'finalizado';
export type Alcance = 'todos' | 'areas' | 'personas';
export type FormatoEvidencia = 'texto' | 'imagen' | 'pdf' | 'enlace';
export type VisibilidadEvidencia = 'lider_people' | 'participantes' | 'organizacion';
export type EstadoParticipacion = 'entregada' | 'valorada' | 'descalificada';

export interface Opcion {
  value: string;
  label: string;
}

export interface OpcionNumerica {
  value: number;
  label: string;
}

/** Un criterio de la rúbrica del reto (B2). */
export interface Criterio {
  id: number;
  nombre: string;
  orden: number;
  desempate: boolean;
}

export interface Reto {
  id: number;
  titulo: string;
  descripcion: string;
  categoria: Categoria;
  categoriaLabel: string;
  estado: EstadoReto;
  estadoLabel: string;
  cuentaParaDesempeno: boolean;
  alcance: Alcance;
  alcanceLabel: string;
  areas: number[];
  personas: number[];
  pais: string;
  cierraEl: string;
  formatosEvidencia: FormatoEvidencia[];
  visibilidadEvidencia: VisibilidadEvidencia;
  visibilidadLabel: string;
  criterios: Criterio[];
  juradosNombres: string[];
  creadoPor: number;
  creadoPorNombre: string;
  publicadoEn: string | null;
  cerradoEn: string | null;
  finalizadoEn: string | null;
  participacionesCount: number;
  valoradasCount: number;
  createdAt: string;
}

export interface RetoPayload {
  titulo: string;
  descripcion: string;
  categoria: Categoria | '';
  cuentaParaDesempeno: boolean;
  alcance: Alcance;
  areas: number[];
  personas: number[];
  pais: string;
  cierraEl: string;
  formatosEvidencia: FormatoEvidencia[];
  visibilidadEvidencia: VisibilidadEvidencia;
}

export interface PuntajeDeCriterio {
  criterio: number;
  criterioNombre: string;
  nivel: number;
}

export interface Valoracion {
  id: number;
  evaluador: number;
  evaluadorNombre: string;
  esJurado: boolean;
  comentario: string;
  noCumple: boolean;
  puntaje: string | null;
  puntajes: PuntajeDeCriterio[];
  createdAt: string;
}

export interface Participacion {
  id: number;
  reto: number;
  participante: number;
  participanteNombre: string;
  participanteCargo: string;
  formato: FormatoEvidencia;
  entregaTexto: string;
  entregaLink: string;
  estado: EstadoParticipacion;
  estadoLabel: string;
  puntajeFinal: string | null;
  puntajeConBonus: string | null;
  bonus: number;
  esGanador: boolean;
  motivoDescalificacion: string;
  valoraciones: Valoracion[];
  puedePedirRevision: boolean;
  evidenciaVisible: boolean;
  createdAt: string;
}

export interface Capacidades {
  puedeGestionarRetos: boolean;
  esEvaluador: boolean;
}

export interface OpcionesChallenge {
  categorias: Opcion[];
  alcances: Opcion[];
  formatos: Opcion[];
  visibilidades: Opcion[];
  estados: Opcion[];
  criteriosBase: Array<{ nombre: string; desempate: boolean; orden: number }>;
  /** Qué significa cada nivel de 1 a 10, para orientar al evaluador. */
  niveles: OpcionNumerica[];
  areas: OpcionNumerica[];
  personas: OpcionNumerica[];
  capacidades: Capacidades;
}

export interface FilaRanking {
  participacion: number;
  participante: number;
  participanteNombre: string;
  cargo: string;
  estado: EstadoParticipacion;
  puntaje: string | null;
  bonus: number;
  total: number | null;
  esGanador: boolean;
}

export interface ResultadoReto {
  reto: Reto;
  ganador: Participacion | null;
  huboDesempate: boolean;
  ranking: FilaRanking[];
}

export interface MiParticipacion {
  id: number;
  reto: number;
  retoTitulo: string;
  categoria: Categoria;
  categoriaLabel: string;
  estadoReto: EstadoReto;
  estado: EstadoParticipacion;
  estadoLabel: string;
  puntaje: string | null;
  total: string | null;
  esGanador: boolean;
  puedePedirRevision: boolean;
  createdAt: string;
}

export interface MisRetos {
  retos: number;
  ganados: number;
  puntos: number;
  participaciones: MiParticipacion[];
}

export interface FilaTop {
  participante: number;
  nombre: string;
  cargo: string;
  retos: number;
  ganados: number;
  puntos: number;
}

export interface Top {
  ranking: FilaTop[];
  miPosicion: number | null;
}

export interface ParticipacionPayload {
  formato: FormatoEvidencia;
  entregaTexto?: string;
  entregaLink?: string;
}

export interface ValoracionPayload {
  puntajes?: Array<{ criterio: number; nivel: number }>;
  comentario?: string;
  noCumple?: boolean;
}

export const challengeApi = {
  opciones: () => api.get<OpcionesChallenge>(`${RUTA}/opciones`),
  retos: (filtros?: { categoria?: string; estado?: string }) =>
    api.get<Reto[]>(`${RUTA}/retos`, filtros),
  reto: (id: number) => api.get<Reto>(`${RUTA}/retos/${id}`),
  crear: (payload: RetoPayload) => api.post<Reto>(`${RUTA}/retos`, payload),
  editar: (id: number, payload: Partial<RetoPayload>) =>
    api.patch<Reto>(`${RUTA}/retos/${id}`, payload),
  eliminar: (id: number) => api.delete<void>(`${RUTA}/retos/${id}`),
  // Ciclo de vida: borrador → abierto → cerrado → finalizado (B8).
  publicar: (id: number) => api.post<Reto>(`${RUTA}/retos/${id}/publicar`),
  cerrar: (id: number) => api.post<Reto>(`${RUTA}/retos/${id}/cerrar`),
  finalizar: (id: number) => api.post<Reto>(`${RUTA}/retos/${id}/finalizar`),
  reabrir: (id: number, motivo: string) =>
    api.post<Reto>(`${RUTA}/retos/${id}/reabrir`, { motivo }),
  participaciones: (reto: number) =>
    api.get<Participacion[]>(`${RUTA}/retos/${reto}/participaciones`),
  participar: (reto: number, payload: ParticipacionPayload) =>
    api.post<Participacion>(`${RUTA}/retos/${reto}/participaciones`, payload),
  valorar: (participacion: number, payload: ValoracionPayload) =>
    api.post<Participacion>(`${RUTA}/participaciones/${participacion}/valorar`, payload),
  pedirRevision: (participacion: number, motivo: string) =>
    api.post<unknown>(`${RUTA}/participaciones/${participacion}/revision`, { motivo }),
  resultado: (reto: number) => api.get<ResultadoReto>(`${RUTA}/retos/${reto}/resultado`),
  misRetos: () => api.get<MisRetos>(`${RUTA}/mis-retos`),
  top: () => api.get<Top>(`${RUTA}/top`),
};

/** El puntaje de una valoración: promedio de los criterios × 10 (B2). */
export const puntajeDeNiveles = (niveles: number[]) =>
  niveles.length
    ? Number(((niveles.reduce((a, b) => a + b, 0) / niveles.length) * 10).toFixed(2))
    : 0;

/** `2026-10-30` → `30/10/2026`, sin pasar por `new Date` y su zona horaria. */
export const fechaCorta = (iso: string) => {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
};
