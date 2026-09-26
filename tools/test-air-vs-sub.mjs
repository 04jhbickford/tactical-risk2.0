// V2.81.57-unified.17 S4 — aircraft cannot hit subs unless their side has a destroyer.
// Run: node tools/test-air-vs-sub.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

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
const { AIR_CANNOT_HIT_SUBS_HINT } = await import(pathToFileURL(join(root, 'src/state/combatUnits.js')).href);
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const ZONE = 'Caspian Sea Zone';
const G = 'Germans';
const A = 'Americans';
const unit = (type, owner, quantity = 1) => ({ type, owner, quantity });

function makeState() {
  const gs = new GameState({ risk: { factions: [] } }, [
    { name: ZONE, isWater: true, connections: [] },
  ], []);
  gs.players = [
    { id: G, name: 'Robert007' },
    { id: A, name: 'Bastion' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.playerState = { [G]: { ipcs: 0 }, [A]: { ipcs: 0 } };
  gs.units = { [ZONE]: [] };
  gs.combatQueue = [ZONE];
  return gs;
}

function living(gs, type, owner) {
  return (gs.units[ZONE] || [])
    .filter((u) => u.type === type && (!owner || u.owner === owner))
    .reduce((sum, u) => sum + (Number(u.quantity) || 0), 0);
}

function resolveScripted(gs, units, rolls) {
  gs.units[ZONE] = units.map((u) => ({ ...u }));
  gs.combatQueue = [ZONE];
  gs._combatRoundsTracker = {};
  let i = 0;
  gs._rollDie = () => rolls[i++] ?? 6;
  const result = gs.resolveCombat(ZONE, unitDefs);
  return { result, used: i };
}

function continueScripted(gs, rolls) {
  let i = 0;
  gs._rollDie = () => rolls[i++] ?? 6;
  const result = gs.resolveCombat(ZONE, unitDefs);
  return { result, used: i };
}

function openCombat(attackers, defenders) {
  const gs = makeState();
  gs.units[ZONE] = [...attackers, ...defenders].map((u) => ({ ...u }));
  gs.combatQueue = [ZONE];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.showNextCombat();
  return { gs, ui };
}

function assignRolledCasualties(ui, rolls) {
  let i = 0;
  ui._rollD6 = () => rolls[i++] ?? 6;
  const result = ui._rollDice();
  ui.combatState.pendingDefenderCasualties = result.attackHits;
  ui.combatState.pendingAttackerCasualties = result.defenseHits;
  ui.combatState.phase = 'selectCasualties';
  ui._autoSelectCasualties();
  ui._render();
  return result;
}

const fighter = unit('fighter', G);
const destroyer = unit('destroyer', G);
const cruiser = unit('cruiser', G);
const sub = unit('submarine', A);
const twoSubs = unit('submarine', A, 2);
const defFighter = unit('fighter', A);
const defDestroyer = unit('destroyer', A);
const defCruiser = unit('cruiser', A);
const atkSub = unit('submarine', G);

{
  const gs = makeState();
  resolveScripted(gs, [fighter, sub], [1, 6]);
  check('AI air vs lone sub sinks nothing', living(gs, 'submarine') === 1 && living(gs, 'fighter') === 1, {
    sub: living(gs, 'submarine'), fighter: living(gs, 'fighter'),
  });
}

{
  const gs = makeState();
  resolveScripted(gs, [cruiser, sub], [6, 1, 6]);
  check('AI cruiser hit still sinks a sub', living(gs, 'submarine') === 0 && living(gs, 'cruiser') === 1, {
    sub: living(gs, 'submarine'), cruiser: living(gs, 'cruiser'),
  });
}

{
  const gs = makeState();
  resolveScripted(gs, [fighter, destroyer, sub], [1, 6, 6]);
  check('AI air can sink a sub while a destroyer is present', living(gs, 'submarine') === 0, living(gs, 'submarine'));
}

{
  const gs = makeState();
  const first = resolveScripted(gs, [fighter, destroyer, sub], [6, 6, 1]);
  check('AI round 1 sub hit sinks the destroyer', first.used === 3 && living(gs, 'destroyer') === 0 && living(gs, 'submarine') === 1 && living(gs, 'fighter') === 1, {
    used: first.used, destroyer: living(gs, 'destroyer'), sub: living(gs, 'submarine'),
  });
  const second = continueScripted(gs, [1, 6]);
  check('AI round 2 air cannot hit the sub', second.used === 2 && living(gs, 'submarine') === 1 && living(gs, 'fighter') === 1, {
    used: second.used, sub: living(gs, 'submarine'),
  });
}

{
  const gs = makeState();
  const first = resolveScripted(gs, [fighter, destroyer, twoSubs, defCruiser], [1, 6, 6, 6, 1]);
  check('AI air still hits a sub in the round the destroyer dies', first.used === 5 && living(gs, 'submarine') === 1 && living(gs, 'destroyer') === 0 && living(gs, 'cruiser') === 1, {
    used: first.used, sub: living(gs, 'submarine'), destroyer: living(gs, 'destroyer'), cruiser: living(gs, 'cruiser'),
  });
  const second = continueScripted(gs, [1, 6, 6]);
  check('AI next round air hits the cruiser and misses the sub', second.used === 3 && living(gs, 'submarine') === 1 && living(gs, 'cruiser') === 0, {
    used: second.used, sub: living(gs, 'submarine'), cruiser: living(gs, 'cruiser'),
  });
}

{
  const gs = makeState();
  const bb = unit('battleship', A);
  resolveScripted(gs, [cruiser, fighter, bb, unit('destroyer', A)], [1, 1, 6, 6]);
  const ship = (gs.units[ZONE] || []).find((u) => u.type === 'battleship');
  check('AI air plus surface keeps battleship damage order', living(gs, 'destroyer') === 0 && ship?.quantity === 1 && ship?.damaged === true, {
    destroyer: living(gs, 'destroyer'), battleship: ship,
  });
}

{
  const gs = makeState();
  resolveScripted(gs, [cruiser, fighter, twoSubs], [6, 6, 1, 1, 6, 6]);
  check('AI mixed fleet spends only the non-air hit on subs', living(gs, 'submarine') === 1, {
    sub: living(gs, 'submarine'), cruiser: living(gs, 'cruiser'), fighter: living(gs, 'fighter'),
  });
}

{
  const gs = makeState();
  resolveScripted(gs, [atkSub, defFighter], [6, 1]);
  check('AI defending air cannot hit a sub without a destroyer', living(gs, 'submarine') === 1 && living(gs, 'fighter') === 1, living(gs, 'submarine'));
}

{
  const gs = makeState();
  resolveScripted(gs, [atkSub, defFighter, defDestroyer], [6, 1, 6]);
  check('AI defending air can hit a sub when a destroyer is present', living(gs, 'submarine') === 0, living(gs, 'submarine'));
}

function hintShown(ui) {
  return ui.el.innerHTML.includes(AIR_CANNOT_HIT_SUBS_HINT)
    && ui.el.innerHTML.includes('casualty-air-sub-hint');
}

{
  documentElement.classList.remove('mobile-shell');
  const { ui } = openCombat([fighter], [sub]);
  assignRolledCasualties(ui, [1, 6]);
  check('default assignment leaves the lone sub', !ui.combatState.selectedDefenderCasualties.submarine);
  check('desktop casualty hint names the destroyer rule', hintShown(ui));
  check('confirm is available when the air hit is lost', !ui.el.innerHTML.includes('data-action="confirm-casualties" disabled'));
  ui._adjustCasualty('defender', 'submarine', 1);
  check('manual plus cannot put the air hit on the sub', !ui.combatState.selectedDefenderCasualties.submarine);
  const before = living(ui.gameState, 'submarine');
  ui._applyCasualties();
  check('auto-resolve apply does not sink the sub', living(ui.gameState, 'submarine') === before && before === 1);
}

{
  documentElement.classList.add('mobile-shell');
  const { ui } = openCombat([fighter], [sub]);
  assignRolledCasualties(ui, [1, 6]);
  check('phone casualty hint names the destroyer rule', hintShown(ui) && ui.el.innerHTML.includes('phone-combat-sheet'), ui.el.innerHTML.slice(0, 400));
  documentElement.classList.remove('mobile-shell');
}

{
  const { ui } = openCombat([fighter, destroyer], [sub]);
  assignRolledCasualties(ui, [1, 6, 6]);
  check('default assignment can select the sub when a destroyer is present', ui.combatState.selectedDefenderCasualties.submarine === 1);
  check('hint stays hidden when the air hit has a legal sub target', !hintShown(ui));
  ui.combatState.selectedDefenderCasualties = {};
  ui._adjustCasualty('defender', 'submarine', 1);
  check('manual plus can assign the air hit to the sub', ui.combatState.selectedDefenderCasualties.submarine === 1);
}

{
  const { ui } = openCombat([cruiser, fighter], [twoSubs]);
  assignRolledCasualties(ui, [1, 1, 6, 6]);
  check('human mixed fleet selects one sub', ui.combatState.selectedDefenderCasualties.submarine === 1, ui.combatState.selectedDefenderCasualties);
  check('human mixed fleet shows the wasted-air hint', hintShown(ui));
  ui._applyCasualties();
  check('human mixed fleet sinks one sub', living(ui.gameState, 'submarine') === 1);
}

{
  const { ui } = openCombat([atkSub], [defFighter]);
  assignRolledCasualties(ui, [6, 1]);
  check('defending air is not assigned to the attacking sub', !ui.combatState.selectedAttackerCasualties.submarine);
  check('defense-side wasted air shows the hint', hintShown(ui));
  ui._applyCasualties();
  check('defending air does not sink the sub', living(ui.gameState, 'submarine') === 1);
}

{
  const { ui } = openCombat([atkSub], [defFighter, defDestroyer]);
  assignRolledCasualties(ui, [6, 1, 6]);
  check('defending air is assigned to the sub when a destroyer is present', ui.combatState.selectedAttackerCasualties.submarine === 1);
  ui._applyCasualties();
  check('defending air sinks the sub when a destroyer is present', living(ui.gameState, 'submarine') === 0);
}

{
  const { ui } = openCombat([fighter, destroyer], [sub]);
  assignRolledCasualties(ui, [6, 6, 1]);
  check('round 1 selects the destroyer for the sub hit', ui.combatState.selectedAttackerCasualties.destroyer === 1);
  ui._applyCasualties();
  assignRolledCasualties(ui, [1, 6]);
  check('round 2 default leaves the sub after the destroyer is gone', !ui.combatState.selectedDefenderCasualties.submarine);
  check('round 2 hint shows once the destroyer is gone', hintShown(ui));
  ui._adjustCasualty('defender', 'submarine', 1);
  check('round 2 manual plus still rejects the sub', !ui.combatState.selectedDefenderCasualties.submarine);
  ui._applyCasualties();
  check('round 2 apply keeps the sub', living(ui.gameState, 'submarine') === 1 && living(ui.gameState, 'fighter') === 1);
}

{
  const { ui } = openCombat([fighter], [sub]);
  let applied = 0;
  const orig = ui._applyCasualties.bind(ui);
  ui._applyCasualties = () => {
    applied += 1;
    check('auto battle selection leaves the sub', !ui.combatState.selectedDefenderCasualties.submarine);
    orig();
    ui.combatState.phase = 'resolved';
  };
  ui._animateDiceRoll = async () => {
    const result = ui._rollDice();
    ui.combatState.pendingDefenderCasualties = result.attackHits;
    ui.combatState.pendingAttackerCasualties = result.defenseHits;
    ui.combatState.phase = 'selectCasualties';
    ui._autoSelectCasualties();
    return result;
  };
  ui._rollD6 = () => 1;
  const prevTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (fn) => { fn(); return 0; };
  await ui._autoBattle();
  globalThis.setTimeout = prevTimeout;
  check('auto battle applied the air-vs-sub round', applied === 1 && living(ui.gameState, 'submarine') === 1, {
    applied, sub: living(ui.gameState, 'submarine'),
  });
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nair vs sub checks passed');
