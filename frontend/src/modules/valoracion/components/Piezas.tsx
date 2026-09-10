import { LockIcon, TrendingDownIcon, TrendingUpIcon } from 'lucide-react';
import {
  Card,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';
import type { Avance } from '../api';
import { BarraAvance } from './Semaforo';

/** Flecha de tendencia entre los dos últimos ciclos. */
export function Tendencia({ valor }: { valor: number }) {
  if (!valor) return <span className="text-xs text-muted-foreground">Sin variación</span>;
  const sube = valor > 0;
  const Icono = sube ? TrendingUpIcon : TrendingDownIcon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium tabular-nums',
        sube ? 'text-success' : 'text-destructive',
      )}
    >
      <Icono className="size-3.5" />
      {sube ? '+' : ''}
      {valor} pts vs. ciclo anterior
    </span>
  );
}

/**
 * Pantalla de «todavía no está disponible».
 *
 * Mis resultados y Planes de acción nacen bloqueados: se abren cuando People
 * habilita la publicación, idealmente con el 100% de las evaluaciones dentro.
 */
export function Bloqueado({ seccion, avance }: { seccion: string; avance?: Avance }) {
  return (
    <Card>
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LockIcon />
          </EmptyMedia>
          <EmptyTitle>{seccion} aún no está disponible</EmptyTitle>
          <EmptyDescription>
            Los resultados se publican cuando termina la ronda de evaluaciones. El área de People
            avisará cuando estén abiertos para todo el equipo.
          </EmptyDescription>
        </EmptyHeader>
        {avance && avance.total > 0 && (
          <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
            <BarraAvance porcentaje={avance.percentage} />
            <p className="text-xs text-muted-foreground">
              {avance.completed} de {avance.total} evaluaciones respondidas ({avance.percentage}%)
            </p>
          </div>
        )}
      </Empty>
    </Card>
  );
}

// Lo genérico vive en `shared`; aquí se reexporta para no tocar los imports
// de las pantallas del módulo.
export { Encabezado, EstadoTabla, Kpi } from '@/shared/components/layout';
export { formatoFecha, formatoFechaHora, paraInputFechaHora } from '@/shared/lib/formato';
