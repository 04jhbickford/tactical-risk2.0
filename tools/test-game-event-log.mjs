// V2.81.55 cloud game-log: fail-closed append, schema, screenshot query.
// Run: node tools/test-game-event-log.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  EVENT_SCHEMA,
  EVENT_KINDS,
  GameEventLog,
  bindGameEventLog,
  unbindGameEventLog,
  emitGameEvent,
  buildGameEvent,
  sanitizePayload,
  mapActionLogTypeToKind,
  shouldFanOutActionLogType,
  filterEvents,
  describeEventQuery,
  parseScreenshotHint,
  createFirestoreEventWriter,
  summarizeUnits,
} = await import(pathToFileURL(join(root, 'src/multiplayer/gameEventLog.js')));

let passed = 0;
let failed = 0;
function check(name, cond) {
  if (cond) {
    passed += 1;
    console.log(`  ok  ${name}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${name}`);
  }
}

console.log('game event log');
check('GAME_VERSION is V2.81.57-unified.2', GAME_VERSION === 'V2.81.57-unified.2');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);
check('EVENT_SCHEMA is 1', EVENT_SCHEMA === 1);
check('kinds include combat/aa/phase', EVENT_KINDS.includes('combat') && EVENT_KINDS.includes('aa') && EVENT_KINDS.includes('phase'));

const built = buildGameEvent({
  gameState: { round: 3, phase: 'playing', turnPhase: 'combat', currentPlayer: { id: 'usa', name: 'Sean' } },
  kind: 'aa',
  territory: 'Western United States',
  payload: { rolls: [1, 6, 2], hits: 1, forcesBefore: { attack: [{ type: 'fighter', quantity: 3 }] } },
  writerUid: 'uid-1',
  lobbyCode: 'BOYSEN',
});
check('build fills ts/turn/phase/player/kind', built.ts > 0 && built.turn === 3 && built.phase === 'playing' && built.playerName === 'Sean' && built.kind === 'aa');
check('build keeps territory + rolls', built.territory === 'Western United States' && built.payload.rolls[0] === 1);
check('unknown kind becomes ui', buildGameEvent({ kind: 'nope' }).kind === 'ui');

const dirty = sanitizePayload({
  message: 'x'.repeat(800),
  rolls: Array.from({ length: 40 }, (_, i) => i),
  nested: { fn: () => 1, deep: { a: { b: { c: { d: 1 } } } } },
});
check('sanitize caps strings', dirty.message.length === 500);
check('sanitize caps arrays', dirty.rolls.length === 24);
check('sanitize drops functions', dirty.nested.fn === undefined);

check('actionLog move maps to move', mapActionLogTypeToKind('move') === 'move');
check('actionLog cards maps to ui', mapActionLogTypeToKind('cards') === 'ui');
check('actionLog does not fan-out combat', shouldFanOutActionLogType('combat') === false);
check('actionLog fans-out cards', shouldFanOutActionLogType('cards') === true);

const writes = [];
const throwingWriter = () => {
  writes.push('called');
  throw new Error('network down');
};
const log = new GameEventLog({
  gameId: 'game_test',
  gameState: { round: 1, phase: 'playing', turnPhase: 'purchase', currentPlayer: { id: 'ger', name: 'Rob' } },
  writer: throwingWriter,
  getWriterUid: () => 'uid-host',
  lobbyCode: 'TEST01',
});
let threw = false;
try {
  log.log('purchase', { payload: { ipcDelta: -3, unitType: 'infantry' } });
} catch {
  threw = true;
}
check('throwing writer does not throw to caller', threw === false);
check('throwing writer was attempted', writes[0] === 'called');
const skipped = [];
const noUidLog = new GameEventLog({ gameId: 'g-nouid', writer: () => skipped.push('no') });
noUidLog.log('ui', { payload: { action: 'anon' } });
check('missing writerUid skips cloud write', skipped.length === 0 && noUidLog.recent(1)[0].kind === 'ui');
check('event still buffered', log.recent(1)[0].kind === 'purchase');

let resolvedAfter = false;
const slowWriter = () => new Promise(() => {});
const log2 = new GameEventLog({ gameId: 'g2', writer: slowWriter, gameState: { round: 2 } });
log2.log('phase', { payload: { action: 'nextPhase' } });
resolvedAfter = true;
check('async writer is fire-and-forget', resolvedAfter === true);

bindGameEventLog(log);
emitGameEvent('error', { payload: { message: 'boom' } });
check('emitGameEvent hits bound log', log.recent().some((e) => e.kind === 'error'));
log.logSoftLockEscape({ reason: 'attacker_wiped', territory: 'Western United States' });
const escape = log.recent(1)[0];
check('soft-lock escape is ui + flag', escape.kind === 'ui' && escape.payload.softLockEscape === true && escape.payload.reason === 'attacker_wiped');
unbindGameEventLog();
emitGameEvent('error', { payload: { message: 'ignored' } });
check('unbound emit is a no-op', true);

const events = [
  { ts: 1000, kind: 'aa', territory: 'France', turn: 2 },
  { ts: 2000, kind: 'combat', territory: 'France', turn: 2 },
  { ts: 3000, kind: 'move', territory: 'Germany', turn: 3 },
];
check('filter by territory', filterEvents(events, { territory: 'France' }).length === 2);
check('filter by window', filterEvents(events, { since: 1500, until: 2500 }).length === 1);
check('filter by kind+turn', filterEvents(events, { kind: 'move', turn: 3 }).length === 1);

const plan = describeEventQuery({
  lobbyHint: 'boysenberry',
  territory: 'Western United States',
  kind: 'aa',
  since: 1,
  until: 2,
});
check('query plan has lobby equality', plan.lobbyLookup.some((q) => q.collection === 'lobbies' && q.field === 'name'));
check('query plan time is client-side', plan.note.includes('client-side'));

const parsed = parseScreenshotHint('boysenberry ~10:34 PT 19 Sep');
check('screenshot parses lobby', parsed.lobbyHint === 'boysenberry');
check('screenshot builds window', parsed.since > 0 && parsed.until > parsed.since);
check('screenshot named lobby keeps spaces', parseScreenshotHint("James's Game 10:34 PT").lobbyHint === "James's Game");

check('summarizeUnits caps', summarizeUnits(Array.from({ length: 20 }, () => ({ type: 'infantry', quantity: 1 }))).length === 16);

let addCalls = 0;
const writer = createFirestoreEventWriter({
  getDb: () => ({ name: 'db' }),
  addDocImpl: async () => { addCalls += 1; throw new Error('denied'); },
  collectionImpl: () => ({ path: 'events' }),
});
await writer('game_1', built);
check('firestore writer swallows addDoc errors', addCalls === 1);

const mem = new GameEventLog({ gameId: 'g-tel', gameState: { round: 4, phase: 'playing', turnPhase: 'combat', currentPlayer: { id: 'p1', name: 'Sean' } } });
bindGameEventLog(mem);
const stub = {
  combatTelemetry: [],
  round: 4,
  phase: 'playing',
  turnPhase: 'combat',
  currentPlayer: { id: 'p1', name: 'Sean' },
};
GameState.prototype.recordCombatTelemetry.call(stub, {
  kind: 'aa',
  territory: 'France',
  hits: 1,
  rolls: [1, 5, 6],
  attackForce: [{ type: 'fighter', quantity: 2 }],
  defenseForce: [{ type: 'aaGun', quantity: 1 }],
  survivors: [{ type: 'fighter', quantity: 1 }],
  wiped: false,
});
check('combatTelemetry still stored on state', stub.combatTelemetry.length === 1 && stub.combatTelemetry[0].kind === 'aa');
check('combatTelemetry rolls preserved', stub.combatTelemetry[0].rolls[0] === 1);
check('telemetry also emits cloud aa event', mem.recent().some((e) => e.kind === 'aa' && e.territory === 'France' && e.payload.via === 'combatTelemetry'));
unbindGameEventLog();

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
