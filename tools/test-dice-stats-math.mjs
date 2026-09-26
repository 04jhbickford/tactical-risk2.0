// V2.81.57-unified.16.1 — chi-square, z-scores, runs test, recompute.
// Run: node tools/test-dice-stats-math.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  CHI_DF,
  VERDICT_FAIR,
  VERDICT_UNUSUAL,
  VERDICT_WATCH,
  applyDiceBatch,
  chiSquareFaces,
  chiSquarePValue,
  emptyTotals,
  faceVerdict,
  flattenTotals,
  formatHitRate,
  hitRateZ,
  runsTestFaces,
  runsTestFromSums,
  totalsFromFlat,
} from '../src/stats/diceMath.js';
import { rebuildDiceStats } from './recompute-dice-stats.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};
const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

console.log('=== chi-square ===');
{
  const even = chiSquareFaces([100, 100, 100, 100, 100, 100]);
  check('equal faces chi2 is 0', even.chi2 === 0);
  check('equal faces p is 1', even.p === 1);
  check('equal faces look fair', even.verdict === VERDICT_FAIR);

  // Published df=5 critical values.
  const p05 = chiSquarePValue(11.070497693516, CHI_DF);
  const p01 = chiSquarePValue(15.086272469389, CHI_DF);
  check('df5 chi2 11.070 ≈ p 0.05', near(p05, 0.05, 0.002));
  check('df5 chi2 15.086 ≈ p 0.01', near(p01, 0.01, 0.001));

  // chi2 = 6 on N=600: (20^2 + 10^2 + 10^2) / 100 = 6.
  const mild = chiSquareFaces([120, 100, 100, 100, 90, 90]);
  check('mild skew chi2 is 6', near(mild.chi2, 6, 1e-9));
  check('mild skew p is between 0.05 and 0.5', mild.p > 0.05 && mild.p < 0.5);
  check('mild skew is fair', mild.verdict === VERDICT_FAIR);
  check('p 0.03 is worth watching', faceVerdict(0.03, 1000) === VERDICT_WATCH);
  check('p 0.01 with 299 rolls is not Unusual', faceVerdict(0.01, 299) === VERDICT_WATCH);
  check('p 0.01 with 300 rolls is Unusual', faceVerdict(0.01, 300) === VERDICT_UNUSUAL);
  check('p just under 0.01 with 300 is Unusual', faceVerdict(0.009, 300) === VERDICT_UNUSUAL);

  const piled = chiSquareFaces([600, 0, 0, 0, 0, 0]);
  check('all ones is Unusual', piled.verdict === VERDICT_UNUSUAL && piled.p <= 0.01);
}

console.log('=== hit-rate z ===');
{
  const fair = hitRateZ({ hits: 50, dice: 100, sumP: 50, sumVar: 25 });
  check('fair hit rate z is 0', fair.z === 0 && near(fair.observed, 0.5) && near(fair.expected, 0.5));
  const hot = hitRateZ({ hits: 60, dice: 100, sumP: 50, sumVar: 25 });
  check('60/100 vs 50 has z 2', near(hot.z, 2, 1e-9));
  check('95% margin is 1.96 * se / n', near(hot.margin, 1.96 * 5 / 100, 1e-9));
  check('format includes vs and ±', formatHitRate({ hits: 60, dice: 100, sumP: 50, sumVar: 25 }).includes('vs')
    && formatHitRate({ hits: 60, dice: 100, sumP: 50, sumVar: 25 }).includes('±'));
  check('empty block has no z', hitRateZ({}).z == null);
}

console.log('=== runs test ===');
{
  // Five lows then five highs. E[R] = 6, z = -12/sqrt(20).
  const faces = [1, 1, 1, 1, 1, 6, 6, 6, 6, 6];
  const runs = runsTestFaces(faces);
  check('runs count is 2', runs.runs === 2 && runs.n1 === 5 && runs.n2 === 5);
  check('runs expected is 6', near(runs.expected, 6, 1e-9));
  check('runs z matches the Wald–Wolfowitz formula', near(runs.z, -12 / Math.sqrt(20), 1e-9));
  const summed = runsTestFromSums({ hlLow: 5, hlHigh: 5, hlRuns: 2 });
  check('summed runs match the face sequence', near(summed.z, runs.z, 1e-9));
  const flat = runsTestFaces([1, 6, 1, 6, 1, 6, 1, 6]);
  check('alternating highs and lows have many runs', flat.runs === 8 && flat.z > 2);
}

console.log('=== batch totals and recompute ===');
{
  const totals = emptyTotals();
  applyDiceBatch(totals, [
    { unit: 'infantry', need: 1, face: 1 },
    { unit: 'infantry', need: 1, face: 6 },
  ], { context: 'combat', side: 'attacker', playerSeat: 'p1', playerName: 'Robert', isAI: false });
  check('two dice counted', totals.n === 2 && totals.faces[0] === 1 && totals.faces[5] === 1);
  check('infantry attack hit rate uses need/6', totals.units['infantry|attacker'].hits === 1
    && near(totals.units['infantry|attacker'].sumP, 2 / 6));
  check('seat attack recorded under the in-game seat', totals.seats.p1.atk.dice === 2 && totals.seats.p1.name === 'Robert');

  applyDiceBatch(totals, [{ unit: 'tech', need: 6, face: 6 }], {
    context: 'tech', side: 'attacker', playerSeat: 'p1', playerName: 'Robert',
  });
  check('tech success is face 6, not face<=6', totals.units['tech|attacker'].hits === 1);
  applyDiceBatch(totals, [{ unit: 'tech', need: 6, face: 5 }], {
    context: 'tech', side: 'attacker', playerSeat: 'p1',
  });
  check('tech face 5 is not a hit', totals.units['tech|attacker'].hits === 1 && totals.units['tech|attacker'].dice === 2);

  applyDiceBatch(totals, [{ unit: 'aaGun', need: null, face: 4 }], {
    context: 'rocket', side: 'attacker', playerSeat: 'p1',
  });
  check('rocket counts the face and not a hit rate', totals.n === 5 && totals.faces[3] === 1
    && !totals.units['aaGun|attacker']);

  const flat = flattenTotals(totals, { includeSeats: true });
  const back = totalsFromFlat({ ...flat.inc, ...flat.names, longestStreak: totals.longestStreak });
  check('flat round-trip keeps faces and seat hits', back.faces[0] === 1 && back.seats.p1.atk.hits === 1);

  const exportRows = [
    {
      id: 'G_3_1_uid1', gameId: 'G', round: 3, seq: 1, writerUid: 'uid1',
      context: 'combat', side: 'attacker', playerSeat: 'p1', isAI: false, playerName: 'Robert',
      dice: [{ unit: 'infantry', need: 1, face: 1 }, { unit: 'infantry', need: 1, face: 2 }],
    },
    {
      id: 'G_3_1_uid1', gameId: 'G', round: 3, seq: 1, writerUid: 'uid1',
      context: 'combat', side: 'attacker', playerSeat: 'p1', isAI: false,
      dice: [{ unit: 'infantry', need: 1, face: 6 }, { unit: 'infantry', need: 1, face: 6 }],
    },
    {
      id: 'G_3_2_uid1', gameId: 'G', round: 3, seq: 2, writerUid: 'uid1',
      context: 'combat', side: 'defender', playerSeat: 'ai1', isAI: true, playerName: 'German Easy AI',
      dice: [{ unit: 'infantry', need: 2, face: 2 }],
    },
  ];
  const rebuilt = rebuildDiceStats(exportRows);
  check('recompute drops a duplicate id', rebuilt.batches === 2 && rebuilt.global.inc.n === 3);
  check('recompute keeps AI dice on the game and off the player doc',
    rebuilt.games.G.inc.n === 3 && rebuilt.players.uid1.inc.n === 2);
  check('recompute stores the in-game name', rebuilt.games.G.names.name_p1 === 'Robert'
    || rebuilt.games.G.names.name_ai1 === 'German Easy AI');
}

console.log('=== rules mention the new collections ===');
{
  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
  check('rules cover diceBatches create-only', /match \/diceBatches\/\{batchId\}/.test(rules)
    && /allow update, delete: if false;/.test(rules)
    && rules.includes('request.resource.data.writerUid == request.auth.uid'));
  check('rules cover diceStats', /match \/diceStats\/\{statId\}/.test(rules)
    && rules.includes("statId == 'global'")
    && rules.includes("player_' + request.auth.uid"));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall dice stats math checks passed');
