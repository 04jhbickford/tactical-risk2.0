// V2.81.57-unified.26 — one tactical bomber in the setup tray when the option is on.
// Run: node tools/test-tacbomber-setup.mjs

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
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES, RISK_STARTING_UNITS } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { scaleStartingUnits } = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { registerBoard } = await import(pathToFileURL(join(root, 'src/map/boardCatalog.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

const unitDefs = readJson('data/units.json');
const classic = {
  setup: readJson('data/setup.json'),
  territories: readJson('data/territories.json'),
  continents: readJson('data/continents.json'),
};
const pacific = {
  setup: readJson('data/maps/pacific/setup.json'),
  territories: readJson('data/maps/pacific/territories.json'),
  continents: readJson('data/maps/pacific/continents.json'),
};
registerBoard('classic', classic);
registerBoard('pacific', pacific);

function seats(setup, count, { neutral = false } = {}) {
  return setup.risk.factions.slice(0, count).map((faction, index) => ({
    ...faction,
    isAI: index > 0,
    aiDifficulty: 'easy',
    neutral: neutral && faction.id === 'Neutral',
  }));
}

function boot(map, gameOptions, count = 2) {
  const pack = map === 'pacific' ? pacific : classic;
  const gs = new GameState(pack.setup, pack.territories, pack.continents);
  gs.unitDefs = unitDefs;
  gs.initGame('risk', seats(pack.setup, count), {
    mapId: map,
    gameOptions,
  });
  return gs;
}

function poolRows(gs, playerId) {
  return (gs.getUnitsToPlace(playerId) || []).map((row) => ({
    type: row.type,
    quantity: row.quantity,
  }));
}

function expectedPool(army, tactical) {
  const scaled = scaleStartingUnits(RISK_STARTING_UNITS, army);
  const land = tactical
    ? scaled.land.concat([{ type: 'tacticalBomber', quantity: 1 }])
    : scaled.land;
  return [...land, ...scaled.naval];
}

function mapCount(gs, type, owner = null) {
  let total = 0;
  for (const stack of Object.values(gs.units || {})) {
    for (const unit of stack || []) {
      if (owner && unit.owner !== owner) continue;
      if (unit.type === type) total += Number(unit.quantity) || 0;
      for (const air of unit.aircraft || []) {
        if (air.type === type && (!owner || air.owner === owner)) {
          total += Number(air.quantity) || 1;
        }
      }
    }
  }
  return total;
}

function historicalTacCount(setup) {
  let total = 0;
  for (const placements of Object.values(setup.pacific1940?.unitPlacements || {})) {
    for (const row of placements || []) {
      if (row.type === 'tacticalBomber') total += Number(row.quantity) || 0;
    }
  }
  return total;
}

console.log('=== tactical bomber setup ===');
check('stamp is unified.26', GAME_VERSION === 'V2.81.57-unified.26');
check('schema stays 11', SCHEMA_VERSION === 11);
check('default starting defs still omit tactical bombers',
  ![...RISK_STARTING_UNITS.land, ...RISK_STARTING_UNITS.naval]
    .some((row) => row.type === 'tacticalBomber'));

for (const map of ['classic', 'pacific']) {
  for (const territorySetup of ['random', 'draft']) {
    for (const army of ['standard', 'light', 'heavy']) {
      const off = boot(map, { territorySetup, startingArmy: army, tacticalBombers: false });
      const on = boot(map, { territorySetup, startingArmy: army, tacticalBombers: true });
      const label = `${map} ${territorySetup} ${army}`;
      const wantOff = expectedPool(army, false);
      const wantOn = expectedPool(army, true);
      for (const player of off.players) {
        check(`${label} OFF pool matches main`,
          JSON.stringify(poolRows(off, player.id)) === JSON.stringify(wantOff));
        check(`${label} ON pool is main plus one tactical bomber`,
          JSON.stringify(poolRows(on, player.id)) === JSON.stringify(wantOn));
        check(`${label} ON tray has exactly one tactical bomber`,
          poolRows(on, player.id).filter((row) => row.type === 'tacticalBomber')
            .reduce((sum, row) => sum + row.quantity, 0) === 1);
      }
      check(`${label} OFF map has no tactical bomber`, mapCount(off, 'tacticalBomber') === 0);
      check(`${label} ON map has no tactical bomber before placement`, mapCount(on, 'tacticalBomber') === 0);
    }
  }
}

{
  const on = boot('classic', { territorySetup: 'random', tacticalBombers: true }, 2);
  const leftOut = classic.setup.risk.factions[2].id;
  check('a faction that is not playing gets no tactical bomber',
    on.unitsToPlace[leftOut] == null && mapCount(on, 'tacticalBomber', leftOut) === 0);
  check('Neutral is not given a setup bomber',
    on.unitsToPlace.Neutral == null && mapCount(on, 'tacticalBomber', 'Neutral') === 0);
}

{
  const packed = historicalTacCount(pacific.setup);
  const on = boot('pacific', { territorySetup: 'pacific1940', tacticalBombers: true }, 5);
  const off = boot('pacific', { territorySetup: 'pacific1940', tacticalBombers: false }, 5);
  const poolTac = on.players.reduce((sum, player) => (
    sum + poolRows(on, player.id).filter((row) => row.type === 'tacticalBomber')
      .reduce((n, row) => n + row.quantity, 0)
  ), 0);
  check('Pacific 1940 has no placement tray to add a bomber to', poolTac === 0);
  check('Pacific 1940 ON keeps the historical bombers and does not add one per power',
    mapCount(on, 'tacticalBomber') === packed && packed > 0);
  check('Pacific 1940 OFF still converts those bombers to fighters',
    mapCount(off, 'tacticalBomber') === 0);
  check('Neutral owns no tactical bomber in Pacific 1940',
    mapCount(on, 'tacticalBomber', 'Neutral') === 0);
}

{
  const gs = new GameState(classic.setup, classic.territories, classic.continents);
  gs.initGame('classic', seats(classic.setup, 5), { mapId: 'classic' });
  const poolTac = (gs.players || []).reduce((sum, player) => (
    sum + poolRows(gs, player.id).filter((row) => row.type === 'tacticalBomber')
      .reduce((n, row) => n + row.quantity, 0)
  ), 0);
  check('Classic 1942 historical setup has no tray and no tactical bomber',
    gs.phase === GAME_PHASES.PLAYING && poolTac === 0 && mapCount(gs, 'tacticalBomber') === 0);
}

function ownedLand(gs, playerId) {
  return gs.getPlayerTerritories(playerId)
    .filter((name) => gs.territoryByName[name] && !gs.territoryByName[name].isWater)
    .sort();
}

function openSea(gs, playerId) {
  const found = [];
  for (const name of ownedLand(gs, playerId)) {
    for (const conn of gs.territoryByName[name].connections || []) {
      const next = gs.territoryByName[conn];
      if (!next?.isWater) continue;
      const blocked = (gs.units[conn] || []).some((unit) => unit.owner && unit.owner !== playerId);
      if (!blocked) found.push(conn);
    }
  }
  found.sort();
  return found[0] || null;
}

function placeCapitals(gs) {
  let guard = 0;
  while (gs.phase === GAME_PHASES.CAPITAL_PLACEMENT && guard < 20) {
    guard += 1;
    const land = ownedLand(gs, gs.currentPlayer.id)[0];
    if (!land || gs.placeCapital(land) !== true) return false;
  }
  return gs.phase === GAME_PHASES.UNIT_PLACEMENT;
}

function placeWave(gs) {
  const player = gs.currentPlayer;
  const limit = gs.getUnitsPerRoundLimit();
  let placed = 0;
  while (placed < limit) {
    const next = gs.getKnownUnitsToPlace(player.id, unitDefs).find((row) => row.quantity > 0);
    if (!next) break;
    const def = unitDefs[next.type];
    const where = def?.isSea ? openSea(gs, player.id) : ownedLand(gs, player.id)[0];
    if (!where) break;
    const result = gs.placeInitialUnit(where, next.type, unitDefs);
    if (!result?.success) return { ok: false, error: result?.error, type: next.type, where };
    placed += 1;
  }
  const done = gs.finishPlacementRound(unitDefs);
  return { ok: done?.ok === true, placed, phase: gs.phase, reason: done?.reason };
}

function finishSetup(gs) {
  if (gs.phase === GAME_PHASES.TERRITORY_DRAFT) {
    let guard = 0;
    while (gs.phase === GAME_PHASES.TERRITORY_DRAFT && guard < 5000) {
      guard += 1;
      const choice = gs.landTerritories
        .map((territory) => territory.name)
        .filter((name) => !gs.getOwner(name))
        .sort()[0];
      if (!choice || gs.pickDraftTerritory(choice) !== true) break;
    }
  }
  if (!placeCapitals(gs) && gs.phase !== GAME_PHASES.UNIT_PLACEMENT && gs.phase !== GAME_PHASES.PLAYING) {
    return { ok: false, phase: gs.phase, reason: 'capitals' };
  }
  let guard = 0;
  while (gs.phase === GAME_PHASES.UNIT_PLACEMENT && guard < 500) {
    guard += 1;
    const wave = placeWave(gs);
    if (!wave.ok) return { ok: false, ...wave, guard };
  }
  const leftover = gs.players.reduce((sum, player) => sum + gs.getTotalUnitsToPlace(player.id, unitDefs), 0);
  return {
    ok: gs.phase === GAME_PHASES.PLAYING && leftover === 0,
    phase: gs.phase,
    turnPhase: gs.turnPhase,
    leftover,
  };
}

for (const map of ['classic', 'pacific']) {
  for (const territorySetup of ['random', 'draft']) {
    const real = Math.random;
    let seed = map === 'classic' ? 0x25c1a55 : 0x25fac1;
    Math.random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let done;
    let on;
    try {
      on = boot(map, { territorySetup, tacticalBombers: true }, 2);
      done = finishSetup(on);
    } finally {
      Math.random = real;
    }
    check(`${map} ${territorySetup} placement empties the tray and advances`,
      done.ok === true
      && done.turnPhase === TURN_PHASES.DEVELOP_TECH
      && mapCount(on, 'tacticalBomber') === on.players.length);
  }
}

{
  const real = Math.random;
  let seed = 0x25a11;
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let placed;
  let reloadedQty;
  let after;
  try {
    const gs = boot('classic', { territorySetup: 'random', tacticalBombers: true }, 2);
    placeCapitals(gs);
    const before = poolRows(gs, gs.currentPlayer.id)
      .find((row) => row.type === 'tacticalBomber')?.quantity;
    const saved = gs.toJSON();
    const loaded = new GameState(classic.setup, classic.territories, classic.continents);
    loaded.unitDefs = unitDefs;
    loaded.loadFromJSON(saved);
    reloadedQty = poolRows(loaded, loaded.currentPlayer.id)
      .find((row) => row.type === 'tacticalBomber')?.quantity;
    const where = ownedLand(loaded, loaded.currentPlayer.id)[0];
    placed = loaded.placeInitialUnit(where, 'tacticalBomber', unitDefs);
    after = poolRows(loaded, loaded.currentPlayer.id)
      .find((row) => row.type === 'tacticalBomber')?.quantity || 0;
    check('mid-setup save still has the bomber in the tray', before === 1 && reloadedQty === 1);
  } finally {
    Math.random = real;
  }
  check('reloaded bomber is still placeable and leaves the tray',
    placed?.success === true && after === 0);
}

{
  const real = Math.random;
  let seed = 0x0ff;
  Math.random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let loaded;
  let fresh;
  try {
    fresh = boot('classic', { territorySetup: 'random' }, 2);
    const saved = fresh.toJSON();
    delete saved.gameOptions.tacticalBombers;
    loaded = new GameState(classic.setup, classic.territories, classic.continents);
    loaded.loadFromJSON(saved);
  } finally {
    Math.random = real;
  }
  check('a legacy save without the option field loads OFF', loaded.gameOptions.tacticalBombers === false);
  check('that legacy save does not gain a tactical bomber',
    loaded.players.every((player) => JSON.stringify(poolRows(loaded, player.id)) === JSON.stringify(poolRows(fresh, player.id)))
    && mapCount(loaded, 'tacticalBomber') === 0);
}

{
  const gs = boot('pacific', { territorySetup: 'random', tacticalBombers: true }, 2);
  const saved = gs.toJSON();
  check('an ON save keeps schema 11 and the option',
    saved.version === 11 && saved.gameOptions.tacticalBombers === true);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall tactical bomber setup checks passed');
