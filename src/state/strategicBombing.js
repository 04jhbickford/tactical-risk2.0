// Strategic bombing raids. Bombers only. No escorts, no interceptors.
// Factory output is the placement capacity this game already uses
// (capital 20, any other factory 5), not the map IPC field. Germany's
// map production is 1, and a capital's income is 10, but Rob's example
// is a factory that places 20 with 17 damage, which places 3.
// Cap is twice that output. Old saves omit factoryDamage and read as 0.

import { factoryProductionLimit } from './mobilizeSource.js';

export const STRATEGIC_BOMBER = 'bomber';
export const RAID_PROMPT = 'Normal attack or strategic bombing raid?';
export const REPAIR_IPC_PER_POINT = 1;

export function isStrategicBomberType(type) {
  return type === STRATEGIC_BOMBER;
}

export function isRaidMission(unit) {
  return !!(unit && (unit.raid === true || unit.raided === true));
}

export function unitsIncludeStrategicBomber(units) {
  return (units || []).some((unit) => (
    isStrategicBomberType(unit?.type) && (Number(unit.quantity) || 0) > 0
  ));
}

export function enemyFactoryAt(gameState, territoryName, playerId) {
  if (!gameState || !territoryName || !playerId) return false;
  const zone = gameState.territoryByName?.[territoryName];
  if (!zone || zone.isWater) return false;
  const owner = gameState.getOwner?.(territoryName);
  if (!owner || owner === playerId || gameState.areAllies?.(playerId, owner)) return false;
  const units = gameState.units?.[territoryName] || [];
  return units.some((unit) => (
    unit?.type === 'factory'
    && (Number(unit.quantity) || 0) > 0
    && unit.owner !== playerId
    && !gameState.areAllies?.(playerId, unit.owner)
  ));
}

// Human combat-move of at least one strategic bomber into an enemy factory.
// A choice already passed in (true or false) does not ask again. The AI
// never sees the prompt. It raids only when the move passes raid: true.
export function raidPromptApplies({
  gameState,
  player,
  isCombatMove = false,
  units = [],
  territory = '',
  raidChoice,
} = {}) {
  if (raidChoice === true || raidChoice === false) return false;
  if (!isCombatMove || !player || player.isAI) return false;
  if (!unitsIncludeStrategicBomber(units)) return false;
  return enemyFactoryAt(gameState, territory, player.id);
}

export function factoryOutput(gameState, territoryName, ownerId) {
  const capital = ownerId
    ? (gameState?.playerState?.[ownerId]?.capitalTerritory || null)
    : null;
  return factoryProductionLimit(territoryName, capital);
}

export function maxFactoryDamage(output) {
  return Math.max(0, Number(output) || 0) * 2;
}

export function undamagedPlacement(output, damage) {
  return Math.max(0, (Number(output) || 0) - Math.max(0, Number(damage) || 0));
}

export function repairCost(points) {
  const n = Math.max(0, Math.floor(Number(points) || 0));
  return n * REPAIR_IPC_PER_POINT;
}

export function countAaHits(rolls) {
  return (rolls || []).reduce((sum, face) => sum + (Number(face) === 1 ? 1 : 0), 0);
}

export function sumDice(rolls) {
  return (rolls || []).reduce((sum, face) => sum + (Number(face) || 0), 0);
}

export function bomberDicePerSurvivor(hasHeavyBombers) {
  return hasHeavyBombers ? 2 : 1;
}

export function applyFactoryDamage(current, rolled, cap) {
  const now = Math.max(0, Math.floor(Number(current) || 0));
  const add = Math.max(0, Math.floor(Number(rolled) || 0));
  const limit = Math.max(0, Math.floor(Number(cap) || 0));
  const room = Math.max(0, limit - now);
  const applied = Math.min(room, add);
  return { applied, excess: add - applied, next: now + applied };
}

export function normalizeFactoryDamage(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [name, value] of Object.entries(raw)) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    if (name && n > 0) out[name] = n;
  }
  return out;
}

// AI repairs only when every factory it can use would place nothing.
// It spends the fewest IPCs that reopen one slot on the cheapest factory.
// Any factory that can still place means no repair.
export function aiRepairChoice(factories, ipcs) {
  const list = Array.isArray(factories) ? factories : [];
  if (list.some((row) => (Number(row?.placeable) || 0) > 0)) return null;
  const money = Math.max(0, Math.floor(Number(ipcs) || 0));
  let best = null;
  for (const row of list) {
    const damage = Math.max(0, Math.floor(Number(row?.damage) || 0));
    const output = Math.max(0, Number(row?.output) || 0);
    if (damage <= 0) continue;
    const points = Math.min(damage, Math.max(1, damage - output + 1));
    const cost = repairCost(points);
    if (cost <= 0 || cost > money) continue;
    if (!best || points < best.points) {
      best = { territory: row.name, points, cost };
    }
  }
  return best;
}

export function ownedFactoryNames(gameState, playerId) {
  const names = [];
  if (!gameState || !playerId) return names;
  const capital = gameState.playerState?.[playerId]?.capitalTerritory;
  if (capital && gameState.getOwner?.(capital) === playerId) names.push(capital);
  for (const [name, units] of Object.entries(gameState.units || {})) {
    if (name === capital) continue;
    if (gameState.getOwner?.(name) !== playerId) continue;
    if ((units || []).some((unit) => unit?.type === 'factory' && unit.owner === playerId)) {
      names.push(name);
    }
  }
  return names;
}

export function damagedFactoryRows(gameState, playerId) {
  return ownedFactoryNames(gameState, playerId).map((name) => {
    const output = factoryOutput(gameState, name, playerId);
    const damage = Math.max(0, Math.floor(Number(gameState.getFactoryDamage?.(name)) || 0));
    const placeable = undamagedPlacement(output, damage);
    return { name, output, damage, placeable };
  }).filter((row) => row.damage > 0);
}

export function factoryPlacementLabel({ placed = 0, limit = 0, damage = 0 } = {}) {
  const used = Math.max(0, Math.floor(Number(placed) || 0));
  const cap = Math.max(0, Math.floor(Number(limit) || 0));
  const dmg = Math.max(0, Math.floor(Number(damage) || 0));
  if (dmg > 0) return `${used}/${cap} can place · ${dmg} damage`;
  return `${used}/${cap} units`;
}

// Repair spends 1 IPC per point. The stepper picks how many; Repair all
// spends every point the owner can afford. Cost stays 1 IPC per point.
export function clampRepairPoints(points, damage, ipcs) {
  const cap = Math.min(
    Math.max(0, Math.floor(Number(damage) || 0)),
    Math.max(0, Math.floor(Number(ipcs) || 0)),
  );
  if (cap <= 0) return 0;
  const n = Math.floor(Number(points) || 0);
  return Math.min(cap, Math.max(1, n));
}

export function stepRepairPoints(current, delta, damage, ipcs) {
  const step = Math.floor(Number(delta) || 0);
  return clampRepairPoints((Math.floor(Number(current) || 1) + step), damage, ipcs);
}

export function renderFactoryRepairHtml(rows, { ipcs = 0, pointsByTerritory = {} } = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return '';
  const money = Math.max(0, Math.floor(Number(ipcs) || 0));
  const items = list.map((row) => {
    const cap = Math.min(row.damage, money);
    const chosen = clampRepairPoints(pointsByTerritory[row.name] ?? 1, row.damage, money);
    const afford = cap > 0 && chosen > 0;
    return `
      <div class="pp-factory-limit" data-factory-repair="${row.name}">
        <span class="pp-factory-type">${row.name}</span>
        <span class="pp-factory-capacity">${row.damage} damage · place ${row.placeable}</span>
        <div class="pp-factory-repair-controls">
          <div class="pp-factory-repair-step">
            <button type="button" class="pp-qty-btn" data-action="repair-step" data-territory="${row.name}" data-delta="-1" ${chosen <= 1 ? 'disabled' : ''}>−</button>
            <span class="pp-repair-count">${chosen}</span>
            <button type="button" class="pp-qty-btn" data-action="repair-step" data-territory="${row.name}" data-delta="1" ${chosen >= cap ? 'disabled' : ''}>+</button>
          </div>
          <button type="button" class="pp-action-btn" data-action="repair-factory" data-territory="${row.name}" data-points="${chosen}" ${afford ? '' : 'disabled'}>Repair ${chosen} IPC</button>
          <button type="button" class="pp-action-btn" data-action="repair-factory" data-territory="${row.name}" data-points="${cap}" data-repair-all="1" ${cap > 0 ? '' : 'disabled'}>Repair all</button>
        </div>
      </div>`;
  }).join('');
  return `<div class="pp-raid-repair" data-raid-repair="1">${items}</div>`;
}

// Pending raid bombers become movable for Non-Combat Move. They keep only
// the movement not already spent flying to the factory. The end-of-NCM
// check still destroys them if they are not on a legal landing spot.
// The raid exclusion lasts for the bombing power's turn. The next turn
// can fight with those bombers again, including on defense.
export function clearRaidedForTurnEnd(units) {
  let cleared = 0;
  for (const stacks of Object.values(units || {})) {
    for (const unit of stacks || []) {
      if (!unit?.raided) continue;
      delete unit.raided;
      cleared += Math.max(0, Number(unit.quantity) || 0);
    }
  }
  return cleared;
}

export function releaseRaidBombersForNcm(units) {
  let released = 0;
  for (const stacks of Object.values(units || {})) {
    for (const unit of stacks || []) {
      if (!isRaidMission(unit) || !unit.moved) continue;
      delete unit.moved;
      released += Math.max(0, Number(unit.quantity) || 0);
    }
  }
  return released;
}

// Distance already stored for this air type. A failed search stores 999
// and must not be treated as a spent move.
export function airDistanceFlown(gameState, territory, unitType) {
  const raw = Number(gameState?.airUnitOrigins?.[territory]?.[unitType]?.distance) || 0;
  if (raw >= 999) return 0;
  return Math.max(0, raw);
}

// Anniversary: the return uses total movement minus the flight to the factory.
export function raidBomberRemainingMove(totalMovement, distanceFlown) {
  const total = Math.max(0, Number(totalMovement) || 0);
  const spent = distanceFlown >= 999 ? 0 : Math.max(0, Number(distanceFlown) || 0);
  return Math.max(0, total - spent);
}

// Non-Combat range when this move consumes a raiding bomber. Null when it
// does not, so every other aircraft keeps the range the caller already uses.
// Humans and the AI both move through this number.
export function raiderNcmMovementRange(gameState, {
  fromTerritory,
  quantity,
  ownerId,
  totalMovement,
} = {}) {
  if (!gameState || !fromTerritory || !ownerId) return null;
  const stacks = (gameState.units?.[fromTerritory] || []).filter((unit) => (
    unit?.type === 'bomber'
    && unit.owner === ownerId
    && !unit.moved
    && !unit.id
  ));
  let need = Math.max(0, Number(quantity) || 0);
  let range = null;
  for (const stack of stacks) {
    if (need <= 0) break;
    const have = Math.max(0, Number(stack.quantity) || 0);
    const take = Math.min(need, have);
    if (take <= 0) continue;
    need -= take;
    if (!isRaidMission(stack)) continue;
    const left = raidBomberRemainingMove(
      totalMovement,
      airDistanceFlown(gameState, fromTerritory, 'bomber'),
    );
    range = range == null ? left : Math.min(range, left);
  }
  return range;
}
