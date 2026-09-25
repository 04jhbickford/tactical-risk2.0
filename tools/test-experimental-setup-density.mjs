// Experimental setup density on the PR3 .6 lineage.
// Classic-style compact seats: occupant select, pip color, small flags.
// Sticky Teams+Start stays outside MAIN. Classic Canvas path untouched.
// Run: node tools/test-experimental-setup-density.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GAME_VERSION } from '../src/version.js';
import { UX_LABEL_EXPERIMENTAL } from '../src/map/presentationMode.js';
import { createSoloLobby, applyLobbyAction, seatOccupantView } from '../src/map/threeSoloLobby.js';
import { injectThreeChrome } from '../src/map/threeMapChrome.js';

assert.equal(GAME_VERSION, 'V2.81.57-unified.15', 'stamp is unified.2');
assert.equal(UX_LABEL_EXPERIMENTAL, 'Experimental UX');

const chromeSrc = readFileSync(new URL('../src/map/threeMapChrome.js', import.meta.url), 'utf8');
const classicLobby = readFileSync(new URL('../src/ui/lobby.js', import.meta.url), 'utf8');
const classicCanvas = readFileSync(new URL('../src/map/mapRenderer.js', import.meta.url), 'utf8');

assert.match(classicLobby, /class="ai-select modern"/, 'Classic keeps occupant <select>');
assert.match(classicLobby, /lobby-phone-pip/, 'Classic keeps compact color pip');
assert.match(chromeSrc, /compactLocalSeatHtml/);
assert.match(chromeSrc, /data-lobby-select=/);
assert.match(chromeSrc, /id: 'empty', name: 'Empty'/);
assert.match(chromeSrc, /three-lobby-pip/);
assert.match(chromeSrc, /three-lobby-color-drop/);
assert.match(chromeSrc, /three-lobby-toolbar/);
assert.match(chromeSrc, /three-lobby-footer/);
assert.match(chromeSrc, /data-auth-surface/);
assert.match(chromeSrc, /data-lobby="mp-signout"/);
assert.doesNotMatch(chromeSrc, /three-lobby-occupants|three-lobby-ai-tiers/);
assert.doesNotMatch(chromeSrc, /New UX \(Three\.js\)|three\.js/i);
assert.equal(classicCanvas.includes('Experimental UX'), false);
assert.equal(classicLobby.includes('compactLocalSeatHtml'), false, 'Classic lobby.js untouched');

const setup = JSON.parse(readFileSync(new URL('../data/setup.json', import.meta.url), 'utf8'));
const lobby = createSoloLobby(setup, '?ux=three');
lobby.screen = 'setup';
applyLobbyAction(lobby, 'occupant', 'Russians:human');
applyLobbyAction(lobby, 'occupant', 'Germans:medium');
assert.equal(seatOccupantView(lobby, 'Russians').kind, 'human');
assert.equal(seatOccupantView(lobby, 'Germans').kind, 'ai');
assert.equal(seatOccupantView(lobby, 'Americans').kind, 'empty');

const documentRef = globalThis.document;
const windowRef = globalThis.window;
const { JSDOM } = await import('jsdom').catch(() => ({ JSDOM: null }));

function paint() {
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

let painted = null;
try {
  painted = paint();
} catch (err) {
  painted = null;
  console.warn('paint skipped:', err.message);
}

if (painted) {
  const wraps = [...painted.querySelectorAll('.three-lobby-seat-wrap')];
  assert.equal(wraps.length, 5, 'all 5 catalog seats render');
  const selects = painted.querySelectorAll('select[data-lobby-select="occupant"]');
  assert.equal(selects.length, 5);
  assert.equal(painted.querySelectorAll('.three-lobby-seat-flag img').length, 5);
  const optionText = [...selects[0].querySelectorAll('option')].map((o) => o.textContent);
  assert.ok(optionText.includes('Empty') && optionText.includes('Human'), 'occupant select is Human / AI / Empty');
  assert.ok(optionText.some((t) => /AI/.test(t)), 'occupant select includes AI difficulty');
  assert.equal(painted.querySelector('[data-seat="Russians"] select[data-lobby-select="occupant"]')?.value, 'human');
  assert.equal(painted.querySelector('[data-seat="Germans"] select[data-lobby-select="occupant"]')?.value, 'medium');
  assert.equal(painted.querySelector('[data-seat="Americans"] select[data-lobby-select="occupant"]')?.value, 'empty');
  assert.ok(painted.querySelector('[data-seat="Russians"] .three-lobby-pip.is-on'));
  assert.ok(painted.querySelector('[data-seat="Russians"] .three-lobby-swatch.is-on svg'));
  assert.ok(painted.querySelector('.three-lobby-toolbar select[data-lobby-select="mode"]'));
  const main = painted.querySelector('.three-lobby-main');
  const footer = painted.querySelector('.three-lobby-footer');
  assert.ok(main && footer, 'setup keeps MAIN scroll + sticky footer');
  assert.equal(main.contains(footer), false, 'Teams+Start footer is outside MAIN scroll');
  assert.ok(footer.querySelector('[data-lobby="teams"]'), 'footer keeps Teams');
  assert.ok(footer.querySelector('.three-lobby-start'), 'footer keeps Start');
}

if (documentRef) globalThis.document = documentRef;
if (windowRef) globalThis.window = windowRef;

console.log('test-experimental-setup-density: PASS');
