import { env } from '@/shared/config/env';
import { cn } from '@/shared/lib/utils';

/** El ícono de la app: la «S» sobre el degradado de marca, como el instalable. */
export function IconoMarca({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-gradient font-heading text-sm font-extrabold text-white',
        className,
      )}
    >
      S
    </span>
  );
}

/**
 * El logotipo: «Supli» en Montserrat Extrabold con el degradado oficial, y lo
 * demás del nombre de la app («app») pegado, en el color del texto.
 */
export function Logo({ className }: { className?: string }) {
  const [antes, despues] = env.appName.split('Supli');
  const conMarca = despues !== undefined;
  return (
    <span className={cn('inline-flex items-baseline leading-none', className)}>
      {conMarca && antes && <span className={RESTO_DEL_NOMBRE}>{antes}</span>}
      <span className="text-logo">{conMarca ? 'Supli' : env.appName}</span>
      {conMarca && despues && <span className={RESTO_DEL_NOMBRE}>{despues}</span>}
    </span>
  );
}

const RESTO_DEL_NOMBRE = 'font-heading font-semibold tracking-tight text-foreground/80';

/** La marca de la plataforma: el ícono y el logotipo, igual que en el sidebar. */
export function Marca({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5 text-lg', className)}>
      <IconoMarca />
      <Logo />
    </span>
  );
}

/**
 * Cuadrícula de fondo que se desvanece hacia abajo. Es decoración: va detrás
 * del contenido y no la leen los lectores de pantalla.
 *
 * `invertida` es para fondos con el degradado de marca: líneas en blanco.
 */
export function Cuadricula({ invertida = false }: { invertida?: boolean }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 -z-10 [background-size:3rem_3rem] [mask-image:radial-gradient(ellipse_80%_70%_at_50%_0%,black,transparent)]',
        invertida
          ? 'bg-[linear-gradient(to_right,color-mix(in_oklch,white_12%,transparent)_1px,transparent_1px),linear-gradient(to_bottom,color-mix(in_oklch,white_12%,transparent)_1px,transparent_1px)]'
          : 'bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)]',
      )}
    />
  );
}
