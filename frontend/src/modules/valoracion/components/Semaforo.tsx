import { cn } from '@/shared/lib/utils';
import type { CompetenciaResultado, Nivel } from '../api';

/** Los cinco niveles, de mejor a peor, con su token de color. */
export const NIVELES: Array<{ value: Nivel; label: string; corto: string }> = [
  { value: 'referente', label: 'Es un referente', corto: 'Referente' },
  { value: 'consolidado', label: 'Está consolidado', corto: 'Consolidado' },
  { value: 'desarrollo', label: 'En desarrollo', corto: 'En desarrollo' },
  { value: 'acompanamiento', label: 'Requiere acompañamiento', corto: 'Acompañamiento' },
  { value: 'intervencion', label: 'Requiere intervención inmediata', corto: 'Intervención' },
];

const FONDO: Record<Nivel, string> = {
  referente: 'bg-level-referente',
  consolidado: 'bg-level-consolidado',
  desarrollo: 'bg-level-desarrollo',
  acompanamiento: 'bg-level-acompanamiento',
  intervencion: 'bg-level-intervencion',
};

export const etiquetaNivel = (nivel: Nivel) =>
  NIVELES.find((n) => n.value === nivel)?.label ?? nivel;

/** Punto de color + nombre del nivel. */
export function NivelBadge({
  nivel,
  etiqueta,
  corto = false,
  className,
}: {
  nivel: Nivel;
  etiqueta?: string;
  corto?: boolean;
  className?: string;
}) {
  const info = NIVELES.find((n) => n.value === nivel);
  return (
    <span
      className={cn(
        // El punto lleva el color; la etiqueta va en tinta normal. Dos de los
        // cinco niveles no llegan a 3:1 contra el fondo y como texto no se
        // leerían.
        'inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-foreground',
        className,
      )}
    >
      <span className={cn('size-2 shrink-0 rounded-full', FONDO[nivel])} aria-hidden />
      {etiqueta ?? (corto ? info?.corto : info?.label) ?? nivel}
    </span>
  );
}

/** Barra 0-100 pintada con el color del nivel. */
export function BarraNivel({
  porcentaje,
  nivel,
  className,
}: {
  porcentaje: number;
  nivel: Nivel;
  className?: string;
}) {
  const ancho = Math.max(0, Math.min(100, porcentaje));
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}
      role="img"
      aria-label={`${ancho}% · ${etiquetaNivel(nivel)}`}
    >
      <div
        className={cn('h-full rounded-full transition-all', FONDO[nivel])}
        style={{ width: `${ancho}%` }}
      />
    </div>
  );
}

/** Barra neutra de avance (no es un resultado, es progreso de respuestas). */
export function BarraAvance({ porcentaje, className }: { porcentaje: number; className?: string }) {
  const ancho = Math.max(0, Math.min(100, porcentaje));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-primary transition-all"
        style={{ width: `${ancho}%` }}
      />
    </div>
  );
}

/** Resultado por competencia en barras. */
export function Competencias({ items }: { items: CompetenciaResultado[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin detalle por competencia todavía.</p>;
  }
  return (
    <div className="flex flex-col gap-4">
      {items.map((competencia) => (
        <div key={competencia.label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">{competencia.label}</span>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {competencia.average} / 5 · {competencia.percentage}%
            </span>
          </div>
          <BarraNivel porcentaje={competencia.percentage} nivel={competencia.level} />
          <NivelBadge nivel={competencia.level} corto />
        </div>
      ))}
    </div>
  );
}
