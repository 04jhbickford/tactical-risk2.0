// Optional garrison. Off until the host turns it on. Schema stays 11:
// the flag is one more boolean on the existing gameOptions object, and the
// unit is one more stack in the territory unit list.

export const GARRISON = 'garrison';

export function garrisonsEnabled(gameOptions) {
  return gameOptions?.garrisons === true;
}

export function livingGarrisonCount(units) {
  return (units || []).reduce((sum, unit) => {
    if (unit?.type !== GARRISON) return sum;
    return sum + Math.max(0, Number(unit.quantity) || 0);
  }, 0);
}

/**
 * One free garrison on this player's original capital, and only there.
 * Skipped when the option is off, the capital is not theirs, or a garrison
 * is already on that territory.
 */
export function respawnOriginalGarrison(gameState, playerId) {
  if (!garrisonsEnabled(gameState?.gameOptions)) return false;
  if (!playerId) return false;
  const capital = gameState.playerState?.[playerId]?.capitalTerritory;
  if (!capital) return false;
  if (gameState.getOwner?.(capital) !== playerId) return false;
  const units = gameState.units?.[capital] || [];
  if (livingGarrisonCount(units) > 0) return false;
  const next = units.filter((unit) => unit?.type !== GARRISON);
  next.push({ type: GARRISON, quantity: 1, owner: playerId });
  gameState.units[capital] = next;
  return true;
}

/**
 * A garrison hit is legal only when every other casualty on that side is
 * already selected. Factories are captured. Transports follow their own
 * escort rule and are not a second lock.
 */
export function garrisonHitAllowed(units, selected = {}) {
  const picked = selected || {};
  const byType = new Map();
  for (const unit of units || []) {
    if (!unit || unit.type === GARRISON || unit.type === 'factory' || unit.type === 'transport') continue;
    const qty = Math.max(0, Number(unit.quantity) || 0);
    if (qty <= 0) continue;
    byType.set(unit.type, (byType.get(unit.type) || 0) + qty);
  }
  for (const [type, qty] of byType) {
    if ((Number(picked[type]) || 0) < qty) return false;
  }
  return true;
}

/** Drop a garrison pick that would die before the other units. */
export function clampGarrisonSelection(units, selected) {
  if (!selected || !(Number(selected[GARRISON]) > 0)) return selected;
  if (!garrisonHitAllowed(units, selected)) {
    const next = { ...selected };
    delete next[GARRISON];
    return next;
  }
  const qty = livingGarrisonCount(units);
  if (selected[GARRISON] > qty) return { ...selected, [GARRISON]: qty };
  return selected;
}
