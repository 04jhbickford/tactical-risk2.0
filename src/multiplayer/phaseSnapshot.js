// Per-phase checkpoints at games/{id}/snapshots/{turn}-{phase}-{seq}.
// Append-only. A failed write retries, then surfaces a visible error.
// Solo play and a missing game id do not write and do not toast.

import { GAME_VERSION } from '../version.js';
import { CLASSIC_MAP_ID, resolveMapId } from '../map/mapRegistry.js';
import { ensureLedgerIds, ipcMapFromState } from '../state/unitLedger.js';

export const SNAPSHOT_ATTEMPTS = 3;
export const SNAPSHOT_VISIBLE_ERROR = 'Could not save the phase snapshot. Retry failed, so this phase has no cloud checkpoint.';

let bound = null;

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (value[key] === undefined) continue;
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

export async function sha256Hex(text) {
  const data = new TextEncoder().encode(String(text));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function snapshotPhaseSlug(phase) {
  const slug = String(phase || 'phase').replace(/[^A-Za-z0-9_]/g, '');
  return slug || 'phase';
}

export function snapshotDocId({ turn, phase, seq }) {
  return `${Number(turn) || 0}-${snapshotPhaseSlug(phase)}-${Number(seq) || 0}`;
}

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

export async function buildPhaseSnapshot(gameState, {
  seq = 1,
  writerUid = null,
  ts = Date.now(),
  clientVersion = GAME_VERSION,
} = {}) {
  ensureLedgerIds(gameState?.units);
  const units = cloneJson(gameState?.units || {});
  const pendingAir = cloneJson(gameState?.pendingAirLandings || []);
  const playerState = cloneJson(gameState?.playerState || {});
  const ipcs = ipcMapFromState(gameState);
  const turn = Number(gameState?.round) || 1;
  const phase = snapshotPhaseSlug(gameState?.turnPhase || gameState?.phase || 'unknown');
  const state = { units, pendingAir, playerState, ipcs };
  const checksum = await sha256Hex(canonicalJson(state));
  const id = snapshotDocId({ turn, phase, seq });
  // mapId is additive and stays outside the checksum. A missing id is classic.
  // Old snapshots omit it. The rules file allows the extra key.
  const resolvedMap = resolveMapId(gameState?.mapId);
  const mapId = resolvedMap.ok ? resolvedMap.mapId : (resolvedMap.raw || CLASSIC_MAP_ID);
  return {
    id,
    turn,
    phase,
    seq: Number(seq) || 1,
    units,
    pendingAir,
    playerState,
    ipcs,
    checksum,
    mapId,
    clientVersion,
    writerUid: writerUid || null,
    ts: Number(ts) || Date.now(),
  };
}

export function isSnapshotAlreadyExists(err) {
  const code = String(err?.code || '');
  return code === 'already-exists' || code === 'already_exists';
}

export async function writeSnapshotWithRetry({
  snapshot,
  write,
  attempts = SNAPSHOT_ATTEMPTS,
  wait = async () => {},
  onError,
  bumpSeq,
} = {}) {
  let last = null;
  let current = snapshot;
  const tries = Math.max(1, Number(attempts) || SNAPSHOT_ATTEMPTS);
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      await write(current);
      return { ok: true, attempt, id: current?.id, snapshot: current };
    } catch (err) {
      last = err;
      if (isSnapshotAlreadyExists(err) && typeof bumpSeq === 'function') {
        current = await bumpSeq(current);
        continue;
      }
      if (attempt < tries) await wait(attempt);
    }
  }
  const failure = {
    ok: false,
    error: last,
    message: SNAPSHOT_VISIBLE_ERROR,
    id: current?.id || null,
  };
  try { onError?.(failure); } catch { /* the toast must not throw */ }
  return failure;
}

export function bindPhaseSnapshots(options) {
  bound = options || null;
  return bound;
}

export function unbindPhaseSnapshots() {
  bound = null;
}

export function getPhaseSnapshotBinding() {
  return bound;
}

// Fire-and-forget from the turn path so a slow write does not freeze the
// phase button. The write itself retries and then calls onError.
export function notePhaseSnapshot(gameState) {
  try {
    if (!gameState || gameState._suppressPersist) return;
    const ctx = bound;
    if (!ctx?.gameId || typeof ctx.write !== 'function') return;
    const writerUid = ctx.getWriterUid?.() || null;
    if (!writerUid) return;
    const turn = Number(gameState.round) || 1;
    const phase = snapshotPhaseSlug(gameState.turnPhase || gameState.phase || 'unknown');
    const key = `${ctx.gameId}:${turn}:${phase}`;
    const seqs = ctx.seqs || (ctx.seqs = new Map());
    const seq = (seqs.get(key) || 0) + 1;
    seqs.set(key, seq);
    Promise.resolve()
      .then(async () => {
        let snap = await buildPhaseSnapshot(gameState, { seq, writerUid });
        return writeSnapshotWithRetry({
          snapshot: snap,
          write: (body) => ctx.write(ctx.gameId, body),
          wait: ctx.wait || defaultWait,
          onError: (failure) => { ctx.onError?.(failure.message || SNAPSHOT_VISIBLE_ERROR); },
          bumpSeq: async (current) => {
            const next = (Number(current?.seq) || 1) + 1;
            seqs.set(key, next);
            snap = await buildPhaseSnapshot(gameState, { seq: next, writerUid, ts: Date.now() });
            return snap;
          },
        });
      })
      .catch(() => {
        try { ctx.onError?.(SNAPSHOT_VISIBLE_ERROR); } catch { /* ignore */ }
      });
  } catch {
    try { bound?.onError?.(SNAPSHOT_VISIBLE_ERROR); } catch { /* ignore */ }
  }
}

function defaultWait(attempt) {
  const ms = 150 * attempt;
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

export function createFirestoreSnapshotWriter({
  getDb,
  runTransactionImpl = null,
  docImpl = null,
} = {}) {
  return async (gameId, snapshot) => {
    const db = typeof getDb === 'function' ? getDb() : getDb;
    if (!db || !gameId || !snapshot?.id) {
      const err = new Error('missing snapshot target');
      err.code = 'invalid-argument';
      throw err;
    }
    let runTransaction = runTransactionImpl;
    let doc = docImpl;
    if (!runTransaction || !doc) {
      const fs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      runTransaction = runTransaction || fs.runTransaction;
      doc = doc || fs.doc;
    }
    const ref = doc(db, 'games', gameId, 'snapshots', snapshot.id);
    const body = { ...snapshot };
    delete body.id;
    await runTransaction(db, async (tx) => {
      const existing = await tx.get(ref);
      if (existing.exists()) {
        const err = new Error('snapshot exists');
        err.code = 'already-exists';
        throw err;
      }
      tx.set(ref, body);
    });
  };
}
