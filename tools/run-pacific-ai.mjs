#!/usr/bin/env node
// Three AI-only Pacific 1940 games, 10 rounds each.
// Not part of tools/test-*.mjs. Run: node tools/run-pacific-ai.mjs

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

const setup = read('data/maps/pacific/setup.json');
const territories = read('data/maps/pacific/territories.json');
const continents = read('data/maps/pacific/continents.json');
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
  return `${gs.round}|${gs.currentPlayerIndex}|${gs.phase}|${gs.turnPhase}|${gs.gameOver ? 1 : 0}`;
}

async function playOne(index) {
  const started = Date.now();
  const gs = new GameState(setup, territories, continents);
  gs.unitDefs = unitDefs;
  gs.initGame('risk', players, {
    mapId: 'pacific',
    gameOptions: { territorySetup: 'pacific1940', tacticalBombers: false },
  });
  const ai = new AIController();
  ai.unitDefs = unitDefs;
  ai.gameState = gs;
  ai._initAIPlayers();
  let stalls = 0;
  let steps = 0;
  let stuck = 0;
  const beforeErrors = errors.length;
  while (gs.round <= 10 && !gs.gameOver && steps < 800) {
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
