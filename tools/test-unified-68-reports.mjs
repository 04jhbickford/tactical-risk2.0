// unified.68 — pre-game options, income calculator, transport casualties, auto-resolve tech.
// Run: node tools/test-unified-68-reports.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem(key) { return mem.has(key) ? mem.get(key) : null; },
    setItem(key, value) { mem.set(key, String(value)); },
    removeItem(key) { mem.delete(key); },
  };
}

const { GAME_VERSION, SCHEMA_VERSION, compatClientVersion } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES, RISK_STARTING_UNITS, TECHNOLOGIES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  DEFAULT_GAME_OPTIONS,
  describe,
  isStandardRules,
  normalizeGameOptions,
  capitalIpcValue,
  capitalFactoryOutputValue,
  purchasedFactoryOutputValue,
} = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { renderIncomeCalculator, incomeForecast } = await import(pathToFileURL(join(root, 'src/ui/incomeCalculator.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const { AIController } = await import(pathToFileURL(join(root, 'src/ai/aiController.js')));

const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

function board(territories, continents = []) {
  const gs = new GameState({ risk: { factions: [] } }, territories, continents);
  gs.players = [
    { id: 'germans', name: 'Germany', isAI: false },
    { id: 'british', name: 'UK', isAI: true, aiDifficulty: 'easy' },
  ];
  gs.currentPlayerIndex = 1;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.playerState = {
    germans: { ipcs: 40, capitalTerritory: 'Germany', hasPlacedCapital: true },
    british: { ipcs: 40, capitalTerritory: 'Britain', hasPlacedCapital: true },
  };
  gs.playerTechs = {
    germans: { techTokens: 0, unlockedTechs: [] },
    british: { techTokens: 0, unlockedTechs: [] },
  };
  gs.territoryState = {};
  for (const territory of territories) {
    gs.territoryState[territory.name] = { owner: null, isCapital: false };
  }
  gs._notify = () => {};
  gs.autoSave = () => {};
  return gs;
}

function qtyOf(rows, type) {
  return (rows || []).find((row) => row.type === type)?.quantity;
}

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const stamp = 'V2.81.57-unified.68';
  check('display stamp is V2.81.57-unified.68', GAME_VERSION === stamp);
  check('schema stays 11', SCHEMA_VERSION === 11);
  check('game docs write V2.82-unified.68', compatClientVersion() === 'V2.82-unified.68');
  check('index.html carries the display stamp',
    html.includes(`name="tr-game-version" content="${stamp}"`)
    && html.includes(`window.__TR_GAME_VERSION = '${stamp}'`)
    && html.includes(`var LOCKED = '${stamp}'`)
    && html.includes(`style.css?v=${stamp}`)
    && html.includes(`src/main.js?v=${stamp}`));
}

console.log('=== option defaults reproduce today ===');
{
  const options = normalizeGameOptions(null);
  check('a missing options object is standard rules', describe(null) === 'Standard rules' && isStandardRules(null));
  check('naval and air stay on', options.navalUnits === true && options.airUnits === true);
  check('land-bridge blocking stays off', options.landBridgeBlocking === false);
  check('IPC and factory overrides stay unset',
    options.nonCapitalIpc == null
    && options.capitalIpc == null
    && options.capitalFactoryOutput == null
    && options.purchasedFactoryOutput == null
    && options.startingUnits == null);
  check('capital income default is 10', capitalIpcValue(options) === 10);
  check('factory defaults stay 20 and 5',
    capitalFactoryOutputValue(options) === 20 && purchasedFactoryOutputValue(options) === 5);
  check('an explicit capital of 10 is still standard', isStandardRules({ capitalIpc: 10, capitalFactoryOutput: 20, purchasedFactoryOutput: 5 }));
  check('a slider detent stores null', normalizeGameOptions({ capitalIpc: -1, startingUnits: -1 }).capitalIpc == null
    && normalizeGameOptions({ startingUnits: -1 }).startingUnits == null);

  const gs = board([
    { name: 'Britain', isWater: false, connections: [], production: 6 },
    { name: 'Egypt', isWater: false, connections: [], production: 2 },
    { name: 'Alaska', isWater: false, connections: ['Western Canada'], production: 2 },
    { name: 'Western Canada', isWater: false, connections: ['Alaska'], production: 1 },
    { name: 'Soviet Far East', isWater: false, connections: [], production: 1 },
  ]);
  gs.gameOptions = normalizeGameOptions(DEFAULT_GAME_OPTIONS);
  gs.territoryState.Britain = { owner: 'british', isCapital: true };
  gs.units.Britain = [{ type: 'factory', quantity: 1, owner: 'british' }];
  gs.units.Egypt = [{ type: 'factory', quantity: 1, owner: 'british' }];
  gs.territoryState.Egypt.owner = 'british';
  check('capital IPC stays 10', gs.getEffectiveIpc('Britain') === 10);
  check('non-capital IPC stays the map value', gs.getEffectiveIpc('Egypt') === 2);
  check('capital factory stays 20', gs.getFactoryCapacity('Britain') === 20);
  check('other factory stays 5', gs.getFactoryCapacity('Egypt') === 5);
  const pool = gs._startingUnitPool();
  const same = [...RISK_STARTING_UNITS.land, ...RISK_STARTING_UNITS.naval].every((row) => {
    const side = RISK_STARTING_UNITS.land.some((land) => land.type === row.type) ? pool.land : pool.naval;
    return qtyOf(side, row.type) === row.quantity;
  });
  check('starting rows match the catalog', same);
  check('Alaska still has its land bridge', gs.hasLandBridge('Alaska', 'Soviet Far East') === true);
  check('that bridge is not blocked', gs.landBridgeBlocks('Alaska', 'Soviet Far East') === false);
  gs.territoryState.Alaska.owner = 'british';
  const open = gs.getReachableTerritoriesForLand('Alaska', 1, 'british', true);
  check('land can still cross the bridge', open.has('Soviet Far East'));
}

console.log('=== naval and air off, and a flat starting count ===');
{
  const gs = board([
    { name: 'Britain', isWater: false, connections: ['North Sea'], production: 6 },
    { name: 'North Sea', isWater: true, connections: ['Britain'] },
  ]);
  gs.gameOptions = normalizeGameOptions({ navalUnits: false, airUnits: false, startingUnits: 2 });
  gs.territoryState.Britain = { owner: 'british', isCapital: true };
  gs.units.Britain = [{ type: 'factory', quantity: 1, owner: 'british' }];
  const pool = gs._startingUnitPool();
  const types = [...pool.land, ...pool.naval].map((row) => row.type);
  check('starting count replaces each kept row', pool.land.every((row) => row.quantity === 2) && pool.land.length > 0);
  check('naval and air leave the starting pool', !types.some((type) => unitDefs[type]?.isSea || unitDefs[type]?.isAir));
  const seaBuy = gs.addToPendingPurchases('destroyer', unitDefs, 'North Sea');
  const airBuy = gs.addToPendingPurchases('fighter', unitDefs, 'Britain');
  const landBuy = gs.addToPendingPurchases('infantry', unitDefs, 'Britain');
  check('naval cannot be bought', seaBuy.success === false);
  check('air cannot be bought', airBuy.success === false);
  check('land can still be bought', landBuy.success === true);
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.turnPhase = 'setup';
  gs.unitsToPlace.british = [{ type: 'destroyer', quantity: 1 }, { type: 'fighter', quantity: 1 }, { type: 'infantry', quantity: 1 }];
  gs.unitsPlacedThisRound = 0;
  const seaPlace = gs.placeInitialUnit('North Sea', 'destroyer', unitDefs);
  const airPlace = gs.placeInitialUnit('Britain', 'fighter', unitDefs);
  const landPlace = gs.placeInitialUnit('Britain', 'infantry', unitDefs);
  check('naval cannot be placed', seaPlace.success === false);
  check('air cannot be placed', airPlace.success === false);
  check('land can still be placed', landPlace.success === true);

  const aiGame = board([
    { name: 'Britain', isWater: false, connections: ['North Sea'], production: 6 },
    { name: 'North Sea', isWater: true, connections: ['Britain'] },
  ]);
  aiGame.gameOptions = normalizeGameOptions({ navalUnits: false, airUnits: false });
  aiGame.territoryState.Britain = { owner: 'british', isCapital: true };
  aiGame.units.Britain = [{ type: 'factory', quantity: 1, owner: 'british' }];
  aiGame.factoriesAtTurnStart = new Set(['Britain']);
  aiGame.playerState.british.ipcs = 80;
  const ai = new AIController();
  ai.skipMode = true;
  ai.unitDefs = unitDefs;
  ai.gameState = aiGame;
  ai._updateStatus = () => {};
  ai._logAction = () => {};
  ai._notifyAction = () => {};
  await ai._handlePurchase({ difficulty: 'easy' }, aiGame.players[1]);
  const bought = (aiGame.pendingPurchases || []).map((row) => row.type);
  check('AI does not buy naval or air', bought.length > 0 && bought.every((type) => !unitDefs[type]?.isSea && !unitDefs[type]?.isAir), bought);

  const pacific = board([{ name: 'Japan', isWater: false, connections: [], production: 8 }]);
  pacific.mapId = 'pacific';
  pacific.setup = {
    turnOrder: ['japanese'],
    pacific1940: {
      territoryOwners: { Japan: 'japanese' },
      unitPlacements: {
        Japan: [
          { type: 'fighter', quantity: 2, owner: 'japanese' },
          { type: 'infantry', quantity: 3, owner: 'japanese' },
          { type: 'transport', quantity: 1, owner: 'japanese' },
        ],
      },
      factions: [{ id: 'japanese', startingPUs: 26 }],
    },
  };
  pacific.gameOptions = normalizeGameOptions({ airUnits: false, navalUnits: false, territorySetup: 'pacific1940' });
  pacific.players = [{ id: 'japanese', name: 'Japan' }];
  pacific._initPacificHistorical(pacific.players);
  const japan = pacific.units.Japan || [];
  check('Pacific keeps its infantry when air and naval are off', japan.some((unit) => unit.type === 'infantry' && unit.quantity === 3));
  check('Pacific drops the off families', !japan.some((unit) => unit.type === 'fighter' || unit.type === 'transport'));
}

console.log('=== old save loads today\'s options ===');
{
  const gs = board([
    { name: 'Britain', isWater: false, connections: [], production: 6 },
  ]);
  gs.initGame = undefined;
  const saved = gs.toJSON();
  delete saved.gameOptions;
  const loaded = new GameState({ risk: { factions: [] } }, [
    { name: 'Britain', isWater: false, connections: [], production: 6 },
  ], []);
  loaded.loadFromJSON(saved);
  check('old save has no stored overrides', loaded.gameOptions.navalUnits === true && loaded.gameOptions.airUnits === true);
  check('old save keeps schema 11', loaded.toJSON().version === 11);
  check('old save capital income is still 10', capitalIpcValue(loaded.gameOptions) === 10);
}

console.log('=== income calculator matches the payout ===');
{
  const gs = board([
    { name: 'Britain', isWater: false, connections: [], production: 6 },
    { name: 'Egypt', isWater: false, connections: [], production: 2 },
    { name: 'France', isWater: false, connections: [], production: 4 },
  ], [{ name: 'Nile', bonus: 5, territories: ['Britain', 'Egypt'] }]);
  gs.territoryState.Britain = { owner: 'british', isCapital: true };
  gs.territoryState.Egypt = { owner: 'british', isCapital: false };
  gs.playerState.british.ipcs = 15;
  const forecast = incomeForecast(gs, 'british');
  check('end-of-turn income is capital 10 plus Egypt 2 plus the continent', forecast.end.amount === 17);
  check('the calculator uses the payout', forecast.end.amount === gs.getCollectIncomeAmount('british'));
  const html = renderIncomeCalculator(gs, 'british');
  check('the readout carries that payout', html.includes('data-end="17"') && html.includes('>17<'));
  gs._collectIncome();
  check('collect income adds that payout', gs.playerState.british.ipcs === 32);

  gs.playerState.british.ipcs = 15;
  gs.territoryState.France = { owner: 'british', isCapital: false };
  gs.capturedThisTurn = new Set(['France']);
  const changed = incomeForecast(gs, 'british');
  check('now omits a territory captured this turn', changed.now.amount === 17 && changed.end.amount === 21);
  check('the markup shows both figures', renderIncomeCalculator(gs, 'british').includes('data-now="17"') && renderIncomeCalculator(gs, 'british').includes('data-end="21"'));

  gs.territoryState.Britain.owner = 'germans';
  const lost = incomeForecast(gs, 'british');
  check('a lost capital pays nothing', lost.end.amount === 0 && lost.end.capitalLost === true);
  check('the lost-capital line is Capital lost', renderIncomeCalculator(gs, 'british').includes('Capital lost'));
}

console.log('=== land-bridge blocking ===');
{
  const gs = board([
    { name: 'Alaska', isWater: false, connections: ['Western Canada'], production: 2 },
    { name: 'Western Canada', isWater: false, connections: ['Alaska'], production: 1 },
    { name: 'Soviet Far East', isWater: false, connections: [], production: 1 },
  ]);
  gs.gameOptions = normalizeGameOptions({ landBridgeBlocking: true });
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.territoryState.Alaska = { owner: 'british', isCapital: false };
  gs.territoryState['Soviet Far East'] = { owner: 'germans', isCapital: false };
  gs.units.Alaska = [{ type: 'infantry', quantity: 1, owner: 'british' }];
  check('the bridge still exists for air', gs.hasLandBridge('Alaska', 'Soviet Far East') === true && gs.canAirUnitReach('Alaska', 'Soviet Far East', 1));
  check('land movement refuses the bridge', gs.landBridgeBlocks('Alaska', 'Soviet Far East') === true
    && !gs.getReachableTerritoriesForLand('Alaska', 1, 'british', true).has('Soviet Far East'));
  const moved = gs.moveUnits('Alaska', 'Soviet Far East', [{ type: 'infantry', quantity: 1 }], unitDefs);
  check('a land move across the bridge is refused', moved.success === false);
}

console.log('=== transports are not casualties while another unit remains ===');
{
  if (typeof globalThis.document === 'undefined') {
    const makeEl = () => {
      const el = {
        id: '', className: '', innerHTML: '', style: {}, children: [],
        classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
        appendChild(child) { this.children.push(child); return child; },
        querySelector() { return null; },
        querySelectorAll() { return []; },
        addEventListener() {},
        setAttribute() {},
        getAttribute() { return null; },
      };
      return el;
    };
    globalThis.document = {
      body: makeEl(),
      createElement: makeEl,
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    };
  }
  const gs = board([
    { name: 'East Canada Sea Zone', isWater: true, connections: [] },
  ]);
  gs.currentPlayerIndex = 0;
  gs.turnPhase = TURN_PHASES.COMBAT;
  const defenders = [
    { type: 'destroyer', quantity: 1, owner: 'british' },
    { type: 'transport', quantity: 1, owner: 'british' },
  ];
  const ui = new CombatUI();
  ui.gameState = gs;
  ui.unitDefs = unitDefs;
  ui.combatState = {
    attackers: [{ type: 'battleship', quantity: 1, owner: 'germans' }],
    defenders: defenders.map((unit) => ({ ...unit })),
    pendingDefenderCasualties: 1,
    pendingAttackerCasualties: 0,
    selectedDefenderCasualties: {},
    selectedAttackerCasualties: {},
  };
  ui._adjustCasualty('defender', 'transport', 1);
  check('manual selection cannot take the transport', (ui.combatState.selectedDefenderCasualties.transport || 0) === 0);
  const auto = ui._selectCheapestCasualties(ui.combatState.defenders, 1);
  check('auto casualties skip the transport', !auto.transport && auto.destroyer === 1, auto);
  const side = [
    { type: 'destroyer', quantity: 1, owner: 'british' },
    { type: 'transport', quantity: 1, owner: 'british' },
  ];
  gs._applyCasualtiesWithDamage(side, 1, unitDefs, true, {
    enemies: [{ type: 'battleship', quantity: 1, owner: 'germans' }],
    enemyRoll: 'attack',
  });
  check('AI casualty assignment keeps the transport', side.find((unit) => unit.type === 'transport').quantity === 1
    && side.find((unit) => unit.type === 'destroyer').quantity === 0);

  gs.units['East Canada Sea Zone'] = [
    { type: 'battleship', quantity: 1, owner: 'germans' },
    { type: 'transport', quantity: 2, owner: 'british' },
  ];
  gs.resolveCombat('East Canada Sea Zone', unitDefs);
  const left = (gs.units['East Canada Sea Zone'] || []).find((unit) => unit.type === 'transport');
  check('an undefended transport is removed', !left || left.quantity === 0);
}

console.log('=== tech bonuses apply in auto-resolve ===');
{
  const gs = board([{ name: 'France', isWater: false, connections: [], production: 4 }]);
  gs.playerTechs.british.unlockedTechs = ['jets'];
  gs._rollDie = () => 5;
  const withJets = gs._rollCombatWithRolls(
    [{ type: 'fighter', quantity: 1, owner: 'british' }],
    'defense',
    unitDefs,
  );
  check('jets hit on a 5 in auto-resolve', withJets.hits === 1 && withJets.rolls[0].defenseValue === 5);
  gs.playerTechs.british.unlockedTechs = [];
  const plain = gs._rollCombatWithRolls(
    [{ type: 'fighter', quantity: 1, owner: 'british' }],
    'defense',
    unitDefs,
  );
  check('the same 5 misses without jets', plain.hits === 0 && plain.rolls[0].defenseValue === 4);

  let faces = 0;
  gs.playerTechs.germans.unlockedTechs = ['heavyBombers'];
  gs._rollDie = () => { faces += 1; return 6; };
  const heavy = gs._rollCombatWithRolls(
    [{ type: 'bomber', quantity: 1, owner: 'germans' }],
    'attack',
    unitDefs,
  );
  check('heavy bombers roll two dice in auto-resolve', faces === 2 && heavy.rolls.length === 2);
  faces = 0;
  gs.playerTechs.germans.unlockedTechs = [];
  gs._rollCombatWithRolls([{ type: 'bomber', quantity: 1, owner: 'germans' }], 'attack', unitDefs);
  check('a bomber without the tech rolls one die', faces === 1);

  gs.playerTechs.germans.unlockedTechs = ['superSubs'];
  gs._rollDie = () => 3;
  const sub = gs._rollCombatWithRolls(
    [{ type: 'submarine', quantity: 1, owner: 'germans' }],
    'attack',
    unitDefs,
  );
  check('super submarines hit on a 3 in auto-resolve', sub.hits === 1 && sub.rolls[0].attackValue === 3);

  const ui = new CombatUI();
  ui.gameState = gs;
  ui.unitDefs = unitDefs;
  ui._rollD6 = () => 5;
  gs.playerTechs.british.unlockedTechs = ['jets'];
  ui.combatState = {
    attackers: [],
    defenders: [{ type: 'fighter', quantity: 1, owner: 'british' }],
    phase: 'dice',
  };
  const played = ui._rollDice();
  check('the combat screen uses the same jets bonus', played.defenseHits === 1);
  check('Long Range Aircraft names every air unit',
    TECHNOLOGIES.longRangeAircraft.description.includes('tactical bombers')
    && readFileSync(join(root, 'src/ui/unitTooltip.js'), 'utf8').includes('def?.isAir'));
  check('the first-load splash keeps local play',
    readFileSync(join(root, 'src/ui/authScreen.js'), 'utf8').includes('Play on this device')
    && readFileSync(join(root, 'src/main.js'), 'utf8').includes("entry: 'first'"));
}

if (failures) {
  console.error(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log('\nunified.68 checks passed');
