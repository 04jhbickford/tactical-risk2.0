// V2.81.57-unified.13 — Unlist must not create a second My Games / Open Games row.
// Verification only, using the existing pure helpers.
// Run: node tools/test-unlist-single-game.mjs

import { GAME_VERSION } from '../src/version.js';
import {
  lobbyAppearsInOpenGames,
  lobbyChromeStatusAfter,
} from '../src/multiplayer/lobbyStart.js';
import { buildMyGamesBoard } from '../src/multiplayer/lastMatch.js';

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

check('stamp is unified.13', GAME_VERSION === 'V2.81.57-unified.13');

const lobby = {
  id: 'lobby-txvkjb',
  code: 'TXVKJB',
  name: 'TXVKJB',
  status: 'waiting',
  isPublished: true,
  players: [{ oderId: 'rob', displayName: 'Robfox007', isHost: true, factionId: 'Germans' }],
  settings: { maxPlayers: 5 },
};

function project(row, games = []) {
  const open = lobbyAppearsInOpenGames({
    isPublished: !!row.isPublished,
    password: row.password || null,
    playerCount: (row.players || []).length,
    maxPlayers: row.settings?.maxPlayers || 0,
    isOwnLobby: true,
  }) ? [row] : [];
  const mine = buildMyGamesBoard({ games, waitingLobbies: [row] });
  const ids = [...open.map((item) => item.id), ...mine.map((item) => item.id)];
  return { open, mine, ids };
}

const before = project(lobby);
check('listed lobby is one Open Games row and one My Games row',
  before.open.length === 1 && before.mine.length === 1 && before.mine[0].kind === 'lobby');

const outcome = lobbyChromeStatusAfter({
  action: 'unlist',
  isPublished: true,
  isHost: true,
});
check('unlist only clears the published flag',
  outcome.allowed === true && outcome.isPublished === false && outcome.navigate === null);

const unlisted = { ...lobby, isPublished: outcome.isPublished };
const after = project(unlisted, []);
const mineForLobby = after.mine.filter((row) => row.id === lobby.id || row.code === lobby.code);
check('after unlist, My Games still has exactly one entry for that lobby',
  mineForLobby.length === 1 && mineForLobby[0].id === 'lobby-txvkjb');
check('after unlist, Open Games has no row for that lobby', after.open.length === 0);
check('unlist does not invent a second game id',
  new Set(after.ids).size === after.ids.length && after.ids.length === 1 && after.ids[0] === lobby.id);

const again = lobbyChromeStatusAfter({
  action: 'unlist',
  isPublished: false,
  isHost: true,
});
const twice = project({ ...unlisted, isPublished: again.isPublished }, []);
check('unlisting again stays a single My Games row',
  twice.mine.length === 1 && twice.open.length === 0 && twice.ids[0] === lobby.id);

console.log(failures === 0
  ? '\nUNLIST SINGLE-GAME: not reproduced (one lobby row after unlist)'
  : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
