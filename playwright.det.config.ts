// Cross-environment determinism (plan E1/E2). Chromium always; Firefox and WebKit only with
// PW_ALL_BROWSERS=1 (CI installs them; the local sandbox does NOT have them).
import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.CHROMIUM_PATH ?? (fs.existsSync(PREINSTALLED) ? PREINSTALLED : undefined);
const all = process.env.PW_ALL_BROWSERS === '1';

const chromium = (args: string[]) => ({
  ...devices['Desktop Chrome'],
  launchOptions: { executablePath, args: ['--no-sandbox', ...args] },
});

export default defineConfig({
  testDir: './e2e/determinismo',
  timeout: 300_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { trace: 'off' },
  projects: [
    { name: 'chromium', use: chromium([]) },
    { name: 'chromium-jitless', use: chromium(['--js-flags=--jitless']) },
    ...(all
      ? [
          { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
          { name: 'webkit', use: { ...devices['Desktop Safari'] } },
        ]
      : []),
  ],
});
