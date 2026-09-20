// V2.81.56: combat capture must serialize without undefined so Firestore
// can persist the owner flip. Also: leftover NCM stack; purchase owner.
// Run: node tools/test-territory-flip-persist.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}

function makeEl() {
  const classSet = new Set();
  const el = {
    id: '',
    className: '',
    innerHTML: '',
    style: {},
    children: [],
    classList: {
      add(...names) {
        names.forEach((n) => classSet.add(n));
        el.className = [...classSet].join(' ');
      },
      remove(...names) {
        names.forEach((n) => classSet.delete(n));
        el.className = [...classSet].join(' ');
      },
      contains(name) { return classSet.has(name); },
      toggle(name, force) {
        if (force === undefined) {
          if (classSet.has(name)) this.remove(name);
          else this.add(name);
        } else if (force) this.add(name);
        else this.remove(name);
      },
    },
    appendChild(child) { this.children.push(child); return child; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
  };
  return el;
}

globalThis.document = {
  documentElement: makeEl(),
  body: makeEl(),
  createElement() { return makeEl(); },
  getElementById() { return null; },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { omitUndefinedDeep, findUndefinedPaths, persistableUnit } =
  await import(pathToFileURL(join(root, 'src/state/persistState.js')));
const { CombatUI } =
  await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));

const unitDefs = {
  infantry: { cost: 3, attack: 1, defense: 2, movement: 1, isLand: true },
  fighter: { cost: 10, attack: 3, defense: 4, movement: 4, isAir: true },
};

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

function makeUsTheater() {
  const territories = [
    { name: 'Western Canada', isWater: false, connections: ['Western United States'] },
    { name: 'Western United States', isWater: false, connections: ['Western Canada', 'Eastern United States'] },
    { name: 'Eastern United States', isWater: false, connections: ['Western United States'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'usa', name: 'Robert', oderId: 'robert', color: '#3a7' },
    { id: 'ger', name: 'Sean', oderId: 'sean', color: '#c83' },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.territoryState = {
    'Western Canada': { owner: 'ger' },
    'Western United States': { owner: 'usa' },
    'Eastern United States': { owner: 'usa' },
  };
  gs.playerState = {
    usa: { ipcs: 40, hasPlacedCapital: true, capitalTerritory: 'Eastern United States' },
    ger: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'Germany' },
  };
  gs.units = {
    'Western Canada': [
      { type: 'infantry', quantity: 2, owner: 'usa' },
      { type: 'infantry', quantity: 1, owner: 'ger' },
    ],
    'Western United States': [
      { type: 'infantry', quantity: 3, owner: 'usa' },
    ],
  };
  gs.combatQueue = ['Western Canada'];
  gs.friendlyTerritoriesAtTurnStart = new Set(['Western United States', 'Eastern United States']);
  return gs;
}

console.log('=== Version ===');
check('GAME_VERSION is V2.81.57-dual-path.6', GAME_VERSION === 'V2.81.57-dual-path.6');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== omitUndefinedDeep ===');
{
  const cleaned = omitUndefinedDeep({
    a: 1,
    b: undefined,
    nest: { c: undefined, d: 'ok' },
    list: [1, undefined, { e: undefined }],
  });
  check('drops undefined keys', cleaned.b === undefined && !('b' in cleaned));
  check('drops nested undefined keys', !('c' in cleaned.nest) && cleaned.nest.d === 'ok');
  check('array holes become null (Firestore-safe)', cleaned.list[1] === null);
  check('findUndefinedPaths sees the poison',
    findUndefinedPaths({ turnEvents: [{ attackerLosses: undefined }] })
      .includes('turnEvents[0].attackerLosses'));
  check('persistableUnit drops UI-only fields',
    persistableUnit({ type: 'infantry', quantity: 2, owner: 'usa', fromCarrier: true, landingOptions: [] })
      .fromCarrier === undefined
    && persistableUnit({ type: 'infantry', quantity: 2, owner: 'usa' }).type === 'infantry');
}

console.log('=== logCombat no longer poisons turnEvents ===');
{
  const gs = makeUsTheater();
  gs.logCombat({
    territory: 'Western Canada',
    attacker: 'Robert',
    defender: 'Sean',
    winner: 'attacker',
    attackerSurvivors: 2,
    defenderSurvivors: 0,
  });
  const ev = gs.turnEvents[gs.turnEvents.length - 1];
  check('missing losses become 0, not undefined',
    ev.attackerLosses === 0 && ev.defenderLosses === 0);
  check('outcome uses winner token, not player name', ev.outcome === 'attacker');
  check('toJSON after logCombat has no undefined',
    findUndefinedPaths(gs.toJSON()).length === 0);
}

console.log('=== CombatUI finalize flips owner and stays persistable ===');
{
  const gs = makeUsTheater();
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.showNextCombat();
  ui.combatState.phase = 'resolved';
  ui.combatState.winner = 'attacker';
  ui.combatState.defenders = [];
  ui.combatState.totalAttackerLosses = { infantry: 0 };
  ui.combatState.totalDefenderLosses = { infantry: 1 };
  ui._finalizeCombat();

  check('Western Canada owner flips to USA',
    gs.getOwner('Western Canada') === 'usa');
  check('combat queue dequeued', gs.combatQueue.length === 0);
  check('surviving INF stay on the hex, marked moved',
    (gs.units['Western Canada'] || []).some((u) => u.type === 'infantry' && u.owner === 'usa' && u.quantity === 2 && u.moved));
  const json = gs.toJSON();
  check('post-finalize toJSON has no undefined (Firestore-safe)',
    findUndefinedPaths(json).length === 0);
  check('serialized owner is the conqueror',
    json.territoryState['Western Canada'].owner === 'usa');
}

console.log('=== NCM leftover stack can take a second dest ===');
{
  const gs = makeUsTheater();
  gs.territoryState['Western Canada'].owner = 'usa';
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  const first = gs.moveUnits(
    'Western United States',
    'Eastern United States',
    [{ type: 'infantry', quantity: 2 }],
    unitDefs,
  );
  check('first NCM 2 INF West US → East US succeeds', first.success === true);
  const leftover = (gs.units['Western United States'] || [])
    .find((u) => u.type === 'infantry' && u.owner === 'usa');
  check('1 INF remains unmoved at West US',
    leftover?.quantity === 1 && !leftover.moved);
  const second = gs.moveUnits(
    'Western United States',
    'Western Canada',
    [{ type: 'infantry', quantity: 1 }],
    unitDefs,
  );
  check('leftover INF can NCM West US → friendly West Canada',
    second.success === true);
  const blocked = makeUsTheater();
  blocked.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  const enemy = blocked.moveUnits(
    'Western United States',
    'Western Canada',
    [{ type: 'infantry', quantity: 1 }],
    unitDefs,
  );
  check('same leftover cannot NCM into still-German West Canada',
    enemy.success === false
    && /enemy territory/i.test(enemy.error || ''));
}

console.log('=== Purchase fighters keep an owner ===');
{
  const gs = makeUsTheater();
  gs.turnPhase = TURN_PHASES.PURCHASE;
  const ok = gs.purchaseForMobilization('fighter', 2, unitDefs);
  check('purchaseForMobilization succeeds', ok === true);
  const mine = gs.getPendingPurchases();
  check('bought fighters are visible for the current player',
    mine.some((p) => p.type === 'fighter' && p.quantity === 2 && p.owner === 'usa'));
  check('purchase toJSON has no undefined',
    findUndefinedPaths(gs.toJSON()).length === 0);
}

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll territory-flip persist checks passed');
