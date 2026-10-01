import { Navigate, Outlet } from 'react-router-dom';
import { tieneApp, useAuth } from '@/core/auth';

/**
 * Deja entrar solo a quien tenga asignada la aplicación.
 *
 * Es el mismo criterio con el que se arma el sidebar: si la app no aparece en
 * `/auth/me` —en la raíz o como sub-módulo—, tampoco se puede llegar
 * escribiendo la URL a mano.
 */
export function RequireApp({ code }: { code: string }) {
  const { user } = useAuth();
  if (!tieneApp(user, code)) return <Navigate to="/inicio" replace />;
  return <Outlet />;
}
