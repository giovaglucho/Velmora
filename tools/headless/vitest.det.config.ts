import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['test/det/**/*.test.ts'], testTimeout: 600_000, hookTimeout: 600_000 },
});
