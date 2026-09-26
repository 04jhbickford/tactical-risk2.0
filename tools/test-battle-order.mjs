// V2.81.57-unified.17 — the human player can pick which queued battle opens.
// Run: node tools/test-battle-order.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
const mk = () => ({
  id: '',
  className: '',
  innerHTML: '',
  style: {},
  children: [],
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  appendChild(c) { this.children.push(c); return c; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
});
globalThis.document = {
  documentElement: mk(),
  body: mk(),
  createElement() { return mk(); },
  getElementById() { return null; },
};
globalThis.window ??= globalThis;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')).href);
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')).href);
const { renderCombatBattleList } = await import(pathToFileURL(join(root, 'src/ui/battleOrder.js')).href);
const { MultiplayerGuard } = await import(pathToFileURL(join(root, 'src/multiplayer/multiplayerGuard.js')).href);
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const T = (name, isWater, connections) => ({ name, isWater, connections });
const MAP = [
  T('Sea A', true, ['Land B']),
  T('Land B', false, ['Sea A', 'Land C']),
  T('Land C', false, ['Land B']),
];

function stack(owner) {
  return { type: 'infantry', quantity: 1, owner };
}

function makeGs() {
  const gs = new GameState({ risk: { factions: [] } }, MAP, []);
  gs.players = [
    { id: 'Germans', name: 'Robert007', oderId: 'rob' },
    { id: 'British', name: 'Bastion', oderId: 'bas' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.playerState = { Germans: { ipcs: 0 }, British: { ipcs: 0 } };
  gs.territoryState = {
    'Land B': { owner: 'British' },
    'Land C': { owner: 'British' },
  };
  gs.units = {
    'Sea A': [
      { type: 'cruiser', quantity: 1, owner: 'Germans' },
      { type: 'destroyer', quantity: 1, owner: 'British' },
    ],
    'Land B': [stack('Germans'), stack('British')],
    'Land C': [stack('Germans'), stack('British')],
  };
  gs.combatQueue = ['Sea A', 'Land B', 'Land C'];
  gs.amphibiousAssaultDetails = {
    'Land B': { seaZone: 'Sea A', units: [{ type: 'infantry', quantity: 1, owner: 'Germans' }] },
  };
  return gs;
}

{
  const gs = makeGs();
  const html = renderCombatBattleList(gs);
  check('sidebar rows name each battle', html.includes('Sea A') && html.includes('Land B') && html.includes('Land C'));
  check('amphibious land is blocked until its sea battle', html.includes('disabled') && html.includes('after Sea A'));
  const moved = gs.moveCombatToFront('Land C');
  check('Land C moves to the front', moved.success && gs.combatQueue[0] === 'Land C', gs.combatQueue);
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  const shown = ui.showNextCombat();
  check('showNextCombat opens Land C', shown.shown && ui.currentTerritory === 'Land C');
  const blocked = gs.moveCombatToFront('Land B');
  check('land battle waiting on Sea A is refused', !blocked.success && blocked.reason === 'after Sea A', blocked);
  gs.combatQueue = gs.combatQueue.filter((name) => name !== 'Sea A');
  const freed = gs.moveCombatToFront('Land B');
  check('Land B is allowed after Sea A leaves the queue', freed.success && gs.combatQueue[0] === 'Land B', freed);
}

{
  const gs = makeGs();
  gs.moveCombatToFront('Land C');
  const saved = gs.toJSON();
  const loaded = new GameState({ risk: { factions: [] } }, MAP, []);
  loaded.players = gs.players.map((p) => ({ ...p }));
  loaded.loadFromJSON(saved);
  check('queue order survives save/load', JSON.stringify(loaded.combatQueue) === JSON.stringify(['Land C', 'Sea A', 'Land B']), loaded.combatQueue);
}

{
  const gs = makeGs();
  gs.isMultiplayer = true;
  const guard = new MultiplayerGuard({
    userId: 'bas',
    hasAIAuthority() { return false; },
  });
  guard.wrapGameState(gs);
  const blocked = gs.moveCombatToFront('Land C');
  check('a non-active player is blocked', blocked?.success === false && blocked.error === 'Not your turn', blocked);
  check('the queue stays put', gs.combatQueue[0] === 'Sea A');
}

{
  const aiSource = readFileSync(join(root, 'src/ai/aiController.js'), 'utf8');
  check('AI combat does not pick a battle order', !aiSource.includes('moveCombatToFront'));
}

{
  const phone = renderCombatBattleList(makeGs(), { phone: true });
  check('phone rows use the 44px class', phone.includes('pp-battle-row-phone'));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nbattle order checks passed');
