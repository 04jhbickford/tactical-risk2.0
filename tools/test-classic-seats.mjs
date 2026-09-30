// Classic can seat Chinese and ANZAC. Five powers stay on today's owners.
// Run: node tools/test-classic-seats.mjs

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

const { SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  DEFAULT_GAME_OPTIONS,
  MAX_PLAYER_VALUES,
  maxPlayerChoices,
} = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const {
  CLASSIC_FACTION_HOMES,
  CLASSIC_NATION_NAMES,
  getMap,
} = await import(pathToFileURL(join(root, 'src/map/mapRegistry.js')));
const { sumPrintedIpc } = await import(pathToFileURL(join(root, 'src/state/classicSeats.js')));
const { startClassicSolo } = await import(pathToFileURL(join(root, 'src/map/threeSoloMatch.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const setup = JSON.parse(readFileSync(join(root, 'data/setup.json'), 'utf8'));
const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const continents = JSON.parse(readFileSync(join(root, 'data/continents.json'), 'utf8'));
const pacific = JSON.parse(readFileSync(join(root, 'data/maps/pacific/setup.json'), 'utf8'));

const chinaIpc = sumPrintedIpc(['China'], territories);
const anzacIpc = sumPrintedIpc(['Australia', 'New Zealand'], territories);

function seats(count) {
  return setup.risk.factions.slice(0, count).map((faction) => ({ ...faction, isAI: false }));
}

function boot(count) {
  const gs = new GameState(setup, territories, continents);
  gs.initGame('classic', seats(count), { mapId: 'classic' });
  return gs;
}

function owned(gs, playerId) {
  return gs.getPlayerTerritories(playerId).filter((name) => !gs.territoryByName[name]?.isWater).sort();
}

console.log('=== cap ===');
check('schema stays 11', SCHEMA_VERSION === 11);
check('default max stays 5', DEFAULT_GAME_OPTIONS.maxPlayers === 5);
check('choices are 2 through 7', JSON.stringify(MAX_PLAYER_VALUES) === JSON.stringify([2, 3, 4, 5, 6, 7]));
check('8 is not a choice', !MAX_PLAYER_VALUES.includes(8) && !maxPlayerChoices(0).includes(8));
check('Pacific choices stay at five', JSON.stringify(maxPlayerChoices(0, 5)) === JSON.stringify([2, 3, 4, 5]));
check('no eighth power', setup.risk.factions.length === 7
  && !setup.risk.factions.some((faction) => ['Egypt', 'India', 'Australia'].includes(faction.id)));
check('Pacific stays its five powers',
  pacific.risk.factions.map((faction) => faction.id).join(',') === 'Japanese,Americans,Chinese,British,ANZAC'
  && !pacific.risk.factions.some((faction) => faction.id === 'Germans' || faction.id === 'Russians'));

console.log('=== five players unchanged ===');
{
  const gs = boot(5);
  const owners = setup.classic.territoryOwners;
  const sameOwners = Object.entries(owners).every(([name, owner]) => gs.getOwner(name) === owner);
  const sameUnits = Object.entries(setup.classic.unitPlacements).every(([name, rows]) => {
    const live = gs.units[name] || [];
    return live.length === rows.length
      && rows.every((row, index) => live[index].owner === row.owner
        && live[index].type === row.type
        && live[index].quantity === row.quantity);
  });
  check('5-player owners match today', sameOwners && gs.getOwner('China') === 'Americans'
    && gs.getOwner('Australia') === 'British' && gs.getOwner('New Zealand') === 'British');
  check('5-player units match today', sameUnits);
  check('5-player roster is the original five',
    gs.players.map((player) => player.id).join(',') === 'Russians,Germans,British,Japanese,Americans');
  check('5-player banks stay the stored numbers',
    gs.playerState.Americans.ipcs === 36 && gs.playerState.British.ipcs === 30
    && gs.playerState.Chinese == null && gs.playerState.ANZAC == null);
  const solo = startClassicSolo(setup, territories, continents);
  check('default classic solo stays five and leaves New Zealand British',
    solo.players.map((player) => player.id).join(',') === 'Russians,Germans,British,Japanese,Americans'
    && solo.getOwner('New Zealand') === 'British'
    && solo.getOwner('China') === 'Americans'
    && solo.getOwner('Australia') === 'British');
}

console.log('=== six and seven ===');
{
  const six = boot(6);
  check('6-player seats Chinese after the five',
    six.players.map((player) => player.id).join(',') === 'Russians,Germans,British,Japanese,Americans,Chinese');
  check('Chinese owns China only', JSON.stringify(owned(six, 'Chinese')) === JSON.stringify(['China']));
  check('China units changed owner', (six.units.China || []).every((unit) => unit.owner === 'Chinese')
    && (six.units.China || []).some((unit) => unit.type === 'infantry' && unit.quantity === 4)
    && (six.units.China || []).some((unit) => unit.type === 'fighter' && unit.quantity === 1));
  check('Chinese does not take Kwangtung or Manchuria',
    six.getOwner('Kwangtung') === 'Japanese' && six.getOwner('Manchuria') === 'Japanese');
  check('6-player leaves Australia and New Zealand British',
    six.getOwner('Australia') === 'British' && six.getOwner('New Zealand') === 'British');
  check('Chinese starting PUs are China printed IPC',
    chinaIpc === 1 && six.playerState.Chinese.ipcs === chinaIpc
    && setup.classic.factions.find((faction) => faction.id === 'Chinese').startingPUs === chinaIpc);
  check('Americans keep their stored bank', six.playerState.Americans.ipcs === 36);

  const seven = boot(7);
  check('7-player appends ANZAC',
    seven.players.map((player) => player.id).join(',') === 'Russians,Germans,British,Japanese,Americans,Chinese,ANZAC');
  check('ANZAC owns Australia and New Zealand only',
    JSON.stringify(owned(seven, 'ANZAC')) === JSON.stringify(['Australia', 'New Zealand']));
  check('Australia units changed owner',
    (seven.units.Australia || []).every((unit) => unit.owner === 'ANZAC')
    && (seven.units.Australia || []).some((unit) => unit.type === 'infantry' && unit.quantity === 2));
  check('ANZAC does not take India, East Indies, or New Guinea',
    seven.getOwner('India') === 'British'
    && seven.getOwner('East Indies') === 'Japanese'
    && seven.getOwner('New Guinea') === 'Japanese');
  check('ANZAC starting PUs are the printed sum',
    anzacIpc === 2 && seven.playerState.ANZAC.ipcs === anzacIpc
    && setup.classic.factions.find((faction) => faction.id === 'ANZAC').startingPUs === anzacIpc);
  check('British keep their stored bank', seven.playerState.British.ipcs === 30);
  check('flags are the real files',
    seven.players.find((player) => player.id === 'Chinese').flag === 'Chinese.png'
    && seven.players.find((player) => player.id === 'ANZAC').flag === 'ANZAC.png'
    && seven.players.find((player) => player.id === 'Chinese').color === '#8B008B'
    && seven.players.find((player) => player.id === 'ANZAC').color === '#008B8B');
}

console.log('=== turn notices ===');
check('Classic homes name China and Australia',
  CLASSIC_FACTION_HOMES.Chinese === 'China' && CLASSIC_FACTION_HOMES.ANZAC === 'Australia');
check('Classic nation names can say Chinese and ANZAC',
  CLASSIC_NATION_NAMES.chinese.name === 'China' && CLASSIC_NATION_NAMES.anzac.adj === 'ANZAC');
check('Pacific homes stay on the Pacific lands',
  getMap('pacific').factionHomes.Chinese === 'Szechwan'
  && getMap('pacific').factionHomes.ANZAC === 'New South Wales');

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('classic seats ok');
