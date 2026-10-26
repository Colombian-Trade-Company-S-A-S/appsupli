import { api, httpClient } from '@/shared/api/http-client';
import type {
  ChangePasswordPayload,
  ConfigIngreso,
  LoginCredentials,
  LoginResponse,
  PreferencesPayload,
  User,
} from './types';

/**
 * Lo que tarda en despertar el backend del plan gratis de Render. Entrar es lo
 * primero que se le pide después de dormir, así que el ingreso espera más que
 * los 30 s normales en vez de decir que falló.
 */
const ESPERA_INGRESO = 90_000;

export const authApi = {
  login: (credentials: LoginCredentials) =>
    httpClient
      .post<LoginResponse>('/auth/login', credentials, { timeout: ESPERA_INGRESO })
      .then((r) => r.data),
  ingreso: () => api.get<ConfigIngreso>('/auth/ingreso'),
  microsoft: (idToken: string) =>
    httpClient
      .post<LoginResponse>('/auth/microsoft', { idToken }, { timeout: ESPERA_INGRESO })
      .then((r) => r.data),
  me: () => api.get<User>('/auth/me'),
  updatePreferences: (payload: PreferencesPayload) => api.patch<User>('/auth/preferences', payload),
  /**
   * `instalada`: la instaló (recordatorio en 10 inicios). `despues`: se le
   * vuelve a ofrecer en 3. `visto`: leyó el recordatorio (otra vez en 10).
   */
  decidirInstalacion: (decision: 'instalada' | 'despues' | 'visto') =>
    api.post<User>('/auth/instalacion-app', { decision }),
  logout: () => api.post<void>('/auth/logout'),
  verifyPassword: (password: string) => api.post<void>('/auth/verify-password', { password }),
  changePassword: (payload: ChangePasswordPayload) =>
    api.post<void>('/auth/change-password', payload),
};
