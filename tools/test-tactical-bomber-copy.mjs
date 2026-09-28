// V2.81.57-unified.19 — tactical bomber labels only.
// Purchase row and rules copy. No units.json, canCarry, or combat changes.
// Run: node tools/test-tactical-bomber-copy.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { formatUnitName } from '../src/utils/unitNames.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const check = (label, cond) => {
  if (cond) console.log('ok  :', label);
  else {
    failures += 1;
    console.log('FAIL:', label);
  }
};

const between = (src, startMark, endMark) => {
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark, start + startMark.length);
  return start >= 0 && end > start ? src.slice(start, end) : '';
};

console.log('=== purchase row ===');
{
  check('tactical bomber label', formatUnitName('tacticalBomber') === 'Tactical bomber');
  check('other buy ids stay words', formatUnitName('aaGun') === 'AA Gun' && formatUnitName('armour') === 'Tank');
  const panel = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  const row = between(panel, 'const renderUnitRow = ([unitType, def]) => {', 'if (landUnits.length > 0)');
  check('buy row uses formatUnitName', row.includes('const unitLabel = formatUnitName(unitType)'));
  check('buy name is the label', row.includes('<span class="pp-buy-name">${unitLabel}</span>'));
  check('buy icon alt is the label', row.includes('alt="${unitLabel}"'));
  check('buy row does not print the raw id', !row.includes('<span class="pp-buy-name">${unitType}</span>')
    && !row.includes('alt="${unitType}"'));
  check('data-unit stays the id', row.includes('data-unit="${unitType}"'));
  const cart = between(panel, 'const totalUnits = pending.reduce', 'pp-cart-total');
  check('cart uses formatUnitName', cart.includes('formatUnitName(p.type)'));
}

console.log('=== rules copy ===');
{
  const rules = readFileSync(join(root, 'src/ui/rulesPanel.js'), 'utf8');
  check('carrier bullet is 2 fighters', rules.includes('<strong>Carriers:</strong> Can carry up to 2 fighters.'));
  check('carrier bullet does not offer tactical bombers', !rules.includes('fighters/tactical bombers'));
  check('carrier table row is 2 fighters', rules.includes('<td>Carries 2 fighters</td>'));
  check('bomber note matches the code', rules.includes('Cannot capture. Strategic bombing raids are not yet available.'));
  check('bomber note does not claim a raid', !rules.includes('Strategic bombing, cannot capture'));
}

console.log('=== catalog untouched ===');
{
  const units = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));
  check('carrier canCarry is fighters only', JSON.stringify(units.carrier.canCarry) === '["fighter"]');
  check('bomber has no raid field', units.bomber.attack === 4 && units.bomber.defense === 1 && !units.bomber.strategicBombing);
  check('tactical bomber stats unchanged', units.tacticalBomber.cost === 11
    && units.tacticalBomber.attack === 3
    && units.tacticalBomber.defense === 3);
}

if (failures) {
  console.log(`${failures} failed`);
  process.exit(1);
}
console.log('all tactical bomber copy checks passed');
