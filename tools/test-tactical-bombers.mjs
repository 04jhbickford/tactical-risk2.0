// V2.81.57-unified.24 — tactical bombers, carrier landing, end-of-NCM air check.
// Run: node tools/test-tactical-bombers.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { normalizeGameOptions, restoreProtectedGameOptions } =
  await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const {
  countPairing,
  TACTICAL_PAIR_LABEL,
} = await import(pathToFileURL(join(root, 'src/state/tacticalPairing.js')));
const {
  ncmAirWarningCopy,
  shouldPromptNcmAirWarning,
} = await import(pathToFileURL(join(root, 'src/state/ncmAirCheck.js')));
const { loadOneAirOntoCarrier } =
  await import(pathToFileURL(join(root, 'src/state/carrierPlacement.js')));
const { CombatUI, phoneCombatAttackerWinPercent } =
  await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const realRandom = Math.random;

const unitDefs = {
  infantry: { isLand: true, attack: 1, defense: 2, cost: 3, movement: 1 },
  armour: { isLand: true, attack: 3, defense: 3, cost: 6, movement: 2 },
  fighter: { isAir: true, attack: 3, defense: 4, cost: 10, movement: 4 },
  tacticalBomber: { isAir: true, attack: 3, defense: 3, cost: 11, movement: 4 },
  bomber: { isAir: true, attack: 4, defense: 1, cost: 12, movement: 6 },
  carrier: {
    isSea: true, attack: 1, defense: 2, cost: 14, movement: 2,
    aircraftCapacity: 2, canCarry: ['fighter', 'tacticalBomber'],
  },
};

function makePlayingState() {
  const territories = [
    { name: 'Eastern United States', isWater: false, connections: ['North Sea'] },
    { name: 'France', isWater: false, connections: [] },
    { name: 'North Sea', isWater: true, connections: ['Eastern United States'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'usa', name: 'Robert', oderId: 'robert' },
    { id: 'uk', name: 'Bastion', oderId: 'bastion', alliance: 'west' },
    { id: 'ger', name: 'German Easy AI', oderId: 'ger', isAI: true },
  ];
  gs.players[0].alliance = 'west';
  gs.alliancesEnabled = true;
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  gs.territoryState = {
    'Eastern United States': { owner: 'usa' },
    France: { owner: 'ger' },
    'North Sea': { owner: null },
  };
  gs.playerState = {
    usa: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'Eastern United States' },
    uk: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'Eastern United States' },
    ger: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'France' },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Eastern United States']);
  gs.combatQueue = [];
  gs.pendingPurchases = [];
  gs.unitDefs = unitDefs;
  gs._unitDefs = unitDefs;
  gs.units = {};
  return gs;
}

function withRandom(value, fn) {
  Math.random = () => value;
  try { return fn(); }
  finally { Math.random = realRandom; }
}

function withQueue(values, fn) {
  let i = 0;
  const used = [];
  Math.random = () => {
    const v = i < values.length ? values[i] : 0.99;
    i += 1;
    used.push(v);
    return v;
  };
  try { return { result: fn(), used, count: i }; }
  finally { Math.random = realRandom; }
}

function attackRoll(gs, units) {
  return gs._rollCombatWithRolls(units, 'attack', unitDefs);
}

console.log('=== stamps ===');
check('GAME_VERSION is V2.81.57-unified.24', GAME_VERSION === 'V2.81.57-unified.24');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== pairing ===');
{
  const one = countPairing([
    { type: 'tacticalBomber', quantity: 1 },
    { type: 'fighter', quantity: 1 },
  ]);
  check('pairing: 1 bomber with 1 fighter', one.paired === 1 && one.bombers === 1 && one.partners === 1);

  const tank = countPairing([
    { type: 'tacticalBomber', quantity: 2 },
    { type: 'armour', quantity: 1 },
  ]);
  check('pairing: 2 bombers with 1 tank', tank.paired === 1 && tank.partners === 1 && tank.bombers === 2);

  const alone = countPairing([
    { type: 'tacticalBomber', quantity: 2 },
  ]);
  check('pairing: bombers with no partner', alone.paired === 0 && alone.bombers === 2);

  const gs = makePlayingState();
  gs.gameOptions = normalizeGameOptions({ tacticalBombers: true });
  const pairedHit = withRandom(0.5, () => attackRoll(gs, [
    { type: 'tacticalBomber', quantity: 1, owner: 'usa' },
    { type: 'fighter', quantity: 1, owner: 'usa' },
  ]));
  check('pairing: a paired bomber hits on a 4 and the fighter does not',
    pairedHit.hits === 1
    && pairedHit.rolls[0].unit === 'tacticalBomber' && pairedHit.rolls[0].roll === 4 && pairedHit.rolls[0].hit === true
    && pairedHit.rolls[1].unit === 'fighter' && pairedHit.rolls[1].hit === false);

  const tankHit = withRandom(0.5, () => attackRoll(gs, [
    { type: 'tacticalBomber', quantity: 2, owner: 'usa' },
    { type: 'armour', quantity: 1, owner: 'usa' },
  ]));
  check('pairing: only one bomber takes the tank',
    tankHit.hits === 1
    && tankHit.rolls[0].hit === true
    && tankHit.rolls[1].unit === 'tacticalBomber' && tankHit.rolls[1].hit === false
    && tankHit.rolls[2].unit === 'armour' && tankHit.rolls[2].hit === false);

  const lonely = withRandom(0.5, () => attackRoll(gs, [
    { type: 'tacticalBomber', quantity: 2, owner: 'usa' },
  ]));
  check('pairing: unpaired bombers stay at 3', lonely.hits === 0 && lonely.rolls.every((r) => r.hit === false));

  const defending = withRandom(0.5, () => gs._rollCombatWithRolls([
    { type: 'tacticalBomber', quantity: 1, owner: 'ger' },
    { type: 'fighter', quantity: 1, owner: 'ger' },
  ], 'defense', unitDefs));
  check('pairing: defence stays 3',
    defending.rolls[0].unit === 'tacticalBomber'
    && defending.rolls[0].roll === 4
    && defending.rolls[0].hit === false);

  gs.units = {
    France: [
      { type: 'tacticalBomber', quantity: 2, owner: 'usa' },
      { type: 'fighter', quantity: 1, owner: 'usa' },
      { type: 'infantry', quantity: 1, owner: 'ger' },
    ],
  };
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.combatQueue = ['France'];
  const round1 = withQueue([0.99, 0.99, 0.99, 0], () => gs.resolveCombat('France', unitDefs));
  const afterPartner = (gs.units.France || []).filter((u) => u.owner === 'usa');
  const round2 = withQueue([0.5, 0.5, 0.99], () => gs.resolveCombat('France', unitDefs));
  check('pairing: re-pair after a partner dies',
    round1.count === 4
    && afterPartner.some((u) => u.type === 'fighter') === false
    && afterPartner.find((u) => u.type === 'tacticalBomber')?.quantity === 2
    && round2.result.attackHits === 0
    && round2.result.attackRolls.length === 2
    && round2.result.attackRolls.every((r) => r.roll === 4 && r.hit === false));

  const labelHtml = CombatUI.prototype._renderExpandedForces.call({
    lastRolls: null,
    combatState: { phase: 'ready' },
    unitDefs,
    gameState: gs,
  }, [
    { type: 'tacticalBomber', quantity: 2, owner: 'usa' },
    { type: 'fighter', quantity: 1, owner: 'usa' },
  ], [
    { type: 'infantry', quantity: 1, owner: 'ger' },
  ], { id: 'usa', color: '#224488' }, { id: 'ger', color: '#882222' });
  const phoneHtml = CombatUI.prototype._renderPhoneCombatSummary.call({
    combatState: {
      attackers: [
        { type: 'tacticalBomber', quantity: 2, owner: 'usa' },
        { type: 'fighter', quantity: 1, owner: 'usa' },
      ],
      defenders: [{ type: 'infantry', quantity: 1, owner: 'ger' }],
      phase: 'ready',
      winner: null,
    },
    currentTerritory: 'France',
    phoneCombatDetailSide: 'attacker',
    gameState: gs,
    _calculateProbability() { return 70; },
    _getTotalUnits(list) {
      return (list || []).reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
    },
  }, { id: 'usa', name: 'Robert', color: '#224488' }, { id: 'ger', name: 'Germany', color: '#882222' }, 'ready', null);
  check('pairing: combat list shows Tac bomber 4 (paired)',
    labelHtml.includes(TACTICAL_PAIR_LABEL) && labelHtml.includes('is-paired') && labelHtml.includes('A4')
    && phoneHtml.includes(TACTICAL_PAIR_LABEL));
}

console.log('=== carriers ===');
{
  function deck(aircraft = []) {
    const gs = makePlayingState();
    gs.units = {
      'Eastern United States': [
        { type: 'fighter', quantity: 3, owner: 'usa' },
        { type: 'tacticalBomber', quantity: 3, owner: 'usa' },
        { type: 'bomber', quantity: 1, owner: 'usa' },
      ],
      'North Sea': [
        { type: 'carrier', quantity: 1, owner: 'usa', id: 'carrier_1', aircraft: aircraft.map((row) => ({ ...row })) },
      ],
    };
    return gs;
  }
  function aboard(gs) {
    const carrier = (gs.units['North Sea'] || []).find((u) => u.type === 'carrier');
    return carrier?.aircraft || [];
  }
  function land(gs, type) {
    return gs.landOnCarrier('North Sea', 0, type, 'Eastern United States', unitDefs);
  }

  const twoFighters = deck();
  const f1 = land(twoFighters, 'fighter');
  const f2 = land(twoFighters, 'fighter');
  check('carrier: 2 fighters',
    f1.success === true && f2.success === true
    && aboard(twoFighters).filter((c) => c.type === 'fighter').length === 2);

  const mix = deck();
  const m1 = land(mix, 'fighter');
  const m2 = land(mix, 'tacticalBomber');
  check('carrier: 1 fighter with 1 tactical bomber',
    m1.success === true && m2.success === true
    && aboard(mix).map((c) => c.type).sort().join(',') === 'fighter,tacticalBomber');

  const twoTac = deck();
  const t1 = land(twoTac, 'tacticalBomber');
  const t2 = land(twoTac, 'tacticalBomber');
  check('carrier: 2 tactical bombers',
    t1.success === true && t2.success === true
    && aboard(twoTac).filter((c) => c.type === 'tacticalBomber').length === 2);

  const full = deck();
  land(full, 'fighter');
  land(full, 'fighter');
  const third = land(full, 'tacticalBomber');
  const mobilize = deck();
  const mob1 = loadOneAirOntoCarrier(mobilize, 'North Sea', 'fighter', 'usa', unitDefs);
  const mob2 = loadOneAirOntoCarrier(mobilize, 'North Sea', 'tacticalBomber', 'usa', unitDefs);
  const mob3 = loadOneAirOntoCarrier(mobilize, 'North Sea', 'fighter', 'usa', unitDefs);
  check('carrier: third air unit rejected',
    third.success === false
    && aboard(full).length === 2
    && mob1.success === true && mob2.success === true && mob3.success === false
    && aboard(mobilize).length === 2);

  const strategic = deck();
  const rejected = land(strategic, 'bomber');
  const mobBomber = loadOneAirOntoCarrier(deck(), 'North Sea', 'bomber', 'usa', unitDefs);
  check('carrier: strategic bomber rejected',
    rejected.success === false
    && aboard(strategic).length === 0
    && mobBomber.success === false);
}

console.log('=== end of non-combat move ===');
{
  function strandedSea(isAI) {
    const gs = makePlayingState();
    gs.currentPlayerIndex = 0;
    gs.players[0].isAI = isAI;
    gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
    gs.pendingPurchases = [{ type: 'infantry', quantity: 1, owner: 'usa', cost: 3 }];
    gs.units = {
      'Eastern United States': [{ type: 'fighter', quantity: 1, owner: 'usa' }],
      'North Sea': [{ type: 'fighter', quantity: 2, owner: 'usa' }],
      France: [{ type: 'tacticalBomber', quantity: 1, owner: 'usa' }],
    };
    return gs;
  }

  const human = strandedSea(false);
  const before = JSON.stringify(human.units);
  const preview = human.previewNcmAirDestruction(unitDefs);
  const copy = ncmAirWarningCopy(preview);
  check('warning: count matches stranded aircraft',
    copy.count === 3
    && copy.title === '3 aircraft will be destroyed for lack of a landing site'
    && copy.lines.includes('2x Fighter in North Sea')
    && copy.lines.includes('1x Tactical bomber in France')
    && JSON.stringify(human.units) === before
    && shouldPromptNcmAirWarning({ isAI: false, count: copy.count }) === true
    && shouldPromptNcmAirWarning({ isAI: true, count: copy.count }) === false
    && shouldPromptNcmAirWarning({ isAI: false, count: 0 }) === false);
  const logged = [];
  human.onNcmAirDestroyed = (rows) => logged.push(rows);
  human.nextPhase();
  const seaLeft = (human.units['North Sea'] || []).some((u) => u.type === 'fighter');
  const franceLeft = (human.units.France || []).some((u) => u.type === 'tacticalBomber');
  const home = (human.units['Eastern United States'] || []).find((u) => u.type === 'fighter');
  check('ncm: human air without a landing is destroyed',
    human.turnPhase === TURN_PHASES.MOBILIZE
    && seaLeft === false
    && franceLeft === false
    && home?.quantity === 1
    && logged.length === 1
    && (human.turnEvents || []).some((ev) => ev.type === 'air_destroyed')
    && human._destroyNcmAirWithoutLanding(unitDefs).length === 0);

  const ai = strandedSea(true);
  ai.nextPhase();
  check('ncm: AI air without a landing is destroyed',
    (ai.units['North Sea'] || []).some((u) => u.type === 'fighter') === false
    && (ai.units.France || []).some((u) => u.type === 'tacticalBomber') === false
    && (ai.units['Eastern United States'] || []).some((u) => u.type === 'fighter' && u.quantity === 1)
    && shouldPromptNcmAirWarning({ isAI: ai.currentPlayer?.isAI === true, count: 3 }) === false);

  const rescue = makePlayingState();
  rescue.turnPhase = TURN_PHASES.COMBAT;
  rescue.combatQueue = [];
  rescue.pendingPurchases = [{ type: 'infantry', quantity: 1, owner: 'usa', cost: 3 }];
  rescue.units = {
    'North Sea': [{ type: 'fighter', quantity: 1, owner: 'usa' }],
  };
  rescue.nextPhase();
  check('ncm: leaving combat still flies a loose fighter home',
    rescue.turnPhase === TURN_PHASES.NON_COMBAT_MOVE
    && (rescue.units['North Sea'] || []).some((u) => u.type === 'fighter') === false
    && (rescue.units['Eastern United States'] || []).some((u) => u.type === 'fighter'));

  const aboard = makePlayingState();
  aboard.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  aboard.pendingPurchases = [{ type: 'infantry', quantity: 1, owner: 'usa', cost: 3 }];
  aboard.units = {
    'North Sea': [{
      type: 'carrier', quantity: 1, owner: 'uk', id: 'carrier_uk',
      aircraft: [
        { type: 'fighter', owner: 'usa' },
        { type: 'tacticalBomber', owner: 'usa' },
      ],
    }],
  };
  const legal = aboard.previewNcmAirDestruction(unitDefs);
  check('ncm: air already on an allied carrier is legal', legal.length === 0);
}

console.log('=== option and old saves ===');
{
  const on = makePlayingState();
  on.turnPhase = TURN_PHASES.PURCHASE;
  on.gameOptions = normalizeGameOptions({ tacticalBombers: true });
  const bought = on.purchaseForMobilization('tacticalBomber', 1, unitDefs);
  const onRoll = withRandom(0.5, () => attackRoll(on, [
    { type: 'tacticalBomber', quantity: 1, owner: 'usa' },
    { type: 'fighter', quantity: 1, owner: 'usa' },
  ]));
  const oddsOn = phoneCombatAttackerWinPercent({
    attackers: [
      { type: 'tacticalBomber', quantity: 1 },
      { type: 'fighter', quantity: 1 },
    ],
    defenders: [{ type: 'infantry', quantity: 1 }],
    unitDefs,
    tacticalBombers: true,
  });
  const oddsOff = phoneCombatAttackerWinPercent({
    attackers: [
      { type: 'tacticalBomber', quantity: 1 },
      { type: 'fighter', quantity: 1 },
    ],
    defenders: [{ type: 'infantry', quantity: 1 }],
    unitDefs,
    tacticalBombers: false,
  });
  const oddsPlain = phoneCombatAttackerWinPercent({
    attackers: [{ type: 'fighter', quantity: 1 }],
    defenders: [{ type: 'infantry', quantity: 1 }],
    unitDefs,
    tacticalBombers: true,
  });
  const oddsPlainOff = phoneCombatAttackerWinPercent({
    attackers: [{ type: 'fighter', quantity: 1 }],
    defenders: [{ type: 'infantry', quantity: 1 }],
    unitDefs,
    tacticalBombers: false,
  });
  const fresh = makePlayingState();
  check('option: a fresh game defaults OFF',
    fresh.gameOptions.tacticalBombers === false
    && normalizeGameOptions(null).tacticalBombers === false
    && normalizeGameOptions({}).tacticalBombers === false
    && normalizeGameOptions({ startingIPCs: 80 }).tacticalBombers === false);
  check('option: ON shows tactical bombers and pairs',
    bought === true
    && on.pendingPurchases.some((p) => p.type === 'tacticalBomber')
    && onRoll.hits === 1
    && oddsOn > oddsOff
    && oddsPlain === oddsPlainOff);

  const off = makePlayingState();
  off.turnPhase = TURN_PHASES.PURCHASE;
  const ipcs = off.playerState.usa.ipcs;
  const refused = off.purchaseForMobilization('tacticalBomber', 1, unitDefs);
  const offRoll = withRandom(0.5, () => attackRoll(off, [
    { type: 'tacticalBomber', quantity: 1, owner: 'usa' },
    { type: 'fighter', quantity: 1, owner: 'usa' },
  ]));
  const panel = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  const ai = readFileSync(join(root, 'src/ai/aiController.js'), 'utf8');
  check('option: OFF hides purchase and does not pair',
    refused === false
    && off.playerState.usa.ipcs === ipcs
    && off.pendingPurchases.some((p) => p.type === 'tacticalBomber') === false
    && offRoll.hits === 0
    && panel.includes("type === 'tacticalBomber'")
    && ai.includes("unitType === 'tacticalBomber'"));

  const saved = makePlayingState();
  saved.units = {
    'North Sea': [{
      type: 'carrier', quantity: 1, owner: 'usa', id: 'carrier_1',
      aircraft: [
        { type: 'fighter', owner: 'usa' },
        { type: 'fighter', owner: 'usa' },
      ],
    }],
  };
  const data = saved.toJSON();
  delete data.gameOptions.tacticalBombers;
  const loaded = makePlayingState();
  loaded.loadFromJSON(data);
  const loadedCarrier = (loaded.units['North Sea'] || []).find((u) => u.type === 'carrier');
  check('save: missing option loads as OFF', loaded.gameOptions.tacticalBombers === false);
  check('save: existing carrier fighters still load',
    loadedCarrier?.aircraft?.filter((c) => c.type === 'fighter').length === 2);

  const bare = saved.toJSON();
  delete bare.gameOptions;
  const legacy = makePlayingState();
  legacy.loadFromJSON(bare);
  check('save: a legacy save without the field loads OFF', legacy.gameOptions.tacticalBombers === false);

  const explicitOn = makePlayingState();
  explicitOn.gameOptions = normalizeGameOptions({ tacticalBombers: true });
  const keptOn = makePlayingState();
  keptOn.loadFromJSON(explicitOn.toJSON());
  check('save: a save with the field ON stays ON', keptOn.gameOptions.tacticalBombers === true);

  const explicit = makePlayingState();
  explicit.gameOptions = normalizeGameOptions({ tacticalBombers: false });
  const roundTrip = makePlayingState();
  roundTrip.loadFromJSON(explicit.toJSON());
  check('save: explicit off survives save and load', roundTrip.gameOptions.tacticalBombers === false);

  const restored = restoreProtectedGameOptions(
    { gameOptions: { startingIPCs: 80 } },
    { tacticalBombers: false },
  );
  check('save: a dropped false is restored from the protected copy',
    restored.gameOptions.tacticalBombers === false);
}

console.log('=== dice sequence ===');
{
  function battle(options, attackers) {
    const gs = makePlayingState();
    gs.gameOptions = normalizeGameOptions(options);
    gs.turnPhase = TURN_PHASES.COMBAT;
    gs.combatQueue = ['France'];
    gs.units = {
      France: [
        ...attackers,
        { type: 'infantry', quantity: 1, owner: 'ger' },
      ],
    };
    let n = 0;
    const seq = [];
    Math.random = () => {
      const v = ((n * 37) % 97) / 97;
      n += 1;
      seq.push(v);
      return v;
    };
    let result;
    try { result = gs.resolveCombat('France', unitDefs); }
    finally { Math.random = realRandom; }
    return {
      n,
      seq,
      attack: (result.attackRolls || []).map((r) => ({ unit: r.unit, roll: r.roll, hit: r.hit })),
      defense: (result.defenseRolls || []).map((r) => r.roll),
    };
  }
  const infantry = [{ type: 'infantry', quantity: 2, owner: 'usa' }];
  const on = battle({ tacticalBombers: true }, infantry);
  const off = battle({ tacticalBombers: false }, infantry);
  check('dice: no tactical bombers matches with the option off',
    on.n === off.n
    && JSON.stringify(on.seq) === JSON.stringify(off.seq)
    && JSON.stringify(on.attack) === JSON.stringify(off.attack)
    && JSON.stringify(on.defense) === JSON.stringify(off.defense));

  const stack = [
    { type: 'tacticalBomber', quantity: 1, owner: 'usa' },
    { type: 'fighter', quantity: 1, owner: 'usa' },
  ];
  const paired = battle({ tacticalBombers: true }, stack);
  const unpaired = battle({ tacticalBombers: false }, stack);
  check('dice: option off uses the same rolls and does not add a die',
    paired.n === unpaired.n
    && paired.attack.length === 2
    && unpaired.attack.length === 2
    && JSON.stringify(paired.seq) === JSON.stringify(unpaired.seq)
    && unpaired.attack.every((r) => r.hit === (r.roll <= 3))
    && paired.attack[0].unit === 'tacticalBomber'
    && paired.attack[0].hit === (paired.attack[0].roll <= 4)
    && unpaired.attack[0].hit === (unpaired.attack[0].roll <= 3));

  function attackCalls(enabled) {
    const gs = makePlayingState();
    gs.gameOptions = normalizeGameOptions({ tacticalBombers: enabled });
    let n = 0;
    Math.random = () => { n += 1; return 0.5; };
    let rolled;
    try {
      rolled = gs._rollCombatWithRolls(stack, 'attack', unitDefs);
    } finally {
      Math.random = realRandom;
    }
    return { n, hits: rolled.hits };
  }
  const faceOn = attackCalls(true);
  const faceOff = attackCalls(false);
  check('dice: a face of 4 hits only when paired, with one roll per aircraft',
    faceOn.n === 2 && faceOff.n === 2 && faceOn.hits === 1 && faceOff.hits === 0);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll tactical bomber / air landing checks passed');
