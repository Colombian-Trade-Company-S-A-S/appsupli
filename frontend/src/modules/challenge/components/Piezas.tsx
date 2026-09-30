import { Badge } from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import type { EstadoParticipacion, EstadoReto } from '../api';

/** El estado del reto, con el mismo color en todas las pantallas (B8). */
const TONO_RETO: Record<EstadoReto, string> = {
  borrador: 'bg-muted text-muted-foreground',
  publicado: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  cerrado: 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200',
  finalizado: 'bg-foreground/5 text-foreground',
};

export function EstadoReto({ estado, label }: { estado: EstadoReto; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONO_RETO[estado],
      )}
    >
      {label}
    </span>
  );
}

/** El estado de una entrega. La descalificada se ve distinta: vale cero. */
const TONO_PARTICIPACION: Record<EstadoParticipacion, string> = {
  entregada: 'bg-muted text-muted-foreground',
  valorada: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200',
  descalificada: 'border-red-500/40 bg-red-500/10 text-red-900 dark:text-red-200',
};

export function EstadoEntrega({ estado, label }: { estado: EstadoParticipacion; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONO_PARTICIPACION[estado],
      )}
    >
      {label}
    </span>
  );
}

/** La categoría del reto: una de las seis definitivas (B7). */
export function CategoriaBadge({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="shrink-0">
      {label}
    </Badge>
  );
}

/** Las iniciales de alguien: «Laura Ayala» → «LA». */
export const iniciales = (nombre: string) =>
  nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase())
    .join('');
