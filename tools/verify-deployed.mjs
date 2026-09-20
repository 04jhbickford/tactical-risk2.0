// Verify the live site matches the local checkout.
// Usage: node tools/verify-deployed.mjs [siteUrl]
//
// Fetches src/version.js from the deployed site, extracts GAME_VERSION, and
// compares it with the local file. Run this after any deploy — it catches the
// "we thought we deployed it" failure mode from the other direction.

import { readFileSync } from 'fs';

const VERSION_FILE = 'src/version.js';

const siteUrl = (process.argv[2] || 'https://tactical-risk.web.app').replace(/\/$/, '');

function extractVersion(source) {
  const m = source.match(/GAME_VERSION\s*=\s*['"]([^'"]+)['"]/);
  return m ? m[1] : null;
}

const localVersion = extractVersion(readFileSync(VERSION_FILE, 'utf8'));

try {
  const res = await fetch(`${siteUrl}/${VERSION_FILE}`, { cache: 'no-store' });
  if (!res.ok) {
    console.error(`[verify-deployed] Could not fetch ${siteUrl}/${VERSION_FILE} — HTTP ${res.status}`);
    process.exit(1);
  }
  const liveVersion = extractVersion(await res.text());

  console.log(`[verify-deployed] local:  ${localVersion}`);
  console.log(`[verify-deployed] live:   ${liveVersion}  (${siteUrl})`);

  if (!liveVersion || liveVersion !== localVersion) {
    console.error('[verify-deployed] MISMATCH — the live site is not running this checkout. Deploy (or pull) to fix.');
    process.exit(1);
  }
  console.log('[verify-deployed] OK — live site matches local checkout.');
} catch (err) {
  console.error(`[verify-deployed] Failed to reach ${siteUrl}: ${err.message}`);
  process.exit(1);
}
