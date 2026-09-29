// V2.81.57-unified.20.2 — K1: Kazakh's outline has no interior edge.
// The unified.18 stem cut left a short out-and-back at the south edge.
// That stub is stroked with the country hairline, so it reads as a line
// through the fill. The ring in data/territories.json and map/polygons.txt
// must match, and neither may contain that stub.
// Run: node tools/test-kazakh-outline.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

function parsePolygonsLine(text, name) {
  const line = text.split(/\r?\n/).find((row) => row.startsWith(`${name} `) || row.startsWith(`${name}\t`));
  if (!line) return null;
  return [...line.matchAll(/\((-?\d+),(-?\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
}

function pointInRing(px, py, ring) {
  let inside = false;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (((yi > py) !== (yj > py))
      && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// An outline edge is interior when land sits on both sides. A border edge
// has the outside of the ring on one side. Probes sit off the midpoint
// along the normal; two of three distances must agree so a grazing
// border sample does not count.
function interiorEdges(ring) {
  const hits = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1.5) continue;
    const nx = -dy / len;
    const ny = dx / len;
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    let both = 0;
    for (const d of [1.5, 3, 5]) {
      if (pointInRing(mx + nx * d, my + ny * d, ring)
        && pointInRing(mx - nx * d, my - ny * d, ring)) {
        both += 1;
      }
    }
    if (both >= 2) hits.push(i);
  }
  return hits;
}

function duplicateEdges(ring) {
  const seen = new Set();
  const dups = [];
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const key = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1])
      ? `${a[0]},${a[1]}|${b[0]},${b[1]}`
      : `${b[0]},${b[1]}|${a[0]},${a[1]}`;
    if (seen.has(key)) dups.push(key);
    seen.add(key);
  }
  return dups;
}

const data = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const kazakh = data.find((row) => row.name === 'Kazakh S.S.R.');
const txt = parsePolygonsLine(readFileSync(join(root, 'map/polygons.txt'), 'utf8'), 'Kazakh S.S.R.');
const ring = kazakh?.polygons?.[0] || [];

check('stamp is unified.20.1', GAME_VERSION === 'V2.81.57-unified.20.2');
check('Kazakh is one ring', kazakh && kazakh.polygons.length === 1 && !kazakh.isWater);
check('map polygons.txt matches territories.json',
  txt && JSON.stringify(txt) === JSON.stringify(ring));
check('Kazakh ring is 411 points after the stub cut', ring.length === 411 && txt.length === 411);
check('Kazakh outline has no interior edge', interiorEdges(ring).length === 0, interiorEdges(ring));
check('Kazakh outline has no duplicate edge', duplicateEdges(ring).length === 0, duplicateEdges(ring));
check('the south stub vertices are gone',
  !ring.some((p) => (p[0] === 1619 && p[1] === 728) || (p[0] === 1620 && p[1] === 727)));
check('the south border still joins',
  JSON.stringify(ring.slice(186, 190)) === JSON.stringify([[1621, 748], [1619, 746], [1618, 747], [1617, 747]]));
check('Kazakh name, owner, IPC, and neighbors are unchanged',
  kazakh.name === 'Kazakh S.S.R.'
  && kazakh.production === 1
  && kazakh.originalOwner === 'Russians'
  && kazakh.continent === 'Middle East'
  && JSON.stringify(kazakh.connections) === JSON.stringify([
    'Caspian Sea Zone', 'China', 'India', 'Novosibirsk', 'Persia', 'Russia',
  ]));
check('Afghanistan stays merged into India', !data.some((row) => row.name === 'Afghanistan'));

if (failures) {
  console.error(`${failures} failed`);
  process.exit(1);
}
console.log('kazakh outline ok');
