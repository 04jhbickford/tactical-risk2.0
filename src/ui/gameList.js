// Game List UI for Tactical Risk multiplayer
// Shows active games for rejoining

import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  deleteDoc,
  doc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFirebaseDb } from '../multiplayer/firebase.js';
import { getAuthManager } from '../multiplayer/auth.js';
import { getLobbyManager } from '../multiplayer/lobbyManager.js';
import { leaveGame, isAllResignDeleteFailure, retryDeleteFinishedGame } from '../multiplayer/surrender.js';
import {
  closestLeaveControl,
  mergeMyActiveGames,
  shouldAbortMyGamesOnTokenHiccup,
  shouldJoinGameFromRowClick,
  shouldOpenLeaveConfirm,
} from '../multiplayer/presencePolicy.js';
import {
  forgetLastMatch,
  readLastMatch,
  recoverMyGamesOnLoad,
  shouldWipeMyGamesOnError,
  shouldForgetLastMatchAfterLookup,
  shouldJoinListedGame,
  resolveMyGamesEntryAction,
} from '../multiplayer/lastMatch.js';
import { seatNamesForOpenGameCard } from '../multiplayer/lobbySeats.js';

export { shouldOpenLeaveConfirm };

export class GameList {
  constructor(onSelectGame, onBack) {
    this.onSelectGame = onSelectGame;
    this.onBack = onBack;
    this.db = getFirebaseDb();
    this.authManager = getAuthManager();
    this.lobbyManager = getLobbyManager();
    this.el = null;
    this.games = [];
    this.waitingLobbies = []; // lobbies I'm in that haven't started yet
    this.isLoading = false;
  }

  async show() {
    console.log('[GameList] show() called');
    console.trace('[GameList] show() stack trace');
    if (!this.el) {
      this._create();
    }
    this.el.classList.remove('hidden');
    this.el.style.display = 'flex'; // Ensure it's visible
    await this._loadGames();
    this._render();
  }

  hide() {
    console.log('[GameList] hide() called');
    if (this.el) {
      this.el.classList.add('hidden');
      this.el.style.display = 'none'; // Force hide with display none
    }
  }

  destroy() {
    if (this.el?.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'game-list';
    this.el.className = 'lobby-overlay modern';
    // One delegated handler for every Leave/Abandon control on My Games.
    // Re-renders replace innerHTML; this listener stays on the overlay.
    this.el.addEventListener('click', (e) => {
      const control = closestLeaveControl(e.target);
      if (!control || !this.el.contains(control)) return;
      this._onLeaveControlClick(e, control);
    });
    document.body.appendChild(this.el);
  }

  async _loadGames() {
    this.isLoading = true;
    this._render();

    const user = this.authManager.getUser();
    const userId = user?.id || this.authManager.getUserId();
    console.log('[GameList] Loading games for userId:', userId);

    if (!userId || !this.db) {
      console.warn('[GameList] No userId or db - cannot load games');
      this.games = [];
      this.isLoading = false;
      return;
    }

    // Token hiccup after Sign In must still query (B25). A remembered
    // last match is enough to keep My Games from going empty.
    const remembered = readLastMatch();
    const isTokenValid = await this.authManager.validateToken();
    if (shouldAbortMyGamesOnTokenHiccup({
      authUserPresent: !!user,
      tokenValid: isTokenValid,
      hasLastMatch: !!(remembered?.gameId || remembered?.lobbyCode),
    })) {
      console.warn('[GameList] Token validation failed - user needs to re-login');
      this.games = recoverMyGamesOnLoad({ games: [], lastMatch: remembered });
      this.isLoading = false;
      return;
    }

    try {
      // Equality / array-contains only — compound `in` needs a composite index
      // (firestore.indexes.json is empty). Filter status client-side.
      console.log('[GameList] Querying games with:', { userId });

      const gamesRef = collection(this.db, 'games');
      const [seatSnap, starterSnap] = await Promise.all([
        getDocs(query(gamesRef, where('playerUserIds', 'array-contains', userId))),
        getDocs(query(gamesRef, where('startedBy', '==', userId))),
      ]);
      const bySeat = seatSnap.docs.map(d => {
        const data = d.data();
        console.log(`[GameList] Game ${d.id}: status=${data.status}, playerUserIds=`, data.playerUserIds);
        return { id: d.id, ...data };
      });
      const byStarter = starterSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      this.games = mergeMyActiveGames({ bySeat, byStarter, userId });
      let lastGame = null;
      let lastMatchMissing = false;
      if (remembered?.gameId && !this.games.some(g => g.id === remembered.gameId)) {
        try {
          const snap = await getDoc(doc(this.db, 'games', remembered.gameId));
          if (snap.exists()) {
            lastGame = { id: snap.id, ...snap.data() };
          } else {
            lastMatchMissing = true;
          }
        } catch (err) {
          console.warn('[GameList] last-match getDoc failed', err);
        }
      }
      if (shouldForgetLastMatchAfterLookup({ lastMatchMissing, lastMatchGame: lastGame })) {
        forgetLastMatch();
      }
      this.games = recoverMyGamesOnLoad({
        games: this.games,
        lastMatchGame: lastGame,
        lastMatch: lastMatchMissing ? null : remembered,
        lastMatchMissing,
      });
      console.log(`[GameList] Found ${this.games.length} active games for userId ${userId}`);

      // Sort by last updated
      this.games.sort((a, b) => {
        const aTime = a.updatedAt?.toMillis?.() || 0;
        const bTime = b.updatedAt?.toMillis?.() || 0;
        return bTime - aTime;
      });

      // Also include lobbies I'm in that haven't started yet. A pre-start
      // game only exists as a 'waiting' LOBBY document — without this, it
      // showed under Open Games but was missing from My Games entirely.
      const lobbyQuery = query(
        collection(this.db, 'lobbies'),
        where('status', '==', 'waiting')
      );
      const lobbySnapshot = await getDocs(lobbyQuery);
      this.waitingLobbies = lobbySnapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(l => l.players?.some(p => p.oderId === userId));
    } catch (error) {
      console.error('[GameList] Error loading games:', error);

      const last = readLastMatch();
      let lastGame = null;
      if (last?.gameId) {
        try {
          const snap = await getDoc(doc(this.db, 'games', last.gameId));
          if (snap.exists()) lastGame = { id: snap.id, ...snap.data() };
        } catch (err) {
          console.warn('[GameList] last-match getDoc failed after query error', err);
        }
      }
      this.games = recoverMyGamesOnLoad({
        games: [],
        lastMatchGame: lastGame,
        lastMatch: last,
      });

      // Check if it's an auth error - if so, handle re-authentication
      const authResult = await this.authManager.handleFirebaseError(error);
      if (authResult.needsReauth) {
        console.warn('[GameList] Auth error detected - user needs to re-login');
        if (shouldWipeMyGamesOnError({ lastMatch: last })) {
          this.games = [];
        }
        this.isLoading = false;
        return;
      }

      // Check if it's an index error
      if (error.message?.includes('index')) {
        console.error('[GameList] INDEX ERROR - May need to create Firestore index!');
        console.error('[GameList] Error details:', error.message);
      }
    }

    this.isLoading = false;
  }

  _render() {
    const user = this.authManager.getUser();
    const isAdmin = this.lobbyManager.isAdmin();

    let content = '';

    let lobbiesHtml = '';
    if (!this.isLoading && this.waitingLobbies.length > 0) {
      lobbiesHtml = `
        <div class="mp-section-subheader">Waiting to start</div>
        <div class="mp-games-list">
          ${this.waitingLobbies.map(lobby => `
            <div class="mp-game-row own-lobby">
              <button type="button" class="mp-game-item" data-lobby-code="${lobby.code}" data-role="join-game">
                <div class="mp-game-info">
                  <span class="mp-game-name">${lobby.name}</span>
                  <span class="mp-game-details">${lobby.players.length}/${lobby.settings?.maxPlayers || '?'} players · Code ${lobby.code}</span>
                </div>
                <div class="mp-game-status"><span class="mp-waiting">In lobby</span></div>
                <span class="mp-game-join">Resume lobby</span>
              </button>
              <div class="mp-game-row-actions">
                <button type="button" class="mp-leave-game" data-leave-lobby="${lobby.id}" data-role="leave-game" title="Leave this lobby">Leave</button>
              </div>
            </div>
          `).join('')}
        </div>
        ${this.games.length > 0 ? '<div class="mp-section-subheader">In progress</div>' : ''}
      `;
    }

    if (this.isLoading) {
      content = `
        <div class="mp-games-loading">Loading your games...</div>
      `;
    } else if (this.games.length === 0 && this.waitingLobbies.length === 0) {
      const userId = this.authManager.getUserId();
      const userEmail = this.authManager.getUser()?.email || 'unknown';
      content = `
        <p class="mp-no-games">No active games found.</p>
        <p class="mp-no-games-hint">Games you create or join will appear here.</p>
        <p class="mp-no-games-hint" style="font-size: 0.75em; color: #666;">
          Email: ${userEmail}<br>
          Full ID: ${userId || 'not logged in'}<br>
          Short ID: ${userId ? '...' + userId.slice(-8) : 'N/A'}
        </p>
        <p class="mp-no-games-hint" style="font-size: 0.7em; color: #888; margin-top: 8px;">
          Check browser console for detailed debug info.
        </p>
      `;
    } else {
      content = `
        ${lobbiesHtml}
        <div class="mp-games-list">
          ${this.games.map(game => this._renderGameItem(game, user, isAdmin)).join('')}
        </div>
      `;
    }

    this.el.innerHTML = `
      <div class="lobby-container modern">
        <div class="lobby-bg-pattern"></div>
        <div class="lobby-content-wrapper">
          <div class="mp-lobby-container">
            <div class="lobby-brand mp-brand">
              <h1 class="lobby-logo">Tactical Risk</h1>
              <p class="lobby-tagline">My Active Games</p>
            </div>

            <div class="mp-active-games-section">
              <div class="mp-section-header">
                <h3 class="mp-section-title">Your Games</h3>
                <button class="mp-refresh-btn" data-action="refresh" title="Refresh">↻</button>
              </div>
              ${content}
            </div>

            <div class="mp-footer-actions">
              <button class="mp-secondary-btn" data-action="back">← Back</button>
            </div>
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _renderGameItem(game, user, isAdmin) {
    const lobbyData = game.lobbyData || {};
    const players = lobbyData.players || [];

    // Format last updated time
    let lastUpdated = 'Unknown';
    if (game.updatedAt) {
      const date = game.updatedAt.toDate?.() || new Date(game.updatedAt);
      lastUpdated = this._formatTimeAgo(date);
    }

    // Check game status
    const isStarting = game.status === 'starting';

    // Check if it's user's turn (only relevant for active games)
    const isMyTurn = !isStarting && game.currentPlayerId === user?.id;

    // Get current player name
    const currentPlayer = players.find(p => p.oderId === game.currentPlayerId);
    const currentPlayerName = currentPlayer?.displayName || 'Unknown';

    // Get round info from state
    const round = game.state?.round || 1;

    // Player names list — prefer live state seats if lobbyData lost a joiner
    const seatNames = seatNamesForOpenGameCard({
      lobbyPlayers: players,
      statePlayers: game.state?.players || [],
    });
    const playerNames = seatNames.join(', ');

    // Status display
    let statusHtml;
    if (isStarting) {
      statusHtml = '<span class="mp-waiting">Starting...</span>';
    } else if (isMyTurn) {
      statusHtml = '<span class="mp-your-turn">Your Turn!</span>';
    } else {
      statusHtml = `<span class="mp-waiting">Waiting: ${currentPlayerName}</span>`;
    }

    return `
      <div class="mp-game-row">
        <button type="button" class="mp-game-item ${isMyTurn ? 'my-turn' : ''}" data-game-id="${game.id}" data-role="join-game">
          <div class="mp-game-info">
            <span class="mp-game-name">${playerNames}</span>
            <span class="mp-game-details">
              ${isStarting ? 'Starting' : `Round ${round}`} · ${seatNames.length || players.length} players · ${lastUpdated}
            </span>
          </div>
          <div class="mp-game-status">
            ${statusHtml}
          </div>
          <span class="mp-game-join">${resolveMyGamesEntryAction({
            kind: 'game',
            status: game.status,
            stateVersion: game.stateVersion,
            hasState: !!game.state,
          }).label}</span>
        </button>
        <div class="mp-game-row-actions">
          <button type="button" class="mp-leave-game" data-leave-game="${game.id}" data-role="leave-game" title="Surrender and leave this game">Leave</button>
        </div>
        ${isAdmin ? `<button class="mp-admin-delete" data-delete-game="${game.id}" title="Delete (Admin)">🗑</button>` : ''}
      </div>
    `;
  }

  _formatTimeAgo(date) {
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  _bindEvents() {
    // Back button
    this.el.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      this.hide();
      if (this.onBack) {
        this.onBack();
      }
    });

    // Refresh button
    this.el.querySelector('[data-action="refresh"]')?.addEventListener('click', async () => {
      await this._loadGames();
      this._render();
    });

    // Waiting-lobby items open the room. They must not start a map.
    this.el.querySelectorAll('.mp-game-item[data-lobby-code]').forEach(item => {
      item.addEventListener('click', async () => {
        const code = item.dataset.lobbyCode;
        const result = await this.lobbyManager.joinLobby(code, null);
        if (!result.success) {
          alert(result.error);
          return;
        }
        const decision = resolveMyGamesEntryAction({
          kind: result.isGame ? 'game' : 'lobby',
          status: result.isGame ? (result.game?.status || 'active') : 'waiting',
          stateVersion: result.game?.stateVersion || 0,
          hasState: !!result.game?.state,
        });
        // The row was a waiting lobby. A live waiting room always wins.
        if (!result.isGame || decision.action === 'open-lobby' || result.game?.status === 'waiting') {
          this.hide();
          if (this.onOpenLobby) this.onOpenLobby(result);
          else if (this.onBack) this.onBack();
          return;
        }
        this.hide();
        if (this.onSelectGame) await this.onSelectGame(result.gameId, result.game);
      });
    });

    // Game items - click to join
    this.el.querySelectorAll('.mp-game-item[data-game-id]').forEach(item => {
      item.addEventListener('click', async (e) => {
        if (closestLeaveControl(e.target) || closestLeaveControl(e.currentTarget)) return;
        if (shouldOpenLeaveConfirm({ clickOnLeaveControl: false, eventTarget: e.target })) return;
        if (!shouldJoinGameFromRowClick({ eventTarget: e.target })) return;
        const gameId = item.dataset.gameId;
        const game = this.games.find(g => g.id === gameId);
        console.log('[GameList] Game clicked:', { gameId, game });
        const decision = game ? resolveMyGamesEntryAction({
          kind: 'game',
          status: game.status,
          stateVersion: game.stateVersion,
          hasState: !!game.state,
        }) : { action: 'rejoin-map' };
        if (!game || (!shouldJoinListedGame({ game }) && decision.action !== 'open-lobby')) {
          if (gameId) forgetLastMatch();
          alert('That game is no longer active.');
          await this._loadGames();
          this._render();
          return;
        }
        if (decision.action === 'open-lobby') {
          const code = game?.lobbyCode || game?.lobbyData?.code || game?.code;
          if (!code) {
            alert('That lobby has no code to rejoin.');
            return;
          }
          const joined = await this.lobbyManager.joinLobby(code, null);
          if (!joined.success) {
            alert(joined.error);
            return;
          }
          this.hide();
          if (this.onOpenLobby) this.onOpenLobby(joined);
          else if (this.onBack) this.onBack();
          return;
        }
        if (game && this.onSelectGame) {
          this.hide();
          console.log('[GameList] Calling onSelectGame...');
          await this.onSelectGame(gameId, game);
          console.log('[GameList] onSelectGame completed');
        } else {
          console.warn('[GameList] No game found or no callback:', { game, hasCallback: !!this.onSelectGame });
        }
      });
    });

    // Admin delete buttons
    this.el.querySelectorAll('.mp-admin-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const gameId = btn.dataset.deleteGame;
        if (confirm('Delete this game? This cannot be undone.')) {
          const result = await this.lobbyManager.adminDeleteGame(gameId);
          if (result.success) {
            await this._loadGames();
            this._render();
          } else {
            alert('Failed to delete: ' + result.error);
          }
        }
      });
    });
  }

  async _onLeaveControlClick(e, btn) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    const control = closestLeaveControl(btn) || closestLeaveControl(e.currentTarget) || closestLeaveControl(e.target);
    if (!shouldOpenLeaveConfirm({ clickOnLeaveControl: true, eventTarget: control || btn })) return;

    const gameId = control?.dataset?.leaveGame || btn.dataset.leaveGame;
    const lobbyId = control?.dataset?.leaveLobby || btn.dataset.leaveLobby;
    const game = gameId ? this.games.find(g => g.id === gameId) : null;
    const lobby = lobbyId ? this.waitingLobbies.find(l => l.id === lobbyId) : null;
    const isStarted = !!(game && (game.stateVersion > 0 || game.state));

    const message = gameId
      ? (isStarted
        ? 'Leave this game? You will surrender: your territories become neutral, your units are removed, and the game continues without you. This cannot be undone.'
        : 'Leave this game? It has not started yet — you will simply be removed from it.')
      : 'Leave this game? It has not started yet — you will be removed from the lobby.';
    if (!confirm(message)) return;

    btn.disabled = true;
    const userId = this.authManager.getUserId();
    let result;
    try {
      if (gameId) {
        result = await leaveGame(gameId, userId);
        if (result.success && isAllResignDeleteFailure(result)) {
          const retry = confirm('Could not remove the finished game. Retry delete?');
          if (retry) {
            result = await retryDeleteFinishedGame(gameId);
          }
          if (!result?.deleted) {
            alert('Game is finished but could not be removed. Refresh My Games — it is not playable.');
          }
        }
      } else if (lobbyId) {
        result = await this.lobbyManager.leaveListedLobby(lobby || { id: lobbyId });
      } else {
        result = { success: false, error: 'No game or lobby on this Leave control' };
      }
    } catch (err) {
      result = { success: false, error: err?.message || String(err) };
    }

    if (result?.success || result?.deleted || result?.shouldDelete) {
      const remembered = readLastMatch();
      if (gameId && remembered?.gameId === gameId) forgetLastMatch();
      if (lobby && remembered?.lobbyCode && remembered.lobbyCode === lobby.code) forgetLastMatch();
      await this._loadGames();
      this._render();
    } else {
      btn.disabled = false;
      alert('Failed to leave game: ' + (result?.error || 'unknown error'));
    }
  }
}
