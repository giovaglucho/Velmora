import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts: Vitest 2 bundles Vite 5, the app uses Vite 8 + plugin-react 6.
export default defineConfig({
  test: { environment: 'node', include: ['test/**/*.test.ts'] },
});
