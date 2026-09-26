// V2.81.57-unified.16.1 — Classic naval report shows defender dice already rolled.
// Run: node tools/test-naval-report-defender-dice.mjs

import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
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
  };
  return el;
}

globalThis.document = {
  documentElement: makeEl(),
  body: makeEl(),
  createElement() { return makeEl(); },
  getElementById() { return null; },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { CombatUI, renderNavalDiceReport } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const lastRolls = {
  attackRolls: [
    { unitType: 'cruiser', roll: 4, hit: true, attackValue: 3 },
    { unitType: 'battleship', roll: 1, hit: false, attackValue: 4 },
  ],
  defenseRolls: [
    { unitType: 'battleship', roll: 5, hit: true, defenseValue: 4 },
    { unitType: 'carrier', roll: 2, hit: false, defenseValue: 2 },
    { unitType: 'cruiser', roll: 3, hit: true, defenseValue: 3 },
  ],
  attackHits: 1,
  defenseHits: 2,
};

console.log('=== report reads the rolls it is given ===');
const randomCalls = [];
const originalRandom = Math.random;
Math.random = () => {
  randomCalls.push(1);
  return 0.5;
};
const html = renderNavalDiceReport(lastRolls);
Math.random = originalRandom;
check('rendering does not roll', randomCalls.length === 0);
check('report marks attack and defense', html.includes('data-naval-dice-report="1"')
  && html.includes('naval-dice-side attacker')
  && html.includes('naval-dice-side defender'));
check('defender faces are the rolled numbers', html.includes('>5<') && html.includes('>2<') && html.includes('>3<'));
check('hit and miss use die-mini', html.includes('die-mini hit') && html.includes('die-mini miss'));
check('defender hit count is on the report', html.includes('2 hits') && html.includes('battleship'));
check('a second call returns the same faces', renderNavalDiceReport(lastRolls) === html);

const src = readFileSync(join(root, 'src/ui/combatUI.js'), 'utf8');
const reportSrc = src.slice(
  src.indexOf('export function renderNavalDiceReport'),
  src.indexOf('export class CombatUI'),
);
check('report source does not call Math.random', reportSrc.length > 0 && !reportSrc.includes('Math.random'));

function paint(isWater, territory) {
  const ui = new CombatUI();
  ui.setUnitDefs({
    cruiser: { cost: 12, attack: 3, defense: 3, isSea: true },
    battleship: { cost: 20, hp: 2, attack: 4, defense: 4, isSea: true },
    carrier: { cost: 14, attack: 1, defense: 2, isSea: true },
  });
  ui.currentTerritory = territory;
  ui.setGameState({
    currentPlayer: { id: 'p1', name: 'Robert007', color: '#c44', isAI: false },
    territoryByName: { [territory]: { name: territory, isWater } },
    getPlayer(id) {
      return { id, name: id === 'p2' ? 'Bastion' : 'Robert007', color: '#48c', isAI: false };
    },
    hasAmphibiousAssault() { return false; },
  });
  ui.lastRolls = lastRolls;
  ui.combatState = {
    attackers: [{ type: 'cruiser', quantity: 1, owner: 'p1' }],
    defenders: [
      { type: 'battleship', quantity: 1, damagedCount: 0, owner: 'p2' },
      { type: 'carrier', quantity: 1, owner: 'p2' },
    ],
    phase: 'selectCasualties',
    winner: null,
    bombardmentRolls: [],
    hasAA: false,
    hasSubmarineFirstStrike: false,
    pendingAttackerCasualties: 0,
    pendingDefenderCasualties: 0,
    selectedAttackerCasualties: {},
    selectedDefenderCasualties: {},
  };
  ui._render();
  return ui.el.innerHTML;
}

console.log('=== sea casualty step shows it; land does not ===');
const seaHtml = paint(true, 'Red Sea Zone');
const landHtml = paint(false, 'Egypt');
check('sea casualty view includes the defender report', seaHtml.includes('data-naval-dice-report="1"') && seaHtml.includes('>5<'));
check('land casualty view does not add the naval report', !landHtml.includes('data-naval-dice-report'));

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll naval defender dice checks passed');
