// V2.81.57-unified.14.1 — a million offline _rollDie faces stay inside
// the fair chi-square band. Seeded RNG is deterministic; one real
// Math.random pass is only a smoke run.
// Run: node tools/test-dice-uniform.mjs

import { GameState } from '../src/state/gameState.js';
import { discardDiceBuffer, setDiceTrackerEnabled } from '../src/stats/diceTracker.js';
import {
  VERDICT_FAIR,
  VERDICT_UNUSUAL,
  VERDICT_WATCH,
  chiSquareFaces,
} from '../src/stats/diceMath.js';

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function tally(enabled, rng, count) {
  const real = Math.random;
  Math.random = rng;
  setDiceTrackerEnabled(enabled);
  const gs = new GameState({ risk: { factions: [] } }, [], []);
  gs.players = [{ id: 'p1', name: 'Robert', isAI: false }];
  const faces = [0, 0, 0, 0, 0, 0];
  let checksum = 0;
  let calls = 0;
  const orig = Math.random;
  Math.random = () => {
    calls += 1;
    return orig();
  };
  try {
    for (let i = 0; i < count; i++) {
      const face = gs._rollDie({
        context: 'combat',
        side: 'attacker',
        unit: 'infantry',
        need: 1,
        playerSeat: 'p1',
      });
      faces[face - 1] += 1;
      checksum = (checksum + face) % 1000003;
      if ((i & 8191) === 0) discardDiceBuffer(gs);
    }
  } finally {
    discardDiceBuffer(gs);
    Math.random = real;
    setDiceTrackerEnabled(true);
  }
  return { faces, checksum, calls, stats: chiSquareFaces(faces, count) };
}

const N = 1_000_000;
console.log(`=== ${N} seeded rolls ===`);
const seededOn = tally(true, mulberry32(0x5eed), N);
const seededOff = tally(false, mulberry32(0x5eed), N);
check('tracker on and off use the same number of Math.random calls', seededOn.calls === N && seededOff.calls === N);
check('tracker on and off produce the same faces', seededOn.checksum === seededOff.checksum
  && seededOn.faces.every((n, i) => n === seededOff.faces[i]));
check('seeded million is not Unusual', seededOn.stats.verdict !== VERDICT_UNUSUAL);
check('seeded million looks fair or only worth watching', seededOn.stats.verdict === VERDICT_FAIR || seededOn.stats.verdict === VERDICT_WATCH);
check('seeded p is above the unusual line', seededOn.stats.p > 0.01);
console.log(`    chi2=${seededOn.stats.chi2.toFixed(3)} p=${seededOn.stats.p.toFixed(4)} ${seededOn.stats.verdict} faces=${seededOn.faces.join(',')}`);

console.log('=== real Math.random smoke ===');
const realRng = Math.random;
const smoke = tally(true, realRng, 2000);
check('smoke run returns a verdict', [VERDICT_FAIR, VERDICT_WATCH, VERDICT_UNUSUAL].includes(smoke.stats.verdict));
check('smoke p is finite', Number.isFinite(smoke.stats.p));
check('smoke still calls Math.random once per die', smoke.calls === 2000);

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall dice uniform checks passed');
