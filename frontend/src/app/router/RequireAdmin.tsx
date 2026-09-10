import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/core/auth';

/** Solo el administrador de la plataforma entra al módulo de Administración. */
export function RequireAdmin() {
  const { user } = useAuth();
  if (!user?.isAdmin) return <Navigate to="/inicio" replace />;
  return <Outlet />;
}
