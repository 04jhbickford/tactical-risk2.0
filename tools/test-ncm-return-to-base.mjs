// V2.81.57-unified.59 — Classic non-combat Return to base.
// Run: node tools/test-ncm-return-to-base.mjs

import { readFileSync } from 'fs';
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
    id: '',
    className: '',
    innerHTML: '',
    style: {
      removeProperty() {},
      setProperty() {},
    },
    children: [],
    classList: {
      add(...names) { names.forEach((name) => classSet.add(name)); el.className = [...classSet].join(' '); },
      remove(...names) { names.forEach((name) => classSet.delete(name)); el.className = [...classSet].join(' '); },
      contains(name) { return classSet.has(name); },
      toggle(name, force) {
        const has = classSet.has(name);
        const next = force === undefined ? !has : !!force;
        if (next) classSet.add(name);
        else classSet.delete(name);
        el.className = [...classSet].join(' ');
        return next;
      },
    },
    appendChild(child) { this.children.push(child); return child; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    contains() { return false; },
  };
  return el;
}

const sidebar = makeEl();
sidebar.id = 'sidebar';
globalThis.document = {
  documentElement: makeEl(),
  body: makeEl(),
  createElement() { return makeEl(); },
  getElementById(id) { return id === 'sidebar' ? sidebar : null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
};
globalThis.window ??= globalThis;
window.innerWidth = 1280;
window.innerHeight = 800;
window.dispatchEvent = () => {};
globalThis.requestAnimationFrame = (fn) => {
  fn();
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')).href);
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')).href);
const { returnToBaseAssignments, listNcmReturnToBaseMoves, applyNcmReturnToBase } =
  await import(pathToFileURL(join(root, 'src/state/airLanding.js')).href);
const { PlayerPanel } = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')).href);

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
  bomber: { isAir: true, movement: 6, attack: 4, defense: 1 },
  tacticalBomber: { isAir: true, movement: 4, attack: 3, defense: 3 },
  carrier: { isSea: true, movement: 2, aircraftCapacity: 2, canCarry: ['fighter', 'tacticalBomber'] },
};

const territories = [
  { name: 'Home', isWater: false, connections: ['Battle', 'AllyLand'] },
  { name: 'AllyLand', isWater: false, connections: ['Home', 'Battle'] },
  { name: 'Battle', isWater: false, connections: ['Home', 'AllyLand', 'Sea'] },
  { name: 'Sea', isWater: true, connections: ['Battle'] },
];

function qty(gs, territory, type, owner = 'usa') {
  return (gs.units[territory] || [])
    .filter((unit) => unit.type === type && unit.owner === owner && !unit.id)
    .reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
}

function aboard(gs, territory, type = 'fighter') {
  return (gs.units[territory] || [])
    .filter((unit) => unit.type === 'carrier')
    .reduce((sum, unit) => sum + (unit.aircraft || []).filter((craft) => craft.type === type).length, 0);
}

function makeState({
  mapId = 'classic',
  phaseTurn = TURN_PHASES.NON_COMBAT_MOVE,
  ai = false,
} = {}) {
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.mapId = mapId;
  gs.players = [{
    id: 'usa',
    name: 'Robfox',
    oderId: 'robfox',
    isAI: ai,
    color: '#2244aa',
    alliance: 'allies',
  }, {
    id: 'uk',
    name: 'UK',
    oderId: 'uk',
    isAI: true,
    color: '#aa2222',
    alliance: 'allies',
  }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = phaseTurn;
  gs.playerState = {
    usa: { ipcs: 20, capitalTerritory: 'Home' },
    uk: { ipcs: 20, capitalTerritory: 'AllyLand' },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Home', 'AllyLand']);
  gs.combatQueue = [];
  gs.raidQueue = [];
  gs.moveHistory = [];
  gs.autoSave = () => {};
  gs._unitDefs = unitDefs;
  gs.unitDefs = unitDefs;
  gs.units = {
    Home: [{ type: 'infantry', quantity: 1, owner: 'usa' }],
    AllyLand: [{ type: 'infantry', quantity: 1, owner: 'uk' }],
    Battle: [],
    Sea: [],
  };
  gs.territoryState = {
    Home: { owner: 'usa' },
    AllyLand: { owner: 'uk' },
    Battle: { owner: 'germany' },
    Sea: { owner: null },
  };
  gs.airUnitOrigins = {};
  return gs;
}

function park(gs, territory, unit) {
  gs.units[territory] = gs.units[territory] || [];
  gs.units[territory].push(unit);
}

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  check('display stamp is V2.81.57-unified.59', GAME_VERSION === 'V2.81.57-unified.59');
  check('schema stays 11', SCHEMA_VERSION === 11);
  check('index.html carries the display stamp',
    html.includes('content="V2.81.57-unified.59"')
    && html.includes("window.__TR_GAME_VERSION = 'V2.81.57-unified.59'")
    && html.includes("var LOCKED = 'V2.81.57-unified.59'")
    && html.includes('style.css?v=V2.81.57-unified.59')
    && html.includes('src/main.js?v=V2.81.57-unified.59'));
}

console.log('=== returnToBaseAssignments still refuses a bomber sea origin ===');
{
  const seaOnly = returnToBaseAssignments(
    [{ type: 'bomber', quantity: 1, landingOptions: [{ territory: 'Sea', isCarrier: true, distance: 1 }] }],
    { bomber: { origin: 'Sea' } },
  );
  check('bomber sea origin stays unresolved',
    seaOnly.unresolved.length === 1 && !seaOnly.selections.bomber_0);
  const land = returnToBaseAssignments(
    [{ type: 'fighter', quantity: 1, landingOptions: [{ territory: 'Home', isCarrier: false, distance: 1 }] }],
    { fighter: { origin: 'Home' } },
  );
  check('fighter land origin is assigned', land.selections.fighter_0 === 'Home' && land.unresolved.length === 0);
}

console.log('=== solo Classic non-combat sends eligible aircraft home ===');
{
  const gs = makeState();
  gs.turnPhase = TURN_PHASES.COMBAT;
  park(gs, 'Battle', { type: 'fighter', quantity: 2, owner: 'usa', moved: true });
  park(gs, 'Battle', { type: 'bomber', quantity: 1, owner: 'usa', moved: true });
  gs.airUnitOrigins = {
    Battle: {
      fighter: { origin: 'Home', distance: 1, movement: 4 },
      bomber: { origin: 'Home', distance: 2, movement: 6 },
    },
  };
  gs.nextPhase();
  check('combat ends in non-combat with both types still airborne',
    gs.turnPhase === TURN_PHASES.NON_COMBAT_MOVE
    && qty(gs, 'Battle', 'fighter') === 2
    && qty(gs, 'Battle', 'bomber') === 1);
  const planned = listNcmReturnToBaseMoves(gs, unitDefs);
  check('both stacks are eligible',
    planned.some((row) => row.type === 'fighter' && row.to === 'Home' && row.quantity === 2)
    && planned.some((row) => row.type === 'bomber' && row.to === 'Home' && row.quantity === 1),
    planned);
  const manual = makeState();
  park(manual, 'Battle', { type: 'fighter', quantity: 2, owner: 'usa' });
  park(manual, 'Battle', { type: 'bomber', quantity: 1, owner: 'usa' });
  manual.airUnitOrigins = JSON.parse(JSON.stringify(gs.airUnitOrigins));
  manual.moveUnits('Battle', 'Home', [{ type: 'fighter', quantity: 2 }], unitDefs);
  manual.moveUnits('Battle', 'Home', [{ type: 'bomber', quantity: 1 }], unitDefs);

  const result = applyNcmReturnToBase(gs, unitDefs);
  check('return moves both stacks', result.moved === 3, result);
  check('they are on Home and gone from the battle',
    qty(gs, 'Home', 'fighter') === 2
    && qty(gs, 'Home', 'bomber') === 1
    && qty(gs, 'Battle', 'fighter') === 0
    && qty(gs, 'Battle', 'bomber') === 0);
  check('origins match a manual non-combat hop',
    JSON.stringify(gs.airUnitOrigins) === JSON.stringify(manual.airUnitOrigins),
    { got: gs.airUnitOrigins, manual: manual.airUnitOrigins });
  check('a second click finds nothing left to send',
    listNcmReturnToBaseMoves(gs, unitDefs).length === 0
    && applyNcmReturnToBase(gs, unitDefs).moved === 0);
  const undone = gs.undoLastMove();
  check('undo puts the last stack back over the battle',
    undone.success === true && qty(gs, 'Battle', 'bomber') === 1 && qty(gs, 'Home', 'bomber') === 0,
    undone);
}

console.log('=== ineligible aircraft stay put ===');
{
  const gs = makeState();
  park(gs, 'Battle', { type: 'fighter', quantity: 1, owner: 'usa' });
  park(gs, 'Battle', { type: 'bomber', quantity: 1, owner: 'usa' });
  park(gs, 'Battle', { type: 'tacticalBomber', quantity: 1, owner: 'usa', moved: true });
  gs.airUnitOrigins = {
    Battle: {
      fighter: { origin: 'Home', distance: 4, movement: 4 },
      bomber: { origin: 'Sea', distance: 1, movement: 6 },
    },
  };
  const planned = listNcmReturnToBaseMoves(gs, unitDefs);
  check('out of range, a sea bomber, and a spent tactical bomber are skipped',
    planned.length === 0, planned);
  const result = applyNcmReturnToBase(gs, unitDefs);
  check('nothing moves and nothing is removed',
    result.moved === 0
    && qty(gs, 'Battle', 'fighter') === 1
    && qty(gs, 'Battle', 'bomber') === 1
    && qty(gs, 'Battle', 'tacticalBomber') === 1
    && qty(gs, 'Sea', 'bomber') === 0
    && (gs.moveHistory || []).length === 0);
}

console.log('=== carrier and ally origins ===');
{
  const narrow = {
    ...unitDefs,
    carrier: { ...unitDefs.carrier, aircraftCapacity: 1 },
  };
  const gs = makeState();
  park(gs, 'Battle', { type: 'fighter', quantity: 2, owner: 'usa' });
  park(gs, 'Sea', { type: 'carrier', quantity: 1, owner: 'usa', id: 'cv1', aircraft: [] });
  gs.airUnitOrigins = { Battle: { fighter: { origin: 'Sea', distance: 1, movement: 4 } } };
  const result = applyNcmReturnToBase(gs, narrow);
  check('one fighter boards the only carrier slot',
    result.moved === 1 && aboard(gs, 'Sea') === 1 && qty(gs, 'Battle', 'fighter') === 1,
    { result, sea: gs.units.Sea, battle: gs.units.Battle });
  check('the fighter that does not fit is still airborne', qty(gs, 'Battle', 'fighter') === 1);

  const ally = makeState();
  ally.alliancesEnabled = true;
  park(ally, 'Battle', { type: 'fighter', quantity: 1, owner: 'usa' });
  park(ally, 'Sea', { type: 'carrier', quantity: 1, owner: 'uk', id: 'cv-uk', aircraft: [] });
  ally.airUnitOrigins = { Battle: { fighter: { origin: 'Sea', distance: 1, movement: 4 } } };
  const allied = applyNcmReturnToBase(ally, unitDefs);
  check('a fighter may return to an allied carrier',
    allied.moved === 1 && aboard(ally, 'Sea') === 1 && qty(ally, 'Battle', 'fighter') === 0,
    allied);

  const land = makeState();
  land.alliancesEnabled = true;
  park(land, 'Battle', { type: 'tacticalBomber', quantity: 1, owner: 'usa' });
  land.airUnitOrigins = { Battle: { tacticalBomber: { origin: 'AllyLand', distance: 1, movement: 4 } } };
  const home = applyNcmReturnToBase(land, unitDefs);
  check('a tactical bomber returns to allied land',
    home.moved === 1 && qty(land, 'AllyLand', 'tacticalBomber') === 1);

  const grounded = makeState();
  park(grounded, 'Home', { type: 'fighter', quantity: 1, owner: 'usa' });
  grounded.airUnitOrigins = { Home: { fighter: { origin: 'AllyLand', distance: 1, movement: 4 } } };
  check('a fighter already on friendly land is not airborne',
    listNcmReturnToBaseMoves(grounded, unitDefs).length === 0
    && applyNcmReturnToBase(grounded, unitDefs).moved === 0
    && qty(grounded, 'Home', 'fighter') === 1);
}

console.log('=== Pacific non-combat does not take the Classic button path ===');
{
  const gs = makeState({ mapId: 'pacific' });
  park(gs, 'Battle', { type: 'fighter', quantity: 1, owner: 'usa' });
  gs.airUnitOrigins = { Battle: { fighter: { origin: 'Home', distance: 1, movement: 4 } } };
  check('Pacific lists no non-combat return', listNcmReturnToBaseMoves(gs, unitDefs).length === 0);
  check('Pacific apply leaves the fighter',
    applyNcmReturnToBase(gs, unitDefs).moved === 0 && qty(gs, 'Battle', 'fighter') === 1);
  const ai = makeState({ ai: true });
  park(ai, 'Battle', { type: 'fighter', quantity: 1, owner: 'usa' });
  ai.airUnitOrigins = { Battle: { fighter: { origin: 'Home', distance: 1, movement: 4 } } };
  check('an AI turn does not bulk-return',
    listNcmReturnToBaseMoves(ai, unitDefs).length === 0
    && applyNcmReturnToBase(ai, unitDefs).moved === 0);
}

console.log('=== the panel shows Return to base for solo Classic ===');
{
  const gs = makeState();
  park(gs, 'Battle', { type: 'fighter', quantity: 1, owner: 'usa' });
  gs.airUnitOrigins = { Battle: { fighter: { origin: 'Home', distance: 1, movement: 4 } } };
  const panel = new PlayerPanel();
  panel.setUnitDefs(unitDefs);
  panel.setTerritories(territories);
  panel.setGameState(gs);
  panel.flushRender();
  const html = panel.contentEl.innerHTML || '';
  const splitAt = html.indexOf('pp-bottom-actions');
  const actions = splitAt < 0 ? html : html.slice(0, splitAt);
  const bar = splitAt < 0 ? '' : html.slice(splitAt);
  check('desktop Actions shows Return to base', actions.includes('>Return to base</button>'), html.slice(0, 400));
  check('desktop bottom bar does not repeat it', !bar.includes('>Return to base</button>'));
  check('the control uses the existing action',
    actions.includes('data-action="return-air-to-base"'));

  const returned = panel._returnAirborneDuringNonCombat();
  check('the panel click sends the fighter home',
    returned === true && qty(gs, 'Home', 'fighter') === 1 && qty(gs, 'Battle', 'fighter') === 0);
  panel.flushRender();
  check('the button hides once nothing can return',
    !(panel.contentEl.innerHTML || '').includes('>Return to base</button>'));

  const phone = makeState();
  park(phone, 'Battle', { type: 'fighter', quantity: 1, owner: 'usa' });
  phone.airUnitOrigins = { Battle: { fighter: { origin: 'Home', distance: 1, movement: 4 } } };
  document.documentElement.classList.add('mobile-shell');
  window.innerWidth = 390;
  const phonePanel = new PlayerPanel();
  phonePanel.setUnitDefs(unitDefs);
  phonePanel.setTerritories(territories);
  phonePanel.setGameState(phone);
  phonePanel.flushRender();
  const phoneHtml = phonePanel.contentEl.innerHTML || '';
  const phoneSplit = phoneHtml.indexOf('pp-bottom-actions');
  const phoneBar = phoneSplit < 0 ? '' : phoneHtml.slice(phoneSplit);
  const phoneActions = phoneSplit < 0 ? phoneHtml : phoneHtml.slice(0, phoneSplit);
  check('phone peek puts Return to base on the bottom bar',
    phoneBar.includes('>Return to base</button>') && phoneBar.includes('pp-ncm-return-base'),
    phoneHtml.slice(0, 500));
  check('phone peek does not also leave it in the hidden Actions body',
    !phoneActions.includes('>Return to base</button>'));

  phone.isMultiplayer = true;
  phonePanel.localUserId = 'someone-else';
  phonePanel.flushRender();
  check('another multiplayer seat does not see Return to base',
    !(phonePanel.contentEl.innerHTML || '').includes('>Return to base</button>'));
  phonePanel.localUserId = 'robfox';
  phonePanel.flushRender();
  check('the local multiplayer seat does see Return to base',
    (phonePanel.contentEl.innerHTML || '').includes('>Return to base</button>'));

  document.documentElement.classList.remove('mobile-shell');
  window.innerWidth = 1280;

  const quiet = makeState();
  park(quiet, 'Battle', { type: 'fighter', quantity: 1, owner: 'usa' });
  quiet.airUnitOrigins = { Battle: { fighter: { origin: 'Home', distance: 4, movement: 4 } } };
  const quietPanel = new PlayerPanel();
  quietPanel.setUnitDefs(unitDefs);
  quietPanel.setTerritories(territories);
  quietPanel.setGameState(quiet);
  quietPanel.flushRender();
  check('no eligible aircraft hides the button',
    !(quietPanel.contentEl.innerHTML || '').includes('>Return to base</button>'));

  const pacific = makeState({ mapId: 'pacific', phaseTurn: TURN_PHASES.COMBAT });
  park(pacific, 'Battle', { type: 'fighter', quantity: 1, owner: 'usa', moved: true });
  pacific.airUnitOrigins = { Battle: { fighter: { origin: 'Home', distance: 1, movement: 4 } } };
  const pacificPanel = new PlayerPanel();
  pacificPanel.setUnitDefs(unitDefs);
  pacificPanel.setTerritories(territories);
  pacificPanel.setGameState(pacific);
  pacificPanel.airLandingData = {
    combatTerritory: 'Battle',
    airUnitsToLand: [{
      type: 'fighter',
      quantity: 1,
      landingOptions: [{ territory: 'Home', isCarrier: false, distance: 1 }],
    }],
  };
  pacificPanel.airLandingSelections = {};
  pacificPanel._returnAirToBase();
  check('Pacific post-combat Return to base still assigns the origin',
    pacificPanel.airLandingSelections.fighter_0 === 'Home',
    pacificPanel.airLandingSelections);
  check('that assignment does not use the non-combat bulk return',
    qty(pacific, 'Battle', 'fighter') === 1 && listNcmReturnToBaseMoves(pacific, unitDefs).length === 0);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall passed');
