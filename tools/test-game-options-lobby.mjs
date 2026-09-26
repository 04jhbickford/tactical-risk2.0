// V2.81.57-unified.17 — lobby options: host-only edits, summary, card chip.
// Run: node tools/test-game-options-lobby.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const {
  describe,
  rulesChip,
  settingsEditError,
  normalizeGameOptions,
  mergeGameOptionsIntoSettings,
} = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { renderGameOptionsPanel } = await import(pathToFileURL(join(root, 'src/ui/gameOptionsPanel.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

console.log('=== V2.81.57-unified.17 game option lobby ===');
check('GAME_VERSION is V2.81.57-unified.17', GAME_VERSION === 'V2.81.57-unified.17');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

check('joiner cannot edit', settingsEditError({ isHost: false }) === 'Only host can update settings');
check('host can edit', settingsEditError({ isHost: true }) === null);

const lobbySrc = readFileSync(join(root, 'src/multiplayer/lobbyManager.js'), 'utf8');
check('updateSettings stays host-only', /Only host can update settings/.test(lobbySrc));

check('untouched summary is Standard rules', describe(null) === 'Standard rules');
check(
  'custom summary names the changes',
  describe({ startingArmy: 'heavy', unitsPerRound: 8, landBridges: false })
    === 'Custom: Heavy army, 8 per round, no land bridges',
);
check('standard chip', rulesChip(null) === 'Standard rules');
check('custom chip', rulesChip({ unitsPerRound: 8 }) === 'Custom rules');
check('land bridges default on', normalizeGameOptions(null).landBridges === true);
check('explicit land bridges off sticks', normalizeGameOptions({ landBridges: false }).landBridges === false);

const joiner = renderGameOptionsPanel({ unitsPerRound: 8 }, { editable: false });
check('joiner sees Set by host', joiner.includes('Set by host'));
check('joiner controls are disabled', joiner.includes('disabled'));
check('joiner phone row is still there', joiner.includes('Game options') && joiner.includes('Custom'));

const host = renderGameOptionsPanel(null, { editable: true });
check('host card is collapsed copy', host.includes('Game options') && host.includes('Standard rules') && host.includes('Customize'));
check('host is not marked set by host', !host.includes('Set by host'));

const merged = mergeGameOptionsIntoSettings(
  { password: 'nope' },
  { startingArmy: 'heavy', unitsPerRound: 8, landBridges: false },
);
check('settings keep the legacy mirrors', merged.maxPlayers === 5 && merged.startingIPCs === 80 && merged.teamsEnabled === false);
check('settings store gameOptions', merged.gameOptions.startingArmy === 'heavy' && merged.gameOptions.landBridges === false);
check('chip for that lobby is Custom rules', rulesChip(merged.gameOptions) === 'Custom rules');

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll game-option lobby checks passed');
