// Live host rewrite after Resign. AI authority must follow lobbyData
// (surrender.js stamps the next seated human). Clients already in the
// session update setIsHost / hostOderId from snapshots — no full rejoin.
// Failover watches the *current* host id, not the id frozen at join.

export function resolveHostOderId({
  lobbyData = null,
  players = null,
  hostId = null,
} = {}) {
  const list = lobbyData?.players || players || [];
  const flagged = list.find((p) => p && p.isHost);
  if (flagged?.oderId) return flagged.oderId;
  return lobbyData?.hostId || hostId || null;
}

export function resolveIsHost({
  userId = null,
  lobbyData = null,
  players = null,
  hostId = null,
} = {}) {
  if (!userId) return false;
  return resolveHostOderId({ lobbyData, players, hostId }) === userId;
}

// Apply a lobbyData snapshot to the live session host fields.
// Old host → isHost false (cannot run AI). New host → isHost true
// so they run AI without waiting for the 90s failover clock.
export function applyLiveHostHandoff({
  currentHostOderId = null,
  currentIsHost = false,
  userId = null,
  lobbyData = null,
  players = null,
  hostId = null,
} = {}) {
  const nextHostOderId = resolveHostOderId({ lobbyData, players, hostId })
    || currentHostOderId
    || null;
  const nextIsHost = resolveIsHost({
    userId,
    lobbyData,
    players,
    hostId: nextHostOderId,
  });
  return {
    hostOderId: nextHostOderId,
    isHost: nextIsHost,
    changed: nextHostOderId !== currentHostOderId || nextIsHost !== currentIsHost,
  };
}

export function rewriteLobbyHostAfterResign({
  lobbyData = null,
  leavingUserId = null,
  surrenderedIds = new Set(),
} = {}) {
  if (!lobbyData?.players?.some((p) => p.oderId === leavingUserId && p.isHost)) {
    return lobbyData;
  }
  const nextHost = lobbyData.players.find(
    (p) => !p.isAI && p.oderId !== leavingUserId && !surrenderedIds.has(p.oderId)
  );
  if (!nextHost) return lobbyData;
  return {
    ...lobbyData,
    hostId: nextHost.oderId,
    players: lobbyData.players.map((p) => ({
      ...p,
      isHost: p.oderId === nextHost.oderId,
    })),
  };
}
