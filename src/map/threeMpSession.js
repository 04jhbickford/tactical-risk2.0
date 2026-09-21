// New UX multiplayer — same Firebase / lobbyManager / syncManager as Classic.
// Presentation only. Do not fork rules.

import { initializeFirebase, isFirebaseConfigured, getFirebaseDb } from '../multiplayer/firebase.js';
import { getAuthManager } from '../multiplayer/auth.js';
import { getLobbyManager } from '../multiplayer/lobbyManager.js';
import { getPresenceManager } from '../multiplayer/presenceManager.js';
import { createSyncManager } from '../multiplayer/syncManager.js';
import { createMultiplayerGuard } from '../multiplayer/multiplayerGuard.js';
import {
  createGameEventLog,
  bindGameEventLog,
  unbindGameEventLog,
  createFirestoreEventWriter,
} from '../multiplayer/gameEventLog.js';
import { AuthScreen } from '../ui/authScreen.js';
import { GameState } from '../state/gameState.js';
import { rememberLastMatch } from '../multiplayer/lastMatch.js';
import { resolveIsHost } from '../multiplayer/hostHandoff.js';
import { FACTION_COLORS } from '../ui/lobby.js';
import { parseDiscordSeatInput, readRememberedDiscordSeat, rememberDiscordSeat } from '../multiplayer/discordTurnPing.js';
import {
  isRealAuthIdentity,
  resolveAuthSurface,
  resumeAuthEvent,
  shouldRefreshTokenOnResume,
} from '../multiplayer/authSession.js';

export function createThreeMpSession({ setup, territories, continents }) {
  let ready = false;
  let authScreen = null;
  let unsubscribeLobby = null;
  let syncManager = null;
  let guard = null;
  const listeners = [];

  function notify(kind, payload) {
    for (const fn of listeners) fn(kind, payload);
  }

  function subscribe(fn) {
    listeners.push(fn);
    return () => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  async function ensure() {
    if (ready) return { ok: true };
    if (!isFirebaseConfigured()) {
      return { ok: false, error: 'Firebase is not configured on this build.' };
    }
    initializeFirebase();
    const auth = getAuthManager();
    const lobby = getLobbyManager();
    auth.initialize();
    lobby.initialize();
    getPresenceManager();
    const quietResume = (event, extra = {}) => {
      if (!shouldRefreshTokenOnResume({ event: resumeAuthEvent(event, extra) })) return;
      auth.refreshSessionQuietly?.();
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') quietResume('visible');
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', (ev) => quietResume('visible', { persisted: !!ev.persisted }));
      window.addEventListener('online', () => quietResume('online'));
    }
    ready = true;
    return { ok: true };
  }

  async function restoreSession() {
    const gate = await ensure();
    if (!gate.ok) return gate;
    const auth = getAuthManager();
    try { await auth.whenReady(); } catch { /* keep going */ }
    return { ok: true, user: auth.getUser(), surface: authSurface() };
  }

  function authSurface() {
    const auth = getAuthManager();
    return resolveAuthSurface({
      authReady: auth.isAuthReady(),
      user: auth.getUser(),
    });
  }

  function ensureAuth(onUser) {
    const auth = getAuthManager();
    const proceed = async () => {
      if (!auth.isAuthReady()) {
        try { await auth.whenReady(); } catch { /* keep going */ }
      }
      const user = auth.getUser();
      if (isRealAuthIdentity(user)) {
        onUser(user);
        return;
      }
      if (!authScreen) {
        authScreen = new AuthScreen((next) => {
          authScreen.hide();
          onUser(isRealAuthIdentity(next) ? next : null);
        });
      } else {
        authScreen.onComplete = (next) => {
          authScreen.hide();
          onUser(isRealAuthIdentity(next) ? next : null);
        };
      }
      authScreen.show();
    };
    void proceed();
  }

  function bindLobby() {
    if (unsubscribeLobby) return;
    const lobby = getLobbyManager();
    unsubscribeLobby = lobby.subscribe((doc) => {
      notify('lobby', { lobby: doc });
      if (doc?.status === 'starting' && doc.gameId) {
        notify('starting', { gameId: doc.gameId, lobby: doc });
      }
    });
  }

  async function createGame({ name, maxPlayers = 5, startingIPCs = 80, password = null } = {}) {
    const gate = await ensure();
    if (!gate.ok) return gate;
    return new Promise((resolve) => {
      ensureAuth(async (user) => {
        if (!user) {
          resolve({ ok: false, error: 'Sign-in required' });
          return;
        }
        bindLobby();
        const result = await getLobbyManager().createLobby(name, {
          maxPlayers,
          startingIPCs,
          password: password || null,
          teamsEnabled: false,
        });
        if (!result.success) {
          resolve({ ok: false, error: result.error || 'Create failed' });
          return;
        }
        await applyRememberedDiscord();
        notify('lobby', { lobby: getLobbyManager().currentLobby });
        resolve({ ok: true, lobby: getLobbyManager().currentLobby });
      });
    });
  }

  async function joinGame({ code, password = null } = {}) {
    const gate = await ensure();
    if (!gate.ok) return gate;
    return new Promise((resolve) => {
      ensureAuth(async (user) => {
        if (!user) {
          resolve({ ok: false, error: 'Sign-in required' });
          return;
        }
        bindLobby();
        const result = await getLobbyManager().joinLobby(String(code || '').toUpperCase(), password || null);
        if (!result.success) {
          resolve({ ok: false, error: result.error || 'Join failed' });
          return;
        }
        if (result.isGame) {
          notify('starting', { gameId: result.gameId, lobby: result.game });
          resolve({ ok: true, started: true, gameId: result.gameId, game: result.game });
          return;
        }
        await applyRememberedDiscord();
        notify('lobby', { lobby: getLobbyManager().currentLobby });
        resolve({ ok: true, lobby: getLobbyManager().currentLobby });
      });
    });
  }

  async function applyRememberedDiscord() {
    const remembered = readRememberedDiscordSeat();
    if (!remembered.discordUserId && !remembered.discordName) return;
    const me = getLobbyManager().getCurrentPlayer?.() || null;
    if (me?.isAI) return;
    if (me?.discordUserId || me?.discordName) return;
    await getLobbyManager().updatePlayer(remembered);
  }

  async function setDiscord(raw) {
    const fields = parseDiscordSeatInput(raw);
    rememberDiscordSeat(fields);
    return getLobbyManager().updatePlayer(fields);
  }

  async function pickFaction(factionId, color) {
    const lobby = getLobbyManager();
    const swatch = FACTION_COLORS.find((c) => c.color === color) || FACTION_COLORS[0];
    return lobby.selectFaction(factionId, color || swatch.color);
  }

  async function addAi(difficulty, factionId, color) {
    const lobby = getLobbyManager();
    const swatch = FACTION_COLORS.find((c) => c.id === 'gray') || FACTION_COLORS[0];
    return lobby.addAIPlayer(difficulty, factionId, color || swatch.color);
  }

  async function startRoom() {
    const result = await getLobbyManager().startGame();
    if (!result.success) return { ok: false, error: result.error || 'Start failed' };
    notify('starting', { gameId: result.gameId, lobby: getLobbyManager().currentLobby });
    return { ok: true, gameId: result.gameId };
  }

  async function startMatch(gameId, incoming) {
    const auth = getAuthManager();
    const user = auth.getUser();
    const lobbyData = incoming || getLobbyManager().currentLobby;
    const playersData = lobbyData?.lobbyData?.players || lobbyData?.players;
    const settingsData = lobbyData?.lobbyData?.settings || lobbyData?.settings;
    const code = lobbyData?.code || lobbyData?.lobbyCode || lobbyData?.lobbyData?.code;

    rememberLastMatch({
      gameId,
      lobbyCode: code,
      hostName: (playersData || []).find((p) => p.isHost)?.displayName || null,
    });

    const gameState = new GameState(setup, territories, continents);
    gameState.isMultiplayer = true;
    gameState.localUserId = user?.id || null;

    syncManager = createSyncManager(gameId, gameState);
    unbindGameEventLog();
    const gameEventLog = createGameEventLog({
      gameId,
      gameState,
      lobbyCode: code,
      getWriterUid: () => user?.id || null,
      writer: createFirestoreEventWriter({ getDb: getFirebaseDb }),
    });
    bindGameEventLog(gameEventLog);

    const isHost = resolveIsHost({
      userId: user?.id,
      lobbyData: lobbyData?.lobbyData || lobbyData,
      players: playersData,
      hostId: lobbyData?.hostId || lobbyData?.lobbyData?.hostId || null,
    });
    syncManager.setIsHost(isHost);

    const hasExistingState = lobbyData?.stateVersion > 0 && lobbyData?.state;
    const shouldInitialize = lobbyData?.startedBy
      ? lobbyData.startedBy === user?.id
      : isHost;

    if (hasExistingState) {
      const loaded = await syncManager.startSync();
      if (!loaded) return { ok: false, error: 'Could not load game state' };
    } else if (shouldInitialize && playersData) {
      const players = playersData.map((p) => {
        const factionDef = setup.risk.factions.find((f) => f.id === p.factionId) || {};
        return {
          ...factionDef,
          id: p.factionId,
          name: p.displayName,
          color: p.color || factionDef?.color,
          lightColor: p.color || factionDef?.lightColor,
          isAI: p.isAI || false,
          aiDifficulty: p.aiDifficulty || null,
          oderId: p.oderId,
          discordUserId: p.discordUserId || '',
          discordName: p.discordName || '',
        };
      });
      gameState.initGame('risk', players, {
        alliancesEnabled: false,
        teamsEnabled: settingsData?.teamsEnabled || false,
        startingIPCs: settingsData?.startingIPCs || 80,
        isMultiplayer: true,
      });
      const pushed = await syncManager.forcePush(true);
      if (!pushed) return { ok: false, error: 'Could not save initial game state' };
      await syncManager.startSync();
    } else {
      const loaded = await syncManager.startSyncAndWaitForState();
      if (!loaded) return { ok: false, error: 'Timed out waiting for host' };
    }

    guard = createMultiplayerGuard(syncManager);
    guard.wrapGameState(gameState);
    gameState.syncManager = syncManager;
    gameState.localUserId = user?.id || null;

    return {
      ok: true,
      gameState,
      syncManager,
      isHost,
      localUserId: user?.id || null,
    };
  }

  function currentLobby() {
    return getLobbyManager().currentLobby;
  }

  // Leave the room VIEW without deleting the Firestore lobby (host Back).
  function detachLobby() {
    if (unsubscribeLobby) {
      unsubscribeLobby();
      unsubscribeLobby = null;
    }
    getLobbyManager().disconnectFromLobby({ notify: false });
  }

  function localUser() {
    const user = getAuthManager().getUser();
    return isRealAuthIdentity(user) ? user : null;
  }

  async function signOut() {
    const auth = getAuthManager();
    return auth.signOut({ confirmed: true });
  }

  function isHostUser() {
    const user = localUser();
    const lobby = currentLobby();
    return !!(user && lobby && lobby.hostId === user.id);
  }

  return {
    ensure,
    ensureAuth,
    restoreSession,
    authSurface,
    signOut,
    createGame,
    joinGame,
    pickFaction,
    setDiscord,
    addAi,
    startRoom,
    startMatch,
    subscribe,
    currentLobby,
    detachLobby,
    localUser,
    localUserId: () => localUser()?.id || null,
    isHostUser,
    get syncManager() { return syncManager; },
  };
}
