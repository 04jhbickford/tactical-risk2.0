import { individualizeCarrier, seaZoneCarrierCapacity } from './carrierPlacement.js';

// Post-combat air landing plan + board apply.
// Selections must live on GameState (not only the combat overlay) so a
// Confirm, a phase advance, or a multiplayer reload still lands the aircraft.

export function landingKeyFor(unit, index = 0) {
  if (!unit) return `unit_${index}`;
  return unit.id || `${unit.type}_${index}`;
}

export function resolveLandingDestination(unit, index = 0, selectedLandings = {}) {
  if (!unit || !selectedLandings) return unit?.destination || null;
  // Unique keys first. Never let a type-wide key steal a second fighter
  // (9.20.26.05 — one landing must not force every same-type aircraft).
  const uniqueKeys = [
    unit.id,
    `${unit.type}_${index}`,
    landingKeyFor(unit, index),
  ].filter(Boolean);
  for (const key of uniqueKeys) {
    const dest = selectedLandings[key];
    if (dest) return dest;
  }
  if (!unit.id && selectedLandings[unit.type]) return selectedLandings[unit.type];
  return unit.destination || null;
}

// Overlay / pending dests merge by unique id / type_index only.
// Type-wide keys are not written — they assigned every fighter together.
export function mergeLandingSelections(selectedLandings = {}, pendingUnits = []) {
  const merged = { ...(selectedLandings || {}) };
  for (const unit of pendingUnits || []) {
    if (!unit?.destination) continue;
    if (unit.id && !merged[unit.id]) merged[unit.id] = unit.destination;
    const typed = unit.id || landingKeyFor(unit, 0);
    if (typed && !merged[typed]) merged[typed] = unit.destination;
  }
  return merged;
}

export function clearPendingLandingDestinations(pending = [], originTerritory = null) {
  const list = Array.isArray(pending) ? pending.map((entry) => ({
    originTerritory: entry.originTerritory,
    units: (entry.units || []).map((unit) => ({ ...unit })),
  })) : [];
  for (const entry of list) {
    if (originTerritory && entry.originTerritory !== originTerritory) continue;
    for (const unit of entry.units || []) {
      unit.destination = null;
      unit.applied = false;
    }
  }
  return list;
}

// Aircraft with no landing options crash — they do not block Done.
// A named dest on id / type_index / type / unit.destination counts.
export function remainingAirLandingsToAssign(airUnitsToLand = [], selectedLandings = {}) {
  let remaining = 0;
  for (let index = 0; index < (airUnitsToLand || []).length; index++) {
    const unit = airUnitsToLand[index];
    if (!unit) continue;
    if (Array.isArray(unit.landingOptions) && unit.landingOptions.length === 0) continue;
    if (resolveLandingDestination(unit, index, selectedLandings)) continue;
    remaining++;
  }
  return remaining;
}

export function buildLandingPlan(airUnitsToLand = [], selectedLandings = {}) {
  const plan = [];
  airUnitsToLand.forEach((unit, index) => {
    if (!unit?.type) return;
    const destination = resolveLandingDestination(unit, index, selectedLandings);
    if (!destination) return;
    plan.push({
      id: landingKeyFor(unit, index),
      type: unit.type,
      quantity: unit.quantity || 1,
      destination,
    });
  });
  return plan;
}

export function upsertPendingAirLanding(pending, {
  originTerritory,
  id,
  type,
  quantity = 1,
  destination = null,
  applied = false,
} = {}) {
  const list = Array.isArray(pending) ? pending.map((entry) => ({
    originTerritory: entry.originTerritory,
    units: [...(entry.units || [])],
  })) : [];
  if (!originTerritory || !type) return list;

  let group = list.find((entry) => entry.originTerritory === originTerritory);
  if (!group) {
    group = { originTerritory, units: [] };
    list.push(group);
  }

  const key = id || landingKeyFor({ type }, group.units.length);
  const existing = group.units.find((unit) => (unit.id || landingKeyFor(unit, 0)) === key);
  if (existing) {
    if (destination) existing.destination = destination;
    if (quantity) existing.quantity = quantity;
    if (applied) existing.applied = true;
  } else {
    group.units.push({
      id: key,
      type,
      quantity,
      destination,
      applied: !!applied,
    });
  }
  return list;
}

export function markPendingAirLandingsApplied(pending, originTerritory, appliedPlan = []) {
  const list = Array.isArray(pending) ? pending : [];
  const group = list.find((entry) => entry.originTerritory === originTerritory);
  if (!group) return list;
  const destById = new Map(appliedPlan.map((item) => [item.id, item.destination]));
  const destByType = new Map();
  for (const item of appliedPlan) {
    destByType.set(item.type, item.destination);
  }
  for (const unit of group.units) {
    const key = unit.id || landingKeyFor(unit, 0);
    if (destById.has(key) || destByType.has(unit.type)) {
      unit.applied = true;
      unit.destination = destById.get(key) || destByType.get(unit.type) || unit.destination;
    }
  }
  return list;
}

export function unappliedLandingPlan(pending = []) {
  const planByOrigin = [];
  for (const entry of pending) {
    const units = (entry.units || []).filter((unit) => unit.destination && !unit.applied);
    if (units.length > 0) {
      planByOrigin.push({
        originTerritory: entry.originTerritory,
        units,
      });
    }
  }
  return planByOrigin;
}

export function takeAirUnitsFromTerritory(territoryUnits, { type, owner, quantity }) {
  if (!Array.isArray(territoryUnits) || !type || quantity <= 0) return 0;
  let remaining = quantity;

  const takeFrom = (movedOnly) => {
    for (const unit of territoryUnits) {
      if (remaining <= 0) break;
      if (unit.type !== type || unit.owner !== owner) continue;
      if (movedOnly && !unit.moved) continue;
      if (!movedOnly && unit.moved) continue;
      const avail = unit.quantity || 1;
      const take = Math.min(avail, remaining);
      unit.quantity = avail - take;
      remaining -= take;
    }
  };

  takeFrom(true);
  takeFrom(false);

  for (let i = territoryUnits.length - 1; i >= 0; i--) {
    const unit = territoryUnits[i];
    if (unit.type === type && unit.owner === owner && (unit.quantity || 0) <= 0) {
      territoryUnits.splice(i, 1);
    }
  }

  return quantity - remaining;
}

function peelCarrierHull(destUnits, carrier) {
  if (!carrier || carrier.id || (carrier.quantity || 1) <= 1) return carrier;
  carrier.quantity -= 1;
  const hull = {
    type: 'carrier',
    quantity: 1,
    owner: carrier.owner,
    aircraft: [],
    cargo: [],
    moved: !!carrier.moved,
    movementUsed: carrier.movementUsed || 0,
  };
  destUnits.push(hull);
  if (carrier.quantity <= 0) {
    const idx = destUnits.indexOf(carrier);
    if (idx >= 0) destUnits.splice(idx, 1);
  }
  return hull;
}

export function addMovedAirToTerritory(unitsByTerr, {
  destination,
  type,
  owner,
  quantity,
  destIsWater = false,
  unitDefs = {},
  gameState = null,
} = {}) {
  if (!destination || !type || quantity <= 0) return 0;
  const destUnits = unitsByTerr[destination] || [];

  if (destIsWater) {
    const carrierDef = unitDefs.carrier || { aircraftCapacity: 2, canCarry: ['fighter'] };
    if (!carrierDef.canCarry || carrierDef.canCarry.includes(type)) {
      let remaining = quantity;
      const perHull = carrierDef.aircraftCapacity || 2;
      const carriers = destUnits.filter((unit) => unit.type === 'carrier' && unit.owner === owner);
      for (const carrier of carriers) {
        if (remaining <= 0) break;
        let hull = carrier;
        if (!hull.id && (hull.quantity || 1) > 1) hull = peelCarrierHull(destUnits, hull);
        individualizeCarrier(gameState, hull);
        hull.aircraft = hull.aircraft || [];
        const capacity = Math.max(0, perHull - hull.aircraft.length);
        const toAdd = Math.min(remaining, capacity);
        for (let i = 0; i < toAdd; i++) {
          hull.aircraft.push({ type, owner, moved: true });
        }
        remaining -= toAdd;
      }
      unitsByTerr[destination] = destUnits;
      return quantity - remaining;
    }
    return 0;
  }

  const existing = destUnits.find((unit) => unit.type === type && unit.owner === owner && unit.moved);
  if (existing) {
    existing.quantity = (existing.quantity || 1) + quantity;
  } else {
    destUnits.push({
      type,
      quantity,
      owner,
      moved: true,
    });
  }
  unitsByTerr[destination] = destUnits;
  return quantity;
}

export function applyAirLandingPlan({
  units = {},
  territoryByName = {},
  originTerritory,
  owner,
  plan = [],
  unitDefs = {},
  gameState = null,
} = {}) {
  const applied = [];
  if (!originTerritory || !owner || !Array.isArray(plan)) return applied;

  const originUnits = units[originTerritory] || [];
  units[originTerritory] = originUnits;

  for (const item of plan) {
    if (!item?.type || !item.destination) continue;
    if (item.destination === originTerritory) {
      const here = territoryByName[item.destination];
      if (here?.isWater) {
        const takenHere = takeAirUnitsFromTerritory(originUnits, {
          type: item.type,
          owner,
          quantity: item.quantity || 1,
        });
        const placedHere = addMovedAirToTerritory(units, {
          destination: item.destination,
          type: item.type,
          owner,
          quantity: takenHere,
          destIsWater: true,
          unitDefs,
          gameState,
        });
        if (placedHere > 0) {
          applied.push({ ...item, quantity: placedHere });
        } else if (takenHere > 0) {
          originUnits.push({ type: item.type, quantity: takenHere, owner, moved: true });
        } else {
          applied.push({ ...item, stayed: true });
        }
      } else {
        applied.push({ ...item, stayed: true });
      }
      continue;
    }
    const taken = takeAirUnitsFromTerritory(originUnits, {
      type: item.type,
      owner,
      quantity: item.quantity || 1,
    });
    if (taken <= 0) continue;

    const destT = territoryByName[item.destination];
    const placed = addMovedAirToTerritory(units, {
      destination: item.destination,
      type: item.type,
      owner,
      quantity: taken,
      destIsWater: !!destT?.isWater,
      unitDefs,
      gameState,
    });
    const unplaced = taken - placed;
    if (unplaced > 0) {
      // A sea landing with no carrier room must not delete the aircraft.
      const back = units[originTerritory] || [];
      const existing = back.find((unit) => unit.type === item.type && unit.owner === owner && unit.moved);
      if (existing) existing.quantity = (existing.quantity || 0) + unplaced;
      else back.push({ type: item.type, quantity: unplaced, owner, moved: true });
      units[originTerritory] = back;
    }
    if (placed > 0) applied.push({ ...item, quantity: placed });
  }

  return applied;
}

export function shouldOfferEndPhaseDuringMove({
  airLandingActive = false,
  airLandingsRemaining = null,
  movePendingDest = null,
  selectedMoveCount = 0,
  hideMoveConfirm = false,
} = {}) {
  // Hide End Phase only while landings are still unnamed. 0 remaining
  // (TripleA-class "0 / N UNITS REMAINING") must leave Done clickable.
  if (airLandingActive) {
    if (airLandingsRemaining == null || Number(airLandingsRemaining) > 0) {
      return false;
    }
  }
  const readyMoveConfirm = !!movePendingDest
    && Number(selectedMoveCount) > 0
    && !hideMoveConfirm;
  return !readyMoveConfirm;
}

// Combat queue must not grey Done when named landings are ready — clicking
// Done commits those landings and finalizes the current battle.
export function shouldDisableEndPhaseForCombat({
  hasCombatQueue = false,
  airLandingReady = false,
} = {}) {
  return !!hasCombatQueue && !airLandingReady;
}

export function selectedMoveCount(selected = {}) {
  return Object.values(selected || {}).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

const KNOWN_AIR = new Set(['fighter', 'bomber', 'tacticalBomber']);

export function isAirUnitType(type, unitDefs = {}) {
  if (!type) return false;
  if (unitDefs?.[type]?.isAir) return true;
  return KNOWN_AIR.has(type);
}

// Fighters and bombers sitting in a sea zone as their own stack are over
// open water. Aircraft stored on carrier.aircraft are already landed.
export function looseAirOverWater(units = {}, territoryByName = {}, owner, unitDefs = {}) {
  if (!owner) return [];
  const stranded = [];
  for (const [name, stacks] of Object.entries(units || {})) {
    if (!territoryByName?.[name]?.isWater) continue;
    for (const unit of stacks || []) {
      if (!unit || unit.owner !== owner) continue;
      if (!isAirUnitType(unit.type, unitDefs)) continue;
      const quantity = Number(unit.quantity) || 0;
      if (quantity <= 0) continue;
      stranded.push({ territory: name, type: unit.type, quantity });
    }
  }
  return stranded;
}

export function preferAirLandingOption(options = []) {
  const list = options || [];
  return list.find((opt) => opt?.territory && !opt.isCarrier)
    || list.find((opt) => opt?.territory)
    || null;
}

// Land that was friendly when the turn began. A territory taken this turn
// is not a legal air landing, even after the owner flag flips.
export function wasFriendlyAtTurnStart(gameState, name, playerId) {
  if (!gameState || !name || !playerId) return false;
  if (gameState.capturedThisTurn instanceof Set && gameState.capturedThisTurn.has(name)) {
    return false;
  }
  const friendly = gameState.friendlyTerritoriesAtTurnStart;
  if (friendly instanceof Set && friendly.size > 0) return friendly.has(name);
  const owner = gameState.getOwner?.(name);
  return owner === playerId || !!gameState.areAllies?.(playerId, owner);
}

function carrierRoom(gameState, seaName, playerId, unitType, unitDefs) {
  return seaZoneCarrierCapacity(gameState, seaName, playerId, unitDefs, unitType) > 0;
}

// After flying `remaining` movement from `origin`, can this aircraft end
// on start-of-turn friendly land or a friendly carrier?
export function hasLegalAirLandingFrom(gameState, origin, remaining, unitType, unitDefs, playerId) {
  if (!gameState || !origin || !unitType || !playerId) return false;
  const left = Number(remaining);
  if (!Number.isFinite(left) || left < 0) return false;
  const here = gameState.territoryByName?.[origin];
  if (here?.isWater && carrierRoom(gameState, origin, playerId, unitType, unitDefs)) return true;
  if (!here?.isWater && wasFriendlyAtTurnStart(gameState, origin, playerId)) return true;
  if (left <= 0 || typeof gameState.getReachableTerritoriesForAir !== 'function') return false;
  const reachable = gameState.getReachableTerritoriesForAir(origin, left, playerId, false);
  for (const [name, info] of reachable) {
    if ((info?.distance || 0) > left) continue;
    const dest = gameState.territoryByName?.[name];
    if (dest?.isWater) {
      if (carrierRoom(gameState, name, playerId, unitType, unitDefs)) return true;
    } else if (wasFriendlyAtTurnStart(gameState, name, playerId)) {
      return true;
    }
  }
  return false;
}

function looseCraftUnit(craft) {
  if (!craft?.type) return null;
  return {
    type: craft.type,
    quantity: Number(craft.quantity) || 1,
    owner: craft.owner ?? null,
    ...(craft.moved ? { moved: true } : {}),
  };
}

function pushLooseCraft(result, craft) {
  const loose = looseCraftUnit(craft);
  if (!loose) return;
  const existing = result.find((unit) => (
    unit.type === loose.type && unit.owner === loose.owner && !unit.id && !Array.isArray(unit.aircraft)
  ));
  if (existing) existing.quantity = (Number(existing.quantity) || 1) + loose.quantity;
  else result.push(loose);
}

// Combat finalize rebuilds a sea zone from the overlay copy and drops
// aircraft that landing just pushed onto the live carrier. Match by id
// first, then by owner and order, and never throw an unmatched aircraft away.
export function mergeLiveCarrierLoads(liveUnits = [], nextUnits = []) {
  const liveCarriers = (liveUnits || []).filter((unit) => unit?.type === 'carrier');
  const used = new Set();
  const result = (nextUnits || []).map((unit) => ({ ...unit }));

  const takeById = (unit) => {
    if (!unit?.id) return null;
    const idx = liveCarriers.findIndex((carrier, i) => !used.has(i) && carrier.id === unit.id);
    if (idx < 0) return null;
    used.add(idx);
    return liveCarriers[idx];
  };

  for (const unit of result) {
    if (unit?.type !== 'carrier') continue;
    const live = takeById(unit);
    if (!live || !Array.isArray(live.aircraft)) continue;
    unit.aircraft = live.aircraft.map((craft) => ({ ...craft }));
  }

  const unmatched = liveCarriers
    .map((carrier, index) => ({ carrier, index }))
    .filter(({ index, carrier }) => !used.has(index) && Array.isArray(carrier.aircraft) && carrier.aircraft.length > 0);

  for (const unit of result) {
    if (unit?.type !== 'carrier') continue;
    if (Array.isArray(unit.aircraft) && unit.aircraft.length > 0) continue;
    const idx = unmatched.findIndex(({ carrier }) => carrier.owner === unit.owner);
    if (idx < 0) continue;
    const [{ carrier, index }] = unmatched.splice(idx, 1);
    used.add(index);
    unit.aircraft = carrier.aircraft.map((craft) => ({ ...craft }));
    if (!unit.id && carrier.id) unit.id = carrier.id;
  }

  for (const { carrier } of unmatched) {
    for (const craft of carrier.aircraft || []) pushLooseCraft(result, craft);
  }
  return result;
}
