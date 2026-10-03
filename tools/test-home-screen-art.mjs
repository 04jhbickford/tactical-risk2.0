// Home-screen painting. The lobby left half uses this file as supplied.
// Run: node tools/test-home-screen-art.mjs

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION, compareGameVersions, compatClientVersion } =
  await import(pathToFileURL(join(root, 'src/version.js')));

const ART = 'assets/Pictures/grok-image-702f41b9-ce2d-4291-a3b2-4f29bd8e8695.png';
const SHA256 = '8e260cdf7adc1f02b7355f2831470316624e8606cb972638871a00636c5b56ec';
const BYTES = 748376;

let failures = 0;
const check = (label, cond) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label);
  } else console.log('ok  :', label);
};

const css = readFileSync(join(root, 'style.css'), 'utf8');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const bytes = readFileSync(join(root, ART));
const hash = createHash('sha256').update(bytes).digest('hex');
const url = `url('${ART}')`;

check('display stamp is V2.81.57-unified.60', GAME_VERSION === 'V2.81.57-unified.60');
check('schema stays 11', SCHEMA_VERSION === 11);
check('game docs write V2.82-unified.60', compatClientVersion() === 'V2.82-unified.60');
check('a V2.82-unified.50 doc does not prompt this tab',
  compareGameVersions('V2.82-unified.50', GAME_VERSION) < 0);
check('a V2.82-unified.61 doc prompts this tab',
  compareGameVersions('V2.82-unified.61', GAME_VERSION) > 0);
check('our own V2.82-unified.60 doc does not prompt',
  compareGameVersions('V2.82-unified.60', GAME_VERSION) === 0);
check('index.html carries the display stamp',
  html.includes('content="V2.81.57-unified.60"')
  && html.includes("window.__TR_GAME_VERSION = 'V2.81.57-unified.60'")
  && html.includes("var LOCKED = 'V2.81.57-unified.60'")
  && html.includes('style.css?v=V2.81.57-unified.60')
  && html.includes('src/main.js?v=V2.81.57-unified.60'));
check('both lobby backgrounds point at the painting',
  css.split(url).length - 1 === 2);
check('painting bytes are the supplied file', hash === SHA256 && bytes.length === BYTES);

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('home screen art ok');
