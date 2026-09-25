// V2.81.57-unified.15 — turn summary prints loss maps, skips undone events.
// Run: node tools/test-turn-summary-losses.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const {
  formatLossCount,
  visibleTurnSummaryEvents,
  describeTurnSummaryEvent,
} = await import(pathToFileURL(join(root, 'src/ui/turnSummaryModal.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

console.log('=== V2.81.57-unified.15 turn summary losses ===');
check('GAME_VERSION is V2.81.57-unified.15', GAME_VERSION === 'V2.81.57-unified.15');

const line = formatLossCount({ infantry: 2, armour: 1 });
check('loss map prints like the ping', line === '2x Infantry, 1x Tank');
check('a bare count stays a number', formatLossCount(2) === '2');
check('the modal does not print object text', !line.includes('[object Object]'));

const events = [
  {
    type: 'combat',
    territory: 'Ukraine S.S.R.',
    attacker: 'Germans',
    defender: 'Russians',
    outcome: 'attacker',
    attackerLosses: { infantry: 2, armour: 1 },
    defenderLosses: { infantry: 1 },
  },
  {
    type: 'territory_captured',
    territory: 'Ukraine S.S.R.',
    fromPlayer: 'Russians',
    undone: true,
  },
];
const visible = visibleTurnSummaryEvents(events);
check('undone captures are skipped', visible.length === 1 && visible[0].type === 'combat');
check('combat line names the units',
  describeTurnSummaryEvent(events[0]).includes('attacker lost 2x Infantry, 1x Tank')
  && describeTurnSummaryEvent(events[0]).includes('defender lost 1x Infantry'));
check('an undone event has no line', describeTurnSummaryEvent(events[1]) === '');

const src = readFileSync(join(root, 'src/ui/turnSummaryModal.js'), 'utf8');
check('the modal renders through the loss formatter', src.includes('formatLossCount(ev.attackerLosses)'));
const ping = readFileSync(join(root, 'src/multiplayer/discordTurnPing.js'), 'utf8');
check('the discord ping formatter is unchanged in place', ping.includes('function formatUnitCounts(bucket)'));

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll turn summary loss checks passed');
