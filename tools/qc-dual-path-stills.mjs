// Playwright stills @390: Classic vs New UX lobby labels + New UX create/join.
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
  '.woff2': 'font/woff2',
};

function serve(port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    let path = url.pathname === '/' ? '/index.html' : url.pathname;
    try {
      const body = await readFile(join(ROOT, path));
      res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
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

const port = Number(process.env.PORT || 4177);
const server = await serve(port);
const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();
const notes = [];

await page.goto(`http://127.0.0.1:${port}/?ux=classic`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.lobby-ux-picker', { timeout: 20000 });
const classicLabels = await page.locator('.lobby-ux-btn').allTextContents();
notes.push({ path: 'classic', labels: classicLabels });
const classicShot = await shot(page, 'lobby-classic-390.png');

await page.goto(`http://127.0.0.1:${port}/?ux=three`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.three-lobby-ux, #three-lobby', { timeout: 25000 });
await page.waitForTimeout(600);
const threeLabels = await page.locator('.lobby-ux-btn').allTextContents();
const threeHome = await page.locator('.three-lobby-card, .three-lobby-actions').allTextContents();
notes.push({ path: 'three-home', labels: threeLabels, cards: threeHome });
const threeShot = await shot(page, 'lobby-new-ux-390.png');

const online = page.locator('[data-lobby="screen"][data-value="online"]');
if (await online.count()) {
  await online.first().click();
  await page.waitForTimeout(400);
}
const onlineShot = await shot(page, 'new-ux-online-entry-390.png');
const create = page.locator('[data-lobby="screen"][data-value="create"]');
if (await create.count()) await create.first().click();
await page.waitForTimeout(300);
const createShot = await shot(page, 'new-ux-create-390.png');
await page.waitForTimeout(400);
const back = page.locator('[data-lobby="screen"][data-value="online"]').first();
if (await back.count()) await back.click();
await page.waitForTimeout(400);
await page.waitForSelector('[data-lobby="screen"][data-value="join"]', { timeout: 8000 });
await page.locator('[data-lobby="screen"][data-value="join"]').first().click();
await page.waitForTimeout(400);
await page.waitForSelector('input[name="code"]', { timeout: 8000 });
const joinShot = await shot(page, 'new-ux-join-390.png');

const l0 = await page.locator('.three-l0-ver, .three-lobby-ver').allTextContents();
writeFileSync(join(OUT, 'notes.json'), JSON.stringify({
  stamp: l0,
  notes,
  files: [classicShot, threeShot, onlineShot, createShot, joinShot],
}, null, 2));

await browser.close();
server.close();
console.log('qc-dual-path-stills: wrote', OUT);
