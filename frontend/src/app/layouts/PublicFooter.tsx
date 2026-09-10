import { Link } from 'react-router-dom';
import { env } from '@/shared/config/env';

export function PublicFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
        <span className="flex items-center gap-2 font-semibold">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            S
          </span>
          {env.appName}
        </span>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {env.appName}. Uso interno.
        </p>

        <Link
          to="/login"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Iniciar sesión
        </Link>
      </div>
    </footer>
  );
}
