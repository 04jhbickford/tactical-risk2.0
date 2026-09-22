// V2.81.57-unified.3 — playtest P0s: single-row undo, transport load,
// amphibious assault, empty-land air, desktop right-click / unit drag.
// Run: node tools/test-unified-3-playtest.mjs

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { combatMoveReachableDests } = await import(pathToFileURL(join(root, 'src/state/combatMoveEligibility.js')));
const { shouldApplyRemoteGameState } = await import(pathToFileURL(join(root, 'src/state/placementPass.js')));
const { pointerStartsUnitDrag, rightClickConfirmsMove } = await import(pathToFileURL(join(root, 'src/ui/mapPointer.js')));
const { legalDests, createSoloPlay } = await import(pathToFileURL(join(root, 'src/map/threeSoloPlay.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true, movement: 1, attack: 1, defense: 2, cost: 3 },
  tank: { isLand: true, movement: 2, attack: 3, defense: 3, cost: 5 },
  fighter: { isAir: true, movement: 4, attack: 3, defense: 4 },
  transport: { isSea: true, movement: 2, attack: 0, defense: 1, canCarry: ['infantry', 'tank'] },
  submarine: { isSea: true, movement: 2, attack: 2, defense: 1 },
  battleship: { isSea: true, movement: 2, attack: 4, defense: 4 },
};

function board() {
  const territories = [
    { name: 'Britain', isWater: false, connections: ['North Sea', 'France', 'Germany'] },
    { name: 'France', isWater: false, connections: ['Britain', 'North Sea', 'Germany'] },
    { name: 'Germany', isWater: false, connections: ['France', 'Baltic', 'Britain'] },
    { name: 'North Sea', isWater: true, connections: ['Britain', 'France', 'Baltic'] },
    { name: 'Baltic', isWater: true, connections: ['North Sea', 'Germany'] },
    { name: 'Home', isWater: false, connections: ['Away'] },
    { name: 'Away', isWater: false, connections: ['Home'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'uk', name: 'British', alliance: 'allies' },
    { id: 'ger', name: 'Germans', alliance: 'axis' },
  ];
  gs.currentPlayerIndex = 0;
  gs.alliancesEnabled = true;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs._unitDefs = unitDefs;
  gs.territoryState = {
    Britain: { owner: 'uk' },
    France: { owner: 'ger' },
    Germany: { owner: 'ger' },
    'North Sea': { owner: null },
    Baltic: { owner: null },
    Home: { owner: 'uk' },
    Away: { owner: 'uk' },
  };
  gs.playerState = {
    uk: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'Britain' },
    ger: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'Germany' },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Britain', 'Home', 'Away']);
  gs.units = {
    Britain: [
      { type: 'infantry', quantity: 2, owner: 'uk' },
      { type: 'fighter', quantity: 1, owner: 'uk' },
    ],
    France: [{ type: 'infantry', quantity: 1, owner: 'ger' }],
    Germany: [],
    'North Sea': [{ type: 'transport', quantity: 1, owner: 'uk' }],
    Baltic: [{ type: 'submarine', quantity: 1, owner: 'ger' }],
    Home: [{ type: 'fighter', quantity: 1, owner: 'uk' }],
    Away: [],
  };
  return gs;
}

const html = readFileSync(join(root, 'index.html'), 'utf8');
const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');

console.log('=== stamp ===');
check('GAME_VERSION is V2.81.57-unified.3', GAME_VERSION === 'V2.81.57-unified.3');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);
check('index.html stamp is unified.3', html.includes('content="V2.81.57-unified.3"'));

console.log('=== 9.22.26.04 one undo row ===');
{
  const gs = board();
  gs.units.Britain = [
    { type: 'infantry', quantity: 1, owner: 'uk' },
    { type: 'tank', quantity: 1, owner: 'uk' },
  ];
  gs.units.France = [];
  gs.territoryState.France.owner = 'uk';
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  const first = gs.moveUnits('Britain', 'France', [{ type: 'infantry', quantity: 1 }], unitDefs);
  const second = gs.moveUnits('Britain', 'France', [{ type: 'tank', quantity: 1 }], unitDefs);
  check('two independent moves land', first.success === true && second.success === true);
  const undone = gs.undoMoveById(first.id || gs.moveHistory[0].id);
  check('undoing the first move succeeds', undone.success === true && undone.undone === 1);
  check('the tank move is still on the board',
    (gs.units.France || []).some((u) => u.type === 'tank' && u.owner === 'uk'));
  check('infantry returned to Britain',
    (gs.units.Britain || []).some((u) => u.type === 'infantry' && u.owner === 'uk'));
  check('one history row remains', gs.moveHistory.length === 1);
}

console.log('=== 9.22.26.05 load infantry onto a transport ===');
{
  const gs = board();
  const dests = combatMoveReachableDests(gs, 'Britain', { infantry: 1 }, unitDefs);
  check('combat-move catalog offers the friendly transport sea',
    dests.some((d) => d.name === 'North Sea' && d.via === 'transport'));
  check('hostile Baltic is not a land-unit load',
    !dests.some((d) => d.name === 'Baltic'));
  const loaded = gs.moveUnits('Britain', 'North Sea', [{ type: 'infantry', quantity: 1 }], unitDefs);
  check('infantry loads', loaded.success === true);
  const ship = (gs.units['North Sea'] || []).find((u) => u.type === 'transport' && u.owner === 'uk');
  check('cargo is on the transport', (ship?.cargo || []).some((c) => c.type === 'infantry'));
  check('one infantry left Britain',
    (gs.units.Britain || []).filter((u) => u.type === 'infantry' && u.owner === 'uk')
      .reduce((sum, u) => sum + (u.quantity || 0), 0) === 1);
}

console.log('=== 9.22.26.06 amphibious assault ===');
{
  const gs = board();
  gs.units['North Sea'] = [{
    type: 'transport', id: 'tr1', owner: 'uk', quantity: 1, cargo: [{ type: 'infantry', owner: 'uk' }], movementUsed: 0,
  }];
  gs.units.France = [];
  const empty = gs.unloadTransport('North Sea', 0, 'France');
  check('unload onto empty enemy coast succeeds', empty.success === true);
  check('infantry is in France',
    (gs.units.France || []).some((u) => u.type === 'infantry' && u.owner === 'uk'));
  check('empty coast is captured', gs.getOwner('France') === 'uk');

  const fight = board();
  fight.units['North Sea'] = [{
    type: 'transport', id: 'tr2', owner: 'uk', quantity: 1,
    cargo: [{ type: 'infantry', owner: 'uk' }], movementUsed: 0,
  }];
  const assaulted = fight.unloadSingleUnit('North Sea', 0, 'infantry', 'France');
  check('unload onto a defended coast succeeds', assaulted.success === true);
  check('defended coast stays enemy until combat', fight.getOwner('France') === 'ger');
  fight.nextPhase();
  check('defended amphibious assault is a battle',
    fight.turnPhase === TURN_PHASES.COMBAT && (fight.combatQueue || []).includes('France'));
}

console.log('=== 9.22.26.07 aircraft cannot occupy empty land ===');
{
  const gs = board();
  const empty = gs.moveUnits('Britain', 'Germany', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('empty enemy land rejects the fighter', empty.success === false);
  check('fighter stayed in Britain',
    (gs.units.Britain || []).some((u) => u.type === 'fighter' && u.owner === 'uk'));
  const attack = gs.moveUnits('Britain', 'France', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('occupied enemy land is a legal air attack', attack.success === true);
  const catalog = combatMoveReachableDests(board(), 'Britain', { fighter: 1 }, unitDefs);
  check('catalog omits empty Germany', !catalog.some((d) => d.name === 'Germany'));
}

console.log('=== 9.22.26.03 sea confirm still commits ===');
{
  const gs = board();
  gs.units['North Sea'] = [
    { type: 'battleship', quantity: 1, owner: 'uk' },
  ];
  const moved = gs.moveUnits('North Sea', 'Baltic', [{ type: 'battleship', quantity: 1 }], unitDefs);
  check('North Sea to Baltic is an attack', moved.success === true && moved.isAttack === true);
  check('battleship stayed in the Baltic',
    (gs.units.Baltic || []).some((u) => u.type === 'battleship' && u.owner === 'uk' && u.moved === true));
}

console.log('=== 9.22.26.02 deploy undo then place elsewhere ===');
{
  const territories = [
    { name: 'Home', isWater: false, connections: ['Away'] },
    { name: 'Away', isWater: false, connections: ['Home'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'uk', name: 'British' }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.playerState = { uk: { ipcs: 20, capitalTerritory: 'Home', hasPlacedCapital: true } };
  gs.territoryState = { Home: { owner: 'uk' }, Away: { owner: 'uk' } };
  gs.units = { Home: [], Away: [] };
  gs.unitsToPlace = { uk: [{ type: 'infantry', quantity: 2 }] };
  check('first place', gs.placeInitialUnit('Home', 'infantry', unitDefs).success === true);
  const stale = gs.toJSON();
  check('undo', gs.undoPlacement() === true);
  check('replace', gs.placeInitialUnit('Away', 'infantry', unitDefs).success === true);
  const saved = gs.toJSON();
  const peer = new GameState({ risk: { factions: [] } }, territories, []);
  peer.loadFromJSON(stale);
  check('stale place is not applied over the newer undo',
    shouldApplyRemoteGameState({
      remoteVersion: 2,
      localVersion: 1,
      remoteActionSeq: stale.actionSeq,
      localActionSeq: saved.actionSeq,
    }) === false);
  peer.loadFromJSON(saved);
  check('only the later placement is on the map',
    !(peer.units.Home || []).some((u) => u.type === 'infantry' && (u.quantity || 0) > 0)
    && (peer.units.Away || []).some((u) => u.type === 'infantry' && u.owner === 'uk'));
}

console.log('=== 9.22.26.01-UX and 9.22.26.09 gestures ===');
{
  check('right-click confirms a legal combat-move dest', rightClickConfirmsMove({
    button: 2, turnPhase: 'combat_move', hasSelection: true, destLegal: true,
  }) === true);
  check('left-click does not confirm', rightClickConfirmsMove({
    button: 0, turnPhase: 'combat_move', hasSelection: true, destLegal: true,
  }) === false);
  check('right-click without a selection does not move', rightClickConfirmsMove({
    button: 2, turnPhase: 'non_combat_move', hasSelection: false, destLegal: true,
  }) === false);
  const hit = { unitType: 'infantry', owner: 'uk', unitDef: { isLand: true } };
  check('drag starts on a selected unit', pointerStartsUnitDrag({
    button: 0, turnPhase: 'combat_move', unitHit: hit, selectedUnits: { infantry: 1 }, currentPlayerId: 'uk',
  }) === true);
  check('drag does not start on an unselected unit', pointerStartsUnitDrag({
    button: 0, turnPhase: 'combat_move', unitHit: hit, selectedUnits: { tank: 1 }, currentPlayerId: 'uk',
  }) === false);
  check('drag does not start on empty map', pointerStartsUnitDrag({
    button: 0, turnPhase: 'combat_move', unitHit: null, selectedUnits: { infantry: 1 }, currentPlayerId: 'uk',
  }) === false);
  check('main wires contextmenu to confirm-move', mainSrc.includes("action: 'confirm-move'") && mainSrc.includes('contextmenu'));
  check('main starts unit drag only from pointerStartsUnitDrag', mainSrc.includes('pointerStartsUnitDrag'));
}

console.log('=== shared dests still omit a hostile sea for land ===');
{
  const gs = board();
  gs.units['North Sea'] = [
    { type: 'transport', quantity: 1, owner: 'uk' },
    { type: 'submarine', quantity: 1, owner: 'ger' },
  ];
  const dests = combatMoveReachableDests(gs, 'Britain', { infantry: 1 }, unitDefs);
  check('hostile sea with a friendly transport is not a land attack',
    !dests.some((d) => d.name === 'North Sea'));
  const play = createSoloPlay(gs, unitDefs);
  play.selected = 'Britain';
  play.selectedUnits = { infantry: 1 };
  check('solo legalDests also omit that hostile sea', !legalDests(play).includes('North Sea'));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall unified.3 checks passed');
