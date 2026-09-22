// Single source of truth for the deployed app version and the game-state schema
// version. Kept dependency-free (no imports) so the UI (lobby) and the
// multiplayer core (syncManager) can both import it without coupling UI code
// into the sync path. Bump GAME_VERSION for every deployed change.

export const GAME_VERSION = 'V2.81.57-unified.3';

// Schema version of the serialized game state (mirrors gameState.toJSON().version).
// Bump only when the persisted state shape changes; a mismatch here is a harder
// compatibility signal than the display version.
export const SCHEMA_VERSION = 11;

// Compare two 'V<major>.<minor>' version strings.
// Returns -1 if a < b, 0 if equal, 1 if a > b.
// Unparseable input sorts as the OLDEST possible version so a malformed or
// missing stamp on a game doc can never trigger a spurious "you're behind"
// refresh banner (fail safe: only a cleanly-newer writer prompts a refresh).
export function compareGameVersions(a, b) {
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
