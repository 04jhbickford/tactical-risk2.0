// V2.81.57-unified.22 — tank blitz regression.
// A tank may pass through an empty enemy land territory. Run: node tools/test-tank-blitz.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const MAP = [
  { name: 'Home', isWater: false, production: 2, connections: ['Gap', 'Sea', 'GunLine', 'FactoryLine'] },
  { name: 'Gap', isWater: false, production: 3, connections: ['Home', 'Front'] },
  { name: 'Front', isWater: false, production: 4, connections: ['Gap'] },
  { name: 'Sea', isWater: true, production: 0, connections: ['Home', 'Beach'] },
  { name: 'Beach', isWater: false, production: 2, connections: ['Sea'] },
  { name: 'GunLine', isWater: false, production: 1, connections: ['Home', 'PastGun'] },
  { name: 'PastGun', isWater: false, production: 1, connections: ['GunLine'] },
  { name: 'FactoryLine', isWater: false, production: 1, connections: ['Home', 'PastFactory'] },
  { name: 'PastFactory', isWater: false, production: 1, connections: ['FactoryLine'] },
  { name: 'Berlin', isWater: false, production: 5, connections: [] },
];

function makeState() {
  const gs = new GameState({ risk: { factions: [] } }, MAP, []);
  gs.players = [
    { id: 'Americans', name: 'Bastion' },
    { id: 'Germans', name: 'Germany', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.territoryState = {
    Home: { owner: 'Americans', isCapital: true },
    Gap: { owner: 'Germans' },
    Front: { owner: 'Germans' },
    Beach: { owner: 'Germans' },
    GunLine: { owner: 'Germans' },
    PastGun: { owner: 'Germans' },
    FactoryLine: { owner: 'Germans' },
    PastFactory: { owner: 'Germans' },
    Berlin: { owner: 'Germans', isCapital: true },
  };
  gs.playerState = {
    Americans: { ipcs: 20, capitalTerritory: 'Home', hasPlacedCapital: true },
    Germans: { ipcs: 20, capitalTerritory: 'Berlin', hasPlacedCapital: true },
  };
  gs.units = {
    Home: [
      { type: 'armour', quantity: 1, owner: 'Americans' },
      { type: 'infantry', quantity: 1, owner: 'Americans' },
      { type: 'artillery', quantity: 1, owner: 'Americans' },
    ],
    Gap: [],
    Front: [{ type: 'infantry', quantity: 1, owner: 'Germans' }],
    Sea: [],
    Beach: [],
    GunLine: [{ type: 'aaGun', quantity: 1, owner: 'Germans' }],
    PastGun: [],
    FactoryLine: [
      { type: 'factory', quantity: 1, owner: 'Germans' },
      { type: 'infantry', quantity: 1, owner: 'Germans' },
    ],
    PastFactory: [],
    Berlin: [],
  };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Home']);
  gs._notify = () => {};
  return gs;
}

function hasTank(gs, territory) {
  return (gs.units[territory] || []).some((unit) => unit.type === 'armour' && unit.owner === 'Americans' && unit.quantity > 0);
}

console.log('=== tank blitz through an empty enemy territory ===');
{
  const gs = makeState();
  const usaBefore = gs.getCollectIncomeAmount('Americans');
  const germanBefore = gs.getCollectIncomeAmount('Germans');
  const moved = gs.moveUnits('Home', 'Front', [{ type: 'armour', quantity: 1 }], unitDefs, {});
  check('the tank reaches the attack', moved.success === true, moved);
  check('the tank is in the attack and not left in the gap', hasTank(gs, 'Front') && !hasTank(gs, 'Gap') && !hasTank(gs, 'Home'));
  check('the empty territory changes owner', gs.getOwner('Gap') === 'Americans');
  check('the attack territory is not captured yet', gs.getOwner('Front') === 'Germans');
  check('IPC income follows the captured territory',
    gs.getCollectIncomeAmount('Americans') === usaBefore + 3
    && gs.getCollectIncomeAmount('Germans') === germanBefore - 3,
    { usa: gs.getCollectIncomeAmount('Americans'), german: gs.getCollectIncomeAmount('Germans'), usaBefore, germanBefore });
  const last = gs.moveHistory[gs.moveHistory.length - 1];
  check('the move records the blitz',
    last && last.from === 'Home' && last.to === 'Front'
    && last.blitzedCaptures?.some((row) => row.territory === 'Gap' && row.previousOwner === 'Germans'),
    last);
  const undone = gs.undoLastMove();
  check('undo restores the gap and the tank',
    undone.success === true
    && gs.getOwner('Gap') === 'Germans'
    && hasTank(gs, 'Home')
    && !hasTank(gs, 'Front')
    && gs.getCollectIncomeAmount('Americans') === usaBefore,
    undone);
}

console.log('=== blocks ===');
{
  const gs = makeState();
  const throughGun = gs.moveUnits('Home', 'PastGun', [{ type: 'armour', quantity: 1 }], unitDefs, {});
  check('an AA gun blocks the blitz', throughGun.success === false && gs.getOwner('GunLine') === 'Germans' && hasTank(gs, 'Home'), throughGun);
  const throughFactory = gs.moveUnits('Home', 'PastFactory', [{ type: 'armour', quantity: 1 }], unitDefs, {});
  check('a factory with units blocks the blitz', throughFactory.success === false && gs.getOwner('FactoryLine') === 'Germans', throughFactory);
  gs.units.FactoryLine = [{ type: 'factory', quantity: 1, owner: 'Germans' }];
  const loneFactory = gs.moveUnits('Home', 'PastFactory', [{ type: 'armour', quantity: 1 }], unitDefs, {});
  check('a factory alone blocks the blitz', loneFactory.success === false && gs.getOwner('FactoryLine') === 'Germans', loneFactory);
  const infantry = gs.moveUnits('Home', 'Front', [{ type: 'infantry', quantity: 1 }], unitDefs, {});
  const artillery = gs.moveUnits('Home', 'Front', [{ type: 'artillery', quantity: 1 }], unitDefs, {});
  check('infantry and artillery cannot blitz', infantry.success === false && artillery.success === false, { infantry, artillery });
  const sea = gs.moveUnits('Home', 'Beach', [{ type: 'armour', quantity: 1 }], unitDefs, {});
  check('a blitz cannot pass through a sea zone', sea.success === false && gs.getOwner('Beach') === 'Germans' && hasTank(gs, 'Home'), sea);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\ntank blitz checks passed');
