import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/core/auth';
import { MantenimientoPage } from '@/app/pages/MantenimientoPage';

// La hora incluye el huso de Colombia (UTC-5), independientemente del equipo.
const FIN_MANTENIMIENTO = new Date('2026-11-27T16:00:00-05:00').getTime();

/** Durante el mantenimiento, el resto de la app queda disponible solo para admins. */
export function RequireAdminDuranteMantenimiento({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [ahora, setAhora] = useState(() => Date.now());
  const mantenimientoActivo = ahora < FIN_MANTENIMIENTO;

  useEffect(() => {
    if (!mantenimientoActivo) return;

    const temporizador = window.setTimeout(
      () => setAhora(Date.now()),
      FIN_MANTENIMIENTO - Date.now(),
    );

    return () => window.clearTimeout(temporizador);
  }, [mantenimientoActivo]);

  if (user?.isAdmin || !mantenimientoActivo) return children;

  return <MantenimientoPage />;
}
