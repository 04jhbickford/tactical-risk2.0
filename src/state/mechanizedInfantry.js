// Mechanized infantry. Off until the host turns the option on, the same
// way tactical bombers stay out of a game. Attack is 1, or 2 when an
// artillery unit in the same attack is still free to support it, one for
// one. Infantry already in the battle take that support first. Defence
// stays 2. A mechanized infantry must stop when it enters an enemy
// territory unless a tank in the same move is paired with it, one for one.

export const MECHANIZED_INFANTRY = 'mechanizedInfantry';
export const MECHANIZED_SUPPORTED_ATTACK = 2;
export const MECHANIZED_SUPPORT_LABEL = 'Mech infantry 2 (supported)';

export function mechanizedInfantryEnabled(gameOptions) {
  return gameOptions?.mechanizedInfantry === true;
}

function rowsOf(units) {
  if (Array.isArray(units)) return units;
  return Object.entries(units || {}).map(([type, quantity]) => ({ type, quantity }));
}

function countType(units, type) {
  let total = 0;
  for (const unit of rowsOf(units)) {
    if (unit?.type !== type) continue;
    const qty = Math.max(0, Number(unit.quantity) || 0);
    total += qty;
  }
  return total;
}

// Human combat gives infantry the existing artillery bonus first.
// The AI roller does not change infantry, so it does not reserve guns
// that those infantry never use.
export function artillerySupportState(units, { applyInfantry = false } = {}) {
  const artillery = countType(units, 'artillery');
  const infantry = countType(units, 'infantry');
  const mech = countType(units, MECHANIZED_INFANTRY);
  const infantrySupported = applyInfantry ? Math.min(infantry, artillery) : 0;
  const mechSupported = Math.min(mech, Math.max(0, artillery - infantrySupported));
  return {
    applyInfantry,
    infantryLeft: infantrySupported,
    mechLeft: mechSupported,
    infantrySupported,
    mechSupported,
    artillery,
  };
}

export function consumeArtillerySupport(unitType, baseAttack, state) {
  if (!state) return baseAttack;
  if (unitType === 'infantry' && state.applyInfantry && state.infantryLeft > 0) {
    state.infantryLeft -= 1;
    return baseAttack + 1;
  }
  if (unitType === MECHANIZED_INFANTRY && state.mechLeft > 0) {
    state.mechLeft -= 1;
    return MECHANIZED_SUPPORTED_ATTACK;
  }
  return baseAttack;
}

// Tanks keep today's blitz. Mechanized infantry blitzes only with at
// least one tank per mechanized infantry in the same combat move.
// That paired move may end on the territory it started from.
export function landBlitzOptions(units, { isCombatMove = false } = {}) {
  const mech = countType(units, MECHANIZED_INFANTRY);
  const tanks = countType(units, 'armour');
  if (mech === 0) return { canBlitz: true, allowReturn: false };
  const paired = isCombatMove === true && tanks >= mech;
  if (paired) return { canBlitz: true, allowReturn: true };
  return { canBlitz: false, allowReturn: false };
}
