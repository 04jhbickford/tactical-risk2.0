#!/usr/bin/env node
// Three easy AI games, 10 rounds each. Not part of tools/test-*.mjs.
// Default (no flags) is Pacific 1940 with tactical bombers off:
//   node tools/run-pacific-ai.mjs
// Classic random, option on:
//   node tools/run-pacific-ai.mjs --map classic --setup random --tactical-bombers --steps 2000

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIController } from '../src/ai/aiController.js';
import { GameState } from '../src/state/gameState.js';

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem(key) { return mem.has(key) ? mem.get(key) : null; },
    setItem(key, value) { mem.set(key, String(value)); },
    removeItem(key) { mem.delete(key); },
  };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const read = (rel) => JSON.parse(readFileSync(join(root, rel), 'utf8'));

AIController.prototype._delay = async function silent() {};
AIController.prototype._getActionDelay = function noDelay() { return 0; };
AIController.prototype._scheduleAICheck = function noSchedule() {};
const originalInit = AIController.prototype._initAIPlayers;
AIController.prototype._initAIPlayers = function initWithoutTimer() {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  try { originalInit.call(this); } finally { globalThis.setTimeout = real; }
};

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index < 0 || !process.argv[index + 1]) return fallback;
  return process.argv[index + 1];
}

const mapId = argValue('--map', 'pacific');
const setupMode = argValue('--setup', mapId === 'pacific' ? 'pacific1940' : 'random');
const tacticalBombers = process.argv.includes('--tactical-bombers');
const stepCap = Number(argValue('--steps', '800')) || 800;
const seedArg = argValue('--seed', '');

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const dataRoot = mapId === 'classic' ? 'data' : 'data/maps/pacific';
const setup = read(`${dataRoot}/setup.json`);
const territories = read(`${dataRoot}/territories.json`);
const continents = read(`${dataRoot}/continents.json`);
const unitDefs = read('data/units.json');
const players = setup.risk.factions.map((faction) => ({
  ...faction,
  isAI: true,
  aiDifficulty: 'easy',
}));

const errors = [];
const realError = console.error;
console.error = (...args) => {
  errors.push(args.map((part) => (part instanceof Error ? part.stack || part.message : String(part))).join(' '));
  realError(...args);
};

function fingerprint(gs) {
  const pool = (gs.players || []).reduce((sum, player) => (
    sum + (gs.getTotalUnitsToPlace?.(player.id) || 0)
  ), 0);
  return `${gs.round}|${gs.currentPlayerIndex}|${gs.phase}|${gs.turnPhase}|${gs.gameOver ? 1 : 0}|${gs.unitsPlacedThisRound || 0}|${pool}`;
}

async function playOne(index) {
  if (seedArg !== '') Math.random = mulberry32((Number(seedArg) || 1) + index * 997);
  const started = Date.now();
  const gs = new GameState(setup, territories, continents);
  gs.unitDefs = unitDefs;
  gs.initGame('risk', players, {
    mapId,
    gameOptions: { territorySetup: setupMode, tacticalBombers },
  });
  let tacBought = 0;
  const purchaseUnit = gs.purchaseUnit.bind(gs);
  gs.purchaseUnit = function countTac(type, ...rest) {
    const ok = purchaseUnit(type, ...rest);
    if (ok && type === 'tacticalBomber') tacBought += 1;
    return ok;
  };
  const ai = new AIController();
  ai.unitDefs = unitDefs;
  ai.gameState = gs;
  ai._initAIPlayers();
  let stalls = 0;
  let steps = 0;
  let stuck = 0;
  const beforeErrors = errors.length;
  while (gs.round <= 10 && !gs.gameOver && steps < stepCap) {
    const before = fingerprint(gs);
    try {
      await ai.checkAndProcessAI();
    } catch (err) {
      errors.push(err?.stack || err?.message || String(err));
      break;
    }
    steps += 1;
    if (fingerprint(gs) === before) stuck += 1;
    else stuck = 0;
    if (stuck >= 5) {
      stalls += 1;
      break;
    }
  }
  return {
    game: index,
    rounds: gs.round,
    gameOver: !!gs.gameOver,
    winner: gs.winner || '',
    steps,
    stalls,
    errors: errors.length - beforeErrors,
    tacBought,
    ms: Date.now() - started,
    phase: `${gs.phase}/${gs.turnPhase}`,
    player: gs.currentPlayer?.id || '',
  };
}

const results = [];
for (let i = 1; i <= 3; i += 1) {
  console.log(`starting game ${i}`);
  const result = await playOne(i);
  console.log(JSON.stringify(result));
  results.push(result);
}
const ok = results.every((row) => row.rounds > 10 && row.stalls === 0 && row.errors === 0);
console.log(JSON.stringify({ ok, results }, null, 2));
process.exit(ok ? 0 : 1);
