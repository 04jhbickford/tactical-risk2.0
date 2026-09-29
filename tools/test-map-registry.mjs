// V2.81.57-unified.30 — map registry, non-wrap camera, mapId, converter identity.
// Run: node tools/test-map-registry.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem(key) { return mem.has(key) ? mem.get(key) : null; },
    setItem(key, value) { mem.set(key, String(value)); },
    removeItem(key) { mem.delete(key); },
  };
}
globalThis.devicePixelRatio = 1;

const { GAME_VERSION, SCHEMA_VERSION } = await import(new URL('../src/version.js', import.meta.url));
const {
  CLASSIC_MAP_ID,
  UNKNOWN_MAP_MESSAGE,
  activateMap,
  getActiveMap,
  getMap,
  listPickerMaps,
  loadMapDecision,
  mapIdFromDoc,
  mapsAllRequested,
  reliefEnabledForClient,
  resolveMapId,
} = await import(new URL('../src/map/mapRegistry.js', import.meta.url));
const cameraMod = await import(new URL('../src/map/camera.js', import.meta.url));
const { applyMapMetrics, Camera } = cameraMod;
const { GameState, LAND_BRIDGES } = await import(new URL('../src/state/gameState.js', import.meta.url));
const { isIslandCapital } = await import(new URL('../src/ai/islandNavy.js', import.meta.url));
const { convertMap } = await import(new URL('./convert-map.mjs', import.meta.url));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

console.log('=== map registry ===');
activateMap('classic');
applyMapMetrics(getActiveMap());
const classic = getMap('classic');
check('stamp is unified.26', GAME_VERSION === 'V2.81.57-unified.30');
check('schema stays 11', SCHEMA_VERSION === 11);
check('classic id and size', classic.id === 'classic' && classic.width === 3500 && classic.height === 2000);
check('classic wraps and uses the existing data files',
  classic.scrollWrapX === true
  && classic.data.territories === 'data/territories.json'
  && classic.data.continents === 'data/continents.json'
  && classic.data.setup === 'data/setup.json'
  && classic.data.units === 'data/units.json');
check('classic tiles stay eager png',
  classic.tiles.cols === 14 && classic.tiles.rows === 8
  && classic.tiles.format === 'png' && classic.tiles.lazy === false
  && classic.tiles.reliefPhone === true
  && classic.tiles.baseDir === '../map/baseTiles');
check('classic victory mode and 16 bridges',
  classic.victoryMode === 'classic' && classic.landBridges.length === 16
  && LAND_BRIDGES.length === 16 && classic.landBridges === LAND_BRIDGES);
check('nation table still names Germany and the UK',
  classic.nationNames.germans.name === 'Germany'
  && classic.nationNames.british.name === 'UK');
check('default picker lists classic and pacific',
  listPickerMaps('').map((map) => map.id).join(',') === 'classic,pacific'
  && listPickerMaps('').every((map) => map.playable === true && map.released === true));
check('?maps=all still lists both playable maps',
  mapsAllRequested('?maps=all') === true
  && listPickerMaps('?maps=all').map((map) => map.id).join(',') === 'classic,pacific');
check('pacific does not wrap and turns relief off on phones',
  getMap('pacific').scrollWrapX === false
  && getMap('pacific').tiles.format === 'webp'
  && getMap('pacific').tiles.lazy === true
  && reliefEnabledForClient(getMap('pacific'), { coarse: true, width: 390 }) === false
  && reliefEnabledForClient(classic, { coarse: true, width: 390 }) === true);

const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const byName = Object.fromEntries(territories.map((t) => [t.name, t]));
for (const name of classic.islandCapitalHints.connected) {
  check(`${name} is not an island capital`, isIslandCapital(byName, name, classic.landBridges) === false);
}
for (const name of classic.islandCapitalHints.seaLocked) {
  check(`${name} is an island capital`, isIslandCapital(byName, name, classic.landBridges) === true);
}

console.log('=== non-wrap camera ===');
{
  applyMapMetrics({ width: 800, height: 400, scrollWrapX: false });
  const canvas = { width: 200, height: 200 };
  const camera = new Camera(canvas);
  camera.zoom = 1;
  camera.x = 10;
  camera._clamp();
  check('non-wrap clamps a center left of the board', camera.x === 100);
  camera.x = 900;
  camera._clamp();
  check('non-wrap clamps a center past the right edge', camera.x === 700);
  camera.panTo(-40, 10);
  let guard = 0;
  while (camera.update() && guard < 80) guard += 1;
  check('non-wrap pan target stays inside the board', camera.x >= 100 && camera.x <= 700);
  check('non-wrap metrics are live', cameraMod.MAP_WIDTH === 800 && cameraMod.MAP_HEIGHT === 400 && cameraMod.SCROLL_WRAP_X === false);

  applyMapMetrics(getMap('classic'));
  const wrapped = new Camera(canvas);
  wrapped.zoom = 1;
  wrapped.x = -10;
  wrapped._clamp();
  check('classic still does not hard-clamp a small negative x', wrapped.x === -10);
  check('classic metrics restored', cameraMod.MAP_WIDTH === 3500 && cameraMod.SCROLL_WRAP_X === true);
  activateMap(CLASSIC_MAP_ID);
}

console.log('=== mapId ===');
{
  const setup = JSON.parse(readFileSync(join(root, 'data/setup.json'), 'utf8'));
  const continents = JSON.parse(readFileSync(join(root, 'data/continents.json'), 'utf8'));
  const players = setup.risk.factions.slice(0, 2).map((faction) => ({ ...faction, isAI: true, aiDifficulty: 'easy' }));
  const gs = new GameState(setup, territories, continents);
  gs.initGame('risk', players, { gameOptions: { territorySetup: 'random' } });
  const saved = gs.toJSON();
  check('new game stamps classic', saved.mapId === 'classic' && saved.version === 11);
  delete saved.mapId;
  const loaded = new GameState(setup, territories, continents);
  loaded.loadFromJSON(saved);
  check('missing mapId loads as classic', loaded.mapId === 'classic');
  check('doc without mapId is classic', mapIdFromDoc({ state: {} }).mapId === 'classic' && mapIdFromDoc({}).ok === true);
  check('unknown mapId is refused', resolveMapId('europe1940').ok === false
    && resolveMapId('europe1940').message === UNKNOWN_MAP_MESSAGE);
  const decision = loadMapDecision('no-such-map');
  check('load decision names the unknown map', decision.ok === false && decision.code === 'unknown_map');
  let refused = false;
  try {
    loaded.loadFromJSON({ ...saved, mapId: 'europe1940' });
  } catch (err) {
    refused = err?.code === 'unknown_map' && err.message === UNKNOWN_MAP_MESSAGE;
  }
  check('loadFromJSON throws the refresh sentence', refused);
  check('state was not replaced by the unknown save', loaded.mapId === 'classic');
  check('pacific is known and loadable',
    resolveMapId('pacific').ok === true && loadMapDecision('pacific').ok === true
    && loadMapDecision('pacific').mapId === 'pacific');
  check('a game doc mapId is read before a missing state id',
    mapIdFromDoc({ mapId: 'pacific', state: {} }).mapId === 'pacific');
}

console.log('=== converter ===');
{
  const result = convertMap('classic', { log() {} });
  const territoriesBytes = readFileSync(join(root, 'data/territories.json'));
  const continentsBytes = readFileSync(join(root, 'data/continents.json'));
  check('territories.json is byte-identical',
    Buffer.from(result.territoriesJson).equals(territoriesBytes));
  check('continents.json is byte-identical',
    Buffer.from(result.continentsJson).equals(continentsBytes));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nmap registry checks passed');
