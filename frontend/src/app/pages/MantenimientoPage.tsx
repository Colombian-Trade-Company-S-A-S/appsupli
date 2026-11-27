import { CalendarClockIcon, LogOutIcon, WrenchIcon } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/core/auth';
import { Button } from '@/shared/components/ui';
import { IconoMarca, Logo } from '@/app/layouts/Marca';

export function MantenimientoPage() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const cerrarSesion = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-muted/40 p-4">
      <section className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm sm:p-10">
        <div className="mb-8 flex items-center gap-2.5">
          <IconoMarca />
          <Logo />
        </div>

        <div className="mb-6 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <WrenchIcon className="size-7" aria-hidden="true" />
        </div>

        <p className="mb-2 text-sm font-medium text-primary">Mantenimiento programado</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Estamos preparando la aplicación
        </h1>
        <p className="mt-3 text-muted-foreground">
          En este momento solo pueden ingresar los administradores. La aplicación volverá a estar
          disponible hoy, 27 de noviembre de 2026, después de las 4:00 p. m. (hora de Colombia).
        </p>

        <div className="mt-6 flex items-start gap-3 rounded-xl bg-muted/70 p-4 text-sm">
          <CalendarClockIcon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <p>Gracias por tu comprensión. Podrás volver a ingresar después de la hora indicada.</p>
        </div>

        {user ? (
          <Button variant="outline" className="mt-8" onClick={() => void cerrarSesion()}>
            <LogOutIcon data-icon="inline-start" />
            Cerrar sesión
          </Button>
        ) : (
          <Button
            variant="outline"
            className="mt-8"
            render={<Link to="/login" state={{ from: { pathname: location.pathname } }} />}
          >
            Iniciar sesión
          </Button>
        )}
      </section>
    </main>
  );
}
