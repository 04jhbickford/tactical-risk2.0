// V2.77: presence / join-by-code / deploy queue / title-banner / undo≠pass.
// Run: node tools/test-presence-and-deploy.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const {
  GameState,
  GAME_PHASES,
  SETUP_TURN_PHASE,
  resolvePersistedTurnPhase,
} = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  cloneUnitsToPlace,
  remainingDeployByPlayer,
  shouldApplyRemoteGameState,
  syncPushPhaseLabel,
  coerceUnitsToPlaceRows,
  resolvePlayerDeployPool,
  shouldRestoreStartingDeployPool,
  categorizeUnitsToPlace,
} = await import(pathToFileURL(join(root, 'src/state/placementPass.js')));
const {
  applyPlaceQueueDelta,
  applyPlaceQueueMax,
  canAddToPlaceQueue,
  canStagePlaceQueue,
  quantityAvailableForType,
  expandPlaceQueue,
  queuedCount,
  shouldResetDeployedThisRound,
  resolveDeployedThisRoundAfterLoad,
  deployedThisRoundDisplay,
  placementBudgetCopy,
  queueAfterDeployAttempt,
} = await import(pathToFileURL(join(root, 'src/state/placeQueue.js')));
const {
  shouldDeletePresenceDoc,
  presenceStateForVisibility,
  shouldHeartbeatNow,
  shouldEjectFromMatch,
  shouldSignOutOnBackground,
  shouldCallSetPersistenceOnInit,
  shouldTreatReloadAsSignOut,
  shouldAwaitAuthBeforeSignIn,
  shouldShowSignInForm,
  isBackgroundLifecycleEvent,
  resolveJoinByCode,
  shouldDeleteLobbyOnHostLeave,
  presenceStopReason,
  isSeatedInStartedGame,
  shouldAbortMyGamesOnTokenHiccup,
  mergeMyActiveGames,
  shouldListStarterGameOnMyGames,
  isMyGamesActiveStatus,
  resolvePresenceState,
  shouldOpenLeaveConfirm,
  shouldJoinGameFromRowClick,
  isLeaveControlTarget,
  resolveEventElement,
  closestLeaveControl,
  shouldReplaceSnapshotListener,
  shouldResumeSnapshots,
  shouldAccumulateHostOfflineMs,
  shouldStartHostFailover,
  shouldReconnectToGame,
  PRESENCE_GONE_MS,
} = await import(pathToFileURL(join(root, 'src/multiplayer/presencePolicy.js')));
const {
  rememberLastMatch,
  readLastMatch,
  forgetLastMatch,
  lastMatchForJoinCode,
  mergeLastMatchIntoMyGames,
  recoverMyGamesOnLoad,
  stubGameFromLastMatch,
  shouldWipeMyGamesOnError,
  shouldForgetLastMatchOnBackground,
  resolveJoinNotFoundError,
  resolveLobbyCodeFromGameDoc,
  resolveHostReconnectCopy,
  shouldShowHostReconnect,
  shouldLeaveGameView,
  resolveMenuCardAction,
  shouldOpenJoinByCode,
  shouldOpenMyGames,
  shouldPrefillJoinCodeFromLastMatch,
  shouldAutoResumeLastMatch,
  shouldHoldLoaderForLastMatchResume,
  resolveResumeFailureView,
  shouldLeaveLobbyView,
  shouldNavigateToHome,
  shouldHonorLobbyBack,
  resolveLobbyBackTarget,
  shouldForceLobbyRoomOnSnapshot,
  shouldRestoreLobbyAfterDisconnect,
  shouldClearLobbyOnSnapshotError,
  shouldKeepLastKnownLobby,
  resolveLobbyViewAfterLoss,
  joinFormFieldAttrs,
  joinFormFieldAttrString,
  shouldBlockCompetingEntryForms,
  shouldShowCompetingEntryForms,
  resolveRejoinRecoveryUi,
  shouldListGameInMyGames,
  shouldJoinListedGame,
  shouldForgetLastMatchAfterLookup,
  hasHydratePayload,
  shouldFetchGameDocBeforeStart,
  shouldShowReconnectAfterResumeAttempt,
  shouldForgetLastMatchOnDismissRejoin,
  shouldForgetLastMatchOnHydrateFailure,
  resolveReconnectCopy,
  resolveRejoinHydratePlan,
  shouldReuseInFlightMultiplayerStart,
} = await import(pathToFileURL(join(root, 'src/multiplayer/lastMatch.js')));
const { resolveHostLobbyPrimaryCta, resolveStartGameTarget, shouldCreateNewGameOnResume, shouldShowListInOpenGames } =
  await import(pathToFileURL(join(root, 'src/multiplayer/lobbyStart.js')));
const { shouldPeekPhoneTray } =
  await import(pathToFileURL(join(root, 'src/ui/mobileShell.js')));
const {
  capturePanelPointerLock,
  resolveLockedPanelClick,
  shouldBlockMapSelectAfterPanel,
  shouldIgnoreQueueRetarget,
  shouldApplyQueueGesture,
  shouldBeginNewQueueGesture,
  shouldCommitOverlayGesture,
  shouldAllowPlaceQueueTypeSwitch,
  resetPlaceQueueGestureState,
  resolveQueueUnitType,
  pickPanelHitFromStack,
  isPointInPanelRect,
  isPointInPeekTrayChrome,
  pointHitsPlayerPanel,
} = await import(pathToFileURL(join(root, 'src/ui/panelClickLock.js')));
const {
  shouldPassPlacementTurn,
  shouldApplyUndoAction,
} = await import(pathToFileURL(join(root, 'src/state/undoPolicy.js')));
const {
  computeIsLocalPlayerTurn,
  resolveTabTitle,
  resolveTurnChrome,
  emitYourTurnEvent,
  shouldAutoCommitPhoneCapital,
} = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const {
  resolveHudClarity,
  resolveHudPhaseLabel,
  formatHudClickLanded,
  resolveHostAwayBanner,
  shouldShowHudTicker,
  shouldShowHudLastAction,
  formatAiTurnLine,
  resolveHudWhoseTurn,
} = await import(pathToFileURL(join(root, 'src/ui/hudClarity.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const unitDefs = {
  infantry: { isLand: true },
  armour: { isLand: true },
  tacticalBomber: { isAir: true },
};

console.log('=== Version stamps ===');
check('GAME_VERSION is V2.81.57-dual-path.18', GAME_VERSION === 'V2.81.57-dual-path.18');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== Presence: background must not delete or go offline ===');
check('beforeunload / hide is not a delete',
  shouldDeletePresenceDoc({ reason: 'beforeunload' }) === false
  && shouldDeletePresenceDoc({ reason: 'pagehide' }) === false
  && shouldDeletePresenceDoc({ reason: 'visibility-hidden' }) === false);
check('only explicit leave deletes the presence doc',
  shouldDeletePresenceDoc({ reason: 'explicit-leave' }) === true);
check('hidden tab is idle, not gone',
  presenceStateForVisibility('hidden') === 'idle'
  && presenceStateForVisibility('visible') === 'online');
check('heartbeat on visible + pageshow + interval',
  shouldHeartbeatNow({ event: 'visibility-visible' })
  && shouldHeartbeatNow({ event: 'pageshow' })
  && shouldHeartbeatNow({ event: 'interval' })
  && shouldHeartbeatNow({ event: 'beforeunload' }) === false);
check('E1/B25 P0: heartbeat on visibilitychange + pageshow persisted',
  shouldHeartbeatNow({ event: 'visibilitychange' })
  && shouldHeartbeatNow({ event: 'visibility-hidden' })
  && shouldHeartbeatNow({ event: 'pageshow-persisted' })
  && shouldHeartbeatNow({ event: 'pageshow', persisted: true }));
check('E1/B25 P0: background never signs out',
  shouldSignOutOnBackground({ event: 'visibilitychange' }) === false
  && shouldSignOutOnBackground({ event: 'pagehide' }) === false
  && shouldSignOutOnBackground({ event: 'pageshow' }) === false
  && shouldSignOutOnBackground({ event: 'pageshow-persisted' }) === false
  && isBackgroundLifecycleEvent('visibilitychange')
  && isBackgroundLifecycleEvent('pageshow'));
check('E1/B25: reload / version refresh is not a sign-out',
  shouldTreatReloadAsSignOut() === false
  && shouldSignOutOnBackground({ event: 'reload' }) === false
  && isBackgroundLifecycleEvent('reload')
  && shouldCallSetPersistenceOnInit() === false
  && shouldAwaitAuthBeforeSignIn() === true);
check('E1/B25: Sign In form waits for auth restore',
  shouldShowSignInForm({ authReady: false, userPresent: false }) === false
  && shouldShowSignInForm({ authReady: true, userPresent: true }) === false
  && shouldShowSignInForm({ authReady: true, userPresent: false }) === true);
check('9.20.26.01: zombie Player after ready is Sign In not welcome',
  shouldShowSignInForm({
    authReady: true,
    userPresent: true,
    user: { id: 'uid', displayName: 'Player' },
  }) === true
  && shouldShowSignInForm({
    authReady: true,
    userPresent: true,
    user: { id: 'uid', email: 'rob@example.com', displayName: 'Player' },
  }) === false);
check('E1: resume on visible and pageshow (incl. bfcache)',
  shouldResumeSnapshots({ event: 'visibility-visible' })
  && shouldResumeSnapshots({ event: 'pageshow' })
  && shouldResumeSnapshots({ event: 'interval' }) === false);
check('E1: live snapshot is not replaced (no double-subscribe)',
  shouldReplaceSnapshotListener({ hasUnsubscribe: true, listenerErrored: false }) === false);
check('E1: dead / missing / bfcache snapshot is replaced',
  shouldReplaceSnapshotListener({ hasUnsubscribe: false }) === true
  && shouldReplaceSnapshotListener({ hasUnsubscribe: true, persistedPageShow: true }) === true
  && shouldReplaceSnapshotListener({ hasUnsubscribe: false, listenerErrored: true }) === true);
check('E1: idle/background host does not start 90s failover',
  shouldAccumulateHostOfflineMs({ hostPresence: 'idle' }) === false
  && shouldStartHostFailover({
    hostPresence: 'idle', offlineForMs: 3 * 60 * 1000, graceMs: 90000,
  }) === false);
check('E1: missing host still failovers after grace',
  shouldStartHostFailover({
    hostPresence: 'offline', offlineForMs: 90000, graceMs: 90000,
  }) === true
  && shouldStartHostFailover({
    hostPresence: 'offline', offlineForMs: 1000, graceMs: 90000,
  }) === false);
{
  const now = 1_000_000;
  check('missing doc is offline',
    resolvePresenceState({ hasDoc: false, now }) === 'offline');
  check('3 min backgrounded idle doc is still idle',
    resolvePresenceState({
      hasDoc: true, lastSeen: now - 3 * 60 * 1000, state: 'idle', now,
    }) === 'idle');
  check('15+ min silence is offline',
    resolvePresenceState({
      hasDoc: true, lastSeen: now - PRESENCE_GONE_MS - 1, state: 'idle', now,
    }) === 'offline');
}
check('auth hiccup with a live user does not eject',
  shouldEjectFromMatch({ authUserPresent: true, tokenValid: true }) === false
  && shouldEjectFromMatch({ authUserPresent: true, tokenValid: false }) === false);
check('E1/B25 P0: missing user + invalid token is not a self-eject',
  shouldEjectFromMatch({ authUserPresent: false, tokenValid: false }) === false);
check('E1/B25 P0: background lifecycle never ejects',
  shouldEjectFromMatch({
    authUserPresent: false, tokenValid: false, lifecycleEvent: 'visibilitychange',
  }) === false
  && shouldEjectFromMatch({
    confirmedSignOut: true, lifecycleEvent: 'pagehide',
  }) === false
  && shouldEjectFromMatch({
    authUserPresent: false, tokenValid: false, lifecycleEvent: 'pageshow',
  }) === false);
check('confirmed sign-out ejects',
  shouldEjectFromMatch({
    authUserPresent: false, tokenValid: false, confirmedSignOut: true,
  }) === true);

console.log('=== Join-by-code finds a started match ===');
{
  const started = { id: 'g1', playerUserIds: ['host', 'guest'], status: 'active' };
  const lobby = { id: 'l1', status: 'starting', code: 'ZUJMNP' };
  check('waiting lobby wins',
    resolveJoinByCode({ waitingLobby: { id: 'w' }, userId: 'guest' }).kind === 'lobby');
  check('started game is joinable by a seated player',
    resolveJoinByCode({ startedGame: started, userId: 'guest' }).kind === 'game');
  check('started lobby without a game doc is started-lobby',
    resolveJoinByCode({ anyLobby: lobby, userId: 'guest' }).kind === 'started-lobby');
  check('unknown code is not-found',
    resolveJoinByCode({ userId: 'guest' }).kind === 'not-found');
  check('started lobby is never deleted when the host backgrounds',
    shouldDeleteLobbyOnHostLeave({ lobbyStatus: 'starting', remainingHumans: 0 }) === false
    && shouldDeleteLobbyOnHostLeave({ lobbyStatus: 'waiting', remainingHumans: 0 }) === true);
}

console.log('=== B25: session-lost host can still find ZUJMNP ===');
{
  const emptyIds = { id: 'g-zuj', lobbyCode: 'ZUJMNP', status: 'active', playerUserIds: [], startedBy: 'host' };
  const missingIds = { id: 'g-zuj', lobbyCode: 'ZUJMNP', status: 'active', startedBy: 'host' };
  const lobbySeat = {
    id: 'l-zuj', status: 'starting', code: 'ZUJMNP', hostId: 'host',
    players: [{ oderId: 'host' }, { oderId: 'guest' }],
    gameId: 'g-zuj',
  };
  check('session-lost does not delete the presence doc',
    shouldDeletePresenceDoc({ reason: presenceStopReason({ explicitLeave: false }) }) === false
    && presenceStopReason({ explicitLeave: false }) === 'session-lost');
  check('Exit still deletes the presence doc',
    shouldDeletePresenceDoc({ reason: presenceStopReason({ explicitLeave: true }) }) === true);
  check('empty playerUserIds is still seated via startedBy',
    isSeatedInStartedGame({ game: emptyIds, userId: 'host' }) === true);
  check('empty playerUserIds is still seated via lobby players',
    isSeatedInStartedGame({ game: emptyIds, lobby: lobbySeat, userId: 'guest' }) === true);
  check('populated playerUserIds still excludes a stranger',
    isSeatedInStartedGame({
      game: { ...emptyIds, playerUserIds: ['host', 'guest'] },
      userId: 'stranger',
    }) === false);
  check('join-by-code finds started game with empty playerUserIds',
    resolveJoinByCode({ startedGame: emptyIds, anyLobby: lobbySeat, userId: 'host' }).kind === 'game'
    && resolveJoinByCode({ startedGame: missingIds, userId: 'host' }).kind === 'game');
  check('join-by-code does not say not-found when the game exists',
    resolveJoinByCode({ startedGame: emptyIds, userId: 'host' }).kind !== 'not-found');
  check('B25 confirmed: started ZUJMNP is never lobby-not-found',
    resolveJoinByCode({
      startedGame: { id: 'g-zuj', lobbyCode: 'ZUJMNP', status: 'active', playerUserIds: ['guest'] },
      userId: 'host',
    }).kind === 'game');
  check('E1/B25 P0: remembered gameId alone is still a join, never not-found',
    resolveJoinByCode({ userId: 'host', rememberedGameId: 'g-zuj' }).kind === 'game'
    && resolveJoinByCode({ userId: 'host', rememberedGameId: 'g-zuj' }).game.id === 'g-zuj');
  check('token hiccup with a signed-in user still loads My Games',
    shouldAbortMyGamesOnTokenHiccup({ authUserPresent: true, tokenValid: false }) === false
    && shouldAbortMyGamesOnTokenHiccup({ authUserPresent: false, tokenValid: false }) === true);
  check('E1/B25 P0: last match keeps My Games open on token hiccup',
    shouldAbortMyGamesOnTokenHiccup({
      authUserPresent: false, tokenValid: false, hasLastMatch: true,
    }) === false);
  check('My Games merges seat + startedBy and drops finished',
    mergeMyActiveGames({
      bySeat: [{ id: 'a', status: 'active' }, { id: 'done', status: 'finished' }],
      byStarter: [{ id: 'a', status: 'active' }, { id: 'b', status: 'starting' }],
    }).map((g) => g.id).sort().join(',') === 'a,b');
  check('Leave does not relist a startedBy game the user is no longer seated in',
    shouldListStarterGameOnMyGames({
      game: { id: 'left', status: 'active', playerUserIds: ['other'], startedBy: 'host' },
      userId: 'host',
    }) === false
    && mergeMyActiveGames({
      bySeat: [],
      byStarter: [{ id: 'left', status: 'active', playerUserIds: ['other'], startedBy: 'host' }],
      userId: 'host',
    }).length === 0);
  check('B25 empty playerUserIds still lists via startedBy',
    shouldListStarterGameOnMyGames({
      game: { id: 'g-zuj', status: 'active', playerUserIds: [], startedBy: 'host' },
      userId: 'host',
    }) === true);
  check('My Games status filter is client-side (no compound in)',
    isMyGamesActiveStatus('active') && isMyGamesActiveStatus('starting')
    && isMyGamesActiveStatus('finished') === false);
}

console.log('=== Deploy queue: + is exactly one row by 1 ===');
{
  let q = {};
  q = applyPlaceQueueDelta({
    queue: q, unitType: 'infantry', delta: 1, available: 10, slotsRemaining: 6,
  });
  check('one Infantry + is 1, not 4', q.infantry === 1 && queuedCount(q) === 1);
  q = applyPlaceQueueDelta({
    queue: q, unitType: 'infantry', delta: 1, available: 10, slotsRemaining: 6,
  });
  check('second + is 2', q.infantry === 2 && !q.armour);
  q = applyPlaceQueueDelta({
    queue: q, unitType: 'armour', delta: 1, available: 3, slotsRemaining: 6,
  });
  check('+ on Armour does not steal from Infantry',
    q.infantry === 2 && q.armour === 1 && queuedCount(q) === 3);
  const maxed = applyPlaceQueueMax({
    queue: q, unitType: 'infantry', available: 10, slotsRemaining: 6,
  });
  check('Max fills that row to remaining slots (not other types)',
    maxed.infantry === 5 && maxed.armour === 1 && queuedCount(maxed) === 6);
}

console.log('=== New turn is 0/N; guest applies remote on seat change ===');
check('seat change resets deployed this round',
  shouldResetDeployedThisRound({
    prevPlayerId: 'host', nextPlayerId: 'guest', remotePlacedThisRound: 6,
  }) === true);
check('B28: same seat + remote 0 does not wipe local 1/6',
  shouldResetDeployedThisRound({
    prevPlayerId: 'guest', nextPlayerId: 'guest', remotePlacedThisRound: 0,
  }) === false);
check('B28: same seat keeps max(local, remote)',
  resolveDeployedThisRoundAfterLoad({
    prevPlayerId: 'usa', nextPlayerId: 'usa',
    remotePlacedThisRound: 0, localPlacedThisRound: 1,
  }) === 1);
check('B28: missing remote field does not reset',
  resolveDeployedThisRoundAfterLoad({
    prevPlayerId: 'usa', nextPlayerId: 'usa',
    remotePlacedThisRound: undefined, localPlacedThisRound: 1,
  }) === 1);
check('new placement wave resets',
  shouldResetDeployedThisRound({
    prevPlayerId: 'usa', nextPlayerId: 'usa',
    prevPlacementRound: 0, nextPlacementRound: 1,
  }) === true);
check('guest must load when the seat changes at the same version',
  shouldApplyRemoteGameState({
    remoteVersion: 12,
    localVersion: 12,
    remoteCurrentPlayerId: 'james',
    localCurrentPlayerId: 'host',
  }) === true);
check('equal version + same seat does not reload',
  shouldApplyRemoteGameState({
    remoteVersion: 12,
    localVersion: 12,
    remoteCurrentPlayerId: 'host',
    localCurrentPlayerId: 'host',
  }) === false);
check('newer version always loads',
  shouldApplyRemoteGameState({ remoteVersion: 13, localVersion: 12 }) === true);

console.log('=== Setup persist: leftover purchase becomes setup ===');
{
  check('non-playing persists setup',
    resolvePersistedTurnPhase(GAME_PHASES.UNIT_PLACEMENT, 'purchase') === SETUP_TURN_PHASE);
  check('sync label is game phase, not leftover turnPhase',
    syncPushPhaseLabel(GAME_PHASES.UNIT_PLACEMENT, 'purchase') === GAME_PHASES.UNIT_PLACEMENT);
  const cloned = cloneUnitsToPlace({
    p1: [{ type: 'infantry', quantity: 19 }],
    p2: [{ type: 'infantry', quantity: 25 }],
  });
  cloned.p1[0].quantity = 0;
  check('toJSON clone is a point-in-time copy',
    remainingDeployByPlayer({
      p1: [{ type: 'infantry', quantity: 19 }],
      p2: [{ type: 'infantry', quantity: 25 }],
    }, ['p1', 'p2'], unitDefs).p1 === 19);
}

console.log('=== Host places N then Done: remaining is 25-N / next is 0 placed ===');
{
  const territories = [
    { name: 'HostLand', isWater: false, connections: [] },
    { name: 'GuestLand', isWater: false, connections: [] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'p1', name: 'Host', oderId: 'host', isAI: false },
    { id: 'p2', name: 'James', oderId: 'james', isAI: false },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.turnPhase = 'purchase';
  gs.unitsToPlace = {
    p1: [{ type: 'infantry', quantity: 25 }],
    p2: [{ type: 'infantry', quantity: 25 }],
  };
  gs.territoryState = {
    HostLand: { owner: 'p1' },
    GuestLand: { owner: 'p2' },
  };
  gs.units = { HostLand: [], GuestLand: [] };
  gs.unitsPlacedThisRound = 0;
  for (let i = 0; i < 6; i++) {
    const r = gs.placeInitialUnit('HostLand', 'infantry', unitDefs);
    check(`place ${i + 1} ok`, r.success === true);
  }
  const snap = gs.toJSON();
  check('persisted turnPhase is setup, not purchase', snap.turnPhase === SETUP_TURN_PHASE);
  const pass = gs.finishPlacementRound(unitDefs);
  check('Done hands the seat to James',
    pass.ok === true && gs.currentPlayer?.id === 'p2');
  check('next seat starts 0 placed', gs.unitsPlacedThisRound === 0);
  const remaining = remainingDeployByPlayer(gs.unitsToPlace, ['p1', 'p2'], unitDefs);
  check('host remaining is 25-6', remaining.p1 === 19);
  check('guest remaining is still 25', remaining.p2 === 25);
  const guest = new GameState({ risk: { factions: [] } }, territories, []);
  guest.loadFromJSON(gs.toJSON());
  check('guest load sees James current and 0/N',
    guest.currentPlayer?.id === 'p2' && guest.unitsPlacedThisRound === 0);
  check('guest load sees host remaining 19',
    remainingDeployByPlayer(guest.unitsToPlace, ['p1'], unitDefs).p1 === 19);
  check('guest load turnPhase is setup', guest.turnPhase === SETUP_TURN_PHASE);
}

console.log('=== Title and banner agree; your-turn event ===');
{
  const waiting = !computeIsLocalPlayerTurn({
    isMultiplayer: true,
    isWaitingForSync: true,
    localUserId: 'james',
    currentPlayerOderId: 'host',
  });
  const title = resolveTabTitle({
    isLocalPlayerTurn: computeIsLocalPlayerTurn({
      isMultiplayer: true,
      isWaitingForSync: true,
      localUserId: 'james',
      currentPlayerOderId: 'host',
    }),
  });
  check('WAITING guest is not ● Your turn',
    waiting === true && !title.includes('Your turn'));
  const yourTurn = computeIsLocalPlayerTurn({
    isMultiplayer: true,
    isWaitingForSync: false,
    localUserId: 'james',
    currentPlayerOderId: 'james',
  });
  check('active seat is ● Your turn',
    yourTurn === true
    && resolveTabTitle({ isLocalPlayerTurn: yourTurn }) === '● Your turn — Tactical Risk');
  const ev = emitYourTurnEvent({ yourTurn: true, playerName: 'James', gameId: 'ZUJMNP' });
  check('your-turn event payload is pingable',
    ev.yourTurn === true && ev.playerName === 'James' && ev.gameId === 'ZUJMNP');
}

console.log('=== James lock: if it can look broken, it is broken ===');
{
  const other = resolveTurnChrome({
    isMultiplayer: true,
    localUserId: 'james',
    currentPlayerOderId: 'host',
    currentPlayerName: 'Bastion',
  });
  check('other seat: tab title is Waiting, never Your turn',
    other.tabTitle === 'Waiting: Bastion — Tactical Risk'
    && other.badge === 'WAITING'
    && other.ownSeat === false
    && !other.tabTitle.includes('Your turn'));
  check('waiting lock cannot force Your turn on the other seat',
    resolveTabTitle({
      isMultiplayer: true,
      isLocalPlayerTurn: true,
      localUserId: 'james',
      currentPlayerOderId: 'host',
      currentPlayerName: 'Bastion',
    }) === 'Waiting: Bastion — Tactical Risk');
  const mine = resolveTurnChrome({
    isMultiplayer: true,
    localUserId: 'james',
    currentPlayerOderId: 'james',
    currentPlayerName: 'James',
  });
  check('own seat: title and badge are both YOUR TURN',
    mine.tabTitle === '● Your turn — Tactical Risk' && mine.badge === 'YOUR TURN');
  const cap = placementBudgetCopy({
    deployedThisRound: 6, limit: 6, poolRemaining: 1,
  });
  check('6/6 + 1 in pool is next-round copy, not Remaining to deploy: 1',
    cap.deployedText === '6/6'
    && cap.remainingLabel === 'Still in your pool'
    && cap.remainingText === '1 next round'
    && cap.leftoverAfterCap === true
    && !`${cap.remainingLabel} ${cap.remainingText}`.includes('Remaining to deploy'));
  check('open pool still says remaining in your pool',
    placementBudgetCopy({ deployedThisRound: 2, limit: 6, poolRemaining: 19 })
      .remainingLabel === 'Remaining in your pool');
  const titleEl = { closest: (sel) => sel === '[data-role="join-game"]' ? titleEl : null };
  const leaveEl = { closest: (sel) => String(sel).includes('[data-leave-game]') ? leaveEl : null };
  check('row title resumes; it does not open surrender',
    shouldJoinGameFromRowClick({ eventTarget: titleEl }) === true
    && shouldOpenLeaveConfirm({ clickOnLeaveControl: true, eventTarget: titleEl }) === false);
  check('only Leave opens surrender',
    shouldJoinGameFromRowClick({ eventTarget: leaveEl }) === false
    && shouldOpenLeaveConfirm({ clickOnLeaveControl: true, eventTarget: leaveEl }) === true);
}

console.log('=== B25 confirmed: last match + host reconnect copy ===');
{
  const mem = {
    data: {},
    getItem(k) { return this.data[k] ?? null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; },
  };
  check('game doc lobbyCode is the 6-char join code, not gameId',
    resolveLobbyCodeFromGameDoc({ lobbyCode: 'ZUJMNP', id: 'game_123' }) === 'ZUJMNP'
    && resolveLobbyCodeFromGameDoc({ code: 'game_123' }) === null);
  const saved = rememberLastMatch({
    gameId: 'game_zuj', lobbyCode: 'ZUJMNP', hostName: 'Bastion',
  }, mem);
  check('remember last match writes gameId + code',
    saved.gameId === 'game_zuj' && readLastMatch(mem).lobbyCode === 'ZUJMNP');
  check('join ZUJMNP uses the remembered gameId',
    lastMatchForJoinCode({ lastMatch: readLastMatch(mem), code: 'zujmnp' })?.gameId === 'game_zuj');
  check('My Games lists the remembered live game even if seat query missed it',
    mergeLastMatchIntoMyGames({
      games: [],
      lastMatchGame: { id: 'game_zuj', status: 'active', lobbyCode: 'ZUJMNP' },
    }).map((g) => g.id).join(',') === 'game_zuj');
  check('E1/B25 P0: query failure still lists last match stub',
    recoverMyGamesOnLoad({
      games: [],
      lastMatch: { gameId: 'game_zuj', lobbyCode: 'ZUJMNP' },
    }).map((g) => g.id).join(',') === 'game_zuj'
    && stubGameFromLastMatch({ gameId: 'game_zuj', lobbyCode: 'ZUJMNP' }).id === 'game_zuj');
  check('E1/B25 P0: last match is never wiped on query error',
    shouldWipeMyGamesOnError({ lastMatch: { gameId: 'game_zuj' } }) === false
    && shouldWipeMyGamesOnError({ lastMatch: null }) === true
    && shouldForgetLastMatchOnBackground() === false);
  check('E1/B25 P0: join copy is never Lobby not found when last match exists',
    !/Lobby not found/i.test(resolveJoinNotFoundError({
      lastMatch: { gameId: 'game_zuj', lobbyCode: 'ZUJMNP' },
      code: 'ZUJMNP',
    }))
    && /Still in ZUJMNP/.test(resolveJoinNotFoundError({
      lastMatch: { gameId: 'game_zuj', lobbyCode: 'ZUJMNP' },
      code: 'ZUJMNP',
    }))
    && !/Lobby not found/i.test(resolveJoinNotFoundError({ code: 'ABCDEF' })));
  forgetLastMatch(mem);
  check('explicit leave forgets the last match', readLastMatch(mem) === null);
  check('idle host is away, not game-over',
    /away|rejoin|still here/i.test(resolveHostReconnectCopy({
      hostPresence: 'idle', hostName: 'Bastion', gameCode: 'ZUJMNP',
    }))
    && shouldShowHostReconnect({ hostPresence: 'idle' }) === true);
  check('missing host is reconnecting — guest must stay',
    /reconnect/i.test(resolveHostReconnectCopy({
      hostPresence: 'offline', hostName: 'Bastion', gameCode: 'ZUJMNP',
    }))
    && /Do not leave/i.test(resolveHostReconnectCopy({
      hostPresence: 'offline', hostName: 'Bastion', gameCode: 'ZUJMNP',
    })));
  check('online host has no reconnect banner',
    resolveHostReconnectCopy({ hostPresence: 'online' }) === null);
}

console.log('=== James lock HUD: whose turn / last action / click landed ===');
{
  const waiting = resolveHudClarity({
    isMultiplayer: true,
    localUserId: 'james',
    currentPlayerOderId: 'host',
    currentPlayerName: 'Bastion',
    phase: GAME_PHASES.UNIT_PLACEMENT,
    turnPhase: 'purchase',
    lastActionEntry: { type: 'placement', data: { message: 'Bastion placed infantry in Ukraine' } },
    lastClick: { landed: true, label: 'East Canada' },
    deployedThisRound: 6,
    limit: 6,
    poolRemaining: 1,
    gameCode: 'ZUJMNP',
    hostPresence: 'offline',
    hostName: 'Bastion',
    isHost: false,
  });
  check('HUD never says Your turn while WAITING',
    waiting.whoseTurn === 'WAITING · Bastion'
    && !waiting.whoseTurn.includes('YOUR TURN'));
  check('leftover purchase still reads Initial Deployment',
    waiting.phase === 'Initial Deployment'
    && resolveHudPhaseLabel({ phase: GAME_PHASES.UNIT_PLACEMENT, turnPhase: 'purchase' }) === 'Initial Deployment');
  check('6/6 + 1 leftover is next-round copy on the HUD',
    /Deployed this round 6\/6/.test(waiting.budget)
    && /Still in your pool 1 next round/.test(waiting.budget)
    && !/Remaining to deploy/.test(waiting.budget));
  check('last action is the log line',
    waiting.lastAction === 'Last action: Bastion placed infantry in Ukraine');
  check('click landed names the territory',
    waiting.click === 'Click landed: East Canada'
    && formatHudClickLanded({ landed: false, label: 'map' }).includes('missed'));
  check('guest HUD says host is reconnecting, still in ZUJMNP',
    /reconnect/i.test(waiting.match) && /ZUJMNP/.test(waiting.match));
  const resumed = resolveHudClarity({
    isMultiplayer: true,
    localUserId: 'host',
    currentPlayerOderId: 'host',
    currentPlayerName: 'Bastion',
    phase: GAME_PHASES.UNIT_PLACEMENT,
    gameCode: 'ZUJMNP',
    justResumed: true,
    isHost: true,
  });
  check('host resume is still in ZUJMNP, not an empty lobby',
    resumed.whoseTurn === 'YOUR TURN · Bastion'
    && resumed.match === 'Still in ZUJMNP — you were away.');
  check('away banner tells the host to rejoin, not that the game died',
    resolveHostAwayBanner({ lobbyCode: 'ZUJMNP' }) === 'You were away — still in ZUJMNP. The other player is still there. Rejoin.');
  check('phone HUD ticker is collapsed to the phase chip',
    shouldShowHudTicker({ mobile: true }) === false
    && shouldShowHudTicker({ mobile: false }) === true);
  check('stale Germans turn-begins is not Last action during Russians Place Capital',
    shouldShowHudLastAction({
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
      lastActionEntry: { type: 'turn', data: { message: "Round 1 - Germans' turn begins" } },
    }) === false);
  const phoneClick = resolveHudClarity({
    phase: GAME_PHASES.CAPITAL_PLACEMENT,
    currentPlayerName: 'Russians',
    lastActionEntry: { type: 'turn', data: { message: "Round 1 - Germans' turn begins" } },
    mobile: true,
  });
  check('phone copy is Tap, never Click / Click landed',
    !/Click/.test(phoneClick.click)
    && /Tap/.test(phoneClick.click)
    && phoneClick.lastAction === ''
    && !/Click/.test(formatHudClickLanded(null, { mobile: true }))
    && formatHudClickLanded({ landed: true, label: 'Ukraine' }, { mobile: true }) === 'Tap landed: Ukraine');
  check('desktop ticker still says Click landed',
    formatHudClickLanded({ landed: true, label: 'East Canada' }) === 'Click landed: East Canada');
  check('AI capital beat is not YOUR TURN',
    formatAiTurnLine({ name: 'Germans', phase: GAME_PHASES.CAPITAL_PLACEMENT })
      === 'Germans placing capital…'
    && resolveHudWhoseTurn({
      currentPlayerName: 'Germans',
      currentPlayerIsAI: true,
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
    }).line === 'Germans placing capital…'
    && resolveHudClarity({
      currentPlayerName: 'Germans',
      currentPlayerIsAI: true,
      phase: GAME_PHASES.CAPITAL_PLACEMENT,
    }).whoseTurn === 'Germans placing capital…');
}

console.log('=== Undo / capital / leave row ===');
check('phone capital tap never auto-commits',
  shouldAutoCommitPhoneCapital({
    mobile: true, phase: GAME_PHASES.CAPITAL_PLACEMENT, tappedIsOwnedLand: true,
  }) === false);
check('game-row click is not Leave',
  shouldOpenLeaveConfirm({ clickOnLeaveControl: false }) === false);
check('Leave control still opens confirm',
  shouldOpenLeaveConfirm({ clickOnLeaveControl: true }) === true);
{
  const title = { closest: (sel) => sel === '.mp-game-name' ? title : null };
  const leaveBtn = { closest: (sel) => String(sel).includes('[data-leave-game]') ? leaveBtn : null };
  check('B23: row title is not a leave control',
    isLeaveControlTarget(title) === false
    && shouldOpenLeaveConfirm({ clickOnLeaveControl: true, eventTarget: title }) === false);
  check('B23: only the Leave button opens surrender',
    isLeaveControlTarget(leaveBtn) === true
    && shouldOpenLeaveConfirm({ clickOnLeaveControl: true, eventTarget: leaveBtn }) === true);
  const leaveText = { parentElement: leaveBtn };
  check('Leave text-node tap still opens confirm (not a silent no-op)',
    resolveEventElement(leaveText) === leaveBtn
    && closestLeaveControl(leaveText) === leaveBtn
    && isLeaveControlTarget(leaveText) === true
    && shouldOpenLeaveConfirm({ clickOnLeaveControl: true, eventTarget: leaveText }) === true);
  const roleLeave = { closest: (sel) => String(sel).includes('data-role="leave-game"') ? roleLeave : null };
  check('data-role=leave-game is a Leave control on My Games',
    isLeaveControlTarget(roleLeave) === true
    && shouldOpenLeaveConfirm({ clickOnLeaveControl: true, eventTarget: roleLeave }) === true);
}

console.log('=== B13–B17 deploy batch / cap / undo / paint ===');
{
  const q = { infantry: 4, armour: 2 };
  const atCap = applyPlaceQueueDelta({
    queue: q, unitType: 'fighter', delta: 1, available: 3, slotsRemaining: 6,
  });
  check('B14: + at cap does not steal from staged types',
    atCap.infantry === 4 && atCap.armour === 2 && (atCap.fighter || 0) === 0);
  check('B14: + at cap is rejected',
    canAddToPlaceQueue({
      queue: q, unitType: 'fighter', available: 3, slotsRemaining: 6,
    }) === false);
  const plusInf = applyPlaceQueueDelta({
    queue: q, unitType: 'infantry', delta: 1, available: 10, slotsRemaining: 6,
  });
  check('B14: + on a full row is a no-op, other row untouched',
    plusInf.infantry === 4 && plusInf.armour === 2);

  const territories = [
    { name: 'East United States', isWater: false, connections: ['Eastern Canada'] },
    { name: 'Eastern Canada', isWater: false, connections: ['East United States'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'p1', name: 'James', oderId: 'james', isAI: false }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.unitsToPlace = { p1: [
    { type: 'infantry', quantity: 20 },
    { type: 'fighter', quantity: 2 },
  ] };
  gs.territoryState = {
    'East United States': { owner: 'p1' },
    'Eastern Canada': { owner: 'p1' },
  };
  gs.units = { 'East United States': [], 'Eastern Canada': [] };
  gs.unitsPlacedThisRound = 0;
  let notifies = 0;
  gs.subscribe(() => { notifies++; });

  const types = expandPlaceQueue({ infantry: 5, fighter: 1 });
  check('queue of 6 expands to 6 commits', types.length === 6);
  const batch = gs.placeInitialUnitsBatch('East United States', types, {
    infantry: { isLand: true },
    fighter: { isAir: true },
  });
  check('B13: Deploy 6 places 6, not 5',
    batch.placed === 6 && batch.requested === 6 && batch.failed.length === 0);
  check('B13: remaining drops by 6, not 5',
    remainingDeployByPlayer(gs.unitsToPlace, ['p1'], {
      infantry: { isLand: true }, fighter: { isAir: true },
    }).p1 === 16);
  check('B13: all 6 landed on the selected territory',
    (gs.units['East United States'] || []).reduce((s, u) => s + (u.quantity || 0), 0) === 6
    && (gs.units['Eastern Canada'] || []).length === 0);
  check('B13: batch notifies once (no mid-loop Undo retarget / 0-flash)',
    notifies === 1);
  check('DEPLOYED is 6 after commit', gs.unitsPlacedThisRound === 6);

  const beforePool = gs.unitsToPlace.p1.find(u => u.type === 'fighter').quantity;
  check('B15: undo last (fighter) restores pool and drops DEPLOYED',
    gs.undoPlacement() === true
    && gs.unitsPlacedThisRound === 5
    && gs.unitsToPlace.p1.find(u => u.type === 'fighter').quantity === beforePool + 1);

  const src = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('B16/B17: _scheduleRender paints via _render, not itself',
    src.includes('this._renderRaf = 0;\n      this._render();')
    && !src.includes('this._renderRaf = 0;\n      this._scheduleRender();'));
  check('B17: + is place-queue, never place-unit',
    /action === 'place-queue'/.test(src)
    && /place-units-batch/.test(src));
}

console.log('=== B20–B24 pointer lock / Max / failed Deploy / Leave ===');
{
  const plusLock = capturePanelPointerLock({
    action: 'place-queue',
    dataset: { action: 'place-queue', unit: 'artillery', delta: '1' },
  });
  const plusThenDone = resolveLockedPanelClick({
    lock: plusLock,
    clickAction: 'finish-placement',
    now: 100,
    lastQueueGestureAt: 0,
  });
  check('B21: + lock does not become Done / end the turn',
    plusThenDone?.action === 'place-queue');
  const plusThenLog = resolveLockedPanelClick({
    lock: plusLock,
    clickTabId: 'log',
    clickAction: 'phone-detent-tab',
    now: 100,
    lastQueueGestureAt: 0,
  });
  check('B22: + lock does not switch to Log',
    plusThenLog?.kind === 'action' && plusThenLog.action === 'place-queue');
  const deployLock = capturePanelPointerLock({
    action: 'confirm-placement',
    dataset: { action: 'confirm-placement' },
  });
  const deployThenPlus = resolveLockedPanelClick({
    lock: deployLock,
    clickAction: 'place-queue',
    clickDataset: { unit: 'armour', delta: '1' },
    now: 100,
  });
  check('B20: Deploy lock does not retarget onto another +',
    deployThenPlus?.action === 'confirm-placement');
  const ghostDone = resolveLockedPanelClick({
    lock: null,
    clickAction: 'finish-placement',
    now: 250,
    lastQueueGestureAt: 100,
  });
  check('B21: ghost Done after + is ignored', ghostDone === null);
  check('B22: panel gesture blocks the map select under the finger',
    shouldBlockMapSelectAfterPanel({ panelPointerAt: 100, now: 200 }) === true
    && shouldBlockMapSelectAfterPanel({ panelPointerAt: 100, now: 700 }) === false);

  const q = { armour: 1 };
  const maxed = applyPlaceQueueMax({
    queue: q, unitType: 'armour', available: 3, slotsRemaining: 5,
  });
  check('B24: Max fills the queue only',
    maxed.armour === 3 && queuedCount(maxed) === 3);
  check('B24: Max does not bump DEPLOYED',
    deployedThisRoundDisplay(1) === 1
    && deployedThisRoundDisplay(1) !== queuedCount(maxed));
  check('B24: Deploy 0 restores the staged queue',
    queueAfterDeployAttempt({ queueBefore: { bomber: 1 }, placed: 0 }).bomber === 1);
  check('B24: Deploy 1 clears the queue',
    Object.keys(queueAfterDeployAttempt({ queueBefore: { bomber: 1 }, placed: 1 })).length === 0);

  const src = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('B19-James: inline placement actions include Done',
    /pp-placement-actions[\s\S]*finish-placement/.test(src));
  check('B20–B22: panel uses pointerdown lock',
    src.includes('_onPanelPointerDown') && src.includes('resolveLockedPanelClick'));
}

{
  const syncSrc = readFileSync(join(root, 'src/multiplayer/syncManager.js'), 'utf8');
  const presenceSrc = readFileSync(join(root, 'src/multiplayer/presenceManager.js'), 'utf8');
  check('E1: sync re-attaches via ensure, not a second startSync',
    syncSrc.includes('_ensureGameSnapshot')
    && (syncSrc.match(/onSnapshot\(/g) || []).length === 1);
  check('E1: presence re-attaches via ensure, one collection listener',
    presenceSrc.includes('_ensurePresenceSnapshot')
    && (presenceSrc.match(/onSnapshot\(/g) || []).length === 1);
  check('E1: no RTDB onDisconnect',
    !syncSrc.includes('onDisconnect') && !presenceSrc.includes('onDisconnect'));
  check('E1/B25 P0: presence heartbeats on visibilitychange and pageshow persisted',
    presenceSrc.includes("event: persisted ? 'pageshow-persisted' : 'pageshow'")
    && presenceSrc.includes("event = visible ? 'visibility-visible' : 'visibility-hidden'")
    && presenceSrc.includes('shouldHeartbeatNow'));
}

console.log('=== B26–B30 James client: join bind, stay in view, deploy, Max, + steal ===');
{
  check('B26: join-by-code is not my-games',
    shouldOpenJoinByCode('join-by-code') === true
    && shouldOpenMyGames('join-by-code') === false
    && resolveMenuCardAction('join-by-code') === 'join-by-code');
  check('B26: my-games is not join-by-code',
    shouldOpenMyGames('my-games') === true
    && shouldOpenJoinByCode('my-games') === false);
  const lobbySrc = readFileSync(join(root, 'src/ui/multiplayerLobby.js'), 'utf8');
  check('B26: Join card is join-by-code, My Games is my-games',
    /data-action="join-by-code"/.test(lobbySrc)
    && /data-action="my-games"/.test(lobbySrc)
    && !/data-action="join"[\s>]/.test(lobbySrc)
    && !/data-action="rejoin"[\s>]/.test(lobbySrc));
  check('B26: join-by-code never calls onBack rejoin',
    /_openJoinByCode\(\) \{[^}]*this\.mode = 'join'/.test(lobbySrc)
    && !/_openJoinByCode\(\) \{[^}]*onBack\('rejoin'\)/.test(lobbySrc));
  check('B37: join code and lobby password do not autocomplete',
    shouldPrefillJoinCodeFromLastMatch() === false
    && joinFormFieldAttrs('code').autocomplete === 'off'
    && joinFormFieldAttrs('code').name === 'tr-join-lobby-code'
    && joinFormFieldAttrs('password').autocomplete === 'off'
    && joinFormFieldAttrs('password').name === 'tr-join-lobby-secret'
    && joinFormFieldAttrs('password').name !== 'password');
  check('B37: join form markup has autocomplete off and unique names',
    lobbySrc.includes('data-form="join" autocomplete="off"')
    && lobbySrc.includes('joinFormFieldAttrString(\'code\')')
    && lobbySrc.includes('joinFormFieldAttrString(\'password\')')
    && !/#join-code[^>]*value="\$\{readLastMatch/.test(lobbySrc)
    && !/console\.(log|warn|error|debug).*password/.test(lobbySrc));
  check('B37: attr string is off + unique name, no leftover value',
    /autocomplete="off"/.test(joinFormFieldAttrString('code'))
    && /name="tr-join-lobby-code"/.test(joinFormFieldAttrString('code'))
    && /name="tr-join-lobby-secret"/.test(joinFormFieldAttrString('password')));

  check('B27: session-lost does not leave the game view',
    shouldLeaveGameView({ sessionLost: true }) === false);
  check('B27: Exit / Leave still leave',
    shouldLeaveGameView({ explicitExit: true }) === true
    && shouldLeaveGameView({ confirmedLeave: true }) === true);
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  const authBlock = mainSrc.slice(
    mainSrc.indexOf("event === 'auth_error'"),
    mainSrc.indexOf('// Set up gameState observer'),
  );
  check('B27: auth_error does not dump to handlePlayOnline / home',
    authBlock.includes('shouldLeaveGameView')
    && authBlock.includes('showReconnectOnly')
    && !authBlock.includes('handlePlayOnline()')
    && !authBlock.includes('lobby.show()'));
  check('E1/B25 P0: auth_error does not treat null user as confirmed sign-out',
    !authBlock.includes('confirmedSignOut: !authManager.getUser()')
    && authBlock.includes('confirmedSignOut: false'));
  check('E1/B25: Play Online waits for auth restore before Sign In',
    mainSrc.includes('isAuthReady')
    && mainSrc.includes('shouldShowSignInForm'));
  const firebaseSrc = readFileSync(join(root, 'src/multiplayer/firebase.js'), 'utf8');
  const authSrc = readFileSync(join(root, 'src/multiplayer/auth.js'), 'utf8');
  check('E1/B25: init does not call setPersistence (IndexedDB race)',
    !/setPersistence\s*\(/.test(firebaseSrc)
    && !firebaseSrc.includes('browserLocalPersistence'));
  {
    const listenerStart = authSrc.indexOf('onAuthStateChanged(this.auth, (user) => {');
    const listenerEnd = authSrc.indexOf('  _applyFirebaseUser(user) {', listenerStart);
    const listenerChunk = authSrc.slice(listenerStart, listenerEnd === -1 ? listenerStart + 400 : listenerEnd);
    check('E1/B25: restored Firebase user is applied before Firestore lastLogin',
      authSrc.includes('_applyFirebaseUser')
      && authSrc.includes('authStateReady')
      && listenerChunk.includes('_applyFirebaseUser(user)')
      && listenerChunk.includes('_hydrateIdentity(user).catch')
      && !listenerChunk.includes('await this._hydrateIdentity')
      && !listenerChunk.includes('await this._updateUserDocument'));
  }
  const authUiSrc = readFileSync(join(root, 'src/ui/authScreen.js'), 'utf8');
  check('E1/B25: AuthScreen restores session before the password form',
    authUiSrc.includes("mode === 'restoring'")
    && authUiSrc.includes('whenReady')
    && authUiSrc.includes('shouldShowSignInForm'));
  check('B27: reconnect-only exists and is not Create Game',
    lobbySrc.includes('showReconnectOnly')
    && lobbySrc.includes('_renderReconnect')
    && !/_renderReconnect\(user\) \{[\s\S]*?data-action="create"/.test(lobbySrc));
  check('V2.81.44: rejoin recovery blocks competing Join / Create / Browse',
    shouldBlockCompetingEntryForms({ rejoinRequired: true }) === true
    && shouldBlockCompetingEntryForms({ rejoinRequired: true, dismissed: true }) === false
    && shouldBlockCompetingEntryForms({ rejoinRequired: false }) === false
    && shouldShowCompetingEntryForms({ rejoinRequired: true }) === false
    && shouldShowCompetingEntryForms({ rejoinRequired: false }) === true);
  check('V2.81.44: recovery UI is Rejoin-only for any live code',
    resolveRejoinRecoveryUi({ rejoinRequired: true }).showJoinForm === false
    && resolveRejoinRecoveryUi({ rejoinRequired: true }).showCreateForm === false
    && resolveRejoinRecoveryUi({ rejoinRequired: true }).showBrowse === false
    && resolveRejoinRecoveryUi({ rejoinRequired: true }).showRejoinCta === true
    && resolveRejoinRecoveryUi({ rejoinRequired: true }).showDismissEscape === true
    && resolveRejoinRecoveryUi({ rejoinRequired: true, dismissed: true }).showJoinForm === true
    && resolveRejoinRecoveryUi({ rejoinRequired: false }).showJoinForm === true);
  check('V2.81.44: reconnect markup gates Join / Create / Browse through recovery UI',
    /_renderReconnect\(user\) \{[\s\S]*?resolveRejoinRecoveryUi/.test(lobbySrc)
    && /showJoinForm \? this\._renderJoin/.test(lobbySrc)
    && /showCreateForm \? this\._renderCreate/.test(lobbySrc)
    && /showBrowse \? this\._renderBrowse/.test(lobbySrc)
    && /data-action="dismiss-rejoin"/.test(lobbySrc)
    && /data-action="rejoin-last"/.test(lobbySrc)
    && lobbySrc.includes('_blocksCompetingEntry'));

  const territories = [
    { name: 'East US', isWater: false, connections: [] },
    { name: 'West US', isWater: false, connections: [] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'usa', name: 'James', oderId: 'james', isAI: false },
    { id: 'ussr', name: 'Bastion', oderId: 'host', isAI: false },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.turnPhase = SETUP_TURN_PHASE;
  gs.unitsToPlace = { usa: [{ type: 'tacticalBomber', quantity: 1 }, { type: 'destroyer', quantity: 2 }, { type: 'transport', quantity: 6 }] };
  gs.territoryState = { 'East US': { owner: 'usa' }, 'West US': { owner: 'usa' } };
  gs.units = { 'East US': [], 'West US': [] };
  gs.unitsPlacedThisRound = 1;
  const stale = gs.toJSON();
  stale.unitsPlacedThisRound = 0;
  gs.loadFromJSON(stale);
  check('B28: loadFromJSON same seat keeps 1/6 against stale 0',
    gs.unitsPlacedThisRound === 1);
  const missing = gs.toJSON();
  delete missing.unitsPlacedThisRound;
  gs.unitsPlacedThisRound = 1;
  gs.loadFromJSON(missing);
  check('B28: missing unitsPlacedThisRound does not reset',
    gs.unitsPlacedThisRound === 1);
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('B28: select keeps unitsPlacedThisRound',
    panelSrc.includes('keepPlaced')
    && panelSrc.includes('this.gameState.unitsPlacedThisRound = keepPlaced'));

  check('B29: TacticalBomber pool lookup is case-robust',
    quantityAvailableForType(
      [{ type: 'tacticalBomber', quantity: 1 }],
      'TacticalBomber',
    ) === 1);
  check('B29: Max stages bomber without a tile',
    canStagePlaceQueue({
      queue: {},
      unitType: 'tacticalBomber',
      available: 1,
      slotsRemaining: 6,
    }) === true
    && applyPlaceQueueMax({
      queue: {},
      unitType: 'tacticalBomber',
      available: 1,
      slotsRemaining: 6,
    }).tacticalBomber === 1);
  check('B29: + / Max do not require isValidPlacement',
    panelSrc.includes('canStagePlaceQueue')
    && /Stage units, then click a territory/.test(panelSrc));

  check('B30: lock prefers Destroyer over Transport steal',
    resolveQueueUnitType({
      lockedType: 'destroyer',
      incomingType: 'transport',
    }) === 'destroyer');
  check('B30: retarget onto Transport within 400ms is ignored',
    shouldIgnoreQueueRetarget({
      lockedType: 'destroyer',
      incomingType: 'transport',
      elapsedMs: 50,
    }) === true);
  check('B30: same-row + is not ignored',
    shouldIgnoreQueueRetarget({
      lockedType: 'destroyer',
      incomingType: 'destroyer',
      elapsedMs: 50,
    }) === false);
  let q = { transport: 4 };
  q = applyPlaceQueueDelta({
    queue: q, unitType: 'destroyer', delta: 1, available: 2, slotsRemaining: 6,
  });
  check('B30: Destroyer + does not increment Transport',
    q.destroyer === 1 && q.transport === 4);

  // Robert/Sean 16 Sep: leftover last-row lock after Confirm looked like
  // a B30 retarget (elapsed refreshed to 0) and blocked every other type
  // until refresh. Empty-place is the same lock once type A is exhausted.
  check('V2.81.49: leftover last-row lock after Confirm is the live bug',
    shouldIgnoreQueueRetarget({
      lockedType: 'infantry',
      incomingType: 'tanks',
      elapsedMs: 0,
    }) === true);
  check('V2.81.49: after Confirm (queue empty) type B is not a retarget',
    shouldIgnoreQueueRetarget({
      lockedType: 'infantry',
      incomingType: 'tanks',
      elapsedMs: 0,
      committed: true,
    }) === false
    && shouldIgnoreQueueRetarget({
      lockedType: 'infantry',
      incomingType: 'tanks',
      elapsedMs: 50,
      newGesture: true,
    }) === false);
  check('V2.81.49: type switch after Confirm is allowed (same land or type B)',
    shouldAllowPlaceQueueTypeSwitch({
      incomingType: 'tanks',
      lastQueueUnitType: 'infantry',
      queueEmpty: true,
      committed: true,
      currentGestureLockType: null,
    }) === true);
  check('V2.81.49: mixed stack before Confirm is still allowed on a new +',
    shouldAllowPlaceQueueTypeSwitch({
      incomingType: 'tanks',
      lastQueueUnitType: 'infantry',
      queueEmpty: false,
      currentGestureLockType: 'tanks',
    }) === true);
  check('V2.81.49: B30 mid-gesture retarget still blocked',
    shouldAllowPlaceQueueTypeSwitch({
      incomingType: 'transport',
      lastQueueUnitType: 'destroyer',
      queueEmpty: false,
      currentGestureLockType: 'destroyer',
    }) === false);
  const cleared = resetPlaceQueueGestureState();
  check('V2.81.49: Confirm resets leftover type lock',
    cleared.lastQueueUnitType === null
    && cleared.queueLockType === null
    && cleared.queueGestureApplied === false
    && cleared.lastQueueGestureAt === 0);
  check('V2.81.49: caller uses this-pointer lock, not last-row type',
    panelSrc.includes('shouldAllowPlaceQueueTypeSwitch')
    && panelSrc.includes('_resetPlaceQueueGestureAfterConfirm')
    && /shouldIgnoreQueueRetarget\(\{\s*lockedType: this\._queueLockType/.test(panelSrc));
}

console.log('=== B31 Max/panel hit-test: not the map, not LOG ===');
{
  const maxBtn = {
    dataset: { action: 'place-queue-max', unit: 'tacticalBomber' },
    disabled: false,
    closest(sel) { return sel === '[data-action]' ? maxBtn : null; },
  };
  const logTab = {
    dataset: { tab: 'log' },
    className: 'pp-tab',
    closest(sel) { return sel === '.pp-tab' ? logTab : null; },
  };
  const panelEl = { contains: (el) => el === maxBtn || el === logTab };
  const hit = pickPanelHitFromStack([logTab, maxBtn], { panelEl });
  check('B31: stack with LOG on top still locks Max',
    hit.kind === 'action' && hit.action === 'place-queue-max'
    && hit.dataset.unit === 'tacticalBomber');

  const logLock = capturePanelPointerLock({ tabId: 'log' });
  const maxWins = resolveLockedPanelClick({
    lock: logLock,
    clickAction: 'place-queue-max',
    clickDataset: { action: 'place-queue-max', unit: 'infantry' },
    now: 100,
  });
  check('B31: pointerdown on LOG + click on Max applies Max, not LOG',
    maxWins?.kind === 'action' && maxWins.action === 'place-queue-max');

  const maxLock = capturePanelPointerLock({
    action: 'place-queue-max',
    dataset: { action: 'place-queue-max', unit: 'infantry' },
  });
  const maxThenLog = resolveLockedPanelClick({
    lock: maxLock,
    clickTabId: 'log',
    clickAction: 'phone-detent-tab',
    now: 100,
  });
  check('B31: Max lock does not switch to LOG',
    maxThenLog?.kind === 'action' && maxThenLog.action === 'place-queue-max');

  check('B31: point inside the panel blocks the map even with no prior pointer',
    shouldBlockMapSelectAfterPanel({
      panelPointerAt: 0, now: 1000, pointInPanel: true,
    }) === true);
  check('B31: point outside the panel does not block without a recent gesture',
    shouldBlockMapSelectAfterPanel({
      panelPointerAt: 0, now: 1000, pointInPanel: false,
    }) === false);
  check('B31: panel rect contains the Max click',
    isPointInPanelRect(900, 400, { left: 800, right: 1120, top: 48, bottom: 800 }) === true
    && isPointInPanelRect(100, 400, { left: 800, right: 1120, top: 48, bottom: 800 }) === false);

  const peekChrome = [{ left: 0, right: 500, top: 700, bottom: 800 }];
  const tallPanel = { left: 0, right: 500, top: 48, bottom: 800 };
  check('peek tray chrome is only the bottom CTA, not the leftover tall sidebar',
    isPointInPeekTrayChrome(250, 750, peekChrome) === true
    && isPointInPeekTrayChrome(250, 200, peekChrome) === false
    && pointHitsPlayerPanel({
      peek: true, clientX: 250, clientY: 200, panelRect: tallPanel, chromeRects: peekChrome,
    }) === false
    && pointHitsPlayerPanel({
      peek: false, clientX: 250, clientY: 200, panelRect: tallPanel, chromeRects: peekChrome,
    }) === true);

  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('B31: canvas mousedown/up use point-in-panel block',
    mainSrc.includes('shouldBlockMapSelect(Date.now(), { x: e.clientX, y: e.clientY })')
    && mainSrc.includes('commitLockedPanelGesture'));
  check('B31: panel hit-test prefers the stack over tab-first',
    panelSrc.includes('pickPanelHitFromStack')
    && panelSrc.includes('elementsFromPoint'));
}

console.log('=== B32 + is exactly +1 per gesture (not +2) ===');
{
  check('B32: first apply in a gesture is allowed',
    shouldApplyQueueGesture({ alreadyApplied: false }) === true);
  check('B32: second apply in the same gesture is rejected',
    shouldApplyQueueGesture({ alreadyApplied: true }) === false);
  let q = { armour: 1 };
  q = applyPlaceQueueDelta({
    queue: q, unitType: 'armour', delta: 1, available: 10, slotsRemaining: 6,
  });
  check('B32: one + is 1→2, not 1→3', q.armour === 2);
  const doubleFire = applyPlaceQueueDelta({
    queue: q, unitType: 'armour', delta: 1, available: 10, slotsRemaining: 6,
  });
  check('B32: a second dispatch without the guard would be +2 (the live bug)',
    doubleFire.armour === 3);
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('B32: panel click and canvas commit share one-shot apply',
    panelSrc.includes('shouldApplyQueueGesture')
    && panelSrc.includes('_queueGestureApplied')
    && /commitLockedPanelGesture[\s\S]*alreadyApplied/.test(panelSrc));
}

console.log('=== B33–B36 undo/select must not pass; new seat is 0/6; + is +1 ===');
{
  const undoLock = capturePanelPointerLock({
    action: 'undo-placement',
    dataset: { action: 'undo-placement' },
  });
  const undoThenDone = resolveLockedPanelClick({
    lock: undoLock,
    clickAction: 'finish-placement',
    now: 100,
  });
  check('B33: Undo lock does not become Done',
    undoThenDone?.action === 'undo-placement');
  check('B33: Undo must not pass the turn',
    shouldPassPlacementTurn({
      action: 'finish-placement', lockAction: 'undo-placement',
    }) === false);
  check('B34: overlay / map click does not Done at 0 deployed',
    shouldPassPlacementTurn({ action: 'finish-placement', fromOverlayCommit: true }) === false
    && shouldPassPlacementTurn({ action: 'finish-placement', mapClick: true }) === false
    && shouldCommitOverlayGesture('finish-placement') === false);
  check('B34: own-capital tap is not auto-commit',
    shouldAutoCommitPhoneCapital({
      mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT, tappedIsOwnedLand: true,
    }) === false);

  check('B35: spectated host 6/6 does not carry onto James YOUR TURN',
    resolveDeployedThisRoundAfterLoad({
      prevPlayerId: 'usa', nextPlayerId: 'usa',
      remotePlacedThisRound: 0, localPlacedThisRound: 6,
      localPlacedOwnerId: 'ussr',
    }) === 0);
  check('B28 still: same actor keeps local 1 against stale 0',
    resolveDeployedThisRoundAfterLoad({
      prevPlayerId: 'usa', nextPlayerId: 'usa',
      remotePlacedThisRound: 0, localPlacedThisRound: 1,
      localPlacedOwnerId: 'usa',
    }) === 1);

  const territories = [
    { name: 'East US', isWater: false, connections: [] },
    { name: 'Ukraine', isWater: false, connections: [] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'usa', name: 'James', oderId: 'james', isAI: false },
    { id: 'ussr', name: 'Bastion', oderId: 'host', isAI: false },
  ];
  gs.currentPlayerIndex = 1;
  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.turnPhase = SETUP_TURN_PHASE;
  gs.unitsPlacedThisRound = 6;
  gs.unitsPlacedThisRoundOwnerId = 'ussr';
  gs.unitsToPlace = { usa: [{ type: 'infantry', quantity: 25 }], ussr: [{ type: 'infantry', quantity: 19 }] };
  const next = gs.toJSON();
  next.currentPlayerIndex = 0;
  next.unitsPlacedThisRound = 0;
  gs.currentPlayerIndex = 0;
  gs.loadFromJSON(next);
  check('B35: load after seat flip is 0/6, not leftover 6/6',
    gs.currentPlayer?.id === 'usa' && gs.unitsPlacedThisRound === 0);

  check('B36: compatibility mouse after + does not start a new gesture',
    shouldBeginNewQueueGesture({
      alreadyApplied: true, elapsedMs: 50,
    }) === false);
  check('B36: a later tap may start a new gesture',
    shouldBeginNewQueueGesture({
      alreadyApplied: true, elapsedMs: 500,
    }) === true);
  let q = { infantry: 1 };
  q = applyPlaceQueueDelta({
    queue: q, unitType: 'infantry', delta: 1, available: 10, slotsRemaining: 6,
  });
  check('B36: one Infantry + is 1→2, not 1→4', q.infantry === 2 && !q.armour);
  q = applyPlaceQueueDelta({
    queue: q, unitType: 'armour', delta: 1, available: 3, slotsRemaining: 5,
  });
  check('B36: Armour + is a separate row, not stolen by Infantry',
    q.infantry === 2 && q.armour === 1);
  const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('B36: overlay commit is queue-only; gesture does not reset mid-click',
    panelSrc.includes('shouldCommitOverlayGesture')
    && panelSrc.includes('shouldBeginNewQueueGesture'));
}

console.log('=== B38–B40 first host turn: panel, deploy pool, Start Game, reload ===');
{
  const liveUnits = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));
  const territories = [
    { name: 'Moscow', isWater: false, connections: ['Baltic'] },
    { name: 'Berlin', isWater: false, connections: ['Baltic'] },
    { name: 'Baltic', isWater: true, connections: ['Moscow', 'Berlin'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.initGame('risk', [
    { id: 'Russians', name: 'Bastion', color: '#B22222', oderId: 'host' },
    { id: 'Americans', name: 'James', color: '#556B2F', oderId: 'guest' },
  ], { startingIPCs: 80, isMultiplayer: true });

  const russianLand = gs.landTerritories.find((t) => gs.getOwner(t.name) === 'Russians');
  const americanLand = gs.landTerritories.find((t) => gs.getOwner(t.name) === 'Americans');
  check('B39: risk init keys the pool as Russians, not ussr',
    (gs.unitsToPlace.Russians || []).some((u) => u.type === 'infantry' && u.quantity > 0));
  if (gs.currentPlayer.id === 'Russians') gs.placeCapital(russianLand.name);
  else gs.placeCapital(americanLand.name);
  if (gs.currentPlayer.id === 'Russians') gs.placeCapital(russianLand.name);
  else gs.placeCapital(americanLand.name);

  check('B39: after both capitals, phase is initial deployment',
    gs.phase === GAME_PHASES.UNIT_PLACEMENT);
  const first = gs.currentPlayer;
  const pool = gs.getUnitsToPlace(first.id);
  const cats = categorizeUnitsToPlace(pool, liveUnits);
  check('B39: first seat still has infantry after capitals (not IPC-empty)',
    cats.land.some((u) => u.type === 'infantry' && u.quantity > 0));
  check('B39: land + air + naval rows exist so + / Max have targets',
    cats.land.length > 0 && cats.naval.some((u) => u.type === 'transport'));
  check('B39: remaining is the starting kit, not 1 transport',
    gs.getTotalUnitsToPlace(first.id, liveUnits) > 6);

  const owned = gs.getPlayerTerritories(first.id).find((n) => !gs.territoryByName[n].isWater);
  let placed = 0;
  for (let i = 0; i < 6; i++) {
    const r = gs.placeInitialUnit(owned, 'infantry', liveUnits);
    if (r.success) placed++;
  }
  check('B39: first turn can place 6 infantry', placed === 6 && gs.unitsPlacedThisRound === 6);
  check('B39: Done is legal at 6/6',
    gs.canFinishPlacementRound(first.id, liveUnits) === true);
  const done = gs.finishPlacementRound(liveUnits);
  check('B39: Done advances the seat', done.ok === true && gs.currentPlayer.id !== first.id);

  const objectPool = { 0: { type: 'transport', quantity: 1 } };
  check('B39: numeric-map pool coerces (Firestore shape)',
    coerceUnitsToPlaceRows(objectPool).some((u) => u.type === 'transport'));
  check('B39: type-map pool coerces',
    coerceUnitsToPlaceRows({ transport: 1 }).some((u) => u.type === 'transport' && u.quantity === 1));
  check('B39: wrong key still resolves Russians via alias',
    resolvePlayerDeployPool({ russians: [{ type: 'infantry', quantity: 9 }] }, 'Russians')
      .some((u) => u.type === 'infantry'));
  check('B39: transport-only at wave 1 / 0 deployed must restore',
    shouldRestoreStartingDeployPool({
      phase: GAME_PHASES.UNIT_PLACEMENT,
      placementRound: 1,
      placedThisRound: 0,
      pool: [{ type: 'transport', quantity: 1 }],
      unitDefs: liveUnits,
    }) === true);
  check('B39: later-wave ships-only does not restore',
    shouldRestoreStartingDeployPool({
      phase: GAME_PHASES.UNIT_PLACEMENT,
      placementRound: 2,
      placedThisRound: 0,
      pool: [{ type: 'transport', quantity: 1 }],
      unitDefs: liveUnits,
    }) === false);
  check('A3/A4: a finished earlier seat is not restocked from the current seat flags',
    shouldRestoreStartingDeployPool({
      phase: GAME_PHASES.UNIT_PLACEMENT,
      placementRound: 1,
      placedThisRound: 0,
      pool: [],
      isCurrentSeat: false,
    }) === false);

  const broken = new GameState({ risk: { factions: [] } }, territories, []);
  broken.players = [
    { id: 'Russians', name: 'Bastion', oderId: 'host' },
    { id: 'Americans', name: 'James', oderId: 'guest' },
  ];
  broken.currentPlayerIndex = 0;
  broken.phase = GAME_PHASES.UNIT_PLACEMENT;
  broken.placementRound = 1;
  broken.unitsPlacedThisRound = 0;
  broken.playerState = { Russians: { hasPlacedCapital: true }, Americans: { hasPlacedCapital: true } };
  broken.unitsToPlace = { Russians: { transport: 1 } };
  broken.ensureInitialDeployPools();
  check('B39: load of transport-only Russians restores infantry',
    broken.getUnitsToPlace('Russians').some((u) => u.type === 'infantry' && u.quantity > 0));

  const midWave = new GameState({ risk: { factions: [] } }, territories, []);
  midWave.players = [
    { id: 'h0', name: 'Human0', oderId: 'user_0' },
    { id: 'a0', name: 'Bot0', oderId: 'ai_0', isAI: true },
  ];
  midWave.currentPlayerIndex = 1;
  midWave.phase = GAME_PHASES.UNIT_PLACEMENT;
  midWave.placementRound = 1;
  midWave.unitsPlacedThisRound = 0;
  midWave.playerState = { h0: { hasPlacedCapital: true }, a0: { hasPlacedCapital: true } };
  midWave.unitsToPlace = { h0: [], a0: [{ type: 'infantry', quantity: 6 }] };
  midWave.ensureInitialDeployPools();
  check('A3/A4: load on a later seat does not restock a finished empty pool',
    (midWave.getUnitsToPlace('h0') || []).every((u) => !(u.quantity > 0))
    && midWave.getUnitsToPlace('a0').some((u) => u.type === 'infantry' && u.quantity === 6));

  const cta = resolveHostLobbyPrimaryCta({
    isHost: true,
    playerCount: 2,
    allHaveFactions: true,
    hostHasFaction: true,
  });
  check('B40: 2/2 host CTA is Start Game, not Create Game',
    cta?.label === 'Start Game' && cta.action === 'start' && cta.disabled === false);
  const lobbySrc = readFileSync(join(root, 'src/ui/multiplayerLobby.js'), 'utf8');
  check('B40: waiting-room primary is never labeled Create Game',
    !/data-action="publish"[\s\S]{0,80}Create Game/.test(lobbySrc)
    && lobbySrc.includes('resolveHostLobbyPrimaryCta')
    && lobbySrc.includes('Start Game'));
  const lobbyMgrSrc = readFileSync(join(root, 'src/multiplayer/lobbyManager.js'), 'utf8');
  check('B40: Start publishes an unpublished 2/2 lobby',
    lobbyMgrSrc.includes('if (!live.isPublished)')
    && lobbyMgrSrc.includes('lobbyUpdate.isPublished = true')
    && lobbyMgrSrc.includes('runTransaction'));
  check('9.20.26.12: first List click patches isPublished locally',
    shouldShowListInOpenGames({ isHost: true, isPublished: false }) === true
    && shouldShowListInOpenGames({ isHost: true, isPublished: true }) === false
    && shouldShowListInOpenGames({ isHost: false, isPublished: false }) === false
    && /async publishLobby\([\s\S]*_patchCurrentLobby\([\s\S]*isPublished:\s*true/.test(lobbyMgrSrc)
    && lobbySrc.includes("btn.textContent = 'Listing…'")
    && lobbySrc.includes('shouldShowListInOpenGames')
    && readFileSync(join(root, 'src/map/threeMapChrome.js'), 'utf8').includes('data-lobby="mp-publish"')
    && readFileSync(join(root, 'src/map/threeMpSession.js'), 'utf8').includes('publishRoom')
    && readFileSync(join(root, 'src/map/threeSoloBoot.js'), 'utf8').includes('mp-publish'));

  check('B38: signed-in reload with last match auto-resumes',
    shouldAutoResumeLastMatch({
      signedIn: true,
      lastMatch: { gameId: 'game_cevx', lobbyCode: 'CEVX6F' },
    }) === true);
  check('B38: signed-out reload does not auto-resume',
    shouldAutoResumeLastMatch({
      signedIn: false,
      lastMatch: { gameId: 'game_cevx', lobbyCode: 'CEVX6F' },
    }) === false);
  check('B38: Exit does not auto-resume',
    shouldAutoResumeLastMatch({
      signedIn: true,
      lastMatch: { gameId: 'game_cevx' },
      explicitExit: true,
    }) === false);
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  check('B38: boot path calls shouldAutoResumeLastMatch',
    mainSrc.includes('shouldAutoResumeLastMatch')
    && mainSrc.includes('resumeLastMatch')
    && mainSrc.includes('hydrateLastMatch'));
  check('boot hang: lastMatch does not pin the branded loader',
    shouldHoldLoaderForLastMatchResume() === false
    && mainSrc.includes('dismissStartupLoader()')
    && mainSrc.includes('withTimeout')
    && mainSrc.includes('showReconnectOnly()'));
  check('B38: initial deploy peeks chips + Deploy (not a covering sheet)',
    shouldPeekPhoneTray({ mobile: true, phase: GAME_PHASES.UNIT_PLACEMENT }) === true);
  check('B38: sidebar z-index beats zoom-controls',
    /#sidebar \{[\s\S]*?z-index:\s*60/.test(readFileSync(join(root, 'style.css'), 'utf8')));
  const panelSrcB38 = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
  check('B38: panel show() paints immediately; empty state is not blank',
    panelSrcB38.includes("this.el.classList.remove('hidden')")
    && panelSrcB38.includes('Loading match…')
    && panelSrcB38.includes("className = 'player-panel hidden'"));
  check('B39: placement actions always paint Undo and Deploy',
    panelSrcB38.includes('↩ Undo')
    && panelSrcB38.includes('data-action="confirm-placement"')
    && panelSrcB38.includes('canDeploy'));

  check('CEVX6F hold: resume never creates a new game',
    shouldCreateNewGameOnResume() === false);
  check('CEVX6F hold: Start on a started lobby reuses that gameId',
    resolveStartGameTarget({
      existingGameId: 'game_cevx6f',
      lobbyStatus: 'starting',
    }).reuse === true
    && resolveStartGameTarget({
      existingGameId: 'game_cevx6f',
      lobbyStatus: 'starting',
    }).gameId === 'game_cevx6f');
  check('CEVX6F hold: a waiting lobby with no gameId may create once',
    resolveStartGameTarget({
      existingGameId: null,
      lobbyStatus: 'waiting',
    }).reuse === false);
  check('B38: failed resume of CEVX6F is reconnect, not Create Game home',
    resolveResumeFailureView({
      resumed: false,
      lastMatch: { gameId: 'game_cevx', lobbyCode: 'CEVX6F' },
    }) === 'reconnect');
  check('B38: boot/Play Online use reconnect-only on resume miss',
    mainSrc.includes('resolveResumeFailureView')
    && mainSrc.includes('showReconnectOnly')
    && lobbyMgrSrc.includes('reused: true'));

  // B41 — 6V9ZXK: host waiting-room dumped to Local Play / Play Online
  check('B41: snapshot error / flicker is not Leave',
    shouldLeaveLobbyView({ snapshotError: true }) === false
    && shouldLeaveLobbyView({ snapshotMissing: true }) === false
    && shouldLeaveLobbyView({ presenceFlicker: true }) === false
    && shouldLeaveLobbyView({ sessionLost: true }) === false);
  check('B41: only explicit Leave / Back / Browse leave the waiting-room VIEW',
    shouldLeaveLobbyView({ explicitLeave: true }) === true
    && shouldLeaveLobbyView({ confirmedLeave: true }) === true
    && shouldLeaveLobbyView({ explicitBrowse: true }) === true
    && shouldLeaveLobbyView({ explicitBack: true }) === true);
  check('B41: flicker without Back does not navigate home',
    shouldNavigateToHome({
      lastMatch: { lobbyCode: '6V9ZXK' },
    }) === false
    && shouldNavigateToHome({ liveLobby: true }) === false);
  check('9.20.26.08: explicit Back / Sign Out go home even if 6V9ZXK is remembered',
    shouldNavigateToHome({
      explicitExit: true,
      lastMatch: { lobbyCode: '6V9ZXK' },
    }) === true
    && shouldNavigateToHome({ liveLobby: true, explicitExit: true }) === true
    && shouldNavigateToHome({ confirmedSignOut: true, lastMatch: { lobbyCode: '6V9ZXK' } }) === true
    && shouldNavigateToHome({ explicitExit: true, lastMatch: null }) === true);
  check('B41: snapshot error keeps the last known lobby',
    shouldClearLobbyOnSnapshotError() === false
    && shouldKeepLastKnownLobby({ snapshotError: true }) === true
    && shouldKeepLastKnownLobby({ snapshotExists: false }) === true);
  check('B41: lost view restores lobby from lastMatch, not home',
    resolveLobbyViewAfterLoss({
      currentLobby: null,
      lastMatch: { lobbyCode: '6V9ZXK' },
    }) === 'lobby'
    && resolveLobbyViewAfterLoss({
      currentLobby: null,
      lastMatch: { gameId: 'game_6v9', lobbyCode: '6V9ZXK' },
    }) === 'game'
    && resolveLobbyViewAfterLoss({
      currentLobby: { code: '6V9ZXK' },
      lastMatch: null,
    }) === 'lobby'
    && resolveLobbyViewAfterLoss({ explicitLeave: true }) === 'home'
    && resolveLobbyViewAfterLoss({ explicitBrowse: true, lastMatch: { lobbyCode: '6V9ZXK' } }) === 'browse'
    && resolveLobbyViewAfterLoss({ explicitBack: true, lastMatch: { lobbyCode: '6V9ZXK' } }) === 'home');
  {
    const store = new Map();
    const storage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
      removeItem: (k) => store.delete(k),
    };
    const saved = rememberLastMatch({ lobbyCode: '6V9ZXK', hostName: 'Bastion' }, storage);
    check('B41: waiting lobby is remembered without a gameId',
      saved?.lobbyCode === '6V9ZXK'
      && saved?.gameId === null
      && readLastMatch(storage)?.lobbyCode === '6V9ZXK');
    check('9.20.26.09: waiting lobbyCode does not auto-resume a map',
      shouldAutoResumeLastMatch({ signedIn: true, lastMatch: readLastMatch(storage) }) === false
      && shouldAutoResumeLastMatch({
        signedIn: true,
        lastMatch: { gameId: 'game_live', lobbyCode: '6V9ZXK' },
      }) === true);
  }
  check('B41: waiting-lobby resume miss is lobby, not home',
    resolveResumeFailureView({
      resumed: false,
      lastMatch: { lobbyCode: '6V9ZXK' },
    }) === 'lobby'
    && resolveResumeFailureView({ resumed: false, lastMatch: null }) === 'home');
  check('B41: Start stays gated at 1/2',
    resolveHostLobbyPrimaryCta({
      isHost: true,
      playerCount: 1,
      allHaveFactions: true,
      hostHasFaction: true,
    })?.disabled === true
    && resolveHostLobbyPrimaryCta({
      isHost: true,
      playerCount: 2,
      allHaveFactions: true,
      hostHasFaction: true,
    })?.disabled === false);
  check('B41: create/join remembers lobbyCode; snapshot error does not null',
    lobbyMgrSrc.includes('rememberLastMatch')
    && lobbyMgrSrc.includes('shouldClearLobbyOnSnapshotError')
    && lobbyMgrSrc.includes('shouldKeepLastKnownLobby')
    && lobbyMgrSrc.includes('forgetLastMatch()'));
  check('B41: home is gated; restoreLiveLobbyOrGame exists',
    mainSrc.includes('shouldNavigateToHome')
    && mainSrc.includes('restoreLiveLobbyOrGame')
    && mainSrc.includes('onCoverHome')
    && lobbySrc.includes('_restoreLiveLobby')
    && lobbySrc.includes('_renderLobbyRestoring')
    && lobbySrc.includes('shouldLeaveLobbyView'));
  check('9.20.26.08: explicit Back is not flicker',
    shouldHonorLobbyBack({ explicitBack: true }) === true
    && shouldHonorLobbyBack({}) === false
    && resolveLobbyBackTarget({ published: true, hasBrowse: true }) === 'browse'
    && resolveLobbyBackTarget({ published: false, hasBrowse: false }) === 'online'
    && shouldForceLobbyRoomOnSnapshot({ browsingAway: true, lobbyPresent: true }) === false
    && shouldForceLobbyRoomOnSnapshot({ browsingAway: false, lobbyPresent: true }) === true
    && shouldForceLobbyRoomOnSnapshot({
      browsingAway: true,
      lobbyPresent: true,
      gameStarting: true,
    }) === true
    && shouldRestoreLobbyAfterDisconnect({ explicitBrowse: true }) === false
    && shouldRestoreLobbyAfterDisconnect({}) === true);
  check('9.20.26.08/.09: Classic + Experimental + boot wire shared lobby nav',
    lobbySrc.includes('_browsingAway')
    && lobbySrc.includes("disconnectFromLobby({ notify: false })")
    && lobbySrc.includes('resolveLobbyBackTarget')
    && lobbyMgrSrc.includes('disconnectFromLobby({ notify = true }')
    && mainSrc.includes('bootResume')
    && mainSrc.includes('shouldAutoResumeLastMatch')
    && readFileSync(join(root, 'src/map/threeSoloBoot.js'), 'utf8').includes('shouldForceLobbyRoomOnSnapshot')
    && readFileSync(join(root, 'src/map/threeSoloBoot.js'), 'utf8').includes('detachLobby')
    && readFileSync(join(root, 'src/map/threeMpSession.js'), 'utf8').includes('detachLobby')
    && readFileSync(join(root, 'src/map/threeSoloLobby.js'), 'utf8').includes('browsingAway'));
}

console.log('=== V2.81.42 My Games hygiene + presence comments ===');
{
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  const presenceSrc = readFileSync(join(root, 'src/multiplayer/presenceManager.js'), 'utf8');
  check('finished / deleted never list or Join',
    shouldListGameInMyGames({ id: 'g1', status: 'finished' }) === false
    && shouldJoinListedGame({ game: { id: 'g1', status: 'finished' } }) === false
    && shouldReconnectToGame({ exists: false, status: 'active' }) === false
    && shouldReconnectToGame({ exists: true, status: 'finished' }) === false
    && shouldJoinListedGame({ game: { id: 'g1', status: 'active' } }) === true);
  check('deleted last-match id is forgotten, not stubbed as Join',
    shouldForgetLastMatchAfterLookup({ lastMatchMissing: true }) === true
    && recoverMyGamesOnLoad({
      games: [],
      lastMatch: { gameId: 'gone', lobbyCode: 'ABCDEF' },
      lastMatchMissing: true,
    }).length === 0);
  check('finished last-match lookup does not stub an active Join row',
    recoverMyGamesOnLoad({
      games: [],
      lastMatchGame: { id: 'done', status: 'finished' },
      lastMatch: { gameId: 'done', lobbyCode: 'ABCDEF' },
    }).length === 0
    && shouldForgetLastMatchAfterLookup({
      lastMatchGame: { id: 'done', status: 'finished' },
    }) === true);
  check('B25 stub still lists last match when the lookup never ran',
    recoverMyGamesOnLoad({
      games: [],
      lastMatch: { gameId: 'game_zuj', lobbyCode: 'ZUJMNP' },
    }).map((g) => g.id).join(',') === 'game_zuj');
  check('beforeunload comments do not claim presence delete',
    !/beforeunload\) made another client/.test(mainSrc)
    && /Presence docs are NOT deleted on beforeunload/.test(mainSrc)
    && /Do NOT delete the presence doc on beforeunload/.test(presenceSrc)
    && /Explicit Exit is the only delete/.test(presenceSrc));
  check('idle host does not start failover',
    shouldAccumulateHostOfflineMs({ hostPresence: 'idle' }) === false
    && shouldStartHostFailover({ hostPresence: 'idle', offlineForMs: 120000 }) === false
    && shouldStartHostFailover({ hostPresence: 'offline', offlineForMs: 90000 }) === true);
}

console.log('=== V2.81.48 rejoin hydrate — no stub start, Leave clears lastMatch ===');
{
  const mainSrc48 = readFileSync(join(root, 'src/main.js'), 'utf8');
  const lobbySrc48 = readFileSync(join(root, 'src/ui/multiplayerLobby.js'), 'utf8');
  const lobbyMgrSrc48 = readFileSync(join(root, 'src/multiplayer/lobbyManager.js'), 'utf8');

  check('stub {id, lobbyCode} is not a hydrate payload',
    hasHydratePayload({ id: 'game_3rv', lobbyCode: '3RVNJU' }) === false
    && hasHydratePayload(null) === false
    && shouldFetchGameDocBeforeStart({
      game: { id: 'game_3rv', lobbyCode: '3RVNJU' },
      gameId: 'game_3rv',
    }) === true);
  check('live doc with state or lobby players is enough to start',
    hasHydratePayload({ id: 'g1', state: { players: [{}] } }) === true
    && hasHydratePayload({ id: 'g1', lobbyData: { players: [{ oderId: 'u1' }] } }) === true
    && shouldFetchGameDocBeforeStart({
      game: { id: 'g1', state: { players: [{}] } },
      gameId: 'g1',
    }) === false);
  check('reconnect overlay is not painted over an in-flight or seated resume',
    shouldShowReconnectAfterResumeAttempt({
      lastMatch: { gameId: 'g1', lobbyCode: '3RVNJU' },
      resumeInFlight: true,
    }) === false
    && shouldShowReconnectAfterResumeAttempt({
      lastMatch: { gameId: 'g1' },
      alreadyInGame: true,
    }) === false
    && shouldShowReconnectAfterResumeAttempt({
      lastMatch: { gameId: 'g1', lobbyCode: '3RVNJU' },
      resumed: false,
    }) === true);
  check('Leave this match clears lastMatch; cancel does not',
    shouldForgetLastMatchOnDismissRejoin({ confirmedLeave: true }) === true
    && shouldForgetLastMatchOnDismissRejoin({ confirmedLeave: false }) === false);
  check('transient hydrate miss keeps lastMatch; gone/finished forgets',
    shouldForgetLastMatchOnHydrateFailure({}) === false
    && shouldForgetLastMatchOnHydrateFailure({ gameMissing: true }) === true
    && shouldForgetLastMatchOnHydrateFailure({ gameFinished: true }) === true);
  check('Sign-in dropped copy only when actually signed out',
    /Sign-in dropped/.test(resolveReconnectCopy({ signedIn: false }).detail) === true
    && /Sign-in dropped/.test(resolveReconnectCopy({
      signedIn: true,
      lobbyCode: '3RVNJU',
    }).detail) === false
    && /3RVNJU/.test(resolveReconnectCopy({ signedIn: true, lobbyCode: '3RVNJU' }).detail)
    && /Rejoining/.test(resolveReconnectCopy({
      signedIn: true,
      resumeInFlight: true,
      lobbyCode: '3RVNJU',
    }).detail));
  check('rejoin plan waits for auth, never starts from a stub',
    resolveRejoinHydratePlan({
      signedIn: false,
      authReady: false,
      lastMatch: { gameId: 'g1', lobbyCode: '3RVNJU' },
    }).action === 'wait-auth'
    && resolveRejoinHydratePlan({
      signedIn: false,
      authReady: true,
      lastMatch: { gameId: 'g1', lobbyCode: '3RVNJU' },
    }).action === 'show-auth'
    && resolveRejoinHydratePlan({
      signedIn: true,
      lastMatch: { gameId: 'g1', lobbyCode: '3RVNJU' },
    }).action === 'fetch-game'
    && resolveRejoinHydratePlan({
      signedIn: true,
      lastMatch: { gameId: 'g1', lobbyCode: '3RVNJU' },
      fetchedGame: { id: 'g1', status: 'active', state: { players: [{}] } },
    }).action === 'start-game'
    && resolveRejoinHydratePlan({
      signedIn: true,
      lastMatch: { gameId: 'g1' },
      fetchedMissing: true,
    }).action === 'forget');
  check('same game already starting or seated is reused',
    shouldReuseInFlightMultiplayerStart({
      startingGameId: 'g1',
      requestedGameId: 'g1',
    }) === true
    && shouldReuseInFlightMultiplayerStart({
      alreadyInGame: true,
      seatedGameId: 'g1',
      requestedGameId: 'g1',
    }) === true
    && shouldReuseInFlightMultiplayerStart({
      requestedGameId: 'g2',
      seatedGameId: 'g1',
      alreadyInGame: true,
    }) === false);
  check('Rejoin / boot hydrate through lobbyManager, not a stub onStart',
    lobbySrc48.includes('hydrateLastMatch')
    && lobbySrc48.includes('_handleRejoinLast')
    && /forgetLastMatch\(\)/.test(lobbySrc48)
    && !/onStart\(last\.gameId,\s*\{\s*id:\s*last\.gameId/.test(lobbySrc48)
    && lobbyMgrSrc48.includes('hydrateLastMatch')
    && mainSrc48.includes('hydrateLastMatch')
    && mainSrc48.includes('shouldFetchGameDocBeforeStart')
    && !/startMultiplayerGame\(\s*last\.gameId,\s*\{\s*id:\s*last\.gameId/.test(mainSrc48)
    && !/startMultiplayerGame\(\s*lastAtBoot\.gameId,\s*\{\s*id:\s*lastAtBoot/.test(mainSrc48));
  check('dismiss-rejoin is confirmed Leave that forgets lastMatch',
    /data-action="dismiss-rejoin"/.test(lobbySrc48)
    && /shouldForgetLastMatchOnDismissRejoin\(\{\s*confirmedLeave:\s*true\s*\}\)/.test(lobbySrc48));
}

console.log('=== V2.81.50 lobby seat-loss / Easy Bot replace ===');
{
  const { addLobbyAISeat, humanSeatPreserved, startGameRoster } =
    await import(pathToFileURL(join(root, 'src/multiplayer/lobbySeats.js')));
  const latest = [
    { oderId: 'robert', displayName: 'Robert007' },
    { oderId: 'ai_1', displayName: 'Easy Bot', isAI: true },
    { oderId: 'bastion', displayName: 'Bastion' },
    { oderId: 'benson', displayName: 'Sean Benson' },
  ];
  const staleWrite = [
    latest[0], latest[1], latest[2],
    { oderId: 'ai_2', displayName: 'Easy Bot', isAI: true },
  ];
  check('stale Add AI is the live Robert007 / Easy Bot / Easy Bot / Bastion card',
    staleWrite.filter((p) => p.displayName === 'Easy Bot').length === 2
    && staleWrite.some((p) => p.displayName === 'Robert007')
    && staleWrite.some((p) => p.displayName === 'Bastion')
    && !staleWrite.some((p) => p.oderId === 'benson')
    && humanSeatPreserved({
      latestPlayers: latest,
      nextPlayers: staleWrite,
      humanId: 'benson',
    }) === false);
  check('transactional Add AI on a full 4-max keeps Benson',
    addLobbyAISeat({
      players: latest,
      aiPlayer: { oderId: 'ai_2', displayName: 'Easy Bot', isAI: true },
      maxPlayers: 4,
    }).ok === false
    && startGameRoster(latest).playerUserIds.includes('benson'));
  const lobbyMgrSrc50 = readFileSync(join(root, 'src/multiplayer/lobbyManager.js'), 'utf8');
  check('lobby writers use runTransaction + latest-seat transforms',
    lobbyMgrSrc50.includes('runTransaction')
    && lobbyMgrSrc50.includes('addLobbyAISeat')
    && lobbyMgrSrc50.includes('startGameRoster')
    && !/lobbyData:\s*\{\s*players:\s*this\.currentLobby\.players/.test(lobbyMgrSrc50));
}

console.log(failures === 0 ? '\nALL PRESENCE-AND-DEPLOY CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
