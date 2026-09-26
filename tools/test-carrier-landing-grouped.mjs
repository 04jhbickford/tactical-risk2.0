// V2.81.57-unified.17 — a fighter that lands on a grouped carrier survives finalize.
// Run: node tools/test-carrier-landing-grouped.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
const mk = () => {
  const cs = new Set();
  return {
    style: {},
    children: [],
    dataset: {},
    className: '',
    classList: {
      add(...n) { n.forEach((x) => cs.add(x)); },
      remove(...n) { n.forEach((x) => cs.delete(x)); },
      contains(n) { return cs.has(n); },
      toggle() {},
    },
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    removeAttribute() {},
  };
};
globalThis.document ??= {
  documentElement: mk(),
  body: mk(),
  createElement: mk,
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
};
globalThis.window ??= globalThis;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')).href);
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')).href);
const { addMovedAirToTerritory } = await import(pathToFileURL(join(root, 'src/state/airLanding.js')).href);
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

function board(territories) {
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'Germans', name: 'Robert007' },
    { id: 'Americans', name: 'Bastion' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.round = 3;
  gs.playerState = {
    Germans: { ipcs: 10, capitalTerritory: 'Egypt' },
    Americans: { ipcs: 10 },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Egypt']);
  return gs;
}

const T = (name, isWater, connections) => ({ name, isWater, connections });
const MAP = [
  T('Red Sea', true, ['Egypt', 'Arabian Sea']),
  T('Arabian Sea', true, ['Red Sea']),
  T('Egypt', false, ['Red Sea']),
];

function landOnCarrier(carrierId) {
  const gs = board(MAP);
  gs.territoryState = { Egypt: { owner: 'Germans' } };
  const carrier = { type: 'carrier', quantity: 1, owner: 'Germans', moved: true };
  if (carrierId) carrier.id = carrierId;
  gs.units = {
    'Red Sea': [
      carrier,
      { type: 'fighter', quantity: 1, owner: 'Germans', moved: true },
      { type: 'transport', quantity: 1, owner: 'Americans' },
    ],
  };
  gs.units['Arabian Sea'] = [{ type: 'transport', quantity: 1, owner: 'Americans' }];
  gs.combatQueue = ['Red Sea'];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.showNextCombat();
  ui.combatState.defenders = [];
  ui.combatState.winner = 'attacker';
  ui._checkAirLanding();
  const air = ui.combatState.airUnitsToLand || [];
  check(`${carrierId || 'grouped'} offers the battle-zone carrier`, (air[0]?.landingOptions || []).some((opt) => opt.territory === 'Red Sea' && opt.isCarrier));
  ui.combatState.selectedLandings = { [air[0].id]: 'Red Sea' };
  ui._confirmAirLandings();
  return gs;
}

function fightersAboard(gs) {
  return (gs.units['Red Sea'] || [])
    .filter((unit) => unit.type === 'carrier')
    .reduce((sum, carrier) => sum + (carrier.aircraft?.length || 0), 0);
}

for (const id of [null, 'carrier_Germans_1']) {
  const gs = landOnCarrier(id);
  check(`${id || 'grouped'} fighter is on the carrier after finalize`, fightersAboard(gs) === 1, gs.units['Red Sea']);
  const saved = gs.toJSON();
  const loaded = new GameState({ risk: { factions: [] } }, MAP, []);
  loaded.loadFromJSON(saved);
  const aboard = (loaded.units['Red Sea'] || [])
    .filter((unit) => unit.type === 'carrier')
    .reduce((sum, carrier) => sum + (carrier.aircraft?.length || 0), 0);
  check(`${id || 'grouped'} fighter survives save/load`, aboard === 1);
  loaded.nextTurn();
  const afterOpponent = (loaded.units['Red Sea'] || [])
    .filter((unit) => unit.type === 'carrier')
    .reduce((sum, carrier) => sum + (carrier.aircraft?.length || 0), 0);
  check(`${id || 'grouped'} fighter survives the opponent's turn`, afterOpponent === 1 && loaded.currentPlayer.id === 'Americans');
  loaded.nextTurn();
  const afterReturn = (loaded.units['Red Sea'] || [])
    .filter((unit) => unit.type === 'carrier')
    .reduce((sum, carrier) => sum + (carrier.aircraft?.length || 0), 0);
  check(`${id || 'grouped'} fighter is still aboard when the turn comes back`, afterReturn === 1 && loaded.currentPlayer.id === 'Germans');
}

{
  const units = {
    'Red Sea': [{
      type: 'carrier',
      quantity: 2,
      owner: 'Germans',
      aircraft: [{ type: 'fighter', owner: 'Germans' }],
    }],
  };
  const placed = addMovedAirToTerritory(units, {
    destination: 'Red Sea',
    type: 'fighter',
    owner: 'Germans',
    quantity: 1,
    destIsWater: true,
    unitDefs,
    gameState: { _shipIdCounter: 0 },
  });
  const carriers = units['Red Sea'].filter((unit) => unit.type === 'carrier');
  const air = carriers.reduce((sum, carrier) => sum + (carrier.aircraft?.length || 0), 0);
  const hulls = carriers.reduce((sum, carrier) => sum + (carrier.quantity || 1), 0);
  check('grouped pair keeps both hulls and both fighters', placed === 1 && hulls === 2 && air === 2, { hulls, air, carriers });
}

{
  const gs = board(MAP);
  gs.units = {
    'Red Sea': [{
      type: 'carrier',
      quantity: 2,
      owner: 'Germans',
      aircraft: [{ type: 'fighter', owner: 'Germans' }, { type: 'fighter', owner: 'Germans' }],
    }],
  };
  const saved = gs.toJSON();
  const loaded = new GameState({ risk: { factions: [] } }, MAP, []);
  loaded.loadFromJSON(JSON.parse(JSON.stringify(saved)));
  const carrier = loaded.units['Red Sea'].find((unit) => unit.type === 'carrier');
  check('old grouped carrier load keeps aircraft', !carrier.id && carrier.quantity === 2 && carrier.aircraft.length === 2);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\ncarrier landing grouped checks passed');
