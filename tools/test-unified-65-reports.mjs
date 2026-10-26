// unified.65 — Discord reports from 21 Oct 2026.
// Run: node tools/test-unified-65-reports.mjs

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
        names.forEach((name) => classSet.add(name));
        el.className = [...classSet].join(' ');
      },
      remove(...names) {
        names.forEach((name) => classSet.delete(name));
        el.className = [...classSet].join(' ');
      },
      contains(name) { return classSet.has(name); },
      toggle(name, force) {
        if (force === undefined) {
          if (classSet.has(name)) this.remove(name);
          else this.add(name);
        } else if (force) this.add(name);
        else this.remove(name);
        return classSet.has(name);
      },
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
globalThis.Image ??= class Image {
  set src(_) {}
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { GAME_VERSION, SCHEMA_VERSION, compatClientVersion } = await import(pathToFileURL(join(root, 'src/version.js')));
const { CombatUI, AA_RESULT_PHASE } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const { legalMoveForDestination, moveUnitKey } = await import(pathToFileURL(join(root, 'src/state/combatMoveEligibility.js')));
const { shouldApplyRemoteGameState } = await import(pathToFileURL(join(root, 'src/state/placementPass.js')));
const { PlayerPanel } = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const { AIController } = await import(pathToFileURL(join(root, 'src/ai/aiController.js')));
const { UnitRenderer } = await import(pathToFileURL(join(root, 'src/map/unitRenderer.js')));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra));
  } else console.log('ok  :', label);
};

function board(territories) {
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'italians', name: 'Italy', isAI: false },
    { id: 'british', name: 'UK', isAI: true, aiDifficulty: 'easy' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.playerState = {
    italians: { ipcs: 40, capitalTerritory: 'Italy', hasPlacedCapital: true },
    british: { ipcs: 30, capitalTerritory: 'Britain', hasPlacedCapital: true },
  };
  gs.playerTechs = {
    italians: { techTokens: 0, unlockedTechs: [] },
    british: { techTokens: 0, unlockedTechs: [] },
  };
  gs.territoryState = {};
  gs.units = {};
  for (const territory of territories) {
    gs.territoryState[territory.name] = { owner: territory.isWater ? null : 'british' };
    gs.units[territory.name] = [];
  }
  gs._notify = () => {};
  gs._unitDefs = unitDefs;
  return gs;
}

function inf(owner = 'italians') {
  return { type: 'infantry', owner };
}

console.log('=== stamp ===');
{
  check('display stamp is V2.81.57-unified.68', GAME_VERSION === 'V2.81.57-unified.68');
  check('schema stays 11', SCHEMA_VERSION === 11);
  check('game docs write V2.82-unified.68', compatClientVersion() === 'V2.82-unified.68');
}

console.log('=== 1. one AA die per aircraft ===');
{
  const gs = board([
    { name: 'Syria Jordan', isWater: false, connections: ['Italy'], production: 1 },
    { name: 'Italy', isWater: false, connections: ['Syria Jordan'], production: 2 },
  ]);
  gs.territoryState['Syria Jordan'].owner = 'british';
  gs.territoryState.Italy.owner = 'italians';
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.units['Syria Jordan'] = [
    { type: 'bomber', quantity: 1, owner: 'italians' },
    { type: 'fighter', quantity: 1, owner: 'italians' },
    { type: 'aaGun', quantity: 1, owner: 'british' },
    { type: 'infantry', quantity: 1, owner: 'british' },
  ];
  let n = 0;
  gs._rollDie = (ctx) => {
    if (ctx?.context !== 'aa') return 6;
    n += 1;
    return n === 1 ? 1 : 6;
  };
  gs.combatQueue = ['Syria Jordan'];
  gs.resolveCombat('Syria Jordan', unitDefs);
  const left = (type) => (gs.units['Syria Jordan'] || [])
    .filter((unit) => unit.type === type && unit.owner === 'italians')
    .reduce((sum, unit) => sum + (unit.quantity || 0), 0);
  check('the bomber die hits the bomber and the fighter die misses', left('bomber') === 0 && left('fighter') === 1);
  check('the AA gun is still there', (gs.units['Syria Jordan'] || []).some((unit) => unit.type === 'aaGun' && unit.quantity > 0));

  const uiGame = board([
    { name: 'Syria Jordan', isWater: false, connections: ['Italy'], production: 1 },
    { name: 'Italy', isWater: false, connections: ['Syria Jordan'], production: 2 },
  ]);
  uiGame.territoryState['Syria Jordan'].owner = 'british';
  uiGame.territoryState.Italy.owner = 'italians';
  uiGame.turnPhase = TURN_PHASES.COMBAT;
  uiGame.units['Syria Jordan'] = [
    { type: 'bomber', quantity: 1, owner: 'italians' },
    { type: 'fighter', quantity: 1, owner: 'italians' },
    { type: 'aaGun', quantity: 1, owner: 'british' },
    { type: 'infantry', quantity: 1, owner: 'british' },
  ];
  uiGame.combatQueue = ['Syria Jordan'];
  let roll = 0;
  uiGame._rollDie = () => {
    roll += 1;
    return roll === 1 ? 1 : 6;
  };
  const ui = new CombatUI();
  ui.setGameState(uiGame);
  ui.setUnitDefs(unitDefs);
  ui.actionLog = { log() {}, entries: [] };
  ui.showNextCombat();
  ui._rollAAFire();
  const attackers = ui.combatState.attackers;
  const qtyOf = (type) => attackers.filter((unit) => unit.type === type).reduce((sum, unit) => sum + (unit.quantity || 0), 0);
  check('manual AA kills the bomber the first die was rolled against',
    ui.combatState.phase === AA_RESULT_PHASE
    && ui.combatState.aaResults.hits === 1
    && qtyOf('bomber') === 0
    && qtyOf('fighter') === 1);
  check('the result does not say cheapest first', !ui.el.innerHTML.includes('cheapest first'));
}

console.log('=== 2 and 3. four transports move, unload, and select apart ===');
{
  const central = 'Central Mediterranean Sea Zone';
  const east = 'East Mediterranean Sea Zone';
  const coast = 'Syria Jordan';
  const gs = board([
    { name: central, isWater: true, connections: [east, coast] },
    { name: east, isWater: true, connections: [central, coast] },
    { name: coast, isWater: false, connections: [central, east], production: 1 },
    { name: 'Italy', isWater: false, connections: [], production: 2 },
  ]);
  gs.territoryState.Italy.owner = 'italians';
  gs.territoryState[coast].owner = 'british';
  const loaded = () => ({
    type: 'transport',
    quantity: 1,
    owner: 'italians',
    cargo: [inf(), inf()],
  });
  const empty = () => ({ type: 'transport', quantity: 1, owner: 'italians', cargo: [] });
  gs.units[central] = [
    { ...loaded(), id: 'transport_1' },
    { ...empty(), id: 'transport_1' },
    { ...loaded(), id: 'transport_2' },
    { ...loaded(), id: 'transport_2' },
    { ...loaded(), id: 'transport_3' },
  ];
  const saved = gs.toJSON();
  const restored = board([
    { name: central, isWater: true, connections: [east, coast] },
    { name: east, isWater: true, connections: [central, coast] },
    { name: coast, isWater: false, connections: [central, east], production: 1 },
    { name: 'Italy', isWater: false, connections: [], production: 2 },
  ]);
  restored.loadFromJSON(saved);
  restored.turnPhase = TURN_PHASES.COMBAT_MOVE;
  restored._notify = () => {};
  const hulls = (restored.units[central] || []).filter((unit) => unit.type === 'transport');
  const ids = hulls.map((unit) => unit.id);
  check('each transport has its own id after a reload', new Set(ids).size === hulls.length && hulls.length === 5);
  const emptyHull = hulls.find((unit) => (unit.cargo || []).length === 0);
  const loadedHull = hulls.find((unit) => (unit.cargo || []).length === 2);
  const selected = {};
  for (const hull of hulls) selected[moveUnitKey({ isIndividual: true, id: hull.id, type: hull.type })] = 1;
  delete selected[`ship:${emptyHull.id}`];
  check('clearing an empty transport leaves a loaded one selected',
    selected[`ship:${loadedHull.id}`] === 1 && emptyHull.id !== loadedHull.id);

  const movers = hulls.filter((unit) => (unit.cargo || []).length === 2);
  const moved = restored.moveUnits(central, east, [], unitDefs, { shipIds: movers.map((unit) => unit.id) });
  const arrived = (restored.units[east] || []).filter((unit) => unit.type === 'transport' && unit.owner === 'italians');
  const stayed = (restored.units[central] || []).filter((unit) => unit.type === 'transport');
  check('every loaded transport sails together', moved.success === true && arrived.length === 4 && stayed.length === 1, {
    error: moved.error,
    arrived: arrived.length,
    stayed: stayed.length,
  });
  let unloaded = 0;
  for (const hull of arrived) {
    const due = (hull.cargo || []).length;
    const live = (restored.units[east] || []).filter((unit) => unit.type === 'transport' && unit.owner === 'italians');
    const index = live.findIndex((unit) => unit.id === hull.id);
    const result = restored.unloadTransport(east, index, coast);
    if (result?.success) unloaded += due;
  }
  const ashore = (restored.units[coast] || [])
    .filter((unit) => unit.type === 'infantry' && unit.owner === 'italians')
    .reduce((sum, unit) => sum + (unit.quantity || 0), 0);
  check('all eight infantry unload in one assault', unloaded === 8 && ashore === 8, { unloaded, ashore });
}

console.log('=== 4. select all still moves the bombers ===');
{
  const gs = board([
    { name: 'Italy', isWater: false, connections: ['France'], production: 2 },
    { name: 'France', isWater: false, connections: ['Italy', 'Germany'], production: 2 },
    { name: 'Germany', isWater: false, connections: ['France'], production: 3 },
  ]);
  gs.territoryState.Italy.owner = 'italians';
  gs.territoryState.France.owner = 'british';
  gs.territoryState.Germany.owner = 'british';
  gs.friendlyTerritoriesAtTurnStart = new Set(['Italy']);
  gs.units.Italy = [
    { type: 'infantry', quantity: 2, owner: 'italians' },
    { type: 'bomber', quantity: 2, owner: 'italians' },
  ];
  gs.units.Germany = [{ type: 'infantry', quantity: 1, owner: 'british' }];
  const selected = { infantry: 2, bomber: 2 };
  const legal = legalMoveForDestination(gs, 'Italy', 'Germany', selected, unitDefs);
  check('only the bombers are legal for the far hex',
    legal.units.length === 1 && legal.units[0].type === 'bomber' && legal.units[0].quantity === 2);
  const result = gs.moveUnits('Italy', 'Germany', legal.units, unitDefs);
  const bombers = (gs.units.Germany || []).filter((unit) => unit.type === 'bomber').reduce((sum, unit) => sum + unit.quantity, 0);
  const home = (gs.units.Italy || []).filter((unit) => unit.type === 'infantry').reduce((sum, unit) => sum + unit.quantity, 0);
  check('the bombers move and the infantry stay', result.success === true && bombers === 2 && home === 2, result);
}

console.log('=== 5. a sunk transport stays sunk ===');
{
  const hawaii = 'Hawaii Sea Zone';
  const mexico = 'Mexico Sea Zone';
  const territories = [
    { name: hawaii, isWater: true, connections: [] },
    { name: mexico, isWater: true, connections: [] },
    { name: 'Italy', isWater: false, connections: [], production: 2 },
  ];
  const gs = board(territories);
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.units[hawaii] = [
    { type: 'bomber', quantity: 1, owner: 'italians' },
    { type: 'transport', quantity: 1, owner: 'british', id: 'transport_8' },
  ];
  gs.units[mexico] = [
    { type: 'fighter', quantity: 1, owner: 'italians' },
    { type: 'transport', quantity: 1, owner: 'british', id: 'transport_9', cargo: [inf('british')] },
  ];
  gs.combatQueue = [hawaii];
  gs.resolveCombat(hawaii, unitDefs);
  gs.combatQueue = [mexico];
  gs.resolveCombat(mexico, unitDefs);
  const alive = (name) => (gs.units[name] || []).some((unit) => unit.type === 'transport' && (unit.quantity || 0) > 0);
  check('the Hawaii transport is gone', alive(hawaii) === false);
  check('the Mexico transport is gone', alive(mexico) === false);

  const saved = gs.toJSON();
  const restored = board(territories);
  restored.loadFromJSON(saved);
  check('a reloaded game does not bring either transport back',
    !(restored.units[hawaii] || []).some((unit) => unit.type === 'transport' && (unit.quantity || 0) > 0)
    && !(restored.units[mexico] || []).some((unit) => unit.type === 'transport' && (unit.quantity || 0) > 0));
  check('an older snapshot of the same seat is not applied over the sink',
    shouldApplyRemoteGameState({
      remoteVersion: 1,
      localVersion: 2,
      remoteCurrentPlayerId: 'italians',
      localCurrentPlayerId: 'italians',
      remoteActionSeq: 3,
      localActionSeq: 5,
    }) === false);

  const undo = board([
    { name: 'Home Sea', isWater: true, connections: ['Far Sea'] },
    { name: 'Far Sea', isWater: true, connections: ['Home Sea'] },
    { name: 'Italy', isWater: false, connections: [], production: 2 },
  ]);
  undo.units['Home Sea'] = [{ type: 'transport', quantity: 1, owner: 'italians' }];
  undo.units['Far Sea'] = [];
  const sailed = undo.moveUnits('Home Sea', 'Far Sea', [{ type: 'transport', quantity: 1 }], unitDefs);
  undo.units['Far Sea'] = (undo.units['Far Sea'] || []).filter((unit) => unit.type !== 'transport');
  const undone = undo.undoMoveAt(0);
  const back = (undo.units['Home Sea'] || []).some((unit) => unit.type === 'transport' && (unit.quantity || 0) > 0);
  check('undo does not recreate a transport that is no longer at the destination',
    sailed.success === true && undone.success === true && back === false);
}

console.log('=== 6. AI mobilizes onto land and sea, not into a transport ===');
{
  const gs = board([
    { name: 'Isle', isWater: false, connections: ['Isle Sea'], production: 2 },
    { name: 'Isle Sea', isWater: true, connections: ['Isle'] },
    { name: 'Italy', isWater: false, connections: [], production: 2 },
  ]);
  gs.players[1] = { id: 'british', name: 'UK Easy Bot', isAI: true, aiDifficulty: 'easy' };
  gs.currentPlayerIndex = 1;
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.playerState.british.ipcs = 40;
  gs.playerState.british.capitalTerritory = 'Isle';
  gs.territoryState.Isle.owner = 'british';
  gs.units.Isle = [{ type: 'factory', quantity: 1, owner: 'british' }];
  gs.factoriesAtTurnStart = new Set(['Isle']);
  const ai = new AIController();
  ai.skipMode = true;
  ai.unitDefs = unitDefs;
  ai.gameState = gs;
  ai._updateStatus = () => {};
  ai._logAction = () => {};
  ai._notifyAction = () => {};
  await ai._handlePurchase({ difficulty: 'easy' }, gs.players[1]);
  const onBoard = (gs.units['Isle Sea'] || []).some((unit) => unit.owner === 'british' && (unit.quantity || 0) > 0);
  check('purchase does not put the new navy on the board', onBoard === false && (gs.pendingPurchases || []).length > 0);
  gs.turnPhase = TURN_PHASES.MOBILIZE;
  await ai._handleMobilize({ difficulty: 'easy' }, gs.players[1]);
  const boats = (gs.units['Isle Sea'] || []).filter((unit) => unit.owner === 'british' && (unit.quantity || 0) > 0);
  const cargo = boats.reduce((sum, unit) => sum + (unit.cargo || []).length, 0);
  const land = (gs.units.Isle || []).some((unit) => unit.owner === 'british' && unit.type !== 'factory' && (unit.quantity || 0) > 0);
  check('sea units mobilize in the sea zone', boats.length > 0);
  check('nothing is loaded onto a transport at mobilize', cargo === 0);
  check('land or air mobilizes on the factory territory', land === true);
}

console.log('=== 7. AI income is collected and shown ===');
{
  const gs = board([
    { name: 'Britain', isWater: false, connections: [], production: 6 },
    { name: 'Egypt', isWater: false, connections: [], production: 2 },
  ]);
  gs.players[1].isAI = true;
  gs.currentPlayerIndex = 1;
  gs.territoryState.Britain = { owner: 'british', isCapital: true };
  gs.territoryState.Egypt = { owner: 'british' };
  gs.playerState.british.capitalTerritory = 'Britain';
  gs.playerState.british.ipcs = 15;
  const panel = Object.create(PlayerPanel.prototype);
  panel.gameState = gs;
  const shown = panel._calculateIncome('british');
  const expected = gs.getCollectIncomeAmount('british');
  // Capital is 10. Britain's production is not added on top. Egypt adds 2.
  check('the Players pane shows the income that will be collected', shown === expected && shown === 12, { shown, expected });
  gs._collectIncome();
  check('the AI seat collects that income', gs.playerState.british.ipcs === 27, { ipcs: gs.playerState.british.ipcs });
}

console.log('=== 8. naval icons stay inside the sea zone ===');
{
  const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
  const renderer = new UnitRenderer({ units: {} }, territories, unitDefs);
  const names = [
    'South Australia Sea Zone',
    'South East Madagascar Sea Zone',
    'Hawaii Sea Zone',
    'Mexico Sea Zone',
  ];
  for (const name of names) {
    const zone = renderer.territoryByName[name];
    const [cx, cy] = renderer._getTerritoryCenter(zone);
    const anchor = renderer._adjustSeaZoneCenter(zone, cx, cy);
    const inside = renderer._pointInPolygons(anchor.x, anchor.y, zone.polygons);
    check(`${name} draws its units inside the water`, inside === true, anchor);
  }
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'italians', name: 'Italy', isAI: false }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.playerState = { italians: { ipcs: 20, capitalTerritory: 'Italy', hasPlacedCapital: true } };
  gs.territoryState['South Australia Sea Zone'] = { owner: null };
  gs.territoryState['South East Madagascar Sea Zone'] = { owner: null };
  gs.units['South Australia Sea Zone'] = [{ type: 'battleship', quantity: 1, owner: 'italians' }];
  gs.units['South East Madagascar Sea Zone'] = [];
  gs._notify = () => {};
  const sailed = gs.moveUnits(
    'South Australia Sea Zone',
    'South East Madagascar Sea Zone',
    [{ type: 'battleship', quantity: 1 }],
    unitDefs,
  );
  const dest = renderer.territoryByName['South East Madagascar Sea Zone'];
  const [dx, dy] = renderer._getTerritoryCenter(dest);
  const anchor = renderer._adjustSeaZoneCenter(dest, dx, dy);
  const present = (gs.units['South East Madagascar Sea Zone'] || [])
    .some((unit) => unit.type === 'battleship' && unit.quantity > 0);
  check('a battleship that sailed two sea zones is still drawn in that zone',
    sailed.success === true && present && renderer._pointInPolygons(anchor.x, anchor.y, dest.polygons),
    { error: sailed.error, anchor });

  const other = territories.find((territory) => (
    territory.isWater
    && territory.polygons?.length
    && !UnitRenderer.SEA_ZONE_CENTERS[territory.name]
    && territory.name !== 'South East Madagascar Sea Zone'
    && territory.name !== 'South Australia Sea Zone'
  ));
  const [ox, oy] = renderer._getTerritoryCenter(other);
  const otherAnchor = renderer._adjustSeaZoneCenter(other, ox, oy);
  check(`a destroyer anchor in ${other.name} is inside that sea zone`,
    renderer._pointInPolygons(otherAnchor.x, otherAnchor.y, other.polygons));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nunified.65 checks passed');
