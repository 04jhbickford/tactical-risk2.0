// dual-path.10: combat capture, combat-move empty origin, independent air land,
// air-land undo, single green Done. Classic + Experimental share the helpers.
// Run: node tools/test-dual-path-9-combat.mjs

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const {
  dequeueResolvedCombatHeads,
  captureIfAttackerHolds,
  applyTerritoryCapture,
  finalizeAttackerHoldsOnBoard,
} = await import(pathToFileURL(join(root, 'src/state/combatFinalize.js')));
const {
  resolveLandingDestination,
  remainingAirLandingsToAssign,
  mergeLandingSelections,
  clearPendingLandingDestinations,
} = await import(pathToFileURL(join(root, 'src/state/airLanding.js')));
const {
  maxMoveSelection,
  canEmptyTerritoryDuringCombatMove,
  combatMoveReachableDests,
} = await import(pathToFileURL(join(root, 'src/state/combatMoveEligibility.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true, movement: 1, attack: 1, defense: 2 },
  armour: { isLand: true, movement: 2, attack: 3, defense: 3 },
  fighter: { isAir: true, movement: 4, attack: 3, defense: 4 },
  aaGun: { isLand: true, movement: 1, attack: 0, defense: 0 },
  factory: { isBuilding: true },
};

function makeGs({
  dest = 'West US',
  attackers = [{ type: 'infantry', owner: 'usa', quantity: 2 }],
  defenders = [],
  owner = 'germans',
} = {}) {
  const units = { [dest]: [...attackers, ...defenders] };
  return {
    currentPlayer: { id: 'usa', name: 'USA' },
    combatQueue: [dest],
    units,
    territoryState: { [dest]: { owner }, Mexico: { owner: 'usa' } },
    territoryByName: {
      [dest]: { isWater: false, connections: ['Mexico'] },
      Mexico: { isWater: false, connections: [dest] },
    },
    capturedThisTurn: new Set(),
    conqueredThisTurn: {},
    pendingAirLandings: [],
    getUnitsAt(name) { return this.units[name] || []; },
    getOwner(name) { return this.territoryState[name]?.owner; },
    areAllies() { return false; },
    awardRiskCard() { return 'infantry'; },
    handleCapitalCapture() { this.capitalHit = true; },
    logTerritoryCapture() { this.loggedCapture = true; },
    getConnections(name) { return this.territoryByName[name]?.connections || []; },
    getReachableTerritoriesForLand(from, range, playerId, isCombatMove) {
      const out = new Map();
      for (const to of this.getConnections(from)) {
        const t = this.territoryByName[to];
        if (t?.isWater) continue;
        const own = this.getOwner(to);
        if (isCombatMove || own === playerId) out.set(to, { distance: 1 });
      }
      if (range > 1) {
        /* adjacent only is enough for Mexico→West US */
      }
      return out;
    },
    notified: 0,
    _notify() { this.notified += 1; },
  };
}

console.log('=== stamp ===');
check('GAME_VERSION is V2.81.57-unified.13', GAME_VERSION === 'V2.81.57-unified.13');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== 9.20.26.02 / 35RB85 dequeue captures land leftover ===');
{
  const gs = makeGs();
  const { skipped, captured } = dequeueResolvedCombatHeads(gs, { unitDefs });
  check('West US dequeued', skipped[0] === 'West US' && gs.combatQueue.length === 0);
  check('owner flipped to attacker', gs.territoryState['West US'].owner === 'usa');
  check('captured list includes West US', captured.includes('West US'));
  check('capturedThisTurn has West US', gs.capturedThisTurn.has('West US'));
  check('notify fired', gs.notified >= 1);
}

{
  const gs = makeGs({
    attackers: [],
    defenders: [{ type: 'infantry', owner: 'germans', quantity: 1 }],
  });
  dequeueResolvedCombatHeads(gs, { unitDefs });
  check('attacker wipe does not flip owner', gs.territoryState['West US'].owner === 'germans');
}

{
  const gs = makeGs({
    attackers: [{ type: 'fighter', owner: 'usa', quantity: 2 }],
    defenders: [],
  });
  captureIfAttackerHolds(gs, 'West US', { playerId: 'usa', unitDefs });
  check('air-only leftover does not capture', gs.territoryState['West US'].owner === 'germans');
}

{
  const gs = makeGs({
    attackers: [{ type: 'infantry', owner: 'usa', quantity: 1 }],
    defenders: [{ type: 'factory', owner: 'germans', quantity: 1 }],
  });
  applyTerritoryCapture(gs, 'West US', { playerId: 'usa', unitDefs });
  check('factory ownership transfers',
    gs.units['West US'].find((u) => u.type === 'factory')?.owner === 'usa');
}

{
  const gs = makeGs();
  gs.combatQueue = [];
  finalizeAttackerHoldsOnBoard(gs, { unitDefs });
  check('_detectCombats wipe still flips leftover hold',
    gs.territoryState['West US'].owner === 'usa');
}

console.log('=== 9.20.26.03 Mexico combat move may empty the origin ===');
check('shared rule allows emptying during combat move', canEmptyTerritoryDuringCombatMove() === true);
{
  const movable = [
    { type: 'infantry', quantity: 3 },
    { type: 'fighter', quantity: 2 },
  ];
  const selected = maxMoveSelection(movable);
  check('Select All takes every eligible stack',
    selected.infantry === 3 && selected.fighter === 2);
}
{
  const gs = makeGs();
  gs.units.Mexico = [
    { type: 'infantry', owner: 'usa', quantity: 3 },
    { type: 'fighter', owner: 'usa', quantity: 1 },
  ];
  const dests = combatMoveReachableDests(gs, 'Mexico', { infantry: 3 }, unitDefs);
  check('Mexico infantry can reach West US', dests.some((d) => d.name === 'West US'));
}

console.log('=== 9.20.26.05 each aircraft lands independently ===');
{
  const a = { id: 'fighter_0', type: 'fighter', quantity: 1, landingOptions: [{ territory: 'Mexico' }] };
  const b = { id: 'fighter_1', type: 'fighter', quantity: 1, landingOptions: [{ territory: 'Mexico' }, { territory: 'East US' }] };
  check('fighter_0 dest does not assign fighter_1',
    resolveLandingDestination(b, 1, { fighter_0: 'Mexico' }) == null);
  check('type key does not assign an id-bearing fighter',
    resolveLandingDestination(a, 0, { fighter: 'Mexico' }) == null);
  check('remaining stays 1 after one named dest',
    remainingAirLandingsToAssign([a, b], { fighter_0: 'Mexico' }) === 1);
  const merged = mergeLandingSelections({ fighter_0: 'Mexico' }, [
    { id: 'fighter_0', type: 'fighter', destination: 'Mexico' },
  ]);
  check('merge does not write a type-wide key', merged.fighter == null);
  check('two dests stay independent',
    remainingAirLandingsToAssign([a, b], {
      fighter_0: 'Mexico',
      fighter_1: 'East US',
    }) === 0);
}

console.log('=== 9.20.26.06 air-land undo clears pending dests ===');
{
  const pending = [{
    originTerritory: 'West US',
    units: [
      { id: 'fighter_0', type: 'fighter', destination: 'Mexico', applied: false },
      { id: 'fighter_1', type: 'fighter', destination: 'Mexico', applied: false },
    ],
  }];
  const cleared = clearPendingLandingDestinations(pending, 'West US');
  check('undo drops both dests',
    cleared[0].units.every((u) => !u.destination));
  check('undo does not mark applied',
    cleared[0].units.every((u) => !u.applied));
}

console.log('=== 9.20.26.04 single green Done ===');
{
  const panel = readFileSync(new URL('../src/ui/playerPanel.js', import.meta.url), 'utf8');
  const placement = readFileSync(new URL('../src/ui/placementUI.js', import.meta.url), 'utf8');
  check('inline placement no longer paints a blue Done',
    !/pp-action-btn primary" data-action="finish-placement"/.test(panel));
  check('hidden placementUI panel has no Done - Next Player',
    !/Done - Next Player/.test(placement));
  check('phone tray keeps the green Done',
    panel.includes('phone-place-done') && panel.includes('Done — next player'));
  check('desktop thumb still offers green finish-placement',
    panel.includes("action: 'finish-placement'"));
  const sidebar = readFileSync(new URL('../src/ui/sidebar.js', import.meta.url), 'utf8');
  check('sidebar no longer paints finish-placement',
    !/data-action="finish-placement"/.test(sidebar));
  const movement = readFileSync(new URL('../src/ui/movementUI.js', import.meta.url), 'utf8');
  check('Classic movementUI uses shared Select All / dests',
    movement.includes('maxMoveSelection') && movement.includes('combatMoveReachableDests'));
  const undo = readFileSync(new URL('../src/state/undoPolicy.js', import.meta.url), 'utf8');
  check('undoPolicy allows air-land undo during COMBAT',
    undo.includes('canUndoAirLanding') && undo.includes('undo-air-landing'));
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll dual-path.10 combat / air / deploy checks passed');
