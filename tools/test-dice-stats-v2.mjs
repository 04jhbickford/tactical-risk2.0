// V2.81.57-unified.19 — dice stats panel, sentences, lobby entry, backfill.
// Run: node tools/test-dice-stats-v2.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  SENTENCE_FAIR,
  SENTENCE_UNUSUAL,
  SENTENCE_WATCH,
  VERDICT_FAIR,
  faceVerdict,
  faceVerdictSentence,
} from '../src/stats/diceMath.js';
import {
  DICE_STATS_EMPTY,
  DICE_STATS_SIGN_IN,
  lobbyDiceEntryMarkup,
  renderDiceStatsFromModel,
} from '../src/ui/diceStatsPanel.js';
import {
  collectBackfillRecords,
  diffRebuiltStats,
  rebuildDiceStats,
  statDocFromFlat,
} from './recompute-dice-stats.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const even = {
  n: 600,
  face_1: 100, face_2: 100, face_3: 100, face_4: 100, face_5: 100, face_6: 100,
  longestStreak: 3,
};

console.log('=== sentences ===');
check('p 0.06 is fair', faceVerdict(0.06, 10) === VERDICT_FAIR && faceVerdictSentence(0.06, 10) === SENTENCE_FAIR);
check('p just over 0.05 is fair', faceVerdictSentence(0.0501, 400) === SENTENCE_FAIR);
check('p 0.05 is worth watching', faceVerdictSentence(0.05, 400) === SENTENCE_WATCH);
check('p 0.02 is worth watching', faceVerdictSentence(0.02, 100) === SENTENCE_WATCH);
check('p 0.01 with 299 rolls stays worth watching', faceVerdictSentence(0.01, 299) === SENTENCE_WATCH);
check('p 0.01 with 300 rolls is unusual', faceVerdictSentence(0.01, 300) === SENTENCE_UNUSUAL);
check('p under 0.01 with 300 rolls is unusual', faceVerdictSentence(0.009, 300) === SENTENCE_UNUSUAL);
check('empty sample has no sentence', faceVerdictSentence(null, 0) == null);

console.log('=== scopes ===');
{
  const all = renderDiceStatsFromModel({ status: 'ready', signedIn: true, tab: 'all', globalDoc: even });
  check('all-time sentence', all.includes(SENTENCE_FAIR) && all.includes('Looks fair'));
  check('all-time chi-square and p', all.includes('Chi-square 0.00') && all.includes('p='));
  check('all-time paired bars', all.includes('dice-bar-fill') && all.includes('dice-bar-expected'));
  check('all-time sample size', all.includes('600 rolls'));
  check('all-time caveat', all.includes('all-time verdict counts'));

  const game = renderDiceStatsFromModel({ status: 'ready', signedIn: true, tab: 'game', gameDoc: even });
  check('this game sentence', game.includes(SENTENCE_FAIR) && game.includes('Chi-square'));

  const players = renderDiceStatsFromModel({
    status: 'ready',
    signedIn: true,
    tab: 'players',
    playerScope: 'game',
    gameDoc: {
      n: 12,
      name_p1: 'Robert',
      seat_p1_face_1: 2, seat_p1_face_2: 2, seat_p1_face_3: 2,
      seat_p1_face_4: 2, seat_p1_face_5: 2, seat_p1_face_6: 2,
      seat_p1_atk_dice: 12, seat_p1_atk_hits: 2, seat_p1_atk_sumP: 2, seat_p1_atk_sumVar: 1,
      name_ai1: 'German Easy AI',
      seat_ai1_ai: true,
      seat_ai1_face_6: 6,
      seat_ai1_def_dice: 6, seat_ai1_def_hits: 2, seat_ai1_def_sumP: 2, seat_ai1_def_sumVar: 1,
    },
  });
  check('this game scope switch', players.includes('data-dice-scope="game"') && players.includes('All games'));
  check('this game splits humans and AI', players.includes('Robert') && players.includes('German Easy AI')
    && players.includes('>Players<') && players.includes('>AI<'));
  check('this game player faces and rates', players.includes('Chi-square') && players.includes('Attack') && players.includes('Defense'));
  check('this game hides email and uid', !players.includes('@') && !players.includes('uid'));

  const allGames = renderDiceStatsFromModel({
    status: 'ready',
    signedIn: true,
    tab: 'players',
    playerScope: 'all',
    playerDocs: [{
      displayName: 'Robert',
      n: 6,
      face_1: 1, face_2: 1, face_3: 1, face_4: 1, face_5: 1, face_6: 1,
      u_infantry_attacker_dice: 6,
      u_infantry_attacker_hits: 1,
      u_infantry_attacker_sumP: 1,
      u_infantry_attacker_sumVar: 0.8,
    }, {
      displayName: 'secret@example.com',
      n: 6,
      face_1: 6,
      u_infantry_defender_dice: 6,
      u_infantry_defender_hits: 2,
      u_infantry_defender_sumP: 2,
      u_infantry_defender_sumVar: 1,
    }],
    gameDocs: [{
      name_g: 'German Easy AI',
      seat_g_ai: true,
      seat_g_face_1: 3, seat_g_face_2: 3,
      seat_g_atk_dice: 6, seat_g_atk_hits: 1, seat_g_atk_sumP: 1, seat_g_atk_sumVar: 0.8,
    }],
  });
  check('all games shows both players and AI', allGames.includes('Robert') && allGames.includes('German Easy AI')
    && allGames.includes('>Players<') && allGames.includes('>AI<'));
  check('all games drops the email', allGames.includes('>Player<') && !allGames.includes('secret@example.com') && !allGames.includes('@'));
  check('all games has face verdict and hit rate', allGames.includes(SENTENCE_FAIR) && allGames.includes('Attack') && allGames.includes('Defense'));
}

console.log('=== lobby ===');
{
  const guest = renderDiceStatsFromModel({ status: 'disabled', signedIn: false, placement: 'lobby', tab: 'all' });
  check('guest lobby sign-in line', guest.includes(DICE_STATS_SIGN_IN));
  check('guest lobby has no player tab', !guest.includes('data-dice-tab="players"'));
  const unpublished = renderDiceStatsFromModel({ status: 'disabled', signedIn: true, placement: 'lobby', tab: 'all' });
  check('signed-in unpublished keeps the enabled line', unpublished.includes(DICE_STATS_EMPTY));
  const signed = renderDiceStatsFromModel({
    status: 'ready', signedIn: true, placement: 'lobby', tab: 'all', globalDoc: even,
  });
  check('signed-in lobby all-time', signed.includes('All-time') && signed.includes(SENTENCE_FAIR) && !signed.includes('data-dice-tab="game"'));
  const signedPlayers = renderDiceStatsFromModel({
    status: 'ready',
    signedIn: true,
    placement: 'lobby',
    tab: 'players',
    playerDocs: [{ displayName: 'Robert', n: 6, face_1: 6 }],
  });
  check('signed-in lobby players are all games', signedPlayers.includes('Robert') && !signedPlayers.includes('data-dice-scope="game"'));
  const entry = lobbyDiceEntryMarkup({ phone: true });
  check('lobby entry button', entry.includes('Dice stats') && entry.includes('data-action="dice-stats"'));
  const home = readFileSync(join(root, 'src/ui/lobby.js'), 'utf8');
  const hub = readFileSync(join(root, 'src/ui/multiplayerLobby.js'), 'utf8');
  check('home menu renders the entry', home.includes('lobbyDiceEntryMarkup'));
  check('online hub renders the entry', hub.includes('lobbyDiceEntryMarkup'));
  const inGame = renderDiceStatsFromModel({ status: 'disabled', signedIn: false, tab: 'players' });
  check('in-game guest keeps the enabled line', inGame.includes(DICE_STATS_EMPTY) && !inGame.includes(DICE_STATS_SIGN_IN));
}

console.log('=== backfill ===');
{
  const batch = {
    id: 'G_1_1_uid',
    gameId: 'G',
    round: 1,
    seq: 1,
    writerUid: 'uid1',
    context: 'combat',
    side: 'attacker',
    playerSeat: 'p1',
    isAI: false,
    playerName: 'Robert',
    dice: [{ unit: 'infantry', need: 1, face: 1 }, { unit: 'infantry', need: 1, face: 2 }],
  };
  const dup = { ...batch, dice: [{ unit: 'infantry', need: 1, face: 6 }] };
  const once = rebuildDiceStats([batch, dup]);
  const twice = rebuildDiceStats([batch, dup]);
  check('rebuild is idempotent', JSON.stringify(once) === JSON.stringify(twice) && once.global.inc.n === 2);

  const oldGame = {
    id: 'OLD',
    state: {
      combatTelemetry: [{
        kind: 'combat',
        round: 2,
        territory: 'France',
        attackRolls: [1, 6],
        attackForce: [{ type: 'infantry', quantity: 2 }],
        defenseRolls: [3],
        defenseForce: [{ type: 'infantry', quantity: 4 }],
      }, {
        kind: 'aa',
        round: 2,
        territory: 'France',
        rolls: [1, 6],
      }],
    },
  };
  const filled = collectBackfillRecords({ batches: [], games: [oldGame], events: [] });
  check('telemetry faces become backfill', filled.records.length === 3 && filled.records.every((row) => row.source === 'backfill'));
  const attack = filled.records.find((row) => row.side === 'attacker');
  check('matching force keeps unit and need', attack.dice[0].unit === 'infantry' && attack.dice[0].need === 1 && attack.dice[0].face === 1);
  const defense = filled.records.find((row) => row.side === 'defender' && row.context === 'combat');
  check('truncated force is faces only', defense.dice[0].unit === '' && defense.dice[0].need == null && defense.dice[0].face === 3);
  check('aa faces use the gun', filled.records.some((row) => row.context === 'aa' && row.dice[0].unit === 'aaGun' && row.dice[0].need === 1));

  const rebuilt = rebuildDiceStats([...filled.records]);
  const rebuiltAgain = rebuildDiceStats([...filled.records, ...filled.records]);
  check('backfill rebuild is idempotent', rebuilt.global.inc.n === 5 && rebuiltAgain.global.inc.n === 5
    && JSON.stringify(rebuilt) === JSON.stringify(rebuiltAgain));
  check('backfill does not create a player doc', Object.keys(rebuilt.players).length === 0);
  check('backfill tags the game total', rebuilt.games.OLD.backfillDice === 5);

  const skipped = collectBackfillRecords({
    batches: [batch],
    games: [{ ...oldGame, id: 'G' }],
    events: [{
      gameId: 'G',
      kind: 'combat',
      turn: 2,
      territory: 'France',
      payload: { attackRolls: [4], defenseRolls: [] },
    }],
  });
  check('tracked games skip historical faces', skipped.records.length === 0 && skipped.report.gamesSkippedTracked === 1);

  const bare = collectBackfillRecords({
    batches: [],
    games: [{ id: 'EMPTY', state: { combatTelemetry: [{ kind: 'combat', hits: 1 }] } }],
    events: [{
      gameId: 'EMPTY',
      kind: 'combat',
      turn: 4,
      territory: 'Libya',
      payload: { attackRolls: [2, 2], forcesBefore: { attack: [{ type: 'artillery', quantity: 2 }] } },
    }],
  });
  check('events supply faces when telemetry has none', bare.report.eventsUsed === 1 && bare.records[0].dice[0].unit === 'artillery');
  const overlap = collectBackfillRecords({
    batches: [],
    games: [oldGame],
    events: [{
      gameId: 'OLD',
      kind: 'combat',
      turn: 2,
      territory: 'France',
      payload: {
        attackRolls: [1, 6],
        defenseRolls: [3],
        forcesBefore: { attack: [{ type: 'infantry', quantity: 2 }] },
      },
    }],
  });
  check('the same event is not added twice', overlap.records.length === filled.records.length && overlap.report.eventsUsed === 0);

  const quiet = collectBackfillRecords({
    batches: [],
    games: [{ id: 'QUIET', state: {} }],
    events: [{ gameId: 'QUIET', kind: 'phase', payload: { note: 'no dice' } }],
  });
  check('logs without faces stay out', quiet.records.length === 0 && quiet.report.gamesWithoutFaces === 1);

  const current = {
    global: statDocFromFlat(once.global),
    games: { G: statDocFromFlat(once.games.G) },
    players: { uid1: statDocFromFlat(once.players.uid1) },
  };
  check('a second rebuild diffs clean', diffRebuiltStats(current, once).length === 0);
  check('display name is kept and email is not a stat', once.players.uid1.displayName === 'Robert');
}

console.log('=== rules untouched ===');
{
  const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
  check('diceBatches block is still create-only', rules.includes('match /diceBatches/{batchId}')
    && rules.includes('allow update, delete: if false;'));
  check('diceStats ids are unchanged', rules.includes("statId == 'global'")
    && rules.includes("statId.matches('^game_[A-Za-z0-9_\\\\-]{1,80}$')")
    && rules.includes("player_' + request.auth.uid"));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall dice stats v2 checks passed');
