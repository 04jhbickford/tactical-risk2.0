// V2.81.57-unified.20.2 — A1 combat popup copy.
// Paired infantry and artillery show both quantities. The surprise-strike
// heading names round 1. Dice and casualty lines name the round.
// The tactical bomber row keeps one count and "Tac bomber 4 (paired)".
// No dice-rule change.
// Run: node tools/test-combat-round-copy.mjs

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
        const on = force === undefined ? !classSet.has(name) : !!force;
        if (on) classSet.add(name);
        else classSet.delete(name);
        el.className = [...classSet].join(' ');
        return on;
      },
    },
    appendChild(child) { this.children.push(child); return child; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
  };
  return el;
}

globalThis.document = {
  documentElement: makeEl(),
  body: makeEl(),
  createElement() { return makeEl(); },
  getElementById() { return null; },
};
globalThis.window ??= globalThis;
globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const { TACTICAL_PAIR_LABEL } = await import(pathToFileURL(join(root, 'src/state/tacticalPairing.js')));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { cost: 3, attack: 1, defense: 2, isLand: true },
  artillery: { cost: 4, attack: 2, defense: 2, isLand: true },
  fighter: { cost: 10, attack: 3, defense: 4, isAir: true },
  tacticalBomber: { cost: 11, attack: 3, defense: 3, isAir: true },
  armour: { cost: 5, attack: 3, defense: 3, isLand: true },
};

const attacker = { id: 'p1', name: 'Robert', color: '#c44' };
const defender = { id: 'p2', name: 'James', color: '#44c' };

function makeUI() {
  const ui = new CombatUI();
  ui.setUnitDefs(unitDefs);
  ui.setGameState({
    currentPlayer: attacker,
    gameOptions: { tacticalBombers: true },
    territoryByName: { Kazakh: { isWater: false } },
    getPlayer(id) { return id === 'p1' ? attacker : defender; },
    hasTech() { return false; },
    hasAmphibiousAssault() { return false; },
  });
  ui.currentTerritory = 'Kazakh';
  return ui;
}

const attackers = [
  { type: 'infantry', owner: 'p1', quantity: 2 },
  { type: 'artillery', owner: 'p1', quantity: 2 },
  { type: 'tacticalBomber', owner: 'p1', quantity: 1 },
  { type: 'fighter', owner: 'p1', quantity: 1 },
];
const defenders = [{ type: 'infantry', owner: 'p2', quantity: 3 }];

const ui = makeUI();
ui.combatState = {
  attackers,
  defenders,
  phase: 'selectCasualties',
  combatRound: 1,
  winner: null,
  bombardmentRolls: [],
};
ui.lastRolls = {
  attackRolls: [
    { unitType: 'infantry', attackValue: 2, roll: 2, hit: true },
    { unitType: 'infantry', attackValue: 2, roll: 5, hit: false },
    { unitType: 'artillery', attackValue: 2, roll: 1, hit: true },
    { unitType: 'artillery', attackValue: 2, roll: 4, hit: false },
    { unitType: 'tacticalBomber', attackValue: 4, roll: 3, hit: true },
  ],
  defenseRolls: [],
};

const forces = ui._renderExpandedForces(attackers, defenders, attacker, defender);
check('stamp is unified.20.1', GAME_VERSION === 'V2.81.57-unified.20.2');
check('paired infantry and artillery show both quantities', forces.includes('>2 + 2<'));
check('tactical bomber row keeps one count and the paired label',
  forces.includes(`>${TACTICAL_PAIR_LABEL}<`)
  && forces.includes('>1<')
  && !forces.includes('1 + 1'));
check('dice line names the round and the dice',
  forces.includes('Round 1: 2 hits from 4 dice')
  && forces.includes('Round 1: 1 hit from 1 dice'));

ui.combatState.combatRound = 2;
const round2 = ui._renderExpandedForces(attackers, defenders, attacker, defender);
check('a later round is labeled on the dice line', round2.includes('Round 2: 2 hits from 4 dice'));

ui.combatState = {
  attackers: [{ type: 'submarine', owner: 'p1', quantity: 1 }],
  defenders: [{ type: 'infantry', owner: 'p2', quantity: 1 }],
  phase: 'ready',
  combatRound: 1,
  winner: null,
  bombardmentRolls: [],
  submarineFirstStrikeFired: true,
  subFirstStrikeRolls: [{ side: 'attacker', roll: 1, hit: true }],
  attackerSubsHaveFirstStrike: false,
  defenderSubsHaveFirstStrike: false,
};
ui._calculateProbability = () => 50;
ui._render();
check('surprise strike heading names round 1',
  ui.el.innerHTML.includes('Round 1 surprise strike')
  && !ui.el.innerHTML.includes('Submarine First Strike Result'));

ui.combatState = {
  attackers,
  defenders,
  phase: 'selectCasualties',
  combatRound: 2,
  pendingAttackerCasualties: 1,
  pendingDefenderCasualties: 1,
  selectedAttackerCasualties: {},
  selectedDefenderCasualties: {},
};
ui._effectiveCasualtyCount = () => 1;
ui._airHitsWasted = () => false;
ui._renderCasualtyUnits = () => '';
const casualties = ui._renderCasualtySelection();
check('casualty counters name the round',
  (casualties.match(/Round 2 hits to assign:/g) || []).length === 2
  && !casualties.includes('>Hits to assign:<'));

const cont = makeUI();
cont.combatState = {
  attackers: [{ type: 'infantry', owner: 'p1', quantity: 1 }],
  defenders: [{ type: 'infantry', owner: 'p2', quantity: 1 }],
  phase: 'selectCasualties',
  combatRound: 1,
  selectedAttackerCasualties: {},
  selectedDefenderCasualties: {},
  totalAttackerLosses: {},
  totalDefenderLosses: {},
  pendingBombardmentLosses: null,
};
cont.gameState.units = { Kazakh: [] };
cont._clampIllegalSubCasualties = () => {};
cont._syncCombatStateToGame = () => {};
cont._render = () => {};
cont._checkAirLanding = () => {};
cont._applyCasualties();
check('the next round increments the label counter', cont.combatState.combatRound === 2);

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('combat round copy ok');
