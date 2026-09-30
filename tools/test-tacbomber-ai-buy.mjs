// V2.81.57-unified.32 — AI buys tactical bombers only when the option is on.
// OFF purchases and the Math.random sequence match the main fixture below,
// recorded at 30d1515 (unified.24) before this change.
// Run: node tools/test-tacbomber-ai-buy.mjs

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
const { GAME_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { AIController } = await import(pathToFileURL(join(root, 'src/ai/aiController.js')));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

// Purchases and Math.random calls from main, option off. calls is empty:
// the purchase path did not roll.
const MAIN_OFF = {
  'easy-40': { bought: ['infantry', 'infantry', 'infantry', 'infantry', 'armour'], ipc: 23, calls: [] },
  'medium-40': { bought: ['infantry', 'infantry', 'infantry', 'infantry', 'armour', 'armour', 'artillery', 'artillery'], ipc: 10, calls: [] },
  'hard-40': { bought: ['armour', 'armour', 'armour', 'artillery', 'artillery', 'fighter', 'infantry', 'infantry'], ipc: 1, calls: [] },
  'easy-80': { bought: ['infantry', 'infantry', 'infantry', 'infantry', 'armour'], ipc: 63, calls: [] },
  'medium-28': { bought: ['infantry', 'infantry', 'infantry', 'infantry', 'armour', 'armour', 'artillery'], ipc: 2, calls: [] },
  'hard-threat': { bought: ['infantry', 'infantry', 'infantry', 'infantry', 'infantry', 'infantry', 'artillery', 'artillery', 'fighter'], ipc: 14, calls: [] },
  'easy-near': { bought: ['armour', 'armour', 'armour', 'armour', 'fighter', 'fighter', 'infantry', 'infantry', 'infantry'], ipc: 11, calls: [] },
  'medium-island-50': { bought: ['transport', 'submarine', 'transport', 'infantry', 'infantry', 'infantry', 'infantry'], ipc: 18, calls: [] },
  'easy-11': { bought: ['infantry', 'infantry', 'infantry'], ipc: 2, calls: [] },
  'hard-80-fighter': { bought: ['armour', 'armour', 'armour', 'artillery', 'artillery', 'fighter', 'infantry', 'infantry', 'infantry', 'infantry', 'infantry'], ipc: 32, calls: [] },
};

function board({ island = false, threat = false, capitals = 1, fighter = false, cargoTank = false, ipc = 40 } = {}) {
  const territories = island
    ? [
      { name: 'Home', isWater: false, connections: ['Sea'] },
      { name: 'Sea', isWater: true, connections: ['Home', 'Far'] },
      { name: 'Far', isWater: false, connections: ['Sea'] },
    ]
    : [
      { name: 'Home', isWater: false, connections: ['Neighbor', 'Sea'] },
      { name: 'Neighbor', isWater: false, connections: ['Home'] },
      { name: 'OtherCap', isWater: false, connections: [] },
      { name: 'EnemyCap', isWater: false, connections: [] },
      { name: 'Sea', isWater: true, connections: ['Home'] },
    ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.mapId = 'classic';
  gs.players = [
    { id: 'usa', name: 'US Easy AI', isAI: true, aiDifficulty: 'easy' },
    { id: 'ger', name: 'German Easy AI', isAI: true, aiDifficulty: 'easy' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.territoryState = {
    Home: { owner: 'usa', isCapital: true },
    Neighbor: { owner: 'ger', isCapital: false },
    OtherCap: { owner: 'usa', isCapital: capitals >= 2 },
    EnemyCap: { owner: 'ger', isCapital: true },
    Far: { owner: 'ger', isCapital: false },
    Sea: { owner: null, isCapital: false },
  };
  gs.playerState = {
    usa: { ipcs: ipc, hasPlacedCapital: true, capitalTerritory: 'Home' },
    ger: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'EnemyCap' },
  };
  gs.units = {
    Home: [{ type: 'factory', quantity: 1, owner: 'usa' }],
  };
  if (fighter) gs.units.Home.push({ type: 'fighter', quantity: 1, owner: 'usa' });
  if (threat) gs.units.Neighbor = [{ type: 'infantry', quantity: 4, owner: 'ger' }];
  if (cargoTank) {
    gs.units.Sea = [{
      type: 'transport',
      quantity: 1,
      owner: 'usa',
      cargo: [{ type: 'armour', owner: 'usa' }],
    }];
  }
  gs.unitDefs = unitDefs;
  gs.friendlyTerritoriesAtTurnStart = new Set(['Home']);
  return gs;
}

const CASES = [
  ['easy-40', { ipc: 40 }, 'easy'],
  ['medium-40', { ipc: 40 }, 'medium'],
  ['hard-40', { ipc: 40 }, 'hard'],
  ['easy-80', { ipc: 80 }, 'easy'],
  ['medium-28', { ipc: 28 }, 'medium'],
  ['hard-threat', { ipc: 50, threat: true }, 'hard'],
  ['easy-near', { ipc: 60, capitals: 2 }, 'easy'],
  ['medium-island-50', { ipc: 50, island: true }, 'medium'],
  ['easy-11', { ipc: 11 }, 'easy'],
  ['hard-80-fighter', { ipc: 80, fighter: true }, 'hard'],
];

AIController.prototype._delay = async function silent() {};
AIController.prototype._getActionDelay = function noDelay() { return 0; };

async function buy(name, opts, difficulty, tacticalBombers) {
  const calls = [];
  const real = Math.random;
  Math.random = () => {
    const value = 0.1 + (calls.length * 0.01);
    calls.push(Number(value.toFixed(4)));
    return value;
  };
  try {
    const gs = board(opts);
    gs.gameOptions = {
      tacticalBombers: tacticalBombers === true,
      landBridges: true,
      techAcquisition: 'dice',
    };
    const ai = new AIController();
    ai.skipMode = true;
    ai.unitDefs = unitDefs;
    ai.gameState = gs;
    ai._updateStatus = () => {};
    const player = { ...gs.players[0], aiDifficulty: difficulty };
    gs.players[0] = player;
    const bought = [];
    const startIpc = gs.getIPCs('usa');
    const orig = gs.purchaseUnit.bind(gs);
    gs.purchaseUnit = (type, where, defs) => {
      const ok = orig(type, where, defs);
      if (ok) bought.push(type);
      return ok;
    };
    await ai._handlePurchase({ difficulty }, player);
    const spent = bought.reduce((sum, type) => sum + (unitDefs[type]?.cost || 0), 0);
    return {
      name,
      bought,
      ipc: gs.getIPCs('usa'),
      calls,
      startIpc,
      spent,
      tac: bought.filter((type) => type === 'tacticalBomber').length,
    };
  } finally {
    Math.random = real;
  }
}

console.log('=== tactical bomber AI buy ===');
check('stamp is unified.26', GAME_VERSION === 'V2.81.57-unified.32');

const offRuns = [];
for (const [name, opts, difficulty] of CASES) {
  const row = await buy(name, opts, difficulty, false);
  offRuns.push(row);
  const fixture = MAIN_OFF[name];
  check(`${name} OFF buys match main`, JSON.stringify(row.bought) === JSON.stringify(fixture.bought)
    && row.ipc === fixture.ipc);
  check(`${name} OFF Math.random sequence matches main`, JSON.stringify(row.calls) === JSON.stringify(fixture.calls));
  check(`${name} OFF stays inside budget`, row.ipc >= 0 && row.spent <= row.startIpc && row.tac === 0);
}

const again = await buy('easy-40', { ipc: 40 }, 'easy', false);
check('OFF repeat is the same buy and the same RNG sequence',
  JSON.stringify(again.bought) === JSON.stringify(offRuns[0].bought)
  && JSON.stringify(again.calls) === JSON.stringify(offRuns[0].calls));

const onRuns = [];
for (const [name, opts, difficulty] of CASES) {
  onRuns.push(await buy(name, opts, difficulty, true));
}
const tacTotal = onRuns.reduce((sum, row) => sum + row.tac, 0);
check('ON buys at least one tactical bomber across the seeded turns', tacTotal >= 1);
check('ON never buys more than one tactical bomber in a turn', onRuns.every((row) => row.tac <= 1));
check('ON never spends past the budget', onRuns.every((row) => row.ipc >= 0 && row.spent <= row.startIpc));

const byName = Object.fromEntries(onRuns.map((row) => [row.name, row]));
check('ON easy with 40 IPCs buys one tactical bomber after the tank',
  JSON.stringify(byName['easy-40'].bought) === JSON.stringify([
    'infantry', 'infantry', 'infantry', 'infantry', 'armour', 'tacticalBomber',
  ]) && byName['easy-40'].ipc === 12);
check('ON easy with 11 IPCs and no partner does not buy one',
  byName['easy-11'].tac === 0
  && JSON.stringify(byName['easy-11'].bought) === JSON.stringify(MAIN_OFF['easy-11'].bought));
check('ON hard with a fighter buys one tactical bomber beside that fighter',
  byName['hard-80-fighter'].tac === 1
  && byName['hard-80-fighter'].bought.filter((type) => type === 'tacticalBomber').length === 1);
check('ON island with no fighter or tank does not buy one', byName['medium-island-50'].tac === 0);

const islandPartner = await buy('island-fighter', { ipc: 50, island: true, fighter: true }, 'medium', true);
check('ON island with a fighter spends leftover IPCs on one tactical bomber',
  islandPartner.tac === 1 && islandPartner.ipc >= 0 && islandPartner.spent <= islandPartner.startIpc);

const cargoPartner = await buy('island-cargo', { ipc: 50, island: true, cargoTank: true }, 'medium', true);
check('ON island pairs with a tank already loaded on a transport',
  cargoPartner.tac === 1 && cargoPartner.ipc >= 0 && cargoPartner.spent <= cargoPartner.startIpc);

const cargoOff = await buy('island-cargo', { ipc: 50, island: true, cargoTank: true }, 'medium', false);
check('OFF island with a loaded tank does not buy a tactical bomber', cargoOff.tac === 0 && cargoOff.calls.length === 0);

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall tactical bomber AI buy checks passed');
