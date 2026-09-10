import { Spinner } from '@/shared/components/ui';

/** Pantalla de carga para Suspense y arranque de sesión. */
export function FullPageLoader({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[60vh] w-full flex-col items-center justify-center gap-3">
      <Spinner className="size-6 text-primary" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
