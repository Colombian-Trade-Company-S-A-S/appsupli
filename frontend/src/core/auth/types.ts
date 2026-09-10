/** Una app/módulo de la plataforma a la que el usuario tiene acceso. */
export interface Application {
  id: number;
  code: string;
  name: string;
  description: string;
  basePath: string;
  /** Nombre del ícono en lucide-react. */
  icon: string;
  order: number;
}

import type { Accent, Radius, Theme } from '@/shared/hooks';

export interface User {
  id: number;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  fullName: string;
  area: string;
  position: string;
  kind: 'admin' | 'lider' | 'colaborador';
  phone: string;
  /** Jefe directo, vacío si no tiene. */
  managerName: string;
  /** Personas activas a su cargo. */
  teamCount: number;
  avatarUrl: string;
  isActive: boolean;
  /** Apariencia guardada en la cuenta: sigue a la persona entre equipos. */
  theme: Theme;
  accent: Accent;
  radius: Radius;
  /** Admin de la plataforma: entra a todo. */
  isAdmin: boolean;
  roles: string[];
  applications: Application[];
  /** Permisos efectivos, formato `app:recurso:accion`. */
  permissions: string[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface PreferencesPayload {
  theme?: Theme;
  accent?: Accent;
  radius?: Radius;
}
