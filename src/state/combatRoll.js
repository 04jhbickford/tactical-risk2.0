// One combat-dice path for the combat screen and for auto-resolve.
// Tech bonuses match the played battle: jets, super submarines, and
// heavy bombers. Infantry artillery support stays on the played battle.
// Auto-resolve passes applyInfantry: false and still supports mechanized
// infantry, which is what that path already did.

import { GARRISON } from './garrison.js';
import { artillerySupportState, consumeArtillerySupport } from './mechanizedInfantry.js';
import { consumePairedAttack, countPairing, tacticalBombersEnabled } from './tacticalPairing.js';

export function rollCombatSide({
  units = [],
  supportUnits = null,
  type = 'attack',
  unitDefs = {},
  gameState = null,
  rollDie,
  applyInfantry = false,
  contextLabel = 'combat',
  side = 'attacker',
  seatOwner = null,
  gameOptions = null,
} = {}) {
  const attack = type === 'attack';
  const rolling = units || [];
  const supportFrom = supportUnits || rolling;
  const options = gameOptions || gameState?.gameOptions;
  const owner = seatOwner || rolling.find((unit) => unit?.owner)?.owner || null;
  const hasJets = !!(owner && gameState?.hasTech?.(owner, 'jets'));
  const hasSuperSubs = attack && !!(owner && gameState?.hasTech?.(owner, 'superSubs'));
  const hasHeavyBombers = attack && !!(owner && gameState?.hasTech?.(owner, 'heavyBombers'));
  let pairedLeft = attack
    ? countPairing(supportFrom, { enabled: tacticalBombersEnabled(options) }).paired
    : 0;
  const artillery = attack
    ? artillerySupportState(supportFrom, { applyInfantry: applyInfantry === true })
    : null;
  const rolls = [];
  let hits = 0;
  const roll = typeof rollDie === 'function' ? rollDie : () => 1;

  for (const unit of rolling) {
    const def = unitDefs?.[unit?.type];
    if (!def) continue;
    if ((Number(unit.quantity) || 0) <= 0) continue;
    if (attack && (unit.type === GARRISON || def.defendOnly)) continue;
    const dicePerUnit = (attack && unit.type === 'bomber' && hasHeavyBombers) ? 2 : 1;

    for (let i = 0; i < unit.quantity; i++) {
      for (let d = 0; d < dicePerUnit; d++) {
        let need = attack ? def.attack : def.defense;
        if (attack && d === 0) need = consumeArtillerySupport(unit.type, need, artillery);
        if (unit.type === 'fighter' && hasJets) need += 1;
        if (attack && unit.type === 'submarine' && hasSuperSubs) need += 1;
        if (attack && d === 0) {
          const paired = consumePairedAttack(unit.type, need, pairedLeft);
          need = paired.attack;
          pairedLeft = paired.pairedLeft;
        }
        const face = roll({
          context: contextLabel,
          side,
          unit: unit.type,
          need,
          playerSeat: owner,
        });
        const hit = face <= need;
        const row = {
          unit: unit.type,
          unitType: unit.type,
          roll: face,
          hit,
        };
        if (attack) row.attackValue = need;
        else row.defenseValue = need;
        rolls.push(row);
        if (hit) hits += 1;
      }
    }
  }

  return { hits, rolls };
}
