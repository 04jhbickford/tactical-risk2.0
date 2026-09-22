// V2.81.57-unified.4 — 9.21.26.06–.11 P0 playtest cluster.
// Shared engine + both forks (Classic playerPanel/combatUI, Experimental ?ux=three).
// Run: node tools/test-dual-path-15-playtest.mjs

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
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { combatMoveReachableDests } =
  await import(pathToFileURL(join(root, 'src/state/combatMoveEligibility.js')));
const { applyAirLandingPlan, mergeLiveCarrierLoads } =
  await import(pathToFileURL(join(root, 'src/state/airLanding.js')));
const { deferredSnapshotShouldApply } =
  await import(pathToFileURL(join(root, 'src/state/placementPass.js')));
const { createSoloPlay, legalDests, confirmEnabled, tapLand, combatOrigins } =
  await import(pathToFileURL(join(root, 'src/map/threeSoloPlay.js')));
const { UX_THREE } = await import(pathToFileURL(join(root, 'src/map/presentationMode.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true, movement: 1, cost: 3 },
  fighter: { isAir: true, movement: 4, cost: 10 },
  carrier: { isSea: true, movement: 2, cost: 16, aircraftCapacity: 2, canCarry: ['fighter'] },
  factory: { isBuilding: true, cost: 15 },
};

function baseState(territories, extra = {}) {
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'usa', name: 'USA', oderId: 'host-usa' },
    { id: 'germans', name: 'Germans', oderId: 'seat-ger' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs._unitDefs = unitDefs;
  gs.unitDefs = unitDefs;
  gs.playerState = {
    usa: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'Home' },
    germans: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'Berlin' },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Home']);
  gs.capturedThisTurn = new Set();
  gs.pendingPurchases = [];
  gs.mobilizationHistory = [];
  Object.assign(gs, extra);
  return gs;
}

const theater = [
  { name: 'Home', isWater: false, connections: ['West'] },
  { name: 'West', isWater: true, connections: ['Home', 'Mid', 'NearEnemy'] },
  { name: 'Mid', isWater: true, connections: ['West', 'FarEnemy'] },
  { name: 'NearEnemy', isWater: false, connections: ['West'] },
  { name: 'FarEnemy', isWater: false, connections: ['Mid'] },
  { name: 'Berlin', isWater: false, connections: ['Shared'] },
  { name: 'Algeria', isWater: false, connections: ['Shared'] },
  { name: 'Shared', isWater: true, connections: ['Berlin', 'Algeria'] },
];

console.log('=== stamp ===');
check('GAME_VERSION is V2.81.57-unified.4', GAME_VERSION === 'V2.81.57-unified.4');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);
check('Experimental query mode is three', UX_THREE === 'three');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const mode = readFileSync(join(root, 'src/map/presentationMode.js'), 'utf8');
  check('index.html stamp is unified.2', html.includes('content="V2.81.57-unified.4"'));
  check('Experimental boot query is ux=three', /ux=three/.test(mode) || /UX_THREE\s*=\s*'three'/.test(mode));
}

console.log('=== 9.21.26.10 carrier fighter attack ===');
{
  const gs = baseState(theater);
  gs.territoryState = {
    Home: { owner: 'usa' },
    NearEnemy: { owner: 'germans' },
    FarEnemy: { owner: 'germans' },
  };
  gs.units = {
    West: [{
      id: 'cv1',
      type: 'carrier',
      owner: 'usa',
      quantity: 1,
      aircraft: [{ type: 'fighter', owner: 'usa' }],
    }],
    Home: [{ type: 'factory', owner: 'usa', quantity: 1 }],
    NearEnemy: [{ type: 'infantry', owner: 'germans', quantity: 1 }],
    FarEnemy: [{ type: 'infantry', owner: 'germans', quantity: 1 }],
  };
  const moved = gs.moveUnits('West', 'NearEnemy', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('combat move launches the carrier fighter', moved.success === true);
  const carrier = (gs.units.West || []).find((u) => u.id === 'cv1');
  check('fighter left the carrier', (carrier?.aircraft || []).length === 0);
  check('fighter is on the attack hex',
    (gs.units.NearEnemy || []).some((u) => u.type === 'fighter' && u.owner === 'usa' && u.quantity === 1));
  const undone = gs.undoLastMove(unitDefs);
  check('undo puts the fighter back on the carrier',
    undone.success === true && (carrier?.aircraft || []).length === 1);

  carrier.moved = true;
  const play = createSoloPlay(gs, unitDefs);
  play.selected = 'West';
  check('Experimental lists carrier aircraft when the ship itself has moved',
    combatOrigins(play).includes('West'));
  play.selectedUnits = { fighter: 1 };
  const dests = legalDests(play);
  check('Experimental offers the near enemy from the carrier SZ', dests.includes('NearEnemy'));
}

console.log('=== 9.21.26.11 range must leave a landing ===');
{
  const gs = baseState(theater);
  gs.territoryState = {
    Home: { owner: 'usa' },
    NearEnemy: { owner: 'germans' },
    FarEnemy: { owner: 'germans' },
  };
  gs.units = {
    West: [{ type: 'fighter', owner: 'usa', quantity: 1 }],
    NearEnemy: [{ type: 'infantry', owner: 'germans', quantity: 1 }],
    FarEnemy: [{ type: 'infantry', owner: 'germans', quantity: 1 }],
  };
  const dests = combatMoveReachableDests(gs, 'West', { fighter: 1 }, unitDefs).map((d) => d.name);
  check('shared dests omit a hex with no landing left', !dests.includes('FarEnemy'));
  check('shared dests still offer an attack that can land', dests.includes('NearEnemy'));
  const illegal = gs.moveUnits('West', 'FarEnemy', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('moveUnits rejects the no-landing attack', illegal.success === false);
  const play = createSoloPlay(gs, unitDefs);
  play.selected = 'West';
  play.selectedUnits = { fighter: 1 };
  const exp = legalDests(play);
  check('Experimental omits the same no-landing hex', !exp.includes('FarEnemy'));
  check('Experimental still offers the legal attack', exp.includes('NearEnemy'));

  gs.units.West = [{ type: 'fighter', owner: 'usa', quantity: 1, moved: true }];
  gs.airUnitOrigins = {};
  gs.units.West.push({
    id: 'cv2', type: 'carrier', owner: 'usa', quantity: 1, aircraft: [],
  });
  const landings = gs.getAirLandingOptions('West', 'fighter', unitDefs).map((o) => o.territory);
  check('moved fighter with no origin does not regain a full hop', !landings.includes('Home'));
  check('same-SZ carrier is still a landing', landings.includes('West'));
}

console.log('=== 9.21.26.08 carrier SZ landing persists ===');
{
  const units = {
    West: [{
      id: 'cv1',
      type: 'carrier',
      owner: 'usa',
      quantity: 1,
      aircraft: [],
    }, { type: 'fighter', owner: 'usa', quantity: 1, moved: true }],
  };
  const applied = applyAirLandingPlan({
    units,
    territoryByName: { West: { name: 'West', isWater: true } },
    originTerritory: 'West',
    owner: 'usa',
    plan: [{ id: 'f1', type: 'fighter', quantity: 1, destination: 'West' }],
    unitDefs,
  });
  check('same-SZ plan loads the fighter', applied.some((item) => !item.stayed && item.quantity === 1));
  const overlay = [{ id: 'cv1', type: 'carrier', owner: 'usa', quantity: 1, aircraft: [] }];
  const merged = mergeLiveCarrierLoads(units.West, overlay);
  check('finalize merge keeps the live carrier load',
    merged.find((u) => u.id === 'cv1')?.aircraft?.length === 1);
  const combat = readFileSync(join(root, 'src/ui/combatUI.js'), 'utf8');
  check('Classic finalize merges live carrier loads', combat.includes('mergeLiveCarrierLoads'));
  check('Classic does not crash a same-SZ carrier landing', combat.includes('carrierInBattle'));
}

console.log('=== 9.21.26.09 mobilize CV + factory source ===');
{
  const gs = baseState(theater, { turnPhase: TURN_PHASES.MOBILIZE });
  gs.territoryState = {
    Home: { owner: 'usa' },
    Berlin: { owner: 'usa' },
    Algeria: { owner: 'usa' },
  };
  gs.units = {
    Home: [{ type: 'factory', owner: 'usa', quantity: 1 }],
    Berlin: [{ type: 'factory', owner: 'usa', quantity: 1 }],
    Algeria: [{ type: 'factory', owner: 'usa', quantity: 1 }],
    Shared: [],
    West: [],
  };
  gs.factoriesAtTurnStart = new Set(['Home', 'Berlin', 'Algeria']);
  gs.pendingPurchases = [{ type: 'carrier', quantity: 1, owner: 'usa', cost: 16 }];
  const ambiguous = gs.mobilizeUnit('carrier', 'Shared', unitDefs);
  check('shared SZ without a source is ambiguous', ambiguous.success === false && ambiguous.ambiguous === true);
  const placed = gs.mobilizeUnit('carrier', 'Shared', unitDefs, { sourceFactory: 'Berlin' });
  check('named factory places the carrier', placed.success === true && placed.sourceFactory === 'Berlin');
  const carrier = (gs.units.Shared || []).find((u) => u.type === 'carrier');
  check('placed carrier is an individual ship with an aircraft bay',
    !!carrier?.id && Array.isArray(carrier.aircraft));
  check('history charges the named factory',
    gs.mobilizationHistory.some((h) => h.sourceFactory === 'Berlin' && h.unitType === 'carrier'));
  const round = JSON.parse(JSON.stringify(gs.toJSON()));
  const restored = new GameState({ risk: { factions: [] } }, theater, []);
  restored.loadFromJSON(round);
  check('carrier survives a state round-trip',
    (restored.units.Shared || []).some((u) => u.type === 'carrier' && u.id && Array.isArray(u.aircraft)));

  const play = createSoloPlay(gs, unitDefs);
  play.destPicked = 'Shared';
  play.selectedUnits = { carrier: 1 };
  gs.pendingPurchases = [{ type: 'carrier', quantity: 1, owner: 'usa', cost: 16 }];
  check('Experimental Confirm waits for a factory on a shared SZ', confirmEnabled(play) === false);
  tapLand(play, 'Algeria');
  check('tapping a bordering factory names the source', play.mobilizeFactory === 'Algeria');
  check('Experimental Confirm enables after the factory pick', confirmEnabled(play) === true);
  const panel = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('Classic mobilize asks which factory', panel.includes('pick-mobilize-factory'));
}

console.log('=== captured factory cap is 5 ===');
{
  const gs = baseState(theater, { turnPhase: TURN_PHASES.MOBILIZE });
  gs.playerState.usa.capitalTerritory = 'Home';
  gs.territoryState = { Berlin: { owner: 'usa' }, Home: { owner: 'usa' } };
  gs.units = { Berlin: [{ type: 'factory', owner: 'usa', quantity: 1 }] };
  gs.factoriesAtTurnStart = new Set(['Berlin']);
  gs.pendingPurchases = [{ type: 'infantry', quantity: 6, owner: 'usa', cost: 3 }];
  let placed = 0;
  for (let i = 0; i < 6; i++) {
    const result = gs.mobilizeUnit('infantry', 'Berlin', unitDefs);
    if (result.success) placed += 1;
  }
  check('captured non-capital factory places 5', placed === 5);
  check('sixth unit is refused', gs.pendingPurchases.some((p) => p.type === 'infantry' && p.quantity === 1));
}

console.log('=== 9.21.26.07 air cannot end on just-captured land ===');
{
  const gs = baseState(theater, { turnPhase: TURN_PHASES.NON_COMBAT_MOVE });
  gs.territoryState = {
    Home: { owner: 'usa' },
    NearEnemy: { owner: 'usa' },
  };
  gs.capturedThisTurn = new Set(['NearEnemy']);
  gs.friendlyTerritoriesAtTurnStart = new Set(['Home']);
  gs.units = {
    West: [{ type: 'fighter', owner: 'usa', quantity: 1 }],
    NearEnemy: [],
    Home: [],
  };
  const ncm = gs.moveUnits('West', 'NearEnemy', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('NCM rejects air onto land captured this turn', ncm.success === false);
  gs.units.NearEnemy = [{ type: 'fighter', owner: 'usa', quantity: 1, moved: true }];
  gs.units.West = [];
  gs.airUnitOrigins = { NearEnemy: { fighter: { origin: 'West', distance: 1 } } };
  const relocated = gs.relocateAirFromCapturedLand(unitDefs);
  check('phase-exit relocation leaves the captured hex',
    relocated.moved === 1
    && !(gs.units.NearEnemy || []).some((u) => u.type === 'fighter'));
  check('fighter landed on start-of-turn friendly land',
    (gs.units.Home || []).some((u) => u.type === 'fighter' && u.owner === 'usa'));
  const play = createSoloPlay(gs, unitDefs);
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  gs.units.West = [{ type: 'fighter', owner: 'usa', quantity: 1 }];
  play.selected = 'West';
  play.selectedUnits = { fighter: 1 };
  check('Experimental NCM omits the captured hex', !legalDests(play).includes('NearEnemy'));
}

console.log('=== 9.21.26.06 deferred host snapshot ===');
{
  check('older deferred doc is ignored', deferredSnapshotShouldApply({
    remoteVersion: 3, localVersion: 4, remotePlayerId: 'b', localPlayerId: 'a',
  }) === false);
  check('newer deferred doc applies', deferredSnapshotShouldApply({
    remoteVersion: 5, localVersion: 4, remotePlayerId: 'a', localPlayerId: 'a',
  }) === true);
  check('same version with a new seat applies', deferredSnapshotShouldApply({
    remoteVersion: 4, localVersion: 4, remotePlayerId: 'b', localPlayerId: 'a',
  }) === true);
  check('same version and seat does not reapply', deferredSnapshotShouldApply({
    remoteVersion: 4, localVersion: 4, remotePlayerId: 'a', localPlayerId: 'a',
  }) === false);
  const sync = readFileSync(join(root, 'src/multiplayer/syncManager.js'), 'utf8');
  check('push swallow notes the snapshot and flushes after isPushing',
    sync.includes('_noteDeferredSnapshot') && sync.includes('_flushDeferredRemote'));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall unified.2 playtest checks passed');
