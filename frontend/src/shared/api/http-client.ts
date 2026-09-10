import axios, { AxiosError, type AxiosInstance } from 'axios';
import { env } from '@/shared/config/env';
import { tokenStorage } from '@/core/session/tokenStorage';

export interface ApiErrorBody {
  code?: string;
  message?: string;
  errors?: Record<string, string[]>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly errors?: Record<string, string[]>;

  constructor(message: string, status = 500, code?: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

type Handler = () => void;
let onUnauthorized: Handler = () => {};

/** El módulo de sesión registra aquí qué hacer cuando el token expira. */
export function setUnauthorizedHandler(handler: Handler) {
  onUnauthorized = handler;
}

export const httpClient: AxiosInstance = axios.create({
  baseURL: env.apiUrl,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

httpClient.interceptors.request.use((config) => {
  const token = tokenStorage.getAccess();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

httpClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorBody>) => {
    if (!error.response) {
      return Promise.reject(
        new ApiError('No se pudo conectar con el servidor.', 0, 'NETWORK_ERROR'),
      );
    }
    const { status, data } = error.response;
    if (status === 401) onUnauthorized();
    return Promise.reject(
      new ApiError(data?.message ?? 'Ocurrió un error inesperado.', status, data?.code, data?.errors),
    );
  },
);

/** Listados paginados del backend: {items, total, page, pageSize}. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const api = {
  get: <T>(url: string, params?: Record<string, unknown>) =>
    httpClient.get<T>(url, { params }).then((r) => r.data),
  /** Normaliza listados: acepta paginado o array plano. */
  getList: <T>(url: string, params?: Record<string, unknown>) =>
    httpClient
      .get<Paginated<T> | T[]>(url, { params })
      .then((r) => (Array.isArray(r.data) ? r.data : r.data.items)),
  post: <T>(url: string, body?: unknown) => httpClient.post<T>(url, body).then((r) => r.data),
  patch: <T>(url: string, body?: unknown) => httpClient.patch<T>(url, body).then((r) => r.data),
  delete: <T>(url: string) => httpClient.delete<T>(url).then((r) => r.data),
};
