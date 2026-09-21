import assert from 'node:assert/strict';
import {
  UX_CLASSIC,
  UX_THREE,
  UX_STORAGE_KEY,
  UX_LABEL_EXPERIMENTAL,
  resolveUxMode,
  applyUxQuery,
  persistUxMode,
  clearUxMode,
  isPocketPreviewRequested,
} from '../src/map/presentationMode.js';
import { readFileSync } from 'node:fs';
import { GAME_VERSION } from '../src/version.js';

function memoryStore() {
  return {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; },
  };
}

globalThis.sessionStorage = memoryStore();
globalThis.localStorage = memoryStore();

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.match(html, /window\.__TR_GAME_VERSION = 'V2\.81\.57-dual-path\.11'/);
assert.match(html, /name="tr-game-version" content="V2\.81\.57-dual-path\.11"/);
assert.match(html, /lockStamp/, 'HTML stamp cannot drop below .11');
assert.match(html, /src="src\/main\.js\?v=V2\.81\.57-dual-path\.11"/);
assert.doesNotMatch(html, /dual-path\.(?:[23456789]|10)['"]/);

assert.equal(GAME_VERSION, 'V2.81.57-dual-path.11', 'stamp is dual-path.11');
assert.equal(UX_LABEL_EXPERIMENTAL, 'Experimental UX');

const lobbySrc = readFileSync(new URL('../src/ui/lobby.js', import.meta.url), 'utf8');
const chromeSrc = readFileSync(new URL('../src/map/threeMapChrome.js', import.meta.url), 'utf8');
assert.match(lobbySrc, /UX_LABEL_EXPERIMENTAL/);
assert.match(chromeSrc, /UX_LABEL_EXPERIMENTAL/);
assert.match(chromeSrc, /assets\/flags\/\$\{flag\}/);
assert.match(chromeSrc, /three-lobby-swatch\$\{on \? ' is-on'/);
assert.match(chromeSrc, /data-lobby-select="\$\{action\}"/);
assert.match(chromeSrc, /three-lobby-pip/);
assert.match(chromeSrc, /compactLocalSeatHtml/);
assert.doesNotMatch(chromeSrc, /three-lobby-occupants|three-lobby-ai-tiers/);
assert.doesNotMatch(lobbySrc, /New UX \(Three\.js\)|three\.js/i);
assert.doesNotMatch(chromeSrc, /New UX \(Three\.js\)|three\.js/i);

assert.equal(resolveUxMode(''), UX_CLASSIC, 'default Classic');
assert.equal(resolveUxMode('?ux=classic'), UX_CLASSIC);
assert.equal(resolveUxMode('?ux=three'), UX_THREE);
assert.equal(resolveUxMode('?three=1'), UX_THREE, 'legacy three=1 is New UX');
assert.equal(resolveUxMode('?ux=1'), UX_THREE);
assert.equal(resolveUxMode('?ux=classic&three=1'), UX_CLASSIC, 'explicit classic wins');

persistUxMode(UX_THREE);
assert.equal(globalThis.sessionStorage.getItem(UX_STORAGE_KEY), UX_THREE);
assert.equal(resolveUxMode(''), UX_CLASSIC, 'queryless cold load is Classic');
assert.equal(globalThis.sessionStorage.getItem(UX_STORAGE_KEY), null, 'queryless clears three mode');

persistUxMode(UX_THREE);
assert.equal(resolveUxMode('?ux=three'), UX_THREE);
assert.equal(globalThis.sessionStorage.getItem(UX_STORAGE_KEY), UX_THREE, 'click persist survives while query is three');
assert.equal(resolveUxMode('/'), UX_CLASSIC, 'bare path is Classic');
assert.equal(globalThis.sessionStorage.getItem(UX_STORAGE_KEY), null);

clearUxMode();
assert.equal(resolveUxMode('?code=ABC123'), UX_CLASSIC, 'other query still Classic');

globalThis.localStorage.setItem(UX_STORAGE_KEY, UX_THREE);
assert.equal(resolveUxMode(''), UX_CLASSIC, 'queryless ignores leftover localStorage');
assert.equal(globalThis.localStorage.getItem(UX_STORAGE_KEY), null, 'queryless wipes local sticky');

const threeHref = applyUxQuery(UX_THREE, 'https://tactical-risk20.vercel.app/');
assert.match(threeHref, /ux=three/);
const classicHref = applyUxQuery(UX_CLASSIC, threeHref);
assert.doesNotMatch(classicHref, /[?&]ux=/);
assert.doesNotMatch(classicHref, /[?&]three=/);

assert.equal(isPocketPreviewRequested('?ux=three'), false);
assert.equal(isPocketPreviewRequested('?ux=three&pocket=1'), true);
assert.equal(isPocketPreviewRequested('?max=1'), true);

console.log('test-dual-path-mode: PASS');
