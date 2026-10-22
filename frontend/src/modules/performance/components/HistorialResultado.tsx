import type { LucideIcon } from 'lucide-react';
import {
  CircleCheckIcon,
  CircleXIcon,
  ExternalLinkIcon,
  MessageSquareIcon,
  PencilIcon,
  UploadIcon,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { AccionHistorial, Objetivo } from '../api';
import { esEnlaceSeguro, fechaHora, porcentajeLegible, valorLegible } from '../flujo';

/**
 * Cómo se nombra y se pinta cada paso. Se usan las mismas palabras del flujo
 * («Devuelto», «Aprobado») y no las del backend, para que la tabla, la
 * revisión y el historial digan lo mismo.
 */
const ESTILO: Record<
  AccionHistorial,
  { titulo: string; icono: LucideIcon; clase: string; etiquetaComentario: string }
> = {
  cargado: {
    titulo: 'Resultado cargado',
    icono: UploadIcon,
    clase: 'border-border bg-muted text-muted-foreground',
    etiquetaComentario: 'Observación',
  },
  corregido: {
    titulo: 'Resultado corregido',
    icono: PencilIcon,
    clase: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    etiquetaComentario: 'Observación',
  },
  feedback: {
    titulo: 'Comentario',
    icono: MessageSquareIcon,
    clase: 'border-primary/40 bg-primary/10 text-primary',
    etiquetaComentario: 'Comentario',
  },
  validado: {
    titulo: 'Aprobado',
    icono: CircleCheckIcon,
    clase: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    etiquetaComentario: 'Comentario',
  },
  rechazado: {
    titulo: 'Devuelto',
    icono: CircleXIcon,
    clase: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
    etiquetaComentario: 'Motivo',
  },
};

/**
 * El historial del resultado, del más reciente al más viejo.
 *
 * Muestra quién cargó o corrigió (con el valor, el % y las evidencias de ese
 * momento), quién aprobó o devolvió y por qué. Lo ven el colaborador, su jefe,
 * People y admin: los mismos que pueden ver el objetivo.
 */
export function HistorialResultado({ objetivo }: { objetivo: Objetivo }) {
  const pasos = [...(objetivo.resultado?.historial ?? [])].reverse();

  if (pasos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Este resultado todavía no tiene movimientos.</p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {pasos.map((paso) => {
        const estilo = ESTILO[paso.accion];
        const Icono = estilo.icono;
        const esCarga = paso.accion === 'cargado' || paso.accion === 'corregido';
        return (
          <li key={paso.id} className="flex gap-3">
            <span
              className={cn(
                'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border',
                estilo.clase,
              )}
              aria-hidden
            >
              <Icono className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm">
              <p className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="font-medium">{estilo.titulo}</span>
                <time className="text-xs text-muted-foreground" dateTime={paso.createdAt}>
                  {fechaHora(paso.createdAt)}
                </time>
              </p>
              <p className="text-xs text-muted-foreground">
                {paso.autorNombre || 'Sin autor registrado'}
                {esCarga && (
                  <>
                    {' '}
                    · {valorLegible(objetivo, paso.resultadoEjecutado)} ·{' '}
                    {porcentajeLegible(paso.porcentajeCumplimiento)}
                  </>
                )}
              </p>
              {paso.comentario && (
                <p className="mt-1.5 text-pretty whitespace-pre-line">
                  <span className="text-xs font-medium text-muted-foreground">
                    {estilo.etiquetaComentario}:{' '}
                  </span>
                  {paso.comentario}
                </p>
              )}
              {esCarga && paso.evidencias && paso.evidencias.length > 0 && (
                <ul className="mt-1.5 flex flex-col gap-0.5 text-xs">
                  {paso.evidencias.map((evidencia, indice) => (
                    <li key={`${evidencia.linkSoporte}-${indice}`} className="min-w-0">
                      {esEnlaceSeguro(evidencia.linkSoporte) ? (
                        <a
                          href={evidencia.linkSoporte}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-4 hover:underline"
                        >
                          <ExternalLinkIcon className="size-3 shrink-0" />
                          <span className="truncate">
                            {evidencia.nombre || evidencia.linkSoporte}
                          </span>
                        </a>
                      ) : (
                        <span className="break-all text-muted-foreground">
                          {evidencia.linkSoporte}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
