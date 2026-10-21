// unified.62 — Discord reports from 27 Sep through 3 Oct.
// Each block is a reproduction. A pass means that report is already fixed.
// Run: node tools/test-unified-62-reports.mjs

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
        names.forEach((n) => classSet.add(n));
        el.className = [...classSet].join(' ');
      },
      remove(...names) {
        names.forEach((n) => classSet.delete(n));
        el.className = [...classSet].join(' ');
      },
      contains(name) { return classSet.has(name); },
      toggle() {},
    },
    appendChild(child) { this.children.push(child); return child; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
    contains() { return false; },
  };
  return el;
}

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.document ??= {
  documentElement: makeEl(),
  body: makeEl(),
  createElement: () => makeEl(),
  getElementById: () => makeEl(),
  querySelector: () => null,
  querySelectorAll: () => [],
};
globalThis.window ??= globalThis;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { combatMoveReachableDests } = await import(pathToFileURL(join(root, 'src/state/combatMoveEligibility.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const { PlayerPanel } = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const { returnToBaseAssignments } = await import(pathToFileURL(join(root, 'src/state/airLanding.js')));
const { applyCasualtySelection } = await import(pathToFileURL(join(root, 'src/state/combatUnits.js')));
const { formatRecipientLossSummary } = await import(pathToFileURL(join(root, 'src/multiplayer/discordTurnPing.js')));
const { GAME_VERSION, SCHEMA_VERSION, compatClientVersion, compareGameVersions } = await import(pathToFileURL(join(root, 'src/version.js')));

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

function advanceTo(gs, phase, playerId = null) {
  let guard = 0;
  while (guard < 24) {
    const seated = !playerId || gs.currentPlayer?.id === playerId;
    if (gs.turnPhase === phase && seated) return;
    gs.nextPhase();
    guard += 1;
  }
}

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const stamp = 'V2.81.57-unified.64';
  check('display stamp is V2.81.57-unified.64', GAME_VERSION === stamp);
  check('schema stays 11', SCHEMA_VERSION === 11);
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

console.log('=== 1. a factory can be bombed again on the next turn ===');
{
  const territories = [
    { name: 'Britain', isWater: false, production: 2, connections: ['Germany'] },
    { name: 'Germany', isWater: false, production: 1, connections: ['Britain'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'Americans', name: 'Bastion', isAI: false },
    { id: 'Germans', name: 'Germany', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.territoryState = {
    Britain: { owner: 'Americans' },
    Germany: { owner: 'Germans' },
  };
  gs.playerState = {
    Americans: { ipcs: 40, capitalTerritory: 'Britain', hasPlacedCapital: true },
    Germans: { ipcs: 20, capitalTerritory: 'Germany', hasPlacedCapital: true },
  };
  gs.playerTechs = {
    Americans: { unlockedTechs: [] },
    Germans: { unlockedTechs: [] },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Britain']);
  gs.factoriesAtTurnStart = new Set(['Britain', 'Germany']);
  gs.unitDefs = unitDefs;
  gs._unitDefs = unitDefs;
  gs._notify = () => {};
  gs.autoSave = () => {};
  gs.units = {
    Britain: [
      { type: 'bomber', quantity: 1, owner: 'Americans' },
      { type: 'factory', quantity: 1, owner: 'Americans' },
    ],
    Germany: [{ type: 'factory', quantity: 1, owner: 'Germans' }],
  };
  const firstMove = gs.moveUnits('Britain', 'Germany', [{ type: 'bomber', quantity: 1 }], unitDefs, { raid: true });
  advanceTo(gs, TURN_PHASES.COMBAT);
  const first = gs.resolveStrategicRaid('Germany', unitDefs, { rolls: [6, 4] });
  gs.raidQueue = [];
  gs.combatQueue = [];
  advanceTo(gs, TURN_PHASES.NON_COMBAT_MOVE, 'Americans');
  const home = gs.moveUnits('Germany', 'Britain', [{ type: 'bomber', quantity: 1 }], unitDefs);
  advanceTo(gs, TURN_PHASES.COMBAT_MOVE, 'Americans');
  const secondMove = gs.moveUnits('Britain', 'Germany', [{ type: 'bomber', quantity: 1 }], unitDefs, { raid: true });
  advanceTo(gs, TURN_PHASES.COMBAT);
  const second = gs.resolveStrategicRaid('Germany', unitDefs, { rolls: [6, 3] });
  check('the first raid damages the factory', first.resolved === true && first.applied === 4, first);
  check('the bomber can fly home after the raid', home.success === true, home.error);
  check('the same factory can be raided on the next turn', secondMove.success === true, secondMove.error);
  check('the second raid adds damage and factory AA still fires',
    second.resolved === true
    && second.applied === 3
    && (second.aaRolls || []).length === 1
    && gs.getFactoryDamage('Germany') === 7,
    second);
}

console.log('=== 2. purchases stop at placement room and the max is shown ===');
{
  const territories = [
    { name: 'Germany', isWater: false, connections: ['France', 'Baltic Sea'] },
    { name: 'France', isWater: false, connections: ['Germany'] },
    { name: 'Baltic Sea', isWater: true, connections: ['Germany'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'Germans', name: 'Germany', isAI: false }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.territoryState = {
    Germany: { owner: 'Germans' },
    France: { owner: 'Germans' },
  };
  gs.playerState = {
    Germans: { ipcs: 90, capitalTerritory: 'Germany', hasPlacedCapital: true },
  };
  gs.playerTechs = { Germans: { unlockedTechs: [] } };
  gs.units = {
    Germany: [{ type: 'factory', quantity: 1, owner: 'Germans' }],
    France: [{ type: 'factory', quantity: 1, owner: 'Germans' }],
  };
  gs.factoriesAtTurnStart = new Set(['Germany']);
  gs.unitDefs = unitDefs;
  gs._unitDefs = unitDefs;
  gs._notify = () => {};
  const placeable = 20;
  let bought = 0;
  let blocked = null;
  for (let i = 0; i < 30; i += 1) {
    const result = gs.addToPendingPurchases('infantry', unitDefs);
    if (!result.success) {
      blocked = result;
      break;
    }
    bought += 1;
  }
  check('a purchase stops at the factories you can place on this turn',
    bought === placeable && blocked && blocked.success === false,
    { bought, error: blocked?.error, capacity: gs.getMobilizationCapacity('Germans') });

  gs.pendingPurchases = [];
  gs.playerState.Germans.ipcs = 90;
  const pp = Object.create(PlayerPanel.prototype);
  pp.gameState = gs;
  pp.unitDefs = unitDefs;
  pp.territories = gs.territoryByName;
  pp.repairPoints = {};
  pp.selectedUnitType = 'infantry';
  const html = pp._renderInlinePurchase(gs.currentPlayer);
  const maxBtn = html.match(/data-action="buy-max" data-unit="infantry"[^>]*>([^<]*)</);
  const maxLabel = (maxBtn?.[1] || '').replace(/\s+/g, ' ').trim();
  check('the purchase row shows how many infantry you can still buy',
    maxLabel === 'Max 20',
    maxLabel || html.slice(html.indexOf('infantry'), html.indexOf('infantry') + 240));
  const phone = pp._renderPhonePeekRow(gs.currentPlayer, GAME_PHASES.PLAYING, TURN_PHASES.PURCHASE);
  check('the phone purchase tile shows that same max',
    /Max 20/.test(phone) && phone.includes('data-unit="infantry"'),
    phone.slice(0, 500));

  for (let i = 0; i < placeable; i += 1) gs.addToPendingPurchases('infantry', unitDefs);
  const full = pp._renderInlinePurchase(gs.currentPlayer);
  const plus = full.match(/data-action="buy-unit" data-unit="infantry" data-delta="1"[^>]*/);
  check('plus is off once placement room is used, even with IPCs left',
    !!plus && /\bdisabled\b/.test(plus[0]) && gs.getIPCs('Germans') >= 3,
    plus?.[0]);
}

console.log('=== 3. undo puts a mobilization back in the tray ===');
{
  const territories = [
    { name: 'Germany', isWater: false, connections: [] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'Germans', name: 'Germany', isAI: false }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.MOBILIZE;
  gs.territoryState = { Germany: { owner: 'Germans' } };
  gs.playerState = { Germans: { ipcs: 10, capitalTerritory: 'Germany', hasPlacedCapital: true } };
  gs.units = { Germany: [{ type: 'factory', quantity: 1, owner: 'Germans' }] };
  gs.factoriesAtTurnStart = new Set(['Germany']);
  gs.pendingPurchases = [{ type: 'infantry', quantity: 1, owner: 'Germans', cost: 3 }];
  gs._notify = () => {};
  const placed = gs.mobilizeUnit('infantry', 'Germany', unitDefs);
  const undone = gs.undoMobilization(unitDefs);
  const back = (gs.pendingPurchases || []).find((item) => item.type === 'infantry' && item.owner === 'Germans');
  check('undo removes the placed infantry and returns it to pending',
    placed.success === true
    && undone.success === true
    && back?.quantity === 1
    && qty(gs, 'Germany', 'infantry', 'Germans') === 0,
    { placed, undone, back, units: gs.units.Germany });
}

console.log('=== 4. air from Persia can attack while infantry stay ===');
{
  const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'British', name: 'UK', isAI: false },
    { id: 'Japanese', name: 'Japan', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.playerState = {
    British: { ipcs: 30, capitalTerritory: 'United Kingdom', hasPlacedCapital: true },
    Japanese: { ipcs: 20, capitalTerritory: 'Japan', hasPlacedCapital: true },
  };
  gs.playerTechs = { British: { unlockedTechs: [] }, Japanese: { unlockedTechs: [] } };
  gs.territoryState = {
    Persia: { owner: 'British' },
    India: { owner: 'British' },
    'French Indo China': { owner: 'Japanese' },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Persia', 'India']);
  gs.units = {
    Persia: [
      { type: 'fighter', quantity: 1, owner: 'British' },
      { type: 'infantry', quantity: 2, owner: 'British' },
    ],
    'French Indo China': [{ type: 'infantry', quantity: 1, owner: 'Japanese' }],
  };
  const dests = combatMoveReachableDests(gs, 'Persia', { fighter: 1 }, unitDefs);
  const moved = gs.moveUnits('Persia', 'French Indo China', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('a fighter in Persia can reach French Indo China',
    dests.some((dest) => dest.name === 'French Indo China'),
    dests.map((dest) => dest.name).slice(0, 12));
  check('the fighter moves and the infantry stay',
    moved.success === true
    && qty(gs, 'Persia', 'infantry', 'British') === 2
    && qty(gs, 'Persia', 'fighter', 'British') === 0
    && qty(gs, 'French Indo China', 'fighter', 'British') === 1,
    moved.error);
}

console.log('=== 5. the casualty line matches the units removed ===');
{
  const attackers = [
    { type: 'infantry', quantity: 3, owner: 'Germans' },
    { type: 'armour', quantity: 2, owner: 'Germans' },
  ];
  const selected = { infantry: 2 };
  const ui = Object.create(CombatUI.prototype);
  ui.unitDefs = unitDefs;
  const line = ui._leftWithLine(attackers, selected);
  const applied = applyCasualtySelection(attackers, selected);
  const leftInf = attackers.find((unit) => unit.type === 'infantry')?.quantity;
  const leftArmour = attackers.find((unit) => unit.type === 'armour')?.quantity;
  check('the left line names the units that remain',
    line.startsWith('Left:') && line.includes('1x Infantry') && line.includes('2x Tank'),
    line);
  check('confirm removes those same units',
    applied.applied.some((hit) => hit.type === 'infantry' && hit.taken === 2)
    && leftInf === 1
    && leftArmour === 2);
}

console.log('=== 6. return to base does not delete a retreating bomber ===');
{
  const territories = [
    { name: 'East', isWater: true, connections: ['West', 'Coast'] },
    { name: 'West', isWater: true, connections: ['East'] },
    { name: 'Coast', isWater: false, connections: ['East'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'Americans', name: 'Bastion', isAI: false },
    { id: 'Japanese', name: 'Japan', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.territoryState = { Coast: { owner: 'Americans' } };
  gs.playerState = {
    Americans: { ipcs: 20, capitalTerritory: 'Coast' },
    Japanese: { ipcs: 20, capitalTerritory: 'Japan' },
  };
  gs.playerTechs = { Americans: { unlockedTechs: [] }, Japanese: { unlockedTechs: [] } };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Coast']);
  gs.unitDefs = unitDefs;
  gs._unitDefs = unitDefs;
  gs._notify = () => {};
  gs.autoSave = () => {};
  gs.units = {
    East: [
      { type: 'cruiser', quantity: 1, owner: 'Americans' },
      { type: 'bomber', quantity: 1, owner: 'Americans' },
      { type: 'cruiser', quantity: 1, owner: 'Japanese' },
    ],
    West: [],
    Coast: [],
  };
  gs.airUnitOrigins = {
    East: { bomber: { origin: 'West', distance: 1, movement: 6 } },
  };
  gs.moveHistory = [{ from: 'West', to: 'East', player: 'Americans' }];
  gs.combatQueue = ['East'];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.currentTerritory = 'East';
  ui.combatState = {
    attackers: [
      { type: 'cruiser', quantity: 1, owner: 'Americans' },
      { type: 'bomber', quantity: 1, owner: 'Americans' },
    ],
    defenders: [{ type: 'cruiser', quantity: 1, owner: 'Japanese' }],
    phase: 'ready',
    isRetreating: false,
  };
  ui._executeRetreat('West');
  const assigned = returnToBaseAssignments(
    ui.combatState.airUnitsToLand,
    gs.airUnitOrigins.East,
    {},
  );
  ui.combatState.selectedLandings = assigned.selections;
  ui.combatState.isRetreating = true;
  ui._confirmAirLandings();
  const alive = ['East', 'West', 'Coast'].reduce((sum, name) => sum + qty(gs, name, 'bomber', 'Americans'), 0);
  const parked = (gs.pendingAirLandings || []).reduce((sum, entry) => (
    sum + (entry.units || []).reduce((inner, unit) => (
      inner + (unit.type === 'bomber' ? (Number(unit.quantity) || 0) : 0)
    ), 0)
  ), 0);
  check('the retreating bomber is still in the game after return to base',
    alive + parked === 1,
    { alive, parked, selections: assigned.selections, units: gs.units, pending: gs.pendingAirLandings });
}

console.log('=== 7. an AA gun moves in non-combat and does not attack ===');
{
  const territories = [
    { name: 'Germany', isWater: false, connections: ['France'] },
    { name: 'France', isWater: false, connections: ['Germany'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'Germans', name: 'Germany', isAI: false },
    { id: 'British', name: 'UK', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.territoryState = { Germany: { owner: 'Germans' }, France: { owner: 'British' } };
  gs.playerState = {
    Germans: { ipcs: 10, capitalTerritory: 'Germany' },
    British: { ipcs: 10, capitalTerritory: 'France' },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Germany']);
  gs.units = {
    Germany: [{ type: 'aaGun', quantity: 1, owner: 'Germans' }],
    France: [{ type: 'infantry', quantity: 1, owner: 'British' }],
  };
  gs._notify = () => {};
  const attack = gs.moveUnits('Germany', 'France', [{ type: 'aaGun', quantity: 1 }], unitDefs);
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  const quiet = gs.moveUnits('Germany', 'France', [{ type: 'aaGun', quantity: 1 }], unitDefs);
  check('AA attack is 0 and a combat move is refused',
    unitDefs.aaGun.attack === 0 && attack.success === false, attack.error);
  check('the same gun can move in non-combat into friendly land',
    quiet.success === false && /non-combat|enemy/i.test(quiet.error || ''), quiet.error);
  gs.territoryState.France.owner = 'Germans';
  const moved = gs.moveUnits('Germany', 'France', [{ type: 'aaGun', quantity: 1 }], unitDefs);
  check('non-combat move into friendly land works',
    moved.success === true && qty(gs, 'France', 'aaGun', 'Germans') === 1, moved.error);
}

console.log('=== 8. each faction\'s battleship keeps its own colour ===');
{
  const rows = [
    { type: 'battleship', quantity: 1, owner: 'Japanese', damagedCount: 0 },
    { type: 'battleship', quantity: 1, owner: 'Germans', damagedCount: 0 },
  ];
  const html = CombatUI.prototype._renderCasualtyUnits.call({
    unitDefs,
    _sideShieldsTransports() { return true; },
    _maxLegalSubSelections() { return 0; },
  }, rows, {}, 'defender');
  const japanese = (html.match(/units\/Japanese\/Battleship\.png/g) || []).length;
  const german = (html.match(/units\/Germans\/Battleship\.png/g) || []).length;
  check('two enemy battleships are two rows in their own colours',
    japanese === 1 && german === 1 && !html.includes('>(2)<'),
    html);
  const one = CombatUI.prototype._renderCasualtyUnits.call({
    unitDefs,
    _sideShieldsTransports() { return true; },
  }, [{ type: 'battleship', quantity: 1, owner: 'Germans', damagedCount: 0 }], {}, 'defender');
  check('one battleship is still one icon', (one.match(/<img /g) || []).length === 1);

  const territories = [
    { name: 'Sea', isWater: true, connections: [] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'Americans', name: 'USA', alliance: 'allies' },
    { id: 'British', name: 'UK', alliance: 'allies' },
    { id: 'Japanese', name: 'Japan', alliance: 'axis' },
    { id: 'Germans', name: 'Germany', alliance: 'axis' },
  ];
  gs.alliancesEnabled = true;
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.playerState = {
    Americans: { ipcs: 0 }, British: { ipcs: 0 }, Japanese: { ipcs: 0 }, Germans: { ipcs: 0 },
  };
  gs.units = {
    Sea: [
      { type: 'destroyer', quantity: 1, owner: 'Americans' },
      { type: 'battleship', quantity: 1, owner: 'British' },
      { type: 'battleship', quantity: 1, owner: 'Japanese' },
      { type: 'battleship', quantity: 1, owner: 'Germans', cargo: [{ type: 'infantry', owner: 'Germans', quantity: 2 }] },
    ],
  };
  gs._notify = () => {};
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.currentTerritory = 'Sea';
  ui._initCombatState();
  const owners = (ui.combatState.defenders || []).map((unit) => `${unit.owner}:${unit.type}`);
  check('an allied ship is not listed as a casualty',
    !owners.some((row) => row.startsWith('British')),
    owners);
  const casualtyHtml = ui._renderCasualtyUnits(ui.combatState.defenders, {}, 'defender');
  check('cargo on a battleship is not a phantom ship',
    !casualtyHtml.includes('infantry') && !casualtyHtml.includes('units/British/'),
    casualtyHtml);
  const ships = [
    { type: 'battleship', quantity: 1, owner: 'Japanese' },
    { type: 'battleship', quantity: 1, owner: 'Germans' },
  ];
  applyCasualtySelection(ships, { 'battleship@Germans': 1 });
  check('a German battleship hit does not remove the Japanese ship',
    ships.find((unit) => unit.owner === 'Japanese')?.quantity === 1
    && ships.find((unit) => unit.owner === 'Germans')?.quantity === 0,
    ships);
}

console.log('=== 9. a fight that loses 4 tanks says 4x Tanks ===');
{
  const territories = [
    { name: 'Ukraine', isWater: false, connections: ['Germany'] },
    { name: 'Germany', isWater: false, connections: ['Ukraine'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'Germans', name: 'Robfox007', isAI: false },
    { id: 'British', name: 'Bastion', isAI: false },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.territoryState = { Ukraine: { owner: 'British' }, Germany: { owner: 'Germans' } };
  gs.playerState = {
    Germans: { ipcs: 20, capitalTerritory: 'Germany' },
    British: { ipcs: 20, capitalTerritory: 'Britain' },
  };
  gs.playerTechs = { Germans: { unlockedTechs: [] }, British: { unlockedTechs: [] } };
  gs.units = {
    Ukraine: [
      { type: 'armour', quantity: 4, owner: 'Germans' },
      { type: 'infantry', quantity: 4, owner: 'British' },
    ],
  };
  gs.unitDefs = unitDefs;
  gs._unitDefs = unitDefs;
  gs._notify = () => {};
  gs.autoSave = () => {};
  gs._rollDie = () => 1;
  const result = gs.resolveCombat('Ukraine', unitDefs);
  const summary = formatRecipientLossSummary(gs.turnEvents, {
    recipientId: 'Germans',
    players: gs.players,
  });
  check('the combat removes the 4 tanks',
    result && qty(gs, 'Ukraine', 'armour', 'Germans') === 0,
    result);
  check('the turn ping lists 4x Tanks',
    summary.includes('4x Tanks'),
    summary);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nunified.62 report checks passed');
