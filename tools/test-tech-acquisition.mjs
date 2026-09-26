// V2.81.57-unified.17 — tech acquisition modes. Dice tokens match today.
// Run: node tools/test-tech-acquisition.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem(key) { return mem.has(key) ? mem.get(key) : null; },
    setItem(key, value) { mem.set(key, String(value)); },
    removeItem(key) { mem.delete(key); },
  };
}

const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  DEFAULT_GAME_OPTIONS,
  DIRECT_TECH_IPC_COST,
  normalizeGameOptions,
  restoreProtectedGameOptions,
} = await import(pathToFileURL(join(root, 'src/gameOptions.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const setup = JSON.parse(readFileSync(join(root, 'data/setup.json'), 'utf8'));
const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const continents = JSON.parse(readFileSync(join(root, 'data/continents.json'), 'utf8'));

function boot(gameOptions, random) {
  const prev = Math.random;
  Math.random = random;
  try {
    const gs = new GameState(setup, territories, continents);
    const players = setup.risk.factions.slice(0, 2).map((faction) => ({
      ...faction,
      isAI: true,
      aiDifficulty: 'easy',
    }));
    gs.initGame('risk', players, {
      startingIPCs: 80,
      teamsEnabled: false,
      gameOptions,
    });
    return gs;
  } finally {
    Math.random = prev;
  }
}

function research(gs, faces, { count = 3 } = {}) {
  const id = gs.players[0].id;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.DEVELOP_TECH;
  let i = 0;
  const prev = Math.random;
  Math.random = () => {
    const face = faces[Math.min(i, faces.length - 1)];
    i += 1;
    return (face - 1) / 6;
  };
  try {
    const bought = gs.purchaseTechDice(id, count);
    const result = gs.rollTechDice(id);
    return {
      bought,
      id,
      result,
      tokens: gs.playerTechs[id].techTokens,
      ipcs: gs.getIPCs(id),
    };
  } finally {
    Math.random = prev;
  }
}

console.log('=== V2.81.57-unified.17 tech acquisition ===');
check('GAME_VERSION is V2.81.57-unified.17', GAME_VERSION === 'V2.81.57-unified.17');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);
check('direct tech cost is 20 IPCs', DIRECT_TECH_IPC_COST === 20);
check('defaults are dice tokens and a random deal',
  normalizeGameOptions(null).techAcquisition === 'dice'
  && normalizeGameOptions(null).territorySetup === 'random');

const plain = boot(null, mulberry32(0x7ec4));
const explicit = boot({ ...DEFAULT_GAME_OPTIONS }, mulberry32(0x7ec4));
const miss = [1, 2, 3];
const a = research(plain, miss);
const b = research(explicit, miss);
check('default mode matches an explicit dice-token game',
  JSON.stringify(a.result.rolls) === JSON.stringify(b.result.rolls)
  && a.tokens === 0
  && b.tokens === 0
  && a.ipcs === b.ipcs
  && a.result.picks === 0
  && a.result.success === false);

const keepMiss = boot({ techAcquisition: 'keep' }, mulberry32(0x1111));
const kept = research(keepMiss, miss);
check('a miss keeps the tokens', kept.tokens === 3 && kept.result.kept === true && kept.result.picks === 0);
check('kept tokens are still on the player', keepMiss.playerTechs[kept.id].techTokens === 3);

const keepHit = boot({ techAcquisition: 'keep' }, mulberry32(0x2222));
const spent = research(keepHit, [6]);
check('one 6 spends the tokens and unlocks one pick',
  spent.tokens === 0 && spent.result.success === true && spent.result.picks === 1);

const multi = boot({ techAcquisition: 'keep', multipleTech: true }, mulberry32(0x3333));
const many = research(multi, [6, 6, 1]);
check('keep mode still honors multiple breakthroughs', many.result.picks === 2 && many.tokens === 0);

const buyer = boot({ techAcquisition: 'buy', multipleTech: true }, mulberry32(0x4444));
const seat = buyer.players[0].id;
buyer.phase = GAME_PHASES.PLAYING;
buyer.turnPhase = TURN_PHASES.DEVELOP_TECH;
check('buy mode refuses a purchase outside Purchase', buyer.buyTech(seat, 'jets') === false);
buyer.turnPhase = TURN_PHASES.PURCHASE;
const before = buyer.getIPCs(seat);
check('buy mode pays 20 and unlocks the technology', buyer.buyTech(seat, 'jets') === true);
check('IPCs dropped by 20', buyer.getIPCs(seat) === before - 20);
check('jets are owned', buyer.hasTech(seat, 'jets') === true);
check('the same technology cannot be bought twice', buyer.buyTech(seat, 'jets') === false);
check('a second technology is another 20', buyer.buyTech(seat, 'rockets') === true
  && buyer.getIPCs(seat) === before - 40);
check('buy mode did not roll dice', (buyer.playerTechs[seat].techTokens || 0) === 0);

const diceBuyer = boot(null, mulberry32(0x5555));
diceBuyer.phase = GAME_PHASES.PLAYING;
diceBuyer.turnPhase = TURN_PHASES.PURCHASE;
check('dice mode cannot buy a technology directly',
  diceBuyer.buyTech(diceBuyer.players[0].id, 'jets') === false);

const buyDice = boot({ techAcquisition: 'buy' }, mulberry32(0x0b17));
buyDice.phase = GAME_PHASES.PLAYING;
buyDice.turnPhase = TURN_PHASES.PURCHASE;
const buySeat = buyDice.players[0].id;
const buyIpcs = buyDice.getIPCs(buySeat);
check('buy mode refuses tech dice in game state',
  buyDice.purchaseTechDice(buySeat, 1) === false
  && buyDice.getIPCs(buySeat) === buyIpcs
  && (buyDice.playerTechs[buySeat]?.techTokens || 0) === 0);

for (const mode of ['keep', 'buy']) {
  const gs = boot({ techAcquisition: mode, territorySetup: 'draft' }, mulberry32(0x0f4));
  const mirror = normalizeGameOptions(gs.gameOptions);
  const stripped = gs.toJSON();
  delete stripped.gameOptions.techAcquisition;
  delete stripped.gameOptions.territorySetup;
  const restored = restoreProtectedGameOptions(stripped, mirror);
  const loaded = new GameState(setup, territories, continents);
  loaded.loadFromJSON(restored);
  check(`F4 ${mode} survives a stale options push`,
    loaded.gameOptions.techAcquisition === mode
    && loaded.gameOptions.territorySetup === 'draft');
}
const keptMode = restoreProtectedGameOptions(
  { gameOptions: { techAcquisition: 'keep', startingIPCs: 80 } },
  { techAcquisition: 'dice', territorySetup: 'random' },
);
check('F4 a live tech mode is not replaced by the mirror',
  keptMode.gameOptions.techAcquisition === 'keep'
  && keptMode.gameOptions.territorySetup === 'random');

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll tech acquisition checks passed');
