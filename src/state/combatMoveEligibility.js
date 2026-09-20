// Shared combat-move eligibility. A&A: you may empty a territory during
// combat move. All unmoved eligible units can leave. Friendly transit is
// legal; the attack dest is an enemy hex.

export function maxMoveSelection(movableUnits = []) {
  const selected = {};
  for (const unit of movableUnits || []) {
    const qty = Number(unit.quantity) || 0;
    if (qty <= 0) continue;
    let key;
    if (unit.isCargo) key = unit.cargoKey;
    else if (unit.isIndividual) key = `ship:${unit.id}`;
    else if (unit.isCarrierAircraft) key = unit.cargoKey;
    else key = unit.type;
    if (!key) continue;
    selected[key] = (selected[key] || 0) + qty;
  }
  return selected;
}

export function canEmptyTerritoryDuringCombatMove() {
  return true;
}

export function combatMoveReachableDests(gameState, fromName, picked = {}, unitDefs = {}) {
  if (!gameState || !fromName) return [];
  const dests = new Map();
  const playerId = gameState.currentPlayer?.id;
  if (!playerId) return [];

  const selected = Object.entries(picked || {})
    .filter(([, n]) => Number(n) > 0)
    .map(([type, quantity]) => ({ type, quantity: Number(quantity), def: unitDefs[type] }));

  const landUnits = selected.filter((u) => u.def?.isLand);
  const airUnits = selected.filter((u) => u.def?.isAir);
  const seaUnits = selected.filter((u) => u.def?.isSea);
  const fromT = gameState.territoryByName?.[fromName];

  if (landUnits.length && !fromT?.isWater && typeof gameState.getReachableTerritoriesForLand === 'function') {
    const minMovement = Math.min(...landUnits.map((u) => u.def.movement || 1));
    const reachable = gameState.getReachableTerritoriesForLand(fromName, minMovement, playerId, true);
    for (const [name, info] of reachable) {
      dests.set(name, { name, distance: info.distance, via: 'land' });
    }
  }

  if (airUnits.length && typeof gameState.getReachableTerritoriesForAir === 'function') {
    const minMovement = Math.min(...airUnits.map((u) => u.def.movement || 4));
    const reachable = gameState.getReachableTerritoriesForAir(fromName, minMovement, playerId, true);
    for (const [name, info] of reachable) {
      if (!dests.has(name)) dests.set(name, { name, distance: info.distance, via: 'air' });
    }
  }

  if (seaUnits.length && fromT?.isWater && typeof gameState.getReachableTerritoriesForSea === 'function') {
    const minMovement = Math.min(...seaUnits.map((u) => u.def.movement || 2));
    const reachable = gameState.getReachableTerritoriesForSea(fromName, minMovement, playerId, true);
    for (const [name, info] of reachable) {
      if (!dests.has(name)) dests.set(name, { name, distance: info.distance, via: 'sea' });
    }
  }

  dests.delete(fromName);
  return [...dests.values()];
}
