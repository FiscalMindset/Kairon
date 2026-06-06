import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, resolve(__dirname, '..'), '');
  const localEnv = loadEnv(mode, __dirname, '');
  const env = { ...rootEnv, ...localEnv };
  const proxyTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:5001';
  const serverPort = parseInt(env.FRONTEND_PORT || '5173', 10);

  return {
    plugins: [react()],
    root: '.',
    base: '/',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    server: {
      port: serverPort,
      strictPort: false,
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
      headers: {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'credentialless',
      },
    },
  };
});
