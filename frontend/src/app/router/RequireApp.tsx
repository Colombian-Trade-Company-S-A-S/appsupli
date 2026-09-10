import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/core/auth';

/**
 * Deja entrar solo a quien tenga asignada la aplicación.
 *
 * Es el mismo criterio con el que se arma el sidebar: si la app no aparece en
 * `/auth/me`, tampoco se puede llegar escribiendo la URL a mano.
 */
export function RequireApp({ code }: { code: string }) {
  const { user } = useAuth();
  const tieneAcceso = user?.isAdmin || user?.applications.some((app) => app.code === code);
  if (!tieneAcceso) return <Navigate to="/inicio" replace />;
  return <Outlet />;
}
