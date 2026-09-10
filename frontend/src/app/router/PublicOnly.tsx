import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/core/auth';
import { FullPageLoader } from '@/shared/components/feedback';

interface LocationState {
  from?: { pathname: string };
}

/** Si ya hay sesión, el login redirige adentro. */
export function PublicOnly() {
  const { isAuthenticated, isBootstrapping } = useAuth();
  const location = useLocation();
  const from = (location.state as LocationState | null)?.from?.pathname ?? '/inicio';

  if (isBootstrapping) return <FullPageLoader />;
  if (isAuthenticated) return <Navigate to={from} replace />;

  return <Outlet />;
}
