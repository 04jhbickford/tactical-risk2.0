// Shared combat-unit filters. Classic combatUI and Experimental threeSoloPlay
// must agree: factory is not a fight, AA-only is a fight, 0-qty is gone.

export function getEnemyCombatUnits(units, currentPlayerId, areAllies = () => false) {
  return (units || []).filter((u) => (
    !!u
    && (u.quantity || 0) > 0
    && u.owner !== currentPlayerId
    && !areAllies(currentPlayerId, u.owner)
    && u.type !== 'factory'
  ));
}

export function getFriendlyCombatUnits(units, currentPlayerId) {
  return (units || []).filter((u) => (
    !!u
    && (Number(u.quantity) || 0) > 0
    && u.owner === currentPlayerId
    && u.type !== 'factory'
  ));
}

export function countLivingUnits(units, { excludeTypes = [] } = {}) {
  const skip = new Set(excludeTypes);
  return (units || []).reduce((sum, u) => {
    if (!u || skip.has(u.type)) return sum;
    return sum + (Number(u.quantity) || 0);
  }, 0);
}

export function territoryHasEnemyCombatUnits(units, currentPlayerId, areAllies) {
  return getEnemyCombatUnits(units, currentPlayerId, areAllies).length > 0;
}

// Queue head is done when the attacker is already gone (AA wipe / last
// round synced) or no enemy combat units remain. Either way, do not paint
// a 0-attacker rematch that can only sit on Roll Dice.
export function territoryCombatAlreadyResolved(units, currentPlayerId, areAllies) {
  const enemies = getEnemyCombatUnits(units, currentPlayerId, areAllies);
  const friendlies = getFriendlyCombatUnits(units, currentPlayerId);
  return enemies.length === 0 || friendlies.length === 0;
}

export function summarizeCombatForce(units) {
  const byType = new Map();
  for (const u of units || []) {
    const n = Number(u?.quantity) || 0;
    if (n <= 0 || !u?.type) continue;
    byType.set(u.type, (byType.get(u.type) || 0) + n);
  }
  return [...byType.entries()].map(([type, quantity]) => ({ type, quantity }));
}

// Submarine first strike uses the same filter as casualty assignment:
// a sub cannot hit a sub or an aircraft. AA guns and ships can be hit.
export function unitIsFirstStrikeTarget(unit, unitDefs = {}) {
  if (!unit || (Number(unit.quantity) || 0) <= 0) return false;
  if (unit.type === 'submarine' || unit.type === 'factory') return false;
  if (unitDefs?.[unit.type]?.isAir) return false;
  return true;
}

export function sideCanFirstStrike(subs, enemyUnits, enemyHasDestroyer, unitDefs = {}) {
  const hasSubs = (subs || []).some((u) => u?.type === 'submarine' && (Number(u.quantity) || 0) > 0);
  if (!hasSubs || enemyHasDestroyer) return false;
  return (enemyUnits || []).some((u) => unitIsFirstStrikeTarget(u, unitDefs));
}
