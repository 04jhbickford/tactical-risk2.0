// V2.81.57-unified.13 — per-row combat undo, waiting-lobby My Games.
// Classic | Experimental picker is restored in .17.
// Run: node tools/test-dual-path-16-playtest.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.localStorage === 'undefined') {
  const mem = () => {
    const d = {};
    return {
      getItem(k) { return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; },
      setItem(k, v) { d[k] = String(v); },
      removeItem(k) { delete d[k]; },
    };
  };
  globalThis.localStorage = mem();
  globalThis.sessionStorage = mem();
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { listAddressableMoveRows, canUndoMoveAt } = await import(pathToFileURL(join(root, 'src/state/undoPolicy.js')));
const { cascadeUndoIndexes } = await import(pathToFileURL(join(root, 'src/state/moveUndo.js')));
const {
  resolveMyGamesEntryAction,
  lastMatchFromLobbySnapshot,
  buildMyGamesBoard,
  isWaitingLobbyEntry,
} = await import(pathToFileURL(join(root, 'src/multiplayer/lastMatch.js')));
const { UX_CLASSIC, UX_THREE, resolveUxMode } = await import(pathToFileURL(join(root, 'src/map/presentationMode.js')));

const html = readFileSync(join(root, 'index.html'), 'utf8');
const lobbySrc = readFileSync(join(root, 'src/ui/lobby.js'), 'utf8');
const chromeSrc = readFileSync(join(root, 'src/map/threeMapChrome.js'), 'utf8');
const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
const gameListSrc = readFileSync(join(root, 'src/ui/gameList.js'), 'utf8');
const bootSrc = readFileSync(join(root, 'src/map/threeSoloBoot.js'), 'utf8');
const playSrc = readFileSync(join(root, 'src/map/threeSoloPlay.js'), 'utf8');
const lobbyScreens = readFileSync(join(root, 'src/map/threeSoloLobby.js'), 'utf8');

assert.equal(GAME_VERSION, 'V2.81.57-unified.13');
assert.equal(SCHEMA_VERSION, 11);
assert.match(html, /content="V2\.81\.57-unified\.13"/);
assert.match(html, /__TR_GAME_VERSION = 'V2\.81\.57-unified\.13'/);

function fresh() {
  const territories = [
    { name: 'A', isWater: false, connections: ['B'] },
    { name: 'B', isWater: false, connections: ['A', 'C'] },
    { name: 'C', isWater: false, connections: ['B', 'D'] },
    { name: 'D', isWater: false, connections: ['C'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'p1', name: 'James', oderId: 'james', isAI: false }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.territoryState = {
    A: { owner: 'p1' },
    B: { owner: 'p1' },
    C: { owner: 'p1' },
    D: { owner: 'p1' },
  };
  gs.units = { A: [], B: [], C: [], D: [] };
  gs.moveHistory = [];
  gs.undoLockMoveCount = 0;
  return gs;
}

function qty(gs, terr, type) {
  const stack = (gs.units[terr] || []).find((u) => u.type === type && u.owner === 'p1' && !u.id);
  return stack?.quantity || 0;
}

{
  const gs = fresh();
  gs.units.B = [{ type: 'infantry', quantity: 2, owner: 'p1' }];
  gs.units.D = [{ type: 'tank', quantity: 1, owner: 'p1' }];
  const first = gs._pushMove({
    from: 'A', to: 'B', units: [{ type: 'infantry', quantity: 2 }], player: 'p1',
  });
  const second = gs._pushMove({
    from: 'C', to: 'D', units: [{ type: 'tank', quantity: 1 }], player: 'p1',
  });
  const rows = listAddressableMoveRows(gs.moveHistory, {
    turnPhase: gs.turnPhase,
    undoLockMoveCount: 0,
  });
  assert.deepEqual(rows.map((r) => r.id), [second, first], 'newest row first');
  assert.ok(rows.every((r) => r.canUndo));

  const undone = gs.undoMoveById(first);
  assert.equal(undone.success, true);
  assert.equal(undone.undone, 1);
  assert.equal(qty(gs, 'A', 'infantry'), 2);
  assert.equal(qty(gs, 'B', 'infantry'), 0);
  assert.equal(qty(gs, 'D', 'tank'), 1, 'independent later move stays');
  assert.equal(gs.moveHistory.length, 1);
  assert.equal(gs.moveHistory[0].id, second);
}

{
  const gs = fresh();
  gs.units.C = [{ type: 'infantry', quantity: 1, owner: 'p1' }];
  const first = gs._pushMove({
    from: 'A', to: 'B', units: [{ type: 'infantry', quantity: 1 }], player: 'p1',
  });
  const second = gs._pushMove({
    from: 'B', to: 'C', units: [{ type: 'infantry', quantity: 1 }], player: 'p1',
  });
  assert.deepEqual(cascadeUndoIndexes(gs.moveHistory, 0), [1, 0]);
  const blocked = gs.undoMoveById(first);
  assert.equal(blocked.success, false, 'earlier hop does not wipe the later move');
  assert.equal(gs.moveHistory.length, 2);
  assert.equal(qty(gs, 'C', 'infantry'), 1);
  const undone = gs.undoMoveById(second);
  assert.equal(undone.success, true);
  assert.equal(undone.undone, 1, 'clicked row only');
  assert.equal(qty(gs, 'B', 'infantry'), 1);
  assert.equal(qty(gs, 'C', 'infantry'), 0);
  assert.equal(gs.moveHistory.length, 1);
  assert.equal(gs.moveHistory[0].id, first);
}

{
  const gs = fresh();
  gs.units.B = [{ type: 'infantry', quantity: 1, owner: 'p1' }];
  gs.units.D = [{ type: 'tank', quantity: 1, owner: 'p1' }];
  gs._pushMove({ from: 'A', to: 'B', units: [{ type: 'infantry', quantity: 1 }], player: 'p1' });
  gs._pushMove({ from: 'C', to: 'D', units: [{ type: 'tank', quantity: 1 }], player: 'p1' });
  const all = gs.undoAllMoves();
  assert.equal(all.success, true);
  assert.equal(all.undone, 2);
  assert.equal(qty(gs, 'A', 'infantry'), 1);
  assert.equal(qty(gs, 'C', 'tank'), 1);
  assert.equal(gs.moveHistory.length, 0);
}

{
  const gs = fresh();
  gs.units.B = [{ type: 'infantry', quantity: 1, owner: 'p1' }];
  gs.units.D = [{ type: 'tank', quantity: 1, owner: 'p1' }];
  const locked = gs._pushMove({
    from: 'A', to: 'B', units: [{ type: 'infantry', quantity: 1 }], player: 'p1',
  });
  gs._pushMove({ from: 'C', to: 'D', units: [{ type: 'tank', quantity: 1 }], player: 'p1' });
  gs.undoLockMoveCount = 1;
  assert.equal(canUndoMoveAt({
    index: 0, turnPhase: TURN_PHASES.COMBAT_MOVE, moveHistoryLength: 2, undoLockMoveCount: 1,
  }), false);
  assert.equal(gs.undoMoveById(locked).success, false);
  assert.equal(gs.moveHistory.length, 2);
  const all = gs.undoAllMoves();
  assert.equal(all.undone, 1);
  assert.equal(gs.moveHistory.length, 1);
  assert.equal(gs.moveHistory[0].id, locked);
  assert.equal(qty(gs, 'C', 'tank'), 1);
  assert.equal(qty(gs, 'D', 'tank'), 0);
  gs.turnPhase = TURN_PHASES.COMBAT;
  assert.equal(gs.undoLastMove().success, false);
  assert.ok(gs.getRetreatDestinations('B').includes('A'));
}

{
  const gs = fresh();
  gs.units.B = [{ type: 'infantry', quantity: 1, owner: 'p1' }];
  const other = gs._pushMove({
    from: 'A', to: 'B', units: [{ type: 'infantry', quantity: 1 }], player: 'p2',
  });
  assert.equal(gs.undoMoveById(other).success, false);
  assert.equal(gs.moveHistory.length, 1);
  assert.equal(qty(gs, 'B', 'infantry'), 1);
  assert.equal(gs.undoMoveById('missing').error, 'Move not found');
}

{
  const gs = fresh();
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  gs.units.A = [{ type: 'infantry', quantity: 3, owner: 'p1' }];
  const defs = { infantry: { movement: 1, isLand: true } };
  const moved = gs.moveUnits('A', 'B', [{ type: 'infantry', quantity: 2 }], defs);
  assert.equal(moved.success, true, moved.error || 'real move');
  assert.match(gs.moveHistory[0].id, /^mv/);
  const undone = gs.undoMoveById(gs.moveHistory[0].id);
  assert.equal(undone.success, true);
  assert.equal(qty(gs, 'A', 'infantry'), 3);
  assert.equal(qty(gs, 'B', 'infantry'), 0);
  assert.deepEqual(gs.toJSON().moveHistory, [], 'undo list persists and is empty after the only row is undone');
  assert.equal(gs.toJSON().undoLockMoveCount, 0);
  assert.equal(gs.toJSON().version, 11);
}

{
  const waiting = resolveMyGamesEntryAction({ kind: 'lobby', status: 'waiting' });
  assert.equal(waiting.action, 'open-lobby');
  assert.equal(waiting.label, 'Resume lobby');
  const bare = resolveMyGamesEntryAction({ status: undefined, stateVersion: 0, hasState: false });
  assert.equal(bare.action, 'open-lobby');
  assert.equal(isWaitingLobbyEntry({ status: 'waiting' }), true);
  const started = resolveMyGamesEntryAction({
    kind: 'game', status: 'active', stateVersion: 4, hasState: true,
  });
  assert.equal(started.action, 'rejoin-map');
  assert.equal(started.label, 'Resume');
  assert.equal(resolveMyGamesEntryAction({ status: 'starting' }).action, 'rejoin-map');
  const remembered = lastMatchFromLobbySnapshot({
    status: 'waiting',
    code: 'ABCDEF',
    gameId: 'stale-started-id',
    players: [{ isHost: true, displayName: 'Rob' }],
  });
  assert.equal(remembered.gameId, null);
  assert.equal(remembered.lobbyCode, 'ABCDEF');
  const board = buildMyGamesBoard({
    waitingLobbies: [{ id: 'L1', code: 'WAIT01', name: 'Room', players: [{}, {}], settings: { maxPlayers: 5 } }],
    games: [{ id: 'G1', status: 'active', stateVersion: 2, state: { round: 3 }, lobbyData: { code: 'LIVE99' } }],
  });
  assert.equal(board[0].action, 'open-lobby');
  assert.equal(board[0].code, 'WAIT01');
  assert.equal(board[1].action, 'rejoin-map');
  assert.equal(board[1].id, 'G1');
}

assert.match(panelSrc, /data-action="undo-move" data-move-id=/);
assert.match(panelSrc, /data-action="undo-all-moves"/);
assert.match(chromeSrc, /data-undo-id=/);
assert.match(chromeSrc, /data-undo-all="1"/);
assert.match(mainSrc, /undoMoveById/);
assert.match(mainSrc, /undo-all-moves/);
assert.match(playSrc, /export function undoMoveById/);
assert.match(playSrc, /export function undoAllMoves/);
assert.match(gameListSrc, /Resume lobby/);
assert.match(gameListSrc, /onOpenLobby/);
assert.match(bootSrc, /action === 'open-lobby'/);
assert.match(bootSrc, /joinGame/);
assert.match(lobbyScreens, /'games'/);
assert.match(chromeSrc, /value: 'games'/);
assert.match(chromeSrc, /title: 'My Games'/);
assert.doesNotMatch(lobbySrc, /data-action="ux-classic"/);
assert.doesNotMatch(lobbySrc, /data-action="ux-three"/);
assert.match(chromeSrc, /data-lobby="ux"/);
assert.match(chromeSrc, /Classic 1942/);
assert.equal(resolveUxMode(''), UX_CLASSIC);
assert.equal(resolveUxMode('?ux=classic'), UX_CLASSIC);
assert.equal(resolveUxMode('?ux=three'), UX_CLASSIC);

console.log('test-dual-path-16-playtest: PASS');
