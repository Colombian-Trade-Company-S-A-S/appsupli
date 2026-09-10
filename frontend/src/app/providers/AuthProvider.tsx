import { useEffect, type ReactNode } from 'react';
import { useAuthStore } from '@/core/auth';
import { FullPageLoader } from '@/shared/components/feedback';

/** Rehidrata la sesión antes de montar el router. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const status = useAuthStore((s) => s.status);
  const bootstrap = useAuthStore((s) => s.bootstrap);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (status === 'idle') return <FullPageLoader label="Iniciando…" />;

  return <>{children}</>;
}
