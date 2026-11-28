import { api, httpClient } from '@/shared/api/http-client';
import type {
  ChangePasswordPayload,
  ConfigIngreso,
  LoginCredentials,
  LoginResponse,
  MiembroEquipo,
  PreferencesPayload,
  ResultadoFoto,
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
  /** Las personas activas que tiene a cargo directo. */
  miEquipo: () => api.get<MiembroEquipo[]>('/auth/me/equipo'),
  updatePreferences: (payload: PreferencesPayload) => api.patch<User>('/auth/preferences', payload),
  /**
   * `instalada`: la instaló. `despues`: no la quiso aún. `visto`: leyó el
   * recordatorio. En los tres casos el aviso vuelve a salir en 15 días.
   */
  decidirInstalacion: (decision: 'instalada' | 'despues' | 'visto') =>
    api.post<User>('/auth/instalacion-app', { decision }),
  /** Sube la foto de perfil; el backend también la escribe en Odoo. */
  subirFoto: (foto: Blob) => {
    const cuerpo = new FormData();
    cuerpo.append('foto', foto, 'foto.jpg');
    return httpClient
      .put<ResultadoFoto>('/auth/me/foto', cuerpo, { headers: { 'Content-Type': undefined } })
      .then((r) => r.data);
  },
  logout: () => api.post<void>('/auth/logout'),
  verifyPassword: (password: string) => api.post<void>('/auth/verify-password', { password }),
  changePassword: (payload: ChangePasswordPayload) =>
    api.post<void>('/auth/change-password', payload),
};
