import { defineConfig } from 'vitest/config';

// Default `pnpm test`: fast tests only. The 1000 units x 10 000 ticks golden lives in test/det
// and runs through `pnpm test:det` (vitest.det.config.ts).
export default defineConfig({
  test: { include: ['test/**/*.test.ts'], exclude: ['test/det/**', 'node_modules/**'] },
});
