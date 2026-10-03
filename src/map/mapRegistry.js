// Map registry. Classic points at the files and paths the game already loads.
// Pacific is playable. A missing mapId means classic. An id that is not in
// this table is refused.

import { PACIFIC_VICTORY_CITIES } from './pacificVictory.js';

export const CLASSIC_MAP_ID = 'classic';

export const UNKNOWN_MAP_MESSAGE = "This game uses a map your version doesn't have. Refresh to update.";

// Movement pairs. Same 16 bridges gameState and the map overlay used.
// Order is the gameState list. Connectivity does not depend on order.
export const CLASSIC_LAND_BRIDGES = Object.freeze([
  ['Alaska', 'Soviet Far East'],
  ['East Canada', 'Eire'],
  ['Brazil', 'French West Africa'],
  ['East US', 'Cuba'],
  ['Eire', 'United Kingdom'],
  ['United Kingdom', 'Finland Norway'],
  ['United Kingdom', 'West Europe'],
  ['South Europe', 'Anglo Sudan Egypt'],
  ['Syria Jordan', 'Anglo Sudan Egypt'],
  ['French Indo China', 'East Indies'],
  ['East Indies', 'Australia'],
  ['Australia', 'New Zealand'],
  ['Kenya-Rhodesia', 'Madagascar'],
  ['Spain', 'Algeria'],
  ['Japan', 'Manchuria'],
  ['Italian East Africa', 'Saudi Arabia'],
]);

// Turn-ping power names. Same table discordTurnPing used.
export const CLASSIC_NATION_NAMES = Object.freeze({
  germans: { name: 'Germany', adj: 'German' },
  germany: { name: 'Germany', adj: 'German' },
  german: { name: 'Germany', adj: 'German' },
  british: { name: 'UK', adj: 'British' },
  uk: { name: 'UK', adj: 'British' },
  russians: { name: 'Russia', adj: 'Russian' },
  russia: { name: 'Russia', adj: 'Russian' },
  russian: { name: 'Russia', adj: 'Russian' },
  japanese: { name: 'Japan', adj: 'Japanese' },
  japan: { name: 'Japan', adj: 'Japanese' },
  americans: { name: 'US', adj: 'American' },
  american: { name: 'US', adj: 'American' },
  us: { name: 'US', adj: 'American' },
  usa: { name: 'US', adj: 'American' },
  chinese: { name: 'China', adj: 'Chinese' },
  china: { name: 'China', adj: 'Chinese' },
  anzac: { name: 'ANZAC', adj: 'ANZAC' },
});

// Phone Fit homes and inspect-only lands. Same names mobileShell used.
export const CLASSIC_FACTION_HOMES = Object.freeze({
  Russians: 'Russia',
  Germans: 'Germany',
  British: 'United Kingdom',
  Japanese: 'Japan',
  Americans: 'East US',
  Chinese: 'China',
  ANZAC: 'Australia',
});

export const CLASSIC_PHONE_INSPECT_LANDS = Object.freeze([
  'China',
  'Wake Island',
  'French Indo China',
  'Manchuria',
  'Germany',
  'Japan',
]);

// Graph-derived today. These names are the expected Classic result:
// land bridges connect the first set; the second set has no land step.
export const CLASSIC_ISLAND_CAPITAL_HINTS = Object.freeze({
  connected: Object.freeze(['Japan', 'United Kingdom', 'Eire', 'Australia']),
  seaLocked: Object.freeze(['Philippines', 'Hawaiian Islands', 'Wake Island']),
});

const CLASSIC = Object.freeze({
  id: CLASSIC_MAP_ID,
  name: 'Classic',
  released: true,
  playable: true,
  data: Object.freeze({
    territories: 'data/territories.json',
    continents: 'data/continents.json',
    setup: 'data/setup.json',
    units: 'data/units.json',
  }),
  tiles: Object.freeze({
    baseDir: '../map/baseTiles',
    reliefDir: '../map/reliefTiles',
    smallMap: '../map/smallMap.jpeg',
    cols: 14,
    rows: 8,
    tileSize: 256,
    format: 'png',
    relief: true,
    // Explicit true: phones keep the relief overlay. A later map sets false.
    reliefPhone: true,
    lazy: false,
  }),
  width: 3500,
  height: 2000,
  scrollWrapX: true,
  landBridges: CLASSIC_LAND_BRIDGES,
  islandCapitalHints: CLASSIC_ISLAND_CAPITAL_HINTS,
  nationNames: CLASSIC_NATION_NAMES,
  factionHomes: CLASSIC_FACTION_HOMES,
  phoneInspectLands: CLASSIC_PHONE_INSPECT_LANDS,
  victoryMode: 'classic',
  credits: 'TripleA World War II Classic map assets (base tiles, relief tiles, polygons, centers).',
});

const PACIFIC_NATION_NAMES = Object.freeze({
  japanese: { name: 'Japan', adj: 'Japanese' },
  japan: { name: 'Japan', adj: 'Japanese' },
  americans: { name: 'US', adj: 'American' },
  american: { name: 'US', adj: 'American' },
  us: { name: 'US', adj: 'American' },
  usa: { name: 'US', adj: 'American' },
  chinese: { name: 'China', adj: 'Chinese' },
  china: { name: 'China', adj: 'Chinese' },
  british: { name: 'UK', adj: 'British' },
  uk: { name: 'UK', adj: 'British' },
  anzac: { name: 'ANZAC', adj: 'ANZAC' },
});

const PACIFIC_FACTION_HOMES = Object.freeze({
  Japanese: 'Japan',
  Americans: 'Western United States',
  Chinese: 'Szechwan',
  British: 'India',
  ANZAC: 'New South Wales',
});

// Pacific land bridges. Same one-step movement as Classic, and the
// land-bridges option drops the whole list. There is no Australia
// territory: the Solomon Islands line steps onto Queensland.
const PACIFIC_LAND_BRIDGES = Object.freeze([
  ['Japan', 'Iwo Jima'],
  ['Japan', 'Midway'],
  ['Iwo Jima', 'Wake Island'],
  ['Iwo Jima', 'Philippines'],
  ['Philippines', 'Caroline Islands'],
  ['Philippines', 'Solomon Islands'],
  ['Philippines', 'New Guinea'],
  ['Philippines', 'French Indo China'],
  ['Solomon Islands', 'Queensland'],
  ['Solomon Islands', 'New Britain'],
  ['Wake Island', 'Western United States'],
  ['Wake Island', 'Hawaiian Islands'],
  ['Hawaiian Islands', 'Midway'],
  ['Hawaiian Islands', 'Mexico'],
]);

// Optional Classic set only. Off unless the host turns Extra Pacific
// bridges on. Pacific's fourteen above stay as they are. A pair is
// used only when both territories are land on the Classic board.
// Rob and Bastion, 2–3 Oct 2026: drop Philippines–New Guinea and
// Hawaiian Islands–Mexico; add New Guinea–Solomon Islands,
// Borneo Celebes–New Guinea, West US–Hawaiian Islands,
// Australia–New Guinea, and Japan–Okinawa.
export const CLASSIC_EXTRA_PACIFIC_BRIDGES = Object.freeze([
  ['Philippines', 'Caroline Islands'],
  ['Philippines', 'French Indo China'],
  ['Wake Island', 'Hawaiian Islands'],
  ['Hawaiian Islands', 'Midway'],
  ['Wake Island', 'Okinawa'],
  ['Wake Island', 'Caroline Islands'],
  ['Philippines', 'Okinawa'],
  ['Borneo Celebes', 'Philippines'],
  ['West US', 'Midway'],
  ['New Guinea', 'Solomon Islands'],
  ['Borneo Celebes', 'New Guinea'],
  ['West US', 'Hawaiian Islands'],
  ['Australia', 'New Guinea'],
  ['Japan', 'Okinawa'],
]);

// Graph-derived. New South Wales borders Queensland, Victoria, and
// South Australia. Japan walks to Iwo Jima and Midway. Hawaiian Islands
// walk to Midway, Wake Island, and Mexico. Okinawa has no land step.
const PACIFIC_ISLAND_CAPITAL_HINTS = Object.freeze({
  connected: Object.freeze([
    'New South Wales', 'India', 'Western United States', 'Szechwan',
    'Japan', 'Hawaiian Islands',
  ]),
  seaLocked: Object.freeze(['Okinawa']),
});

const PACIFIC = Object.freeze({
  id: 'pacific',
  name: 'Pacific',
  released: true,
  playable: true,
  data: Object.freeze({
    territories: 'data/maps/pacific/territories.json',
    continents: 'data/maps/pacific/continents.json',
    setup: 'data/maps/pacific/setup.json',
    units: 'data/units.json',
  }),
  tiles: Object.freeze({
    baseDir: '../map/pacific/baseTiles',
    reliefDir: '../map/pacific/reliefTiles',
    smallMap: '../map/pacific/smallMap.jpeg',
    cols: 15,
    rows: 13,
    tileSize: 256,
    format: 'webp',
    relief: true,
    reliefPhone: false,
    lazy: true,
  }),
  width: 3773,
  height: 3213,
  scrollWrapX: false,
  landBridges: PACIFIC_LAND_BRIDGES,
  islandCapitalHints: PACIFIC_ISLAND_CAPITAL_HINTS,
  nationNames: PACIFIC_NATION_NAMES,
  factionHomes: PACIFIC_FACTION_HOMES,
  phoneInspectLands: Object.freeze([
    'Wake Island',
    'Guam',
    'Midway',
    'Iwo Jima',
    'Johnston Island',
    'Formosa',
  ]),
  capitals: Object.freeze({
    Japanese: 'Japan',
    Americans: 'Western United States',
    British: 'India',
    ANZAC: 'New South Wales',
    Chinese: 'Szechwan',
  }),
  victoryCities: PACIFIC_VICTORY_CITIES,
  victoryMode: 'pacificVC',
  credits: 'TripleA World War II Pacific (GPLv3). XML: Veqryn. Unit art: CrystalCT and Veqryn. Relief tiles: Gudkarma. See map/pacific/CREDITS.md.',
});

const MAPS = {
  [CLASSIC.id]: CLASSIC,
  [PACIFIC.id]: PACIFIC,
};

let activeId = CLASSIC_MAP_ID;

export function listMaps() {
  return Object.values(MAPS);
}

export function getMap(id) {
  if (id == null || id === '') return MAPS[CLASSIC_MAP_ID];
  return MAPS[id] || null;
}

export function getActiveMap() {
  return MAPS[activeId] || MAPS[CLASSIC_MAP_ID];
}

export function getActiveMapId() {
  return getActiveMap().id;
}

// Switch the active registry entry. Camera metrics are applied by the caller
// (applyMapMetrics) so this module does not import the camera.
export function activateMap(id) {
  const map = getMap(id);
  if (!map) return null;
  activeId = map.id;
  markMapChrome(map.id);
  return map;
}

// Phone CSS that must not touch Classic is gated on html.map-pacific.
// Classic never receives the class. Unknown ids clear it.
export function markMapChrome(mapId, root = (typeof document !== 'undefined' ? document.documentElement : null)) {
  if (!root?.classList) return false;
  const resolved = resolveMapId(mapId);
  const pacific = resolved.ok && resolved.mapId === 'pacific';
  root.classList.toggle('map-pacific', pacific);
  return pacific;
}

// Missing id is classic. Any other unknown id is refused.
export function resolveMapId(raw) {
  if (raw == null || raw === '') {
    return { ok: true, mapId: CLASSIC_MAP_ID, raw: null };
  }
  const id = String(raw);
  if (MAPS[id]) return { ok: true, mapId: id, raw: id };
  return { ok: false, mapId: null, raw: id, message: UNKNOWN_MAP_MESSAGE };
}

export function isPlayableMapId(raw) {
  const resolved = resolveMapId(raw);
  if (!resolved.ok) return false;
  return !!getMap(resolved.mapId)?.playable;
}

// Missing id loads classic. An unknown id is refused. A known id with no
// data in this build is refused so Classic geometry is not reused for it.
export function loadMapDecision(raw) {
  const resolved = resolveMapId(raw);
  if (!resolved.ok) return { ...resolved, code: 'unknown_map' };
  if (!getMap(resolved.mapId)?.playable) {
    return {
      ok: false,
      mapId: resolved.mapId,
      raw: resolved.raw || resolved.mapId,
      code: 'map_unplayable',
      message: 'That map is not in this build.',
    };
  }
  return { ...resolved, code: null };
}

// Lobby doc, game doc, or saved state. The first explicit id wins.
// A missing id on every slot is classic.
export function mapIdFromDoc(doc, state = null) {
  const raw = firstMapId(
    state?.mapId,
    doc?.state?.mapId,
    doc?.mapId,
    doc?.lobbyData?.settings?.mapId,
    doc?.settings?.mapId,
  );
  return resolveMapId(raw);
}

function firstMapId(...values) {
  for (const value of values) {
    if (value == null || value === '') continue;
    return value;
  }
  return null;
}

export function mapsAllRequested(search) {
  let query = search;
  if (query == null) {
    try {
      query = typeof location !== 'undefined' ? location.search : '';
    } catch {
      query = '';
    }
  }
  const text = String(query || '');
  const params = new URLSearchParams(text.startsWith('?') ? text.slice(1) : text);
  return params.get('maps') === 'all';
}

// Released maps, plus unreleased ones when ?maps=all is set.
export function listPickerMaps(search) {
  const all = mapsAllRequested(search);
  return listMaps().filter((map) => map.released || all);
}

// Relief stays on unless the map sets reliefPhone false AND this is a phone.
export function reliefEnabledForClient(map, { coarse = false, width = 1280 } = {}) {
  const tiles = map?.tiles;
  if (!tiles || tiles.relief === false) return false;
  if (tiles.reliefPhone === false && coarse && width <= 820) return false;
  return true;
}

export function clientLooksLikePhone() {
  try {
    const coarse = typeof window !== 'undefined'
      && !!window.matchMedia?.('(pointer: coarse)')?.matches;
    const width = typeof window !== 'undefined' ? window.innerWidth : 1280;
    return { coarse, width };
  } catch {
    return { coarse: false, width: 1280 };
  }
}
