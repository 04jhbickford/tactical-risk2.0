#!/usr/bin/env node
// Generates setup data for Tactical Risk game modes.
// Outputs: data/setup.json, data/units.json
// Run: node tools/convert-setup.js

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MAP_DIR = path.join(ROOT, 'map');
const OUT_DIR = path.join(ROOT, 'data');

// Territory merge redirects (units from merged territories go to target)
const TERRITORY_REDIRECTS = {
  'French Indo China': 'Kwangtung',
  'Sinkiang': 'China',
  'Mongolia': 'Manchuria',
  'Gibraltar': 'Spain',
};

// === GAME MODES ===

const GAME_MODES = [
  {
    id: 'classic',
    name: 'Classic WW2',
    description: 'Historical 1942 setup with 5 factions',
    enabled: true,
    useHistoricalSetup: true,
  },
  {
    id: 'risk',
    name: 'Risk Style',
    description: 'Random territories, WW2 factions, 80 IPCs each',
    enabled: true,
    useHistoricalSetup: false,
    startingIPCs: 80,
    startingInfantryPerTerritory: 1,
  },
  {
    id: 'draft',
    name: 'Territory Draft',
    description: 'Players take turns drafting territories',
    enabled: false,
  },
];

// === WW2 FACTIONS (used by both modes) ===

const FACTIONS = [
  { id: 'Russians',  name: 'Russians',  color: '#B22222', lightColor: '#DC143C', flag: 'Russians.png', alliance: 'Allies' },
  { id: 'Germans',   name: 'Germans',   color: '#4A4A4A', lightColor: '#6A6A6A', flag: 'Germans.png', alliance: 'Axis' },
  { id: 'British',   name: 'British',   color: '#B8860B', lightColor: '#DAA520', flag: 'British.png', alliance: 'Allies' },
  { id: 'Japanese',  name: 'Japanese',  color: '#FF8C00', lightColor: '#FFA500', flag: 'Japanese.png', alliance: 'Axis' },
  { id: 'Americans', name: 'Americans', color: '#556B2F', lightColor: '#6B8E23', flag: 'Americans.png', alliance: 'Allies' },
];

// === ALLIANCES ===

const ALLIANCES = {
  Axis: {
    name: 'Axis Powers',
    color: '#4A4A4A',
    members: ['Germans', 'Japanese'],
  },
  Allies: {
    name: 'Allied Forces',
    color: '#4169E1',
    members: ['Russians', 'British', 'Americans'],
  },
};

// === UNIT DEFINITIONS ===

const UNIT_DEFINITIONS = {
  infantry:   { cost: 3,  attack: 1, defense: 2, movement: 1, isLand: true, image: 'Infantry.png' },
  armour:     { cost: 5,  attack: 3, defense: 2, movement: 2, isLand: true, image: 'Tank.png' },
  artillery:  { cost: 4,  attack: 2, defense: 2, movement: 1, isLand: true, image: 'Artillery.png' },
  fighter:    { cost: 10, attack: 3, defense: 4, movement: 4, isAir: true, image: 'Fighter.png' },
  bomber:     { cost: 12, attack: 4, defense: 1, movement: 6, isAir: true, image: 'Bomber.png' },
  transport:  { cost: 7,  attack: 0, defense: 0, movement: 2, isSea: true, capacity: 2, image: 'Transport.png' },
  submarine:  { cost: 6,  attack: 2, defense: 1, movement: 2, isSea: true, image: 'Submarine.png' },
  destroyer:  { cost: 8,  attack: 2, defense: 2, movement: 2, isSea: true, image: 'Destroyer.png' },
  cruiser:    { cost: 12, attack: 3, defense: 3, movement: 2, isSea: true, image: 'Cruiser.png' },
  battleship: { cost: 20, attack: 4, defense: 4, movement: 2, isSea: true, hp: 2, image: 'Battleship.png' },
  carrier:    { cost: 14, attack: 1, defense: 2, movement: 2, isSea: true, aircraftCapacity: 2, image: 'Carrier.png' },
  factory:    { cost: 15, attack: 0, defense: 0, movement: 0, isBuilding: true, image: 'Factory.png' },
  aaGun:      { cost: 5,  attack: 0, defense: 0, movement: 1, isLand: true, antiAir: true, image: 'AAGun.png' },
};

// === PARSE CLASSIC SETUP FROM XML ===

function parseClassicSetup() {
  const xml = fs.readFileSync(path.join(MAP_DIR, 'games', 'classic_3rd_edition.xml'), 'utf8');

  // Parse starting PUs
  const startingPUs = {};
  const puRegex = /<resourceGiven\s+player="([^"]+)"\s+resource="PUs"\s+quantity="(\d+)"\s*\/>/g;
  let m;
  while ((m = puRegex.exec(xml)) !== null) {
    startingPUs[m[1]] = parseInt(m[2]);
  }

  // Parse unit placements
  const unitPlacements = {};
  const placementRegex = /<unitPlacement\s+unitType="([^"]+)"\s+territory="([^"]+)"\s+quantity="(\d+)"\s+owner="([^"]+)"\s*\/>/g;
  while ((m = placementRegex.exec(xml)) !== null) {
    const unitType = m[1];
    let territory = m[2];
    const quantity = parseInt(m[3]);
    const owner = m[4];

    if (TERRITORY_REDIRECTS[territory]) {
      territory = TERRITORY_REDIRECTS[territory];
    }

    if (!unitPlacements[territory]) {
      unitPlacements[territory] = [];
    }

    const existing = unitPlacements[territory].find(u => u.type === unitType && u.owner === owner);
    if (existing) {
      existing.quantity += quantity;
    } else {
      unitPlacements[territory].push({ type: unitType, quantity, owner });
    }
  }

  // Parse territory ownership
  const territoryOwners = {};
  const ownerRegex = /<territoryOwner\s+territory="([^"]+)"\s+owner="([^"]+)"\s*\/>/g;
  while ((m = ownerRegex.exec(xml)) !== null) {
    let territory = m[1];
    if (TERRITORY_REDIRECTS[territory]) {
      territory = TERRITORY_REDIRECTS[territory];
    }
    territoryOwners[territory] = m[2];
  }

  return { startingPUs, unitPlacements, territoryOwners };
}

function main() {
  console.log('Generating setup data...');

  const classicData = parseClassicSetup();

  const setup = {
    gameModes: GAME_MODES,

    // Factions (shared by all modes)
    factions: FACTIONS,

    // Alliance definitions
    alliances: ALLIANCES,

    // Classic mode data
    classic: {
      factions: FACTIONS.map(f => ({
        ...f,
        startingPUs: classicData.startingPUs[f.id] || 0,
      })),
      territoryOwners: classicData.territoryOwners,
      unitPlacements: classicData.unitPlacements,
      turnOrder: ['Russians', 'Germans', 'British', 'Japanese', 'Americans'],
    },

    // Risk mode data (uses same factions with flags)
    risk: {
      factions: FACTIONS,
      startingIPCs: 80,
      startingInfantryPerTerritory: 1,
      capitalUnits: ['factory', 'aaGun'],
      maxPlayers: 5,
      minPlayers: 2,
    },
  };

  const units = UNIT_DEFINITIONS;

  // Write output
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  fs.writeFileSync(
    path.join(OUT_DIR, 'setup.json'),
    JSON.stringify(setup, null, 2)
  );
  console.log(`Wrote data/setup.json`);
  console.log(`  ${GAME_MODES.length} game modes`);
  console.log(`  ${FACTIONS.length} factions`);

  fs.writeFileSync(
    path.join(OUT_DIR, 'units.json'),
    JSON.stringify(units, null, 2)
  );
  console.log(`Wrote data/units.json (${Object.keys(units).length} unit types)`);

  // Summary
  console.log('\nClassic faction starting PUs:');
  for (const f of FACTIONS) {
    console.log(`  ${f.name}: ${classicData.startingPUs[f.id] || 0} PUs`);
  }
}

main();
