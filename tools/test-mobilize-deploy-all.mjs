// V2.81.57-unified.17 — Deploy all here places one batch and one notify.
// Run: node tools/test-mobilize-deploy-all.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
const mk = () => ({
  style: {},
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  appendChild(c) { return c; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
});
globalThis.document ??= {
  documentElement: mk(),
  body: mk(),
  createElement: mk,
  getElementById() { return null; },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')).href);
const { PlayerPanel } = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')).href);
const { runMobilizeDeployAll } = await import(pathToFileURL(join(root, 'src/ui/mobilizeDeployAll.js')).href);
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const T = (name, isWater, connections) => ({ name, isWater, connections });

function makeGs(territories) {
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'Germans', name: 'Robert007' }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.MOBILIZE;
  gs.playerState = { Germans: { ipcs: 0, capitalTerritory: 'Germany' } };
  gs.territoryState = {};
  for (const territory of territories) {
    if (!territory.isWater) gs.territoryState[territory.name] = { owner: 'Germans' };
  }
  return gs;
}

function countNotify(gs, fn) {
  let notifies = 0;
  const stop = gs.subscribe(() => { notifies += 1; });
  const result = fn();
  stop();
  return { notifies, result };
}

{
  const territories = [
    T('Germany', false, ['Baltic Sea']),
    T('Baltic Sea', true, ['Germany']),
  ];
  const gs = makeGs(territories);
  gs.units = { Germany: [{ type: 'factory', owner: 'Germans', quantity: 1 }], 'Baltic Sea': [] };
  gs.factoriesAtTurnStart = new Set(['Germany']);
  gs.pendingPurchases = [
    { type: 'infantry', quantity: 3, owner: 'Germans', cost: 3 },
    { type: 'armour', quantity: 1, owner: 'Germans', cost: 5 },
    { type: 'fighter', quantity: 1, owner: 'Germans', cost: 10 },
  ];
  const { notifies, result } = countNotify(gs, () => runMobilizeDeployAll(gs, unitDefs, { territory: 'Germany' }));
  const land = gs.units.Germany.filter((unit) => unit.owner === 'Germans' && unit.type !== 'factory');
  const qty = land.reduce((sum, unit) => sum + unit.quantity, 0);
  check('full factory batch places every pending unit', result.placed.reduce((s, row) => s + row.quantity, 0) === 5 && qty === 5, result);
  check('the batch notifies once', notifies === 1, notifies);
}

{
  const territories = [T('France', false, ['West Sea']), T('West Sea', true, ['France'])];
  const gs = makeGs(territories);
  gs.units = { France: [{ type: 'factory', owner: 'Germans', quantity: 1 }] };
  gs.factoriesAtTurnStart = new Set(['France']);
  gs.mobilizationHistory = [
    { territory: 'France', unitType: 'infantry', owner: 'Germans' },
    { territory: 'France', unitType: 'infantry', owner: 'Germans' },
    { territory: 'France', unitType: 'infantry', owner: 'Germans' },
  ];
  gs.pendingPurchases = [
    { type: 'infantry', quantity: 2, owner: 'Germans', cost: 3 },
    { type: 'armour', quantity: 1, owner: 'Germans', cost: 5 },
    { type: 'fighter', quantity: 1, owner: 'Germans', cost: 10 },
  ];
  const { result } = countNotify(gs, () => runMobilizeDeployAll(gs, unitDefs, { territory: 'France' }));
  const placed = result.placed.reduce((sum, row) => sum + row.quantity, 0);
  check('factory room of 2 places 2 and notes the rest', placed === 2 && /not placed/.test(result.note), result);
}

{
  const territories = [
    T('Germany', false, ['Baltic Sea']),
    T('Baltic Sea', true, ['Germany']),
  ];
  const gs = makeGs(territories);
  gs.units = { Germany: [{ type: 'factory', owner: 'Germans', quantity: 1 }], 'Baltic Sea': [] };
  gs.factoriesAtTurnStart = new Set(['Germany']);
  gs.pendingPurchases = [{ type: 'destroyer', quantity: 1, owner: 'Germans', cost: 12 }];
  const { result } = countNotify(gs, () => runMobilizeDeployAll(gs, unitDefs, { territory: 'Germany' }));
  const ship = (gs.units['Baltic Sea'] || []).find((unit) => unit.type === 'destroyer');
  check('one adjacent sea receives the ship', result.placed.length === 1 && ship?.owner === 'Germans', result);
}

{
  const territories = [
    T('Germany', false, ['Baltic Sea', 'North Sea']),
    T('Baltic Sea', true, ['Germany']),
    T('North Sea', true, ['Germany']),
  ];
  const gs = makeGs(territories);
  gs.units = { Germany: [{ type: 'factory', owner: 'Germans', quantity: 1 }] };
  gs.factoriesAtTurnStart = new Set(['Germany']);
  gs.pendingPurchases = [{ type: 'transport', quantity: 1, owner: 'Germans', cost: 7 }];
  const { result } = countNotify(gs, () => runMobilizeDeployAll(gs, unitDefs, { territory: 'Germany' }));
  check('two seas and no choice skips ships with a note', result.placed.length === 0 && /choose a sea zone/.test(result.note), result);
}

{
  const territories = [T('Germany', false, []), T('Baltic Sea', true, ['Germany'])];
  const gs = makeGs([
    T('Germany', false, ['Baltic Sea']),
    T('Baltic Sea', true, ['Germany']),
  ]);
  gs.units = { Germany: [{ type: 'factory', owner: 'Germans', quantity: 1 }] };
  gs.factoriesAtTurnStart = new Set(['Germany']);
  gs.pendingPurchases = [{ type: 'infantry', quantity: 1, owner: 'Germans', cost: 3 }];
  const pp = Object.create(PlayerPanel.prototype);
  pp.gameState = gs;
  pp.unitDefs = unitDefs;
  pp.selectedTerritory = gs.territoryByName.Germany;
  pp.territories = gs.territoryByName;
  const html = pp._renderInlineMobilize(gs.currentPlayer);
  const deployAt = html.indexOf('Deploy all here');
  const remainAt = html.indexOf('remaining');
  check('Deploy all here sits above the remaining line', deployAt > 0 && deployAt < remainAt, html.slice(deployAt, remainAt + 20));
  check('button is enabled when a unit can be placed', html.includes('data-action="mobilize-deploy-all"') && !html.includes('mobilize-deploy-all" disabled') && !/mobilize-deploy-all"[^>]*disabled/.test(html));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nmobilize deploy-all checks passed');
