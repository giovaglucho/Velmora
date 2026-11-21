import { defineConfig, devices } from "@playwright/test";
import fs from "node:fs";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4173";
// Chromium preinstalado (entornos sin `playwright install`). Override con CHROMIUM_PATH.
const PREINSTALLED = "/opt/pw-browsers/chromium";
const executablePath = process.env.CHROMIUM_PATH ?? (fs.existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: { baseURL: BASE_URL, trace: "off" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: { executablePath, args: ["--no-sandbox"] } },
    },
  ],
});
