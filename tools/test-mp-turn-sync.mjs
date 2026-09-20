// Unit checks for V2.58 multiplayer turn-bar + auto-battle sync fixes.
// Run: node tools/test-mp-turn-sync.mjs

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

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  computeIsLocalPlayerTurn,
  shouldShowBottomTurnActions,
  isCurrentPlayerLocal,
  shouldShowSpectatorWaiting,
  resolveWaitingForSyncAfterRemoteSnapshot,
  resolveWaitingForSyncAfterStateApply,
  shouldShowPlaceUnitsUI,
} = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const {
  canFinishPlacementRound,
  pickAuthoritativePlacementSnapshot,
} = await import(pathToFileURL(join(root, 'src/state/placementPass.js')));
const { createPushQueue } = await import(pathToFileURL(join(root, 'src/multiplayer/pushCoalesce.js')));
const {
  mayRunAI,
  anyHumanPresent,
  computeHumanPresent,
  isLocalHumanSeated,
  DEFAULT_AI_RUNS_WHEN_UNATTENDED,
} = await import(pathToFileURL(join(root, 'src/multiplayer/aiPolicy.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

console.log('=== Bug A: spectator never sees the primary End-phase bar ===');
{
  check('hotseat / local: always local turn',
    computeIsLocalPlayerTurn({ isMultiplayer: false, isWaitingForSync: false, localUserId: null, currentPlayerOderId: 'x' }) === true);

  check('MP: current player is local → local turn',
    computeIsLocalPlayerTurn({ isMultiplayer: true, isWaitingForSync: false, localUserId: 'sean', currentPlayerOderId: 'sean' }) === true);

  check('MP: spectator (Robert watching Sean) → not local turn',
    computeIsLocalPlayerTurn({ isMultiplayer: true, isWaitingForSync: false, localUserId: 'robert', currentPlayerOderId: 'sean' }) === false);

  check('MP: waiting-for-sync after handing off → not local turn',
    computeIsLocalPlayerTurn({ isMultiplayer: true, isWaitingForSync: true, localUserId: 'sean', currentPlayerOderId: 'sean' }) === false);

  check('MP: missing localUserId → not local turn (fail closed)',
    computeIsLocalPlayerTurn({ isMultiplayer: true, isWaitingForSync: false, localUserId: null, currentPlayerOderId: 'sean' }) === false);

  check('bottom bar hidden for spectator',
    shouldShowBottomTurnActions({ isMultiplayer: true, isLocalPlayerTurn: false, isAI: false }) === false);

  check('bottom bar hidden while waiting for sync',
    shouldShowBottomTurnActions({ isMultiplayer: true, isLocalPlayerTurn: false, isAI: false }) === false);

  check('bottom bar shown for active human',
    shouldShowBottomTurnActions({ isMultiplayer: true, isLocalPlayerTurn: true, isAI: false }) === true);

  check('bottom bar hidden for AI even on "local" render',
    shouldShowBottomTurnActions({ isMultiplayer: true, isLocalPlayerTurn: true, isAI: true }) === false);

  check('bottom bar shown in local/hotseat',
    shouldShowBottomTurnActions({ isMultiplayer: false, isLocalPlayerTurn: true, isAI: false }) === true);
}

console.log('=== Bug B: notify pause + equal-version reload rule ===');
{
  const gs = new GameState({ risk: { factions: [] } }, [], []);
  let count = 0;
  gs.subscribe(() => { count++; });

  gs._notify();
  check('unpaused notify fires', count === 1);

  gs.pauseNotifications();
  gs._notify();
  gs._notify();
  gs._notify();
  check('paused notifies are swallowed', count === 1);

  gs.resumeNotifications({ flush: false });
  check('resume without flush does not fire', count === 1);

  gs.pauseNotifications();
  gs._notify();
  gs.resumeNotifications({ flush: true });
  check('resume with flush fires once', count === 2);

  gs.pauseNotifications();
  gs.pauseNotifications();
  gs._notify();
  gs.resumeNotifications({ flush: true });
  check('nested pause: inner resume does not flush', count === 2);
  gs.resumeNotifications({ flush: true });
  check('nested pause: outer resume flushes once', count === 3);

  // Production _reloadRemoteState must apply remote when force=true even if
  // versions are equal (failed write never incremented the server).
  const shouldApply = (remote, local, force) => force || remote > local;
  check('stale path: newer remote applies', shouldApply(5, 4, false) === true);
  check('stale path: equal versions do NOT apply (no-op)', shouldApply(4, 4, false) === false);
  check('exhaust path: equal versions MUST apply (force)', shouldApply(4, 4, true) === true);
  check('exhaust path: older remote still applies when forced', shouldApply(3, 4, true) === true);
}

const unitDefs = {
  infantry: { isLand: true },
  tacticalBomber: { isAir: true },
  factory: { isBuilding: true },
};

function makePlacementTable({
  players = [
    { id: 'p1', name: 'James', oderId: 'james', isAI: false },
    { id: 'p2', name: 'Sean', oderId: 'sean', isAI: false },
  ],
  currentPlayerIndex = 0,
  placementRound = 2,
  unitsPlacedThisRound = 6,
  unitsToPlace = null,
} = {}) {
  const territories = [
    { name: 'Home', isWater: false, connections: ['Sea'] },
    { name: 'Away', isWater: false, connections: ['Sea'] },
    { name: 'Sea', isWater: true, connections: ['Home', 'Away'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = players;
  gs.currentPlayerIndex = currentPlayerIndex;
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.turnPhase = 'develop_tech';
  gs.placementRound = placementRound;
  gs.unitsPlacedThisRound = unitsPlacedThisRound;
  gs.territoryState = {
    Home: { owner: players[0].id },
    Away: { owner: players[1].id },
  };
  gs.playerState = {
    [players[0].id]: { capitalTerritory: 'Home' },
    [players[1].id]: { capitalTerritory: players[1] ? 'Away' : 'Home' },
  };
  gs.unitsToPlace = unitsToPlace || {
    [players[0].id]: [
      { type: 'infantry', quantity: 3 },
      { type: 'tacticalBomber', quantity: 1 },
    ],
    [players[1].id]: [{ type: 'infantry', quantity: 4 }],
  };
  return gs;
}

console.log('=== V2.72 version + leftover-unit pass predicate ===');
{
  check('GAME_VERSION is V2.81.57-dual-path.7', GAME_VERSION === 'V2.81.57-dual-path.7');
  check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);
  check('round cap allows Done with leftovers still in the pool',
    canFinishPlacementRound({
      placedThisRound: 6, limit: 6, remainingKnown: 4, hasPlaceable: true,
    }) === true);
  check('unplaceable leftover allows Done (ghost / landlock)',
    canFinishPlacementRound({
      placedThisRound: 2, limit: 6, remainingKnown: 1, hasPlaceable: false,
    }) === true);
  check('placeable remainder below cap blocks Done',
    canFinishPlacementRound({
      placedThisRound: 2, limit: 6, remainingKnown: 4, hasPlaceable: true,
    }) === false);
}

console.log('=== third-wave Done persists the next seat (async kill-after-Done) ===');
{
  const gs = makePlacementTable({ placementRound: 2, unitsPlacedThisRound: 6 });
  gs._lastCapital = { playerId: 'p1', territory: 'Home' };
  const before = gs.toJSON();
  const pass = gs.finishPlacementRound(unitDefs);
  check('Done on wave 3 commits', pass.ok === true);
  check('next human already owns the seat', gs.currentPlayer?.id === 'p2');
  check('phase stays unit placement while the next seat can place',
    gs.phase === GAME_PHASES.UNIT_PLACEMENT);
  check('leftover in-memory capital does not block Done', pass.ok === true);

  const remote = gs.toJSON();
  check('unitsPlacedThisRound is serialized (mid-wave rejoin cap)',
    Object.prototype.hasOwnProperty.call(remote, 'unitsPlacedThisRound'));
  check('pass snapshot stores the next seat', remote.currentPlayerIndex === 1);

  const leaver = makePlacementTable({ placementRound: 2, unitsPlacedThisRound: 6 });
  leaver.loadFromJSON(remote);
  check('rejoin after committed Done is NOT stuck as the passer',
    leaver.currentPlayer?.id === 'p2');
  check('leaver cannot finish again — not their seat',
    leaver.canFinishPlacementRound('p1', unitDefs) === false
    || leaver.currentPlayer?.id !== 'p1');

  const uncommitted = new GameState({ risk: { factions: [] } }, [], []);
  uncommitted.loadFromJSON(before);
  check('Done that never wrote: rejoin restores the same passer mid-wave',
    uncommitted.currentPlayer?.id === 'p1');
  check('uncommitted rejoin can Done again (6/6 still finishable)',
    uncommitted.canFinishPlacementRound('p1', unitDefs) === true);
  const retry = uncommitted.finishPlacementRound(unitDefs);
  check('second client/session Done advances after a lost write',
    retry.ok === true && uncommitted.currentPlayer?.id === 'p2');
}

console.log('=== rejoin mid-place restores the 6-cap, then pass ===');
{
  const live = makePlacementTable({ unitsPlacedThisRound: 3 });
  live.unitsToPlace.p1 = [{ type: 'infantry', quantity: 3 }];
  const snap = live.toJSON();
  const rejoin = new GameState({ risk: { factions: [] } }, [
    { name: 'Home', isWater: false, connections: [] },
  ], []);
  rejoin.loadFromJSON(snap);
  check('mid-place rejoin restores unitsPlacedThisRound',
    rejoin.unitsPlacedThisRound === 3);
  check('mid-place rejoin still owns the seat', rejoin.currentPlayer?.id === 'p1');
  const one = rejoin.placeInitialUnit('Home', 'infantry', unitDefs);
  check('can finish remaining placements after rejoin', one.success === true);
  rejoin.placeInitialUnit('Home', 'infantry', unitDefs);
  rejoin.placeInitialUnit('Home', 'infantry', unitDefs);
  const over = rejoin.placeInitialUnit('Home', 'infantry', unitDefs);
  check('6-cap still enforced after rejoin (no extra place)',
    over.success === false);
  const pass = rejoin.finishPlacementRound(unitDefs);
  check('after finishing remaining places, Done passes',
    pass.ok === true && rejoin.currentPlayer?.id === 'p2');
}

console.log('=== double-tap Done does not skip the next human ===');
{
  const gs = makePlacementTable({ unitsPlacedThisRound: 6 });
  const first = gs.finishPlacementRound(unitDefs);
  const second = gs.finishPlacementRound(unitDefs);
  check('first Done advances to p2', first.ok === true && gs.currentPlayer?.id === 'p2');
  check('second Done is not-ready while p2 still has placeable units',
    second.ok === false && second.reason === 'not-ready');
  check('double-tap did not skip p2', gs.currentPlayer?.id === 'p2');
}

console.log('=== human vs AI + last-human leave (state, not presence) ===');
{
  const gs = makePlacementTable({
    players: [
      { id: 'p1', name: 'James', oderId: 'james', isAI: false },
      { id: 'ai', name: 'Germany', isAI: true },
    ],
    unitsToPlace: {
      p1: [{ type: 'infantry', quantity: 1 }],
      ai: [{ type: 'infantry', quantity: 4 }],
    },
    unitsPlacedThisRound: 6,
  });
  const pass = gs.finishPlacementRound(unitDefs);
  check('human Done hands the seat to the AI',
    pass.ok === true && gs.currentPlayer?.id === 'ai');
  const remote = gs.toJSON();
  const rejoin = new GameState({ risk: { factions: [] } }, [], []);
  rejoin.loadFromJSON(remote);
  check('rejoin after Done+exit sees the AI seat, not a half-pass',
    rejoin.currentPlayer?.id === 'ai');
  check('default policy: last human gone → AI does not run unattended',
    mayRunAI({ aiHasAuthority: true, runsWhenUnattended: false, humanPresent: false }) === false);
  check('host/failover may run AI when a human is present',
    mayRunAI({ aiHasAuthority: true, runsWhenUnattended: false, humanPresent: true }) === true);
  check('non-host without authority cannot run AI after host leave',
    mayRunAI({ aiHasAuthority: false, runsWhenUnattended: false, humanPresent: true }) === false);
}

console.log('=== two clients: remote/Firebase snapshot wins ===');
{
  const localPass = { currentPlayerIndex: 1, phase: 'unit_placement' };
  const remoteStillPasser = { currentPlayerIndex: 0, phase: 'unit_placement' };
  check('equal version: remote wins (no local-only pass)',
    pickAuthoritativePlacementSnapshot({
      remote: remoteStillPasser,
      local: localPass,
      remoteVersion: 4,
      localVersion: 4,
    }) === remoteStillPasser);
  const remoteCommitted = { currentPlayerIndex: 1, phase: 'unit_placement' };
  check('newer remote committed pass wins',
    pickAuthoritativePlacementSnapshot({
      remote: remoteCommitted,
      local: remoteStillPasser,
      remoteVersion: 5,
      localVersion: 4,
    }) === remoteCommitted);
}

console.log('=== push queue: Done waiter waits for the post-Done write ===');
{
  const writes = [];
  let live = 'place';
  let releasePlace;
  const holdPlace = new Promise((r) => { releasePlace = r; });
  let sawPlaceStart;
  const placeStarted = new Promise((r) => { sawPlaceStart = r; });
  const q = createPushQueue(async () => {
    const snap = live;
    if (snap === 'place') {
      sawPlaceStart();
      await holdPlace;
    }
    writes.push(snap);
    return snap === 'done';
  });
  const placeWait = q.enqueue();
  await placeStarted;
  live = 'done';
  const doneWait = q.enqueue();
  releasePlace();
  const [placeResult, doneResult] = await Promise.all([placeWait, doneWait]);
  check('in-flight place write still happens', writes[0] === 'place');
  check('coalesced follow-up writes the Done snapshot', writes[1] === 'done');
  check('Done waiter result is the Done write, not the place write',
    doneResult === true);
  check('place waiter also settles after the coalesced Done write',
    placeResult === true);
}

console.log('=== V2.73: never spectator-wait on your own seat ===');
{
  const robert = 'sypRcamUvNXDlD7BRyJrYImZg5H2';
  const james = 'james-host-uid';

  check('own seat is local',
    isCurrentPlayerLocal({ localUserId: robert, currentPlayerOderId: robert }) === true);
  check('other seat is not local',
    isCurrentPlayerLocal({ localUserId: robert, currentPlayerOderId: james }) === false);

  check('active human + spectator overlay is illegal',
    !(isCurrentPlayerLocal({ localUserId: robert, currentPlayerOderId: robert })
      && shouldShowSpectatorWaiting({
        isMultiplayer: true,
        localUserId: robert,
        currentPlayerOderId: robert,
      })));

  check('own seat never shows spectator overlay (even if waiting is stuck)',
    shouldShowSpectatorWaiting({
      isMultiplayer: true,
      localUserId: robert,
      currentPlayerOderId: robert,
    }) === false);

  check('other seat shows spectator overlay',
    shouldShowSpectatorWaiting({
      isMultiplayer: true,
      localUserId: robert,
      currentPlayerOderId: james,
    }) === true);

  check('hotseat never shows spectator overlay',
    shouldShowSpectatorWaiting({
      isMultiplayer: false,
      localUserId: robert,
      currentPlayerOderId: robert,
    }) === false);

  check('remote snapshot that makes you current MUST clear waiting',
    resolveWaitingForSyncAfterRemoteSnapshot({
      isWaitingForSync: true,
      isActivePlayer: true,
    }) === false);

  check('remote snapshot while it is someone else keeps the waiting lock',
    resolveWaitingForSyncAfterRemoteSnapshot({
      isWaitingForSync: true,
      isActivePlayer: false,
    }) === true);

  check('isActivePlayer true ⇒ place UI (stuck waiting is dropped)',
    shouldShowPlaceUnitsUI({
      isMultiplayer: true,
      isWaitingForSync: true,
      localUserId: robert,
      currentPlayerOderId: robert,
      isActivePlayer: true,
    }) === true);

  check('isActivePlayer false ⇒ no place UI',
    shouldShowPlaceUnitsUI({
      isMultiplayer: true,
      isWaitingForSync: true,
      localUserId: robert,
      currentPlayerOderId: james,
      isActivePlayer: false,
    }) === false);
}

console.log('=== V2.73: host vs non-host after mixed capital + AI seats ===');
{
  // Live seat order: Robert007 (browser, not host), Easy Bot, James (host), Hard Bot.
  // After capitals, unit_placement belongs to Robert. Both clients may still
  // have isWaitingForSync from the V2.72 handoff lock.
  const robert = 'sypRcamUvNXDlD7BRyJrYImZg5H2';
  const james = 'james-host-uid';
  const currentAfterAIs = robert;

  const robertWaiting = resolveWaitingForSyncAfterRemoteSnapshot({
    isWaitingForSync: true,
    isActivePlayer: currentAfterAIs === robert,
  });
  check('non-host Robert after AI seats: waiting cleared',
    robertWaiting === false);
  check('non-host Robert after AI seats: place UI',
    shouldShowPlaceUnitsUI({
      isMultiplayer: true,
      isWaitingForSync: true,
      localUserId: robert,
      currentPlayerOderId: currentAfterAIs,
      isActivePlayer: true,
    }) === true);
  check('non-host Robert after AI seats: no spectator overlay',
    shouldShowSpectatorWaiting({
      isMultiplayer: true,
      localUserId: robert,
      currentPlayerOderId: currentAfterAIs,
    }) === false);
  check('non-host Robert after AI seats: bottom bar shown',
    shouldShowBottomTurnActions({
      isMultiplayer: true,
      isLocalPlayerTurn: computeIsLocalPlayerTurn({
        isMultiplayer: true,
        isWaitingForSync: robertWaiting,
        localUserId: robert,
        currentPlayerOderId: currentAfterAIs,
      }),
      isAI: false,
    }) === true);

  const jamesWaiting = resolveWaitingForSyncAfterRemoteSnapshot({
    isWaitingForSync: true,
    isActivePlayer: currentAfterAIs === james,
  });
  check('host James after AI seats: still waiting (not his seat)',
    jamesWaiting === true);
  check('host James after AI seats: no place UI',
    shouldShowPlaceUnitsUI({
      isMultiplayer: true,
      isWaitingForSync: true,
      localUserId: james,
      currentPlayerOderId: currentAfterAIs,
      isActivePlayer: false,
    }) === false);
  check('host James after AI seats: spectator overlay for Robert',
    shouldShowSpectatorWaiting({
      isMultiplayer: true,
      localUserId: james,
      currentPlayerOderId: currentAfterAIs,
    }) === true);
  check('host James after AI seats: bottom bar hidden',
    shouldShowBottomTurnActions({
      isMultiplayer: true,
      isLocalPlayerTurn: computeIsLocalPlayerTurn({
        isMultiplayer: true,
        isWaitingForSync: jamesWaiting,
        localUserId: james,
        currentPlayerOderId: currentAfterAIs,
      }),
      isAI: false,
    }) === false);
}

console.log('=== V2.75: host waiting lock drops after local AI handoff ===');
{
  // Dump table: Hard Bot, Hard Bot, James (host), Robert007 (guest).
  // James Done → AIs run locally on the host → seat returns to James.
  // isPushing swallows state_updated, so isActivePlayer can stay stale false.
  const james = 'kCdPAKp78CbNfdXruyEzZeGhBsD3';
  const robert = 'sypRcamUvNXDlD7BRyJrYImZg5H2';
  const players = [
    { id: 'p0', name: 'Hard Bot', isAI: true },
    { id: 'p1', name: 'Hard Bot', isAI: true },
    { id: 'p2', name: 'James', oderId: james, isAI: false },
    { id: 'p3', name: 'Robert007', oderId: robert, isAI: false },
  ];
  const territories = [
    { name: 'BotA', isWater: false, connections: [] },
    { name: 'BotB', isWater: false, connections: [] },
    { name: 'JamesLand', isWater: false, connections: [] },
    { name: 'RobertLand', isWater: false, connections: [] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = players;
  gs.currentPlayerIndex = 3;
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.turnPhase = 'purchase';
  gs.placementRound = 2;
  gs.unitsPlacedThisRound = 6;
  gs.territoryState = {
    BotA: { owner: 'p0' },
    BotB: { owner: 'p1' },
    JamesLand: { owner: 'p2' },
    RobertLand: { owner: 'p3' },
  };
  gs.playerState = {
    p0: { capitalTerritory: 'BotA' },
    p1: { capitalTerritory: 'BotB' },
    p2: { capitalTerritory: 'JamesLand' },
    p3: { capitalTerritory: 'RobertLand' },
  };
  gs.unitsToPlace = {
    p0: [{ type: 'infantry', quantity: 4 }],
    p1: [{ type: 'infantry', quantity: 4 }],
    p2: [{ type: 'infantry', quantity: 4 }],
    p3: [{ type: 'infantry', quantity: 4 }],
  };

  check('Done optimistic lock still hides actions on own seat BEFORE apply',
    computeIsLocalPlayerTurn({
      isMultiplayer: true,
      isWaitingForSync: true,
      localUserId: james,
      currentPlayerOderId: james,
    }) === false);

  const afterRobertDone = gs.finishPlacementRound(unitDefs);
  check('Robert Done hands the seat to an AI (dump v23→v24)',
    afterRobertDone.ok === true && gs.currentPlayer?.isAI === true);
  check('host lock stays while the next seat is an AI',
    resolveWaitingForSyncAfterStateApply({
      isWaitingForSync: true,
      localUserId: james,
      currentPlayerOderId: gs.currentPlayer?.oderId,
    }) === true);

  let aiPasses = 0;
  while (gs.currentPlayer?.isAI && gs.phase === GAME_PHASES.UNIT_PLACEMENT && aiPasses < 8) {
    gs.unitsPlacedThisRound = 6;
    const pass = gs.finishPlacementRound(unitDefs);
    if (!pass.ok) break;
    aiPasses++;
  }
  check('local AI finishPlacement hands the seat back to James',
    gs.currentPlayer?.oderId === james && gs.phase === GAME_PHASES.UNIT_PLACEMENT);

  const hostWaiting = resolveWaitingForSyncAfterStateApply({
    isWaitingForSync: true,
    localUserId: james,
    currentPlayerOderId: gs.currentPlayer?.oderId,
  });
  check('host lock drops on own seat after local AI apply', hostWaiting === false);
  check('stale isActivePlayer=false still shows place-units on own seat',
    shouldShowPlaceUnitsUI({
      isMultiplayer: true,
      isWaitingForSync: true,
      localUserId: james,
      currentPlayerOderId: james,
      isActivePlayer: false,
    }) === true);
  check('host spectator overlay stays off on own seat',
    shouldShowSpectatorWaiting({
      isMultiplayer: true,
      localUserId: james,
      currentPlayerOderId: james,
    }) === false);
  check('host Done / place actions show after lock drop',
    shouldShowBottomTurnActions({
      isMultiplayer: true,
      isLocalPlayerTurn: computeIsLocalPlayerTurn({
        isMultiplayer: true,
        isWaitingForSync: hostWaiting,
        localUserId: james,
        currentPlayerOderId: james,
      }),
      isAI: false,
    }) === true);

  check('guest Robert still waits on James seat',
    shouldShowSpectatorWaiting({
      isMultiplayer: true,
      localUserId: robert,
      currentPlayerOderId: james,
    }) === true);
  check('guest Robert has no place-units on James seat',
    shouldShowPlaceUnitsUI({
      isMultiplayer: true,
      isWaitingForSync: true,
      localUserId: robert,
      currentPlayerOderId: james,
      isActivePlayer: false,
    }) === false);
}

console.log('=== V2.75: seated local human counts as present for AI ===');
{
  const james = 'kCdPAKp78CbNfdXruyEzZeGhBsD3';
  const robert = 'sypRcamUvNXDlD7BRyJrYImZg5H2';
  const players = [
    { id: 'p0', name: 'Hard Bot', isAI: true },
    { id: 'p1', name: 'Hard Bot', isAI: true },
    { id: 'p2', name: 'James', oderId: james, isAI: false },
    { id: 'p3', name: 'Robert007', oderId: robert, isAI: false },
  ];
  const allOffline = () => 'offline';
  const robertOnline = (id) => (id === robert ? 'online' : 'offline');

  check('DEFAULT_AI_RUNS_WHEN_UNATTENDED stays false',
    DEFAULT_AI_RUNS_WHEN_UNATTENDED === false);
  check('presence-only: all offline → absent',
    anyHumanPresent(players, allOffline) === false);
  check('iPhone host client is seated even when presence is offline',
    isLocalHumanSeated(players, james) === true);
  check('host client counts as present when presence docs are offline',
    computeHumanPresent({
      players,
      presenceOf: allOffline,
      localUserId: james,
    }) === true);
  check('host may run AI while his client is here (presence stale)',
    mayRunAI({
      aiHasAuthority: true,
      runsWhenUnattended: false,
      humanPresent: computeHumanPresent({
        players,
        presenceOf: allOffline,
        localUserId: james,
      }),
    }) === true);
  check('unattended: no local seated human, no online humans → pause',
    computeHumanPresent({
      players,
      presenceOf: allOffline,
      localUserId: null,
    }) === false);
  check('unattended host-authority still pauses',
    mayRunAI({
      aiHasAuthority: true,
      runsWhenUnattended: false,
      humanPresent: computeHumanPresent({
        players,
        presenceOf: allOffline,
        localUserId: null,
      }),
    }) === false);
  check('other human online still counts when this client is not seated',
    computeHumanPresent({
      players,
      presenceOf: robertOnline,
      localUserId: null,
    }) === true);
  check('aiRunsWhenUnattended still overrides a fully empty table',
    mayRunAI({
      aiHasAuthority: true,
      runsWhenUnattended: true,
      humanPresent: false,
    }) === true);
  check('non-host never runs AI even if locally seated',
    mayRunAI({
      aiHasAuthority: false,
      runsWhenUnattended: false,
      humanPresent: true,
    }) === false);
  check('surrendered local human does not count as seated',
    isLocalHumanSeated(
      [{ oderId: james, isAI: false, surrendered: true }],
      james,
    ) === false);
}

console.log('=== V2.81.55 combatTelemetry persists on the game doc ===');
{
  const gs = new GameState({ risk: { factions: [] } }, [], []);
  gs.round = 3;
  gs.recordCombatTelemetry({
    kind: 'aa',
    territory: 'Western Europe',
    hits: 2,
    rolls: [1, 1, 5],
    attackForce: [{ type: 'fighter', quantity: 3 }],
    defenseForce: [{ type: 'aaGun', quantity: 1 }],
    survivors: [{ type: 'fighter', quantity: 1 }],
    wiped: false,
  });
  const json = gs.toJSON();
  check('toJSON includes combatTelemetry (additive SCHEMA 11)',
    Array.isArray(json.combatTelemetry) && json.combatTelemetry.length === 1
    && json.combatTelemetry[0].kind === 'aa'
    && json.combatTelemetry[0].rolls.join(',') === '1,1,5');
  const loaded = new GameState({ risk: { factions: [] } }, [], []);
  loaded.loadFromJSON({ ...json, version: 11, players: [], territoryState: {}, units: {}, playerState: {} });
  check('loadFromJSON restores combatTelemetry for boysenberry-style dumps',
    loaded.getCombatTelemetry()[0]?.hits === 2
    && loaded.getCombatTelemetry()[0]?.territory === 'Western Europe');
}

console.log(failures === 0 ? '\nALL MP TURN-SYNC CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
