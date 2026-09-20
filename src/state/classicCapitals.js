// Historical A&A 1942 capitals. Classic init leaves capitalTerritory null,
// which makes AI purchase no-op and kills factory/capital-loot rules.

import { GAME_PHASES, SETUP_TURN_PHASE, TURN_PHASES } from './gameState.js';

export const CLASSIC_CAPITALS = {
  Russians: 'Russia',
  Germans: 'Germany',
  British: 'United Kingdom',
  Japanese: 'Japan',
  Americans: 'East US',
};

export function stampHistoricalCapitals(gameState) {
  if (!gameState) return gameState;
  for (const [playerId, territory] of Object.entries(CLASSIC_CAPITALS)) {
    if (!gameState.playerState?.[playerId]) continue;
    if (!gameState.territoryState?.[territory]) continue;
    gameState.territoryState[territory].isCapital = true;
    gameState.playerState[playerId].hasPlacedCapital = true;
    gameState.playerState[playerId].capitalTerritory = territory;
  }
  return gameState;
}

export function seedClassicPlayerTechs(gameState) {
  if (!gameState?.players) return gameState;
  if (!gameState.playerTechs) gameState.playerTechs = {};
  for (const player of gameState.players) {
    if (!gameState.playerTechs[player.id]) {
      gameState.playerTechs[player.id] = { techTokens: 0, unlockedTechs: [] };
    }
  }
  return gameState;
}

export function prepareClassicSoloState(gameState) {
  stampHistoricalCapitals(gameState);
  seedClassicPlayerTechs(gameState);
  // Classic init jumps to PLAYING but leaves turnPhase at 'setup'.
  if (gameState?.phase === GAME_PHASES.PLAYING
    && (!gameState.turnPhase || gameState.turnPhase === SETUP_TURN_PHASE)) {
    gameState.turnPhase = TURN_PHASES.DEVELOP_TECH;
  }
  gameState._initFriendlyTerritoriesAtTurnStart?.();
  return gameState;
}
