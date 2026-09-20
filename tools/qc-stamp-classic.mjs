// Prove P0-1 stamp .4 and P0-2 queryless Classic after visiting New UX.
// Run: node tools/qc-stamp-classic.mjs

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
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const port = Number(process.env.PORT || 4181);
const server = await serve(port);
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const proof = { version: GAME_VERSION, steps: [] };

function push(step, extra = {}) {
  proof.steps.push({ step, ...extra });
  console.log(step, extra);
}

try {
  await page.goto(`http://127.0.0.1:${port}/?ux=three`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.three-lobby-ver, #three-l0', { timeout: 25000 });
  await page.waitForTimeout(500);
  const threeStamp = await page.evaluate(() => ({
    html: window.__TR_GAME_VERSION,
    attr: document.documentElement.getAttribute('data-game-version'),
    l0: document.querySelector('.three-l0-ver')?.textContent || '',
    lobby: document.querySelector('.three-lobby-ver')?.textContent || '',
    storage: sessionStorage.getItem('tacticalRisk_uxMode'),
    threeLobby: !!document.querySelector('#three-lobby'),
  }));
  push('visited ?ux=three', threeStamp);
  if (threeStamp.html !== GAME_VERSION
    || (threeStamp.l0 !== GAME_VERSION && threeStamp.lobby !== GAME_VERSION)) {
    throw new Error(`New UX stamp ${JSON.stringify(threeStamp)} != ${GAME_VERSION}`);
  }
  await page.screenshot({ path: join(OUT, 'stamp-new-ux-390.png'), fullPage: false });

  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.lobby-ux-picker, .lobby-version-badge', { timeout: 25000 });
  await page.waitForTimeout(500);
  const cold = await page.evaluate(() => ({
    html: window.__TR_GAME_VERSION,
    attr: document.documentElement.getAttribute('data-game-version'),
    badge: document.querySelector('.lobby-version-badge')?.textContent || '',
    storage: sessionStorage.getItem('tacticalRisk_uxMode'),
    classicPicker: !!document.querySelector('[data-action="ux-classic"]'),
    threeLobby: !!document.querySelector('#three-lobby.is-open, .three-lobby-home'),
    classicOn: document.querySelector('[data-action="ux-classic"]')?.classList.contains('is-on') || false,
  }));
  push('queryless after New UX', cold);
  if (cold.threeLobby) throw new Error('queryless opened New UX');
  if (!cold.classicPicker || cold.storage) throw new Error('queryless did not reset to Classic');
  if (cold.html !== GAME_VERSION || cold.badge !== GAME_VERSION) {
    throw new Error(`Classic stamp ${JSON.stringify(cold)} != ${GAME_VERSION}`);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.lobby-version-badge', { timeout: 20000 });
  await page.waitForTimeout(400);
  const reload = await page.evaluate(() => ({
    html: window.__TR_GAME_VERSION,
    badge: document.querySelector('.lobby-version-badge')?.textContent || '',
    storage: sessionStorage.getItem('tacticalRisk_uxMode'),
    threeLobby: !!document.querySelector('#three-lobby.is-open, .three-lobby-home'),
  }));
  push('hard reload queryless', reload);
  if (reload.threeLobby || reload.storage) throw new Error('reload stuck on New UX');
  if (reload.html !== GAME_VERSION || reload.badge !== GAME_VERSION) {
    throw new Error(`reload stamp ${JSON.stringify(reload)} != ${GAME_VERSION}`);
  }
  await page.screenshot({ path: join(OUT, 'stamp-classic-queryless-390.png'), fullPage: false });

  writeFileSync(join(OUT, 'stamp-classic-proof.json'), JSON.stringify(proof, null, 2));
  console.log('qc-stamp-classic: PASS', GAME_VERSION);
} finally {
  await browser.close();
  server.close();
}
