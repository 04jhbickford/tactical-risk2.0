import assert from 'node:assert/strict';
import {
  UX_CLASSIC,
  UX_THREE,
  UX_STORAGE_KEY,
  resolveUxMode,
  applyUxQuery,
  persistUxMode,
  isPocketPreviewRequested,
} from '../src/map/presentationMode.js';

globalThis.sessionStorage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
};

assert.equal(resolveUxMode(''), UX_CLASSIC, 'default Classic');
assert.equal(resolveUxMode('?ux=classic'), UX_CLASSIC);
assert.equal(resolveUxMode('?ux=three'), UX_THREE);
assert.equal(resolveUxMode('?three=1'), UX_THREE, 'legacy three=1 is New UX');
assert.equal(resolveUxMode('?ux=1'), UX_THREE);
assert.equal(resolveUxMode('?ux=classic&three=1'), UX_CLASSIC, 'explicit classic wins');

persistUxMode(UX_THREE);
assert.equal(globalThis.sessionStorage.getItem(UX_STORAGE_KEY), UX_THREE);
assert.equal(resolveUxMode(''), UX_THREE, 'sessionStorage keeps New UX');
persistUxMode(UX_CLASSIC);
assert.equal(resolveUxMode(''), UX_CLASSIC);

const threeHref = applyUxQuery(UX_THREE, 'https://tactical-risk20.vercel.app/');
assert.match(threeHref, /ux=three/);
const classicHref = applyUxQuery(UX_CLASSIC, threeHref);
assert.match(classicHref, /ux=classic/);
assert.doesNotMatch(classicHref, /[?&]three=/);

assert.equal(isPocketPreviewRequested('?ux=three'), false);
assert.equal(isPocketPreviewRequested('?ux=three&pocket=1'), true);
assert.equal(isPocketPreviewRequested('?max=1'), true);

console.log('test-dual-path-mode: PASS');
