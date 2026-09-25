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

  const gameStatId = `game_${payload.gameId}`;
  const playerStatId = payload.deltas?.player ? `player_${uid}` : null;
  const readStreak = async (id) => {
    try {
      const prev = await getDoc(doc(db, 'diceStats', id));
      return {
        ok: true,
        floor: prev.exists() ? (Number(prev.data()?.longestStreak) || 0) : 0,
      };
    } catch (err) {
      // A denied read means rules are not published. Still attempt the
      // batch once; omit longestStreak so a short guess cannot reject it.
      if (err?.code !== 'permission-denied') {
        console.debug('[dice] streak read skipped', err?.code || err?.message || err);
      }
      return { ok: false, floor: 0 };
    }
  };
  const [globalRead, gameRead, playerRead] = await Promise.all([
    readStreak('global'),
    readStreak(gameStatId),
    playerStatId ? readStreak(playerStatId) : Promise.resolve({ ok: true, floor: 0 }),
  ]);
  // Only raise the stored streak. A shorter flush omits the field so the
  // merge keeps the old value and the raw diceBatches docs still commit.
  const risingStreak = (read, next) => {
    if (!read?.ok) return null;
    const value = Number(next) || 0;
    return value > read.floor ? value : null;
  };

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
    if (absoluteStreak > 0) data.longestStreak = absoluteStreak;
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

  writeStats('global', payload.deltas?.global, {
    absoluteStreak: risingStreak(globalRead, payload.deltas?.global?.longestStreak),
  });
  writeStats(gameStatId, payload.deltas?.game, {
    absoluteStreak: risingStreak(gameRead, payload.deltas?.game?.longestStreak),
  });
  const name = safeDisplayName(session.displayName);
  if (payload.deltas?.player && playerStatId) {
    writeStats(playerStatId, payload.deltas.player, {
      displayName: name,
      absoluteStreak: risingStreak(playerRead, payload.deltas.player.longestStreak),
    });
  }

  await batch.commit();
  return { ok: true };
}
