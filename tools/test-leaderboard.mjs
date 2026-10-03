// Leaderboards and participate/reset prefs.
// Run: node tools/test-leaderboard.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_VERSION, SCHEMA_VERSION } from '../src/version.js';
import {
  gameTypeId,
  leaderboardRows,
  leaderboardVerdict,
  planRecord,
  publicName,
  renderLeaderboardPage,
  renderLeaderboardPrefs,
  resetScores,
  scoreTotals,
  seatToRecord,
  serializeRecord,
} from '../src/multiplayer/leaderboard.js';
import {
  LEADERBOARD_COLLECTION,
  loadLeaderboardView,
  recordLeaderboardGame,
  resetLeaderboardScores,
  setLeaderboardOptOut,
} from '../src/multiplayer/leaderboardStore.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const check = (label, cond) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label);
  } else console.log('ok  :', label);
};

function memoryStore() {
  const data = new Map();
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
  };
}

function ended(extra = {}) {
  return {
    gameOver: true,
    winner: 'Bastion',
    winCondition: 'Last player standing',
    round: 4,
    mapId: 'classic',
    isMultiplayer: false,
    teamsEnabled: false,
    players: [
      { id: 'germans', name: 'Bastion', isAI: false, alliance: 'Axis' },
      { id: 'russians', name: 'Easy AI', isAI: true, alliance: 'Allies' },
    ],
    ...extra,
  };
}

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  check('display stamp is V2.81.57-unified.59', GAME_VERSION === 'V2.81.57-unified.59');
  check('schema stays 11', SCHEMA_VERSION === 11);
  const gameStateSrc = readFileSync(join(root, 'src/state/gameState.js'), 'utf8');
  check('game-state json stays version 11', /version:\s*11/.test(gameStateSrc));
  check('leaderboard is outside game-state json', !/leaderboard/i.test(gameStateSrc));
  check('index.html carries the display stamp',
    html.includes('content="V2.81.57-unified.59"')
    && html.includes("window.__TR_GAME_VERSION = 'V2.81.57-unified.59'")
    && html.includes("var LOCKED = 'V2.81.57-unified.59'")
    && html.includes('style.css?v=V2.81.57-unified.59')
    && html.includes('src/main.js?v=V2.81.57-unified.59'));
}

console.log('=== game types ===');
check('classic local', gameTypeId({ mapId: 'classic', isMultiplayer: false }) === 'classic-local');
check('classic online', gameTypeId({ mapId: 'classic', isMultiplayer: true }) === 'classic-online');
check('pacific local', gameTypeId({ mapId: 'pacific', isMultiplayer: false }) === 'pacific-local');
check('pacific online', gameTypeId({ mapId: 'pacific', isMultiplayer: true }) === 'pacific-online');
check('missing map is classic', gameTypeId({ isMultiplayer: false }) === 'classic-local');

console.log('=== who is recorded ===');
{
  const solo = ended();
  check('unsigned solo records the human', seatToRecord(solo, null)?.id === 'germans');
  check('AI is not a seat', seatToRecord({
    ...solo,
    players: [{ id: 'russians', name: 'Easy AI', isAI: true }],
  }, null) == null);
  const hotseat = ended({
    players: [
      { id: 'germans', name: 'Ann', isAI: false },
      { id: 'russians', name: 'Bob', isAI: false },
    ],
  });
  check('unsigned hotseat has no user', seatToRecord(hotseat, null) == null);
  check('signed-in hotseat without a seat id is skipped', seatToRecord(hotseat, 'uid') == null);
  check('signed-in solo uses the only human', seatToRecord(solo, 'uid')?.name === 'Bastion');
  const online = ended({
    isMultiplayer: true,
    players: [
      { id: 'germans', name: 'Bastion', isAI: false, oderId: 'uid1' },
      { id: 'russians', name: 'Other', isAI: false, oderId: 'uid2' },
    ],
  });
  check('online records only the signed-in seat', seatToRecord(online, 'uid2')?.id === 'russians');
  check('online ignores a stranger', seatToRecord(online, 'uid9') == null);
  check('a game that is not over is skipped', planRecord(null, { ...solo, gameOver: false }, {}).skipped === 'not-over');
  check('game over with no winner is skipped', planRecord(null, { ...solo, winner: null }, {}).skipped === 'not-over');
}

console.log('=== outcomes ===');
{
  const win = planRecord(null, ended(), { userId: null });
  check('solo win is classic local', win.typeId === 'classic-local' && win.outcome === 'win' && win.skipped == null);
  check('one win, one played', scoreTotals(win.record).wins === 1 && scoreTotals(win.record).played === 1 && scoreTotals(win.record).losses === 0);
  const again = planRecord(win.record, ended(), { userId: null });
  check('the same finish is not counted twice', again.skipped === 'seen' && scoreTotals(again.record).wins === 1);

  const pacific = ended({
    mapId: 'pacific',
    isMultiplayer: true,
    winner: 'Axis',
    players: [
      { id: 'Americans', name: 'Bastion', isAI: false, alliance: 'Allies', oderId: 'uid1' },
      { id: 'Japanese', name: 'Japan', isAI: false, alliance: 'Axis', oderId: 'uid2' },
    ],
  });
  const loss = planRecord(null, pacific, { userId: 'uid1', gameId: 'GAME1' });
  const axis = planRecord(null, pacific, { userId: 'uid2', gameId: 'GAME1' });
  check('pacific online loss', loss.typeId === 'pacific-online' && loss.outcome === 'loss');
  check('pacific online win', axis.typeId === 'pacific-online' && axis.outcome === 'win');
  check('other account is not written', planRecord(null, pacific, { userId: 'uid9', gameId: 'GAME1' }).skipped === 'no-seat');

  const teams = ended({
    teamsEnabled: true,
    winner: 'Team 1',
    isMultiplayer: true,
    players: [
      { id: 'a', name: 'Ann', isAI: false, teamId: 1, oderId: 'uid1' },
      { id: 'b', name: 'Bob', isAI: false, teamId: 2, oderId: 'uid2' },
    ],
  });
  check('team mate wins', planRecord(null, teams, { userId: 'uid1', gameId: 'T' }).outcome === 'win');
  check('other team loses', planRecord(null, teams, { userId: 'uid2', gameId: 'T' }).outcome === 'loss');

  const quit = ended({
    winner: 'Easy AI',
    players: [
      { id: 'germans', name: 'Bastion', isAI: false, surrendered: true },
      { id: 'russians', name: 'Easy AI', isAI: true },
    ],
  });
  check('surrendered human loses', planRecord(null, quit, {}).outcome === 'loss');
  check('email is not a display name', publicName('a@b.c', 'You') === 'You');
  const saved = serializeRecord(win.record);
  check('saved row has no email field', !Object.prototype.hasOwnProperty.call(saved, 'email'));
}

console.log('=== opt out and reset ===');
{
  const win = planRecord(null, ended(), {}).record;
  const hidden = planRecord({ ...win, optOut: true, seen: [] }, ended({ round: 5 }), {});
  check('opt-out records nothing', hidden.skipped === 'opt-out' && scoreTotals(hidden.record).wins === 1 && scoreTotals(hidden.record).played === 1);
  check('opt-out still marks the game seen', hidden.record.seen.length === 1);
  const cleared = resetScores(win);
  check('reset zeros scores and keeps the seen game', scoreTotals(cleared).played === 0 && cleared.seen.length === win.seen.length);
  check('seen game does not return after reset', planRecord(cleared, ended(), {}).skipped === 'seen');
  const rows = leaderboardRows([
    { ...win, id: 'uid1', displayName: 'Bastion' },
    { id: 'uid2', displayName: 'Hidden', optOut: true, scores: win.scores, seen: [] },
    { id: 'uid3', displayName: 'New', optOut: false, scores: {}, seen: [] },
  ]);
  check('opt-out and empty rows stay off the board', rows.length === 1 && rows[0].displayName === 'Bastion');
  check('verdict counts players', leaderboardVerdict({ status: 'ready', signedIn: true, self: { optOut: false }, rows }) === '1 player');
  const page = renderLeaderboardPage({
    status: 'ready',
    signedIn: true,
    self: { id: 'uid1', optOut: false },
    rows,
  });
  check('page shows the type and the totals',
    page.includes('Classic · Local')
    && page.includes('1 win · 0 losses · 1 game')
    && page.includes('Bastion · You')
    && !page.includes('@'));
  const prefs = renderLeaderboardPrefs({ id: 'local', optOut: false }, {});
  check('preferences are only participate and reset',
    prefs.includes("Don't participate")
    && prefs.includes('Reset my scores')
    && prefs.includes('data-action="lb-opt-out"')
    && !/PMC|Corpo|faction theme/i.test(prefs));
  const armed = renderLeaderboardPrefs({ id: 'local', optOut: true }, { resetArmed: true });
  check('reset asks once', armed.includes('Confirm reset') && armed.includes('You are not on the board.'));
}

console.log('=== device store ===');
{
  const storage = memoryStore();
  const first = await recordLeaderboardGame(ended(), { user: null, storage });
  check('unsigned solo win is stored', first.skipped == null && first.record.scores['classic-local'].wins === 1);
  const second = await recordLeaderboardGame(ended(), { user: null, storage });
  check('reopen does not double count', second.skipped === 'seen');
  const view = await loadLeaderboardView(null, storage);
  check('device board shows this device',
    view.status === 'signed-out'
    && view.rows.length === 1
    && view.rows[0].displayName === 'This device'
    && view.rows[0].played === 1);
  check('guest verdict', leaderboardVerdict(view) === '1 player on this device. Sign in to see other players.');
  await setLeaderboardOptOut(null, true, storage);
  const hidden = await loadLeaderboardView(null, storage);
  check('opt-out hides the device row', hidden.rows.length === 0 && hidden.self.optOut === true);
  check('opt-out guest verdict', leaderboardVerdict(hidden) === 'You are not listed. Sign in to see other players.');
  await setLeaderboardOptOut(null, false, storage);
  const back = await loadLeaderboardView(null, storage);
  check('opting back in shows the old scores', back.rows.length === 1 && back.rows[0].wins === 1);
  await resetLeaderboardScores(null, storage);
  const cleared = await loadLeaderboardView(null, storage);
  check('reset clears the device row', cleared.rows.length === 0 && cleared.self.optOut === false);
  const replay = await recordLeaderboardGame(ended(), { user: null, storage });
  check('the cleared game stays seen', replay.skipped === 'seen');
  const next = await recordLeaderboardGame(ended({ round: 9 }), { user: null, storage });
  check('a new finish counts after reset', next.skipped == null && next.record.scores['classic-local'].wins === 1);
}

console.log('=== wiring ===');
{
  const lobby = readFileSync(join(root, 'src/ui/lobby.js'), 'utf8');
  const main = readFileSync(join(root, 'src/main.js'), 'utf8');
  const victory = readFileSync(join(root, 'src/ui/victoryScreen.js'), 'utf8');
  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
  const store = readFileSync(join(root, 'src/multiplayer/leaderboardStore.js'), 'utf8');
  check('main menu has a fourth Leaderboards card on phone and desktop',
    lobby.indexOf('data-action="leaderboards"') !== lobby.lastIndexOf('data-action="leaderboards"'));
  check('preferences sit in the leaderboard flow',
    lobby.includes('data-action="lb-prefs"')
    && lobby.includes('renderLeaderboardPrefs'));
  check('a finished game records from the victory screen',
    main.includes('recordLeaderboardGame')
    && victory.includes('onGameOver')
    && victory.includes("classList.add('visible')"));
  check('victory button says Quit game and still reloads to the menu',
    victory.includes('>Quit game</button>')
    && victory.includes('window.location.reload()')
    && !victory.includes('>New Game</button>')
    && !/Play again/i.test(victory));
  check('rules allow a player to write only their own board',
    rules.includes('match /leaderboards/{userId}')
    && rules.includes('request.auth.uid == userId')
    && rules.includes("!('email' in request.resource.data)"));
  check('firestore collection name', LEADERBOARD_COLLECTION === 'leaderboards' && store.includes('LEADERBOARD_COLLECTION'));
}

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('leaderboard ok');
