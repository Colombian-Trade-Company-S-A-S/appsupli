import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
} from '@/shared/components/ui';
import { cn } from '@/shared/lib/utils';

/** Cifra grande con su rótulo. La pieza básica de todos los tableros. */
export function Kpi({
  label,
  value,
  hint,
  children,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn('gap-2', className)}>
      <CardHeader className="pb-0">
        <CardTitle className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
        {children}
      </CardContent>
    </Card>
  );
}

/** Encabezado de página: título, bajada y acciones a la derecha. */
export function Encabezado({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** Estados de carga y vacío de una tabla, con la misma forma en todo el sistema. */
export function EstadoTabla({
  cargando,
  vacio,
  icono,
  titulo,
  descripcion,
  children,
  filas = 6,
}: {
  cargando: boolean;
  vacio: boolean;
  icono: ReactNode;
  titulo: string;
  descripcion: string;
  children: ReactNode;
  filas?: number;
}) {
  if (cargando) {
    return (
      <div className="flex flex-col gap-3 p-6">
        {Array.from({ length: filas }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (vacio) {
    return (
      <Empty className="py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">{icono}</EmptyMedia>
          <EmptyTitle>{titulo}</EmptyTitle>
          <EmptyDescription>{descripcion}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return <div className="overflow-x-auto">{children}</div>;
}

/**
 * Barra de proporción sobre el total. Un solo color: compara magnitudes de
 * una misma medida, no identifica series distintas.
 */
export function BarraProporcion({
  porcentaje,
  className,
}: {
  porcentaje: number;
  className?: string;
}) {
  const ancho = Math.max(0, Math.min(100, porcentaje));
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className="h-full rounded-full bg-[var(--chart-1)] transition-all"
        style={{ width: `${ancho}%` }}
      />
    </div>
  );
}
