import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 5173 },
  preview: { port: 4173, host: true },
  build: { outDir: 'dist', target: 'es2022' },
});
