// Unit checks for V2.60 RECENT MOVES display (empty-row / missing-unit string).
// Run: node tools/test-recent-move-display.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { formatRecentMove } =
  await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

console.log('=== Version stamps ===');
check('GAME_VERSION is V2.81.57-unified.6', GAME_VERSION === 'V2.81.57-unified.6');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== formatRecentMove: real attack ===');
{
  const desc = formatRecentMove({
    from: 'Novosibirsk',
    to: 'Evenki National Okrug',
    units: [{ type: 'infantry', quantity: 4 }, { type: 'armour', quantity: 2 }],
  });
  check('shows unit abbreviations + from → to',
    desc === '4i,2a: Novosibirsk → Evenki National Okrug');
}

console.log('=== formatRecentMove: skip blank rows ===');
check('null → empty', formatRecentMove(null) === '');
check('undefined → empty', formatRecentMove(undefined) === '');
check('empty object → empty', formatRecentMove({}) === '');
check('units missing + no from/to → empty', formatRecentMove({ units: [] }) === '');
check('units not an array → empty (no throw)', formatRecentMove({ units: { infantry: 2 } }) === '');
check('unit missing type skipped', formatRecentMove({
  from: 'A', to: 'B', units: [{ quantity: 2 }, { type: 'infantry', quantity: 3 }],
}) === '3i: A → B');

console.log('=== formatRecentMove: ship-only / from-to fallback ===');
check('from/to without units still shows the path',
  formatRecentMove({ from: 'SZ 5', to: 'SZ 6', units: [] }) === 'SZ 5 → SZ 6');
check('shipIds + from/to labeled',
  formatRecentMove({ from: 'SZ 5', to: 'SZ 6', shipIds: ['t1', 't2'] }) === '2 ships: SZ 5 → SZ 6');
check('missing quantity defaults to 1',
  formatRecentMove({ from: 'A', to: 'B', units: [{ type: 'fighter' }] }) === '1f: A → B');

console.log(failures === 0 ? '\nALL RECENT-MOVE DISPLAY CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
