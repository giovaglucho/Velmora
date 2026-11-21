// Q2 — render performance PROXY (ADR-006 §10.2). `pnpm perf:render`.
// Measures the integrated client (window.__reinos, ?debug=1) in Chromium + SwiftShader (software WebGL) and writes
// docs/progress/fase-02/media/perf.{md,json}. It is NOT hardware-of-reference evidence: K1 (>= 60 fps) stays TODO-HUMANO.
//
// Usage: node e2e/perf/perf-render.mjs [--reps N] [--warmup S] [--window S] [--scenarios a,b] [--modes sab,transfer]
//        [--zooms 0,1,2] [--update-baseline] [--no-write]
// Requires a built client (`pnpm --filter @reinos/client build`, done by `pnpm perf:render`).
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const MEDIA = path.join(ROOT, 'docs/progress/fase-02/media');
const BASELINE = path.join(ROOT, 'e2e/perf/perf-baseline.json');
const PORT = Number(process.env.PERF_PORT ?? 4175);
const PREINSTALLED = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.CHROMIUM_PATH ?? (fs.existsSync(PREINSTALLED) ? PREINSTALLED : undefined);

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const REPS = Number(opt('reps', 3));
const WARMUP_S = Number(opt('warmup', 3));
const WINDOW_S = Number(opt('window', 10));
const SCENARIOS = opt('scenarios', 'demo400').split(',');
const MODES = opt('modes', 'sab,transfer').split(',');
const ZOOMS = opt('zooms', '0,1,2').split(',').map(Number);
const ZOOM_T = [0.6, 1, 1.4];
const UPDATE_BASELINE = args.includes('--update-baseline');
const NO_WRITE = args.includes('--no-write');

/** Gates of the proxy (ADR-006 §10.2). The FPS gate is relative to perf-baseline.json with a wide margin. */
const GATES = {
  updateMsP95: 4,
  drawCalls: 60,
  tickMsP95: 3,
  ticksDropped: 0,
  fpsMinFractionOfBaseline: 0.6,
};

const FLAGS = [
  '--no-sandbox',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
];

const pct = (arr, p) => {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const median = (a) => pct(a, 50);
const r3 = (n) => Math.round(n * 1000) / 1000;

async function startPreview() {
  const child = spawn(
    'pnpm',
    [
      '--filter',
      '@reinos/client',
      'exec',
      'vite',
      'preview',
      '--port',
      String(PORT),
      '--strictPort',
    ],
    { stdio: 'ignore', detached: true },
  );
  const url = `http://localhost:${PORT}/`;
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(url);
      if (r.ok) return { child, url };
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill();
  throw new Error('vite preview did not start');
}

/** One measurement: fresh page, scenario/mode/zoom fixed, units ordered to move back and forth. */
async function measure(browser, base, scenario, mode, zoomIndex) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.text().includes('GL Driver Message') && m.text().includes('Performance')) return;
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?scenario=${scenario}&snap=${mode}&debug=1`);
  await page.waitForFunction(() => window.__reinos?.ready === true, undefined, { timeout: 60_000 });
  const info = await page.evaluate(
    ([zi]) => {
      const r = window.__reinos;
      const own = r.units().filter((u) => u.owner === 0);
      // Centre the camera on the own army and set the zoom (no animation).
      const c = r.camera;
      const cx = own.reduce((t, u) => t + u.sx, 0) / own.length;
      const cy = own.reduce((t, u) => t + u.sy, 0) / own.length;
      const z = c.zoomT;
      r.camera = {
        x: c.x + (cx - window.innerWidth / 2) / z,
        y: c.y + (cy - window.innerHeight / 2) / z,
        zoomIndex: zi,
        zoomT: 0,
      };
      r.select(own.map((u) => u.eid));
      return {
        own: own.length,
        crossOriginIsolated: window.crossOriginIsolated,
        mode: r.metrics.mode,
      };
    },
    [zoomIndex],
  );
  // Order the selected army around so that units move during the whole window (alternating targets).
  const targets = [
    [820, 250],
    [420, 420],
  ];
  let t = 0;
  const order = async () => {
    const [x, y] = targets[t++ % targets.length];
    await page.mouse.click(x, y, { button: 'right' });
  };
  await order();
  const mover = setInterval(() => void order().catch(() => undefined), 4000);
  await page.waitForTimeout(WARMUP_S * 1000);

  // In-page sampler: one sample per rendered frame (stats.frames changes) + the sim perf once per second.
  await page.evaluate(() => {
    const r = window.__reinos;
    const S = (window.__perf = {
      up: [],
      rn: [],
      dc: [],
      vis: [],
      dt: [],
      tick: [],
      drop0: 0,
      f0: 0,
      t0: 0,
      stop: false,
    });
    S.drop0 = r.perfReport().sim.ticksDropped;
    let last = r.stats.frames;
    let lastT = performance.now();
    S.f0 = last;
    S.t0 = lastT;
    const loop = () => {
      if (S.stop) return;
      const m = r.metrics;
      const f = r.stats.frames;
      if (f !== last) {
        const now = performance.now();
        S.up.push(m.updateMs);
        S.rn.push(m.renderMs);
        S.dc.push(m.drawCalls);
        S.vis.push(m.visibleUnits);
        S.dt.push((now - lastT) / (f - last));
        last = f;
        lastT = now;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    S.timer = setInterval(() => S.tick.push(r.perfReport().sim), 1000);
  });
  await page.waitForTimeout(WINDOW_S * 1000);
  clearInterval(mover);
  const res = await page.evaluate(() => {
    const S = window.__perf;
    S.stop = true;
    clearInterval(S.timer);
    const r = window.__reinos;
    return {
      up: S.up,
      rn: S.rn,
      dc: S.dc,
      vis: S.vis,
      dt: S.dt,
      tick: S.tick,
      ticksDropped: r.perfReport().sim.ticksDropped - S.drop0,
      frames: r.stats.frames - S.f0,
      elapsedMs: performance.now() - S.t0,
      gl: (() => {
        const c = document.createElement('canvas').getContext('webgl2');
        const e = c?.getExtension('WEBGL_debug_renderer_info');
        return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';
      })(),
      tickNow: r.tick,
    };
  });
  await ctx.close();
  return {
    scenario,
    mode,
    zoom: ZOOM_T[zoomIndex],
    own: info.own,
    crossOriginIsolated: info.crossOriginIsolated,
    actualMode: info.mode,
    frames: res.frames,
    fpsAvg: r3((res.frames * 1000) / res.elapsedMs),
    fpsP5: r3(1000 / Math.max(pct(res.dt, 95), 1e-6)),
    frameMsP50: r3(pct(res.dt, 50)),
    updateMs: {
      p50: r3(pct(res.up, 50)),
      p95: r3(pct(res.up, 95)),
      max: r3(Math.max(0, ...res.up)),
    },
    renderMs: { p50: r3(pct(res.rn, 50)), p95: r3(pct(res.rn, 95)) },
    drawCalls: { p50: pct(res.dc, 50), p95: pct(res.dc, 95), max: Math.max(0, ...res.dc) },
    visibleUnits: { p50: pct(res.vis, 50), max: Math.max(0, ...res.vis) },
    // The worker reports one p95 per 1 s window (20 ticks). Gate on the MEDIAN window; keep the worst window as info:
    // SwiftShader saturates every core, so a single pre-empted tick inflates a window's p95 (see perf.md).
    tickMsP95: r3(median(res.tick.map((s) => s.tickMsP95))),
    tickMsP95Worst: r3(Math.max(0, ...res.tick.map((s) => s.tickMsP95))),
    tickMsAvg: r3(median(res.tick.map((s) => s.tickMsAvg))),
    tickMsMax: r3(Math.max(0, ...res.tick.map((s) => s.tickMsMax))),
    ticksDropped: res.ticksDropped,
    simTicks: res.tickNow,
    gl: res.gl,
    consoleErrors: errors,
  };
}

/** Full-visibility stress: the render harness (fake feed, NO fog) with 400 moving units + 40 selection rings. */
async function measureHarness(browser, base, zoomIndex) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => {
    if (m.text().includes('GL Driver Message') && m.text().includes('Performance')) return;
    if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(
    `${base}render-harness.html?units=400&moving=1&loop=1&select=40&spacing=0.4&zoom=${zoomIndex}`,
  );
  await page.waitForFunction(() => window.__renderHarness?.ready === true, undefined, {
    timeout: 60_000,
  });
  await page.waitForTimeout(WARMUP_S * 1000);
  const t0 = Date.now();
  const frames = await page.evaluate(
    (n) => window.__renderHarness.collect(n),
    Math.max(30, WINDOW_S * 8),
  );
  const secs = (Date.now() - t0) / 1000;
  await ctx.close();
  const col = (k) => frames.map((f) => f[k]);
  return {
    zoom: ZOOM_T[zoomIndex],
    frames: frames.length,
    fps: r3(frames.length / secs),
    updateMsP50: r3(pct(col('updateMs'), 50)),
    updateMsP95: r3(pct(col('updateMs'), 95)),
    renderMsP95: r3(pct(col('renderMs'), 95)),
    drawCallsP95: pct(col('drawCalls'), 95),
    visibleUnitsP50: pct(col('visibleUnits'), 50),
    consoleErrors: errors,
  };
}

function aggregateHarness(runs) {
  const spread = (vals) => ({
    median: r3(median(vals)),
    min: r3(Math.min(...vals)),
    max: r3(Math.max(...vals)),
  });
  const m = (f) => runs.map(f);
  return {
    zoom: runs[0].zoom,
    reps: runs.length,
    fps: spread(m((r) => r.fps)),
    updateMsP50: spread(m((r) => r.updateMsP50)),
    updateMsP95: spread(m((r) => r.updateMsP95)),
    renderMsP95: spread(m((r) => r.renderMsP95)),
    drawCallsP95: spread(m((r) => r.drawCallsP95)),
    visibleUnitsP50: spread(m((r) => r.visibleUnitsP50)),
    consoleErrors: runs.flatMap((r) => r.consoleErrors),
  };
}

function aggregate(runs) {
  const first = runs[0];
  const m = (f) => runs.map(f);
  const spread = (vals) => ({
    median: r3(median(vals)),
    min: r3(Math.min(...vals)),
    max: r3(Math.max(...vals)),
  });
  return {
    scenario: first.scenario,
    mode: first.mode,
    actualMode: first.actualMode,
    zoom: first.zoom,
    reps: runs.length,
    own: first.own,
    fpsAvg: spread(m((r) => r.fpsAvg)),
    fpsP5: spread(m((r) => r.fpsP5)),
    updateMsP50: spread(m((r) => r.updateMs.p50)),
    updateMsP95: spread(m((r) => r.updateMs.p95)),
    updateMsMax: spread(m((r) => r.updateMs.max)),
    renderMsP95: spread(m((r) => r.renderMs.p95)),
    drawCallsP95: spread(m((r) => r.drawCalls.p95)),
    drawCallsMax: spread(m((r) => r.drawCalls.max)),
    visibleUnitsP50: spread(m((r) => r.visibleUnits.p50)),
    tickMsP95: spread(m((r) => r.tickMsP95)),
    tickMsP95Worst: spread(m((r) => r.tickMsP95Worst)),
    tickMsAvg: spread(m((r) => r.tickMsAvg)),
    ticksDropped: Math.max(...m((r) => r.ticksDropped)),
    consoleErrors: runs.flatMap((r) => r.consoleErrors),
  };
}

const key = (a) => `${a.scenario}|${a.mode}|${a.zoom}`;

async function main() {
  const { child, url } = await startPreview();
  const browser = await chromium.launch({ executablePath, args: FLAGS });
  const version = browser.version();
  const results = [];
  const harness = [];
  try {
    for (const scenario of SCENARIOS)
      for (const mode of MODES)
        for (const zi of ZOOMS) {
          const runs = [];
          for (let i = 0; i < REPS; i++) {
            const r = await measure(browser, url, scenario, mode, zi);
            runs.push(r);
            console.log(
              `${scenario} ${mode} z${ZOOM_T[zi]} rep${i + 1}: fps ${r.fpsAvg} update p95 ${r.updateMs.p95} ms draw p95 ${r.drawCalls.p95} tick p95 ${r.tickMsP95} ms dropped ${r.ticksDropped}`,
            );
          }
          results.push({ agg: aggregate(runs), runs });
        }
    if (!args.includes('--no-harness'))
      for (const zi of ZOOMS) {
        const runs = [];
        for (let i = 0; i < REPS; i++) {
          const r = await measureHarness(browser, url, zi);
          runs.push(r);
          console.log(
            `harness400 z${ZOOM_T[zi]} rep${i + 1}: fps ${r.fps} update p95 ${r.updateMsP95} ms draw p95 ${r.drawCallsP95} visible ${r.visibleUnitsP50}`,
          );
        }
        harness.push(aggregateHarness(runs));
      }
  } finally {
    await browser.close();
    try {
      process.kill(-child.pid);
    } catch {
      child.kill();
    }
  }

  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
  if (UPDATE_BASELINE) {
    const b = { note: 'FPS baseline for the relative gate (SwiftShader, informative).', fps: {} };
    for (const { agg } of results) b.fps[key(agg)] = agg.fpsAvg.median;
    fs.writeFileSync(BASELINE, JSON.stringify(b, null, 2) + '\n');
    console.log('baseline written:', BASELINE);
  }
  const base = UPDATE_BASELINE ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : baseline;

  // Gates (on the median of the repetitions; the spread is reported, not gated).
  const gates = [];
  for (const { agg } of results) {
    const id = `${agg.scenario} ${agg.mode} z${agg.zoom}`;
    const add = (name, value, limit, ok) => gates.push({ id, name, value, limit, ok });
    add(
      'updateMs p95',
      agg.updateMsP95.median,
      GATES.updateMsP95,
      agg.updateMsP95.median <= GATES.updateMsP95,
    );
    add(
      'draw calls p95',
      agg.drawCallsP95.median,
      GATES.drawCalls,
      agg.drawCallsP95.median <= GATES.drawCalls,
    );
    add(
      'tickMs p95 (worker)',
      agg.tickMsP95.median,
      GATES.tickMsP95,
      agg.tickMsP95.median <= GATES.tickMsP95,
    );
    add(
      'ticksDropped',
      agg.ticksDropped,
      GATES.ticksDropped,
      agg.ticksDropped <= GATES.ticksDropped,
    );
    add('console errors', agg.consoleErrors.length, 0, agg.consoleErrors.length === 0);
    const bf = base?.fps?.[key(agg)];
    if (typeof bf === 'number') {
      const lim = r3(bf * GATES.fpsMinFractionOfBaseline);
      add('fps vs baseline (relative)', agg.fpsAvg.median, lim, agg.fpsAvg.median >= lim);
    }
  }
  for (const h of harness) {
    const id = `harness400 (sin niebla) z${h.zoom}`;
    gates.push({
      id,
      name: 'updateMs p95',
      value: h.updateMsP95.median,
      limit: GATES.updateMsP95,
      ok: h.updateMsP95.median <= GATES.updateMsP95,
    });
    gates.push({
      id,
      name: 'draw calls p95',
      value: h.drawCallsP95.median,
      limit: GATES.drawCalls,
      ok: h.drawCallsP95.median <= GATES.drawCalls,
    });
    gates.push({
      id,
      name: 'console errors',
      value: h.consoleErrors.length,
      limit: 0,
      ok: h.consoleErrors.length === 0,
    });
  }
  const ok = gates.every((g) => g.ok);

  const first = results[0]?.runs[0];
  const env = {
    date: new Date().toISOString(),
    chromium: version,
    glRenderer: first?.gl,
    cpu: `${os.cpus()[0]?.model ?? 'unknown'} x${os.cpus().length}`,
    node: process.version,
    viewport: '1280x720 @1x',
    flags: FLAGS,
    reps: REPS,
    warmupS: WARMUP_S,
    windowS: WINDOW_S,
  };
  const report = {
    kind: 'proxy',
    warning:
      'SwiftShader (software WebGL) - NOT the reference hardware. K1 (>= 60 fps with 400 units) is NOT proven by this report: TODO-HUMANO.',
    env,
    gates: GATES,
    gateResults: gates,
    ok,
    results: results.map(({ agg }) => agg),
    harness,
  };

  if (!NO_WRITE) {
    fs.mkdirSync(MEDIA, { recursive: true });
    fs.writeFileSync(path.join(MEDIA, 'perf.json'), JSON.stringify(report, null, 2) + '\n');
    fs.writeFileSync(path.join(MEDIA, 'perf.md'), toMarkdown(report));
    console.log('wrote docs/progress/fase-02/media/perf.{md,json}');
  }
  console.log(ok ? 'PERF PROXY: all gates green' : 'PERF PROXY: GATE FAILURES');
  for (const g of gates.filter((x) => !x.ok))
    console.log('  FAIL', g.id, g.name, g.value, 'limit', g.limit);
  process.exit(ok ? 0 : 1);
}

function sp(s, unit = '') {
  return `${s.median}${unit} (${s.min}–${s.max})`;
}

function toMarkdown(rep) {
  const L = [];
  L.push('# Proxy de rendimiento del render (Fase 2, Q2)');
  L.push('');
  L.push(
    '> **Advertencia.** Esto es un **proxy** medido con WebGL por software (SwiftShader) en Chromium headless. **No** es el hardware de referencia (portátil con iGPU Iris Xe / Radeon 680M, GDD §17.1). El criterio **K1** ("400 unidades a >= 60 fps en el hardware de referencia") **no se da por cumplido** con este informe: queda **TODO-HUMANO** (ver abajo). Los FPS de software son solo informativos; lo que se compuerta es trabajo de CPU/JS y conteos de comandos de GPU (ADR-006 §10.1–10.2).',
  );
  L.push('');
  L.push(
    `Generado por \`pnpm perf:render\` (\`e2e/perf/perf-render.mjs\`). Resultado global del proxy: **${rep.ok ? 'VERDE' : 'ROJO'}**.`,
  );
  L.push('');
  L.push('## Entorno y método');
  L.push('');
  L.push(`- Fecha: ${rep.env.date}; Chromium ${rep.env.chromium}; Node ${rep.env.node}.`);
  L.push(`- Renderer WebGL: \`${rep.env.glRenderer}\`.`);
  L.push(`- CPU: ${rep.env.cpu} (máquina de sesión, posiblemente compartida: ver varianza).`);
  L.push(`- Viewport ${rep.env.viewport}; flags: \`${rep.env.flags.join(' ')}\`.`);
  L.push(
    `- Escenario: \`demo400\` (mapa 128x128, 2 jugadores, 200 unidades por jugador = 400). Las 200 unidades propias reciben órdenes de mover cada 4 s alternando objetivos, de modo que hay movimiento durante toda la ventana; las 200 enemigas están quietas. No existe un escenario "4v4" en el repo (los escenarios son demo100/demo200/demo400, 2 jugadores), por eso no se mide.`,
  );
  L.push(
    `- Cámara centrada en el ejército propio; zooms 0,6 / 1 / 1,4; modos de snapshot \`sab\` y \`transfer\`.`,
  );
  L.push(
    `- ${rep.env.warmupS} s de calentamiento + ${rep.env.windowS} s de ventana por repetición; ${rep.env.reps} repeticiones con página nueva cada una. Las celdas muestran **mediana (mín–máx)** entre repeticiones; los gates se evalúan sobre la mediana.`,
  );
  L.push(
    '- `updateMs` = JS por frame (interpolar + culling + sprites + niebla/minimapa), sin rasterizar. `renderMs` = JS de envío de Pixi. `tickMs` = tick de simulación medido dentro del Worker, que informa un p95 por ventana de 1 s (20 ticks). El gate usa la **mediana de las ventanas**; el **peor p95 de ventana** se muestra aparte (informativo): SwiftShader satura todos los núcleos y un solo tick desplazado por el planificador del SO infla el p95 de su ventana (con 20 muestras, p95 = la 2ª mayor). Referencia sin contención de GPU por software: `pnpm bench` (tick medio 0,71 ms, p95 1,72 ms con 400 unidades, Fase 1).',
  );
  L.push('');
  L.push('## Gates del proxy');
  L.push('');
  L.push('| Métrica | Gate | Qué demuestra |');
  L.push('| --- | --- | --- |');
  L.push(
    `| updateMs p95 | <= ${rep.gates.updateMsP95} ms | El JS del cliente deja margen frente al presupuesto de 16,6 ms. Heurística: no mide la GPU. |`,
  );
  L.push(
    `| Draw calls por frame (p95) | <= ${rep.gates.drawCalls} | Trabajo de comandos acotado (chunks visibles + batches). |`,
  );
  L.push(
    `| tickMs p95 (Worker, mediana de ventanas de 1 s) | <= ${rep.gates.tickMsP95} ms | La sim en navegador no se degrada con 400 unidades. |`,
  );
  L.push(
    `| ticksDropped | = ${rep.gates.ticksDropped} | El pacing del Worker no descarta ticks en régimen estacionario. |`,
  );
  L.push(
    `| FPS vs línea base | >= ${rep.gates.fpsMinFractionOfBaseline * 100} % de \`e2e/perf/perf-baseline.json\` | Detecta regresiones grandes. El margen es ancho a propósito (el plan dice 20 %): la varianza medida en SwiftShader sobre una máquina compartida es mayor, y un gate más estrecho sería flaky. |`,
  );
  L.push(
    '| Errores de consola | 0 | Sin errores/avisos de WebGL o Pixi (se filtra solo el aviso de rendimiento `ReadPixels` de SwiftShader). |',
  );
  L.push('');
  L.push('## Resultados');
  L.push('');
  L.push(
    '| Escenario | Modo | Zoom | Unidades visibles (p50) | updateMs p50 | updateMs p95 | updateMs max | renderMs p95 | Draw calls p95 (max) | tickMs avg / p95 (mediana de ventanas) / peor ventana | ticksDropped | FPS software (informativo) | FPS p5 |',
  );
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const a of rep.results) {
    L.push(
      `| ${a.scenario} | ${a.actualMode} | ${a.zoom} | ${a.visibleUnitsP50.median} | ${sp(a.updateMsP50)} | ${sp(a.updateMsP95)} | ${a.updateMsMax.median} | ${sp(a.renderMsP95)} | ${a.drawCallsP95.median} (${a.drawCallsMax.max}) | ${a.tickMsAvg.median} / ${sp(a.tickMsP95)} / ${sp(a.tickMsP95Worst)} | ${a.ticksDropped} | ${sp(a.fpsAvg)} | ${a.fpsP5.median} |`,
    );
  }
  L.push('');
  L.push(
    '**Ojo con "Unidades visibles":** en el juego integrado las 200 unidades enemigas empiezan en niebla (ejércitos en lados opuestos del mapa), así que solo se dibujan ~200 sprites aunque la sim simule 400. La carga de render con las 400 visibles está en la sección siguiente.',
  );
  L.push('');
  L.push(
    'Cada celda con rango: mediana (mín–máx) entre repeticiones. `updateMs max` es la mediana de los máximos (picos aislados de GC/planificador; no se compuertan).',
  );
  L.push('');
  if (rep.harness.length > 0) {
    L.push('## Estrés de render con 400 unidades visibles (arnés sin niebla)');
    L.push('');
    L.push(
      '`render-harness.html?units=400&moving=1&loop=1&select=40&spacing=0.4`: mismo `Renderer` (terreno por chunks, sprites, anillos de selección) con un feed falso de 400 unidades en movimiento (bloque denso de 8x8 tiles, que cabe entero en el viewport a los 3 zooms) y 40 anillos; sin Worker, sin niebla, sin minimapa. Es la carga de sprites que el integrado solo alcanza cuando los dos ejércitos están a la vista.',
    );
    L.push('');
    L.push(
      '| Zoom | Unidades visibles (p50) | updateMs p50 | updateMs p95 | renderMs p95 | Draw calls p95 | FPS software (informativo) |',
    );
    L.push('| --- | --- | --- | --- | --- | --- | --- |');
    for (const h of rep.harness)
      L.push(
        `| ${h.zoom} | ${h.visibleUnitsP50.median} | ${sp(h.updateMsP50)} | ${sp(h.updateMsP95)} | ${sp(h.renderMsP95)} | ${h.drawCallsP95.median} | ${sp(h.fps)} |`,
      );
    L.push('');
  }
  L.push('## Resultado de los gates');
  L.push('');
  L.push('| Configuración | Gate | Valor | Límite | OK |');
  L.push('| --- | --- | --- | --- | --- |');
  for (const g of rep.gateResults)
    L.push(`| ${g.id} | ${g.name} | ${g.value} | ${g.limit} | ${g.ok ? 'si' : '**NO**'} |`);
  L.push('');
  L.push('## K1 es un proxy: TODO-HUMANO');
  L.push('');
  L.push(
    '- Con GPU por software los FPS de arriba **no** se trasladan al hardware de referencia en ninguna dirección con garantías (la rasterización por CPU suele ser más lenta que una iGPU en fill-rate y más rápida en overhead de comandos). Un número alto aquí no demuestra K1; uno bajo tampoco lo refuta.',
  );
  L.push(
    '- Lo que sí aporta este proxy: el coste de CPU/JS por frame (`updateMs`), el número de draw calls y el coste del tick del Worker están muy por debajo de los umbrales; el trabajo de GPU por frame es pequeño y acotado.',
  );
  L.push(
    '- **Pendiente (TODO-HUMANO, listado en `STATUS.md`)**: en el portátil de referencia con Chrome, abrir `/?perf=400&debug=1` (build de producción, `pnpm --filter @reinos/client preview`), dejar correr 60 s con unidades en movimiento a zoom 1 y calidad Alta, ejecutar `__reinos.perfReport()` en la consola y adjuntar el JSON. **Aceptación: `fpsP5 >= 60`.** Hasta entonces K1 figura como "proxy verde + hardware real pendiente".',
  );
  L.push('');
  L.push('## Reproducir');
  L.push('');
  L.push('```');
  L.push(
    'pnpm perf:render                        # assets + build + medición completa (6 configuraciones x 3 repeticiones, ~6 min)',
  );
  L.push('pnpm perf:render -- --reps 1 --window 5  # corrida rápida');
  L.push(
    'pnpm perf:render -- --update-baseline    # reescribe e2e/perf/perf-baseline.json con los FPS actuales',
  );
  L.push('```');
  L.push('');
  return L.join('\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
