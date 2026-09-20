#!/usr/bin/env node
// Lookup helper: lobby name/code → gameId → events (time window / territory).
// --print-query always works (no secrets). Live pull needs FIREBASE_ID_TOKEN
// (admin). This repo does not ship a service account.
//
//   node tools/query-game-events.mjs --print-query --lobby boysenberry --territory "Western United States" --around "10:34 PT 19 Sep"
//   FIREBASE_ID_TOKEN=... node tools/query-game-events.mjs --lobby BOYSEN --kind aa

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const {
  describeEventQuery,
  filterEvents,
  parseScreenshotHint,
} = await import(pathToFileURL(join(root, 'src/multiplayer/gameEventLog.js')));

function arg(name, fallback = null) {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx < 0) return fallback;
  const next = process.argv[idx + 1];
  if (!next || next.startsWith('--')) return true;
  return next;
}

const printQuery = process.argv.includes('--print-query') || process.argv.includes('--dry-run');
const lobby = arg('lobby') || arg('name') || null;
const gameIdArg = arg('game') || arg('gameId') || null;
const territory = arg('territory') || null;
const kind = arg('kind') || null;
const turn = arg('turn') != null ? Number(arg('turn')) : null;
const around = arg('around') || null;
const fromJson = arg('from-json') || null;
const projectId = arg('project') || 'tactical-risk';

const hint = around || (lobby ? `${lobby}` : '');
const parsed = parseScreenshotHint([lobby, around].filter(Boolean).join(' '));
const lobbyHint = lobby || parsed.lobbyHint;
const since = arg('since') != null ? Number(arg('since')) : parsed.since;
const until = arg('until') != null ? Number(arg('until')) : parsed.until;

const plan = describeEventQuery({
  gameId: gameIdArg,
  lobbyHint,
  territory,
  kind,
  turn,
  since,
  until,
});

function printPlan() {
  console.log('Tactical Risk — event query plan');
  console.log(JSON.stringify({
    hint,
    parsed,
    plan,
    rest: {
      lobbyName: lobbyHint
        ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`
        : null,
      events: gameIdArg
        ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/games/${gameIdArg}/events`
        : 'games/{gameId}/events',
    },
    notes: [
      'Read is admin-only (DIAGNOSTICS.md).',
      'Use equality filters only. Apply since/until client-side.',
      'Set FIREBASE_ID_TOKEN to pull live. Do not invent admin keys.',
    ],
  }, null, 2));
}

function structuredQuery({ collectionId, field, value }) {
  return {
    structuredQuery: {
      from: [{ collectionId }],
      where: {
        fieldFilter: {
          field: { fieldPath: field },
          op: 'EQUAL',
          value: { stringValue: String(value) },
        },
      },
    },
  };
}

async function restRunQuery(token, body) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || `HTTP ${res.status}`);
  }
  return json;
}

function decodeFirestoreValue(value) {
  if (value == null) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ('mapValue' in value) {
    const out = {};
    for (const [k, v] of Object.entries(value.mapValue.fields || {})) {
      out[k] = decodeFirestoreValue(v);
    }
    return out;
  }
  return value;
}

function decodeDoc(doc) {
  const fields = doc?.document?.fields || doc?.fields || {};
  const out = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decodeFirestoreValue(v);
  if (doc?.document?.name) out._path = doc.document.name;
  return out;
}

async function resolveGameId(token) {
  if (gameIdArg) return gameIdArg;
  if (!lobbyHint) return null;
  const tries = [
    structuredQuery({ collectionId: 'lobbies', field: 'name', value: lobbyHint }),
    structuredQuery({ collectionId: 'lobbies', field: 'code', value: String(lobbyHint).toUpperCase() }),
    structuredQuery({ collectionId: 'games', field: 'lobbyCode', value: String(lobbyHint).toUpperCase() }),
    structuredQuery({ collectionId: 'games', field: 'code', value: String(lobbyHint).toUpperCase() }),
  ];
  for (const body of tries) {
    const rows = await restRunQuery(token, body);
    for (const row of rows) {
      const name = row?.document?.name;
      if (!name) continue;
      const fields = decodeDoc(row);
      if (name.includes('/lobbies/') && fields.gameId) return fields.gameId;
      if (name.includes('/games/')) return name.split('/').pop();
    }
  }
  return null;
}

async function listEvents(token, gameId) {
  const params = new URLSearchParams();
  params.set('pageSize', '200');
  if (kind) params.set('mask.fieldPaths', 'kind');
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/games/${gameId}/events?pageSize=300`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error?.message || `HTTP ${res.status}`);
  }
  const docs = (json.documents || []).map((document) => decodeDoc({ document }));
  return filterEvents(docs, { since, until, territory, kind, turn });
}

if (printQuery || !process.env.FIREBASE_ID_TOKEN) {
  printPlan();
  if (fromJson) {
    const raw = JSON.parse(readFileSync(fromJson, 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.events || []);
    const matched = filterEvents(list, { since, until, territory, kind, turn });
    console.log(`\n${matched.length} event(s) from ${fromJson}`);
    console.log(JSON.stringify(matched, null, 2));
  } else if (!process.env.FIREBASE_ID_TOKEN) {
    console.log('\nNo FIREBASE_ID_TOKEN — printed query only.');
  }
  if (!process.env.FIREBASE_ID_TOKEN) process.exit(0);
}

try {
  const token = process.env.FIREBASE_ID_TOKEN;
  const gameId = await resolveGameId(token);
  if (!gameId) {
    console.error('Could not resolve gameId. Pass --game or a known --lobby.');
    process.exit(2);
  }
  const events = await listEvents(token, gameId);
  console.log(JSON.stringify({ gameId, count: events.length, events }, null, 2));
} catch (err) {
  console.error('Live pull failed:', err.message || err);
  console.error('Admin read only. Do not invent keys — see DIAGNOSTICS.md.');
  process.exit(1);
}
