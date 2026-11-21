// Helpers for the R2/R3 render specs (fixed-scene harness: /render-harness.html). Owner: render-engineer.
import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

export const MEDIA_DIR = path.resolve(process.cwd(), 'docs/progress/fase-02/media');

/** Collects console errors/warnings (minus the known SwiftShader ReadPixels perf hint) and page errors. */
export function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.text().includes('GL Driver Message') && m.text().includes('Performance')) return;
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  return errors;
}

export async function openHarness(page: Page, query: string): Promise<void> {
  await page.goto('/render-harness.html?' + query);
  await page.waitForFunction(
    () => {
      const w = window as unknown as {
        __renderHarness?: { ready: boolean };
        __renderHarnessError?: string;
      };
      return w.__renderHarness?.ready === true || w.__renderHarnessError !== undefined;
    },
    null,
    { timeout: 30_000 },
  );
  const err = await page.evaluate(
    () => (window as unknown as { __renderHarnessError?: string }).__renderHarnessError,
  );
  expect(err, 'harness failed to start').toBeUndefined();
}

export function saveMedia(name: string, buf: Buffer): string {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const p = path.join(MEDIA_DIR, name);
  fs.writeFileSync(p, buf);
  return p;
}

export function readPng(buf: Buffer): PNG {
  return PNG.sync.read(buf);
}

export function percentile(values: number[], p: number): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
}
