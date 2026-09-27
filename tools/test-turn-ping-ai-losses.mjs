// V2.81.57-unified.16.1 — AI battles and non-battle captures show on the turn ping.
// Replays the TXVKJB seat gap: British Easy AI fights through resolveCombat
// (the aiController._handleCombat loop) and walks into empty Egypt.
// Run: node tools/test-turn-ping-ai-losses.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
const el = () => ({
  style: {},
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  appendChild(c) { return c; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
});
globalThis.document ??= {
  documentElement: el(),
  body: el(),
  createElement: el,
  getElementById() { return null; },
};

const root = dirname(fileURLToPath(import.meta.url));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, '../src/state/gameState.js')).href);
const { bindDiscordTurnPing, formatRecipientLossSummary } = await import(pathToFileURL(join(root, '../src/multiplayer/discordTurnPing.js')).href);
const { findUndefinedPaths } = await import(pathToFileURL(join(root, '../src/state/persistState.js')).href);
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, '../src/version.js')).href);

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else {
    console.log('ok  :', label);
  }
};

check('stamp is unified.15', GAME_VERSION === 'V2.81.57-unified.16.1');
check('schema stays 11', SCHEMA_VERSION === 11);

const landDefs = {
  infantry: { cost: 3, attack: 1, defense: 2, movement: 1, isLand: true },
  armour: { cost: 6, attack: 3, defense: 3, movement: 2, isLand: true },
};
const seaDefs = {
  ...landDefs,
  destroyer: { cost: 8, attack: 2, defense: 2, movement: 2, isSea: true },
  transport: { cost: 7, attack: 0, defense: 0, movement: 2, isSea: true },
  cruiser: { cost: 12, attack: 3, defense: 3, movement: 2, isSea: true },
  battleship: { cost: 20, attack: 4, defense: 4, movement: 2, isSea: true, hp: 2 },
};

const T = (name, connections, isWater = false) => ({ name, isWater, connections });

const TX_PLAYERS = [
  { id: 'Germans', name: 'Robert007', isAI: false },
  { id: 'British', name: 'Easy Bot', isAI: true, aiDifficulty: 'easy' },
  { id: 'Japanese', name: 'Easy Bot', isAI: true, aiDifficulty: 'easy' },
  { id: 'Americans', name: 'Bastion', isAI: false, discordName: 'crusader_bastion' },
  { id: 'Russians', name: 'Easy Bot', isAI: true, aiDifficulty: 'easy' },
];

const TX_TERRITORIES = [
  T('Turkey', ['Persia', 'Egypt']),
  T('Persia', ['Turkey', 'Kenya-Rhodesia']),
  T('Kenya-Rhodesia', ['Persia', 'Egypt', 'South Africa']),
  T('Egypt', ['Turkey', 'Kenya-Rhodesia', 'Trans-Jordan']),
  T('Trans-Jordan', ['Egypt']),
  T('South Africa', ['Kenya-Rhodesia']),
  T('Germany', []),
];

// Turkey is two rounds (1 German inf, then the rest). Kenya is one round.
// Rolls are attack then defense. 6 misses every combat value in this file; 1 hits.
const TX_DICE = [
  6, 6, 6, 6, 6, 6, 1, 6, 6, // Turkey r1 attack: 6 inf miss, 1 armour hit
  1, 1, 6,                   // Turkey r1 defense: 2 hits, armour misses
  1, 6, 6, 6, 1, 6, 6,       // Turkey r2 attack: 1 inf + 1 armour hit
  6, 6,                      // Turkey r2 defense miss
  1, 6, 6, 6,                // Kenya attack: 1 hit
  6,                         // Kenya defense miss
];

function attachDice(gs, faces) {
  const queue = faces.slice();
  let calls = 0;
  gs._rollDie = () => {
    calls += 1;
    if (!queue.length) throw new Error(`dice underrun after ${calls}`);
    return queue.shift();
  };
  return {
    get calls() { return calls; },
    get left() { return queue.length; },
  };
}

function boardPicture(gs) {
  const units = {};
  for (const [name, list] of Object.entries(gs.units)) {
    units[name] = (list || []).map((u) => ({
      type: u.type,
      quantity: u.quantity || 0,
      owner: u.owner || null,
      damaged: !!u.damaged,
      damagedCount: u.damagedCount || 0,
    }));
  }
  const owners = {};
  for (const [name, state] of Object.entries(gs.territoryState)) {
    owners[name] = state?.owner || null;
  }
  return JSON.stringify({ units, owners });
}

function makeGs(players, territories) {
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = players.map((p) => ({ ...p }));
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.DEVELOP_TECH;
  gs.round = 1;
  gs.currentPlayerIndex = 0;
  gs.playerState = Object.fromEntries(gs.players.map((p) => [p.id, {
    ipcs: 20,
    hasPlacedCapital: true,
    capitalTerritory: p.id === 'Germans' ? 'Germany' : null,
  }]));
  return gs;
}

function seat(gs, index) {
  gs.currentPlayerIndex = index;
  gs.turnPhase = TURN_PHASES.DEVELOP_TECH;
  gs._notify();
}

function fight(gs, defs, onRound) {
  for (const combat of [...gs.combatQueue]) {
    let safety = 100;
    while (safety-- > 0) {
      const result = gs.resolveCombat(combat, defs);
      onRound?.(combat, result);
      if (!result || result.resolved) break;
    }
  }
}

function bindPing(gs, gameId = 'TXVKJB') {
  const posts = [];
  const store = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); } };
  bindDiscordTurnPing(gs, {
    getGameId: () => gameId,
    isApplyingRemote: () => false,
    storage: store,
    post: (_url, content) => {
      posts.push(content);
      return { ok: true };
    },
  });
  return posts;
}

function setupTx(stubLog) {
  const gs = makeGs(TX_PLAYERS, TX_TERRITORIES);
  gs.territoryState = {
    Turkey: { owner: 'Germans' },
    'Kenya-Rhodesia': { owner: 'Germans' },
    Egypt: { owner: 'Germans' },
    Persia: { owner: 'British' },
    'Trans-Jordan': { owner: 'British' },
    'South Africa': { owner: 'British' },
    Germany: { owner: 'Germans' },
  };
  gs.units = {
    Turkey: [
      { type: 'infantry', quantity: 2, owner: 'Germans' },
      { type: 'armour', quantity: 1, owner: 'Germans' },
    ],
    'Kenya-Rhodesia': [{ type: 'infantry', quantity: 1, owner: 'Germans' }],
    Egypt: [],
    Persia: [],
    'Trans-Jordan': [{ type: 'infantry', quantity: 1, owner: 'British' }],
    'South Africa': [],
    Germany: [],
  };
  if (stubLog) {
    gs.logCombat = () => {};
    gs.logTerritoryCapture = () => {};
  }
  return gs;
}

function playTxCombat(gs, onRound) {
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.units.Turkey.push(
    { type: 'infantry', quantity: 6, owner: 'British' },
    { type: 'armour', quantity: 3, owner: 'British' },
  );
  gs.units['Kenya-Rhodesia'].push({ type: 'infantry', quantity: 4, owner: 'British' });
  gs.combatQueue = ['Turkey', 'Kenya-Rhodesia'];
  fight(gs, landDefs, onRound);
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  return gs.moveUnits('Trans-Jordan', 'Egypt', [{ type: 'infantry', quantity: 1 }], landDefs);
}

const EXPECTED_ROB = [
  '<@600101834727620620>',
  'Robert007 - Germany Develop Tech Phase',
  '-2x Infantry, 1x Tank lost Turkey - British Easy AI',
  '-1x Infantry lost Kenya-Rhodesia - British Easy AI',
  '-Turkey Lost - British Easy AI',
  '-Kenya-Rhodesia Lost - British Easy AI',
  '-Egypt Lost - British Easy AI',
  'https://tactical-risk20.vercel.app/?code=TXVKJB',
].join('\n');

console.log('=== TXVKJB replay ===');
const logged = setupTx(false);
const loggedDice = attachDice(logged, TX_DICE);
const posts = bindPing(logged);
let sawUnresolvedTurkey = false;
let midSaveClean = true;
seat(logged, 1);
const egyptMove = playTxCombat(logged, (territory, result) => {
  if (territory === 'Turkey' && result && result.resolved === false) {
    sawUnresolvedTurkey = true;
    const saved = logged.toJSON();
    if (findUndefinedPaths(saved).length || JSON.stringify(saved).includes('_combatLossLedger')) {
      midSaveClean = false;
    }
  }
});
seat(logged, 2);
seat(logged, 3);
seat(logged, 4);
seat(logged, 0);
const rob = posts[posts.length - 1] || '';

check('Egypt walk-in captured', egyptMove?.success === true && egyptMove?.captured === true, JSON.stringify(egyptMove));
check('Turkey took more than one round', sawUnresolvedTurkey);
check('mid-battle save has no ledger and no undefined', midSaveClean);
check('dice queue consumed exactly', loggedDice.calls === TX_DICE.length && loggedDice.left === 0, `calls=${loggedDice.calls} left=${loggedDice.left}`);
check('Rob ping matches TXVKJB', rob === EXPECTED_ROB, rob);

const turkeyCombats = logged.turnEvents.filter((ev) => ev.type === 'combat' && ev.territory === 'Turkey');
check('two Turkey rounds collapse to one combat event', turkeyCombats.length === 1);
check('Turkey losses are the sum', turkeyCombats[0]
  && turkeyCombats[0].defenderLosses?.infantry === 2
  && turkeyCombats[0].defenderLosses?.armour === 1);
check('British casualties were recorded on the event', turkeyCombats[0]?.attackerLosses?.infantry === 2);
check('British losses are absent from Rob\'s ping', rob === EXPECTED_ROB && !rob.includes('4x Infantry') && !rob.includes('Easy Bot'));
const turkeyUnitLines = rob.split('\n').filter((line) => line.includes('lost Turkey'));
check('one Turkey unit line', turkeyUnitLines.length === 1);

const combatBeforeCapture = logged.turnEvents.findIndex((ev) => ev.type === 'combat' && ev.territory === 'Turkey');
const turkeyCaptureAt = logged.turnEvents.findIndex((ev) => ev.type === 'territory_captured' && ev.territory === 'Turkey');
check('combat event precedes the Turkey capture', combatBeforeCapture >= 0 && combatBeforeCapture < turkeyCaptureAt);

console.log('=== logging does not change dice or the board ===');
const quiet = setupTx(true);
const quietDice = attachDice(quiet, TX_DICE);
quiet.currentPlayerIndex = 1;
quiet.turnPhase = TURN_PHASES.COMBAT;
const quietMove = playTxCombat(quiet);
check('stubbed run finishes the same walk-in', quietMove?.success === true && quietMove?.captured === true);
check('dice call count matches the stubbed run', loggedDice.calls === quietDice.calls && quietDice.left === 0);
check('board matches the stubbed run', boardPicture(logged) === boardPicture(quiet));

console.log('=== failed attack still lists defender losses ===');
{
  const gs = makeGs(TX_PLAYERS, [T('France', []), T('Germany', [])]);
  gs.territoryState = { France: { owner: 'Germans' }, Germany: { owner: 'Germans' } };
  gs.units = {
    France: [
      { type: 'infantry', quantity: 2, owner: 'Germans' },
      { type: 'infantry', quantity: 2, owner: 'British' },
    ],
    Germany: [],
  };
  const postsF = bindPing(gs);
  attachDice(gs, [1, 6, 1, 1]);
  seat(gs, 1);
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.combatQueue = ['France'];
  fight(gs, landDefs);
  seat(gs, 0);
  const body = postsF[postsF.length - 1] || '';
  check('failed attack lists the German infantry', body.includes('-1x Infantry lost France - British Easy AI'), body);
  check('failed attack has no Lost line', !body.includes('France Lost') && body.includes('-No territories lost'), body);
  check('France stays German', gs.getOwner('France') === 'Germans');
  check('failed-attack save is defined', findUndefinedPaths(gs.toJSON()).length === 0);
}

console.log('=== sea battle and a damaged battleship ===');
{
  const territories = [
    T('Sea Zone 15', [], true),
    T('Sea Zone 16', [], true),
    T('Germany', []),
  ];
  const gs = makeGs(TX_PLAYERS, territories);
  gs.territoryState = { Germany: { owner: 'Germans' } };
  gs.units = {
    'Sea Zone 15': [
      { type: 'destroyer', quantity: 1, owner: 'Germans' },
      { type: 'transport', quantity: 1, owner: 'Germans' },
      { type: 'cruiser', quantity: 3, owner: 'British' },
    ],
    'Sea Zone 16': [
      { type: 'battleship', quantity: 1, owner: 'Germans' },
      { type: 'cruiser', quantity: 1, owner: 'British' },
    ],
    Germany: [],
  };
  const postsS = bindPing(gs);
  attachDice(gs, [
    1, 1, 6, // cruisers: two hits, sink transport + destroyer
    6, 6,    // destroyer + transport miss
    1,       // cruiser damages the battleship
    1,       // battleship sinks the cruiser
  ]);
  seat(gs, 1);
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.combatQueue = ['Sea Zone 15', 'Sea Zone 16'];
  fight(gs, seaDefs);
  seat(gs, 0);
  const body = postsS[postsS.length - 1] || '';
  check(
    'sunk ships are listed',
    body.includes('-1x Destroyer, 1x Transport lost Sea Zone 15 - British Easy AI'),
    body,
  );
  check('sea zone is not a Lost line', !body.includes('Sea Zone 15 Lost'), body);
  check('damaged battleship is not listed', !body.includes('Battleship'), body);
  const bb = (gs.units['Sea Zone 16'] || []).find((u) => u.type === 'battleship');
  check('battleship still on the board', bb?.quantity === 1 && bb?.owner === 'Germans');
  check('sea save is defined', findUndefinedPaths(gs.toJSON()).length === 0);
}

console.log('=== co-defending ally gets a separate event ===');
{
  const players = [
    { id: 'Germans', name: 'Robert007', isAI: false },
    { id: 'British', name: 'Easy Bot', isAI: true, aiDifficulty: 'easy' },
    { id: 'Japanese', name: 'Tojo', isAI: false },
  ];
  const gs = makeGs(players, [T('Turkey', []), T('Germany', [])]);
  gs.territoryState = { Turkey: { owner: 'Germans' }, Germany: { owner: 'Germans' } };
  gs.units = {
    Turkey: [
      { type: 'infantry', quantity: 1, owner: 'Germans' },
      { type: 'infantry', quantity: 1, owner: 'Japanese' },
      { type: 'infantry', quantity: 4, owner: 'British' },
    ],
    Germany: [],
  };
  const postsC = bindPing(gs);
  attachDice(gs, [1, 1, 6, 6, 6, 6]);
  seat(gs, 1);
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.combatQueue = ['Turkey'];
  fight(gs, landDefs);
  seat(gs, 2);
  const japan = postsC[postsC.length - 1] || '';
  seat(gs, 0);
  const germany = postsC[postsC.length - 1] || '';
  check('Japan ping lists the Japanese infantry', japan.includes('-1x Infantry lost Turkey - British Easy AI'), japan);
  check('Japan ping does not take the German territory line', !japan.includes('Turkey Lost'), japan);
  check('Rob ping lists one German infantry, not both', germany.includes('-1x Infantry lost Turkey - British Easy AI') && !germany.includes('2x Infantry'), germany);
  check('Rob ping still has the territory', germany.includes('-Turkey Lost - British Easy AI'), germany);
  const japanEvents = gs.turnEvents.filter((ev) => ev.type === 'combat' && ev.defenderId === 'Japanese');
  check('co-defender has its own combat event', japanEvents.length === 1
    && japanEvents[0].defenderLosses?.infantry === 1
    && Object.keys(japanEvents[0].attackerLosses || {}).length === 0);
  check('co-defender save is defined', findUndefinedPaths(gs.toJSON()).length === 0);
}

console.log('=== undone blitz and walk-in drop off the Russia ping ===');
{
  const players = [
    { id: 'Germans', name: 'Robert007', isAI: false },
    { id: 'Russians', name: 'Ivan', isAI: false },
  ];
  const territories = [
    T('Berlin', ['Poland']),
    T('Poland', ['Berlin', 'Ukraine']),
    T('Ukraine', ['Poland']),
    T('Germany', []),
  ];
  const gs = makeGs(players, territories);
  gs.territoryState = {
    Berlin: { owner: 'Germans' },
    Poland: { owner: 'Russians' },
    Ukraine: { owner: 'Russians' },
    Germany: { owner: 'Germans' },
  };
  gs.units = {
    Berlin: [{ type: 'armour', quantity: 1, owner: 'Germans' }],
    Poland: [],
    Ukraine: [],
    Germany: [],
  };
  const postsU = bindPing(gs, 'TXVKJB');
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  const moved = gs.moveUnits('Berlin', 'Ukraine', [{ type: 'armour', quantity: 1 }], landDefs);
  check('blitz move captured the destination', moved?.success === true && moved?.captured === true, JSON.stringify(moved));
  check('Poland was blitzed', (moved?.blitzedCaptures || []).some((row) => row.territory === 'Poland'));
  const move = gs.moveHistory[gs.moveHistory.length - 1];
  check('walk-in stores the capture index', Number.isInteger(move?.captureEventIdx));
  check('blitz row stores the capture index', Number.isInteger(move?.blitzedCaptures?.[0]?.captureEventIdx));
  const before = formatRecipientLossSummary(gs.turnEvents, { recipientId: 'Russians', players: gs.players });
  check('before undo the Russia summary lists both losses', before.includes('-Poland Lost - Robert007 Germany') && before.includes('-Ukraine Lost - Robert007 Germany'), before);
  const undone = gs.undoLastMove();
  check('undo succeeds', undone?.success === true, JSON.stringify(undone));
  check('owners restored', gs.getOwner('Poland') === 'Russians' && gs.getOwner('Ukraine') === 'Russians');
  const marked = gs.turnEvents.filter((ev) => ev.type === 'territory_captured' && (ev.territory === 'Poland' || ev.territory === 'Ukraine'));
  check('capture events marked undone, not removed', marked.length === 2 && marked.every((ev) => ev.undone === true) && gs.turnEvents.length >= 2);
  seat(gs, 1);
  const russia = postsU[postsU.length - 1] || '';
  check('Russia ping has no Lost line after undo', !russia.includes('Lost -') && !russia.includes('Poland') && !russia.includes('Ukraine'), russia);
  check('undo save is defined', findUndefinedPaths(gs.toJSON()).length === 0);
  check('save schema stays 11', gs.toJSON().version === 11);
}

console.log('=== amphibious empty capture can be undone ===');
{
  const players = [
    { id: 'Germans', name: 'Robert007', isAI: false },
    { id: 'Russians', name: 'Ivan', isAI: false },
  ];
  const territories = [
    T('Sea Zone A', ['Archangel'], true),
    T('Archangel', ['Sea Zone A']),
  ];
  const gs = makeGs(players, territories);
  gs.territoryState = { Archangel: { owner: 'Russians' } };
  gs.units = {
    'Sea Zone A': [{
      type: 'transport',
      id: 'tr1',
      owner: 'Germans',
      quantity: 1,
      cargo: [{ type: 'infantry', owner: 'Germans' }],
    }],
    Archangel: [],
  };
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  const unloaded = gs.unloadTransport('Sea Zone A', 0, 'Archangel');
  check('amphibious unload succeeds', unloaded?.success === true, JSON.stringify(unloaded));
  check('empty coast is captured', gs.getOwner('Archangel') === 'Germans');
  const move = gs.moveHistory[gs.moveHistory.length - 1];
  check('amphibious move stores the capture index', Number.isInteger(move?.captureEventIdx) && move?.captured === true);
  const summary = formatRecipientLossSummary(gs.turnEvents, { recipientId: 'Russians', players: gs.players });
  check('amphibious capture is a Lost line', summary.includes('-Archangel Lost - Robert007 Germany'), summary);
  const undone = gs.undoLastMove();
  check('amphibious undo succeeds', undone?.success === true, JSON.stringify(undone));
  check('coast restored', gs.getOwner('Archangel') === 'Russians');
  const after = formatRecipientLossSummary(gs.turnEvents, { recipientId: 'Russians', players: gs.players });
  check('undone amphibious capture is omitted', !after.includes('Archangel') && !after.includes('Lost -'), after);
  check('amphibious save is defined', findUndefinedPaths(gs.toJSON()).length === 0);
}

check('TXVKJB save is defined', findUndefinedPaths(logged.toJSON()).length === 0);
check('TXVKJB schema stays 11', logged.toJSON().version === 11);

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall checks passed');
