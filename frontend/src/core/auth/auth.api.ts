import { api } from '@/shared/api/http-client';
import type {
  ChangePasswordPayload,
  ConfigIngreso,
  LoginCredentials,
  LoginResponse,
  PreferencesPayload,
  User,
} from './types';

export const authApi = {
  login: (credentials: LoginCredentials) => api.post<LoginResponse>('/auth/login', credentials),
  ingreso: () => api.get<ConfigIngreso>('/auth/ingreso'),
  microsoft: (idToken: string) => api.post<LoginResponse>('/auth/microsoft', { idToken }),
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
