// AI-turn RUN policy — decides WHEN AI turns may run, independent of WHO is
// allowed to run them (that's authority: host/failover, in syncManager).
// Dependency-free so both the sync path (main.js) and the N-client robustness
// harness can import it.
//
// Bug 2 (V2.55 playtest): a game with AI players kept advancing AI turns even
// when no human was present to watch — an unattended game never truly paused.
// See PHASE_4_PLAN.md ("AI-when-unattended policy") for the three options and
// their trade-offs.

// Default policy: PAUSE the AI when the table is unattended (no human present).
// A game opts back into the legacy always-run behavior by setting the doc-level
// flag gameDoc.aiRunsWhenUnattended === true.
export const DEFAULT_AI_RUNS_WHEN_UNATTENDED = false;

// True if at least one non-AI, non-surrendered player is currently connected.
// presenceOf(oderId) -> presence string; anything other than 'offline' (and a
// truthy value) counts as present. A missing presenceOf returns false (safe:
// treat unknown presence as absent so the AI pauses rather than runs blind).
export function anyHumanPresent(players, presenceOf) {
  if (!Array.isArray(players) || typeof presenceOf !== 'function') return false;
  return players.some(p => {
    if (!p || p.isAI || p.surrendered) return false;
    const presence = presenceOf(p.oderId);
    return !!presence && presence !== 'offline';
  });
}

// A seated human whose client is actually running this page counts as present
// even if the presence doc is stale (iPhone host background/lock/heartbeat).
// Abandoned games (no local seated human, no online humans) still pause.
export function isLocalHumanSeated(players, localUserId) {
  if (!localUserId || !Array.isArray(players)) return false;
  return players.some(p =>
    p && !p.isAI && !p.surrendered && p.oderId === localUserId
  );
}

export function computeHumanPresent({ players, presenceOf, localUserId } = {}) {
  if (isLocalHumanSeated(players, localUserId)) return true;
  return anyHumanPresent(players, presenceOf);
}

// The run gate: may AI turns run right now on THIS client?
//   aiHasAuthority   — this client is allowed to run AI (host or failover)
//   runsWhenUnattended — the game's configured policy flag (see default above)
//   humanPresent     — result of computeHumanPresent(...) / anyHumanPresent(...)
// AI runs only if this client has authority AND (the game permits unattended AI
// OR a human is actually present).
export function mayRunAI({ aiHasAuthority, runsWhenUnattended, humanPresent }) {
  if (!aiHasAuthority) return false;
  if (runsWhenUnattended) return true;
  return !!humanPresent;
}
