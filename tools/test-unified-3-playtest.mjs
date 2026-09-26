// V2.81.57-unified.16 — playtest P0s: single-row undo, transport load,
// amphibious assault, empty-land air, desktop right-click / unit drag.
// Run: node tools/test-unified-3-playtest.mjs

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES, LAND_BRIDGES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { combatMoveReachableDests } = await import(pathToFileURL(join(root, 'src/state/combatMoveEligibility.js')));
const { shouldApplyRemoteGameState } = await import(pathToFileURL(join(root, 'src/state/placementPass.js')));
const { pointerStartsUnitDrag, rightClickConfirmsMove } = await import(pathToFileURL(join(root, 'src/ui/mapPointer.js')));
const { legalDests, createSoloPlay } = await import(pathToFileURL(join(root, 'src/map/threeSoloPlay.js')));
const {
  isIslandCapital,
  pickIslandAssault,
  pickSecondaryFactorySite,
  pickTransportSail,
  planIslandNavyPurchases,
} = await import(pathToFileURL(join(root, 'src/ai/islandNavy.js')));
const { AIController } = await import(pathToFileURL(join(root, 'src/ai/aiController.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true, movement: 1, attack: 1, defense: 2, cost: 3 },
  tank: { isLand: true, movement: 2, attack: 3, defense: 3, cost: 5 },
  fighter: { isAir: true, movement: 4, attack: 3, defense: 4 },
  transport: { isSea: true, movement: 2, attack: 0, defense: 1, canCarry: ['infantry', 'tank'] },
  submarine: { isSea: true, movement: 2, attack: 2, defense: 1 },
  battleship: { isSea: true, movement: 2, attack: 4, defense: 4 },
};

function board() {
  const territories = [
    { name: 'Britain', isWater: false, connections: ['North Sea', 'France', 'Germany'] },
    { name: 'France', isWater: false, connections: ['Britain', 'North Sea', 'Germany'] },
    { name: 'Germany', isWater: false, connections: ['France', 'Baltic', 'Britain'] },
    { name: 'North Sea', isWater: true, connections: ['Britain', 'France', 'Baltic'] },
    { name: 'Baltic', isWater: true, connections: ['North Sea', 'Germany'] },
    { name: 'Home', isWater: false, connections: ['Away'] },
    { name: 'Away', isWater: false, connections: ['Home'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'uk', name: 'British', alliance: 'allies' },
    { id: 'ger', name: 'Germans', alliance: 'axis' },
  ];
  gs.currentPlayerIndex = 0;
  gs.alliancesEnabled = true;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs._unitDefs = unitDefs;
  gs.territoryState = {
    Britain: { owner: 'uk' },
    France: { owner: 'ger' },
    Germany: { owner: 'ger' },
    'North Sea': { owner: null },
    Baltic: { owner: null },
    Home: { owner: 'uk' },
    Away: { owner: 'uk' },
  };
  gs.playerState = {
    uk: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'Britain' },
    ger: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'Germany' },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Britain', 'Home', 'Away']);
  gs.units = {
    Britain: [
      { type: 'infantry', quantity: 2, owner: 'uk' },
      { type: 'fighter', quantity: 1, owner: 'uk' },
    ],
    France: [{ type: 'infantry', quantity: 1, owner: 'ger' }],
    Germany: [],
    'North Sea': [{ type: 'transport', quantity: 1, owner: 'uk' }],
    Baltic: [{ type: 'submarine', quantity: 1, owner: 'ger' }],
    Home: [{ type: 'fighter', quantity: 1, owner: 'uk' }],
    Away: [],
  };
  return gs;
}

const html = readFileSync(join(root, 'index.html'), 'utf8');
const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');

console.log('=== stamp ===');
check('GAME_VERSION is V2.81.57-unified.16', GAME_VERSION === 'V2.81.57-unified.16');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);
check('index.html stamp is unified.5', html.includes('content="V2.81.57-unified.16"'));

console.log('=== 9.22.26.04 one undo row ===');
{
  const gs = board();
  gs.units.Britain = [
    { type: 'infantry', quantity: 1, owner: 'uk' },
    { type: 'tank', quantity: 1, owner: 'uk' },
  ];
  gs.units.France = [];
  gs.territoryState.France.owner = 'uk';
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  const first = gs.moveUnits('Britain', 'France', [{ type: 'infantry', quantity: 1 }], unitDefs);
  const second = gs.moveUnits('Britain', 'France', [{ type: 'tank', quantity: 1 }], unitDefs);
  check('two independent moves land', first.success === true && second.success === true);
  const undone = gs.undoMoveById(first.id || gs.moveHistory[0].id);
  check('undoing the first move succeeds', undone.success === true && undone.undone === 1);
  check('the tank move is still on the board',
    (gs.units.France || []).some((u) => u.type === 'tank' && u.owner === 'uk'));
  check('infantry returned to Britain',
    (gs.units.Britain || []).some((u) => u.type === 'infantry' && u.owner === 'uk'));
  check('one history row remains', gs.moveHistory.length === 1);
}

console.log('=== 9.22.26.05 load infantry onto a transport ===');
{
  const gs = board();
  const dests = combatMoveReachableDests(gs, 'Britain', { infantry: 1 }, unitDefs);
  check('combat-move catalog offers the friendly transport sea',
    dests.some((d) => d.name === 'North Sea' && d.via === 'transport'));
  check('hostile Baltic is not a land-unit load',
    !dests.some((d) => d.name === 'Baltic'));
  const loaded = gs.moveUnits('Britain', 'North Sea', [{ type: 'infantry', quantity: 1 }], unitDefs);
  check('infantry loads', loaded.success === true);
  const ship = (gs.units['North Sea'] || []).find((u) => u.type === 'transport' && u.owner === 'uk');
  check('cargo is on the transport', (ship?.cargo || []).some((c) => c.type === 'infantry'));
  check('one infantry left Britain',
    (gs.units.Britain || []).filter((u) => u.type === 'infantry' && u.owner === 'uk')
      .reduce((sum, u) => sum + (u.quantity || 0), 0) === 1);
}

console.log('=== 9.22.26.06 amphibious assault ===');
{
  const gs = board();
  gs.units['North Sea'] = [{
    type: 'transport', id: 'tr1', owner: 'uk', quantity: 1, cargo: [{ type: 'infantry', owner: 'uk' }], movementUsed: 0,
  }];
  gs.units.France = [];
  const empty = gs.unloadTransport('North Sea', 0, 'France');
  check('unload onto empty enemy coast succeeds', empty.success === true);
  check('infantry is in France',
    (gs.units.France || []).some((u) => u.type === 'infantry' && u.owner === 'uk'));
  check('empty coast is captured', gs.getOwner('France') === 'uk');

  const fight = board();
  fight.units['North Sea'] = [{
    type: 'transport', id: 'tr2', owner: 'uk', quantity: 1,
    cargo: [{ type: 'infantry', owner: 'uk' }], movementUsed: 0,
  }];
  const assaulted = fight.unloadSingleUnit('North Sea', 0, 'infantry', 'France');
  check('unload onto a defended coast succeeds', assaulted.success === true);
  check('defended coast stays enemy until combat', fight.getOwner('France') === 'ger');
  fight.nextPhase();
  check('defended amphibious assault is a battle',
    fight.turnPhase === TURN_PHASES.COMBAT && (fight.combatQueue || []).includes('France'));
}

console.log('=== 9.22.26.07 aircraft cannot occupy empty land ===');
{
  const gs = board();
  const empty = gs.moveUnits('Britain', 'Germany', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('empty enemy land rejects the fighter', empty.success === false);
  check('fighter stayed in Britain',
    (gs.units.Britain || []).some((u) => u.type === 'fighter' && u.owner === 'uk'));
  const attack = gs.moveUnits('Britain', 'France', [{ type: 'fighter', quantity: 1 }], unitDefs);
  check('occupied enemy land is a legal air attack', attack.success === true);
  const catalog = combatMoveReachableDests(board(), 'Britain', { fighter: 1 }, unitDefs);
  check('catalog omits empty Germany', !catalog.some((d) => d.name === 'Germany'));
}

console.log('=== 9.22.26.03 sea confirm still commits ===');
{
  const gs = board();
  gs.units['North Sea'] = [
    { type: 'battleship', quantity: 1, owner: 'uk' },
  ];
  const moved = gs.moveUnits('North Sea', 'Baltic', [{ type: 'battleship', quantity: 1 }], unitDefs);
  check('North Sea to Baltic is an attack', moved.success === true && moved.isAttack === true);
  check('battleship stayed in the Baltic',
    (gs.units.Baltic || []).some((u) => u.type === 'battleship' && u.owner === 'uk' && u.moved === true));
}

console.log('=== 9.22.26.02 deploy undo then place elsewhere ===');
{
  const territories = [
    { name: 'Home', isWater: false, connections: ['Away'] },
    { name: 'Away', isWater: false, connections: ['Home'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'uk', name: 'British' }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.playerState = { uk: { ipcs: 20, capitalTerritory: 'Home', hasPlacedCapital: true } };
  gs.territoryState = { Home: { owner: 'uk' }, Away: { owner: 'uk' } };
  gs.units = { Home: [], Away: [] };
  gs.unitsToPlace = { uk: [{ type: 'infantry', quantity: 2 }] };
  check('first place', gs.placeInitialUnit('Home', 'infantry', unitDefs).success === true);
  const stale = gs.toJSON();
  check('undo', gs.undoPlacement() === true);
  check('replace', gs.placeInitialUnit('Away', 'infantry', unitDefs).success === true);
  const saved = gs.toJSON();
  const peer = new GameState({ risk: { factions: [] } }, territories, []);
  peer.loadFromJSON(stale);
  check('stale place is not applied over the newer undo',
    shouldApplyRemoteGameState({
      remoteVersion: 2,
      localVersion: 1,
      remoteActionSeq: stale.actionSeq,
      localActionSeq: saved.actionSeq,
    }) === false);
  peer.loadFromJSON(saved);
  check('only the later placement is on the map',
    !(peer.units.Home || []).some((u) => u.type === 'infantry' && (u.quantity || 0) > 0)
    && (peer.units.Away || []).some((u) => u.type === 'infantry' && u.owner === 'uk'));
}

console.log('=== 9.22.26.01-UX and 9.22.26.09 gestures ===');
{
  check('right-click confirms a legal combat-move dest', rightClickConfirmsMove({
    button: 2, turnPhase: 'combat_move', hasSelection: true, destLegal: true,
  }) === true);
  check('left-click does not confirm', rightClickConfirmsMove({
    button: 0, turnPhase: 'combat_move', hasSelection: true, destLegal: true,
  }) === false);
  check('right-click without a selection does not move', rightClickConfirmsMove({
    button: 2, turnPhase: 'non_combat_move', hasSelection: false, destLegal: true,
  }) === false);
  const hit = { unitType: 'infantry', owner: 'uk', unitDef: { isLand: true } };
  check('drag starts on a selected unit', pointerStartsUnitDrag({
    button: 0, turnPhase: 'combat_move', unitHit: hit, selectedUnits: { infantry: 1 }, currentPlayerId: 'uk',
  }) === true);
  check('drag does not start on an unselected unit', pointerStartsUnitDrag({
    button: 0, turnPhase: 'combat_move', unitHit: hit, selectedUnits: { tank: 1 }, currentPlayerId: 'uk',
  }) === false);
  check('drag does not start on empty map', pointerStartsUnitDrag({
    button: 0, turnPhase: 'combat_move', unitHit: null, selectedUnits: { infantry: 1 }, currentPlayerId: 'uk',
  }) === false);
  check('main wires contextmenu to confirm-move', mainSrc.includes("action: 'confirm-move'") && mainSrc.includes('contextmenu'));
  check('main starts unit drag only from pointerStartsUnitDrag', mainSrc.includes('pointerStartsUnitDrag'));
}

console.log('=== shared dests still omit a hostile sea for land ===');
{
  const gs = board();
  gs.units['North Sea'] = [
    { type: 'transport', quantity: 1, owner: 'uk' },
    { type: 'submarine', quantity: 1, owner: 'ger' },
  ];
  const dests = combatMoveReachableDests(gs, 'Britain', { infantry: 1 }, unitDefs);
  check('hostile sea with a friendly transport is not a land attack',
    !dests.some((d) => d.name === 'North Sea'));
  const play = createSoloPlay(gs, unitDefs);
  play.selected = 'Britain';
  play.selectedUnits = { infantry: 1 };
  check('solo legalDests also omit that hostile sea', !legalDests(play).includes('North Sea'));
}

console.log('=== 9.22.26.10 island-capital navy ===');
{
  const realList = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
  const realByName = Object.fromEntries(realList.map((t) => [t.name, t]));
  const realIslands = realList
    .filter((t) => !t.isWater && isIslandCapital(realByName, t.name, LAND_BRIDGES))
    .map((t) => t.name)
    .sort();
  check('movement graph excludes Japan', isIslandCapital(realByName, 'Japan') === false);
  check('movement graph excludes the United Kingdom', isIslandCapital(realByName, 'United Kingdom') === false);
  check('movement graph excludes Eire', isIslandCapital(realByName, 'Eire') === false);
  check('Australia has a land bridge, so it is not an island capital', isIslandCapital(realByName, 'Australia') === false);
  check('starting capitals are not island capitals',
    ['Japan', 'United Kingdom', 'East US', 'Germany', 'Russia'].every((name) => isIslandCapital(realByName, name) === false));
  check('Philippines has no land step', isIslandCapital(realByName, 'Philippines') === true);
  check('true islands are only sea-locked territories',
    realIslands.join('|') === [
      'Borneo Celebes',
      'Caroline Islands',
      'Hawaiian Islands',
      'Midway',
      'New Guinea',
      'Okinawa',
      'Philippines',
      'Solomon Islands',
      'Wake Island',
    ].join('|'));

  const islandMap = {
    Philippines: { name: 'Philippines', isWater: false, connections: ['Sea'] },
    Sea: { name: 'Sea', isWater: true, connections: ['Philippines', 'Korea', 'Open'] },
    Open: { name: 'Open', isWater: true, connections: ['Sea'] },
    Korea: { name: 'Korea', isWater: false, connections: ['Sea', 'China'] },
    China: { name: 'China', isWater: false, connections: ['Korea', 'India', 'Foothold'] },
    India: { name: 'India', isWater: false, connections: ['China'] },
    Foothold: { name: 'Foothold', isWater: false, connections: ['China'] },
    Germany: { name: 'Germany', isWater: false, connections: ['A', 'B'] },
    A: { name: 'A', isWater: false, connections: ['Germany', 'C'] },
    B: { name: 'B', isWater: false, connections: ['Germany', 'D'] },
    C: { name: 'C', isWater: false, connections: ['A', 'E'] },
    D: { name: 'D', isWater: false, connections: ['B'] },
    E: { name: 'E', isWater: false, connections: ['C'] },
  };
  check('a sea-locked capital is an island start', isIslandCapital(islandMap, 'Philippines') === true);
  check('Japan is not an island even with only a sea polygon', isIslandCapital({
    Japan: { name: 'Japan', isWater: false, connections: ['Sea'] },
    Sea: { name: 'Sea', isWater: true, connections: ['Japan'] },
  }, 'Japan') === false);
  check('a land-connected capital is not an island start', isIslandCapital(islandMap, 'Germany') === false);
  const navyDefs = {
    infantry: { cost: 3, attack: 1, defense: 2, movement: 1, isLand: true },
    armour: { cost: 5, attack: 3, defense: 3, movement: 2, isLand: true },
    artillery: { cost: 4, attack: 2, defense: 2, movement: 1, isLand: true },
    fighter: { cost: 10, attack: 3, defense: 4, movement: 4, isAir: true },
    transport: { cost: 7, attack: 0, defense: 0, movement: 2, isSea: true, canCarry: ['infantry'] },
    submarine: { cost: 6, attack: 2, defense: 1, movement: 2, isSea: true },
    factory: { cost: 15, attack: 0, defense: 0, movement: 0, isBuilding: true },
  };
  const held = planIslandNavyPurchases({
    ipcs: 40,
    unitDefs: navyDefs,
    transportCount: 0,
    escortCount: 0,
    reserve: 15,
  });
  check('island plan buys transports and an escort before the factory reserve',
    held.buys.filter((b) => b.unitType === 'transport').reduce((s, b) => s + b.count, 0) === 2
    && held.buys.some((b) => b.unitType === 'submarine' && b.placement === 'sea'));
  check('threatened island capital does not buy ships',
    planIslandNavyPurchases({ ipcs: 40, unitDefs: navyDefs, threatened: true }).buys.length === 0);
  check('secondary factory prefers the other landmass',
    pickSecondaryFactorySite({
      territoryByName: islandMap,
      capitalName: 'Philippines',
      ownedLands: ['Philippines', 'Foothold'],
      factoryAt: () => false,
      friendlyAtStart: new Set(['Philippines', 'Foothold']),
    }) === 'Foothold');
  const assault = pickIslandAssault({
    territoryByName: islandMap,
    units: { Sea: [{ type: 'transport', owner: 'jp', cargo: [{ type: 'infantry', owner: 'jp' }] }] },
    playerId: 'jp',
    enemyLand: (name) => name === 'Korea',
    emptyLand: () => true,
  });
  check('loaded transport assaults the adjacent island', assault?.coast === 'Korea' && assault.sea === 'Sea');
  const sail = pickTransportSail({
    territoryByName: islandMap,
    units: { Open: [{ type: 'transport', owner: 'jp', cargo: [{ type: 'infantry', owner: 'jp' }] }] },
    playerId: 'jp',
    enemyLand: (name) => name === 'Korea',
  });
  check('loaded transport sails toward a sea that touches enemy land', sail?.from === 'Open' && sail?.to === 'Sea');

  const territories = Object.values(islandMap).filter((t) => !['Germany', 'A', 'B', 'C', 'D', 'E'].includes(t.name));
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'jp', name: 'Japanese', alliance: 'axis' },
    { id: 'cn', name: 'Chinese', alliance: 'allies' },
  ];
  gs.currentPlayerIndex = 0;
  gs.alliancesEnabled = true;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.territoryState = {
    Philippines: { owner: 'jp' },
    Korea: { owner: 'cn' },
    China: { owner: 'cn' },
    India: { owner: 'cn' },
    Foothold: { owner: 'jp' },
    Sea: { owner: null },
    Open: { owner: null },
  };
  gs.playerState = {
    jp: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'Philippines' },
    cn: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'China' },
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Philippines', 'Foothold']);
  gs.units = {
    Philippines: [{ type: 'infantry', quantity: 2, owner: 'jp' }, { type: 'factory', quantity: 1, owner: 'jp' }],
    Foothold: [{ type: 'infantry', quantity: 1, owner: 'jp' }],
    Korea: [],
    China: [],
    India: [],
    Sea: [],
    Open: [],
  };
  const ai = new AIController();
  ai.gameState = gs;
  ai.unitDefs = navyDefs;
  ai._delay = async () => {};
  await ai._handlePurchase({ difficulty: 'medium' }, gs.players[0]);
  const ships = (type) => (gs.units.Sea || []).filter((u) => u.type === type && u.owner === 'jp')
    .reduce((sum, u) => sum + (u.quantity || 0), 0);
  check('island AI placed transports in the capital sea', ships('transport') === 2);
  check('island AI placed an escort', ships('submarine') === 1);
  check('factory is queued for the other landmass',
    (gs.pendingPurchases || []).some((row) => row.type === 'factory' && row.territory === 'Foothold' && row.owner === 'jp'));
  gs.turnPhase = TURN_PHASES.MOBILIZE;
  await ai._handleMobilize({ difficulty: 'medium' }, gs.players[0]);
  check('factory mobilizes on the foothold',
    (gs.units.Foothold || []).some((u) => u.type === 'factory' && u.owner === 'jp'));

  gs.currentPlayerIndex = 0;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.units.Sea = [{
    type: 'transport',
    quantity: 1,
    owner: 'jp',
    id: 't-assault',
    cargo: [{ type: 'infantry', quantity: 1, owner: 'jp' }],
    moved: false,
  }];
  await ai._projectIslandNavy(gs.players[0], 'combat');
  check('island AI unloads onto the empty enemy coast',
    gs.getOwner('Korea') === 'jp'
    && (gs.units.Korea || []).some((u) => u.type === 'infantry' && u.owner === 'jp'));

  const japanTerritories = [
    { name: 'Japan', isWater: false, connections: ['Sea'] },
    { name: 'Sea', isWater: true, connections: ['Japan'] },
    { name: 'Manchuria', isWater: false, connections: [] },
  ];
  const japan = new GameState({ risk: { factions: [] } }, japanTerritories, []);
  japan.players = [{ id: 'jp', name: 'Japanese', alliance: 'axis' }];
  japan.currentPlayerIndex = 0;
  japan.phase = GAME_PHASES.PLAYING;
  japan.turnPhase = TURN_PHASES.PURCHASE;
  japan.territoryState = { Japan: { owner: 'jp' }, Sea: { owner: null }, Manchuria: { owner: 'cn' } };
  japan.playerState = { jp: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'Japan' } };
  japan.units = { Japan: [{ type: 'infantry', quantity: 2, owner: 'jp' }, { type: 'factory', quantity: 1, owner: 'jp' }], Sea: [], Manchuria: [] };
  const japanAi = new AIController();
  japanAi.gameState = japan;
  japanAi.unitDefs = navyDefs;
  japanAi._delay = async () => {};
  await japanAi._handlePurchase({ difficulty: 'medium' }, japan.players[0]);
  const japanShips = Object.values(japan.units).flat().filter((u) => u && (u.type === 'transport' || u.type === 'submarine') && u.owner === 'jp');
  check('Japan uses the normal purchase list, not the island navy profile', japanShips.length === 0);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall unified.5 checks passed');
