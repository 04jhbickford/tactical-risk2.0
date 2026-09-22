import { hasLegalAirLandingFrom, wasFriendlyAtTurnStart } from './airLanding.js';

// Shared combat-move eligibility. A&A: you may empty a territory during
// combat move. All unmoved eligible units can leave. Friendly transit is
// legal; the attack dest is an enemy hex.

export function airSelectionType(key) {
  if (typeof key !== 'string' || !key.startsWith('aircraft:')) return key;
  return key.split(':').slice(2).join(':') || 'fighter';
}

export function moveUnitKey(unit) {
  if (!unit) return null;
  if (unit.isCargo || unit.isCarrierAircraft) return unit.cargoKey || null;
  if (unit.isIndividual && unit.id) return `ship:${unit.id}`;
  return unit.type || null;
}

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

export function moveSelectionProfile(picked = {}, unitDefs = {}) {
  let land = false;
  let air = false;
  let sea = false;
  for (const [key, qty] of Object.entries(picked || {})) {
    if (!(Number(qty) > 0)) continue;
    if (key.startsWith('cargo:')) {
      land = true;
      continue;
    }
    if (key.startsWith('aircraft:')) {
      air = true;
      continue;
    }
    if (key.startsWith('ship:')) {
      sea = true;
      continue;
    }
    const def = unitDefs[key];
    if (def?.isLand) land = true;
    if (def?.isAir) air = true;
    if (def?.isSea) sea = true;
  }
  return {
    land,
    air,
    sea,
    landOnly: land && !air && !sea,
    airInclusive: air,
  };
}

function zoneHasEnemyUnits(gameState, name, playerId) {
  return (gameState.units?.[name] || []).some((unit) => (
    unit
    && unit.owner !== playerId
    && !gameState.areAllies?.(playerId, unit.owner)
    && (Number(unit.quantity) || 0) > 0
    && unit.type !== 'factory'
  ));
}

export function seaZoneHasEnemyForAirAttack(gameState, seaName, playerId) {
  const zone = gameState?.territoryByName?.[seaName];
  if (!zone?.isWater || !playerId) return false;
  return zoneHasEnemyUnits(gameState, seaName, playerId);
}

// Combat-move aircraft may end on start-of-turn friendly land, or on land
// that still has enemy units to fight. An empty enemy or neutral territory
// is not an attack and is not a landing — aircraft do not occupy it.
export function airCombatMoveMayOccupy(gameState, name, playerId) {
  const zone = gameState?.territoryByName?.[name];
  if (!zone || zone.isWater || !playerId) return false;
  if (wasFriendlyAtTurnStart(gameState, name, playerId)) return true;
  return zoneHasEnemyUnits(gameState, name, playerId);
}

function friendlyTransportCanLoad(gameState, seaName, playerId, landUnits) {
  const ships = (gameState.units?.[seaName] || []).filter((u) => (
    u && u.type === 'transport' && u.owner === playerId && (Number(u.quantity) || 0) > 0
  ));
  if (!ships.length || !landUnits.length) return false;
  return ships.some((ship) => landUnits.some((unit) => (
    typeof gameState._canLoadOnTransport === 'function'
      ? gameState._canLoadOnTransport(ship.cargo || [], unit.type)
      : (ship.cargo || []).length < 2
  )));
}

export function combatMoveReachableDests(gameState, fromName, picked = {}, unitDefs = {}) {
  if (!gameState || !fromName) return [];
  const dests = new Map();
  const playerId = gameState.currentPlayer?.id;
  if (!playerId) return [];

  const profile = moveSelectionProfile(picked, unitDefs);
  const selected = Object.entries(picked || {})
    .filter(([, n]) => Number(n) > 0)
    .map(([key, quantity]) => {
      const type = airSelectionType(key);
      return { type, quantity: Number(quantity), def: unitDefs[type], key };
    });

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
    // Loading onto a friendly transport is a move, not a sea-zone attack.
    // A sea zone that still has enemies stays off this list (9.21.26.01).
    const seas = typeof gameState.getConnections === 'function'
      ? gameState.getConnections(fromName)
      : [];
    for (const name of seas) {
      const zone = gameState.territoryByName?.[name];
      if (!zone?.isWater || dests.has(name)) continue;
      if (seaZoneHasEnemyForAirAttack(gameState, name, playerId)) continue;
      if (!friendlyTransportCanLoad(gameState, name, playerId, landUnits)) continue;
      dests.set(name, { name, distance: 1, via: 'transport', attack: false });
    }
  }

  if (airUnits.length && typeof gameState.getReachableTerritoriesForAir === 'function') {
    const hasLongRange = !!gameState.hasTech?.(playerId, 'longRangeAircraft');
    const minMovement = Math.min(...airUnits.map((u) => {
      const base = u.def.movement || 4;
      return hasLongRange ? base + 2 : base;
    }));
    const airType = airUnits[0].type;
    const reachable = gameState.getReachableTerritoriesForAir(fromName, minMovement, playerId, true);
    for (const [name, info] of reachable) {
      if (dests.has(name)) continue;
      const zone = gameState.territoryByName?.[name];
      // Combat-move air may attack a sea zone only when something enemy is there.
      // Empty ocean is not an attack dest (landing is a carrier or a later phase).
      if (zone?.isWater && !seaZoneHasEnemyForAirAttack(gameState, name, playerId)) continue;
      // Empty enemy / neutral land is not an attack and not an occupation.
      if (!zone?.isWater && !airCombatMoveMayOccupy(gameState, name, playerId)) continue;
      // Must still be able to land: start-of-turn friendly land, or a carrier,
      // within movement left after reaching this hex (9.21.26.11).
      const remaining = minMovement - (info.distance || 0);
      if (!hasLegalAirLandingFrom(gameState, name, remaining, airType, unitDefs, playerId)) continue;
      dests.set(name, { name, distance: info.distance, via: 'air', attack: true });
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

  // Land-only stacks never attack a sea zone. Amphibious assault unloads
  // onto a coastal land territory; a friendly transport load is not an attack.
  if (profile.landOnly) {
    for (const [name, info] of [...dests.entries()]) {
      if (gameState.territoryByName?.[name]?.isWater && info.via !== 'transport') {
        dests.delete(name);
      }
    }
  }

  return [...dests.values()];
}

export function landOnlySeaAttackIllegal(profile, destIsWater) {
  return !!(profile?.landOnly && destIsWater);
}
