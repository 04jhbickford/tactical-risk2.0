// One brain, four knobs. The live turn is AIController. These ids are what
// a seat stores. Saved games already use easy, medium, and hard.

import { getMap } from '../map/mapRegistry.js';
import { PACIFIC_AXIS_VC_REQUIRED, PACIFIC_VICTORY_CITIES } from '../map/pacificVictory.js';

export const AI_LEVEL_ORDER = Object.freeze(['easy', 'medium', 'hard', 'hardest']);

export const DEFAULT_AI_DIFFICULTY = 'medium';

export const AI_LEVELS = Object.freeze([
  { id: 'easy', name: 'Easier', desc: 'Defends its capital. Attacks only when clearly ahead.' },
  { id: 'medium', name: 'Medium', desc: 'Takes an even fight. Mix of infantry and attack units.' },
  { id: 'hard', name: 'Harder', desc: 'Holds the capital, finishes a continent, denies one bonus.' },
  { id: 'hardest', name: 'Hardest', desc: 'Same plan. May take a bad trade only to win the game.' },
]);

const KNOBS = Object.freeze({
  easy: Object.freeze({
    attackRatio: 2.5,
    attackCap: 2,
    capitalThreatMultiplier: 1.5,
    spreadToFront: false,
    walkContinent: false,
    denyContinent: false,
    boatsNeedNoLandPath: false,
    losingTradeForWin: false,
    keepCapitalGarrison: true,
  }),
  medium: Object.freeze({
    attackRatio: 1,
    attackCap: 3,
    capitalThreatMultiplier: 1.5,
    spreadToFront: true,
    walkContinent: false,
    denyContinent: false,
    boatsNeedNoLandPath: false,
    losingTradeForWin: false,
    keepCapitalGarrison: false,
  }),
  hard: Object.freeze({
    attackRatio: 1.2,
    attackCap: 5,
    capitalThreatMultiplier: 1,
    spreadToFront: true,
    walkContinent: true,
    denyContinent: true,
    boatsNeedNoLandPath: true,
    losingTradeForWin: false,
    keepCapitalGarrison: false,
  }),
  hardest: Object.freeze({
    attackRatio: 1.2,
    attackCap: 5,
    capitalThreatMultiplier: 1,
    spreadToFront: true,
    walkContinent: true,
    denyContinent: true,
    boatsNeedNoLandPath: true,
    losingTradeForWin: true,
    keepCapitalGarrison: false,
  }),
});

// easy → Easier, medium → Medium, hard → Harder. Unknown AI values
// load as Medium. A human seat stays human.
export function normalizeAiDifficulty(raw) {
  const key = String(raw ?? '').trim().toLowerCase();
  if (key === 'human') return 'human';
  if (key === 'easy' || key === 'easier') return 'easy';
  if (key === 'medium') return 'medium';
  if (key === 'hard' || key === 'harder') return 'hard';
  if (key === 'hardest') return 'hardest';
  return DEFAULT_AI_DIFFICULTY;
}

export function aiLevelLabel(raw) {
  const id = normalizeAiDifficulty(raw);
  if (id === 'human') return '';
  return AI_LEVELS.find((row) => row.id === id)?.name || 'Medium';
}

export function difficultyKnobs(raw) {
  const id = normalizeAiDifficulty(raw);
  return KNOBS[id] || KNOBS.medium;
}

// Hardest is the only level that may attack below its ratio, and only
// when this capture wins the game. Every other level returns false.
export function allowsLosingTrade(raw, winsGame) {
  return difficultyKnobs(raw).losingTradeForWin === true && winsGame === true;
}

function ownerAfter(gameState, territoryName, playerId, name) {
  if (name === territoryName) return playerId;
  return gameState.getOwner?.(name) || null;
}

function allianceOf(gameState, playerId) {
  if (!playerId) return null;
  if (typeof gameState.getAlliance === 'function') {
    const named = gameState.getAlliance(playerId);
    if (named) return named;
  }
  return gameState.getPlayer?.(playerId)?.alliance || null;
}

function ffaCaptureWins(gameState, playerId, territoryName) {
  const owners = [];
  for (const [name, state] of Object.entries(gameState.territoryState || {})) {
    if (!state?.isCapital) continue;
    owners.push(ownerAfter(gameState, territoryName, playerId, name));
  }
  if (owners.length === 0) return false;
  const playerCount = Array.isArray(gameState.players) ? gameState.players.length : 0;
  const required = playerCount <= 3 ? owners.length : Math.floor(owners.length / 2) + 1;
  const mine = owners.filter((id) => id === playerId).length;
  return mine >= required;
}

// Same capitals and same counts as GameState._checkAllianceVictory,
// with this territory's owner flipped to the capturer.
function allianceCaptureWins(gameState, playerId, territoryName) {
  const alliance = allianceOf(gameState, playerId);
  if (alliance !== 'Axis' && alliance !== 'Allies') return false;
  const side = (name) => (
    name === territoryName ? alliance : allianceOf(gameState, gameState.getOwner?.(name))
  );
  const alliedCapitals = ['Russia', 'United Kingdom', 'East US'];
  const axisCapitals = ['Germany', 'Japan'];
  const alliedHeld = alliedCapitals.filter((name) => side(name) === 'Allies').length;
  const axisHeld = axisCapitals.filter((name) => side(name) === 'Axis').length;
  if (alliance === 'Axis') {
    const taken = alliedCapitals.filter((name) => side(name) === 'Axis').length;
    return axisHeld === 2 && taken >= 2;
  }
  const taken = axisCapitals.filter((name) => side(name) === 'Allies').length;
  return alliedHeld === 3 && taken === 2;
}

function teamCaptureWins(gameState, playerId, territoryName) {
  const teamId = gameState.getPlayer?.(playerId)?.teamId;
  if (!teamId) return false;
  let enemyCapitals = 0;
  let controlled = 0;
  for (const [name, state] of Object.entries(gameState.territoryState || {})) {
    if (!state?.isCapital) continue;
    const originalOwnerId = state.originalOwner || ownerAfter(gameState, territoryName, playerId, name);
    const originalTeam = gameState.getPlayer?.(originalOwnerId)?.teamId;
    if (!originalTeam || originalTeam === teamId) continue;
    enemyCapitals += 1;
    const currentOwner = ownerAfter(gameState, territoryName, playerId, name);
    if (gameState.getPlayer?.(currentOwner)?.teamId === teamId) controlled += 1;
  }
  return enemyCapitals > 0 && controlled === enemyCapitals;
}

// Axis win is 6 of the 8 cities, including Japan. Allies win by holding
// Japan. Both are checked at the end of a round; this predicts that check.
export function pacificCaptureClosesWin(gameState, playerId, city) {
  if (!PACIFIC_VICTORY_CITIES.includes(city)) return false;
  const player = gameState.getPlayer?.(playerId);
  if (!player) return false;
  const axis = player.alliance === 'Axis' || player.id === 'Japanese';
  const allies = player.alliance === 'Allies';
  if (!axis && !allies) return false;
  if (gameState.getOwner?.(city) === playerId) return false;

  let japanHolds = 0;
  let holdsJapan = false;
  let alliesHoldJapan = false;
  for (const name of PACIFIC_VICTORY_CITIES) {
    const ownerId = ownerAfter(gameState, city, playerId, name);
    const holder = ownerId ? gameState.getPlayer?.(ownerId) : null;
    const holderAxis = !!(holder && (holder.alliance === 'Axis' || holder.id === 'Japanese'));
    const holderAllies = !!(holder && holder.alliance === 'Allies');
    if (holderAxis) japanHolds += 1;
    if (name === 'Japan') {
      holdsJapan = holderAxis;
      alliesHoldJapan = holderAllies;
    }
  }
  if (allies && alliesHoldJapan) return true;
  return axis && japanHolds >= PACIFIC_AXIS_VC_REQUIRED && holdsJapan;
}

// True only when taking this territory meets the live win for the map.
// Classic is capitals. Pacific is its victory cities. Not an income total.
export function captureWinsGame(gameState, playerId, territoryName) {
  if (!gameState || !playerId || !territoryName) return false;
  const mode = getMap(gameState.mapId)?.victoryMode || 'classic';
  if (mode === 'pacificVC') return pacificCaptureClosesWin(gameState, playerId, territoryName);
  if (mode !== 'classic') return false;
  const state = gameState.territoryState?.[territoryName];
  if (!state?.isCapital) return false;
  const current = gameState.getOwner?.(territoryName);
  if (!current || current === playerId) return false;
  if (gameState.areAllies?.(playerId, current)) return false;
  if (gameState.gameMode === 'classic' || gameState.alliancesEnabled) {
    return allianceCaptureWins(gameState, playerId, territoryName);
  }
  if (gameState.teamsEnabled) return teamCaptureWins(gameState, playerId, territoryName);
  return ffaCaptureWins(gameState, playerId, territoryName);
}
