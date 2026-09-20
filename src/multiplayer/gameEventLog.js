// Append-only cloud game event log.
// Writes games/{gameId}/events. Fail-closed: never throws into gameplay.
// No static Firebase import — Node tests and solo play stay offline.

import { GAME_VERSION } from '../version.js';

export const EVENT_SCHEMA = 1;
export const EVENT_KINDS = Object.freeze([
  'phase',
  'move',
  'attack',
  'aa',
  'combat',
  'purchase',
  'retreat',
  'error',
  'ui',
]);

export const EVENT_KIND_SET = new Set(EVENT_KINDS);

const ACTION_LOG_KIND = Object.freeze({
  phase: 'phase',
  turn: 'phase',
  move: 'move',
  ncm: 'move',
  attack: 'attack',
  'aa-fire': 'aa',
  combat: 'combat',
  'combat-summary': 'combat',
  purchase: 'purchase',
  retreat: 'retreat',
  cards: 'ui',
  'card-earned': 'ui',
  tech: 'ui',
  capital: 'ui',
  placement: 'ui',
  mobilize: 'ui',
  capture: 'ui',
  income: 'ui',
});

// Action-log types already emitted from gameState / combat telemetry.
// Fan-out these only when the caller opts in (avoid doubles).
const ACTION_LOG_DEFAULTED = new Set([
  'phase',
  'turn',
  'move',
  'ncm',
  'attack',
  'aa-fire',
  'combat',
  'combat-summary',
  'purchase',
  'retreat',
]);

const MEMORY_CAP = 250;
const PAYLOAD_ARRAY_CAP = 24;
const PAYLOAD_FORCE_CAP = 16;
const PAYLOAD_STRING_CAP = 500;
const PAYLOAD_DEPTH = 4;

let _activeLog = null;
let _errorHooksInstalled = false;
let _pendingErrors = [];

export function getGameEventLog() {
  return _activeLog;
}

export function bindGameEventLog(log) {
  _activeLog = log || null;
  if (_activeLog && _pendingErrors.length) {
    const queued = _pendingErrors.splice(0, _pendingErrors.length);
    for (const err of queued) {
      _activeLog.log('error', { payload: err });
    }
  }
  return _activeLog;
}

export function unbindGameEventLog() {
  try {
    _activeLog?.dispose?.();
  } catch {
    // fail-closed
  }
  _activeLog = null;
}

export function emitGameEvent(kind, fields = {}) {
  try {
    _activeLog?.log(kind, fields);
  } catch {
    // fail-closed: logging must never block gameplay
  }
}

export function mapActionLogTypeToKind(type) {
  return ACTION_LOG_KIND[type] || 'ui';
}

export function shouldFanOutActionLogType(type) {
  return !ACTION_LOG_DEFAULTED.has(type);
}

export function summarizeUnits(units) {
  if (!Array.isArray(units)) return [];
  return units.slice(0, PAYLOAD_FORCE_CAP).map((u) => ({
    type: u?.type || 'unit',
    quantity: Number(u?.quantity) || 0,
    owner: u?.owner || null,
  }));
}

export function sanitizePayload(value, depth = PAYLOAD_DEPTH) {
  try {
    if (value == null) return value == null ? value : null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.slice(0, PAYLOAD_STRING_CAP);
    if (typeof value === 'function') return undefined;
    if (depth <= 0) return '[truncated]';
    if (Array.isArray(value)) {
      return value.slice(0, PAYLOAD_ARRAY_CAP).map((item) => sanitizePayload(item, depth - 1));
    }
    if (typeof value === 'object') {
      const out = {};
      const keys = Object.keys(value).slice(0, 32);
      for (const key of keys) {
        const next = sanitizePayload(value[key], depth - 1);
        if (next !== undefined) out[key] = next;
      }
      return out;
    }
    return String(value).slice(0, PAYLOAD_STRING_CAP);
  } catch {
    return { sanitizeError: true };
  }
}

export function normalizeKind(kind) {
  const raw = String(kind || 'ui');
  return EVENT_KIND_SET.has(raw) ? raw : 'ui';
}

export function buildGameEvent({
  gameState = null,
  kind = 'ui',
  territory = null,
  payload = {},
  playerId = null,
  playerName = null,
  writerUid = null,
  lobbyCode = null,
  ts = null,
} = {}) {
  const player = gameState?.currentPlayer || null;
  return {
    ts: Number(ts) || Date.now(),
    turn: Number(gameState?.round) || 1,
    phase: gameState?.phase || null,
    turnPhase: gameState?.turnPhase || null,
    playerId: playerId || player?.id || player?.oderId || null,
    playerName: playerName || player?.name || player?.displayName || null,
    kind: normalizeKind(kind),
    territory: territory || null,
    payload: sanitizePayload(payload) || {},
    writerUid: writerUid || null,
    clientVersion: GAME_VERSION,
    eventSchema: EVENT_SCHEMA,
    lobbyCode: lobbyCode || null,
  };
}

export function filterEvents(events, {
  since = null,
  until = null,
  territory = null,
  kind = null,
  turn = null,
  playerId = null,
} = {}) {
  const list = Array.isArray(events) ? events : [];
  return list.filter((event) => {
    if (!event) return false;
    if (territory && event.territory !== territory) return false;
    if (kind && event.kind !== kind) return false;
    if (turn != null && Number(event.turn) !== Number(turn)) return false;
    if (playerId && event.playerId !== playerId) return false;
    if (since != null && Number(event.ts) < Number(since)) return false;
    if (until != null && Number(event.ts) > Number(until)) return false;
    return true;
  });
}

// Screenshot → query plan. Equality-only Firestore shapes (no composite index).
export function describeEventQuery({
  gameId = null,
  lobbyHint = null,
  territory = null,
  kind = null,
  turn = null,
  since = null,
  until = null,
} = {}) {
  return {
    lobbyLookup: [
      { collection: 'lobbies', field: 'name', op: '==', value: lobbyHint },
      { collection: 'lobbies', field: 'code', op: '==', value: lobbyHint ? String(lobbyHint).toUpperCase() : null },
      { collection: 'games', field: 'lobbyCode', op: '==', value: lobbyHint ? String(lobbyHint).toUpperCase() : null },
      { collection: 'games', field: 'code', op: '==', value: lobbyHint ? String(lobbyHint).toUpperCase() : null },
    ].filter((q) => q.value),
    eventsPath: gameId ? `games/${gameId}/events` : 'games/{gameId}/events',
    firestoreEquality: [
      kind ? { field: 'kind', op: '==', value: kind } : null,
      territory ? { field: 'territory', op: '==', value: territory } : null,
      turn != null ? { field: 'turn', op: '==', value: Number(turn) } : null,
    ].filter(Boolean),
    clientWindow: { since, until },
    note: 'Time windows are applied client-side so firestore.indexes.json stays empty.',
  };
}

export function parseScreenshotHint(text = '') {
  const raw = String(text || '').trim();
  const timeMatch = raw.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\s*(PT|PDT|PST|UTC)?\b/i);
  const dateMatch = raw.match(/\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/i)
    || raw.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\b/i);
  const lobbyHint = raw
    .replace(/\b\d{1,2}:\d{2}\s*(AM|PM)?\s*(PT|PDT|PST|UTC)?\b/ig, ' ')
    .replace(/\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b/ig, ' ')
    .replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2}\b/ig, ' ')
    .replace(/[~@,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null;
  let since = null;
  let until = null;
  if (timeMatch) {
    let hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);
    const ampm = (timeMatch[3] || '').toUpperCase();
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    const now = new Date();
    const year = now.getUTCFullYear();
    let month = now.getUTCMonth();
    let day = now.getUTCDate();
    if (dateMatch) {
      const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
      const mName = (dateMatch[2] && /[A-Za-z]/.test(dateMatch[2]) ? dateMatch[2] : dateMatch[1]).slice(0, 3).toLowerCase();
      const dNum = Number(dateMatch[1] && /\d/.test(dateMatch[1]) ? dateMatch[1] : dateMatch[2]);
      const mi = months.indexOf(mName);
      if (mi >= 0) month = mi;
      if (dNum) day = dNum;
    }
    // PT is UTC-7 in Sep (PDT). Window ±20 minutes around the named minute.
    const utcMs = Date.UTC(year, month, day, hour + 7, minute, 0);
    since = utcMs - 20 * 60 * 1000;
    until = utcMs + 20 * 60 * 1000;
  }
  return {
    lobbyHint,
    since,
    until,
    raw,
  };
}

export class GameEventLog {
  constructor({
    gameId = null,
    gameState = null,
    writer = null,
    getWriterUid = null,
    lobbyCode = null,
  } = {}) {
    this.gameId = gameId;
    this.gameState = gameState;
    this.writer = typeof writer === 'function' ? writer : null;
    this.getWriterUid = typeof getWriterUid === 'function' ? getWriterUid : null;
    this.lobbyCode = lobbyCode || null;
    this.buffer = [];
    this.disposed = false;
  }

  bindGameState(gameState) {
    this.gameState = gameState || null;
  }

  setGameId(gameId) {
    this.gameId = gameId || null;
  }

  setLobbyCode(lobbyCode) {
    this.lobbyCode = lobbyCode || null;
  }

  log(kind, fields = {}) {
    try {
      if (this.disposed) return null;
      const event = buildGameEvent({
        gameState: fields.gameState || this.gameState,
        kind,
        territory: fields.territory ?? null,
        payload: fields.payload || {},
        playerId: fields.playerId,
        playerName: fields.playerName,
        writerUid: fields.writerUid || this._writerUid(),
        lobbyCode: fields.lobbyCode || this.lobbyCode,
        ts: fields.ts,
      });
      this.buffer.push(event);
      if (this.buffer.length > MEMORY_CAP) this.buffer = this.buffer.slice(-MEMORY_CAP);
      this._write(event);
      return event;
    } catch {
      return null;
    }
  }

  logSoftLockEscape({ reason, territory = null, payload = {} } = {}) {
    return this.log('ui', {
      territory,
      payload: {
        softLockEscape: true,
        reason: reason || 'unknown',
        ...payload,
      },
    });
  }

  recent(limit = 40) {
    return this.buffer.slice(-Math.max(1, Number(limit) || 40));
  }

  dispose() {
    this.disposed = true;
    this.writer = null;
    this.gameState = null;
  }

  _writerUid() {
    try {
      return this.getWriterUid?.() || null;
    } catch {
      return null;
    }
  }

  _write(event) {
    if (!this.writer || !this.gameId || !event?.writerUid) return;
    try {
      const result = this.writer(this.gameId, event);
      if (result && typeof result.then === 'function') {
        result.catch(() => {});
      }
    } catch {
      // fail-closed
    }
  }
}

export function createGameEventLog(options) {
  return new GameEventLog(options);
}

export function createFirestoreEventWriter({ getDb, addDocImpl = null, collectionImpl = null } = {}) {
  return (gameId, event) => {
    return Promise.resolve()
      .then(async () => {
        const db = typeof getDb === 'function' ? getDb() : getDb;
        if (!db || !gameId || !event) return;
        let addDoc = addDocImpl;
        let collection = collectionImpl;
        if (!addDoc || !collection) {
          const fs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
          addDoc = addDoc || fs.addDoc;
          collection = collection || fs.collection;
        }
        await addDoc(collection(db, 'games', gameId, 'events'), event);
      })
      .catch((err) => {
        try {
          console.warn('[gameEventLog] append failed', err?.message || err);
        } catch {
          // ignore
        }
      });
  };
}

export function installClientErrorHooks() {
  if (_errorHooksInstalled) return;
  _errorHooksInstalled = true;
  const capture = (payload) => {
    try {
      const body = sanitizePayload(payload) || { message: 'unknown' };
      if (_activeLog) _activeLog.log('error', { payload: body });
      else if (_pendingErrors.length < 20) _pendingErrors.push(body);
    } catch {
      // fail-closed
    }
  };
  if (typeof window === 'undefined') return;
  window.addEventListener('error', (event) => {
    capture({
      message: event?.message || String(event?.error || 'error'),
      source: event?.filename || null,
      line: event?.lineno || null,
      col: event?.colno || null,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    capture({
      message: reason?.message || String(reason || 'unhandledrejection'),
      rejection: true,
    });
  });
}

export function attachDiagnosticsConsole(log) {
  try {
    if (typeof window === 'undefined') return;
    window.__TR_DIAG__ = {
      schema: EVENT_SCHEMA,
      kinds: EVENT_KINDS.slice(),
      gameId: log?.gameId || null,
      lobbyCode: log?.lobbyCode || null,
      recent: (n) => log?.recent(n) || [],
      filter: (opts) => filterEvents(log?.buffer || [], opts),
      describeQuery: describeEventQuery,
      parseScreenshot: parseScreenshotHint,
    };
  } catch {
    // fail-closed
  }
}
