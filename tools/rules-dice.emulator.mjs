// Firestore rules for diceBatches / diceStats.
// Needs Java and the Firestore emulator. Skip cleanly when
// FIRESTORE_EMULATOR_HOST is unset (the suite must not require it).
//
//   firebase emulators:exec --only firestore "node tools/rules-dice.emulator.mjs"
//
// Covers the write shape in src/stats/diceFirestore.js: one batch of raw
// docs plus global, game_, and player_ increments. A shorter streak omits
// longestStreak so the raw docs still commit. A new nonce is a new id.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log('rules-dice: skip (FIRESTORE_EMULATOR_HOST unset)');
  process.exit(0);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
const {
  doc,
  writeBatch,
  increment,
  deleteField,
  updateDoc,
  deleteDoc,
} = await import('firebase/firestore');

const [host, portRaw] = String(process.env.FIRESTORE_EMULATOR_HOST).split(':');
const testEnv = await initializeTestEnvironment({
  projectId: 'demo-tactical-risk-dice',
  firestore: {
    rules: readFileSync(join(root, 'firestore.rules'), 'utf8'),
    host,
    port: Number(portRaw || 8080),
  },
});

let failures = 0;
const check = (label, cond) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label);
  } else {
    console.log('ok  :', label);
  }
};

function die(face) {
  return { unit: 'infantry', need: 1, face };
}

// Mirrors commitDicePayload: create raw docs, increment totals, and write
// longestStreak only when it is greater than the stored value.
async function flushLikeClient(db, {
  uid,
  gameId,
  nonce,
  seq,
  count,
  face,
  streak,
  storedStreak,
}) {
  const batch = writeBatch(db);
  const ids = [];
  for (let i = 0; i < count; i += 1) {
    const id = `${gameId}_1_${nonce}_${seq + i}_${uid}`;
    ids.push(id);
    batch.set(doc(db, 'diceBatches', id), {
      gameId,
      round: 1,
      turnPhase: 'combat',
      context: 'combat',
      side: 'attacker',
      playerSeat: 'p1',
      isAI: false,
      writerUid: uid,
      clientVersion: 'V2.81.57-unified.13',
      ts: Date.now(),
      seq: seq + i,
      dice: [die(face)],
    });
  }
  const stats = (id, { name = null, writeStreak = false } = {}) => {
    const data = { n: increment(count) };
    data[`face_${face}`] = increment(count);
    if (writeStreak && streak > (storedStreak || 0)) data.longestStreak = streak;
    if (name) data.displayName = name;
    batch.set(doc(db, 'diceStats', id), data, { merge: true });
  };
  const rising = streak > (storedStreak || 0);
  stats('global', { writeStreak: rising });
  stats(`game_${gameId}`, { writeStreak: rising });
  stats(`player_${uid}`, { name: 'Robert', writeStreak: rising });
  await batch.commit();
  return ids;
}

try {
  await testEnv.clearFirestore();
  const alice = testEnv.authenticatedContext('uidAlice');
  const db = alice.firestore();

  await assertSucceeds(flushLikeClient(db, {
    uid: 'uidAlice', gameId: 'G1', nonce: 'nonceA', seq: 1, count: 3, face: 4, streak: 6, storedStreak: 0,
  }));
  check('first flush of 3 raw docs + global + game + player is allowed', true);

  await assertSucceeds(flushLikeClient(db, {
    uid: 'uidAlice', gameId: 'G1', nonce: 'nonceA', seq: 4, count: 1, face: 2, streak: 6, storedStreak: 6,
  }));
  check('second flush updating the same stats docs is allowed', true);

  await assertSucceeds(flushLikeClient(db, {
    uid: 'uidAlice', gameId: 'G1', nonce: 'nonceA', seq: 5, count: 1, face: 1, streak: 2, storedStreak: 6,
  }));
  check('a later flush with a shorter streak is allowed', true);

  await assertSucceeds(flushLikeClient(db, {
    uid: 'uidAlice', gameId: 'G1', nonce: 'nonceB', seq: 1, count: 1, face: 3, streak: 2, storedStreak: 6,
  }));
  check('a reload nonce is a new batch id and is allowed', true);

  const lower = writeBatch(db);
  lower.set(doc(db, 'diceStats', 'global'), { longestStreak: 1 }, { merge: true });
  await assertFails(lower.commit());
  check('a shorter longestStreak write is denied', true);

  const down = writeBatch(db);
  down.set(doc(db, 'diceStats', 'global'), { n: increment(-1) }, { merge: true });
  await assertFails(down.commit());
  check('a decrement is denied', true);

  await assertFails(updateDoc(doc(db, 'diceStats', 'global'), { n: deleteField() }));
  check('deleting a counter is denied', true);

  await assertFails(flushLikeClient(db, {
    uid: 'someoneElse', gameId: 'G1', nonce: 'spoof', seq: 1, count: 1, face: 1, streak: 1, storedStreak: 0,
  }));
  check('a spoofed writerUid is denied', true);

  const other = writeBatch(db);
  other.set(doc(db, 'diceStats', 'player_uidBob'), {
    n: increment(1),
    face_1: increment(1),
    displayName: 'Bob',
  }, { merge: true });
  await assertFails(other.commit());
  check("another player's player_ doc is denied", true);

  const rawId = 'G1_1_nonceA_1_uidAlice';
  await assertFails(updateDoc(doc(db, 'diceBatches', rawId), { seq: 9 }));
  check('updating a diceBatches doc is denied', true);
  await assertFails(deleteDoc(doc(db, 'diceBatches', rawId)));
  check('deleting a diceBatches doc is denied', true);
} catch (err) {
  failures += 1;
  console.error('FAIL: emulator harness threw', err?.message || err);
} finally {
  await testEnv.cleanup();
}

if (failures) {
  console.error(`\n${failures} rules-dice check(s) failed`);
  process.exit(1);
}
console.log('\nrules-dice emulator checks passed');
