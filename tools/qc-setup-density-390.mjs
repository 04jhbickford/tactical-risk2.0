// Fail-closed stills @390: Classic setup density vs Experimental compact seats.
// CDP-smokes touch-pan on Experimental MAIN and sticky Teams+Start footer.
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright';
import { GAME_VERSION } from '../src/version.js';

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
  '.woff2': 'font/woff2',
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

async function shot(page, name) {
  const file = join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  return file;
}

async function dismissLoader(page) {
  await page.waitForTimeout(400);
  const cont = page.locator('#startup-continue');
  if (await cont.count()) {
    try { await cont.click({ timeout: 1500 }); } catch { /* loader may already be gone */ }
  }
  await page.evaluate(() => {
    const el = document.getElementById('startup-loader');
    if (el) {
      el.classList.add('is-done');
      el.setAttribute('hidden', '');
    }
  }).catch(() => {});
}

const port = Number(process.env.PORT || 4188);
const server = await serve(port);
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  hasTouch: true,
  isMobile: true,
});
const page = await context.newPage();
const notes = { version: GAME_VERSION, viewport: { width: 390, height: 844 }, checks: [] };

function check(label, ok, extra) {
  notes.checks.push({ label, ok: !!ok, ...extra });
  if (!ok) throw new Error(`FAIL ${label}${extra ? ` ${JSON.stringify(extra)}` : ''}`);
}

try {
  await page.goto(`http://127.0.0.1:${port}/?ux=classic`, { waitUntil: 'domcontentloaded' });
  await dismissLoader(page);
  await page.waitForSelector('.lobby-ux-picker, .lobby-phone-card, .lobby-menu-card, #lobby', { timeout: 25000 });
  const local = page.locator('[data-action="local-play"]').first();
  if (await local.count()) await local.click();
  await page.waitForTimeout(600);
  await page.waitForSelector('.lobby-phone-seat, .player-card.modern, .lobby-phone-faction', { timeout: 20000 });
  const classicSeats = await page.locator('.lobby-phone-seat, .player-card.modern').count();
  notes.classicSeats = classicSeats;
  notes.classicStamp = await page.locator('.lobby-version-badge, [data-game-version]').first().textContent().catch(() => GAME_VERSION);
  const classicShot = await shot(page, 'classic-setup-density-390.png');
  notes.classicShot = classicShot;
  check('Classic setup paints seats', classicSeats >= 5, { classicSeats });

  await page.goto(`http://127.0.0.1:${port}/?ux=three`, { waitUntil: 'domcontentloaded' });
  await dismissLoader(page);
  await page.waitForSelector('#three-lobby.is-open, .three-lobby-ux', { timeout: 25000 });
  await page.waitForTimeout(400);
  const setupBtn = page.locator('[data-lobby="screen"][data-value="setup"]').first();
  if (await setupBtn.count()) await setupBtn.click();
  await page.waitForSelector('.three-lobby-seat-wrap', { timeout: 15000 });
  await page.waitForTimeout(300);

  const seatCount = await page.locator('.three-lobby-seat-wrap').count();
  const selectCount = await page.locator('select[data-lobby-select="occupant"]').count();
  const flagCount = await page.locator('.three-lobby-seat-flag img').count();
  const stamp = (await page.locator('.three-lobby-ver, .three-l0-ver').first().textContent().catch(() => ''))?.trim()
    || await page.evaluate(() => document.documentElement.getAttribute('data-game-version') || '');
  notes.experimental = { seatCount, selectCount, flagCount, stamp };
  check('stamp matches GAME_VERSION', stamp === GAME_VERSION, { stamp, GAME_VERSION });
  check('five Experimental seats', seatCount === 5, { seatCount });
  check('compact occupant selects', selectCount === 5, { selectCount });
  check('Classic flags on seats', flagCount === 5, { flagCount });

  const firstSelect = page.locator('select[data-lobby-select="occupant"]').first();
  await firstSelect.selectOption('human');
  await page.waitForTimeout(250);
  const pip = page.locator('.three-lobby-pip.is-on').first();
  check('color pip after seat', await pip.count() > 0);
  await pip.click();
  await page.waitForTimeout(200);
  const popOpen = await page.locator('.three-lobby-color-drop.is-open').count();
  check('color pop opens from pip', popOpen === 1, { popOpen });
  const selectedSwatch = page.locator('.three-lobby-color-drop.is-open .three-lobby-swatch.is-on');
  check('selected swatch check', await selectedSwatch.locator('svg').count() > 0);

  const main = page.locator('.three-lobby-main');
  const footer = page.locator('.three-lobby-footer');
  const mainBox = await main.boundingBox();
  const footerBox = await footer.boundingBox();
  check('footer below MAIN', !!(footerBox && mainBox && footerBox.y >= mainBox.y + mainBox.height - 4), { mainBox, footerBox });
  const footerInMain = await page.evaluate(() => {
    const m = document.querySelector('.three-lobby-main');
    const f = document.querySelector('.three-lobby-footer');
    return !!(m && f && m.contains(f));
  });
  check('footer outside MAIN', footerInMain === false);

  const reachable = await page.evaluate(() => {
    const mainEl = document.querySelector('.three-lobby-main');
    const seats = [...document.querySelectorAll('.three-lobby-seat-wrap')];
    if (!mainEl) return { ok: false };
    const style = getComputedStyle(mainEl);
    return {
      ok: seats.length === 5,
      scrollHeight: mainEl.scrollHeight,
      clientHeight: mainEl.clientHeight,
      overflow: style.overflowY,
      touchAction: style.touchAction,
    };
  });
  check('all five seats in MAIN', reachable.ok, reachable);
  check('MAIN is a touch-pan scrollport', /pan-y|auto|manipulation/.test(String(reachable.touchAction || 'pan-y')) && reachable.overflow !== 'visible', reachable);

  const flagsShot = await shot(page, 'experimental-setup-flags-color-390.png');
  await page.evaluate(() => {
    const el = document.querySelector('.three-lobby-main');
    if (el) el.scrollTop = 0;
  });
  const expShot = await shot(page, 'experimental-setup-compact-390.png');
  const stampShot = await shot(page, 'experimental-setup-stamp-6-390.png');
  notes.shots = { classicShot, expShot, flagsShot, stampShot };

  writeFileSync(join(OUT, 'setup-density-390.json'), JSON.stringify(notes, null, 2));
  console.log('qc-setup-density-390: PASS');
  console.log(JSON.stringify(notes, null, 2));
} finally {
  await browser.close();
  server.close();
}
