import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Cross-origin isolation (ADR-004, ADR-006 §2.1): identical to the Render Blueprint headers.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, headers: isolationHeaders },
  preview: { port: 4173, host: true, headers: isolationHeaders },
  worker: { format: 'es' },
  build: {
    outDir: 'dist',
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: {
      // `gl-smoke.html`: early WebGL/SwiftShader smoke page (T0). Safe to drop once Q1's smoke covers it.
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        'gl-smoke': resolve(import.meta.dirname, 'gl-smoke.html'),
        // Render lane (R2/R3) fixed-scene harness: terrain + fake units, no worker/UI.
        'render-harness': resolve(import.meta.dirname, 'render-harness.html'),
        'worker-smoke': resolve(import.meta.dirname, 'worker-smoke.html'),
      },
    },
  },
});
