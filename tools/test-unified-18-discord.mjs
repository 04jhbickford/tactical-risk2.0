// V2.81.57-unified.27 — Discord playtest: turn save, phase CTA, naval drag,
// one landing prompt, AA combat-move, lobby lock, Kazakh stem, turn ping
// after a confirmed push, remaining movement, return to base.
// Run: node tools/test-unified-18-discord.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
const mk = () => ({
  style: {},
  classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
  appendChild(c) { return c; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
  setAttribute() {},
  dataset: {},
});
globalThis.document ??= {
  documentElement: mk(),
  body: mk(),
  createElement: mk,
  getElementById() { return null; },
};
globalThis.window ??= globalThis;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  recoverStalePush,
  shouldPreserveLocalTurn,
} = await import(pathToFileURL(join(root, 'src/multiplayer/syncAuthority.js')));
const {
  shouldReattachDeadSnapshot,
  shouldRereadRemoteOnWake,
} = await import(pathToFileURL(join(root, 'src/multiplayer/presencePolicy.js')));
const {
  resolveHostReconnectCopy,
  unsavedPhaseLeaveWarning,
} = await import(pathToFileURL(join(root, 'src/multiplayer/lastMatch.js')));
const { bindDiscordTurnPing, seatKeyOf } = await import(pathToFileURL(join(root, 'src/multiplayer/discordTurnPing.js')));
const { phaseOwnsMovementConfirm } = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const { decomposeMoveSelection } = await import(pathToFileURL(join(root, 'src/state/combatMoveEligibility.js')));
const {
  airMovementBadge,
  returnToBaseAssignments,
} = await import(pathToFileURL(join(root, 'src/state/airLanding.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const { renderGameOptionsPanel } = await import(pathToFileURL(join(root, 'src/ui/gameOptionsPanel.js')));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

console.log('=== V2.81.57-unified.27 discord playtest ===');
check('GAME_VERSION is V2.81.57-unified.27', GAME_VERSION === 'V2.81.57-unified.27');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
const combatSrc = readFileSync(join(root, 'src/ui/combatUI.js'), 'utf8');

check('S1 same-seat stale push retries at the remote version',
  recoverStalePush({
    confirmedSeatId: 'rob',
    remoteSeatId: 'rob',
    remoteVersion: 5,
    localVersion: 3,
  }).action === 'retry'
  && recoverStalePush({
    confirmedSeatId: 'rob',
    remoteSeatId: 'rob',
    remoteVersion: 5,
    localVersion: 3,
  }).localVersion === 5);
check('S1 a seat we do not hold reloads and says the turn was not saved',
  recoverStalePush({
    confirmedSeatId: 'rob',
    remoteSeatId: 'bastion',
    remoteVersion: 5,
    localVersion: 3,
  }).action === 'reload'
  && recoverStalePush({
    confirmedSeatId: 'rob',
    remoteSeatId: 'bastion',
  }).notice === 'Could not save your turn — the match has moved on.');
check('S1 a local turn-end is kept while the server still has our seat',
  shouldPreserveLocalTurn({
    confirmedSeatId: 'rob',
    liveSeatId: 'bastion',
    remoteSeatId: 'rob',
  }) === true
  && shouldPreserveLocalTurn({
    confirmedSeatId: 'rob',
    liveSeatId: 'bastion',
    remoteSeatId: 'rob',
    force: true,
  }) === false
  && shouldPreserveLocalTurn({
    confirmedSeatId: 'rob',
    liveSeatId: 'bastion',
    remoteSeatId: 'james',
  }) === false);
check('S1 a visible tab reattaches a dead snapshot listener',
  shouldReattachDeadSnapshot({ listenerLive: false, visibility: 'visible' }) === true
  && shouldReattachDeadSnapshot({ listenerLive: false, visibility: 'hidden' }) === false
  && shouldReattachDeadSnapshot({ listenerLive: true, visibility: 'visible' }) === false);
check('S1 wake re-reads the doc on focus, online, and show',
  shouldRereadRemoteOnWake({ event: 'focus' }) === true
  && shouldRereadRemoteOnWake({ event: 'online' }) === true
  && shouldRereadRemoteOnWake({ event: 'visibility-visible' }) === true
  && shouldRereadRemoteOnWake({ event: 'visibility-hidden' }) === false);

const offlineCopy = resolveHostReconnectCopy({
  hostPresence: 'offline',
  hostName: 'Bastion',
  gameCode: '6FSGBV',
});
check('S2 reconnect copy says the match is saved',
  offlineCopy === 'Bastion is reconnecting — you are still in 6FSGBV. The match is saved.'
  && !/Do not leave/i.test(offlineCopy)
  && !mainSrc.includes('Do not leave'));
check('S2 leave warning is only for unsaved phase edits',
  unsavedPhaseLeaveWarning({ hasUnsavedPhaseChanges: false }) === ''
  && unsavedPhaseLeaveWarning({ hasUnsavedPhaseChanges: true })
    === 'You have unsaved changes this phase. Stay until they save.'
  && mainSrc.includes('unsavedPhaseLeaveWarning')
  && mainSrc.includes("addEventListener('beforeunload'"));

const nextCombat = combatSrc.slice(combatSrc.indexOf('  _nextCombat() {'));
check('S3 combat phase does not auto-open the first battle',
  (mainSrc.match(/Combat phase waits on the battle list/g) || []).length >= 2
  && !nextCombat.includes('showNextCombat()'));
{
  const ui = Object.create(CombatUI.prototype);
  ui.el = { classList: { add() {}, contains() { return true; } } };
  ui._syncCombatChromeFlag = () => {};
  ui.gameState = { combatQueue: ['Sea A', 'Land B'] };
  let opened = 0;
  ui.showNextCombat = () => { opened += 1; };
  ui.onAllCombatsResolved = () => { opened += 10; };
  ui._nextCombat();
  check('S3 a finished battle leaves the rest of the queue for the player',
    opened === 0 && ui.gameState.combatQueue.join(',') === 'Sea A,Land B');
}

check('S4 movement confirm belongs to the move phases',
  phaseOwnsMovementConfirm(TURN_PHASES.COMBAT_MOVE) === true
  && phaseOwnsMovementConfirm(TURN_PHASES.NON_COMBAT_MOVE) === true
  && phaseOwnsMovementConfirm(TURN_PHASES.DEVELOP_TECH) === false
  && phaseOwnsMovementConfirm(TURN_PHASES.COMBAT) === false);
check('S4 tech phase label is Develop technology',
  mainSrc.includes('phaseOwnsMovementConfirm') === false
  && readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8').includes("'Develop technology'")
  && readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8').includes('phaseOwnsMovementConfirm(turnPhase)'));

const naval = decomposeMoveSelection({
  'ship:carrier-1': 1,
  'aircraft:carrier-1:fighter': 2,
  'ship:carrier-empty': 1,
  'cargo:transport-9:infantry': 1,
  infantry: 1,
});
check('S5 select-all drag keeps empty carriers and rides their aircraft',
  naval.shipIds.includes('carrier-1')
  && naval.shipIds.includes('carrier-empty')
  && !naval.units.some((unit) => unit.type === 'fighter')
  && naval.cargoUnloads.length === 1
  && naval.cargoUnloads[0].transportId === 'transport-9'
  && naval.units.some((unit) => unit.type === 'infantry' && unit.quantity === 1)
  && mainSrc.includes('shipIds: picked.shipIds'));
const ridingCargo = decomposeMoveSelection({
  'ship:transport-9': 1,
  'cargo:transport-9:infantry': 2,
});
check('S5 cargo on a selected transport is not moved twice',
  ridingCargo.shipIds.length === 1 && ridingCargo.cargoUnloads.length === 0 && ridingCargo.units.length === 0);

{
  let prompts = 0;
  const ui = Object.create(CombatUI.prototype);
  ui.el = { classList: { add() {}, contains() { return false; } } };
  ui._syncCombatChromeFlag = () => {};
  ui.gameState = { getAirLandingOptions: () => [{ territory: 'Home' }] };
  ui.unitDefs = { fighter: { isAir: true } };
  ui.currentTerritory = 'France';
  ui.combatState = {
    attackers: [{ type: 'fighter', quantity: 1 }],
    isRetreating: true,
  };
  ui.onAirLandingRequired = () => { prompts += 1; };
  ui._checkAirLanding();
  ui._checkAirLanding();
  check('S6 one landing prompt per retreat', prompts === 1 && ui.combatState.phase === 'airLanding');
}

{
  const html = CombatUI.prototype._renderCasualtyUnits.call({
    unitDefs: { battleship: {} },
  }, [{
    type: 'battleship',
    quantity: 1,
    owner: 'Germans',
    damagedCount: 0,
  }], {}, 'attacker');
  check('S7 one battleship, two casualty choices, owning icon',
    html.includes('Battleship — take 1 hit (damaged)')
    && html.includes('Battleship — sunk')
    && html.includes('units/Germans/Battleship.png')
    && !html.includes('(destroy)')
    && !html.includes('casualty-icon damaged')
    && !html.includes('casualty-avail damage')
    && (html.match(/<img /g) || []).length === 1);
}

function board() {
  const terr = [
    { name: 'Home', isWater: false, connections: ['East'] },
    { name: 'East', isWater: false, connections: ['Home'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, terr, []);
  gs.players = [
    { id: 'Germans', name: 'Bastion' },
    { id: 'British', name: 'Easy Bot', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.territoryState = {
    Home: { owner: 'Germans' },
    East: { owner: 'Germans' },
  };
  gs.playerState = { Germans: { ipcs: 0 }, British: { ipcs: 0 } };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Home', 'East']);
  gs.units = {
    Home: [{ type: 'aaGun', quantity: 1, owner: 'Germans' }],
    East: [],
  };
  return gs;
}
{
  const combat = board();
  combat.turnPhase = TURN_PHASES.COMBAT_MOVE;
  const blocked = combat.moveUnits('Home', 'East', [{ type: 'aaGun', quantity: 1 }], unitDefs);
  check('S8 AA guns cannot join a combat move',
    blocked.success === false && blocked.error === 'AA guns move in non-combat only'
    && combat.units.Home[0].quantity === 1 && combat.units.East.length === 0);
  const quiet = board();
  quiet.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  const moved = quiet.moveUnits('Home', 'East', [{ type: 'aaGun', quantity: 1 }], unitDefs);
  check('S8 AA guns still move in non-combat',
    moved.success === true
    && quiet.units.East.some((unit) => unit.type === 'aaGun' && unit.quantity === 1),
    moved.error);
}

{
  const joiner = renderGameOptionsPanel({ unitsPerRound: 8 }, { editable: false });
  const host = renderGameOptionsPanel({ unitsPerRound: 8 }, { editable: true });
  check('S9 a joiner sees the rules and cannot reset them',
    joiner.includes('Set by host')
    && joiner.includes('go-readonly')
    && !joiner.includes('Reset to standard')
    && !joiner.includes('disabled')
    && host.includes('Reset to standard')
    && host.includes('Customize'));
}

function verticalOverlaps(pts) {
  const edges = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if (a[0] !== b[0]) continue;
    const y1 = Math.min(a[1], b[1]);
    const y2 = Math.max(a[1], b[1]);
    if (y2 > y1) edges.push({ x: a[0], y1, y2 });
  }
  let n = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (edges[i].x !== edges[j].x) continue;
      const lo = Math.max(edges[i].y1, edges[j].y1);
      const hi = Math.min(edges[i].y2, edges[j].y2);
      if (hi - lo > 1) n += 1;
    }
  }
  return n;
}
{
  const line = readFileSync(join(root, 'map/polygons.txt'), 'utf8')
    .split(/\r?\n/)
    .find((row) => row.startsWith('Kazakh S.S.R.'));
  const txt = [...line.matchAll(/\((-?\d+),(-?\d+)\)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const data = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
  const kazakh = data.find((row) => row.name === 'Kazakh S.S.R.');
  // unified.18 cut the long stem (480 → 414). unified.20.1 cut the
  // leftover out-and-back stub, so the ring is 411. The interior-edge
  // check lives in tools/test-kazakh-outline.mjs.
  check('S10 Kazakh stem no longer doubles back through the territory',
    txt.length === 411
    && kazakh.polygons[0].length === 411
    && verticalOverlaps(txt) === 0
    && verticalOverlaps(kazakh.polygons[0]) === 0
    && !data.some((row) => row.name === 'Afghanistan'));
}

function pingGame(id) {
  const listeners = [];
  const gs = {
    currentPlayer: { id, isAI: false, name: 'Rob' },
    players: [{ id, isAI: false, name: 'Rob' }],
    currentPlayerIndex: 0,
    round: 1,
    phase: 'playing',
    turnEvents: [],
    getTurnPhaseName: () => 'Purchase',
    getTurnEventsSince() { return []; },
    getTurnEventsLastIndex() { return 0; },
    subscribe(fn) { listeners.push(fn); return () => {}; },
  };
  return { gs, listeners };
}
{
  const posts = [];
  const { gs, listeners } = pingGame('Russians');
  const unbind = bindDiscordTurnPing(gs, {
    getGameId: () => 'HENV42',
    deferUntilPushConfirmed: true,
    isApplyingRemote: () => false,
    storage: { getItem() { return null; }, setItem() {} },
    post: (_url, content) => { posts.push(content); return { ok: true }; },
  });
  gs.currentPlayer = { id: 'Germans', isAI: false, name: 'Bastion', discordUserId: '555555555555555555' };
  listeners[0]();
  check('S11 a seat change does not ping before the push confirms', posts.length === 0);
  check('S11 the wrong seat does not release the pending ping',
    unbind.confirmPushedSeat('Russians').reason === 'no-pending');
  const sent = unbind.confirmPushedSeat(seatKeyOf(gs));
  check('S11 the writer pings once after the confirmed seat',
    sent.ok === true && posts.length === 1 && posts[0].includes('<@555555555555555555>'));
  check('S11 a second confirm does not double-ping',
    unbind.confirmPushedSeat('Germans').reason === 'no-pending' && posts.length === 1);

  const dropped = [];
  const again = pingGame('British');
  const drop = bindDiscordTurnPing(again.gs, {
    getGameId: () => 'HENV42',
    deferUntilPushConfirmed: true,
    storage: { getItem() { return null; }, setItem() {} },
    post: () => { dropped.push('x'); return { ok: true }; },
  });
  again.gs.currentPlayer = { id: 'Americans', isAI: false, name: 'James' };
  again.listeners[0]();
  drop.discardPendingPing();
  drop.confirmPushedSeat('Americans');
  check('S11 a failed push discards the pending ping', dropped.length === 0);
}

{
  const units = [
    { type: 'fighter', id: 'f1', landingOptions: [{ territory: 'Home' }, { territory: 'Egypt' }] },
    { type: 'fighter', id: 'f2', landingOptions: [{ territory: 'Egypt' }] },
  ];
  const back = returnToBaseAssignments(units, { fighter: { origin: 'Home' } }, {});
  check('U1 Return to base uses a legal origin and leaves the rest',
    back.selections.f1 === 'Home'
    && back.unresolved.includes('f2')
    && !back.selections.f2);
  const landed = returnToBaseAssignments(units, { fighter: { origin: 'Home' } }, { f2: 'Egypt' });
  check('U1 an already named plane is left alone',
    landed.selections.f2 === 'Egypt' && landed.unresolved.length === 0 && landed.selections.f1 === 'Home');
}

const badge = airMovementBadge({ movement: 4, distance: 2 });
check('U2 the badge is remaining movement over the total',
  badge.label === 'M2/4'
  && badge.remaining === 2
  && badge.total === 4
  && badge.title === 'Movement 2 of 4'
  && airMovementBadge({ movement: 4, distance: 0 }).label === 'M4/4'
  && airMovementBadge({ movement: 4, distance: 999 }).label === 'M4/4'
  && airMovementBadge({ movement: 4, distance: 2, longRange: true }).label === 'M4/6');

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll unified.18 discord checks passed');
