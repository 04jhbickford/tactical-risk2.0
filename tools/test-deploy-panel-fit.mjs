/**
 * D1: short desktop windows keep Deploy and Confirm inside the viewport.
 * The unit list height is min(its 400px budget, leftover space), so the
 * list scrolls and the buttons do not. The 390 phone tray is unchanged:
 * in-panel Deploy stays hidden and placement still icon-commits.
 *
 * Headless Chrome + CDP. A DOM WheelEvent does not scroll; this uses
 * Input.dispatchMouseEvent mouseWheel and Input.dispatchTouchEvent.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const HTTP_PORT = 8766;
const CDP_PORT = 9333;
const CASES = [
  { name: '1024x700', width: 1024, height: 700, mobile: false },
  { name: '1366x650', width: 1366, height: 650, mobile: false },
  { name: '1280x800', width: 1280, height: 800, mobile: false },
  { name: '820 touch', width: 820, height: 1180, mobile: true },
  { name: '390 touch', width: 390, height: 844, mobile: true },
];

const FIT_HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>deploy fit</title>
<link rel="stylesheet" href="/style.css">
<style>html, body { margin: 0; height: 100%; background: #111; }</style>
</head>
<body>
<div id="sidebar"></div>
<script type="module">
import { GameState } from '/src/state/gameState.js';
import { PlayerPanel } from '/src/ui/playerPanel.js';
import { applyMobileShellClass } from '/src/ui/mobileShell.js';

const units = await (await fetch('/data/units.json')).json();
for (let i = 0; i < 24; i++) {
  units['landExtra' + i] = { cost: 3, attack: 1, defense: 1, movement: 1, isLand: true };
  units['seaExtra' + i] = { cost: 6, attack: 1, defense: 1, movement: 1, isSea: true };
}
const land = { name: 'Eastern Europe', isWater: false, connections: ['Baltic Sea Zone'] };
const sea = { name: 'Baltic Sea Zone', isWater: true, connections: ['Eastern Europe'] };
const gs = new GameState({ risk: { factions: [] } }, [land, sea], []);
gs.players = [{ id: 'germans', name: 'Germans', isAI: false, color: '#555555' }];
gs.currentPlayerIndex = 0;
gs.phase = 'unit_placement';
gs.placementRound = 1;
gs.unitsPlacedThisRound = 0;
gs.playerState = { germans: { ipcs: 0 } };
gs.territoryState = { 'Eastern Europe': { owner: 'germans' } };
gs.units = { 'Eastern Europe': [], 'Baltic Sea Zone': [] };
gs.unitsToPlace = {
  germans: Object.entries(units)
    .filter(([, def]) => def.isLand || def.isAir || def.isSea)
    .map(([type]) => ({ type, quantity: 3 })),
};

const panel = new PlayerPanel();
panel.setUnitDefs(units);
panel.setTerritories([land, sea]);
panel.setGameState(gs);
panel.show();

function fullyInside(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (r.top < -1 || r.left < -1 || r.bottom > innerHeight + 1 || r.right > innerWidth + 1) return false;
  let p = el.parentElement;
  while (p && p !== document.body) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'hidden' || oy === 'auto' || oy === 'scroll' || oy === 'clip') {
      const pr = p.getBoundingClientRect();
      if (r.top < pr.top - 1 || r.bottom > pr.bottom + 1) return false;
    }
    p = p.parentElement;
  }
  return true;
}

function scrollable(el) {
  let n = el;
  while (n && n !== document.documentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 2) return n;
    n = n.parentElement;
  }
  return null;
}

function describe(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return {
    text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80),
    display: style.display,
    top: Math.round(r.top),
    bottom: Math.round(r.bottom),
    height: Math.round(r.height),
    fully: fullyInside(el),
  };
}

window.__show = (kind) => {
  applyMobileShellClass(innerWidth, document.documentElement, innerHeight);
  const mobile = document.documentElement.classList.contains('mobile-shell');
  panel.trayExpanded = !!mobile;
  panel.phoneDetentTab = 'actions';
  panel.placementQueue = kind === 'sea' ? { destroyer: 1 } : { infantry: 1 };
  panel.setSelectedTerritory(kind === 'sea' ? sea : land, { immediate: true });
  const list = document.querySelector('.pp-unit-list');
  const scroller = list ? scrollable(list) : null;
  if (scroller) scroller.scrollTop = 0;
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.scrollTop = 0;
  window.scrollTo(0, 0);
  const buttons = [...document.querySelectorAll('[data-action="confirm-placement"]')].map(describe);
  const actions = document.querySelector('.pp-placement-actions');
  const bottom = document.querySelector('.pp-bottom-actions');
  const tray = document.querySelector('.phone-tray-body');
  return {
    mobile,
    innerWidth,
    innerHeight,
    buttons,
    actionsDisplay: actions ? getComputedStyle(actions).display : null,
    bottom: describe(bottom),
    sheetHeight: sidebar ? Math.round(sidebar.getBoundingClientRect().height) : 0,
    list: list ? {
      className: scroller === list ? 'pp-unit-list' : (scroller?.className || ''),
      scrollHeight: scroller ? scroller.scrollHeight : list.scrollHeight,
      clientHeight: scroller ? scroller.clientHeight : list.clientHeight,
      scrollTop: scroller ? scroller.scrollTop : 0,
      isList: scroller === list,
      isTray: !!(scroller && scroller.classList.contains('phone-tray-body')),
    } : null,
    sidebarScroll: sidebar ? sidebar.scrollTop : null,
    sidebarOverflow: sidebar ? sidebar.scrollHeight - sidebar.clientHeight : null,
    pageScroll: window.scrollY || document.documentElement.scrollTop || 0,
    trayOverflow: tray ? getComputedStyle(tray).overflowY : null,
    placeTray: sidebar ? sidebar.classList.contains('player-panel--place-tray') : false,
  };
};

window.__scrollTop = () => {
  const list = document.querySelector('.pp-unit-list');
  const scroller = list ? scrollable(list) : null;
  const sidebar = document.getElementById('sidebar');
  return {
    list: scroller ? scroller.scrollTop : null,
    sidebar: sidebar ? sidebar.scrollTop : null,
    page: window.scrollY || document.documentElement.scrollTop || 0,
  };
};

window.__resetScroll = () => {
  const list = document.querySelector('.pp-unit-list');
  const scroller = list ? scrollable(list) : null;
  if (scroller) scroller.scrollTop = 0;
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.scrollTop = 0;
  window.scrollTo(0, 0);
};

window.__point = () => {
  const list = document.querySelector('.pp-unit-list');
  const scroller = list ? scrollable(list) : list;
  const r = (scroller || list).getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + Math.min(r.height / 2, 80)) };
};

window.__ready = true;
</script>
</body>
</html>`;

function contentType(filePath) {
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'text/javascript';
  if (filePath.endsWith('.css')) return 'text/css';
  if (filePath.endsWith('.json')) return 'application/json';
  if (filePath.endsWith('.html')) return 'text/html';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  return 'application/octet-stream';
}

function startServer() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${HTTP_PORT}`);
    if (url.pathname === '/__fit.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(FIT_HTML);
      return;
    }
    const rel = decodeURIComponent(url.pathname);
    const filePath = path.join(ROOT, rel);
    if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': contentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(HTTP_PORT, '127.0.0.1', () => resolve(server));
  });
}

function chromePath() {
  for (const candidate of ['/usr/local/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/google-chrome']) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error('google-chrome not found');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForJson(url) {
  let last = '';
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
      last = `status ${res.status}`;
    } catch (err) {
      last = err.message;
    }
    await sleep(200);
  }
  throw new Error(`CDP not ready: ${last}`);
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const msgId = ++id;
          return new Promise((res, rej) => {
            pending.set(msgId, { res, rej });
            ws.send(JSON.stringify({ id: msgId, method, params }));
          });
        },
        close() { ws.close(); },
      });
    });
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (!msg.id || !pending.has(msg.id)) return;
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(`${msg.error.message || JSON.stringify(msg.error)}`));
      else res(msg.result || {});
    });
    ws.addEventListener('error', () => reject(new Error('CDP socket error')));
  });
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || JSON.stringify(result.exceptionDetails));
  }
  return result.result?.value;
}

function assertCase(viewport, kind, probe) {
  const label = `${viewport.name} ${kind}`;
  const problems = [];
  if (!probe?.list) problems.push('no unit list');
  else if (probe.list.scrollHeight <= probe.list.clientHeight + 2) {
    problems.push(`list does not overflow (${probe.list.scrollHeight}/${probe.list.clientHeight})`);
  }
  if (probe?.pageScroll) problems.push(`page scrolled ${probe.pageScroll}`);
  if (probe?.sidebarScroll) problems.push(`sidebar scrolled ${probe.sidebarScroll}`);

  const shown = (probe?.buttons || []).filter((b) => b.display !== 'none' && b.height > 1);
  for (const button of shown) {
    if (!button.fully) problems.push(`button outside viewport: ${button.text} bottom=${button.bottom} h=${probe.innerHeight}`);
  }

  if (probe?.mobile) {
    if (!probe.placeTray) problems.push('phone place tray class missing');
    if (probe.actionsDisplay !== 'none') problems.push(`phone in-panel actions display ${probe.actionsDisplay}`);
    if (probe.trayOverflow !== 'auto' && probe.trayOverflow !== 'scroll') {
      problems.push(`phone tray overflow ${probe.trayOverflow}`);
    }
    const cap = Math.round(probe.innerHeight * 0.32) + 8;
    if (probe.sheetHeight > cap) problems.push(`phone sheet ${probe.sheetHeight}px taller than 30dvh cap ${cap}`);
    if (!probe.bottom?.fully) problems.push('phone bottom bar is outside the viewport');
    if (probe.list && !probe.list.isList && !probe.list.isTray) {
      problems.push(`phone scroller is ${probe.list.className}`);
    }
  } else {
    const deploy = shown.find((b) => /^Deploy/.test(b.text));
    const confirm = shown.find((b) => /Confirm/.test(b.text));
    if (!deploy) problems.push('Deploy button not fully visible');
    if (!confirm) problems.push('Confirm button not fully visible');
    if (probe.list && !probe.list.isList) problems.push(`desktop scroller is ${probe.list.className}`);
  }
  return { label, problems, probe };
}

async function gesture(cdp, kind) {
  const point = await evaluate(cdp, 'window.__point()');
  if (kind === 'wheel') {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved', x: point.x, y: point.y, button: 'none', pointerType: 'mouse',
    });
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: point.x,
      y: point.y,
      deltaX: 0,
      deltaY: 400,
      pointerType: 'mouse',
    });
  } else {
    const startY = point.y;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: point.x, y: startY, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
    });
    for (let i = 1; i <= 8; i++) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: point.x, y: startY - i * 28, radiusX: 1, radiusY: 1, force: 1, id: 1 }],
      });
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await sleep(50);
  return evaluate(cdp, 'window.__scrollTop()');
}

async function main() {
  const server = await startServer();
  const userData = `/tmp/deploy-fit-chrome-${process.pid}`;
  const chrome = spawn(chromePath(), [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userData}`,
    `http://127.0.0.1:${HTTP_PORT}/__fit.html`,
  ], { stdio: 'ignore' });

  let cdp;
  const failures = [];
  try {
    const list = await waitForJson(`http://127.0.0.1:${CDP_PORT}/json/list`);
    const page = list.find((t) => t.type === 'page' && String(t.url).includes('__fit'));
    if (!page) throw new Error(`no fit page in ${JSON.stringify(list.map((t) => t.url))}`);
    cdp = await connect(page.webSocketDebuggerUrl);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    for (let i = 0; i < 50; i++) {
      const ready = await evaluate(cdp, '!!window.__ready');
      if (ready) break;
      if (i === 49) throw new Error('fit page did not boot');
      await sleep(200);
    }
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });

    for (const viewport of CASES) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.mobile,
      });
      await sleep(30);
      for (const kind of ['land', 'sea']) {
        const probe = await evaluate(cdp, `window.__show(${JSON.stringify(kind)})`);
        const checked = assertCase(viewport, kind, probe);
        if (checked.problems.length) {
          failures.push(`${checked.label}: ${checked.problems.join('; ')} :: ${JSON.stringify(probe)}`);
          continue;
        }
        for (const gestureName of ['wheel', 'touch']) {
          await evaluate(cdp, 'window.__resetScroll()');
          const after = await gesture(cdp, gestureName);
          const problems = [];
          if (!(after.list > 8)) problems.push(`${gestureName} did not scroll the list (${after.list})`);
          if (after.sidebar) problems.push(`${gestureName} scrolled the sidebar (${after.sidebar})`);
          if (after.page) problems.push(`${gestureName} scrolled the page (${after.page})`);
          if (problems.length) {
            failures.push(`${checked.label} ${gestureName}: ${problems.join('; ')}`);
          }
        }
        if (process.env.DEPLOY_FIT_SHOTS && kind === 'sea'
          && (viewport.name === '1366x650' || viewport.name === '390 touch' || viewport.name === '1024x700')) {
          const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
          const destDir = '/opt/cursor/artifacts/screenshots';
          fs.mkdirSync(destDir, { recursive: true });
          const dest = path.join(destDir, `d1-${viewport.name.replace(/\s+/g, '-')}-sea.png`);
          fs.writeFileSync(dest, Buffer.from(shot.data, 'base64'));
          process.stdout.write(`shot ${dest}\n`);
        }
        process.stdout.write(`ok ${checked.label}\n`);
      }
    }
  } finally {
    try { cdp?.close(); } catch { /* socket already closed */ }
    chrome.kill('SIGKILL');
    server.close();
  }

  if (failures.length) {
    for (const line of failures) process.stderr.write(`FAIL ${line}\n`);
    process.exit(1);
  }
  process.stdout.write('deploy panel fit: all viewports ok\n');
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
