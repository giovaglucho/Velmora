import { expect, test } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173';

// En CI NUNCA se salta: si el servidor no esta, los tests fallan (no son no-op).
// En local, si no hay BASE_URL explicita y no hay servidor en :4173, se saltan (hay que levantar `pnpm --filter @reinos/client preview`).
test.beforeAll(async () => {
  if (process.env.CI || process.env.BASE_URL) return;
  const up = await fetch(BASE_URL).then(
    (r) => r.ok,
    () => false,
  );
  test.skip(!up, `sin servidor en ${BASE_URL}: levantar 'pnpm --filter @reinos/client preview'`);
});

test("la home carga y el titulo contiene 'Reinos de Ceniza'", async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.ok()).toBe(true);
  await expect(page).toHaveTitle(/Reinos de Ceniza/);
});

test('/devlog/ responde', async ({ page }) => {
  const res = await page.goto('/devlog/');
  expect(res?.status()).toBeLessThan(400);
});
