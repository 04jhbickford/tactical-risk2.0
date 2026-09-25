// Firestore write path for dice batches. Dynamic imports only — Node tests
// never load this module. Permission-denied (rules not published yet) and
// every other write error are swallowed by the caller.

import { GAME_VERSION } from '../version.js';
import { safeDisplayName } from './diceMath.js';

export async function commitDicePayload(payload, session) {
  const { getFirebaseDb } = await import('../multiplayer/firebase.js');
  const db = getFirebaseDb();
  if (!db) return { skipped: 'no-db' };
  const uid = session?.uid;
  if (!uid) return { skipped: 'guest' };

  const fs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const { writeBatch, doc, getDoc, increment } = fs;

  let streakFloor = 0;
  try {
    const prev = await getDoc(doc(db, 'diceStats', 'global'));
    if (prev.exists()) streakFloor = Number(prev.data()?.longestStreak) || 0;
  } catch (err) {
    // A denied read means rules are not published. Still attempt the
    // batch once; the caller swallows permission-denied.
    if (err?.code !== 'permission-denied') {
      console.debug('[dice] streak read skipped', err?.code || err?.message || err);
    }
  }

  const batch = writeBatch(db);
  for (const group of payload.groups || []) {
    const ref = doc(db, 'diceBatches', group.id);
    batch.set(ref, {
      gameId: payload.gameId,
      round: payload.round,
      turnPhase: payload.turnPhase || '',
      context: group.context,
      side: group.side,
      playerSeat: group.playerSeat || '',
      isAI: !!group.isAI,
      writerUid: uid,
      clientVersion: payload.clientVersion || GAME_VERSION,
      ts: Date.now(),
      seq: group.seq,
      dice: (group.dice || []).map((die) => ({
        unit: die.unit || '',
        need: die.need == null ? null : die.need,
        face: die.face,
      })),
    });
  }

  const writeStats = (id, delta, { displayName = null, absoluteStreak = null } = {}) => {
    if (!delta) return;
    const data = {};
    for (const [key, value] of Object.entries(delta.inc || {})) {
      if (!value) continue;
      data[key] = increment(value);
    }
    const streak = absoluteStreak == null ? delta.longestStreak : absoluteStreak;
    if (streak) data.longestStreak = streak;
    if (displayName) data.displayName = displayName;
    for (const [key, value] of Object.entries(delta.names || {})) {
      if (value) data[key] = value;
    }
    for (const [key, value] of Object.entries(delta.flags || {})) {
      if (value) data[key] = true;
    }
    if (Object.keys(data).length === 0) return;
    batch.set(doc(db, 'diceStats', id), data, { merge: true });
  };

  const globalStreak = Math.max(streakFloor, payload.deltas?.global?.longestStreak || 0);
  writeStats('global', payload.deltas?.global, { absoluteStreak: globalStreak });
  writeStats(`game_${payload.gameId}`, payload.deltas?.game, {
    absoluteStreak: payload.deltas?.game?.longestStreak || 0,
  });
  const name = safeDisplayName(session.displayName);
  if (payload.deltas?.player) {
    writeStats(`player_${uid}`, payload.deltas.player, {
      displayName: name,
      absoluteStreak: payload.deltas.player.longestStreak || 0,
    });
  }

  await batch.commit();
  return { ok: true };
}
