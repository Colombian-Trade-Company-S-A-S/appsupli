import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './http-client';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (intentos, error) => {
        // No reintentar errores del cliente (401, 403, 404, validación).
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return intentos < 2;
      },
    },
    mutations: { retry: 0 },
  },
});
