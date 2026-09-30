import { Card, CardContent, CardHeader, Skeleton } from '@/shared/components/ui';

type Forma = 'tablero' | 'lista' | 'detalle' | 'formulario';

/**
 * Esqueleto con la forma de la pantalla que viene, en lugar de un spinner:
 * la página «aparece» en su sitio y el ojo ya sabe dónde mirar.
 */
export function EsqueletoPagina({
  forma = 'tablero',
  label = 'Cargando…',
}: {
  forma?: Forma;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <Titulo />
      {forma === 'tablero' && <Tablero />}
      {forma === 'lista' && <Lista />}
      {forma === 'detalle' && <Detalle />}
      {forma === 'formulario' && <Formulario />}
    </div>
  );
}

function Titulo() {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <Skeleton className="h-8 w-28" />
    </div>
  );
}

function Kpis() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="gap-3">
          <CardHeader>
            <Skeleton className="h-3 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-3 w-36" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Filas({ n = 6 }: { n?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: n }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" style={{ opacity: 1 - i * 0.1 }} />
      ))}
    </div>
  );
}

function Tablero() {
  return (
    <>
      <Kpis />
      <Card>
        <CardHeader className="gap-2">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Filas n={4} />
        </CardContent>
      </Card>
    </>
  );
}

function Lista() {
  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-9 w-32" />
      </div>
      <Card>
        <CardContent>
          <Filas n={8} />
        </CardContent>
      </Card>
    </>
  );
}

function Detalle() {
  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="mt-2 h-40 w-full" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Skeleton className="size-12 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Filas n={4} />
        </CardContent>
      </Card>
    </div>
  );
}

function Formulario() {
  return (
    <Card className="max-w-3xl">
      <CardContent className="flex flex-col gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        <Skeleton className="h-9 w-32 self-end" />
      </CardContent>
    </Card>
  );
}
