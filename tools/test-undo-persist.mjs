// V2.81.57-unified.15 — per-row Undo survives reload. Schema stays 11.
// Run: node tools/test-undo-persist.mjs

import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.localStorage === 'undefined') {
  const mem = {};
  globalThis.localStorage = {
    getItem(k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
    setItem(k, v) { mem[k] = String(v); },
    removeItem(k) { delete mem[k]; },
  };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

check('GAME_VERSION is V2.81.57-unified.15', GAME_VERSION === 'V2.81.57-unified.15');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

const unitDefs = {
  infantry: { isLand: true, movement: 1, attack: 1, defense: 2, cost: 3 },
  tank: { isLand: true, movement: 2, attack: 3, defense: 3, cost: 5 },
};

function board() {
  const territories = [
    { name: 'Britain', isWater: false, connections: ['France'] },
    { name: 'France', isWater: false, connections: ['Britain'] },
    { name: 'Germany', isWater: false, connections: [] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'uk', name: 'British', alliance: 'allies' },
    { id: 'ger', name: 'Germans', alliance: 'axis' },
  ];
  gs.currentPlayerIndex = 0;
  gs.alliancesEnabled = true;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  gs._unitDefs = unitDefs;
  gs.territoryState = {
    Britain: { owner: 'uk' },
    France: { owner: 'uk' },
    Germany: { owner: 'ger' },
  };
  gs.playerState = {
    uk: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'Britain' },
    ger: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'Germany' },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Britain', 'France']);
  gs.units = {
    Britain: [
      { type: 'infantry', quantity: 1, owner: 'uk' },
      { type: 'tank', quantity: 1, owner: 'uk' },
    ],
    France: [],
    Germany: [{ type: 'infantry', quantity: 1, owner: 'ger' }],
  };
  return gs;
}

const gs = board();
const first = gs.moveUnits('Britain', 'France', [{ type: 'infantry', quantity: 1 }], unitDefs);
const second = gs.moveUnits('Britain', 'France', [{ type: 'tank', quantity: 1 }], unitDefs);
check('two moves land', first.success === true && second.success === true && gs.moveHistory.length === 2);
const secondId = gs.moveHistory[1].id;
gs.undoLockMoveCount = 0;

const saved = gs.toJSON();
check('save keeps schema 11 and the undo fields',
  saved.version === 11
  && saved.moveHistory.length === 2
  && saved.moveHistory[1].id === secondId
  && saved.undoLockMoveCount === 0);

const loaded = board();
loaded.loadFromJSON(saved);
check('reload restores both rows',
  loaded.moveHistory.length === 2 && loaded.moveHistory[1].id === secondId);
check('reload stays on the moving seat', loaded.currentPlayer?.id === 'uk');

const other = board();
other.loadFromJSON(saved);
other.currentPlayerIndex = 1;
const denied = other.undoMoveAt(1);
check('another seat cannot undo these moves',
  denied.success === false && /other player/i.test(denied.error || ''));
check('denied undo leaves the row', other.moveHistory.length === 2);

const undone = loaded.undoMoveAt(1);
check('per-row undo of the 2nd move works after reload',
  undone.success === true && undone.undone === 1);
check('tank returned to Britain',
  (loaded.units.Britain || []).some((u) => u.type === 'tank' && u.owner === 'uk'));
check('infantry move is still on France',
  (loaded.units.France || []).some((u) => u.type === 'infantry' && u.owner === 'uk'));
check('one history row remains', loaded.moveHistory.length === 1);

const legacy = { ...saved };
delete legacy.moveHistory;
delete legacy.undoLockMoveCount;
const old = board();
old.moveHistory = [{ from: 'Britain', to: 'France', units: [], player: 'uk', id: 'stale' }];
old.undoLockMoveCount = 4;
old.loadFromJSON(legacy);
check('old save without the fields loads empty history',
  old.moveHistory.length === 0 && old.undoLockMoveCount === 0 && old.phase === GAME_PHASES.PLAYING);

const ending = board();
ending.loadFromJSON(saved);
ending.nextTurn();
check('turn end clears the undo list',
  ending.moveHistory.length === 0 && ending.undoLockMoveCount === 0);
const ended = ending.toJSON();
check('cleared list is what the next save stores',
  ended.moveHistory.length === 0 && ended.undoLockMoveCount === 0 && ended.version === 11);

console.log(failures === 0 ? '\nALL UNDO PERSIST CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
