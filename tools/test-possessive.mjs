// Unit checks for V2.62 turn-badge possessive helper.
// Run: node tools/test-possessive.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { possessiveName, possessivePhrase } =
  await import(pathToFileURL(join(root, 'src/utils/possessive.js')));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

console.log('=== Version stamps ===');
check('GAME_VERSION is V2.81.57-dual-path.14', GAME_VERSION === 'V2.81.57-dual-path.14');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== Stock factions (possessiveName) ===');
check('Germans → Germans\'', possessiveName('Germans') === "Germans'");
check('Russians → Russians\'', possessiveName('Russians') === "Russians'");
check('Americans → Americans\'', possessiveName('Americans') === "Americans'");
check('British → British (adjectival, no \'s)', possessiveName('British') === 'British');
check('Japanese → Japanese (adjectival, no \'s)', possessiveName('Japanese') === 'Japanese');

console.log('=== Turn badge (possessivePhrase) ===');
check('Germans\' Turn (not Germans\'s)', possessivePhrase('Germans', 'Turn') === "Germans' Turn");
check('Russians\' Turn', possessivePhrase('Russians', 'Turn') === "Russians' Turn");
check('Americans\' Turn', possessivePhrase('Americans', 'Turn') === "Americans' Turn");
check('British Turn', possessivePhrase('British', 'Turn') === 'British Turn');
check('Japanese Turn', possessivePhrase('Japanese', 'Turn') === 'Japanese Turn');
check('Alice\'s Turn', possessivePhrase('Alice', 'Turn') === "Alice's Turn");

console.log('=== Custom names ending in s/x/z ===');
check('James → James\'', possessiveName('James') === "James'");
check('Max → Max\'', possessiveName('Max') === "Max'");
check('Alex → Alex\'', possessiveName('Alex') === "Alex'");
check('Liz → Liz\'', possessiveName('Liz') === "Liz'");
check('James\' Game', possessivePhrase('James', 'Game') === "James' Game");

console.log('=== Names that do not end in a sibilant ===');
check('Germany → Germany\'s', possessiveName('Germany') === "Germany's");
check('Japan → Japan\'s', possessiveName('Japan') === "Japan's");
check('USA → USA\'s', possessiveName('USA') === "USA's");

console.log('=== Edges ===');
check('empty → empty', possessiveName('') === '');
check('null → empty', possessiveName(null) === '');
check('undefined → empty', possessiveName(undefined) === '');
check('whitespace trimmed', possessiveName('  Germans  ') === "Germans'");
check('empty name + Turn → Turn', possessivePhrase('', 'Turn') === 'Turn');
check('lowercase germans still takes \'', possessiveName('germans') === "germans'");

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll possessive checks passed');
