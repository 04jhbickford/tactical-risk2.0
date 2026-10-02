// Optional Classic rule: Extra Pacific bridges. Off unless the host turns
// it on. Pacific's own links and the Land bridges switch stay as they are.
// Run: node tools/test-extra-pacific-bridges.mjs

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
const { GAME_VERSION, SCHEMA_VERSION, compareGameVersions, compatClientVersion } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES, LAND_BRIDGES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  DEFAULT_GAME_OPTIONS,
  describe,
  isStandardRules,
  normalizeGameOptions,
  restoreProtectedGameOptions,
} = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { renderGameOptionsPanel } = await import(pathToFileURL(join(root, 'src/ui/gameOptionsPanel.js')));
const { getMap } = await import(pathToFileURL(join(root, 'src/map/mapRegistry.js')));

const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

const PACIFIC_LINKS = [
  ['Japan', 'Iwo Jima'],
  ['Japan', 'Midway'],
  ['Iwo Jima', 'Wake Island'],
  ['Iwo Jima', 'Philippines'],
  ['Philippines', 'Caroline Islands'],
  ['Philippines', 'Solomon Islands'],
  ['Philippines', 'New Guinea'],
  ['Philippines', 'French Indo China'],
  ['Solomon Islands', 'Queensland'],
  ['Solomon Islands', 'New Britain'],
  ['Wake Island', 'Western United States'],
  ['Wake Island', 'Hawaiian Islands'],
  ['Hawaiian Islands', 'Midway'],
  ['Hawaiian Islands', 'Mexico'],
];

const ADDED = [
  ['Japan', 'Midway'],
  ['Philippines', 'Caroline Islands'],
  ['Philippines', 'Solomon Islands'],
  ['Philippines', 'New Guinea'],
  ['Philippines', 'French Indo China'],
  ['Wake Island', 'Hawaiian Islands'],
  ['Hawaiian Islands', 'Midway'],
  ['Hawaiian Islands', 'Mexico'],
];

const LEFT_OUT = [
  ['Japan', 'Iwo Jima'],
  ['Iwo Jima', 'Wake Island'],
  ['Iwo Jima', 'Philippines'],
  ['Solomon Islands', 'Queensland'],
  ['Solomon Islands', 'New Britain'],
  ['Wake Island', 'Western United States'],
];

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

function pairKey(pair) {
  return pair[0] < pair[1] ? `${pair[0]}|${pair[1]}` : `${pair[1]}|${pair[0]}`;
}

function samePairs(actual, expected) {
  const a = (actual || []).map(pairKey).sort();
  const b = expected.map(pairKey).sort();
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

function playing(options) {
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.mapId = 'classic';
  gs.players = [{ id: 'Japanese', name: 'Japan' }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  gs.gameOptions = normalizeGameOptions({ landBridges: true, ...options });
  const owned = [
    'Japan', 'Midway', 'Hawaiian Islands', 'Wake Island', 'Mexico',
    'Philippines', 'Caroline Islands', 'Solomon Islands', 'New Guinea',
    'French Indo China', 'Alaska', 'Soviet Far East', 'West US',
  ];
  gs.territoryState = Object.fromEntries(owned.map((name) => [name, { owner: 'Japanese' }]));
  gs.playerState = {
    Japanese: { ipcs: 20, capitalTerritory: 'Japan', hasPlacedCapital: true },
  };
  gs.units = {
    Japan: [
      { type: 'infantry', quantity: 3, owner: 'Japanese' },
      { type: 'armour', quantity: 1, owner: 'Japanese' },
      { type: 'destroyer', quantity: 1, owner: 'Japanese' },
    ],
  };
  return gs;
}

function qty(gs, territory, type) {
  return (gs.units[territory] || [])
    .filter((unit) => unit.type === type && unit.owner === 'Japanese')
    .reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
}

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  check('display stamp is V2.81.57-unified.39', GAME_VERSION === 'V2.81.57-unified.39');
  check('schema stays 11', SCHEMA_VERSION === 11);
  check('game docs write V2.82-unified.39', compatClientVersion() === 'V2.82-unified.39');
  check('a V2.82-unified.38 doc does not prompt this tab',
    compareGameVersions('V2.82-unified.38', GAME_VERSION) < 0);
  check('a V2.82-unified.40 doc prompts this tab',
    compareGameVersions('V2.82-unified.40', GAME_VERSION) > 0);
  check('our own V2.82-unified.39 doc does not prompt',
    compareGameVersions('V2.82-unified.39', GAME_VERSION) === 0);
  check('index.html carries the display stamp',
    html.includes('content="V2.81.57-unified.39"')
    && html.includes("window.__TR_GAME_VERSION = 'V2.81.57-unified.39'")
    && html.includes("var LOCKED = 'V2.81.57-unified.39'")
    && html.includes('style.css?v=V2.81.57-unified.39')
    && html.includes('src/main.js?v=V2.81.57-unified.39'));
}

console.log('=== lobby ===');
{
  check('extra Pacific bridges default off',
    DEFAULT_GAME_OPTIONS.extraPacificBridges === false
    && normalizeGameOptions(null).extraPacificBridges === false
    && normalizeGameOptions({}).extraPacificBridges === false
    && normalizeGameOptions({ landBridges: false }).extraPacificBridges === false);
  check('only an explicit true turns the option on',
    normalizeGameOptions({ extraPacificBridges: true }).extraPacificBridges === true
    && normalizeGameOptions({ extraPacificBridges: false }).extraPacificBridges === false);
  check('off is still standard rules', isStandardRules(null) === true && describe(null) === 'Standard rules');
  check('on is named apart from the land-bridges switch',
    describe({ extraPacificBridges: true }) === 'Custom: extra Pacific bridges'
    && describe({ landBridges: false }) === 'Custom: no land bridges'
    && describe({ landBridges: false, extraPacificBridges: true })
      === 'Custom: no land bridges, extra Pacific bridges');
  check('land bridges still default on', normalizeGameOptions(null).landBridges === true);

  const classic = renderGameOptionsPanel(null, { mapId: 'classic' });
  check('Classic lobby names the option Extra Pacific bridges',
    classic.includes('>Extra Pacific bridges<')
    && classic.includes('data-go="extraPacificBridges"')
    && classic.includes('>Land bridges<'));
  const pacific = renderGameOptionsPanel(
    { extraPacificBridges: true },
    { mapId: 'pacific' },
  );
  check('Pacific lobby does not show this switch',
    !pacific.includes('Extra Pacific bridges')
    && pacific.includes('>Land bridges<')
    && pacific.includes('data-kept-extra="1"'));
}

console.log('=== pairs ===');
{
  const pacific = getMap('pacific').landBridges;
  check('Pacific links are the same fourteen', samePairs(pacific, PACIFIC_LINKS) && pacific.length === 14);
  check('Classic land-bridge table is still 16',
    LAND_BRIDGES.length === 16 && getMap('classic').landBridges === LAND_BRIDGES);

  const byName = Object.fromEntries(territories.map((row) => [row.name, row]));
  for (const [left, right] of ADDED) {
    check(`${left} and ${right} are Classic land`,
      byName[left] && !byName[left].isWater && byName[right] && !byName[right].isWater);
  }
  for (const pair of LEFT_OUT) {
    const missing = pair.filter((name) => !byName[name]);
    check(`${pair[0]}–${pair[1]} is left out`, missing.length > 0, missing.join(', '));
  }
  check('West US is not treated as Western United States',
    !!byName['West US'] && !byName['Western United States']);

  const off = playing({ extraPacificBridges: false });
  check('off keeps the original 16 and no extra pair',
    off.activeLandBridges().length === 16
    && off.hasLandBridge('Alaska', 'Soviet Far East') === true
    && off.hasLandBridge('Japan', 'Midway') === false
    && !off.getConnections('Japan').includes('Midway'));

  const on = playing({ extraPacificBridges: true });
  const extras = on.activeLandBridges().slice(16);
  check('on adds only the Classic pairs from the Pacific list',
    on.activeLandBridges().length === 24 && samePairs(extras, ADDED));
  check('on still has the original Alaska bridge', on.hasLandBridge('Alaska', 'Soviet Far East') === true);
  for (const [left, right] of ADDED) {
    check(`on steps ${left}–${right}`, on.hasLandBridge(left, right) === true);
  }
  for (const [left, right] of LEFT_OUT) {
    check(`on does not invent ${left}–${right}`, on.hasLandBridge(left, right) === false);
  }
  check('Wake Island does not step to West US', on.hasLandBridge('Wake Island', 'West US') === false);

  const bridgesOff = playing({ landBridges: false, extraPacificBridges: false });
  check('Land bridges off still drops the original list',
    bridgesOff.activeLandBridges().length === 0
    && bridgesOff.hasLandBridge('Alaska', 'Soviet Far East') === false);

  const onlyExtra = playing({ landBridges: false, extraPacificBridges: true });
  check('Land bridges off still drops its own pairs when the extra switch is on',
    onlyExtra.hasLandBridge('Alaska', 'Soviet Far East') === false
    && samePairs(onlyExtra.activeLandBridges(), ADDED));

  const pacificGame = playing({ extraPacificBridges: true });
  pacificGame.mapId = 'pacific';
  check('the option does not change the Pacific list',
    pacificGame.activeLandBridges() === pacific);
}

console.log('=== one step ===');
{
  const off = playing({ extraPacificBridges: false });
  const blocked = off.moveUnits('Japan', 'Midway', [{ type: 'infantry', quantity: 1 }], unitDefs);
  check('off: infantry cannot step Japan–Midway',
    blocked.success === false && qty(off, 'Japan', 'infantry') === 3 && qty(off, 'Midway', 'infantry') === 0);

  const on = playing({ extraPacificBridges: true });
  const step = on.moveUnits('Japan', 'Midway', [{ type: 'infantry', quantity: 1 }], unitDefs);
  check('on: infantry steps Japan–Midway in one move',
    step.success === true && qty(on, 'Midway', 'infantry') === 1 && qty(on, 'Japan', 'infantry') === 2);

  const two = playing({ extraPacificBridges: true });
  const hop = two.moveUnits('Japan', 'Hawaiian Islands', [{ type: 'infantry', quantity: 1 }], unitDefs);
  check('on: infantry cannot cross two bridges in one move',
    hop.success === false && qty(two, 'Japan', 'infantry') === 3 && qty(two, 'Hawaiian Islands', 'infantry') === 0);

  const tank = playing({ extraPacificBridges: true });
  const reached = tank.getLandUnitPath('Japan', 'Hawaiian Islands', 2, 'Japanese', false);
  check('on: a move of 2 crosses Japan–Midway–Hawaiian Islands as two steps',
    reached?.path?.join(' > ') === 'Japan > Midway > Hawaiian Islands');
  const tankMove = tank.moveUnits('Japan', 'Hawaiian Islands', [{ type: 'armour', quantity: 1 }], unitDefs);
  check('on: armour can spend both steps in one move',
    tankMove.success === true && qty(tank, 'Hawaiian Islands', 'armour') === 1);

  const ship = playing({ extraPacificBridges: true });
  const naval = ship.moveUnits('Japan', 'Midway', [{ type: 'destroyer', quantity: 1 }], unitDefs);
  ship.units.Alaska = [{ type: 'destroyer', quantity: 1, owner: 'Japanese' }];
  const existingNaval = ship.moveUnits('Alaska', 'Soviet Far East', [{ type: 'destroyer', quantity: 1 }], unitDefs);
  check('on: a naval unit is refused the same way as an existing bridge',
    naval.success === false
    && existingNaval.success === false
    && naval.error === existingNaval.error
    && qty(ship, 'Japan', 'destroyer') === 1
    && qty(ship, 'Alaska', 'destroyer') === 1,
    naval.error);

  const original = playing({ extraPacificBridges: true });
  original.units.Alaska = [{ type: 'infantry', quantity: 1, owner: 'Japanese' }];
  const alaska = original.moveUnits('Alaska', 'Soviet Far East', [{ type: 'infantry', quantity: 1 }], unitDefs);
  check('the original Alaska bridge is still one step', alaska.success === true);
}

console.log('=== save ===');
{
  const on = playing({ extraPacificBridges: true });
  const saved = on.toJSON();
  check('the save stays schema 11', saved.version === 11 && SCHEMA_VERSION === 11);
  check('an explicit true is stored on gameOptions', saved.gameOptions.extraPacificBridges === true);

  const kept = new GameState({ risk: { factions: [] } }, territories, []);
  kept.loadFromJSON(saved);
  check('a save with the option on loads on',
    kept.gameOptions.extraPacificBridges === true && kept.hasLandBridge('Japan', 'Midway') === true);

  const omitted = structuredClone(saved);
  delete omitted.gameOptions.extraPacificBridges;
  const legacy = new GameState({ risk: { factions: [] } }, territories, []);
  legacy.loadFromJSON(omitted);
  check('a save that omits the field loads off',
    legacy.gameOptions.extraPacificBridges === false && legacy.hasLandBridge('Japan', 'Midway') === false);

  const restored = restoreProtectedGameOptions(
    { gameOptions: { landBridges: true } },
    { extraPacificBridges: true },
  );
  check('a dropped true is restored from the protected copy',
    restored.gameOptions.extraPacificBridges === true);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nextra Pacific bridge checks passed');
