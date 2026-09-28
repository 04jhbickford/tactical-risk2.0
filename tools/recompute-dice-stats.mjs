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
// Historical faces: game docs persist state.combatTelemetry (last 40 rounds,
// each list capped at 24). games/{id}/events kind combat|aa is the fuller
// log: payload.attackRolls, payload.defenseRolls, and payload.rolls are
// integer faces. The admin path reads them with collectionGroup('events').
// Identical events within 5s count once. Those rows are source:
// 'backfill-events'. They have no per-die unit or need, so they do not
// produce a hit rate. Attack faces land on the attacker seat (playerId).
// Defense and AA faces land on the global and game totals only.
// Telemetry that is not already covered by an event is source:'backfill'.
// Neither source writes player_* docs. A game that already has diceBatches
// is left to those batches. A second run writes the same absolute totals.

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

export const EVENT_DEDUPE_MS = 5000;

export const HISTORICAL_DICE_NOTE = [
  'Pre-tracker dice are not in diceBatches.',
  'games/{id}/events kind combat stores payload.attackRolls and payload.defenseRolls. Kind aa stores payload.rolls.',
  'The admin run reads them with collectionGroup(\'events\'). Identical events within 5s count once and are tagged source:backfill-events.',
  'Those dice have no per-die unit or need, so hit rate vs expected is not available. Attack faces are added to the attacker seat. Defense and AA faces are added to the global and game totals.',
  'state.combatTelemetry is still included as source:backfill when that battle is not already in the events.',
  'Neither source writes player docs. Games that already have diceBatches are skipped.',
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
  const eventDiceByGame = new Map();
  let eventDiceGlobal = 0;

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
    if (rec.source === 'backfill' || rec.source === 'backfill-events') {
      backfillByGame.set(gameId, (backfillByGame.get(gameId) || 0) + rec.dice.length);
    }
    if (rec.source === 'backfill-events') {
      eventDiceGlobal += rec.dice.length;
      eventDiceByGame.set(gameId, (eventDiceByGame.get(gameId) || 0) + rec.dice.length);
    }
    if (!rec.isAI && rec.writerUid && rec.source !== 'backfill' && rec.source !== 'backfill-events') {
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
  if (eventDiceGlobal) out.global.backfillEventDice = eventDiceGlobal;
  for (const [gameId, totals] of games) {
    const flat = flattenTotals(totals, { includeSeats: true });
    flat.longestStreak = totals.longestStreak;
    if (backfillByGame.get(gameId)) flat.backfillDice = backfillByGame.get(gameId);
    if (eventDiceByGame.get(gameId)) flat.backfillEventDice = eventDiceByGame.get(gameId);
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

function pushSlice(records, {
  gameId, round, kind, side, context, dice, seq,
  source = 'backfill', playerSeat = '', playerName = '', isAI = false,
}) {
  if (!dice.length) return seq;
  const next = seq + 1;
  records.push({
    id: `backfill_${safeIdPart(gameId, 'game')}_${Number(round) || 0}_${safeIdPart(kind, 'combat')}_${next}_${side}`,
    gameId,
    round: Number(round) || 0,
    seq: next,
    source,
    context,
    side,
    playerSeat: playerSeat || '',
    playerName: playerName || '',
    isAI: !!isAI,
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

export function eventTimeMs(event) {
  const ts = event?.ts ?? event?.payload?.ts;
  if (ts == null || ts === '') return null;
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts?.toMillis === 'function') return ts.toMillis();
  if (typeof ts?.seconds === 'number') return ts.seconds * 1000 + Math.floor((ts.nanoseconds || 0) / 1e6);
  const parsed = Date.parse(ts);
  return Number.isFinite(parsed) ? parsed : null;
}

export function gameIdFromEventPath(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  const idx = parts.indexOf('games');
  if (idx >= 0 && parts[idx + 1] && parts[idx + 2] === 'events') return parts[idx + 1];
  return '';
}

function eventPayload(event) {
  return event?.payload || {};
}

function eventEntry(event) {
  const payload = eventPayload(event);
  return {
    kind: event?.kind,
    round: event?.turn ?? event?.round ?? payload.round,
    territory: event?.territory || payload.territory || '',
    playerId: event?.playerId || payload.playerId || '',
    attackRolls: payload.attackRolls,
    defenseRolls: payload.defenseRolls,
    rolls: payload.rolls,
  };
}

function eventIdentity(event) {
  const entry = eventEntry(event);
  return [
    event?.gameId || '',
    event?.kind || '',
    entry.territory,
    entry.playerId,
    faceSignature(entry),
  ].join('|');
}

function nameLooksLikeAI(name) {
  return /\bAI$/.test(String(name || ''));
}

export function dedupeBackfillEvents(events, windowMs = EVENT_DEDUPE_MS) {
  const rows = (events || []).filter((event) => event && (event.kind === 'combat' || event.kind === 'aa'));
  const sorted = rows.slice().sort((a, b) => {
    const ta = eventTimeMs(a);
    const tb = eventTimeMs(b);
    if (ta == null && tb == null) return 0;
    if (ta == null) return 1;
    if (tb == null) return -1;
    return ta - tb;
  });
  const last = new Map();
  const kept = [];
  let dropped = 0;
  for (const event of sorted) {
    const key = eventIdentity(event);
    const ts = eventTimeMs(event);
    const prev = last.get(key);
    const close = prev && (prev.ts == null || ts == null || Math.abs(ts - prev.ts) <= windowMs);
    if (close) {
      dropped += 1;
      continue;
    }
    last.set(key, { ts });
    kept.push(event);
  }
  return { events: kept, dropped };
}

export function eventToBackfillRecords(event, { seq = 0 } = {}) {
  const records = [];
  const gameId = event?.gameId;
  if (!event || !gameId) return { records, seq, dice: 0 };
  const entry = eventEntry(event);
  const kind = entry.kind === 'aa' ? 'aa' : 'combat';
  const round = entry.round ?? 0;
  const seat = entry.playerId || '';
  const name = safeDisplayName(event.playerName || eventPayload(event).playerName) || '';
  const isAI = nameLooksLikeAI(name);
  let cursor = seq;
  let dice = 0;

  const add = (side, context, faces, seated) => {
    if (!faces.length) return;
    cursor = pushSlice(records, {
      gameId,
      round,
      kind,
      side,
      context,
      seq: cursor,
      source: 'backfill-events',
      playerSeat: seated ? seat : '',
      playerName: seated ? name : '',
      isAI: seated ? isAI : false,
      dice: diceFromFaces(faces, side),
    });
    dice += faces.length;
  };

  if (kind === 'aa') {
    add('defender', 'aa', faceList(entry.rolls), false);
  } else {
    add('attacker', 'combat', faceList(entry.attackRolls), true);
    add('defender', 'combat', faceList(entry.defenseRolls), false);
  }
  return { records, seq: cursor, dice };
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
  const deduped = dedupeBackfillEvents(events);
  const report = {
    gamesSeen: 0,
    gamesWithFaces: 0,
    gamesSkippedTracked: 0,
    gamesWithoutFaces: 0,
    eventsRead: (events || []).length,
    eventsKept: deduped.events.length,
    eventsDeduped: deduped.dropped,
    eventsUsed: 0,
    eventsSkippedTracked: 0,
    eventDice: 0,
    zippedDice: 0,
    faceOnlyDice: 0,
    note: HISTORICAL_DICE_NOTE,
  };
  const gamesTouched = new Set();

  for (const event of deduped.events) {
    const gameId = event.gameId;
    if (!gameId) continue;
    if (tracked.has(gameId)) {
      report.eventsSkippedTracked += 1;
      continue;
    }
    const entry = eventEntry(event);
    if (!entryHasFaces(entry)) continue;
    const sig = `${gameId}|${faceSignature(entry)}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    const built = eventToBackfillRecords(event, { seq: records.length });
    records.push(...built.records);
    report.eventsUsed += 1;
    report.eventDice += built.dice;
    gamesTouched.add(gameId);
  }

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
    let faces = gamesTouched.has(gameId) ? 1 : 0;
    for (const entry of telemetry) {
      if (take(entry, gameId)) faces += 1;
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
  if (flat?.backfillEventDice) data.backfillEventDice = flat.backfillEventDice;
  if (extra.displayName) data.displayName = extra.displayName;
  return data;
}

// Live game docs store `name_<seat>` even when the batches used to rebuild
// that game have no playerName. A wholesale set() would drop those names.
// A name the rebuild did compute wins. An empty rebuild keeps the live one.
const NAME_FIELD = /^name_[A-Za-z0-9]+$/;

export function preserveNameFields(existing, next) {
  const out = { ...(next || {}) };
  const prev = existing && typeof existing === 'object' ? existing : {};
  for (const key of Object.keys(prev)) {
    if (!NAME_FIELD.test(key)) continue;
    if (out[key] == null || out[key] === '') out[key] = prev[key];
  }
  return out;
}

export function gameStatDoc(existing, flat) {
  return preserveNameFields(existing, statDocFromFlat(flat));
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
    const changes = diffStatDoc(
      currentDocs?.games?.[gameId],
      gameStatDoc(currentDocs?.games?.[gameId], rebuilt.games[gameId]),
    );
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

  async function readEventGroup(database) {
    const out = [];
    let last = null;
    for (;;) {
      let query = database.collectionGroup('events').orderBy('__name__').limit(400);
      if (last) query = query.startAfter(last);
      const snap = await query.get();
      if (snap.empty) break;
      snap.forEach((doc) => {
        const data = doc.data() || {};
        if (data.kind !== 'combat' && data.kind !== 'aa') return;
        const gameId = gameIdFromEventPath(doc.ref?.path) || doc.ref?.parent?.parent?.id || '';
        if (!gameId) return;
        out.push({ id: doc.id, gameId, ...data });
      });
      last = snap.docs[snap.docs.length - 1];
      if (snap.size < 400) break;
    }
    return out;
  }

  const batches = await readCollection('diceBatches');
  const stats = await readCollection('diceStats');
  const games = await readCollection('games');
  const events = await readEventGroup(db);

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
    await queue(`game_${safeIdPart(gameId, 'game')}`, gameStatDoc(current.games[gameId], flat));
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
