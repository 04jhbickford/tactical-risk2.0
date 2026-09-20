// Pure lobby seat transforms. Firestore last-write-wins on the full
// `players` array is what dropped a just-joined human (Benson) and left
// an extra Easy Bot on the Open Games card. Every writer must apply these
// to the LATEST lobby doc, never a stale currentLobby cache.

export function findLobbyPlayerIndex(players, oderId) {
  if (!oderId) return -1;
  return (players || []).findIndex((p) => p && p.oderId === oderId);
}

export function joinLobbySeat({
  players = [],
  newPlayer = null,
  maxPlayers = 0,
} = {}) {
  const list = Array.isArray(players) ? [...players] : [];
  if (!newPlayer?.oderId) return { ok: false, error: 'Invalid player' };
  if (list.some((p) => p && p.oderId === newPlayer.oderId)) {
    return { ok: true, players: list, alreadySeated: true };
  }
  const max = Number(maxPlayers) || 0;
  if (max > 0 && list.length >= max) {
    return { ok: false, error: 'Lobby is full' };
  }
  return { ok: true, players: [...list, newPlayer], alreadySeated: false };
}

export function patchLobbySeat({
  players = [],
  userId = null,
  updates = {},
} = {}) {
  const list = Array.isArray(players) ? players.map((p) => ({ ...p })) : [];
  const idx = findLobbyPlayerIndex(list, userId);
  if (idx === -1) return { ok: false, error: 'Not in lobby' };
  list[idx] = { ...list[idx], ...updates };
  return { ok: true, players: list };
}

export function addLobbyAISeat({
  players = [],
  aiPlayer = null,
  maxPlayers = 0,
} = {}) {
  const list = Array.isArray(players) ? [...players] : [];
  const max = Number(maxPlayers) || 0;
  if (max > 0 && list.length >= max) {
    return { ok: false, error: 'Lobby is full' };
  }
  if (!aiPlayer?.oderId) return { ok: false, error: 'Invalid AI player' };
  return { ok: true, players: [...list, aiPlayer] };
}

export function removeLobbyAISeat({
  players = [],
  oderId = null,
  index = null,
} = {}) {
  const list = Array.isArray(players) ? [...players] : [];
  let idx = -1;
  if (oderId) idx = findLobbyPlayerIndex(list, oderId);
  else if (Number.isInteger(index)) idx = index;
  const player = list[idx];
  if (!player || !player.isAI) return { ok: false, error: 'Not an AI player' };
  return { ok: true, players: list.filter((_, i) => i !== idx) };
}

export function removeLobbyHumanSeat({ players = [], userId = null } = {}) {
  const list = Array.isArray(players) ? [...players] : [];
  return { ok: true, players: list.filter((p) => p && p.oderId !== userId) };
}

export function transferLobbyHost({
  players = [],
  leavingUserId = null,
} = {}) {
  const remaining = (players || []).filter((p) => p && p.oderId !== leavingUserId);
  const nextHuman = remaining.find((p) => p && !p.isAI);
  if (!nextHuman) {
    return { ok: true, players: remaining, nextHost: null };
  }
  return {
    ok: true,
    nextHost: nextHuman,
    players: remaining.map((p) => ({
      ...p,
      isHost: p.oderId === nextHuman.oderId,
    })),
  };
}

export function startGameRoster(latestPlayers = []) {
  const players = Array.isArray(latestPlayers) ? latestPlayers : [];
  return {
    players,
    playerUserIds: players.map((p) => p?.oderId).filter(Boolean),
  };
}

// Open Games / My Games title. Prefer live state seats when present —
// lobbyData can lag or lose a joiner if a stale full-array write won.
export function seatNamesForOpenGameCard({
  lobbyPlayers = [],
  statePlayers = [],
} = {}) {
  const fromState = (statePlayers || [])
    .map((p) => p?.displayName || p?.name)
    .filter(Boolean);
  if (fromState.length) return fromState;
  return (lobbyPlayers || [])
    .map((p) => p?.displayName || p?.name)
    .filter(Boolean);
}

export function lobbySeatIds(players = []) {
  return (players || []).map((p) => p?.oderId).filter(Boolean);
}

export function humanSeatPreserved({
  latestPlayers = [],
  nextPlayers = [],
  humanId = null,
} = {}) {
  if (!humanId) return false;
  const latestHad = (latestPlayers || []).some((p) => p && p.oderId === humanId && !p.isAI);
  if (!latestHad) return true;
  return (nextPlayers || []).some((p) => p && p.oderId === humanId && !p.isAI);
}
