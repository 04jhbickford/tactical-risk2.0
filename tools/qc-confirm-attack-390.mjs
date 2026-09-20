// Playwright @390: New UX Confirm Attack CTA visible + tappable after ORIGIN→UNITS→DEST.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = process.env.STILLS_DIR || join(ROOT, 'briefs/2026-09-20-dual-path-three-ux/stills');
mkdirSync(OUT, { recursive: true });

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

function serve(port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, {
        'Content-Type': MIME[extname(path)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const port = Number(process.env.PORT || 4188);
const server = await serve(port);
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
await page.goto(`http://127.0.0.1:${port}/?ux=three`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__threeSolo && window.__threeSolo.confirm, { timeout: 40000 });

const result = await page.evaluate(() => {
  const s = window.__threeSolo;
  s.chrome?.setLobbyOpen?.(false);
  if (s.lobby) s.lobby.open = false;
  s.confirm(); // tech → purchase
  s.confirm(); // purchase → combat-move
  s.selectLand('Karelia S.S.R.');
  s.adjustUnit('infantry', 1);
  s.adjustUnit('infantry', 1);
  s.adjustUnit('armour', 1);
  s.selectLand('Finland Norway');
  const btn = document.getElementById('three-confirm');
  const r = btn?.getBoundingClientRect?.();
  const vh = window.innerHeight;
  const vw = window.innerWidth;
  return {
    version: s.version,
    stage: s.playInspect?.()?.stage || s.play?.stage,
    label: btn?.textContent || '',
    cta: btn?.dataset?.cta || '',
    disabled: !!(btn?.disabled),
    ready: btn?.classList?.contains('is-ready'),
    rect: r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height } : null,
    viewport: { vw, vh },
    fullyVisible: !!(r && r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw && r.height >= 44),
  };
});

await page.screenshot({
  path: join(OUT, 'confirm-attack-390.png'),
  fullPage: false,
});

if (!result.fullyVisible || result.label !== 'Confirm Attack' || result.disabled || !result.ready) {
  writeFileSync(join(OUT, 'confirm-attack-390.json'), JSON.stringify(result, null, 2));
  console.error('qc-confirm-attack-390 FAIL', result);
  process.exitCode = 1;
} else {
  writeFileSync(join(OUT, 'confirm-attack-390.json'), JSON.stringify(result, null, 2));
  console.log('qc-confirm-attack-390 PASS', result);
}

await browser.close();
await new Promise((resolve) => server.close(resolve));
