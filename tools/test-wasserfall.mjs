// Expanded tech adds Wasserfall. AA guns then defend at 2.
// Classic, and Expanded without the tech, stay at 1.
// Run: node tools/test-wasserfall.mjs

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
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, TECHNOLOGIES, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { normalizeGameOptions } = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { aaGunDefendValue, defendingAaNeed, resolveTechInfo } = await import(pathToFileURL(join(root, 'src/state/radioDeception.js')));
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
      { name: 'France', isWater: false, connections: ['Germany'] },
      { name: 'Germany', isWater: false, connections: ['France'] },
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
    France: { owner: 'British' },
    Germany: { owner: 'Germans' },
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

function qty(gs, type, owner) {
  return (gs.units.France || [])
    .filter((unit) => unit.type === type && unit.owner === owner)
    .reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
}

console.log('=== stamp and catalog ===');
{
  check('display stamp is V2.81.57-unified.60', GAME_VERSION === 'V2.81.57-unified.60');
  check('schema stays 11', SCHEMA_VERSION === 11);
  const classicIds = Object.keys(TECHNOLOGIES);
  check('classic catalog has no Wasserfall', !classicIds.includes('wasserfall'));
  const classic = board('classic');
  check('classic research list is unchanged',
    JSON.stringify(classic.getAvailableTechs('British')) === JSON.stringify(classicIds));
  check('classic cannot unlock Wasserfall', classic.unlockTech('British', 'wasserfall') === false);
  const expanded = board('expanded');
  const ids = expanded.getAvailableTechs('British');
  check('expanded offers Wasserfall once, with the classic list',
    ids.includes('wasserfall')
    && ids.filter((id) => id === 'wasserfall').length === 1
    && classicIds.every((id) => ids.includes(id)));
  check('expanded can research it', expanded.unlockTech('British', 'wasserfall') === true);
  check('it is not offered twice', !expanded.getAvailableTechs('British').includes('wasserfall'));
  const buyer = board('classic');
  buyer.gameOptions = normalizeGameOptions({ techSet: 'classic', techAcquisition: 'buy' });
  buyer.turnPhase = TURN_PHASES.PURCHASE;
  check('buy mode on classic refuses it', buyer.buyTech('British', 'wasserfall') === false);
  buyer.gameOptions = normalizeGameOptions({ techSet: 'expanded', techAcquisition: 'buy' });
  check('buy mode on expanded sells it', buyer.buyTech('British', 'wasserfall') === true);
  const info = resolveTechInfo('wasserfall', TECHNOLOGIES, expanded.gameOptions);
  check('Develop Technology names Wasserfall',
    info?.name === 'Wasserfall'
    && info.description === 'AA guns become guided missile batteries and defend at 2.');
  check('classic does not describe Wasserfall',
    resolveTechInfo('wasserfall', TECHNOLOGIES, classic.gameOptions) == null);
}

console.log('=== defend value ===');
{
  const classic = board('classic');
  classic.playerTechs.British.unlockedTechs = ['wasserfall'];
  check('classic stays defend 1 even if the id is stored', aaGunDefendValue(classic, 'British') === 1);
  const quiet = board('expanded');
  check('expanded without the tech defends at 1', aaGunDefendValue(quiet, 'British') === 1);
  quiet.playerTechs.British.unlockedTechs = ['wasserfall'];
  check('expanded with Wasserfall defends at 2', aaGunDefendValue(quiet, 'British') === 2);
  check('another power without the tech stays at 1', aaGunDefendValue(quiet, 'Germans') === 1);
  check('the volley uses the best defending battery',
    defendingAaNeed(quiet, [
      { type: 'aaGun', owner: 'Germans', quantity: 1 },
      { type: 'aaGun', owner: 'British', quantity: 1 },
    ]) === 2);
  check('catalog attack and defense are unchanged',
    unitDefs.aaGun.attack === 0
    && unitDefs.aaGun.defense === 0
    && unitDefs.infantry.attack === 1
    && unitDefs.infantry.defense === 2
    && unitDefs.fighter.attack === 3);
}

function fight(techSet, unlocked, face) {
  const gs = board(techSet);
  if (unlocked) gs.playerTechs.British.unlockedTechs = ['wasserfall'];
  gs.units = {
    France: [
      { type: 'fighter', quantity: 1, owner: 'Germans' },
      { type: 'bomber', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
      { type: 'infantry', quantity: 1, owner: 'British' },
    ],
  };
  gs.combatQueue = ['France'];
  const seen = [];
  let aaLeft = 1;
  gs._rollDie = (ctx) => {
    seen.push(ctx);
    if (ctx?.context === 'aa') {
      const roll = aaLeft > 0 ? face : 6;
      aaLeft -= 1;
      return roll;
    }
    return 6;
  };
  const result = gs.resolveCombat('France', unitDefs);
  return { gs, seen, result };
}

console.log('=== auto-resolve AA ===');
{
  const plain = fight('expanded', false, 2);
  const plainAa = plain.seen.filter((ctx) => ctx?.context === 'aa');
  check('without Wasserfall, auto-resolve still fires one die per aircraft at 1',
    plainAa.length === 2 && plainAa.every((ctx) => ctx.need === 1 && ctx.unit === 'aaGun' && ctx.side === 'defender')
    && qty(plain.gs, 'fighter', 'Germans') === 1
    && qty(plain.gs, 'bomber', 'Germans') === 1);
  const classic = fight('classic', true, 2);
  const classicAa = classic.seen.filter((ctx) => ctx?.context === 'aa');
  check('classic auto-resolve ignores a stored Wasserfall id and still hits on 1',
    classicAa.length === 2 && classicAa.every((ctx) => ctx.need === 1)
    && qty(classic.gs, 'fighter', 'Germans') === 1);
  const hit = fight('expanded', true, 2);
  const aa = hit.seen.filter((ctx) => ctx?.context === 'aa');
  check('Wasserfall rolls one AA die per aircraft at need 2',
    aa.length === 2 && aa.every((ctx) => ctx.need === 2 && ctx.unit === 'aaGun' && ctx.side === 'defender'));
  check('a 2 removes the cheaper fighter and leaves the bomber',
    qty(hit.gs, 'fighter', 'Germans') === 0 && qty(hit.gs, 'bomber', 'Germans') === 1);
  check('the infantry and the gun are still there',
    qty(hit.gs, 'infantry', 'British') === 1 && qty(hit.gs, 'aaGun', 'British') === 1);
  const miss = fight('expanded', true, 3);
  const combat = miss.seen.filter((ctx) => ctx?.context === 'combat');
  check('a 3 misses Wasserfall and the aircraft stay',
    qty(miss.gs, 'fighter', 'Germans') === 1 && qty(miss.gs, 'bomber', 'Germans') === 1);
  check('other combat needs stay on the catalog',
    combat.some((ctx) => ctx.unit === 'fighter' && ctx.side === 'attacker' && ctx.need === 3)
    && combat.some((ctx) => ctx.unit === 'infantry' && ctx.side === 'defender' && ctx.need === 2)
    && combat.some((ctx) => ctx.unit === 'aaGun' && ctx.side === 'defender' && ctx.need === 0));

  const only = board('expanded');
  only.playerTechs.British.unlockedTechs = ['wasserfall'];
  only.units = {
    France: [
      { type: 'fighter', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
    ],
  };
  only.combatQueue = ['France'];
  only._rollDie = () => 2;
  const wiped = only.resolveCombat('France', unitDefs);
  check('an AA-only battery with Wasserfall shoots the aircraft down',
    wiped?.winner === 'defender'
    && wiped?.conquered !== true
    && qty(only, 'fighter', 'Germans') === 0
    && only.getOwner('France') === 'British');

  const classicOnly = board('classic');
  classicOnly.units = {
    France: [
      { type: 'fighter', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
    ],
  };
  classicOnly.combatQueue = ['France'];
  classicOnly._rollDie = () => 1;
  const classicWipe = classicOnly.resolveCombat('France', unitDefs);
  check('an AA-only battery on classic shoots the aircraft down',
    classicWipe?.winner === 'defender'
    && classicWipe?.aaHits === 1
    && qty(classicOnly, 'fighter', 'Germans') === 0
    && classicOnly.getOwner('France') === 'British');
}

console.log('=== AA still fires after several combat phases ===');
{
  const gs = board('classic');
  const aaShots = [];
  gs._rollDie = (ctx) => {
    if (ctx?.context === 'aa') {
      aaShots.push(ctx);
      return 1;
    }
    return 6;
  };
  for (let phase = 1; phase <= 6; phase += 1) {
    gs.currentPlayerIndex = 0;
    gs.turnPhase = TURN_PHASES.COMBAT;
    gs.territoryState.France.owner = 'British';
    gs.units = {
      France: [
        { type: 'fighter', quantity: 1, owner: 'Germans' },
        { type: 'aaGun', quantity: 1, owner: 'British' },
        { type: 'infantry', quantity: 1, owner: 'British' },
      ],
    };
    // A round count left from an earlier battle must not silence this one.
    gs._combatRoundsTracker = { France: 4 + phase };
    gs._detectCombats(unitDefs);
    const before = aaShots.length;
    let guard = 0;
    while (guard++ < 4 && gs.combatQueue.includes('France')) {
      const result = gs.resolveCombat('France', unitDefs);
      if (!result || result.resolved) break;
    }
    const shot = aaShots.slice(before);
    check(`combat phase ${phase} still fires one classic AA die`,
      shot.length === 1 && shot[0].need === 1 && shot[0].unit === 'aaGun' && shot[0].side === 'defender');
    check(`combat phase ${phase} still removes the fighter`,
      qty(gs, 'fighter', 'Germans') === 0 && qty(gs, 'aaGun', 'British') === 1);
  }

  const ongoing = board('classic');
  const seen = [];
  ongoing.units = {
    France: [
      { type: 'infantry', quantity: 2, owner: 'Germans' },
      { type: 'fighter', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
      { type: 'infantry', quantity: 2, owner: 'British' },
    ],
  };
  ongoing.combatQueue = ['France'];
  ongoing._rollDie = (ctx) => {
    seen.push(ctx);
    return ctx?.context === 'aa' ? 2 : 6;
  };
  const first = ongoing.resolveCombat('France', unitDefs);
  const afterFirst = seen.filter((ctx) => ctx?.context === 'aa');
  const second = ongoing.resolveCombat('France', unitDefs);
  const sameBattle = seen.filter((ctx) => ctx?.context === 'aa');
  check('the first round of a battle fires AA once',
    afterFirst.length === 1 && afterFirst[0].need === 1 && first?.resolved !== true);
  check('a later round of that same battle still fires AA',
    sameBattle.length === 2
    && sameBattle.every((ctx) => ctx.need === 1 && ctx.unit === 'aaGun' && ctx.side === 'defender')
    && second?.resolved !== true
    && qty(ongoing, 'fighter', 'Germans') === 1
    && qty(ongoing, 'aaGun', 'British') === 1);

  const guided = board('expanded');
  guided.playerTechs.British.unlockedTechs = ['wasserfall'];
  guided.currentPlayerIndex = 0;
  guided.turnPhase = TURN_PHASES.COMBAT;
  guided.units = {
    France: [
      { type: 'fighter', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
      { type: 'infantry', quantity: 1, owner: 'British' },
    ],
  };
  guided._combatRoundsTracker = { France: 9 };
  guided._detectCombats(unitDefs);
  const guidedSeen = [];
  guided._rollDie = (ctx) => {
    guidedSeen.push(ctx);
    return 2;
  };
  guided.resolveCombat('France', unitDefs);
  const guidedAa = guidedSeen.filter((ctx) => ctx?.context === 'aa');
  check('a later combat phase with Wasserfall still hits on 2',
    guidedAa.length === 1 && guidedAa[0].need === 2 && qty(guided, 'fighter', 'Germans') === 0);
}

console.log('=== human AA still opens after several battles ===');
{
  const gs = board('classic');
  const ui = new CombatUI();
  ui._render = () => {};
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.setActionLog({ log() {} });
  for (let battle = 1; battle <= 4; battle += 1) {
    gs.units = {
      France: [
        { type: 'fighter', quantity: 1, owner: 'Germans' },
        { type: 'aaGun', quantity: 1, owner: 'British' },
      ],
    };
    gs.combatQueue = ['France'];
    ui.currentTerritory = 'France';
    ui._initCombatState();
    check(`human battle ${battle} still opens on AA fire`,
      ui.combatState.phase === 'aaFire' && ui.combatState.hasAA === true && ui.combatState.aaFired === false);
    gs._rollDie = () => 1;
    ui._rollAAFire();
    check(`human battle ${battle} still hits on 1`,
      ui.combatState.aaResults?.need === 1 && ui.combatState.aaResults?.hits === 1
      && !ui.combatState.attackers.some((unit) => unit.type === 'fighter' && unit.quantity > 0));
  }
}

console.log('=== human AA fire ===');
{
  function human(techSet, unlocked, face) {
    const gs = board(techSet);
    if (unlocked) gs.playerTechs.British.unlockedTechs = ['wasserfall'];
    const ui = new CombatUI();
    ui._render = () => {};
    ui.setGameState(gs);
    ui.setUnitDefs(unitDefs);
    ui.setActionLog({ log() {} });
    ui.currentTerritory = 'France';
    gs.units = { France: [] };
    ui.combatState = {
      attackers: [
        { type: 'fighter', quantity: 1, owner: 'Germans' },
        { type: 'infantry', quantity: 1, owner: 'Germans' },
      ],
      defenders: [
        { type: 'aaGun', quantity: 1, owner: 'British' },
        { type: 'infantry', quantity: 1, owner: 'British' },
      ],
      phase: 'aaFire',
      totalAttackerLosses: {},
      totalDefenderLosses: {},
      selectedAACasualties: {},
    };
    const seen = [];
    gs._rollDie = (ctx) => {
      seen.push(ctx);
      return face;
    };
    ui._rollAAFire();
    return { ui, seen };
  }

  const plain = human('expanded', false, 2);
  check('human AA without the tech misses a 2',
    plain.seen.length === 1
    && plain.seen[0].need === 1
    && plain.ui.combatState.aaResults.hits === 0
    && plain.ui.combatState.attackers.find((u) => u.type === 'fighter').quantity === 1);
  const classic = human('classic', true, 1);
  check('human AA on classic still hits on 1',
    classic.seen[0].need === 1
    && classic.ui.combatState.aaResults.hits === 1
    && !classic.ui.combatState.attackers.some((u) => u.type === 'fighter' && u.quantity > 0));
  const guided = human('expanded', true, 2);
  check('human AA with Wasserfall hits on 2',
    guided.seen[0].need === 2
    && guided.ui.combatState.aaResults.hits === 1
    && guided.ui._aaHitPhrase() === 'hits on 2'
    && !guided.ui.combatState.attackers.some((u) => u.type === 'fighter' && u.quantity > 0));
  check('the infantry attacker was not an AA casualty',
    guided.ui.combatState.attackers.find((u) => u.type === 'infantry').quantity === 1);
  const high = human('expanded', true, 3);
  check('human AA with Wasserfall misses a 3',
    high.ui.combatState.aaResults.hits === 0
    && high.ui.combatState.attackers.find((u) => u.type === 'fighter').quantity === 1);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall passed');
