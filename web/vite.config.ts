/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Dev workflow: `task-man serve` runs the Hono API on :3030,
// `npm run dev` here serves the frontend on :5173 and proxies
// /api → :3030 so cookies + same-origin behavior just work.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3030',
      '/healthz': 'http://localhost:3030',
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
