// Territory draft (O8). Seat order is the same shuffled order a random
// deal uses. Picks walk that order in a snake until every land territory
// is taken. Optional on the save. An old client must not apply a draft.

import { GAME_VERSION, unifiedReleaseParts } from '../version.js';

export const DRAFT_PHASE = 'territory_draft';
export const DRAFT_MIN_CLIENT = 'V2.81.57-unified.15';

export { unifiedReleaseParts };

export function clientSupportsTerritoryDraft(clientVersion = GAME_VERSION) {
  const have = unifiedReleaseParts(clientVersion);
  const need = unifiedReleaseParts(DRAFT_MIN_CLIENT);
  if (!have || !need) return false;
  if (have[0] !== need[0]) return have[0] > need[0];
  return have[1] >= need[1];
}

/** Null when this client may open the doc. A refusal when the phase is
 *  a territory draft and the stamp is older than unified.15. */
export function draftOpenRefusal(data, clientVersion = GAME_VERSION) {
  if (!data || typeof data !== 'object') return null;
  const phase = data.phase || data.state?.phase || '';
  if (phase !== DRAFT_PHASE) return null;
  if (clientSupportsTerritoryDraft(clientVersion)) return null;
  return {
    ok: false,
    reason: 'draft-client-too-old',
    minClientVersion: data.minClientVersion || data.state?.minClientVersion || DRAFT_MIN_CLIENT,
  };
}

export function buildSnakeDraftOrder(playerIds, territoryCount) {
  const ids = (Array.isArray(playerIds) ? playerIds : []).filter(Boolean);
  const count = Math.max(0, Number(territoryCount) || 0);
  const order = [];
  if (!ids.length || count <= 0) return order;
  let forward = true;
  while (order.length < count) {
    const pass = forward ? ids : [...ids].reverse();
    for (const id of pass) {
      order.push(id);
      if (order.length >= count) break;
    }
    forward = !forward;
  }
  return order;
}

export function normalizeDraftState(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const order = Array.isArray(raw.order) ? raw.order.filter(Boolean) : [];
  const picks = Array.isArray(raw.picks)
    ? raw.picks
      .filter((row) => row && row.territory && row.playerId)
      .map((row) => ({ playerId: row.playerId, territory: row.territory }))
    : [];
  const pickIndex = Math.max(0, Number(raw.pickIndex) || 0);
  return { order, pickIndex, picks };
}

function continentScore(gameState, playerId, territoryName) {
  const continents = gameState?.continents || [];
  const owned = new Set(gameState.getPlayerTerritories?.(playerId) || []);
  for (const continent of continents) {
    const names = continent?.territories || [];
    if (!names.includes(territoryName)) continue;
    const have = names.filter((name) => owned.has(name)).length;
    let score = have * 25;
    if (names.length > 1 && have + 1 === names.length) score += 60;
    return score;
  }
  return 0;
}

export function scoreDraftTerritory(gameState, playerId, territoryName) {
  let score = continentScore(gameState, playerId, territoryName);
  const owned = new Set(gameState.getPlayerTerritories?.(playerId) || []);
  const connections = gameState.getConnections?.(territoryName) || [];
  for (const name of connections) {
    if (owned.has(name)) score += 100;
  }
  const production = Number(gameState.territoryByName?.[territoryName]?.production) || 0;
  return score + production;
}

/** Highest score. Ties break by name, then one RNG draw, so a fixed
 *  Math.random sequence always picks the same territory. */
export function chooseDraftTerritory(gameState, playerId, random = Math.random) {
  const open = (gameState?.landTerritories || [])
    .map((territory) => territory?.name)
    .filter((name) => name && !gameState.getOwner?.(name));
  if (!open.length) return null;
  let best = -Infinity;
  const tied = [];
  for (const name of open) {
    const score = scoreDraftTerritory(gameState, playerId, name);
    if (score > best) {
      best = score;
      tied.length = 0;
      tied.push(name);
    } else if (score === best) {
      tied.push(name);
    }
  }
  tied.sort();
  if (tied.length === 1) return tied[0];
  const roll = typeof random === 'function' ? Number(random()) : 0;
  const idx = Math.floor((Number.isFinite(roll) ? roll : 0) * tied.length);
  return tied[Math.min(tied.length - 1, Math.max(0, idx))];
}
