// 9.21.26.05 — owned land keeps a political-control mark with zero units.
// Run: node tools/test-political-control.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { startClassicSolo } = await import(pathToFileURL(join(root, 'src/map/threeSoloMatch.js')));
const {
  politicalControlMark,
  peekControlLabel,
  annotatePoliticalOwner,
} = await import(pathToFileURL(join(root, 'src/map/politicalControl.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const setup = JSON.parse(readFileSync(join(root, 'data/setup.json'), 'utf8'));
const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const continents = JSON.parse(readFileSync(join(root, 'data/continents.json'), 'utf8'));
const byName = Object.fromEntries(territories.map((t) => [t.name, t]));

const EMPTY_OWNED = [
  'Brazil', 'Congo', 'Cuba', 'French Equatorial Africa', 'French West Africa',
  'Spain', 'Italian East Africa', 'Kazakh S.S.R.', 'Kenya-Rhodesia', 'Madagascar',
  'Mexico', 'New Zealand', 'Novosibirsk', 'Panama', 'Persia',
];

console.log('=== stamp ===');
check('GAME_VERSION is V2.81.57-dual-path.15', GAME_VERSION === 'V2.81.57-dual-path.15');

console.log('=== empty owned land still marked ===');
{
  const gs = startClassicSolo(setup, territories, continents);
  for (const name of EMPTY_OWNED) {
    const stacks = gs.units[name] || [];
    const qty = stacks.reduce((n, s) => n + (Number(s.quantity) || 0), 0);
    const mark = politicalControlMark(byName[name], gs);
    check(`${name} starts with zero units`, qty === 0);
    check(`${name} control mark is ${setup.classic.territoryOwners[name]}`,
      mark?.ownerId === setup.classic.territoryOwners[name] && !!mark.color);
  }

  gs.units.Mexico = [];
  check('clearing Mexico stacks keeps Americans',
    politicalControlMark(byName.Mexico, gs)?.ownerId === 'Americans');
  delete gs.units.Mexico;
  check('missing Mexico stack list keeps Americans',
    politicalControlMark(byName.Mexico, gs)?.ownerId === 'Americans');

  const sheet = annotatePoliticalOwner(byName.Mexico, gs);
  check('empty Mexico sheet names Americans',
    sheet.politicalOwner === 'Americans'
    && peekControlLabel(sheet, []) === 'Americans');
}

console.log('=== neutrals and sea stay unmarked ===');
{
  const gs = startClassicSolo(setup, territories, continents);
  const neutral = territories.find((t) => (
    !t.isWater && t.originalOwner === 'Neutral' && !gs.getOwner(t.name)
  ));
  check('found an uncontrolled neutral land', !!neutral);
  check('neutral has no control mark', politicalControlMark(neutral, gs) === null);
  const neutralSheet = annotatePoliticalOwner(neutral, gs);
  check('neutral sheet does not borrow a stack owner',
    peekControlLabel(neutralSheet, [{ owner: 'Germans', type: 'infantry', quantity: 1 }]) === '');

  const sea = byName['East US Sea Zone'];
  gs.territoryState['East US Sea Zone'] = { owner: 'Americans' };
  check('sea zone is not a control mark', politicalControlMark(sea, gs) === null);
  check('sea peek uses the occupying stack only',
    peekControlLabel(sea, [{ owner: 'Japanese', type: 'submarine', quantity: 1 }]) === 'Japanese');
  check('empty sea peek invents no owner', peekControlLabel(sea, []) === '');
}

console.log('=== both forks call the shared flag pass ===');
{
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  const bootSrc = readFileSync(join(root, 'src/map/threeSoloBoot.js'), 'utf8');
  const previewSrc = readFileSync(join(root, 'src/map/uxPreview.js'), 'utf8');
  const chromeSrc = readFileSync(join(root, 'src/map/threeMapChrome.js'), 'utf8');
  const rendererSrc = readFileSync(join(root, 'src/map/territoryRenderer.js'), 'utf8');
  check('Classic paint draws ownership flags', /renderOwnershipFlags\(ctx, camera\.zoom\)/.test(mainSrc));
  check('Experimental boot draws ownership flags for empty land',
    /renderOwnershipFlags\(ctx, camera\.zoom, \{\s*always: true,/s.test(bootSrc));
  check('Experimental preview draws the same flags',
    /renderOwnershipFlags\(ctx, camera\.zoom, \{\s*always: true,/s.test(previewSrc));
  check('flag pass uses politicalControlMarks and still skips water',
    /politicalControlMarks\(this\.territories, this\.gameState\)/.test(rendererSrc)
    && /t\.isWater/.test(rendererSrc));
  check('peek no longer falls back to originalOwner', !/originalOwner/.test(chromeSrc));
}

if (failures) {
  console.error(`\n${failures} political-control check(s) failed`);
  process.exit(1);
}
console.log('\nAll political-control checks passed');
