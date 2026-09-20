// Last-played match — local, no Firebase.
// A backgrounded host can lose the session while the guest stays in the
// live game (B25 confirmed: James still in ZUJMNP). My Games / join-by-code
// must still find that game. The 6-char code + gameId live here so every
// tab on this browser can Rejoin without a composite index.

export const LAST_MATCH_KEY = 'tacticalRisk_lastMatch';

export function resolveLobbyCodeFromGameDoc(doc = {}) {
  const raw = doc?.lobbyCode || doc?.lobbyData?.code || doc?.code || null;
  if (!raw) return null;
  const code = String(raw).toUpperCase();
  return /^[A-Z2-9]{6}$/.test(code) ? code : null;
}

export function readLastMatch(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(LAST_MATCH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const lobbyCode = resolveLobbyCodeFromGameDoc(parsed);
    if (!parsed?.gameId && !lobbyCode) return null;
    return {
      gameId: parsed.gameId || null,
      lobbyCode,
      hostName: parsed.hostName || null,
    };
  } catch {
    return null;
  }
}

export function rememberLastMatch({
  gameId = null,
  lobbyCode = null,
  hostName = null,
} = {}, storage = globalThis.localStorage) {
  if (!storage?.setItem) return null;
  const code = resolveLobbyCodeFromGameDoc({ lobbyCode, code: lobbyCode });
  if (!gameId && !code) return null;
  const next = {
    gameId: gameId || null,
    lobbyCode: code,
    hostName: hostName || null,
    at: Date.now(),
  };
  storage.setItem(LAST_MATCH_KEY, JSON.stringify(next));
  return next;
}

export function forgetLastMatch(storage = globalThis.localStorage) {
  try {
    storage?.removeItem?.(LAST_MATCH_KEY);
  } catch {
    // ignore
  }
}

export function lastMatchForJoinCode({ lastMatch = null, code = null } = {}) {
  if (!lastMatch || !code) return null;
  const want = String(code).toUpperCase();
  if (lastMatch.lobbyCode && lastMatch.lobbyCode === want) return lastMatch;
  return null;
}

export function mergeLastMatchIntoMyGames({ games = [], lastMatchGame = null } = {}) {
  if (!lastMatchGame?.id) return games;
  if (games.some((g) => g.id === lastMatchGame.id)) return games;
  const status = lastMatchGame.status;
  if (status && status !== 'active' && status !== 'starting') return games;
  return [lastMatchGame, ...games];
}

// Query miss / token hiccup must still list the live match. A stub from
// lastMatch is enough for Resume — startMultiplayerGame loads the doc.
export function stubGameFromLastMatch(lastMatch = null) {
  if (!lastMatch?.gameId) return null;
  return {
    id: lastMatch.gameId,
    status: 'active',
    lobbyCode: lastMatch.lobbyCode || null,
    lobbyData: { code: lastMatch.lobbyCode || null, players: [] },
  };
}

export function recoverMyGamesOnLoad({
  games = [],
  lastMatchGame = null,
  lastMatch = null,
  lastMatchMissing = false,
} = {}) {
  const listed = (games || []).filter((g) => shouldListGameInMyGames(g));
  if (lastMatchMissing) return listed;
  if (lastMatchGame && !shouldListGameInMyGames(lastMatchGame)) return listed;
  let next = mergeLastMatchIntoMyGames({ games: listed, lastMatchGame });
  next = next.filter((g) => shouldListGameInMyGames(g));
  if (next.some((g) => g.id === lastMatch?.gameId)) return next;
  const stub = stubGameFromLastMatch(lastMatch);
  if (stub) return mergeLastMatchIntoMyGames({ games: next, lastMatchGame: stub });
  return next;
}

export function shouldListGameInMyGames(game) {
  if (!game?.id) return false;
  return (game.status || 'active') === 'active' || game.status === 'starting';
}

export function shouldJoinListedGame({ game = null, exists = true } = {}) {
  if (!exists || !game?.id) return false;
  return shouldListGameInMyGames(game);
}

export function shouldForgetLastMatchAfterLookup({
  lastMatchMissing = false,
  lastMatchGame = null,
} = {}) {
  if (lastMatchMissing) return true;
  if (lastMatchGame && !shouldListGameInMyGames(lastMatchGame)) return true;
  return false;
}

export function shouldWipeMyGamesOnError({ lastMatch = null } = {}) {
  return !(lastMatch?.gameId || lastMatch?.lobbyCode);
}

export function shouldForgetLastMatchOnBackground() {
  return false;
}

// Never the string "Lobby not found" — that is how ZUJMNP died after Sign In.
export function resolveJoinNotFoundError({ lastMatch = null, code = null } = {}) {
  const remembered = lastMatchForJoinCode({ lastMatch, code });
  const upper = code ? String(code).toUpperCase() : null;
  if (remembered || (lastMatch?.lobbyCode && lastMatch.lobbyCode === upper)) {
    return `Still in ${upper} — the match is live. Open My Games or tap Rejoin.`;
  }
  return 'No waiting lobby with that code. If the match already started, open My Games — it stays listed there.';
}

// Guest-facing copy. Idle / missing host is "reconnecting", not "game over".
export function resolveHostReconnectCopy({
  hostPresence = 'online',
  hostName = 'Host',
  gameCode = null,
} = {}) {
  if (!hostPresence || hostPresence === 'online') return null;
  const who = hostName || 'Host';
  const code = gameCode || 'this match';
  if (hostPresence === 'idle') {
    return `${who} is away — stay in ${code}. They can rejoin; the game is still here.`;
  }
  return `${who} is reconnecting — you are still in ${code}. Do not leave.`;
}

export function shouldShowHostReconnect({ hostPresence } = {}) {
  return hostPresence === 'idle' || hostPresence === 'offline';
}

// Session-lost must not dump the game view to home / Create Game (B27).
// Only Exit or confirmed Leave leave the table.
export function shouldLeaveGameView({
  explicitExit = false,
  confirmedLeave = false,
  sessionLost = false,
} = {}) {
  if (explicitExit || confirmedLeave) return true;
  if (sessionLost) return false;
  return false;
}

// Exclusive MP menu cards. Join by Code must never open My Games (B26).
export function resolveMenuCardAction(action) {
  if (action === 'join-by-code' || action === 'join') return 'join-by-code';
  if (action === 'my-games' || action === 'rejoin') return 'my-games';
  if (action === 'create') return 'create';
  if (action === 'browse') return 'browse';
  return null;
}

export function shouldOpenJoinByCode(action) {
  return resolveMenuCardAction(action) === 'join-by-code';
}

export function shouldOpenMyGames(action) {
  return resolveMenuCardAction(action) === 'my-games';
}

// B37: browser autocomplete treated Game Code as a name (BICKFO) and
// the lobby password as a saved login. Off + unique names; never prefill.
// Reload of a signed-in tab must open the live match, not home (B38).
export function shouldAutoResumeLastMatch({
  signedIn = false,
  lastMatch = null,
  explicitExit = false,
} = {}) {
  if (explicitExit) return false;
  if (!signedIn) return false;
  return !!(lastMatch?.gameId || lastMatch?.lobbyCode);
}

// Remembered last match is a resume hint, not a reason to pin the
// branded loader across tile fetches + Firebase restore (boot hang).
export function shouldHoldLoaderForLastMatchResume() {
  return false;
}

// Failed resume of a live code must not dump to Create Game (B38/B40).
// A waiting lobby (B41 / 6V9ZXK) restores the room, not home.
export function resolveResumeFailureView({
  resumed = false,
  lastMatch = null,
} = {}) {
  if (resumed) return 'game';
  if (lastMatch?.gameId) return 'reconnect';
  if (lastMatch?.lobbyCode) return 'lobby';
  return 'home';
}

// Waiting-room dump (B41): same family as B38. Presence/snapshot flicker
// and a discarded-tab restart are not Leave. Only Leave / Sign Out leave.
export function shouldLeaveLobbyView({
  explicitLeave = false,
  confirmedLeave = false,
  sessionLost = false,
  snapshotError = false,
  snapshotMissing = false,
  presenceFlicker = false,
} = {}) {
  if (explicitLeave || confirmedLeave) return true;
  return false;
}

export function shouldNavigateToHome({
  explicitExit = false,
  confirmedSignOut = false,
  lastMatch = null,
  liveLobby = false,
} = {}) {
  if (confirmedSignOut) return true;
  if (liveLobby) return false;
  if (lastMatch?.gameId || lastMatch?.lobbyCode) return false;
  return explicitExit === true;
}

export function shouldClearLobbyOnSnapshotError() {
  return false;
}

export function shouldKeepLastKnownLobby({
  snapshotExists = true,
  snapshotError = false,
  explicitLeave = false,
} = {}) {
  if (explicitLeave) return false;
  if (snapshotError) return true;
  if (!snapshotExists) return true;
  return true;
}

// If the client loses the lobby view, restore the live room — never home.
export function resolveLobbyViewAfterLoss({
  currentLobby = null,
  lastMatch = null,
  explicitLeave = false,
} = {}) {
  if (explicitLeave) return 'home';
  if (currentLobby) return 'lobby';
  if (lastMatch?.gameId) return 'game';
  if (lastMatch?.lobbyCode) return 'lobby';
  return 'reconnect';
}

export function shouldPrefillJoinCodeFromLastMatch() {
  return false;
}

export function joinFormFieldAttrs(kind) {
  if (kind === 'password') {
    return {
      autocomplete: 'off',
      name: 'tr-join-lobby-secret',
    };
  }
  return {
    autocomplete: 'off',
    name: 'tr-join-lobby-code',
    autocorrect: 'off',
    spellcheck: 'false',
  };
}

export function joinFormFieldAttrString(kind) {
  const attrs = joinFormFieldAttrs(kind);
  return Object.entries(attrs)
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');
}

// Still-in-match / sign-in-dropped recovery: Rejoin is the only primary
// join action. Competing Create / Join / Browse must stay hidden until
// the player explicitly dismisses this path. Any live lobby code.
export function shouldBlockCompetingEntryForms({
  rejoinRequired = false,
  dismissed = false,
} = {}) {
  if (dismissed) return false;
  return !!rejoinRequired;
}

export function shouldShowCompetingEntryForms(opts = {}) {
  return !shouldBlockCompetingEntryForms(opts);
}

export function resolveRejoinRecoveryUi({
  rejoinRequired = false,
  dismissed = false,
} = {}) {
  const block = shouldBlockCompetingEntryForms({ rejoinRequired, dismissed });
  return {
    showRejoinCta: !!rejoinRequired && !dismissed,
    showJoinForm: !block,
    showCreateForm: !block,
    showBrowse: !block,
    showDismissEscape: !!rejoinRequired && !dismissed,
  };
}

// A lastMatch stub { id, lobbyCode } cannot hydrate. startMultiplayerGame
// with only those fields is Error 3 / a silent bounce back to reconnect.
export function hasHydratePayload(gameOrLobby = null) {
  if (!gameOrLobby || typeof gameOrLobby !== 'object') return false;
  if (gameOrLobby.state) return true;
  const players = gameOrLobby.lobbyData?.players || gameOrLobby.players;
  return Array.isArray(players) && players.length > 0;
}

export function shouldFetchGameDocBeforeStart({
  game = null,
  gameId = null,
} = {}) {
  if (!gameId && !game?.id) return false;
  return !hasHydratePayload(game);
}

// Boot timeout / Rejoin miss must not paint reconnect on top of a live
// hydrate. In-flight or already-seated is "still joining", not failure.
export function shouldShowReconnectAfterResumeAttempt({
  resumed = false,
  resumeInFlight = false,
  alreadyInGame = false,
  lastMatch = null,
} = {}) {
  if (resumed || resumeInFlight || alreadyInGame) return false;
  return !!(lastMatch?.gameId || lastMatch?.lobbyCode);
}

// "Leave this match" is confirmed Leave — clear the sticky hint.
// Dismissing without confirmation keeps lastMatch (back / cancel).
export function shouldForgetLastMatchOnDismissRejoin({
  confirmedLeave = false,
} = {}) {
  return confirmedLeave === true;
}

// Transient getDoc / token flicker must keep lastMatch so Rejoin retries.
// Forget only when the live doc is gone or no longer joinable.
export function shouldForgetLastMatchOnHydrateFailure({
  gameMissing = false,
  gameFinished = false,
} = {}) {
  return gameMissing === true || gameFinished === true;
}

export function resolveReconnectCopy({
  signedIn = false,
  resumeInFlight = false,
  lobbyCode = null,
} = {}) {
  const code = lobbyCode || 'the match';
  if (resumeInFlight) {
    return {
      title: 'Still in the match',
      detail: `Rejoining ${code}…`,
    };
  }
  if (!signedIn) {
    return {
      title: 'Still in the match',
      detail: 'Sign-in dropped. Rejoin the live game — do not start a new one.',
    };
  }
  return {
    title: 'Still in the match',
    detail: `You are still in ${code}. Rejoin to continue — do not start a new one.`,
  };
}

// One rejoin plan for boot, Rejoin tap, and Play Online. Never start from
// a stub; never treat auth-not-ready as a dead match.
export function resolveRejoinHydratePlan({
  signedIn = false,
  authReady = true,
  lastMatch = null,
  fetchedGame = null,
  fetchedMissing = false,
  joinResult = null,
} = {}) {
  if (!authReady) return { action: 'wait-auth' };
  if (!signedIn) return { action: 'show-auth' };
  if (!lastMatch?.gameId && !lastMatch?.lobbyCode) return { action: 'none' };

  if (fetchedGame) {
    const status = fetchedGame.status;
    if (status && status !== 'active' && status !== 'starting') {
      return { action: 'forget', reason: 'finished' };
    }
    if (hasHydratePayload(fetchedGame) || fetchedGame.id) {
      return { action: 'start-game', gameId: fetchedGame.id };
    }
  }

  if (joinResult?.kind === 'game' && (hasHydratePayload(joinResult.game) || joinResult.gameId)) {
    return { action: 'start-game', gameId: joinResult.gameId || joinResult.game?.id };
  }
  if (joinResult?.kind === 'lobby') return { action: 'show-lobby' };
  if (joinResult?.kind === 'error') {
    return { action: 'error', reason: joinResult.error || 'could-not-hydrate' };
  }

  if (lastMatch.gameId && !fetchedMissing && fetchedGame === null) {
    return { action: 'fetch-game' };
  }
  if (lastMatch.lobbyCode && !joinResult) return { action: 'join-by-code' };
  if (fetchedMissing && lastMatch.lobbyCode && !joinResult) {
    return { action: 'join-by-code' };
  }
  if (fetchedMissing && !lastMatch.lobbyCode) {
    return { action: 'forget', reason: 'missing' };
  }
  return { action: 'error', reason: 'could-not-hydrate' };
}

// Same game already hydrating or seated — do not construct a second GameState.
export function shouldReuseInFlightMultiplayerStart({
  startingGameId = null,
  requestedGameId = null,
  alreadyInGame = false,
  seatedGameId = null,
} = {}) {
  if (!requestedGameId) return false;
  if (alreadyInGame && seatedGameId === requestedGameId) return true;
  return startingGameId === requestedGameId;
}
