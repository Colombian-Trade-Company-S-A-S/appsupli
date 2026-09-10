import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
    },
    server: {
      port: 5173,
      proxy: env.VITE_API_PROXY_TARGET
        ? {
            '/api': {
              target: env.VITE_API_PROXY_TARGET,
              changeOrigin: true,
            },
          }
        : undefined,
    },
    build: {
      outDir: 'dist',
      sourcemap: mode !== 'production',
      rollupOptions: {
        output: {
          // Cada módulo de negocio queda en su propio chunk (lazy loading real).
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('recharts') || id.includes('d3-')) return 'vendor-charts';
              if (id.includes('react-router')) return 'vendor-router';
              if (id.includes('@tanstack')) return 'vendor-query';
              // Base UI: primitivas de shadcn/ui, cambian poco → chunk propio.
              if (id.includes('@base-ui')) return 'vendor-ui';
              if (id.includes('lucide-react')) return 'vendor-icons';
              return 'vendor';
            }
            return undefined;
          },
        },
      },
    },
  };
});
