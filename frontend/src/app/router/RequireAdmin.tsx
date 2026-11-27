import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/core/auth';

/**
 * Solo el administrador de la plataforma. En Administración, quien entra con
 * «Ver usuarios» consulta; editar a una persona sigue siendo del administrador.
 */
export function RequireAdmin() {
  const { user } = useAuth();
  if (!user?.isAdmin) return <Navigate to="/inicio" replace />;
  return <Outlet />;
}
