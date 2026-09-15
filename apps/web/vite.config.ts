import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API is proxied, so the browser sees one origin and the
// refresh cookie behaves exactly as it will in production. Deployments set
// VITE_API_URL to the API's own origin.
const API_TARGET = process.env.API_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  optimizeDeps: {
    // Read straight from the package's ESM output rather than pre-bundling it.
    // Pre-bundling caches by package.json and lockfile, not by dist contents,
    // so a rebuild of shared would leave the dev server serving stale exports.
    exclude: ['@tracker/shared'],
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: true },
      '/health': { target: API_TARGET, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
