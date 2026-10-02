// A 7-seat Classic table can be filled with enemy AI after the original
// five powers are taken. Chinese and ANZAC are those two seats.
// Run: node tools/test-enemy-ai-seats.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const { GAME_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { addAiDialogFactions } = await import(pathToFileURL(join(root, 'src/state/classicSeats.js')));
const { addLobbyAISeat } = await import(pathToFileURL(join(root, 'src/multiplayer/lobbySeats.js')));
const { clampMaxPlayers, optionsFromSettings } = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { isThreeUx } = await import(pathToFileURL(join(root, 'src/map/presentationMode.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const setup = JSON.parse(readFileSync(join(root, 'data/setup.json'), 'utf8'));
const pacific = JSON.parse(readFileSync(join(root, 'data/maps/pacific/setup.json'), 'utf8'));
const lobbySrc = readFileSync(join(root, 'src/ui/multiplayerLobby.js'), 'utf8');
const threeSrc = readFileSync(join(root, 'src/map/threeMapChrome.js'), 'utf8');
const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');

const HUMANS = ['Russians', 'Germans', 'British', 'Japanese', 'Americans'];

function seatCap(settings, seated) {
  return clampMaxPlayers(optionsFromSettings(settings).maxPlayers, seated);
}

function offeredFor(settings, seated, factions, mapId) {
  return addAiDialogFactions({
    factions,
    maxPlayers: seatCap(settings, seated),
    mapId,
  });
}

console.log('=== 7-seat enemy AI ===');
check('stamp is V2.81.57-unified.35', GAME_VERSION === 'V2.81.57-unified.35');

{
  const settings = { maxPlayers: 7, gameOptions: { maxPlayers: 7 } };
  const offered = offeredFor(settings, HUMANS.length, setup.risk.factions, 'classic');
  const free = offered.filter((faction) => !HUMANS.includes(faction.id));
  check('a 7-seat dialog still lists Chinese and ANZAC after the five are taken',
    free.map((faction) => faction.id).join(',') === 'Chinese,ANZAC');
  check('those two cover the empty seats', free.length >= 7 - HUMANS.length);

  let players = HUMANS.map((id, index) => ({
    oderId: `human_${index}`,
    factionId: id,
    isAI: false,
  }));
  for (const faction of free) {
    const added = addLobbyAISeat({
      players,
      maxPlayers: 7,
      aiPlayer: {
        oderId: `ai_${faction.id}`,
        factionId: faction.id,
        isAI: true,
        displayName: 'Easy Bot',
      },
    });
    check(`enemy AI can sit as ${faction.id}`, added.ok === true);
    if (added.ok) players = added.players;
  }
  check('the 7-seat table is full', players.length === 7
    && new Set(players.map((player) => player.factionId)).size === 7);
  const extra = addLobbyAISeat({
    players,
    maxPlayers: 7,
    aiPlayer: { oderId: 'ai_extra', factionId: 'Chinese', isAI: true },
  });
  check('an eighth seat is refused', extra.ok === false);

  const five = offeredFor({ maxPlayers: 5, gameOptions: { maxPlayers: 5 } }, 5, setup.risk.factions, 'classic');
  check('a 5-seat dialog does not grow past the original five',
    five.filter((faction) => !HUMANS.includes(faction.id)).length === 0);

  const six = offeredFor({ maxPlayers: 6, gameOptions: { maxPlayers: 6 } }, 5, setup.risk.factions, 'classic');
  check('a 6-seat dialog adds Chinese only',
    six.filter((faction) => !HUMANS.includes(faction.id)).map((faction) => faction.id).join(',') === 'Chinese');
}

check('Pacific Add AI stays its five powers',
  addAiDialogFactions({
    factions: pacific.risk.factions,
    maxPlayers: 7,
    mapId: 'pacific',
  }).map((faction) => faction.id).join(',') === 'Japanese,Americans,Chinese,British,ANZAC');

const dialogStart = lobbySrc.indexOf('_showAddAIDialog()');
const dialog = lobbySrc.slice(dialogStart, lobbySrc.indexOf('_handleCreate', dialogStart));
check('Add AI dialog passes the live seat cap',
  dialog.includes('this._factionsForActiveMap(this._seatCap(lobby))')
  && !dialog.includes('_factionsForActiveMap()'));
const seatFn = lobbySrc.slice(
  lobbySrc.indexOf('_seatCap('),
  lobbySrc.indexOf('_factionsForActiveMap(maxPlayers)'),
);
check('seat cap reads the room options',
  seatFn.includes('optionsFromSettings(lobby.settings)'));
check('Add AI stays disabled when every offered faction is taken',
  dialog.includes("${availableFaction ? '' : 'disabled'}"));

check('the Add AI Player dialog is the Classic lobby only',
  lobbySrc.includes('Add AI Player') && !threeSrc.includes('Add AI Player'));
check('Experimental is not booted, so it never shows that dialog',
  isThreeUx('?ux=three') === false
  && isThreeUx('') === false
  && mainSrc.includes('redirectUxAliasesIfNeeded')
  && !mainSrc.includes('bootThreeSolo'));

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll 7-seat enemy AI checks passed');
