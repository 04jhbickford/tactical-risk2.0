// Multiplayer Lobby UI for Tactical Risk
// Shows players, ready status, faction selection, and game start

import { getLobbyManager } from '../multiplayer/lobbyManager.js';
import { getAuthManager } from '../multiplayer/auth.js';
import { GAME_VERSION } from './lobby.js';
import { captureLobbyScroll, restoreLobbyScroll } from './lobbyScroll.js';
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
  resolveLobbyBackTarget,
  shouldForceLobbyRoomOnSnapshot,
  shouldHonorLobbyBack,
  resolveOpenGamesEntry,
  resolveOpenGamesRowEntry,
  shouldStayOnOpenGamesList,
  shouldBlockCompetingEntryForms,
  resolveRejoinRecoveryUi,
  resolveReconnectCopy,
  shouldForgetLastMatchOnDismissRejoin,
  resolveMyGamesEntryAction,
} from '../multiplayer/lastMatch.js';
import {
  lobbyChromeStatusAfter,
  resolveHostLobbyPrimaryCta,
  resolveLobbyRoomChrome,
  shouldShowListInOpenGames,
} from '../multiplayer/lobbyStart.js';
import { seatNamesForOpenGameCard } from '../multiplayer/lobbySeats.js';
import {
  describe,
  mergeGameOptionsIntoSettings,
  normalizeGameOptions,
  optionsFromSettings,
  rulesChip,
  settingsEditError,
} from '../gameOptions.js';
import { bindGameOptions, readGameOptionsFrom, renderGameOptionsPanel } from './gameOptionsPanel.js';
import {
  parseDiscordSeatInput,
  readRememberedDiscordSeat,
  rememberDiscordSeat,
} from '../multiplayer/discordTurnPing.js';
import {
  captureFocusedDiscordDraft,
  createDiscordSeatSaver,
  lobbyPlayerDiscordHtml,
  nextDiscordPrefill,
  restoreFocusedDiscordDraft,
  sameDiscordSeat,
} from '../multiplayer/discordSeat.js';
import { resolveHostAwayBanner } from '../ui/hudClarity.js';
import {
  formatWelcomeEmail,
  formatWelcomeName,
  isRealAuthIdentity,
  resolveAuthSurface,
} from '../multiplayer/authSession.js';

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

const DISCORD_SEAT_INPUT = 'input.mp-discord-input[data-action="discord-id"]';

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
    this._browsingAway = false;
    // 9.23.26.01 — Open Games list stays up until a bar click.
    this._openGamesList = false;
    // Hub after explicit Main Menu: snapshots must not resume a map or room.
    this._holdHub = false;
    this._discordPrefillInflight = false;
    this._optimisticDiscord = null;
    this._discordRev = 0;
    this._discordSaver = createDiscordSeatSaver({
      commit: (raw) => this._commitDiscordSeat(raw),
    });
    this._draftOptions = normalizeGameOptions(null);
    this._optionsOpen = false;
    this._optionsSheet = false;
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
      this._holdHub = false;
      this._openGamesList = false;
      this._browsingAway = false;
      this.mode = 'create';
      this._render();
      return;
    }
    if (action === 'browse') {
      this._showOpenGamesList();
    }
  }

  // Open Games is the list. Never hide into the canvas or auto-join
  // the room that was just listed (9.23.26.01).
  _showOpenGamesList() {
    if (this._blocksCompetingEntry()) return;
    const plan = resolveOpenGamesEntry({
      inGameSession: false,
      lastMatch: readLastMatch(),
      liveLobbyWaiting: !!(this.lobbyManager.getLobby()
        && (!this.lobbyManager.getLobby().status || this.lobbyManager.getLobby().status === 'waiting')),
    });
    if (plan.screen !== 'browse' || plan.autoEnterMap || plan.autoEnterLobby) return;
    this._holdHub = false;
    this._openGamesList = true;
    this._browsingAway = true;
    if (plan.disconnectLobbyView) {
      this.lobbyManager.disconnectFromLobby({ notify: false });
    }
    this.mode = 'browse';
    if (this.el.classList.contains('hidden')) this.show();
    else this._render();
    this._syncOpenGamesChrome();
  }

  _syncOpenGamesChrome() {
    if (typeof document === 'undefined') return;
    const visible = !!(this.el
      && !this.el.classList.contains('hidden')
      && this.mode === 'browse'
      && this._openGamesList);
    document.documentElement.classList.toggle('tr-open-games', visible);
  }

  _blocksCompetingEntry() {
    return shouldBlockCompetingEntryForms({
      rejoinRequired: this.mode === 'reconnect',
      dismissed: !!this._rejoinDismissed,
    });
  }

  _openJoinByCode() {
    if (this._blocksCompetingEntry()) return;
    this._holdHub = false;
    this._openGamesList = false;
    this._browsingAway = false;
    if (this.mode === 'reconnect') this._fromReconnect = true;
    this.mode = 'join';
    this._render();
  }

  _openMyGames() {
    this._holdHub = false;
    this._openGamesList = false;
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
    // Paint this overlay before uncovering the canvas (9.23.26.01).
    this.el.classList.remove('hidden');
    this.el.style.display = 'flex'; // Ensure visible
    if (typeof this.onCoverHome === 'function') this.onCoverHome();
    this._syncOpenGamesChrome();
    this._subscribeToLobby();
    this._subscribeToAuth();
    void this._paintOrBounceToAuth();
  }

  async _paintOrBounceToAuth() {
    if (!this.authManager.isAuthReady()) {
      try { await this.authManager.whenReady(); } catch { /* keep going */ }
    }
    const surface = resolveAuthSurface({
      authReady: this.authManager.isAuthReady(),
      user: this.authManager.getUser(),
    });
    if (surface === 'signin') {
      this.hide();
      if (this.onBack) this.onBack('rejoin-auth');
      return;
    }
    this._render();
  }

  _subscribeToAuth() {
    if (this._unsubAuth) return;
    this._unsubAuth = this.authManager.subscribe(() => {
      if (this.el?.classList.contains('hidden')) return;
      if (this.mode !== 'menu') return;
      this._render();
    });
  }

  hide({ resetMode = true } = {}) {
    console.log('[MultiplayerLobby] hide() called');
    this._flushDiscordSeat();
    this.el.classList.add('hidden');
    this.el.style.display = 'none'; // Force hide with display none
    this._syncOpenGamesChrome();
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
      // Open Games list and the post-Main-Menu hub never follow a snapshot
      // into the map or a waiting room (9.23.26.01).
      if (shouldStayOnOpenGamesList({ openGamesList: !!this._openGamesList }) || this._holdHub) {
        return;
      }

      // Check if game is starting
      if (lobby?.status === 'starting' && lobby.gameId) {
        this._browsingAway = false;
        this.hide();
        if (this.onStart) {
          this.onStart(lobby.gameId, lobby);
        }
        return;
      }

      // Host Back to Open Games is not flicker — stay on browse/menu.
      if (this._browsingAway) {
        if (!shouldForceLobbyRoomOnSnapshot({
          browsingAway: true,
          lobbyPresent: !!lobby,
          gameStarting: lobby?.status === 'starting' && !!lobby.gameId,
        })) {
          return;
        }
      }

      // Update UI
      if (lobby) {
        this._browsingAway = false;
        this.mode = 'lobby';
        this._render();
        return;
      }

      // B41: a null snapshot is not Leave. Stay in / restore the room.
      // Explicit Back / Browse must not restore (9.20.26.08).
      if (!shouldLeaveLobbyView({
        snapshotMissing: true,
        presenceFlicker: true,
        explicitBrowse: !!this._browsingAway,
      })) {
        const view = resolveLobbyViewAfterLoss({
          currentLobby: null,
          lastMatch: readLastMatch(),
          explicitBrowse: !!this._browsingAway,
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
    const savedScroll = captureLobbyScroll(this.el);
    const discordInput = this.el?.querySelector?.(DISCORD_SEAT_INPUT) || null;
    const active = typeof document !== 'undefined' ? document.activeElement : null;
    let discordDraft = captureFocusedDiscordDraft(discordInput, active);
    // Leaving the waiting room must keep what was typed. A snapshot that
    // stays on the room must not blur the box — blur+innerHTML is what
    // wiped the host's name before `change` could stick.
    if (discordDraft && this.mode !== 'lobby') {
      this._discordSaver?.onBlur(discordDraft.value);
      discordDraft = null;
    }
    const focused = active;
    if (
      focused
      && this.el?.contains?.(focused)
      && focused !== discordInput
      && typeof focused.blur === 'function'
    ) {
      focused.blur();
    }
    this._clearOptimisticDiscordIfLanded();
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

    restoreLobbyScroll(this.el, savedScroll);
    this._syncOpenGamesChrome();
    this._bindEvents();
    if (discordDraft) {
      const nextDiscord = this.el.querySelector(DISCORD_SEAT_INPUT);
      restoreFocusedDiscordDraft(nextDiscord, discordDraft);
    }
    this._queueDiscordPrefill();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => restoreLobbyScroll(this.el, savedScroll));
    }
  }

  _clearOptimisticDiscordIfLanded() {
    const optimistic = this._optimisticDiscord;
    if (!optimistic) return;
    const me = this.lobbyManager.getCurrentPlayer?.() || null;
    if (me && sameDiscordSeat(me, optimistic)) this._optimisticDiscord = null;
  }

  _commitDiscordSeat(raw, { onlyIfEmpty = false } = {}) {
    const live = this.el?.querySelector?.(DISCORD_SEAT_INPUT) || null;
    const focused = typeof document !== 'undefined' && live && document.activeElement === live;
    const fields = parseDiscordSeatInput(focused ? live.value : raw);
    rememberDiscordSeat(fields);
    // A user edit (not the automatic prefill) invalidates an in-flight prefill.
    if (!onlyIfEmpty) this._discordRev = (this._discordRev || 0) + 1;
    const rev = this._discordRev || 0;
    const me = this.lobbyManager.getCurrentPlayer?.() || null;
    if (!onlyIfEmpty && me && sameDiscordSeat(me, fields)) {
      this._optimisticDiscord = null;
      return Promise.resolve({ success: true, unchanged: true });
    }
    this._optimisticDiscord = fields;
    return this.lobbyManager.updateDiscordSeat(fields, {
      onlyIfEmpty,
      isStale: () => this._discordRev !== rev,
    });
  }

  _flushDiscordSeat() {
    const input = this.el?.querySelector?.(DISCORD_SEAT_INPUT);
    if (!input || !this._discordSaver) return;
    this._discordSaver.onBlur(input.value);
  }

  _queueDiscordPrefill() {
    if (this.mode !== 'lobby') return;
    const input = this.el?.querySelector?.(DISCORD_SEAT_INPUT) || null;
    const editing = typeof document !== 'undefined' && input && document.activeElement === input;
    const next = nextDiscordPrefill({
      inFlight: !!this._discordPrefillInflight,
      seat: this.lobbyManager.getCurrentPlayer?.() || null,
      remembered: readRememberedDiscordSeat(),
      editing: !!editing,
    });
    if (!next.patch) return;
    this._discordPrefillInflight = true;
    const raw = next.patch.discordUserId || next.patch.discordName || '';
    Promise.resolve(this._commitDiscordSeat(raw, { onlyIfEmpty: true })).finally(() => {
      this._discordPrefillInflight = false;
    });
  }

  _renderMenu(user) {
    const welcome = formatWelcomeName(user);
    const email = formatWelcomeEmail(user);
    const userIdShort = user?.id ? user.id.slice(-8) : '';
    if (!isRealAuthIdentity(user) || !welcome) {
      return `
      <div class="mp-identity-box">
        <p class="mp-welcome">Restoring your session…</p>
        <p class="mp-identity-details">You were signed in. Hang on.</p>
      </div>`;
    }

    return `
      <div class="mp-identity-box">
        <p class="mp-welcome">Welcome, <strong>${welcome}</strong></p>
        <p class="mp-identity-details">
          Logged in as: <strong>${email || welcome}</strong>
          ${userIdShort ? `<span class="mp-user-id">(ID: ...${userIdShort})</span>` : ''}
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
        <button type="button" class="mp-secondary-btn" data-action="open-my-games">
          My Games
        </button>
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
        ${renderGameOptionsPanel(this._draftOptions, {
          editable: true,
          open: this._optionsOpen,
          sheet: this._optionsSheet,
        })}
        <p class="game-rules-preview go-live-mirror">${describe(this._draftOptions)}</p>
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
              const rowAction = resolveMyGamesEntryAction({
                kind: 'game',
                status: game.status,
                stateVersion: game.stateVersion,
                hasState: !!game.state,
              });
              return `
                <div class="mp-game-row own-lobby">
                  <button class="mp-game-item ${isMyTurn ? 'my-turn' : ''}" data-resume-game-id="${game.id}" data-row-action="${rowAction.action}" data-lobby-code="${game.lobbyCode || game.lobbyData?.code || ''}">
                    <div class="mp-game-info">
                      <span class="mp-game-name">${playerNames || 'Game in progress'}</span>
                      <span class="mp-game-details">${isStarting ? 'Starting' : `Round ${round}`} · ${seatNames.length || players.length} players</span>
                      <span class="mp-rules-chip">${rulesChip(game.state?.gameOptions || game.lobbyData?.settings?.gameOptions, game.lobbyData?.settings)}</span>
                    </div>
                    <span class="mp-game-join">${isMyTurn && rowAction.action === 'rejoin-map' ? 'Your Turn!' : rowAction.label}</span>
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
                      <span class="mp-rules-chip">${rulesChip(lobby.settings?.gameOptions, lobby.settings)}</span>
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
            // Listed waiting bar → lobby chrome only. Never the map (9.23.26.01).
            const row = resolveOpenGamesRowEntry({ kind: 'lobby', status: 'waiting' });
            if (row.screen !== 'lobby') return;
            this._openGamesList = false;
            this._holdHub = false;
            this._browsingAway = false;
            const code = item.dataset.code;
            const result = await this.lobbyManager.joinLobby(code, null);
            if (!result.success) {
              this._openGamesList = true;
              this._browsingAway = true;
              alert(result.error);
              this._render();
              return;
            }
            this.mode = 'lobby';
            this._syncOpenGamesChrome();
            this._render();
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
      item.addEventListener('click', async () => {
        const gameId = item.dataset.resumeGameId;
        const game = myGames.find(g => g.id === gameId);
        if (!game) return;
        const decision = resolveOpenGamesRowEntry({
          kind: 'game',
          status: game.status,
          stateVersion: game.stateVersion,
          hasState: !!game.state,
        });
        if (decision.action === 'open-lobby' || decision.screen === 'lobby') {
          const code = game.lobbyCode || game.lobbyData?.code || item.dataset.lobbyCode;
          if (!code) return;
          const joined = await this.lobbyManager.joinLobby(code, null);
          if (!joined.success) {
            alert(joined.error);
            return;
          }
          this._openGamesList = false;
          this._holdHub = false;
          this._browsingAway = false;
          this.mode = 'lobby';
          this._render();
          return;
        }
        this._openGamesList = false;
        this._holdHub = false;
        this.hide();
        if (this.onStart) {
          this.onStart(gameId, game);
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
    this._holdHub = false;
    this._openGamesList = false;
    this._browsingAway = false;
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
    if (this._openGamesList || this._holdHub) return false;
    if (this._browsingAway) return false;
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
      if (!shouldLeaveLobbyView({
        snapshotMissing: true,
        explicitBrowse: !!this._browsingAway,
      }) && (last?.lobbyCode || last?.gameId)) {
        return this._renderLobbyRestoring(user, last);
      }
      this.mode = this._browsingAway ? (this.mode === 'browse' ? 'browse' : 'menu') : 'menu';
      if (this.mode === 'browse') return this._renderBrowse(user);
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
                    ${lobbyPlayerDiscordHtml({
                      player,
                      userId: user?.id,
                      remembered: readRememberedDiscordSeat(),
                      optimistic: this._optimisticDiscord,
                    })}
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
                  <button type="button" class="mp-faction-btn ${isSelected ? 'selected' : ''} ${isTaken ? 'taken' : ''}"
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
                  <button type="button" class="mp-color-btn ${isSelected ? 'selected' : ''} ${isTaken ? 'taken' : ''}"
                          data-color="${colorDef.color}" ${isTaken ? 'disabled' : ''}
                          style="background: ${colorDef.color}" title="${colorDef.name}">
                    ${isSelected ? '<svg viewBox="0 0 24 24" fill="white" width="16" height="16"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
                  </button>
                `;
              }).join('')}
            </div>
          </div>

          ${renderGameOptionsPanel(optionsFromSettings(lobby.settings), {
            editable: isHost,
            open: this._optionsOpen,
            sheet: this._optionsSheet,
          })}
          <p class="game-rules-preview go-live-mirror">${describe(optionsFromSettings(lobby.settings))}</p>
        </div>

        <div class="mp-lobby-actions">
          ${lobby.isPublished
            ? `<button class="mp-action-btn secondary" data-action="back-to-browse">← Back</button>`
            : ''
          }
          ${(() => {
            const roomChrome = resolveLobbyRoomChrome({
              isHost,
              isPublished: !!lobby.isPublished,
            });
            const unlistBtn = roomChrome.unlist.visible
              ? `<button class="mp-action-btn danger-outline" data-action="unlist">${roomChrome.unlist.label}</button>`
              : '';
            const mainMenuBtn = roomChrome.mainMenu.visible
              ? `<button class="mp-action-btn secondary" data-action="main-menu">${roomChrome.mainMenu.label}</button>`
              : '';
            return `${unlistBtn}${mainMenuBtn}`;
          })()}
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
                ${shouldShowListInOpenGames({ isHost, isPublished: !!lobby.isPublished }) ? `
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
    this.el.querySelector('[data-action="open-my-games"]')?.addEventListener('click', () => {
      this._openMyGames();
    });

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
      this._browsingAway = true;
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
      if (this.mode === 'browse') {
        this._openGamesList = false;
        this._browsingAway = true;
        this._holdHub = true;
      }
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

    this.el.querySelector('[data-action="unlist"]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled || this._unlisting) return;
      const live = this.lobbyManager.getLobby();
      const outcome = lobbyChromeStatusAfter({
        action: 'unlist',
        isPublished: !!live?.isPublished,
        isHost: this.lobbyManager.isHost(),
      });
      if (!outcome.allowed || outcome.navigate) return;
      this._unlisting = true;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Unlisting…';
      const result = await this.lobbyManager.unlistLobby();
      this._unlisting = false;
      if (result.success) {
        this.mode = 'lobby';
        this._render();
      } else {
        btn.disabled = false;
        btn.textContent = originalText;
        alert(result.error || 'Could not unlist');
      }
    });

    // Main Menu leaves the room VIEW. Listed/unlisted is not written.
    this.el.querySelector('[data-action="main-menu"]')?.addEventListener('click', () => {
      const live = this.lobbyManager.getLobby();
      const before = !!live?.isPublished;
      const outcome = lobbyChromeStatusAfter({
        action: 'main-menu',
        isPublished: before,
        isHost: this.lobbyManager.isHost(),
      });
      if (outcome.navigate !== 'main' || outcome.changed || outcome.isPublished !== before) return;
      this._openGamesList = false;
      this._holdHub = false;
      this._browsingAway = true;
      this.lobbyManager.disconnectFromLobby({ notify: false });
      this.hide();
      if (this.onBack) this.onBack('main-menu');
    });

    // Back to Open Games (host stays seated in Firestore; view leaves the room)
    this.el.querySelector('[data-action="back-to-browse"]')?.addEventListener('click', () => {
      if (!shouldHonorLobbyBack({ explicitBack: true })) return;
      this._holdHub = false;
      this._openGamesList = true;
      this._browsingAway = true;
      const target = resolveLobbyBackTarget({
        published: !!this.lobbyManager.getLobby()?.isPublished,
        hasBrowse: true,
      });
      this.lobbyManager.disconnectFromLobby({ notify: false });
      this.mode = target === 'browse' ? 'browse' : 'menu';
      if (this.mode !== 'browse') {
        this._openGamesList = false;
        this._holdHub = true;
      }
      this._render();
      if (this.mode === 'browse') this._loadBrowseGames();
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

    // Publish lobby (one click lists; stay in the room)
    this.el.querySelector('[data-action="publish"]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      if (btn.disabled || this._publishing) return;
      this._publishing = true;
      btn.disabled = true;
      const originalText = btn.textContent;
      btn.textContent = 'Listing…';
      const result = await this.lobbyManager.publishLobby();
      this._publishing = false;
      if (result.success) {
        this.mode = 'lobby';
        this._render();
      } else {
        btn.disabled = false;
        btn.textContent = originalText;
        alert(result.error);
      }
    });

    // Discord name: save while typing, and again on blur / Enter.
    // `change` alone never fired until blur, and the snapshot blur rebuilt
    // the box from the still-empty seat.
    this.el.querySelector(DISCORD_SEAT_INPUT)?.addEventListener('input', (e) => {
      this._discordSaver?.onInput(e.target.value);
    });
    this.el.querySelector(DISCORD_SEAT_INPUT)?.addEventListener('blur', (e) => {
      this._discordSaver?.onBlur(e.target.value);
    });
    this.el.querySelector(DISCORD_SEAT_INPUT)?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      this._discordSaver?.onEnter(e.target.value);
    });

    this.el.querySelectorAll('.mp-faction-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        const factionId = btn.dataset.faction;
        const currentPlayer = this.lobbyManager.getCurrentPlayer();
        await this.lobbyManager.selectFaction(factionId, currentPlayer?.color);
      });
    });

    // Color selection
    this.el.querySelectorAll('.mp-color-btn:not([disabled])').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
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

    bindGameOptions(this.el, {
      onChange: (next) => this._commitGameOptions(next),
      onToggle: ({ open, sheet }) => {
        this._optionsOpen = open;
        this._optionsSheet = sheet;
      },
    });
  }

  async _commitGameOptions(next) {
    if (this.mode === 'create') {
      this._draftOptions = normalizeGameOptions(next);
      this.el?.querySelectorAll('.go-live-mirror').forEach((el) => {
        el.textContent = describe(this._draftOptions);
      });
      const collapsed = this.el?.querySelector('.go-collapsed .go-summary-text');
      if (collapsed) collapsed.textContent = describe(this._draftOptions);
      return;
    }
    const lobby = this.lobbyManager.getLobby();
    const isHost = this.lobbyManager.isHost();
    const denied = settingsEditError({ isHost });
    if (denied) return;
    const settings = mergeGameOptionsIntoSettings(lobby?.settings, next);
    await this.lobbyManager.updateSettings({
      maxPlayers: settings.maxPlayers,
      startingIPCs: settings.startingIPCs,
      teamsEnabled: settings.teamsEnabled,
      gameOptions: settings.gameOptions,
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
    const drafted = readGameOptionsFrom(form);
    this._draftOptions = drafted;
    const maxPlayers = drafted.maxPlayers;
    const startingIPCs = drafted.startingIPCs;
    const isPrivate = form.querySelector('#create-private').checked;
    const password = isPrivate ? form.querySelector('#create-password').value : null;

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    this._browsingAway = false;
    try {
      const result = await this.lobbyManager.createLobby(name, {
        maxPlayers,
        startingIPCs,
        password: password || null,
        teamsEnabled: drafted.teams,
        gameOptions: drafted,
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

    this._browsingAway = false;
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
