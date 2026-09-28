// G40 tactical bomber pairing. A bomber attacks at 4 only when a fighter
// or tank in the same battle is still alive to pair with it, 1:1.
// Defence stays 3. The catalog id for a tank is `armour`.
// Pairing never rolls extra dice. With the option off, or with no
// tactical bombers in the stack, callers leave the hit value alone.

export const TACTICAL_BOMBER = 'tacticalBomber';
export const TACTICAL_PAIR_ATTACK = 4;
export const TACTICAL_PAIR_LABEL = 'Tac bomber 4 (paired)';

const PARTNERS = new Set(['fighter', 'armour']);

export function tacticalBombersEnabled(gameOptions) {
  return gameOptions?.tacticalBombers === true;
}

export function countPairing(units, { enabled = true } = {}) {
  let bombers = 0;
  let partners = 0;
  if (enabled) {
    for (const unit of units || []) {
      const qty = Math.max(0, Number(unit?.quantity) || 0);
      if (qty <= 0) continue;
      if (unit.type === TACTICAL_BOMBER) bombers += qty;
      else if (PARTNERS.has(unit.type)) partners += qty;
    }
  }
  return {
    bombers,
    partners,
    paired: Math.min(bombers, partners),
  };
}

// One die. Returns the attack to use and the pairs still unused.
export function consumePairedAttack(unitType, baseAttack, pairedLeft) {
  const left = Math.max(0, Number(pairedLeft) || 0);
  if (unitType === TACTICAL_BOMBER && left > 0) {
    return { attack: TACTICAL_PAIR_ATTACK, pairedLeft: left - 1 };
  }
  return { attack: baseAttack, pairedLeft: left };
}
