// Optional garrisons. Off until the host turns the lobby option on.
// Run: node tools/test-garrison.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem(key) { return mem.has(key) ? mem.get(key) : null; },
    setItem(key, value) { mem.set(key, String(value)); },
    removeItem(key) { mem.delete(key); },
  };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION, compareGameVersions, compatClientVersion } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  describe,
  isStandardRules,
  normalizeGameOptions,
} = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { renderGameOptionsPanel } = await import(pathToFileURL(join(root, 'src/ui/gameOptionsPanel.js')));
const { formatUnitName } = await import(pathToFileURL(join(root, 'src/utils/unitNames.js')));
const { getUnitIconPath } = await import(pathToFileURL(join(root, 'src/utils/unitIcons.js')));
const { garrisonIconSvg } = await import(pathToFileURL(join(root, 'src/utils/garrisonMark.js')));
const { getMap } = await import(pathToFileURL(join(root, 'src/map/mapRegistry.js')));
const {
  GARRISON,
  garrisonHitAllowed,
  respawnOriginalGarrison,
} = await import(pathToFileURL(join(root, 'src/state/garrison.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));

const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

function countType(gs, type, territory = null) {
  let total = 0;
  const bags = territory ? { [territory]: gs.units[territory] || [] } : gs.units;
  for (const stack of Object.values(bags || {})) {
    for (const unit of stack || []) {
      if (unit?.type === type) total += Number(unit.quantity) || 0;
    }
  }
  return total;
}

function freshClassic(on) {
  const setup = readJson('data/setup.json');
  const gs = new GameState(setup, readJson('data/territories.json'), readJson('data/continents.json'));
  const players = setup.risk.factions.slice(0, 2).map((faction) => ({
    ...faction,
    isAI: true,
    aiDifficulty: 'easy',
  }));
  gs.initGame('risk', players, { gameOptions: { garrisons: on } });
  return gs;
}

function firstLand(gs) {
  return gs.getPlayerTerritories(gs.currentPlayer.id)
    .find((name) => !gs.territoryByName[name]?.isWater);
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

console.log('=== lobby default off ===');
{
  check('default is off', normalizeGameOptions(null).garrisons === false);
  check('empty object is off', normalizeGameOptions({}).garrisons === false);
  check('a missing field is off', normalizeGameOptions({ tacticalBombers: true }).garrisons === false);
  check('explicit true is kept', normalizeGameOptions({ garrisons: true }).garrisons === true);
  check('explicit false is kept', normalizeGameOptions({ garrisons: false }).garrisons === false);
  check('off is still standard rules', isStandardRules(null) === true && describe(null) === 'Standard rules');
  check('on is named in the summary', describe({ garrisons: true }).includes('garrisons'));
  check('on is not standard rules', isStandardRules({ garrisons: true }) === false);
  const flag = (html) => {
    const match = html.match(/data-go="garrisons"[^>]*aria-checked="(true|false)"/);
    return match ? match[1] : '';
  };
  const panel = renderGameOptionsPanel(null);
  check('lobby option is named Garrisons and starts off',
    panel.includes('>Garrisons<') && flag(panel) === 'false');
  const onPanel = renderGameOptionsPanel({ garrisons: true });
  check('lobby option can be on', flag(onPanel) === 'true');
}

console.log('=== unit ===');
{
  const def = unitDefs.garrison;
  check('defense matches infantry', def.defense === unitDefs.infantry.defense && def.defense === 2);
  check('it only defends', def.attack === 0 && def.defendOnly === true);
  check('it cannot move', def.movement === 0 && def.immovable === true);
  check('it cannot be purchased', def.unpurchasable === true);
  check('name is Garrison', formatUnitName(GARRISON) === 'Garrison');
  const icon = getUnitIconPath(GARRISON, 'Americans');
  const infantry = getUnitIconPath('infantry', 'Americans');
  check('icon is code-built and not the infantry sprite',
    icon.startsWith('data:image/svg+xml') && icon !== infantry && !icon.includes('Infantry'));
  const svg = garrisonIconSvg();
  check('mark uses the AA gold already in the game', svg.includes('#ffb74d') && svg.includes('#9aa0a6'));
}

console.log('=== spawn only when the option is on ===');
{
  const off = freshClassic(false);
  check('off has no garrison before capitals', countType(off, GARRISON) === 0);
  const offLand = firstLand(off);
  check('off can place a capital', off.placeCapital(offLand) === true);
  check('off does not place a garrison', countType(off, GARRISON) === 0);

  const on = freshClassic(true);
  check('on has no garrison before a capital exists', countType(on, GARRISON) === 0);
  const owner = on.currentPlayer.id;
  const land = firstLand(on);
  check('on places the capital', on.placeCapital(land) === true);
  check('one garrison on that original capital', countType(on, GARRISON, land) === 1);
  check('garrison belongs to the original owner',
    (on.units[land] || []).some((unit) => unit.type === GARRISON && unit.owner === owner && unit.quantity === 1));
  check('no garrison on any other territory', countType(on, GARRISON) === 1);
  check('undo removes the garrison with the capital', on.undoLastCapital() === true && countType(on, GARRISON) === 0);

  const both = freshClassic(true);
  const placed = [];
  let guard = 0;
  while (both.phase === GAME_PHASES.CAPITAL_PLACEMENT && guard < 6) {
    const who = both.currentPlayer.id;
    const terr = firstLand(both);
    if (!both.placeCapital(terr)) break;
    placed.push({ who, terr });
    guard += 1;
  }
  check('each player gets one garrison on their own capital',
    placed.length === 2
    && placed.every(({ who, terr }) => (
      countType(both, GARRISON, terr) === 1
      && (both.units[terr] || []).some((unit) => unit.type === GARRISON && unit.owner === who)
    ))
    && countType(both, GARRISON) === 2);

  const setup = readJson('data/maps/pacific/setup.json');
  const players = setup.risk.factions.map((faction) => ({
    ...faction,
    isAI: true,
    aiDifficulty: 'easy',
  }));
  const pacificOff = new GameState(
    setup,
    readJson('data/maps/pacific/territories.json'),
    readJson('data/maps/pacific/continents.json'),
  );
  pacificOff.initGame('risk', players, {
    mapId: 'pacific',
    gameOptions: { territorySetup: 'pacific1940', garrisons: false },
  });
  const pacificOn = new GameState(
    setup,
    readJson('data/maps/pacific/territories.json'),
    readJson('data/maps/pacific/continents.json'),
  );
  pacificOn.initGame('risk', players, {
    mapId: 'pacific',
    gameOptions: { territorySetup: 'pacific1940', garrisons: true },
  });
  check('pacific off places none', countType(pacificOff, GARRISON) === 0);
  const capitals = getMap('pacific').capitals;
  const pacificOk = pacificOn.players.every((player) => {
    const terr = capitals[player.id];
    const stack = (pacificOn.units[terr] || []).filter((unit) => unit.type === GARRISON);
    return pacificOn.getOwner(terr) === player.id
      && stack.length === 1
      && stack[0].owner === player.id
      && stack[0].quantity === 1;
  });
  check('pacific on places one on each original capital', pacificOk && countType(pacificOn, GARRISON) === pacificOn.players.length);

  const saved = both.toJSON();
  check('schema stays 11 on a garrison game', saved.version === 11);
  delete saved.gameOptions.garrisons;
  const loaded = new GameState(readJson('data/setup.json'), readJson('data/territories.json'), readJson('data/continents.json'));
  loaded.loadFromJSON(saved);
  check('a save that omits the field loads off', loaded.gameOptions.garrisons === false);
  const kept = both.toJSON();
  const restored = new GameState(readJson('data/setup.json'), readJson('data/territories.json'), readJson('data/continents.json'));
  restored.loadFromJSON(kept);
  check('an explicit true is restored', restored.gameOptions.garrisons === true);
}

console.log('=== with the capital, before deployment ===');
{
  const on = freshClassic(true);
  const owner = on.currentPlayer.id;
  const land = firstLand(on);
  check('capital places', on.placeCapital(land) === true);
  check('the other power is still placing a capital',
    on.phase === GAME_PHASES.CAPITAL_PLACEMENT
    && on.currentPlayer.id !== owner
    && on.playerState[on.currentPlayer.id].hasPlacedCapital === false);
  check('garrison is on that capital before deployment',
    countType(on, GARRISON, land) === 1 && countType(on, GARRISON) === 1);
  check('that power has not deployed a starting unit', (on.unitsPlacedThisRound || 0) === 0);
  check('starting infantry are still in the tray',
    on.getUnitsToPlace(owner).some((unit) => unit.type === 'infantry' && unit.quantity > 0));

  const other = on.currentPlayer.id;
  const otherLand = firstLand(on);
  check('the other capital places', on.placeCapital(otherLand) === true);
  check('deployment opens with both garrisons already down',
    on.phase === GAME_PHASES.UNIT_PLACEMENT
    && (on.unitsPlacedThisRound || 0) === 0
    && countType(on, GARRISON, land) === 1
    && countType(on, GARRISON, otherLand) === 1
    && (on.units[land] || []).some((unit) => unit.type === GARRISON && unit.owner === owner)
    && (on.units[otherLand] || []).some((unit) => unit.type === GARRISON && unit.owner === other)
    && countType(on, GARRISON) === 2);

  const drop = on.placeInitialUnit(on.currentPlayer.id === owner ? land : otherLand, 'infantry', unitDefs);
  check('a deployment drop does not wait to add the garrison',
    drop.success === true && countType(on, GARRISON) === 2);

  for (const player of on.players) on.unitsToPlace[player.id] = [];
  const finished = on.finishPlacementRound(unitDefs);
  check('ending deployment leaves the same two garrisons',
    finished.ok === true
    && on.phase === GAME_PHASES.PLAYING
    && countType(on, GARRISON) === 2);

  const off = freshClassic(false);
  const offLand = firstLand(off);
  check('off can place a capital', off.placeCapital(offLand) === true);
  check('off has no garrison while capitals are still being placed',
    off.phase === GAME_PHASES.CAPITAL_PLACEMENT && countType(off, GARRISON) === 0);
  const offOther = firstLand(off);
  check('off second capital', off.placeCapital(offOther) === true);
  check('off deployment starts with no garrison',
    off.phase === GAME_PHASES.UNIT_PLACEMENT && countType(off, GARRISON) === 0);
  const offDrop = off.placeInitialUnit(offLand, 'infantry', unitDefs);
  check('off deployment still places no garrison',
    offDrop.success === true && countType(off, GARRISON) === 0);
  for (const player of off.players) off.unitsToPlace[player.id] = [];
  const offDone = off.finishPlacementRound(unitDefs);
  check('off ending deployment still places no garrison',
    offDone.ok === true && off.phase === GAME_PHASES.PLAYING && countType(off, GARRISON) === 0);
}

console.log('=== cannot buy or move ===');
{
  const MAP = [
    { name: 'Home', isWater: false, production: 2, connections: ['Near'] },
    { name: 'Near', isWater: false, production: 1, connections: ['Home'] },
    { name: 'Other', isWater: false, production: 3, connections: ['Home'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, MAP, []);
  gs.players = [
    { id: 'Americans', name: 'Bastion' },
    { id: 'Germans', name: 'Germany' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.gameOptions = normalizeGameOptions({ garrisons: true });
  gs.territoryState = {
    Home: { owner: 'Americans', isCapital: true },
    Near: { owner: 'Americans', isCapital: false },
    Other: { owner: 'Germans', isCapital: true },
  };
  gs.playerState = {
    Americans: { ipcs: 40, capitalTerritory: 'Home', hasPlacedCapital: true },
    Germans: { ipcs: 40, capitalTerritory: 'Other', hasPlacedCapital: true },
  };
  gs.units = {
    Home: [
      { type: 'infantry', quantity: 2, owner: 'Americans' },
      { type: GARRISON, quantity: 1, owner: 'Americans' },
    ],
    Near: [],
    Other: [{ type: GARRISON, quantity: 1, owner: 'Germans' }],
  };
  const before = gs.playerState.Americans.ipcs;
  const bought = gs.addToPendingPurchases(GARRISON, unitDefs, 'Home');
  check('purchase is refused', bought.success === false && /cannot be purchased/i.test(bought.error || ''));
  check('purchase does not spend IPCs', gs.playerState.Americans.ipcs === before);
  check('legacy purchase is refused', gs.purchaseUnit(GARRISON, 'Home', unitDefs) === false);
  check('mobilization purchase is refused', gs.purchaseForMobilization(GARRISON, 1, unitDefs) === false);
  check('still one garrison', countType(gs, GARRISON, 'Home') === 1);

  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  const blocked = gs.moveUnits('Home', 'Near', [{ type: GARRISON, quantity: 1 }], unitDefs);
  check('garrison move is refused', blocked.success === false && /cannot move/i.test(blocked.error || ''));
  check('refused move leaves the garrison', countType(gs, GARRISON, 'Home') === 1);
  const mixed = gs.moveUnits('Home', 'Near', [
    { type: 'infantry', quantity: 1 },
    { type: GARRISON, quantity: 1 },
  ], unitDefs);
  check('a move that includes the garrison is refused', mixed.success === false);
  check('the infantry stayed home', countType(gs, 'infantry', 'Home') === 2);
  const walked = gs.moveUnits('Home', 'Near', [{ type: 'infantry', quantity: 1 }], unitDefs);
  check('other units can still leave the capital', walked.success === true);
  check('garrison stayed on the capital', countType(gs, GARRISON, 'Home') === 1 && countType(gs, 'infantry', 'Near') === 1);

  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  const attack = gs.moveUnits('Home', 'Other', [{ type: GARRISON, quantity: 1 }], unitDefs);
  check('combat move cannot take the garrison', attack.success === false && countType(gs, GARRISON, 'Home') === 1);
}

console.log('=== defends, and dies last ===');
{
  const gs = new GameState({ risk: { factions: [] } }, [
    { name: 'Home', isWater: false, production: 1, connections: [] },
  ], []);
  const fresh = () => ([
    { type: 'infantry', quantity: 1, owner: 'Germans' },
    { type: 'aaGun', quantity: 1, owner: 'Germans' },
    { type: GARRISON, quantity: 1, owner: 'Germans' },
  ]);
  const one = fresh();
  gs._applyCasualtiesWithDamage(one, 1, unitDefs, false);
  check('one hit takes infantry, not the garrison',
    one.find((u) => u.type === 'infantry').quantity === 0
    && one.find((u) => u.type === GARRISON).quantity === 1
    && one.find((u) => u.type === 'aaGun').quantity === 1);
  const two = fresh();
  gs._applyCasualtiesWithDamage(two, 2, unitDefs, false);
  check('other units die before the garrison',
    two.find((u) => u.type === 'infantry').quantity === 0
    && two.find((u) => u.type === 'aaGun').quantity === 0
    && two.find((u) => u.type === GARRISON).quantity === 1);
  const three = fresh();
  gs._applyCasualtiesWithDamage(three, 3, unitDefs, false);
  check('the garrison dies once it is the last unit',
    three.find((u) => u.type === GARRISON).quantity === 0);

  const attackRoll = gs._rollCombatWithRolls(
    [{ type: GARRISON, quantity: 2, owner: 'Germans' }],
    'attack',
    unitDefs,
  );
  const defenseRoll = gs._rollCombatWithRolls(
    [{ type: GARRISON, quantity: 2, owner: 'Germans' }],
    'defense',
    unitDefs,
  );
  check('a garrison does not roll attack', attackRoll.rolls.length === 0 && attackRoll.hits === 0);
  check('a garrison rolls defense like infantry',
    defenseRoll.rolls.length === 2 && defenseRoll.rolls.every((roll) => roll.unit === GARRISON));

  const side = fresh();
  check('garrison cannot be chosen while infantry remain', garrisonHitAllowed(side, {}) === false);
  check('garrison can be chosen after the others are selected',
    garrisonHitAllowed(side, { infantry: 1, aaGun: 1 }) === true);

  globalThis.document = {
    createElement() {
      return {
        id: '',
        className: '',
        innerHTML: '',
        style: {},
        classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
        appendChild() {},
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
      };
    },
    body: { appendChild() {} },
  };
  const ui = new CombatUI();
  ui.setUnitDefs(unitDefs);
  ui._render = () => {};
  const picked = ui._selectCheapestCasualties(fresh(), 1);
  check('the combat picker takes infantry first', picked.infantry === 1 && !picked.garrison);
  const pickedAll = ui._selectCheapestCasualties(fresh(), 2);
  check('the combat picker still holds the garrison', pickedAll.infantry === 1 && pickedAll.aaGun === 1 && !pickedAll.garrison);
  const pickedLast = ui._selectCheapestCasualties(fresh(), 3);
  check('the combat picker takes the garrison last', pickedLast.garrison === 1);
  ui.combatState = {
    attackers: [],
    defenders: fresh(),
    pendingAttackerCasualties: 0,
    pendingDefenderCasualties: 3,
    selectedAttackerCasualties: {},
    selectedDefenderCasualties: {},
  };
  ui._adjustCasualty('defender', GARRISON, 1);
  check('a click cannot kill the garrison first', !ui.combatState.selectedDefenderCasualties.garrison);
  ui._adjustCasualty('defender', 'infantry', 1);
  ui._adjustCasualty('defender', 'aaGun', 1);
  ui._adjustCasualty('defender', GARRISON, 1);
  check('a click can kill the garrison after the others',
    ui.combatState.selectedDefenderCasualties.infantry === 1
    && ui.combatState.selectedDefenderCasualties.aaGun === 1
    && ui.combatState.selectedDefenderCasualties.garrison === 1);
}

console.log('=== free respawn on the original capital only ===');
{
  const MAP = [
    { name: 'Home', isWater: false, production: 2, connections: ['Other'] },
    { name: 'Other', isWater: false, production: 3, connections: ['Home'] },
  ];
  function board() {
    const gs = new GameState({ risk: { factions: [] } }, MAP, []);
    gs.players = [
      { id: 'Americans', name: 'Bastion' },
      { id: 'Germans', name: 'Germany' },
    ];
    gs.currentPlayerIndex = 0;
    gs.phase = GAME_PHASES.PLAYING;
    gs.turnPhase = TURN_PHASES.COLLECT_INCOME;
    gs.gameOptions = normalizeGameOptions({ garrisons: true });
    gs.territoryState = {
      Home: { owner: 'Americans', isCapital: true },
      Other: { owner: 'Germans', isCapital: true },
    };
    gs.playerState = {
      Americans: { ipcs: 10, capitalTerritory: 'Home', hasPlacedCapital: true },
      Germans: { ipcs: 10, capitalTerritory: 'Other', hasPlacedCapital: true },
    };
    gs.units = {
      Home: [{ type: 'infantry', quantity: 1, owner: 'Americans' }],
      Other: [{ type: GARRISON, quantity: 1, owner: 'Germans' }],
    };
    return gs;
  }

  const missing = board();
  missing.nextTurn();
  check('end of the owner turn replaces a missing garrison', countType(missing, GARRISON, 'Home') === 1);
  check('the new garrison belongs to the original owner',
    missing.units.Home.some((unit) => unit.type === GARRISON && unit.owner === 'Americans' && unit.quantity === 1));
  check('the other power is not respawned on this turn', countType(missing, GARRISON, 'Other') === 1);

  const present = board();
  present.units.Home.push({ type: GARRISON, quantity: 1, owner: 'Americans' });
  present.nextTurn();
  check('an existing garrison is not duplicated', countType(present, GARRISON, 'Home') === 1);

  const captured = board();
  captured.territoryState.Home.owner = 'Germans';
  captured.units.Home = [{ type: 'infantry', quantity: 1, owner: 'Germans' }];
  captured.currentPlayerIndex = 1;
  captured.nextTurn();
  check('holding someone else\'s capital does not grow a garrison', countType(captured, GARRISON, 'Home') === 0);
  check('the capturer still respawns only on their own capital', countType(captured, GARRISON, 'Other') === 1);

  const recaptured = board();
  recaptured.units.Home = [{ type: 'infantry', quantity: 1, owner: 'Americans' }];
  check('direct respawn while they hold the capital', respawnOriginalGarrison(recaptured, 'Americans') === true);
  check('a second check does nothing', respawnOriginalGarrison(recaptured, 'Americans') === false);
  recaptured.territoryState.Home.owner = 'Germans';
  recaptured.units.Other = [];
  check('respawn refuses a capital they do not hold', respawnOriginalGarrison(recaptured, 'Americans') === false);
  check('the capturer respawns on their own capital, not the one they took',
    respawnOriginalGarrison(recaptured, 'Germans') === true
    && countType(recaptured, GARRISON, 'Home') === 1
    && countType(recaptured, GARRISON, 'Other') === 1
    && recaptured.units.Other.some((unit) => unit.type === GARRISON && unit.owner === 'Germans'));

  const quiet = board();
  quiet.gameOptions = normalizeGameOptions({ garrisons: false });
  quiet.nextTurn();
  check('off does not respawn', countType(quiet, GARRISON, 'Home') === 0);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll garrison checks passed');
