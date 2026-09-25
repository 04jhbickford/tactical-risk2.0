// V2.81.57-unified.13 — tracker on and off must roll the same dice.
// Land, naval, AA, bombard, sub first strike, rocket, and tech.
// Cosmetic spinning dice are not recorded.
// Run: node tools/test-dice-tracker-golden.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

function makeEl() {
  const classSet = new Set();
  const el = {
    id: '',
    className: '',
    innerHTML: '',
    style: {},
    children: [],
    classList: {
      add(...names) { names.forEach((n) => classSet.add(n)); el.className = [...classSet].join(' '); },
      remove(...names) { names.forEach((n) => classSet.delete(n)); el.className = [...classSet].join(' '); },
      contains(name) { return classSet.has(name); },
      toggle(name, force) {
        if (force === undefined) classSet.has(name) ? this.remove(name) : this.add(name);
        else if (force) this.add(name);
        else this.remove(name);
      },
    },
    appendChild(child) { this.children.push(child); return child; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    focus() {},
  };
  return el;
}

const documentElement = makeEl();
const body = makeEl();
globalThis.document = {
  documentElement,
  body,
  createElement() { return makeEl(); },
  getElementById() { return null; },
  addEventListener() {},
};
const store = new Map();
globalThis.localStorage = {
  getItem(k) { return store.has(k) ? store.get(k) : null; },
  setItem(k, v) { store.set(k, String(v)); },
  removeItem(k) { store.delete(k); },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState } = await import('../src/state/gameState.js');
const { SCHEMA_VERSION, GAME_VERSION } = await import('../src/version.js');
const { CombatUI } = await import('../src/ui/combatUI.js');
const { phoneMenuHomeActions } = await import('../src/ui/mobileShell.js');
const {
  flushDiceBuffer,
  localDiceGameId,
  observeRolledDie,
  peekDiceBuffer,
  setDiceSessionProvider,
  setDiceTrackerEnabled,
  setDiceWriter,
} = await import('../src/stats/diceTracker.js');
const { batchDocId } = await import('../src/stats/diceMath.js');
const { DICE_STATS_EMPTY, renderDiceStatsFromModel } = await import('../src/ui/diceStatsPanel.js');

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { cost: 3, attack: 1, defense: 2, isLand: true },
  fighter: { cost: 10, attack: 3, defense: 4, isAir: true },
  cruiser: { cost: 12, attack: 3, defense: 3, isSea: true },
  submarine: { cost: 6, attack: 2, defense: 1, isSea: true },
  destroyer: { cost: 8, attack: 2, defense: 2, isSea: true },
  aaGun: { cost: 5, attack: 0, defense: 0, isLand: true, antiAir: true },
  factory: { cost: 15, attack: 0, defense: 0, isBuilding: true },
};

const FACES = [0, 0, 0.99, 0.2, 0, 0.5, 0.83, 0.01];

function makeRng() {
  let i = 0;
  return () => FACES[i++ % FACES.length];
}

function makeGs() {
  const territories = [
    { name: 'LandA', isWater: false, connections: ['SeaA'], production: 2 },
    { name: 'SeaA', isWater: true, connections: ['LandA'] },
    { name: 'SeaB', isWater: true, connections: [] },
    { name: 'LandB', isWater: false, connections: ['LandC'], production: 2 },
    { name: 'LandC', isWater: false, connections: ['LandB'], production: 2 },
    { name: 'LandD', isWater: false, connections: ['SeaD'], production: 1 },
    { name: 'SeaD', isWater: true, connections: ['LandD'] },
    { name: 'SeaC', isWater: true, connections: [] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'p1', name: 'Robert', isAI: false, color: '#c00' },
    { id: 'p2', name: 'German Easy AI', isAI: true, color: '#060' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = 'playing';
  gs.turnPhase = 'combat';
  gs.round = 4;
  gs.playerState = {
    p1: { ipcs: 40, capitalTerritory: 'Home1' },
    p2: { ipcs: 30, capitalTerritory: 'Home2' },
  };
  gs.playerTechs = {
    p1: { techTokens: 0, unlockedTechs: [] },
    p2: { techTokens: 0, unlockedTechs: [] },
  };
  gs.territoryState = {};
  for (const t of territories) gs.territoryState[t.name] = { owner: 'p2', isCapital: false };
  gs.territoryState.LandB.owner = 'p1';
  gs.territoryState.SeaA.owner = 'p1';
  gs.territoryState.SeaD.owner = 'p1';
  return gs;
}

function snap(gs) {
  const units = {};
  for (const [name, list] of Object.entries(gs.units || {})) {
    units[name] = (list || []).map((u) => ({
      type: u.type,
      owner: u.owner,
      quantity: u.quantity,
      damaged: !!u.damaged,
    }));
  }
  return {
    units,
    ipc: { p1: gs.getIPCs('p1'), p2: gs.getIPCs('p2') },
    owners: Object.fromEntries(Object.entries(gs.territoryState).map(([k, v]) => [k, v.owner])),
    cards: gs.riskCards || {},
    rockets: { ...(gs.rocketsUsedThisTurn || {}) },
    techs: gs.playerTechs,
  };
}

function fight(gs, territory, rounds, log) {
  gs.combatQueue = [territory];
  for (let i = 0; i < rounds; i++) {
    const result = gs.resolveCombat(territory, unitDefs);
    log.push({
      territory,
      resolved: !!result?.resolved,
      winner: result?.winner || null,
      attackHits: result?.attackHits ?? null,
      defenseHits: result?.defenseHits ?? null,
      bombardmentHits: result?.bombardmentHits ?? null,
      attackersRemaining: result?.attackersRemaining ?? null,
      defendersRemaining: result?.defendersRemaining ?? null,
    });
    if (!result || result.resolved) break;
  }
}

function openUi(gs, territory) {
  gs.combatQueue = [territory];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui._render = () => {};
  ui.currentTerritory = territory;
  ui._initCombatState();
  return ui;
}

function runScript() {
  const calls = [];
  const real = Math.random;
  const rng = makeRng();
  Math.random = () => {
    const v = rng();
    calls.push(v);
    return v;
  };
  const results = [];
  try {
    const gs = makeGs();
    gs.units = {
      LandA: [
        { type: 'infantry', owner: 'p1', quantity: 2 },
        { type: 'infantry', owner: 'p2', quantity: 2 },
      ],
      SeaA: [{ type: 'cruiser', owner: 'p1', quantity: 1 }],
      SeaB: [
        { type: 'destroyer', owner: 'p1', quantity: 1 },
        { type: 'submarine', owner: 'p2', quantity: 1 },
      ],
    };
    fight(gs, 'LandA', 4, results);
    fight(gs, 'SeaB', 4, results);

    gs.units.LandD = [
      { type: 'infantry', owner: 'p1', quantity: 2 },
      { type: 'infantry', owner: 'p2', quantity: 2 },
    ];
    gs.units.SeaD = [{ type: 'cruiser', owner: 'p1', quantity: 1 }];
    gs.amphibiousTerritories.add('LandD');
    const bombard = openUi(gs, 'LandD');
    bombard._fireBombardment();
    results.push({
      bombardHits: bombard.combatState.bombardmentHits,
      bombardFaces: (bombard.combatState.bombardmentRolls || []).map((r) => r.roll),
    });

    gs.units.LandD = [
      { type: 'fighter', owner: 'p1', quantity: 2 },
      { type: 'aaGun', owner: 'p2', quantity: 1 },
      { type: 'infantry', owner: 'p2', quantity: 1 },
    ];
    const aa = openUi(gs, 'LandD');
    aa._rollAAFire();
    results.push({
      aaHits: aa.combatState.aaResults?.hits ?? null,
      aaFaces: (aa.combatState.aaResults?.rolls || []).map((r) => r.roll),
      aaLiving: (aa.combatState.attackers || []).reduce((s, u) => s + (u.quantity || 0), 0),
    });

    gs.units.SeaC = [
      { type: 'submarine', owner: 'p1', quantity: 2 },
      { type: 'submarine', owner: 'p2', quantity: 1 },
    ];
    const subs = openUi(gs, 'SeaC');
    subs._rollSubmarineFirstStrike();
    results.push({
      subFaces: (subs.combatState.subFirstStrikeRolls || []).map((r) => `${r.side}:${r.roll}`),
      subAttackerQty: (subs.combatState.attackers || []).find((u) => u.type === 'submarine')?.quantity ?? 0,
      subDefenderQty: (subs.combatState.defenders || []).find((u) => u.type === 'submarine')?.quantity ?? 0,
    });

    gs.turnPhase = 'combat_move';
    gs.playerTechs.p1.unlockedTechs = ['rockets'];
    gs.units.LandB = [{ type: 'aaGun', owner: 'p1', quantity: 1 }];
    gs.units.LandC = [{ type: 'factory', owner: 'p2', quantity: 1 }];
    const rocket = gs.launchRocket('LandB', 'LandC');
    results.push({ rocketOk: !!rocket.success, rocketDamage: rocket.damage ?? null, rocketActual: rocket.actualDamage ?? null });

    gs.purchaseTechDice('p1', 2);
    const tech = gs.rollTechDice('p1');
    results.push({ techRolls: tech.rolls.slice(), techSuccess: !!tech.success });

    const cosmetic = openUi(gs, 'LandA');
    cosmetic.combatState.attackers = [{ type: 'infantry', owner: 'p1', quantity: 2 }];
    cosmetic.combatState.defenders = [{ type: 'infantry', owner: 'p2', quantity: 1 }];
    const anim = makeEl();
    cosmetic.el.querySelector = (sel) => (sel === '.dice-animation' ? anim : null);
    const origRoll = gs._rollDie.bind(gs);
    let dieCalls = 0;
    gs._rollDie = (ctx) => {
      dieCalls += 1;
      return origRoll(ctx);
    };
    const before = peekDiceBuffer(gs).length;
    const callsBefore = calls.length;
    cosmetic._renderDiceAnimation();
    const cosmeticOk = dieCalls === 0 && calls.length > callsBefore && peekDiceBuffer(gs).length === before;
    gs._rollDie = origRoll;

    return { calls, results, snap: snap(gs), cosmeticOk };
  } finally {
    Math.random = real;
  }
}

console.log('=== identical outcomes, tracker on vs off ===');
setDiceSessionProvider(() => ({
  uid: 'uid-robert',
  signedIn: true,
  seatId: 'p1',
  displayName: 'Robert',
  gameId: 'GAME1',
}));
const payloads = [];
let writerSawReturn = true;
let returned = false;
setDiceWriter((payload) => {
  if (!returned) writerSawReturn = false;
  payloads.push(payload);
});
setDiceTrackerEnabled(true);
const on = runScript();
returned = true;
await new Promise((r) => setTimeout(r, 0));

let offWrites = 0;
setDiceWriter(() => { offWrites += 1; });
setDiceTrackerEnabled(false);
const off = runScript();
await new Promise((r) => setTimeout(r, 0));

check('same Math.random sequence', on.calls.length === off.calls.length && on.calls.every((v, i) => v === off.calls[i]));
check('same combat results', JSON.stringify(on.results) === JSON.stringify(off.results));
check('same IPC, owners, and units', JSON.stringify(on.snap) === JSON.stringify(off.snap));
check('cosmetic dice were not recorded', on.cosmeticOk && off.cosmeticOk);
check('writer ran after combat returned', writerSawReturn === true);
check('tracker on recorded batches', payloads.length > 0);
check('tracker off wrote nothing', offWrites === 0);

const contexts = new Set();
for (const payload of payloads) {
  for (const group of payload.groups) contexts.add(group.context);
}
check('recorded land/naval combat', contexts.has('combat'));
check('recorded bombard', contexts.has('bombard'));
check('recorded AA', contexts.has('aa'));
check('recorded sub first strike', contexts.has('sub'));
check('recorded rocket', contexts.has('rocket'));
check('recorded tech', contexts.has('tech'));

const allDice = payloads.flatMap((p) => p.groups.flatMap((g) => g.dice));
check('every recorded face is 1-6', allDice.every((d) => d.face >= 1 && d.face <= 6));
check('AA need is 1', payloads.some((p) => p.groups.some((g) => g.context === 'aa' && g.dice.every((d) => d.need === 1))));
check('tech need is 6', payloads.some((p) => p.groups.some((g) => g.context === 'tech' && g.dice.every((d) => d.need === 6))));
check('rocket need is empty', payloads.some((p) => p.groups.some((g) => g.context === 'rocket' && g.dice.every((d) => d.need == null))));
check('AI seat is marked on defender batches', payloads.some((p) => p.groups.some((g) => g.isAI && g.playerSeat === 'p2')));
check('batch ids are game_round_nonce_seq_uid', payloads.length > 0
  && payloads.every((p) => p.nonce && p.nonce === payloads[0].nonce)
  && payloads.every((p) => p.groups.every((g) => g.id === batchDocId({
    gameId: p.gameId, round: p.round, seq: g.seq, uid: 'uid-robert', nonce: p.nonce,
  }))));

console.log('=== reload nonce and local game id ===');
{
  const seen = [];
  setDiceSessionProvider(() => ({
    uid: 'uid-robert',
    signedIn: true,
    seatId: 'p1',
    displayName: 'Robert',
    gameId: 'solo',
  }));
  setDiceTrackerEnabled(true);
  setDiceWriter((payload) => { seen.push(payload); });
  const first = makeGs();
  const second = makeGs();
  observeRolledDie(first, { context: 'combat', side: 'attacker', unit: 'infantry', need: 1, playerSeat: 'p1' }, 3);
  observeRolledDie(second, { context: 'combat', side: 'attacker', unit: 'infantry', need: 1, playerSeat: 'p1' }, 4);
  flushDiceBuffer(first);
  flushDiceBuffer(second);
  await new Promise((r) => setTimeout(r, 0));
  check('a new game state gets a new batch nonce', seen.length === 2
    && seen[0].nonce && seen[0].nonce !== seen[1].nonce
    && seen[0].groups[0].id !== seen[1].groups[0].id);
  check('local games do not share diceStats/game_solo',
    seen[0].gameId !== 'solo' && seen[1].gameId !== 'solo' && seen[0].gameId !== seen[1].gameId
    && seen[0].gameId === localDiceGameId(first, 'uid-robert'));
  setDiceSessionProvider(() => ({
    uid: 'uid-robert',
    signedIn: true,
    seatId: 'p1',
    displayName: 'Robert',
    gameId: 'GAME1',
  }));
}

console.log('=== a throwing writer does not change the roll ===');
{
  function oneBattle(enabled) {
    const calls = [];
    const rng = makeRng();
    const real = Math.random;
    Math.random = () => {
      const v = rng();
      calls.push(v);
      return v;
    };
    setDiceTrackerEnabled(enabled);
    const gs = makeGs();
    gs.units.LandA = [
      { type: 'infantry', owner: 'p1', quantity: 2 },
      { type: 'infantry', owner: 'p2', quantity: 1 },
    ];
    gs.units.SeaA = [{ type: 'cruiser', owner: 'p1', quantity: 1 }];
    let thrown = false;
    let result = null;
    try {
      result = gs.resolveCombat('LandA', unitDefs);
    } catch {
      thrown = true;
    }
    const picture = snap(gs);
    Math.random = real;
    return { calls, thrown, result, picture };
  }
  setDiceWriter(() => { throw new Error('permission-denied'); });
  const boom = oneBattle(true);
  const quiet = oneBattle(false);
  await new Promise((r) => setTimeout(r, 0));
  check('permission-denied writer does not throw into combat', boom.thrown === false && quiet.thrown === false);
  check('throwing writer matches tracker-off casualties', JSON.stringify(boom.picture) === JSON.stringify(quiet.picture)
    && boom.calls.length === quiet.calls.length
    && boom.calls.every((v, i) => v === quiet.calls[i])
    && boom.result?.attackHits === quiet.result?.attackHits
    && boom.result?.defenseHits === quiet.result?.defenseHits);
}

console.log('=== old saves and menu ===');
{
  const gs = makeGs();
  const saved = gs.toJSON();
  check('schema stays 11', saved.version === 11 && SCHEMA_VERSION === 11);
  check('dice buffer is not in the save', saved._diceBuffer == null && saved.diceBatches == null && saved.rollLog == null);
  const loaded = makeGs();
  loaded.loadFromJSON(saved);
  check('old save loads', loaded.round === gs.round && loaded.players.length === 2);
  check('stamp is unified.13', GAME_VERSION === 'V2.81.57-unified.13');
  const menu = phoneMenuHomeActions();
  const logAt = menu.findIndex((row) => row.tab === 'log');
  const diceAt = menu.findIndex((row) => row.label === 'Dice stats' && row.tab === 'dice');
  check('phone Dice stats row follows Log', logAt >= 0 && diceAt === logAt + 1);
  const hud = readFileSync(join(root, 'src/ui/hud.js'), 'utf8');
  check('desktop menu has Dice stats', hud.includes('Dice stats') && hud.includes('data-action="dice-stats"'));
  const between = (src, startMark, endMark) => {
    const start = src.indexOf(startMark);
    const end = src.indexOf(endMark, start + startMark.length);
    return start >= 0 && end > start ? src.slice(start, end) : '';
  };
  const combatSrc = readFileSync(join(root, 'src/ui/combatUI.js'), 'utf8');
  const anim = between(combatSrc, '_renderDiceAnimation() {', '_autoSelectCasualties() {');
  check('spinning dice do not call _rollDie', anim.includes('Math.random') && !anim.includes('_rollDie') && !anim.includes('_rollD6'));
  const bombardFn = between(combatSrc, '_fireBombardment() {', '_applyBombardmentCasualties() {');
  check('bombardment rolls through _rollD6', bombardFn.includes('_rollD6') && !bombardFn.includes('Math.random'));
  const subFn = between(combatSrc, '_rollSubmarineFirstStrike() {', '_removeSubmergedSubs(side, count) {');
  check('sub first strike rolls through _rollD6', subFn.includes("context: 'sub'") && !subFn.includes('Math.random'));
  const rocketSrc = readFileSync(join(root, 'src/state/gameState.js'), 'utf8');
  const rocketFn = between(rocketSrc, 'launchRocket(fromTerritory, targetTerritory) {', 'relocateAirFromCapturedLand(unitDefs');
  check('rocket damage rolls through _rollDie', rocketFn.includes("context: 'rocket'") && !rocketFn.includes('Math.floor(Math.random()'));
  const emptyHtml = renderDiceStatsFromModel({ status: 'disabled', signedIn: false, tab: 'players' });
  check('panel empty state', emptyHtml.includes(DICE_STATS_EMPTY));
  check('Players tab is hidden until signed in', !emptyHtml.includes('data-dice-tab="players"'));
  const fairHtml = renderDiceStatsFromModel({
    status: 'ready',
    signedIn: true,
    tab: 'all',
    globalDoc: {
      n: 600,
      face_1: 100, face_2: 100, face_3: 100, face_4: 100, face_5: 100, face_6: 100,
      longestStreak: 2,
    },
  });
  check('all-time fair verdict', fairHtml.includes('Looks fair') && fairHtml.includes('all-time verdict counts'));
  check('progress meter copy', fairHtml.includes('600 / 4,500 rolls to detect a 2-point skew'));
  const playersHtml = renderDiceStatsFromModel({
    status: 'ready',
    signedIn: true,
    tab: 'players',
    gameDoc: {
      n: 6,
      name_p1: 'Robert',
      seat_p1_atk_dice: 6,
      seat_p1_atk_hits: 2,
      seat_p1_atk_sumP: 1,
      seat_p1_atk_sumVar: 0.8,
      name_p2: 'German Easy AI',
      seat_p2_ai: true,
      seat_p2_def_dice: 6,
      seat_p2_def_hits: 2,
      seat_p2_def_sumP: 2,
      seat_p2_def_sumVar: 1,
    },
  });
  check('players tab uses in-game names', playersHtml.includes('Robert') && playersHtml.includes('German Easy AI') && playersHtml.includes('AI'));
  check('players tab does not show a uid or email', !playersHtml.includes('uid') && !playersHtml.includes('@'));
}

setDiceTrackerEnabled(true);
setDiceWriter(null);

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall dice tracker golden checks passed');
