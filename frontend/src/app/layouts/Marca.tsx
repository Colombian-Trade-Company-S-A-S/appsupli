import { env } from '@/shared/config/env';
import { cn } from '@/shared/lib/utils';

/** La marca de la plataforma: la «S» y el nombre, igual que en el sidebar. */
export function Marca({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold', className)}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
        S
      </span>
      {env.appName}
    </span>
  );
}

/**
 * Cuadrícula de fondo que se desvanece hacia abajo. Es decoración: va detrás
 * del contenido y no la leen los lectores de pantalla.
 *
 * `invertida` es para fondos de color primario, donde las líneas se trazan con
 * el color del texto encima del primario.
 */
export function Cuadricula({ invertida = false }: { invertida?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 [background-size:3rem_3rem] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_0%,black,transparent)]',
        invertida
          ? 'bg-[linear-gradient(to_right,color-mix(in_oklch,var(--primary-foreground)_10%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,var(--primary-foreground)_10%,transparent)_1px,transparent_1px)]'
          : 'bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)]',
      )}
    />
  );
}
