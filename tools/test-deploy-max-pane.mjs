// V2.81.57-unified.46 — at the place/mobilize cap the right pane
// drops the unit roster and keeps undo plus the phase-max line.
// Run: node tools/test-deploy-max-pane.mjs

import { readFileSync } from 'fs';
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
    querySelector() { return null; },
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
globalThis.window = { innerWidth: 1280, innerHeight: 800 };

const {
  GAME_VERSION,
  SCHEMA_VERSION,
  compatClientVersion,
  compareGameVersions,
} = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  PlayerPanel,
  DEPLOY_PHASE_MAX_COPY,
  isInitialDeployAtMax,
  isMobilizeDeployAtMax,
} = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true, cost: 3, attack: 1, defense: 2, movement: 1 },
  fighter: { isAir: true, cost: 10, attack: 3, defense: 4, movement: 4 },
  transport: { isSea: true, cost: 7, attack: 0, defense: 1, movement: 2 },
  factory: { isBuilding: true, cost: 15 },
};

const territoryList = [
  { name: 'Germany', isWater: false, connections: ['Baltic'] },
  { name: 'Baltic', isWater: true, connections: ['Germany'] },
];

function attach(gs) {
  const panel = new PlayerPanel();
  panel.flushRender = () => {};
  panel._scheduleRender = () => {};
  panel.gameState = gs;
  panel.unitDefs = unitDefs;
  panel.territories = Object.fromEntries(territoryList.map((t) => [t.name, t]));
  panel.placementQueue = {};
  panel.selectedTerritory = null;
  return panel;
}

function makePlacement({ placed = 0, infantry = 8 } = {}) {
  const gs = new GameState({ risk: { factions: [] } }, territoryList, []);
  gs.players = [{ id: 'p1', name: 'Bastion', isAI: false, color: '#446' }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.placementRound = 1;
  gs.unitsPlacedThisRound = placed;
  gs.unitsPlacedThisRoundOwnerId = placed > 0 ? 'p1' : null;
  gs.playerState = { p1: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'Germany' } };
  gs.territoryState = { Germany: { owner: 'p1' } };
  gs.units = {
    Germany: [{ type: 'infantry', owner: 'p1', quantity: Math.max(placed, 0) }],
  };
  gs.unitsToPlace = {
    p1: [
      { type: 'infantry', quantity: infantry },
      { type: 'fighter', quantity: 2 },
      { type: 'transport', quantity: 1 },
    ],
  };
  gs.placementHistory = placed > 0
    ? [{ owner: 'p1', territory: 'Germany', unitType: 'infantry' }]
    : [];
  return gs;
}

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  check('display stamp is V2.81.57-unified.52', GAME_VERSION === 'V2.81.57-unified.52');
  check('schema stays 11', SCHEMA_VERSION === 11);
  check('game docs write V2.82-unified.52', compatClientVersion() === 'V2.82-unified.52');
  check('a V2.82-unified.50 doc does not prompt this tab',
    compareGameVersions('V2.82-unified.50', GAME_VERSION) < 0);
  check('a V2.82-unified.53 doc prompts this tab',
    compareGameVersions('V2.82-unified.53', GAME_VERSION) > 0);
  check('our own V2.82-unified.52 doc does not prompt',
    compareGameVersions('V2.82-unified.52', GAME_VERSION) === 0);
  check('index.html carries the display stamp',
    html.includes('content="V2.81.57-unified.52"')
    && html.includes("window.__TR_GAME_VERSION = 'V2.81.57-unified.52'")
    && html.includes("var LOCKED = 'V2.81.57-unified.52'")
    && html.includes('style.css?v=V2.81.57-unified.52')
    && html.includes('src/main.js?v=V2.81.57-unified.52'));
}

console.log('=== cap predicate ===');
{
  check('under the cap keeps the roster', isInitialDeployAtMax({
    placedThisRound: 5, limit: 6, poolRemaining: 10, totalQueued: 0,
  }) === false);
  check('6/6 hides the roster', isInitialDeployAtMax({
    placedThisRound: 6, limit: 6, poolRemaining: 10, totalQueued: 0,
  }) === true);
  check('a staged queue is not deployed yet', isInitialDeployAtMax({
    placedThisRound: 6, limit: 6, poolRemaining: 10, totalQueued: 1,
  }) === false);
  check('empty pool after a placement is the cap', isInitialDeployAtMax({
    placedThisRound: 2, limit: 6, poolRemaining: 0, totalQueued: 0,
  }) === true);
  check('an empty pool before any placement is not the cap', isInitialDeployAtMax({
    placedThisRound: 0, limit: 6, poolRemaining: 0, totalQueued: 0,
  }) === false);
  check('mobilize with units left is not the cap', isMobilizeDeployAtMax({ pendingCount: 2 }) === false);
  check('mobilize with nothing left is the cap', isMobilizeDeployAtMax({ pendingCount: 0 }) === true);
}

console.log('=== initial placement pane ===');
{
  const open = attach(makePlacement({ placed: 3 }));
  const openHtml = open._renderInlinePlacement(open.gameState.currentPlayer);
  check('under the cap the roster is listed',
    openHtml.includes('pp-unit-list') && openHtml.includes('pp-buy-row') && openHtml.includes('Infantry'));
  check('under the cap there is no phase-max line', !openHtml.includes('data-deploy-max'));
  check('under the cap Deploy stays', openHtml.includes('data-action="confirm-placement"'));

  const gs = makePlacement({ placed: 6 });
  const panel = attach(gs);
  const maxHtml = panel._renderInlinePlacement(gs.currentPlayer);
  check('at the cap the roster is gone',
    !maxHtml.includes('pp-unit-list') && !maxHtml.includes('pp-buy-row') && !maxHtml.includes('data-action="confirm-placement"'));
  check('at the cap the message is the phase-max line', maxHtml.includes(DEPLOY_PHASE_MAX_COPY));
  check('at the cap Undo stays', maxHtml.includes('data-action="undo-placement"') && !maxHtml.includes('disabled'));

  const queued = attach(makePlacement({ placed: 6 }));
  queued.placementQueue = { infantry: 1 };
  const queuedHtml = queued._renderInlinePlacement(queued.gameState.currentPlayer);
  check('a staged unit at 6/6 still shows the roster', queuedHtml.includes('pp-buy-row'));

  check('undo drops the cap and the roster returns', gs.undoPlacement() === true);
  const after = panel._renderInlinePlacement(gs.currentPlayer);
  check('after undo the roster is back',
    gs.unitsPlacedThisRound === 5
    && after.includes('pp-unit-list')
    && after.includes('pp-buy-row')
    && !after.includes('data-deploy-max'));

  window.innerWidth = 1280;
  documentElement.classList.remove('mobile-shell');
  const bar = panel._renderBottomActions(
    GAME_PHASES.UNIT_PLACEMENT,
    TURN_PHASES.PURCHASE,
    makePlacement({ placed: 6 }).currentPlayer,
    true,
    true,
  );
  const capped = attach(makePlacement({ placed: 6 }));
  const desktopBar = capped._renderBottomActions(
    GAME_PHASES.UNIT_PLACEMENT,
    TURN_PHASES.PURCHASE,
    capped.gameState.currentPlayer,
    true,
    true,
  );
  check('desktop Done stays in the pane, not the phone edge bar',
    desktopBar.includes('data-action="finish-placement"')
    && desktopBar.includes('pp-phase-advance')
    && !desktopBar.includes('pp-confirm-edge'));
  void bar;
}

console.log('=== mobilize pane ===');
{
  const gs = makePlacement({ placed: 0 });
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.MOBILIZE;
  gs.units.Germany.push({ type: 'factory', quantity: 1, owner: 'p1' });
  gs.factoriesAtTurnStart = new Set(['Germany']);
  gs.pendingPurchases = [{ type: 'infantry', quantity: 2, owner: 'p1', cost: 3 }];
  gs.mobilizationHistory = [];
  const panel = attach(gs);
  const open = panel._renderInlineMobilize(gs.currentPlayer);
  check('mobilize with units left lists them',
    open.includes('pp-unit-list') && open.includes('pp-buy-row') && !open.includes('data-deploy-max'));

  gs.pendingPurchases = [];
  gs.mobilizationHistory = [{ owner: 'p1', territory: 'Germany', unitType: 'infantry' }];
  const done = panel._renderInlineMobilize(gs.currentPlayer);
  check('mobilize at the cap hides the roster',
    !done.includes('pp-buy-row') && !done.includes('pp-unit-list'));
  check('mobilize at the cap keeps Undo Last and the message',
    done.includes(DEPLOY_PHASE_MAX_COPY) && done.includes('data-action="undo-mobilize"'));

  gs.mobilizationHistory = [];
  const boughtNothing = panel._renderInlineMobilize(gs.currentPlayer);
  check('a mobilize with nothing placed keeps the old done line',
    boughtNothing.includes('All units deployed')
    && !boughtNothing.includes(DEPLOY_PHASE_MAX_COPY)
    && !boughtNothing.includes('undo-mobilize'));
}

console.log('=== purchase undo is unchanged ===');
{
  const gs = makePlacement({ placed: 0 });
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.units.Germany = [{ type: 'factory', quantity: 1, owner: 'p1' }];
  gs.pendingPurchases = [{ type: 'infantry', quantity: 1, owner: 'p1', cost: 3 }];
  const panel = attach(gs);
  const html = panel._renderInlinePurchase(gs.currentPlayer);
  check('purchase still lists units and Purchased Units undo',
    html.includes('pp-buy-row')
    && html.includes('data-action="undo-purchase"')
    && !html.includes('data-deploy-max')
    && !html.includes(DEPLOY_PHASE_MAX_COPY));
}

console.log('=== phone peek shares the cap ===');
{
  documentElement.classList.add('mobile-shell');
  window.innerWidth = 390;
  const gs = makePlacement({ placed: 6 });
  const panel = attach(gs);
  panel.trayExpanded = false;
  const peek = panel._renderPhonePeekRow(
    gs.currentPlayer,
    GAME_PHASES.UNIT_PLACEMENT,
    TURN_PHASES.PURCHASE,
  );
  check('phone peek at the cap shows the message, not unit chips',
    peek.includes(DEPLOY_PHASE_MAX_COPY) && !peek.includes('phone-peek-tile'));
  panel.trayExpanded = true;
  const expanded = panel._renderPhonePeekRow(
    gs.currentPlayer,
    GAME_PHASES.UNIT_PLACEMENT,
    TURN_PHASES.PURCHASE,
  );
  check('expanded phone tray does not repeat the peek line', expanded === '');
  const body = panel._renderInlinePlacement(gs.currentPlayer);
  check('expanded phone tray uses the same max pane',
    body.includes(DEPLOY_PHASE_MAX_COPY) && body.includes('data-action="undo-placement"'));

  const under = attach(makePlacement({ placed: 2 }));
  under.trayExpanded = false;
  const chips = under._renderPhonePeekRow(
    under.gameState.currentPlayer,
    GAME_PHASES.UNIT_PLACEMENT,
    TURN_PHASES.PURCHASE,
  );
  check('phone peek under the cap still lists units',
    chips.includes('phone-peek-tile') && !chips.includes('data-deploy-max'));

  const bar = panel._renderBottomActions(
    GAME_PHASES.UNIT_PLACEMENT,
    TURN_PHASES.PURCHASE,
    gs.currentPlayer,
    true,
    true,
  );
  check('phone Done stays on the full-width edge bar',
    bar.includes('data-action="finish-placement"') && bar.includes('pp-confirm-edge'));
  check('phone Max is hidden once the cap is full', !bar.includes('data-action="phone-pair-max"'));
  documentElement.classList.remove('mobile-shell');
  window.innerWidth = 1280;
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall deploy-max pane checks passed');
