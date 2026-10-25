// Drag-move route and the stroke used while a unit drag is held.
// The names are the path the movement search already stores
// (distance is path length minus one). The line is drawn only for a
// legal hover, and the dash buffers are reused so a frame does not
// allocate a new path.

import { combatAirReturnRange } from '../state/airLanding.js';
import { landBlitzOptions } from '../state/mechanizedInfantry.js';

export const DRAG_PATH_YELLOW = '#ffeb3b';
export const DRAG_PATH_OUTLINE = '#000000';

const DASH = [10, 7];

function qtyOf(value) {
  const n = Number(value) || 0;
  return n > 0 ? n : 0;
}

function airType(key) {
  const parts = String(key || '').split(':');
  return parts.slice(2).join(':') || 'fighter';
}

export function classifyDragSelection(selection, unitDefs = {}) {
  const land = [];
  const air = [];
  const sea = [];
  const shipIds = [];
  const cargo = [];
  for (const [key, raw] of Object.entries(selection || {})) {
    const quantity = qtyOf(raw);
    if (!quantity) continue;
    if (key.startsWith('ship:')) {
      shipIds.push(key.slice(5));
      continue;
    }
    if (key.startsWith('cargo:')) {
      cargo.push(key);
      continue;
    }
    const type = key.startsWith('aircraft:') ? airType(key) : key;
    const def = unitDefs?.[type];
    if (!def) continue;
    const row = { type, quantity, def };
    if (def.isAir || key.startsWith('aircraft:')) air.push(row);
    else if (def.isLand) land.push(row);
    else if (def.isSea) sea.push(row);
  }
  return { land, air, sea, shipIds, cargo };
}

function pathOf(info, kind) {
  if (!info?.path || info.path.length < 2) return null;
  return {
    names: info.path.slice(),
    distance: info.distance,
    kind,
  };
}

function landRoute(gameState, from, to, playerId, isCombatMove, land) {
  const minMovement = Math.min(...land.map((unit) => unit.def.movement || 1));
  const blitz = landBlitzOptions(land, { isCombatMove });
  const reachable = gameState.getReachableTerritoriesForLand(
    from, minMovement, playerId, isCombatMove, blitz,
  );
  const direct = pathOf(reachable.get(to), 'land');
  if (direct) return direct;

  const dest = gameState.territoryByName?.[to];
  if (!dest?.isWater) return null;
  const zone = gameState.getUnitsAt?.(to) || gameState.units?.[to] || [];
  const hasTransport = zone.some((unit) => (
    unit?.type === 'transport' && unit.owner === playerId && (Number(unit.quantity) || 0) > 0
  ));
  if (!hasTransport) return null;

  const coasts = [];
  if ((gameState.territoryByName?.[from]?.connections || []).includes(to)) coasts.push(from);
  if (minMovement > 1) {
    const mid = gameState.getReachableTerritoriesForLand(
      from, minMovement - 1, playerId, false, blitz,
    );
    for (const name of mid.keys()) {
      const terr = gameState.territoryByName?.[name];
      if (terr && !terr.isWater && (terr.connections || []).includes(to) && !coasts.includes(name)) {
        coasts.push(name);
      }
    }
  }
  for (const coast of coasts) {
    if (coast === from) return { names: [from, to], distance: 1, kind: 'load' };
    const via = gameState.getReachableTerritoriesForLand(
      from, minMovement - 1, playerId, false, blitz,
    ).get(coast);
    if (!via?.path) continue;
    return {
      names: via.path.concat(to),
      distance: (via.distance || via.path.length - 1) + 1,
      kind: 'load',
    };
  }
  return null;
}

function seaRange(gameState, from, shipIds, sea, unitDefs) {
  const moves = sea.map((unit) => unit.def.movement || 2);
  if (shipIds.length) {
    const here = gameState.getUnitsAt?.(from) || gameState.units?.[from] || [];
    for (const id of shipIds) {
      const ship = here.find((unit) => unit?.id === id);
      const def = unitDefs?.[ship?.type];
      moves.push(def?.movement || 2);
    }
  }
  if (!moves.length) return 0;
  return Math.min(...moves);
}

function seaRoute(gameState, from, to, playerId, isCombatMove, range) {
  if (!(range > 0)) return null;
  const reachable = gameState.getReachableTerritoriesForSea(
    from, range, playerId, isCombatMove,
  );
  return pathOf(reachable.get(to), 'sea');
}

function airRoute(gameState, from, to, playerId, isCombatMove, air) {
  const hasLongRange = !!gameState.hasTech?.(playerId, 'longRangeAircraft');
  const minMovement = Math.min(...air.map((unit) => {
    const base = unit.def.movement || 4;
    const total = hasLongRange ? base + 2 : base;
    const returned = combatAirReturnRange(gameState, from, unit.type, total);
    return returned == null ? total : returned;
  }));
  const reachable = gameState.getReachableTerritoriesForAir(
    from, minMovement, playerId, isCombatMove,
  );
  return pathOf(reachable.get(to), 'air');
}

function amphibiousRoute(gameState, from, to) {
  const origin = gameState.territoryByName?.[from];
  const dest = gameState.territoryByName?.[to];
  if (!origin?.isWater || !dest || dest.isWater) return null;
  if (!(origin.connections || []).includes(to)) return null;
  return { names: [from, to], distance: 1, kind: 'amphibious' };
}

// Same route the drag destination list costs. Null when that hover is
// not a move the selection can make.
export function dragMovementRoute(gameState, {
  from,
  to,
  playerId,
  isCombatMove = false,
  selection = {},
  unitDefs = {},
} = {}) {
  if (!gameState || !from || !to || from === to || !playerId) return null;
  const groups = classifyDragSelection(selection, unitDefs);
  const any = groups.land.length || groups.air.length || groups.sea.length
    || groups.shipIds.length || groups.cargo.length;
  if (!any) {
    const origin = gameState.territoryByName?.[from];
    if ((origin?.connections || []).includes(to)) {
      return { names: [from, to], distance: 1, kind: 'adjacent' };
    }
    return null;
  }
  if (groups.land.length) {
    const route = landRoute(gameState, from, to, playerId, isCombatMove, groups.land);
    if (route) return route;
  }
  if (groups.sea.length || groups.shipIds.length) {
    const range = seaRange(gameState, from, groups.shipIds, groups.sea, unitDefs);
    const route = seaRoute(gameState, from, to, playerId, isCombatMove, range);
    if (route) return route;
  }
  if (groups.air.length) {
    const route = airRoute(gameState, from, to, playerId, isCombatMove, groups.air);
    if (route) return route;
  }
  if (groups.cargo.length || groups.shipIds.length) {
    const ships = gameState.getUnitsAt?.(from) || gameState.units?.[from] || [];
    const loaded = groups.shipIds.some((id) => {
      const ship = ships.find((unit) => unit?.id === id);
      return ship && Array.isArray(ship.cargo) && ship.cargo.length > 0;
    });
    if (groups.cargo.length || loaded) {
      const route = amphibiousRoute(gameState, from, to);
      if (route) return route;
    }
  }
  return null;
}

// Black dash underneath, yellow dash on top, same pattern. The black
// stroke is wider, so it reads as an outline. No shadow.
export function strokeDragPath(ctx, xy, count, zoom) {
  if (!ctx || !xy || count < 4) return false;
  const z = Math.max(0.08, Number(zoom) || 1);
  DASH[0] = 10 / z;
  DASH[1] = 7 / z;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'butt';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.setLineDash(DASH);
  ctx.beginPath();
  ctx.moveTo(xy[0], xy[1]);
  for (let i = 2; i < count; i += 2) ctx.lineTo(xy[i], xy[i + 1]);
  ctx.strokeStyle = DRAG_PATH_OUTLINE;
  ctx.lineWidth = 5 / z;
  ctx.stroke();
  ctx.strokeStyle = DRAG_PATH_YELLOW;
  ctx.lineWidth = 2.5 / z;
  ctx.stroke();
  ctx.restore();
  return true;
}
