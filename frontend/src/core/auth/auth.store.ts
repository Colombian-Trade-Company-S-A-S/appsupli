import { create } from 'zustand';
import { tokenStorage } from '@/core/session/tokenStorage';
import { setUnauthorizedHandler } from '@/shared/api/http-client';
import { useAppearanceStore } from '@/shared/hooks';
import { authApi } from './auth.api';
import type { LoginCredentials, User } from './types';

type Status = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: User | null;
  status: Status;
  error: string | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  /** Rehidrata la sesión al arrancar la app. */
  bootstrap: () => Promise<void>;
  /** ¿Tiene este permiso? El admin siempre sí. */
  can: (permission: string) => boolean;
  /** Refresca el usuario en memoria tras cambiar sus preferencias. */
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'idle',
  error: null,

  async login(credentials) {
    set({ status: 'loading', error: null });
    try {
      const { accessToken, refreshToken, user } = await authApi.login(credentials);
      tokenStorage.set(accessToken, refreshToken);
      aplicarApariencia(user);
      set({ user, status: 'authenticated', error: null });
    } catch (error) {
      tokenStorage.clear();
      set({
        user: null,
        status: 'unauthenticated',
        error: error instanceof Error ? error.message : 'Error al iniciar sesión',
      });
      throw error;
    }
  },

  async logout() {
    try {
      await authApi.logout();
    } catch {
      // Cerrar sesión localmente aunque falle el backend.
    } finally {
      tokenStorage.clear();
      set({ user: null, status: 'unauthenticated', error: null });
    }
  },

  async bootstrap() {
    if (!tokenStorage.getAccess()) {
      set({ status: 'unauthenticated', user: null });
      return;
    }
    try {
      const user = await authApi.me();
      aplicarApariencia(user);
      set({ user, status: 'authenticated' });
    } catch {
      tokenStorage.clear();
      set({ user: null, status: 'unauthenticated' });
    }
  },

  setUser(user) {
    aplicarApariencia(user);
    set({ user });
  },

  can(permission) {
    const user = get().user;
    if (!user) return false;
    return user.isAdmin || user.permissions.includes(permission);
  },
}));

/** Lleva la apariencia guardada en la cuenta al store de UI. */
function aplicarApariencia(user: User) {
  useAppearanceStore
    .getState()
    .hydrate({ theme: user.theme, accent: user.accent, radius: user.radius });
}

// La capa de red no conoce el store: se le inyecta la reacción al 401.
setUnauthorizedHandler(() => {
  tokenStorage.clear();
  useAuthStore.setState({ user: null, status: 'unauthenticated' });
});
