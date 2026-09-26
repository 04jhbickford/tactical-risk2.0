// V2.81.57-unified.17 — subs fire first only when a hittable target is present.
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
  const { ui } = openCombat([bomber], [sub, transport]);
  check('bomber vs sub skips first strike', ui.combatState.phase === 'ready' && !ui.combatState.defenderSubsHaveFirstStrike);
  check('submerge is still offered', ui.el.innerHTML.includes('Submerge'));
  const before = (ui.gameState._rollLog || []).length;
  ui._rollSubmarineFirstStrike();
  check('no first-strike roll against a bomber', ((ui.gameState._rollLog || []).length - before) === 0);
}

{
  const { ui } = openCombat([atkTransport], [sub]);
  check('sub vs transport still opens first strike', ui.combatState.phase === 'submarineFirstStrike');
  let rolls = 0;
  ui._rollD6 = () => { rolls += 1; return 6; };
  ui._rollSubmarineFirstStrike();
  check('sub vs transport rolls one first-strike die', rolls === 1, rolls);
}

{
  const { ui } = openCombat([destroyer], [sub, transport]);
  check('sub vs destroyer has no first strike', ui.combatState.phase === 'ready' && !ui.combatState.defenderSubsHaveFirstStrike);
}

{
  const { ui } = openCombat([atkSub], [fighter]);
  check('attacking sub vs fighters has no first strike', ui.combatState.phase === 'ready' && !ui.combatState.attackerSubsHaveFirstStrike);
}

{
  const cases = [
    { name: 'bomber', atk: [bomber], def: [sub, transport], attack: 0, defense: 0 },
    { name: 'transport', atk: [atkTransport], def: [sub], attack: 0, defense: 1 },
    { name: 'destroyer', atk: [destroyer], def: [sub], attack: 0, defense: 0 },
    { name: 'fighters', atk: [atkSub], def: [fighter], attack: 0, defense: 0 },
  ];
  const gs = openCombat([], []).gs;
  for (const row of cases) {
    const dice = firstStrikeDice(gs, row.atk, row.def);
    check(`AI ${row.name} first-strike dice match`, dice.attack === row.attack && dice.defense === row.defense && dice.subDice === row.attack + row.defense, dice);
  }
}

{
  documentElement.classList.remove('mobile-shell');
  const { ui } = openCombat([atkTransport], [{ ...sub }]);
  ui._submergeSub('defender', 'all');
  check('desktop all-submerged reads Continue to battle', ui.el.innerHTML.includes('Continue to battle') && !ui.el.innerHTML.includes('Fire First Strike'), ui.el.innerHTML);
  const fresh = openCombat([atkTransport], [{ ...sub }]);
  check('desktop valid target reads Fire First Strike', fresh.ui.el.innerHTML.includes('Fire First Strike'));
}

{
  documentElement.classList.add('mobile-shell');
  const { ui } = openCombat([atkTransport], [{ ...sub }]);
  ui._submergeSub('defender', 'all');
  check('phone all-submerged reads Continue to battle', ui.el.innerHTML.includes('Continue to battle') && !ui.el.innerHTML.includes('Fire First Strike'));
  const fresh = openCombat([atkTransport], [{ ...sub }]);
  check('phone valid target reads Fire First Strike', fresh.ui.el.innerHTML.includes('Fire First Strike'));
  documentElement.classList.remove('mobile-shell');
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nsub first strike target checks passed');
