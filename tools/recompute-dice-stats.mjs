// Rebuild diceStats totals from diceBatches, plus pre-tracker combat logs.
//
// Offline (no credentials, safe in CI):
//   node tools/recompute-dice-stats.mjs export.json
// export.json is an array of raw batch docs, or { diceBatches: [...] }.
//
// Admin Firestore (by hand, never in CI). Dry-run is the default.
//   GOOGLE_APPLICATION_CREDENTIALS=/path/sa.json node tools/recompute-dice-stats.mjs
//   GOOGLE_APPLICATION_CREDENTIALS=/path/sa.json node tools/recompute-dice-stats.mjs --commit
// Do not add firebase-admin to this repo's package.json. Install it beside
// the checkout if it is not already on NODE_PATH. Publishing rules is manual.
//
// Historical faces: game docs persist state.combatTelemetry (last 40 rounds)
// with attackRolls, defenseRolls, and AA rolls. Each list is integer faces
// capped at 24. games/{id}/events kind combat|aa copies that payload and is
// admin-read. Those logs do not store {unit, need, face}. This script turns
// them into virtual batches tagged source:'backfill' when diceBatches do not
// already cover that game. Unit and need are filled only when the face count
// equals the force quantity (data/units.json). Otherwise the faces count
// toward fairness only. There is no per-die owner, so backfill does not
// create player_* docs. A second run reads the same inputs and writes the
// same absolute totals.

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import {
  applyDiceBatch,
  batchDocId,
  emptyTotals,
  flattenTotals,
  safeDisplayName,
  safeIdPart,
} from '../src/stats/diceMath.js';

const units = JSON.parse(readFileSync(new URL('../data/units.json', import.meta.url), 'utf8'));

export const HISTORICAL_DICE_NOTE = [
  'Pre-tracker dice are not in diceBatches.',
  'state.combatTelemetry and games/{id}/events (kind combat or aa) store face lists, capped at 24, without per-die unit, need, or owner.',
  'Faces are included as source:backfill only for games with no diceBatches.',
  'Unit and need are recovered when the face count matches the force size. Otherwise faces count toward fairness only.',
  'Backfill does not write player docs.',
].join(' ');

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
  const playerNames = new Map();
  const backfillByGame = new Map();

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
    if (rec.source === 'backfill') {
      backfillByGame.set(gameId, (backfillByGame.get(gameId) || 0) + rec.dice.length);
    }
    if (!rec.isAI && rec.writerUid && rec.source !== 'backfill') {
      if (!players.has(rec.writerUid)) players.set(rec.writerUid, emptyTotals());
      applyDiceBatch(players.get(rec.writerUid), rec.dice, rec);
      const name = safeDisplayName(rec.playerName);
      if (name) playerNames.set(rec.writerUid, name);
    }
  }

  const out = {
    global: flattenTotals(global, { includeSeats: false }),
    games: {},
    players: {},
    batches: seen.size,
    backfillDice: [...backfillByGame.values()].reduce((sum, n) => sum + n, 0),
  };
  out.global.longestStreak = global.longestStreak;
  for (const [gameId, totals] of games) {
    const flat = flattenTotals(totals, { includeSeats: true });
    flat.longestStreak = totals.longestStreak;
    if (backfillByGame.get(gameId)) flat.backfillDice = backfillByGame.get(gameId);
    out.games[gameId] = flat;
  }
  for (const [uid, totals] of players) {
    const flat = flattenTotals(totals, { includeSeats: false, names: false });
    flat.longestStreak = totals.longestStreak;
    const name = playerNames.get(uid);
    if (name) flat.displayName = name;
    out.players[uid] = flat;
  }
  return out;
}

function faceList(value) {
  return (Array.isArray(value) ? value : [])
    .map((n) => Number(n))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 6);
}

function expandForce(force, side) {
  const out = [];
  for (const unit of Array.isArray(force) ? force : []) {
    const type = unit?.type || '';
    const qty = Math.max(0, Math.floor(Number(unit?.quantity) || 0));
    const def = units[type] || {};
    const need = side === 'defender' ? def.defense : def.attack;
    for (let i = 0; i < qty; i += 1) {
      out.push({
        unit: type,
        need: Number.isFinite(Number(need)) ? Number(need) : null,
      });
    }
  }
  return out;
}

function diceFromFaces(faces, side, { unit = '', need = null, zip = null } = {}) {
  return faces.map((face, index) => {
    const matched = zip && zip[index] ? zip[index] : null;
    return {
      unit: matched ? matched.unit : unit,
      need: matched ? matched.need : need,
      face,
    };
  });
}

export function faceSignature(entry) {
  const join = (list) => faceList(list).join('.');
  return [
    entry?.round ?? entry?.turn ?? '',
    entry?.kind || '',
    entry?.territory || '',
    join(entry?.attackRolls),
    join(entry?.defenseRolls),
    join(entry?.rolls),
  ].join('|');
}

function pushSlice(records, { gameId, round, kind, side, context, dice, seq }) {
  if (!dice.length) return seq;
  const next = seq + 1;
  records.push({
    id: `backfill_${safeIdPart(gameId, 'game')}_${Number(round) || 0}_${safeIdPart(kind, 'combat')}_${next}_${side}`,
    gameId,
    round: Number(round) || 0,
    seq: next,
    source: 'backfill',
    context,
    side,
    playerSeat: '',
    isAI: false,
    writerUid: '',
    dice,
  });
  return next;
}

export function telemetryEntryToRecords(entry, { gameId, seq = 0 } = {}) {
  const records = [];
  if (!entry || !gameId) return { records, seq, zipped: 0, faceOnly: 0 };
  const kind = entry.kind === 'aa' ? 'aa' : 'combat';
  const round = entry.round ?? entry.turn ?? 0;
  let zipped = 0;
  let faceOnly = 0;
  let cursor = seq;

  if (kind === 'aa') {
    const faces = faceList(entry.rolls);
    if (faces.length) {
      cursor = pushSlice(records, {
        gameId, round, kind, side: 'defender', context: 'aa', seq: cursor,
        dice: diceFromFaces(faces, 'defender', { unit: 'aaGun', need: 1 }),
      });
      zipped += faces.length;
    }
    return { records, seq: cursor, zipped, faceOnly };
  }

  const sides = [
    ['attacker', 'attackRolls', 'attackForce', 'attack'],
    ['defender', 'defenseRolls', 'defenseForce', 'defense'],
  ];
  for (const [side, rollKey, forceKey] of sides) {
    const faces = faceList(entry[rollKey]);
    if (!faces.length) continue;
    const force = expandForce(entry[forceKey] || entry.forcesBefore?.[side === 'attacker' ? 'attack' : 'defense'], side);
    const matched = force.length === faces.length;
    cursor = pushSlice(records, {
      gameId, round, kind, side, context: 'combat', seq: cursor,
      dice: diceFromFaces(faces, side, { zip: matched ? force : null }),
    });
    if (matched) zipped += faces.length;
    else faceOnly += faces.length;
  }
  return { records, seq: cursor, zipped, faceOnly };
}

function entryHasFaces(entry) {
  return faceList(entry?.attackRolls).length
    || faceList(entry?.defenseRolls).length
    || faceList(entry?.rolls).length;
}

export function collectBackfillRecords({ batches = [], games = [], events = [] } = {}) {
  const tracked = new Set((batches || []).map((row) => row?.gameId).filter(Boolean));
  const records = [];
  const seen = new Set();
  const report = {
    gamesSeen: 0,
    gamesWithFaces: 0,
    gamesSkippedTracked: 0,
    gamesWithoutFaces: 0,
    eventsUsed: 0,
    zippedDice: 0,
    faceOnlyDice: 0,
    note: HISTORICAL_DICE_NOTE,
  };

  const take = (entry, gameId) => {
    if (!entryHasFaces(entry)) return false;
    const sig = `${gameId}|${faceSignature(entry)}`;
    if (seen.has(sig)) return false;
    seen.add(sig);
    const built = telemetryEntryToRecords(entry, { gameId, seq: records.length });
    records.push(...built.records);
    report.zippedDice += built.zipped;
    report.faceOnlyDice += built.faceOnly;
    return true;
  };

  for (const game of games || []) {
    const gameId = game?.id || game?.gameId;
    if (!gameId) continue;
    report.gamesSeen += 1;
    if (tracked.has(gameId)) {
      report.gamesSkippedTracked += 1;
      continue;
    }
    const state = game.state || game;
    const telemetry = Array.isArray(state?.combatTelemetry) ? state.combatTelemetry : [];
    let faces = 0;
    for (const entry of telemetry) {
      if (take(entry, gameId)) faces += 1;
    }
    for (const event of events || []) {
      if (event?.gameId !== gameId) continue;
      if (event.kind !== 'combat' && event.kind !== 'aa') continue;
      const payload = event.payload || {};
      const entry = {
        kind: event.kind,
        round: event.turn ?? event.round ?? payload.round,
        territory: event.territory || payload.territory || null,
        attackRolls: payload.attackRolls,
        defenseRolls: payload.defenseRolls,
        rolls: payload.rolls,
        attackForce: payload.forcesBefore?.attack,
        defenseForce: payload.forcesBefore?.defense,
      };
      if (take(entry, gameId)) {
        faces += 1;
        report.eventsUsed += 1;
      }
    }
    if (faces) report.gamesWithFaces += 1;
    else report.gamesWithoutFaces += 1;
  }
  return { records, report };
}

export function statDocFromFlat(flat, extra = {}) {
  const data = { ...(flat?.inc || {}) };
  if (flat?.longestStreak) data.longestStreak = flat.longestStreak;
  Object.assign(data, flat?.names || {}, flat?.flags || {});
  if (flat?.displayName) data.displayName = flat.displayName;
  if (flat?.backfillDice) data.backfillDice = flat.backfillDice;
  if (extra.displayName) data.displayName = extra.displayName;
  return data;
}

function norm(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

export function diffStatDoc(current, next) {
  const left = current || {};
  const right = next || {};
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const changes = [];
  for (const key of keys) {
    const from = norm(left[key]);
    const to = norm(right[key]);
    if (from === to) continue;
    if (typeof from === 'number' && typeof to === 'number' && Math.abs(from - to) < 1e-9) continue;
    changes.push({ key, from, to });
  }
  return changes;
}

export function diffRebuiltStats(currentDocs, rebuilt) {
  const lines = [];
  const globalNext = statDocFromFlat(rebuilt.global);
  const globalDiff = diffStatDoc(currentDocs?.global, globalNext);
  if (globalDiff.length) lines.push({ id: 'global', changes: globalDiff });
  const gameIds = new Set([
    ...Object.keys(rebuilt.games || {}),
    ...Object.keys(currentDocs?.games || {}),
  ]);
  for (const gameId of gameIds) {
    const changes = diffStatDoc(currentDocs?.games?.[gameId], statDocFromFlat(rebuilt.games[gameId]));
    if (changes.length) lines.push({ id: `game_${gameId}`, changes });
  }
  const playerIds = new Set([
    ...Object.keys(rebuilt.players || {}),
    ...Object.keys(currentDocs?.players || {}),
  ]);
  for (const uid of playerIds) {
    const changes = diffStatDoc(currentDocs?.players?.[uid], statDocFromFlat(rebuilt.players[uid]));
    if (changes.length) lines.push({ id: `player_${uid}`, changes });
  }
  return lines;
}

function printDiff(lines) {
  if (!lines.length) {
    console.log('diff: none (rebuilt totals match the stored docs)');
    return;
  }
  console.log(`diff: ${lines.length} stat doc(s)`);
  for (const row of lines.slice(0, 40)) {
    console.log(`  ${row.id}`);
    for (const change of row.changes.slice(0, 12)) {
      console.log(`    ${change.key}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`);
    }
    if (row.changes.length > 12) console.log(`    … ${row.changes.length - 12} more fields`);
  }
  if (lines.length > 40) console.log(`  … ${lines.length - 40} more docs`);
}

function isDirectRun() {
  const entry = process.argv[1] ? resolve(process.argv[1]) : '';
  return entry && fileURLToPath(import.meta.url) === entry;
}

function argFile() {
  return process.argv.slice(2).find((arg) => arg && !arg.startsWith('--')) || '';
}

async function runFirestore(commit) {
  if (process.env.CI) {
    console.error('recompute-dice-stats: refusing Firestore access in CI');
    process.exit(1);
  }
  let admin;
  try {
    admin = (await import('firebase-admin')).default;
  } catch {
    console.error('firebase-admin is not installed. Install it outside this repo and set GOOGLE_APPLICATION_CREDENTIALS.');
    console.error(HISTORICAL_DICE_NOTE);
    process.exit(1);
  }
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.applicationDefault() });
  const db = admin.firestore();

  async function readCollection(name) {
    const out = [];
    let last = null;
    for (;;) {
      let query = db.collection(name).orderBy('__name__').limit(400);
      if (last) query = query.startAfter(last);
      const snap = await query.get();
      if (snap.empty) break;
      snap.forEach((doc) => out.push({ id: doc.id, ...doc.data() }));
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < 400) break;
    }
    return out;
  }

  const batches = await readCollection('diceBatches');
  const stats = await readCollection('diceStats');
  const games = await readCollection('games');
  const events = [];
  for (const game of games) {
    const state = game.state || {};
    const telemetry = Array.isArray(state.combatTelemetry) ? state.combatTelemetry : [];
    const hasTelemetryFaces = telemetry.some(entryHasFaces);
    if (hasTelemetryFaces) continue;
    const ev = await db.collection('games').doc(game.id).collection('events')
      .where('kind', 'in', ['combat', 'aa']).get();
    ev.forEach((doc) => events.push({ id: doc.id, gameId: game.id, ...doc.data() }));
  }

  const backfill = collectBackfillRecords({ batches, games, events });
  console.log(HISTORICAL_DICE_NOTE);
  console.log(JSON.stringify(backfill.report));
  const rebuilt = rebuildDiceStats([...batches, ...backfill.records]);
  const current = { global: null, games: {}, players: {} };
  for (const doc of stats) {
    const { id, ...data } = doc;
    if (id === 'global') current.global = data;
    else if (id.startsWith('game_')) current.games[id.slice(5)] = data;
    else if (id.startsWith('player_')) current.players[id.slice(7)] = data;
  }
  const lines = diffRebuiltStats(current, rebuilt);
  console.log(`batches ${batches.length}; backfill dice ${rebuilt.backfillDice}; stat docs ${stats.length}`);
  printDiff(lines);
  if (!commit) {
    console.log('dry-run: no writes. Pass --commit to replace diceStats with these totals.');
    return;
  }
  let batch = db.batch();
  let pending = 0;
  const queue = async (id, data) => {
    batch.set(db.collection('diceStats').doc(id), data);
    pending += 1;
    if (pending >= 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  };
  await queue('global', statDocFromFlat(rebuilt.global));
  for (const [gameId, flat] of Object.entries(rebuilt.games)) {
    await queue(`game_${safeIdPart(gameId, 'game')}`, statDocFromFlat(flat));
  }
  for (const [uid, flat] of Object.entries(rebuilt.players)) {
    await queue(`player_${safeIdPart(uid, 'uid')}`, statDocFromFlat(flat));
  }
  if (pending) await batch.commit();
  console.log('commit: diceStats replaced from diceBatches + backfill');
}

if (isDirectRun()) {
  const file = argFile();
  const commit = process.argv.includes('--commit');
  if (file) {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    console.log(JSON.stringify(rebuildDiceStats(parsed), null, 2));
  } else {
    runFirestore(commit).catch((err) => {
      console.error(err?.message || err);
      process.exit(1);
    });
  }
}
