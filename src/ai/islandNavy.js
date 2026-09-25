// Island-capital AI (9.22.26.10, redefined for unified.4).
// Bastion: an island capital is one where land units have no movement
// except loading a transport, when one is available. Land adjacency
// includes land bridges, so Japan (Manchuria), the United Kingdom
// (Eire, Finland Norway, West Europe), and Eire are not island capitals.
// The set is derived from the movement graph. No faction list.

import { LAND_BRIDGES } from '../state/gameState.js';

const ESCORT_TYPES = ['submarine', 'destroyer', 'cruiser', 'battleship', 'carrier'];

/** Land territories a land unit can step to, including land bridges. */
export function landMoveTargets(territoryByName, landName, landBridges = LAND_BRIDGES) {
  const land = territoryByName?.[landName];
  if (!land || land.isWater) return [];
  const names = new Set();
  for (const conn of land.connections || []) {
    const next = territoryByName?.[conn];
    if (next && !next.isWater) names.add(conn);
  }
  for (const pair of landBridges || []) {
    const other = pair[0] === landName ? pair[1] : pair[1] === landName ? pair[0] : null;
    if (!other || other === landName) continue;
    if (territoryByName?.[other]?.isWater) continue;
    names.add(other);
  }
  return [...names];
}

export function landmassNames(territoryByName, startName, landBridges = LAND_BRIDGES) {
  const start = territoryByName?.[startName];
  if (!start || start.isWater) return [];
  const seen = new Set([startName]);
  const queue = [startName];
  while (queue.length) {
    const name = queue.pop();
    for (const conn of landMoveTargets(territoryByName, name, landBridges)) {
      if (!territoryByName?.[conn] || seen.has(conn)) continue;
      seen.add(conn);
      queue.push(conn);
    }
  }
  return [...seen];
}

/**
 * True when a land unit on this capital has no legal land step.
 * The only remaining land-unit move is loading a transport in an
 * adjacent sea zone, and only when a transport is there.
 */
export function isIslandCapital(territoryByName, capitalName, landBridges = LAND_BRIDGES) {
  const land = territoryByName?.[capitalName];
  if (!land || land.isWater) return false;
  return landMoveTargets(territoryByName, capitalName, landBridges).length === 0;
}

export function adjacentSeas(territoryByName, landName) {
  const land = territoryByName?.[landName];
  if (!land || land.isWater) return [];
  return (land.connections || []).filter((name) => territoryByName?.[name]?.isWater);
}

export function countOwned(units, playerId, types) {
  const wanted = new Set(types);
  let total = 0;
  for (const stacks of Object.values(units || {})) {
    for (const unit of stacks || []) {
      if (!unit || unit.owner !== playerId || !wanted.has(unit.type)) continue;
      total += Number(unit.quantity) || 0;
    }
  }
  return total;
}

function unitCost(unitDefs, type) {
  const cost = Number(unitDefs?.[type]?.cost);
  return Number.isFinite(cost) && cost > 0 ? cost : Infinity;
}

/**
 * Buys for an island capital that is not under immediate threat.
 * Order: one transport, one cheapest escort, a second transport once an
 * escort exists, then infantry to fill the boats. Factory spend is decided
 * by the caller from the IPCs this plan leaves behind.
 */
export function planIslandNavyPurchases({
  ipcs = 0,
  unitDefs = {},
  transportCount = 0,
  escortCount = 0,
  threatened = false,
  reserve = 0,
} = {}) {
  const buys = [];
  let left = Math.max(0, Number(ipcs) || 0);
  if (threatened) {
    return { buys, remaining: left };
  }

  const take = (unitType, placement) => {
    const cost = unitCost(unitDefs, unitType);
    if (cost > left) return false;
    buys.push({ unitType, count: 1, placement });
    left -= cost;
    return true;
  };

  let transports = transportCount;
  let escorts = escortCount;
  if (transports < 1) {
    if (take('transport', 'sea')) transports += 1;
  }
  const escortType = ESCORT_TYPES
    .slice()
    .sort((a, b) => unitCost(unitDefs, a) - unitCost(unitDefs, b))[0];
  if (escorts < 1 && escortType) {
    if (take(escortType, 'sea')) escorts += 1;
  }
  if (transports < 2 && escorts >= 1) {
    if (take('transport', 'sea')) transports += 1;
  }

  const infantryCost = unitCost(unitDefs, 'infantry');
  if (Number.isFinite(infantryCost)) {
    const hold = Math.max(0, Number(reserve) || 0);
    const infantryBudget = left >= hold ? left - hold : left;
    const room = Math.min(4, Math.floor(infantryBudget / infantryCost));
    if (room > 0) {
      buys.push({ unitType: 'infantry', count: room, placement: 'capital' });
      left -= room * infantryCost;
    }
  }
  return { buys, remaining: left };
}

/** Owned land on a different landmass, friendly since turn start, no factory. */
export function pickSecondaryFactorySite({
  territoryByName,
  capitalName,
  ownedLands = [],
  factoryAt = () => false,
  friendlyAtStart = null,
  landBridges = LAND_BRIDGES,
} = {}) {
  const home = new Set(landmassNames(territoryByName, capitalName, landBridges));
  const sites = [];
  for (const name of ownedLands) {
    if (home.has(name) || territoryByName?.[name]?.isWater) continue;
    if (factoryAt(name)) continue;
    if (friendlyAtStart && friendlyAtStart.size > 0 && !friendlyAtStart.has(name)) continue;
    sites.push({ name, size: landmassNames(territoryByName, name, landBridges).length });
  }
  sites.sort((a, b) => b.size - a.size || a.name.localeCompare(b.name));
  return sites[0]?.name || null;
}

export function pickIslandAssault({
  territoryByName,
  units,
  playerId,
  enemyLand,
  emptyLand = () => false,
} = {}) {
  const candidates = [];
  for (const [sea, stacks] of Object.entries(units || {})) {
    if (!territoryByName?.[sea]?.isWater) continue;
    const mine = (stacks || []).filter((unit) => unit?.type === 'transport' && unit.owner === playerId);
    const loadedIndex = mine.findIndex((unit) => (unit.cargo || []).length > 0 && !unit.moved);
    if (loadedIndex < 0) continue;
    for (const coast of territoryByName[sea].connections || []) {
      if (territoryByName[coast]?.isWater || !enemyLand?.(coast)) continue;
      candidates.push({
        sea,
        coast,
        transportIndex: loadedIndex,
        empty: !!emptyLand(coast),
      });
    }
  }
  candidates.sort((a, b) => Number(b.empty) - Number(a.empty) || a.coast.localeCompare(b.coast));
  return candidates[0] || null;
}

export function pickTransportLoad({
  territoryByName,
  capitalName,
  infantryAtCapital = 0,
  units,
  playerId,
} = {}) {
  if ((Number(infantryAtCapital) || 0) < 1) return null;
  for (const sea of adjacentSeas(territoryByName, capitalName)) {
    const empty = (units?.[sea] || []).find((unit) => (
      unit?.type === 'transport'
      && unit.owner === playerId
      && !unit.moved
      && !(unit.cargo || []).length
    ));
    if (!empty) continue;
    return {
      from: capitalName,
      sea,
      unitType: 'infantry',
      quantity: Math.min(2, infantryAtCapital),
    };
  }
  return null;
}

/** One hop toward a sea that touches enemy land, staying out of hostile water. */
export function pickTransportSail({
  territoryByName,
  units,
  playerId,
  enemyLand,
  seaHostile = () => false,
} = {}) {
  for (const [sea, stacks] of Object.entries(units || {})) {
    if (!territoryByName?.[sea]?.isWater) continue;
    const loaded = (stacks || []).some((unit) => (
      unit?.type === 'transport'
      && unit.owner === playerId
      && !unit.moved
      && (unit.cargo || []).length > 0
    ));
    if (!loaded) continue;
    const coasts = (territoryByName[sea].connections || []).filter((name) => !territoryByName?.[name]?.isWater);
    if (coasts.some((name) => enemyLand?.(name))) continue;
    for (const next of territoryByName[sea].connections || []) {
      if (!territoryByName?.[next]?.isWater || seaHostile(next)) continue;
      const touches = (territoryByName[next].connections || []).some((name) => (
        !territoryByName?.[name]?.isWater && enemyLand?.(name)
      ));
      if (touches) return { from: sea, to: next };
    }
  }
  return null;
}
