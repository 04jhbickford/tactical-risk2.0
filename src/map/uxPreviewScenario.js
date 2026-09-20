// Playable UX preview scenario — Combat Move → Battle → Air Land.
// Preview only. Seeded Karelia pocket. Do not merge to main.

export const PHASE = {
  COMBAT_MOVE: 'COMBAT MOVE',
  BATTLE: 'BATTLE',
  AIR_LAND: 'AIR LAND',
  DONE: 'DONE',
};

export const BATTLE_STEP = {
  AA_READY: 'aaReady',
  AA_RESULT: 'aaResult',
  COMBAT_READY: 'combatReady',
  COMBAT_RESULT: 'combatResult',
  WON: 'won',
};

export const UNIT_DEFS = {
  infantry: { attack: 1, defense: 2, cost: 3, isAir: false, isAA: false },
  artillery: { attack: 2, defense: 2, cost: 4, isAir: false, isAA: false },
  armour: { attack: 3, defense: 3, cost: 5, isAir: false, isAA: false },
  fighter: { attack: 3, defense: 4, cost: 10, isAir: true, isAA: false },
  bomber: { attack: 4, defense: 1, cost: 12, isAir: true, isAA: false },
  tacticalBomber: { attack: 3, defense: 3, cost: 11, isAir: true, isAA: false },
  aaGun: { attack: 0, defense: 0, cost: 5, isAir: false, isAA: true },
  factory: { attack: 0, defense: 0, cost: 15, isAir: false, isAA: false },
};

export const SCENARIO = {
  id: 'karelia-finland-air',
  seat: 'Russians',
  ipc: 24,
  origin: 'Karelia S.S.R.',
  dest: 'Finland Norway',
  legalDests: ['Finland Norway', 'Ukraine S.S.R.'],
  landable: ['Karelia S.S.R.', 'Russia'],
  seed: 1941,
};

export const MAX_SCENARIO = {
  id: 'karelia-ukraine-max',
  dest: 'Ukraine S.S.R.',
  legalDests: ['Ukraine S.S.R.', 'Finland Norway'],
  ipc: 48,
};

// MAX practical land theater — enough of each type that +/- matters.
export const MAX_ATTACK = {
  infantry: 10,
  artillery: 6,
  armour: 6,
  fighter: 4,
  bomber: 3,
};
export const MAX_DEFEND = {
  infantry: 8,
  artillery: 4,
  armour: 4,
  fighter: 3,
  aaGun: 3,
};

const COMBAT_ORDER = ['infantry', 'artillery', 'armour', 'fighter', 'tacticalBomber', 'bomber'];

export const SELECT_GOLD = '#C4A35A';
export const LEGAL_GOLD = '#C4A35A';
export const LAND_TEAL = '#5BA8A0';

export const GUIDE = {
  [PHASE.COMBAT_MOVE]: 'Tap origin · select units · tap dest · Confirm',
  [PHASE.BATTLE]: 'One Confirm at a time — AA, then dice, then hits.',
  [PHASE.AIR_LAND]: 'Teal land · pick planes · Confirm. Split dests OK.',
  [PHASE.DONE]: 'Aircraft landed. Confirm is idle — Replay if you want.',
};

export const LABEL_LANDS = [
  'Karelia S.S.R.',
  'Finland Norway',
  'Ukraine S.S.R.',
  'Russia',
];

const DEMO_ROLLS = {
  aa: [4],
  attack: [1, 2, 5, 3],
  defense: [2, 6],
};

const DEMO_ROLLS_MAX = {
  aa: [4, 5, 6, 3, 2, 6, 5],
  attack: [1, 1, ...Array.from({ length: 32 }, () => 5)],
  defense: [2, ...Array.from({ length: 24 }, () => 6)],
};

function stacksFrom(owner, counts) {
  return Object.entries(counts || {})
    .filter(([, n]) => Number(n) > 0)
    .map(([type, quantity]) => ({ type, quantity: Number(quantity), owner }));
}

function cloneStacks(stacks) {
  return (stacks || []).map((s) => ({ ...s }));
}

function clonePlacements(src) {
  const out = {};
  for (const [name, stacks] of Object.entries(src || {})) {
    out[name] = cloneStacks(stacks);
  }
  return out;
}

export function seedPlacements() {
  return {
    [SCENARIO.origin]: [
      { type: 'infantry', quantity: 3, owner: 'Russians' },
      { type: 'fighter', quantity: 1, owner: 'Russians' },
    ],
    [SCENARIO.dest]: [
      { type: 'infantry', quantity: 2, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'Germans' },
    ],
    'Ukraine S.S.R.': [
      { type: 'infantry', quantity: 2, owner: 'Germans' },
    ],
    Russia: [
      { type: 'infantry', quantity: 1, owner: 'Russians' },
    ],
  };
}

export function seedMaxPlacements() {
  return {
    [SCENARIO.origin]: stacksFrom('Russians', MAX_ATTACK),
    [MAX_SCENARIO.dest]: stacksFrom('Germans', MAX_DEFEND),
    [SCENARIO.dest]: [
      { type: 'infantry', quantity: 2, owner: 'Germans' },
    ],
    Russia: [
      { type: 'infantry', quantity: 1, owner: 'Russians' },
    ],
  };
}

export function seedOwners() {
  return {
    [SCENARIO.origin]: 'Russians',
    [SCENARIO.dest]: 'Germans',
    'Ukraine S.S.R.': 'Germans',
    Russia: 'Russians',
  };
}

export function createScenario(overrides = {}) {
  const max = !!overrides.maxBattle || !!overrides.max;
  const { max: _max, maxBattle: _mb, ...rest } = overrides;
  return {
    id: max ? MAX_SCENARIO.id : SCENARIO.id,
    seat: SCENARIO.seat,
    ipc: max ? MAX_SCENARIO.ipc : SCENARIO.ipc,
    origin: SCENARIO.origin,
    dest: max ? MAX_SCENARIO.dest : SCENARIO.dest,
    legalDests: max ? [...MAX_SCENARIO.legalDests] : [...SCENARIO.legalDests],
    landable: [...SCENARIO.landable],
    phase: PHASE.COMBAT_MOVE,
    selected: null,
    selectedUnits: {},
    destPicked: null,
    landingDest: null,
    landingPick: {},
    airLeft: {},
    landed: false,
    guideOn: true,
    maxBattle: max,
    placements: max ? seedMaxPlacements() : seedPlacements(),
    owners: seedOwners(),
    battle: null,
    rngCursor: 0,
    ...rest,
    maxBattle: max,
    dest: rest.dest || (max ? MAX_SCENARIO.dest : SCENARIO.dest),
    legalDests: rest.legalDests || (max ? [...MAX_SCENARIO.legalDests] : [...SCENARIO.legalDests]),
    placements: rest.placements || (max ? seedMaxPlacements() : seedPlacements()),
  };
}

export function applyScenarioPocket(basePlacements, baseOwners, { max = false } = {}) {
  const placements = clonePlacements(basePlacements);
  const owners = { ...(baseOwners || {}) };
  const seeded = max ? seedMaxPlacements() : seedPlacements();
  const seededOwners = seedOwners();
  for (const [name, stacks] of Object.entries(seeded)) {
    placements[name] = cloneStacks(stacks);
  }
  Object.assign(owners, seededOwners);
  return { placements, owners };
}

export function stackQty(stacks, type, owner = null) {
  return (stacks || [])
    .filter((s) => s.type === type && (!owner || s.owner === owner))
    .reduce((n, s) => n + (Number(s.quantity) || 0), 0);
}

export function totalQty(stacks) {
  return (stacks || []).reduce((n, s) => n + (Number(s.quantity) || 0), 0);
}

export function pickedCount(selectedUnits) {
  return Object.values(selectedUnits || {}).reduce((n, q) => n + (Number(q) || 0), 0);
}

export function hasGround(selectedUnits) {
  return (Number(selectedUnits?.infantry) || 0) > 0
    || (Number(selectedUnits?.armour) || 0) > 0
    || (Number(selectedUnits?.artillery) || 0) > 0;
}

export function hasAir(selectedUnits) {
  return (Number(selectedUnits?.fighter) || 0) > 0
    || (Number(selectedUnits?.bomber) || 0) > 0
    || (Number(selectedUnits?.tacticalBomber) || 0) > 0;
}

export function selectedAirCount(selectedUnits) {
  return Object.entries(selectedUnits || {}).reduce((n, [type, qty]) => (
    UNIT_DEFS[type]?.isAir ? n + (Number(qty) || 0) : n
  ), 0);
}

function combatUnits(stacks, owner) {
  const order = COMBAT_ORDER;
  return (stacks || [])
    .filter((s) => (
      s.owner === owner
      && (s.quantity || 0) > 0
      && s.type !== 'factory'
      && s.type !== 'aaGun'
    ))
    .sort((a, b) => {
      const ia = order.indexOf(a.type);
      const ib = order.indexOf(b.type);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
}

function aaCount(stacks, owner) {
  return (stacks || [])
    .filter((s) => s.owner === owner && s.type === 'aaGun')
    .reduce((n, s) => n + (Number(s.quantity) || 0), 0);
}

function airCount(stacks, owner) {
  return (stacks || [])
    .filter((s) => s.owner === owner && UNIT_DEFS[s.type]?.isAir)
    .reduce((n, s) => n + (Number(s.quantity) || 0), 0);
}

function removeQty(stacks, type, owner, qty) {
  let left = qty;
  for (const s of stacks) {
    if (left <= 0) break;
    if (s.type !== type || (owner && s.owner !== owner)) continue;
    const take = Math.min(s.quantity || 0, left);
    s.quantity -= take;
    left -= take;
  }
  return stacks.filter((s) => (s.quantity || 0) > 0);
}

function addQty(stacks, type, owner, qty) {
  const list = stacks || [];
  const existing = list.find((s) => s.type === type && s.owner === owner);
  if (existing) existing.quantity += qty;
  else list.push({ type, owner, quantity: qty });
  return list;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6D2B79F5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function d6(rng) {
  return 1 + Math.floor(rng() * 6);
}

function useSmallDemo(state) {
  const attInf = Number(state.selectedUnits.infantry) || 0;
  const attFtr = Number(state.selectedUnits.fighter) || 0;
  const defInf = stackQty(state.placements[state.dest], 'infantry', 'Germans');
  return attInf === 3 && attFtr === 1 && defInf === 2;
}

function useDemoRolls(state) {
  if (state?.maxBattle) return true;
  return useSmallDemo(state);
}

function demoPack(state) {
  return state?.maxBattle ? DEMO_ROLLS_MAX : DEMO_ROLLS;
}

function takeDie(state, scripted, rng) {
  if (scripted && scripted.length) return scripted.shift();
  return d6(rng);
}

function cheapestLosses(stacks, owner, hits) {
  const order = COMBAT_ORDER;
  const taken = {};
  let left = hits;
  for (const type of order) {
    if (left <= 0) break;
    const have = (stacks || [])
      .filter((s) => s.owner === owner && s.type === type)
      .reduce((n, s) => n + (Number(s.quantity) || 0), 0);
    const n = Math.min(have, left);
    if (n > 0) {
      taken[type] = n;
      left -= n;
    }
  }
  return taken;
}

function applyLosses(stacks, owner, taken) {
  let next = stacks;
  for (const [type, qty] of Object.entries(taken || {})) {
    next = removeQty(next, type, owner, qty);
  }
  return next;
}

const LOSS_SHORT = {
  infantry: 'INF',
  artillery: 'ART',
  armour: 'TNK',
  fighter: 'FTR',
  bomber: 'BMB',
  tacticalBomber: 'TAC',
};

function formatLoss(taken) {
  const parts = Object.entries(taken || {})
    .filter(([, n]) => n > 0)
    .map(([type, n]) => `${LOSS_SHORT[type] || type}×${n}`);
  return parts.join(' ') || 'none';
}

export function legalDests(state) {
  return [...(state?.legalDests || SCENARIO.legalDests)];
}

export function isLegalDest(state, name) {
  return !!name && legalDests(state).includes(name);
}

export function tapLand(state, name) {
  if (!state || !name) return state;
  if (state.phase === PHASE.BATTLE) {
    state.selected = state.dest;
    return state;
  }
  if (state.phase === PHASE.AIR_LAND) {
    if (state.landable.includes(name)) {
      state.selected = name;
      state.landingDest = name;
    }
    return state;
  }
  if (state.phase === PHASE.DONE) {
    state.selected = name;
    return state;
  }
  if (name === state.origin) {
    state.selected = name;
    if (!pickedCount(state.selectedUnits)) {
      state.selectedUnits = {};
    }
    return state;
  }
  if (isLegalDest(state, name)) {
    if (hasGround(state.selectedUnits)) {
      state.destPicked = name;
      state.dest = name;
      state.selected = name;
    }
    return state;
  }
  return state;
}

export function pickUnit(state, type) {
  if (!state || state.phase !== PHASE.COMBAT_MOVE) return state;
  const have = stackQty(state.placements[state.origin], type);
  if (have <= 0) return state;
  if ((Number(state.selectedUnits[type]) || 0) > 0) {
    delete state.selectedUnits[type];
  } else {
    state.selectedUnits[type] = have;
  }
  if (!hasGround(state.selectedUnits)) state.destPicked = null;
  return state;
}

// Combat-move sheet steppers: INF [-] 0/3 [+]. One tap = ±1.
export function adjustUnit(state, type, delta = 1) {
  if (!state || state.phase !== PHASE.COMBAT_MOVE) return state;
  const have = stackQty(state.placements[state.origin], type);
  if (have <= 0) return state;
  const step = Number(delta);
  if (!Number.isFinite(step) || step === 0) return state;
  const cur = Number(state.selectedUnits[type]) || 0;
  const next = Math.max(0, Math.min(have, cur + step));
  if (next <= 0) delete state.selectedUnits[type];
  else state.selectedUnits[type] = next;
  if (!hasGround(state.selectedUnits)) state.destPicked = null;
  return state;
}

export function assignedCount(taken) {
  return Object.values(taken || {}).reduce((n, q) => n + (Number(q) || 0), 0);
}

export function lossMenu(stacks, owner, hits) {
  const units = combatUnits(stacks, owner);
  const total = totalQty(units);
  const need = Math.min(Math.max(0, Number(hits) || 0), total);
  const types = units.filter((u) => (u.quantity || 0) > 0);
  const forced = need <= 0 || types.length <= 1 || total <= need;
  return {
    need,
    forced,
    units: types.map((u) => ({ type: u.type, quantity: u.quantity })),
  };
}

export function sideLossesReady(state, side) {
  const battle = state?.battle;
  if (!battle || battle.step !== BATTLE_STEP.COMBAT_RESULT) return false;
  const dest = state.placements[state.dest] || [];
  if (side === 'def') {
    const def = lossMenu(dest, 'Germans', battle.attackHits);
    return assignedCount(battle.pendingDef) === def.need;
  }
  const att = lossMenu(dest, 'Russians', battle.defenseHits);
  return assignedCount(battle.pendingAtt) === att.need;
}

// Solo / local preview: Confirm waits on YOUR assigns only.
// THEY (defender) is cheapest-auto and optional to retap.
export function lossesReady(state) {
  return sideLossesReady(state, 'att');
}

export function allLossesReady(state) {
  return sideLossesReady(state, 'att') && sideLossesReady(state, 'def');
}

export function pickLoss(state, side, type) {
  const battle = state?.battle;
  if (!battle || battle.step !== BATTLE_STEP.COMBAT_RESULT) return state;
  const dest = state.placements[state.dest] || [];
  const owner = side === 'att' ? 'Russians' : 'Germans';
  const hits = side === 'att' ? battle.defenseHits : battle.attackHits;
  const menu = lossMenu(dest, owner, hits);
  if (menu.forced || menu.need <= 0) return state;
  const key = side === 'att' ? 'pendingAtt' : 'pendingDef';
  const cur = { ...(battle[key] || {}) };
  const have = stackQty(dest, type, owner);
  if (have <= 0) return state;
  const thisN = Number(cur[type]) || 0;
  if (menu.need === 1) {
    // Sticky: same-type re-tap (or a doubled pointer) must not toggle off
    // and soft-lock Confirm. A different type replaces the pick.
    if (thisN > 0) return state;
    battle[key] = { [type]: 1 };
    return state;
  }
  const used = assignedCount(cur);
  if (thisN < have && used < menu.need) {
    cur[type] = thisN + 1;
  } else if (thisN > 0) {
    cur[type] = thisN - 1;
    if (cur[type] <= 0) delete cur[type];
  } else if (used >= menu.need && thisN === 0) {
    const donor = Object.keys(cur).find((t) => t !== type && (Number(cur[t]) || 0) > 0);
    if (donor) {
      cur[donor] -= 1;
      if (cur[donor] <= 0) delete cur[donor];
      cur[type] = 1;
    }
  }
  battle[key] = cur;
  return state;
}

export function adjustLoss(state, side, type, delta = 1) {
  const battle = state?.battle;
  if (!battle || battle.step !== BATTLE_STEP.COMBAT_RESULT) return state;
  if (side === 'def') return state;
  const dest = state.placements[state.dest] || [];
  const menu = lossMenu(dest, 'Russians', battle.defenseHits);
  if (menu.forced || menu.need <= 0) return state;
  const have = stackQty(dest, type, 'Russians');
  if (have <= 0) return state;
  const step = Number(delta);
  if (!Number.isFinite(step) || step === 0) return state;
  const cur = { ...(battle.pendingAtt || {}) };
  const thisN = Number(cur[type]) || 0;
  if (menu.need === 1) {
    if (step > 0) battle.pendingAtt = { [type]: 1 };
    else if (thisN > 0) battle.pendingAtt = {};
    return state;
  }
  const used = assignedCount(cur);
  if (step > 0 && thisN < have && used < menu.need) cur[type] = thisN + 1;
  else if (step < 0 && thisN > 0) {
    cur[type] = thisN - 1;
    if (cur[type] <= 0) delete cur[type];
  }
  battle.pendingAtt = cur;
  return state;
}

export function confirmEnabled(state) {
  if (!state) return false;
  if (state.phase === PHASE.COMBAT_MOVE) {
    return !!state.destPicked && hasGround(state.selectedUnits);
  }
  if (state.phase === PHASE.BATTLE) {
    if (!state.battle) return false;
    if (state.battle.step === BATTLE_STEP.COMBAT_RESULT) return lossesReady(state);
    return true;
  }
  if (state.phase === PHASE.AIR_LAND) {
    return !!state.landingDest && pickedCount(state.landingPick) > 0 && !state.landed;
  }
  if (state.phase === PHASE.DONE) return true;
  return false;
}

export function confirmGold(state) {
  if (!state || state.phase === PHASE.DONE) return false;
  return confirmEnabled(state);
}

export function confirmLabel(state) {
  if (!state) return 'Select units';
  if (state.phase === PHASE.COMBAT_MOVE) {
    if (state.destPicked && hasGround(state.selectedUnits)) {
      return `Confirm: Attack ${state.destPicked || state.dest}`;
    }
    if (state.selected !== state.origin && !pickedCount(state.selectedUnits)) {
      return 'Select units';
    }
    if (!hasGround(state.selectedUnits)) return 'Select units';
    return 'Pick target';
  }
  if (state.phase === PHASE.BATTLE) {
    const step = state.battle?.step;
    if (step === BATTLE_STEP.AA_READY) return 'Confirm: Fire AA';
    if (step === BATTLE_STEP.AA_RESULT) return 'Confirm: Continue';
    if (step === BATTLE_STEP.COMBAT_READY) return 'Confirm: Roll combat';
    if (step === BATTLE_STEP.COMBAT_RESULT) {
      return lossesReady(state) ? 'Confirm: Take hits' : 'Assign casualties';
    }
    if (step === BATTLE_STEP.WON) return `Confirm: Take ${state.dest}`;
    return 'Battle';
  }
  if (state.phase === PHASE.AIR_LAND) {
    if (!state.landingDest) return 'Confirm land';
    if (!pickedCount(state.landingPick)) return 'Select planes';
    return `Confirm: Land in ${state.landingDest}`;
  }
  if (state.phase === PHASE.DONE) {
    return state.landingDest
      ? `Landed in ${state.landingDest} · Replay`
      : 'Replay scenario';
  }
  return 'Select units';
}

export function airLandRoster(state) {
  if (state?.phase !== PHASE.AIR_LAND) return [];
  const pool = state.airLeft && Object.keys(state.airLeft).length
    ? state.airLeft
    : state.selectedUnits;
  return Object.entries(pool || {})
    .filter(([, n]) => Number(n) > 0)
    .map(([type, quantity]) => ({ type, quantity: Number(quantity) || 0 }));
}

export function remainingAirCount(state) {
  return airLandRoster(state).reduce((n, u) => n + (Number(u.quantity) || 0), 0);
}

export function adjustLanding(state, type, delta = 1) {
  if (!state || state.phase !== PHASE.AIR_LAND) return state;
  if (!UNIT_DEFS[type]?.isAir) return state;
  const have = Number(state.airLeft?.[type] ?? state.selectedUnits?.[type]) || 0;
  if (have <= 0) return state;
  const step = Number(delta);
  if (!Number.isFinite(step) || step === 0) return state;
  const cur = Number(state.landingPick?.[type]) || 0;
  const next = Math.max(0, Math.min(have, cur + step));
  if (!state.landingPick) state.landingPick = {};
  if (next <= 0) delete state.landingPick[type];
  else state.landingPick[type] = next;
  return state;
}

export function guideCopy(state) {
  return GUIDE[state?.phase] || GUIDE[PHASE.COMBAT_MOVE];
}

export function guideSteps() {
  return { persistent: false, current: 0, steps: [] };
}

export function highlights(state) {
  const out = {
    origin: null,
    dest: null,
    legal: [],
    landable: [],
    selected: state?.selected || null,
    pulse: [],
    labels: [...LABEL_LANDS],
  };
  if (!state) return out;
  if (state.phase === PHASE.COMBAT_MOVE) {
    out.origin = state.origin;
    const originTapped = state.selected === state.origin || pickedCount(state.selectedUnits);
    if (!originTapped) out.pulse.push(state.origin);
    if (hasGround(state.selectedUnits)) {
      out.legal = legalDests(state);
      if (!state.destPicked) out.pulse.push(...out.legal);
    }
    if (state.destPicked) out.dest = state.destPicked;
  }
  if (state.phase === PHASE.BATTLE) {
    out.origin = state.origin;
    out.dest = state.dest;
  }
  if (state.phase === PHASE.AIR_LAND) {
    out.dest = state.dest;
    out.landable = [...state.landable];
    if (state.landingDest) out.selected = state.landingDest;
  }
  if (state.phase === PHASE.DONE && state.landingDest) {
    out.selected = state.landingDest;
  }
  return out;
}

function startBattle(state) {
  const destStacks = state.placements[state.dest] || [];
  const guns = aaCount(destStacks, 'Germans');
  const planes = selectedAirCount(state.selectedUnits);
  state.phase = PHASE.BATTLE;
  state.selected = state.dest;
  state.battle = {
    step: guns > 0 && planes > 0 ? BATTLE_STEP.AA_READY : BATTLE_STEP.COMBAT_READY,
    round: 0,
    aaGuns: guns,
    aaPlanes: planes,
    aaHits: 0,
    aaDice: [],
    attackDice: [],
    defenseDice: [],
    attackHits: 0,
    defenseHits: 0,
    pendingAtt: {},
    pendingDef: {},
    log: [],
  };
  return state;
}

function applyCombatMove(state) {
  if (state.destPicked) state.dest = state.destPicked;
  const from = state.placements[state.origin] || [];
  let dest = state.placements[state.dest] || [];
  for (const [type, qty] of Object.entries(state.selectedUnits)) {
    const n = Number(qty) || 0;
    if (n <= 0) continue;
    state.placements[state.origin] = removeQty(from, type, 'Russians', n);
    dest = addQty(dest, type, 'Russians', n);
  }
  state.placements[state.dest] = dest;
  return startBattle(state);
}

function rollAA(state) {
  const battle = state.battle;
  const rng = mulberry32(SCENARIO.seed + state.rngCursor);
  const scripted = useDemoRolls(state) ? [...demoPack(state).aa] : null;
  const dice = [];
  let hits = 0;
  for (let i = 0; i < battle.aaPlanes; i++) {
    const face = takeDie(state, scripted, rng);
    dice.push(face);
    if (face === 1) hits += 1;
  }
  state.rngCursor += 1;
  battle.aaDice = dice;
  battle.aaHits = hits;
  if (hits > 0) {
    const dest = state.placements[state.dest] || [];
    state.placements[state.dest] = removeQty(dest, 'fighter', 'Russians', hits);
    if ((Number(state.selectedUnits.fighter) || 0) > 0) {
      state.selectedUnits.fighter = Math.max(0, state.selectedUnits.fighter - hits);
    }
  }
  battle.step = BATTLE_STEP.AA_RESULT;
  battle.log.push(hits ? `AA hit ×${hits}` : 'AA missed');
  return state;
}

function rollCombat(state) {
  const battle = state.battle;
  battle.round += 1;
  const dest = state.placements[state.dest] || [];
  const attackers = combatUnits(dest, 'Russians');
  const defenders = combatUnits(dest, 'Germans');
  const rng = mulberry32(SCENARIO.seed + 17 + state.rngCursor);
  const demo = useDemoRolls(state);
  const pack = demoPack(state);
  const attScript = demo ? [...pack.attack] : null;
  const defScript = demo ? [...pack.defense] : null;

  const attackDice = [];
  let attackHits = 0;
  for (const unit of attackers) {
    const def = UNIT_DEFS[unit.type] || { attack: 1 };
    for (let i = 0; i < (unit.quantity || 0); i++) {
      const face = takeDie(state, attScript, rng);
      attackDice.push({ type: unit.type, face, hit: face <= def.attack });
      if (face <= def.attack) attackHits += 1;
    }
  }

  const defenseDice = [];
  let defenseHits = 0;
  for (const unit of defenders) {
    const def = UNIT_DEFS[unit.type] || { defense: 2 };
    for (let i = 0; i < (unit.quantity || 0); i++) {
      const face = takeDie(state, defScript, rng);
      defenseDice.push({ type: unit.type, face, hit: face <= def.defense });
      if (face <= def.defense) defenseHits += 1;
    }
  }

  state.rngCursor += 1;
  battle.attackDice = attackDice;
  battle.defenseDice = defenseDice;
  battle.attackHits = attackHits;
  battle.defenseHits = defenseHits;
  const attMenu = lossMenu(dest, 'Russians', defenseHits);
  const defMenu = lossMenu(dest, 'Germans', attackHits);
  battle.pendingAtt = attMenu.forced ? cheapestLosses(dest, 'Russians', defenseHits) : {};
  // Solo preview: THEY start on cheapest so the row is live, not an empty blocker.
  battle.pendingDef = cheapestLosses(dest, 'Germans', attackHits);
  battle.attForced = attMenu.forced;
  battle.defForced = defMenu.forced;
  battle.step = BATTLE_STEP.COMBAT_RESULT;
  battle.log.push(`R${battle.round} ATK ${attackHits} · DEF ${defenseHits}`);
  return state;
}

function applyHits(state) {
  const battle = state.battle;
  let dest = state.placements[state.dest] || [];
  const attMenu = lossMenu(dest, 'Russians', battle.defenseHits);
  const defMenu = lossMenu(dest, 'Germans', battle.attackHits);
  if (assignedCount(battle.pendingAtt) !== attMenu.need) {
    battle.pendingAtt = cheapestLosses(dest, 'Russians', battle.defenseHits);
  }
  if (assignedCount(battle.pendingDef) !== defMenu.need) {
    battle.pendingDef = cheapestLosses(dest, 'Germans', battle.attackHits);
  }
  dest = applyLosses(dest, 'Russians', battle.pendingAtt);
  dest = applyLosses(dest, 'Germans', battle.pendingDef);
  state.placements[state.dest] = dest;
  const defendersLeft = totalQty(combatUnits(dest, 'Germans'));
  const attackersLeft = totalQty(combatUnits(dest, 'Russians'));
  battle.pendingAtt = {};
  battle.pendingDef = {};
  if (defendersLeft <= 0 && attackersLeft > 0) {
    state.owners[state.dest] = 'Russians';
    dest = removeQty(dest, 'aaGun', 'Germans', 99);
    state.placements[state.dest] = dest;
    battle.step = BATTLE_STEP.WON;
    battle.log.push(`Attacker takes ${state.dest}`);
    return state;
  }
  if (attackersLeft <= 0) {
    battle.step = BATTLE_STEP.WON;
    battle.failed = true;
    battle.log.push('Attack failed');
    return state;
  }
  battle.step = BATTLE_STEP.COMBAT_READY;
  return state;
}

function airRoster(stacks, owner) {
  const out = {};
  for (const type of COMBAT_ORDER) {
    if (!UNIT_DEFS[type]?.isAir) continue;
    const n = stackQty(stacks, type, owner);
    if (n > 0) out[type] = n;
  }
  return out;
}

function startAirLand(state) {
  const dest = state.placements[state.dest] || [];
  const air = airRoster(dest, 'Russians');
  const planes = Object.values(air).reduce((n, q) => n + q, 0);
  if (planes <= 0 || state.battle?.failed) {
    state.phase = PHASE.DONE;
    state.landingDest = null;
    state.selected = state.dest;
    return state;
  }
  state.phase = PHASE.AIR_LAND;
  state.landingDest = null;
  state.landingPick = {};
  state.airLeft = { ...air };
  state.landed = false;
  state.destPicked = null;
  state.selectedUnits = { ...air };
  state.selected = state.dest;
  return state;
}

function applyLanding(state) {
  if (!state.landingDest || !pickedCount(state.landingPick)) return state;
  let from = state.placements[state.dest] || [];
  let destStacks = state.placements[state.landingDest] || [];
  for (const [type, qty] of Object.entries(state.landingPick || {})) {
    const n = Math.min(Number(qty) || 0, Number(state.airLeft?.[type]) || 0);
    if (n <= 0) continue;
    from = removeQty(from, type, 'Russians', n);
    destStacks = addQty(destStacks, type, 'Russians', n);
    state.airLeft[type] = Math.max(0, (Number(state.airLeft[type]) || 0) - n);
    if (state.airLeft[type] <= 0) delete state.airLeft[type];
  }
  state.placements[state.dest] = from;
  state.placements[state.landingDest] = destStacks;
  state.landingPick = {};
  state.selectedUnits = { ...(state.airLeft || {}) };
  const left = remainingAirCount(state);
  if (left <= 0) {
    state.landed = true;
    state.phase = PHASE.DONE;
    state.selected = state.landingDest;
    state.selectedUnits = {};
    return state;
  }
  state.landed = false;
  state.selected = state.landingDest;
  return state;
}

export function resetScenario(state) {
  const seeded = state?.maxBattle ? seedMaxPlacements() : seedPlacements();
  const seededOwners = seedOwners();
  if (state?.placements) {
    for (const [name, stacks] of Object.entries(seeded)) {
      state.placements[name] = cloneStacks(stacks);
    }
  }
  if (state?.owners) Object.assign(state.owners, seededOwners);
  if (!state) return createScenario();
  state.phase = PHASE.COMBAT_MOVE;
  state.selected = null;
  state.selectedUnits = {};
  state.destPicked = null;
  state.landingDest = null;
  state.landingPick = {};
  state.airLeft = {};
  state.landed = false;
  state.guideOn = true;
  state.battle = null;
  state.rngCursor = 0;
  return state;
}

export function confirm(state) {
  if (!state || !confirmEnabled(state)) return state;
  if (state.phase === PHASE.COMBAT_MOVE) return applyCombatMove(state);
  if (state.phase === PHASE.BATTLE) {
    const step = state.battle?.step;
    if (step === BATTLE_STEP.AA_READY) return rollAA(state);
    if (step === BATTLE_STEP.AA_RESULT) {
      state.battle.step = BATTLE_STEP.COMBAT_READY;
      return state;
    }
    if (step === BATTLE_STEP.COMBAT_READY) return rollCombat(state);
    if (step === BATTLE_STEP.COMBAT_RESULT) return applyHits(state);
    if (step === BATTLE_STEP.WON) return startAirLand(state);
  }
  if (state.phase === PHASE.AIR_LAND) return applyLanding(state);
  if (state.phase === PHASE.DONE) return resetScenario(state);
  return state;
}

export function dismissGuide(state) {
  if (state) state.guideOn = false;
  return state;
}

export function battleCard(state) {
  const battle = state?.battle;
  if (!battle || state.phase !== PHASE.BATTLE) return null;
  const step = battle.step;
  if (step === BATTLE_STEP.AA_READY) {
    return {
      kicker: 'AA fire',
      title: state.dest,
      body: `${battle.aaGuns} gun vs ${battle.aaPlanes} aircraft · hit on 1`,
      dice: [],
    };
  }
  if (step === BATTLE_STEP.AA_RESULT) {
    return {
      kicker: 'AA results',
      title: battle.aaHits ? `Hit ×${battle.aaHits}` : 'Missed',
      body: battle.aaHits ? 'Cheapest aircraft removed' : 'Aircraft safe · next is combat',
      dice: battle.aaDice.map((face) => ({ face, hit: face === 1 })),
    };
  }
  if (step === BATTLE_STEP.COMBAT_READY) {
    return {
      kicker: battle.round ? `Round ${battle.round + 1}` : 'Combat',
      title: state.dest,
      body: 'Russians attack · Germans defend',
      dice: [],
    };
  }
  if (step === BATTLE_STEP.COMBAT_RESULT) {
    const dest = state.placements[state.dest] || [];
    const attMenu = lossMenu(dest, 'Russians', battle.defenseHits);
    const defMenu = lossMenu(dest, 'Germans', battle.attackHits);
    const youNeed = attMenu.need;
    const theyNeed = defMenu.need;
    return {
      kicker: `Round ${battle.round} · ${state.dest}`,
      title: `You ${battle.attackHits} hits · they ${battle.defenseHits} hit${battle.defenseHits === 1 ? '' : 's'}`,
      body: `You take ${youNeed} DEF hit${youNeed === 1 ? '' : 's'} · they take ${theyNeed} ATK hit${theyNeed === 1 ? '' : 's'}`,
      split: true,
      lanes: [
        {
          side: 'atk',
          label: 'You attack',
          hits: battle.attackHits,
          dice: battle.attackDice.map((d) => ({ ...d, side: 'atk' })),
        },
        {
          side: 'def',
          label: 'They defend',
          hits: battle.defenseHits,
          dice: battle.defenseDice.map((d) => ({ ...d, side: 'def' })),
        },
      ],
      dice: [
        ...battle.attackDice.map((d) => ({ ...d, side: 'atk' })),
        ...battle.defenseDice.map((d) => ({ ...d, side: 'def' })),
      ],
      pickers: [
        youNeed > 0 && !attMenu.forced ? {
          side: 'att',
          label: `You take ${youNeed} · their DEF hits`,
          need: youNeed,
          taken: { ...(battle.pendingAtt || {}) },
          units: attMenu.units,
        } : null,
        theyNeed > 0 ? {
          side: 'def',
          readOnly: true,
          label: `They take ${theyNeed} · ${formatLoss(battle.pendingDef)} · your ATK`,
          need: theyNeed,
          taken: { ...(battle.pendingDef || {}) },
          units: defMenu.units,
        } : null,
      ].filter(Boolean),
    };
  }
  if (step === BATTLE_STEP.WON) {
    return {
      kicker: battle.failed ? 'Held' : 'Taken',
      title: battle.failed ? 'Defender holds' : state.dest,
      body: battle.failed ? 'No landing — replay from Confirm' : 'Land aircraft next',
      dice: [],
    };
  }
  return null;
}

export function driveCombatMove(state) {
  tapLand(state, state.origin);
  const origin = state.placements[state.origin] || [];
  for (const s of origin) {
    if (s.type === 'factory' || s.type === 'aaGun') continue;
    if ((s.quantity || 0) > 0) pickUnit(state, s.type);
  }
  tapLand(state, state.dest);
  return state;
}

export function driveBattleMid(state) {
  driveCombatMove(state);
  confirm(state);
  confirm(state);
  confirm(state);
  confirm(state);
  return state;
}

function fillOptionalLosses(state) {
  let spins = 0;
  while (state.battle?.step === BATTLE_STEP.COMBAT_RESULT && !lossesReady(state) && spins++ < 48) {
    for (const type of COMBAT_ORDER) {
      pickLoss(state, 'att', type);
      pickLoss(state, 'def', type);
      if (lossesReady(state)) return;
    }
  }
}

export function driveAirChoice(state) {
  driveBattleMid(state);
  let guard = 0;
  while (state.phase === PHASE.BATTLE && guard++ < 40) {
    if (state.battle?.step === BATTLE_STEP.COMBAT_RESULT && !lossesReady(state)) {
      fillOptionalLosses(state);
    }
    confirm(state);
  }
  return state;
}

export function driveLanded(state, dest = 'Russia') {
  driveAirChoice(state);
  tapLand(state, dest);
  const pool = { ...(state.airLeft || state.selectedUnits || {}) };
  for (const [type, n] of Object.entries(pool)) {
    adjustLanding(state, type, Number(n) || 0);
  }
  confirm(state);
  return state;
}

export function inspectPlay(state) {
  const marks = highlights(state);
  return {
    scenario: state?.id || SCENARIO.id,
    maxBattle: !!state?.maxBattle,
    maxAttack: state?.maxBattle ? { ...MAX_ATTACK } : null,
    maxDefend: state?.maxBattle ? { ...MAX_DEFEND } : null,
    phase: state?.phase || null,
    selected: state?.selected || null,
    origin: state?.origin || null,
    dest: state?.destPicked || null,
    landingDest: state?.landingDest || null,
    landingPick: { ...(state?.landingPick || {}) },
    airLeft: { ...(state?.airLeft || {}) },
    landed: !!state?.landed,
    selectedUnits: { ...(state?.selectedUnits || {}) },
    airLandRoster: airLandRoster(state),
    confirmLabel: confirmLabel(state),
    confirmGold: confirmGold(state),
    confirmEnabled: confirmEnabled(state),
    youReady: lossesReady(state),
    guideOn: false,
    guide: guideCopy(state),
    legalDests: legalDests(state),
    lossesReady: lossesReady(state),
    pendingAtt: { ...(state?.battle?.pendingAtt || {}) },
    pendingDef: { ...(state?.battle?.pendingDef || {}) },
    battleStep: state?.battle?.step || null,
    aaHits: state?.battle?.aaHits ?? null,
    attackHits: state?.battle?.attackHits ?? null,
    defenseHits: state?.battle?.defenseHits ?? null,
    highlights: marks,
    karelia: cloneStacks(state?.placements?.[SCENARIO.origin]),
    finland: cloneStacks(state?.placements?.[SCENARIO.dest]),
    ukraine: cloneStacks(state?.placements?.['Ukraine S.S.R.']),
    russia: cloneStacks(state?.placements?.Russia),
    owners: { ...(state?.owners || {}) },
  };
}
