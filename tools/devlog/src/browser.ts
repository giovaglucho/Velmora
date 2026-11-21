import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright";

/** chromium.launch() sin opciones; si la revisión esperada no está instalada, usa el Chromium preinstalado. */
export async function launch(): Promise<Browser> {
  const args = ["--no-sandbox"];
  if (existsSync(chromium.executablePath())) return chromium.launch({ args });
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  const dir = readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop();
  const exe = dir ? join(base, dir, "chrome-linux64", "chrome") : "";
  if (!existsSync(exe)) throw new Error(`No se encontró Chromium en ${base}`);
  return chromium.launch({ args, executablePath: exe });
}
