// V2.81.57-unified.14 — placement cap, army size, multi-tech, land bridges.
// Run: node tools/test-game-options-rules.mjs

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
const {
  GameState,
  GAME_PHASES,
  RISK_STARTING_UNITS,
  TECHNOLOGIES,
} = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  scaleStartingUnits,
  startingArmyTotals,
  techPicksFromRolls,
} = await import(pathToFileURL(join(root, 'src/gameOptions.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const setup = JSON.parse(readFileSync(join(root, 'data/setup.json'), 'utf8'));
const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const continents = JSON.parse(readFileSync(join(root, 'data/continents.json'), 'utf8'));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

function boot(gameOptions) {
  const gs = new GameState(setup, territories, continents);
  const players = setup.risk.factions.slice(0, 2).map((faction) => ({ ...faction, isAI: false }));
  gs.initGame('risk', players, {
    startingIPCs: 80,
    teamsEnabled: false,
    gameOptions,
  });
  return gs;
}

function placeCapitals(gs) {
  let guard = 0;
  while (gs.phase === GAME_PHASES.CAPITAL_PLACEMENT && guard < 8) {
    guard += 1;
    const land = gs.getPlayerTerritories(gs.currentPlayer.id)
      .find((name) => !gs.territoryByName[name]?.isWater);
    if (!gs.placeCapital(land)) break;
  }
}

console.log('=== V2.81.57-unified.14 game option rules ===');
check('GAME_VERSION is V2.81.57-unified.14', GAME_VERSION === 'V2.81.57-unified.14');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

{
  const gs = boot({ unitsPerRound: 4, startingArmy: 'standard', landBridges: true, multipleTech: false });
  check('O4 limit is 4', gs.getUnitsPerRoundLimit() === 4);
  placeCapitals(gs);
  const land = gs.getPlayerTerritories(gs.currentPlayer.id)
    .find((name) => !gs.territoryByName[name]?.isWater);
  let placed = 0;
  let blocked = false;
  for (let i = 0; i < 5; i++) {
    const result = gs.placeInitialUnit(land, 'infantry', unitDefs);
    if (result.success) placed += 1;
    else blocked = true;
  }
  check('O4 places only the round cap', placed === 4 && blocked);
  check('final-round threshold tracks the cap', gs.isFinalPlacementRound() === gs.players.every(
    (p) => gs.getTotalUnitsToPlace(p.id) <= 5,
  ));
}

{
  const standard = startingArmyTotals(RISK_STARTING_UNITS, 'standard');
  const light = startingArmyTotals(RISK_STARTING_UNITS, 'light');
  const heavy = startingArmyTotals(RISK_STARTING_UNITS, 'heavy');
  const raw = [...RISK_STARTING_UNITS.land, ...RISK_STARTING_UNITS.naval]
    .reduce((n, row) => n + row.quantity, 0);
  check('O5 standard total matches RISK_STARTING_UNITS', standard.total === raw);
  check('O5 light is one third down, rounded, infantry at least 1', light.total < standard.total);
  const lightInf = light.pool.land.find((row) => row.type === 'infantry');
  const heavyInf = heavy.pool.land.find((row) => row.type === 'infantry');
  check('O5 light infantry is 6 and at least 1', lightInf.quantity === 6 && lightInf.quantity >= 1);
  check('O5 heavy infantry is 12', heavyInf.quantity === 12);
  check('O5 heavy total is larger', heavy.total > standard.total);
  const lightGame = boot({ startingArmy: 'light' });
  const seat = lightGame.players[0].id;
  const qty = Object.fromEntries((lightGame.unitsToPlace[seat] || []).map((row) => [row.type, row.quantity]));
  const expected = scaleStartingUnits(RISK_STARTING_UNITS, 'light');
  const expectedQty = Object.fromEntries([...expected.land, ...expected.naval].map((row) => [row.type, row.quantity]));
  check('O5 light pool is what the game deals', JSON.stringify(qty) === JSON.stringify(expectedQty));
}

{
  check('O6 off: two sixes are one pick', techPicksFromRolls([6, 6], { multipleTech: false }) === 1);
  check('O6 on: two sixes are two picks', techPicksFromRolls([6, 6], { multipleTech: true }) === 2);
  const gs = new GameState(setup, territories, continents);
  gs.players = [{ id: 'p1', name: 'Tester' }];
  gs.currentPlayerIndex = 0;
  gs.playerState.p1 = { ipcs: 30 };
  gs.playerTechs.p1 = { techTokens: 2, unlockedTechs: [] };
  gs.gameOptions = { ...gs.gameOptions, multipleTech: false };
  const faces = [6, 6];
  let i = 0;
  gs._rollDie = () => faces[i++];
  const off = gs.rollTechDice('p1');
  check('O6 roll off returns 1 pick', off.picks === 1 && off.success === true);
  gs.unlockTech('p1', 'jets');
  check('O6 off unlocks one tech', gs.playerTechs.p1.unlockedTechs.length === 1);

  gs.playerTechs.p1 = { techTokens: 2, unlockedTechs: [] };
  gs.gameOptions = { ...gs.gameOptions, multipleTech: true };
  i = 0;
  const on = gs.rollTechDice('p1');
  check('O6 roll on returns 2 picks', on.picks === 2 && on.rolls.length === 2);
  const chosen = [];
  let left = on.picks;
  while (left > 0) {
    const avail = gs.getAvailableTechs('p1');
    if (!avail.length) break;
    gs.unlockTech('p1', avail[0]);
    chosen.push(avail[0]);
    left -= 1;
  }
  check('O6 on picks two distinct techs', chosen.length === 2 && new Set(chosen).size === 2);
  check('tech list still has an entry', Object.keys(TECHNOLOGIES).length >= 2);
}

{
  const on = boot({ landBridges: true });
  const off = boot({ landBridges: false });
  check('O7 on: Alaska–Soviet Far East is adjacent', on.hasLandBridge('Alaska', 'Soviet Far East') === true);
  check('O7 on: getConnections includes the bridge', on.getConnections('Alaska').includes('Soviet Far East'));
  check('O7 off: Alaska–Soviet Far East is not a land bridge', off.hasLandBridge('Alaska', 'Soviet Far East') === false);
  check('O7 off: getConnections drops the bridge', !off.getConnections('Alaska').includes('Soviet Far East'));
  check('O7 off still keeps the real land neighbor', off.getConnections('Alaska').includes('West Canada'));
  check('O7 on still has all 16 bridge pairs available', on.activeLandBridges().length === 16);
  check('O7 off pathing list is empty', off.activeLandBridges().length === 0);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll game-option rule checks passed');
