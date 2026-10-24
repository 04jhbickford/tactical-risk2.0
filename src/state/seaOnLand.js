// Naval units only exist in sea zones. Every write path rejects a sea unit
// on land. A save that already has one is repaired on load.

const FALLBACK_SEA = new Set([
  'transport',
  'submarine',
  'destroyer',
  'cruiser',
  'battleship',
  'carrier',
]);

export function isSeaUnitType(type, unitDefs = {}) {
  if (!type) return false;
  const def = unitDefs[type];
  if (def && def.isSea === true) return true;
  if (def && def.isSea === false) return false;
  return FALLBACK_SEA.has(type);
}

function living(unit) {
  return !!unit && (Number(unit.quantity) || 0) > 0;
}

export function seaZoneIsFriendly(gameState, seaName, ownerId) {
  const zone = gameState?.territoryByName?.[seaName];
  if (!zone?.isWater) return false;
  const units = gameState.units?.[seaName] || [];
  return !units.some((unit) => {
    if (!living(unit) || !unit.owner || unit.owner === ownerId) return false;
    if (typeof gameState.areAllies === 'function' && gameState.areAllies(ownerId, unit.owner)) {
      return false;
    }
    return true;
  });
}

export function adjacentFriendlySea(gameState, landName, ownerId) {
  const land = gameState?.territoryByName?.[landName];
  const connections = land?.connections || gameState?.getConnections?.(landName) || [];
  for (const name of connections) {
    if (seaZoneIsFriendly(gameState, name, ownerId)) return name;
  }
  return null;
}

function placeOnSea(gameState, seaName, unit) {
  const dest = gameState.units[seaName] || [];
  if (unit.id) {
    dest.push(unit);
  } else {
    const same = dest.find((row) => (
      row.type === unit.type && row.owner === unit.owner && !row.id
    ));
    if (same) same.quantity = (Number(same.quantity) || 0) + (Number(unit.quantity) || 0);
    else dest.push(unit);
  }
  gameState.units[seaName] = dest;
}

// Move each sea stack on land to an adjacent friendly sea zone.
// No legal sea zone: remove the stack. Returns the repair log.
export function repairSeaUnitsOnLand(gameState, unitDefs = {}) {
  const log = [];
  if (!gameState?.units || !gameState.territoryByName) return log;
  for (const name of Object.keys(gameState.units)) {
    const territory = gameState.territoryByName[name];
    if (!territory || territory.isWater) continue;
    const list = gameState.units[name] || [];
    const seaStacks = list.filter((unit) => living(unit) && isSeaUnitType(unit.type, unitDefs));
    if (seaStacks.length === 0) continue;
    for (const unit of seaStacks) {
      const idx = list.indexOf(unit);
      if (idx >= 0) list.splice(idx, 1);
      const quantity = Number(unit.quantity) || 0;
      const dest = adjacentFriendlySea(gameState, name, unit.owner);
      const row = {
        territory: name,
        type: unit.type,
        owner: unit.owner,
        quantity,
        action: dest ? 'moved' : 'removed',
        ...(dest ? { to: dest } : {}),
      };
      if (dest) placeOnSea(gameState, dest, unit);
      log.push(row);
      const where = dest ? `moved to ${dest}` : 'removed';
      console.warn(
        `Sea unit on land: ${quantity}x ${unit.type} (${unit.owner || 'unowned'}) at ${name} ${where}`,
      );
    }
    gameState.units[name] = list.filter((unit) => living(unit) || unit?.type === 'factory');
  }
  return log;
}
