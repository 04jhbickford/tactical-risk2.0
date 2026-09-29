// End of Non-Combat Move: every aircraft of the active power must already
// be on a legal landing spot. Legal means land that power or an ally
// controlled at the start of the turn, or a friendly or allied carrier
// with room for that air type. Anything else is destroyed once.
//
// Combat → NCM still uses relocateAirFromCapturedLand and
// resolveLooseAirOverWater, which fly or crash aircraft before NCM
// starts. This check does not run on that transition, so those crashes
// are not destroyed a second time.

import { formatUnitName } from '../utils/unitNames.js';
import { isAirUnitType, wasFriendlyAtTurnStart } from './airLanding.js';
import { carrierCapacity, isLandingCarrier } from './carrierPlacement.js';

export function carrierAllowsAirType(unitDefs, type) {
  const list = unitDefs?.carrier?.canCarry;
  if (Array.isArray(list)) return list.includes(type);
  return type === 'fighter' || type === 'tacticalBomber';
}

function craftOwner(craft, carrier) {
  return craft?.owner || carrier?.owner || null;
}

function note(rows, territory, type, quantity, owner) {
  const qty = Math.max(0, Number(quantity) || 0);
  if (!territory || !type || qty <= 0) return;
  const existing = rows.find((row) => row.territory === territory && row.type === type && row.owner === owner);
  if (existing) existing.quantity += qty;
  else rows.push({ territory, type, quantity: qty, owner });
}

function dropEmptyStacks(units) {
  return (units || []).filter((unit) => (Number(unit?.quantity) || 0) > 0);
}

// Loose fighters and tactical bombers in a sea zone fill friendly carrier
// room in that zone. A bomber never does. Returns how many of each loose
// stack do not fit.
function looseAirOverage(gameState, stacks, playerId, unitDefs) {
  let room = 0;
  for (const unit of stacks || []) {
    if (unit?.type !== 'carrier' || !isLandingCarrier(gameState, unit, playerId)) continue;
    const hulls = unit.id ? 1 : Math.max(1, Number(unit.quantity) || 1);
    const cap = carrierCapacity(unitDefs) * hulls;
    let aboard = 0;
    for (const craft of unit.aircraft || []) {
      if (!carrierAllowsAirType(unitDefs, craft?.type)) continue;
      aboard += Math.max(0, Number(craft?.quantity) || 1);
    }
    room += Math.max(0, cap - aboard);
  }
  const over = [];
  for (const unit of stacks || []) {
    if (unit?.type === 'carrier') continue;
    if (unit?.owner !== playerId || !isAirUnitType(unit.type, unitDefs)) continue;
    const qty = Math.max(0, Number(unit.quantity) || 0);
    if (qty <= 0) continue;
    if (!carrierAllowsAirType(unitDefs, unit.type)) {
      over.push({ unit, drop: qty });
      continue;
    }
    const keep = Math.min(qty, room);
    room -= keep;
    if (qty > keep) over.push({ unit, drop: qty - keep });
  }
  return over;
}

// Read-only. `aboard` marks aircraft stored on a carrier.
export function listIllegalAir(gameState, unitDefs = {}, playerId) {
  const rows = [];
  if (!gameState || !playerId) return rows;
  const capacity = carrierCapacity(unitDefs);
  for (const [name, stacks] of Object.entries(gameState.units || {})) {
    const water = !!gameState.territoryByName?.[name]?.isWater;
    if (water) {
      for (const unit of stacks || []) {
        if (unit?.type === 'carrier') {
          const friendly = isLandingCarrier(gameState, unit, playerId);
          const room = friendly
            ? capacity * (unit.id ? 1 : Math.max(1, Number(unit.quantity) || 1))
            : 0;
          let used = 0;
          for (const craft of unit.aircraft || []) {
            const owner = craftOwner(craft, unit);
            const qty = Math.max(0, Number(craft?.quantity) || 1);
            if (!craft?.type || qty <= 0) continue;
            if (owner !== playerId) {
              if (carrierAllowsAirType(unitDefs, craft.type)) {
                used += Math.min(qty, Math.max(0, room - used));
              }
              continue;
            }
            const allowed = friendly && carrierAllowsAirType(unitDefs, craft.type);
            const keep = allowed ? Math.min(qty, Math.max(0, room - used)) : 0;
            used += keep;
            note(rows, name, craft.type, qty - keep, playerId);
          }
          continue;
        }
      }
      for (const row of looseAirOverage(gameState, stacks, playerId, unitDefs)) {
        note(rows, name, row.unit.type, row.drop, playerId);
      }
      continue;
    }
    if (wasFriendlyAtTurnStart(gameState, name, playerId)) continue;
    for (const unit of stacks || []) {
      if (unit?.owner !== playerId || !isAirUnitType(unit.type, unitDefs)) continue;
      note(rows, name, unit.type, unit.quantity, playerId);
    }
  }
  return rows;
}

export function destroyIllegalAir(gameState, unitDefs = {}, playerId) {
  const removed = [];
  if (!gameState || !playerId) return removed;
  const capacity = carrierCapacity(unitDefs);
  for (const [name, stacks] of Object.entries(gameState.units || {})) {
    const list = stacks || [];
    const water = !!gameState.territoryByName?.[name]?.isWater;
    if (water) {
      for (const unit of list) {
        if (unit?.type === 'carrier') {
          const friendly = isLandingCarrier(gameState, unit, playerId);
          const room = friendly
            ? capacity * (unit.id ? 1 : Math.max(1, Number(unit.quantity) || 1))
            : 0;
          let used = 0;
          const next = [];
          for (const craft of unit.aircraft || []) {
            const owner = craftOwner(craft, unit);
            const qty = Math.max(0, Number(craft?.quantity) || 1);
            if (!craft?.type || qty <= 0) continue;
            if (owner !== playerId) {
              if (carrierAllowsAirType(unitDefs, craft.type)) {
                used += Math.min(qty, Math.max(0, room - used));
              }
              next.push(craft);
              continue;
            }
            const allowed = friendly && carrierAllowsAirType(unitDefs, craft.type);
            const keep = allowed ? Math.min(qty, Math.max(0, room - used)) : 0;
            used += keep;
            const drop = qty - keep;
            if (keep > 0) next.push({ ...craft, quantity: keep });
            note(removed, name, craft.type, drop, playerId);
          }
          unit.aircraft = next;
          continue;
        }
      }
      for (const row of looseAirOverage(gameState, list, playerId, unitDefs)) {
        note(removed, name, row.unit.type, row.drop, playerId);
        row.unit.quantity = Math.max(0, (Number(row.unit.quantity) || 0) - row.drop);
      }
      gameState.units[name] = dropEmptyStacks(list);
      continue;
    }
    if (wasFriendlyAtTurnStart(gameState, name, playerId)) continue;
    for (const unit of list) {
      if (unit?.owner !== playerId || !isAirUnitType(unit.type, unitDefs)) continue;
      note(removed, name, unit.type, unit.quantity, playerId);
      unit.quantity = 0;
    }
    gameState.units[name] = dropEmptyStacks(list);
  }
  return removed;
}

export function ncmAirWarningCopy(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const count = list.reduce((sum, row) => sum + (Math.max(0, Number(row?.quantity) || 0)), 0);
  const lines = list
    .filter((row) => (Number(row?.quantity) || 0) > 0)
    .map((row) => `${row.quantity}x ${formatUnitName(row.type)} in ${row.territory}`);
  return {
    count,
    title: `${count} aircraft will be destroyed for lack of a landing site`,
    lines,
  };
}

export function shouldPromptNcmAirWarning({ isAI = false, count = 0 } = {}) {
  if (isAI) return false;
  return (Number(count) || 0) > 0;
}

// Same set destroyIllegalAir would remove, including pending named
// landings that nextPhase applies before the check. Does not keep the
// board changes.
export function previewNcmAirDestruction(gameState, unitDefs = {}) {
  const playerId = gameState?.currentPlayer?.id;
  if (!gameState || !playerId) return [];
  const savedUnits = gameState.units;
  const savedPending = gameState.pendingAirLandings;
  const savedOrigins = gameState.airUnitOrigins;
  const savedShips = gameState._shipIdCounter;
  const units = JSON.parse(JSON.stringify(savedUnits || {}));
  const pending = JSON.parse(JSON.stringify(savedPending || []));
  try {
    gameState.units = units;
    gameState.pendingAirLandings = pending;
    gameState.airUnitOrigins = JSON.parse(JSON.stringify(savedOrigins || {}));
    if (pending.length && typeof gameState.applyPendingAirLandings === 'function') {
      gameState.applyPendingAirLandings({ notify: false, unitDefs });
    }
    return listIllegalAir(gameState, unitDefs, playerId);
  } finally {
    gameState.units = savedUnits;
    gameState.pendingAirLandings = savedPending;
    gameState.airUnitOrigins = savedOrigins;
    gameState._shipIdCounter = savedShips;
  }
}
