// 9.20.26.07 — mobilize fighters onto a carrier in a factory-adjacent SZ.
// Shared eligibility + Classic chrome scan + Experimental dests / sea-first.
// Run: node tools/test-dual-path-9-mobilize-carrier.mjs

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
const {
  canPlaceAirOnCarrierInSeaZone,
  seaZoneCarrierCapacity,
  seaFirstUnitEntries,
  pendingAirCanLoadInSeaZone,
} = await import(pathToFileURL(join(root, 'src/state/carrierPlacement.js')));
const {
  createSoloPlay,
  legalPlaceDests,
  confirm,
} = await import(pathToFileURL(join(root, 'src/map/threeSoloPlay.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true, movement: 1, cost: 3 },
  fighter: { isAir: true, movement: 4, cost: 10 },
  bomber: { isAir: true, movement: 6, cost: 15 },
  carrier: { isSea: true, movement: 2, cost: 16, aircraftCapacity: 2, canCarry: ['fighter'] },
  destroyer: { isSea: true, movement: 2, cost: 12 },
  factory: { isBuilding: true, cost: 15 },
};

function makeTheater() {
  const territories = [
    { name: 'Mexico', isWater: false, connections: ['Mexico Sea Zone'] },
    { name: 'Mexico Sea Zone', isWater: true, connections: ['Mexico'] },
    { name: 'Open Sea', isWater: true, connections: [] },
    { name: 'Inland', isWater: false, connections: [] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'usa', name: 'USA' },
    { id: 'germans', name: 'Germans' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.MOBILIZE;
  gs.territoryState = {
    Mexico: { owner: 'usa' },
    'Mexico Sea Zone': { owner: null },
    'Open Sea': { owner: null },
    Inland: { owner: 'usa' },
  };
  gs.playerState = {
    usa: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'Mexico' },
    germans: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'Inland' },
  };
  gs.units = {
    Mexico: [{ type: 'factory', owner: 'usa', quantity: 1 }],
    'Mexico Sea Zone': [],
    'Open Sea': [],
    Inland: [],
  };
  gs.factoriesAtTurnStart = new Set(['Mexico']);
  gs.pendingPurchases = [
    { type: 'carrier', quantity: 1, owner: 'usa', cost: 16 },
    { type: 'fighter', quantity: 2, owner: 'usa', cost: 10 },
  ];
  gs.mobilizationHistory = [];
  return gs;
}

console.log('=== stamp ===');
check('GAME_VERSION is V2.81.57-unified.2', GAME_VERSION === 'V2.81.57-unified.2');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== 9.20.26.07 shared canPlace / capacity ===');
{
  const gs = makeTheater();
  check('empty SZ has no air capacity',
    seaZoneCarrierCapacity(gs, 'Mexico Sea Zone', 'usa', unitDefs, 'fighter') === 0);
  check('fighter cannot load before a carrier exists',
    canPlaceAirOnCarrierInSeaZone(gs, 'Mexico Sea Zone', 'fighter', 'usa', unitDefs, {
      requireFactoryAdjacent: true,
    }) === false);
  const cv = gs.mobilizeUnit('carrier', 'Mexico Sea Zone', unitDefs);
  check('carrier places in factory-adjacent SZ', cv.success === true);
  check('SZ now has 2 fighter slots',
    seaZoneCarrierCapacity(gs, 'Mexico Sea Zone', 'usa', unitDefs, 'fighter') === 2);
  check('fighter can load after CV',
    canPlaceAirOnCarrierInSeaZone(gs, 'Mexico Sea Zone', 'fighter', 'usa', unitDefs, {
      requireFactoryAdjacent: true,
    }) === true);
  check('bomber cannot load (canCarry fighter only)',
    canPlaceAirOnCarrierInSeaZone(gs, 'Mexico Sea Zone', 'bomber', 'usa', unitDefs, {
      requireFactoryAdjacent: true,
    }) === false);
  gs.units['Open Sea'] = [{ type: 'carrier', owner: 'usa', quantity: 1, aircraft: [] }];
  check('non-factory-adjacent SZ rejected when required',
    canPlaceAirOnCarrierInSeaZone(gs, 'Open Sea', 'fighter', 'usa', unitDefs, {
      requireFactoryAdjacent: true,
    }) === false);
}

console.log('=== 9.20.26.07 mobilize 2 FTR + 1 CV (Rob quote) ===');
{
  const gs = makeTheater();
  check('air into empty SZ blocked before write',
    gs.mobilizeUnit('fighter', 'Mexico Sea Zone', unitDefs).success === false);
  check('fighter still pending after blocked SZ',
    gs.pendingPurchases.find((p) => p.type === 'fighter')?.quantity === 2);
  check('carrier places first',
    gs.mobilizeUnit('carrier', 'Mexico Sea Zone', unitDefs).success === true);
  const f1 = gs.mobilizeUnit('fighter', 'Mexico Sea Zone', unitDefs);
  const f2 = gs.mobilizeUnit('fighter', 'Mexico Sea Zone', unitDefs);
  check('first fighter loads onto CV', f1.success === true);
  check('second fighter loads onto CV', f2.success === true);
  const carrier = (gs.units['Mexico Sea Zone'] || []).find((u) => u.type === 'carrier');
  check('both fighters sit on the carrier, not as loose SZ air',
    carrier?.aircraft?.length === 2
    && !(gs.units['Mexico Sea Zone'] || []).some((u) => u.type === 'fighter'));
  check('no fighter pending left',
    !(gs.pendingPurchases || []).some((p) => p.type === 'fighter' && p.quantity > 0));
  const f3 = gs.mobilizeUnit('fighter', 'Mexico Sea Zone', unitDefs);
  check('capacity 2 rejects a third fighter', f3.success === false);

  const undo2 = gs.undoMobilization(unitDefs);
  check('undo unloads last fighter',
    undo2.success === true && carrier.aircraft.length === 1);
  check('undone fighter returns to pending',
    gs.pendingPurchases.find((p) => p.type === 'fighter')?.quantity === 1);
}

console.log('=== 9.20.26.07 factory land still works ===');
{
  const gs = makeTheater();
  const land = gs.mobilizeUnit('fighter', 'Mexico', unitDefs);
  check('fighter still places at factory land', land.success === true);
  check('land fighter is a territory stack, not carrier cargo',
    (gs.units.Mexico || []).some((u) => u.type === 'fighter' && u.quantity === 1));
}

console.log('=== 9.20.26.07 Experimental dests + sea-first Confirm ===');
{
  const gs = makeTheater();
  const play = createSoloPlay(gs, unitDefs);
  play.selectedUnits = { fighter: 2 };
  check('air-only dests are factory land before a CV exists',
    legalPlaceDests(play).includes('Mexico')
    && !legalPlaceDests(play).includes('Mexico Sea Zone'));
  gs.mobilizeUnit('carrier', 'Mexico Sea Zone', unitDefs);
  play.selectedUnits = { fighter: 2 };
  const dests = legalPlaceDests(play);
  check('Experimental legalPlaceDests adds SZ after CV',
    dests.includes('Mexico Sea Zone') && dests.includes('Mexico'));
  play.destPicked = 'Mexico Sea Zone';
  play.selectedUnits = { fighter: 2 };
  confirm(play);
  const carrier = (gs.units['Mexico Sea Zone'] || []).find((u) => u.type === 'carrier');
  check('Experimental Confirm loads both fighters onto CV',
    carrier?.aircraft?.length === 2);
}

{
  const gs = makeTheater();
  const play = createSoloPlay(gs, unitDefs);
  play.destPicked = 'Mexico Sea Zone';
  play.selectedUnits = { fighter: 2, carrier: 1 };
  const order = seaFirstUnitEntries(play.selectedUnits, unitDefs).map(([t]) => t);
  check('sea-first puts carrier ahead of fighter',
    order[0] === 'carrier' && order.includes('fighter'));
  confirm(play);
  const carrier = (gs.units['Mexico Sea Zone'] || []).find((u) => u.type === 'carrier');
  check('same Confirm places CV then both FTR',
    carrier && carrier.aircraft?.length === 2
    && !(gs.pendingPurchases || []).some((p) => p.quantity > 0 && p.owner === 'usa'));
}

console.log('=== 9.20.26.07 Classic + Experimental chrome wiring ===');
{
  const panel = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  const three = readFileSync(join(root, 'src/map/threeSoloPlay.js'), 'utf8');
  const place = readFileSync(join(root, 'src/ui/placementUI.js'), 'utf8');
  const mob = readFileSync(join(root, 'src/ui/mobilizeUI.js'), 'utf8');
  check('Classic playerPanel imports canPlaceAirOnCarrierInSeaZone',
    panel.includes('canPlaceAirOnCarrierInSeaZone'));
  check('Classic water mobilize uses pendingAirCanLoadInSeaZone',
    panel.includes('pendingAirCanLoadInSeaZone'));
  check('Classic staged mobilize is sea-first',
    panel.includes('seaFirstUnitTypes'));
  check('Experimental legalPlaceDests uses shared canPlace',
    three.includes('canPlaceAirOnCarrierInSeaZone')
    && three.includes('requireFactoryAdjacent: true'));
  check('Experimental placePending / setup Confirm are sea-first',
    three.includes('seaFirstUnitEntries'));
  check('Classic placementUI still allows air on carrier in SZ',
    place.includes('Air units can be placed if there\'s a carrier with capacity'));
  check('legacy mobilizeUI filters air onto SZ carriers',
    mob.includes('canPlaceAirOnCarrierInSeaZone'));
  const gs = makeTheater();
  gs.units['Mexico Sea Zone'] = [{
    type: 'carrier', owner: 'usa', quantity: 1, aircraft: [],
  }];
  check('pendingAirCanLoadInSeaZone true when CV already in SZ',
    pendingAirCanLoadInSeaZone(
      gs,
      'Mexico Sea Zone',
      gs.pendingPurchases,
      'usa',
      unitDefs,
    ) === true);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll dual-path.9/.10 mobilize-carrier checks passed');
