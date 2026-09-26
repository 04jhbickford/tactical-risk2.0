// V2.81.57-unified.17 — cargo can assault after the transport has moved.
// Run: node tools/test-amphibious-after-move.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
const mk = () => ({
  style: {},
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  appendChild(c) { return c; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
});
globalThis.document ??= {
  documentElement: mk(),
  body: mk(),
  createElement: mk,
  getElementById() { return null; },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')).href);
const { PlayerPanel } = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')).href);
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const T = (name, isWater, connections) => ({ name, isWater, connections });
const TERR = [
  T('South Europe', false, ['Central Mediterranean Sea Zone']),
  T('Central Mediterranean Sea Zone', true, ['South Europe', 'East Mediterranean Sea Zone']),
  T('East Mediterranean Sea Zone', true, ['Central Mediterranean Sea Zone', 'Syria Jordan']),
  T('Syria Jordan', false, ['East Mediterranean Sea Zone']),
];

function fresh(syriaOwner) {
  const gs = new GameState({ risk: { factions: [] } }, TERR, []);
  gs.players = [
    { id: 'Germans', name: 'Robert007' },
    { id: 'British', name: 'Easy Bot', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.territoryState = {
    'South Europe': { owner: 'Germans' },
    'Syria Jordan': { owner: syriaOwner },
  };
  gs.playerState = { Germans: { ipcs: 0 }, British: { ipcs: 0 } };
  gs.friendlyTerritoriesAtTurnStart = new Set(['South Europe']);
  gs.units = {
    'South Europe': [{ type: 'infantry', quantity: 2, owner: 'Germans' }],
    'East Mediterranean Sea Zone': [{ type: 'transport', quantity: 1, owner: 'Germans' }],
    'Syria Jordan': syriaOwner === 'Germans'
      ? []
      : [{ type: 'infantry', quantity: 1, owner: 'British' }],
  };
  return gs;
}

function sailLoadReturn(gs) {
  const out = gs.moveUnits('East Mediterranean Sea Zone', 'Central Mediterranean Sea Zone', [{ type: 'transport', quantity: 1 }], unitDefs);
  const load = gs.moveUnits('South Europe', 'Central Mediterranean Sea Zone', [{ type: 'infantry', quantity: 2 }], unitDefs);
  const tr = gs.units['Central Mediterranean Sea Zone'].find((unit) => unit.type === 'transport');
  const sail = gs.moveUnits('Central Mediterranean Sea Zone', 'East Mediterranean Sea Zone', [], unitDefs, { shipIds: [tr.id] });
  return { out, load, sail, tr };
}

function panel(gs) {
  const pp = Object.create(PlayerPanel.prototype);
  pp.gameState = gs;
  pp.unitDefs = unitDefs;
  pp.territories = Object.fromEntries(TERR.map((t) => [t.name, t]));
  pp.moveSelectedUnits = {};
  return pp;
}

{
  const gs = fresh('British');
  const moved = sailLoadReturn(gs);
  check('sail, load, sail back', moved.out.success && moved.load.success && moved.sail.success, moved);
  const pp = panel(gs);
  const sea = { name: 'East Mediterranean Sea Zone', isWater: true };
  const movable = pp._getMovableUnits(sea, gs.currentPlayer);
  const cargo = movable.filter((unit) => unit.isCargo);
  check('moved transport still lists both infantry', cargo.length === 1 && cargo[0].quantity === 2, movable);
  check('spent transport is not itself movable', !movable.some((unit) => unit.type === 'transport' && !unit.isCargo));
  check('movement UI still opens for the cargo', pp._hasMovableUnits(sea, gs.currentPlayer) === true);
  const key = cargo[0].cargoKey;
  pp.moveSelectedUnits = { [key]: 2 };
  const dests = pp._getValidDestinations(sea, gs.currentPlayer, true);
  check('combat move offers Syria Jordan', dests.some((dest) => dest.name === 'Syria Jordan' && dest.isAmphibious), dests);
  const live = gs.units['East Mediterranean Sea Zone'].filter((unit) => unit.type === 'transport');
  const idx = gs.units['East Mediterranean Sea Zone'].filter((unit) => unit.type === 'transport' && unit.owner === 'Germans').indexOf(live[0]);
  const first = gs.unloadSingleUnit('East Mediterranean Sea Zone', idx, 'infantry', 'Syria Jordan');
  const second = gs.unloadSingleUnit('East Mediterranean Sea Zone', idx, 'infantry', 'Syria Jordan');
  gs._detectCombats();
  check('assault unloads both infantry', first.success && second.success, { first, second });
  check('land battle is queued with the sea zone', (
    gs.combatQueue.includes('Syria Jordan')
    && gs.amphibiousAssaultDetails['Syria Jordan']?.seaZone === 'East Mediterranean Sea Zone'
  ), { queue: gs.combatQueue, details: gs.amphibiousAssaultDetails });
}

{
  const gs = fresh('Germans');
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  sailLoadReturn(gs);
  const pp = panel(gs);
  const sea = { name: 'East Mediterranean Sea Zone', isWater: true };
  const cargo = pp._getMovableUnits(sea, gs.currentPlayer).filter((unit) => unit.isCargo);
  pp.moveSelectedUnits = { [cargo[0].cargoKey]: 2 };
  const dests = pp._getValidDestinations(sea, gs.currentPlayer, false);
  check('non-combat offers friendly Syria Jordan', dests.some((dest) => dest.name === 'Syria Jordan' && !dest.isEnemy));
  const unload = gs.unloadSingleUnit('East Mediterranean Sea Zone', 0, 'infantry', 'Syria Jordan');
  const landed = (gs.units['Syria Jordan'] || []).some((unit) => unit.type === 'infantry' && unit.owner === 'Germans');
  check('non-combat unload lands on friendly territory', unload.success && landed && !gs.amphibiousAssaultDetails['Syria Jordan'], unload);
}

{
  const gs = fresh('British');
  const pp = panel(gs);
  const sea = { name: 'East Mediterranean Sea Zone', isWater: true };
  gs.units['East Mediterranean Sea Zone'] = [{
    type: 'transport',
    quantity: 1,
    owner: 'Germans',
    id: 'transport_fresh',
    cargo: [{ type: 'infantry', owner: 'Germans' }, { type: 'infantry', owner: 'Germans' }],
  }];
  const movable = pp._getMovableUnits(sea, gs.currentPlayer);
  check('unmoved transport is listed with its cargo', (
    movable.some((unit) => unit.type === 'transport' && !unit.isCargo)
    && movable.some((unit) => unit.isCargo && unit.quantity === 2)
  ), movable);
}

{
  const gs = fresh('British');
  sailLoadReturn(gs);
  const spent = gs.units['East Mediterranean Sea Zone'].find((unit) => unit.type === 'transport');
  spent.cargo = (spent.cargo || []).map((item) => ({ ...item, moved: true }));
  const pp = panel(gs);
  const movable = pp._getMovableUnits({ name: 'East Mediterranean Sea Zone', isWater: true }, gs.currentPlayer);
  check('cargo that already unloaded stays hidden', !movable.some((unit) => unit.isCargo), movable);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\namphibious after move checks passed');
