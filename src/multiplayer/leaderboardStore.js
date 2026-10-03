// Persistence for leaderboard totals.
// Signed-in players write leaderboards/{uid} (display name, scores, opt-out).
// No email. Unsigned solo stays in localStorage on this device.
// A denied write means the leaderboard rules are not published yet; the
// device copy is kept and play is not blocked.

import {
  leaderboardRows,
  planRecord,
  readStoredRecord,
  recordDisplayName,
  resetScores,
  scoreTotals,
  seatToRecord,
  serializeRecord,
  withOptOut,
  writeStoredRecord,
} from './leaderboard.js';

export const LEADERBOARD_COLLECTION = 'leaderboards';

function storageOrDefault(storage) {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* private mode */
  }
  return {
    getItem() { return null; },
    setItem() {},
  };
}

function isDenied(err) {
  const code = String(err?.code || '');
  const message = String(err?.message || err || '');
  return code === 'permission-denied' || message.includes('permission-denied');
}

function noteRemote(err) {
  const reason = isDenied(err) ? 'permission-denied' : String(err?.code || 'error');
  try { console.debug('[leaderboard] remote skipped', reason); } catch { /* ignore */ }
}

async function remoteApi() {
  const { getFirebaseDb } = await import('./firebase.js');
  const db = getFirebaseDb();
  if (!db) return null;
  const fs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  return { db, ...fs };
}

async function readRemote(userId) {
  const api = await remoteApi();
  if (!api) return null;
  const snap = await api.getDoc(api.doc(api.db, LEADERBOARD_COLLECTION, userId));
  if (!snap.exists()) return null;
  return { ...snap.data(), id: userId };
}

async function writeRemote(userId, record) {
  const api = await remoteApi();
  if (!api) return false;
  await api.setDoc(api.doc(api.db, LEADERBOARD_COLLECTION, userId), serializeRecord(record));
  return true;
}

async function listRemote() {
  const api = await remoteApi();
  if (!api) return [];
  const snap = await api.getDocs(api.collection(api.db, LEADERBOARD_COLLECTION));
  const rows = [];
  snap.forEach((docSnap) => {
    rows.push({ ...docSnap.data(), id: docSnap.id });
  });
  return rows;
}

async function loadOwn(userId, storage) {
  const local = readStoredRecord(storage, userId);
  if (!userId) return local;
  let remote = null;
  try {
    remote = await readRemote(userId);
  } catch (err) {
    noteRemote(err);
    return local;
  }
  if (!remote) {
    const played = scoreTotals(local).played;
    if (local.updatedAt || local.optOut || played) {
      try { await writeRemote(userId, local); } catch (err) { noteRemote(err); }
    }
    return local;
  }
  if ((local.updatedAt || 0) > (remote.updatedAt || 0)) {
    try { await writeRemote(userId, local); } catch (err) { noteRemote(err); }
    return local;
  }
  return writeStoredRecord(storage, userId, remote);
}

async function saveOwn(userId, record, storage) {
  const saved = writeStoredRecord(storage, userId, record);
  if (!userId) return saved;
  try {
    await writeRemote(userId, saved);
  } catch (err) {
    noteRemote(err);
  }
  return saved;
}

export async function loadLeaderboardView(user, storage) {
  const store = storageOrDefault(storage);
  const userId = user?.id || null;
  const signedIn = !!userId;
  let self = await loadOwn(userId, store);
  const name = recordDisplayName(user, null);
  const played = scoreTotals(self).played;
  if (name && self.displayName !== name && (self.updatedAt || self.optOut || played)) {
    self = { ...self, displayName: name, updatedAt: Date.now() };
    self = await saveOwn(userId, self, store);
  }
  if (!signedIn) {
    return {
      status: 'signed-out',
      signedIn: false,
      self,
      rows: leaderboardRows([self]),
    };
  }
  try {
    const listed = await listRemote();
    const byId = new Map(listed.map((row) => [row.id, row]));
    byId.set(self.id, self);
    return {
      status: 'ready',
      signedIn: true,
      self,
      rows: leaderboardRows([...byId.values()]),
    };
  } catch (err) {
    noteRemote(err);
    return {
      status: isDenied(err) ? 'rules' : 'error',
      signedIn: true,
      self,
      rows: leaderboardRows([self]),
    };
  }
}

export async function recordLeaderboardGame(gameState, { user = null, gameId = null, storage } = {}) {
  const store = storageOrDefault(storage);
  const userId = user?.id || null;
  const current = await loadOwn(userId, store);
  const planned = planRecord(current, gameState, { userId, gameId });
  if (!planned.changed) return planned;
  const seat = seatToRecord(gameState, userId);
  planned.record.displayName = recordDisplayName(user, seat);
  planned.record.id = userId || 'local';
  planned.record.updatedAt = Date.now();
  await saveOwn(userId, planned.record, store);
  return planned;
}

export async function setLeaderboardOptOut(user, optOut, storage) {
  const store = storageOrDefault(storage);
  const userId = user?.id || null;
  const current = await loadOwn(userId, store);
  const next = withOptOut(current, optOut);
  next.displayName = recordDisplayName(user, null);
  next.id = userId || 'local';
  next.updatedAt = Date.now();
  return saveOwn(userId, next, store);
}

export async function resetLeaderboardScores(user, storage) {
  const store = storageOrDefault(storage);
  const userId = user?.id || null;
  const current = await loadOwn(userId, store);
  const next = resetScores(current);
  next.displayName = recordDisplayName(user, null);
  next.id = userId || 'local';
  next.updatedAt = Date.now();
  return saveOwn(userId, next, store);
}
