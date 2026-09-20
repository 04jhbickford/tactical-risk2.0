// Shared carrier-load eligibility for setup deploy and mobilize.
// A&A: new fighters may sit on a friendly carrier in a sea zone
// adjacent to a factory (mobilize) or an owned coast (setup), up to
// aircraftCapacity. Used by Classic placement/mobilize chrome and
// Experimental deploy/mobilize dests.

export function carrierCapacity(unitDefs) {
  const cap = Number(unitDefs?.carrier?.aircraftCapacity);
  return Number.isFinite(cap) && cap > 0 ? cap : 2;
}

export function carrierCanCarry(unitDefs, unitType) {
  return !!unitDefs?.carrier?.canCarry?.includes(unitType);
}

export function unitsAt(gameState, name) {
  if (!gameState || !name) return [];
  if (typeof gameState.getUnitsAt === 'function') return gameState.getUnitsAt(name) || [];
  return gameState.units?.[name] || [];
}

export function isWaterTerritory(gameState, name) {
  const t = gameState?.territoryByName?.[name];
  return !!(t?.isWater || t?.isSea);
}

export function friendlyCarriersAt(gameState, seaZoneName, playerId) {
  return unitsAt(gameState, seaZoneName)
    .filter((u) => u.type === 'carrier' && u.owner === playerId);
}

export function carrierOpenSlots(carrier, unitDefs) {
  const aboard = Array.isArray(carrier?.aircraft) ? carrier.aircraft.length : 0;
  return Math.max(0, carrierCapacity(unitDefs) - aboard);
}

export function seaZoneCarrierCapacity(gameState, seaZoneName, playerId, unitDefs, unitType = 'fighter') {
  if (!carrierCanCarry(unitDefs, unitType)) return 0;
  let slots = 0;
  for (const carrier of friendlyCarriersAt(gameState, seaZoneName, playerId)) {
    slots += carrierOpenSlots(carrier, unitDefs);
  }
  return slots;
}

export function isFactoryAdjacentSeaZone(gameState, seaZoneName, playerId) {
  const zones = gameState?._getValidNavalPlacementZones?.(playerId);
  if (zones instanceof Set) return zones.has(seaZoneName);
  if (Array.isArray(zones)) return zones.includes(seaZoneName);
  return false;
}

export function canPlaceAirOnCarrierInSeaZone(gameState, seaZoneName, unitType, playerId, unitDefs, {
  requireFactoryAdjacent = false,
} = {}) {
  if (!gameState || !seaZoneName || !unitType || !playerId) return false;
  if (!unitDefs?.[unitType]?.isAir) return false;
  if (!isWaterTerritory(gameState, seaZoneName)) return false;
  if (requireFactoryAdjacent && !isFactoryAdjacentSeaZone(gameState, seaZoneName, playerId)) {
    return false;
  }
  return seaZoneCarrierCapacity(gameState, seaZoneName, playerId, unitDefs, unitType) > 0;
}

export function pendingAirCanLoadInSeaZone(gameState, seaZoneName, pending, playerId, unitDefs) {
  return (pending || []).some((p) => {
    if (!(Number(p.quantity) > 0)) return false;
    if (!unitDefs?.[p.type]?.isAir) return false;
    return canPlaceAirOnCarrierInSeaZone(
      gameState,
      seaZoneName,
      p.type,
      playerId,
      unitDefs,
      { requireFactoryAdjacent: true },
    );
  });
}

export function individualizeCarrier(gameState, carrier) {
  if (!carrier) return carrier;
  if (!carrier.id) {
    const next = (Number(gameState?._shipIdCounter) || 0) + 1;
    if (gameState) gameState._shipIdCounter = next;
    carrier.id = `carrier_${next}`;
    carrier.quantity = 1;
  }
  return carrier;
}

export function loadOneAirOntoCarrier(gameState, seaZoneName, unitType, playerId, unitDefs) {
  if (!carrierCanCarry(unitDefs, unitType)) {
    return { success: false, error: 'No carrier with capacity to hold this aircraft' };
  }
  for (const carrier of friendlyCarriersAt(gameState, seaZoneName, playerId)) {
    if (carrierOpenSlots(carrier, unitDefs) <= 0) continue;
    individualizeCarrier(gameState, carrier);
    carrier.aircraft = carrier.aircraft || [];
    carrier.aircraft.push({ type: unitType, owner: playerId });
    return { success: true, carrier };
  }
  return { success: false, error: 'No carrier with capacity to hold this aircraft' };
}

export function unloadOneAirFromCarrier(gameState, seaZoneName, unitType, playerId) {
  for (const carrier of friendlyCarriersAt(gameState, seaZoneName, playerId)) {
    const aircraft = carrier.aircraft || [];
    const idx = aircraft.findIndex((a) => a.type === unitType && a.owner === playerId);
    if (idx >= 0) {
      aircraft.splice(idx, 1);
      return true;
    }
  }
  return false;
}

export function seaFirstUnitEntries(selectedUnits, unitDefs) {
  return Object.entries(selectedUnits || {}).sort(([a], [b]) => {
    const seaA = !!unitDefs?.[a]?.isSea;
    const seaB = !!unitDefs?.[b]?.isSea;
    if (seaA === seaB) return 0;
    return seaA ? -1 : 1;
  });
}

export function seaFirstUnitTypes(unitTypes, unitDefs) {
  return [...(unitTypes || [])].sort((a, b) => {
    const seaA = !!unitDefs?.[a]?.isSea;
    const seaB = !!unitDefs?.[b]?.isSea;
    if (seaA === seaB) return 0;
    return seaA ? -1 : 1;
  });
}
