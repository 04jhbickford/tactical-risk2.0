// Firestore rules for games/{id}/snapshots.
// Needs Java and the Firestore emulator. Skip cleanly when
// FIRESTORE_EMULATOR_HOST is unset (the suite must not require it).
//
//   firebase emulators:exec --only firestore "node tools/rules-snapshots.emulator.mjs"
//
// Cases:
// 1. A seated member can create a snapshot.
// 2. Update of that snapshot is denied.
// 3. Delete is denied.
// 4. A signed-in non-member cannot create.
// 5. The member can still update the game document (old clients).

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.log('rules-snapshots: skip (FIRESTORE_EMULATOR_HOST unset)');
  console.log('Documented cases: member create, update denied, delete denied, outsider denied, game doc update still allowed.');
  process.exit(0);
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
const { doc, setDoc, updateDoc, deleteDoc } = await import('firebase/firestore');

const [host, portRaw] = String(process.env.FIRESTORE_EMULATOR_HOST).split(':');
const testEnv = await initializeTestEnvironment({
  projectId: 'demo-tactical-risk-snapshots',
  firestore: {
    rules: readFileSync(join(root, 'firestore.rules'), 'utf8'),
    host,
    port: Number(portRaw || 8080),
  },
});

let failures = 0;
const check = async (label, fn) => {
  try {
    await fn();
    console.log('ok  :', label);
  } catch (err) {
    failures += 1;
    console.error('FAIL:', label, err?.message || err);
  }
};

const member = testEnv.authenticatedContext('member-1', { email: 'member@example.com' });
const outsider = testEnv.authenticatedContext('outsider-1', { email: 'outsider@example.com' });
const memberDb = member.firestore();
const outsiderDb = outsider.firestore();

await testEnv.withSecurityRulesDisabled(async (ctx) => {
  await setDoc(doc(ctx.firestore(), 'games', 'game-1'), {
    status: 'active',
    startedBy: 'member-1',
    playerUserIds: ['member-1'],
  });
});

function snapshotBody(seq = 1) {
  return {
    turn: 4,
    phase: 'purchase',
    seq,
    units: { France: [] },
    playerState: { Russians: { ipcs: 100 } },
    ipcs: { Russians: 100 },
    checksum: 'a'.repeat(64),
    clientVersion: 'V2.81.57-unified.22',
    writerUid: 'member-1',
  };
}

await check('member can create a snapshot', async () => {
  await assertSucceeds(setDoc(doc(memberDb, 'games/game-1/snapshots/4-purchase-1'), snapshotBody(1)));
});

await check('update is denied', async () => {
  await assertFails(updateDoc(doc(memberDb, 'games/game-1/snapshots/4-purchase-1'), { seq: 2 }));
});

await check('delete is denied', async () => {
  await assertFails(deleteDoc(doc(memberDb, 'games/game-1/snapshots/4-purchase-1')));
});

await check('outsider cannot create', async () => {
  const body = snapshotBody(2);
  body.writerUid = 'outsider-1';
  await assertFails(setDoc(doc(outsiderDb, 'games/game-1/snapshots/4-purchase-2'), body));
});

await check('member can still update the game document', async () => {
  await assertSucceeds(updateDoc(doc(memberDb, 'games/game-1'), { status: 'active' }));
});

await testEnv.cleanup();
if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll snapshot rule checks passed');
