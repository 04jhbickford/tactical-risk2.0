// Shared combat finalize / soft-lock escape.
// Classic combatUI and Experimental threeSoloPlay both dequeue a resolved
// queue head. Skipping without capture left land leftovers on an enemy hex
// (35RB85 Mexico→West US: dequeue_resolved_combat_heads, owner never flipped).

import {
  getEnemyCombatUnits,
  getFriendlyCombatUnits,
  territoryCombatAlreadyResolved,
} from './combatUnits.js';

function unitsAt(gameState, name) {
  return gameState?.getUnitsAt?.(name) || gameState?.units?.[name] || [];
}

function isLandCombatUnit(unit, unitDefs = {}) {
  if (!unit || unit.type === 'factory' || unit.type === 'aaGun') return false;
  const def = unitDefs[unit.type];
  return !!(def?.isLand && (Number(unit.quantity) || 0) > 0);
}

export function attackerHoldsWithLand(units, playerId, {
  areAllies = () => false,
  unitDefs = {},
  isWater = false,
} = {}) {
  if (isWater) return false;
  const enemies = getEnemyCombatUnits(units, playerId, areAllies);
  const friends = getFriendlyCombatUnits(units, playerId);
  if (enemies.length > 0 || friends.length === 0) return false;
  return friends.some((u) => isLandCombatUnit(u, unitDefs));
}

export function applyTerritoryCapture(gameState, territoryName, {
  playerId,
  previousOwner = null,
  unitDefs = {},
} = {}) {
  if (!gameState || !territoryName || !playerId) {
    return { captured: false, reason: 'missing_args' };
  }
  const t = gameState.territoryByName?.[territoryName];
  if (t?.isWater) return { captured: false, reason: 'water' };

  const state = gameState.territoryState?.[territoryName];
  if (!state) return { captured: false, reason: 'no_territory' };

  const prev = previousOwner ?? gameState.getOwner?.(territoryName) ?? state.owner;
  if (prev === playerId) return { captured: false, reason: 'already_owned' };

  state.owner = playerId;

  const stacks = unitsAt(gameState, territoryName);
  for (const unit of stacks) {
    if (unit.type === 'factory' || unit.type === 'aaGun') {
      unit.owner = playerId;
      if (!unit.quantity || unit.quantity < 1) unit.quantity = 1;
    }
  }

  if (!gameState.capturedThisTurn) gameState.capturedThisTurn = new Set();
  if (gameState.capturedThisTurn instanceof Set) {
    gameState.capturedThisTurn.add(territoryName);
  }

  if (!gameState.conqueredThisTurn) gameState.conqueredThisTurn = {};
  let cardAwarded = null;
  if (!gameState.conqueredThisTurn[playerId]) {
    gameState.conqueredThisTurn[playerId] = true;
    cardAwarded = gameState.awardRiskCard?.(playerId) || null;
  }

  gameState.handleCapitalCapture?.(territoryName, playerId, prev);
  gameState.logTerritoryCapture?.(territoryName, prev, playerId);

  void unitDefs;
  return { captured: true, previousOwner: prev, territory: territoryName, cardAwarded };
}

// If the queue head is already a win on the board (no enemies, land leftovers)
// flip political control. Attacker wipe / air-only leave the original owner.
export function captureIfAttackerHolds(gameState, territoryName, {
  playerId,
  unitDefs = {},
} = {}) {
  if (!gameState || !territoryName) return { captured: false, reason: 'missing_args' };
  const id = playerId || gameState.currentPlayer?.id;
  const areAllies = (a, b) => !!gameState.areAllies?.(a, b);
  const units = unitsAt(gameState, territoryName);
  const t = gameState.territoryByName?.[territoryName];
  if (!attackerHoldsWithLand(units, id, {
    areAllies,
    unitDefs,
    isWater: !!t?.isWater,
  })) {
    return { captured: false, reason: 'no_land_hold' };
  }
  return applyTerritoryCapture(gameState, territoryName, {
    playerId: id,
    unitDefs,
  });
}

export function dequeueResolvedCombatHeads(gameState, {
  unitDefs = {},
  logSoftLock,
} = {}) {
  const skipped = [];
  const captured = [];
  if (!gameState) return { skipped, captured };

  const playerId = gameState.currentPlayer?.id;
  const areAllies = (a, b) => !!gameState.areAllies?.(a, b);

  while (gameState.combatQueue?.length > 0) {
    const name = gameState.combatQueue[0];
    const units = unitsAt(gameState, name);
    if (!territoryCombatAlreadyResolved(units, playerId, areAllies)) break;
    const result = captureIfAttackerHolds(gameState, name, { playerId, unitDefs });
    gameState.combatQueue.shift();
    skipped.push(name);
    if (result.captured) captured.push(name);
  }

  if (skipped.length > 0) {
    gameState._notify?.();
    try {
      logSoftLock?.({
        reason: 'dequeue_resolved_combat_heads',
        payload: { skipped, captured },
      });
    } catch { /* fail-closed */ }
  }
  return { skipped, captured };
}
