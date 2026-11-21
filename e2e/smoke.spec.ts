import { expect, test } from "@playwright/test";

// En CI solo corre si hay BASE_URL (despliegue/preview a probar). En local, por defecto http://localhost:4173.
test.skip(!!process.env.CI && !process.env.BASE_URL, "BASE_URL no definida en CI");

test("la home carga y el titulo contiene 'Reinos de Ceniza'", async ({ page }) => {
  const res = await page.goto("/");
  expect(res?.ok()).toBe(true);
  await expect(page).toHaveTitle(/Reinos de Ceniza/);
});

test("/devlog/ responde", async ({ page }) => {
  const res = await page.goto("/devlog/");
  expect(res?.status()).toBeLessThan(400);
});
