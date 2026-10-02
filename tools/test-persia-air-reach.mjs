// Aircraft in Persia can reach French Indo China during combat movement
// while infantry stay in Persia and are not part of the move.
// Run: node tools/test-persia-air-reach.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')).href);
const { combatMoveReachableDests } = await import(pathToFileURL(join(root, 'src/state/combatMoveEligibility.js')).href);

const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const gs = new GameState({ risk: { factions: [] } }, territories, []);
gs.players = [
  { id: 'uk', name: 'UK', isAI: false },
  { id: 'japan', name: 'Japan', isAI: true },
];
gs.currentPlayerIndex = 0;
gs.phase = GAME_PHASES.PLAYING;
gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
gs.playerState = {
  uk: { ipcs: 30, capitalTerritory: 'United Kingdom', hasPlacedCapital: true },
  japan: { ipcs: 20, capitalTerritory: 'Japan', hasPlacedCapital: true },
};
gs.playerTechs = { uk: { unlockedTechs: [] }, japan: { unlockedTechs: [] } };
gs.territoryState = {
  Persia: { owner: 'uk' },
  India: { owner: 'uk' },
  'French Indo China': { owner: 'japan' },
};
gs.friendlyTerritoriesAtTurnStart = new Set(['Persia', 'India']);
gs.units = {
  Persia: [
    { type: 'fighter', quantity: 1, owner: 'uk' },
    { type: 'infantry', quantity: 2, owner: 'uk' },
  ],
  'French Indo China': [
    { type: 'infantry', quantity: 1, owner: 'japan' },
  ],
};

const dests = combatMoveReachableDests(gs, 'Persia', { fighter: 1 }, unitDefs);
const moved = gs.moveUnits(
  'Persia',
  'French Indo China',
  [{ type: 'fighter', quantity: 1 }],
  unitDefs,
);
const persia = gs.units.Persia || [];

check('a selected fighter can reach French Indo China',
  dests.some((dest) => dest.name === 'French Indo China'),
  dests.map((dest) => dest.name).filter((name) => name.includes('Indo') || name === 'India'));
check('the air-only move succeeds while infantry stay behind',
  moved.success === true,
  moved.error);
check('the infantry are still in Persia',
  persia.some((unit) => unit.type === 'infantry' && unit.owner === 'uk' && unit.quantity === 2));
check('the fighter left Persia',
  !persia.some((unit) => unit.type === 'fighter'));

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nPersia air reach checks passed');
