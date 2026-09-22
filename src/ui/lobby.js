// Modern Lobby UI for Tactical Risk
// Clean two-stage flow: Play Mode Selection → Game Setup

// Version constants live in src/version.js (dependency-free) so the multiplayer
// sync path can import them without pulling in UI code. Imported for local use
// (the version badge) AND re-exported for the many UI modules that already
// import GAME_VERSION from lobby.js. A bare `export … from` would satisfy those
// importers but leave GAME_VERSION undefined inside this module.
import { GAME_VERSION } from '../version.js';
import { isMobileShell } from './mobileShell.js';
import { captureLobbyScroll, restoreLobbyScroll } from './lobbyScroll.js';
export { GAME_VERSION };

// Native <select> option taps land on the card under the popup.
export const LOBBY_SELECT_TOGGLE_GUARD_MS = 750;

export function shouldIgnoreFactionCardToggle({
  now, ignoreUntil, playerId = null, lockedPlayerId = null,
} = {}) {
  if (Number(now) >= Number(ignoreUntil || 0)) return false;
  if (lockedPlayerId && playerId && lockedPlayerId !== playerId) return false;
  return Number(now) < Number(ignoreUntil || 0);
}

// Phone: seat on pointerdown. The leftover click after _render() would
// unseat the same card (looks like the first "Tap to add" was swallowed).
export function shouldSeatFactionOnPointerDown({ mobile } = {}) {
  return !!mobile;
}

// Shared with New UX Three lobby so option labels stay one source of truth.
export const AI_DIFFICULTIES = [
  { id: 'human', name: 'Human', desc: 'Local player' },
  { id: 'easy', name: 'Easy AI', desc: 'Basic strategy' },
  { id: 'medium', name: 'Medium AI', desc: 'Balanced play' },
  { id: 'hard', name: 'Hard AI', desc: 'Expert strategy' },
];

// Available colors for faction selection
export const FACTION_COLORS = [
  { id: 'red', color: '#B22222', light: '#DC143C', name: 'Crimson' },
  { id: 'blue', color: '#1E90FF', light: '#4169E1', name: 'Blue' },
  { id: 'green', color: '#228B22', light: '#32CD32', name: 'Green' },
  { id: 'orange', color: '#FF8C00', light: '#FFA500', name: 'Orange' },
  { id: 'purple', color: '#8B008B', light: '#9932CC', name: 'Purple' },
  { id: 'gold', color: '#B8860B', light: '#DAA520', name: 'Gold' },
  { id: 'gray', color: '#4A4A4A', light: '#6A6A6A', name: 'Gray' },
  { id: 'olive', color: '#556B2F', light: '#6B8E23', name: 'Olive' },
  { id: 'teal', color: '#008B8B', light: '#20B2AA', name: 'Teal' },
  { id: 'pink', color: '#C71585', light: '#FF69B4', name: 'Pink' },
];

export const TEAM_COLORS = {
  1: { color: '#1E90FF', name: 'Team 1 (Blue)' },
  2: { color: '#DC143C', name: 'Team 2 (Red)' },
};

export const STARTING_IPC_OPTIONS = [40, 60, 80, 100, 120, 150];
export const DEFAULT_STARTING_IPCS = 80;

function startingIpcOptionsHtml(selected) {
  return STARTING_IPC_OPTIONS.map((n) => (
    `<option value="${n}" ${Number(selected) === n ? 'selected' : ''}>${n}</option>`
  )).join('');
}

export class Lobby {
  constructor(setup, onStart, onPlayOnline) {
    this.setup = setup;
    this.onStart = onStart;
    this.onPlayOnline = onPlayOnline;
    this.onRulesToggle = null;
    this.mode = 'main'; // 'main', 'local-setup', 'my-games'
    this.selectedPlayers = [];
    this.playerNames = {};
    this.playerColors = {};
    this.playerAI = {};
    this.playerTeams = {};
    this.teamsEnabled = false;
    this.startingIPCs = DEFAULT_STARTING_IPCS;
    this.el = null;
    this._ignoreCardToggleUntil = 0;
    this._ignoreCardTogglePlayer = null;
    this._docClickBound = false;
    this._create();
  }

  setOnRulesToggle(callback) {
    this.onRulesToggle = callback;
  }

  _create() {
    console.log('[Lobby] _create() called');
    this.el = document.createElement('div');
    this.el.id = 'lobby';
    this.el.className = 'lobby-overlay modern';
    console.log('[Lobby] Element created, calling _render()');
    this._render();
    console.log('[Lobby] _render() complete, appending to body');
    document.body.appendChild(this.el);
    document.documentElement.classList.add('has-lobby');
    console.log('[Lobby] Element appended. Display:', getComputedStyle(this.el).display, 'Visibility:', getComputedStyle(this.el).visibility);
  }

  _render() {
    const savedScroll = captureLobbyScroll(this.el);
    let content = '';
    const phone = isMobileShell();

    switch (this.mode) {
      case 'main':
        content = phone ? this._renderMobileMainMenu() : this._renderMainMenu();
        break;
      case 'local-setup':
        content = phone ? this._renderMobileLocalSetup() : this._renderLocalSetup();
        break;
      case 'my-games':
        content = this._renderMyGames();
        break;
      default:
        content = phone ? this._renderMobileMainMenu() : this._renderMainMenu();
    }

    this.el.innerHTML = `
      <div class="lobby-container modern${phone ? ' lobby-phone' : ''}">
        <div class="lobby-bg-pattern"></div>
        <div class="lobby-content-wrapper${phone ? ' lobby-phone-wrap' : ''}">
          ${content}
        </div>
      </div>
    `;

    restoreLobbyScroll(this.el, savedScroll);
    this._bindEvents();
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => restoreLobbyScroll(this.el, savedScroll));
    }
  }

  _renderUxPicker() {
    // Unified.1 — Interface Classic|Experimental picker removed.
    return '';
  }

  _renderMobileMainMenu() {
    const savedGames = this._getSavedGames();
    const hasSavedGames = savedGames.length > 0;

    return `
      <div class="lobby-phone-home">
        <div class="lobby-phone-brand">
          <h1 class="lobby-phone-logo">Tactical Risk</h1>
          <p class="lobby-phone-tag">World War II Grand Strategy</p>
          <span class="lobby-version-badge">${GAME_VERSION}</span>
        </div>

        <p class="lobby-phone-path">Start here</p>
        <div class="lobby-phone-actions">
          <button class="lobby-phone-card" data-action="local-play">
            <span class="lobby-phone-card-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </span>
            <span class="lobby-phone-card-copy">
              <span class="lobby-phone-card-kicker">This device</span>
              <span class="lobby-phone-card-title">Local Play</span>
              <span class="lobby-phone-card-desc">Friends or AI on this phone</span>
            </span>
          </button>
          <button class="lobby-phone-card lobby-phone-card-online" data-action="online-play">
            <span class="lobby-phone-card-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
            </span>
            <span class="lobby-phone-card-copy">
              <span class="lobby-phone-card-kicker">Multiplayer</span>
              <span class="lobby-phone-card-title">Play Online</span>
              <span class="lobby-phone-card-desc">Create or join a game</span>
            </span>
          </button>
          <button class="lobby-phone-card lobby-phone-card-howto" data-action="how-to-play">
            <span class="lobby-phone-card-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
            </span>
            <span class="lobby-phone-card-copy">
              <span class="lobby-phone-card-kicker">Guest</span>
              <span class="lobby-phone-card-title">How to Play</span>
              <span class="lobby-phone-card-desc">Rules · no sign-in</span>
            </span>
          </button>
        </div>

        ${hasSavedGames ? `
          <button class="lobby-phone-saved" data-action="my-games">
            <span>My Games</span>
            <span class="saved-count">${savedGames.length}</span>
          </button>
        ` : ''}
      </div>
    `;
  }

  _initFactionDefaults() {
    const factions = this.setup.risk.factions;
    factions.forEach((p, i) => {
      const defaultColor = FACTION_COLORS[i % FACTION_COLORS.length];
      if (!this.playerColors[p.id]) {
        this.playerColors[p.id] = { color: p.color || defaultColor.color, lightColor: p.lightColor || defaultColor.light };
      }
      if (this.playerAI[p.id] == null) this.playerAI[p.id] = 'human';
    });
    return factions;
  }

  _renderMobileLocalSetup() {
    const factions = this._initFactionDefaults();
    const selectedCount = this.selectedPlayers.length;
    const canStart = selectedCount >= 2;

    return `
      <div class="lobby-phone-setup">
        <div class="lobby-phone-setup-head">
          <button class="back-btn lobby-phone-back" data-action="back" aria-label="Back">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <div class="setup-title">
            <h2>New Local Game</h2>
            <p>Tap 2–5 factions</p>
          </div>
        </div>

        <div class="lobby-phone-factions">
          ${factions.map((p, i) => this._renderMobileFactionCard(p, i)).join('')}
        </div>

        <div class="lobby-phone-options">
          <label class="lobby-phone-option">
            <span>Starting IPCs</span>
            <select id="starting-ipcs" class="modern-select compact">
              ${startingIpcOptionsHtml(this.startingIPCs)}
            </select>
          </label>
        </div>

        <div class="setup-footer lobby-phone-start">
          <div class="lobby-phone-footer-opts">
            <span class="lobby-phone-teams-name">Teams</span>
            <button type="button" id="teams-enabled" class="lobby-phone-teams-toggle" aria-pressed="${this.teamsEnabled ? 'true' : 'false'}" aria-label="Teams">
              ${this.teamsEnabled ? 'On' : 'Off'}
            </button>
          </div>
          <button class="start-game-btn ${canStart ? '' : 'disabled'}" data-action="start" ${canStart ? '' : 'disabled'}>
            ${canStart ? `Start Game (${selectedCount})` : 'Select at least 2 factions'}
          </button>
        </div>
      </div>
    `;
  }

  _renderMobileFactionCard(faction, index) {
    const isSelected = this.selectedPlayers.includes(faction.id);
    const currentColor = this.playerColors[faction.id];
    const currentAI = this.playerAI[faction.id] || 'human';
    const currentTeam = this.playerTeams[faction.id] || null;

    const occupantName = (AI_DIFFICULTIES.find(d => d.id === currentAI) || AI_DIFFICULTIES[0]).name;
    const meta = isSelected
      ? (currentAI === 'human' ? 'You' : occupantName)
      : 'Tap to add';

    return `
      <div class="lobby-phone-seat${isSelected ? ' selected' : ''}" data-player="${faction.id}">
        <div class="lobby-phone-faction${isSelected ? ' selected' : ''}" data-player="${faction.id}">
          <div class="lobby-phone-faction-main">
            <div class="lobby-phone-faction-logo" style="border-color: ${currentColor?.color || faction.color}">
              <img src="assets/flags/${faction.flag}" alt="${faction.name}">
              ${isSelected ? `
                <div class="color-picker lobby-phone-pip-wrap" data-player="${faction.id}">
                  <button type="button" class="lobby-phone-pip" style="background:${currentColor?.color || faction.color}" aria-label="Color"></button>
                  <div class="color-dropdown hidden">
                    ${FACTION_COLORS.map(c => `
                      <div class="color-option" data-color-id="${c.id}" style="background:${c.color}" title="${c.name}"></div>
                    `).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
            <span class="lobby-phone-faction-name">${faction.name}</span>
            ${isSelected ? `
              <div class="lobby-phone-occupant">
                <select class="ai-select modern" data-player="${faction.id}" aria-label="Occupant">
                  ${AI_DIFFICULTIES.map(d => `
                    <option value="${d.id}" ${currentAI === d.id ? 'selected' : ''}>${d.name}</option>
                  `).join('')}
                </select>
                ${this.teamsEnabled ? `
                  <div class="team-selector">
                    <button class="team-btn ${currentTeam === 1 ? 'active' : ''}" data-player="${faction.id}" data-team="1" style="--team-color: ${TEAM_COLORS[1].color}">1</button>
                    <button class="team-btn ${currentTeam === 2 ? 'active' : ''}" data-player="${faction.id}" data-team="2" style="--team-color: ${TEAM_COLORS[2].color}">2</button>
                    <button class="team-btn neutral ${!currentTeam ? 'active' : ''}" data-player="${faction.id}" data-team="0">-</button>
                  </div>
                ` : ''}
              </div>
            ` : `<span class="lobby-phone-faction-meta">${meta}</span>`}
          </div>
        </div>
      </div>
    `;
  }

  _renderMainMenu() {
    const savedGames = this._getSavedGames();
    const hasSavedGames = savedGames.length > 0;

    return `
      <div class="lobby-main-menu">
        <div class="lobby-brand">
          <h1 class="lobby-logo">Tactical Risk</h1>
          <p class="lobby-tagline">World War II Grand Strategy</p>
          <span class="lobby-version-badge">${GAME_VERSION}</span>
        </div>

        ${this._renderUxPicker()}
        <p class="lobby-mode-kicker">Start here</p>
        <div class="lobby-menu-grid lobby-mode-tiles">
          <button class="lobby-menu-card" data-action="local-play">
            <div class="menu-card-icon">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </div>
            <div class="menu-card-content">
              <p class="menu-card-kicker">This device</p>
              <h3>Local Play</h3>
              <p>Friends or AI on this screen</p>
            </div>
          </button>

          <button class="lobby-menu-card online" data-action="online-play">
            <div class="menu-card-icon">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
            </div>
            <div class="menu-card-content">
              <p class="menu-card-kicker">Multiplayer</p>
              <h3>Play Online</h3>
              <p>Create or join a game</p>
            </div>
          </button>

          <button class="lobby-menu-card lobby-menu-card-rules" data-action="how-to-play">
            <div class="menu-card-icon">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>
            </div>
            <div class="menu-card-content">
              <p class="menu-card-kicker">Guest</p>
              <h3>How to Play</h3>
              <p>Rules — no sign-in</p>
            </div>
          </button>
        </div>

        ${hasSavedGames ? `
          <button class="lobby-saved-games-btn" data-action="my-games">
            <span class="saved-icon">📁</span>
            <span>My Games</span>
            <span class="saved-count">${savedGames.length}</span>
          </button>
        ` : ''}
      </div>
    `;
  }

  _renderLocalSetup() {
    const factions = this._initFactionDefaults();

    const selectedCount = this.selectedPlayers.length;
    const canStart = selectedCount >= 2;

    return `
      <div class="lobby-setup">
        <div class="setup-header">
          <button class="back-btn" data-action="back">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <div class="setup-title">
            <h2>New Local Game</h2>
            <p>Select 2-5 players to begin</p>
          </div>
        </div>

        <div class="setup-body">
          <div class="players-section">
            <div class="players-header">
              <h3 class="section-label">Players</h3>
              <label class="teams-toggle-compact">
                <input type="checkbox" id="teams-enabled" ${this.teamsEnabled ? 'checked' : ''}>
                <span class="toggle-slider small"></span>
                <span class="toggle-text">Teams</span>
              </label>
            </div>
            <div class="player-grid modern">
              ${factions.map((p, i) => this._renderPlayerCard(p, i)).join('')}
            </div>
          </div>

          <div class="options-row">
            <label class="select-option inline">
              <span class="select-label">Starting IPCs</span>
              <select id="starting-ipcs" class="modern-select compact">
                ${startingIpcOptionsHtml(this.startingIPCs)}
              </select>
            </label>
          </div>
        </div>

        <div class="setup-footer">
          <div class="game-rules-preview">
            <span>Random Territories</span>
            <span class="dot">•</span>
            <span>Capital Conquest Victory</span>
          </div>
          <button class="start-game-btn ${canStart ? '' : 'disabled'}" data-action="start" ${canStart ? '' : 'disabled'}>
            ${canStart ? `Start Game (${selectedCount} Players)` : 'Select at least 2 players'}
          </button>
        </div>
      </div>
    `;
  }

  _renderPlayerCard(faction, index) {
    const isSelected = this.selectedPlayers.includes(faction.id);
    const currentColor = this.playerColors[faction.id];
    const currentAI = this.playerAI[faction.id] || 'human';
    const currentTeam = this.playerTeams[faction.id] || null;

    return `
      <div class="player-card modern ${isSelected ? 'selected' : ''}" data-player="${faction.id}">
        <div class="player-card-top">
          <div class="player-avatar" style="border-color: ${currentColor?.color || faction.color}">
            <img src="assets/flags/${faction.flag}" alt="${faction.name}">
          </div>
          <div class="player-select-indicator">
            ${isSelected ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
          </div>
        </div>
        <div class="player-card-body">
          <input type="text" class="player-name-input modern"
                 data-player="${faction.id}"
                 placeholder="${faction.name}"
                 value="${this.playerNames[faction.id] || (isSelected ? faction.name : '')}"
                 maxlength="15"
                 ${isSelected ? '' : 'disabled'}>
          <div class="player-options">
            <div class="color-picker" data-player="${faction.id}">
              <div class="color-swatch" style="background:${currentColor?.color || faction.color}"></div>
              <div class="color-dropdown hidden">
                ${FACTION_COLORS.map(c => `
                  <div class="color-option" data-color-id="${c.id}" style="background:${c.color}" title="${c.name}"></div>
                `).join('')}
              </div>
            </div>
            <select class="ai-select modern" data-player="${faction.id}" ${isSelected ? '' : 'disabled'}>
              ${AI_DIFFICULTIES.map(d => `
                <option value="${d.id}" ${currentAI === d.id ? 'selected' : ''}>${d.name}</option>
              `).join('')}
            </select>
          </div>
          ${this.teamsEnabled && isSelected ? `
            <div class="team-selector">
              <button class="team-btn ${currentTeam === 1 ? 'active' : ''}" data-player="${faction.id}" data-team="1" style="--team-color: ${TEAM_COLORS[1].color}">1</button>
              <button class="team-btn ${currentTeam === 2 ? 'active' : ''}" data-player="${faction.id}" data-team="2" style="--team-color: ${TEAM_COLORS[2].color}">2</button>
              <button class="team-btn neutral ${!currentTeam ? 'active' : ''}" data-player="${faction.id}" data-team="0">-</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  _renderMyGames() {
    const savedGames = this._getSavedGames();

    return `
      <div class="lobby-my-games">
        <div class="setup-header">
          <button class="back-btn" data-action="back">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          </button>
          <div class="setup-title">
            <h2>My Games</h2>
            <p>Continue a saved game or manage your games</p>
          </div>
        </div>

        <div class="games-list">
          ${savedGames.length === 0 ? `
            <div class="empty-state">
              <div class="empty-icon">📭</div>
              <h3>No Saved Games</h3>
              <p>Start a new game to see it here</p>
            </div>
          ` : savedGames.map(game => `
            <div class="game-item" data-game-id="${game.id}">
              <div class="game-item-info">
                <div class="game-item-type ${game.type}">${game.type === 'local' ? '💻 Local' : '🌐 Online'}</div>
                <div class="game-item-details">
                  <span class="game-players">${game.playerCount} players</span>
                  <span class="game-round">Round ${game.round}</span>
                </div>
                <div class="game-item-time">${this._formatTimeAgo(game.lastPlayed)}</div>
              </div>
              <div class="game-item-players">
                ${game.playerNames.map(name => `<span class="player-tag">${name}</span>`).join('')}
              </div>
              <div class="game-item-actions">
                <button class="game-action-btn primary" data-action="load-game" data-game-id="${game.id}" data-game-type="${game.type}">
                  Continue
                </button>
                <button class="game-action-btn danger" data-action="delete-game" data-game-id="${game.id}" data-game-type="${game.type}">
                  Delete
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  _getSavedGames() {
    const games = [];
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    // Check for local auto-save
    const autoSave = localStorage.getItem('tacticalRisk_autoSave');
    const autoSaveTime = localStorage.getItem('tacticalRisk_autoSave_time');

    if (autoSave && autoSaveTime) {
      const saveTime = new Date(autoSaveTime).getTime();

      // Delete if older than 30 days
      if (saveTime < thirtyDaysAgo) {
        localStorage.removeItem('tacticalRisk_autoSave');
        localStorage.removeItem('tacticalRisk_autoSave_time');
      } else {
        try {
          const data = JSON.parse(autoSave);
          games.push({
            id: 'local_autosave',
            type: 'local',
            lastPlayed: new Date(autoSaveTime),
            round: data.round || 1,
            playerCount: data.players?.length || 0,
            playerNames: data.players?.map(p => p.name) || [],
            data: data
          });
        } catch (e) {
          console.error('Failed to parse local save:', e);
        }
      }
    }

    return games;
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
    this.el.querySelector('[data-action="local-play"]')?.addEventListener('click', () => {
      this.mode = 'local-setup';
      this._render();
    });

    this.el.querySelector('[data-action="online-play"]')?.addEventListener('click', () => {
      if (this.onPlayOnline) {
        this.hide();
        this.onPlayOnline();
      }
    });

    this.el.querySelector('[data-action="how-to-play"]')?.addEventListener('click', () => {
      if (this.onRulesToggle) this.onRulesToggle();
    });

    this.el.querySelector('[data-action="my-games"]')?.addEventListener('click', () => {
      this.mode = 'my-games';
      this._render();
    });

    // Back button
    this.el.querySelector('[data-action="back"]')?.addEventListener('click', () => {
      // Keep seated factions + occupant (Human / Easy AI / …). Returning
      // to setup must not reset a card to Human.
      this.mode = 'main';
      this._render();
    });

    // Player cards. Phone seats on pointerdown so a leftover click after
    // _render() cannot unseat (first "Tap to add" looked swallowed).
    this.el.querySelectorAll('.player-card.modern, .lobby-phone-faction').forEach(card => {
      const onToggle = (e) => {
        e?.preventDefault?.();
        if (e.target.closest('.player-name-input')) return;
        if (e.target.closest('.ai-select')) return;
        if (e.target.closest('.color-picker')) return;
        if (e.target.closest('.team-btn')) return;
        if (e.target.closest('.lobby-phone-faction-tools')) return;
        if (e.target.closest('.lobby-phone-occupant')) return;
        if (e.target.closest('.lobby-phone-pip-wrap')) return;
        if (shouldIgnoreFactionCardToggle({
          now: Date.now(),
          ignoreUntil: this._ignoreCardToggleUntil,
          playerId: card.dataset.player,
          lockedPlayerId: this._ignoreCardTogglePlayer,
        })) return;
        if (shouldSeatFactionOnPointerDown({ mobile: isMobileShell() })) {
          this._ignoreCardToggleUntil = Date.now() + LOBBY_SELECT_TOGGLE_GUARD_MS;
          this._ignoreCardTogglePlayer = card.dataset.player;
        }
        this._togglePlayer(card.dataset.player);
      };
      card.addEventListener('pointerdown', (e) => {
        if (!shouldSeatFactionOnPointerDown({ mobile: isMobileShell() })) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        onToggle(e);
      });
      card.addEventListener('click', (e) => {
        if (shouldSeatFactionOnPointerDown({ mobile: isMobileShell() })) return;
        onToggle(e);
      });
    });

    // Color pickers
    this.el.querySelectorAll('.color-picker').forEach(picker => {
      const playerId = picker.dataset.player;
      const swatch = picker.querySelector('.color-swatch, .lobby-phone-pip');
      const dropdown = picker.querySelector('.color-dropdown');

      swatch?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.el.querySelectorAll('.color-dropdown').forEach(d => {
          if (d !== dropdown) d.classList.add('hidden');
        });
        dropdown?.classList.toggle('hidden');
      });

      dropdown?.querySelectorAll('.color-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const colorId = opt.dataset.colorId;
          const colorDef = FACTION_COLORS.find(c => c.id === colorId);
          if (colorDef) {
            this.playerColors[playerId] = { color: colorDef.color, lightColor: colorDef.light };
            this._render();
          }
        });
      });
    });

    // Close dropdowns on outside click (once — _bindEvents runs every render)
    if (!this._docClickBound) {
      this._docClickBound = true;
      document.addEventListener('click', () => {
        this.el.querySelectorAll('.color-dropdown').forEach(d => d.classList.add('hidden'));
      });
    }

    // Name inputs
    this.el.querySelectorAll('.player-name-input').forEach(input => {
      input.addEventListener('input', (e) => {
        this.playerNames[e.target.dataset.player] = e.target.value;
      });
      input.addEventListener('click', (e) => e.stopPropagation());
    });

    // AI selects
    this.el.querySelectorAll('.ai-select').forEach(select => {
      const lockCard = () => {
        this._ignoreCardToggleUntil = Date.now() + LOBBY_SELECT_TOGGLE_GUARD_MS;
        this._ignoreCardTogglePlayer = select.dataset.player;
      };
      select.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        lockCard();
      });
      select.addEventListener('mousedown', (e) => e.stopPropagation());
      select.addEventListener('change', (e) => {
        this.playerAI[e.target.dataset.player] = e.target.value;
        lockCard();
      });
      select.addEventListener('click', (e) => e.stopPropagation());
    });

    // Starting IPCs
    this.el.querySelector('#starting-ipcs')?.addEventListener('change', (e) => {
      this.startingIPCs = parseInt(e.target.value, 10);
    });

    // Teams toggle
    this.el.querySelector('#teams-enabled')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.currentTarget.type === 'checkbox') {
        this.teamsEnabled = e.currentTarget.checked;
      } else {
        this.teamsEnabled = !this.teamsEnabled;
      }
      if (!this.teamsEnabled) {
        this.playerTeams = {};
      }
      this._render();
    });
    this.el.querySelector('#teams-enabled')?.addEventListener('change', (e) => {
      this.teamsEnabled = e.target.checked;
      if (!this.teamsEnabled) {
        this.playerTeams = {};
      }
      this._render();
    });

    // Team buttons
    this.el.querySelectorAll('.team-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const playerId = btn.dataset.player;
        const team = parseInt(btn.dataset.team, 10);
        this.playerTeams[playerId] = team === 0 ? null : team;
        this._render();
      });
    });

    // Start button
    this.el.querySelector('[data-action="start"]')?.addEventListener('click', () => {
      if (this.selectedPlayers.length >= 2) {
        this._startGame();
      }
    });

    // Load game buttons
    this.el.querySelectorAll('[data-action="load-game"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const gameId = btn.dataset.gameId;
        const gameType = btn.dataset.gameType;
        this._loadGame(gameId, gameType);
      });
    });

    // Delete game buttons
    this.el.querySelectorAll('[data-action="delete-game"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const gameId = btn.dataset.gameId;
        const gameType = btn.dataset.gameType;
        this._deleteGame(gameId, gameType);
      });
    });
  }

  _togglePlayer(playerId) {
    const factions = this.setup.risk.factions;
    const faction = factions.find(p => p.id === playerId);
    const idx = this.selectedPlayers.indexOf(playerId);

    if (idx >= 0) {
      this.selectedPlayers.splice(idx, 1);
      delete this.playerNames[playerId];
    } else {
      this.selectedPlayers.push(playerId);
      this.playerNames[playerId] = faction?.name || '';
    }

    if (isMobileShell()) {
      this._paintPhoneFactionSeat(playerId);
      requestAnimationFrame(() => this._render());
      return;
    }
    this._render();
  }

  _paintPhoneFactionSeat(playerId) {
    const selected = this.selectedPlayers.includes(playerId);
    const seat = this.el.querySelector(`.lobby-phone-seat[data-player="${playerId}"]`);
    const card = this.el.querySelector(`.lobby-phone-faction[data-player="${playerId}"]`);
    seat?.classList.toggle('selected', selected);
    card?.classList.toggle('selected', selected);
    const meta = card?.querySelector('.lobby-phone-faction-meta');
    if (meta) meta.textContent = selected ? 'You' : 'Tap to add';
  }

  _startGame() {
    const factions = this.setup.risk.factions;

    const players = this.selectedPlayers.map(id => {
      const factionDef = factions.find(p => p.id === id);
      const customColor = this.playerColors[id];
      const aiDifficulty = this.playerAI[id] || 'human';
      const teamId = this.teamsEnabled ? (this.playerTeams[id] || null) : null;
      return {
        ...factionDef,
        name: this.playerNames[id]?.trim() || factionDef.name,
        color: customColor?.color || factionDef.color,
        lightColor: customColor?.lightColor || factionDef.lightColor,
        isAI: aiDifficulty !== 'human',
        aiDifficulty: aiDifficulty,
        teamId: teamId,
      };
    });

    const options = {
      alliancesEnabled: false,
      teamsEnabled: this.teamsEnabled,
      startingIPCs: this.startingIPCs,
    };

    this.hide();
    this.onStart('risk', players, options);
  }

  _loadGame(gameId, gameType) {
    if (gameType === 'local' && gameId === 'local_autosave') {
      const data = localStorage.getItem('tacticalRisk_autoSave');
      if (data) {
        try {
          const saveData = JSON.parse(data);
          this.hide();
          this.onStart(null, null, { loadFromSave: saveData });
        } catch (err) {
          console.error('Failed to load save:', err);
          alert('Failed to load saved game.');
        }
      }
    }
  }

  _deleteGame(gameId, gameType) {
    if (!confirm('Are you sure you want to delete this game?')) return;

    if (gameType === 'local' && gameId === 'local_autosave') {
      localStorage.removeItem('tacticalRisk_autoSave');
      localStorage.removeItem('tacticalRisk_autoSave_time');
      this._render();
    }
  }

  show() {
    this.mode = 'main';
    this._render();
    this.el.classList.remove('hidden');
    this.el.style.display = 'flex'; // Ensure visible
    document.documentElement.classList.add('has-lobby');
  }

  hide() {
    this.el.classList.add('hidden');
    this.el.style.display = 'none'; // Force hide
    document.documentElement.classList.remove('has-lobby');
  }

  destroy() {
    if (this.el?.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
