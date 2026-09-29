#!/usr/bin/env node
// Read-only phase audit.
//   node tools/audit-game.mjs <gameId>
// Uses firebase-admin with GOOGLE_APPLICATION_CREDENTIALS.
// It only reads games/{id}/snapshots and games/{id}/events.

import { auditSnapshots, formatAuditReport, parseSnapshotId } from '../src/audit/replayGame.js';

const gameId = process.argv[2];
if (!gameId || gameId.startsWith('-')) {
  console.error('Usage: node tools/audit-game.mjs <gameId>');
  process.exit(2);
}
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS is not set. This tool only reads Firestore.');
  process.exit(2);
}

let admin;
try {
  admin = (await import('firebase-admin')).default;
} catch (err) {
  console.error('firebase-admin is not installed. Install it to run a live audit.');
  console.error(err?.message || err);
  process.exit(2);
}

if (!admin.apps?.length) {
  admin.initializeApp({ credential: admin.credential.applicationDefault() });
}
const db = admin.firestore();
const game = db.collection('games').doc(gameId);
const [snapshotQuery, eventQuery] = await Promise.all([
  game.collection('snapshots').get(),
  game.collection('events').get(),
]);

const snapshots = snapshotQuery.docs.map((doc) => {
  const data = doc.data() || {};
  const parsed = parseSnapshotId(doc.id) || {};
  return { id: doc.id, ...parsed, ...data };
});
const events = eventQuery.docs.map((doc) => doc.data() || {});
const result = await auditSnapshots({ snapshots, events });
console.log(formatAuditReport(gameId, result));
process.exit(result.ok ? 0 : 1);
