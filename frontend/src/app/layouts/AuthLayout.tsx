import { Outlet } from 'react-router-dom';
import { useForceLightTheme } from '@/shared/hooks';
import { env } from '@/shared/config/env';

/** Layout del login. Siempre en claro, igual que el resto del sitio público. */
export function AuthLayout() {
  useForceLightTheme();

  return (
    <div className="grid h-full lg:grid-cols-2">
      <div className="flex flex-col gap-6 p-6 md:p-10">
        <span className="flex items-center gap-2 font-medium">
          <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            S
          </span>
          {env.appName}
        </span>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {env.appName}. Uso interno.
        </p>
      </div>

      <div className="hidden flex-col justify-end gap-3 border-l bg-muted p-10 lg:flex">
        <h2 className="text-2xl font-semibold tracking-tight">
          Una sola plataforma para todas las áreas de la compañía.
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Entra con tu cuenta corporativa y accede a lo que te corresponde.
        </p>
      </div>
    </div>
  );
}
