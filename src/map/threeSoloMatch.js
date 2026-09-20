// Classic 1942 solo-vs-AI match helpers. No DOM. Preview / hybrid only.

import { GameState, GAME_PHASES, TURN_PHASE_NAMES } from '../state/gameState.js';
import {
  CLASSIC_CAPITALS,
  prepareClassicSoloState,
  seedClassicPlayerTechs,
} from '../state/classicCapitals.js';

export const DEFAULT_HUMAN_SEAT = 'Russians';
export const DEFAULT_AI_DIFFICULTY = 'medium';

export function buildClassicSoloPlayers(setup, {
  humanSeat = DEFAULT_HUMAN_SEAT,
  aiDifficulty = DEFAULT_AI_DIFFICULTY,
} = {}) {
  const factions = setup?.classic?.factions || setup?.factions || [];
  const humanId = humanSeat || DEFAULT_HUMAN_SEAT;
  const players = factions.map((faction) => {
    const human = faction.id === humanId;
    return {
      ...faction,
      isAI: !human,
      aiDifficulty: human ? 'human' : (aiDifficulty || DEFAULT_AI_DIFFICULTY),
    };
  });
  const human = players.find((p) => !p.isAI);
  if (!human) return players;
  return [human, ...players.filter((p) => p !== human)];
}

export function buildSoloPlayers(setup, {
  mode = 'classic',
  humanSeat = DEFAULT_HUMAN_SEAT,
  aiCount = 4,
  aiDifficulty = DEFAULT_AI_DIFFICULTY,
  players = null,
} = {}) {
  if (Array.isArray(players) && players.length >= 2) {
    const human = players.find((p) => !p.isAI) || players[0];
    return [human, ...players.filter((p) => p !== human)];
  }
  if (mode !== 'risk') {
    return buildClassicSoloPlayers(setup, { humanSeat, aiDifficulty });
  }
  const factions = setup?.risk?.factions || setup?.classic?.factions || setup?.factions || [];
  const humanId = humanSeat || DEFAULT_HUMAN_SEAT;
  const human = factions.find((f) => f.id === humanId) || factions[0];
  if (!human) return [];
  const others = factions.filter((f) => f.id !== human.id);
  const n = Math.max(1, Math.min(others.length, Number(aiCount) || 3));
  const seated = [human, ...others.slice(0, n)];
  return seated.map((faction) => {
    const isHuman = faction.id === human.id;
    return {
      ...faction,
      isAI: !isHuman,
      aiDifficulty: isHuman ? 'human' : (aiDifficulty || DEFAULT_AI_DIFFICULTY),
    };
  });
}

export function startClassicSolo(setup, territories, continents, options = {}) {
  const players = options.players || buildClassicSoloPlayers(setup, options);
  const gameState = new GameState(setup, territories, continents);
  gameState.isMultiplayer = false;
  gameState.initGame('classic', players, { alliancesEnabled: true });
  prepareClassicSoloState(gameState);
  return gameState;
}

export function startSoloMatch(setup, territories, continents, options = {}) {
  if (options.mode === 'risk') {
    const players = options.players || buildSoloPlayers(setup, options);
    const gameState = new GameState(setup, territories, continents);
    gameState.isMultiplayer = false;
    gameState.initGame('risk', players, {
      startingIPCs: options.startingIPCs || 80,
      teamsEnabled: !!options.teamsEnabled,
      alliancesEnabled: options.alliancesEnabled === true,
    });
    seedClassicPlayerTechs(gameState);
    return gameState;
  }
  return startClassicSolo(setup, territories, continents, {
    ...options,
    players: options.players || buildSoloPlayers(setup, { ...options, mode: 'classic' }),
  });
}

export function placementsFromState(gameState) {
  const out = {};
  for (const [name, stacks] of Object.entries(gameState?.units || {})) {
    out[name] = (stacks || []).map((s) => ({
      type: s.type,
      quantity: Number(s.quantity) || 0,
      owner: s.owner,
    }));
  }
  return out;
}

export function inspectSolo(gameState) {
  const players = gameState?.players || [];
  const capitals = {};
  const ipc = {};
  for (const player of players) {
    capitals[player.id] = gameState.playerState?.[player.id]?.capitalTerritory || null;
    ipc[player.id] = gameState.getIPCs?.(player.id) ?? gameState.playerState?.[player.id]?.ipcs ?? 0;
  }
  const human = players.find((p) => !p.isAI) || null;
  const current = gameState?.currentPlayer || null;
  return {
    solo: true,
    mode: gameState?.gameMode || null,
    phase: gameState?.phase || null,
    playing: gameState?.phase === GAME_PHASES.PLAYING,
    turnPhase: gameState?.turnPhase || null,
    turnPhaseName: TURN_PHASE_NAMES[gameState?.turnPhase] || gameState?.turnPhase || null,
    currentPlayer: current ? { id: current.id, name: current.name, isAI: !!current.isAI } : null,
    human: human ? { id: human.id, name: human.name, isAI: false } : null,
    ai: players.filter((p) => p.isAI).map((p) => ({
      id: p.id,
      name: p.name,
      isAI: true,
      aiDifficulty: p.aiDifficulty || DEFAULT_AI_DIFFICULTY,
    })),
    capitals,
    classicCapitals: { ...CLASSIC_CAPITALS },
    ipc,
    landCount: Object.keys(gameState?.territoryState || {}).length,
    unitTerritories: Object.keys(gameState?.units || {}).length,
    stamped: Object.values(CLASSIC_CAPITALS).every((name) => (
      gameState?.territoryState?.[name]?.isCapital === true
    )),
    gameMode: gameState?.gameMode || null,
    setupPhase: gameState?.phase || null,
  };
}
