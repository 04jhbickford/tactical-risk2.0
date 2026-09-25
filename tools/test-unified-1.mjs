// V2.81.57-unified.12 — single shell; Experimental dual-path runtime killed.

import assert from 'node:assert/strict';
import {
  UX_CLASSIC,
  UX_THREE,
  UX_LABEL_EXPERIMENTAL,
  resolveUxMode,
  applyUxQuery,
  persistUxMode,
  clearUxMode,
  isThreeUx,
  lobbyInterfaceChoices,
  redirectUxAliasesIfNeeded,
  isPocketPreviewRequested,
} from '../src/map/presentationMode.js';
import { readFileSync } from 'node:fs';
import { GAME_VERSION, SCHEMA_VERSION } from '../src/version.js';

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
assert.match(html, /window\.__TR_GAME_VERSION = 'V2\.81\.57-unified\.12'/);
assert.match(html, /name="tr-game-version" content="V2\.81\.57-unified\.12"/);
assert.match(html, /lockStamp/);
assert.match(html, /src="src\/main\.js\?v=V2\.81\.57-unified\.12"/);

assert.equal(GAME_VERSION, 'V2.81.57-unified.12', 'stamp is unified.2');
assert.equal(SCHEMA_VERSION, 11, 'SCHEMA stays 11');
assert.equal(UX_LABEL_EXPERIMENTAL, 'Experimental UX');

assert.equal(resolveUxMode(''), UX_CLASSIC, 'queryless is unified Classic');
assert.equal(resolveUxMode('?ux=classic'), UX_CLASSIC);
assert.equal(resolveUxMode('?ux=three'), UX_CLASSIC, '?ux=three redirects to Classic mode');
assert.equal(resolveUxMode('?three=1'), UX_CLASSIC);
assert.equal(isThreeUx('?ux=three'), false);

const cleaned = applyUxQuery(UX_THREE, 'https://tactical-risk20.vercel.app/?ux=three&foo=1');
assert.doesNotMatch(cleaned, /ux=three|three=1/);
assert.match(cleaned, /foo=1/);

persistUxMode(UX_THREE);
assert.equal(sessionStorage.getItem('tacticalRisk_uxMode'), null, 'never sticky Experimental');
clearUxMode();

const choices = lobbyInterfaceChoices(UX_CLASSIC);
assert.equal(choices.classic, null);
assert.equal(choices.experimental, null);

const lobbySrc = readFileSync(new URL('../src/ui/lobby.js', import.meta.url), 'utf8');
assert.doesNotMatch(lobbySrc, /data-action="ux-classic"/);
assert.doesNotMatch(lobbySrc, /data-action="ux-three"/);
assert.match(lobbySrc, /Interface Classic\|Experimental picker removed/);

const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(mainSrc, /redirectUxAliasesIfNeeded/);
assert.doesNotMatch(mainSrc, /bootThreeSolo/);
assert.doesNotMatch(mainSrc, /resolveUxMode\(\) === UX_THREE/);

assert.equal(typeof redirectUxAliasesIfNeeded, 'function');
assert.equal(isPocketPreviewRequested('?pocket=1'), true);

console.log('test-unified-1: PASS');
