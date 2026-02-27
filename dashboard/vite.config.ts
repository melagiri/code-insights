import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // The SPA is served by the Hono server at localhost:7890.
  // In dev mode (pnpm dev in dashboard/), proxy API calls to the running server.
  server: {
    proxy: {
      '/api': 'http://localhost:7890',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
