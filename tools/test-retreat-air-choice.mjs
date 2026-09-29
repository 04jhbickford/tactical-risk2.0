// V2.81.57-unified.27 — retreating aircraft pick their own landing.
// Run: node tools/test-retreat-air-choice.mjs

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
globalThis.window ??= globalThis;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const { bindGameEventLog, unbindGameEventLog } = await import(pathToFileURL(join(root, 'src/multiplayer/gameEventLog.js')));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

function qty(gs, territory, type, owner) {
  return (gs.units[territory] || [])
    .filter((unit) => unit.type === type && (!owner || unit.owner === owner))
    .reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
}

function makeState(territories, { ai = false } = {}) {
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'Americans', name: 'Bastion', color: '#1a4', isAI: ai },
    { id: 'Japanese', name: 'Robert007', color: '#c33', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.playerState = {
    Americans: { ipcs: 20, capitalTerritory: 'Home' },
    Japanese: { ipcs: 20, capitalTerritory: 'Japan' },
  };
  gs.unitDefs = unitDefs;
  gs._unitDefs = unitDefs;
  gs._notify = () => {};
  return gs;
}

console.log('=== land retreat: each aircraft picks a different friendly territory ===');
{
  const events = [];
  bindGameEventLog({ log(kind, fields) { events.push({ kind, fields }); } });
  const territories = [
    { name: 'Battle', isWater: false, connections: ['Home', 'Other'] },
    { name: 'Home', isWater: false, connections: ['Battle'] },
    { name: 'Other', isWater: false, connections: ['Battle'] },
  ];
  const gs = makeState(territories);
  gs.territoryState = {
    Battle: { owner: 'Japanese' },
    Home: { owner: 'Americans' },
    Other: { owner: 'Americans' },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Home', 'Other']);
  gs.units = {
    Battle: [
      { type: 'infantry', quantity: 1, owner: 'Americans' },
      { type: 'fighter', quantity: 1, owner: 'Americans' },
      { type: 'bomber', quantity: 1, owner: 'Americans' },
      { type: 'infantry', quantity: 1, owner: 'Japanese' },
    ],
    Home: [],
    Other: [],
  };
  gs.airUnitOrigins = {
    Battle: {
      fighter: { origin: 'Home', distance: 1, movement: 4 },
      bomber: { origin: 'Home', distance: 1, movement: 6 },
    },
  };
  gs.moveHistory = [{ from: 'Home', to: 'Battle', player: 'Americans' }];
  gs.combatQueue = ['Battle'];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.currentTerritory = 'Battle';
  ui.combatState = {
    attackers: [
      { type: 'infantry', quantity: 1, owner: 'Americans' },
      { type: 'fighter', quantity: 1, owner: 'Americans' },
      { type: 'bomber', quantity: 1, owner: 'Americans' },
    ],
    defenders: [{ type: 'infantry', quantity: 1, owner: 'Japanese' }],
    phase: 'ready',
  };
  ui.combatState.retreatOptions = ['Home', 'Other'];
  ui.combatState.phase = 'selectRetreat';
  ui._render();
  const phone = ui._renderPhoneCombatSelectBody('selectRetreat');
  check('the retreat UI says aircraft choose their own landing',
    (ui.el.innerHTML || '').includes('Aircraft will choose their own landing.')
    && phone.includes('Aircraft will choose their own landing.'));
  ui._executeRetreat('Home');
  check('the landing picker opens', ui.combatState.phase === 'airLanding');
  const ids = Object.fromEntries((ui.combatState.airUnitsToLand || []).map((unit) => [unit.type, unit.id]));
  const fighterOptions = (ui.combatState.airUnitsToLand || []).find((unit) => unit.type === 'fighter')?.landingOptions || [];
  check('the fighter still has remaining movement',
    fighterOptions.some((opt) => opt.territory === 'Other' || opt.territory === 'Home'));
  ui.combatState.selectedLandings = {
    [ids.fighter]: 'Home',
    [ids.bomber]: 'Other',
  };
  ui._confirmAirLandings();
  check('infantry retreated to the one destination', qty(gs, 'Home', 'infantry', 'Americans') === 1 && qty(gs, 'Other', 'infantry', 'Americans') === 0);
  check('the fighter and the bomber landed apart',
    qty(gs, 'Home', 'fighter', 'Americans') === 1 && qty(gs, 'Other', 'bomber', 'Americans') === 1);
  check('neither aircraft stayed over the battle', qty(gs, 'Battle', 'fighter') === 0 && qty(gs, 'Battle', 'bomber') === 0);
  const retreat = events.find((event) => event.kind === 'retreat');
  const logged = retreat?.fields?.payload?.units || [];
  check('the retreat log keeps real quantities',
    logged.length === 3 && logged.every((unit) => unit.quantity === 1), logged);
  unbindGameEventLog();
}

console.log('=== naval retreat: fighter to a carrier, bomber to land ===');
{
  const events = [];
  bindGameEventLog({ log(kind, fields) { events.push({ kind, fields }); } });
  const territories = [
    { name: 'East', isWater: true, connections: ['West', 'CarrierSea', 'Coast'] },
    { name: 'West', isWater: true, connections: ['East'] },
    { name: 'CarrierSea', isWater: true, connections: ['East'] },
    { name: 'Coast', isWater: false, connections: ['East'] },
  ];
  const gs = makeState(territories);
  gs.territoryState = { Coast: { owner: 'Americans' } };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Coast']);
  gs.units = {
    East: [
      { type: 'cruiser', quantity: 1, owner: 'Americans' },
      { type: 'fighter', quantity: 1, owner: 'Americans' },
      { type: 'bomber', quantity: 1, owner: 'Americans' },
    ],
    West: [],
    CarrierSea: [{ type: 'carrier', id: 'carrier_away', owner: 'Americans', quantity: 1, aircraft: [] }],
    Coast: [],
  };
  gs.airUnitOrigins = {
    East: {
      fighter: { origin: 'West', distance: 1, movement: 4 },
      bomber: { origin: 'West', distance: 1, movement: 6 },
    },
  };
  gs.moveHistory = [{ from: 'West', to: 'East', player: 'Americans' }];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.currentTerritory = 'East';
  ui.combatState = {
    attackers: gs.units.East.map((unit) => ({ ...unit })),
    defenders: [],
    phase: 'ready',
  };
  ui._executeRetreat('West');
  const byType = Object.fromEntries((ui.combatState.airUnitsToLand || []).map((unit) => [unit.type, unit]));
  const bomberSeas = (byType.bomber?.landingOptions || []).filter((opt) => opt.isCarrier || opt.territory === 'West' || opt.territory === 'CarrierSea');
  check('a bomber is not offered a sea zone', bomberSeas.length === 0, byType.bomber?.landingOptions);
  check('the fighter can reach the other carrier',
    (byType.fighter?.landingOptions || []).some((opt) => opt.territory === 'CarrierSea' && opt.isCarrier));
  ui.combatState.selectedLandings = {
    [byType.fighter.id]: 'CarrierSea',
    [byType.bomber.id]: 'Coast',
  };
  ui._confirmAirLandings();
  const carrier = (gs.units.CarrierSea || []).find((unit) => unit.id === 'carrier_away');
  check('the cruiser used the single retreat sea zone', qty(gs, 'West', 'cruiser') === 1);
  check('the fighter landed on the carrier elsewhere',
    (carrier?.aircraft || []).some((craft) => craft.type === 'fighter' && craft.owner === 'Americans'));
  check('the bomber landed on land', qty(gs, 'Coast', 'bomber') === 1 && qty(gs, 'West', 'bomber') === 0 && qty(gs, 'CarrierSea', 'bomber') === 0);
  const retreat = events.find((event) => event.kind === 'retreat');
  const logged = retreat?.fields?.payload?.units || [];
  check('naval retreat log keeps real quantities', logged.length === 3 && logged.every((unit) => unit.quantity === 1), logged);
  unbindGameEventLog();
}

console.log('=== AI lands retreating air on the best legal option ===');
{
  const territories = [
    { name: 'East', isWater: true, connections: ['West', 'CarrierSea', 'Coast'] },
    { name: 'West', isWater: true, connections: ['East'] },
    { name: 'CarrierSea', isWater: true, connections: ['East'] },
    { name: 'Coast', isWater: false, connections: ['East'] },
  ];
  const gs = makeState(territories, { ai: true });
  gs.territoryState = { Coast: { owner: 'Americans' } };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Coast']);
  gs.units = {
    East: [
      { type: 'cruiser', quantity: 1, owner: 'Americans' },
      { type: 'fighter', quantity: 1, owner: 'Americans' },
      { type: 'bomber', quantity: 1, owner: 'Americans' },
    ],
    West: [],
    CarrierSea: [{ type: 'carrier', id: 'carrier_away', owner: 'Americans', quantity: 1, aircraft: [] }],
    Coast: [],
  };
  gs.moveHistory = [{ from: 'West', to: 'East', player: 'Americans' }];
  const result = gs.retreatToTerritory('East', 'West');
  check('AI retreat succeeds', result.success === true, result);
  check('AI bomber takes the friendly land', qty(gs, 'Coast', 'bomber') === 1);
  check('AI fighter prefers that land over the carrier', qty(gs, 'Coast', 'fighter') === 1);
  const carrier = (gs.units.CarrierSea || []).find((unit) => unit.id === 'carrier_away');
  check('the carrier is still empty', !(carrier?.aircraft || []).length);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nretreat air choice checks passed');
