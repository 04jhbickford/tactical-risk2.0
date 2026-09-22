// V2.81.57-unified.5 — sea Confirm Attack, deploy undo stickiness, lobby scroll.
// Run: node tools/test-unified-2-live-fixes.mjs

import { readFileSync } from 'node:fs';
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
const { resolveDeployedThisRoundAfterLoad } =
  await import(pathToFileURL(join(root, 'src/state/placeQueue.js')));
const { deferredSnapshotShouldApply } =
  await import(pathToFileURL(join(root, 'src/state/placementPass.js')));
const { captureLobbyScroll, restoreLobbyScroll } =
  await import(pathToFileURL(join(root, 'src/ui/lobbyScroll.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true, movement: 1, attack: 1, defense: 2, cost: 3 },
  battleship: { isSea: true, movement: 2, attack: 4, defense: 4 },
  transport: { isSea: true, movement: 2, attack: 0, defense: 1, canCarry: ['infantry'] },
  submarine: { isSea: true, movement: 2, attack: 2, defense: 1 },
};

function seaBoard() {
  const territories = [
    { name: 'North Sea Zone', isWater: true, connections: ['Baltic Sea Zone', 'United Kingdom'] },
    { name: 'Baltic Sea Zone', isWater: true, connections: ['North Sea Zone', 'Gulf Zone'] },
    { name: 'Gulf Zone', isWater: true, connections: ['Baltic Sea Zone'] },
    { name: 'United Kingdom', isWater: false, connections: ['North Sea Zone'] },
    { name: 'Home', isWater: false, connections: [] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'British', name: 'British', alliance: 'allies' },
    { id: 'Germans', name: 'Germans', alliance: 'axis' },
  ];
  gs.currentPlayerIndex = 0;
  gs.alliancesEnabled = true;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs._unitDefs = unitDefs;
  gs.territoryState = {
    'United Kingdom': { owner: 'British' },
    'North Sea Zone': { owner: null },
    'Baltic Sea Zone': { owner: null },
    'Gulf Zone': { owner: null },
    Home: { owner: 'British' },
  };
  gs.playerState = {
    British: { ipcs: 30, hasPlacedCapital: true, capitalTerritory: 'United Kingdom' },
    Germans: { ipcs: 30, hasPlacedCapital: true, capitalTerritory: 'Germany' },
  };
  gs.units = {
    'North Sea Zone': [
      { type: 'battleship', quantity: 1, owner: 'British' },
      { type: 'transport', quantity: 1, owner: 'British' },
    ],
    'Baltic Sea Zone': [
      { type: 'submarine', quantity: 1, owner: 'Germans' },
      { type: 'transport', quantity: 1, owner: 'Germans' },
    ],
    'Gulf Zone': [],
  };
  return gs;
}

console.log('=== stamp ===');
check('GAME_VERSION is V2.81.57-unified.5', GAME_VERSION === 'V2.81.57-unified.5');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== sea Confirm Attack commits and stops ===');
{
  const gs = seaBoard();
  const reachable = gs.getReachableTerritoriesForSea('North Sea Zone', 2, 'British', true);
  check('Baltic is reachable', reachable.has('Baltic Sea Zone'));
  check('cannot path through the hostile sea to the gulf', !reachable.has('Gulf Zone'));

  const moved = gs.moveUnits(
    'North Sea Zone',
    'Baltic Sea Zone',
    [{ type: 'battleship', quantity: 1 }, { type: 'transport', quantity: 1 }],
    unitDefs,
  );
  check('sea attack succeeds', moved.success === true);
  check('sea attack is an attack', moved.isAttack === true);
  check('North Sea is empty of British ships',
    !(gs.units['North Sea Zone'] || []).some((u) => u.owner === 'British' && (u.quantity || 0) > 0));
  const balticFriendly = (gs.units['Baltic Sea Zone'] || []).filter((u) => u.owner === 'British');
  check('British ships are in the Baltic', balticFriendly.length === 2);
  check('ships stopped (moved)', balticFriendly.every((u) => u.moved === true));
  gs.nextPhase();
  check('combat phase queues the Baltic battle',
    gs.turnPhase === TURN_PHASES.COMBAT && (gs.combatQueue || []).includes('Baltic Sea Zone'));

  const ncm = seaBoard();
  ncm.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  const blocked = ncm.moveUnits(
    'North Sea Zone',
    'Baltic Sea Zone',
    [{ type: 'battleship', quantity: 1 }],
    unitDefs,
  );
  check('non-combat cannot enter the hostile sea', blocked.success === false);
  check('non-combat ships stayed in the North Sea',
    (ncm.units['North Sea Zone'] || []).some((u) => u.type === 'battleship' && u.owner === 'British'));
}

console.log('=== individual ship confirm stops in the enemy sea ===');
{
  const gs = seaBoard();
  gs.units['North Sea Zone'] = [{
    type: 'transport', quantity: 1, owner: 'British', id: 'transport_1', cargo: [], movementUsed: 0,
  }];
  const moved = gs.moveUnits('North Sea Zone', 'Baltic Sea Zone', [], unitDefs, {
    shipIds: ['transport_1'],
  });
  check('ship-id sea attack succeeds', moved.success === true && moved.isAttack === true);
  const ship = (gs.units['Baltic Sea Zone'] || []).find((u) => u.id === 'transport_1');
  check('individual ship stopped in the Baltic', !!ship && ship.moved === true);
  check('ship left the North Sea',
    !(gs.units['North Sea Zone'] || []).some((u) => u.id === 'transport_1'));
}

console.log('=== deploy undo survives a newer snapshot ===');
{
  const territories = [
    { name: 'Home', isWater: false, connections: [] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'British', name: 'British' }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.playerState = { British: { ipcs: 20, capitalTerritory: 'Home', hasPlacedCapital: true } };
  gs.territoryState = { Home: { owner: 'British' } };
  gs.units = { Home: [] };
  gs.unitsToPlace = { British: [{ type: 'infantry', quantity: 2 }] };
  const placed = gs.placeInitialUnit('Home', 'infantry', unitDefs);
  check('place succeeds', placed.success === true);
  const before = gs.toJSON();
  check('placementHistory is in the cloud doc', Array.isArray(before.placementHistory) && before.placementHistory.length === 1);
  check('schema stays 11', before.version === 11);
  check('undo removes the troop', gs.undoPlacement() === true);
  check('map no longer has the infantry',
    !(gs.units.Home || []).some((u) => u.type === 'infantry' && (u.quantity || 0) > 0));
  check('deployed count dropped', gs.unitsPlacedThisRound === 0);
  const undone = gs.toJSON();
  check('undone doc has empty history', (undone.placementHistory || []).length === 0);
  check('undone doc has a higher actionSeq', (undone.actionSeq || 0) > (before.actionSeq || 0));

  const peer = new GameState({ risk: { factions: [] } }, territories, []);
  peer.loadFromJSON(before);
  check('peer hydrate of the place shows the troop',
    (peer.units.Home || []).some((u) => u.type === 'infantry'));
  peer.loadFromJSON(undone);
  check('peer hydrate of the undo clears the troop',
    !(peer.units.Home || []).some((u) => u.type === 'infantry' && (u.quantity || 0) > 0));
  check('peer deployed count follows the newer undo', peer.unitsPlacedThisRound === 0);

  check('B28 still keeps local 1 against a same-seq stale 0',
    resolveDeployedThisRoundAfterLoad({
      prevPlayerId: 'British', nextPlayerId: 'British',
      remotePlacedThisRound: 0, localPlacedThisRound: 1,
      remoteActionSeq: 4, localActionSeq: 4,
    }) === 1);
  check('newer remote undo wins over local 1',
    resolveDeployedThisRoundAfterLoad({
      prevPlayerId: 'British', nextPlayerId: 'British',
      remotePlacedThisRound: 0, localPlacedThisRound: 1,
      remoteActionSeq: 5, localActionSeq: 4,
    }) === 0);
  check('older deferred snapshot does not clobber a newer undo',
    deferredSnapshotShouldApply({
      remoteVersion: 9, localVersion: 8,
      remotePlayerId: 'a', localPlayerId: 'a',
      remoteActionSeq: 4, localActionSeq: 5,
    }) === false);
}

console.log('=== lobby scroll + confirm push are wired ===');
{
  const root = {
    nodes: { '.lobby-content-wrapper': { scrollTop: 240 } },
    querySelector(sel) { return this.nodes[sel] || null; },
  };
  const saved = captureLobbyScroll(root);
  root.nodes['.lobby-content-wrapper'] = { scrollTop: 0 };
  restoreLobbyScroll(root, saved);
  check('wrapper scrollTop restored', root.nodes['.lobby-content-wrapper'].scrollTop === 240);

  const main = readFileSync(join(process.cwd(), 'src/main.js'), 'utf8');
  check('confirm-move pushes immediately', main.includes('if (syncManager) await syncManager.pushStateNow();'));
  check('undo-placement pushes immediately',
    /case 'undo-placement':[\s\S]*pushStateNow\(/.test(main));
  const lobby = readFileSync(join(process.cwd(), 'src/ui/multiplayerLobby.js'), 'utf8');
  const localLobby = readFileSync(join(process.cwd(), 'src/ui/lobby.js'), 'utf8');
  check('multiplayer faction buttons are type=button', lobby.includes('type="button" class="mp-faction-btn'));
  check('both lobbies restore scroll', lobby.includes('restoreLobbyScroll') && localLobby.includes('restoreLobbyScroll'));
  check('room chrome still Unlist Game and Main Menu',
    lobby.includes('data-action="unlist"') && lobby.includes('data-action="main-menu"'));
}

console.log('=== 9.21.26.13 re-verify on unified shell (no new lobby IA) ===');
{
  const lobby = readFileSync(join(process.cwd(), 'src/ui/multiplayerLobby.js'), 'utf8');
  const start = readFileSync(join(process.cwd(), 'src/multiplayer/lobbyStart.js'), 'utf8');
  const mgr = readFileSync(join(process.cwd(), 'src/multiplayer/lobbyManager.js'), 'utf8');
  const main = readFileSync(join(process.cwd(), 'src/main.js'), 'utf8');
  check('labels are still Unlist Game and Main Menu',
    start.includes("LOBBY_UNLIST_LABEL = 'Unlist Game'")
    && start.includes("LOBBY_MAIN_MENU_LABEL = 'Main Menu'"));
  check('unified room paints those labels',
    lobby.includes('roomChrome.unlist.label') && lobby.includes('roomChrome.mainMenu.label'));
  const unlistFn = mgr.slice(mgr.indexOf('async unlistLobby'), mgr.indexOf('async startGame'));
  check('Unlist writes isPublished false and does not leave or delete',
    /isPublished:\s*false/.test(unlistFn) && !/deleteDoc|leaveLobby/.test(unlistFn));
  const unlistUi = lobby.slice(
    lobby.indexOf('[data-action="unlist"]'),
    lobby.indexOf('[data-action="main-menu"]'),
  );
  check('Unlist stays in the room',
    unlistUi.includes('unlistLobby()') && unlistUi.includes("this.mode = 'lobby'"));
  const menuUi = lobby.slice(
    lobby.indexOf('[data-action="main-menu"]'),
    lobby.indexOf('[data-action="back-to-browse"]'),
  );
  check('Main Menu disconnects the view and does not unlist',
    menuUi.includes('disconnectFromLobby({ notify: false })')
    && !menuUi.includes('unlistLobby('));
  check('unified boot does not start the Experimental shell',
    !main.includes('threeSoloBoot') && !main.includes('bootThreeSolo'));
  check('empty onBack still opens the local Main Menu',
    main.includes('shouldNavigateToHome({') && main.includes('lobby.show()'));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall unified.2 live-fix checks passed');
