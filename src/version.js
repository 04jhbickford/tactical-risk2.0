// Single source of truth for the deployed app version and the game-state schema
// version. Kept dependency-free (no imports) so the UI (lobby) and the
// multiplayer core (syncManager) can both import it without coupling UI code
// into the sync path. Bump GAME_VERSION for every deployed change.

export const GAME_VERSION = 'V2.81.57-unified.15';

// Schema version of the serialized game state (mirrors gameState.toJSON().version).
// Bump only when the persisted state shape changes; a mismatch here is a harder
// compatibility signal than the display version.
export const SCHEMA_VERSION = 11;

// unified.15 → [15, 0]. unified.15.1 → [15, 1]. Absent suffix → null.
export function unifiedReleaseParts(version) {
  const match = /unified\.(\d+)(?:\.(\d+))?/.exec(String(version || ''));
  if (!match) return null;
  return [Number(match[1]), match[2] != null ? Number(match[2]) : 0];
}

// Field written on the game doc as `clientVersion`. unified.14.1 compares
// only the first two numbers, and every unified.N display stamp is V2.81,
// so the display stamp never prompts that tab. V2.82 is newer than V2.81.
// The unified suffix is what this build compares, so a later release
// (V2.82-unified.16) still prompts a stale unified.15 tab, while our own
// write (V2.82-unified.15) does not.
export function compatClientVersion(version = GAME_VERSION) {
  const parts = unifiedReleaseParts(version);
  if (!parts) return String(version || '');
  const suffix = parts[1] ? `${parts[0]}.${parts[1]}` : String(parts[0]);
  return `V2.82-unified.${suffix}`;
}

// Compare two version strings. Returns -1 if a < b, 0 if equal, 1 if a > b.
// When both stamps carry a unified release, that release orders them.
// Otherwise the first two numbers are used, which is what unified.14.1 does.
// Unparseable input sorts as the oldest possible version so a malformed or
// missing stamp never triggers a spurious refresh banner.
export function compareGameVersions(a, b) {
  const aUnified = unifiedReleaseParts(a);
  const bUnified = unifiedReleaseParts(b);
  if (aUnified && bUnified) {
    if (aUnified[0] !== bUnified[0]) return aUnified[0] < bUnified[0] ? -1 : 1;
    if (aUnified[1] !== bUnified[1]) return aUnified[1] < bUnified[1] ? -1 : 1;
    return 0;
  }
  const parse = (v) => {
    const m = /^V?(\d+)\.(\d+)/.exec(String(v ?? ''));
    return m ? [Number(m[1]), Number(m[2])] : [-1, -1];
  };
  const [aMaj, aMin] = parse(a);
  const [bMaj, bMin] = parse(b);
  if (aMaj !== bMaj) return aMaj < bMaj ? -1 : 1;
  if (aMin !== bMin) return aMin < bMin ? -1 : 1;
  return 0;
}

// Non-empty when main.js should show the Refresh banner.
export function versionRefreshReason(event, data) {
  if (event === 'version_outdated') return data?.remoteVersion || 'a newer build';
  if (event === 'draft_client_blocked') {
    return data?.minClientVersion || data?.remoteVersion || 'a newer build';
  }
  return '';
}
