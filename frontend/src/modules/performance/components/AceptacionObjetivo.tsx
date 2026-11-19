import { useState, type FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CircleCheckIcon, CircleXIcon, ClockIcon, PencilIcon, TargetIcon } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldLabel,
  Spinner,
  Textarea,
} from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import type { AccionObjetivo, Objetivo, PasoObjetivo } from '../api';
import { fechaHora } from '../flujo';
import { useResponderObjetivo } from '../hooks';

/**
 * La aceptación del objetivo como la ve la gente, en cuatro estados.
 *
 * El backend guarda tres (por aceptar, aceptado, rechazado); el cuarto,
 * «corregido», es un por aceptar que ya fue rechazado alguna vez: el jefe lo
 * ajustó y le vuelve a llegar al colaborador.
 */
type EstadoVisible = 'por_aceptar' | 'corregido' | 'aceptado' | 'rechazado';

const ESTILO_ESTADO: Record<EstadoVisible, { etiqueta: string; icono: LucideIcon; clase: string }> =
  {
    por_aceptar: {
      etiqueta: 'Por aceptar',
      icono: ClockIcon,
      clase: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    },
    corregido: {
      etiqueta: 'Corregido · por aceptar',
      icono: PencilIcon,
      clase: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200',
    },
    aceptado: {
      etiqueta: 'Aceptado',
      icono: CircleCheckIcon,
      clase: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    },
    rechazado: {
      etiqueta: 'Rechazado',
      icono: CircleXIcon,
      clase: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
    },
  };

function estadoVisible(objetivo: Objetivo): EstadoVisible | null {
  switch (objetivo.estadoAceptacion) {
    case 'aceptado':
      return 'aceptado';
    case 'rechazado':
      return 'rechazado';
    case 'pendiente':
      return objetivo.historial.some((paso) => paso.accion === 'rechazado')
        ? 'corregido'
        : 'por_aceptar';
    default:
      return null;
  }
}

/** El último rechazo, con su motivo: lo que el jefe tiene que corregir. */
export function ultimoRechazo(objetivo: Objetivo): PasoObjetivo | undefined {
  for (let i = objetivo.historial.length - 1; i >= 0; i -= 1) {
    if (objetivo.historial[i].accion === 'rechazado') return objetivo.historial[i];
  }
  return undefined;
}

/** El estado de la aceptación. Nada en los objetivos de antes de que existiera. */
export function AceptacionBadge({ objetivo }: { objetivo: Objetivo }) {
  const estado = estadoVisible(objetivo);
  if (!estado) return null;
  const { etiqueta, icono: Icono, clase } = ESTILO_ESTADO[estado];
  return (
    <span
      className={cn(
        'mt-1 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium',
        clase,
      )}
    >
      <Icono className="size-3.5 shrink-0" aria-hidden />
      {etiqueta}
    </span>
  );
}

/** Mientras está rechazado, el motivo a la vista: es lo que el jefe tiene que leer. */
export function MotivoDelRechazo({ objetivo }: { objetivo: Objetivo }) {
  if (objetivo.estadoAceptacion !== 'rechazado') return null;
  const rechazo = ultimoRechazo(objetivo);
  if (!rechazo?.comentario) return null;
  return (
    <p
      className="mt-1 line-clamp-3 max-w-md text-xs text-pretty text-red-700 dark:text-red-300"
      title={rechazo.comentario}
    >
      <span className="font-medium">
        Motivo{rechazo.autorNombre ? ` de ${rechazo.autorNombre}` : ''}:
      </span>{' '}
      {rechazo.comentario}
    </p>
  );
}

/**
 * Aceptar o rechazar el objetivo. Solo se pinta cuando el backend dice que
 * quien mira puede responder: el colaborador, mientras el mes no termina.
 */
export function BotonesRespuesta({ objetivo }: { objetivo: Objetivo }) {
  const responder = useResponderObjetivo();
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const rechazar = async (evento: FormEvent) => {
    evento.preventDefault();
    try {
      await responder.mutateAsync({
        objetivo: objetivo.id,
        estado: 'rechazado',
        motivo: motivo.trim(),
      });
      setRechazando(false);
      setMotivo('');
    } catch {
      // El aviso lo da la mutación con su toast.
    }
  };

  return (
    <>
      <div className="inline-flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          className="border-emerald-500/50 text-emerald-700 dark:text-emerald-300"
          disabled={responder.isPending}
          onClick={() => responder.mutate({ objetivo: objetivo.id, estado: 'aceptado' })}
        >
          <CircleCheckIcon data-icon="inline-start" />
          Aceptar
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-red-500/50 text-red-700 dark:text-red-300"
          disabled={responder.isPending}
          onClick={() => setRechazando(true)}
        >
          <CircleXIcon data-icon="inline-start" />
          Rechazar
        </Button>
      </div>

      <Dialog open={rechazando} onOpenChange={(abierto) => !abierto && setRechazando(false)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Rechazar el objetivo</DialogTitle>
            <DialogDescription className="text-pretty">
              «{objetivo.objetivo}». Tu jefe verá el motivo, lo ajustará y te volverá a llegar para
              que lo aceptes.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={rechazar} noValidate className="flex flex-col gap-4">
            <Field>
              <FieldLabel htmlFor={`motivo-${objetivo.id}`}>Motivo del rechazo</FieldLabel>
              <Textarea
                id={`motivo-${objetivo.id}`}
                rows={4}
                maxLength={2000}
                placeholder="La meta es el doble de lo del mes pasado y no depende solo de mí…"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                autoFocus
                required
              />
              <FieldDescription>Obligatorio: di qué cambiarías y por qué.</FieldDescription>
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setRechazando(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={!motivo.trim() || responder.isPending}
              >
                {responder.isPending ? (
                  <Spinner data-icon="inline-start" />
                ) : (
                  <CircleXIcon data-icon="inline-start" />
                )}
                Rechazar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

const ESTILO_PASO: Record<
  AccionObjetivo,
  { titulo: string; icono: LucideIcon; clase: string; etiquetaComentario: string }
> = {
  asignado: {
    titulo: 'Objetivo asignado',
    icono: TargetIcon,
    clase: 'border-border bg-muted text-muted-foreground',
    etiquetaComentario: 'Comentario',
  },
  corregido: {
    titulo: 'Objetivo corregido',
    icono: PencilIcon,
    clase: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    etiquetaComentario: 'Comentario',
  },
  aceptado: {
    titulo: 'Aceptado',
    icono: CircleCheckIcon,
    clase: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    etiquetaComentario: 'Comentario',
  },
  rechazado: {
    titulo: 'Rechazado',
    icono: CircleXIcon,
    clase: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
    etiquetaComentario: 'Motivo',
  },
};

/**
 * El historial de la aceptación, del más reciente al más viejo: quién asignó o
 * corrigió, quién aceptó o rechazó y por qué, con el objetivo como estaba en
 * cada paso (así se ve qué fue lo que se rechazó aunque ya haya cambiado).
 */
export function HistorialObjetivo({ objetivo }: { objetivo: Objetivo }) {
  const pasos = [...objetivo.historial].reverse();

  if (pasos.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este objetivo se definió antes de que existiera la aceptación: no tiene movimientos.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3">
      {pasos.map((paso) => {
        const estilo = ESTILO_PASO[paso.accion];
        const Icono = estilo.icono;
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
              </p>
              {paso.comentario && (
                <p className="mt-1.5 text-pretty whitespace-pre-line">
                  <span className="text-xs font-medium text-muted-foreground">
                    {estilo.etiquetaComentario}:{' '}
                  </span>
                  {paso.comentario}
                </p>
              )}
              <p className="mt-1.5 text-xs text-pretty text-muted-foreground">
                «{paso.textoObjetivo}» · KPI: {paso.kpi} · {Number(paso.peso)}%
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
