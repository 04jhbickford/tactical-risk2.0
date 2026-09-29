// V2.81.57-unified.22 — transports are not casualties while another unit remains.
// East Canada, game 6XQ7CN. Bastion could pick his transport. Run: node tools/test-transport-casualty.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
function makeEl() {
  const classSet = new Set();
  const el = {
    id: '', className: '', innerHTML: '', style: {}, children: [],
    classList: {
      add(...names) { names.forEach((n) => classSet.add(n)); el.className = [...classSet].join(' '); },
      remove(...names) { names.forEach((n) => classSet.delete(n)); el.className = [...classSet].join(' '); },
      contains(name) { return classSet.has(name); },
      toggle() {},
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
globalThis.document = {
  documentElement: makeEl(),
  body: makeEl(),
  createElement() { return makeEl(); },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const { applyCasualtySelection } = await import(pathToFileURL(join(root, 'src/state/combatUnits.js')));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const ZONE = 'East Canada Sea Zone';

function makeState() {
  const gs = new GameState({ risk: { factions: [] } }, [
    { name: ZONE, isWater: true, connections: [] },
  ], []);
  gs.players = [
    { id: 'Americans', name: 'Bastion', color: '#1a4' },
    { id: 'Japanese', name: 'Robert007', color: '#c33' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.playerState = {
    Americans: { ipcs: 20, capitalTerritory: 'East Canada' },
    Japanese: { ipcs: 20, capitalTerritory: 'Japan' },
  };
  gs.unitDefs = unitDefs;
  gs._unitDefs = unitDefs;
  gs._notify = () => {};
  return gs;
}

function openPicker(gs, attackers, defenders) {
  gs.units[ZONE] = [...attackers, ...defenders].map((unit) => ({
    ...unit,
    cargo: unit.cargo ? unit.cargo.map((item) => ({ ...item })) : unit.cargo,
  }));
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.currentTerritory = ZONE;
  ui.combatState = {
    attackers: attackers.map((unit) => ({ ...unit, cargo: unit.cargo ? unit.cargo.map((item) => ({ ...item })) : unit.cargo })),
    defenders: defenders.map((unit) => ({ ...unit })),
    pendingAttackerCasualties: 1,
    pendingDefenderCasualties: 0,
    selectedAttackerCasualties: {},
    selectedDefenderCasualties: {},
    totalAttackerLosses: {},
    totalDefenderLosses: {},
    phase: 'selectCasualties',
    combatRound: 1,
  };
  return ui;
}

console.log('=== East Canada: attacker cannot pick the transport ===');
{
  const cargo = [{ type: 'infantry', owner: 'Americans', quantity: 1 }];
  const gs = makeState();
  const ui = openPicker(gs, [
    { type: 'battleship', quantity: 1, owner: 'Americans' },
    { type: 'transport', id: 'transport_us', quantity: 1, owner: 'Americans', cargo },
  ], [
    { type: 'cruiser', quantity: 1, owner: 'Japanese' },
  ]);
  ui._autoSelectCasualties();
  check('the hit starts on the battleship', ui.combatState.selectedAttackerCasualties.battleship_damage === 1);
  ui._adjustCasualty('attacker', 'transport', 1);
  check('the transport plus is refused', !ui.combatState.selectedAttackerCasualties.transport);
  check('the hit stays on the battleship', ui.combatState.selectedAttackerCasualties.battleship_damage === 1);
  const desktop = ui._renderCasualtyUnits(ui.combatState.attackers, {}, 'attacker');
  const phone = ui._renderPhoneCombatSelectBody('selectCasualties');
  check('desktop and phone hide the transport', !desktop.includes('data-unit="transport"') && !phone.includes('data-unit="transport"'));

  ui.combatState.selectedAttackerCasualties = { transport: 1 };
  ui._applyCasualties();
  const transport = (gs.units[ZONE] || []).find((unit) => unit.type === 'transport');
  const ship = (gs.units[ZONE] || []).find((unit) => unit.type === 'battleship');
  check('confirm spends the hit on the battleship', ship && ship.quantity === 1 && ship.damaged === true && ship.damagedCount === 1, ship);
  check('the transport survives with its cargo', transport && transport.quantity === 1 && (transport.cargo || []).length === 1, transport);
}

console.log('=== defender transport is refused the same way ===');
{
  const units = [
    { type: 'destroyer', quantity: 1, owner: 'Japanese' },
    { type: 'transport', quantity: 1, owner: 'Japanese', cargo: [] },
  ];
  const before = units.map((unit) => ({ ...unit }));
  applyCasualtySelection(units, { transport: 1 });
  check('applyCasualtySelection ignores the transport while a destroyer remains',
    units.find((unit) => unit.type === 'transport').quantity === 1
    && units.find((unit) => unit.type === 'destroyer').quantity === before[0].quantity);
}

console.log('=== rules panel ===');
{
  const rules = readFileSync(join(root, 'src/ui/rulesPanel.js'), 'utf8');
  check('the transport line names the casualty ban', rules.includes('Not a casualty while a unit the enemy can hit is still in the battle'));
  check('lone transports are still automatic', rules.includes('Destroyed automatically when it is the only unit and the enemy can hit it'));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\ntransport casualty checks passed');
