import { Link, Outlet } from 'react-router-dom';
import { BarChart3Icon, LayoutGridIcon, TrophyIcon } from 'lucide-react';
import { useForceTheme } from '@/shared/hooks';
import { Cuadricula, Marca } from './Marca';

const HERRAMIENTAS = [
  {
    icono: BarChart3Icon,
    titulo: 'Supli Performance',
    corto: 'Define, consulta y realiza seguimiento a tus objetivos y resultados.',
  },
  {
    icono: TrophyIcon,
    titulo: 'Supli Challenge',
    corto: 'Participa en retos que fortalecen la colaboración y la cultura Supli.',
  },
  {
    icono: LayoutGridIcon,
    titulo: 'Herramientas para toda la compañía',
    corto:
      'Consulta y utiliza las soluciones que apoyan el trabajo, la colaboración y el crecimiento de Supli.',
  },
];

/**
 * Layout del login. Siempre en oscuro, igual que el resto del sitio público.
 *
 * El formulario va a la izquierda; a la derecha, en pantallas grandes, un
 * panel con el degradado de marca que cuenta qué hay detrás. En celular el panel
 * se oculta: ahí lo único que importa es entrar.
 */
export function AuthLayout() {
  useForceTheme('dark');

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
          © {new Date().getFullYear()} Supli. Uso interno.
        </p>
      </div>

      <aside className="relative isolate hidden flex-col justify-between gap-10 overflow-hidden bg-brand-gradient p-12 text-white lg:flex">
        <Cuadricula invertida />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -bottom-24 -z-10 size-96 rounded-full bg-white/10 blur-3xl"
        />

        <span className="self-start rounded-full border border-white/20 px-3 py-1 text-xs text-white/80">
          El ecosistema digital de Supli OS
        </span>

        <div className="flex max-w-lg flex-col gap-8">
          <div className="flex flex-col gap-3">
            <h2 className="text-3xl font-semibold tracking-tight text-balance">
              Un ecosistema digital
              <br />
              que crece contigo.
            </h2>
            <p className="text-white/75 text-pretty">
              Accede a herramientas que impulsan tu desarrollo y fortalecen la colaboración en
              Supli.
            </p>
          </div>

          <ul className="flex flex-col gap-4">
            {HERRAMIENTAS.map(({ icono: Icono, titulo, corto }) => (
              <li key={titulo} className="flex items-center gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <Icono className="size-5" />
                </span>
                <div className="flex flex-col">
                  <span className="font-medium">{titulo}</span>
                  <span className="text-sm text-white/70">{corto}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}
