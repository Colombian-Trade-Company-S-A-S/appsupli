import { useAuthStore } from './auth.store';

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const status = useAuthStore((s) => s.status);
  const error = useAuthStore((s) => s.error);

  return {
    user,
    status,
    error,
    isAuthenticated: status === 'authenticated' && !!user,
    /**
     * Solo la rehidratación inicial. NO incluye el `loading` del login: si lo
     * incluyera, los guards desmontarían el formulario en pleno envío y se
     * perderían los datos escritos.
     */
    isBootstrapping: status === 'idle',
    /** El login está en curso. */
    isSubmitting: status === 'loading',
    login: useAuthStore((s) => s.login),
    logout: useAuthStore((s) => s.logout),
    can: useAuthStore((s) => s.can),
    setUser: useAuthStore((s) => s.setUser),
  };
}
