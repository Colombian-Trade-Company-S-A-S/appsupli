import type { Objetivo, PasoHistorial, Resultado } from './api';

/**
 * El flujo de aprobación tal como lo ve la gente, en cuatro estados.
 *
 * El backend guarda tres (pendiente, validado, rechazado); el cuarto,
 * «corregido», es un pendiente que ya fue devuelto alguna vez. Se distingue
 * porque el jefe no revisa igual una carga nueva que una corrección: en la
 * corrección le importa qué cambió desde que la devolvió.
 */
export type EstadoRevision = 'por_revisar' | 'corregido' | 'devuelto' | 'aprobado';

export const ETIQUETA_REVISION: Record<EstadoRevision, string> = {
  por_revisar: 'Por revisar',
  corregido: 'Corregido · por revisar',
  devuelto: 'Devuelto',
  aprobado: 'Aprobado',
};

export function estadoRevision(resultado: Resultado): EstadoRevision {
  if (resultado.estadoValidacion === 'validado') return 'aprobado';
  if (resultado.estadoValidacion === 'rechazado') return 'devuelto';
  return resultado.historial.some((paso) => paso.accion === 'rechazado')
    ? 'corregido'
    : 'por_revisar';
}

/** Pendiente de una decisión del jefe: es lo único que se aprueba o se devuelve. */
export const porRevisar = (resultado: Resultado) => resultado.estadoValidacion === 'pendiente';

const indiceUltimo = (pasos: PasoHistorial[], accion: PasoHistorial['accion']) => {
  for (let i = pasos.length - 1; i >= 0; i -= 1) if (pasos[i].accion === accion) return i;
  return -1;
};

/** El último rechazo, con su motivo: lo que el colaborador tiene que corregir. */
export function ultimoRechazo(resultado: Resultado): PasoHistorial | undefined {
  const indice = indiceUltimo(resultado.historial, 'rechazado');
  return indice >= 0 ? resultado.historial[indice] : undefined;
}

/** Lo que estaba cargado cuando se devolvió: el «antes» de la corrección. */
export function versionDevuelta(resultado: Resultado): PasoHistorial | undefined {
  const indice = indiceUltimo(resultado.historial, 'rechazado');
  for (let i = indice - 1; i >= 0; i -= 1) {
    const paso = resultado.historial[i];
    if (paso.accion === 'cargado' || paso.accion === 'corregido') return paso;
  }
  return undefined;
}

/** El valor cargado, dicho como lo entiende la persona («Sí se cumplió», «8 unidades»). */
export function valorLegible(objetivo: Objetivo, valor: string | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  const numero = Number(valor);
  switch (objetivo.tipoMedicion) {
    case 'binario':
      return numero === 1 ? 'Sí se cumplió' : 'No se cumplió';
    case 'cualitativa':
      return `${numero} de ${objetivo.metaValor ? Number(objetivo.metaValor) : 2} criterios`;
    default:
      return `${numero}${objetivo.unidadLabel ? ` ${objetivo.unidadLabel.toLowerCase()}` : ''}`;
  }
}

export const porcentajeLegible = (valor: string | null | undefined) =>
  valor === null || valor === undefined ? '—' : `${Number(valor)}%`;

export const fechaHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' }) : '';

/** Los enlaces los escribe una persona: solo se abren si son http(s). */
export const esEnlaceSeguro = (enlace: string) => /^https?:\/\//i.test(enlace);
