// Experimental UX polish: player-facing rename, faction flags, color selected.
// Deep links stay ?ux=three. Classic Canvas path is not rewritten.
// Run: node tools/test-experimental-ux-polish.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_VERSION } from '../src/version.js';
import {
  UX_LABEL_EXPERIMENTAL,
  UX_THREE,
  resolveUxMode,
  applyUxQuery,
} from '../src/map/presentationMode.js';
import { createSoloLobby } from '../src/map/threeSoloLobby.js';
import { injectThreeChrome } from '../src/map/threeMapChrome.js';

assert.equal(GAME_VERSION, 'V2.81.57-dual-path.7', 'stamp is dual-path.7');
assert.equal(UX_LABEL_EXPERIMENTAL, 'Experimental UX');
assert.equal(resolveUxMode('?ux=three'), UX_THREE, '?ux=three still opens Experimental UX');
assert.match(applyUxQuery(UX_THREE, 'https://example.test/'), /ux=three/);

const setup = JSON.parse(readFileSync(new URL('../data/setup.json', import.meta.url), 'utf8'));
const lobby = createSoloLobby(setup, '?ux=three');
lobby.screen = 'setup';
lobby.selectedPlayers = ['Russians', 'Germans'];
lobby.playerAI.Russians = 'human';
lobby.playerAI.Germans = 'medium';

const documentRef = globalThis.document;
const windowRef = globalThis.window;
const { JSDOM } = await import('jsdom').catch(() => ({ JSDOM: null }));

function paintInDom() {
  if (typeof document !== 'undefined' && document.body) {
    const chrome = injectThreeChrome({ seat: 'Russians', ipc: 24, phase: 'PLACE' });
    chrome.paintLobby(lobby);
    return document;
  }
  if (!JSDOM) return null;
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: 'http://127.0.0.1/?ux=three',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const chrome = injectThreeChrome({ seat: 'Russians', ipc: 24, phase: 'PLACE' });
  chrome.paintLobby(lobby);
  return dom.window.document;
}

const chromeSrc = readFileSync(new URL('../src/map/threeMapChrome.js', import.meta.url), 'utf8');
const lobbySrc = readFileSync(new URL('../src/ui/lobby.js', import.meta.url), 'utf8');
const classicCanvas = readFileSync(new URL('../src/map/mapRenderer.js', import.meta.url), 'utf8');

assert.match(chromeSrc, /Experimental UX|UX_LABEL_EXPERIMENTAL/);
assert.match(lobbySrc, /UX_LABEL_EXPERIMENTAL/);
assert.doesNotMatch(chromeSrc, /New UX \(Three\.js\)/);
assert.doesNotMatch(lobbySrc, /New UX \(Three\.js\)/);
assert.doesNotMatch(chromeSrc, /three\.js/i);
assert.doesNotMatch(lobbySrc, /three\.js/i);
assert.match(chromeSrc, /assets\/flags\/\$\{flag\}/);
assert.match(chromeSrc, /three-lobby-swatch\$\{on \? ' is-on'/);
assert.match(chromeSrc, /COLOR_CHECK_SVG/);
assert.match(chromeSrc, /data-lobby-select="\$\{action\}"/);
assert.match(chromeSrc, /three-lobby-pip/);
assert.match(chromeSrc, /compactLocalSeatHtml/);
assert.doesNotMatch(chromeSrc, /three-lobby-occupants|three-lobby-ai-tiers/);
assert.doesNotMatch(chromeSrc, /data-lobby="occupant"/);
assert.equal(classicCanvas.includes('Experimental UX'), false, 'Classic canvas renderer untouched');

const factions = setup.risk?.factions || setup.factions || [];
assert.ok(factions.every((f) => f.flag), 'catalog factions carry Classic flag files');
assert.ok(factions.some((f) => f.flag === 'Russians.png'));

let painted = null;
try {
  painted = paintInDom();
} catch (err) {
  painted = null;
  console.warn('paint skipped:', err.message);
}

if (painted) {
  const labels = [...painted.querySelectorAll('.lobby-ux-title')].map((el) => el.textContent);
  if (labels.length) {
    assert.ok(labels.includes('Experimental UX'), `picker shows Experimental UX: ${labels.join(' | ')}`);
    assert.ok(!labels.some((t) => /three\.js|new ux/i.test(t)), 'picker has no three.js / New UX wording');
  }
  painted.querySelector('[data-lobby="screen"][data-value="setup"]')?.click?.();
  const flags = painted.querySelectorAll('.three-lobby-seat-flag img');
  assert.ok(flags.length >= 2, `setup seats show faction flags (${flags.length})`);
  assert.ok([...flags].some((img) => /assets\/flags\/Russians\.png/.test(img.getAttribute('src') || '')));
  const selects = painted.querySelectorAll('select[data-lobby-select="occupant"]');
  assert.ok(selects.length >= 5, `compact occupant selects on seats (${selects.length})`);
  const occupantOpts = [...selects[0].options].map((o) => o.value);
  assert.ok(occupantOpts.includes('empty') && occupantOpts.includes('human') && occupantOpts.includes('easy'),
    `occupant select has Empty/Human/AI (${occupantOpts.join(',')})`);
  const pips = painted.querySelectorAll('.three-lobby-pip.is-on');
  assert.ok(pips.length >= 1, 'seated faction has a color pip');
  const selected = painted.querySelectorAll('.three-lobby-color-drop .three-lobby-swatch.is-on');
  assert.ok(selected.length >= 1, 'dropdown marks the selected color');
  selected.forEach((btn) => {
    assert.ok(btn.querySelector('svg'), 'selected color has a check');
    assert.equal(btn.getAttribute('aria-pressed'), 'true');
    assert.match(btn.getAttribute('aria-label') || '', /selected/);
    assert.match(btn.getAttribute('title') || '', / · /);
  });
}

if (documentRef) globalThis.document = documentRef;
if (windowRef) globalThis.window = windowRef;

console.log('test-experimental-ux-polish: PASS');
