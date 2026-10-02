// Mechanized infantry. Optional like tactical bombers. Off means the unit
// is not bought, not placed, and the computer does not buy it.
// Run: node tools/test-mechanized-infantry.mjs

import { existsSync, readFileSync } from 'node:fs';
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
  DEFAULT_GAME_OPTIONS,
  describe,
  isStandardRules,
  normalizeGameOptions,
} = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { renderGameOptionsPanel } = await import(pathToFileURL(join(root, 'src/ui/gameOptionsPanel.js')));
const { formatUnitName } = await import(pathToFileURL(join(root, 'src/utils/unitNames.js')));
const { getUnitIconPath } = await import(pathToFileURL(join(root, 'src/utils/unitIcons.js')));
const { formatAttackerCombatLine } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const { artillerySupportState } = await import(pathToFileURL(join(root, 'src/state/mechanizedInfantry.js')));
const { AIController } = await import(pathToFileURL(join(root, 'src/ai/aiController.js')));

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

function countType(gs, type) {
  let total = 0;
  for (const stack of Object.values(gs.units || {})) {
    for (const unit of stack || []) {
      if (unit?.type === type) total += Number(unit.quantity) || 0;
    }
  }
  for (const rows of Object.values(gs.unitsToPlace || {})) {
    for (const unit of rows || []) {
      if (unit?.type === type) total += Number(unit.quantity) || 0;
    }
  }
  return total;
}

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  check('display stamp is V2.81.57-unified.38', GAME_VERSION === 'V2.81.57-unified.38');
  check('schema stays 11', SCHEMA_VERSION === 11);
  check('game docs write V2.82-unified.38', compatClientVersion() === 'V2.82-unified.38');
  check('a V2.82-unified.37 doc does not prompt this tab',
    compareGameVersions('V2.82-unified.37', GAME_VERSION) < 0);
  check('a V2.82-unified.39 doc prompts this tab',
    compareGameVersions('V2.82-unified.39', GAME_VERSION) > 0);
  check('our own V2.82-unified.38 doc does not prompt',
    compareGameVersions('V2.82-unified.38', GAME_VERSION) === 0);
  check('index.html carries the display stamp',
    html.includes('content="V2.81.57-unified.38"')
    && html.includes("window.__TR_GAME_VERSION = 'V2.81.57-unified.38'")
    && html.includes("var LOCKED = 'V2.81.57-unified.38'")
    && html.includes('style.css?v=V2.81.57-unified.38')
    && html.includes('src/main.js?v=V2.81.57-unified.38'));
}

console.log('=== catalog and lobby ===');
{
  const def = unitDefs.mechanizedInfantry;
  check('stats are cost 4, attack 1, defense 2, move 2',
    def?.cost === 4 && def?.attack === 1 && def?.defense === 2 && def?.movement === 2 && def?.isLand === true);
  check('name is Mechanized infantry', formatUnitName('mechanizedInfantry') === 'Mechanized infantry');
  check('icon reuses Mech.Inf.png',
    getUnitIconPath('mechanizedInfantry', 'Japanese') === 'units/Japanese/Mech.Inf.png'
    && getUnitIconPath('mechanizedInfantry', 'ANZAC') === 'units/Anzac/Mech.Inf.png'
    && existsSync(join(root, 'units/Japanese/Mech.Inf.png'))
    && existsSync(join(root, 'units/Anzac/Mech.Inf.png'))
    && existsSync(join(root, 'assets/units/Mech.Inf.png')));
  check('transport can carry one, with an infantry, and not two',
    unitDefs.transport.canCarry.includes('mechanizedInfantry'));
  check('option defaults off beside tactical bombers',
    DEFAULT_GAME_OPTIONS.mechanizedInfantry === false
    && normalizeGameOptions(null).mechanizedInfantry === false
    && normalizeGameOptions({}).mechanizedInfantry === false
    && normalizeGameOptions({ tacticalBombers: true }).mechanizedInfantry === false
    && normalizeGameOptions({ mechanizedInfantry: true }).mechanizedInfantry === true);
  check('off is still standard rules', isStandardRules(null) === true && describe(null) === 'Standard rules');
  check('on is named in the summary', describe({ mechanizedInfantry: true }).includes('mechanized infantry'));
  const panel = renderGameOptionsPanel(null);
  check('lobby option is named Mechanized infantry',
    panel.includes('>Mechanized infantry<') && panel.includes('data-go="mechanizedInfantry"'));
  const onPanel = renderGameOptionsPanel({ mechanizedInfantry: true });
  check('lobby option can be on', onPanel.includes('data-go="mechanizedInfantry"'));
}

console.log('=== not placed, not bought, when off ===');
{
  const classicSetup = readJson('data/setup.json');
  const classic = new GameState(
    classicSetup,
    readJson('data/territories.json'),
    readJson('data/continents.json'),
  );
  const players = classicSetup.risk.factions.slice(0, 2).map((faction) => ({
    ...faction,
    isAI: true,
    aiDifficulty: 'easy',
  }));
  classic.initGame('risk', players, { gameOptions: { mechanizedInfantry: false } });
  check('classic off does not place mechanized infantry', countType(classic, 'mechanizedInfantry') === 0);
  check('classic off stays schema 11', classic.toJSON().version === 11);

  const classicOn = new GameState(
    classicSetup,
    readJson('data/territories.json'),
    readJson('data/continents.json'),
  );
  classicOn.initGame('risk', players, { gameOptions: { mechanizedInfantry: true } });
  check('classic on does not pre-place mechanized infantry', countType(classicOn, 'mechanizedInfantry') === 0);

  const pacificSetup = readJson('data/maps/pacific/setup.json');
  const pacificPlayers = pacificSetup.risk.factions.map((faction) => ({
    ...faction,
    isAI: true,
    aiDifficulty: 'easy',
  }));
  const pacificOff = new GameState(
    pacificSetup,
    readJson('data/maps/pacific/territories.json'),
    readJson('data/maps/pacific/continents.json'),
  );
  pacificOff.initGame('risk', pacificPlayers, {
    mapId: 'pacific',
    gameOptions: { territorySetup: 'pacific1940', mechanizedInfantry: false },
  });
  const pacificOn = new GameState(
    pacificSetup,
    readJson('data/maps/pacific/territories.json'),
    readJson('data/maps/pacific/continents.json'),
  );
  pacificOn.initGame('risk', pacificPlayers, {
    mapId: 'pacific',
    gameOptions: { territorySetup: 'pacific1940', mechanizedInfantry: true },
  });
  check('pacific off does not place mechanized infantry', countType(pacificOff, 'mechanizedInfantry') === 0);
  check('pacific on does not pre-place mechanized infantry', countType(pacificOn, 'mechanizedInfantry') === 0);

  const saved = classic.toJSON();
  delete saved.gameOptions.mechanizedInfantry;
  const loaded = new GameState(classicSetup, readJson('data/territories.json'), readJson('data/continents.json'));
  loaded.loadFromJSON(saved);
  check('a save that omits the field loads off', loaded.gameOptions.mechanizedInfantry === false);
  const bare = classic.toJSON();
  delete bare.gameOptions;
  const legacy = new GameState(classicSetup, readJson('data/territories.json'), readJson('data/continents.json'));
  legacy.loadFromJSON(bare);
  check('a legacy save loads off', legacy.gameOptions.mechanizedInfantry === false);
}

const MAP = [
  { name: 'Home', isWater: false, production: 2, connections: ['Near', 'Gap', 'GunLine', 'FactoryLine'] },
  { name: 'Near', isWater: false, production: 1, connections: ['Home', 'Camp'] },
  { name: 'Camp', isWater: false, production: 1, connections: ['Near'] },
  { name: 'Gap', isWater: false, production: 3, connections: ['Home', 'Front', 'Safe'] },
  { name: 'Front', isWater: false, production: 4, connections: ['Gap'] },
  { name: 'Safe', isWater: false, production: 1, connections: ['Gap'] },
  { name: 'GunLine', isWater: false, production: 1, connections: ['Home', 'PastGun'] },
  { name: 'PastGun', isWater: false, production: 1, connections: ['GunLine'] },
  { name: 'FactoryLine', isWater: false, production: 1, connections: ['Home', 'PastFactory'] },
  { name: 'PastFactory', isWater: false, production: 1, connections: ['FactoryLine'] },
  { name: 'Sea', isWater: true, production: 0, connections: ['Home'] },
];

function makeState(phase = TURN_PHASES.COMBAT_MOVE) {
  const gs = new GameState({ risk: { factions: [] } }, MAP, []);
  gs.players = [
    { id: 'Americans', name: 'Bastion' },
    { id: 'Germans', name: 'Germany', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = phase;
  gs.gameOptions = normalizeGameOptions({ mechanizedInfantry: true });
  gs.territoryState = {
    Home: { owner: 'Americans', isCapital: true },
    Near: { owner: 'Americans' },
    Camp: { owner: 'Americans' },
    Gap: { owner: 'Germans' },
    Front: { owner: 'Germans' },
    Safe: { owner: 'Americans' },
    GunLine: { owner: 'Germans' },
    PastGun: { owner: 'Germans' },
    FactoryLine: { owner: 'Germans' },
    PastFactory: { owner: 'Germans' },
  };
  gs.playerState = {
    Americans: { ipcs: 40, capitalTerritory: 'Home', hasPlacedCapital: true },
    Germans: { ipcs: 20, capitalTerritory: 'Front', hasPlacedCapital: true },
  };
  gs.units = {
    Home: [
      { type: 'mechanizedInfantry', quantity: 2, owner: 'Americans' },
      { type: 'armour', quantity: 2, owner: 'Americans' },
      { type: 'infantry', quantity: 2, owner: 'Americans' },
      { type: 'artillery', quantity: 2, owner: 'Americans' },
    ],
    Gap: [],
    Front: [{ type: 'infantry', quantity: 1, owner: 'Germans' }],
    Safe: [],
    Near: [],
    Camp: [],
    GunLine: [{ type: 'aaGun', quantity: 1, owner: 'Germans' }],
    PastGun: [],
    FactoryLine: [{ type: 'factory', quantity: 1, owner: 'Germans' }],
    PastFactory: [],
    Sea: [{ type: 'transport', quantity: 1, owner: 'Americans', id: 'transport_1', cargo: [] }],
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Home', 'Near', 'Camp', 'Safe']);
  gs._notify = () => {};
  return gs;
}

function qty(gs, territory, type) {
  return (gs.units[territory] || [])
    .filter((unit) => unit.type === type && unit.owner === 'Americans')
    .reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
}

console.log('=== purchase ===');
{
  const off = makeState(TURN_PHASES.PURCHASE);
  off.gameOptions = normalizeGameOptions({ mechanizedInfantry: false });
  const before = off.playerState.Americans.ipcs;
  const refused = off.addToPendingPurchases('mechanizedInfantry', unitDefs, null);
  const refusedLegacy = off.purchaseForMobilization('mechanizedInfantry', 1, unitDefs);
  check('off refuses the buy and does not spend',
    refused.success === false
    && refusedLegacy === false
    && off.playerState.Americans.ipcs === before
    && !(off.pendingPurchases || []).some((row) => row.type === 'mechanizedInfantry'),
    refused);

  const on = makeState(TURN_PHASES.PURCHASE);
  const bought = on.addToPendingPurchases('mechanizedInfantry', unitDefs, null);
  check('on adds mechanized infantry to the buy',
    bought.success === true
    && on.pendingPurchases.some((row) => row.type === 'mechanizedInfantry' && row.quantity === 1)
    && on.playerState.Americans.ipcs === before - 4,
    bought);
}

console.log('=== artillery support ===');
{
  const shared = artillerySupportState([
    { type: 'infantry', quantity: 1 },
    { type: 'artillery', quantity: 1 },
    { type: 'mechanizedInfantry', quantity: 1 },
  ], { applyInfantry: true });
  check('one artillery supports the infantry first',
    shared.infantrySupported === 1 && shared.mechSupported === 0);
  const leftover = artillerySupportState([
    { type: 'infantry', quantity: 1 },
    { type: 'artillery', quantity: 2 },
    { type: 'mechanizedInfantry', quantity: 2 },
  ], { applyInfantry: true });
  check('a second artillery supports one mechanized infantry',
    leftover.infantrySupported === 1 && leftover.mechSupported === 1);
  const onlyMech = artillerySupportState([
    { type: 'mechanizedInfantry', quantity: 2 },
    { type: 'artillery', quantity: 1 },
  ], { applyInfantry: true });
  check('extra mechanized infantry stay unsupported',
    onlyMech.mechSupported === 1);

  const gs = makeState();
  const roll = (units, side, randomValue) => {
    const real = Math.random;
    Math.random = () => randomValue;
    try { return gs._rollCombatWithRolls(units, side, unitDefs); }
    finally { Math.random = real; }
  };
  const alone = roll([{ type: 'mechanizedInfantry', quantity: 1, owner: 'Americans' }], 'attack', 0.2);
  const paired = roll([
    { type: 'mechanizedInfantry', quantity: 1, owner: 'Americans' },
    { type: 'artillery', quantity: 1, owner: 'Americans' },
  ], 'attack', 0.2);
  const extra = roll([
    { type: 'mechanizedInfantry', quantity: 2, owner: 'Americans' },
    { type: 'artillery', quantity: 1, owner: 'Americans' },
  ], 'attack', 0.2);
  const defense = roll([
    { type: 'mechanizedInfantry', quantity: 1, owner: 'Americans' },
    { type: 'artillery', quantity: 1, owner: 'Americans' },
  ], 'defense', 0.4);
  check('attack 1 misses a 2', alone.hits === 0 && alone.rolls[0].hit === false, alone);
  check('supported attack 2 hits a 2', paired.hits === 2 && paired.rolls[0].hit === true, paired);
  check('the extra mechanized infantry stays at 1',
    extra.rolls[0].hit === true && extra.rolls[1].hit === false, extra);
  check('artillery does not raise defense', defense.rolls[0].hit === false, defense);
  const line = formatAttackerCombatLine([
    { type: 'mechanizedInfantry', quantity: 2 },
    { type: 'artillery', quantity: 1 },
  ]);
  check('the combat line names the supported attack',
    line.includes('Mech infantry 2 (supported)') && line.includes('1 mechanized infantry'));
}

console.log('=== blitz ===');
{
  const alone = makeState();
  const stopped = alone.moveUnits('Home', 'Front', [{ type: 'mechanizedInfantry', quantity: 1 }], unitDefs, {});
  check('alone, it stops and cannot pass the empty territory',
    stopped.success === false && qty(alone, 'Home', 'mechanizedInfantry') === 2 && alone.getOwner('Gap') === 'Germans',
    stopped);
  const enter = alone.moveUnits('Home', 'Gap', [{ type: 'mechanizedInfantry', quantity: 1 }], unitDefs, {});
  check('alone, it can enter the empty enemy territory and stop',
    enter.success === true && qty(alone, 'Gap', 'mechanizedInfantry') === 1 && alone.getOwner('Gap') === 'Americans',
    enter);

  const paired = makeState();
  const through = paired.moveUnits('Home', 'Front', [
    { type: 'mechanizedInfantry', quantity: 1 },
    { type: 'armour', quantity: 1 },
  ], unitDefs, {});
  check('with a tank, it blitzes and the first territory is captured',
    through.success === true
    && qty(paired, 'Front', 'mechanizedInfantry') === 1
    && qty(paired, 'Front', 'armour') === 1
    && qty(paired, 'Gap', 'mechanizedInfantry') === 0
    && paired.getOwner('Gap') === 'Americans'
    && paired.getOwner('Front') === 'Germans'
    && through.blitzedCaptures?.some((row) => row.territory === 'Gap'),
    through);
  check('the blitz is a capture on the turn log',
    paired.turnEvents.some((ev) => ev.type === 'territory_captured' && ev.territory === 'Gap' && !ev.undone));

  const back = makeState();
  const returned = back.moveUnits('Home', 'Home', [
    { type: 'mechanizedInfantry', quantity: 1 },
    { type: 'armour', quantity: 1 },
  ], unitDefs, {});
  check('the second territory can be the space it came from',
    returned.success === true
    && back.getOwner('Gap') === 'Americans'
    && qty(back, 'Home', 'mechanizedInfantry') === 2
    && qty(back, 'Home', 'armour') === 2
    && qty(back, 'Gap', 'mechanizedInfantry') === 0,
    returned);
  const undone = back.undoLastMove();
  check('undo gives the blitzed territory back',
    undone.success === true && back.getOwner('Gap') === 'Germans' && qty(back, 'Home', 'mechanizedInfantry') === 2,
    undone);

  const friendly = makeState();
  const toSafe = friendly.moveUnits('Home', 'Safe', [
    { type: 'mechanizedInfantry', quantity: 1 },
    { type: 'armour', quantity: 1 },
  ], unitDefs, {});
  check('the second territory can be friendly',
    toSafe.success === true
    && friendly.getOwner('Gap') === 'Americans'
    && qty(friendly, 'Safe', 'mechanizedInfantry') === 1
    && friendly.getOwner('Safe') === 'Americans',
    toSafe);

  const gun = makeState();
  const throughGun = gun.moveUnits('Home', 'PastGun', [
    { type: 'mechanizedInfantry', quantity: 1 },
    { type: 'armour', quantity: 1 },
  ], unitDefs, {});
  check('an AA gun in the first territory stops the pair',
    throughGun.success === false && gun.getOwner('GunLine') === 'Germans' && qty(gun, 'Home', 'armour') === 2,
    throughGun);
  const throughFactory = gun.moveUnits('Home', 'PastFactory', [
    { type: 'mechanizedInfantry', quantity: 1 },
    { type: 'armour', quantity: 1 },
  ], unitDefs, {});
  check('a factory in the first territory stops the pair',
    throughFactory.success === false && gun.getOwner('FactoryLine') === 'Germans',
    throughFactory);

  const short = makeState();
  const unpaired = short.moveUnits('Home', 'Front', [
    { type: 'mechanizedInfantry', quantity: 2 },
    { type: 'armour', quantity: 1 },
  ], unitDefs, {});
  check('an extra mechanized infantry cannot blitz with one tank',
    unpaired.success === false && short.getOwner('Gap') === 'Germans', unpaired);

  const tank = makeState();
  const tankBlitz = tank.moveUnits('Home', 'Front', [{ type: 'armour', quantity: 1 }], unitDefs, {});
  const tankHome = tank.moveUnits('Home', 'Home', [{ type: 'armour', quantity: 1 }], unitDefs, {});
  check('a tank alone still blitzes and does not gain the return move',
    tankBlitz.success === true && tankHome.success === false && tank.getOwner('Gap') === 'Americans',
    { tankBlitz, tankHome });

  const ncm = makeState(TURN_PHASES.NON_COMBAT_MOVE);
  const walk = ncm.moveUnits('Home', 'Camp', [{ type: 'mechanizedInfantry', quantity: 1 }], unitDefs, {});
  const intoEnemy = ncm.moveUnits('Home', 'Gap', [{ type: 'mechanizedInfantry', quantity: 1 }], unitDefs, {});
  check('non-combat can move 2 through friendly land and cannot enter an enemy territory',
    walk.success === true && qty(ncm, 'Camp', 'mechanizedInfantry') === 1 && intoEnemy.success === false,
    { walk, intoEnemy });

  const load = makeState();
  check('a transport holds one mechanized infantry, or one with an infantry',
    load._canLoadOnTransport([], 'mechanizedInfantry') === true
    && load._canLoadOnTransport([{ type: 'infantry' }], 'mechanizedInfantry') === true
    && load._canLoadOnTransport([{ type: 'mechanizedInfantry' }], 'mechanizedInfantry') === false
    && load._canLoadOnTransport([{ type: 'mechanizedInfantry' }], 'infantry') === true);
}

console.log('=== computer ===');
{
  AIController.prototype._delay = async function silent() {};
  AIController.prototype._getActionDelay = function noDelay() { return 0; };
  async function buy(on) {
    const gs = makeState(TURN_PHASES.PURCHASE);
    gs.gameOptions = normalizeGameOptions({ mechanizedInfantry: on });
    gs.units.Gap = [];
    gs.nextPhase = () => {};
    const ai = new AIController();
    ai.unitDefs = unitDefs;
    ai.gameState = gs;
    ai._updateStatus = () => {};
    ai._notifyAction = () => {};
    const player = { ...gs.players[0], aiDifficulty: 'easy' };
    const bought = [];
    const orig = gs.purchaseUnit.bind(gs);
    gs.purchaseUnit = (type, where, defs) => {
      const ok = orig(type, where, defs);
      if (ok) bought.push(type);
      return ok;
    };
    await ai._handlePurchase({ difficulty: 'easy' }, player);
    return bought;
  }
  const offBought = await buy(false);
  const onBought = await buy(true);
  check('the computer does not buy it when the option is off',
    offBought.includes('mechanizedInfantry') === false, offBought);
  check('the computer can buy it when the option is on',
    onBought.includes('mechanizedInfantry') === true, onBought);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nmechanized infantry checks passed');
