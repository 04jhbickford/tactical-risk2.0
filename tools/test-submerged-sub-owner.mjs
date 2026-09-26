// V2.81.57-unified.17 — a submerged sub comes back with its owner.
// Run: node tools/test-submerged-sub-owner.mjs

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
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
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
const { UnitTooltip } = await import(pathToFileURL(join(root, 'src/ui/unitTooltip.js')).href);
const { unitIconForOwner, UNKNOWN_OWNER_LABEL } = await import(pathToFileURL(join(root, 'src/utils/unitIcons.js')).href);
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

function openSea(units) {
  const T = (name, isWater, connections) => ({ name, isWater, connections });
  const gs = new GameState({ risk: { factions: [] } }, [
    T('Caspian Sea Zone', true, ['Kazakh S.S.R.']),
    T('Kazakh S.S.R.', false, ['Caspian Sea Zone']),
  ], []);
  gs.players = [
    { id: 'Germans', name: 'Robert007' },
    { id: 'Americans', name: 'Bastion' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.territoryState = { 'Kazakh S.S.R.': { owner: 'Americans' } };
  gs.playerState = { Germans: {}, Americans: {} };
  gs.units = { 'Caspian Sea Zone': units };
  gs.combatQueue = ['Caspian Sea Zone'];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui._render = () => {};
  ui.showNextCombat();
  return { gs, ui };
}

{
  const { gs, ui } = openSea([
    { type: 'bomber', quantity: 1, owner: 'Germans', moved: true },
    { type: 'submarine', quantity: 1, owner: 'Americans', id: 'sub_def' },
    { type: 'transport', quantity: 1, owner: 'Americans' },
  ]);
  check('bomber battle starts ready', ui.combatState.phase === 'ready');
  ui._submergeSub('defender', 1);
  ui.combatState.defenders = ui.combatState.defenders.filter((unit) => unit.type !== 'transport');
  ui.combatState.winner = 'attacker';
  ui._finalizeCombat();
  const sub = (gs.units['Caspian Sea Zone'] || []).find((unit) => unit.type === 'submarine');
  check('defender sub keeps owner and id', sub?.owner === 'Americans' && sub?.id === 'sub_def', sub);
}

{
  const { gs, ui } = openSea([
    { type: 'submarine', quantity: 1, owner: 'Germans', id: 'sub_atk' },
    { type: 'transport', quantity: 1, owner: 'Americans' },
  ]);
  ui._submergeSub('attacker', 1);
  ui._rollD6 = () => 6;
  ui._rollSubmarineFirstStrike();
  ui.combatState.attackers = [];
  ui.combatState.winner = 'defender';
  ui._finalizeCombat();
  const sub = (gs.units['Caspian Sea Zone'] || []).find((unit) => unit.type === 'submarine');
  check('attacker sub keeps owner and id', sub?.owner === 'Germans' && sub?.id === 'sub_atk', sub);
}

{
  const { gs, ui } = openSea([
    { type: 'bomber', quantity: 1, owner: 'Germans' },
    { type: 'submarine', quantity: 1, owner: 'Americans', id: 'sub_old' },
  ]);
  ui.combatState.defenders = [];
  ui.combatState.submergedSubsToRestore = { attacker: 0, defender: 1 };
  ui.combatState.winner = 'attacker';
  ui._finalizeCombat();
  const sub = (gs.units['Caspian Sea Zone'] || []).find((unit) => unit.type === 'submarine');
  check('old number-form restore uses the defender seat', sub?.owner === 'Americans', sub);
}

{
  const presented = unitIconForOwner('submarine', null, () => null);
  check('null owner draws the sub silhouette', presented.iconPath === 'units/Americans/Submarine.png' && presented.ownerLabel === UNKNOWN_OWNER_LABEL, presented);
  const tip = new UnitTooltip();
  tip.gameState = { hasTech() { return false; }, getPlayer() { return null; } };
  tip.show({
    unitType: 'submarine',
    owner: null,
    quantity: 1,
    unitDef: unitDefs.submarine,
  }, 0, 0);
  check('tooltip says Unknown owner', tip.el.innerHTML.includes('Unknown owner') && !tip.el.innerHTML.includes('>null<') && !tip.el.innerHTML.includes('null'), tip.el.innerHTML);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nsubmerged sub owner checks passed');
