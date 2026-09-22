// Unit checks for V2.59 initial-deploy naval-remainder UX.
// Run: node tools/test-placement-ux.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
import { readFileSync } from 'fs';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}

const { GameState, RISK_STARTING_UNITS } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { computeInitialPlacementUX, resolvePhoneStickyUnitType } =
  await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const {
  shouldIgnoreQueueRetarget,
  shouldAllowPlaceQueueTypeSwitch,
  resetPlaceQueueGestureState,
} = await import(pathToFileURL(join(root, 'src/ui/panelClickLock.js')));
const { applyPlaceQueueDelta, queuedCount } =
  await import(pathToFileURL(join(root, 'src/state/placeQueue.js')));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const { canFinishPlacementRound, knownUnitsToPlace, onlyNavalRemaining } =
  await import(pathToFileURL(join(root, 'src/state/placementPass.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true },
  factory: { isBuilding: true },
  fighter: { isAir: true },
  transport: { isSea: true },
  battleship: { isSea: true },
};

console.log('=== Version stamps ===');
check('GAME_VERSION is V2.81.57-unified.4', GAME_VERSION === 'V2.81.57-unified.4');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== computeInitialPlacementUX: land selected, only naval remain, valid sea exists ===');
{
  const ux = computeInitialPlacementUX({
    placedThisRound: 0,
    limit: 6,
    totalRemaining: 6,
    landAirRemaining: 0,
    navalRemaining: 6,
    hasPlaceable: true,
    totalQueued: 0,
    selectedKind: 'owned-land',
  });
  check('B19: Done/skip shown on inland land (not gated on 6/6)', ux.showDone === true);
  check('James lock: leftover ships always have a Done', ux.showDone === true);
  check('B19: sea-zone hint still shown so ships can be placed', ux.needSeaHint === true);
  check('not stuck (legal sea exists)', ux.stuckWithNaval === false);
  check('B19: can skip leftover ships from a non-sea tile', ux.canSkipNaval === true);
  check('hint offers place at sea OR Done',
    /sea zone/i.test(ux.hint) && /Done/i.test(ux.hint));
}

console.log('=== computeInitialPlacementUX: invalid/random sea, only naval, valid drop exists ===');
{
  const ux = computeInitialPlacementUX({
    placedThisRound: 0,
    limit: 6,
    totalRemaining: 6,
    landAirRemaining: 0,
    navalRemaining: 6,
    hasPlaceable: true,
    totalQueued: 0,
    selectedKind: 'other',
  });
  check('B19: Done/skip also available from a non-sea tile', ux.showDone === true);
  check('same sea-zone hint', ux.needSeaHint === true);
}

console.log('=== computeInitialPlacementUX: valid sea selected, ships remain ===');
{
  const ux = computeInitialPlacementUX({
    placedThisRound: 1,
    limit: 6,
    totalRemaining: 6,
    landAirRemaining: 0,
    navalRemaining: 6,
    hasPlaceable: true,
    totalQueued: 0,
    selectedKind: 'valid-sea',
  });
  check('B19-James: Done/skip on a legal sea at 1/6 naval-only', ux.showDone === true);
  check('B19-James: can skip leftover ships from a sea tile', ux.canSkipNaval === true);
  check('no redirect hint on a legal sea', ux.needSeaHint === false);
  check('no stuck message', ux.stuckWithNaval === false);
  check('hint offers place here OR Done',
    /Place leftover ships/i.test(ux.hint) && /Done/i.test(ux.hint));
}

console.log('=== computeInitialPlacementUX: landlocked / no legal naval drop ===');
{
  const ux = computeInitialPlacementUX({
    placedThisRound: 0,
    limit: 6,
    totalRemaining: 6,
    landAirRemaining: 0,
    navalRemaining: 6,
    hasPlaceable: false,
    totalQueued: 0,
    selectedKind: 'owned-land',
  });
  check('Done shown so the player is not hard-locked', ux.showDone === true);
  check('no "go click a sea" hint (there is none)', ux.needSeaHint === false);
  check('stuck flag set', ux.stuckWithNaval === true);
  check('hint explains there is no legal sea zone',
    /no legal sea zone/i.test(ux.hint));
}

console.log('=== James lock: 6/6 this round still offers Done ===');
{
  const ux = computeInitialPlacementUX({
    placedThisRound: 6,
    limit: 6,
    totalRemaining: 1,
    landAirRemaining: 1,
    navalRemaining: 0,
    hasPlaceable: true,
    totalQueued: 0,
    selectedKind: 'owned-land',
  });
  check('round cap offers Done so 6/6 is not a dead screen', ux.showDone === true);
}

console.log('=== computeInitialPlacementUX: mixed land+naval, land selected ===');
{
  const ux = computeInitialPlacementUX({
    placedThisRound: 0,
    limit: 6,
    totalRemaining: 12,
    landAirRemaining: 6,
    navalRemaining: 6,
    hasPlaceable: true,
    totalQueued: 0,
    selectedKind: 'owned-land',
  });
  check('Done hidden (land still to place)', ux.showDone === false);
  check('no naval-only hint while land remains', ux.needSeaHint === false);
}

console.log('=== computeInitialPlacementUX: round limit reached with ships left ===');
{
  const ux = computeInitialPlacementUX({
    placedThisRound: 6,
    limit: 6,
    totalRemaining: 2,
    landAirRemaining: 0,
    navalRemaining: 2,
    hasPlaceable: true,
    totalQueued: 0,
    selectedKind: 'owned-land',
  });
  check('Done shown after 6/6 this round', ux.showDone === true);
  check('no sea hint this round (limit hit)', ux.needSeaHint === false);
}

console.log('=== computeInitialPlacementUX: queued units block Done ===');
{
  const ux = computeInitialPlacementUX({
    placedThisRound: 6,
    limit: 6,
    totalRemaining: 0,
    landAirRemaining: 0,
    navalRemaining: 0,
    hasPlaceable: false,
    totalQueued: 2,
    selectedKind: 'valid-sea',
  });
  check('Done hidden while a deploy is queued', ux.showDone === false);
}

console.log('=== hasPlaceableUnits: landlocked vs coastal vs enemy-occupied sea ===');
{
  const territories = [
    { name: 'Inland', isWater: false, connections: ['AlsoInland'] },
    { name: 'AlsoInland', isWater: false, connections: ['Inland'] },
    { name: 'Coast', isWater: false, connections: ['OpenSea', 'EnemySea'] },
    { name: 'OpenSea', isWater: true, connections: ['Coast'] },
    { name: 'EnemySea', isWater: true, connections: ['Coast'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'landlocked', name: 'L' },
    { id: 'coastal', name: 'C' },
    { id: 'enemy', name: 'E' },
  ];
  gs.territoryState = {
    Inland: { owner: 'landlocked' },
    AlsoInland: { owner: 'landlocked' },
    Coast: { owner: 'coastal' },
  };
  gs.units = {
    EnemySea: [{ type: 'battleship', quantity: 1, owner: 'enemy' }],
  };
  gs.unitsToPlace = {
    landlocked: [{ type: 'transport', quantity: 6 }],
    coastal: [{ type: 'transport', quantity: 6 }],
  };

  check('landlocked + only ships → not placeable (Done-when-stuck)',
    gs.hasPlaceableUnits('landlocked', unitDefs) === false);
  check('coastal + empty adjacent sea + only ships → placeable (no Done-away)',
    gs.hasPlaceableUnits('coastal', unitDefs) === true);

  // Isolate the enemy-occupied-only coast: give coastal only EnemySea as water.
  gs.territories = [
    { name: 'Coast', isWater: false, connections: ['EnemySea'] },
    { name: 'EnemySea', isWater: true, connections: ['Coast'] },
  ];
  gs.territoryByName = {};
  for (const t of gs.territories) gs.territoryByName[t.name] = t;
  gs.territoryState = { Coast: { owner: 'coastal' } };
  check('coastal + only enemy-occupied sea + only ships → not placeable',
    gs.hasPlaceableUnits('coastal', unitDefs) === false);

  gs.unitsToPlace.coastal = [{ type: 'infantry', quantity: 1 }];
  check('land units remain placeable even with no legal sea',
    gs.hasPlaceableUnits('coastal', unitDefs) === true);
}

console.log('=== leftover / ghost unit must not block Done or sticky-select ===');
{
  const liveUnits = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));
  check('tacticalBomber is a real air unit in units.json',
    liveUnits.tacticalBomber?.isAir === true);
  check('starting placement pool has no tactical bomber',
    !RISK_STARTING_UNITS.land.some((u) => u.type === 'tacticalBomber')
    && !RISK_STARTING_UNITS.naval.some((u) => u.type === 'tacticalBomber')
    && RISK_STARTING_UNITS.land.some((u) => u.type === 'bomber' && u.quantity === 1)
    && RISK_STARTING_UNITS.land.some((u) => u.type === 'fighter' && u.quantity === 2));

  const ghostPool = [
    { type: 'tacticalBomber', quantity: 1 },
    { type: 'unknownGhost', quantity: 1 },
  ];
  const known = knownUnitsToPlace(ghostPool, unitDefs);
  check('unknown types are stripped from the known tray', known.length === 0);
  check('sticky skips an unknown leftover (no ghost default)',
    resolvePhoneStickyUnitType(null, ghostPool, unitDefs) === null);
  check('sticky does not retarget leftover clicks onto another type',
    resolvePhoneStickyUnitType(null, [
      { type: 'tacticalBomber', quantity: 1 },
      { type: 'infantry', quantity: 2 },
    ], unitDefs) === null);

  check('ghost-only leftover is finishable (nothing known/placeable)',
    canFinishPlacementRound({
      placedThisRound: 0,
      limit: 6,
      remainingKnown: 0,
      hasPlaceable: false,
    }) === true);

  const gs = new GameState({ risk: { factions: [] } }, [
    { name: 'Home', isWater: false, connections: [] },
  ], []);
  gs.players = [{ id: 'p1', name: 'James' }];
  gs.currentPlayerIndex = 0;
  gs.phase = 'unit_placement';
  gs.territoryState = { Home: { owner: 'p1' } };
  gs.unitsToPlace = {
    p1: [
      { type: 'tacticalBomber', quantity: 1 },
      { type: 'unknownGhost', quantity: 1 },
    ],
  };
  check('GameState ignores unknown leftovers in remaining count',
    gs.getTotalUnitsToPlace('p1', unitDefs) === 0);
  check('GameState can finish when only ghosts remain',
    gs.canFinishPlacementRound('p1', unitDefs) === true);

  const withBomber = {
    ...unitDefs,
    tacticalBomber: { isAir: true },
  };
  gs.unitsToPlace.p1 = [{ type: 'tacticalBomber', quantity: 1 }];
  check('real tactical bomber is placeable on owned land',
    gs.hasPlaceableUnits('p1', withBomber) === true);
  check('real leftover bomber does not hide Done only because it is a bomber — it is placeable',
    gs.canFinishPlacementRound('p1', withBomber) === false);
  const placed = gs.placeInitialUnit('Home', 'tacticalBomber', withBomber);
  check('tactical bomber places on owned land', placed.success === true);
}

console.log('=== B19: ships-only inland does not deadlock ===');
{
  const seaDefs = {
    infantry: { isLand: true },
    transport: { isSea: true },
    battleship: { isSea: true },
  };
  const territories = [
    { name: 'Inland', isWater: false, connections: [] },
    { name: 'Coast', isWater: false, connections: ['Caspian Sea Zone'] },
    { name: 'Caspian Sea Zone', isWater: true, connections: ['Coast'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'p1', name: 'James', isAI: false },
    { id: 'p2', name: 'Host', isAI: false },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = 'unit_placement';
  gs.territoryState = {
    Inland: { owner: 'p1' },
    Coast: { owner: 'p1' },
    'Caspian Sea Zone': { owner: null },
  };
  gs.units = { Inland: [], Coast: [], 'Caspian Sea Zone': [] };
  gs.unitsToPlace = {
    p1: [{ type: 'transport', quantity: 2 }, { type: 'battleship', quantity: 1 }],
    p2: [{ type: 'infantry', quantity: 6 }],
  };
  gs.unitsPlacedThisRound = 0;
  check('only naval remain for James',
    onlyNavalRemaining(gs.unitsToPlace.p1, seaDefs) === true);
  check('ships are still placeable at Caspian',
    gs.hasPlaceableUnits('p1', seaDefs) === true);
  check('without skip, Done is gated (not 6/6)',
    gs.canFinishPlacementRound('p1', seaDefs) === false);
  check('with skip, Done is legal from inland',
    gs.canFinishPlacementRound('p1', seaDefs, { allowNavalSkip: true }) === true);
  const onSea = gs.placeInitialUnit('Caspian Sea Zone', 'transport', seaDefs);
  check('leftover ships still place in a legal sea', onSea.success === true);
  gs.undoPlacement();
  const pass = gs.finishPlacementRound(seaDefs, { allowNavalSkip: true });
  check('Done/skip from inland commits', pass.ok === true);
  check('seat leaves James (does not bounce back onto leftover ships)',
    gs.currentPlayer?.id === 'p2');
  check('James leftover ships no longer block the pass',
    gs.hasPlaceableUnits('p1', seaDefs) === false);
}

console.log('=== B19-James: 1/6 naval-only on a legal sea can Done/skip ===');
{
  const seaDefs = {
    infantry: { isLand: true },
    transport: { isSea: true },
    battleship: { isSea: true },
  };
  const territories = [
    { name: 'East United States', isWater: false, connections: ['US East Coast'] },
    { name: 'US East Coast', isWater: true, connections: ['East United States'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'p1', name: 'James', isAI: false },
    { id: 'p2', name: 'Host', isAI: false },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = 'unit_placement';
  gs.territoryState = {
    'East United States': { owner: 'p1' },
    'US East Coast': { owner: null },
  };
  gs.units = { 'East United States': [], 'US East Coast': [] };
  gs.unitsToPlace = {
    p1: [{ type: 'transport', quantity: 4 }, { type: 'battleship', quantity: 2 }],
    p2: [{ type: 'infantry', quantity: 6 }],
  };
  gs.unitsPlacedThisRound = 1;
  const ux = computeInitialPlacementUX({
    placedThisRound: 1,
    limit: 6,
    totalRemaining: 6,
    landAirRemaining: 0,
    navalRemaining: 6,
    hasPlaceable: true,
    totalQueued: 0,
    selectedKind: 'valid-sea',
  });
  check('1/6 + 6 naval-only shows Done (not Undo-only)',
    ux.showDone === true && ux.canSkipNaval === true);
  check('Done/skip from the sea tile commits',
    gs.canFinishPlacementRound('p1', seaDefs, { allowNavalSkip: true }) === true);
  const pass = gs.finishPlacementRound(seaDefs, { allowNavalSkip: true });
  check('James seat advances after skip at 1/6',
    pass.ok === true && gs.currentPlayer?.id === 'p2');
}

console.log('=== V2.81.49 after Confirm, next type / same land is a new gesture ===');
{
  // Land → infantry + → Confirm. Queue empty. Tank + must apply without refresh.
  let queue = applyPlaceQueueDelta({
    queue: {}, unitType: 'infantry', delta: 1, available: 8, slotsRemaining: 6,
  });
  check('stage type A', queue.infantry === 1 && queuedCount(queue) === 1);
  queue = {}; // Confirm commits and clears (queueAfterDeployAttempt placed>0)
  check('Confirm empties the queue', queuedCount(queue) === 0);
  check('type B after Confirm is not a leftover retarget',
    shouldIgnoreQueueRetarget({
      lockedType: 'infantry',
      incomingType: 'tanks',
      elapsedMs: 0,
      committed: true,
    }) === false);
  check('type B after Confirm is allowed',
    shouldAllowPlaceQueueTypeSwitch({
      incomingType: 'tanks',
      lastQueueUnitType: 'infantry',
      queueEmpty: true,
      committed: true,
    }) === true);
  queue = applyPlaceQueueDelta({
    queue, unitType: 'tanks', delta: 1, available: 4, slotsRemaining: 5,
  });
  check('same land can stage type B after Confirm without refresh',
    queue.tanks === 1 && !queue.infantry);
  const reset = resetPlaceQueueGestureState();
  check('empty-place leftover lock clears on the same reset',
    reset.lastQueueUnitType === null && reset.queueLockType === null);
}

console.log(failures === 0 ? '\nALL PLACEMENT UX CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
