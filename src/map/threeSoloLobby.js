// Three chrome lobby. Option surface matches live Canvas `lobby.js`
// (Local Play → New Local Game). Local-only — no Firebase.

import {
  AI_DIFFICULTIES,
  FACTION_COLORS,
  TEAM_COLORS,
  STARTING_IPC_OPTIONS,
  DEFAULT_STARTING_IPCS,
} from '../ui/lobby.js';

export {
  AI_DIFFICULTIES,
  FACTION_COLORS,
  TEAM_COLORS,
  STARTING_IPC_OPTIONS,
  DEFAULT_STARTING_IPCS,
};

export const LOBBY_DIFFICULTIES = ['easy', 'medium', 'hard'];
export const LOBBY_OCCUPANT_KINDS = ['human', 'ai', 'empty'];
export const LOBBY_MODES = ['classic', 'risk'];
export const LOBBY_SCREENS = ['main', 'setup', 'howto', 'online', 'create', 'join', 'room'];
export const LOBBY_MODE_LABELS = {
  classic: 'Classic 1942',
  risk: 'Risk',
};

function rememberAi(lobby, seat, occupant) {
  if (!lobby.lastAi) lobby.lastAi = {};
  if (LOBBY_DIFFICULTIES.includes(occupant)) lobby.lastAi[seat] = occupant;
}

export function occupantKindOf(occupant, seated = true) {
  if (!seated) return 'empty';
  if (occupant === 'human') return 'human';
  if (occupant === 'ai' || LOBBY_DIFFICULTIES.includes(occupant)) return 'ai';
  return 'empty';
}

export function seatOccupantView(lobby, factionId) {
  const on = (lobby?.selectedPlayers || []).includes(factionId);
  const raw = lobby?.playerAI?.[factionId];
  const kind = occupantKindOf(raw, on);
  const remembered = lobby?.lastAi?.[factionId];
  const lastAi = LOBBY_DIFFICULTIES.includes(remembered)
    ? remembered
    : (LOBBY_DIFFICULTIES.includes(raw) ? raw : 'medium');
  const tier = kind === 'ai' && LOBBY_DIFFICULTIES.includes(raw) ? raw : lastAi;
  let meta = 'Tap to add';
  if (on && kind === 'human') meta = 'Human';
  if (on && kind === 'ai') {
    const named = AI_DIFFICULTIES.find((d) => d.id === (raw || tier));
    meta = named?.name || 'AI';
  }
  return { on, kind, raw: on ? (raw || 'human') : 'empty', tier, meta };
}

const ON = new Set(['1', 'true', 'yes']);

export function factionsOf(setup, mode = 'risk') {
  if (mode === 'classic') return setup?.classic?.factions || setup?.factions || [];
  return setup?.risk?.factions || setup?.classic?.factions || setup?.factions || [];
}

export function parseSoloLobbySearch(search = '') {
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const mode = params.get('mode') === 'classic' ? 'classic' : 'risk';
  const difficulty = LOBBY_DIFFICULTIES.includes(params.get('diff'))
    ? params.get('diff')
    : 'medium';
  const seat = params.get('seat') || params.get('faction') || 'Russians';
  const ai = Number(params.get('ai'));
  const ipc = Number(params.get('ipc'));
  const cargo = ON.has(String(params.get('cargo') || '').toLowerCase());
  return {
    mode: cargo ? 'classic' : mode,
    humanSeat: cargo ? 'Americans' : seat,
    aiCount: Number.isFinite(ai) && ai > 0 ? ai : 4,
    difficulty,
    startingIPCs: STARTING_IPC_OPTIONS.includes(ipc) ? ipc : DEFAULT_STARTING_IPCS,
    teamsEnabled: ON.has(String(params.get('teams') || '').toLowerCase()),
    skip: cargo
      || ON.has(String(params.get('go') || '').toLowerCase())
      || ON.has(String(params.get('autostart') || '').toLowerCase()),
    cargo,
  };
}

function defaultColors(factions) {
  const colors = {};
  factions.forEach((f, i) => {
    const swatch = FACTION_COLORS[i % FACTION_COLORS.length];
    colors[f.id] = {
      color: f.color || swatch.color,
      lightColor: f.lightColor || swatch.light,
    };
  });
  return colors;
}

function seatSkipDefaults(lobby, parsed) {
  const factions = lobby.factions || [];
  const humanId = factions.some((f) => f.id === parsed.humanSeat)
    ? parsed.humanSeat
    : (factions[0]?.id || 'Russians');
  const others = factions.filter((f) => f.id !== humanId);
  const n = Math.max(1, Math.min(others.length, Number(parsed.aiCount) || 4));
  const seated = [humanId, ...others.slice(0, n).map((f) => f.id)];
  lobby.selectedPlayers = seated;
  lobby.playerAI = {};
  if (!lobby.lastAi) lobby.lastAi = {};
  for (const id of seated) {
    lobby.playerAI[id] = id === humanId ? 'human' : parsed.difficulty;
    rememberAi(lobby, id, lobby.playerAI[id]);
  }
  lobby.humanSeat = humanId;
  return lobby;
}

export function createSoloLobby(setup, search = '') {
  const parsed = parseSoloLobbySearch(search);
  const factions = factionsOf(setup, parsed.mode);
  const lobby = {
    open: !parsed.skip,
    screen: parsed.skip ? 'setup' : 'main',
    mode: parsed.mode,
    humanSeat: factions.some((f) => f.id === parsed.humanSeat)
      ? parsed.humanSeat
      : (factions[0]?.id || 'Russians'),
    selectedPlayers: [],
    playerAI: {},
    playerNames: {},
    playerColors: defaultColors(factions),
    playerTeams: {},
    teamsEnabled: parsed.teamsEnabled,
    startingIPCs: parsed.startingIPCs,
    factions,
    lastAi: {},
    showHowTo: false,
    cargo: !!parsed.cargo,
  };
  for (const f of factions) {
    lobby.playerAI[f.id] = 'human';
    lobby.lastAi[f.id] = parsed.difficulty;
  }
  if (parsed.skip) seatSkipDefaults(lobby, parsed);
  return lobby;
}

export function setLobbyScreen(lobby, screen) {
  if (LOBBY_SCREENS.includes(screen)) lobby.screen = screen;
  if (screen === 'howto') lobby.showHowTo = true;
  if (screen === 'main' || screen === 'setup') lobby.showHowTo = false;
  return lobby;
}

export function setLobbyMode(lobby, mode) {
  if (!LOBBY_MODES.includes(mode)) return lobby;
  lobby.mode = mode;
  return lobby;
}

export function setLobbySeat(lobby, seat) {
  return toggleLobbySeat(lobby, seat);
}

export function toggleLobbySeat(lobby, seat) {
  if (!(lobby.factions || []).some((f) => f.id === seat)) return lobby;
  const idx = lobby.selectedPlayers.indexOf(seat);
  if (idx >= 0) {
    lobby.selectedPlayers.splice(idx, 1);
    delete lobby.playerNames[seat];
  } else {
    lobby.selectedPlayers.push(seat);
    const faction = lobby.factions.find((f) => f.id === seat);
    lobby.playerNames[seat] = faction?.name || seat;
    if (lobby.playerAI[seat] == null) lobby.playerAI[seat] = 'human';
  }
  const human = lobby.selectedPlayers.find((id) => lobby.playerAI[id] === 'human');
  lobby.humanSeat = human || lobby.selectedPlayers[0] || lobby.humanSeat;
  return lobby;
}

export function setLobbyOccupant(lobby, seat, occupant) {
  if (!(lobby.factions || []).some((f) => f.id === seat)) return lobby;
  if (occupant === 'empty') {
    const idx = lobby.selectedPlayers.indexOf(seat);
    if (idx >= 0) {
      lobby.selectedPlayers.splice(idx, 1);
      delete lobby.playerNames[seat];
    }
    const human = lobby.selectedPlayers.find((id) => lobby.playerAI[id] === 'human');
    lobby.humanSeat = human || lobby.selectedPlayers[0] || lobby.humanSeat;
    return lobby;
  }
  let next = occupant;
  if (occupant === 'ai') {
    const prev = lobby.playerAI?.[seat];
    const remembered = lobby.lastAi?.[seat];
    next = LOBBY_DIFFICULTIES.includes(prev)
      ? prev
      : (LOBBY_DIFFICULTIES.includes(remembered) ? remembered : 'medium');
  }
  const ids = ['human', ...LOBBY_DIFFICULTIES];
  if (!ids.includes(next)) return lobby;
  if (!lobby.selectedPlayers.includes(seat)) toggleLobbySeat(lobby, seat);
  lobby.playerAI[seat] = next;
  rememberAi(lobby, seat, next);
  const human = lobby.selectedPlayers.find((id) => lobby.playerAI[id] === 'human');
  lobby.humanSeat = human || lobby.selectedPlayers[0] || lobby.humanSeat;
  return lobby;
}

export function setLobbyAiCount(lobby, delta) {
  const factions = lobby.factions || [];
  const humanId = lobby.humanSeat || factions[0]?.id;
  if (!humanId) return lobby;
  if (!lobby.selectedPlayers.includes(humanId)) {
    lobby.selectedPlayers = [humanId];
    lobby.playerAI[humanId] = 'human';
  }
  const others = factions.filter((f) => f.id !== humanId).map((f) => f.id);
  const seatedAi = lobby.selectedPlayers.filter((id) => id !== humanId);
  const next = Math.max(1, Math.min(others.length, seatedAi.length + Number(delta || 0)));
  lobby.selectedPlayers = [humanId, ...others.slice(0, next)];
  for (const id of lobby.selectedPlayers) {
    if (id === humanId) lobby.playerAI[id] = 'human';
    else if (lobby.playerAI[id] === 'human' || lobby.playerAI[id] == null) {
      lobby.playerAI[id] = 'medium';
    }
    rememberAi(lobby, id, lobby.playerAI[id]);
  }
  return lobby;
}

export function setLobbyDifficulty(lobby, difficulty) {
  if (!LOBBY_DIFFICULTIES.includes(difficulty)) return lobby;
  for (const id of lobby.selectedPlayers) {
    if (lobby.playerAI[id] !== 'human') {
      lobby.playerAI[id] = difficulty;
      rememberAi(lobby, id, difficulty);
    }
  }
  return lobby;
}

export function setLobbyIpc(lobby, ipc) {
  const n = Number(ipc);
  if (STARTING_IPC_OPTIONS.includes(n)) lobby.startingIPCs = n;
  return lobby;
}

export function setLobbyTeams(lobby, on) {
  lobby.teamsEnabled = !!on;
  if (!lobby.teamsEnabled) lobby.playerTeams = {};
  return lobby;
}

export function setLobbyTeam(lobby, seat, team) {
  const n = Number(team);
  if (!lobby.teamsEnabled) return lobby;
  lobby.playerTeams[seat] = n === 1 || n === 2 ? n : null;
  return lobby;
}

export function setLobbyColor(lobby, seat, colorId) {
  const swatch = FACTION_COLORS.find((c) => c.id === colorId);
  if (!swatch) return lobby;
  lobby.playerColors[seat] = { color: swatch.color, lightColor: swatch.light };
  return lobby;
}

export function applyLobbyAction(lobby, kind, value) {
  if (kind === 'screen') return setLobbyScreen(lobby, value);
  if (kind === 'mode') return setLobbyMode(lobby, value);
  if (kind === 'seat') return toggleLobbySeat(lobby, value);
  if (kind === 'occupant') {
    const [seat, occupant] = String(value || '').split(':');
    return setLobbyOccupant(lobby, seat, occupant);
  }
  if (kind === 'ai') return setLobbyAiCount(lobby, value);
  if (kind === 'diff') return setLobbyDifficulty(lobby, value);
  if (kind === 'ipc') return setLobbyIpc(lobby, value);
  if (kind === 'teams') return setLobbyTeams(lobby, value === '1' || value === true);
  if (kind === 'team') {
    const [seat, team] = String(value || '').split(':');
    return setLobbyTeam(lobby, seat, team);
  }
  if (kind === 'color') {
    const [seat, colorId] = String(value || '').split(':');
    return setLobbyColor(lobby, seat, colorId);
  }
  if (kind === 'howto') {
    lobby.showHowTo = value !== '0';
    return lobby;
  }
  return lobby;
}

export function lobbyHasHuman(lobby) {
  return (lobby?.selectedPlayers || []).some((id) => (lobby.playerAI?.[id] || 'human') === 'human');
}

export function lobbyCanStart(lobby) {
  return (lobby?.selectedPlayers || []).length >= 2 && lobbyHasHuman(lobby);
}

export function lobbyStartLabel(lobby) {
  const n = (lobby?.selectedPlayers || []).length;
  if (n < 2) return 'Select at least 2 players';
  if (!lobbyHasHuman(lobby)) return 'Need at least one Human';
  return `Start Game (${n} Players)`;
}

export function lobbyBuildPlayers(lobby) {
  const factions = lobby.factions || [];
  return (lobby.selectedPlayers || []).map((id) => {
    const faction = factions.find((f) => f.id === id) || { id, name: id };
    const custom = lobby.playerColors?.[id];
    const occupant = lobby.playerAI?.[id] || 'human';
    return {
      ...faction,
      name: lobby.playerNames?.[id]?.trim() || faction.name,
      color: custom?.color || faction.color,
      lightColor: custom?.lightColor || faction.lightColor,
      isAI: occupant !== 'human',
      aiDifficulty: occupant,
      teamId: lobby.teamsEnabled ? (lobby.playerTeams?.[id] || null) : null,
    };
  });
}

export function lobbyStartOptions(lobby) {
  const players = lobbyBuildPlayers(lobby);
  const human = players.find((p) => !p.isAI) || players[0];
  return {
    mode: lobby.mode === 'classic' ? 'classic' : 'risk',
    humanSeat: human?.id || lobby.humanSeat,
    players,
    startingIPCs: lobby.startingIPCs || DEFAULT_STARTING_IPCS,
    teamsEnabled: !!lobby.teamsEnabled,
    alliancesEnabled: lobby.mode === 'classic',
  };
}

export function lobbyInspect(lobby) {
  return {
    open: !!lobby?.open,
    screen: lobby?.screen || 'main',
    mode: lobby?.mode || 'risk',
    humanSeat: lobby?.humanSeat || null,
    selected: [...(lobby?.selectedPlayers || [])],
    occupants: { ...(lobby?.playerAI || {}) },
    kinds: Object.fromEntries((lobby?.factions || []).map((f) => [f.id, seatOccupantView(lobby, f.id).kind])),
    aiCount: (lobby?.selectedPlayers || []).filter((id) => lobby.playerAI?.[id] !== 'human').length,
    difficulty: (lobby?.selectedPlayers || [])
      .map((id) => lobby.playerAI?.[id])
      .find((id) => id && id !== 'human') || 'medium',
    startingIPCs: Number(lobby?.startingIPCs) || DEFAULT_STARTING_IPCS,
    teamsEnabled: !!lobby?.teamsEnabled,
    canStart: lobbyCanStart(lobby),
    startLabel: lobbyStartLabel(lobby),
    showHowTo: !!lobby?.showHowTo,
  };
}
