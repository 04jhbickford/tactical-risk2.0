// V2.81.57-unified.17 — naval turn-ping lines include cargo and carrier aircraft.
// Run: node tools/test-turn-ping-naval-cargo.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
const mk = () => {
  const cs = new Set();
  return {
    style: {},
    className: '',
    classList: {
      add(...n) { n.forEach((x) => cs.add(x)); },
      remove(...n) { n.forEach((x) => cs.delete(x)); },
      contains(n) { return cs.has(n); },
      toggle(name, force) {
        if (force === undefined) {
          if (cs.has(name)) cs.delete(name);
          else cs.add(name);
        } else if (force) cs.add(name);
        else cs.delete(name);
      },
    },
    appendChild(c) { return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
};
globalThis.document ??= {
  documentElement: mk(),
  body: mk(),
  createElement: mk,
  getElementById() { return null; },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')).href);
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')).href);
const { formatRecipientLossSummary } = await import(pathToFileURL(join(root, 'src/multiplayer/discordTurnPing.js')).href);
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const PLAYERS = [
  { id: 'Germans', name: 'Robert007' },
  { id: 'British', name: 'Easy Bot', isAI: true, aiDifficulty: 'easy' },
  { id: 'Americans', name: 'Bastion' },
];

function makeGs() {
  const T = (name, isWater, connections) => ({ name, isWater, connections });
  const gs = new GameState({ risk: { factions: [] } }, [
    T('Red Sea', true, ['Egypt']),
    T('Egypt', false, ['Red Sea']),
  ], []);
  gs.players = PLAYERS.map((p) => ({ ...p }));
  gs.currentPlayerIndex = 1;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.territoryState = { Egypt: { owner: 'British' } };
  gs.playerState = { Germans: { ipcs: 0 }, British: { ipcs: 0 }, Americans: { ipcs: 0 } };
  return gs;
}

function germanLine(gs) {
  return formatRecipientLossSummary(gs.turnEvents, { recipientId: 'Germans', players: gs.players });
}

const SORTED = '-2x Infantry, 1x Carrier, 1x Fighter, 1x Transport lost Red Sea - British Easy AI';

{
  const gs = makeGs();
  gs.units = {
    'Red Sea': [
      { type: 'transport', quantity: 1, owner: 'Germans', id: 'tr1', cargo: [
        { type: 'infantry', owner: 'Germans' },
        { type: 'infantry', owner: 'Germans' },
      ] },
      { type: 'carrier', quantity: 1, owner: 'Germans', id: 'cv1', aircraft: [
        { type: 'fighter', owner: 'Germans' },
      ] },
      { type: 'battleship', quantity: 3, owner: 'British' },
      { type: 'fighter', quantity: 4, owner: 'British' },
    ],
  };
  gs.combatQueue = ['Red Sea'];
  Math.random = () => 0.01;
  let result;
  let guard = 0;
  do {
    result = gs.resolveCombat('Red Sea', unitDefs);
  } while (result && !result.resolved && ++guard < 20);
  const line = germanLine(gs);
  check('AI sea battle lists cargo and aircraft in catalog order', line.split('\n')[0] === SORTED, line);
}

{
  const gs = makeGs();
  gs.units = {
    'Red Sea': [
      { type: 'destroyer', quantity: 1, owner: 'British' },
      { type: 'transport', quantity: 1, owner: 'Germans', id: 'tr1', cargo: [
        { type: 'infantry', owner: 'Germans' },
        { type: 'infantry', owner: 'Germans' },
      ] },
      { type: 'carrier', quantity: 1, owner: 'Germans', id: 'cv1', aircraft: [
        { type: 'fighter', owner: 'Germans' },
      ] },
    ],
  };
  gs.combatQueue = ['Red Sea'];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.showNextCombat();
  ui.combatState.selectedDefenderCasualties = { transport: 1, carrier: 1, fighter: 1 };
  ui._applyCasualties();
  ui._finalizeCombat();
  const line = germanLine(gs);
  check('human combat lists the same cargo line', line.split('\n')[0] === SORTED, line);
}

{
  const gs = makeGs();
  gs.units = {
    'Red Sea': [
      { type: 'destroyer', quantity: 1, owner: 'Germans' },
      { type: 'battleship', quantity: 1, owner: 'British' },
    ],
  };
  gs.combatQueue = ['Red Sea'];
  Math.random = () => 0.01;
  let result;
  let guard = 0;
  do {
    result = gs.resolveCombat('Red Sea', unitDefs);
  } while (result && !result.resolved && ++guard < 20);
  const line = germanLine(gs);
  check('sea battle with no cargo lists only the hull', line.split('\n')[0] === '-1x Destroyer lost Red Sea - British Easy AI', line);
  const defenderLosses = gs.turnEvents.filter((ev) => ev.type === 'combat' && ev.defenderId === 'Germans')
    .flatMap((ev) => Object.keys(ev.defenderLosses || {}));
  check('no-cargo battle adds no carried types', defenderLosses.length === 1 && defenderLosses[0] === 'destroyer', defenderLosses);
}

{
  const gs = makeGs();
  gs.units = {
    'Red Sea': [
      { type: 'carrier', quantity: 1, owner: 'Germans', id: 'cv1', aircraft: [
        { type: 'fighter', owner: 'Americans' },
      ] },
      { type: 'battleship', quantity: 3, owner: 'British' },
    ],
  };
  gs.combatQueue = ['Red Sea'];
  Math.random = () => 0.01;
  let result;
  let guard = 0;
  do {
    result = gs.resolveCombat('Red Sea', unitDefs);
  } while (result && !result.resolved && ++guard < 20);
  const allied = formatRecipientLossSummary(gs.turnEvents, { recipientId: 'Americans', players: gs.players });
  const german = germanLine(gs);
  check('allied fighter is listed for its own owner', allied.split('\n')[0] === '-1x Fighter lost Red Sea - British Easy AI', allied);
  check('carrier owner line does not take the allied fighter', !german.includes('Fighter'), german);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nturn ping naval cargo checks passed');
