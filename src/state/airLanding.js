// Post-combat air landing plan + board apply.
// Selections must live on GameState (not only the combat overlay) so a
// Confirm, a phase advance, or a multiplayer reload still lands the aircraft.

export function landingKeyFor(unit, index = 0) {
  if (!unit) return `unit_${index}`;
  return unit.id || `${unit.type}_${index}`;
}

export function resolveLandingDestination(unit, index = 0, selectedLandings = {}) {
  if (!unit || !selectedLandings) return unit?.destination || null;
  const keys = [
    unit.id,
    `${unit.type}_${index}`,
    unit.type,
    landingKeyFor(unit, index),
  ].filter(Boolean);
  for (const key of keys) {
    const dest = selectedLandings[key];
    if (dest) return dest;
  }
  return unit.destination || null;
}

// Overlay / pending dests can use id, type_index, or type. Merge so a
// 0-remaining counter and Confirm/Done share the same generous keys.
export function mergeLandingSelections(selectedLandings = {}, pendingUnits = []) {
  const merged = { ...(selectedLandings || {}) };
  for (const unit of pendingUnits || []) {
    if (!unit?.destination) continue;
    if (unit.id && !merged[unit.id]) merged[unit.id] = unit.destination;
    if (unit.type && !merged[unit.type]) merged[unit.type] = unit.destination;
    const typed = unit.id || landingKeyFor(unit, 0);
    if (typed && !merged[typed]) merged[typed] = unit.destination;
  }
  return merged;
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

export function addMovedAirToTerritory(unitsByTerr, {
  destination,
  type,
  owner,
  quantity,
  destIsWater = false,
  unitDefs = {},
} = {}) {
  if (!destination || !type || quantity <= 0) return 0;
  const destUnits = unitsByTerr[destination] || [];

  if (destIsWater) {
    const carriers = destUnits.filter((unit) => unit.type === 'carrier' && unit.owner === owner);
    const carrierDef = unitDefs.carrier || { aircraftCapacity: 2, canCarry: ['fighter'] };
    if (!carrierDef.canCarry || carrierDef.canCarry.includes(type)) {
      let remaining = quantity;
      for (const carrier of carriers) {
        if (remaining <= 0) break;
        carrier.aircraft = carrier.aircraft || [];
        const capacity = Math.max(0, (carrierDef.aircraftCapacity || 2) - carrier.aircraft.length);
        const toAdd = Math.min(remaining, capacity);
        for (let i = 0; i < toAdd; i++) {
          carrier.aircraft.push({ type, owner, moved: true });
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
} = {}) {
  const applied = [];
  if (!originTerritory || !owner || !Array.isArray(plan)) return applied;

  const originUnits = units[originTerritory] || [];
  units[originTerritory] = originUnits;

  for (const item of plan) {
    if (!item?.type || !item.destination || item.destination === originTerritory) {
      if (item?.destination === originTerritory) {
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
    addMovedAirToTerritory(units, {
      destination: item.destination,
      type: item.type,
      owner,
      quantity: taken,
      destIsWater: !!destT?.isWater,
      unitDefs,
    });
    applied.push({ ...item, quantity: taken });
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
