// V2.81.57-unified.20.1 — A1: seeded auto battles do not score extra hits.
// Per step: dice <= eligible units (heavy bombers count as 2), hits <= dice,
// and every removed piece was a real unit on the board.
// Run: node tools/test-auto-battle-hits.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.localStorage ??= {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

function makeEl() {
  const classSet = new Set();
  const el = {
    id: '',
    className: '',
    innerHTML: '',
    style: {},
    children: [],
    classList: {
      add(...names) {
        names.forEach((n) => classSet.add(n));
        el.className = [...classSet].join(' ');
      },
      remove(...names) {
        names.forEach((n) => classSet.delete(n));
        el.className = [...classSet].join(' ');
      },
      contains(name) { return classSet.has(name); },
      toggle(name, force) {
        if (force === undefined) {
          if (classSet.has(name)) this.remove(name);
          else this.add(name);
        } else if (force) this.add(name);
        else this.remove(name);
      },
    },
    appendChild(child) { this.children.push(child); return child; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
  };
  return el;
}

const documentElement = makeEl();
globalThis.document ??= {
  documentElement,
  body: makeEl(),
  createElement: makeEl,
  getElementById() { return null; },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra));
  } else console.log('ok  :', label);
};

check('stamp is unified.20.1', GAME_VERSION === 'V2.81.57-unified.20.1');
check('schema stays 11', SCHEMA_VERSION === 11);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function faceFrom(rng) {
  return 1 + Math.floor(rng() * 6);
}

function cloneUnits(units) {
  return (units || []).map((unit) => ({
    ...unit,
    aircraft: unit.aircraft ? unit.aircraft.map((item) => ({ ...item })) : undefined,
    cargo: unit.cargo ? unit.cargo.map((item) => ({ ...item })) : undefined,
  }));
}

function pieceMap(units) {
  const map = {};
  const add = (owner, type, n) => {
    const qty = Number(n) || 0;
    if (!owner || !type || qty <= 0) return;
    const key = `${owner}|${type}`;
    map[key] = (map[key] || 0) + qty;
  };
  for (const unit of units || []) {
    add(unit.owner, unit.type, unit.quantity);
    for (const craft of unit.aircraft || []) add(craft.owner || unit.owner, craft.type, craft.quantity || 1);
    for (const item of unit.cargo || []) add(item.owner || unit.owner, item.type, item.quantity || 1);
  }
  return map;
}

function typeTotals(map) {
  const out = {};
  for (const [key, qty] of Object.entries(map)) {
    const type = key.split('|')[1];
    out[type] = (out[type] || 0) + qty;
  }
  return out;
}

function totalsGrew(before, after) {
  const a = typeTotals(before);
  const b = typeTotals(after);
  for (const [type, qty] of Object.entries(b)) {
    if ((a[type] || 0) < qty) return { type, before: a[type] || 0, after: qty };
  }
  return null;
}

function negativeQuantity(units) {
  for (const unit of units || []) {
    if ((Number(unit.quantity) || 0) < 0) return unit;
  }
  return null;
}

function eligibleCombatDice(units, { attackerId, side, heavy, allies }) {
  let n = 0;
  for (const unit of units || []) {
    const qty = Number(unit.quantity) || 0;
    if (qty <= 0 || !unitDefs[unit.type]) continue;
    const mine = unit.owner === attackerId;
    const friendly = mine || allies(attackerId, unit.owner);
    if (side === 'attacker' && !mine) continue;
    if (side === 'defender' && friendly) continue;
    const per = (side === 'attacker' && unit.type === 'bomber' && heavy) ? 2 : 1;
    n += qty * per;
  }
  return n;
}

function countType(units, owner, type, side, attackerId, allies) {
  let n = 0;
  for (const unit of units || []) {
    const qty = Number(unit.quantity) || 0;
    if (qty <= 0 || unit.type !== type) continue;
    const mine = unit.owner === attackerId;
    const friendly = mine || allies(attackerId, unit.owner);
    if (side === 'attacker' && !mine) continue;
    if (side === 'defender' && friendly) continue;
    if (owner && unit.owner !== owner) continue;
    n += qty;
  }
  return n;
}

function makeState(seed) {
  const T = (name, isWater, connections) => ({ name, isWater, connections, ipc: isWater ? 0 : 3 });
  const gs = new GameState({ risk: { factions: [] } }, [
    T('Egypt', false, ['Red Sea', 'Libya']),
    T('Libya', false, ['Egypt']),
    T('Red Sea', true, ['Egypt']),
    T('North Atlantic', true, []),
  ], []);
  gs.players = [
    { id: 'Germans', name: 'Bastion' },
    { id: 'British', name: 'British Easy AI', isAI: true, aiDifficulty: 'easy' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.territoryState = {
    Egypt: { owner: 'British' },
    Libya: { owner: 'Germans' },
  };
  gs.playerState = {
    Germans: { ipcs: 20, capitalTerritory: 'Libya' },
    British: { ipcs: 20, capitalTerritory: 'Egypt' },
  };
  gs.playerTechs = {
    Germans: { techTokens: 0, unlockedTechs: [] },
    British: { techTokens: 0, unlockedTechs: [] },
  };
  gs._notify = () => {};
  gs._seed = seed;
  return gs;
}

// Stamp eligibility from the board at the moment the first die of a step is rolled.
function armDiceLive(gs, rng, territory) {
  const rounds = [];
  let current = null;
  const allies = (a, b) => gs.areAllies(a, b);
  gs._rollDie = (ctx) => {
    const face = faceFrom(rng);
    const context = typeof ctx === 'string' ? ctx : (ctx?.context || 'combat');
    const side = typeof ctx === 'object' && ctx ? (ctx.side || null) : null;
    const need = typeof ctx === 'object' && ctx ? Number(ctx.need) : NaN;
    if (!current || current.context !== context || current.side !== side) {
      const heavy = gs.hasTech(gs.currentPlayer.id, 'heavyBombers');
      const units = gs.units[territory] || [];
      let eligible = 0;
      if (context === 'combat') {
        eligible = eligibleCombatDice(units, {
          attackerId: gs.currentPlayer.id,
          side,
          heavy: side === 'attacker' && heavy,
          allies,
        });
      } else if (context === 'sub') {
        eligible = countType(units, null, 'submarine', side, gs.currentPlayer.id, allies);
      } else if (context === 'bombard') {
        for (const [zone, zoneUnits] of Object.entries(gs.units)) {
          if (zone === territory) continue;
          for (const unit of zoneUnits || []) {
            if (unit.owner !== gs.currentPlayer.id) continue;
            if (unit.type !== 'battleship' && unit.type !== 'cruiser') continue;
            eligible += Number(unit.quantity) || 0;
          }
        }
      }
      current = { context, side, dice: 0, hits: 0, eligible };
      rounds.push(current);
    }
    current.dice += 1;
    if (Number.isFinite(need) && face <= need) current.hits += 1;
    return face;
  };
  return rounds;
}

const SETUPS = [
  {
    name: 'land-infantry',
    territory: 'Egypt',
    water: false,
    units: [
      { owner: 'Germans', type: 'infantry', quantity: 6 },
      { owner: 'Germans', type: 'artillery', quantity: 2 },
      { owner: 'Germans', type: 'armour', quantity: 2 },
      { owner: 'British', type: 'infantry', quantity: 5 },
      { owner: 'British', type: 'artillery', quantity: 1 },
    ],
  },
  {
    name: 'land-aa-bombers',
    territory: 'Egypt',
    water: false,
    heavy: true,
    units: [
      { owner: 'Germans', type: 'bomber', quantity: 2 },
      { owner: 'Germans', type: 'fighter', quantity: 3 },
      { owner: 'Germans', type: 'infantry', quantity: 2 },
      { owner: 'British', type: 'aaGun', quantity: 2 },
      { owner: 'British', type: 'infantry', quantity: 4 },
      { owner: 'British', type: 'factory', quantity: 1 },
    ],
  },
  {
    name: 'land-bombard',
    territory: 'Egypt',
    water: false,
    units: [
      { owner: 'Germans', type: 'infantry', quantity: 3 },
      { owner: 'British', type: 'infantry', quantity: 4 },
    ],
    extra: {
      'Red Sea': [
        { owner: 'Germans', type: 'battleship', quantity: 1 },
        { owner: 'Germans', type: 'cruiser', quantity: 1 },
      ],
    },
  },
  {
    name: 'sea-mixed',
    territory: 'Red Sea',
    water: true,
    units: [
      {
        owner: 'Germans',
        type: 'carrier',
        quantity: 1,
        aircraft: [
          { owner: 'Germans', type: 'fighter', quantity: 1 },
          { owner: 'Germans', type: 'fighter', quantity: 1 },
        ],
      },
      { owner: 'Germans', type: 'battleship', quantity: 1 },
      { owner: 'Germans', type: 'submarine', quantity: 2 },
      { owner: 'Germans', type: 'destroyer', quantity: 1 },
      {
        owner: 'Germans',
        type: 'transport',
        quantity: 1,
        cargo: [{ owner: 'Germans', type: 'infantry', quantity: 1 }],
      },
      { owner: 'British', type: 'battleship', quantity: 1 },
      {
        owner: 'British',
        type: 'carrier',
        quantity: 1,
        aircraft: [{ owner: 'British', type: 'fighter', quantity: 1 }],
      },
      { owner: 'British', type: 'submarine', quantity: 1 },
      { owner: 'British', type: 'cruiser', quantity: 1 },
    ],
  },
  {
    name: 'sea-subs-no-destroyer',
    territory: 'North Atlantic',
    water: true,
    units: [
      { owner: 'Germans', type: 'submarine', quantity: 3 },
      { owner: 'Germans', type: 'cruiser', quantity: 1 },
      { owner: 'Germans', type: 'fighter', quantity: 1 },
      { owner: 'British', type: 'submarine', quantity: 2 },
      { owner: 'British', type: 'battleship', quantity: 1 },
      {
        owner: 'British',
        type: 'transport',
        quantity: 1,
        cargo: [
          { owner: 'British', type: 'infantry', quantity: 1 },
          { owner: 'British', type: 'armour', quantity: 1 },
        ],
      },
    ],
  },
  {
    name: 'sea-dead-stack',
    territory: 'Red Sea',
    water: true,
    units: [
      { owner: 'Germans', type: 'destroyer', quantity: 2 },
      { owner: 'Germans', type: 'submarine', quantity: 0 },
      { owner: 'Germans', type: 'battleship', quantity: 1, damaged: true, damagedCount: 1 },
      { owner: 'British', type: 'fighter', quantity: 2 },
      { owner: 'British', type: 'submarine', quantity: 1 },
    ],
  },
];

let battles = 0;
let roundsPlayed = 0;
let combinedSubOver = 0;

function playAiBattleLive(setup, seed) {
  const gs = makeState(seed);
  if (setup.heavy) gs.playerTechs.Germans.unlockedTechs.push('heavyBombers');
  gs.units = { [setup.territory]: cloneUnits(setup.units) };
  if (setup.extra) {
    for (const [zone, units] of Object.entries(setup.extra)) gs.units[zone] = cloneUnits(units);
  }
  gs.combatQueue = [setup.territory];
  const beforeAll = pieceMap(Object.values(gs.units).flat());
  let guard = 0;
  let result = null;
  while (guard++ < 24) {
    const before = pieceMap(Object.values(gs.units).flat());
    const rng = mulberry32((seed * 1000) + guard);
    const steps = armDiceLive(gs, rng, setup.territory);
    result = gs.resolveCombat(setup.territory, unitDefs);
    roundsPlayed += 1;
    for (const step of steps) {
      if (step.context === 'aa') continue;
      if (step.dice > step.eligible) {
        return { ok: false, why: 'dice-over-units', setup: setup.name, seed, round: guard, step };
      }
      if (step.hits > step.dice) {
        return { ok: false, why: 'hits-over-dice', setup: setup.name, seed, round: guard, step };
      }
    }
    const attackDice = steps
      .filter((s) => s.context === 'combat' && s.side === 'attacker')
      .reduce((sum, s) => sum + s.dice, 0);
    const bombardDice = steps
      .filter((s) => s.context === 'bombard')
      .reduce((sum, s) => sum + s.dice, 0);
    if (result && result.attackHits > attackDice) {
      return { ok: false, why: 'attack-hits-over-dice', setup: setup.name, seed, result, attackDice };
    }
    if (result && (result.bombardmentHits || 0) > bombardDice) {
      return { ok: false, why: 'bombard-hits', setup: setup.name, seed, result, bombardDice };
    }
    if (result && (result.attackHits + (result.bombardmentHits || 0)) > attackDice + bombardDice) {
      return { ok: false, why: 'aa-or-strike-added', setup: setup.name, seed, result, attackDice, bombardDice };
    }
    const subDice = steps
      .filter((s) => s.context === 'sub' && s.side === 'attacker')
      .reduce((sum, s) => sum + s.dice, 0);
    if (setup.name === 'sea-subs-no-destroyer' && guard === 1 && subDice > 0) {
      const combatAttackDice = attackDice;
      if (subDice + combatAttackDice > 4) combinedSubOver += 1;
    }
    const after = pieceMap(Object.values(gs.units).flat());
    const grew = totalsGrew(before, after);
    if (grew) return { ok: false, why: 'pieces-grew', setup: setup.name, seed, ...grew };
    for (const zoneUnits of Object.values(gs.units)) {
      const ghost = negativeQuantity(zoneUnits);
      if (ghost) return { ok: false, why: 'negative-quantity', setup: setup.name, seed, ghost };
    }
    for (const bag of [result?.attackerCasualties, result?.defenderCasualties]) {
      for (const row of bag || []) {
        if (!row?.type) return { ok: false, why: 'blank-casualty', setup: setup.name, seed, row };
        const known = Object.keys(before).some((key) => key.endsWith(`|${row.type}`));
        if (!known && row.destroyed) {
          return { ok: false, why: 'casualty-not-on-board', setup: setup.name, seed, row, before };
        }
      }
    }
    if (!result || result.resolved) break;
  }
  const grewAll = totalsGrew(beforeAll, pieceMap(Object.values(gs.units).flat()));
  if (grewAll) return { ok: false, why: 'battle-grew', setup: setup.name, seed, ...grewAll };
  battles += 1;
  return { ok: true };
}

const failuresSeen = [];
for (let seed = 1; seed <= 12; seed += 1) {
  for (const setup of SETUPS) {
    const outcome = playAiBattleLive(setup, seed);
    if (!outcome.ok) failuresSeen.push(outcome);
  }
}

check('seeded AI auto battles stay inside the dice cap', failuresSeen.length === 0, failuresSeen.slice(0, 3));
check('ran a spread of seeded battles', battles >= SETUPS.length * 12, battles);
check('those battles rolled more than one round', roundsPlayed > battles, { roundsPlayed, battles });

{
  const gs = makeState(7);
  gs.playerTechs.Germans.unlockedTechs = ['heavyBombers'];
  gs.units = {
    Egypt: cloneUnits(SETUPS[1].units),
  };
  gs.combatQueue = ['Egypt'];
  const steps = armDiceLive(gs, mulberry32(99), 'Egypt');
  gs._rollDie = (ctx) => {
    const face = 1;
    const context = ctx?.context || 'combat';
    const side = ctx?.side || null;
    if (!steps.length || steps[steps.length - 1].context !== context || steps[steps.length - 1].side !== side) {
      const heavy = true;
      const eligible = context === 'combat'
        ? eligibleCombatDice(gs.units.Egypt, {
          attackerId: 'Germans',
          side,
          heavy: side === 'attacker' && heavy,
          allies: () => false,
        })
        : 0;
      steps.push({ context, side, dice: 0, hits: 0, eligible });
    }
    const step = steps[steps.length - 1];
    step.dice += 1;
    if (face <= Number(ctx?.need)) step.hits += 1;
    return face;
  };
  const result = gs.resolveCombat('Egypt', unitDefs);
  const attack = steps.filter((s) => s.context === 'combat' && s.side === 'attacker');
  check('AI heavy bombers still roll one die each (cap allows two)',
    attack.length === 1 && attack[0].dice === 2 + 3 + 2 && attack[0].dice <= attack[0].eligible,
    attack);
  check('all-hit round still has hits <= dice',
    !!result && result.attackHits <= attack[0].dice, result && result.attackHits);
}

function humanUi(gs) {
  const ui = new CombatUI();
  ui._render = () => {};
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.setActionLog({ log() {} });
  return ui;
}

{
  const gs = makeState(3);
  gs.playerTechs.Germans.unlockedTechs = ['heavyBombers'];
  const ui = humanUi(gs);
  ui.currentTerritory = 'Egypt';
  ui.combatState = {
    attackers: [
      { type: 'bomber', quantity: 2, owner: 'Germans' },
      { type: 'infantry', quantity: 4, owner: 'Germans' },
    ],
    defenders: [
      { type: 'infantry', quantity: 3, owner: 'British' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
    ],
    phase: 'ready',
    totalAttackerLosses: {},
    totalDefenderLosses: {},
  };
  const steps = [];
  gs._rollDie = (ctx) => {
    const face = faceFrom(mulberry32(44));
    steps.push(ctx);
    return face;
  };
  let n = 0;
  gs._rollDie = (ctx) => {
    n += 1;
    const face = 1 + ((n * 3) % 6);
    steps.push({ ...ctx, face });
    return face;
  };
  const rolled = ui._rollDice();
  const attackDice = ui.lastRolls.attackRolls.length;
  const heavyCap = (2 * 2) + 4;
  check('human heavy-bomber step rolls two dice per bomber and no more',
    attackDice === heavyCap, attackDice);
  check('human attack hits do not exceed dice',
    rolled.attackHits <= attackDice && rolled.attackHits === ui.lastRolls.attackRolls.filter((r) => r.hit).length);
  check('human defense dice match living defenders, including the AA gun',
    ui.lastRolls.defenseRolls.length === 4);
  check('AA guns are not added onto the attack hit total',
    rolled.attackHits === ui.lastRolls.attackRolls.filter((r) => r.hit).length);
}

{
  const gs = makeState(4);
  const ui = humanUi(gs);
  ui.currentTerritory = 'North Atlantic';
  gs.units = { 'North Atlantic': [] };
  gs.territoryByName['North Atlantic'] = { name: 'North Atlantic', isWater: true, connections: [] };
  ui.combatState = {
    attackers: [
      { type: 'submarine', quantity: 2, owner: 'Germans' },
      { type: 'cruiser', quantity: 1, owner: 'Germans' },
    ],
    defenders: [
      { type: 'battleship', quantity: 1, owner: 'British' },
      { type: 'transport', quantity: 1, owner: 'British' },
    ],
    attackerSubsHaveFirstStrike: true,
    defenderSubsHaveFirstStrike: false,
    attackerSubmergedSubs: 0,
    defenderSubmergedSubs: 0,
    phase: 'submarineFirstStrike',
    totalAttackerLosses: {},
    totalDefenderLosses: {},
  };
  let n = 0;
  gs._rollDie = () => {
    n += 1;
    return n % 2 === 0 ? 1 : 6;
  };
  ui._rollSubmarineFirstStrike();
  const strikeDice = (ui.combatState.subFirstStrikeRolls || []).filter((r) => r.side === 'attacker').length;
  check('human surprise strike rolls one die per sub, not the cruiser', strikeDice === 2, strikeDice);
  ui.combatState.phase = 'ready';
  const rolled = ui._rollDice();
  const subCombat = ui.lastRolls.attackRolls.filter((r) => r.unitType === 'submarine').length;
  const allCombat = ui.lastRolls.attackRolls.length;
  check('surviving subs roll again in the general step, still within the living stack',
    subCombat <= 2 && allCombat <= 3, { subCombat, allCombat, attackers: ui.combatState.attackers });
  check('general-step hits do not exceed general-step dice',
    rolled.attackHits <= allCombat && rolled.defenseHits <= ui.lastRolls.defenseRolls.length);
  check('surprise-strike hits are not copied into the general hit total',
    rolled.attackHits === ui.lastRolls.attackRolls.filter((r) => r.hit).length);
}

{
  const gs = makeState(5);
  const ui = humanUi(gs);
  ui.currentTerritory = 'Egypt';
  gs.units = {
    Egypt: [
      { type: 'fighter', quantity: 3, owner: 'Germans' },
      { type: 'bomber', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
      { type: 'infantry', quantity: 2, owner: 'British' },
    ],
  };
  gs.territoryState.Egypt = { owner: 'British' };
  ui.combatState = {
    attackers: cloneUnits(gs.units.Egypt.filter((u) => u.owner === 'Germans')),
    defenders: cloneUnits(gs.units.Egypt.filter((u) => u.owner === 'British')),
    phase: 'aaFire',
    totalAttackerLosses: {},
    totalDefenderLosses: {},
    selectedAACasualties: {},
  };
  let n = 0;
  gs._rollDie = () => {
    n += 1;
    return 1;
  };
  ui._rollAAFire();
  const aa = ui.combatState.aaResults;
  check('AA rolls one die per attacking aircraft', aa.rolls.length === 4, aa);
  check('AA hits do not exceed AA dice', aa.hits <= aa.rolls.length && aa.hits === 4);
  const airLeft = ui.combatState.attackers
    .filter((u) => unitDefs[u.type]?.isAir)
    .reduce((sum, u) => sum + u.quantity, 0);
  check('AA casualties were real aircraft and did not go negative', airLeft === 0);
  ui.combatState.phase = 'ready';
  const after = ui._rollDice();
  check('later combat dice are not rolled for the aircraft AA already removed',
    ui.lastRolls.attackRolls.length === 0 && after.attackHits === 0, ui.lastRolls.attackRolls);
}

{
  const gs = makeState(6);
  gs.units = {
    'Red Sea': cloneUnits(SETUPS.find((s) => s.name === 'sea-mixed').units),
  };
  gs.combatQueue = ['Red Sea'];
  const fighterDice = [];
  gs._rollDie = (ctx) => {
    if (ctx?.unit === 'fighter' && ctx?.context === 'combat') fighterDice.push(ctx.side);
    return 6;
  };
  gs.resolveCombat('Red Sea', unitDefs);
  const attackFighters = fighterDice.filter((side) => side === 'attacker').length;
  const defenseFighters = fighterDice.filter((side) => side === 'defender').length;
  check('carrier aircraft roll once each, not twice',
    attackFighters === 2 && defenseFighters === 1, { attackFighters, defenseFighters });
}

{
  const gs = makeState(8);
  gs.units = {
    'Red Sea': [
      { type: 'battleship', quantity: 1, owner: 'Germans' },
      { type: 'destroyer', quantity: 1, owner: 'British' },
    ],
  };
  gs.combatQueue = ['Red Sea'];
  const bb = [];
  gs._rollDie = (ctx) => {
    if (ctx?.unit === 'battleship') bb.push(ctx.context);
    return 6;
  };
  gs.resolveCombat('Red Sea', unitDefs);
  check('a battleship rolls one die, not one per hit point', bb.length === 1, bb);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log(`\nauto-battle hit checks passed (${battles} battles, ${roundsPlayed} rounds, round-1 sub stacks that also fired in general combat: ${combinedSubOver})`);
