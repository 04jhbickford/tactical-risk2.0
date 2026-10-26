// unified.63 — Discord reports from 22 Sep through 5 Oct, plus a rejected
// End Turn save. Each block is a reproduction. A pass with no production
// change is evidence the report was already fixed.
// Run: node tools/test-unified-63-reports.mjs

import { register } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const hookUrl = pathToFileURL(join(root, 'tools/firebase-reject-hook.mjs')).href;
try {
  register(hookUrl, { parentURL: import.meta.url });
} catch {
  register(hookUrl, import.meta.url);
}

const byId = new Map();

function walk(el, out = []) {
  if (!el) return out;
  out.push(el);
  for (const child of el.children || []) walk(child, out);
  return out;
}

function query(el, sel) {
  const all = walk(el).slice(1);
  if (!sel) return null;
  if (sel === 'button') return all.find((node) => node.tag === 'button') || null;
  if (sel.startsWith('.')) {
    const cls = sel.slice(1);
    return all.find((node) => String(node.className || '').split(/\s+/).includes(cls)) || null;
  }
  return all.find((node) => node.tag === sel) || null;
}

function makeEl(tag = 'div') {
  const classSet = new Set();
  const el = {
    tag,
    id: '',
    className: '',
    innerHTML: '',
    textContent: '',
    type: '',
    style: {
      removeProperty() {},
      setProperty() {},
      getPropertyValue() { return ''; },
    },
    children: [],
    dataset: {},
    classList: {
      add(...names) {
        names.forEach((name) => classSet.add(name));
        el.className = [...classSet].join(' ');
      },
      remove(...names) {
        names.forEach((name) => classSet.delete(name));
        el.className = [...classSet].join(' ');
      },
      contains(name) { return classSet.has(name); },
      toggle(name, force) {
        const has = classSet.has(name);
        const next = force === undefined ? !has : !!force;
        if (next) classSet.add(name);
        else classSet.delete(name);
        el.className = [...classSet].join(' ');
        return next;
      },
    },
    append(...kids) { kids.forEach((kid) => el.appendChild(kid)); },
    appendChild(child) {
      if (!child) return child;
      el.children.push(child);
      if (child.id) byId.set(child.id, child);
      return child;
    },
    querySelector(sel) { return query(el, sel); },
    querySelectorAll() { return []; },
    addEventListener() {},
    removeEventListener() {},
    setAttribute(name, value) {
      if (name === 'id') {
        el.id = value;
        byId.set(value, el);
      }
      if (name === 'class') el.className = value;
      el[name] = value;
    },
    getAttribute(name) { return el[name] ?? null; },
    remove() {
      if (el.id) byId.delete(el.id);
    },
    contains() { return false; },
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
    focus() {},
    closest() { return null; },
  };
  return el;
}

const sidebar = makeEl('div');
sidebar.id = 'sidebar';
byId.set('sidebar', sidebar);
const body = makeEl('body');

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
globalThis.requestAnimationFrame ??= (fn) => { fn(); return 1; };
globalThis.cancelAnimationFrame ??= () => {};
globalThis.navigator ??= { userAgent: 'node' };
globalThis.getComputedStyle ??= () => ({ getPropertyValue() { return ''; } });
globalThis.document = {
  hidden: true,
  documentElement: makeEl('html'),
  body,
  createElement: (tag) => makeEl(tag),
  getElementById: (id) => byId.get(id) || null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  elementsFromPoint: () => [],
};
globalThis.window = globalThis;
window.innerWidth = 1280;
window.innerHeight = 800;
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const { PlayerPanel } = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const { AIController } = await import(pathToFileURL(join(root, 'src/ai/aiController.js')));
const { maxMoveSelection, decomposeMoveSelection } = await import(pathToFileURL(join(root, 'src/state/combatMoveEligibility.js')));
const { lobbyListingButtons, LOBBY_LIST_LABEL, LOBBY_UNLIST_LABEL } = await import(pathToFileURL(join(root, 'src/multiplayer/lobbyStart.js')));
const { unitsSubsMayRoll } = await import(pathToFileURL(join(root, 'src/state/combatUnits.js')));
const { commitTurnHandoff, TURN_SAVE_FAILED_WARNING } = await import(pathToFileURL(join(root, 'src/multiplayer/syncAuthority.js')));
const { showTurnSaveWarning } = await import(pathToFileURL(join(root, 'src/ui/turnSaveWarning.js')));
const { GAME_VERSION, SCHEMA_VERSION, compatClientVersion, compareGameVersions } = await import(pathToFileURL(join(root, 'src/version.js')));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const ISLE = 'Isle';
const SEA = 'Isle Sea';
const FAR = 'Far Sea';
const COAST = 'Enemy Coast';
const HOME = 'Home';
const HOME_SEA = 'Home Sea';
const HUMAN = 'usa';
const AI = 'germany';

const MAP = [
  { name: ISLE, isWater: false, connections: [SEA] },
  { name: SEA, isWater: true, connections: [ISLE, FAR, COAST] },
  { name: FAR, isWater: true, connections: [SEA] },
  { name: COAST, isWater: false, connections: [SEA] },
  { name: HOME, isWater: false, connections: [HOME_SEA] },
  { name: HOME_SEA, isWater: true, connections: [HOME] },
];

function qty(gs, territory, type, owner) {
  return (gs.units[territory] || [])
    .filter((unit) => unit.type === type && (!owner || unit.owner === owner))
    .reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
}

function aboard(gs, territory, type, owner) {
  return (gs.units[territory] || [])
    .filter((unit) => unit.type === 'carrier')
    .reduce((sum, carrier) => sum + (carrier.aircraft || []).filter((craft) => (
      craft?.type === type && (!owner || craft.owner === owner)
    )).length, 0);
}

function makeState({ aiTurn = false, phase = TURN_PHASES.COMBAT } = {}) {
  const gs = new GameState({ risk: { factions: [] } }, MAP, []);
  gs.players = [
    { id: HUMAN, name: 'Rob', oderId: 'human-uid', isAI: false },
    { id: AI, name: 'German Easy AI', oderId: 'ai-uid', isAI: true, aiDifficulty: 'easy' },
  ];
  gs.currentPlayerIndex = aiTurn ? 1 : 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = phase;
  gs.round = 2;
  gs.playerState = {
    [HUMAN]: { ipcs: 20, capitalTerritory: HOME },
    [AI]: { ipcs: 40, capitalTerritory: ISLE },
  };
  gs.units = {
    [ISLE]: [],
    [SEA]: [],
    [FAR]: [],
    [COAST]: [],
    [HOME]: [],
    [HOME_SEA]: [],
  };
  gs.territoryState = {
    [ISLE]: { owner: AI, isCapital: true },
    [SEA]: { owner: null },
    [FAR]: { owner: null },
    [COAST]: { owner: HUMAN },
    [HOME]: { owner: HUMAN, isCapital: true },
    [HOME_SEA]: { owner: null },
  };
  gs.unitDefs = unitDefs;
  gs._unitDefs = unitDefs;
  gs.friendlyTerritoriesAtTurnStart = new Set([ISLE, HOME]);
  gs.factoriesAtTurnStart = new Set([ISLE, HOME]);
  return gs;
}

function aiController(gs) {
  const ai = new AIController();
  ai.gameState = gs;
  ai.unitDefs = unitDefs;
  ai.skipMode = true;
  return ai;
}

async function settle() {
  for (let i = 0; i < 24; i += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const stamp = 'V2.81.57-unified.68';
  check('display stamp is V2.81.57-unified.68', GAME_VERSION === stamp);
  check('schema stays 11', SCHEMA_VERSION === 11);
  check('game docs write V2.82-unified.68', compatClientVersion() === 'V2.82-unified.68');
  check('a V2.82-unified.69 doc prompts this tab', compareGameVersions('V2.82-unified.69', GAME_VERSION) > 0);
  check('a V2.82-unified.65 doc does not prompt this tab', compareGameVersions('V2.82-unified.65', GAME_VERSION) < 0);
  check('index.html carries the display stamp',
    html.includes(`name="tr-game-version" content="${stamp}"`)
    && html.includes(`window.__TR_GAME_VERSION = '${stamp}'`)
    && html.includes(`var LOCKED = '${stamp}'`)
    && html.includes(`style.css?v=${stamp}`)
    && html.includes(`src/main.js?v=${stamp}`));
}

console.log('=== 1. easy AI turn cannot stall ===');
{
  const gs = makeState({ aiTurn: true, phase: TURN_PHASES.COMBAT });
  gs.units[SEA] = [
    { type: 'submarine', owner: AI, quantity: 1 },
    { type: 'submarine', owner: HUMAN, quantity: 1 },
  ];
  gs.combatQueue = [SEA];
  const once = gs.resolveCombat(SEA, unitDefs);
  check('sub versus sub resolves instead of rolling forever',
    once?.resolved === true && qty(gs, SEA, 'submarine', AI) === 1 && qty(gs, SEA, 'submarine', HUMAN) === 1,
    once);

  const mixed = makeState({ aiTurn: true, phase: TURN_PHASES.COMBAT });
  mixed.units[SEA] = [
    { type: 'fighter', owner: AI, quantity: 1 },
    { type: 'submarine', owner: AI, quantity: 1 },
    { type: 'submarine', owner: HUMAN, quantity: 1 },
  ];
  mixed.combatQueue = [SEA];
  const mixedResult = mixed.resolveCombat(SEA, unitDefs);
  check('fighter plus sub versus a sub resolves with everyone still there',
    mixedResult?.resolved === true
    && qty(mixed, SEA, 'fighter', AI) === 1
    && qty(mixed, SEA, 'submarine') === 2,
    mixedResult);

  if (once?.resolved) {
    const live = makeState({ aiTurn: true, phase: TURN_PHASES.COMBAT });
    live.units[SEA] = [
      { type: 'submarine', owner: AI, quantity: 1 },
      { type: 'submarine', owner: HUMAN, quantity: 1 },
    ];
    live.combatQueue = [SEA];
    const ai = aiController(live);
    await ai.checkAndProcessAI();
    await settle();
    check('the easy AI leaves its turn after a battle it cannot hit',
      live.currentPlayer?.id !== AI && (live.combatQueue || []).length === 0,
      { player: live.currentPlayer?.id, phase: live.turnPhase, queue: live.combatQueue });
  } else {
    check('the easy AI leaves its turn after a battle it cannot hit', false,
      'resolveCombat did not finish; the AI combat loop would not return');
  }

  const thrown = makeState({ aiTurn: true, phase: TURN_PHASES.PURCHASE });
  const thrower = aiController(thrown);
  thrower._handlePlayingPhase = async () => { throw new Error('purchase blew up'); };
  await thrower.checkAndProcessAI();
  check('an exception still hands the AI turn off', thrown.currentPlayer?.id !== AI, {
    player: thrown.currentPlayer?.id,
    phase: thrown.turnPhase,
  });

  const setup = makeState({ aiTurn: true });
  setup.phase = GAME_PHASES.UNIT_PLACEMENT;
  setup.turnPhase = 'setup';
  setup.unitsToPlace = {
    [AI]: [
      { type: 'transport', quantity: 1 },
      { type: 'infantry', quantity: 1 },
    ],
    [HUMAN]: [],
  };
  setup.units[SEA] = [{ type: 'destroyer', owner: HUMAN, quantity: 1 }];
  setup.unitsPlacedThisRound = 0;
  const placer = aiController(setup);
  await placer.checkAndProcessAI();
  check('enemy-occupied setup sea does not skip the land unit',
    qty(setup, ISLE, 'infantry', AI) === 1,
    setup.units[ISLE]);
  check('that placement round does not stay stuck',
    setup.currentPlayer?.id !== AI || setup.phase !== GAME_PHASES.UNIT_PLACEMENT,
    { player: setup.currentPlayer?.id, phase: setup.phase });
}

console.log('=== 2. subs versus air ===');
{
  const gs = makeState({ phase: TURN_PHASES.COMBAT });
  gs.currentPlayerIndex = 0;
  const rolls = [];
  gs._rollDie = () => { rolls.push(1); return 1; };
  gs.units[SEA] = [
    { type: 'fighter', owner: HUMAN, quantity: 1 },
    { type: 'submarine', owner: AI, quantity: 1 },
  ];
  gs.combatQueue = [SEA];
  const subsThatMayRoll = unitsSubsMayRoll(
    [{ type: 'submarine', owner: AI, quantity: 1 }],
    [{ type: 'fighter', owner: HUMAN, quantity: 1 }],
    unitDefs,
  );
  check('a sub does not roll against aircraft', subsThatMayRoll.length === 0);
  const result = gs.resolveCombat(SEA, unitDefs);
  check('air alone lets the sub submerge',
    result?.resolved === true && result?.submerged === true && rolls.length === 0
    && qty(gs, SEA, 'submarine', AI) === 1 && qty(gs, SEA, 'fighter', HUMAN) === 1,
    { result, rolls, units: gs.units[SEA] });

  const transport = makeState({ phase: TURN_PHASES.COMBAT });
  transport._rollDie = () => 1;
  transport.units[SEA] = [
    { type: 'fighter', owner: HUMAN, quantity: 1 },
    { type: 'transport', owner: AI, quantity: 1, cargo: [] },
  ];
  transport.combatQueue = [SEA];
  const sunk = transport.resolveCombat(SEA, unitDefs);
  check('an undefended transport is lost without a roll',
    sunk?.resolved === true && qty(transport, SEA, 'transport') === 0 && qty(transport, SEA, 'fighter', HUMAN) === 1,
    sunk);
}

console.log('=== 3. lobby lists or unlists, not both ===');
{
  const listed = lobbyListingButtons({ isHost: true, isPublished: true });
  const unlisted = lobbyListingButtons({ isHost: true, isPublished: false });
  const guest = lobbyListingButtons({ isHost: false, isPublished: true });
  const labels = (row) => row.buttons.map((button) => button.label);
  check('a listed host sees only Unlist Game',
    labels(listed).join('|') === LOBBY_UNLIST_LABEL && !labels(listed).includes(LOBBY_LIST_LABEL));
  check('an unlisted host sees only List in Open Games',
    labels(unlisted).join('|') === LOBBY_LIST_LABEL && !labels(unlisted).includes(LOBBY_UNLIST_LABEL));
  check('a guest sees neither list control', labels(guest).length === 0);
  check('List and Unlist are never both returned',
    [listed, unlisted, guest].every((row) => !(
      labels(row).includes(LOBBY_LIST_LABEL) && labels(row).includes(LOBBY_UNLIST_LABEL)
    )));
}

console.log('=== 4. empty carriers move with a drag-selected fleet ===');
{
  const gs = makeState({ phase: TURN_PHASES.NON_COMBAT_MOVE });
  gs.units[SEA] = [
    { type: 'destroyer', owner: HUMAN, quantity: 1 },
    { type: 'carrier', id: 'carrier_empty', owner: HUMAN, quantity: 1, aircraft: [] },
    {
      type: 'carrier',
      id: 'carrier_full',
      owner: HUMAN,
      quantity: 1,
      aircraft: [{ type: 'fighter', owner: HUMAN }],
    },
  ];
  gs.units[FAR] = [];
  const panel = new PlayerPanel();
  panel.setUnitDefs(unitDefs);
  panel.setGameState(gs);
  const movable = panel._getMovableUnits(gs.territoryByName[SEA], gs.currentPlayer);
  const selected = maxMoveSelection(movable);
  const parts = decomposeMoveSelection(selected);
  check('select-all includes the empty carrier', parts.shipIds.includes('carrier_empty'), parts);
  const moved = gs.moveUnits(SEA, FAR, parts.units, unitDefs, { shipIds: parts.shipIds });
  check('the empty carrier arrives with the fleet',
    moved?.success !== false && qty(gs, FAR, 'carrier') === 2 && (gs.units[FAR] || []).some((unit) => unit.id === 'carrier_empty'),
    { moved, far: gs.units[FAR], home: gs.units[SEA] });
  check('the loaded carrier keeps its fighter', aboard(gs, FAR, 'fighter', HUMAN) === 1, gs.units[FAR]);

  const grouped = makeState({ phase: TURN_PHASES.NON_COMBAT_MOVE });
  grouped.units[SEA] = [
    { type: 'destroyer', owner: HUMAN, quantity: 1 },
    { type: 'carrier', owner: HUMAN, quantity: 1, aircraft: [] },
  ];
  const groupMove = grouped.moveUnits(
    SEA,
    FAR,
    [{ type: 'destroyer', quantity: 1 }, { type: 'carrier', quantity: 1 }],
    unitDefs,
  );
  check('a grouped empty carrier moves with the destroyer',
    groupMove?.success !== false && qty(grouped, FAR, 'carrier', HUMAN) === 1 && qty(grouped, FAR, 'destroyer', HUMAN) === 1,
    { groupMove, far: grouped.units[FAR] });
}

console.log('=== 5. the player chooses the battle order ===');
{
  const gs = makeState({ phase: TURN_PHASES.COMBAT });
  gs.units[SEA] = [
    { type: 'fighter', owner: HUMAN, quantity: 1 },
    { type: 'infantry', owner: AI, quantity: 1 },
  ];
  gs.units[COAST] = [
    { type: 'infantry', owner: HUMAN, quantity: 1 },
    { type: 'infantry', owner: AI, quantity: 1 },
  ];
  gs.territoryState[SEA] = { owner: null };
  gs.combatQueue = [SEA, COAST];
  const panel = new PlayerPanel();
  panel.setUnitDefs(unitDefs);
  panel.setTerritories(MAP);
  panel.setGameState(gs);
  panel.flushRender();
  const html = panel.contentEl?.innerHTML || '';
  const picks = html.split('data-action="pick-battle"').length - 1;
  check('two battles are listed for the player to pick', picks === 2, html.slice(0, 500));
  check('Resolve does not open the first of several battles', !html.includes('data-action="open-combat"'), html.slice(0, 800));

  gs.combatQueue = [COAST];
  panel.flushRender();
  const single = panel.contentEl?.innerHTML || '';
  check('one battle still has Resolve', single.includes('data-action="open-combat"'));

  window.innerWidth = 390;
  gs.combatQueue = [SEA, COAST];
  panel.flushRender();
  const phone = panel.contentEl?.innerHTML || '';
  check('390px still lists both battles and does not auto-open',
    phone.split('data-action="pick-battle"').length - 1 === 2 && !phone.includes('data-action="open-combat"'));
  window.innerWidth = 1280;
}

console.log('=== 6. land units do not move again after an amphibious load ===');
{
  const gs = makeState({ phase: TURN_PHASES.COMBAT_MOVE });
  const inland = 'Inland';
  gs.territories.push({ name: inland, isWater: false, connections: [COAST] });
  gs.territoryByName[inland] = gs.territories[gs.territories.length - 1];
  const coast = gs.territoryByName[COAST];
  const homeSea = gs.territoryByName[HOME_SEA];
  homeSea.connections = [...new Set([...(homeSea.connections || []), COAST])];
  coast.connections = [...new Set([...(coast.connections || []), HOME_SEA, inland])];
  gs.territoryState[inland] = { owner: AI };
  gs.units[HOME] = [{ type: 'infantry', owner: HUMAN, quantity: 2 }];
  gs.units[HOME_SEA] = [{ type: 'transport', id: 'transport_1', owner: HUMAN, quantity: 1, cargo: [] }];
  gs.units[COAST] = [];
  gs.units[inland] = [];
  const loaded = gs.moveUnits(HOME, HOME_SEA, [{ type: 'infantry', quantity: 1 }], unitDefs);
  const cargo = (gs.units[HOME_SEA] || []).find((unit) => unit.id === 'transport_1')?.cargo || [];
  check('the loaded infantry leaves the coast and sits in the transport',
    loaded?.success === true && qty(gs, HOME, 'infantry', HUMAN) === 1 && cargo.length === 1,
    { loaded, home: gs.units[HOME], cargo });
  const ashore = gs.unloadTransport(HOME_SEA, 0, COAST);
  const landed = (gs.units[COAST] || []).find((unit) => unit.type === 'infantry' && unit.owner === HUMAN);
  const again = gs.moveUnits(COAST, inland, [{ type: 'infantry', quantity: 1 }], unitDefs);
  check('the infantry cannot walk again after the landing',
    ashore?.success === true && landed?.moved === true && again?.success !== true && qty(gs, inland, 'infantry', HUMAN) === 0,
    { ashore, landed, again, coast: gs.units[COAST] });
}

console.log('=== 7. a fighter on a carrier is still there next turn ===');
{
  const gs = makeState({ phase: TURN_PHASES.COLLECT_INCOME });
  gs.units[HOME_SEA] = [{
    type: 'carrier',
    id: 'carrier_1',
    owner: HUMAN,
    quantity: 1,
    aircraft: [{ type: 'fighter', owner: HUMAN }],
  }];
  const snap = JSON.parse(JSON.stringify(gs.toJSON()));
  gs.nextTurn();
  const reloaded = makeState();
  reloaded.loadFromJSON(snap);
  check('ending the turn keeps the fighter aboard', aboard(gs, HOME_SEA, 'fighter', HUMAN) === 1, gs.units[HOME_SEA]);
  check('a saved game keeps the fighter aboard', aboard(reloaded, HOME_SEA, 'fighter', HUMAN) === 1, reloaded.units[HOME_SEA]);

  const battle = makeState({ phase: TURN_PHASES.COMBAT });
  battle.units[SEA] = [
    {
      type: 'carrier',
      id: 'carrier_battle',
      owner: HUMAN,
      quantity: 1,
      aircraft: [{ type: 'fighter', owner: HUMAN }],
    },
    { type: 'submarine', owner: AI, quantity: 1 },
  ];
  battle.combatQueue = [SEA];
  battle._rollDie = () => 6;
  const round = battle.resolveCombat(SEA, unitDefs);
  check('a naval round puts the fighter back on the carrier',
    aboard(battle, SEA, 'fighter', HUMAN) === 1 && qty(battle, SEA, 'fighter', HUMAN) === 0,
    { round, units: battle.units[SEA] });

  const grouped = makeState({ phase: TURN_PHASES.NON_COMBAT_MOVE });
  grouped.units[SEA] = [{
    type: 'carrier',
    owner: HUMAN,
    quantity: 1,
    aircraft: [{ type: 'fighter', owner: HUMAN }],
  }];
  const sailed = grouped.moveUnits(SEA, FAR, [{ type: 'carrier', quantity: 1 }], unitDefs);
  check('moving a grouped carrier takes the fighter with it',
    sailed?.success === true && aboard(grouped, FAR, 'fighter', HUMAN) === 1,
    { sailed, far: grouped.units[FAR], home: grouped.units[SEA] });

  const peel = makeState();
  peel.units[HOME_SEA] = [{
    type: 'carrier',
    owner: HUMAN,
    quantity: 1,
    aircraft: [{ type: 'fighter', owner: HUMAN }],
  }];
  const hull = peel._individualizeShip(HOME_SEA, 'carrier', HUMAN);
  check('giving that carrier an id keeps the fighter',
    hull?.aircraft?.some((craft) => craft.type === 'fighter') && aboard(peel, HOME_SEA, 'fighter', HUMAN) === 1,
    peel.units[HOME_SEA]);
}

console.log('=== 8. sub first strike needs a naval target ===');
{
  const gs = makeState({ phase: TURN_PHASES.COMBAT });
  gs.units[SEA] = [
    { type: 'submarine', owner: HUMAN, quantity: 1 },
    { type: 'fighter', owner: AI, quantity: 1 },
  ];
  gs.combatQueue = [SEA];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.showNextCombat();
  const html = ui.el?.innerHTML || '';
  check('Fire First Strike is absent when the only enemy is air',
    !html.includes('Fire First Strike') && ui.combatState?.hasSubmarineFirstStrike !== true,
    { phase: ui.combatState?.phase, strike: ui.combatState?.hasSubmarineFirstStrike });
}

console.log('=== 9. an island capital buys a navy ===');
{
  const gs = makeState({ aiTurn: true, phase: TURN_PHASES.PURCHASE });
  gs.playerState[AI].ipcs = 40;
  gs.units[ISLE] = [{ type: 'factory', owner: AI, quantity: 1 }];
  const ai = aiController(gs);
  await ai._handlePurchase(ai.aiPlayers[AI] || { difficulty: 'easy' }, gs.currentPlayer);
  const queued = (gs.pendingPurchases || [])
    .filter((row) => row.owner === AI && ['transport', 'submarine', 'destroyer', 'cruiser', 'battleship', 'carrier'].includes(row.type))
    .reduce((sum, row) => sum + (row.quantity || 0), 0);
  check('the easy AI queues a naval unit for an island capital', queued >= 1 && qty(gs, SEA, 'transport', AI) === 0, {
    pending: gs.pendingPurchases,
    sea: gs.units[SEA],
  });
  gs.turnPhase = TURN_PHASES.MOBILIZE;
  await ai._handleMobilize(ai.aiPlayers[AI] || { difficulty: 'easy' }, gs.currentPlayer);
  const boats = ['transport', 'submarine', 'destroyer', 'cruiser', 'battleship', 'carrier']
    .reduce((sum, type) => sum + qty(gs, SEA, type, AI), 0);
  const cargo = (gs.units[SEA] || [])
    .filter((unit) => unit.owner === AI && unit.type === 'transport')
    .reduce((sum, unit) => sum + (unit.cargo || []).length, 0);
  check('the easy AI mobilizes that navy into the sea, not onto a transport', boats >= 1 && cargo === 0, {
    sea: gs.units[SEA],
    ipcs: gs.playerState[AI].ipcs,
    phase: gs.turnPhase,
  });
}

console.log('=== rejected End Turn save restores the turn and shows Retry ===');
{
  const { SyncManager } = await import(pathToFileURL(join(root, 'src/multiplayer/syncManager.js')));
  const gs = makeState({ phase: TURN_PHASES.COLLECT_INCOME });
  gs.isMultiplayer = true;
  const beforeId = gs.currentPlayer.id;
  const snapshot = gs.toJSON();
  const sync = new SyncManager('game-1', gs);
  sync.db = { mocked: true };
  sync.gameId = 'game-1';
  sync.authManager.getUserId = () => 'human-uid';
  sync._confirmedSeat = { userId: 'human-uid', oderId: 'human-uid', isAI: false };
  sync._backoffMs = () => 0;
  sync._delay = async () => {};
  const handoff = await commitTurnHandoff({
    advance: () => { gs.nextPhase(); },
    push: () => sync.pushStateNow(),
    sendNotice: async () => true,
    restore: () => { gs.loadFromJSON(snapshot); },
  });
  showTurnSaveWarning(handoff.warning || TURN_SAVE_FAILED_WARNING, () => {});
  const banner = document.getElementById('turn-save-warning');
  const label = banner?.querySelector?.('.turn-save-warning-text');
  const retry = banner?.querySelector?.('button');
  check('the rejected push restores the seat',
    handoff.ok === false && handoff.retry === true && gs.currentPlayer?.id === beforeId,
    { handoff, player: gs.currentPlayer?.id });
  check('the Retry warning is in the document',
    !!banner
    && String(label?.textContent || '').includes('still on this turn')
    && retry?.textContent === 'Retry',
    { text: label?.textContent, retry: retry?.textContent });
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nunified.63 report checks passed');
