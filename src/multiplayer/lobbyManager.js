// Lobby Manager for Tactical Risk multiplayer
// Handles create/join/ready/start lobby flow

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  runTransaction
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFirebaseDb } from './firebase.js';
import { getAuthManager } from './auth.js';
import { possessivePhrase } from '../utils/possessive.js';
import {
  mergeMyActiveGames,
  resolveJoinByCode,
  shouldDeleteLobbyOnHostLeave,
  shouldReconnectToGame,
} from './presencePolicy.js';
import {
  lastMatchForJoinCode,
  readLastMatch,
  rememberLastMatch,
  forgetLastMatch,
  recoverMyGamesOnLoad,
  resolveJoinNotFoundError,
  resolveSameMatchResume,
  differentGameBlockMessage,
  gameDocMatchesLobbyCode,
  shouldClearLobbyOnSnapshotError,
  shouldKeepLastKnownLobby,
  hasHydratePayload,
  resolveRejoinHydratePlan,
  lastMatchFromLobbySnapshot,
  buildMyGamesBoard,
} from './lastMatch.js';
import { lobbyAppearsInOpenGames, resolveStartGameTarget } from './lobbyStart.js';
import {
  addLobbyAISeat,
  joinLobbySeat,
  patchLobbySeat,
  removeLobbyAISeat,
  removeLobbyHumanSeat,
  startGameRoster,
  transferLobbyHost,
} from './lobbySeats.js';
import { readRememberedDiscordSeat } from './discordTurnPing.js';
import { buildHumanLobbySeat, shouldApplyDiscordWrite } from './discordSeat.js';

// Generate a random 6-character lobby code
function generateLobbyCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars like 0/O, 1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export class LobbyManager {
  constructor() {
    this.db = null;
    this.authManager = null;
    this.currentLobby = null;
    this.lobbyUnsubscribe = null;
    this._listenerErrored = false;
    this._listeners = [];
  }

  initialize() {
    this.db = getFirebaseDb();
    this.authManager = getAuthManager();
  }

  // Subscribe to lobby changes
  subscribe(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(cb => cb !== callback);
    };
  }

  _notifyListeners() {
    for (const cb of this._listeners) {
      cb(this.currentLobby);
    }
  }

  // Create a new lobby
  async createLobby(name, settings = {}) {
    if (!this.db) return { success: false, error: 'Not connected' };

    const user = this.authManager.getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    // Generate lobby code — collision probability is negligible (~1 billion combinations)
    // so we skip the Firestore uniqueness pre-check entirely
    const code = generateLobbyCode();

    const lobbyId = `lobby_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const lobbyData = {
      code,
      hostId: user.id,
      name: name || possessivePhrase(user.displayName, 'Game'),
      password: settings.password || null,
      status: 'waiting', // 'waiting', 'starting', 'in_progress', 'finished'
      isPublished: false, // Lobby not visible in Open Games until host clicks "Create Game"
      settings: {
        maxPlayers: settings.maxPlayers || 5,
        startingIPCs: settings.startingIPCs || 80,
        teamsEnabled: settings.teamsEnabled || false
      },
      players: [buildHumanLobbySeat({
        user,
        isHost: true,
        remembered: readRememberedDiscordSeat(),
      })],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(this.db, 'lobbies', lobbyId), lobbyData);
      rememberLastMatch({
        lobbyCode: code,
        hostName: user.displayName,
      });
      this._subscribeToLobby(lobbyId);
      return { success: true, lobbyId, code };
    } catch (error) {
      console.error('Error creating lobby:', error);
      return { success: false, error: error.message };
    }
  }

  // Find lobby by code
  async _findLobbyByCode(code) {
    // Query only on 'code' — compound queries (code + status) require a composite
    // Firestore index that may not be configured. Filter status client-side instead.
    const q = query(
      collection(this.db, 'lobbies'),
      where('code', '==', code.toUpperCase())
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    const waiting = snapshot.docs.find(d => d.data().status === 'waiting');
    if (waiting) return { id: waiting.id, ...waiting.data() };
    const any = snapshot.docs[0];
    return any ? { id: any.id, ...any.data() } : null;
  }

  // Find game by lobby code (for rejoining started games)
  async findGameByCode(code) {
    // Single-field queries only — compound (lobbyCode + status) needs an index.
    const upper = code.toUpperCase();
    const pick = (snapshot) => {
      if (!snapshot || snapshot.empty) return null;
      const active = snapshot.docs.find(d => ['starting', 'active'].includes(d.data().status))
        || snapshot.docs[0];
      return active ? { id: active.id, ...active.data() } : null;
    };
    try {
      const byLobbyCode = await getDocs(query(
        collection(this.db, 'games'),
        where('lobbyCode', '==', upper)
      ));
      const found = pick(byLobbyCode);
      if (found) return found;
      const byCode = await getDocs(query(
        collection(this.db, 'games'),
        where('code', '==', upper)
      ));
      return pick(byCode);
    } catch (error) {
      console.error('Error finding game by code:', error);
      return null;
    }
  }

  async getGameById(gameId) {
    const result = await this._loadGameById(gameId);
    return result.game || null;
  }

  async _loadGameById(gameId) {
    if (!this.db || !gameId) return { game: null, missing: !gameId };
    try {
      const snap = await getDoc(doc(this.db, 'games', gameId));
      if (!snap.exists()) return { game: null, missing: true };
      return { game: { id: snap.id, ...snap.data() }, missing: false };
    } catch (error) {
      console.error('Error loading game by id:', error);
      return { game: null, missing: false, error: error.message };
    }
  }

  // Seat list (playerUserIds), not the lobbyCode query. Same-match Rejoin
  // uses this when the code lookup misses. A different code stays blocked
  // until Leave clears lastMatch.
  async _lookupSameMatch(code, intent) {
    let seatedGames = [];
    try {
      seatedGames = await this.getMyActiveGames();
    } catch (error) {
      console.warn('[LobbyManager] seated-game lookup failed', error);
      seatedGames = [];
    }
    return resolveSameMatchResume({
      requestedCode: code || null,
      lastMatch: readLastMatch(),
      seatedGames,
      intent: intent || 'rejoin',
    });
  }

  // Boot / Rejoin / Play Online: fetch a live doc, never start from a stub.
  async hydrateLastMatch(lastMatch = readLastMatch()) {
    const user = this.authManager.getUser();
    const plan = resolveRejoinHydratePlan({
      signedIn: !!user,
      authReady: this.authManager.isAuthReady(),
      lastMatch,
    });
    if (plan.action === 'wait-auth' || plan.action === 'show-auth' || plan.action === 'none') {
      return { kind: plan.action };
    }

    let fetchedGame = null;
    let fetchedMissing = false;
    if (lastMatch?.gameId) {
      const loaded = await this._loadGameById(lastMatch.gameId);
      fetchedGame = loaded.game;
      fetchedMissing = loaded.missing === true;
      if (!fetchedGame && !fetchedMissing && loaded.error) {
        if (lastMatch.lobbyCode) {
          fetchedGame = await this.findGameByCode(lastMatch.lobbyCode);
        }
        if (!fetchedGame) {
          const seatedOnError = await this._lookupSameMatch(lastMatch.lobbyCode, 'rejoin');
          if (seatedOnError?.action === 'resume' && seatedOnError.game?.id) {
            return { kind: 'game', gameId: seatedOnError.game.id, game: seatedOnError.game };
          }
          return { kind: 'error', error: loaded.error || 'Could not load the live match.' };
        }
      }
    }
    if (!fetchedGame && lastMatch?.lobbyCode) {
      fetchedGame = await this.findGameByCode(lastMatch.lobbyCode);
      if (fetchedGame) fetchedMissing = false;
    }

    const joinable = fetchedGame && (
      !fetchedGame.status
      || shouldReconnectToGame({ exists: true, status: fetchedGame.status })
    );
    const wantCode = lastMatch?.lobbyCode || null;
    const codeMismatch = !!(
      joinable
      && wantCode
      && !gameDocMatchesLobbyCode(fetchedGame, wantCode)
      && (fetchedGame.lobbyCode || fetchedGame.code || fetchedGame.lobbyData?.code)
    );
    if (joinable && !codeMismatch) {
      return { kind: 'game', gameId: fetchedGame.id, game: fetchedGame };
    }

    // Code query missed, the remembered id is a different match, or that
    // doc is finished. The player may still be seated in the requested code.
    const seated = await this._lookupSameMatch(wantCode, 'rejoin');
    if (seated?.action === 'resume' && seated.game?.id) {
      return { kind: 'game', gameId: seated.game.id, game: seated.game };
    }

    if (fetchedGame && !codeMismatch) {
      return { kind: 'finished', game: fetchedGame, error: 'That game is no longer active.' };
    }

    if (lastMatch?.lobbyCode) {
      const result = await this.joinLobby(lastMatch.lobbyCode, null);
      if (result.success && result.isGame) {
        if (!hasHydratePayload(result.game) && result.gameId) {
          const again = await this.getGameById(result.gameId);
          if (again) {
            return { kind: 'game', gameId: again.id, game: again };
          }
        }
        return { kind: 'game', gameId: result.gameId, game: result.game };
      }
      if (result.success) return { kind: 'lobby' };
      return { kind: 'error', error: result.error || 'Could not rejoin.' };
    }

    if (fetchedMissing) {
      return { kind: 'missing', error: 'Could not find the live match.' };
    }
    return { kind: 'error', error: 'Could not rejoin the live match.' };
  }

  // Get all open public lobbies (no password, waiting status)
  async getOpenLobbies() {
    if (!this.db) return [];

    const user = this.authManager.getUser();
    const userId = user?.id;

    try {
      const q = query(
        collection(this.db, 'lobbies'),
        where('status', '==', 'waiting')
      );
      const snapshot = await getDocs(q);

      // Filter to only public lobbies (no password), published, and not full
      // EXCEPT: always show user's own lobbies (even if full)
      const lobbies = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const isOwnLobby = data.players?.some(p => p.oderId === userId);
        if (lobbyAppearsInOpenGames({
          isPublished: data.isPublished,
          password: data.password,
          playerCount: data.players.length,
          maxPlayers: data.settings.maxPlayers,
          isOwnLobby,
        })) {
          lobbies.push({ id: doc.id, ...data });
        }
      });

      return lobbies;
    } catch (error) {
      console.error('Error getting open lobbies:', error);
      return [];
    }
  }

  // Get the current user's own games that are in progress (for the Open Games
  // screen — a started game is no longer a 'waiting' lobby, so without this it
  // would silently vanish from the list even though the player is in it)
  async getMyActiveGames() {
    if (!this.db) return [];

    const user = this.authManager.getUser();
    if (!user) return [];

    try {
      // Equality / array-contains only — no compound `in` (empty indexes.json).
      const gamesRef = collection(this.db, 'games');
      const [seatSnap, starterSnap] = await Promise.all([
        getDocs(query(gamesRef, where('playerUserIds', 'array-contains', user.id))),
        getDocs(query(gamesRef, where('startedBy', '==', user.id))),
      ]);
      let games = mergeMyActiveGames({
        bySeat: seatSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        byStarter: starterSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        userId: user.id,
      });
      const remembered = readLastMatch();
      let lastGame = null;
      if (remembered?.gameId && !games.some(g => g.id === remembered.gameId)) {
        lastGame = await this.getGameById(remembered.gameId);
      }
      games = recoverMyGamesOnLoad({
        games,
        lastMatchGame: lastGame,
        lastMatch: remembered,
      });
      games.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() || 0;
        const bTime = b.updatedAt?.toMillis?.() || 0;
        return bTime - aTime;
      });
      return games;
    } catch (error) {
      console.error('Error getting my active games:', error);
      const remembered = readLastMatch();
      let lastGame = null;
      if (remembered?.gameId) {
        lastGame = await this.getGameById(remembered.gameId);
      }
      return recoverMyGamesOnLoad({
        games: [],
        lastMatchGame: lastGame,
        lastMatch: remembered,
      });
    }
  }

  // My Games rows for Classic and Experimental. Waiting lobbies stay rooms.
  async listMyGamesBoard() {
    if (!this.db) return [];
    const user = this.authManager.getUser();
    if (!user) return [];
    const games = await this.getMyActiveGames();
    let waiting = [];
    try {
      const snap = await getDocs(query(
        collection(this.db, 'lobbies'),
        where('status', '==', 'waiting'),
      ));
      waiting = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((l) => l.players?.some((p) => p.oderId === user.id));
    } catch (error) {
      console.warn('Error listing waiting lobbies', error);
    }
    return buildMyGamesBoard({ games, waitingLobbies: waiting });
  }

  // Join a lobby by code (or rejoin a started game by code)
  async joinLobby(code, password = null) {
    if (!this.db) return { success: false, error: 'Not connected' };

    const user = this.authManager.getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const lobbyDoc = await this._findLobbyByCode(code);
    let game = await this.findGameByCode(code);
    if (!game && lobbyDoc?.gameId) {
      game = await this.getGameById(lobbyDoc.gameId);
    }
    const remembered = lastMatchForJoinCode({ lastMatch: readLastMatch(), code });
    if (!game && remembered?.gameId) {
      game = await this.getGameById(remembered.gameId);
    }
    const waitingLobby = lobbyDoc?.status === 'waiting' ? lobbyDoc : null;
    const resolved = resolveJoinByCode({
      waitingLobby,
      anyLobby: lobbyDoc,
      startedGame: game,
      userId: user.id,
      rememberedGameId: remembered?.gameId || null,
    });
    if (resolved.kind === 'game') {
      let gameDoc = resolved.game;
      if (!hasHydratePayload(gameDoc) && gameDoc?.id) {
        gameDoc = await this.getGameById(gameDoc.id) || gameDoc;
      }
      return { success: true, isGame: true, gameId: gameDoc.id, game: gameDoc };
    }
    if (resolved.kind === 'started-lobby') {
      if (!game && resolved.lobby?.gameId) {
        game = await this.getGameById(resolved.lobby.gameId);
      }
      if (game) {
        return { success: true, isGame: true, gameId: game.id, game };
      }
      return { success: false, error: 'Game already started' };
    }
    if (resolved.kind === 'not-found') {
      const seated = await this._lookupSameMatch(code, 'join-code');
      if (seated?.action === 'resume' && seated.game?.id) {
        return { success: true, isGame: true, gameId: seated.game.id, game: seated.game };
      }
      if (seated?.action === 'block-other') {
        return { success: false, error: differentGameBlockMessage(seated.code) };
      }
      if (remembered?.gameId) {
        const fetched = await this.getGameById(remembered.gameId);
        if (fetched && (!fetched.status || shouldReconnectToGame({
          exists: true,
          status: fetched.status,
        }))) {
          return { success: true, isGame: true, gameId: fetched.id, game: fetched };
        }
        const again = await this._lookupSameMatch(code, 'rejoin');
        if (again?.action === 'resume' && again.game?.id) {
          return { success: true, isGame: true, gameId: again.game.id, game: again.game };
        }
        if (fetched) {
          return { success: true, isGame: true, gameId: fetched.id, game: fetched };
        }
        return {
          success: true,
          isGame: true,
          gameId: remembered.gameId,
          game: { id: remembered.gameId, lobbyCode: code.toUpperCase() },
        };
      }
      return {
        success: false,
        error: resolveJoinNotFoundError({ lastMatch: remembered, code }),
      };
    }
    const lobby = resolved.lobby;

    // Check password
    if (lobby.password && lobby.password !== password) {
      return { success: false, error: 'Incorrect password' };
    }

    // Check if already in lobby
    if (lobby.players.some(p => p.oderId === user.id)) {
      this.currentLobby = lobby;
      const remembered = lastMatchFromLobbySnapshot(lobby);
      if (remembered) rememberLastMatch(remembered);
      this._subscribeToLobby(lobby.id);
      this._notifyListeners();
      return { success: true, lobbyId: lobby.id, lobby };
    }

    // Check if full
    if (lobby.players.length >= lobby.settings.maxPlayers) {
      return { success: false, error: 'Lobby is full' };
    }

    // Add player. An existing seat is left as-is here; the waiting-lobby
    // view writes the remembered Discord name once if that seat is empty.
    const newPlayer = buildHumanLobbySeat({
      user,
      isHost: false,
      remembered: readRememberedDiscordSeat(),
    });

    console.log('[LobbyManager] Player joining lobby:', {
      oderId: user.id,
      displayName: user.displayName,
      lobbyId: lobby.id
    });

    try {
      const lobbyRef = doc(this.db, 'lobbies', lobby.id);
      const outcome = await runTransaction(this.db, async (transaction) => {
        const snap = await transaction.get(lobbyRef);
        if (!snap.exists()) return { success: false, error: 'Lobby not found' };
        const live = snap.data();
        if (live.status && live.status !== 'waiting') {
          return { success: false, started: true, gameId: live.gameId || null };
        }
        const seated = joinLobbySeat({
          players: live.players,
          newPlayer,
          maxPlayers: live.settings?.maxPlayers,
        });
        if (!seated.ok) return { success: false, error: seated.error };
        if (!seated.alreadySeated) {
          transaction.update(lobbyRef, {
            players: seated.players,
            updatedAt: serverTimestamp(),
          });
        }
        return {
          success: true,
          players: seated.players,
          code: live.code,
          hostName: seated.players.find((p) => p.isHost)?.displayName || null,
        };
      });
      if (outcome?.started) {
        let game = outcome.gameId ? await this.getGameById(outcome.gameId) : null;
        if (!game) game = await this.findGameByCode(code);
        if (game) {
          return { success: true, isGame: true, gameId: game.id, game };
        }
        return { success: false, error: 'Game already started' };
      }
      if (!outcome?.success) {
        return { success: false, error: outcome?.error || 'Could not join lobby' };
      }
      this.currentLobby = { ...lobby, players: outcome.players, code: outcome.code || lobby.code };
      const remembered = lastMatchFromLobbySnapshot(this.currentLobby);
      if (remembered) rememberLastMatch(remembered);
      this._subscribeToLobby(lobby.id);
      console.log('[LobbyManager] Player successfully joined lobby');
      return { success: true, lobbyId: lobby.id };
    } catch (error) {
      console.error('Error joining lobby:', error);
      return { success: false, error: error.message };
    }
  }

  // Leave a waiting lobby from My Games without joining it first.
  async leaveListedLobby(lobbyOrId) {
    const lobbyId = typeof lobbyOrId === 'string' ? lobbyOrId : lobbyOrId?.id;
    if (!lobbyId) return { success: false, error: 'Lobby not found' };
    let lobby = typeof lobbyOrId === 'object' && lobbyOrId?.players ? lobbyOrId : null;
    if (!lobby) {
      try {
        const snap = await getDoc(doc(this.db, 'lobbies', lobbyId));
        if (!snap.exists()) return { success: true };
        lobby = { id: snap.id, ...snap.data() };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    const result = await this._removeUserFromLobbyDoc(lobby);
    if (result.success && this.currentLobby?.id === lobbyId) {
      if (this.lobbyUnsubscribe) {
        this.lobbyUnsubscribe();
        this.lobbyUnsubscribe = null;
      }
      this.currentLobby = null;
      this._notifyListeners();
    }
    const remembered = readLastMatch();
    if (result.success && remembered?.lobbyCode && remembered.lobbyCode === lobby.code) {
      forgetLastMatch();
    }
    return result;
  }

  // Leave current lobby
  async leaveLobby() {
    if (!this.currentLobby) return { success: true };

    const user = this.authManager.getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const lobby = this.currentLobby;

    // Unsubscribe first
    if (this.lobbyUnsubscribe) {
      this.lobbyUnsubscribe();
      this.lobbyUnsubscribe = null;
    }
    this.currentLobby = null;
    forgetLastMatch();

    const result = await this._removeUserFromLobbyDoc(lobby);
    this._notifyListeners();
    return result;
  }

  async _removeUserFromLobbyDoc(lobby) {
    const user = this.authManager.getUser();
    if (!user) return { success: false, error: 'Not logged in' };
    if (!lobby?.id) return { success: false, error: 'Lobby not found' };

    const lobbyId = lobby.id;
    const lobbyRef = doc(this.db, 'lobbies', lobbyId);

    try {
      const outcome = await runTransaction(this.db, async (transaction) => {
        const snap = await transaction.get(lobbyRef);
        if (!snap.exists()) return { success: true, missing: true };
        const live = snap.data();
        const isHost = live.hostId === user.id;

        if (isHost) {
          const transferred = transferLobbyHost({
            players: live.players,
            leavingUserId: user.id,
          });
          if (!transferred.nextHost) {
            if (!shouldDeleteLobbyOnHostLeave({
              lobbyStatus: live.status,
              remainingHumans: 0,
            })) {
              return { success: true };
            }
            transaction.delete(lobbyRef);
            return { success: true, deleted: true };
          }
          transaction.update(lobbyRef, {
            hostId: transferred.nextHost.oderId,
            players: transferred.players,
            updatedAt: serverTimestamp(),
          });
          return { success: true, players: transferred.players };
        }

        const remaining = removeLobbyHumanSeat({
          players: live.players,
          userId: user.id,
        });
        transaction.update(lobbyRef, {
          players: remaining.players,
          updatedAt: serverTimestamp(),
        });
        return { success: true, players: remaining.players };
      });
      if (outcome?.players) this._patchCurrentLobby(lobbyId, { players: outcome.players });
      return { success: true };
    } catch (error) {
      console.error('Error leaving lobby:', error);
      return { success: false, error: error.message };
    }
  }

  // Discord name only. onlyIfEmpty is the automatic re-entry prefill.
  // isStale() is checked again inside the transaction so a clear typed
  // while the prefill is in flight is not overwritten on retry.
  async updateDiscordSeat(fields, { onlyIfEmpty = false, isStale = null } = {}) {
    const stale = () => (typeof isStale === 'function' ? !!isStale() : false);
    if (stale()) return { success: true, skipped: true };
    if (!this.currentLobby) return { success: false, error: 'Not in lobby' };

    const user = this.authManager.getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const lobbyId = this.currentLobby.id;
    const lobbyRef = doc(this.db, 'lobbies', lobbyId);
    const discordFields = {
      discordUserId: fields?.discordUserId || '',
      discordName: fields?.discordName || '',
    };

    try {
      const outcome = await runTransaction(this.db, async (transaction) => {
        const snap = await transaction.get(lobbyRef);
        if (!snap.exists()) return { success: false, error: 'Lobby not found' };
        const players = snap.data().players;
        const mine = (players || []).find((p) => p && p.oderId === user.id) || null;
        // startedRev 0 / currentRev 1 marks a user edit that landed after
        // this write was queued. onlyIfEmpty refuses a seat that already
        // has a Discord name.
        if (!shouldApplyDiscordWrite({
          startedRev: 0,
          currentRev: stale() ? 1 : 0,
          onlyIfEmpty,
          seat: mine,
        })) {
          return { success: true, skipped: true, players };
        }
        const patched = patchLobbySeat({
          players,
          userId: user.id,
          updates: discordFields,
        });
        if (!patched.ok) return { success: false, error: patched.error };
        transaction.update(lobbyRef, {
          players: patched.players,
          updatedAt: serverTimestamp(),
        });
        return { success: true, players: patched.players };
      });
      if (!outcome?.success) return { success: false, error: outcome?.error || 'Not in lobby' };
      if (!outcome.skipped && outcome.players) {
        this._patchCurrentLobby(lobbyId, { players: outcome.players });
      }
      return { success: true, skipped: !!outcome.skipped };
    } catch (error) {
      console.error('Error updating discord seat:', error);
      return { success: false, error: error.message };
    }
  }

  // Update player settings (faction, color, ready status)
  async updatePlayer(updates) {
    if (!this.currentLobby) return { success: false, error: 'Not in lobby' };

    const user = this.authManager.getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const lobbyId = this.currentLobby.id;
    const lobbyRef = doc(this.db, 'lobbies', lobbyId);

    try {
      const outcome = await runTransaction(this.db, async (transaction) => {
        const snap = await transaction.get(lobbyRef);
        if (!snap.exists()) return { success: false, error: 'Lobby not found' };
        const patched = patchLobbySeat({
          players: snap.data().players,
          userId: user.id,
          updates,
        });
        if (!patched.ok) return { success: false, error: patched.error };
        transaction.update(lobbyRef, {
          players: patched.players,
          updatedAt: serverTimestamp(),
        });
        return { success: true, players: patched.players };
      });
      if (!outcome?.success) return { success: false, error: outcome?.error || 'Not in lobby' };
      this._patchCurrentLobby(lobbyId, { players: outcome.players });
      return { success: true };
    } catch (error) {
      console.error('Error updating player:', error);
      return { success: false, error: error.message };
    }
  }

  // Toggle ready status
  async toggleReady() {
    if (!this.currentLobby) return { success: false, error: 'Not in lobby' };

    const user = this.authManager.getUser();
    const player = this.currentLobby.players.find(p => p.oderId === user.id);
    if (!player) return { success: false, error: 'Not in lobby' };

    return this.updatePlayer({ isReady: !player.isReady });
  }

  // Select faction
  async selectFaction(factionId, color) {
    return this.updatePlayer({ factionId, color });
  }

  // Update lobby settings (host only)
  async updateSettings(updates) {
    if (!this.currentLobby) return { success: false, error: 'Not in lobby' };

    const user = this.authManager.getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    // Only host can update settings
    if (this.currentLobby.hostId !== user.id) {
      return { success: false, error: 'Only host can update settings' };
    }

    const newSettings = {
      ...this.currentLobby.settings,
      ...updates
    };

    try {
      await updateDoc(doc(this.db, 'lobbies', this.currentLobby.id), {
        settings: newSettings,
        updatedAt: serverTimestamp()
      });
      return { success: true };
    } catch (error) {
      console.error('Error updating settings:', error);
      return { success: false, error: error.message };
    }
  }

  // Add AI player (host only)
  async addAIPlayer(difficulty, factionId, color) {
    if (!this.currentLobby) return { success: false, error: 'Not in lobby' };

    const user = this.authManager.getUser();
    if (this.currentLobby.hostId !== user.id) {
      return { success: false, error: 'Only host can add AI' };
    }

    const aiId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const difficultyNames = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

    const aiPlayer = {
      oderId: aiId,
      displayName: `${difficultyNames[difficulty] || 'AI'} Bot`,
      factionId,
      color,
      isReady: true, // AI is always ready
      isHost: false,
      isAI: true,
      aiDifficulty: difficulty,
      joinedAt: Date.now()
    };

    const lobbyId = this.currentLobby.id;
    const lobbyRef = doc(this.db, 'lobbies', lobbyId);

    try {
      const outcome = await runTransaction(this.db, async (transaction) => {
        const snap = await transaction.get(lobbyRef);
        if (!snap.exists()) return { success: false, error: 'Lobby not found' };
        const live = snap.data();
        if (live.hostId !== user.id) {
          return { success: false, error: 'Only host can add AI' };
        }
        const added = addLobbyAISeat({
          players: live.players,
          aiPlayer,
          maxPlayers: live.settings?.maxPlayers,
        });
        if (!added.ok) return { success: false, error: added.error };
        transaction.update(lobbyRef, {
          players: added.players,
          updatedAt: serverTimestamp(),
        });
        return { success: true, players: added.players };
      });
      if (!outcome?.success) {
        return { success: false, error: outcome?.error || 'Could not add AI' };
      }
      this._patchCurrentLobby(lobbyId, { players: outcome.players });
      return { success: true };
    } catch (error) {
      console.error('Error adding AI player:', error);
      return { success: false, error: error.message };
    }
  }

  // Remove AI player (host only)
  async removeAIPlayer(indexOrOpts) {
    if (!this.currentLobby) return { success: false, error: 'Not in lobby' };

    const user = this.authManager.getUser();
    if (this.currentLobby.hostId !== user.id) {
      return { success: false, error: 'Only host can remove AI' };
    }

    const opts = (typeof indexOrOpts === 'object' && indexOrOpts)
      ? indexOrOpts
      : { index: indexOrOpts };

    const lobbyId = this.currentLobby.id;
    const lobbyRef = doc(this.db, 'lobbies', lobbyId);

    try {
      const outcome = await runTransaction(this.db, async (transaction) => {
        const snap = await transaction.get(lobbyRef);
        if (!snap.exists()) return { success: false, error: 'Lobby not found' };
        const live = snap.data();
        if (live.hostId !== user.id) {
          return { success: false, error: 'Only host can remove AI' };
        }
        const removed = removeLobbyAISeat({
          players: live.players,
          oderId: opts.oderId || null,
          index: Number.isInteger(opts.index) ? opts.index : null,
        });
        if (!removed.ok) return { success: false, error: removed.error };
        transaction.update(lobbyRef, {
          players: removed.players,
          updatedAt: serverTimestamp(),
        });
        return { success: true, players: removed.players };
      });
      if (!outcome?.success) {
        return { success: false, error: outcome?.error || 'Not an AI player' };
      }
      this._patchCurrentLobby(lobbyId, { players: outcome.players });
      return { success: true };
    } catch (error) {
      console.error('Error removing AI player:', error);
      return { success: false, error: error.message };
    }
  }

  // Check if game can be started
  // Host can start anytime with 2+ players who have factions
  // Any player can start when lobby is full and all have factions
  canStart() {
    if (!this.currentLobby) return false;
    if (this.currentLobby.players.length < 2) return false;

    // All players must have selected a faction
    const allHaveFactions = this.currentLobby.players.every(p => p.factionId);
    if (!allHaveFactions) return false;

    return true;
  }

  // Check if current user can initiate start (host always, others only when full)
  canInitiateStart() {
    if (!this.canStart()) return false;

    const user = this.authManager.getUser();
    const isHost = this.currentLobby.hostId === user?.id;
    const isFull = this.currentLobby.players.length >= this.currentLobby.settings.maxPlayers;

    // Host can always start if canStart() is true
    // Others can start only when lobby is full
    return isHost || isFull;
  }

  // Check if lobby can be published (host has selected faction)
  canPublish() {
    if (!this.currentLobby) return false;
    const hostPlayer = this.currentLobby.players.find(p => p.isHost);
    return hostPlayer?.factionId && hostPlayer?.color;
  }

  // Publish lobby to make it visible in Open Games (host only)
  async publishLobby() {
    if (!this.currentLobby) return { success: false, error: 'Not in lobby' };

    const user = this.authManager.getUser();
    if (this.currentLobby.hostId !== user.id) {
      return { success: false, error: 'Only host can publish' };
    }

    // Check host has selected faction
    const hostPlayer = this.currentLobby.players.find(p => p.isHost);
    if (!hostPlayer?.factionId) {
      return { success: false, error: 'Please select a faction first' };
    }

    try {
      const lobbyId = this.currentLobby.id;
      await updateDoc(doc(this.db, 'lobbies', lobbyId), {
        isPublished: true,
        updatedAt: serverTimestamp()
      });
      // First click must list immediately — do not wait for the snapshot
      // (9.20.26.12 / Bastion second-click).
      this._patchCurrentLobby(lobbyId, { isPublished: true });
      this._notifyListeners();
      return { success: true };
    } catch (error) {
      console.error('Error publishing lobby:', error);
      return { success: false, error: error.message };
    }
  }

  // Drop the waiting lobby from Open Games. Stays in the room.
  // Does not remove seats and does not delete the lobby doc.
  async unlistLobby() {
    if (!this.currentLobby) return { success: false, error: 'Not in lobby' };

    const user = this.authManager.getUser();
    if (!user || this.currentLobby.hostId !== user.id) {
      return { success: false, error: 'Only host can unlist' };
    }

    try {
      const lobbyId = this.currentLobby.id;
      await updateDoc(doc(this.db, 'lobbies', lobbyId), {
        isPublished: false,
        updatedAt: serverTimestamp(),
      });
      this._patchCurrentLobby(lobbyId, { isPublished: false });
      this._notifyListeners();
      return { success: true, isPublished: false };
    } catch (error) {
      console.error('Error unlisting lobby:', error);
      return { success: false, error: error.message };
    }
  }

  // Start the game (host can always start, others can start when lobby is full)
  async startGame() {
    if (!this.currentLobby) return { success: false, error: 'Not in lobby' };

    const user = this.authManager.getUser();
    if (!user) return { success: false, error: 'Not logged in' };

    const existingCached = resolveStartGameTarget({
      existingGameId: this.currentLobby.gameId,
      lobbyStatus: this.currentLobby.status,
    });
    if (existingCached.reuse) {
      return { success: true, gameId: existingCached.gameId, reused: true };
    }

    const lobbyId = this.currentLobby.id;
    const lobbyRef = doc(this.db, 'lobbies', lobbyId);

    try {
      const outcome = await runTransaction(this.db, async (transaction) => {
        const snap = await transaction.get(lobbyRef);
        if (!snap.exists()) return { success: false, error: 'Lobby not found' };
        const live = { id: snap.id, ...snap.data() };

        const existing = resolveStartGameTarget({
          existingGameId: live.gameId,
          lobbyStatus: live.status,
        });
        if (existing.reuse) {
          return { success: true, gameId: existing.gameId, reused: true };
        }

        const isHost = live.hostId === user.id;
        const isFull = (live.players?.length || 0) >= (live.settings?.maxPlayers || 0);
        if (!isHost && !isFull) {
          return { success: false, error: 'Only host can start before lobby is full' };
        }
        if ((live.players?.length || 0) < 2) {
          return { success: false, error: 'Need at least 2 players' };
        }
        if (live.players.some((p) => !p.factionId)) {
          return { success: false, error: 'All players must select a faction' };
        }

        const roster = startGameRoster(live.players);
        const gameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const gameRef = doc(this.db, 'games', gameId);

        console.log('[LobbyManager] Starting game with players:');
        roster.players.forEach((p, i) => {
          console.log(`  [${i}] ${p.displayName}: oderId=${p.oderId}, isAI=${p.isAI || false}`);
        });
        console.log('[LobbyManager] playerUserIds array:', roster.playerUserIds);

        transaction.set(gameRef, {
          lobbyId: live.id,
          lobbyCode: live.code,
          code: live.code,
          status: 'starting',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          currentPlayerId: null,
          stateVersion: 0,
          playerUserIds: roster.playerUserIds,
          startedBy: user.id,
          state: null,
          lobbyData: {
            players: roster.players,
            settings: live.settings,
          },
        });

        // B40: Start publishes an unpublished 2/2 lobby
        const lobbyUpdate = {
          status: 'starting',
          gameId,
          startedBy: user.id,
          updatedAt: serverTimestamp(),
        };
        if (!live.isPublished) {
          lobbyUpdate.isPublished = true;
        }
        transaction.update(lobbyRef, lobbyUpdate);
        return {
          success: true,
          gameId,
          reused: false,
          players: roster.players,
          isPublished: true,
        };
      });

      if (!outcome?.success) {
        return { success: false, error: outcome?.error || 'Could not start game' };
      }
      this._patchCurrentLobby(lobbyId, {
        status: 'starting',
        gameId: outcome.gameId,
        startedBy: user.id,
        players: outcome.players || this.currentLobby.players,
        isPublished: outcome.isPublished ?? this.currentLobby.isPublished,
      });
      return { success: true, gameId: outcome.gameId, reused: !!outcome.reused };
    } catch (error) {
      console.error('Error starting game:', error);
      return { success: false, error: error.message };
    }
  }

  _patchCurrentLobby(lobbyId, fields) {
    if (!lobbyId || this.currentLobby?.id !== lobbyId || !fields) return;
    this.currentLobby = { ...this.currentLobby, ...fields };
  }

  // Subscribe to real-time lobby updates
  _subscribeToLobby(lobbyId) {
    if (this.lobbyUnsubscribe) {
      this.lobbyUnsubscribe();
    }

    this.lobbyUnsubscribe = onSnapshot(
      doc(this.db, 'lobbies', lobbyId),
      (snapshot) => {
        if (snapshot.exists()) {
          this.currentLobby = { id: snapshot.id, ...snapshot.data() };
          this._listenerErrored = false;
          const remembered = lastMatchFromLobbySnapshot(this.currentLobby);
          if (remembered) rememberLastMatch(remembered);
          else if (!this.currentLobby.status || this.currentLobby.status === 'waiting') {
            forgetLastMatch();
          }
        } else if (shouldKeepLastKnownLobby({
          snapshotExists: false,
          explicitLeave: false,
        }) && this.currentLobby) {
          // B41: missing-doc flicker is not Leave. Keep the last known room.
          this._listenerErrored = true;
        } else if (shouldClearLobbyOnSnapshotError()) {
          this.currentLobby = null;
        }
        this._notifyListeners();
      },
      (error) => {
        console.error('Lobby subscription error:', error);
        this._listenerErrored = true;
        // B41: permission / token flicker must not eject the host.
        if (shouldClearLobbyOnSnapshotError()) {
          this.currentLobby = null;
        }
        this._notifyListeners();
      }
    );
  }

  // Get current lobby
  getLobby() {
    return this.currentLobby;
  }

  // Disconnect from lobby updates without leaving (used when going to browse view).
  // notify:false = explicit Back — do not treat a null snapshot as flicker.
  disconnectFromLobby({ notify = true } = {}) {
    if (this.lobbyUnsubscribe) {
      this.lobbyUnsubscribe();
      this.lobbyUnsubscribe = null;
    }
    this.currentLobby = null;
    if (notify) this._notifyListeners();
  }

  // Check if current user is host
  isHost() {
    if (!this.currentLobby) return false;
    const user = this.authManager.getUser();
    return this.currentLobby.hostId === user?.id;
  }

  // Get current player's data
  getCurrentPlayer() {
    if (!this.currentLobby) return null;
    const user = this.authManager.getUser();
    return this.currentLobby.players.find(p => p.oderId === user?.id);
  }

  // Admin emails that can delete any game
  static ADMIN_EMAILS = ['bickford.james@gmail.com'];

  // Check if current user is admin
  isAdmin() {
    const user = this.authManager.getUser();
    return user && LobbyManager.ADMIN_EMAILS.includes(user.email);
  }

  // Admin: Delete any lobby by ID
  async adminDeleteLobby(lobbyId) {
    if (!this.isAdmin()) {
      return { success: false, error: 'Not authorized' };
    }

    try {
      await deleteDoc(doc(this.db, 'lobbies', lobbyId));
      return { success: true };
    } catch (error) {
      console.error('Error deleting lobby:', error);
      return { success: false, error: error.message };
    }
  }

  // Admin: Delete any game by ID
  async adminDeleteGame(gameId) {
    if (!this.isAdmin()) {
      return { success: false, error: 'Not authorized' };
    }

    try {
      await deleteDoc(doc(this.db, 'games', gameId));
      return { success: true };
    } catch (error) {
      console.error('Error deleting game:', error);
      return { success: false, error: error.message };
    }
  }
}

// Singleton instance
let lobbyManagerInstance = null;

export function getLobbyManager() {
  if (!lobbyManagerInstance) {
    lobbyManagerInstance = new LobbyManager();
  }
  return lobbyManagerInstance;
}
