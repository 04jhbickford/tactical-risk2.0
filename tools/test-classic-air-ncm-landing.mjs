// V2.81.57-unified.49 — Classic air stays airborne after combat and
// lands, or is lost, only at the end of non-combat movement.
// Run: node tools/test-classic-air-ncm-landing.mjs

import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}
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
const { SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true, movement: 1, attack: 1, defense: 2 },
  fighter: { isAir: true, movement: 4, attack: 3, defense: 4 },
  carrier: { isSea: true, movement: 2, aircraftCapacity: 2, canCarry: ['fighter'] },
};

const territories = [
  { name: 'Home', isWater: false, connections: ['Battle'] },
  { name: 'Battle', isWater: false, connections: ['Home', 'Sea'] },
  { name: 'Sea', isWater: true, connections: ['Battle'] },
];

function qty(gs, territory, type) {
  return (gs.units[territory] || [])
    .filter((unit) => unit.type === type && unit.owner === 'usa' && !unit.id)
    .reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
}

function aboard(gs, territory) {
  return (gs.units[territory] || [])
    .filter((unit) => unit.type === 'carrier')
    .reduce((sum, unit) => sum + (unit.aircraft || []).filter((craft) => craft.type === 'fighter').length, 0);
}

function makeState({ mapId = 'classic', distance = 1, sea = false } = {}) {
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.mapId = mapId;
  gs.players = [{ id: 'usa', name: 'Robfox', oderId: 'robfox', isAI: false }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.playerState = { usa: { ipcs: 20, capitalTerritory: 'Home' } };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Home']);
  gs.combatQueue = [];
  gs.raidQueue = [];
  gs.autoSave = () => {};
  gs._unitDefs = unitDefs;
  gs.unitDefs = unitDefs;
  const where = sea ? 'Sea' : 'Battle';
  gs.units = {
    Home: [{ type: 'infantry', quantity: 1, owner: 'usa' }],
    Battle: sea ? [] : [{ type: 'fighter', quantity: 1, owner: 'usa', moved: true }],
    Sea: sea
      ? [
        { type: 'fighter', quantity: 1, owner: 'usa', moved: true },
        { type: 'carrier', quantity: 1, owner: 'usa', id: 'cv1', aircraft: [] },
      ]
      : [],
  };
  gs.territoryState = {
    Home: { owner: 'usa' },
    Battle: { owner: 'usa' },
    Sea: { owner: null },
  };
  gs.airUnitOrigins = {
    [where]: { fighter: { origin: 'Home', distance, movement: 4 } },
  };
  return gs;
}

console.log('=== schema ===');
{
  const gs = makeState();
  check('schema stays 11', SCHEMA_VERSION === 11 && gs.toJSON().version === 11);
}

console.log('=== Classic air stays up after combat, then lands in non-combat ===');
{
  const gs = makeState({ distance: 1 });
  gs.nextPhase();
  check('combat ends in non-combat movement', gs.turnPhase === TURN_PHASES.NON_COMBAT_MOVE);
  check('the fighter is still airborne over the battle', qty(gs, 'Battle', 'fighter') === 1 && qty(gs, 'Home', 'fighter') === 0);
  const tooFar = gs.moveUnits('Battle', 'Home', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('one step home is inside the movement left', tooFar.success === true, tooFar.error);
  check('the fighter landed on home during non-combat', qty(gs, 'Home', 'fighter') === 1 && qty(gs, 'Battle', 'fighter') === 0);
  gs.nextPhase();
  check('a legal landing is not lost at the end of non-combat',
    qty(gs, 'Home', 'fighter') === 1 && (gs.lastNcmAirCrashes || []).length === 0);
}

console.log('=== Classic air with no legal spot is lost only at the end of non-combat ===');
{
  const gs = makeState({ distance: 4 });
  gs.nextPhase();
  check('no-landing fighter is still airborne after combat', qty(gs, 'Battle', 'fighter') === 1);
  const illegal = gs.moveUnits('Battle', 'Home', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('no movement left cannot reach home', illegal.success === false);
  check('the failed hop leaves the fighter in the air', qty(gs, 'Battle', 'fighter') === 1);
  gs.nextPhase();
  check('the fighter is lost at the end of non-combat',
    qty(gs, 'Battle', 'fighter') === 0
    && (gs.lastNcmAirCrashes || []).some((row) => row.type === 'fighter' && row.territory === 'Battle' && row.quantity === 1));
}

console.log('=== Classic sea battle can land on the carrier during non-combat ===');
{
  const gs = makeState({ sea: true, distance: 1 });
  gs.nextPhase();
  check('the fighter is still loose over the sea after combat', qty(gs, 'Sea', 'fighter') === 1 && aboard(gs, 'Sea') === 0);
  const landed = gs.moveUnits('Sea', 'Sea', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('non-combat loads the fighter onto the carrier in that sea zone', landed.success === true, landed.error);
  check('the fighter is aboard', aboard(gs, 'Sea') === 1 && qty(gs, 'Sea', 'fighter') === 0);
  gs.nextPhase();
  check('a carrier landing is not destroyed', (gs.lastNcmAirCrashes || []).length === 0 && aboard(gs, 'Sea') === 1);
}

console.log('=== Classic combat does not open the landing picker ===');
{
  const gs = makeState();
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  let prompts = 0;
  ui.setOnAirLandingRequired(() => { prompts += 1; });
  ui.currentTerritory = 'Battle';
  ui.combatState = {
    attackers: [{ type: 'fighter', quantity: 1, owner: 'usa' }],
    phase: 'selectCasualties',
    isRetreating: false,
  };
  ui._checkAirLanding();
  check('the battle resolves with the fighter still to land later',
    ui.combatState.phase === 'resolved' && prompts === 0);
  ui.combatState.isRetreating = true;
  ui.combatState.phase = 'selectCasualties';
  ui._checkAirLanding();
  check('a retreat still asks where the aircraft will land',
    ui.combatState.phase === 'airLanding' && prompts === 1);
}

console.log('=== Pacific still lands when combat ends ===');
{
  const gs = makeState({ mapId: 'pacific', distance: 1 });
  gs.nextPhase();
  check('Pacific moves the fighter off the battle as combat ends',
    qty(gs, 'Battle', 'fighter') === 0 && qty(gs, 'Home', 'fighter') === 1);
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  let prompts = 0;
  ui.setOnAirLandingRequired(() => { prompts += 1; });
  ui.currentTerritory = 'Battle';
  ui.combatState = {
    attackers: [{ type: 'fighter', quantity: 1, owner: 'usa' }],
    phase: 'selectCasualties',
    isRetreating: false,
  };
  ui._checkAirLanding();
  check('Pacific still opens the landing picker when the battle ends',
    ui.combatState.phase === 'airLanding' && prompts === 1);
}

console.log('=== Classic AI lands during non-combat, not as combat ends ===');
{
  const gs = makeState({ distance: 1 });
  gs.players[0].isAI = true;
  gs.nextPhase();
  check('AI fighter is still airborne when non-combat starts', qty(gs, 'Battle', 'fighter') === 1);
  const landed = gs.landAirDuringNonCombat(unitDefs);
  check('AI lands that fighter during non-combat', landed.landed === 1 && qty(gs, 'Home', 'fighter') === 1);
  gs.nextPhase();
  check('that landing is kept', qty(gs, 'Home', 'fighter') === 1 && (gs.lastNcmAirCrashes || []).length === 0);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nClassic air landing timing checks passed');
