// V2.81.57-unified.17 — desktop/tablet Deploy and Mobilize follow the
// selected territory. Phone @390 pair grammar stays on the tapped land.
// Run: node tools/test-unified-10-deploy-target.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}

function makeEl() {
  return {
    innerHTML: '',
    className: '',
    classList: {
      _set: new Set(),
      contains(name) { return this._set.has(name); },
      add(name) { this._set.add(name); },
      remove(name) { this._set.delete(name); },
      toggle(name, on) {
        if (on === undefined) {
          if (this._set.has(name)) this._set.delete(name);
          else this._set.add(name);
        } else if (on) this._set.add(name);
        else this._set.delete(name);
      },
    },
    appendChild() {},
    addEventListener() {},
    querySelectorAll() { return []; },
    contains() { return false; },
  };
}

const documentElement = makeEl();
const sidebar = makeEl();
globalThis.document = {
  documentElement,
  getElementById(id) { return id === 'sidebar' ? sidebar : null; },
  createElement() { return makeEl(); },
};

const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { PlayerPanel } =
  await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true, cost: 3 },
  armour: { isLand: true, cost: 5 },
  transport: { isSea: true, cost: 7 },
  factory: { isBuilding: true, cost: 15 },
};

const territoryList = [
  { name: 'Germany', isWater: false, connections: ['Baltic'] },
  { name: 'France', isWater: false, connections: ['Baltic'] },
  { name: 'Baltic', isWater: true, connections: ['Germany', 'France'] },
];
const territoryMap = Object.fromEntries(territoryList.map((t) => [t.name, t]));

function setMobile(on) {
  documentElement.classList.toggle('mobile-shell', !!on);
}

function makePlacementState() {
  const gs = new GameState({ risk: { factions: [] } }, territoryList, []);
  gs.players = [
    { id: 'p1', name: 'Bastion', isAI: false },
    { id: 'p2', name: 'Other', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.placementRound = 1;
  gs.unitsPlacedThisRound = 0;
  gs.territoryState = {
    Germany: { owner: 'p1' },
    France: { owner: 'p1' },
  };
  gs.playerState = {
    p1: { ipcs: 30, hasPlacedCapital: true, capitalTerritory: 'Germany' },
    p2: { ipcs: 30, hasPlacedCapital: true, capitalTerritory: 'France' },
  };
  gs.units = {};
  gs.unitsToPlace = {
    p1: [
      { type: 'infantry', quantity: 4 },
      { type: 'armour', quantity: 1 },
      { type: 'transport', quantity: 1 },
    ],
  };
  return gs;
}

function makeMobilizeState() {
  const gs = makePlacementState();
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.MOBILIZE;
  gs.units = {
    Germany: [{ type: 'factory', quantity: 1, owner: 'p1' }],
    France: [{ type: 'factory', quantity: 1, owner: 'p1' }],
  };
  gs.factoriesAtTurnStart = new Set(['Germany', 'France']);
  gs.pendingPurchases = [
    { type: 'infantry', quantity: 2, owner: 'p1', cost: 3 },
  ];
  return gs;
}

function qty(gs, territory, type) {
  return (gs.units[territory] || [])
    .filter((u) => u.type === type && u.owner === 'p1' && !u.onCarrier)
    .reduce((sum, u) => sum + (Number(u.quantity) || 0), 0);
}

function attachPanel(gs) {
  const panel = new PlayerPanel();
  panel.flushRender = () => {};
  panel._scheduleRender = () => {};
  panel.gameState = gs;
  panel.unitDefs = unitDefs;
  panel.territories = territoryMap;
  let mapSelection = null;
  const commits = [];
  panel.onAction = (action, data) => {
    if (action === 'place-units-batch') {
      const result = gs.placeInitialUnitsBatch(data.territory, data.unitTypes, unitDefs);
      commits.push({ action, territory: data.territory, unitTypes: data.unitTypes });
      // main.js restores the map click, then the commit finish writes dest.
      panel.setSelectedTerritory(mapSelection || panel.selectedTerritory);
      return result;
    }
    if (action === 'mobilize-unit') {
      const result = gs.mobilizeUnit(data.unitType, data.territory, unitDefs, {
        sourceFactory: data.sourceFactory || null,
      });
      commits.push({ action, territory: data.territory, unitType: data.unitType, result });
      return result;
    }
    return null;
  };
  return {
    panel,
    commits,
    select(territory) {
      mapSelection = territory;
      panel.setSelectedTerritory(territory);
    },
    deploy(type) {
      panel.placementQueue = { [type]: 1 };
      const before = commits.length;
      const ok = panel._commitStagedPlacement();
      return { ok, commit: commits[before] || null };
    },
    mobilize(type) {
      panel.placementQueue = { [type]: 1 };
      const before = commits.length;
      const ok = panel._commitStagedMobilize();
      return { ok, commit: commits[before] || null };
    },
    undoAll() {
      let n = 0;
      while (gs.undoPlacement()) {
        panel.clearPendingPlacementOverlay();
        n += 1;
      }
      return n;
    },
  };
}

console.log('=== Version stamps ===');
check('GAME_VERSION is V2.81.57-unified.17', GAME_VERSION === 'V2.81.57-unified.17');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== Desktop shell: setup Deploy follows the selected territory ===');
{
  setMobile(false);
  const gs = makePlacementState();
  const ui = attachPanel(gs);
  const germany = territoryMap.Germany;
  const france = territoryMap.France;
  const baltic = territoryMap.Baltic;

  ui.select(germany);
  const first = ui.deploy('infantry');
  check('deploy on capital lands on Germany',
    first.ok === true
    && first.commit?.territory === 'Germany'
    && qty(gs, 'Germany', 'infantry') === 1
    && ui.panel.selectedTerritory?.name === 'Germany');

  ui.select(france);
  check('selecting France refreshes the desktop deploy name',
    ui.panel._phoneDeployLandName === 'France'
    && ui.panel._phoneDeployDest()?.name === 'France');
  const second = ui.deploy('infantry');
  check('second Deploy lands on France, not the capital',
    second.ok === true
    && second.commit?.territory === 'France'
    && qty(gs, 'France', 'infantry') === 1
    && qty(gs, 'Germany', 'infantry') === 1);
  check('panel stays on France after Deploy (no snap back to capital)',
    ui.panel.selectedTerritory?.name === 'France'
    && ui.panel._phoneDeployLandName === 'France');

  ui.select(baltic);
  const naval = ui.deploy('transport');
  check('naval Deploy lands on the selected sea zone',
    naval.ok === true
    && naval.commit?.territory === 'Baltic'
    && qty(gs, 'Baltic', 'transport') === 1
    && ui.panel.selectedTerritory?.name === 'Baltic');

  const undone = ui.undoAll();
  check('Undo all returns the round to 0 and clears the desktop pin',
    undone === 3
    && gs.unitsPlacedThisRound === 0
    && qty(gs, 'Germany', 'infantry') === 0
    && qty(gs, 'France', 'infantry') === 0
    && qty(gs, 'Baltic', 'transport') === 0
    && ui.panel._phoneDeployLandName === null);
  check('after Undo, Deploy uses the territory that is still selected',
    ui.panel.selectedTerritory?.name === 'Baltic'
    && ui.panel._phoneDeployDest()?.name === 'Baltic');

  ui.select(france);
  const afterUndo = ui.deploy('armour');
  check('after Undo, Deploy on France lands on France',
    afterUndo.ok === true
    && afterUndo.commit?.territory === 'France'
    && qty(gs, 'France', 'armour') === 1
    && qty(gs, 'Germany', 'armour') === 0
    && ui.panel.selectedTerritory?.name === 'France');
}

console.log('=== Desktop shell: Mobilize follows the selected factory ===');
{
  setMobile(false);
  const gs = makeMobilizeState();
  const ui = attachPanel(gs);
  ui.select(territoryMap.Germany);
  const atA = ui.mobilize('infantry');
  check('Mobilize at factory A lands on Germany',
    atA.ok === true
    && atA.commit?.territory === 'Germany'
    && atA.commit?.result?.success === true
    && qty(gs, 'Germany', 'infantry') === 1);

  ui.select(territoryMap.France);
  check('selecting factory B retargets Mobilize',
    ui.panel._phoneDeployLandName === 'France'
    && ui.panel._phoneDeployDest()?.name === 'France');
  const atB = ui.mobilize('infantry');
  check('Mobilize at factory B lands on France, not A',
    atB.ok === true
    && atB.commit?.territory === 'France'
    && atB.commit?.result?.success === true
    && qty(gs, 'France', 'infantry') === 1
    && qty(gs, 'Germany', 'infantry') === 1
    && ui.panel.selectedTerritory?.name === 'France');

  ui.panel.clearPendingPlacementOverlay();
  check('Mobilize Undo overlay does not leave a pinned factory',
    ui.panel._phoneDeployLandName === null
    && ui.panel._phoneDeployDest()?.name === 'France');
}

console.log('=== Mobile shell: tapped land still wins ===');
{
  setMobile(true);
  const gs = makePlacementState();
  const ui = attachPanel(gs);
  ui.select(territoryMap.Germany);
  check('phone tap names Germany',
    ui.panel._phoneDeployLandName === 'Germany'
    && ui.panel._phoneDeployDest()?.name === 'Germany');
  const onA = ui.deploy('infantry');
  check('phone Deploy lands on the tapped capital',
    onA.commit?.territory === 'Germany' && qty(gs, 'Germany', 'infantry') === 1);

  // Staged phone name still beats a bare selection until the next land tap.
  ui.panel.selectedTerritory = territoryMap.France;
  check('phone staged name still beats a selection that did not retarget',
    ui.panel._phoneDeployDest()?.name === 'Germany');

  ui.select(territoryMap.France);
  check('phone land tap retargets to France',
    ui.panel._phoneDeployLandName === 'France'
    && ui.panel._phoneDeployDest()?.name === 'France');
  const onB = ui.deploy('infantry');
  check('phone Deploy lands on the newly tapped land',
    onB.commit?.territory === 'France'
    && qty(gs, 'France', 'infantry') === 1
    && qty(gs, 'Germany', 'infantry') === 1);

  const pinned = ui.panel._phoneDeployLandName;
  ui.panel.clearPendingPlacementOverlay();
  check('phone Undo does not wipe the tapped land name',
    ui.panel._phoneDeployLandName === pinned
    && pinned === 'France'
    && ui.panel._phoneDeployDest()?.name === 'France');
  setMobile(false);
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nunified.12 deploy-target checks passed');
