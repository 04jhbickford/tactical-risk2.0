/**
 * Firestore connection test for Tactical Risk
 * Uses Firebase REST APIs (works from Node.js).
 * Auth: tries anonymous first; falls back to email/password if anonymous is disabled.
 *
 * Usage:
 *   node test-firestore.mjs
 *   FIREBASE_TEST_EMAIL=you@example.com FIREBASE_TEST_PASSWORD=yourpassword node test-firestore.mjs
 */

const API_KEY    = 'AIzaSyAMrm6zJois_EdvD1JbGnQ_SKoO86abyW4';
const PROJECT_ID = 'tactical-risk';

const AUTH_BASE     = `https://identitytoolkit.googleapis.com/v1/accounts`;
const FIRESTORE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Localhost is an allowed referrer on this API key
const BASE_HEADERS = {
  'Content-Type': 'application/json',
  'Referer': 'http://localhost/',
  'Origin': 'http://localhost'
};

function pass(msg) { console.log(`  ✓ PASS  ${msg}`); }
function fail(msg, detail) { console.log(`  ✗ FAIL  ${msg}\n         ${detail}`); }

async function restJson(url, options = {}) {
  const res = await fetch(url, {
    headers: { ...BASE_HEADERS, ...options.headers },
    ...options
  });
  const body = await res.json();
  if (!res.ok) throw Object.assign(new Error(body?.error?.message || res.statusText), { status: res.status, body });
  return body;
}

async function signInAnonymously() {
  return restJson(`${AUTH_BASE}:signUp?key=${API_KEY}`, {
    method: 'POST',
    body: JSON.stringify({ returnSecureToken: true })
  });
}

async function signInWithEmail(email, password) {
  return restJson(`${AUTH_BASE}:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    body: JSON.stringify({ email, password, returnSecureToken: true })
  });
}

async function deleteAccount(idToken) {
  await restJson(`${AUTH_BASE}:delete?key=${API_KEY}`, {
    method: 'POST',
    body: JSON.stringify({ idToken })
  }).catch(() => {});
}

async function run() {
  console.log('\nTactical Risk — Firestore connection test');
  console.log('==========================================');

  const testEmail    = process.env.FIREBASE_TEST_EMAIL;
  const testPassword = process.env.FIREBASE_TEST_PASSWORD;

  // ── Step 1: Auth ─────────────────────────────────────────────────────────
  process.stdout.write('\n[1] Firebase Auth — signing in ... ');
  let idToken, uid, createdAnonAccount = false;

  if (testEmail && testPassword) {
    try {
      const auth = await signInWithEmail(testEmail, testPassword);
      idToken = auth.idToken;
      uid     = auth.localId;
      pass(`signed in as ${uid} (${testEmail})`);
    } catch (err) {
      fail(`email/password sign-in failed`, err.message);
      process.exit(1);
    }
  } else {
    // Try anonymous sign-in
    try {
      const auth = await signInAnonymously();
      idToken = auth.idToken;
      uid     = auth.localId;
      createdAnonAccount = true;
      pass(`anonymous sign-in, uid=${uid}`);
    } catch (err) {
      fail('anonymous sign-in failed', err.message);
      if (err.body?.error?.message === 'ADMIN_ONLY_OPERATION') {
        console.log('\n  → Anonymous sign-in is disabled. Two options:');
        console.log('    A) Enable it: Firebase console → Authentication → Sign-in method → Anonymous → Enable');
        console.log('    B) Pass real credentials:');
        console.log('       set FIREBASE_TEST_EMAIL=you@example.com && set FIREBASE_TEST_PASSWORD=pass && node test-firestore.mjs');
      }
      console.log('\nABORTED\n');
      process.exit(1);
    }
  }

  const docId  = `test_${Date.now()}`;
  const docUrl = `${FIRESTORE_URL}/lobbies/${docId}`;
  const authHeader = { Authorization: `Bearer ${idToken}` };
  let createOk = false;

  // ── Step 2: Write a lobby document ───────────────────────────────────────
  process.stdout.write('\n[2] Firestore write — create lobbies/' + docId + ' ... ');
  try {
    await restJson(docUrl, {
      method: 'PATCH',
      headers: authHeader,
      body: JSON.stringify({
        fields: {
          code:     { stringValue: 'TEST01' },
          hostId:   { stringValue: uid },
          hostName: { stringValue: 'test-runner' },
          status:   { stringValue: 'waiting' },
          _testDoc: { booleanValue: true }
        }
      })
    });
    createOk = true;
    pass('document created');
  } catch (err) {
    fail('setDoc (write) failed', `HTTP ${err.status}: ${err.message}`);
    if (err.status === 403) {
      console.log('\n  → Permission denied. The security rules are not yet active.');
      console.log('    Verify they were published at:');
      console.log('    https://console.firebase.google.com/project/tactical-risk/firestore/rules');
    }
  }

  // ── Step 3: Read it back ─────────────────────────────────────────────────
  process.stdout.write('\n[3] Firestore read  — fetch lobbies/' + docId + ' ... ');
  if (!createOk) {
    console.log('  SKIP  (write failed)');
  } else {
    try {
      const snap = await restJson(docUrl, { headers: authHeader });
      const code = snap.fields?.code?.stringValue;
      if (code === 'TEST01') {
        pass(`data verified, code="${code}"`);
      } else {
        fail('data mismatch', JSON.stringify(snap.fields));
      }
    } catch (err) {
      fail('getDoc (read) failed', `HTTP ${err.status}: ${err.message}`);
    }
  }

  // ── Step 4: Delete ───────────────────────────────────────────────────────
  process.stdout.write('\n[4] Firestore delete — remove lobbies/' + docId + ' ... ');
  if (!createOk) {
    console.log('  SKIP  (write failed)');
  } else {
    try {
      await restJson(docUrl, { method: 'DELETE', headers: authHeader });
      pass('document deleted');
    } catch (err) {
      fail('delete failed', `HTTP ${err.status}: ${err.message}`);
      console.log(`     Manually delete lobbies/${docId} in the Firebase console`);
    }
  }

  // Clean up anonymous account so it doesn't clutter Auth
  if (createdAnonAccount) {
    await deleteAccount(idToken);
  }

  console.log('\n==========================================\n');
}

run().catch(err => {
  console.error('\nUnhandled error:', err.message);
  process.exit(1);
});
