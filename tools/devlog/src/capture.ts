import { createServer } from 'node:http';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type { AddressInfo } from 'node:net';
import { launch } from './browser.js';
import { REPO_ROOT } from './build.js';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webm': 'video/webm',
  '.gif': 'image/gif',
  '.js': 'text/javascript',
};

export function serveStatic(dir: string) {
  const server = createServer((req, res) => {
    const p = normalize(decodeURIComponent((req.url ?? '/').split('?')[0]!)).replace(
      /^(\.\.[/\\])+/,
      '',
    );
    let f = join(dir, p);
    if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
    if (!f.startsWith(dir) || !existsSync(f)) {
      res.writeHead(404).end('not found');
      return;
    }
    res
      .writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' })
      .end(readFileSync(f));
  });
  return new Promise<{ url: string; close: () => void }>((ok) =>
    server.listen(0, '127.0.0.1', () =>
      ok({
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        close: () => server.close(),
      }),
    ),
  );
}

export async function captureHtml(html: string, out: string) {
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  await page.setContent(html);
  await page.screenshot({ path: out });
  await browser.close();
}

if (process.argv[1]?.endsWith('capture.ts')) {
  const media = join(REPO_ROOT, 'docs/progress/fase-00/media');
  mkdirSync(media, { recursive: true });
  const srv = await serveStatic(join(REPO_ROOT, 'packages/client/public'));
  const browser = await launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });
  await page.goto(`${srv.url}/devlog/`, { waitUntil: 'load' });
  await page.screenshot({ path: join(media, 'devlog.png') });
  await browser.close();
  srv.close();
  console.log(`captura: ${join(media, 'devlog.png')}`);
}
