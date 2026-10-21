// An undamaged battleship takes two hits to sink. Destroy stays unavailable
// until the first hit is assigned as damage. Run: node tools/test-battleship-two-hit.mjs

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
const { applyCasualtySelection } = await import(pathToFileURL(join(root, 'src/state/combatUnits.js')));
const { CombatUI, battleshipDestroyCap } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra));
  } else console.log('ok  :', label);
};

function plusDisabled(html, unit) {
  const needle = `casualty-btn plus" data-side="defender" data-unit="${unit}"`;
  const at = html.indexOf(needle);
  if (at < 0) return null;
  return html.slice(at, html.indexOf('>', at)).includes('disabled');
}

function ship(extra = {}) {
  return { type: 'battleship', quantity: 1, owner: 'British', damagedCount: 0, damaged: false, ...extra };
}

console.log('=== destroy cap ===');
{
  check('no damage assigned means nothing can be sunk', battleshipDestroyCap(0, 1, 0) === 0);
  check('one assigned damage hit allows one sink', battleshipDestroyCap(0, 1, 1) === 1);
  check('a ship that is already damaged can be sunk', battleshipDestroyCap(1, 0, 0) === 1);
}

console.log('=== casualty controls ===');
{
  const ui = new CombatUI();
  ui.unitDefs = unitDefs;
  ui._render = () => {};
  const defenders = [ship()];
  ui.combatState = {
    attackers: [],
    defenders,
    pendingAttackerCasualties: 0,
    pendingDefenderCasualties: 2,
    selectedAttackerCasualties: {},
    selectedDefenderCasualties: {},
  };
  const selected = ui.combatState.selectedDefenderCasualties;
  let html = ui._renderCasualtyUnits(defenders, selected, 'defender');
  check('destroy starts greyed out', plusDisabled(html, 'battleship') === true);
  check('damage can still be assigned', plusDisabled(html, 'battleship_damage') === false);

  ui._adjustCasualty('defender', 'battleship', 1);
  check('destroy cannot be assigned before damage', (selected.battleship || 0) === 0);

  ui._adjustCasualty('defender', 'battleship_damage', 1);
  html = ui._renderCasualtyUnits(defenders, selected, 'defender');
  check('assigning damage enables destroy',
    selected.battleship_damage === 1 && plusDisabled(html, 'battleship') === false);
  ui._adjustCasualty('defender', 'battleship', 1);
  check('the second hit is the sink', selected.battleship === 1 && selected.battleship_damage === 1);

  ui._adjustCasualty('defender', 'battleship', -1);
  check('unassigning the sink leaves the damage',
    (selected.battleship || 0) === 0 && selected.battleship_damage === 1);
  ui._adjustCasualty('defender', 'battleship_damage', -1);
  check('unassigning the damage clears both',
    (selected.battleship || 0) === 0 && (selected.battleship_damage || 0) === 0);

  ui._adjustCasualty('defender', 'battleship_damage', 1);
  ui._adjustCasualty('defender', 'battleship', 1);
  ui._adjustCasualty('defender', 'battleship_damage', -1);
  check('unassigning damage while a sink is selected drops the sink',
    (selected.battleship || 0) === 0 && (selected.battleship_damage || 0) === 0);

  const two = ui._selectCheapestCasualties([ship()], 2);
  const one = ui._selectCheapestCasualties([ship()], 1);
  check('auto-pick sinks a lone battleship only with two hits',
    two.battleship_damage === 1 && two.battleship === 1
    && one.battleship_damage === 1 && !one.battleship);
}

console.log('=== auto-resolve and applied selection ===');
{
  const gs = new GameState(
    { risk: { factions: [] } },
    [{ name: 'North Sea', isWater: true, connections: [] }],
    [],
  );
  gs.players = [{ id: 'British', name: 'UK' }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs._notify = () => {};

  const sunk = ship();
  gs._applyCasualtiesWithDamage([sunk], 2, unitDefs, true);
  check('two auto hits sink one undamaged battleship', sunk.quantity === 0);

  const damaged = ship();
  gs._applyCasualtiesWithDamage([damaged], 1, unitDefs, true);
  check('one auto hit only damages an undamaged battleship',
    damaged.quantity === 1 && damaged.damagedCount === 1);

  const illegal = ship();
  applyCasualtySelection([illegal], { battleship: 1 });
  check('a lone destroy selection does not sink an undamaged battleship', illegal.quantity === 1);

  const legal = ship();
  applyCasualtySelection([legal], { battleship_damage: 1, battleship: 1 });
  check('damage plus destroy sinks the battleship', legal.quantity === 0);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall passed');
