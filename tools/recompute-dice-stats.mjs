// Rebuild diceStats totals from a JSON export of diceBatches.
// No credentials and no network.
//
//   node tools/recompute-dice-stats.mjs export.json
//
// export.json is an array of raw batch docs, or { diceBatches: [...] }.
// Each doc: { id?, gameId, round, seq, writerUid, context, side, playerSeat,
//             isAI, playerName?, dice:[{unit,need,face}] }.
// Duplicate ids are ignored so a retried export cannot double-count.
// Runs, transitions, and streaks are per raw batch (they do not cross
// batch boundaries), matching the live increment() totals.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import {
  applyDiceBatch,
  batchDocId,
  emptyTotals,
  flattenTotals,
} from '../src/stats/diceMath.js';

export function recordsFromExport(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.diceBatches)) return parsed.diceBatches;
  if (Array.isArray(parsed?.batches)) return parsed.batches;
  return [];
}

export function rebuildDiceStats(records) {
  const ordered = recordsFromExport(records).slice().sort((a, b) => {
    const round = (Number(a?.round) || 0) - (Number(b?.round) || 0);
    if (round) return round;
    return (Number(a?.seq) || 0) - (Number(b?.seq) || 0);
  });
  const seen = new Set();
  const global = emptyTotals();
  const games = new Map();
  const players = new Map();

  for (const rec of ordered) {
    if (!rec || !Array.isArray(rec.dice)) continue;
    const id = rec.id || batchDocId({
      gameId: rec.gameId,
      round: rec.round,
      seq: rec.seq,
      uid: rec.writerUid,
    });
    if (seen.has(id)) continue;
    seen.add(id);
    applyDiceBatch(global, rec.dice, rec);
    const gameId = rec.gameId || 'solo';
    if (!games.has(gameId)) games.set(gameId, emptyTotals());
    applyDiceBatch(games.get(gameId), rec.dice, rec);
    if (!rec.isAI && rec.writerUid) {
      if (!players.has(rec.writerUid)) players.set(rec.writerUid, emptyTotals());
      applyDiceBatch(players.get(rec.writerUid), rec.dice, rec);
    }
  }

  const out = {
    global: flattenTotals(global, { includeSeats: false }),
    games: {},
    players: {},
    batches: seen.size,
  };
  out.global.longestStreak = global.longestStreak;
  for (const [gameId, totals] of games) {
    const flat = flattenTotals(totals, { includeSeats: true });
    flat.longestStreak = totals.longestStreak;
    out.games[gameId] = flat;
  }
  for (const [uid, totals] of players) {
    const flat = flattenTotals(totals, { includeSeats: false, names: false });
    flat.longestStreak = totals.longestStreak;
    out.players[uid] = flat;
  }
  return out;
}

function isDirectRun() {
  const entry = process.argv[1] ? resolve(process.argv[1]) : '';
  return entry && fileURLToPath(import.meta.url) === entry;
}

if (isDirectRun()) {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node tools/recompute-dice-stats.mjs export.json');
    process.exit(1);
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  console.log(JSON.stringify(rebuildDiceStats(parsed), null, 2));
}
