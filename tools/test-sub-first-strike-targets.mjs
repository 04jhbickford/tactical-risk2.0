// V2.81.57-unified.31 — subs fire first only when a hittable target is present.
// Run: node tools/test-sub-first-strike-targets.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
const mk = () => {
  const cs = new Set();
  return {
    id: '',
    className: '',
    innerHTML: '',
    style: {},
    children: [],
    classList: {
      add(...n) { n.forEach((x) => cs.add(x)); this.className = [...cs].join(' '); },
      remove(...n) { n.forEach((x) => cs.delete(x)); this.className = [...cs].join(' '); },
      contains(n) { return cs.has(n); },
      toggle(name, force) {
        if (force === undefined) {
          if (cs.has(name)) this.remove(name);
          else this.add(name);
        } else if (force) this.add(name);
        else this.remove(name);
        return cs.has(name);
      },
    },
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
};
const documentElement = mk();
globalThis.document = {
  documentElement,
  body: mk(),
  createElement() { return mk(); },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
};
globalThis.window ??= globalThis;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')).href);
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')).href);
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

function openCombat(attackers, defenders) {
  const T = (name, isWater, connections) => ({ name, isWater, connections });
  const gs = new GameState({ risk: { factions: [] } }, [
    T('Caspian Sea Zone', true, []),
  ], []);
  gs.players = [
    { id: 'Germans', name: 'Robert007' },
    { id: 'Americans', name: 'Bastion' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.playerState = { Germans: { ipcs: 0 }, Americans: { ipcs: 0 } };
  gs.units = { 'Caspian Sea Zone': [...attackers, ...defenders] };
  gs.combatQueue = ['Caspian Sea Zone'];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.showNextCombat();
  return { gs, ui };
}

function firstStrikeDice(gs, attackers, defenders) {
  const zone = 'Caspian Sea Zone';
  gs.units[zone] = [...attackers, ...defenders];
  gs.combatQueue = [zone];
  gs._combatRoundsTracker = {};
  const seen = [];
  gs._rollDie = (ctx) => {
    seen.push(ctx);
    return 6;
  };
  const result = gs.resolveCombat(zone, unitDefs);
  const subDice = seen.filter((ctx) => ctx?.context === 'sub').length;
  return {
    subDice,
    attack: result?.firstStrikeAttackDice || 0,
    defense: result?.firstStrikeDefenseDice || 0,
  };
}

const bomber = { type: 'bomber', quantity: 1, owner: 'Germans' };
const sub = { type: 'submarine', quantity: 1, owner: 'Americans', id: 'sub_1' };
const transport = { type: 'transport', quantity: 1, owner: 'Americans' };
const destroyer = { type: 'destroyer', quantity: 1, owner: 'Germans' };
const fighter = { type: 'fighter', quantity: 2, owner: 'Americans' };
const atkSub = { type: 'submarine', quantity: 1, owner: 'Germans', id: 'sub_a' };
const atkTransport = { type: 'transport', quantity: 1, owner: 'Germans' };

{
  const { gs, ui } = openCombat([bomber], [sub, transport]);
  const zone = 'Caspian Sea Zone';
  check('bomber vs sub and transport ends submerged',
    ui.combatState.phase === 'resolved'
    && ui.combatState.winner === 'submerged'
    && !ui.combatState.defenderSubsHaveFirstStrike);
  check('the transport is destroyed and the sub stays',
    !(gs.units[zone] || []).some((unit) => unit.type === 'transport' && (unit.quantity || 0) > 0)
    && (gs.units[zone] || []).some((unit) => unit.type === 'submarine' && unit.quantity === 1));
  const before = (ui.gameState._rollLog || []).length;
  ui._rollSubmarineFirstStrike();
  check('no first-strike roll against a bomber', ((ui.gameState._rollLog || []).length - before) === 0);
}

{
  const cruiser = { type: 'cruiser', quantity: 1, owner: 'Germans' };
  const { ui } = openCombat([cruiser, atkTransport], [sub]);
  check('sub vs a transport with a cruiser still opens first strike', ui.combatState.phase === 'submarineFirstStrike');
  let rolls = 0;
  ui._rollD6 = () => { rolls += 1; return 6; };
  ui._rollSubmarineFirstStrike();
  check('that sub rolls one first-strike die', rolls === 1, rolls);
}

{
  const { gs, ui } = openCombat([atkTransport], [sub]);
  check('a lone transport does not open first strike', !ui?.combatState || ui.combatState.phase !== 'submarineFirstStrike');
  check('a lone transport is removed with no dice',
    !(gs.units['Caspian Sea Zone'] || []).some((unit) => unit.type === 'transport' && (unit.quantity || 0) > 0)
    && (gs.units['Caspian Sea Zone'] || []).some((unit) => unit.type === 'submarine' && unit.quantity === 1));
}

{
  const { ui } = openCombat([destroyer], [sub, transport]);
  check('sub vs destroyer has no first strike', ui.combatState.phase === 'ready' && !ui.combatState.defenderSubsHaveFirstStrike);
}

{
  const { gs, ui } = openCombat([atkSub], [fighter]);
  check('attacking sub vs fighters ends without a first strike',
    ui.combatState.phase === 'resolved'
    && ui.combatState.winner === 'submerged'
    && !ui.combatState.attackerSubsHaveFirstStrike);
  check('the sub and the fighters both stay',
    (gs.units['Caspian Sea Zone'] || []).some((unit) => unit.type === 'submarine' && unit.quantity === 1)
    && (gs.units['Caspian Sea Zone'] || []).some((unit) => unit.type === 'fighter' && unit.quantity === 2));
}

{
  const cases = [
    { name: 'bomber', atk: [bomber], def: [sub, transport], attack: 0, defense: 0 },
    { name: 'transport', atk: [atkTransport], def: [sub], attack: 0, defense: 0 },
    { name: 'destroyer', atk: [destroyer], def: [sub], attack: 0, defense: 0 },
    { name: 'fighters', atk: [atkSub], def: [fighter], attack: 0, defense: 0 },
  ];
  const gs = openCombat([], []).gs;
  for (const row of cases) {
    const dice = firstStrikeDice(gs, row.atk, row.def);
    check(`AI ${row.name} first-strike dice match`, dice.attack === row.attack && dice.defense === row.defense && dice.subDice === row.attack + row.defense, dice);
  }
}

function surpriseStrikeRounds(attackers, defenders, side) {
  const zone = 'Caspian Sea Zone';
  const { gs } = openCombat(attackers, defenders);
  const rounds = [];
  for (let round = 1; round <= 3; round++) {
    const seen = [];
    gs._rollDie = (ctx) => {
      seen.push(ctx);
      return 6;
    };
    const result = gs.resolveCombat(zone, unitDefs);
    const ofSide = (context) => seen.filter((ctx) => (
      ctx?.side === side && ctx?.unit === 'submarine' && ctx?.context === context
    )).length;
    rounds.push({
      round,
      resolved: !!result?.resolved,
      sub: ofSide('sub'),
      combat: ofSide('combat'),
    });
  }
  return rounds;
}

{
  const attack = surpriseStrikeRounds(
    [{ type: 'submarine', quantity: 2, owner: 'Germans' }],
    [{ type: 'battleship', quantity: 2, owner: 'Americans' }],
    'attacker',
  );
  check('AI attacker surprise strike is round 1 only and replaces that roll',
    attack.length === 3
    && attack.every((row) => !row.resolved)
    && attack[0].sub === 2 && attack[0].combat === 0
    && attack[1].sub === 0 && attack[1].combat === 2
    && attack[2].sub === 0 && attack[2].combat === 2,
    attack);
  const defense = surpriseStrikeRounds(
    [{ type: 'battleship', quantity: 2, owner: 'Germans' }],
    [{ type: 'submarine', quantity: 2, owner: 'Americans' }],
    'defender',
  );
  check('AI defender surprise strike is round 1 only and replaces that roll',
    defense.length === 3
    && defense.every((row) => !row.resolved)
    && defense[0].sub === 2 && defense[0].combat === 0
    && defense[1].sub === 0 && defense[1].combat === 2
    && defense[2].sub === 0 && defense[2].combat === 2,
    defense);
}

{
  documentElement.classList.remove('mobile-shell');
  const cruiser = { type: 'cruiser', quantity: 1, owner: 'Germans' };
  const { ui } = openCombat([cruiser], [{ ...sub }]);
  ui._submergeSub('defender', 'all');
  check('desktop all-submerged reads Continue to battle', ui.el.innerHTML.includes('Continue to battle') && !ui.el.innerHTML.includes('Fire First Strike'), ui.el.innerHTML);
  const fresh = openCombat([cruiser], [{ ...sub }]);
  check('desktop valid target reads Fire First Strike', fresh.ui.el.innerHTML.includes('Fire First Strike'));
}

{
  documentElement.classList.add('mobile-shell');
  const cruiser = { type: 'cruiser', quantity: 1, owner: 'Germans' };
  const { ui } = openCombat([cruiser], [{ ...sub }]);
  ui._submergeSub('defender', 'all');
  check('phone all-submerged reads Continue to battle', ui.el.innerHTML.includes('Continue to battle') && !ui.el.innerHTML.includes('Fire First Strike'));
  const fresh = openCombat([cruiser], [{ ...sub }]);
  check('phone valid target reads Fire First Strike', fresh.ui.el.innerHTML.includes('Fire First Strike'));
  documentElement.classList.remove('mobile-shell');
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nsub first strike target checks passed');
