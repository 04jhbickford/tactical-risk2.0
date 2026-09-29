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

// Same totals as the combat list and the saved board. A damaged battleship
// keeps damagedCount so the report, the next round, and the map agree.
export function livingForcePicture(units) {
  const byType = new Map();
  for (const u of units || []) {
    const n = Math.max(0, Number(u?.quantity) || 0);
    if (n <= 0 || !u?.type) continue;
    let row = byType.get(u.type);
    if (!row) {
      row = { type: u.type, quantity: 0, damagedCount: 0 };
      byType.set(u.type, row);
    }
    row.quantity += n;
    if (u.type === 'battleship') {
      const marked = u.damaged ? n : 0;
      const counted = Math.min(n, Math.max(0, Number(u.damagedCount) || marked));
      row.damagedCount += counted;
    }
  }
  return [...byType.values()]
    .map((row) => {
      const out = { type: row.type, quantity: row.quantity };
      if (row.type === 'battleship' && row.damagedCount > 0) out.damagedCount = row.damagedCount;
      return out;
    })
    .sort((a, b) => a.type.localeCompare(b.type));
}

// Spend a type-keyed casualty pick across every stack of that type.
// One carrier id is one hull: a hit removes that hull (and its aircraft
// only when the hull's quantity reaches 0). A sibling hull is left alone.
// battleship_damage marks undamaged hulls and does not remove them.
// An explicit transport count is removed; the default picker still skips them.
export function applyCasualtySelection(units, selected = {}) {
  const list = Array.isArray(units) ? units : [];
  const applied = [];
  const sunk = [];

  let damageLeft = Math.max(0, Number(selected.battleship_damage) || 0);
  if (damageLeft > 0) {
    for (const unit of list) {
      if (damageLeft <= 0) break;
      if (unit?.type !== 'battleship') continue;
      const qty = Math.max(0, Number(unit.quantity) || 0);
      if (qty <= 0) continue;
      const already = Math.min(qty, Math.max(0, Number(unit.damagedCount) || 0));
      const room = qty - already;
      const take = Math.min(room, damageLeft);
      if (take <= 0) continue;
      unit.damagedCount = already + take;
      unit.damaged = unit.damagedCount > 0;
      damageLeft -= take;
    }
  }

  let sinkLeft = Math.max(0, Number(selected.battleship) || 0);
  if (sinkLeft > 0) {
    const ships = list.filter((u) => u?.type === 'battleship' && (Number(u.quantity) || 0) > 0);
    const order = [...ships].sort((a, b) => (Number(b.damagedCount) || 0) - (Number(a.damagedCount) || 0));
    for (const unit of order) {
      if (sinkLeft <= 0) break;
      const qty = Math.max(0, Number(unit.quantity) || 0);
      const dmg = Math.min(qty, Math.max(0, Number(unit.damagedCount) || 0));
      const fromDamaged = Math.min(dmg, sinkLeft);
      const fromFresh = Math.min(Math.max(0, qty - fromDamaged), sinkLeft - fromDamaged);
      const take = fromDamaged + fromFresh;
      if (take <= 0) continue;
      unit.quantity = qty - take;
      unit.damagedCount = Math.max(0, dmg - fromDamaged);
      unit.damaged = unit.quantity > 0 && unit.damagedCount > 0;
      sinkLeft -= take;
      applied.push({ unit, type: 'battleship', taken: take });
      if (unit.quantity <= 0) sunk.push(unit);
    }
  }

  for (const [type, raw] of Object.entries(selected || {})) {
    if (type === 'battleship' || type === 'battleship_damage' || type === 'factory') continue;
    let left = Math.max(0, Number(raw) || 0);
    if (left <= 0) continue;
    for (const unit of list) {
      if (left <= 0) break;
      if (unit?.type !== type) continue;
      const qty = Math.max(0, Number(unit.quantity) || 0);
      if (qty <= 0) continue;
      const take = Math.min(qty, left);
      unit.quantity = qty - take;
      left -= take;
      applied.push({ unit, type, taken: take });
      if (unit.quantity <= 0) sunk.push(unit);
    }
  }

  return { applied, sunk };
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

// A surprise strike is that side's only submarine roll for the round.
// The general step still rolls every other living unit. Subs roll there
// only when they did not strike (an enemy destroyer, or a later round).
export function unitsForGeneralCombat(units, subsAlreadyStruck) {
  if (!subsAlreadyStruck) return units || [];
  return (units || []).filter((u) => u?.type !== 'submarine');
}

// Aircraft can hit a submarine only while their own side still has a destroyer.
// Re-checked every round from living quantity, including after a surprise strike.
export function sideHasDestroyer(units) {
  return (units || []).some((u) => u?.type === 'destroyer' && (Number(u.quantity) || 0) > 0);
}

export function countAirHits(rolls, unitDefs = {}) {
  return (rolls || []).reduce((count, roll) => {
    if (!roll?.hit) return count;
    const type = roll.unit || roll.unitType;
    return count + (unitDefs?.[type]?.isAir ? 1 : 0);
  }, 0);
}

export const AIR_CANNOT_HIT_SUBS_HINT = "Aircraft can't hit subs without a destroyer";

export const NO_LEGAL_AIR_LANDING_NOTE = 'No legal landing. It stays for the end of non-combat movement.';

export function unitIsAir(unit, unitDefs = {}) {
  return !!(unit && unitDefs?.[unit.type]?.isAir);
}

function livingStacks(units) {
  return (units || []).filter((unit) => (
    unit && unit.type !== 'factory' && (Number(unit.quantity) || 0) > 0
  ));
}

// Every living unit other than an AA gun is an aircraft.
export function sideIsOnlyAir(units, unitDefs = {}) {
  const living = livingStacks(units).filter((unit) => unit.type !== 'aaGun');
  return living.length > 0 && living.every((unit) => unitIsAir(unit, unitDefs));
}

// Combat units ignore transports and other 0/0 pieces. AA guns are not a fleet.
export function sideCombatIsOnlySubs(units, unitDefs = {}) {
  const combat = livingStacks(units).filter((unit) => {
    if (unit.type === 'transport' || unit.type === 'aaGun') return false;
    const def = unitDefs?.[unit.type];
    if (def && def.attack === 0 && def.defense === 0) return false;
    return true;
  });
  return combat.length > 0 && combat.every((unit) => unit.type === 'submarine');
}

function sideHasNonSubTarget(units, unitDefs = {}) {
  return livingStacks(units).some((unit) => (
    unit.type !== 'submarine'
    && unit.type !== 'aaGun'
    && !unitIsAir(unit, unitDefs)
  ));
}

// Aircraft cannot hurt the subs, and the subs cannot hurt the aircraft.
// A transport is not a combat unit, but aircraft can hit it, so it is not this case.
export function airVersusSubStalemate(attackers, defenders, unitDefs = {}) {
  const attackAir = sideIsOnlyAir(attackers, unitDefs);
  const defenseAir = sideIsOnlyAir(defenders, unitDefs);
  const attackSubs = sideCombatIsOnlySubs(attackers, unitDefs);
  const defenseSubs = sideCombatIsOnlySubs(defenders, unitDefs);
  if (attackAir && defenseSubs && !sideHasNonSubTarget(defenders, unitDefs)) return true;
  if (defenseAir && attackSubs && !sideHasNonSubTarget(attackers, unitDefs)) return true;
  return false;
}

export function sideIsOnlyTransports(units) {
  const living = livingStacks(units).filter((unit) => unit.type !== 'aaGun');
  return living.length > 0 && living.every((unit) => unit.type === 'transport');
}

export function enemyCanHitTransports(units, unitDefs = {}, side = 'attack') {
  return (units || []).some((unit) => {
    if (!unit || (Number(unit.quantity) || 0) <= 0) return false;
    if (unit.type === 'transport' || unit.type === 'factory') return false;
    const def = unitDefs?.[unit.type];
    if (!def) return false;
    const value = side === 'defense' ? Number(def.defense) : Number(def.attack);
    return value > 0;
  });
}

// A submarine does not roll when it has no sea unit to hit.
export function unitsSubsMayRoll(units, enemies, unitDefs = {}) {
  const legal = (enemies || []).some((unit) => unitIsFirstStrikeTarget(unit, unitDefs));
  if (legal) return units || [];
  return (units || []).filter((unit) => unit?.type !== 'submarine');
}

export function countSubHits(rolls) {
  return (rolls || []).reduce((count, roll) => {
    if (!roll?.hit) return count;
    const type = roll.unit || roll.unitType;
    return count + (type === 'submarine' ? 1 : 0);
  }, 0);
}

// Fighters and tactical bombers may use a carrier. A bomber never lands at sea.
export function airMayUseLandingOption(unitType, option) {
  if (!option?.territory) return false;
  if (!option.isCarrier) return true;
  return unitType === 'fighter' || unitType === 'tacticalBomber';
}
