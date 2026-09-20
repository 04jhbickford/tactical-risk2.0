// Presence / auth / lobby rules for backgrounded tabs.
// No Firebase here — PresenceManager and harnesses share one policy.

export const PRESENCE_HEARTBEAT_MS = 30000;
export const PRESENCE_STALE_MS = 120000;
// A backgrounded tab's interval is frozen. The doc still exists — that is
// not "host gone". Only a missing doc or 15+ min of silence is offline.
export const PRESENCE_GONE_MS = 15 * 60 * 1000;

export function resolvePresenceState({
  hasDoc = false,
  lastSeen = 0,
  state = null,
  now = Date.now(),
} = {}) {
  if (!hasDoc) return 'offline';
  const age = now - (Number(lastSeen) || 0);
  if (age > PRESENCE_GONE_MS) return 'offline';
  if (state === 'idle') return 'idle';
  if (age > PRESENCE_STALE_MS) return 'idle';
  return state || 'online';
}

// Backgrounding (hidden / pagehide / pageshow from bfcache) must never
// delete the presence doc or the lobby. A missing doc is what made ZUJMNP
// look host-less and then "not found".
export function shouldDeletePresenceDoc({ reason } = {}) {
  return reason === 'explicit-leave';
}

// Auth eject / Sign In after a backgrounded tab is not Exit. Keep the
// presence doc so failover does not treat the host as gone (B25).
export function presenceStopReason({ explicitLeave = false } = {}) {
  return explicitLeave ? 'explicit-leave' : 'session-lost';
}

export function presenceStateForVisibility(visibilityState) {
  return visibilityState === 'visible' ? 'online' : 'idle';
}

// Background / bfcache / freeze must never sign out or self-eject.
export function isBackgroundLifecycleEvent(event) {
  return event === 'visibilitychange'
    || event === 'visibility-hidden'
    || event === 'visibility-visible'
    || event === 'pagehide'
    || event === 'pageshow'
    || event === 'pageshow-persisted'
    || event === 'beforeunload'
    || event === 'reload'
    || event === 'freeze'
    || event === 'resume';
}

export function shouldSignOutOnBackground({ event } = {}) {
  return false;
}

// getAuth() already persists via IndexedDB. Calling setPersistence on every
// init races the restore and is what dropped Bastion to Sign In on the
// V2.77 reload (E1/B25).
export function shouldCallSetPersistenceOnInit() {
  return false;
}

export function shouldTreatReloadAsSignOut() {
  return false;
}

export function shouldAwaitAuthBeforeSignIn() {
  return true;
}

// Do not show the password form until Firebase has finished restoring.
// A null user before authReady is "still loading", not signed out.
export function shouldShowSignInForm({
  authReady = false,
  userPresent = false,
} = {}) {
  if (!authReady) return false;
  return !userPresent;
}

export function shouldHeartbeatNow({ event, persisted = false } = {}) {
  if (persisted) return true;
  return event === 'visibility-visible'
    || event === 'visibility-hidden'
    || event === 'visibilitychange'
    || event === 'pageshow'
    || event === 'pageshow-persisted'
    || event === 'interval';
}

// Resume (visible / pageshow, including bfcache) must heartbeat now.
export function shouldResumeSnapshots({ event } = {}) {
  return event === 'visibility-visible' || event === 'pageshow';
}

// Re-attach only when the listener is dead. A live unsubscribe must not
// get a second onSnapshot (dual writer / duplicate apply).
export function shouldReplaceSnapshotListener({
  hasUnsubscribe = false,
  listenerErrored = false,
  persistedPageShow = false,
} = {}) {
  if (persistedPageShow) return true;
  if (listenerErrored) return true;
  if (!hasUnsubscribe) return true;
  return false;
}

// A backgrounded host is idle, not gone. Idle must not start the 90s
// host-failover clock by itself.
export function shouldAccumulateHostOfflineMs({ hostPresence } = {}) {
  return hostPresence === 'offline';
}

export function shouldStartHostFailover({
  hostPresence = 'offline',
  offlineForMs = 0,
  graceMs = 90000,
} = {}) {
  if (!shouldAccumulateHostOfflineMs({ hostPresence })) return false;
  return Number(offlineForMs) >= Number(graceMs);
}

// A single permission-denied / network blip is not a sign-out.
// Background + a null user is not Exit. Eject only on the Sign Out button.
export function shouldEjectFromMatch({
  authUserPresent = false,
  tokenValid = false,
  confirmedSignOut = false,
  lifecycleEvent = null,
} = {}) {
  if (isBackgroundLifecycleEvent(lifecycleEvent)) return false;
  if (confirmedSignOut) return true;
  return false;
}

export const MY_GAMES_ACTIVE_STATUSES = ['active', 'starting'];

export function isMyGamesActiveStatus(status) {
  return MY_GAMES_ACTIVE_STATUSES.includes(status);
}

export function shouldReconnectToGame({ exists = true, status = 'active' } = {}) {
  if (!exists) return false;
  return isMyGamesActiveStatus(status || 'active');
}

// Token hiccup after Sign In must still list games. Wiping the list here
// is how B25 showed "No active games found" while Bastion stayed signed in.
// A remembered last match is enough to keep My Games from going empty.
export function shouldAbortMyGamesOnTokenHiccup({
  authUserPresent = false,
  tokenValid = false,
  hasLastMatch = false,
} = {}) {
  if (hasLastMatch) return false;
  if (authUserPresent) return false;
  return !tokenValid;
}

// startedBy is a B25 fallback when playerUserIds is missing/empty. After an
// explicit Leave, playerUserIds is a non-empty array without this user —
// do not put that game back on My Games just because they created it.
export function shouldListStarterGameOnMyGames({ game = null, userId = null } = {}) {
  if (!game?.id) return false;
  if (!isMyGamesActiveStatus(game.status)) return false;
  const ids = game.playerUserIds;
  if (userId && Array.isArray(ids) && ids.length > 0 && !ids.includes(userId)) {
    return false;
  }
  return true;
}

export function mergeMyActiveGames({ bySeat = [], byStarter = [], userId = null } = {}) {
  const byId = new Map();
  for (const game of bySeat) {
    if (!game?.id) continue;
    if (!isMyGamesActiveStatus(game.status)) continue;
    byId.set(game.id, game);
  }
  for (const game of byStarter) {
    if (!shouldListStarterGameOnMyGames({ game, userId })) continue;
    byId.set(game.id, game);
  }
  return [...byId.values()];
}

// Empty [] is truthy — do not treat it as "not seated". B25: host Sign In
// then join ZUJMNP must land in the live game.
export function isSeatedInStartedGame({ game, lobby, userId } = {}) {
  if (!userId) return false;
  if (!game && !lobby) return false;

  const ids = game?.playerUserIds;
  if (Array.isArray(ids) && ids.length > 0) {
    return ids.includes(userId);
  }

  const lobbyPlayers = lobby?.players || game?.lobbyData?.players || [];
  if (lobbyPlayers.some((p) => p && p.oderId === userId)) return true;
  if (game?.startedBy === userId) return true;
  if (lobby?.hostId === userId) return true;
  return !!game;
}

// Join-by-code: a started match is still the same code. Waiting lobby
// first; otherwise any lobby/game with that code.
export function resolveJoinByCode({
  waitingLobby,
  anyLobby,
  startedGame,
  userId,
  rememberedGameId = null,
} = {}) {
  if (waitingLobby) return { kind: 'lobby', lobby: waitingLobby };
  if (startedGame && (
    isSeatedInStartedGame({
      game: startedGame,
      lobby: anyLobby,
      userId,
    })
    || (rememberedGameId && rememberedGameId === startedGame.id)
  )) {
    return { kind: 'game', game: startedGame };
  }
  // B25 confirmed: guest is still in the live game. A started doc with
  // this code must never be "Lobby not found" — the host is reconnecting.
  if (startedGame) {
    return { kind: 'game', game: startedGame };
  }
  // getDoc / lobby query missed, but this browser still has the gameId.
  // Reconnect by id — never "Lobby not found" for the live match.
  if (rememberedGameId) {
    return { kind: 'game', game: { id: rememberedGameId } };
  }
  if (anyLobby && anyLobby.status && anyLobby.status !== 'waiting') {
    return { kind: 'started-lobby', lobby: anyLobby };
  }
  return { kind: 'not-found' };
}

export function shouldDeleteLobbyOnHostLeave({ lobbyStatus, remainingHumans = 0 } = {}) {
  if (lobbyStatus && lobbyStatus !== 'waiting') return false;
  return remainingHumans <= 0;
}

const LEAVE_CONTROL_SELECTOR =
  '[data-leave-game], [data-leave-lobby], [data-role="leave-game"], [data-action="leave-game"]';

// Clicking the word "Leave" can target a Text node (no .closest). Walk up
// so My Games Leave never silently no-ops.
export function resolveEventElement(eventTarget) {
  if (!eventTarget) return null;
  if (typeof eventTarget.closest === 'function') return eventTarget;
  const parent = eventTarget.parentElement || eventTarget.parentNode;
  if (parent && typeof parent.closest === 'function') return parent;
  return null;
}

export function closestLeaveControl(eventTarget) {
  const el = resolveEventElement(eventTarget);
  if (!el) return null;
  return el.closest(LEAVE_CONTROL_SELECTOR);
}

// Surrender is an explicit Leave control. A game-row / join tap / title
// tap must never open the leave confirm (B23).
export function isLeaveControlTarget(eventTarget) {
  return !!closestLeaveControl(eventTarget);
}

export function shouldOpenLeaveConfirm({
  clickOnLeaveControl = false,
  eventTarget = null,
} = {}) {
  if (!clickOnLeaveControl) return false;
  if (eventTarget) return isLeaveControlTarget(eventTarget);
  return true;
}

// Row title / join hit target must resume the match. Leave is a sibling.
export function shouldJoinGameFromRowClick({ eventTarget = null } = {}) {
  if (!eventTarget || typeof eventTarget.closest !== 'function') return false;
  if (isLeaveControlTarget(eventTarget)) return false;
  return !!eventTarget.closest('[data-role="join-game"]');
}
