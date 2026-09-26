// V2.81.57-unified.16 — battleship casualty default fills every hit.
// A human side damages an undamaged battleship first. The second hit on
// that same ship is part of the default. AI sides stay cheapest-first.
// Run: node tools/test-battleship-casualty-default.mjs

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
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));

const unitDefs = {
  cruiser: { cost: 12, hp: 1, isSea: true, attack: 3, defense: 3 },
  carrier: { cost: 14, hp: 1, isSea: true, attack: 1, defense: 2 },
  battleship: { cost: 20, hp: 2, isSea: true, attack: 4, defense: 4 },
  destroyer: { cost: 8, hp: 1, isSea: true, attack: 2, defense: 2 },
  fighter: { cost: 10, hp: 1, isAir: true, isSea: false, attack: 3, defense: 4 },
  transport: { cost: 7, hp: 1, isSea: true, attack: 0, defense: 0 },
  factory: { cost: 15, isBuilding: true },
};

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const total = (selected) => Object.values(selected).reduce((sum, n) => sum + n, 0);

const ui = new CombatUI();
ui.setUnitDefs(unitDefs);
ui.setGameState({
  getPlayer(id) {
    if (id === 'ai') return { id, isAI: true, name: 'AI' };
    return { id: id || 'human', isAI: false, name: 'Human' };
  },
});

console.log('=== Red Sea: 4 hits, undamaged battleship ===');
const redSea = [
  { type: 'battleship', quantity: 1, damagedCount: 0, owner: 'bastion' },
  { type: 'carrier', quantity: 1, owner: 'bastion' },
  { type: 'cruiser', quantity: 1, owner: 'bastion' },
];
const humanFour = ui._selectCheapestCasualties(redSea, 4, { preferBattleshipDamage: true });
check('human default assigns 4 of 4', total(humanFour) === 4);
check('human damages the battleship', humanFour.battleship_damage === 1);
check('human also destroys that battleship', humanFour.battleship === 1);
check('human still takes the carrier and cruiser', humanFour.carrier === 1 && humanFour.cruiser === 1);

const aiFour = ui._selectCheapestCasualties(redSea, 4, { preferBattleshipDamage: false });
check('AI side also fills 4 of 4', total(aiFour) === 4);
check('AI fill includes the battleship destroy', aiFour.battleship === 1 && aiFour.battleship_damage === 1);

console.log('=== 1 hit with an undamaged battleship ===');
const mixed = [
  { type: 'battleship', quantity: 1, damagedCount: 0, owner: 'human' },
  { type: 'destroyer', quantity: 1, owner: 'human' },
  { type: 'cruiser', quantity: 1, owner: 'human' },
];
const humanOne = ui._selectCheapestCasualties(mixed, 1, { preferBattleshipDamage: true });
check('human 1-hit default is the free damage', humanOne.battleship_damage === 1 && total(humanOne) === 1);
check('human 1-hit does not sink a cheaper hull', !humanOne.destroyer && !humanOne.cruiser && !humanOne.battleship);

const aiOne = ui._selectCheapestCasualties(mixed, 1, { preferBattleshipDamage: false });
check('AI 1-hit still takes the cheapest hull', aiOne.destroyer === 1 && !aiOne.battleship_damage);

console.log('=== sub hits stay off aircraft ===');
const sub = ui._selectCasualtiesWithSubHits([
  { type: 'fighter', quantity: 2, owner: 'human' },
  { type: 'battleship', quantity: 1, damagedCount: 0, owner: 'human' },
], 1, 1, { preferBattleshipDamage: true });
check('sub hit does not select the fighter', !sub.fighter);
check('sub hit damages the battleship', sub.battleship_damage === 1 && total(sub) === 1);

console.log('=== already-damaged battleship keeps today\'s place ===');
const earlier = [
  { type: 'cruiser', quantity: 1, owner: 'human' },
  { type: 'battleship', quantity: 1, damagedCount: 1, owner: 'human' },
];
const damagedHuman = ui._selectCheapestCasualties(earlier, 1, { preferBattleshipDamage: true });
const damagedAi = ui._selectCheapestCasualties(earlier, 1, { preferBattleshipDamage: false });
check('pre-damaged battleship is not the 1-hit default', damagedHuman.cruiser === 1 && !damagedHuman.battleship);
check('AI order matches that same cheapest pick', damagedAi.cruiser === 1 && !damagedAi.battleship);

const onlyDamaged = ui._selectCheapestCasualties([
  { type: 'battleship', quantity: 1, damagedCount: 1 },
], 1, { preferBattleshipDamage: true });
check('a lone pre-damaged battleship is still destroyed', onlyDamaged.battleship === 1 && !onlyDamaged.battleship_damage);

console.log('=== transports and factories stay out ===');
const skipped = ui._selectCheapestCasualties([
  { type: 'transport', quantity: 2 },
  { type: 'factory', quantity: 1 },
  { type: 'battleship', quantity: 1, damagedCount: 0 },
], 2, { preferBattleshipDamage: true });
check('transport and factory are never the default', !skipped.transport && !skipped.factory);
check('both battleship hits fill the two', skipped.battleship_damage === 1 && skipped.battleship === 1);

console.log('=== auto-select follows the owner ===');
ui.combatState = {
  attackers: [
    { type: 'destroyer', quantity: 1, owner: 'human' },
    { type: 'battleship', quantity: 1, damagedCount: 0, owner: 'human' },
  ],
  defenders: [
    { type: 'destroyer', quantity: 1, owner: 'ai' },
    { type: 'battleship', quantity: 1, damagedCount: 0, owner: 'ai' },
  ],
  pendingAttackerCasualties: 1,
  pendingDefenderCasualties: 1,
  attackerSubHits: 0,
  defenderSubHits: 0,
};
ui._autoSelectCasualties();
check('human attacker damages the battleship',
  ui.combatState.selectedAttackerCasualties.battleship_damage === 1
  && !ui.combatState.selectedAttackerCasualties.destroyer);
check('AI defender keeps cheapest-first',
  ui.combatState.selectedDefenderCasualties.destroyer === 1
  && !ui.combatState.selectedDefenderCasualties.battleship_damage);

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll battleship casualty default checks passed');
