// V2.81.57-unified.17 — AI sea battles roll and count aircraft on carriers.
// Run: node tools/test-ai-carrier-aircraft.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
const el = () => ({
  style: {},
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  appendChild(c) { return c; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
});
globalThis.document ??= {
  documentElement: el(),
  body: el(),
  createElement: el,
  getElementById() { return null; },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')).href);
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

function gsWith(units) {
  const T = (name, isWater, connections) => ({ name, isWater, connections });
  const gs = new GameState({ risk: { factions: [] } }, [
    T('Red Sea', true, ['Egypt']),
    T('Egypt', false, ['Red Sea']),
  ], []);
  gs.players = [
    { id: 'Germans', name: 'Robert007' },
    { id: 'British', name: 'Easy Bot', isAI: true, aiDifficulty: 'easy' },
  ];
  gs.currentPlayerIndex = 1;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.territoryState = { Egypt: { owner: 'British' } };
  gs.playerState = { Germans: { ipcs: 0 }, British: { ipcs: 0 } };
  gs.units = { 'Red Sea': units };
  gs.combatQueue = ['Red Sea'];
  return gs;
}

function countPieces(units) {
  let n = 0;
  for (const unit of units || []) {
    n += Number(unit.quantity) || 0;
    for (const craft of unit.aircraft || []) n += Number(craft.quantity) || 1;
    for (const item of unit.cargo || []) n += Number(item.quantity) || 1;
  }
  return n;
}

function lossTotal(events) {
  let n = 0;
  for (const ev of events || []) {
    if (ev.type !== 'combat') continue;
    for (const bucket of [ev.attackerLosses, ev.defenderLosses]) {
      if (!bucket || typeof bucket !== 'object') continue;
      for (const qty of Object.values(bucket)) n += Number(qty) || 0;
    }
  }
  return n;
}

{
  const gs = gsWith([
    { type: 'carrier', quantity: 1, owner: 'Germans', id: 'cv1', aircraft: [
      { type: 'fighter', owner: 'Germans' },
      { type: 'fighter', owner: 'Germans' },
    ] },
    { type: 'battleship', quantity: 1, owner: 'British' },
  ]);
  const defenseFighters = [];
  gs._rollDie = (ctx) => {
    if (ctx?.unit === 'fighter' && ctx?.side === 'defender' && ctx?.context === 'combat') defenseFighters.push(ctx);
    return 6;
  };
  const result = gs.resolveCombat('Red Sea', unitDefs);
  check('defending carrier fighters add two defense dice', defenseFighters.length === 2, defenseFighters.length);
  check('a miss leaves the carrier fight open', result && !result.resolved);
  const stillAboard = (gs.units['Red Sea'] || [])
    .filter((unit) => unit.type === 'carrier' && unit.owner === 'Germans')
    .reduce((sum, unit) => sum + (unit.aircraft?.length || 0), 0);
  check('surviving fighters are stowed again', stillAboard === 2, gs.units['Red Sea']);
}

{
  const beforeUnits = [
    { type: 'transport', quantity: 1, owner: 'Germans', id: 'tr1', cargo: [
      { type: 'infantry', owner: 'Germans' },
      { type: 'infantry', owner: 'Germans' },
    ] },
    { type: 'carrier', quantity: 1, owner: 'Germans', id: 'cv1', aircraft: [
      { type: 'fighter', owner: 'Germans' },
    ] },
    { type: 'battleship', quantity: 3, owner: 'British' },
    { type: 'fighter', quantity: 4, owner: 'British' },
  ];
  const gs = gsWith(beforeUnits.map((unit) => ({
    ...unit,
    cargo: unit.cargo ? unit.cargo.map((item) => ({ ...item })) : undefined,
    aircraft: unit.aircraft ? unit.aircraft.map((item) => ({ ...item })) : undefined,
  })));
  const before = countPieces(gs.units['Red Sea']);
  Math.random = () => 0.01;
  let result;
  let guard = 0;
  do {
    result = gs.resolveCombat('Red Sea', unitDefs);
  } while (result && !result.resolved && ++guard < 20);
  const after = countPieces(gs.units['Red Sea']);
  const lost = lossTotal(gs.turnEvents);
  check('sunk carrier fight resolves', !!result?.resolved && result.winner === 'attacker', result);
  check('carrier fighters are gone from the zone', !(gs.units['Red Sea'] || []).some((unit) => (
    unit.owner === 'Germans' || (unit.aircraft || []).length || (unit.cargo || []).length
  )), gs.units['Red Sea']);
  check('unit counts reconcile with reported losses', before - after === lost, { before, after, lost, events: gs.turnEvents });
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nai carrier aircraft checks passed');
