// Render e2e (ADR-006 §10.4): Chromium headless with software WebGL (SwiftShader), no GPU needed.
// Serves the production build with `vite preview` (COOP/COEP headers included). Build first: `pnpm e2e:render`.
import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

const PORT = Number(process.env.RENDER_PORT ?? 4174);
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.CHROMIUM_PATH ?? (fs.existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

// Verified flag set for WebGL2 under SwiftShader in this environment (see docs/progress/fase-02/swiftshader.md).
export const SWIFTSHADER_ARGS = [
  '--no-sandbox',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];

export default defineConfig({
  testDir: './e2e/render',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  outputDir: 'test-results/render',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'off' },
  webServer: {
    command: `pnpm --filter @reinos/client exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium-swiftshader',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath, args: SWIFTSHADER_ARGS },
      },
    },
  ],
});
