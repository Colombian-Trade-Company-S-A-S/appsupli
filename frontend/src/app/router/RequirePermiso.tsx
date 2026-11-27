import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/core/auth';

/**
 * Deja entrar solo a quien tenga el permiso —o alguno de ellos, si son
 * varios— o sea administrador.
 *
 * Va dentro de un `RequireApp`: la app ya se revisó y esto mira una parte de
 * ella —en BI Trade, cada informe—. Sin el permiso vuelve a la portada de la
 * app, donde la persona ve lo que sí tiene.
 */
export function RequirePermiso({
  permiso,
  volverA,
}: {
  permiso: string | string[];
  volverA: string;
}) {
  const { can } = useAuth();
  const alguno = typeof permiso === 'string' ? [permiso] : permiso;
  if (!alguno.some(can)) return <Navigate to={volverA} replace />;
  return <Outlet />;
}
