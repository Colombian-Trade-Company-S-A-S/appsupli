import { api } from '@/shared/api/http-client';
import type {
  ChangePasswordPayload,
  LoginCredentials,
  LoginResponse,
  PreferencesPayload,
  User,
} from './types';

export const authApi = {
  login: (credentials: LoginCredentials) => api.post<LoginResponse>('/auth/login', credentials),
  me: () => api.get<User>('/auth/me'),
  updatePreferences: (payload: PreferencesPayload) =>
    api.patch<User>('/auth/preferences', payload),
  logout: () => api.post<void>('/auth/logout'),
  verifyPassword: (password: string) => api.post<void>('/auth/verify-password', { password }),
  changePassword: (payload: ChangePasswordPayload) =>
    api.post<void>('/auth/change-password', payload),
};
