// Observe-only roll tracker. Recording runs after the face is chosen,
// inside try/catch, and never awaits before combat returns. A failure
// is silent (one console.debug). Guests write nothing. Permission-denied
// writes are swallowed until Firestore rules are published.

import { GAME_VERSION } from '../version.js';
import {
  applyDiceBatch,
  batchDocId,
  emptyTotals,
  flattenTotals,
  groupDiceForBatches,
  normalizeRollContext,
  safeIdPart,
} from './diceMath.js';

const buffers = new WeakMap();
const seqs = new WeakMap();

let enabled = true;
let sessionProvider = () => ({
  uid: null,
  signedIn: false,
  seatId: null,
  displayName: null,
  gameId: null,
});
let writerOverride = null;

export function setDiceTrackerEnabled(on) {
  enabled = !!on;
}

export function isDiceTrackerEnabled() {
  return enabled;
}

export function setDiceSessionProvider(fn) {
  sessionProvider = typeof fn === 'function' ? fn : sessionProvider;
}

export function getDiceSession() {
  try {
    const session = sessionProvider() || {};
    return {
      uid: session.uid || null,
      signedIn: !!session.signedIn || !!session.uid,
      seatId: session.seatId || null,
      displayName: session.displayName || null,
      gameId: session.gameId || null,
    };
  } catch (err) {
    debugOnce(err);
    return { uid: null, signedIn: false, seatId: null, displayName: null, gameId: null };
  }
}

export function setDiceWriter(fn) {
  writerOverride = typeof fn === 'function' ? fn : null;
}

function debugOnce(err) {
  try {
    const detail = err?.code || err?.message || err;
    console.debug('[dice] record skipped', detail);
  } catch {
    // logging must not throw
  }
}

function bufferOf(gameState) {
  let list = buffers.get(gameState);
  if (!list) {
    list = [];
    buffers.set(gameState, list);
  }
  return list;
}

export function discardDiceBuffer(gameState) {
  if (gameState) buffers.delete(gameState);
}

export function peekDiceBuffer(gameState) {
  const list = gameState ? buffers.get(gameState) : null;
  return list ? list.slice() : [];
}

// Called only after Math.random has already produced the face.
export function observeRolledDie(gameState, context, face) {
  if (!enabled || !gameState) return;
  const die = normalizeRollContext(context, face, gameState);
  if (!Number.isInteger(die.face) || die.face < 1 || die.face > 6) return;
  bufferOf(gameState).push(die);
}

export function buildFlushPayload(gameState, dice, session = getDiceSession()) {
  const groups = groupDiceForBatches(dice);
  let seq = seqs.get(gameState) || 0;
  const gameId = safeIdPart(session.gameId || 'solo', 'solo');
  const round = Number(gameState?.round) || 0;
  const uid = session.uid || '';
  const built = [];
  for (const group of groups) {
    seq += 1;
    const id = batchDocId({ gameId, round, seq, uid: uid || 'anon' });
    built.push({ ...group, seq, id });
  }
  seqs.set(gameState, seq);

  const all = emptyTotals();
  const own = emptyTotals();
  for (const group of built) {
    applyDiceBatch(all, group.dice, group);
    const ownSeat = session.seatId && group.playerSeat === session.seatId && !group.isAI;
    if (ownSeat) applyDiceBatch(own, group.dice, group);
  }
  return {
    gameId,
    round,
    turnPhase: gameState?.turnPhase || '',
    clientVersion: GAME_VERSION,
    writerUid: uid,
    groups: built.map((group) => ({
      id: group.id,
      seq: group.seq,
      context: group.context,
      side: group.side,
      playerSeat: group.playerSeat,
      isAI: group.isAI,
      playerName: group.playerName,
      dice: group.dice,
    })),
    deltas: {
      global: flattenTotals(all, { includeSeats: false }),
      game: flattenTotals(all, { includeSeats: true }),
      player: own.n > 0 ? flattenTotals(own, { includeSeats: false, names: false }) : null,
    },
  };
}

export function flushDiceBuffer(gameState) {
  try {
    if (!gameState) return;
    const list = buffers.get(gameState);
    if (!enabled) {
      buffers.delete(gameState);
      return;
    }
    if (!list || list.length === 0) return;
    const dice = list.slice();
    buffers.delete(gameState);
    const session = getDiceSession();
    const payload = buildFlushPayload(gameState, dice, session);
    const writer = writerOverride || defaultDiceWriter;
    // Fire-and-forget. Combat has already resolved.
    Promise.resolve().then(() => writer(payload, session)).catch((err) => debugOnce(err));
  } catch (err) {
    debugOnce(err);
  }
}

async function defaultDiceWriter(payload, session) {
  if (!session?.uid) return { skipped: 'guest' };
  if (typeof window === 'undefined') return { skipped: 'offline' };
  const { commitDicePayload } = await import('./diceFirestore.js');
  await commitDicePayload(payload, session);
  return { ok: true };
}
