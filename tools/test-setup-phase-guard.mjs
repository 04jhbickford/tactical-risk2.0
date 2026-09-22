// V2.74: setup must ignore playing turnPhase; nextTurn is PLAYING-only.
// Run: node tools/test-setup-phase-guard.mjs

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
const {
  GameState,
  GAME_PHASES,
  TURN_PHASES,
  SETUP_TURN_PHASE,
  shouldDrivePlayingTurnPhase,
  shouldShowTechResearch,
  shouldShowPurchase,
  shouldShowInitialDeployment,
  isSetupPhase,
} = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  shouldShowSpectatorWaiting,
  shouldShowPlaceUnitsUI,
  resolvePhaseHint,
  resolvePhonePeekHint,
} = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const {
  formatMobilePhaseLabel,
  shouldShowPhonePanelBody,
  shouldShowPhonePeekUnitRow,
} = await import(pathToFileURL(join(root, 'src/ui/mobileShell.js')));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true },
};

const ROBERT = 'sypRcamUvNXDlD7BRyJrYImZg5H2';

function makeSetupTable({
  phase = GAME_PHASES.UNIT_PLACEMENT,
  turnPhase = TURN_PHASES.DEVELOP_TECH,
  currentPlayerIndex = 0,
  unitsToPlace = null,
} = {}) {
  const players = [
    { id: 'p1', name: 'Robert007', oderId: ROBERT, isAI: false },
    { id: 'p2', name: 'Easy Bot', isAI: true, aiDifficulty: 'easy' },
    { id: 'p3', name: 'James', oderId: 'james-host-uid', isAI: false },
    { id: 'p4', name: 'Hard Bot', isAI: true, aiDifficulty: 'hard' },
  ];
  const territories = [
    { name: 'Home', isWater: false, connections: [] },
    { name: 'BotLand', isWater: false, connections: [] },
    { name: 'JamesLand', isWater: false, connections: [] },
    { name: 'HardLand', isWater: false, connections: [] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = players;
  gs.currentPlayerIndex = currentPlayerIndex;
  gs.round = 1;
  gs.phase = phase;
  gs.turnPhase = turnPhase;
  gs.placementRound = 2;
  gs.unitsPlacedThisRound = 0;
  gs.territoryState = {
    Home: { owner: 'p1' },
    BotLand: { owner: 'p2' },
    JamesLand: { owner: 'p3' },
    HardLand: { owner: 'p4' },
  };
  gs.playerState = {
    p1: { ipcs: 21, hasPlacedCapital: true, capitalTerritory: 'Home' },
    p2: { ipcs: 21, hasPlacedCapital: true, capitalTerritory: 'BotLand' },
    p3: { ipcs: 21, hasPlacedCapital: true, capitalTerritory: 'JamesLand' },
    p4: { ipcs: 21, hasPlacedCapital: true, capitalTerritory: 'HardLand' },
  };
  gs.units = {
    Home: [{ type: 'infantry', quantity: 1, owner: 'p1' }],
    BotLand: [{ type: 'infantry', quantity: 1, owner: 'p2' }],
    JamesLand: [{ type: 'infantry', quantity: 1, owner: 'p3' }],
    HardLand: [{ type: 'infantry', quantity: 1, owner: 'p4' }],
  };
  gs.unitsToPlace = unitsToPlace || {
    p1: [{ type: 'infantry', quantity: 6 }],
    p2: [{ type: 'infantry', quantity: 6 }],
    p3: [{ type: 'infantry', quantity: 6 }],
    p4: [{ type: 'infantry', quantity: 6 }],
  };
  return gs;
}

function presentsAsPlaceableSetup(gs) {
  return gs.phase === GAME_PHASES.UNIT_PLACEMENT
    && shouldShowInitialDeployment(gs.phase)
    && isSetupPhase(gs.phase)
    && shouldDrivePlayingTurnPhase(gs.phase) === false
    && shouldShowTechResearch(gs.phase, gs.turnPhase) === false
    && formatMobilePhaseLabel(gs.phase, gs.turnPhase) === 'Initial Deployment'
    && resolvePhaseHint(gs.phase, gs.turnPhase) === 'Click to place units'
    && resolvePhonePeekHint(gs.phase, gs.turnPhase, null) === 'Tap land, then unit'
    && shouldShowPhonePanelBody({ mobile: true, phase: gs.phase, turnPhase: gs.turnPhase }) === true
    && shouldShowPhonePeekUnitRow({ mobile: true, phase: gs.phase, turnPhase: gs.turnPhase }) === true;
}

console.log('=== Version stamps ===');
check('GAME_VERSION is V2.81.57-dual-path.17', GAME_VERSION === 'V2.81.57-dual-path.17');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== nextTurn() during unit_placement is a no-op ===');
{
  const gs = makeSetupTable({ turnPhase: TURN_PHASES.PURCHASE });
  const beforePhase = gs.phase;
  const beforeTurn = gs.turnPhase;
  const beforeIdx = gs.currentPlayerIndex;
  const beforePlayer = gs.currentPlayer?.id;
  const beforeRound = gs.round;
  gs.nextTurn();
  check('phase stays unit_placement', gs.phase === beforePhase);
  check('currentPlayer stays', gs.currentPlayer?.id === beforePlayer);
  check('currentPlayerIndex stays', gs.currentPlayerIndex === beforeIdx);
  check('round stays', gs.round === beforeRound);
  check('turnPhase is not rewritten to develop_tech', gs.turnPhase === beforeTurn);
  gs.nextPhase();
  check('nextPhase() during setup is also a no-op',
    gs.phase === beforePhase && gs.currentPlayerIndex === beforeIdx);
}

console.log('=== loadFromJSON dump combo still presents as placeable setup ===');
{
  const live = makeSetupTable({ turnPhase: TURN_PHASES.DEVELOP_TECH });
  const dump = live.toJSON();
  dump.phase = 'unit_placement';
  dump.turnPhase = 'develop_tech';
  dump.round = 1;
  dump.placementRound = 2;
  const loaded = makeSetupTable({ turnPhase: TURN_PHASES.PURCHASE });
  loaded.loadFromJSON(dump);
  check('phase remains unit_placement', loaded.phase === GAME_PHASES.UNIT_PLACEMENT);
  check('dump turnPhase is not treated as live Research',
    shouldShowTechResearch(loaded.phase, loaded.turnPhase) === false);
  check('playing/tech paths do not run',
    shouldDrivePlayingTurnPhase(loaded.phase) === false);
  check('presents as placeable Initial Deployment', presentsAsPlaceableSetup(loaded));
  check('HUD/phone label is Initial Deployment, not Develop Tech',
    formatMobilePhaseLabel(loaded.phase, loaded.turnPhase) === 'Initial Deployment');
}

console.log('=== loadFromJSON of unit_placement + purchase does not wedge into tech ===');
{
  const live = makeSetupTable({ turnPhase: TURN_PHASES.PURCHASE });
  const dump = live.toJSON();
  dump.phase = 'unit_placement';
  dump.turnPhase = 'purchase';
  const loaded = makeSetupTable({ turnPhase: TURN_PHASES.DEVELOP_TECH });
  loaded.loadFromJSON(dump);
  check('phase remains unit_placement', loaded.phase === GAME_PHASES.UNIT_PLACEMENT);
  check('leftover purchase normalizes to setup, not develop_tech',
    loaded.turnPhase === SETUP_TURN_PHASE
    && loaded.turnPhase !== TURN_PHASES.DEVELOP_TECH);
  check('tech research stays off',
    shouldShowTechResearch(loaded.phase, loaded.turnPhase) === false);
  check('presents as placeable setup, not unplaceable tech',
    presentsAsPlaceableSetup(loaded));
}

console.log('=== guest on own 2nd deployment seat: place-units + Done, no spectator ===');
{
  const gs = makeSetupTable({ turnPhase: TURN_PHASES.DEVELOP_TECH });
  check('own seat never shows spectator overlay',
    shouldShowSpectatorWaiting({
      isMultiplayer: true,
      localUserId: ROBERT,
      currentPlayerOderId: ROBERT,
    }) === false);
  check('isActivePlayer true ⇒ place-units UI',
    shouldShowPlaceUnitsUI({
      isMultiplayer: true,
      isWaitingForSync: true,
      localUserId: ROBERT,
      currentPlayerOderId: ROBERT,
      isActivePlayer: true,
    }) === true);
  check('guest dump combo still placeable setup', presentsAsPlaceableSetup(gs));
}

console.log('=== happy path: finishPlacementRound when no one can place ===');
{
  const gs = makeSetupTable({
    turnPhase: TURN_PHASES.PURCHASE,
    unitsToPlace: { p1: [], p2: [], p3: [], p4: [] },
  });
  const pass = gs.finishPlacementRound(unitDefs);
  check('Done commits when nobody can place', pass.ok === true);
  check('phase becomes PLAYING', gs.phase === GAME_PHASES.PLAYING);
  check('turnPhase becomes DEVELOP_TECH', gs.turnPhase === TURN_PHASES.DEVELOP_TECH);
  check('playing paths now run', shouldDrivePlayingTurnPhase(gs.phase) === true);
  check('tech research is live after setup ends',
    shouldShowTechResearch(gs.phase, gs.turnPhase) === true);
}

console.log('=== leftover purchase does not show purchase chrome or trade ===');
{
  const setup = makeSetupTable({ turnPhase: TURN_PHASES.PURCHASE });
  check('unit_placement + leftover purchase is not purchase chrome',
    shouldShowPurchase(setup.phase, setup.turnPhase) === false);
  check('setup trade is refused (no PLAYING)',
    setup.tradeRiskCards('p1').success === false);
  check('setup addToPendingPurchases is refused',
    setup.addToPendingPurchases('infantry', unitDefs).success === false);
  const playing = makeSetupTable({
    phase: GAME_PHASES.PLAYING,
    turnPhase: TURN_PHASES.PURCHASE,
    unitsToPlace: { p1: [], p2: [], p3: [], p4: [] },
  });
  check('PLAYING + purchase still shows purchase chrome',
    shouldShowPurchase(playing.phase, playing.turnPhase) === true);
}

console.log('=== nextTurn() still advances during PLAYING ===');
{
  const gs = makeSetupTable({
    phase: GAME_PHASES.PLAYING,
    turnPhase: TURN_PHASES.COLLECT_INCOME,
    unitsToPlace: { p1: [], p2: [], p3: [], p4: [] },
  });
  const before = gs.currentPlayerIndex;
  gs.nextTurn();
  check('PLAYING nextTurn advances the seat',
    gs.currentPlayerIndex === (before + 1) % gs.players.length);
  check('PLAYING nextTurn resets to develop_tech',
    gs.turnPhase === TURN_PHASES.DEVELOP_TECH);
}

console.log(failures === 0 ? '\nALL SETUP-PHASE-GUARD CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
