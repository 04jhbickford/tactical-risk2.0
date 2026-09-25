// dual-path.10 Experimental fork smoke (threeSoloPlay).
// Run: node tools/test-dual-path-9-experimental.mjs

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
  createSoloPlay,
  enterCombat,
  legalDests,
  eligibleStacks,
  tapLand,
  adjustUnit,
  adjustLanding,
  canUndo,
  undoLast,
  confirm,
  chromeModel,
} = await import(pathToFileURL(join(root, 'src/map/threeSoloPlay.js')));
const { maxMoveSelection } = await import(pathToFileURL(join(root, 'src/state/combatMoveEligibility.js')));

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

function makeTheater() {
  const territories = [
    { name: 'Mexico', isWater: false, connections: ['West US'] },
    { name: 'West US', isWater: false, connections: ['Mexico', 'East US'] },
    { name: 'East US', isWater: false, connections: ['West US'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'usa', name: 'USA' },
    { id: 'germans', name: 'Germans' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.territoryState = {
    Mexico: { owner: 'usa' },
    'West US': { owner: 'germans' },
    'East US': { owner: 'usa' },
  };
  gs.playerState = {
    usa: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'East US' },
    germans: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'East US' },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Mexico', 'East US']);
  gs.capturedThisTurn = new Set();
  gs.conqueredThisTurn = {};
  gs.combatQueue = [];
  gs.units = {
    Mexico: [{ type: 'infantry', owner: 'usa', quantity: 3 }],
    'West US': [{ type: 'infantry', owner: 'germans', quantity: 1 }],
    'East US': [{ type: 'infantry', owner: 'usa', quantity: 2 }],
  };
  gs.getAirLandingOptions = (origin, type) => {
    void type;
    if (origin === 'West US') {
      return [
        { territory: 'Mexico', distance: 1 },
        { territory: 'East US', distance: 1 },
      ];
    }
    return [];
  };
  return gs;
}

console.log('=== stamp ===');
check('GAME_VERSION is V2.81.57-unified.14.1', GAME_VERSION === 'V2.81.57-unified.14.1');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== .02 Experimental applyHits / dequeue land-hold ===');
{
  const gs = makeTheater();
  gs.units['West US'] = [{ type: 'infantry', owner: 'usa', quantity: 2 }];
  gs.combatQueue = ['West US'];
  const play = createSoloPlay(gs, unitDefs);
  gs._unitDefs = unitDefs;
  enterCombat(play);
  check('dequeue/_detectCombats flipped West US owner', gs.getOwner('West US') === 'usa');
  check('capturedThisTurn has West US', gs.capturedThisTurn.has('West US'));
  check('queue emptied', gs.combatQueue.length === 0);
}

{
  const gs = makeTheater();
  gs.units['West US'] = [{ type: 'fighter', owner: 'usa', quantity: 2 }];
  gs.combatQueue = ['West US'];
  const play = createSoloPlay(gs, unitDefs);
  enterCombat(play);
  check('air-only leftover does not flip (hasLand gate)', gs.getOwner('West US') === 'germans');
}

console.log('=== .03 Experimental movableStacks / legalDests / All ===');
{
  const gs = makeTheater();
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.units.Mexico = [
    { type: 'infantry', owner: 'usa', quantity: 3 },
    { type: 'fighter', owner: 'usa', quantity: 1 },
  ];
  const play = createSoloPlay(gs, unitDefs);
  play.selected = 'Mexico';
  const stacks = eligibleStacks(play, 'Mexico');
  play.selectedUnits = maxMoveSelection(stacks);
  check('All takes every Mexico stack',
    play.selectedUnits.infantry === 3 && play.selectedUnits.fighter === 1);
  play.destPicked = 'West US';
  check('Mexico can attack West US', legalDests(play).includes('West US'));
}

console.log('=== .05 / .06 Experimental air land per-plane + Undo ===');
{
  const gs = makeTheater();
  gs.units['West US'] = [
    { type: 'infantry', owner: 'usa', quantity: 1 },
    { type: 'fighter', owner: 'usa', quantity: 2 },
  ];
  gs.territoryState['West US'] = { owner: 'usa' };
  const play = createSoloPlay(gs, unitDefs);
  play.battle = { dest: 'West US', step: 'won', failed: false, log: [] };
  confirm(play);
  check('startAirLand expands two planes',
    play.landing && Number(play.landing.airLeft?.fighter) === 2);
  check('pending air has unique ids',
    (gs.pendingAirLandings?.[0]?.units || []).every((u) => u.id && u.id !== 'fighter'));
  tapLand(play, 'Mexico');
  adjustLanding(play, 'fighter', 1);
  check('one fighter picked for Mexico', Number(play.landing.pick.fighter) === 1);
  const model = chromeModel(play);
  check('air-land All stepper is off', model.showAll === false);
  check('undo is live after a pick', canUndo(play) === true);
  undoLast(play);
  check('undo clears dest + pick', !play.landing.dest && !play.landing.pick.fighter);
  check('undo cleared pending dests',
    (gs.pendingAirLandings?.[0]?.units || []).every((u) => !u.destination));
}

console.log('=== .04 Experimental deploy chrome is a single Confirm ===');
{
  const gs = makeTheater();
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.turnPhase = TURN_PHASES.SETUP;
  gs.unitsToPlace = { usa: [{ type: 'infantry', quantity: 6 }] };
  const play = createSoloPlay(gs, unitDefs);
  const model = chromeModel(play);
  const labels = [model.confirmLabel, model.passLabel].filter(Boolean);
  check('one gold Confirm / Pass, not two Dones', labels.length <= 2);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll dual-path.10 Experimental fork checks passed');
