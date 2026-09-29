#!/usr/bin/env node
// Build data/maps/pacific/setup.json from the converted board and the
// 2nd-edition unit placements. Run after tools/convert-map.mjs pacific.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertMap } from '../convert-map.mjs';
import { PACIFIC_CAPITALS, PACIFIC_RUSSIAN_LAND, pacificConvertConfig } from './pacific.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const UNIT_MAP = {
  mech_infantry: 'infantry',
  tactical_bomber: 'tacticalBomber',
  factory_major: 'factory',
  factory_minor: 'factory',
  armour: 'armour',
  infantry: 'infantry',
  artillery: 'artillery',
  fighter: 'fighter',
  bomber: 'bomber',
  aaGun: 'aaGun',
  submarine: 'submarine',
  destroyer: 'destroyer',
  carrier: 'carrier',
  cruiser: 'cruiser',
  battleship: 'battleship',
  transport: 'transport',
};

const DROPPED = new Set(['airfield', 'harbour', 'factory_upgrade']);

const FACTIONS = [
  {
    id: 'Japanese',
    name: 'Japanese',
    color: '#FF8C00',
    lightColor: '#FFA500',
    flag: 'Pacific_Japanese.png',
    alliance: 'Axis',
  },
  {
    id: 'Americans',
    name: 'Americans',
    color: '#556B2F',
    lightColor: '#6B8E23',
    flag: 'Pacific_Americans.png',
    alliance: 'Allies',
  },
  {
    id: 'Chinese',
    name: 'Chinese',
    color: '#8B008B',
    lightColor: '#9932CC',
    flag: 'Chinese.png',
    alliance: 'Allies',
  },
  {
    id: 'British',
    name: 'British',
    color: '#B8860B',
    lightColor: '#DAA520',
    flag: 'Pacific_British.png',
    alliance: 'Allies',
  },
  {
    id: 'ANZAC',
    name: 'ANZAC',
    color: '#008B8B',
    lightColor: '#20B2AA',
    flag: 'ANZAC.png',
    alliance: 'Allies',
  },
];

const TURN_ORDER = ['Japanese', 'Americans', 'Chinese', 'British', 'ANZAC'];

function loadXmlPlacements() {
  const xml = fs.readFileSync(path.join(ROOT, pacificConvertConfig.xml), 'utf8');
  const rows = [];
  const re = /<unitPlacement\s+unitType="([^"]+)"\s+territory="([^"]+)"\s+quantity="(\d+)"\s+owner="([^"]+)"\s*\/>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    rows.push({ type: m[1], territory: m[2], quantity: Number(m[3]), owner: m[4] });
  }
  return rows;
}

function pushUnit(placements, territory, type, quantity, owner) {
  if (!placements[territory]) placements[territory] = [];
  const existing = placements[territory].find((row) => row.type === type && row.owner === owner);
  if (existing) existing.quantity += quantity;
  else placements[territory].push({ type, quantity, owner });
}

function incomeFor(territories, continents, ownerOf) {
  const capitals = new Set(PACIFIC_CAPITALS.map((cap) => cap.territory));
  const byFaction = {};
  for (const faction of FACTIONS) byFaction[faction.id] = { territories: 0, ipc: 0, continents: [] };
  for (const territory of territories) {
    if (territory.isWater || territory.impassable) continue;
    const owner = ownerOf(territory);
    if (!byFaction[owner]) continue;
    byFaction[owner].territories += 1;
    byFaction[owner].ipc += capitals.has(territory.name) ? 10 : (territory.production || 0);
  }
  for (const continent of continents) {
    const owners = new Set(continent.territories.map((name) => {
      const territory = territories.find((row) => row.name === name);
      return territory ? ownerOf(territory) : null;
    }));
    if (owners.size === 1 && byFaction[owners.values().next().value]) {
      const owner = owners.values().next().value;
      byFaction[owner].ipc += continent.bonus;
      byFaction[owner].continents.push(`${continent.name} +${continent.bonus}`);
    }
  }
  return byFaction;
}

export function buildPacificSetup({ log = console.log } = {}) {
  const converted = convertMap('pacific', { log() {} });
  const territories = JSON.parse(converted.territoriesJson);
  const continents = JSON.parse(converted.continentsJson);
  const byName = Object.fromEntries(territories.map((t) => [t.name, t]));
  const remap = pacificConvertConfig.ownerRemap;

  const territoryOwners = {};
  for (const territory of territories) {
    if (territory.isWater || territory.impassable) continue;
    territoryOwners[territory.name] = territory.originalOwner || 'Neutral';
  }

  const unitPlacements = {};
  const dropped = {};
  const substituted = {};
  for (const row of loadXmlPlacements()) {
    if (!byName[row.territory] || byName[row.territory].impassable) continue;
    if (DROPPED.has(row.type)) {
      dropped[row.type] = (dropped[row.type] || 0) + row.quantity;
      continue;
    }
    const type = UNIT_MAP[row.type];
    if (!type) {
      dropped[row.type] = (dropped[row.type] || 0) + row.quantity;
      continue;
    }
    if (type !== row.type) substituted[row.type] = type;
    const owner = remap[row.owner] || row.owner;
    pushUnit(unitPlacements, row.territory, type, row.quantity, owner);
  }

  const garrisoned = [];
  for (const [name, owner] of Object.entries(territoryOwners)) {
    if (owner !== 'Neutral') continue;
    const rows = unitPlacements[name] || [];
    const infantry = rows.find((row) => row.type === 'infantry' && row.owner === 'Neutral');
    if (infantry) continue;
    pushUnit(unitPlacements, name, 'infantry', 1, 'Neutral');
    garrisoned.push(name);
  }

  const capitalAdded = [];
  for (const cap of PACIFIC_CAPITALS) {
    const rows = unitPlacements[cap.territory] || [];
    if (rows.some((row) => row.type === 'factory')) continue;
    pushUnit(unitPlacements, cap.territory, 'factory', 1, cap.owner);
    capitalAdded.push(cap.territory);
  }

  const neutralIncome = incomeFor(territories, continents, (t) => territoryOwners[t.name]);
  const foldedIncome = incomeFor(territories, continents, (t) => {
    const owner = territoryOwners[t.name];
    return owner === 'Neutral' && pacificConvertConfig.ownerRemap.Russians === 'Neutral'
      && continents.find((c) => c.name === 'Soviet Far East')?.territories.includes(t.name)
      ? 'Chinese'
      : owner;
  });

  log('IPC neutral (flat 1, capital 10, continent bonus if held):');
  for (const faction of FACTIONS) {
    const row = neutralIncome[faction.id];
    log(`  ${faction.id}: ${row.territories} territories, ${row.ipc} IPC${row.continents.length ? ` (${row.continents.join(', ')})` : ''}`);
  }
  log('IPC if Soviet Far East is folded into Chinese:');
  for (const faction of FACTIONS) {
    const row = foldedIncome[faction.id];
    log(`  ${faction.id}: ${row.territories} territories, ${row.ipc} IPC${row.continents.length ? ` (${row.continents.join(', ')})` : ''}`);
  }
  log('Neutral garrisons:', garrisoned.length);
  log('Capital factories added:', capitalAdded.join(', ') || 'none');
  log('Dropped:', dropped);
  log('Substituted:', substituted);

  const factions = FACTIONS.map((faction) => ({
    ...faction,
    startingPUs: neutralIncome[faction.id].ipc,
  }));

  return {
    gameModes: [
      {
        id: 'risk',
        name: 'Risk Style',
        description: 'Random territories, Pacific factions',
        enabled: true,
        useHistoricalSetup: false,
        startingIPCs: 80,
        startingInfantryPerTerritory: 1,
      },
      {
        id: 'pacific1940',
        name: 'Pacific 1940 (historical)',
        description: '1940 2nd-edition owners and placements',
        enabled: true,
        useHistoricalSetup: true,
      },
    ],
    turnOrder: TURN_ORDER,
    russianLand: PACIFIC_RUSSIAN_LAND,
    factions,
    alliances: {
      Axis: { name: 'Axis Powers', color: '#FF8C00', members: ['Japanese'] },
      Allies: { name: 'Allied Forces', color: '#4169E1', members: ['Americans', 'Chinese', 'British', 'ANZAC'] },
    },
    risk: { factions },
    pacific1940: {
      factions,
      territoryOwners,
      unitPlacements,
      notes: {
        russianLand: PACIFIC_RUSSIAN_LAND,
        dropped,
        substituted,
        neutralGarrisons: garrisoned,
        capitalFactoriesAdded: capitalAdded,
        incomeNeutral: neutralIncome,
        incomeSovietFoldedIntoChinese: foldedIncome,
      },
    },
  };
}

function runCli() {
  const setup = buildPacificSetup();
  const dest = path.join(ROOT, 'data/maps/pacific/setup.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(setup, null, 2));
  console.log(`Wrote ${dest}`);
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) runCli();
