// Past battles from diceBatches and combat events. Read-only.

export function dieIsHit(need, face) {
  if (need == null || need === '') return null;
  const n = Number(need);
  const f = Number(face);
  if (!Number.isFinite(n) || !Number.isFinite(f)) return null;
  return f <= n;
}

function sideList(battle, side) {
  if (side === 'defender') return battle.defender;
  return battle.attacker;
}

function battleKey(parts) {
  return [
    parts.territory || 'Unknown territory',
    Number(parts.round) || 0,
    Number(parts.battleRound) || 1,
  ].join('|');
}

function blankBattle(parts) {
  return {
    key: battleKey(parts),
    territory: parts.territory || 'Unknown territory',
    round: Number(parts.round) || 0,
    battleRound: Number(parts.battleRound) || 1,
    attacker: [],
    defender: [],
  };
}

function pushDie(battle, side, die) {
  const face = Number(die?.face);
  if (!Number.isInteger(face) || face < 1 || face > 6) return;
  const need = die?.need == null || die?.need === '' ? null : Number(die.need);
  const hit = die?.hit == null ? dieIsHit(need, face) : !!die.hit;
  sideList(battle, side).push({
    unit: die?.unit || '',
    face,
    need: Number.isFinite(need) ? need : null,
    hit,
  });
}

function ensure(map, parts) {
  const key = battleKey(parts);
  if (!map.has(key)) map.set(key, blankBattle(parts));
  return map.get(key);
}

export function battlesFromDiceSources({ batches = [], events = [] } = {}) {
  const map = new Map();
  for (const batch of batches || []) {
    const territory = batch?.territory || null;
    const battle = ensure(map, {
      territory: territory || 'Unknown territory',
      round: batch?.round,
      battleRound: batch?.battleRound || 1,
    });
    const side = batch?.side === 'defender' ? 'defender' : 'attacker';
    for (const die of batch?.dice || []) pushDie(battle, side, die);
  }
  for (const event of events || []) {
    const kind = event?.kind;
    if (kind !== 'combat' && kind !== 'aa') continue;
    const payload = event?.payload || {};
    const territory = event?.territory || payload.territory || null;
    if (!territory) continue;
    const battle = ensure(map, {
      territory,
      round: event?.turn || payload.round,
      battleRound: payload.roundIndex || payload.battleRound || 1,
    });
    const attack = payload.attackDice || payload.attackerDice || [];
    const defense = payload.defenseDice || payload.defenderDice || [];
    if (attack.length || defense.length) {
      if (!battle.attacker.length) for (const die of attack) pushDie(battle, 'attacker', die);
      if (!battle.defender.length) for (const die of defense) pushDie(battle, 'defender', die);
      continue;
    }
    // Number-only telemetry. Faces without a stored need.
    if (!battle.attacker.length) {
      for (const face of payload.attackRolls || []) pushDie(battle, 'attacker', { face, need: null, hit: null });
    }
    if (!battle.defender.length) {
      for (const face of payload.defenseRolls || []) pushDie(battle, 'defender', { face, need: null, hit: null });
    }
  }
  return [...map.values()].sort((a, b) => (
    a.round - b.round || a.battleRound - b.battleRound || a.territory.localeCompare(b.territory)
  ));
}

export function hitCount(dice) {
  return (dice || []).reduce((sum, die) => sum + (die?.hit ? 1 : 0), 0);
}
