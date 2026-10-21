// An AA gun is never a casualty. Only a land attacker captures it.
// Run: node tools/test-aa-casualty.mjs

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
const { applyCasualtySelection, unitIsFirstStrikeTarget } = await import(pathToFileURL(join(root, 'src/state/combatUnits.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra));
  } else console.log('ok  :', label);
};

function board() {
  const gs = new GameState(
    { risk: { factions: [] } },
    [
      { name: 'Persia', isWater: false, connections: ['Germany'] },
      { name: 'Germany', isWater: false, connections: ['Persia'] },
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
  };
  gs.playerState = {
    Germans: { ipcs: 40, capitalTerritory: 'Germany' },
    British: { ipcs: 40, capitalTerritory: 'France' },
  };
  gs.playerTechs = {
    Germans: { techTokens: 0, unlockedTechs: [] },
    British: { techTokens: 0, unlockedTechs: [] },
  };
  gs._notify = () => {};
  return gs;
}

console.log('=== AA is not a casualty ===');
{
  const ui = new CombatUI();
  ui.unitDefs = unitDefs;
  ui._render = () => {};
  const stacks = [
    { type: 'infantry', quantity: 1, owner: 'British' },
    { type: 'aaGun', quantity: 1, owner: 'British' },
  ];
  ui.combatState = { attackers: [], defenders: stacks };
  const picked = ui._selectCheapestCasualties(stacks, 1);
  check('auto-pick spends the hit on infantry', picked.infantry === 1 && !picked.aaGun);
  const onlyGun = [{ type: 'aaGun', quantity: 1, owner: 'British' }];
  const pickedGun = ui._selectCheapestCasualties(onlyGun, 2);
  check('auto-pick never selects an AA gun', !pickedGun.aaGun);
  const html = ui._renderCasualtyUnits(stacks, {}, 'defender');
  check('the casualty list omits the AA gun', !html.includes('aaGun') && html.includes('infantry'));

  const gun = { type: 'aaGun', quantity: 1, owner: 'British' };
  applyCasualtySelection([gun], { aaGun: 1 });
  check('a destroy selection does not remove the AA gun', gun.quantity === 1);
  check('a submarine cannot target an AA gun', unitIsFirstStrikeTarget(gun, unitDefs) === false);

  const gs = board();
  const defenders = [
    { type: 'infantry', quantity: 1, owner: 'British' },
    { type: 'aaGun', quantity: 1, owner: 'British' },
  ];
  gs._applyCasualtiesWithDamage(defenders, 5, unitDefs, false);
  check('auto-resolve leaves the AA gun after the infantry is gone',
    defenders[0].quantity === 0 && defenders[1].quantity === 1);
}

console.log('=== only AA left: land captures, air does not ===');
{
  const gs = board();
  gs._rollDie = () => 6;
  gs.units = {
    Persia: [
      { type: 'infantry', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
    ],
  };
  const land = gs.resolveCombat('Persia', unitDefs);
  const gun = (gs.units.Persia || []).find((unit) => unit.type === 'aaGun');
  check('infantry takes Persia and the AA gun',
    land?.resolved === true
    && land?.winner === 'attacker'
    && land?.conquered === true
    && gs.getOwner('Persia') === 'Germans'
    && gun?.owner === 'Germans'
    && gun?.quantity === 1);

  const air = board();
  const shots = [];
  air._rollDie = (ctx) => {
    if (ctx?.context === 'aa') shots.push(ctx);
    return 6;
  };
  air.units = {
    Persia: [
      { type: 'bomber', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
    ],
  };
  const first = air.resolveCombat('Persia', unitDefs);
  const stayed = (air.units.Persia || []).find((unit) => unit.type === 'aaGun');
  check('bombers do not capture the AA gun',
    first?.conquered !== true
    && air.getOwner('Persia') === 'British'
    && stayed?.owner === 'British'
    && stayed?.quantity === 1
    && shots.length === 1);
  air.units = {
    Persia: [
      { type: 'bomber', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
    ],
  };
  air.resolveCombat('Persia', unitDefs);
  check('the next bombers-only attack still draws AA fire', shots.length === 2);

  const ui = new CombatUI();
  ui._render = () => {};
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.setActionLog(null);
  ui.currentTerritory = 'Persia';
  gs.units = {
    Persia: [
      { type: 'bomber', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
    ],
  };
  gs.territoryState.Persia.owner = 'British';
  gs.combatQueue = ['Persia'];
  ui.combatState = {
    winner: 'attacker',
    attackers: [{ type: 'bomber', quantity: 1, owner: 'Germans' }],
    defenders: [{ type: 'aaGun', quantity: 1, owner: 'British' }],
    extraDefenderLosses: {},
  };
  ui._finalizeCombat();
  const manualGun = (gs.units.Persia || []).find((unit) => unit.type === 'aaGun');
  check('manual air-only victory leaves the AA gun with the defender',
    gs.getOwner('Persia') === 'British' && manualGun?.owner === 'British');

  gs.units = {
    Persia: [
      { type: 'infantry', quantity: 1, owner: 'Germans' },
      { type: 'aaGun', quantity: 1, owner: 'British' },
    ],
  };
  gs.territoryState.Persia.owner = 'British';
  ui.combatState = {
    winner: 'attacker',
    attackers: [{ type: 'infantry', quantity: 1, owner: 'Germans' }],
    defenders: [],
    extraDefenderLosses: {},
  };
  ui._finalizeCombat();
  const taken = (gs.units.Persia || []).find((unit) => unit.type === 'aaGun');
  check('manual land victory captures the AA gun',
    gs.getOwner('Persia') === 'Germans' && taken?.owner === 'Germans' && taken?.quantity === 1);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall passed');
