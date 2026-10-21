// AA fires once at the start of a battle, then again on the next battle
// in the same territory. A leftover round count must not silence it.
// Run: node tools/test-aa-once.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
        return classSet.has(name);
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

globalThis.localStorage ??= {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};
globalThis.document ??= {
  documentElement: makeEl(),
  body: makeEl(),
  createElement: makeEl,
  getElementById() { return null; },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { normalizeGameOptions } = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra));
  } else console.log('ok  :', label);
};

function board(techSet = 'classic') {
  const gs = new GameState(
    { risk: { factions: [] } },
    [
      { name: 'Persia', isWater: false, connections: ['Germany'] },
      { name: 'Germany', isWater: false, connections: ['Persia'] },
      { name: 'North Sea', isWater: true, connections: ['Germany'] },
    ],
    [],
  );
  gs.players = [
    { id: 'Germans', name: 'Germany', alliance: 'Axis' },
    { id: 'British', name: 'UK', alliance: 'Allies' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.territoryState = {
    Persia: { owner: 'British' },
    Germany: { owner: 'Germans' },
    'North Sea': { owner: null },
  };
  gs.playerState = {
    Germans: { ipcs: 40, capitalTerritory: 'Germany' },
    British: { ipcs: 40, capitalTerritory: 'France' },
  };
  gs.playerTechs = {
    Germans: { techTokens: 0, unlockedTechs: [] },
    British: { techTokens: 0, unlockedTechs: [] },
  };
  gs.gameOptions = normalizeGameOptions(techSet === 'expanded' ? { techSet: 'expanded' } : null);
  gs._notify = () => {};
  return gs;
}

function qty(gs, territory, type, owner) {
  return (gs.units[territory] || [])
    .filter((unit) => unit.type === type && unit.owner === owner)
    .reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
}

console.log('=== AA once per battle, including a later attack ===');
{
  const gs = board('classic');
  const shots = [];
  gs._rollDie = (ctx) => {
    if (ctx?.context === 'aa') shots.push(ctx);
    return ctx?.context === 'aa' ? 1 : 6;
  };
  gs._combatRoundsTracker = { Persia: 4 };
  for (let attack = 1; attack <= 5; attack += 1) {
    gs.units = {
      Persia: [
        { type: 'bomber', quantity: 1, owner: 'Germans' },
        { type: 'aaGun', quantity: 1, owner: 'British' },
      ],
    };
    gs.combatQueue = ['Persia'];
    const before = shots.length;
    const result = gs.resolveCombat('Persia', unitDefs);
    const shot = shots.slice(before);
    check(`Persia attack ${attack} fires one classic AA die`,
      shot.length === 1 && shot[0].need === 1 && shot[0].unit === 'aaGun' && result?.resolved === true);
    check(`Persia attack ${attack} removes the bomber and keeps the gun`,
      qty(gs, 'Persia', 'bomber', 'Germans') === 0 && qty(gs, 'Persia', 'aaGun', 'British') === 1);
  }
  check('schema field on the save stays 11', gs.toJSON().version === 11);
}

console.log('=== a later round of the same battle does not fire again ===');
{
  const gs = board('classic');
  const shots = [];
  gs._rollDie = (ctx) => {
    if (ctx?.context === 'aa') shots.push(ctx);
    return 6;
  };
  gs.units = {
    Persia: [
      { type: 'infantry', quantity: 2, owner: 'Germans' },
      { type: 'fighter', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
      { type: 'infantry', quantity: 2, owner: 'British' },
    ],
  };
  gs.combatQueue = ['Persia'];
  const first = gs.resolveCombat('Persia', unitDefs);
  const second = gs.resolveCombat('Persia', unitDefs);
  check('opening round fires once and the next round does not',
    shots.length === 1
    && shots[0].need === 1
    && first?.resolved !== true
    && second?.resolved !== true
    && qty(gs, 'Persia', 'fighter', 'Germans') === 1
    && qty(gs, 'Persia', 'aaGun', 'British') === 1);
}

console.log('=== Wasserfall hits on 2, cheapest aircraft, factory AA separate ===');
{
  const guided = board('expanded');
  guided.playerTechs.British.unlockedTechs = ['wasserfall'];
  const shots = [];
  guided._rollDie = (ctx) => {
    if (ctx?.context !== 'aa') return 6;
    shots.push(ctx);
    return shots.length === 1 ? 2 : 6;
  };
  guided.units = {
    Persia: [
      { type: 'fighter', quantity: 1, owner: 'Germans' },
      { type: 'bomber', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
      { type: 'infantry', quantity: 1, owner: 'British' },
    ],
  };
  guided.resolveCombat('Persia', unitDefs);
  check('Wasserfall fires once per aircraft and removes the cheaper fighter',
    shots.length === 2
    && shots.every((ctx) => ctx.need === 2)
    && qty(guided, 'Persia', 'fighter', 'Germans') === 0
    && qty(guided, 'Persia', 'bomber', 'Germans') === 1);

  const raid = board('classic');
  const factoryDice = [];
  raid._rollDie = (ctx) => {
    factoryDice.push(ctx);
    return 6;
  };
  raid.units = {
    Persia: [
      { type: 'bomber', quantity: 1, owner: 'Germans', raid: true },
      { type: 'factory', quantity: 1, owner: 'British' },
    ],
  };
  raid.resolveStrategicRaid('Persia', unitDefs);
  const factoryAa = () => factoryDice.filter((ctx) => ctx?.context === 'aa');
  check('factory AA is still one factory die and does not use the combat gun',
    factoryAa().length === 1
    && factoryAa()[0].unit === 'factory'
    && qty(raid, 'Persia', 'bomber', 'Germans') === 1);
  raid._rollDie = (ctx) => {
    factoryDice.push(ctx);
    return 1;
  };
  for (const stack of raid.units.Persia || []) {
    if (stack.type === 'bomber') stack.raid = true;
  }
  const before = factoryAa().length;
  raid.resolveStrategicRaid('Persia', unitDefs);
  const added = factoryAa().slice(before);
  check('factory AA still removes a bomber on a 1',
    added.length === 1
    && added[0].unit === 'factory'
    && qty(raid, 'Persia', 'bomber', 'Germans') === 0);
}

console.log('=== manual combat opens AA once per battle ===');
{
  const gs = board('classic');
  const ui = new CombatUI();
  ui._render = () => {};
  ui._logAAFireResults = () => {};
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.setActionLog({ log() {} });
  const dice = [];
  gs._rollDie = (ctx) => {
    dice.push(ctx);
    return 6;
  };
  for (let battle = 1; battle <= 5; battle += 1) {
    gs.units = {
      Persia: [
        { type: 'bomber', quantity: 1, owner: 'Germans' },
        { type: 'aaGun', quantity: 1, owner: 'British' },
      ],
    };
    ui.currentTerritory = 'Persia';
    ui._initCombatState();
    check(`manual battle ${battle} opens on AA and has not fired yet`,
      ui.combatState.phase === 'aaFire' && ui.combatState.aaFired === false && ui.combatState.hasAA === true);
  }
  ui._rollAAFire();
  const rolled = dice.filter((ctx) => ctx?.context === 'aa').length;
  ui._rollAAFire();
  check('a second manual AA roll in the same battle does nothing',
    ui.combatState.aaFired === true
    && dice.filter((ctx) => ctx?.context === 'aa').length === rolled
    && rolled === 1);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall passed');
