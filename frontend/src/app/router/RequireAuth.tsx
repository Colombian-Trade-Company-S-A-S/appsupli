import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/core/auth';
import { FullPageLoader } from '@/shared/components/feedback';

/** Bloquea el área privada y recuerda a dónde iba la persona. */
export function RequireAuth() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const location = useLocation();

  if (isBootstrapping) return <FullPageLoader label="Verificando sesión…" />;
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />;

  return <Outlet />;
}
