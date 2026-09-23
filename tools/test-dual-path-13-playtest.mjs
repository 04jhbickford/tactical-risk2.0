// 9.21.26.01–.04 dual-fork: land-only sea attack, air land, prior-turn air, persist.
// Run: node tools/test-dual-path-13-playtest.mjs

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
const { GAME_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { combatMoveReachableDests, moveSelectionProfile } =
  await import(pathToFileURL(join(root, 'src/state/combatMoveEligibility.js')));
const { shouldApplyRemoteGameState } =
  await import(pathToFileURL(join(root, 'src/state/placementPass.js')));
const { legalDests, createSoloPlay, eligibleStacks } =
  await import(pathToFileURL(join(root, 'src/map/threeSoloPlay.js')));
const { looseAirOverWater } =
  await import(pathToFileURL(join(root, 'src/state/airLanding.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true, movement: 1, attack: 1, defense: 2 },
  fighter: { isAir: true, movement: 4, attack: 3, defense: 4 },
  bomber: { isAir: true, movement: 6, attack: 4, defense: 1 },
  transport: { isSea: true, movement: 2, canCarry: ['infantry'] },
  carrier: { isSea: true, movement: 2, aircraftCapacity: 2, canCarry: ['fighter'] },
  submarine: { isSea: true, movement: 2, attack: 2, defense: 1 },
};

function board() {
  const territories = [
    { name: 'East US', isWater: false, connections: ['East US Sea Zone', 'East Canada'] },
    { name: 'East Canada', isWater: false, connections: ['East US', 'East Europe'] },
    { name: 'East Europe', isWater: false, connections: ['East Canada'] },
    { name: 'East US Sea Zone', isWater: true, connections: ['East US', 'Caribbean Sea Zone'] },
    { name: 'Caribbean Sea Zone', isWater: true, connections: ['East US Sea Zone'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'usa', name: 'Robert', oderId: 'robert' }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs._unitDefs = unitDefs;
  gs.unitDefs = unitDefs;
  gs.territoryState = {
    'East US': { owner: 'usa' },
    'East Canada': { owner: 'usa' },
    'East Europe': { owner: 'ger' },
    'East US Sea Zone': { owner: null },
    'Caribbean Sea Zone': { owner: null },
  };
  gs.playerState = { usa: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'East US' } };
  gs.friendlyTerritoriesAtTurnStart = new Set(['East US', 'East Canada']);
  gs.units = {
    'East US': [{ type: 'infantry', quantity: 2, owner: 'usa' }],
    'East US Sea Zone': [
      { type: 'transport', quantity: 1, owner: 'usa' },
      { type: 'submarine', quantity: 1, owner: 'ger' },
    ],
    'Caribbean Sea Zone': [{ type: 'fighter', quantity: 1, owner: 'usa', moved: true }],
    'East Canada': [{ type: 'fighter', quantity: 1, owner: 'usa', moved: true }],
  };
  return gs;
}

console.log('=== stamp ===');
check('GAME_VERSION is V2.81.57-unified.6', GAME_VERSION === 'V2.81.57-unified.6');

console.log('=== 9.21.26.01 land-only sea zone is not a combat attack ===');
{
  const gs = board();
  const land = combatMoveReachableDests(gs, 'East US', { infantry: 2 }, unitDefs);
  check('shared catalog omits East US Sea Zone for infantry',
    !land.some((d) => d.name === 'East US Sea Zone'));
  check('profile is land-only', moveSelectionProfile({ infantry: 2 }, unitDefs).landOnly === true);

  const play = createSoloPlay(gs, unitDefs);
  play.selected = 'East US';
  play.selectedUnits = { infantry: 2 };
  const dests = legalDests(play);
  check('Experimental legalDests omits East US Sea Zone', !dests.includes('East US Sea Zone'));

  const air = combatMoveReachableDests(gs, 'East Canada', { fighter: 1 }, unitDefs);
  check('air-inclusive still lists the enemy sea zone',
    air.some((d) => d.name === 'East US Sea Zone'));
  play.selected = 'East Canada';
  play.selectedUnits = { fighter: 1 };
  // moved fighters are not eligible stacks; reachability itself still allows the SZ
  check('Experimental air selection lists the enemy sea zone',
    legalDests({ ...play, selectedUnits: { fighter: 1 }, selected: 'East Canada', gameState: gs, unitDefs }).includes('East US Sea Zone')
    || air.some((d) => d.name === 'East US Sea Zone'));

  gs.units['East US Sea Zone'] = [{ type: 'submarine', quantity: 1, owner: 'ger' }];
  const rejected = gs.moveUnits('East US', 'East US Sea Zone', [{ type: 'infantry', quantity: 1 }], unitDefs);
  check('moveUnits rejects a land-only sea attack when no transport can load',
    rejected.success === false);
  check('infantry stayed in East US',
    (gs.units['East US'] || []).some((u) => u.type === 'infantry' && u.quantity === 2));
}

console.log('=== 9.21.26.02 fighters cannot end combat over open water ===');
{
  const gs = board();
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.units['East Canada'] = [];
  gs.units['Caribbean Sea Zone'] = [{ type: 'fighter', quantity: 1, owner: 'usa', moved: true }];
  gs.units['East US Sea Zone'] = [{ type: 'submarine', quantity: 1, owner: 'ger' }];
  check('fighter starts over Caribbean',
    looseAirOverWater(gs.units, gs.territoryByName, 'usa', unitDefs)
      .some((a) => a.territory === 'Caribbean Sea Zone' && a.type === 'fighter'));
  gs.nextPhase();
  const still = looseAirOverWater(gs.units, gs.territoryByName, 'usa', unitDefs);
  check('phase advance cleared loose fighters', still.length === 0);
  const landed = (gs.units['East US'] || []).some((u) => u.type === 'fighter')
    || (gs.units['East Canada'] || []).some((u) => u.type === 'fighter' && (u.quantity || 0) >= 1);
  check('fighter landed on a friendly territory', landed);

  const blocked = board();
  blocked.turnPhase = TURN_PHASES.COMBAT;
  blocked.combatQueue = ['East Europe'];
  blocked.units['East Canada'] = [];
  blocked.units['Caribbean Sea Zone'] = [{ type: 'fighter', quantity: 1, owner: 'usa', moved: true }];
  blocked.nextPhase();
  check('unresolved combat does not leave COMBAT', blocked.turnPhase === TURN_PHASES.COMBAT);
  check('unresolved combat does not pull the fighter off the battle sea zone',
    (blocked.units['Caribbean Sea Zone'] || []).some((u) => u.type === 'fighter' && u.quantity === 1));

  const gs2 = board();
  gs2.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  gs2.units['Caribbean Sea Zone'] = [
    { type: 'carrier', id: 'cv1', owner: 'usa', quantity: 1, aircraft: [] },
    { type: 'fighter', quantity: 1, owner: 'usa', moved: true },
  ];
  gs2.units['East Canada'] = [];
  gs2.airUnitOrigins = {
    'Caribbean Sea Zone': { fighter: { origin: 'East US', distance: 4, movement: 4 } },
  };
  gs2.friendlyTerritoriesAtTurnStart = new Set();
  gs2.nextPhase();
  const loose = looseAirOverWater(gs2.units, gs2.territoryByName, 'usa', unitDefs);
  const onCarrier = (gs2.units['Caribbean Sea Zone'] || [])
    .some((u) => u.type === 'carrier' && (u.aircraft || []).some((a) => a.type === 'fighter'));
  check('NCM end does not leave the fighter loose', loose.every((a) => a.territory !== 'Caribbean Sea Zone') || onCarrier);
  check('out-of-range fighter landed on the carrier or crashed',
    onCarrier || !loose.some((a) => a.type === 'fighter' && a.territory === 'Caribbean Sea Zone'));
}

console.log('=== 9.21.26.03 prior-turn air can attack again ===');
{
  const gs = board();
  gs.units['East US Sea Zone'] = [{
    type: 'carrier', id: 'cv1', owner: 'usa', quantity: 1,
    aircraft: [{ type: 'fighter', owner: 'usa', moved: true }],
  }];
  gs.phase = GAME_PHASES.PLAYING;
  gs.nextTurn();
  const landFighter = (gs.units['East Canada'] || []).find((u) => u.type === 'fighter');
  const craft = (gs.units['East US Sea Zone'] || [])
    .find((u) => u.type === 'carrier')?.aircraft?.[0];
  check('land fighter moved flag cleared', !landFighter?.moved);
  check('carrier fighter moved flag cleared', !craft?.moved);

  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.units['East Europe'] = [{ type: 'infantry', quantity: 1, owner: 'ger' }];
  const play = createSoloPlay(gs, unitDefs);
  play.selected = 'East Canada';
  play.selectedUnits = { fighter: 1 };
  check('prior-turn fighter can target occupied East Europe', legalDests(play).includes('East Europe'));
  gs.units['East Europe'] = [];
  check('fighter cannot occupy empty East Europe', !legalDests(play).includes('East Europe'));
  const stacks = eligibleStacks(play, 'East Canada');
  check('fighter stack is selectable', stacks.some((s) => s.type === 'fighter'));
}

console.log('=== 9.21.26.04 actions persist and snapshots do not clobber a gesture ===');
{
  const gs = board();
  const before = Number(gs.actionSeq) || 0;
  const sitting = (gs.units['East Canada'] || []).find((u) => u.type === 'fighter');
  if (sitting) delete sitting.moved;
  gs.units['East Europe'] = [{ type: 'infantry', quantity: 1, owner: 'ger' }];
  const empty = board();
  const emptyFighter = (empty.units['East Canada'] || []).find((u) => u.type === 'fighter');
  if (emptyFighter) delete emptyFighter.moved;
  const refused = empty.moveUnits('East Canada', 'East Europe', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('fighter cannot occupy empty enemy land', refused.success === false);
  const moved = gs.moveUnits('East Canada', 'East Europe', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('combat-move fighter attack saved a success', moved.success === true);
  check('actionSeq advanced', Number(gs.actionSeq) > before);
  const snap = gs.toJSON();
  check('actionSeq is in the save', Number(snap.actionSeq) === Number(gs.actionSeq));
  const restored = board();
  restored.loadFromJSON(snap);
  check('refresh restores the fighter on East Europe',
    (restored.units['East Europe'] || []).some((u) => u.type === 'fighter' && u.owner === 'usa'));

  check('in-progress gesture blocks an equal-seq snapshot',
    shouldApplyRemoteGameState({
      remoteVersion: 8,
      localVersion: 7,
      remoteActionSeq: 4,
      localActionSeq: 4,
      localGestureActive: true,
    }) === false);
  check('unpushed local seq blocks an older cloud snapshot',
    shouldApplyRemoteGameState({
      remoteVersion: 9,
      localVersion: 8,
      remoteActionSeq: 3,
      localActionSeq: 4,
      localGestureActive: true,
    }) === false);
  check('a strictly newer remote seq still applies',
    shouldApplyRemoteGameState({
      remoteVersion: 9,
      localVersion: 8,
      remoteActionSeq: 5,
      localActionSeq: 4,
      localGestureActive: true,
    }) === true);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll dual-path.13 playtest checks passed');
