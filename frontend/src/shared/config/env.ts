import { z } from 'zod';

const envSchema = z.object({
  VITE_API_URL: z.string().default('/api'),
  VITE_APP_NAME: z.string().default('Supli'),
});

const parsed = envSchema.safeParse(import.meta.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas', parsed.error.flatten().fieldErrors);
  throw new Error('Configuración de entorno inválida. Revisa tu archivo .env');
}

export const env = {
  apiUrl: parsed.data.VITE_API_URL,
  appName: parsed.data.VITE_APP_NAME,
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;
