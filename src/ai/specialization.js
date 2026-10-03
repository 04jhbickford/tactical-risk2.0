// Second seat axis beside difficulty. One brain, extra knobs.
// A missing or unknown value is General, which is today's AI.
// Rico is stored only while the Nukes lobby option is on. Schema stays 11.

import { difficultyKnobs } from './difficulty.js';

export const DEFAULT_AI_SPECIALIZATION = 'general';

export const AI_SPECIALIZATIONS = Object.freeze([
  {
    id: 'general',
    name: 'General',
    desc: 'Uses every unit, strategy, and technology that is useful. No extra capital preference.',
  },
  {
    id: 'admiral',
    name: 'Admiral',
    desc: 'Islands for income, sea lanes, and attacks from the sea at weak coasts. Prefers an island capital.',
  },
  {
    id: 'infantry_man',
    name: 'Infantry Man',
    desc: 'Infantry and artillery in bulk. Other units support. Prefers a capital in the middle of a lot of land.',
  },
  {
    id: 'blitzkrieg',
    name: 'Blitzkrieg',
    desc: 'Tanks, and mechanized infantry when that unit is on, in bulk. Prefers a capital on the border of a lot of land.',
  },
  {
    id: 'logistics_officer',
    name: 'Logistics Officer',
    desc: 'The same plan as General, and Industrial Technology early. No extra capital preference.',
  },
  {
    id: 'bombadere',
    name: 'Bombadere',
    desc: 'The same plan as General, with Heavy Bombers and other air technology early. Bombers and factory raids. Prefers a coastal capital with few land entrances, in air reach of a lot of land.',
  },
  {
    id: 'rico',
    name: 'Rico',
    desc: 'Reaches nuke technology quickly and uses it once acquired. Listed only while Nukes is on.',
    requiresNukes: true,
  },
]);

// Classic and Expanded have no nuke id today. A later tree can add one
// of these and Rico will prefer it. Anything else is skipped.
export const NUKE_TECH_CANDIDATES = Object.freeze([
  'nukes',
  'nuke',
  'atomicBomb',
  'atomBomb',
  'nuclearWeapons',
]);

const TECH_ORDER = Object.freeze({
  logistics_officer: Object.freeze(['industrialTech']),
  bombadere: Object.freeze(['heavyBombers', 'longRangeAircraft', 'jets']),
  rico: NUKE_TECH_CANDIDATES,
});

const PROFILES = Object.freeze({
  general: Object.freeze({
    capitalBias: 'none', preferBoats: false, raidFactories: false, attackBias: 'none',
  }),
  admiral: Object.freeze({
    capitalBias: 'island', preferBoats: true, raidFactories: false, attackBias: 'sea',
  }),
  infantry_man: Object.freeze({
    capitalBias: 'landCenter', preferBoats: false, raidFactories: false, attackBias: 'land',
  }),
  blitzkrieg: Object.freeze({
    capitalBias: 'landBorder', preferBoats: false, raidFactories: false, attackBias: 'blitz',
  }),
  logistics_officer: Object.freeze({
    capitalBias: 'none', preferBoats: false, raidFactories: false, attackBias: 'none',
  }),
  bombadere: Object.freeze({
    capitalBias: 'coastalAir', preferBoats: false, raidFactories: true, attackBias: 'raid',
  }),
  rico: Object.freeze({
    capitalBias: 'none', preferBoats: false, raidFactories: false, attackBias: 'nuke',
  }),
});

export const BOMBER_AIR_RANGE = 6;

export function nukesLobbyOn(gameOptions) {
  return gameOptions?.nukes === true;
}

export function specializationChoices(gameOptions) {
  const nukes = nukesLobbyOn(gameOptions);
  return AI_SPECIALIZATIONS.filter((row) => nukes || row.requiresNukes !== true);
}

export function normalizeAiSpecialization(raw, gameOptions) {
  const key = String(raw ?? '').trim().toLowerCase();
  const row = AI_SPECIALIZATIONS.find((item) => item.id === key);
  if (!row) return DEFAULT_AI_SPECIALIZATION;
  if (row.requiresNukes && !nukesLobbyOn(gameOptions)) return DEFAULT_AI_SPECIALIZATION;
  return row.id;
}

export function aiSpecializationLabel(raw, gameOptions) {
  const id = normalizeAiSpecialization(raw, gameOptions);
  return AI_SPECIALIZATIONS.find((row) => row.id === id)?.name || 'General';
}

// Difficulty knobs stay the attack and garrison plan. Specialization
// only adds capital, purchase, tech, and sea flags.
export function layeredKnobs(difficulty, specialization, gameOptions) {
  const id = normalizeAiSpecialization(specialization, gameOptions);
  const profile = PROFILES[id] || PROFILES.general;
  return {
    ...difficultyKnobs(difficulty),
    specialization: id,
    capitalBias: profile.capitalBias,
    preferBoats: profile.preferBoats,
    raidFactories: profile.raidFactories,
    attackBias: profile.attackBias,
  };
}

export function techBias(specialization, available, gameOptions) {
  const id = normalizeAiSpecialization(specialization, gameOptions);
  const order = TECH_ORDER[id] || [];
  const have = new Set(available || []);
  const pick = order.find((tech) => have.has(tech)) || null;
  return { id, pick, eager: pick != null };
}

// The named tech when it is researchable. Otherwise the caller's
// existing first choice, so a missing id does not change the pick.
export function preferredTechId(specialization, available, gameOptions) {
  const bias = techBias(specialization, available, gameOptions);
  if (bias.pick) return bias.pick;
  const list = available || [];
  return list.length ? list[0] : null;
}

export function nukeUnitType(unitDefs) {
  if (!unitDefs) return null;
  for (const id of NUKE_TECH_CANDIDATES) {
    if (unitDefs[id]) return id;
  }
  return null;
}

// Tilt the existing purchase list. Other units stay on it, at least one,
// so a flavor cannot make them impossible.
export function tiltPurchasePriorities(priorities, specialization, {
  mechanized = false,
  nukeUnit = null,
  gameOptions = null,
} = {}) {
  const source = Array.isArray(priorities) ? priorities : [];
  const id = normalizeAiSpecialization(specialization, gameOptions);
  if (id === 'general' || id === 'logistics_officer' || id === 'admiral') return source;
  if (id === 'rico') {
    if (!nukeUnit || source.some((row) => row.unitType === nukeUnit)) return source;
    return [{ unitType: nukeUnit, maxCount: 1 }, ...source.map((row) => ({ ...row }))];
  }
  const rows = source.map((row) => ({ ...row }));
  const raise = (type, count) => {
    const at = rows.findIndex((row) => row.unitType === type);
    if (at >= 0) rows[at] = { ...rows[at], maxCount: Math.max(rows[at].maxCount || 0, count) };
    else rows.push({ unitType: type, maxCount: count });
  };
  const shrink = (keep) => {
    for (const row of rows) {
      if (keep.has(row.unitType)) continue;
      row.maxCount = Math.max(1, Math.ceil((row.maxCount || 1) * 0.5));
    }
  };
  const moveTo = (type, index) => {
    const at = rows.findIndex((row) => row.unitType === type);
    if (at < 0) return;
    const [row] = rows.splice(at, 1);
    rows.splice(Math.max(0, Math.min(index, rows.length)), 0, row);
  };
  if (id === 'infantry_man') {
    raise('infantry', 8);
    raise('artillery', 4);
    shrink(new Set(['infantry', 'artillery']));
    moveTo('infantry', 0);
    moveTo('artillery', 1);
    return rows;
  }
  if (id === 'blitzkrieg') {
    raise('armour', 6);
    if (mechanized) raise('mechanizedInfantry', 4);
    shrink(new Set(['armour', 'mechanizedInfantry']));
    moveTo('armour', 0);
    if (mechanized) moveTo('mechanizedInfantry', 1);
    return rows;
  }
  if (id === 'bombadere') {
    raise('bomber', 2);
    moveTo('bomber', Math.min(1, rows.length - 1));
    return rows;
  }
  return source;
}

export function attackPriorityBonus(specialization, facts = {}, gameOptions) {
  const id = normalizeAiSpecialization(specialization, gameOptions);
  const defense = Number(facts.defensePower) || 0;
  if (id === 'admiral') {
    let bonus = 0;
    if (facts.coastal) bonus += 12;
    if (defense > 0 && defense < 3) bonus += 8;
    return bonus;
  }
  if (id === 'infantry_man') return defense > 0 && defense < 4 ? 8 : 2;
  if (id === 'blitzkrieg') return facts.hasArmour ? 16 : 0;
  if (id === 'bombadere') return facts.factory ? 10 : 0;
  if (id === 'rico') return facts.nukeReady && facts.isEnemyCapital ? 20 : 0;
  return 0;
}

export function capitalBiasScore(bias, facts = {}) {
  const landN = Number(facts.landNeighborCount) || 0;
  const seaN = Number(facts.seaNeighborCount) || 0;
  const mass = Number(facts.landMassSize) || 0;
  const air = Number(facts.airReachLand) || 0;
  const island = facts.isIsland === true || (landN === 0 && seaN > 0);
  if (!bias || bias === 'none') return 0;
  if (bias === 'island') return island ? 1000 + seaN : 0;
  if (bias === 'landCenter') {
    if (island || landN === 0) return 0;
    const coastal = seaN > 0 ? 40 : 0;
    return landN * 25 + mass * 3 - coastal;
  }
  if (bias === 'landBorder') {
    if (island || mass < 3) return 0;
    const border = seaN > 0 || landN <= 2;
    return border ? 400 + mass * 5 + landN : mass;
  }
  if (bias === 'coastalAir') {
    if (seaN <= 0) return 0;
    const entrances = Math.max(0, 4 - Math.min(landN, 4)) * 50;
    return 100 + entrances + Math.min(air, 20) * 8;
  }
  return 0;
}

// Land-step neighbors and every connection (air flies over sea).
export function capitalPlacementFacts(name, {
  territoryByName = {},
  landNeighbors = () => [],
  allNeighbors = () => [],
  airRange = BOMBER_AIR_RANGE,
} = {}) {
  const landList = landNeighbors(name) || [];
  const all = allNeighbors(name) || [];
  const seaList = all.filter((next) => territoryByName?.[next]?.isWater);
  const seen = new Set([name]);
  const queue = [name];
  while (queue.length) {
    const current = queue.pop();
    for (const next of landNeighbors(current) || []) {
      if (!next || seen.has(next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  const airSeen = new Set([name]);
  const airQueue = [[name, 0]];
  let airLand = 0;
  const range = Math.max(0, Number(airRange) || 0);
  while (airQueue.length) {
    const [current, dist] = airQueue.shift();
    if (dist >= range) continue;
    for (const next of allNeighbors(current) || []) {
      if (!next || airSeen.has(next)) continue;
      airSeen.add(next);
      if (territoryByName?.[next] && !territoryByName[next].isWater) airLand += 1;
      airQueue.push([next, dist + 1]);
    }
  }
  const landN = landList.length;
  return {
    landNeighborCount: landN,
    seaNeighborCount: seaList.length,
    isIsland: landN === 0 && seaList.length > 0,
    landMassSize: seen.size,
    airReachLand: airLand,
    landEntrances: landN,
  };
}
