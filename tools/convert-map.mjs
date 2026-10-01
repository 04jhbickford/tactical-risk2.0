#!/usr/bin/env node
// Convert a TripleA map into territories.json and continents.json.
//   node tools/convert-map.mjs <mapId> [--out dir] [--check]
// Classic with no --out writes data/territories.json and data/continents.json.
// --check writes to a temp directory and exits non-zero unless those bytes
// match the config's out files.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classicConvertConfig } from './map-convert/classic.mjs';
import { pacificConvertConfig } from './map-convert/pacific.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CONFIGS = {
  classic: classicConvertConfig,
  pacific: pacificConvertConfig,
};

function unionPolygons(polygons) {
  return polygons;
}

function parsePolygons(file) {
  const text = fs.readFileSync(file, 'utf8');
  const result = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const firstAngle = trimmed.indexOf('<');
    if (firstAngle === -1) continue;
    const name = trimmed.substring(0, firstAngle).trim();
    const polyPart = trimmed.substring(firstAngle);
    const segments = polyPart.split(/>\s*</).map((s) => s.replace(/[<>]/g, '').trim());
    const polygons = [];
    for (const seg of segments) {
      if (!seg) continue;
      const points = [];
      const matches = seg.matchAll(/\((\d+),(\d+)\)/g);
      for (const m of matches) {
        points.push([parseInt(m[1], 10), parseInt(m[2], 10)]);
      }
      if (points.length > 0) polygons.push(points);
    }
    if (polygons.length > 0) result[name] = polygons;
  }
  return result;
}

function parseCenters(file) {
  const text = fs.readFileSync(file, 'utf8');
  const result = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(.+?)\s{2,}\((\d+),(\d+)\)/);
    if (match) {
      result[match[1].trim()] = [parseInt(match[2], 10), parseInt(match[3], 10)];
    }
  }
  return result;
}

function parseXML(file) {
  const xml = fs.readFileSync(file, 'utf8');
  const territories = {};
  const territoryRegex = /<territory\s+name="([^"]+)"(\s+water="true")?\s*\/>/g;
  let m;
  while ((m = territoryRegex.exec(xml)) !== null) {
    territories[m[1]] = { name: m[1], isWater: !!m[2] };
  }

  const connections = {};
  const connRegex = /<connection\s+t1="([^"]+)"\s+t2="([^"]+)"\s*\/>/g;
  while ((m = connRegex.exec(xml)) !== null) {
    const before = xml.substring(Math.max(0, m.index - 200), m.index);
    if (before.includes('<!--') && !before.includes('-->')) continue;
    const t1 = m[1];
    const t2 = m[2];
    if (!connections[t1]) connections[t1] = new Set();
    if (!connections[t2]) connections[t2] = new Set();
    connections[t1].add(t2);
    connections[t2].add(t1);
  }

  const attachRegex = /<attachment\s+name="territoryAttachment"\s+attachTo="([^"]+)"[^>]*>\s*([\s\S]*?)<\/attachment>/g;
  while ((m = attachRegex.exec(xml)) !== null) {
    const tName = m[1];
    const body = m[2];
    if (!territories[tName]) continue;
    const prodMatch = body.match(/<option\s+name="production"\s+value="(\d+)"\s*\/>/);
    if (prodMatch) territories[tName].production = parseInt(prodMatch[1], 10);
    const capitalMatch = body.match(/<option\s+name="capital"\s+value="([^"]+)"\s*\/>/);
    if (capitalMatch) {
      territories[tName].isCapital = true;
      territories[tName].capitalOf = capitalMatch[1];
    }
    const factoryMatch = body.match(/<option\s+name="originalFactory"\s+value="true"\s*\/>/);
    if (factoryMatch) territories[tName].hasFactory = true;
  }

  const ownerRegex = /<territoryOwner\s+territory="([^"]+)"\s+owner="([^"]+)"\s*\/>/g;
  while ((m = ownerRegex.exec(xml)) !== null) {
    if (territories[m[1]]) territories[m[1]].originalOwner = m[2];
  }

  return { territories, connections };
}

function continentColor(config, name) {
  return config.continentColors?.[name] || '#888888';
}

export function convertMap(mapId, { log = console.log } = {}) {
  const config = CONFIGS[mapId];
  if (!config) {
    throw new Error(`Unknown map id "${mapId}". Known: ${Object.keys(CONFIGS).join(', ')}`);
  }

  log('Parsing polygons.txt...');
  const polygons = parsePolygons(path.join(ROOT, config.polygons));
  log(`  Found ${Object.keys(polygons).length} territory polygons`);

  log('Parsing centers.txt...');
  const centers = parseCenters(path.join(ROOT, config.centers));
  log(`  Found ${Object.keys(centers).length} territory centers`);

  log(`Parsing ${path.basename(config.xml)}...`);
  const { territories, connections } = parseXML(path.join(ROOT, config.xml));
  log(`  Found ${Object.keys(territories).length} territories`);

  const sourceLand = Object.values(territories).filter((t) => !t.isWater).length;
  const sourceSea = Object.values(territories).filter((t) => t.isWater).length;

  for (const name of config.exclude || []) {
    delete territories[name];
    delete connections[name];
    delete polygons[name];
    delete centers[name];
    for (const set of Object.values(connections)) set.delete(name);
    log(`  Excluded "${name}"`);
  }

  for (const name of config.impassable || []) {
    if (!territories[name]) continue;
    territories[name].impassable = true;
    territories[name].production = 0;
    territories[name].originalOwner = 'Neutral';
    territories[name].isCapital = false;
    delete territories[name].capitalOf;
    const mine = connections[name] || new Set();
    for (const other of mine) connections[other]?.delete(name);
    connections[name] = new Set();
    log(`  Impassable: ${name} (connections removed)`);
  }

  if (config.ownerRemap) {
    for (const data of Object.values(territories)) {
      const next = config.ownerRemap[data.originalOwner];
      if (next) data.originalOwner = next;
    }
  }

  if (config.capitals) {
    for (const data of Object.values(territories)) {
      delete data.isCapital;
      delete data.capitalOf;
    }
    for (const cap of config.capitals) {
      if (!territories[cap.territory]) {
        log(`  WARN: capital "${cap.territory}" not found`);
        continue;
      }
      territories[cap.territory].isCapital = true;
      territories[cap.territory].capitalOf = cap.owner;
      log(`  Capital: ${cap.territory} (${cap.owner})`);
    }
  }

  const territoryToContinent = {};
  for (const c of config.continents) {
    for (const t of c.territories) territoryToContinent[t] = c.name;
  }

  for (const [t1, t2] of config.landBridges || []) {
    if (territories[t1] && territories[t2]) {
      if (!connections[t1]) connections[t1] = new Set();
      if (!connections[t2]) connections[t2] = new Set();
      connections[t1].add(t2);
      connections[t2].add(t1);
      log(`  Added land bridge: ${t1} <-> ${t2}`);
    }
  }

  for (const [t1, t2] of config.removeConnections || []) {
    if (connections[t1]) connections[t1].delete(t2);
    if (connections[t2]) connections[t2].delete(t1);
  }

  for (const { from, into } of config.merges || []) {
    if (!territories[from] || !territories[into]) {
      log(`  WARN: merge skipped — "${from}" or "${into}" not found`);
      continue;
    }
    territories[into].production = (territories[into].production || 0) + (territories[from].production || 0);
    const fromPolys = polygons[from] || [];
    const intoPolys = polygons[into] || [];
    const combinedPolys = intoPolys.concat(fromPolys);
    polygons[into] = unionPolygons(combinedPolys);
    log(`    Polygon union: ${combinedPolys.length} input → ${polygons[into].length} output`);

    const connsFrom = connections[from] || new Set();
    const connsInto = connections[into] || new Set();
    for (const c of connsFrom) {
      if (c !== into && c !== from) connsInto.add(c);
    }
    connsInto.delete(from);
    connections[into] = connsInto;

    for (const [tName, cSet] of Object.entries(connections)) {
      if (cSet.has(from)) {
        cSet.delete(from);
        if (tName !== into) cSet.add(into);
      }
    }

    delete territories[from];
    delete connections[from];
    log(`  Merged "${from}" into "${into}" (production=${territories[into].production})`);
  }

  const territoryList = [];
  for (const [name, data] of Object.entries(territories)) {
    const entry = { name, isWater: data.isWater };
    if (!data.isWater) {
      if (data.impassable) {
        entry.production = 0;
        entry.impassable = true;
      } else {
        entry.production = config.productionRule === 'keep' ? (data.production || 0) : 1;
      }
      entry.continent = territoryToContinent[name] || null;
      entry.originalOwner = data.originalOwner || 'Neutral';
      if (data.isCapital) {
        entry.isCapital = true;
        entry.capitalOf = data.capitalOf;
      }
      if (data.hasFactory) entry.hasFactory = true;
    }
    entry.connections = connections[name] ? Array.from(connections[name]).sort() : [];
    entry.polygons = polygons[name] || [];
    entry.center = centers[name] || null;
    territoryList.push(entry);
  }

  territoryList.sort((a, b) => {
    if (a.isWater !== b.isWater) return a.isWater ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  // Afghanistan used to be India's second ring. Keep it immediately after
  // India so a convert does not reorder the rest of territories.json.
  const afgIdx = territoryList.findIndex((row) => row.name === 'Afghanistan');
  const indiaIdx = territoryList.findIndex((row) => row.name === 'India');
  if (afgIdx >= 0 && indiaIdx >= 0 && afgIdx !== indiaIdx + 1) {
    const [afg] = territoryList.splice(afgIdx, 1);
    const indiaNow = territoryList.findIndex((row) => row.name === 'India');
    territoryList.splice(indiaNow + 1, 0, afg);
  }

  const continents = config.continents.map((c) => ({
    name: c.name,
    bonus: c.territories.length * 3,
    territories: c.territories,
    color: continentColor(config, c.name),
  }));

  const land = territoryList.filter((t) => !t.isWater);
  const sea = territoryList.filter((t) => t.isWater);
  log(`\nSummary: ${land.length} land territories, ${sea.length} sea zones`);

  return {
    config,
    territoriesJson: JSON.stringify(territoryList, null, 2),
    continentsJson: JSON.stringify(continents, null, 2),
    territoryCount: territoryList.length,
    continentCount: continents.length,
    sourceLand,
    sourceSea,
    land: land.length,
    sea: sea.length,
  };
}

export function writeConvertOutput(result, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const territoriesPath = path.join(outDir, 'territories.json');
  const continentsPath = path.join(outDir, 'continents.json');
  fs.writeFileSync(territoriesPath, result.territoriesJson);
  fs.writeFileSync(continentsPath, result.continentsJson);
  return { territoriesPath, continentsPath };
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const mapId = args.find((arg) => !arg.startsWith('--')) || '';
  const outIndex = args.indexOf('--out');
  const outDir = outIndex >= 0 ? args[outIndex + 1] : '';
  return { mapId, outDir, check: args.includes('--check') };
}

function filesMatch(a, b) {
  const left = fs.readFileSync(a);
  const right = fs.readFileSync(b);
  return left.length === right.length && left.equals(right);
}

function runCli() {
  const { mapId, outDir, check } = parseArgs(process.argv);
  if (!mapId) {
    console.error('Usage: node tools/convert-map.mjs <mapId> [--out dir] [--check]');
    process.exit(1);
  }
  const result = convertMap(mapId);
  if (check) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-map-'));
    const written = writeConvertOutput(result, tmp);
    const expectedTerritories = path.join(ROOT, result.config.outTerritories);
    const expectedContinents = path.join(ROOT, result.config.outContinents);
    const territoriesOk = filesMatch(written.territoriesPath, expectedTerritories);
    const continentsOk = filesMatch(written.continentsPath, expectedContinents);
    if (!territoriesOk || !continentsOk) {
      console.error(`convert ${mapId} is not byte-identical to the checked-in JSON`);
      process.exit(1);
    }
    console.log(`convert ${mapId} matches ${result.config.outTerritories} and ${result.config.outContinents}`);
    return;
  }
  const dest = outDir
    ? path.resolve(outDir)
    : path.dirname(path.join(ROOT, result.config.outTerritories));
  const written = writeConvertOutput(result, dest);
  console.log(`Wrote ${written.territoriesPath} (${result.territoryCount} territories)`);
  console.log(`Wrote ${written.continentsPath} (${result.continentCount} continents)`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) runCli();
