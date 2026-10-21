// unified.64 — three player requests.
// 1. Mobilization Select all (robfox007, 25 Sep).
// 2. Aircraft moves left while listed or selected (robfox007, 27 Sep).
// 3. Factory damage number on the icon when damage > 0 (robfox007, 30 Sep).
// Run: node tools/test-unified-64-wishlist.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.requestAnimationFrame ??= () => 0;
const mk = () => ({
  style: {},
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  appendChild(child) { return child; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  setAttribute() {},
  removeAttribute() {},
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
const { selectAllPendingPurchases } = await import(pathToFileURL(join(root, 'src/ui/mobilizeDeployAll.js')).href);
const { listedAircraftMoveLabel } = await import(pathToFileURL(join(root, 'src/state/airLanding.js')).href);
const {
  UnitRenderer,
  factoryDamageDigits,
  factoryDamageLabelOrigin,
} = await import(pathToFileURL(join(root, 'src/map/unitRenderer.js')).href);
const { GAME_VERSION, SCHEMA_VERSION, compatClientVersion, compareGameVersions } = await import(pathToFileURL(join(root, 'src/version.js')).href);
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const T = (name, isWater, connections) => ({ name, isWater, connections, production: 2 });

function makeGs(territories) {
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'Germans', name: 'Robert007', isAI: false }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.MOBILIZE;
  gs.playerState = { Germans: { ipcs: 20, capitalTerritory: 'Germany' } };
  gs.playerTechs = { Germans: { unlockedTechs: [] } };
  gs.territoryState = {};
  for (const territory of territories) {
    if (!territory.isWater) gs.territoryState[territory.name] = { owner: 'Germans' };
  }
  gs._notify = () => {};
  return gs;
}

function panel(gs) {
  const pp = Object.create(PlayerPanel.prototype);
  pp.gameState = gs;
  pp.unitDefs = unitDefs;
  pp.territories = gs.territoryByName;
  pp.selectedTerritory = null;
  pp.placementQueue = {};
  pp.moveSelectedUnits = {};
  pp.moveUnitTab = 'land';
  pp.onAction = () => {};
  return pp;
}

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const stamp = 'V2.81.57-unified.64';
  check('display stamp is V2.81.57-unified.64', GAME_VERSION === stamp);
  check('schema stays 11', SCHEMA_VERSION === 11 && /version: 11/.test(readFileSync(join(root, 'src/state/gameState.js'), 'utf8')));
  check('game docs write V2.82-unified.64', compatClientVersion() === 'V2.82-unified.64');
  check('a V2.82-unified.65 doc prompts this tab', compareGameVersions('V2.82-unified.65', GAME_VERSION) > 0);
  check('a V2.82-unified.63 doc does not prompt this tab', compareGameVersions('V2.82-unified.63', GAME_VERSION) < 0);
  check('index.html carries the display stamp',
    html.includes(`name="tr-game-version" content="${stamp}"`)
    && html.includes(`window.__TR_GAME_VERSION = '${stamp}'`)
    && html.includes(`var LOCKED = '${stamp}'`)
    && html.includes(`style.css?v=${stamp}`)
    && html.includes(`src/main.js?v=${stamp}`));
}

console.log('=== 1. mobilization Select all ===');
{
  const all = selectAllPendingPurchases([
    { type: 'infantry', quantity: 3 },
    { type: 'armour', quantity: 2 },
    { type: 'fighter', quantity: 1 },
  ], {
    slotsRemaining: 5,
    placeable: () => true,
    usesFactorySlot: (item) => item.type !== 'factory',
  });
  check('slots fill in list order and stop',
    all.infantry === 3 && all.armour === 2 && all.fighter == null, all);

  const building = selectAllPendingPurchases([
    { type: 'factory', quantity: 1 },
    { type: 'infantry', quantity: 4 },
  ], {
    slotsRemaining: 0,
    placeable: (item) => item.type === 'factory',
    usesFactorySlot: (item) => item.type !== 'factory',
  });
  check('a new factory is selected without spending factory slots', building.factory === 1 && building.infantry == null);

  const territories = [
    T('Germany', false, ['Baltic Sea']),
    T('France', false, ['West Sea']),
    T('Baltic Sea', true, ['Germany']),
    T('West Sea', true, ['France']),
  ];
  const gs = makeGs(territories);
  gs.units = {
    Germany: [{ type: 'factory', owner: 'Germans', quantity: 1 }],
    France: [{ type: 'factory', owner: 'Germans', quantity: 1 }],
  };
  gs.factoriesAtTurnStart = new Set(['Germany', 'France']);
  gs.factoryDamage = { France: 4 };
  gs.pendingPurchases = [
    { type: 'infantry', quantity: 3, owner: 'Germans', cost: 3 },
    { type: 'fighter', quantity: 1, owner: 'Germans', cost: 10 },
    { type: 'destroyer', quantity: 1, owner: 'British', cost: 12 },
  ];
  const pp = panel(gs);
  pp.selectedTerritory = gs.territoryByName.France;
  const plan = pp._mobilizeSelectPlan(gs.currentPlayer);
  check('a damaged minor factory selects only the slots it has left',
    plan.infantry === 1 && plan.fighter == null, plan);
  const before = pp._renderInlineMobilize(gs.currentPlayer);
  const selectAt = before.indexOf('Select all');
  const deployAt = before.indexOf('Deploy all here');
  const remainAt = before.indexOf('remaining');
  check('Select all is one button above Deploy all here',
    selectAt > 0 && selectAt < deployAt && deployAt < remainAt
    && before.includes('data-action="mobilize-select-all"')
    && !/data-action="mobilize-select-all"[^>]*disabled/.test(before));
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  check('Select all reuses the deploy control and its 44px phone target',
    before.includes('class="pp-deploy-all" data-action="mobilize-select-all"')
    && /@media \(max-width: 1023px\) \{[\s\S]{0,180}\.pp-deploy-all \{[\s\S]{0,80}min-height: 44px/.test(css));

  const calls = [];
  pp.onAction = (action, data) => calls.push({ action, ...data });
  const applied = pp._applyMobilizeSelectAll();
  check('Select all marks those pending units for placement',
    applied.infantry === 1 && pp.placementQueue.infantry === 1);
  const after = pp._renderInlineMobilize(gs.currentPlayer);
  check('the row shows the selection and the button rests',
    after.includes('data-mobilize-selected="infantry"')
    && after.includes('1 selected')
    && /data-action="mobilize-select-all"[^>]*disabled/.test(after));
  const committed = pp._commitStagedMobilize();
  check('Confirm places the selection at the factory',
    committed === true
    && calls.length === 1
    && calls[0].action === 'mobilize-unit'
    && calls[0].unitType === 'infantry'
    && calls[0].territory === 'France', calls);

  pp.selectedTerritory = gs.territoryByName['Baltic Sea'];
  gs.pendingPurchases = [
    { type: 'infantry', quantity: 2, owner: 'Germans', cost: 3 },
    { type: 'destroyer', quantity: 1, owner: 'Germans', cost: 12 },
  ];
  gs.factoryDamage = {};
  const sea = pp._mobilizeSelectPlan(gs.currentPlayer);
  check('a sea zone selects the pending ship, not the infantry',
    sea.destroyer === 1 && sea.infantry == null, sea);

  pp.selectedTerritory = null;
  const idle = pp._renderInlineMobilize(gs.currentPlayer);
  check('Select all waits until a placement territory is chosen',
    /data-action="mobilize-select-all"[^>]*disabled/.test(idle));
}

console.log('=== 2. aircraft moves left ===');
{
  const fresh = listedAircraftMoveLabel(
    { currentPlayer: { id: 'Germans' }, hasTech() { return false; }, airUnitOrigins: {} },
    'Germany',
    'fighter',
    unitDefs,
  );
  check('a fresh fighter shows its full move', fresh?.remaining === 4 && fresh?.total === 4);
  const spent = listedAircraftMoveLabel(
    {
      currentPlayer: { id: 'Germans' },
      hasTech() { return false; },
      airUnitOrigins: { Germany: { fighter: { distance: 2 } } },
    },
    'Germany',
    'fighter',
    unitDefs,
  );
  check('a fighter that flew 2 has 2 left', spent?.remaining === 2 && spent?.label === 'M2/4');
  const bomber = listedAircraftMoveLabel(
    {
      currentPlayer: { id: 'Germans' },
      hasTech() { return false; },
      airUnitOrigins: { Germany: { bomber: { distance: 2 } } },
    },
    'Germany',
    'bomber',
    unitDefs,
  );
  check('a bomber shows the moves it has left', bomber?.remaining === 4 && bomber?.total === 6);
  const tac = listedAircraftMoveLabel(
    {
      currentPlayer: { id: 'Germans' },
      hasTech(id, tech) { return tech === 'longRangeAircraft'; },
      airUnitOrigins: { Sea: { tacticalBomber: { distance: 3 } } },
    },
    'Sea',
    'tacticalBomber',
    unitDefs,
  );
  check('a tactical bomber keeps Long Range in the number', tac?.remaining === 3 && tac?.total === 6);
  check('infantry is not given a move number',
    listedAircraftMoveLabel({ currentPlayer: { id: 'Germans' } }, 'Germany', 'infantry', unitDefs) == null);
  const unreachable = listedAircraftMoveLabel(
    {
      currentPlayer: { id: 'Germans' },
      hasTech() { return false; },
      airUnitOrigins: { Germany: { fighter: { distance: 999 } } },
    },
    'Germany',
    'fighter',
    unitDefs,
  );
  check('a failed path search does not zero the fighter', unreachable?.remaining === 4);

  const territories = [
    T('Germany', false, ['France', 'Baltic Sea']),
    T('France', false, ['Germany']),
    T('Baltic Sea', true, ['Germany']),
  ];
  const gs = makeGs(territories);
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.units = {
    Germany: [
      { type: 'fighter', owner: 'Germans', quantity: 2 },
      { type: 'bomber', owner: 'Germans', quantity: 1 },
      { type: 'infantry', owner: 'Germans', quantity: 3 },
    ],
  };
  gs.airUnitOrigins = {
    Germany: {
      fighter: { origin: 'France', distance: 2 },
      bomber: { origin: 'France', distance: 1 },
    },
  };
  const pp = panel(gs);
  pp.selectedTerritory = gs.territoryByName.Germany;
  pp.moveSelectedUnits = { fighter: 1 };
  pp.moveUnitTab = 'land';
  const land = pp._renderInlineMovement(gs.currentPlayer, TURN_PHASES.COMBAT_MOVE);
  check('a selected fighter shows its moves left',
    land.includes('Selected: 1 fighter (2 left)') && !land.includes('data-moves-left='));
  pp.moveUnitTab = 'air';
  const air = pp._renderInlineMovement(gs.currentPlayer, TURN_PHASES.COMBAT_MOVE);
  check('listed aircraft show the moves they have left',
    air.includes('data-moves-left="2"')
    && air.includes('>2 left<')
    && air.includes('data-moves-left="5"')
    && air.includes('>5 left<'));
  check('the movement list keeps the number on the existing name style',
    air.includes('class="pp-move-name" data-moves-left="2"'));
}

console.log('=== 3. factory damage number ===');
{
  check('undamaged factory has no digits', factoryDamageDigits(0) === '' && factoryDamageDigits(-2) === '');
  check('damage above 0 is that number', factoryDamageDigits(7) === '7' && factoryDamageDigits(12.8) === '12');
  const calls = [];
  const ctx = {
    save() {},
    restore() {},
    strokeText(text, x, y) { calls.push({ op: 'stroke', text, x, y }); },
    fillText(text, x, y) { calls.push({ op: 'fill', text, x, y }); },
  };
  const draw = UnitRenderer.prototype._drawFactoryDamageOnIcon;
  draw.call({}, ctx, 100, 200, 24, 0, 1);
  check('zero damage draws nothing on the icon', calls.length === 0);
  draw.call({}, ctx, 100, 200, 24, 7, 1);
  const fill = calls.find((row) => row.op === 'fill');
  const origin = factoryDamageLabelOrigin(100, 200, 24);
  const bg = 24 + 4;
  check('the damage number is drawn inside the factory icon',
    fill?.text === '7'
    && fill.x === origin.x
    && fill.y === origin.y
    && origin.x > 100 - bg / 2
    && origin.y > 200 - bg / 2
    && origin.x < 100
    && origin.y < 200,
    { fill, origin });
  const src = readFileSync(join(root, 'src/map/unitRenderer.js'), 'utf8');
  check('the map draws that number on the factory icon only',
    src.includes("if (unitType === 'factory')")
    && src.includes('_drawFactoryDamageOnIcon')
    && !src.includes('_drawFactoryDamageBadge'));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nunified.64 wishlist checks passed');
