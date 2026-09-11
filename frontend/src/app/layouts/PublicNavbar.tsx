import { Link } from 'react-router-dom';
import { ArrowRightIcon } from 'lucide-react';
import { buttonVariants } from '@/shared/components/ui';
import { Marca } from './Marca';

/** Las secciones de la portada. `/#…` funciona desde cualquier página pública. */
const SECCIONES = [
  { href: '/#modulos', etiqueta: 'Módulos' },
  { href: '/#como-funciona', etiqueta: 'Cómo funciona' },
];

export function PublicNavbar() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" aria-label="Ir al inicio">
          <Marca />
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Secciones">
          {SECCIONES.map(({ href, etiqueta }) => (
            <a key={href} href={href} className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              {etiqueta}
            </a>
          ))}
        </nav>

        <div className="ml-auto">
          <Link to="/login" className={buttonVariants({ size: 'sm' })}>
            Iniciar sesión
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </div>
      </div>
    </header>
  );
}
