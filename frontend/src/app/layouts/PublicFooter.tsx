import { Link } from 'react-router-dom';
import { env } from '@/shared/config/env';
import { Separator } from '@/shared/components/ui';
import { Marca } from './Marca';

export function PublicFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex max-w-xs flex-col gap-3">
            <Marca />
            <p className="text-sm text-muted-foreground">
              La plataforma interna de la compañía: una cuenta para todas las áreas.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm" aria-label="Pie de página">
            <a
              href="/#modulos"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Módulos
            </a>
            <a
              href="/#como-funciona"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Cómo funciona
            </a>
            <Link
              to="/login"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              Iniciar sesión
            </Link>
          </nav>
        </div>

        <Separator />

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {env.appName}. Uso interno.
        </p>
      </div>
    </footer>
  );
}
