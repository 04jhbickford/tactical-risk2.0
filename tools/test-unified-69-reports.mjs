// unified.69 — batch 9: land bridges (enemy warships in the bridge's own sea zone block;
// own/allied ships and transports never do; option off never blocks), Wake Island–Midway,
// turn ping after the last deployment round, auto-resolve infantry+artillery parity.
// Run: node tools/test-unified-69-reports.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem(k) { return mem.has(k) ? mem.get(k) : null; },
    setItem(k, v) { mem.set(k, String(v)); },
    removeItem(k) { mem.delete(k); },
  };
}
const { GAME_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { normalizeGameOptions } = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { turnIndexOf, pingDedupeKey } = await import(pathToFileURL(join(root, 'src/multiplayer/discordTurnPing.js')));
const { CLASSIC_EXTRA_PACIFIC_BRIDGES } = await import(pathToFileURL(join(root, 'src/map/mapRegistry.js')));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) { failures += 1; console.error('FAIL:', label, extra === undefined ? '' : extra); }
  else console.log('ok  :', label);
};

// Two bridges crossing different sea zones: Alaska–Soviet Far East (Bering) and
// Kenya–Madagascar (Mozambique). germans and italians are allies; british enemy.
function board() {
  const territories = [
    { name: 'Alaska', isWater: false, connections: ['Western Canada', 'Bering Sea Zone'], production: 2 },
    { name: 'Western Canada', isWater: false, connections: ['Alaska'], production: 1 },
    { name: 'Soviet Far East', isWater: false, connections: ['Bering Sea Zone'], production: 1 },
    { name: 'Bering Sea Zone', isWater: true, connections: ['Alaska', 'Soviet Far East'] },
    { name: 'Kenya-Rhodesia', isWater: false, connections: ['Mozambique Sea Zone'], production: 1 },
    { name: 'Madagascar', isWater: false, connections: ['Mozambique Sea Zone'], production: 1 },
    { name: 'Mozambique Sea Zone', isWater: true, connections: ['Kenya-Rhodesia', 'Madagascar'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'british', name: 'UK', isAI: false },
    { id: 'germans', name: 'Germany', isAI: false },
    { id: 'italians', name: 'Italy', isAI: false },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.territoryState = {};
  for (const t of territories) gs.territoryState[t.name] = { owner: null, isCapital: false };
  gs.territoryState.Alaska = { owner: 'british', isCapital: false };
  gs.territoryState['Soviet Far East'] = { owner: 'germans', isCapital: false };
  gs.territoryState['Kenya-Rhodesia'] = { owner: 'british', isCapital: false };
  gs.territoryState.Madagascar = { owner: 'germans', isCapital: false };
  gs.units.Alaska = [{ type: 'infantry', quantity: 2, owner: 'british' }];
  gs.units['Kenya-Rhodesia'] = [{ type: 'infantry', quantity: 2, owner: 'british' }];
  gs.areAllies = (a, b) => a === b || (['germans', 'italians'].includes(a) && ['germans', 'italians'].includes(b));
  gs._notify = () => {};
  gs.autoSave = () => {};
  return gs;
}
const bridgesOf = (gs) => gs.hasLandBridge('Alaska', 'Soviet Far East') && gs.hasLandBridge('Kenya-Rhodesia', 'Madagascar');

console.log('=== stamp ===');
check('display stamp is V2.81.57-unified.69', GAME_VERSION === 'V2.81.57-unified.69');

console.log('=== 1567474462675177512: bridges work for land attack + movement ===');
{
  const off = board();
  off.gameOptions = normalizeGameOptions({ landBridgeBlocking: false });
  check('fixture has both bridges', bridgesOf(off));
  check('option off: Madagascar reachable by land', off.getReachableTerritoriesForLand('Kenya-Rhodesia', 1, 'british', true).has('Madagascar'));
  const on = board();
  on.gameOptions = normalizeGameOptions({ landBridgeBlocking: true });
  check('option on, empty sea: bridge NOT blocked (root cause: was blocked whenever the option was on)',
    on.landBridgeBlocks('Kenya-Rhodesia', 'Madagascar', 'british') === false
    && on.getReachableTerritoriesForLand('Kenya-Rhodesia', 1, 'british', true).has('Madagascar'));
  const attack = on.moveUnits('Kenya-Rhodesia', 'Madagascar', [{ type: 'infantry', quantity: 1 }], unitDefs);
  check('option on, empty sea: land attack across the bridge is allowed', attack.success === true, attack.error);
  on.turnPhase = TURN_PHASES.NON_COMBAT_MOVE || 'non_combat_move';
  on.territoryState['Soviet Far East'] = { owner: 'british', isCapital: false };
  const ncm = on.moveUnits('Alaska', 'Soviet Far East', [{ type: 'infantry', quantity: 1 }], unitDefs);
  check('option on, empty sea: noncombat move across a bridge is allowed', ncm.success === true, ncm.error);
}

console.log('=== 1567580427349266444: a ship blocks only its own bridge section ===');
{
  const gs = board();
  gs.gameOptions = normalizeGameOptions({ landBridgeBlocking: true });
  gs.units['Bering Sea Zone'] = [{ type: 'destroyer', quantity: 1, owner: 'germans' }];
  check('enemy destroyer in Bering blocks Alaska–Soviet Far East', gs.landBridgeBlocks('Alaska', 'Soviet Far East', 'british') === true);
  check('…but not Kenya–Madagascar', gs.landBridgeBlocks('Kenya-Rhodesia', 'Madagascar', 'british') === false);
}

console.log('=== 1567611138819235982: only enemy ships block ===');
{
  const gs = board();
  gs.gameOptions = normalizeGameOptions({ landBridgeBlocking: true });
  gs.units['Mozambique Sea Zone'] = [{ type: 'cruiser', quantity: 1, owner: 'british' }];
  check('own cruiser does not block own move', gs.landBridgeBlocks('Kenya-Rhodesia', 'Madagascar', 'british') === false);
  gs.units['Mozambique Sea Zone'] = [{ type: 'cruiser', quantity: 1, owner: 'italians' }];
  check('allied (italian) cruiser does not block a german move', gs.landBridgeBlocks('Madagascar', 'Kenya-Rhodesia', 'germans') === false);
  check('…but blocks the british (enemy) move', gs.landBridgeBlocks('Kenya-Rhodesia', 'Madagascar', 'british') === true);
}

console.log('=== 1567613089636155504: transports never block; vacating re-enables ===');
{
  const gs = board();
  gs.gameOptions = normalizeGameOptions({ landBridgeBlocking: true });
  gs.units['Mozambique Sea Zone'] = [{ type: 'transport', quantity: 2, owner: 'germans' }];
  check('enemy transports alone do not block', gs.landBridgeBlocks('Kenya-Rhodesia', 'Madagascar', 'british') === false);
  gs.units['Mozambique Sea Zone'].push({ type: 'battleship', quantity: 1, owner: 'germans' });
  check('enemy battleship blocks', gs.landBridgeBlocks('Kenya-Rhodesia', 'Madagascar', 'british') === true);
  gs.units['Mozambique Sea Zone'] = gs.units['Mozambique Sea Zone'].filter((u) => u.type === 'transport');
  check('battleship leaves (transports stay): bridge re-enabled', gs.landBridgeBlocks('Kenya-Rhodesia', 'Madagascar', 'british') === false);
}

console.log('=== 1567610458838409339: Wake Island–Midway bridge ===');
check('Wake Island–Midway is in the extra Pacific bridge list',
  CLASSIC_EXTRA_PACIFIC_BRIDGES.some(([a, b]) => (a === 'Wake Island' && b === 'Midway') || (a === 'Midway' && b === 'Wake Island')));

console.log('=== 1567336306089132043: turn ping after the last deployment round ===');
{
  const lastPlacement = turnIndexOf({ round: 1, currentPlayerIndex: 0, phase: 'unit_placement', placementRound: 3 });
  const firstPlaying = turnIndexOf({ round: 1, currentPlayerIndex: 0, phase: 'playing' });
  check('first playing turn has a different turn index than seat 0 placement', lastPlacement !== firstPlaying);
  check('…so its dedupe key differs and the first player is pinged',
    pingDedupeKey({ gameId: 'g', turnIndex: lastPlacement, seatId: 's0' }) !== pingDedupeKey({ gameId: 'g', turnIndex: firstPlaying, seatId: 's0' }));
  check('playing indices unchanged from .68', turnIndexOf({ round: 2, currentPlayerIndex: 3 }) === 2 * 64 + 3);
}

console.log('=== 1567685171657052314: auto-resolve infantry+artillery parity ===');
{
  const gs = board();
  gs.gameOptions = normalizeGameOptions({});
  gs._rollDie = (meta) => 2; // every die shows 2: infantry hits only with artillery support (attack 2)
  const units = [{ type: 'infantry', quantity: 2, owner: 'british' }, { type: 'artillery', quantity: 1, owner: 'british' }];
  const atk = gs._rollCombatWithRolls(units, 'attack', unitDefs);
  const infRolls = atk.rolls.filter((r) => r.unit === 'infantry');
  check('one infantry paired with the artillery attacks at 2', infRolls.filter((r) => r.attackValue === 2).length === 1, infRolls);
  check('the unpaired infantry attacks at 1', infRolls.filter((r) => r.attackValue === 1).length === 1, infRolls);
  check('auto-resolve hits = 1 supported infantry + 1 artillery', atk.hits === 2, atk.hits);
  const def = gs._rollCombatWithRolls(units, 'defense', unitDefs);
  check('defense never gets the artillery bonus', def.rolls.filter((r) => r.unit === 'infantry').every((r) => r.defenseValue === unitDefs.infantry.defense));
}

if (failures) { console.error(`\n${failures} check(s) failed`); process.exit(1); }
console.log('\nall unified.69 checks passed');
