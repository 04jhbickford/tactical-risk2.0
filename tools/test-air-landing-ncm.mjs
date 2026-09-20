// V2.81.53: post-combat air landings persist; NCM Done stays clickable
// at 0 remaining (overlay leftover + transport move).
// Run: node tools/test-air-landing-ncm.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  applyAirLandingPlan,
  buildLandingPlan,
  resolveLandingDestination,
  remainingAirLandingsToAssign,
  mergeLandingSelections,
  shouldOfferEndPhaseDuringMove,
  shouldDisableEndPhaseForCombat,
  selectedMoveCount,
  upsertPendingAirLanding,
} = await import(pathToFileURL(join(root, 'src/state/airLanding.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true, movement: 1 },
  fighter: { isAir: true, movement: 4 },
  transport: { isSea: true, movement: 2, canCarry: ['infantry'] },
  carrier: { isSea: true, movement: 2, aircraftCapacity: 2, canCarry: ['fighter'] },
};

function makePlayingState() {
  const territories = [
    { name: 'Eastern United States', isWater: false, connections: ['West Indies', 'Inland Sea'] },
    { name: 'West Indies', isWater: false, connections: ['Eastern United States', 'Inland Sea'] },
    { name: 'Inland Sea', isWater: true, connections: ['Eastern United States', 'West Indies'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'usa', name: 'Robert', oderId: 'robert' }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.territoryState = {
    'Eastern United States': { owner: 'usa' },
    'West Indies': { owner: 'usa' },
    'Inland Sea': { owner: null },
  };
  gs.playerState = { usa: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'Eastern United States' } };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Eastern United States']);
  gs.combatQueue = [];
  gs.units = {
    'West Indies': [
      { type: 'fighter', quantity: 2, owner: 'usa', moved: true },
      { type: 'infantry', quantity: 1, owner: 'usa', moved: true },
    ],
    'Eastern United States': [
      { type: 'infantry', quantity: 3, owner: 'usa' },
    ],
    'Inland Sea': [
      { type: 'transport', quantity: 1, owner: 'usa' },
    ],
  };
  return gs;
}

console.log('=== Version stamps ===');
check('GAME_VERSION is V2.81.57-dual-path.3', GAME_VERSION === 'V2.81.57-dual-path.3');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== landing key resolve (id / type_index / type) ===');
{
  const unit = { id: 'fighter_0', type: 'fighter', quantity: 1 };
  check('prefers unit id',
    resolveLandingDestination(unit, 0, { fighter_0: 'Eastern United States' }) === 'Eastern United States');
  check('falls back to type_index',
    resolveLandingDestination({ type: 'fighter' }, 1, { fighter_1: 'Eastern United States' }) === 'Eastern United States');
  check('falls back to type',
    resolveLandingDestination({ type: 'fighter' }, 0, { fighter: 'Eastern United States' }) === 'Eastern United States');
}

console.log('=== buildLandingPlan + applyAirLandingPlan ===');
{
  const units = {
    'West Indies': [{ type: 'fighter', quantity: 2, owner: 'usa', moved: true }],
    'Eastern United States': [{ type: 'infantry', quantity: 1, owner: 'usa' }],
  };
  const plan = buildLandingPlan(
    [
      { id: 'fighter_0', type: 'fighter', quantity: 1 },
      { id: 'fighter_1', type: 'fighter', quantity: 1 },
    ],
    { fighter_0: 'Eastern United States', fighter_1: 'Eastern United States' }
  );
  check('plan has both fighters', plan.length === 2);
  const applied = applyAirLandingPlan({
    units,
    territoryByName: {
      'West Indies': { isWater: false },
      'Eastern United States': { isWater: false },
    },
    originTerritory: 'West Indies',
    owner: 'usa',
    plan,
    unitDefs,
  });
  check('both aircraft left the battle hex',
    !(units['West Indies'] || []).some((u) => u.type === 'fighter'));
  const destAir = (units['Eastern United States'] || []).find((u) => u.type === 'fighter' && u.moved);
  check('both aircraft landed in Eastern US as a moved stack', destAir?.quantity === 2);
  check('unmoved Eastern US infantry were not marked moved',
    (units['Eastern United States'] || []).some((u) => u.type === 'infantry' && !u.moved));
  check('applied count is 2', applied.length === 2);
}

console.log('=== GameState.applyAirLandings + persist through loadFromJSON ===');
{
  const gs = makePlayingState();
  gs.recordAirLandingSelection({
    originTerritory: 'West Indies',
    id: 'fighter_0',
    type: 'fighter',
    destination: 'Eastern United States',
    notify: false,
  });
  gs.recordAirLandingSelection({
    originTerritory: 'West Indies',
    id: 'fighter_1',
    type: 'fighter',
    destination: 'Eastern United States',
    notify: false,
  });
  const snap = JSON.parse(JSON.stringify(gs.toJSON()));
  check('pendingAirLandings serialized',
    (snap.pendingAirLandings || []).some((e) => e.originTerritory === 'West Indies'));

  const result = gs.applyAirLandings('West Indies', {
    landings: { fighter_0: 'Eastern United States', fighter_1: 'Eastern United States' },
    airUnitsToLand: [
      { id: 'fighter_0', type: 'fighter', quantity: 1 },
      { id: 'fighter_1', type: 'fighter', quantity: 1 },
    ],
    unitDefs,
    notify: false,
  });
  check('apply reports success', result.success === true && result.applied.length === 2);
  check('board no longer has combat-hex fighters',
    !(gs.units['West Indies'] || []).some((u) => u.type === 'fighter'));
  check('Eastern US gained the landed fighters',
    (gs.units['Eastern United States'] || []).some((u) => u.type === 'fighter' && u.moved && u.quantity === 2));

  const reloaded = makePlayingState();
  reloaded.units = {
    'West Indies': [{ type: 'fighter', quantity: 2, owner: 'usa', moved: true }],
    'Eastern United States': [{ type: 'infantry', quantity: 3, owner: 'usa' }],
    'Inland Sea': [{ type: 'transport', quantity: 1, owner: 'usa' }],
  };
  reloaded.loadFromJSON({
    ...snap,
    units: {
      'West Indies': [{ type: 'fighter', quantity: 2, owner: 'usa', moved: true }],
      'Eastern United States': [{ type: 'infantry', quantity: 3, owner: 'usa' }],
      'Inland Sea': [{ type: 'transport', quantity: 1, owner: 'usa' }],
    },
  });
  check('reload keeps the named landings (does not wipe pending)',
    (reloaded.pendingAirLandings || []).some((e) =>
      (e.units || []).some((u) => u.destination === 'Eastern United States')));
  const replay = reloaded.applyPendingAirLandings({ unitDefs, notify: false });
  check('reload + applyPending lands them',
    replay.applied.length === 2
    && !(reloaded.units['West Indies'] || []).some((u) => u.type === 'fighter')
    && (reloaded.units['Eastern United States'] || []).some((u) => u.type === 'fighter' && u.moved));
}

console.log('=== nextPhase COMBAT → NCM applies named landings ===');
{
  const gs = makePlayingState();
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.combatQueue = [];
  gs.recordAirLandingSelection({
    originTerritory: 'West Indies',
    id: 'fighter_0',
    type: 'fighter',
    destination: 'Eastern United States',
    notify: false,
  });
  gs.recordAirLandingSelection({
    originTerritory: 'West Indies',
    id: 'fighter_1',
    type: 'fighter',
    destination: 'Eastern United States',
    notify: false,
  });
  gs.nextPhase();
  check('advanced to non-combat move', gs.turnPhase === TURN_PHASES.NON_COMBAT_MOVE);
  check('NCM entry landed the selected aircraft',
    !(gs.units['West Indies'] || []).some((u) => u.type === 'fighter')
    && (gs.units['Eastern United States'] || []).some((u) => u.type === 'fighter' && u.moved));
}

console.log('=== remaining count + Done at 0 remaining ===');
{
  const twoFighters = [
    { id: 'fighter_0', type: 'fighter', quantity: 1, landingOptions: [{ territory: 'Eastern United States' }] },
    { id: 'fighter_1', type: 'fighter', quantity: 1, landingOptions: [{ territory: 'Eastern United States' }] },
  ];
  check('2 remaining when nothing named',
    remainingAirLandingsToAssign(twoFighters, {}) === 2);
  check('type key counts for both aircraft (generous)',
    remainingAirLandingsToAssign(twoFighters, { fighter: 'Eastern United States' }) === 0);
  check('pending dests merge into remaining',
    remainingAirLandingsToAssign(
      twoFighters,
      mergeLandingSelections({}, [
        { id: 'fighter_0', type: 'fighter', destination: 'Eastern United States' },
        { id: 'fighter_1', type: 'fighter', destination: 'Eastern United States' },
      ])
    ) === 0);
  check('no-option aircraft do not block remaining',
    remainingAirLandingsToAssign(
      [{ type: 'fighter', landingOptions: [] }],
      {}
    ) === 0);
  check('overlay + unnamed dests hide End Phase',
    shouldOfferEndPhaseDuringMove({
      airLandingActive: true,
      airLandingsRemaining: 2,
      selectedMoveCount: 0,
    }) === false);
  check('overlay omitted remaining still hides End Phase',
    shouldOfferEndPhaseDuringMove({ airLandingActive: true, selectedMoveCount: 0 }) === false);
  check('0 / 2 remaining overlay still offers Done',
    shouldOfferEndPhaseDuringMove({
      airLandingActive: true,
      airLandingsRemaining: 0,
      movePendingDest: 'Inland Sea',
      selectedMoveCount: 0,
    }) === true);
  check('combat queue does not grey Done when landings are ready',
    shouldDisableEndPhaseForCombat({ hasCombatQueue: true, airLandingReady: true }) === false);
  check('combat queue greys Done while landings remain',
    shouldDisableEndPhaseForCombat({ hasCombatQueue: true, airLandingReady: false }) === true);
}

console.log('=== NCM Done is not stolen by a ghost destination ===');
{
  check('no dest → offer End Phase',
    shouldOfferEndPhaseDuringMove({ movePendingDest: null, selectedMoveCount: 0 }) === true);
  check('transport already moved (dest leftover, 0 selected) → offer End Phase',
    shouldOfferEndPhaseDuringMove({
      movePendingDest: 'Inland Sea',
      selectedMoveCount: 0,
    }) === true);
  check('legal pending move (dest + units) hides End Phase for Confirm',
    shouldOfferEndPhaseDuringMove({
      movePendingDest: 'Inland Sea',
      selectedMoveCount: 1,
    }) === false);
  check('selectedMoveCount reads ship keys',
    selectedMoveCount({ 'ship:t1': 1, transport: 0 }) === 1);
  check('upsert keeps one row per aircraft',
    upsertPendingAirLanding([], {
      originTerritory: 'West Indies', id: 'fighter_0', type: 'fighter',
    }).length === 1);
}

console.log('=== nextPhase from NCM applies leftover named landings ===');
{
  const gs = makePlayingState();
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  gs.combatQueue = [];
  gs.pendingPurchases = [{ type: 'infantry', quantity: 1, owner: 'usa', cost: 3 }];
  gs.recordAirLandingSelection({
    originTerritory: 'West Indies',
    id: 'fighter_0',
    type: 'fighter',
    destination: 'Eastern United States',
    notify: false,
  });
  gs.recordAirLandingSelection({
    originTerritory: 'West Indies',
    id: 'fighter_1',
    type: 'fighter',
    destination: 'Eastern United States',
    notify: false,
  });
  gs.nextPhase();
  check('advanced to mobilize', gs.turnPhase === TURN_PHASES.MOBILIZE);
  check('NCM Done landed leftover aircraft',
    !(gs.units['West Indies'] || []).some((u) => u.type === 'fighter')
    && (gs.units['Eastern United States'] || []).some((u) => u.type === 'fighter' && u.moved));
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll air-landing / NCM Done checks passed');
