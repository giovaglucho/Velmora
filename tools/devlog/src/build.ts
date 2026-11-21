import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DevlogSchema, HITOS, type Devlog } from './schema.js';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pad = (n: number) => String(n).padStart(2, '0');
const num = (n: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(n);

export function loadEntries(root: string): Devlog[] {
  const dir = join(root, 'docs/progress');
  const out: Devlog[] = [];
  for (const d of readdirSync(dir)
    .filter((x) => /^fase-\d\d$/.test(x))
    .sort()) {
    const f = join(dir, d, 'devlog.json');
    if (!existsSync(f)) continue;
    const r = DevlogSchema.safeParse(JSON.parse(readFileSync(f, 'utf8')));
    if (!r.success) throw new Error(`devlog.json inválido en ${d}: ${r.error.message}`);
    if (`fase-${pad(r.data.fase)}` !== d)
      throw new Error(`${d}: el campo fase (${r.data.fase}) no coincide con la carpeta`);
    out.push(r.data);
  }
  return out.sort((a, b) => b.fase - a.fase);
}

function metricsText(e: Devlog): string {
  const m = e.metricas;
  const parts = [
    m.fps === null ? 'fps: pendiente' : `${num(m.fps)} fps`,
    m.tick === null ? 'tick: pendiente' : `tick ${num(m.tick)} ms`,
    m.tests === null ? 'tests: pendiente' : `${num(m.tests)} tests verdes`,
  ];
  return parts.join(' · ');
}

export function readmeFor(e: Devlog): string {
  const imgs = e.imagenes.map((i) => `![${i.alt}](media/${i.archivo})`).join(' ');
  const vid = e.video ? ` [video](media/${e.video})` : '';
  return `# Fase ${pad(e.fase)} — ${e.titulo} (${Math.round(e.porcentaje)}% del plan)

${imgs}${vid}

**Ahora se puede:** ${e.ahoraSePuede}

**Métricas:** ${metricsText(e)}${e.metricas.nota ? ` (${e.metricas.nota})` : ''}.

${e.notas && e.notas.length > 0 ? `**Notas:**\n\n${e.notas.map((n) => `- ${n}`).join('\n')}\n\n` : ''}**Siguiente:** ${e.siguiente}
`;
}

export function hitosBar(actual: number): string {
  const items = HITOS.map((h) => {
    const cur = actual >= h.desde && actual <= h.hasta;
    const done = actual > h.hasta;
    const cls = cur ? 'hito actual' : done ? 'hito hecho' : 'hito';
    const rango = h.desde === h.hasta ? `F${h.desde}` : `F${h.desde}–${h.hasta}`;
    return `<li class="${cls}"${cur ? ' aria-current="step"' : ''}><span class="dot"></span><b>Hito ${h.n}</b><span>${esc(h.nombre)}</span><small>${rango}${cur ? ` · estamos en F${actual}` : ''}</small></li>`;
  });
  return `<ol class="hitos" aria-label="Hitos del plan">${items.join('')}</ol>`;
}

function card(e: Devlog, mediaBase: string): string {
  const m = e.metricas;
  const stat = (label: string, v: number | null, unit: string) =>
    `<div class="stat${v === null ? ' pend' : ''}"><span class="v">${v === null ? '—' : num(v)}</span><span class="u">${v === null ? 'pendiente' : unit}</span><span class="l">${label}</span></div>`;
  const gal = e.imagenes
    .map(
      (i) =>
        `<a href="${mediaBase}/${encodeURI(i.archivo)}"><img loading="lazy" src="${mediaBase}/${encodeURI(i.archivo)}" alt="${esc(i.alt)}"></a>`,
    )
    .join('');
  const vid = e.video
    ? `<video controls muted loop preload="metadata" src="${mediaBase}/${encodeURI(e.video)}"></video>`
    : '';
  return `<article class="card" id="fase-${pad(e.fase)}">
<header><h2><span class="n">Fase ${pad(e.fase)}</span> ${esc(e.titulo)}</h2><span class="pct">${Math.round(e.porcentaje)}% del plan</span></header>
<div class="bar" role="progressbar" aria-valuenow="${Math.round(e.porcentaje)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.round(e.porcentaje)}%"></i></div>
${gal ? `<div class="gallery">${gal}</div>` : ''}${vid}
<p><strong>Ahora se puede:</strong> ${esc(e.ahoraSePuede)}</p>
<div class="stats">${stat('FPS', m.fps, 'fps')}${stat('Tick', m.tick, 'ms')}${stat('Tests', m.tests, 'verdes')}</div>
${m.nota ? `<p class="nota">${esc(m.nota)}</p>` : ''}
<p><strong>Siguiente:</strong> ${esc(e.siguiente)}</p>
${e.fecha ? `<footer>${esc(e.fecha)}</footer>` : ''}
</article>`;
}

const CSS = `:root{--bg:#14100d;--bg2:#1e1813;--card:#241c15;--line:#3a2d20;--text:#f0e4d2;--mute:#b3a089;--gold:#f2a93b;--ember:#d9622b;--ok:#8fbf6a}
*{box-sizing:border-box}html{color-scheme:dark}
body{margin:0;background:radial-gradient(1200px 500px at 50% -10%,#3a2412 0,var(--bg) 60%) fixed,var(--bg);color:var(--text);font:17px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:980px;margin:0 auto;padding:32px 16px 64px}
h1{font:700 clamp(28px,5vw,44px)/1.1 Georgia,serif;margin:0 0 6px;color:var(--gold);letter-spacing:.01em}
.sub{color:var(--mute);margin:0 0 28px}
.hitos{list-style:none;display:grid;grid-template-columns:repeat(5,1fr);gap:8px;padding:0;margin:0 0 32px;counter-reset:h}
.hito{background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:flex;flex-direction:column;gap:2px;font-size:14px;color:var(--mute);position:relative}
.hito b{color:var(--text)}.hito small{color:var(--mute)}
.hito .dot{width:10px;height:10px;border-radius:50%;background:var(--line);margin-bottom:4px}
.hito.hecho .dot{background:var(--ok)}
.hito.actual{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold),0 0 24px #f2a93b33;color:var(--text)}
.hito.actual .dot{background:var(--gold);box-shadow:0 0 10px var(--gold)}
.hito.actual small{color:var(--gold);font-weight:600}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px;margin:0 0 24px}
.card header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;justify-content:space-between}
.card h2{margin:0;font:700 24px/1.2 Georgia,serif}.card h2 .n{color:var(--gold)}
.pct{color:var(--ember);font-weight:700}
.bar{height:8px;background:var(--bg);border-radius:4px;overflow:hidden;margin:12px 0 18px}
.bar i{display:block;height:100%;background:linear-gradient(90deg,var(--ember),var(--gold))}
.gallery{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:16px}
.gallery img,video{width:100%;height:auto;border-radius:8px;border:1px solid var(--line);display:block;background:#000}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}
.stat{background:var(--bg2);border:1px solid var(--line);border-radius:10px;padding:10px;display:grid;justify-items:center}
.stat .v{font:700 26px/1.1 Georgia,serif;color:var(--gold)}.stat.pend .v{color:var(--mute)}
.stat .u,.stat .l{font-size:13px;color:var(--mute)}
.nota{color:var(--mute);font-size:14px;margin:0 0 12px}
footer{color:var(--mute);font-size:13px}
@media(max-width:700px){.hitos{grid-template-columns:1fr}.stats{grid-template-columns:1fr}body{font-size:16px}}`;

export function buildDevlog(opts: { root?: string; outDir?: string } = {}) {
  const root = opts.root ?? REPO_ROOT;
  const outDir = opts.outDir ?? join(root, 'packages/client/public/devlog');
  const entries = loadEntries(root);
  if (entries.length === 0) throw new Error('No hay ningún docs/progress/fase-XX/devlog.json');
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const missing: string[] = [];
  for (const e of entries) {
    const tag = `fase-${pad(e.fase)}`;
    const files = [...e.imagenes.map((i) => i.archivo), ...(e.video ? [e.video] : [])];
    const present = new Set<string>();
    for (const f of files) {
      const src = join(root, 'docs/progress', tag, 'media', f);
      if (!existsSync(src)) {
        missing.push(`${tag}/media/${f}`);
        continue;
      }
      mkdirSync(dirname(join(outDir, 'media', tag, f)), { recursive: true });
      cpSync(src, join(outDir, 'media', tag, f));
      present.add(f);
    }
    // Sólo se muestran los medios que existen; el README se genera siempre desde el JSON.
    const shown: Devlog = {
      ...e,
      imagenes: e.imagenes.filter((i) => present.has(i.archivo)),
      video: e.video && present.has(e.video) ? e.video : undefined,
    };
    (e as Devlog & { _shown?: Devlog })._shown = shown;
    writeFileSync(join(root, 'docs/progress', tag, 'README.md'), readmeFor(e));
  }
  const actual = entries[0]!.fase;
  const cards = entries
    .map((e) => card((e as Devlog & { _shown: Devlog })._shown, `media/fase-${pad(e.fase)}`))
    .join('\n');
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Devlog — Reinos de Ceniza</title><link rel="stylesheet" href="devlog.css"></head>
<body><main>
<h1>Devlog · Reinos de Ceniza</h1>
<p class="sub">Progreso visible fase por fase. Lo más reciente arriba.</p>
${hitosBar(actual)}
${cards}
</main></body></html>
`;
  writeFileSync(join(outDir, 'index.html'), html);
  writeFileSync(join(outDir, 'devlog.css'), CSS);
  return { outDir, fases: entries.map((e) => e.fase), missing };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const r = buildDevlog();
  console.log(`devlog: fases ${r.fases.join(', ')} -> ${r.outDir}`);
  for (const m of r.missing) console.warn(`aviso: falta media ${m}`);
}
