#!/usr/bin/env node
// Parses TripleA map data files into JSON for the Tactical Risk web app.
// Run: node tactical-risk/tools/convert-data.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAP_DIR = path.join(ROOT, 'map');
const OUT_DIR = path.join(__dirname, '..', 'data');

// --- Territory merges (mainland only) ---
// Each entry merges `from` into `into`: polygons combined, production summed,
// connections unioned, and `from` is deleted from the map.
const MERGES = [
  { from: 'Sinkiang',          into: 'China' },
  // French Indo China kept separate from Kwangtung
  { from: 'Yakut S.S.R.',      into: 'Soviet Far East' },
  { from: 'Afghanistan',       into: 'India' },
  { from: 'Caucasus',          into: 'Ukraine S.S.R.' },
  { from: 'Libya',             into: 'Anglo Sudan Egypt' },
  { from: 'Rio del Oro',       into: 'French West Africa' },
  { from: 'Angola',            into: 'Congo' },
  { from: 'Mozambique',        into: 'Kenya-Rhodesia' },
  { from: 'Gibraltar',         into: 'Spain' },
];

// --- Continent definitions ---
// Updated for Risk-style play with merged territories
// Bonus = 3x number of territories in the continent
// Note: After merges, territory names change (e.g., Sinkiang merged into China)
const CONTINENT_DEFS = [
  { name: 'North America', territories: ['East US','West US','East Canada','West Canada','Mexico','Alaska','Cuba','Panama'] },                    // 8 territories = 24 bonus
  { name: 'South America', territories: ['Brazil','Argentina-Chile','Peru','Columbia'] },                                                          // 4 territories = 12 bonus
  { name: 'Europe', territories: ['United Kingdom','West Europe','Germany','South Europe','East Europe','Eire','Spain','Sweden','Switzerland','Finland Norway'] }, // 10 territories = 30 bonus
  { name: 'Middle East', territories: ['Turkey','Syria Jordan','Saudi Arabia','Persia','India','Kazakh S.S.R.'] },                                 // 6 territories = 18 bonus
  { name: 'Africa', territories: ['Algeria','Anglo Sudan Egypt','French West Africa','French Equatorial Africa','Congo','Kenya-Rhodesia','South Africa','Italian East Africa','Madagascar'] }, // 9 territories = 27 bonus
  { name: 'Asia', territories: ['Russia','Karelia S.S.R.','Ukraine S.S.R.','Novosibirsk','Evenki National Okrug','Soviet Far East','Mongolia','Manchuria','China','Kwangtung','French Indo China'] }, // 11 territories = 33 bonus
  { name: 'Oceania', territories: ['Japan','Borneo Celebes','East Indies','Philippines','Okinawa','Australia','New Zealand','New Guinea','Solomon Islands','Caroline Islands','Hawaiian Islands','Midway','Wake Island'] }, // 13 territories = 39 bonus
];

// Build reverse lookup: territory name -> continent name
const territoryToContinent = {};
for (const c of CONTINENT_DEFS) {
  for (const t of c.territories) {
    territoryToContinent[t] = c.name;
  }
}

// --- Polygon Union Algorithm ---
// For merged territories, just concatenate polygons.
// The renderer will handle hiding internal borders.
function unionPolygons(polygons) {
  return polygons;
}

// --- Parse polygons.txt ---
function parsePolygons() {
  const text = fs.readFileSync(path.join(MAP_DIR, 'polygons.txt'), 'utf8');
  const result = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Format: "TerritoryName  <  (x1,y1) (x2,y2) ... >  <  (x3,y3) ... >"
    const firstAngle = trimmed.indexOf('<');
    if (firstAngle === -1) continue;
    const name = trimmed.substring(0, firstAngle).trim();
    const polyPart = trimmed.substring(firstAngle);
    // Split into individual polygon segments by "> <" or ">  <"
    const segments = polyPart.split(/>\s*</).map(s => s.replace(/[<>]/g, '').trim());
    const polygons = [];
    for (const seg of segments) {
      if (!seg) continue;
      const points = [];
      const matches = seg.matchAll(/\((\d+),(\d+)\)/g);
      for (const m of matches) {
        points.push([parseInt(m[1]), parseInt(m[2])]);
      }
      if (points.length > 0) {
        polygons.push(points);
      }
    }
    if (polygons.length > 0) {
      result[name] = polygons;
    }
  }
  return result;
}

// --- Parse centers.txt ---
function parseCenters() {
  const text = fs.readFileSync(path.join(MAP_DIR, 'centers.txt'), 'utf8');
  const result = {};
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(.+?)\s{2,}\((\d+),(\d+)\)/);
    if (match) {
      result[match[1].trim()] = [parseInt(match[2]), parseInt(match[3])];
    }
  }
  return result;
}

// --- Parse XML ---
function parseXML() {
  const xml = fs.readFileSync(path.join(MAP_DIR, 'games', 'classic_3rd_edition.xml'), 'utf8');

  // Territories
  const territories = {};
  const territoryRegex = /<territory\s+name="([^"]+)"(\s+water="true")?\s*\/>/g;
  let m;
  while ((m = territoryRegex.exec(xml)) !== null) {
    territories[m[1]] = {
      name: m[1],
      isWater: !!m[2],
    };
  }

  // Connections
  const connections = {};
  const connRegex = /<connection\s+t1="([^"]+)"\s+t2="([^"]+)"\s*\/>/g;
  while ((m = connRegex.exec(xml)) !== null) {
    // Skip commented-out connections
    const before = xml.substring(Math.max(0, m.index - 200), m.index);
    if (before.includes('<!--') && !before.includes('-->')) continue;

    const t1 = m[1], t2 = m[2];
    if (!connections[t1]) connections[t1] = new Set();
    if (!connections[t2]) connections[t2] = new Set();
    connections[t1].add(t2);
    connections[t2].add(t1);
  }

  // Territory attachments (production, capital, factory)
  const attachRegex = /<attachment\s+name="territoryAttachment"\s+attachTo="([^"]+)"[^>]*>\s*([\s\S]*?)<\/attachment>/g;
  while ((m = attachRegex.exec(xml)) !== null) {
    const tName = m[1];
    const body = m[2];
    if (!territories[tName]) continue;

    const prodMatch = body.match(/<option\s+name="production"\s+value="(\d+)"\s*\/>/);
    if (prodMatch) territories[tName].production = parseInt(prodMatch[1]);

    const capitalMatch = body.match(/<option\s+name="capital"\s+value="([^"]+)"\s*\/>/);
    if (capitalMatch) {
      territories[tName].isCapital = true;
      territories[tName].capitalOf = capitalMatch[1];
    }

    const factoryMatch = body.match(/<option\s+name="originalFactory"\s+value="true"\s*\/>/);
    if (factoryMatch) territories[tName].hasFactory = true;
  }

  // Territory ownership
  const ownerRegex = /<territoryOwner\s+territory="([^"]+)"\s+owner="([^"]+)"\s*\/>/g;
  while ((m = ownerRegex.exec(xml)) !== null) {
    if (territories[m[1]]) {
      territories[m[1]].originalOwner = m[2];
    }
  }

  return { territories, connections };
}

// --- Main ---
function main() {
  console.log('Parsing polygons.txt...');
  const polygons = parsePolygons();
  console.log(`  Found ${Object.keys(polygons).length} territory polygons`);

  console.log('Parsing centers.txt...');
  const centers = parseCenters();
  console.log(`  Found ${Object.keys(centers).length} territory centers`);

  console.log('Parsing classic_3rd_edition.xml...');
  const { territories, connections } = parseXML();
  console.log(`  Found ${Object.keys(territories).length} territories`);

  // --- Add land bridge connections ---
  // These create direct land connections across water
  const LAND_BRIDGES = [
    ['Eire', 'United Kingdom'],
  ];

  for (const [t1, t2] of LAND_BRIDGES) {
    if (territories[t1] && territories[t2]) {
      if (!connections[t1]) connections[t1] = new Set();
      if (!connections[t2]) connections[t2] = new Set();
      connections[t1].add(t2);
      connections[t2].add(t1);
      console.log(`  Added land bridge: ${t1} <-> ${t2}`);
    }
  }

  // --- Remove unwanted connections ---
  // Remove land bridges to Africa
  const REMOVE_CONNECTIONS = [
    ['Gibraltar', 'French West Africa'],
    ['Gibraltar', 'Rio del Oro'],
    ['Spain', 'French West Africa'],
    ['Spain', 'Rio del Oro'],
    ['Brazil', 'French West Africa'],
    ['Brazil', 'Rio del Oro'],
  ];

  for (const [t1, t2] of REMOVE_CONNECTIONS) {
    if (connections[t1]) connections[t1].delete(t2);
    if (connections[t2]) connections[t2].delete(t1);
  }

  // --- Apply territory merges ---
  const removedNames = new Set();
  for (const { from, into } of MERGES) {
    if (!territories[from] || !territories[into]) {
      console.warn(`  WARN: merge skipped — "${from}" or "${into}" not found`);
      continue;
    }
    // Sum production
    territories[into].production =
      (territories[into].production || 0) + (territories[from].production || 0);

    // Merge and union polygons (removes shared internal edges)
    const fromPolys = polygons[from] || [];
    const intoPolys = polygons[into] || [];
    const combinedPolys = intoPolys.concat(fromPolys);
    polygons[into] = unionPolygons(combinedPolys);
    console.log(`    Polygon union: ${combinedPolys.length} input → ${polygons[into].length} output`);

    // Union connections (drop self-references and references to the removed territory)
    const connsFrom = connections[from] || new Set();
    const connsInto = connections[into] || new Set();
    for (const c of connsFrom) {
      if (c !== into && c !== from) connsInto.add(c);
    }
    connsInto.delete(from);
    connections[into] = connsInto;

    // Rewrite any other territory that connected to `from` so it now connects to `into`
    for (const [tName, cSet] of Object.entries(connections)) {
      if (cSet.has(from)) {
        cSet.delete(from);
        if (tName !== into) cSet.add(into);
      }
    }

    // Remove the merged-away territory
    delete territories[from];
    delete connections[from];
    removedNames.add(from);
    console.log(`  Merged "${from}" into "${into}" (production=${territories[into].production})`);
  }

  // Build final territory data
  const territoryList = [];
  for (const [name, data] of Object.entries(territories)) {
    const entry = {
      name,
      isWater: data.isWater,
    };

    if (!data.isWater) {
      // Risk-style: All land territories produce 1 IPC
      entry.production = 1;
      entry.continent = territoryToContinent[name] || null;
      entry.originalOwner = data.originalOwner || 'Neutral';
      if (data.isCapital) {
        entry.isCapital = true;
        entry.capitalOf = data.capitalOf;
      }
      if (data.hasFactory) {
        entry.hasFactory = true;
      }
    }

    // Connections
    entry.connections = connections[name] ? Array.from(connections[name]).sort() : [];

    // Polygons
    entry.polygons = polygons[name] || [];

    // Center
    entry.center = centers[name] || null;

    territoryList.push(entry);
  }

  // Sort: land territories first, then sea zones, alphabetically within each group
  territoryList.sort((a, b) => {
    if (a.isWater !== b.isWater) return a.isWater ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  // Build continent data (bonus = 3x territory count)
  const continents = CONTINENT_DEFS.map(c => ({
    name: c.name,
    bonus: c.territories.length * 3,
    territories: c.territories,
    color: getContinentColor(c.name),
  }));

  // Build merged territory lookup (for renderer to skip internal borders)
  const mergedWith = {};
  for (const { from, into } of MERGES) {
    mergedWith[into] = mergedWith[into] || [];
    mergedWith[into].push(from);
  }

  // Write output
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  fs.writeFileSync(
    path.join(OUT_DIR, 'territories.json'),
    JSON.stringify(territoryList, null, 2)
  );
  console.log(`Wrote data/territories.json (${territoryList.length} territories)`);

  fs.writeFileSync(
    path.join(OUT_DIR, 'continents.json'),
    JSON.stringify(continents, null, 2)
  );
  console.log(`Wrote data/continents.json (${continents.length} continents)`);

  // Summary
  const land = territoryList.filter(t => !t.isWater);
  const sea = territoryList.filter(t => t.isWater);
  console.log(`\nSummary: ${land.length} land territories, ${sea.length} sea zones`);

  const owners = {};
  for (const t of land) {
    const o = t.originalOwner || 'Neutral';
    owners[o] = (owners[o] || 0) + 1;
  }
  console.log('Ownership:', owners);
}

function getContinentColor(name) {
  // Classic Risk / Axis & Allies inspired color palette
  // Muted, earthy tones that are easy on the eyes
  const colors = {
    'North America': '#C4A35A',      // Tan/Gold (classic Risk yellow)
    'South America': '#8B4513',      // Saddle brown (classic Risk red-brown)
    'Europe': '#4682B4',             // Steel blue (classic Risk blue)
    'Middle East': '#CD853F',        // Peru/tan (desert tones)
    'Africa': '#D2691E',             // Chocolate brown
    'Asia': '#6B8E23',               // Olive drab (military green)
    'Oceania': '#708090',            // Slate gray (classic Risk purple-gray)
  };
  return colors[name] || '#888888';
}

main();
