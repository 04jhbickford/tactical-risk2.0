// unified.70: a defender's garrison can be picked by hand once its other units are picked, even with an AA gun there.
// The AA gun is never a casualty (unified.61), so waiting for it to be picked first meant the garrison could never be
// chosen and the defender could not finish assigning hits. Also the exact stamp for this release.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION, compatClientVersion } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GARRISON, garrisonHitAllowed } = await import(pathToFileURL(join(root, 'src/state/garrison.js')));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) { failures += 1; console.log(`FAIL: ${label}`, extra === undefined ? '' : JSON.stringify(extra)); } else console.log(`ok  : ${label}`);
};

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  check('display stamp is V2.81.57-unified.70', GAME_VERSION === 'V2.81.57-unified.70');
  check('schema stays 11', SCHEMA_VERSION === 11);
  check('game docs write V2.82-unified.70', compatClientVersion() === 'V2.82-unified.70');
  check('index.html carries the display stamp everywhere',
    (html.match(/V2\.81\.57-unified\.70/g) || []).length === 5 && !/V2\.81\.57-unified\.69/.test(html));
}

console.log('=== garrison with an AA gun ===');
{
  const side = [
    { type: 'infantry', quantity: 1, owner: 'Germans' },
    { type: 'aaGun', quantity: 1, owner: 'Germans' },
    { type: GARRISON, quantity: 1, owner: 'Germans' },
  ];
  check('garrison still waits while infantry remain', garrisonHitAllowed(side, {}) === false);
  check('garrison can be picked once the infantry is picked; the AA gun never has to be',
    garrisonHitAllowed(side, { infantry: 1 }) === true);
  check('an AA gun alone beside the garrison does not block it',
    garrisonHitAllowed([{ type: 'aaGun', quantity: 2, owner: 'Germans' }, { type: GARRISON, quantity: 1, owner: 'Germans' }], {}) === true);
}

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log('\nall passed');
