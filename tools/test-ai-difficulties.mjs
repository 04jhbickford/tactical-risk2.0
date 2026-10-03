// Four AI levels on the live AIController turn.
// Run: node tools/test-ai-difficulties.mjs

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
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { AIController } = await import(pathToFileURL(join(root, 'src/ai/aiController.js')));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  AI_LEVELS,
  allowsLosingTrade,
  aiLevelLabel,
  captureWinsGame,
  normalizeAiDifficulty,
} = await import(pathToFileURL(join(root, 'src/ai/difficulty.js')));
const { AI_DIFFICULTIES } = await import(pathToFileURL(join(root, 'src/ui/lobby.js')));
const { sideLabel } = await import(pathToFileURL(join(root, 'src/multiplayer/discordTurnPing.js')));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra == null ? '' : extra);
  } else {
    console.log('ok  :', label);
  }
};

const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));
const lobbySrc = readFileSync(join(root, 'src/ui/lobby.js'), 'utf8');
const mpSrc = readFileSync(join(root, 'src/ui/multiplayerLobby.js'), 'utf8');
const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
const aiSrc = readFileSync(join(root, 'src/ai/aiController.js'), 'utf8');

AIController.prototype._delay = async function silent() {};
AIController.prototype._getActionDelay = function noDelay() { return 0; };

function inf(quantity, owner) {
  return { type: 'infantry', quantity, owner };
}

function seat(id, difficulty, extra = {}) {
  const isAI = difficulty != null;
  return {
    id,
    name: extra.name || id,
    isAI,
    aiDifficulty: isAI ? difficulty : null,
    ...extra,
  };
}

function board({ territories, territoryState, units, players, continents = [], mapId = 'classic' }) {
  const gs = new GameState({ risk: { factions: [] } }, territories, continents);
  gs.mapId = mapId;
  gs.players = players;
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.territoryState = territoryState;
  gs.playerState = {};
  for (const player of players) {
    gs.playerState[player.id] = {
      ipcs: player.ipc ?? 40,
      hasPlacedCapital: true,
      capitalTerritory: player.capital || null,
    };
  }
  gs.units = units;
  gs.unitDefs = unitDefs;
  gs.gameOptions = {
    ...gs.gameOptions,
    landBridges: true,
    techAcquisition: 'dice',
    tacticalBombers: false,
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(
    Object.entries(territoryState)
      .filter(([, state]) => state.owner === players[0].id)
      .map(([name]) => name),
  );
  return gs;
}

function controller(gs) {
  const ai = new AIController();
  ai.skipMode = true;
  ai.unitDefs = unitDefs;
  ai.gameState = gs;
  ai._updateStatus = () => {};
  ai._logAction = () => {};
  ai._notifyAction = () => {};
  return ai;
}

async function runAttacks(gs) {
  const moved = [];
  const orig = gs.moveUnits.bind(gs);
  gs.moveUnits = (from, to, units, defs, options) => {
    const result = orig(from, to, units, defs, options);
    moved.push({
      from,
      to,
      units,
      ok: !!(result && result.success !== false),
      error: result?.error || '',
    });
    return result;
  };
  const ai = controller(gs);
  await ai._handleCombatMove({ difficulty: gs.players[0].aiDifficulty }, gs.players[0]);
  return moved;
}

async function runPurchase(gs) {
  gs.turnPhase = TURN_PHASES.PURCHASE;
  const bought = [];
  const orig = gs.purchaseUnit.bind(gs);
  gs.purchaseUnit = (type, where, defs) => {
    const ok = orig(type, where, defs);
    if (ok) bought.push(type);
    return ok;
  };
  const ai = controller(gs);
  await ai._handlePurchase({ difficulty: gs.players[0].aiDifficulty }, gs.players[0]);
  return bought;
}

function link(pairs) {
  const map = new Map();
  const add = (a, b) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a).add(b);
  };
  for (const [a, b] of pairs) {
    add(a, b);
    add(b, a);
  }
  return [...map.entries()].map(([name, links]) => ({
    name,
    isWater: name.startsWith('Sea'),
    connections: [...links],
  }));
}

console.log('=== four AI levels ===');
check('stamp is V2.81.57-unified.48', GAME_VERSION === 'V2.81.57-unified.48');
check('schema stays 11', SCHEMA_VERSION === 11);
check('live turn is aiController from main', mainSrc.includes("from './ai/aiController.js'")
  && !mainSrc.includes('strategyAI'));
check('controller does not start a second brain', !aiSrc.includes('strategyAI') && !aiSrc.includes('takeTurn'));

check('levels are Easier, Medium, Harder, Hardest',
  AI_LEVELS.map((row) => row.name).join(',') === 'Easier,Medium,Harder,Hardest'
  && AI_LEVELS.map((row) => row.id).join(',') === 'easy,medium,hard,hardest');
check('local setup lists Human then those four',
  AI_DIFFICULTIES.map((row) => row.name).join(',') === 'Human,Easier,Medium,Harder,Hardest');
check('local and online share AI_LEVELS',
  lobbySrc.includes('...AI_LEVELS') && mpSrc.includes('AI_LEVELS.map'));
check('online Add AI defaults to Medium', mpSrc.includes('DEFAULT_AI_DIFFICULTY'));
check('a human seat stores no AI level',
  lobbySrc.includes('aiDifficulty: isAI ? normalizeAiDifficulty(occupant) : null'));

check('saved easy is Easier', normalizeAiDifficulty('easy') === 'easy' && aiLevelLabel('easy') === 'Easier');
check('saved medium is Medium', normalizeAiDifficulty('medium') === 'medium' && aiLevelLabel('medium') === 'Medium');
check('saved hard is Harder', normalizeAiDifficulty('hard') === 'hard' && aiLevelLabel('hard') === 'Harder');
check('a human value is not an AI level', normalizeAiDifficulty('human') === 'human' && aiLevelLabel('human') === '');
check('only Hardest may take a bad trade, and only to win',
  allowsLosingTrade('hardest', true) === true
  && allowsLosingTrade('hardest', false) === false
  && ['easy', 'medium', 'hard'].every((level) => (
    allowsLosingTrade(level, true) === false && allowsLosingTrade(level, false) === false
  )));

check('an Easier bot still pings as Easy', sideLabel('British', '', [{
  id: 'British', isAI: true, name: 'Easier Bot', aiDifficulty: 'easy',
}]) === 'British Easy AI');
check('a Hardest bot pings as Hardest', sideLabel('British', '', [{
  id: 'British', isAI: true, name: 'Hardest Bot', aiDifficulty: 'hardest',
}]) === 'British Hardest AI');

function purchaseBoard(difficulty) {
  const territories = link([['Home', 'Plain']]);
  for (const name of ['G1', 'U1']) {
    territories.push({ name, isWater: false, connections: [] });
  }
  return board({
    territories,
    players: [
      seat('usa', difficulty, { capital: 'Home', ipc: 40 }),
      seat('ger', null, { capital: 'G1' }),
      seat('uk', null, { capital: 'U1' }),
    ],
    territoryState: {
      Home: { owner: 'usa', isCapital: true },
      Plain: { owner: 'usa', isCapital: false },
      G1: { owner: 'ger', isCapital: true },
      U1: { owner: 'uk', isCapital: true },
    },
    units: { Home: [{ type: 'factory', quantity: 1, owner: 'usa' }] },
  });
}

const realRandom = Math.random;
Math.random = () => 0.2;
const easyBuy = await runPurchase(purchaseBoard('easy'));
const hardestBuy = await runPurchase(purchaseBoard('hardest'));
Math.random = realRandom;
const infantry = (rows) => rows.filter((type) => type === 'infantry').length;
check('Easier buys more infantry than Hardest',
  infantry(easyBuy) > infantry(hardestBuy),
  `easy ${easyBuy.join(',')} vs hardest ${hardestBuy.join(',')}`);
check('Easier buy is mostly infantry', infantry(easyBuy) >= 4 && infantry(easyBuy) > easyBuy.length / 2);
check('the turn read the seat level', easyBuy.join(',') !== hardestBuy.join(','));

function attackBoard(difficulty) {
  const territories = link([
    ['A1', 'E1'], ['A2', 'E2'], ['A3', 'E3'], ['A4', 'M4'],
  ]);
  territories.push({ name: 'Cap', isWater: false, connections: [] });
  territories.push({ name: 'Far', isWater: false, connections: [] });
  territories.push({ name: 'Other', isWater: false, connections: [] });
  const state = {
    Cap: { owner: 'usa', isCapital: true },
    Far: { owner: 'ger', isCapital: true },
    Other: { owner: 'uk', isCapital: true },
  };
  const units = {
    A1: [inf(8, 'usa')],
    E1: [inf(1, 'ger')],
    A2: [inf(8, 'usa')],
    E2: [inf(1, 'ger')],
    A3: [inf(8, 'usa')],
    E3: [inf(1, 'ger')],
    A4: [inf(6, 'usa')],
    M4: [inf(2, 'ger')],
  };
  for (const name of ['A1', 'A2', 'A3', 'A4']) state[name] = { owner: 'usa', isCapital: false };
  for (const name of ['E1', 'E2', 'E3', 'M4']) state[name] = { owner: 'ger', isCapital: false };
  return board({
    territories,
    territoryState: state,
    units,
    players: [
      seat('usa', difficulty, { capital: 'Cap' }),
      seat('ger', null, { capital: 'Far' }),
      seat('uk', null, { capital: 'Other' }),
    ],
  });
}

Math.random = () => 0.2;
const easyAttacks = await runAttacks(attackBoard('easy'));
const hardestAttacks = await runAttacks(attackBoard('hardest'));
Math.random = realRandom;
const okMoves = (rows) => rows.filter((row) => row.ok);
check('Easier attacks less than Hardest',
  okMoves(easyAttacks).length < okMoves(hardestAttacks).length,
  `easy ${okMoves(easyAttacks).length} ${JSON.stringify(easyAttacks)} hardest ${okMoves(hardestAttacks).length} ${JSON.stringify(hardestAttacks)}`);
check('Easier stops after a couple of attacks', okMoves(easyAttacks).length <= 2 && okMoves(easyAttacks).length > 0);
check('Easier does not take the even-ish fight', okMoves(easyAttacks).every((row) => row.to !== 'M4'));
check('Hardest does take that fight', okMoves(hardestAttacks).some((row) => row.to === 'M4'));

function winTradeBoard(difficulty, { winning }) {
  const territories = link([['Home', 'Win']]);
  territories.push({ name: 'Other', isWater: false, connections: [] });
  if (!winning) territories.push({ name: 'Third', isWater: false, connections: [] });
  const players = [
    seat('usa', difficulty, { capital: 'Home' }),
    seat('ger', null, { capital: 'Win' }),
  ];
  const territoryState = {
    Home: { owner: 'usa', isCapital: true },
    Win: { owner: 'ger', isCapital: true },
    Other: { owner: 'usa', isCapital: true },
  };
  if (!winning) {
    players.push(seat('uk', null, { capital: 'Third' }));
    territoryState.Third = { owner: 'uk', isCapital: true };
    territoryState.Fourth = { owner: 'uk', isCapital: true };
    territories.push({ name: 'Fourth', isWater: false, connections: [] });
  }
  return board({
    territories,
    players,
    territoryState,
    units: {
      Home: [inf(2, 'usa')],
      Win: [inf(10, 'ger')],
    },
  });
}

const winBoard = winTradeBoard('hardest', { winning: true });
check('taking that capital wins the Classic game', captureWinsGame(winBoard, 'usa', 'Win') === true);
const hardestWin = okMoves(await runAttacks(winTradeBoard('hardest', { winning: true })));
const hardWin = okMoves(await runAttacks(winTradeBoard('hard', { winning: true })));
const mediumWin = okMoves(await runAttacks(winTradeBoard('medium', { winning: true })));
const easyWin = okMoves(await runAttacks(winTradeBoard('easy', { winning: true })));
check('Hardest takes the losing trade for a Classic capital',
  hardestWin.some((row) => row.to === 'Win'), JSON.stringify(hardestWin));
check('Harder, Medium, and Easier do not',
  hardWin.length === 0 && mediumWin.length === 0 && easyWin.length === 0,
  `hard ${hardWin.length} medium ${mediumWin.length} easy ${easyWin.length}`);

const quiet = winTradeBoard('hardest', { winning: false });
check('that same stack is not a win with more capitals left', captureWinsGame(quiet, 'usa', 'Win') === false);
const hardestQuiet = okMoves(await runAttacks(quiet));
check('Hardest refuses the bad trade when it does not win', hardestQuiet.length === 0, JSON.stringify(hardestQuiet));

function hiddenWinBoard() {
  const territories = link([['Home', 'Buffer'], ['Buffer', 'WinCap']]);
  territories.push({ name: 'Other', isWater: false, connections: [] });
  return board({
    territories,
    players: [
      seat('usa', 'hardest', { capital: 'Home' }),
      seat('ger', null, { capital: 'WinCap' }),
    ],
    territoryState: {
      Home: { owner: 'usa', isCapital: true },
      Other: { owner: 'usa', isCapital: true },
      Buffer: { owner: 'ger', isCapital: false },
      WinCap: { owner: 'ger', isCapital: true },
    },
    units: {
      Home: [inf(2, 'usa')],
      Buffer: [inf(10, 'ger')],
      WinCap: [inf(1, 'ger')],
    },
  });
}
const hidden = hiddenWinBoard();
check('the far capital would win', captureWinsGame(hidden, 'usa', 'WinCap') === true);
const hiddenMoves = okMoves(await runAttacks(hidden));
check('Hardest does not search past the adjacent fight',
  hiddenMoves.length === 0, JSON.stringify(hiddenMoves));

const PACIFIC_CITIES = [
  'Japan', 'Kiangsu', 'Kwangtung', 'Philippines',
  'India', 'New South Wales', 'Hawaiian Islands', 'Western United States',
];

function pacificBoard(difficulty, { held, attacker = 'Japanese' }) {
  const territories = link([['Philippines', 'India'], ['HawaiiHold', 'Japan']]);
  for (const name of PACIFIC_CITIES) {
    if (!territories.some((row) => row.name === name)) {
      territories.push({ name, isWater: false, connections: [] });
    }
  }
  const japanese = new Set(held);
  const territoryState = {};
  for (const name of PACIFIC_CITIES) {
    const owner = name === 'Japan'
      ? 'Japanese'
      : (japanese.has(name) ? 'Japanese' : 'British');
    territoryState[name] = {
      owner,
      isCapital: false,
    };
  }
  territoryState.HawaiiHold = { owner: 'British', isCapital: false };
  const players = attacker === 'Japanese'
    ? [
      seat('Japanese', difficulty, { capital: 'Japan', alliance: 'Axis', name: 'Japan' }),
      seat('British', null, { capital: 'India', alliance: 'Allies', name: 'Britain' }),
    ]
    : [
      seat('British', difficulty, { capital: 'India', alliance: 'Allies', name: 'Britain' }),
      seat('Japanese', null, { capital: 'Japan', alliance: 'Axis', name: 'Japan' }),
    ];
  const units = attacker === 'Japanese'
    ? {
      Philippines: [inf(2, 'Japanese')],
      India: [inf(10, 'British')],
    }
    : {
      HawaiiHold: [inf(2, 'British')],
      Japan: [inf(10, 'Japanese')],
    };
  return board({
    territories,
    players,
    territoryState,
    units,
    mapId: 'pacific',
  });
}

const closing = pacificBoard('hardest', {
  held: ['Japan', 'Kiangsu', 'Kwangtung', 'Philippines', 'New South Wales'],
});
check('India closes the Pacific win for Japan', captureWinsGame(closing, 'Japanese', 'India') === true);
const hardestPacific = okMoves(await runAttacks(closing));
const hardPacific = okMoves(await runAttacks(pacificBoard('hard', {
  held: ['Japan', 'Kiangsu', 'Kwangtung', 'Philippines', 'New South Wales'],
})));
check('Hardest takes the losing trade for that city',
  hardestPacific.some((row) => row.to === 'India'), JSON.stringify(hardestPacific));
check('Harder does not', hardPacific.length === 0, JSON.stringify(hardPacific));

const short = pacificBoard('hardest', {
  held: ['Japan', 'Kiangsu', 'Kwangtung', 'Philippines'],
});
check('India does not close the win at four cities', captureWinsGame(short, 'Japanese', 'India') === false);
check('Hardest leaves that city', okMoves(await runAttacks(short)).length === 0);

const allies = pacificBoard('hardest', { held: ['Kiangsu'], attacker: 'British' });
check('Japan closes the Pacific win for the Allies', captureWinsGame(allies, 'British', 'Japan') === true);
check('Hardest Allies take that losing trade',
  okMoves(await runAttacks(allies)).some((row) => row.to === 'Japan'));

function continentBoard(difficulty) {
  return board({
    territories: link([['Rear', 'Front'], ['Front', 'Gap'], ['Cap', 'Nowhere']]),
    continents: [{ name: 'Testland', bonus: 12, territories: ['Rear', 'Front', 'Gap'] }],
    players: [
      seat('usa', difficulty, { capital: 'Cap' }),
      seat('ger', null, { capital: 'Gap' }),
      seat('uk', null, { capital: 'Nowhere' }),
    ],
    territoryState: {
      Cap: { owner: 'usa', isCapital: true },
      Nowhere: { owner: 'uk', isCapital: true },
      Rear: { owner: 'usa', isCapital: false },
      Front: { owner: 'usa', isCapital: false },
      Gap: { owner: 'ger', isCapital: true },
    },
    units: {
      Rear: [inf(6, 'usa')],
      Gap: [inf(1, 'ger')],
    },
  });
}

async function nonCombat(difficulty) {
  const gs = continentBoard(difficulty);
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  const ai = controller(gs);
  await ai._handleNonCombatMove({ difficulty }, gs.players[0]);
  const onFront = (gs.units.Front || []).filter((unit) => unit.owner === 'usa')
    .reduce((sum, unit) => sum + (unit.quantity || 0), 0);
  return onFront;
}

check('Harder walks toward the continent it can finish', await nonCombat('hard') > 0);
check('Hardest walks the same way', await nonCombat('hardest') > 0);
check('Easier leaves that land open', await nonCombat('easy') === 0);

function denialBoard(difficulty) {
  const territories = link([['Camp', 'Gap']]);
  for (const name of ['Seat', 'X', 'Y', 'SeatB']) {
    territories.push({ name, isWater: false, connections: [] });
  }
  return board({
    territories,
    continents: [{ name: 'Deny', bonus: 20, territories: ['X', 'Y', 'Gap'] }],
    players: [
      seat('usa', difficulty, { capital: 'Seat' }),
      seat('ger', null, { capital: 'X' }),
      seat('uk', null, { capital: 'SeatB' }),
    ],
    territoryState: {
      Seat: { owner: 'usa', isCapital: true },
      SeatB: { owner: 'uk', isCapital: true },
      Camp: { owner: 'usa', isCapital: false },
      Gap: { owner: 'uk', isCapital: false },
      X: { owner: 'ger', isCapital: true },
      Y: { owner: 'ger', isCapital: false },
    },
    units: {
      Camp: [inf(3, 'usa')],
      Gap: [inf(1, 'uk')],
      X: [inf(8, 'ger')],
      Y: [inf(8, 'ger')],
    },
  });
}

// Camp is not the capital. Three infantry (attack 3) into one (defense 2)
// is 1.5, under Easier's 2.5 and over Harder's 1.2.
const denialEasy = okMoves(await runAttacks(denialBoard('easy')));
const denialHard = okMoves(await runAttacks(denialBoard('hard')));
check('Harder parks on the weak territory that denies the bonus',
  denialHard.some((row) => row.to === 'Gap'), JSON.stringify(denialHard));
check('Easier does not take that fight',
  denialEasy.every((row) => row.to !== 'Gap'), JSON.stringify(denialEasy));

function threatBoard(count) {
  return board({
    territories: link([['Home', 'Next']]),
    players: [
      seat('usa', 'hard', { capital: 'Home' }),
      seat('ger', null, { capital: 'Next' }),
      seat('uk', null, { capital: 'Far' }),
    ],
    territoryState: {
      Home: { owner: 'usa', isCapital: true },
      Next: { owner: 'ger', isCapital: false },
      Far: { owner: 'uk', isCapital: true },
    },
    units: {
      Home: [{ type: 'factory', quantity: 1, owner: 'usa' }],
      Next: [inf(count, 'ger')],
    },
  });
}
const threatAi = controller(threatBoard(4));
const smallThreat = threatAi._analyzeStrategicSituation('usa', 'hard');
const largeThreat = controller(threatBoard(8))._analyzeStrategicSituation('usa', 'hard');
const easyThreat = controller(threatBoard(4))._analyzeStrategicSituation('usa', 'easy');
check('Harder matches the force next door',
  smallThreat.capitalDefenseNeeded === 4 && largeThreat.capitalDefenseNeeded === 8,
  `${smallThreat.capitalDefenseNeeded} / ${largeThreat.capitalDefenseNeeded}`);
check('doubling the neighbor doubles the garrison, not a fixed pile',
  largeThreat.capitalDefenseNeeded === smallThreat.capitalDefenseNeeded * 2);
check('Easier still defends, with a cushion', easyThreat.capitalDefenseNeeded === 6);

function islandBoard(difficulty, { landPath }) {
  const pairs = [['Isle', 'Sea'], ['Sea', 'Far']];
  if (landPath) pairs.push(['Plain', 'Coast']);
  const territories = link(pairs);
  const territoryState = {
    Isle: { owner: 'usa', isCapital: true },
    Sea: { owner: null, isCapital: false },
    Far: { owner: 'ger', isCapital: false },
  };
  if (landPath) {
    territoryState.Plain = { owner: 'usa', isCapital: false };
    territoryState.Coast = { owner: 'ger', isCapital: false };
  }
  const players = [
    seat('usa', difficulty, { capital: 'Isle', ipc: 50 }),
    seat('ger', null, { capital: 'Far' }),
    seat('uk', null),
  ];
  return board({
    territories,
    players,
    territoryState,
    units: { Isle: [{ type: 'factory', quantity: 1, owner: 'usa' }] },
  });
}

const boats = await runPurchase(islandBoard('hard', { landPath: false }));
const walked = await runPurchase(islandBoard('hard', { landPath: true }));
const mediumIsland = await runPurchase(islandBoard('medium', { landPath: true }));
check('Harder buys boats when there is no land path', boats.includes('transport'), boats.join(','));
check('Harder does not buy boats when a land path exists', !walked.includes('transport'), walked.join(','));
check('Medium still buys the island navy', mediumIsland.includes('transport'), mediumIsland.join(','));

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall AI difficulty checks passed');
