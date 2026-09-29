// V2.81.57-unified.24 — Pacific board, historical setup, victory cities.
// Run: node tools/test-pacific.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activateMap, getMap } from '../src/map/mapRegistry.js';
import { registerBoard } from '../src/map/boardCatalog.js';
import { PACIFIC_VICTORY_CITIES } from '../src/map/pacificVictory.js';
import { isIslandCapital } from '../src/ai/islandNavy.js';
import { GameState, GAME_PHASES } from '../src/state/gameState.js';
import { buildFlushPayload } from '../src/stats/diceTracker.js';
import { buildPhaseSnapshot } from '../src/multiplayer/phaseSnapshot.js';
import { formatPingHeader, powerWord } from '../src/multiplayer/discordTurnPing.js';
import { convertMap } from './convert-map.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem(key) { return mem.has(key) ? mem.get(key) : null; },
    setItem(key, value) { mem.set(key, String(value)); },
    removeItem(key) { mem.delete(key); },
  };
}

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

function playersFrom(setup) {
  return setup.risk.factions.map((faction) => ({
    ...faction,
    isAI: true,
    aiDifficulty: 'easy',
  }));
}

function freshPacific(options = {}) {
  const setup = readJson('data/maps/pacific/setup.json');
  const territories = readJson('data/maps/pacific/territories.json');
  const continents = readJson('data/maps/pacific/continents.json');
  const gs = new GameState(setup, territories, continents);
  gs.initGame('risk', playersFrom(setup), {
    mapId: 'pacific',
    gameOptions: { territorySetup: 'pacific1940', ...options },
  });
  return gs;
}

function unitTotals(gs) {
  const totals = {};
  for (const stack of Object.values(gs.units)) {
    for (const unit of stack || []) {
      totals[unit.type] = (totals[unit.type] || 0) + (unit.quantity || 0);
    }
  }
  return totals;
}

function finishRound(gs) {
  const steps = gs.players.length;
  for (let i = 0; i < steps; i += 1) gs.nextTurn();
}

console.log('=== pacific data ===');
{
  const territories = readJson('data/maps/pacific/territories.json');
  const continents = readJson('data/maps/pacific/continents.json');
  const setup = readJson('data/maps/pacific/setup.json');
  const land = territories.filter((t) => !t.isWater);
  const sea = territories.filter((t) => t.isWater);
  check('149 territories and 63 sea zones', territories.length === 149 && sea.length === 63);
  check('86 land after the three boxes are dropped', land.length === 86);
  const himalayas = territories.find((t) => t.name === 'Himalayas');
  check('Himalayas is impassable and unconnected',
    himalayas?.impassable === true
    && himalayas.production === 0
    && Array.isArray(himalayas.connections)
    && himalayas.connections.length === 0);
  const converted = convertMap('pacific', { log() {} });
  check('source XML is 89 land and 63 sea before the box drop',
    converted.sourceLand === 89 && converted.sourceSea === 63 && converted.land === 86 && converted.sea === 63);

  const seen = new Map();
  for (const continent of continents) {
    check(`${continent.name} bonus is territory count times 3`,
      continent.bonus === continent.territories.length * 3);
    for (const name of continent.territories) {
      seen.set(name, (seen.get(name) || 0) + 1);
    }
  }
  const passable = land.filter((t) => !t.impassable).map((t) => t.name);
  check('every passable land is in one continent',
    passable.every((name) => seen.get(name) === 1) && seen.size === passable.length);
  check('Himalayas is in no continent', !seen.has('Himalayas'));

  const owners = setup.pacific1940.territoryOwners;
  check('Dutch land is ANZAC',
    ['Celebes', 'Java', 'Dutch New Guinea', 'Sumatra'].every((name) => owners[name] === 'ANZAC'));
  check('French land is British',
    ['French Indo China', 'New Hebrides'].every((name) => owners[name] === 'British'));
  check('Russian land stays Neutral',
    ['Soviet Far East', 'Moscow', 'Amur'].every((name) => owners[name] === 'Neutral'));
  check('turn order is Japan, USA, China, UK, ANZAC',
    setup.turnOrder.join(',') === 'Japanese,Americans,Chinese,British,ANZAC');
  check('five factions and the one-line Russian switch',
    setup.risk.factions.map((f) => f.id).join(',') === 'Japanese,Americans,Chinese,British,ANZAC'
    && setup.russianLand === 'neutral');

  const placed = {};
  for (const rows of Object.values(setup.pacific1940.unitPlacements)) {
    for (const row of rows) placed[row.type] = (placed[row.type] || 0) + row.quantity;
  }
  check('historical placement totals',
    placed.infantry === 98 && placed.artillery === 11 && placed.armour === 1
    && placed.fighter === 22 && placed.tacticalBomber === 10 && placed.bomber === 2
    && placed.aaGun === 12 && placed.factory === 5 && placed.submarine === 4
    && placed.destroyer === 9 && placed.carrier === 4 && placed.cruiser === 6
    && placed.battleship === 4 && placed.transport === 7);
  check('airfields and harbours were dropped',
    setup.pacific1940.notes.dropped.airfield === 11
    && setup.pacific1940.notes.dropped.harbour === 11);
  check('Szechwan received the capital factory',
    setup.pacific1940.notes.capitalFactoriesAdded.join(',') === 'Szechwan');
}

console.log('=== pacific setup ===');
{
  const gs = freshPacific();
  check('mapId is pacific and the phase is playing',
    gs.mapId === 'pacific' && gs.phase === GAME_PHASES.PLAYING);
  check('historical turn order is fixed',
    gs.players.map((p) => p.id).join(',') === 'Japanese,Americans,Chinese,British,ANZAC');
  check('capitals',
    gs.playerState.Japanese.capitalTerritory === 'Japan'
    && gs.playerState.Americans.capitalTerritory === 'Western United States'
    && gs.playerState.British.capitalTerritory === 'India'
    && gs.playerState.ANZAC.capitalTerritory === 'New South Wales'
    && gs.playerState.Chinese.capitalTerritory === 'Szechwan'
    && gs.territoryState.Japan.isCapital === true
    && gs.territoryState.Szechwan.isCapital === true);
  check('starting IPC uses the neutral-Russian table',
    gs.playerState.Japanese.ipcs === 44
    && gs.playerState.Americans.ipcs === 20
    && gs.playerState.Chinese.ipcs === 21
    && gs.playerState.British.ipcs === 29
    && gs.playerState.ANZAC.ipcs === 41);
  const live = unitTotals(gs);
  check('tactical bombers default to fighters',
    live.tacticalBomber == null && live.fighter === 32 && live.factory === 5 && live.infantry === 98);
  check('Himalayas is not a land territory',
    !gs.landTerritories.some((t) => t.name === 'Himalayas'));
  check('neutral garrisons are one infantry',
    ['Moscow', 'Soviet Far East', 'Ulaanbaatar'].every((name) => {
      const stack = gs.units[name] || [];
      return stack.length === 1 && stack[0].type === 'infantry' && stack[0].owner === 'Neutral' && stack[0].quantity === 1;
    }));

  const withTactical = freshPacific({ tacticalBombers: true });
  const tactical = unitTotals(withTactical);
  check('tactical bombers stay when the option is on',
    tactical.tacticalBomber === 10 && tactical.fighter === 22);
}

console.log('=== pacific victory ===');
{
  const cities = [...PACIFIC_VICTORY_CITIES];
  check('eight victory cities', cities.length === 8 && cities[0] === 'Japan');

  const axis = freshPacific();
  for (const name of cities) axis.territoryState[name].owner = 'Neutral';
  for (const name of ['Japan', 'Kiangsu', 'Kwangtung', 'Philippines', 'India', 'New South Wales']) {
    axis.territoryState[name].owner = 'Japanese';
  }
  axis._checkVictoryConditions();
  check('six cities including Japan do not win on capture', axis.gameOver !== true);
  finishRound(axis);
  check('Axis wins at the end of the round',
    axis.gameOver === true && axis.winner === 'Axis');

  const missingJapan = freshPacific();
  for (const name of cities) missingJapan.territoryState[name].owner = 'Neutral';
  for (const name of ['Kiangsu', 'Kwangtung', 'Philippines', 'India', 'New South Wales', 'Hawaiian Islands']) {
    missingJapan.territoryState[name].owner = 'Japanese';
  }
  missingJapan.territoryState.Japan.owner = 'Neutral';
  finishRound(missingJapan);
  check('six cities without Japan is not a win', missingJapan.gameOver !== true);

  const allies = freshPacific();
  allies.territoryState.Japan.owner = 'British';
  allies._checkVictoryConditions();
  check('Allies holding Japan do not win on capture', allies.gameOver !== true);
  finishRound(allies);
  check('Allies win when they hold Japan at round end',
    allies.gameOver === true && allies.winner === 'Allies');
}

console.log('=== classic save and mapId ===');
{
  const setup = readJson('data/setup.json');
  const territories = readJson('data/territories.json');
  const continents = readJson('data/continents.json');
  const classicPlayers = setup.risk.factions.slice(0, 2).map((faction) => ({
    ...faction, isAI: true, aiDifficulty: 'easy',
  }));
  const classic = new GameState(setup, territories, continents);
  classic.initGame('risk', classicPlayers, { gameOptions: { territorySetup: 'random' } });
  const oldSave = classic.toJSON();
  delete oldSave.mapId;
  const loadedClassic = new GameState(setup, territories, continents);
  loadedClassic.loadFromJSON(oldSave);
  check('a Classic save with no mapId stays classic',
    loadedClassic.mapId === 'classic' && loadedClassic.territoryByName.Germany);

  const pacific = freshPacific();
  const saved = pacific.toJSON();
  check('a Pacific save writes mapId pacific', saved.mapId === 'pacific' && saved.version === 11);
  registerBoard('pacific', {
    territories: readJson('data/maps/pacific/territories.json'),
    continents: readJson('data/maps/pacific/continents.json'),
    setup: readJson('data/maps/pacific/setup.json'),
  });
  const roundTrip = new GameState(setup, territories, continents);
  roundTrip.loadFromJSON(saved);
  check('mapId pacific round-trips',
    roundTrip.mapId === 'pacific' && roundTrip.territoryByName['Western United States']
    && !roundTrip.territoryByName.Germany);

  const dice = buildFlushPayload(pacific, []);
  check('a dice batch carries mapId pacific', dice.mapId === 'pacific');

  const snapshot = await buildPhaseSnapshot(pacific, { seq: 1, ts: 1, clientVersion: 'V2.81.57-unified.24' });
  check('a phase snapshot carries mapId pacific', snapshot.mapId === 'pacific' && snapshot.checksum);
  const dir = mkdtempSync(join(tmpdir(), 'pacific-audit-'));
  const fixture = join(dir, 'pacific.json');
  writeFileSync(fixture, JSON.stringify({ gameId: 'PACIFIC', snapshots: [snapshot], events: [] }));
  const audited = execFileSync(process.execPath, ['tools/audit-game.mjs', '--fixture', fixture], {
    cwd: root,
    encoding: 'utf8',
  });
  check('audit-game accepts the Pacific fixture', audited.includes('no mismatches'));
}

console.log('=== island hints and turn ping ===');
{
  const pacific = getMap('pacific');
  const byName = Object.fromEntries(readJson('data/maps/pacific/territories.json').map((t) => [t.name, t]));
  for (const name of pacific.islandCapitalHints.connected) {
    check(`${name} is connected`, isIslandCapital(byName, name, pacific.landBridges) === false);
  }
  for (const name of pacific.islandCapitalHints.seaLocked) {
    check(`${name} is sea-locked`, isIslandCapital(byName, name, pacific.landBridges) === true);
  }
  activateMap('pacific');
  check('turn ping uses the Pacific nation table',
    powerWord('Chinese') === 'China'
    && powerWord('ANZAC') === 'ANZAC'
    && formatPingHeader({ displayName: 'Ada', power: 'ANZAC', phase: 'Purchase' }) === 'Ada - ANZAC Purchase Phase'
    && formatPingHeader({ displayName: 'Chinese', power: 'Chinese', phase: 'Purchase' }) === 'China Purchase Phase');
  activateMap('classic');
  check('Classic nation table is restored', powerWord('Germans') === 'Germany' && powerWord('ANZAC') === 'ANZAC');
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\npacific checks passed');
