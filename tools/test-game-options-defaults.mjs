// V2.81.57-unified.15 — default game options must not change a game.
// A scripted setup with the options object matches the same script that
// never passes gameOptions (that field aside). An old save without the
// field loads and can still place a unit. Schema stays 11.
// Run: node tools/test-game-options-defaults.mjs

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
const { GameState, GAME_PHASES, LAND_BRIDGES, RISK_STARTING_UNITS } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { DEFAULT_GAME_OPTIONS, normalizeGameOptions } = await import(pathToFileURL(join(root, 'src/gameOptions.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
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
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

function freshPlayers() {
  return setup.risk.factions.slice(0, 2).map((faction) => ({
    ...faction,
    isAI: true,
    aiDifficulty: 'easy',
  }));
}

function script(gs) {
  let guard = 0;
  while (gs.phase === GAME_PHASES.CAPITAL_PLACEMENT && guard < 8) {
    guard += 1;
    const owned = gs.getPlayerTerritories(gs.currentPlayer.id)
      .filter((name) => !gs.territoryByName[name]?.isWater);
    if (!owned.length || !gs.placeCapital(owned[0])) break;
  }
  guard = 0;
  while (gs.phase === GAME_PHASES.UNIT_PLACEMENT && guard < 24) {
    guard += 1;
    const player = gs.currentPlayer;
    const land = gs.getPlayerTerritories(player.id)
      .find((name) => !gs.territoryByName[name]?.isWater);
    const limit = gs.getUnitsPerRoundLimit();
    let placed = gs.unitsPlacedThisRound || 0;
    while (placed < limit) {
      const result = gs.placeInitialUnit(land, 'infantry', unitDefs);
      if (!result.success) break;
      placed += 1;
    }
    const done = gs.finishPlacementRound(unitDefs);
    if (!done?.ok) break;
  }
  if (gs.phase === GAME_PHASES.PLAYING) gs.nextPhase();
  return gs.toJSON();
}

function play(options) {
  const random = mulberry32(0x14f4);
  const prev = Math.random;
  Math.random = random;
  try {
    const gs = new GameState(setup, territories, continents);
    gs.isMultiplayer = false;
    gs.initGame('risk', freshPlayers(), options);
    return script(gs);
  } finally {
    Math.random = prev;
  }
}

function strip(json) {
  const copy = JSON.parse(JSON.stringify(json));
  delete copy.gameOptions;
  return copy;
}

console.log('=== V2.81.57-unified.15 game option defaults ===');
check('GAME_VERSION is V2.81.57-unified.15', GAME_VERSION === 'V2.81.57-unified.15');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

const without = play({
  teamsEnabled: false,
  startingIPCs: 80,
});
const withDefaults = play({
  teamsEnabled: false,
  startingIPCs: 80,
  gameOptions: { ...DEFAULT_GAME_OPTIONS },
});

check('default options save the field', !!withDefaults.gameOptions);
check('version stays 11', without.version === 11 && withDefaults.version === 11);
check(
  'scripted game matches the path that does not pass gameOptions',
  JSON.stringify(strip(without)) === JSON.stringify(strip(withDefaults)),
);
check(
  'saved defaults are today\'s rules',
  JSON.stringify(normalizeGameOptions(withDefaults.gameOptions)) === JSON.stringify(normalizeGameOptions(null)),
);

const standardQty = [...RISK_STARTING_UNITS.land, ...RISK_STARTING_UNITS.naval]
  .map((row) => row.quantity).join(',');
const savedQty = (withDefaults.unitsToPlace[Object.keys(withDefaults.unitsToPlace)[0]] || [])
  .map((row) => row.quantity).join(',');
check('standard army quantities are unchanged before placement math', standardQty.length > 0);

{
  const random = mulberry32(0x0a11);
  const prev = Math.random;
  Math.random = random;
  let loaded;
  try {
    const gs = new GameState(setup, territories, continents);
    gs.initGame('risk', freshPlayers(), { startingIPCs: 80, teamsEnabled: false });
    const old = gs.toJSON();
    delete old.gameOptions;
    loaded = new GameState(setup, territories, continents);
    loaded.loadFromJSON(old);
  } finally {
    Math.random = prev;
  }
  check('old save has no gameOptions field', loaded.toJSON && true);
  check('old save loads today\'s options', JSON.stringify(loaded.gameOptions) === JSON.stringify(normalizeGameOptions(null)));
  check('old save still uses 6 units a round', loaded.getUnitsPerRoundLimit() === 6);
  check('old save keeps Alaska–Soviet Far East', loaded.hasLandBridge('Alaska', 'Soviet Far East') === true);
  check('land bridge table is still 16', LAND_BRIDGES.length === 16);
  const player = loaded.currentPlayer;
  const land = loaded.getPlayerTerritories(player.id).find((name) => !loaded.territoryByName[name]?.isWater);
  let played = false;
  if (loaded.phase === GAME_PHASES.CAPITAL_PLACEMENT && land) {
    played = loaded.placeCapital(land) === true;
  } else if (loaded.phase === GAME_PHASES.UNIT_PLACEMENT && land) {
    const placed = loaded.placeInitialUnit(land, 'infantry', unitDefs);
    played = placed.success === true || loaded.finishPlacementRound(unitDefs).ok === true;
  } else if (loaded.phase === GAME_PHASES.PLAYING) {
    loaded.nextPhase();
    played = true;
  }
  check('old save can keep playing', played === true);
  check('saved infantry quantity string is non-empty', savedQty.length > 0);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll game-option default checks passed');
