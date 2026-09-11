import { Link, Outlet } from 'react-router-dom';
import { LockKeyholeIcon } from 'lucide-react';
import { useForceLightTheme } from '@/shared/hooks';
import { env } from '@/shared/config/env';
import { MODULOS } from '@/app/pages/modulosPublicos';
import { Cuadricula, Marca } from './Marca';

/**
 * Layout del login. Siempre en claro, igual que el resto del sitio público.
 *
 * El formulario va a la izquierda; a la derecha, en pantallas grandes, un
 * panel en el color primario que cuenta qué hay detrás. En celular el panel
 * se oculta: ahí lo único que importa es entrar.
 */
export function AuthLayout() {
  useForceLightTheme();

  return (
    <div className="grid min-h-full lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col gap-6 p-6 md:p-10">
        <Link to="/" aria-label="Ir al inicio" className="self-start">
          <Marca />
        </Link>

        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-sm">
            <Outlet />
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} {env.appName}. Uso interno.
        </p>
      </div>

      <aside className="relative isolate hidden flex-col justify-between gap-10 overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <Cuadricula invertida />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 -z-10 size-96 rounded-full bg-primary-foreground/10 blur-3xl"
        />

        <span className="self-start rounded-full border border-primary-foreground/20 px-3 py-1 text-xs text-primary-foreground/80">
          Plataforma interna
        </span>

        <div className="flex max-w-lg flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Una sola plataforma para todas las áreas de la compañía.
            </h2>
            <p className="text-primary-foreground/75 text-pretty">
              Entra con tu cuenta corporativa y accede a lo que te corresponde.
            </p>
          </div>

          <ul className="flex flex-col gap-4">
            {MODULOS.map(({ icono: Icono, titulo, corto }) => (
              <li key={titulo} className="flex items-center gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/10 ring-1 ring-primary-foreground/15">
                  <Icono className="size-5" />
                </span>
                <div className="flex flex-col">
                  <span className="font-medium">{titulo}</span>
                  <span className="text-sm text-primary-foreground/70">{corto}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="flex items-center gap-2 text-sm text-primary-foreground/70">
          <LockKeyholeIcon className="size-4" />
          Tu cuenta es personal: no compartas tu contraseña.
        </p>
      </aside>
    </div>
  );
}
