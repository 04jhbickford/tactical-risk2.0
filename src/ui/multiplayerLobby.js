// Multiplayer Lobby UI for Tactical Risk
// Shows players, ready status, faction selection, and game start

import { getLobbyManager } from '../multiplayer/lobbyManager.js';
import { getAuthManager } from '../multiplayer/auth.js';
import { GAME_VERSION } from './lobby.js';
import { possessivePhrase } from '../utils/possessive.js';
import {
  readLastMatch,
  forgetLastMatch,
  resolveMenuCardAction,
  shouldOpenJoinByCode,
  shouldOpenMyGames,
  shouldPrefillJoinCodeFromLastMatch,
  joinFormFieldAttrString,
  shouldLeaveLobbyView,
  shouldNavigateToHome,
  resolveLobbyViewAfterLoss,
  shouldBlockCompetingEntryForms,
  resolveRejoinRecoveryUi,
  resolveReconnectCopy,
  shouldForgetLastMatchOnDismissRejoin,
} from '../multiplayer/lastMatch.js';
import { resolveHostLobbyPrimaryCta } from '../multiplayer/lobbyStart.js';
import { seatNamesForOpenGameCard } from '../multiplayer/lobbySeats.js';
import { parseDiscordSeatInput, rememberDiscordSeat } from '../multiplayer/discordTurnPing.js';
import { resolveHostAwayBanner } from '../ui/hudClarity.js';

// Available factions (should match setup data)
const FACTIONS = [
  { id: 'Russians', name: 'Russians', flag: 'Russians.png', color: '#B22222' },
  { id: 'Germans', name: 'Germans', flag: 'Germans.png', color: '#4A4A4A' },
  { id: 'British', name: 'British', flag: 'British.png', color: '#B8860B' },
  { id: 'Japanese', name: 'Japanese', flag: 'Japanese.png', color: '#FF8C00' },
  { id: 'Americans', name: 'Americans', flag: 'Americans.png', color: '#556B2F' },
];

const FACTION_COLORS = [
  { id: 'red', color: '#B22222', name: 'Crimson' },
  { id: 'blue', color: '#1E90FF', name: 'Blue' },
  { id: 'green', color: '#228B22', name: 'Green' },
  { id: 'orange', color: '#FF8C00', name: 'Orange' },
  { id: 'purple', color: '#8B008B', name: 'Purple' },
  { id: 'gold', color: '#B8860B', name: 'Gold' },
  { id: 'gray', color: '#4A4A4A', name: 'Gray' },
  { id: 'teal', color: '#008B8B', name: 'Teal' },
];

const AI_DIFFICULTIES = [
  { id: 'easy', name: 'Easy AI' },
  { id: 'medium', name: 'Medium AI' },
  { id: 'hard', name: 'Hard AI' },
];

export class MultiplayerLobby {
  constructor(setup, onStart, onBack) {
    this.setup = setup;
    this.onStart = onStart;
    this.onBack = onBack;
    this.lobbyManager = getLobbyManager();
    this.authManager = getAuthManager();
    this.el = null;
    this.mode = 'menu'; // 'menu', 'create', 'join', 'lobby'
    this.unsubscribe = null;
    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'multiplayer-lobby';
    this.el.className = 'lobby-overlay modern hidden';
    this.el.addEventListener('click', (e) => this._onOverlayClick(e));
    document.body.appendChild(this.el);
  }

  // Exclusive cards: Join by Code never opens My Games (B26).
  _onOverlayClick(e) {
    const card = e.target.closest?.('.mp-menu-card[data-action]');
    if (!card || !this.el.contains(card)) return;
    const action = resolveMenuCardAction(card.dataset.action);
    if (shouldOpenJoinByCode(action) || action === 'join-by-code') {
      e.preventDefault();
      e.stopPropagation();
      this._openJoinByCode();
      return;
    }
    if (shouldOpenMyGames(action) || action === 'my-games') {
      e.preventDefault();
      e.stopPropagation();
      this._openMyGames();
      return;
    }
    if (action === 'create') {
      if (this._blocksCompetingEntry()) return;
      this.mode = 'create';
      this._render();
      return;
    }
    if (action === 'browse') {
      if (this._blocksCompetingEntry()) return;
      this.mode = 'browse';
      this._render();
      this._loadBrowseGames();
    }
  }

  _blocksCompetingEntry() {
    return shouldBlockCompetingEntryForms({
      rejoinRequired: this.mode === 'reconnect',
      dismissed: !!this._rejoinDismissed,
    });
  }

  _openJoinByCode() {
    if (this._blocksCompetingEntry()) return;
    if (this.mode === 'reconnect') this._fromReconnect = true;
    this.mode = 'join';
    this._render();
  }

  _openMyGames() {
    if (this.onBack) this.onBack('rejoin');
  }

  showReconnectOnly() {
    this.mode = 'reconnect';
    this._fromReconnect = true;
    this._rejoinDismissed = false;
    this.show();
  }

  show() {
    console.log('[MultiplayerLobby] show() called, mode:', this.mode);
    console.trace('[MultiplayerLobby] show() stack trace');
    if (typeof this.onCoverHome === 'function') this.onCoverHome();
    this.el.classList.remove('hidden');
    this.el.style.display = 'flex'; // Ensure visible
    this._subscribeToLobby();
    this._render();
  }

  hide({ resetMode = true } = {}) {
    console.log('[MultiplayerLobby] hide() called');
    this.el.classList.add('hidden');
    this.el.style.display = 'none'; // Force hide with display none
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    if (resetMode) this.mode = 'menu';
  }

  destroy() {
    this.hide();
    if (this.el?.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }

  _subscribeToLobby() {
    // Clean up any existing subscription before registering a new one
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.unsubscribe = this.lobbyManager.subscribe((lobby) => {
      // Check if game is starting
      if (lobby?.status === 'starting' && lobby.gameId) {
        this.hide();
        if (this.onStart) {
          this.onStart(lobby.gameId, lobby);
        }
        return;
      }

      // Update UI
      if (lobby) {
        this.mode = 'lobby';
        this._render();
        return;
      }

      // B41: a null snapshot is not Leave. Stay in / restore the room.
      if (!shouldLeaveLobbyView({ snapshotMissing: true, presenceFlicker: true })) {
        const view = resolveLobbyViewAfterLoss({
          currentLobby: null,
          lastMatch: readLastMatch(),
        });
        if (view === 'lobby' || view === 'game' || view === 'reconnect') {
          this.mode = view === 'reconnect' ? 'reconnect' : 'lobby';
          if ((view === 'lobby' || view === 'game') && !this._restoringLobby) {
            void this._restoreLiveLobby();
            return;
          }
        }
      }
      this._render();
    });
  }

  _render() {
    const user = this.authManager.getUser();

    let content = '';

    if (this.mode === 'menu') {
      content = this._renderMenu(user);
    } else if (this.mode === 'reconnect') {
      content = this._renderReconnect(user);
    } else if (this.mode === 'create') {
      content = this._renderCreate(user);
    } else if (this.mode === 'join') {
      content = this._renderJoin(user);
    } else if (this.mode === 'browse') {
      content = this._renderBrowse(user);
    } else if (this.mode === 'lobby') {
      content = this._renderLobby(user);
    }

    // Contextual tagline based on mode
    const tagline = this.mode === 'lobby' ? 'Game Lobby' : 'Online Multiplayer';

    this.el.innerHTML = `
      <div class="lobby-container modern">
        <div class="lobby-bg-pattern"></div>
        <div class="lobby-content-wrapper">
          <div class="mp-lobby-container">
            <div class="lobby-brand mp-brand">
              <h1 class="lobby-logo">Tactical Risk</h1>
              <p class="lobby-tagline">${tagline}</p>
              <span class="lobby-version-badge">${GAME_VERSION}</span>
            </div>
            ${content}
          </div>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _renderMenu(user) {
    // Show clear identity for debugging
    const userIdShort = user?.id ? user.id.slice(-8) : 'unknown';

    return `
      <div class="mp-identity-box">
        <p class="mp-welcome">Welcome, <strong>${user?.displayName || 'Player'}</strong></p>
        <p class="mp-identity-details">
          Logged in as: <strong>${user?.email || 'unknown'}</strong>
          <span class="mp-user-id">(ID: ...${userIdShort})</span>
        </p>
      </div>
      ${this._renderLastMatchBanner()}

      <div class="mp-menu-grid four-col">
        <button type="button" class="mp-menu-card mp-menu-card-join" data-action="join-by-code">
          <div class="mp-card-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
          </div>
          <div class="mp-card-content">
            <h3>Join by Code</h3>
            <p>Enter 6-character code</p>
          </div>
        </button>
        <button type="button" class="mp-menu-card" data-action="my-games">
          <div class="mp-card-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
          </div>
          <div class="mp-card-content">
            <h3>My Games</h3>
            <p>Resume playing</p>
          </div>
        </button>
        <button type="button" class="mp-menu-card" data-action="browse">
          <div class="mp-card-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
          </div>
          <div class="mp-card-content">
            <h3>Open Games</h3>
            <p>Join a lobby</p>
          </div>
        </button>
        <button type="button" class="mp-menu-card" data-action="create">
          <div class="mp-card-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
          </div>
          <div class="mp-card-content">
            <h3>Create Game</h3>
            <p>Host a new game</p>
          </div>
        </button>
      </div>

      <div class="mp-footer-actions">
        <button class="mp-secondary-btn" data-action="back">← Back</button>
        <button class="mp-secondary-btn danger" data-action="signout">Sign Out</button>
      </div>
    `;
  }

  _renderLobbyRestoring(user, last) {
    const code = last?.lobbyCode || 'the lobby';
    return `
      <div class="mp-identity-box">
        <p class="mp-welcome">Still in ${code}</p>
        <p class="mp-identity-details">
          Connection flickered. You did not leave. Restoring the live lobby…
        </p>
      </div>
      ${this._renderLastMatchBanner()}
    `;
  }

  _renderReconnect(user) {
    const last = readLastMatch();
    const copy = resolveReconnectCopy({
      signedIn: !!user,
      resumeInFlight: !!this._resumeInFlight,
      lobbyCode: last?.lobbyCode || null,
    });
    const ui = resolveRejoinRecoveryUi({
      rejoinRequired: true,
      dismissed: !!this._rejoinDismissed,
    });
    const competing = [
      ui.showJoinForm ? this._renderJoin(user) : '',
      ui.showCreateForm ? this._renderCreate(user) : '',
      ui.showBrowse ? this._renderBrowse(user) : '',
    ].join('');
    return `
      <div class="mp-identity-box">
        <p class="mp-welcome">${copy.title}</p>
        <p class="mp-identity-details">
          ${copy.detail}
        </p>
      </div>
      ${ui.showRejoinCta ? this._renderLastMatchBanner() : ''}
      <div class="mp-error ${this._rejoinError ? '' : 'hidden'}" id="rejoin-error">${this._rejoinError || ''}</div>
      ${competing}
      ${ui.showDismissEscape ? `
      <div class="mp-footer-actions mp-rejoin-escape">
        <button type="button" class="mp-secondary-btn" data-action="dismiss-rejoin">
          Leave this match / find another game
        </button>
      </div>
      ` : ''}
    `;
  }

  _renderLastMatchBanner() {
    const last = readLastMatch();
    if (!last?.lobbyCode && !last?.gameId) return '';
    const code = last.lobbyCode || 'your last match';
    return `
      <div class="mp-last-match" data-last-match="1">
        <p>${resolveHostAwayBanner({ lobbyCode: last.lobbyCode })}</p>
        <button type="button" class="mp-primary-btn" data-action="rejoin-last">Rejoin ${code}</button>
      </div>
    `;
  }

  _renderCreate(user) {
    return `
      <div class="mp-form-header">
        <button class="back-btn" data-action="cancel">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <h2>Create New Game</h2>
      </div>

      <form class="mp-form modern" data-form="create" autocomplete="off">
        <div class="mp-field">
          <label>Game Name</label>
          <input type="text" id="create-name" placeholder="${possessivePhrase(user?.displayName, 'Game')}" maxlength="30" class="modern-input">
        </div>
        <div class="mp-field-row">
          <div class="mp-field">
            <label>Max Players</label>
            <select id="create-max-players" class="modern-select">
              <option value="2">2 Players</option>
              <option value="3">3 Players</option>
              <option value="4">4 Players</option>
              <option value="5" selected>5 Players</option>
            </select>
          </div>
          <div class="mp-field">
            <label>Starting IPCs</label>
            <select id="create-ipcs" class="modern-select">
              <option value="40">40</option>
              <option value="60">60</option>
              <option value="80" selected>80</option>
              <option value="100">100</option>
              <option value="120">120</option>
            </select>
          </div>
        </div>
        <label class="mp-checkbox-option standalone">
          <input type="checkbox" id="create-private">
          <span class="checkbox-box"></span>
          <span>Private Game</span>
        </label>
        <div class="mp-password-field hidden" id="password-field">
          <label>Password</label>
          <input type="password" id="create-password" class="modern-input" placeholder="" ${joinFormFieldAttrString('password')}>
        </div>

        <div class="mp-error hidden" id="create-error"></div>

        <button type="submit" class="mp-primary-btn">Create Game</button>
      </form>
    `;
  }

  _renderJoin(user) {
    return `
      <div class="mp-form-header">
        <button class="back-btn" data-action="cancel">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <h2>Join Game</h2>
      </div>

      <form class="mp-form modern" data-form="join" autocomplete="off">
        <div class="mp-field">
          <label>Game Code</label>
          <input type="text" id="join-code" placeholder="ABC123" maxlength="6" class="modern-input code-input" ${joinFormFieldAttrString('code')}${shouldPrefillJoinCodeFromLastMatch() && readLastMatch()?.lobbyCode ? ` value="${readLastMatch().lobbyCode}"` : ''}>
        </div>
        <div class="mp-field">
          <label>Password (if required)</label>
          <input type="password" id="join-password" placeholder="Leave empty if none" class="modern-input" ${joinFormFieldAttrString('password')}>
        </div>

        <div class="mp-error hidden" id="join-error"></div>

        <button type="submit" class="mp-primary-btn">Join Game</button>
      </form>
    `;
  }

  _renderBrowse(user) {
    const isAdmin = this.lobbyManager.isAdmin();
    return `
      <div class="mp-form-header">
        <button class="back-btn" data-action="cancel">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </button>
        <h2>Open Games</h2>
        <button class="mp-refresh-btn" data-action="refresh-browse" title="Refresh">↻</button>
      </div>

      <div class="mp-browse-games" id="browse-games">
        <div class="mp-games-loading">Loading open games...</div>
      </div>
    `;
  }

  async _loadBrowseGames() {
    const container = this.el.querySelector('#browse-games');
    if (!container) return;

    const isAdmin = this.lobbyManager.isAdmin();
    const user = this.authManager.getUser();

    try {
      // Load joinable lobbies and the user's own in-progress games in parallel.
      // A started game is no longer a 'waiting' lobby, so without the second
      // query the player's current game would be invisible on this screen.
      const [lobbies, myGames] = await Promise.all([
        this.lobbyManager.getOpenLobbies(),
        this.lobbyManager.getMyActiveGames()
      ]);

      // Sort: user's own lobbies first, then by creation time
      const sortedLobbies = [...lobbies].sort((a, b) => {
        const aIsOwn = a.hostId === user?.id;
        const bIsOwn = b.hostId === user?.id;
        if (aIsOwn && !bIsOwn) return -1;
        if (!aIsOwn && bIsOwn) return 1;
        return 0; // Keep original order otherwise
      });

      let myGamesHtml = '';
      if (myGames.length > 0) {
        myGamesHtml = `
          <div class="mp-section-subheader">Your games in progress</div>
          <div class="mp-games-list">
            ${myGames.map(game => {
              const players = game.lobbyData?.players || [];
              const seatNames = seatNamesForOpenGameCard({
                lobbyPlayers: players,
                statePlayers: game.state?.players || [],
              });
              const playerNames = seatNames.join(', ');
              const isMyTurn = game.currentPlayerId === user?.id;
              const round = game.state?.round || 1;
              const isStarting = game.status === 'starting';
              return `
                <div class="mp-game-row own-lobby">
                  <button class="mp-game-item ${isMyTurn ? 'my-turn' : ''}" data-resume-game-id="${game.id}">
                    <div class="mp-game-info">
                      <span class="mp-game-name">${playerNames || 'Game in progress'}</span>
                      <span class="mp-game-details">${isStarting ? 'Starting' : `Round ${round}`} · ${seatNames.length || players.length} players</span>
                    </div>
                    <span class="mp-game-join">${isMyTurn ? 'Your Turn!' : 'Resume'}</span>
                  </button>
                </div>
              `;
            }).join('')}
          </div>
          <div class="mp-section-subheader">Open lobbies</div>
        `;
      }

      if (sortedLobbies.length === 0 && myGames.length === 0) {
        container.innerHTML = `
          <p class="mp-no-games">No open games available.</p>
          <p class="mp-no-games-hint">Create a game or check back later.</p>
        `;
      } else if (sortedLobbies.length === 0) {
        container.innerHTML = `
          ${myGamesHtml}
          <p class="mp-no-games-hint">No open lobbies to join right now.</p>
        `;
        this._bindResumeGameButtons(container, myGames);
      } else {
        container.innerHTML = `
          ${myGamesHtml}
          <div class="mp-games-list">
            ${sortedLobbies.map(lobby => {
              const isOwnLobby = lobby.hostId === user?.id;
              const playersNeeded = lobby.settings.maxPlayers - lobby.players.length;
              const waitingText = playersNeeded === 1 ? 'Waiting for 1 player' : `Waiting for ${playersNeeded} players`;
              return `
                <div class="mp-game-row ${isOwnLobby ? 'own-lobby' : ''}">
                  <button class="mp-game-item" data-lobby-id="${lobby.id}" data-code="${lobby.code}">
                    <div class="mp-game-info">
                      <span class="mp-game-name">${lobby.name}</span>
                      <span class="mp-game-details">${lobby.players.length}/${lobby.settings.maxPlayers} players${isOwnLobby ? ' · ' + waitingText : ''}</span>
                    </div>
                    <span class="mp-game-join">${isOwnLobby ? 'Enter' : 'Join'}</span>
                  </button>
                  ${isAdmin ? `<button class="mp-admin-delete" data-delete-lobby="${lobby.id}" title="Delete (Admin)">🗑</button>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        `;

        // Bind click events for lobby items (resume buttons are bound separately)
        container.querySelectorAll('.mp-game-item[data-code]').forEach(item => {
          item.addEventListener('click', async () => {
            const code = item.dataset.code;
            const result = await this.lobbyManager.joinLobby(code, null);
            if (!result.success) {
              alert(result.error);
            } else if (result.isGame) {
              // Code matched a started game - rejoin it directly
              this.hide();
              if (this.onStart) {
                this.onStart(result.gameId, result.game);
              }
            }
          });
        });

        this._bindResumeGameButtons(container, myGames);

        // Bind admin delete buttons
        if (isAdmin) {
          container.querySelectorAll('.mp-admin-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const lobbyId = btn.dataset.deleteLobby;
              if (confirm('Delete this lobby? This cannot be undone.')) {
                const result = await this.lobbyManager.adminDeleteLobby(lobbyId);
                if (result.success) {
                  this._loadBrowseGames();
                } else {
                  alert('Failed to delete: ' + result.error);
                }
              }
            });
          });
        }
      }
    } catch (error) {
      console.error('Error loading open games:', error);
      container.innerHTML = `
        <p class="mp-no-games">Failed to load games.</p>
      `;
    }
  }

  // Wire up "Your games in progress" rows in the Open Games view
  _bindResumeGameButtons(container, myGames) {
    container.querySelectorAll('[data-resume-game-id]').forEach(item => {
      item.addEventListener('click', () => {
        const gameId = item.dataset.resumeGameId;
        const game = myGames.find(g => g.id === gameId);
        if (game) {
          this.hide();
          if (this.onStart) {
            this.onStart(gameId, game);
          }
        }
      });
    });
  }

  _showRejoinError(message) {
    this._rejoinError = message || 'Could not rejoin the live match.';
    const errorEl = this.el?.querySelector('#rejoin-error');
    if (errorEl) {
      errorEl.textContent = this._rejoinError;
      errorEl.classList.remove('hidden');
      return;
    }
    if (this.mode === 'reconnect') this._render();
  }

  async _handleRejoinLast() {
    if (this._rejoining) return false;
    this._rejoining = true;
    this._rejoinError = '';
    try {
      if (!this.authManager.isAuthReady()) {
        await this.authManager.whenReady();
      }
      if (!this.authManager.isLoggedIn()) {
        if (this.onBack) this.onBack('rejoin-auth');
        return false;
      }
      const last = readLastMatch();
      const hydrated = await this.lobbyManager.hydrateLastMatch(last);
      if (hydrated.kind === 'wait-auth' || hydrated.kind === 'show-auth') {
        if (this.onBack) this.onBack('rejoin-auth');
        return false;
      }
      if (hydrated.kind === 'game' && hydrated.game && this.onStart) {
        this.hide();
        this.onStart(hydrated.gameId || hydrated.game.id, hydrated.game);
        return true;
      }
      if (hydrated.kind === 'lobby') {
        this.mode = 'lobby';
        this._render();
        return true;
      }
      if (hydrated.kind === 'finished' || hydrated.kind === 'missing') {
        forgetLastMatch();
        this._showRejoinError(hydrated.error || 'That game is no longer active.');
        return false;
      }
      this._showRejoinError(hydrated.error || 'Could not rejoin. Try again.');
      return false;
    } catch (err) {
      console.warn('[MultiplayerLobby] Rejoin failed', err);
      this._showRejoinError(err?.message || 'Could not rejoin. Try again.');
      return false;
    } finally {
      this._rejoining = false;
    }
  }

  async _restoreLiveLobby() {
    if (this._restoringLobby) return false;
    this._restoringLobby = true;
    try {
      const last = readLastMatch();
      const view = resolveLobbyViewAfterLoss({
        currentLobby: this.lobbyManager.getLobby(),
        lastMatch: last,
      });
      if (view === 'game' || view === 'lobby' || view === 'reconnect') {
        const hydrated = await this.lobbyManager.hydrateLastMatch(last);
        if (hydrated.kind === 'game' && hydrated.game && this.onStart) {
          this.hide();
          this.onStart(hydrated.gameId || hydrated.game.id, hydrated.game);
          return true;
        }
        if (hydrated.kind === 'lobby') {
          this.mode = 'lobby';
          this._render();
          return true;
        }
        if (hydrated.kind === 'wait-auth' || hydrated.kind === 'show-auth') {
          if (this.onBack) this.onBack('rejoin-auth');
          return true;
        }
        if (view === 'reconnect' || hydrated.kind === 'error') {
          this.showReconnectOnly();
          if (hydrated.error) this._showRejoinError(hydrated.error);
          return true;
        }
      }
      this._render();
      return false;
    } finally {
      this._restoringLobby = false;
    }
  }

  _renderLobby(user) {
    const lobby = this.lobbyManager.getLobby();
    if (!lobby) {
      const last = readLastMatch();
      if (!shouldLeaveLobbyView({ snapshotMissing: true })
        && (last?.lobbyCode || last?.gameId)) {
        return this._renderLobbyRestoring(user, last);
      }
      this.mode = 'menu';
      return this._renderMenu(user);
    }

    const currentPlayer = this.lobbyManager.getCurrentPlayer();
    const isHost = this.lobbyManager.isHost();
    const canStart = this.lobbyManager.canStart();
    const factions = this.setup?.risk?.factions || FACTIONS;

    // Get taken factions and colors
    const takenFactions = new Set(lobby.players.map(p => p.factionId).filter(Boolean));
    const takenColors = new Set(lobby.players.map(p => p.color).filter(Boolean));

    return `
      <div class="mp-lobby-active">
        <div class="mp-lobby-header-bar">
          <div class="mp-lobby-title-group">
            <h2>${lobby.name}</h2>
            <div class="mp-code-badge">
              <span class="code-label">CODE</span>
              <span class="code-value">${lobby.code}</span>
              <button class="copy-btn" data-action="copy-code" title="Copy code">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
              </button>
            </div>
          </div>
        </div>

        <div class="mp-players-section modern">
          <div class="mp-section-header">
            <h3>Players <span class="player-count">${lobby.players.length}/${lobby.settings.maxPlayers}</span></h3>
            ${isHost && lobby.players.length < lobby.settings.maxPlayers ? `
              <button class="mp-add-ai-btn" data-action="add-ai">
                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                Add AI
              </button>
            ` : ''}
          </div>
          <div class="mp-players-grid">
            ${lobby.players.map((player, index) => {
              const isMe = player.oderId === user?.id;
              const isAI = player.isAI;
              const faction = factions.find(f => f.id === player.factionId);
              return `
                <div class="mp-player-item ${isMe ? 'is-me' : ''} ${faction ? 'ready' : ''}">
                  <div class="mp-player-avatar" style="border-color: ${player.color || '#64748b'}">
                    ${faction ? `<img src="assets/flags/${faction.flag}" alt="${faction.name}">` : '<span class="no-faction">?</span>'}
                  </div>
                  <div class="mp-player-details">
                    <span class="mp-player-name">${player.displayName}</span>
                    <span class="mp-player-id" style="font-size: 0.65em; color: #888; margin-left: 4px;">(${player.oderId ? '...' + player.oderId.slice(-6) : 'no-id'})</span>
                    <div class="mp-player-badges">
                      ${player.isHost ? '<span class="badge host">HOST</span>' : ''}
                      ${isAI ? `<span class="badge ai">${player.aiDifficulty?.toUpperCase() || 'AI'}</span>` : ''}
                      ${!isAI && !player.isHost ? `<span class="badge ${player.isReady ? 'ready' : 'waiting'}">${player.isReady ? 'READY' : 'SELECTING'}</span>` : ''}
                    </div>
                    ${isMe && !isAI ? `
                      <label class="mp-discord-field">
                        Discord
                        <input type="text" class="mp-discord-input" data-action="discord-id" maxlength="48" placeholder="ID or username (optional)" value="${player.discordUserId || player.discordName || ''}" autocomplete="off">
                      </label>
                    ` : (!isAI && (player.discordName || player.discordUserId) ? `<span class="mp-discord-linked">Discord linked</span>` : '')}
                  </div>
                  ${isAI && isHost ? `
                    <button class="mp-remove-btn" data-action="remove-ai" data-index="${index}" data-oder-id="${player.oderId || ''}" title="Remove AI">×</button>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="mp-selection-section modern">
          <div class="mp-selection-group">
            <h4>Your Faction</h4>
            <div class="mp-faction-grid modern">
              ${factions.map(faction => {
                const isTaken = takenFactions.has(faction.id) && currentPlayer?.factionId !== faction.id;
                const isSelected = currentPlayer?.factionId === faction.id;
                return `
                  <button class="mp-faction-btn ${isSelected ? 'selected' : ''} ${isTaken ? 'taken' : ''}"
                          data-faction="${faction.id}" ${isTaken ? 'disabled' : ''}>
                    <img src="assets/flags/${faction.flag}" alt="${faction.name}">
                    <span>${faction.name}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          <div class="mp-selection-group">
            <h4>Your Color</h4>
            <div class="mp-color-grid modern">
              ${FACTION_COLORS.map(colorDef => {
                const isTaken = takenColors.has(colorDef.color) && currentPlayer?.color !== colorDef.color;
                const isSelected = currentPlayer?.color === colorDef.color;
                return `
                  <button class="mp-color-btn ${isSelected ? 'selected' : ''} ${isTaken ? 'taken' : ''}"
                          data-color="${colorDef.color}" ${isTaken ? 'disabled' : ''}
                          style="background: ${colorDef.color}" title="${colorDef.name}">
                    ${isSelected ? '<svg viewBox="0 0 24 24" fill="white" width="16" height="16"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          ${isHost ? `
            <div class="mp-game-options">
              <label class="mp-toggle-inline">
                <input type="checkbox" id="lobby-teams" ${lobby.settings?.teamsEnabled ? 'checked' : ''}>
                <span class="toggle-slider small"></span>
                <span class="toggle-label-text">Team Mode</span>
              </label>
            </div>
          ` : (lobby.settings?.teamsEnabled ? `
            <div class="mp-team-mode-badge">Team Mode Enabled</div>
          ` : '')}
        </div>

        <div class="mp-lobby-actions">
          ${lobby.isPublished
            ? `<button class="mp-action-btn secondary" data-action="back-to-browse">← Back</button>`
            : ''
          }
          <button class="mp-action-btn ${isHost && lobby.isPublished ? 'danger-outline' : 'secondary'}" data-action="leave">
            ${isHost && lobby.isPublished ? 'Delete Lobby' : 'Leave Lobby'}
          </button>
          ${(() => {
            const isFull = lobby.players.length >= lobby.settings.maxPlayers;
            const allHaveFactions = lobby.players.every(p => p.factionId);
            const canStart = lobby.players.length >= 2 && allHaveFactions && (isHost || isFull);
            const hostCta = resolveHostLobbyPrimaryCta({
              isHost,
              playerCount: lobby.players.length,
              allHaveFactions,
              hostHasFaction: !!(currentPlayer?.factionId && currentPlayer?.color),
            });

            if (hostCta) {
              return `
                <button class="mp-action-btn start" data-action="start" ${hostCta.disabled ? 'disabled' : ''}>
                  ${hostCta.label}
                </button>
                ${hostCta.hint ? `<p class="mp-action-hint">${hostCta.hint}</p>` : ''}
                ${!lobby.isPublished ? `
                  <button class="mp-action-btn secondary" data-action="publish">
                    List in Open Games
                  </button>
                ` : ''}
              `;
            } else if (canStart) {
              return `<button class="mp-action-btn start" data-action="start"
                        ${!currentPlayer?.factionId || !currentPlayer?.color ? 'disabled' : ''}>
                  Start Game
                </button>`;
            } else {
              return `
                <button class="mp-action-btn ${currentPlayer?.isReady ? 'ready' : 'primary'}" data-action="ready"
                        ${!currentPlayer?.factionId || !currentPlayer?.color ? 'disabled' : ''}>
                  ${currentPlayer?.isReady ? 'Cancel Ready' : 'Ready Up'}
                </button>
                <div class="mp-waiting-indicator">
                  <div class="waiting-dot"></div>
                  <span>Waiting for more players...</span>
                </div>
              `;
            }
          })()}
        </div>
      </div>
    `;
  }

  _bindEvents() {
    this.el.querySelector('[data-action="dismiss-rejoin"]')?.addEventListener('click', () => {
      this._rejoinDismissed = true;
      this._fromReconnect = false;
      if (shouldForgetLastMatchOnDismissRejoin({ confirmedLeave: true })) {
        forgetLastMatch();
      }
      this.mode = 'menu';
      this._render();
    });

    this.el.querySelector('[data-action="rejoin-last"]')?.addEventListener('click', async () => {
      await this._handleRejoinLast();
    });

    this.el.querySelector('[data-action="refresh-browse"]')?.addEventListener('click', () => {
      this._loadBrowseGames();
    });

    this.el.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      const last = readLastMatch();
      if (!shouldNavigateToHome({
        explicitExit: true,
        lastMatch: last,
        liveLobby: !!this.lobbyManager.getLobby(),
      })) {
        void this._restoreLiveLobby();
        return;
      }
      this.hide();
      if (this.onBack) {
        this.onBack();
      }
    });

    this.el.querySelector('[data-action="signout"]')?.addEventListener('click', async () => {
      await this.authManager.signOut();
      this.hide();
      if (this.onBack) {
        this.onBack('signout');
      }
    });

    this.el.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      this.mode = this._fromReconnect ? 'reconnect' : 'menu';
      this._render();
    });

    // Private checkbox - show/hide password field
    this.el.querySelector('#create-private')?.addEventListener('change', (e) => {
      const passwordField = this.el.querySelector('#password-field');
      if (passwordField) {
        passwordField.classList.toggle('hidden', !e.target.checked);
        if (!e.target.checked) {
          const passwordInput = this.el.querySelector('#create-password');
          if (passwordInput) passwordInput.value = '';
        }
      }
    });

    // Load browse games when in browse mode
    if (this.mode === 'browse') {
      this._loadBrowseGames();
    }

    // Create form
    this.el.querySelector('[data-form="create"]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handleCreate(e.target);
    });

    // Join form
    this.el.querySelector('[data-form="join"]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      await this._handleJoin(e.target);
    });

    // Lobby actions
    this.el.querySelector('[data-action="copy-code"]')?.addEventListener('click', () => {
      const lobby = this.lobbyManager.getLobby();
      if (lobby) {
        navigator.clipboard.writeText(lobby.code);
      }
    });

    this.el.querySelector('[data-action="leave"]')?.addEventListener('click', async () => {
      if (!shouldLeaveLobbyView({ explicitLeave: true })) return;
      await this.lobbyManager.leaveLobby();
      this.mode = 'menu';
      this._render();
    });

    // Back to browse (for host returning to Open Games without leaving)
    this.el.querySelector('[data-action="back-to-browse"]')?.addEventListener('click', () => {
      this.lobbyManager.disconnectFromLobby();
      this.mode = 'browse';
      this._render();
      this._loadBrowseGames();
    });

    this.el.querySelector('[data-action="ready"]')?.addEventListener('click', async () => {
      await this.lobbyManager.toggleReady();
    });

    this.el.querySelector('[data-action="start"]')?.addEventListener('click', async (e) => {
      // Disable during the async create — a double-click here used to create
      // TWO game documents in Firestore
      const btn = e.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Starting…';
      const result = await this.lobbyManager.startGame();
      if (!result.success) {
        alert(result.error);
        btn.disabled = false;
        btn.textContent = originalText;
        return;
      }
      // Already-started lobby (CEVX6F): reopen that gameId. Do not wait
      // for a status snapshot that will not fire again.
      if (result.reused && result.gameId && this.onStart) {
        this.hide();
        this.onStart(result.gameId, this.lobbyManager.currentLobby);
      }
    });

    // Publish lobby (make visible in Open Games, then go to browse)
    this.el.querySelector('[data-action="publish"]')?.addEventListener('click', async () => {
      const result = await this.lobbyManager.publishLobby();
      if (result.success) {
        this.mode = 'lobby';
        this._render();
      } else {
        alert(result.error);
      }
    });

    // Faction selection
    this.el.querySelector('[data-action="discord-id"]')?.addEventListener('change', async (e) => {
      const fields = parseDiscordSeatInput(e.target.value);
      rememberDiscordSeat(fields);
      await this.lobbyManager.updatePlayer(fields);
    });

    this.el.querySelectorAll('.mp-faction-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        const factionId = btn.dataset.faction;
        const currentPlayer = this.lobbyManager.getCurrentPlayer();
        await this.lobbyManager.selectFaction(factionId, currentPlayer?.color);
      });
    });

    // Color selection
    this.el.querySelectorAll('.mp-color-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async () => {
        const color = btn.dataset.color;
        const currentPlayer = this.lobbyManager.getCurrentPlayer();
        await this.lobbyManager.selectFaction(currentPlayer?.factionId, color);
      });
    });

    // Add AI button
    this.el.querySelector('[data-action="add-ai"]')?.addEventListener('click', () => {
      this._showAddAIDialog();
    });

    // Remove AI buttons
    this.el.querySelectorAll('[data-action="remove-ai"]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const index = parseInt(btn.dataset.index, 10);
        await this.lobbyManager.removeAIPlayer({
          index: Number.isInteger(index) ? index : null,
          oderId: btn.dataset.oderId || null,
        });
      });
    });

    // Team mode toggle (host only)
    this.el.querySelector('#lobby-teams')?.addEventListener('change', async (e) => {
      await this.lobbyManager.updateSettings({ teamsEnabled: e.target.checked });
    });
  }

  _showAddAIDialog() {
    const factions = this.setup?.risk?.factions || FACTIONS;
    const lobby = this.lobbyManager.getLobby();
    const takenFactions = new Set(lobby.players.map(p => p.factionId).filter(Boolean));
    const takenColors = new Set(lobby.players.map(p => p.color).filter(Boolean));

    // Find available faction and color
    const availableFaction = factions.find(f => !takenFactions.has(f.id));
    const availableColor = FACTION_COLORS.find(c => !takenColors.has(c.color));

    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'mp-ai-dialog-overlay';
    dialog.innerHTML = `
      <div class="mp-ai-dialog">
        <h3>Add AI Player</h3>
        <div class="mp-field">
          <label>Difficulty</label>
          <select id="ai-difficulty">
            ${AI_DIFFICULTIES.map(d => `<option value="${d.id}">${d.name}</option>`).join('')}
          </select>
        </div>
        <div class="mp-field">
          <label>Faction</label>
          <select id="ai-faction">
            ${factions.map(f => `
              <option value="${f.id}" ${takenFactions.has(f.id) ? 'disabled' : ''} ${f.id === availableFaction?.id ? 'selected' : ''}>
                ${f.name} ${takenFactions.has(f.id) ? '(Taken)' : ''}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="mp-field">
          <label>Color</label>
          <select id="ai-color">
            ${FACTION_COLORS.map(c => `
              <option value="${c.color}" ${takenColors.has(c.color) ? 'disabled' : ''} ${c.color === availableColor?.color ? 'selected' : ''}>
                ${c.name} ${takenColors.has(c.color) ? '(Taken)' : ''}
              </option>
            `).join('')}
          </select>
        </div>
        <div class="mp-form-buttons">
          <button type="button" class="mp-cancel-btn" data-action="cancel-ai">Cancel</button>
          <button type="button" class="mp-submit-btn" data-action="confirm-ai">Add AI</button>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Bind dialog events
    dialog.querySelector('[data-action="cancel-ai"]').addEventListener('click', () => {
      dialog.remove();
    });

    dialog.querySelector('[data-action="confirm-ai"]').addEventListener('click', async () => {
      const difficulty = dialog.querySelector('#ai-difficulty').value;
      const factionId = dialog.querySelector('#ai-faction').value;
      const color = dialog.querySelector('#ai-color').value;

      await this.lobbyManager.addAIPlayer(difficulty, factionId, color);
      dialog.remove();
    });

    // Close on overlay click
    dialog.addEventListener('click', (e) => {
      if (e.target === dialog) {
        dialog.remove();
      }
    });
  }

  async _handleCreate(form) {
    if (this._blocksCompetingEntry()) return;
    const name = form.querySelector('#create-name').value;
    const maxPlayers = parseInt(form.querySelector('#create-max-players').value);
    const startingIPCs = parseInt(form.querySelector('#create-ipcs').value);
    const isPrivate = form.querySelector('#create-private').checked;
    const password = isPrivate ? form.querySelector('#create-password').value : null;

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await this.lobbyManager.createLobby(name, {
        maxPlayers,
        startingIPCs,
        password: password || null,
        teamsEnabled: false // Team mode can be enabled in the lobby
      });

      if (!result.success) {
        const errorEl = form.querySelector('#create-error');
        if (errorEl) {
          errorEl.textContent = result.error;
          errorEl.classList.remove('hidden');
        }
        if (submitBtn) submitBtn.disabled = false;
      }
      // On success: lobby subscription will update mode to 'lobby'
    } catch (error) {
      console.error('Error creating lobby:', error);
      const errorEl = form.querySelector('#create-error');
      if (errorEl) {
        errorEl.textContent = 'Unexpected error. Please try again.';
        errorEl.classList.remove('hidden');
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  async _handleJoin(form) {
    if (this._blocksCompetingEntry()) return;
    const code = form.querySelector('#join-code').value.toUpperCase();
    const password = form.querySelector('#join-password').value;

    const result = await this.lobbyManager.joinLobby(code, password || null);

    if (!result.success) {
      const errorEl = form.querySelector('#join-error');
      if (errorEl) {
        errorEl.textContent = result.error;
        errorEl.classList.remove('hidden');
      }
    } else if (result.isGame) {
      // Code matched a started game - rejoin it directly
      this.hide();
      if (this.onStart) {
        this.onStart(result.gameId, result.game);
      }
    }
    // For lobbies, subscription will update mode to 'lobby'
  }

  async _loadAvailableGames() {
    const container = this.el.querySelector('#available-games');
    if (!container) return;

    const isAdmin = this.lobbyManager.isAdmin();

    try {
      const lobbies = await this.lobbyManager.getOpenLobbies();

      if (lobbies.length === 0) {
        container.innerHTML = `
          <h3 class="mp-section-title">Open Games</h3>
          <p class="mp-no-games">No open games available. Create one or join by code.</p>
        `;
      } else {
        container.innerHTML = `
          <h3 class="mp-section-title">Open Games</h3>
          <div class="mp-games-list">
            ${lobbies.map(lobby => `
              <div class="mp-game-row">
                <button class="mp-game-item" data-lobby-id="${lobby.id}" data-code="${lobby.code}">
                  <div class="mp-game-info">
                    <span class="mp-game-name">${lobby.name}</span>
                    <span class="mp-game-players">${lobby.players.length}/${lobby.settings.maxPlayers} players</span>
                  </div>
                  <span class="mp-game-join">Join</span>
                </button>
                ${isAdmin ? `<button class="mp-admin-delete" data-delete-lobby="${lobby.id}" title="Delete (Admin)">🗑</button>` : ''}
              </div>
            `).join('')}
          </div>
        `;

        // Bind click events for game items
        container.querySelectorAll('.mp-game-item').forEach(item => {
          item.addEventListener('click', async () => {
            const code = item.dataset.code;
            const result = await this.lobbyManager.joinLobby(code, null);
            if (!result.success) {
              alert(result.error);
            } else if (result.isGame) {
              // Code matched a started game - rejoin it directly
              this.hide();
              if (this.onStart) {
                this.onStart(result.gameId, result.game);
              }
            }
          });
        });

        // Bind admin delete buttons
        if (isAdmin) {
          container.querySelectorAll('.mp-admin-delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
              e.stopPropagation();
              const lobbyId = btn.dataset.deleteLobby;
              if (confirm('Delete this lobby? This cannot be undone.')) {
                const result = await this.lobbyManager.adminDeleteLobby(lobbyId);
                if (result.success) {
                  this._loadAvailableGames(); // Refresh list
                } else {
                  alert('Failed to delete: ' + result.error);
                }
              }
            });
          });
        }
      }
    } catch (error) {
      console.error('Error loading available games:', error);
      container.innerHTML = `
        <h3 class="mp-section-title">Open Games</h3>
        <p class="mp-no-games">Failed to load games.</p>
      `;
    }
  }
}
