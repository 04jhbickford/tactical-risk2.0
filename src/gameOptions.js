// Host-selected game options. Every default matches the game as it plays
// today: 80 IPCs, teams off, 5 seats (Classic can open to 7), 6 units a setup round, the standard
// army, one tech pick per research roll, classic tech, land bridges on,
// extra Pacific bridges off.
// Old saves omit `gameOptions` and load these defaults. SCHEMA stays 11.

import { TECH_SET_CLASSIC, TECH_SET_EXPANDED, TECH_SET_VALUES } from './state/radioDeception.js';

export const DEFAULT_GAME_OPTIONS = Object.freeze({
  startingIPCs: 80,
  teams: false,
  maxPlayers: 5,
  unitsPerRound: 6,
  startingArmy: 'standard',
  multipleTech: false,
  landBridges: true,
  // Random deal is today's setup. Draft is a host option.
  territorySetup: 'random',
  // Dice tokens are spent on the roll, hit or miss. Today's research.
  techAcquisition: 'dice',
  // Classic tech is today's research list. Expanded adds Radio Deception
  // Networks. A missing field loads as classic. Schema stays 11.
  techSet: TECH_SET_CLASSIC,
  // Tactical bombers are off until the host turns them on. Old saves
  // omit the field and load as off. An explicit true or false is kept.
  tacticalBombers: false,
  // Mechanized infantry is off until the host turns it on. Same shape
  // as tactical bombers: a missing field loads off. Schema stays 11.
  mechanizedInfantry: false,
  // Extra Pacific bridges are off until the host turns them on. This is
  // not the Land bridges switch. A missing field loads off. Schema stays 11.
  extraPacificBridges: false,
  // Garrisons are off until the host turns them on. A missing field loads
  // off. Schema stays 11.
  garrisons: false,
  // Nukes lobby switch. Off until the host turns it on. A missing field
  // loads off. It does not change combat. It lists the Rico specialization.
  // Schema stays 11.
  nukes: false,
  // Naval and air are in the game. Only an explicit false removes them.
  // A missing field loads on. Schema stays 11.
  navalUnits: true,
  airUnits: true,
  // Land-bridge blocking is off. Land bridges themselves stay on.
  // Blocking stops a land hop that exists only as a land bridge.
  // Air still uses those links. A missing field loads off.
  landBridgeBlocking: false,
  // Null keeps each territory's own production. A number replaces every
  // non-capital IPC. Capital income stays 10 until capitalIpc is set.
  nonCapitalIpc: null,
  capitalIpc: null,
  // Null keeps capital factory output at 20 and every other factory at 5.
  capitalFactoryOutput: null,
  purchasedFactoryOutput: null,
  // Null keeps the catalog after Light or Heavy. A number replaces every
  // risk starting-row quantity. It does not flatten a Pacific 1940 setup.
  startingUnits: null,
});

export const STARTING_IPC_VALUES = Object.freeze([40, 60, 80, 100, 120, 150]);
export const MAX_PLAYER_VALUES = Object.freeze([2, 3, 4, 5, 6, 7]);
export const UNITS_PER_ROUND_VALUES = Object.freeze([3, 4, 5, 6, 7, 8, 9, 10]);
export const STARTING_ARMY_VALUES = Object.freeze(['standard', 'light', 'heavy']);
export const TERRITORY_SETUP_VALUES = Object.freeze(['random', 'draft']);
// Pacific-only. Classic saves never carry it, and an unknown value still
// falls back to random. normalizeGameOptions keeps an explicit pacific1940.
export const PACIFIC_HISTORICAL_SETUP = 'pacific1940';
export const TECH_ACQUISITION_VALUES = Object.freeze(['dice', 'keep', 'buy']);
// Buy directly: one technology, no dice, paid during Purchase.
export const DIRECT_TECH_IPC_COST = 20;

function pickNumber(value, allowed, fallback) {
  const n = Number(value);
  return allowed.includes(n) ? n : fallback;
}

function pickArmy(value) {
  const army = String(value || '');
  return STARTING_ARMY_VALUES.includes(army) ? army : 'standard';
}

function pickEnum(value, allowed, fallback) {
  const key = String(value || '');
  return allowed.includes(key) ? key : fallback;
}

function pickOptionalInt(value, min, max) {
  if (value == null || value === '' || value === false) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const i = Math.floor(n);
  if (i < min || i > max) return null;
  return i;
}

function pickTerritorySetup(value) {
  const key = String(value || '');
  if (key === PACIFIC_HISTORICAL_SETUP) return PACIFIC_HISTORICAL_SETUP;
  return pickEnum(key, TERRITORY_SETUP_VALUES, DEFAULT_GAME_OPTIONS.territorySetup);
}

export function territorySetupLabel(value, draftName = 'Draft') {
  if (value === PACIFIC_HISTORICAL_SETUP) return 'Pacific 1940 (historical)';
  if (value === 'draft') return draftName || 'Draft';
  return 'Random deal';
}

/** Choices at or above the number of players already seated.
 *  `ceiling` keeps Pacific at its five powers. Classic omits it and can seat 7. */
export function maxPlayerChoices(seated = 0, ceiling) {
  const floor = Math.max(0, Number(seated) || 0);
  const cap = Number(ceiling);
  const choices = MAX_PLAYER_VALUES.filter((n) => n >= floor && (!Number.isFinite(cap) || n <= cap));
  return choices.length ? choices : [DEFAULT_GAME_OPTIONS.maxPlayers];
}

export function clampMaxPlayers(value, seated = 0, ceiling) {
  const choices = maxPlayerChoices(seated, ceiling);
  const n = Number(value);
  if (choices.includes(n)) return n;
  if (Number.isFinite(n) && n > choices[choices.length - 1]) return choices[choices.length - 1];
  return choices[0];
}

/** The disabled `draft` row in data/setup.json is the option source.
 *  Other game modes are not turned on by this. */
export function draftModeSource(setup) {
  const modes = Array.isArray(setup?.gameModes) ? setup.gameModes : [];
  const row = modes.find((mode) => mode && mode.id === 'draft');
  return {
    id: 'draft',
    name: row?.name || 'Territory Draft',
    description: row?.description || 'Players take turns drafting territories',
  };
}

/**
 * Coerce a lobby settings blob or a save field into the option object.
 * Missing fields use today's defaults. `legacy` supplies the pre-panel
 * settings (`startingIPCs`, `teamsEnabled`, `maxPlayers`) so an old lobby
 * still opens with the numbers the host already chose.
 */
export function normalizeGameOptions(raw, legacy = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const old = legacy && typeof legacy === 'object' ? legacy : {};
  const teamsRaw = src.teams !== undefined
    ? src.teams
    : (src.teamsEnabled !== undefined
      ? src.teamsEnabled
      : (old.teams !== undefined ? old.teams : old.teamsEnabled));
  const bridgesRaw = src.landBridges !== undefined ? src.landBridges : old.landBridges;
  const multiRaw = src.multipleTech !== undefined ? src.multipleTech : old.multipleTech;
  const tacRaw = src.tacticalBombers !== undefined ? src.tacticalBombers : old.tacticalBombers;
  const mechRaw = src.mechanizedInfantry !== undefined ? src.mechanizedInfantry : old.mechanizedInfantry;
  const extraRaw = src.extraPacificBridges !== undefined ? src.extraPacificBridges : old.extraPacificBridges;
  const garrisonRaw = src.garrisons !== undefined ? src.garrisons : old.garrisons;
  const nukesRaw = src.nukes !== undefined ? src.nukes : old.nukes;
  const techSetRaw = src.techSet !== undefined ? src.techSet : old.techSet;
  const navalRaw = src.navalUnits !== undefined ? src.navalUnits : old.navalUnits;
  const airRaw = src.airUnits !== undefined ? src.airUnits : old.airUnits;
  const blockRaw = src.landBridgeBlocking !== undefined ? src.landBridgeBlocking : old.landBridgeBlocking;
  const nonCapitalRaw = src.nonCapitalIpc !== undefined ? src.nonCapitalIpc : old.nonCapitalIpc;
  const capitalIpcRaw = src.capitalIpc !== undefined ? src.capitalIpc : old.capitalIpc;
  const capitalFactoryRaw = src.capitalFactoryOutput !== undefined ? src.capitalFactoryOutput : old.capitalFactoryOutput;
  const purchasedFactoryRaw = src.purchasedFactoryOutput !== undefined ? src.purchasedFactoryOutput : old.purchasedFactoryOutput;
  const startingUnitsRaw = src.startingUnits !== undefined ? src.startingUnits : old.startingUnits;
  return {
    startingIPCs: pickNumber(
      src.startingIPCs ?? old.startingIPCs,
      STARTING_IPC_VALUES,
      DEFAULT_GAME_OPTIONS.startingIPCs,
    ),
    teams: teamsRaw === true,
    maxPlayers: pickNumber(
      src.maxPlayers ?? old.maxPlayers,
      MAX_PLAYER_VALUES,
      DEFAULT_GAME_OPTIONS.maxPlayers,
    ),
    unitsPerRound: pickNumber(
      src.unitsPerRound ?? old.unitsPerRound,
      UNITS_PER_ROUND_VALUES,
      DEFAULT_GAME_OPTIONS.unitsPerRound,
    ),
    startingArmy: pickArmy(src.startingArmy ?? old.startingArmy),
    multipleTech: multiRaw === true,
    // Default ON. Only an explicit false removes the bridges.
    landBridges: bridgesRaw === false ? false : true,
    territorySetup: pickTerritorySetup(src.territorySetup ?? old.territorySetup),
    techAcquisition: pickEnum(
      src.techAcquisition ?? old.techAcquisition,
      TECH_ACQUISITION_VALUES,
      DEFAULT_GAME_OPTIONS.techAcquisition,
    ),
    // Default OFF. Only an explicit true adds tactical bombers.
    tacticalBombers: tacRaw === true,
    // Default OFF. Only an explicit true adds mechanized infantry.
    mechanizedInfantry: mechRaw === true,
    // Default OFF. Only an explicit true adds the extra Pacific crossings
    // on Classic. The Land bridges switch is unchanged.
    extraPacificBridges: extraRaw === true,
    // Default OFF. Only an explicit true places garrisons.
    garrisons: garrisonRaw === true,
    // Default OFF. Only an explicit true lists Rico. Combat is unchanged.
    nukes: nukesRaw === true,
    // Default classic. Only an explicit expanded unlocks the extra tech.
    techSet: pickEnum(techSetRaw, TECH_SET_VALUES, DEFAULT_GAME_OPTIONS.techSet),
    // Default ON. Only an explicit false removes that family.
    navalUnits: navalRaw === false ? false : true,
    airUnits: airRaw === false ? false : true,
    // Default OFF. Only an explicit true blocks land-only bridge hops.
    landBridgeBlocking: blockRaw === true,
    nonCapitalIpc: pickOptionalInt(nonCapitalRaw, 0, 20),
    capitalIpc: pickOptionalInt(capitalIpcRaw, 0, 50),
    capitalFactoryOutput: pickOptionalInt(capitalFactoryRaw, 0, 50),
    purchasedFactoryOutput: pickOptionalInt(purchasedFactoryRaw, 0, 50),
    startingUnits: pickOptionalInt(startingUnitsRaw, 0, 20),
  };
}

export function navalUnitsEnabled(gameOptions) {
  return gameOptions?.navalUnits !== false;
}

export function airUnitsEnabled(gameOptions) {
  return gameOptions?.airUnits !== false;
}

export function landBridgeBlockingEnabled(gameOptions) {
  return gameOptions?.landBridgeBlocking === true;
}

const SEA_UNIT_TYPES = new Set(['transport', 'submarine', 'destroyer', 'cruiser', 'battleship', 'carrier']);
const AIR_UNIT_TYPES = new Set(['fighter', 'bomber', 'tacticalBomber']);

export function unitFamilyEnabled(gameOptions, type, unitDef) {
  const sea = !!(unitDef?.isSea || SEA_UNIT_TYPES.has(type));
  const air = !!(unitDef?.isAir || AIR_UNIT_TYPES.has(type));
  if (sea && !navalUnitsEnabled(gameOptions)) return false;
  if (air && !airUnitsEnabled(gameOptions)) return false;
  return true;
}

export function capitalIpcValue(gameOptions) {
  const n = pickOptionalInt(gameOptions?.capitalIpc, 0, 50);
  return n == null ? 10 : n;
}

export function nonCapitalIpcOverride(gameOptions) {
  return pickOptionalInt(gameOptions?.nonCapitalIpc, 0, 20);
}

export function capitalFactoryOutputValue(gameOptions) {
  const n = pickOptionalInt(gameOptions?.capitalFactoryOutput, 0, 50);
  return n == null ? 20 : n;
}

export function purchasedFactoryOutputValue(gameOptions) {
  const n = pickOptionalInt(gameOptions?.purchasedFactoryOutput, 0, 50);
  return n == null ? 5 : n;
}

export function startingUnitsCount(gameOptions) {
  return pickOptionalInt(gameOptions?.startingUnits, 0, 20);
}

export function applyStartingUnitCount(pool, count) {
  if (count == null) return pool;
  const mapRows = (rows) => (rows || []).map((row) => ({
    type: row.type,
    quantity: count,
  })).filter((row) => row.quantity > 0);
  return {
    land: mapRows(pool?.land),
    naval: mapRows(pool?.naval),
  };
}

export function stripDisabledUnitRows(pool, gameOptions) {
  const keep = (row) => unitFamilyEnabled(gameOptions, row?.type, null) && (Number(row?.quantity) || 0) > 0;
  return {
    land: (pool?.land || []).filter(keep),
    naval: (pool?.naval || []).filter(keep),
  };
}

export function isStandardRules(raw, legacy) {
  const o = normalizeGameOptions(raw, legacy);
  return o.startingIPCs === DEFAULT_GAME_OPTIONS.startingIPCs
    && o.teams === DEFAULT_GAME_OPTIONS.teams
    && o.maxPlayers === DEFAULT_GAME_OPTIONS.maxPlayers
    && o.unitsPerRound === DEFAULT_GAME_OPTIONS.unitsPerRound
    && o.startingArmy === DEFAULT_GAME_OPTIONS.startingArmy
    && o.multipleTech === DEFAULT_GAME_OPTIONS.multipleTech
    && o.landBridges === DEFAULT_GAME_OPTIONS.landBridges
    && o.territorySetup === DEFAULT_GAME_OPTIONS.territorySetup
    && o.techAcquisition === DEFAULT_GAME_OPTIONS.techAcquisition
    && o.tacticalBombers === DEFAULT_GAME_OPTIONS.tacticalBombers
    && o.mechanizedInfantry === DEFAULT_GAME_OPTIONS.mechanizedInfantry
    && o.extraPacificBridges === DEFAULT_GAME_OPTIONS.extraPacificBridges
    && o.garrisons === DEFAULT_GAME_OPTIONS.garrisons
    && o.nukes === DEFAULT_GAME_OPTIONS.nukes
    && o.techSet === DEFAULT_GAME_OPTIONS.techSet
    && o.navalUnits === true
    && o.airUnits === true
    && o.landBridgeBlocking === false
    && o.nonCapitalIpc == null
    && (o.capitalIpc == null || o.capitalIpc === 10)
    && (o.capitalFactoryOutput == null || o.capitalFactoryOutput === 20)
    && (o.purchasedFactoryOutput == null || o.purchasedFactoryOutput === 5)
    && o.startingUnits == null;
}

/** Live summary. Standard rules, or "Custom: Heavy army, 8 per round, no land bridges". */
export function describe(raw, legacy) {
  const o = normalizeGameOptions(raw, legacy);
  const parts = [];
  if (o.startingArmy === 'heavy') parts.push('Heavy army');
  else if (o.startingArmy === 'light') parts.push('Light army');
  if (o.unitsPerRound !== DEFAULT_GAME_OPTIONS.unitsPerRound) {
    parts.push(`${o.unitsPerRound} per round`);
  }
  if (!o.landBridges) parts.push('no land bridges');
  if (o.startingIPCs !== DEFAULT_GAME_OPTIONS.startingIPCs) {
    parts.push(`${o.startingIPCs} IPCs`);
  }
  if (o.teams) parts.push('Teams');
  if (o.maxPlayers !== DEFAULT_GAME_OPTIONS.maxPlayers) parts.push(`max ${o.maxPlayers}`);
  if (o.multipleTech) parts.push('multiple breakthroughs');
  if (o.territorySetup === 'draft') parts.push('Draft territories');
  if (o.territorySetup === PACIFIC_HISTORICAL_SETUP) parts.push('Pacific 1940');
  if (o.techAcquisition === 'keep') parts.push('keep tech tokens');
  if (o.techAcquisition === 'buy') parts.push(`buy tech (${DIRECT_TECH_IPC_COST})`);
  if (o.tacticalBombers) parts.push('tactical bombers');
  if (o.mechanizedInfantry) parts.push('mechanized infantry');
  if (o.extraPacificBridges) parts.push('extra Pacific bridges');
  if (o.garrisons) parts.push('garrisons');
  if (o.nukes) parts.push('nukes');
  if (o.techSet === TECH_SET_EXPANDED) parts.push('expanded tech');
  if (!o.navalUnits) parts.push('no naval');
  if (!o.airUnits) parts.push('no air');
  if (o.landBridgeBlocking) parts.push('land bridges blocked');
  if (o.nonCapitalIpc != null) parts.push(`territory ${o.nonCapitalIpc} IPC`);
  if (o.capitalIpc != null && o.capitalIpc !== 10) parts.push(`capital ${o.capitalIpc} IPC`);
  if (o.capitalFactoryOutput != null && o.capitalFactoryOutput !== 20) {
    parts.push(`capital factory ${o.capitalFactoryOutput}`);
  }
  if (o.purchasedFactoryOutput != null && o.purchasedFactoryOutput !== 5) {
    parts.push(`factory ${o.purchasedFactoryOutput}`);
  }
  if (o.startingUnits != null) parts.push(`starting units ${o.startingUnits}`);
  if (parts.length === 0) return 'Standard rules';
  return `Custom: ${parts.join(', ')}`;
}

/** Open Games / My Games chip. */
export function rulesChip(raw, legacy) {
  return isStandardRules(raw, legacy) ? 'Standard rules' : 'Custom rules';
}

export function phoneOptionsLabel(raw, legacy) {
  return isStandardRules(raw, legacy) ? 'Standard' : 'Custom';
}

/** Joiner edits never reach updateSettings. Host-only, same error the lobby already returns. */
export function settingsEditError({ isHost } = {}) {
  if (isHost === true) return null;
  return 'Only host can update settings';
}

export function mergeGameOptionsIntoSettings(settings, raw) {
  const base = settings && typeof settings === 'object' ? settings : {};
  const gameOptions = normalizeGameOptions(raw, base);
  return {
    ...base,
    maxPlayers: gameOptions.maxPlayers,
    startingIPCs: gameOptions.startingIPCs,
    teamsEnabled: gameOptions.teams,
    gameOptions,
  };
}

export function optionsFromSettings(settings) {
  return normalizeGameOptions(settings?.gameOptions, settings || {});
}

// Doc-level copy. A unified.14.1 push rewrites `state` and omits
// territorySetup / techAcquisition. It does not delete sibling fields, so
// this copy survives and load restores the keys the live options lost.
export const PROTECTED_OPTION_KEYS = Object.freeze([
  'territorySetup',
  'techAcquisition',
  'tacticalBombers',
  'mechanizedInfantry',
  'extraPacificBridges',
  'garrisons',
  'nukes',
  'techSet',
  'navalUnits',
  'airUnits',
  'landBridgeBlocking',
  'nonCapitalIpc',
  'capitalIpc',
  'capitalFactoryOutput',
  'purchasedFactoryOutput',
  'startingUnits',
]);

export function protectedGameOptions(raw) {
  return normalizeGameOptions(raw);
}

export function restoreProtectedGameOptions(state, mirror) {
  if (!state || typeof state !== 'object') return state;
  if (!mirror || typeof mirror !== 'object') return state;
  const live = state.gameOptions && typeof state.gameOptions === 'object'
    ? state.gameOptions
    : null;
  const patch = {};
  for (const key of PROTECTED_OPTION_KEYS) {
    const missing = !live || live[key] == null || live[key] === '';
    if (missing && mirror[key] != null && mirror[key] !== '') patch[key] = mirror[key];
  }
  if (!Object.keys(patch).length) return state;
  return {
    ...state,
    gameOptions: { ...(live || {}), ...patch },
  };
}

/**
 * Light is −⅓, Heavy is +⅓, rounded to the nearest unit.
 * Infantry never drops below 1. Standard returns the same quantities.
 */
export function scaleQuantity(quantity, army, type) {
  const qty = Number(quantity) || 0;
  if (army !== 'light' && army !== 'heavy') return qty;
  const factor = army === 'light' ? (2 / 3) : (4 / 3);
  let next = Math.round(qty * factor);
  if (type === 'infantry') next = Math.max(1, next);
  if (next < 0) next = 0;
  return next;
}

export function scaleStartingUnits(base, army) {
  const mode = army === 'light' || army === 'heavy' ? army : 'standard';
  const mapRows = (rows) => (rows || []).map((row) => {
    const quantity = scaleQuantity(row.quantity, mode, row.type);
    return { type: row.type, quantity };
  }).filter((row) => mode === 'standard' || row.quantity > 0);
  return {
    land: mapRows(base?.land),
    naval: mapRows(base?.naval),
  };
}

export function startingArmyTotals(base, army) {
  const pool = scaleStartingUnits(base, army);
  const sum = (rows) => rows.reduce((n, row) => n + (Number(row.quantity) || 0), 0);
  const land = sum(pool.land);
  const naval = sum(pool.naval);
  return { land, naval, total: land + naval, pool };
}

/** Read-only rows for Game Rules. */
export function optionRows(raw, legacy) {
  const o = normalizeGameOptions(raw, legacy);
  const army = o.startingArmy === 'light' ? 'Light' : o.startingArmy === 'heavy' ? 'Heavy' : 'Standard';
  return [
    ['Starting IPCs', String(o.startingIPCs)],
    ['Teams', o.teams ? 'On' : 'Off'],
    ['Max players', String(o.maxPlayers)],
    ['Units per setup round', String(o.unitsPerRound)],
    ['Starting army', army],
    ['Territories', territorySetupLabel(o.territorySetup)],
    ['Multiple tech breakthroughs', o.multipleTech ? 'On' : 'Off'],
    ['Tech', techAcquisitionLabel(o.techAcquisition)],
    ['Land bridges', o.landBridges ? 'On' : 'Off'],
    ['Extra Pacific bridges', o.extraPacificBridges ? 'On' : 'Off'],
    ['Tactical bombers', o.tacticalBombers ? 'On' : 'Off'],
    ['Mechanized infantry', o.mechanizedInfantry ? 'On' : 'Off'],
    ['Garrisons', o.garrisons ? 'On' : 'Off'],
    ['Nukes', o.nukes ? 'On' : 'Off'],
    ['Tech tree', o.techSet === TECH_SET_EXPANDED ? 'Expanded tech' : 'Classic tech'],
    ['Naval units', o.navalUnits ? 'On' : 'Off'],
    ['Air units', o.airUnits ? 'On' : 'Off'],
    ['Land-bridge blocking', o.landBridgeBlocking ? 'On' : 'Off'],
    ['Territory IPC', o.nonCapitalIpc == null ? 'Map' : String(o.nonCapitalIpc)],
    ['Capital IPC', o.capitalIpc == null ? '10' : String(o.capitalIpc)],
    ['Capital factory', o.capitalFactoryOutput == null ? '20' : String(o.capitalFactoryOutput)],
    ['Purchased factory', o.purchasedFactoryOutput == null ? '5' : String(o.purchasedFactoryOutput)],
    ['Starting units', o.startingUnits == null ? 'Standard' : String(o.startingUnits)],
  ];
}

export function sliderReadout(name, value) {
  if (value == null || Number(value) < 0) {
    if (name === 'nonCapitalIpc') return 'Map';
    if (name === 'capitalIpc') return '10';
    if (name === 'capitalFactoryOutput') return '20';
    if (name === 'purchasedFactoryOutput') return '5';
    if (name === 'startingUnits') return 'Standard';
    return '';
  }
  return String(value);
}

export function techAcquisitionLabel(mode) {
  if (mode === 'keep') return 'Keep tokens until success';
  if (mode === 'buy') return `Buy directly (${DIRECT_TECH_IPC_COST} IPCs)`;
  return 'Dice tokens';
}

/** How many distinct techs a research roll may pick. Off (today) is at most one. */
export function techPicksFromRolls(rolls, { multipleTech = false } = {}) {
  const sixes = (rolls || []).filter((face) => face === 6).length;
  if (multipleTech) return sixes;
  return sixes > 0 ? 1 : 0;
}
