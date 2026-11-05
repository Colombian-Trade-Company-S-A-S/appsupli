import { z } from 'zod';

const envSchema = z.object({
  VITE_API_URL: z.string().default('/api'),
  VITE_APP_NAME: z.string().default('appSupli'),
  // La aplicación de Entra ID para «Ingresar con Microsoft». No son secretos
  // (viajan en la URL de Microsoft) y son los mismos del backend: vivir acá
  // deja el botón listo aunque el backend de Render esté dormido.
  VITE_MICROSOFT_TENANT_ID: z.string().default('2ff22c76-1647-48cc-81ae-36b57a4a192b'),
  VITE_MICROSOFT_CLIENT_ID: z.string().default('06ed2626-9f44-4faf-a85d-89ac03203664'),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas', parsed.error.flatten().fieldErrors);
  throw new Error('Configuración de entorno inválida. Revisa tu archivo .env');
}

export const env = {
  apiUrl: parsed.data.VITE_API_URL,
  appName: parsed.data.VITE_APP_NAME,
  microsoft: {
    tenantId: parsed.data.VITE_MICROSOFT_TENANT_ID,
    clientId: parsed.data.VITE_MICROSOFT_CLIENT_ID,
  },
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;
