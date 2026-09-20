// New UX only: Confirm Attack is the gold CTA at playStage CONFIRM,
// and the bottom dock is not a dest-tap dead zone @390.
// Run: node tools/test-confirm-attack-cta.mjs

import { readFileSync } from 'node:fs';
import { chromeHitRectsFrom } from '../src/map/threeChromeEvents.js';
import {
  createSoloPlay,
  tapLand,
  adjustUnit,
  confirm,
  confirmLabel,
  confirmEnabled,
  confirmGold,
  playStage,
  PLAY_STAGE,
} from '../src/map/threeSoloPlay.js';
import { startClassicSolo } from '../src/map/threeSoloMatch.js';
import { TURN_PHASES } from '../src/state/gameState.js';
import { GAME_VERSION } from '../src/version.js';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
}

const setup = JSON.parse(readFileSync(new URL('../data/setup.json', import.meta.url)));
const territories = JSON.parse(readFileSync(new URL('../data/territories.json', import.meta.url)));
const continents = JSON.parse(readFileSync(new URL('../data/continents.json', import.meta.url)));
const unitDefs = JSON.parse(readFileSync(new URL('../data/units.json', import.meta.url)));

const ORIGIN = 'Karelia S.S.R.';
const DEST = 'Finland Norway';

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    failures += 1;
    console.error('FAIL', msg);
  }
}

assert(GAME_VERSION === 'V2.81.57-dual-path.8', 'stamp is dual-path.8');

const hiddenZoom = {
  hidden: true,
  getBoundingClientRect() { return { left: 336, right: 380, top: 360, bottom: 404, width: 44, height: 44 }; },
};
const peekEl = {
  classList: { contains: (c) => c === 'is-on' },
  getBoundingClientRect() { return { left: 10, right: 380, top: 620, bottom: 760, width: 370, height: 140 }; },
};
const bottomEl = {
  classList: { contains: () => false },
  getBoundingClientRect() { return { left: 0, right: 390, top: 200, bottom: 844, width: 390, height: 644 }; },
};
const confirmEl = {
  getBoundingClientRect() { return { left: 10, right: 380, top: 772, bottom: 828, width: 370, height: 56 }; },
};
const rectsDock = chromeHitRectsFrom({
  zoom: hiddenZoom,
  peek: peekEl,
  confirm: confirmEl,
  bottom: bottomEl,
});
assert(!rectsDock.some((r) => r.top === 200 && r.bottom === 844), 'full bottom dock is not a dest-tap dead zone');
assert(rectsDock.some((r) => r.top === 772 && r.bottom === 828), 'Confirm Attack stays a hit target');

const gs = startClassicSolo(setup, territories, continents);
gs.unitDefs = unitDefs;
const play = createSoloPlay(gs, unitDefs);
assert(play.gameState.turnPhase === TURN_PHASES.DEVELOP_TECH, 'open develop tech');
confirm(play);
confirm(play);
assert(play.gameState.turnPhase === TURN_PHASES.COMBAT_MOVE, 'combat-move after buy skip');
assert(playStage(play) === PLAY_STAGE.IDLE, 'opens IDLE');
tapLand(play, ORIGIN);
assert(playStage(play) === PLAY_STAGE.ORIGIN, 'ORIGIN after tap');
assert(confirmLabel(play) === 'Tap units', 'ORIGIN copy');
assert(confirmEnabled(play) === false, 'Confirm off on ORIGIN');
adjustUnit(play, 'infantry', 1);
adjustUnit(play, 'infantry', 1);
adjustUnit(play, 'armour', 1);
assert(playStage(play) === PLAY_STAGE.UNITS, 'UNITS after steppers');
assert(confirmLabel(play) === 'Tap destination', 'UNITS copy');
assert(confirmEnabled(play) === false, 'Confirm off on UNITS');
tapLand(play, DEST);
assert(playStage(play) === PLAY_STAGE.CONFIRM, 'CONFIRM when origin+units+dest legal');
assert(confirmLabel(play) === 'Confirm Attack', 'gold label is Confirm Attack');
assert(confirmGold(play) === true, 'attack gold');
assert(confirmEnabled(play) === true, 'Confirm reachable when legal');

if (failures) {
  console.error(`test-confirm-attack-cta: ${failures} FAIL`);
  process.exit(1);
}
console.log('test-confirm-attack-cta: PASS');
