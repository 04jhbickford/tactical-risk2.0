// Top bar HUD: game title, current turn info, player legend

import { GAME_PHASES, TURN_PHASES, TURN_PHASE_ORDER, TURN_PHASE_NAMES } from '../state/gameState.js';
import { possessivePhrase } from '../utils/possessive.js';
import { isMobileShell, formatMobilePhaseWord, formatMobilePlayerMeta, readableFactionTextColor, setShellFlag, shouldShowPhoneMenuPlayerRoster, isPhoneSetupPhase, phoneMenuHomeActions } from './mobileShell.js';
import { syncBottomSurfaces } from './bottomSurface.js';
import { resolveHudClarity, shouldShowHudTicker } from './hudClarity.js';
import { confirmChoice } from './confirmChoice.js';
import { ensureDiceStatsLoaded, renderDiceStatsMarkup, setDiceStatsTab } from './diceStatsPanel.js';

export class HUD {
  constructor() {
    this.gameState = null;
    this.onNextPhase = null;
    this.onRulesToggle = null;
    this.onPhaseTips = null;
    this.onExitToLobby = null;
    this.onResign = null;
    this.menuOpen = false;
    this.mapToolsOpen = false;
    this.menuTab = null;
    this.diceStatsOpen = false;
    this.menuTabProvider = null;
    this.onMenuOpen = null;
    this.el = document.getElementById('hud');
    this.clarityEl = document.getElementById('hud-clarity');
    if (!this.clarityEl && this.el?.parentNode) {
      this.clarityEl = document.createElement('div');
      this.clarityEl.id = 'hud-clarity';
      this.el.after(this.clarityEl);
    }
    this.actionLog = null;
    this.lastClick = null;
    this.aiStatus = null;
    this.clarityCtx = {
      localUserId: null,
      gameCode: null,
      hostPresence: null,
      hostName: null,
      isHost: false,
      justResumed: false,
    };
    this._render();

    // Close menu when clicking outside. Ignore the same tap that opened it
    // (native option lists / leftover tooltips used to eat the first tap).
    document.addEventListener('click', (e) => {
      if (!this.menuOpen) return;
      if (e.target.closest('.hud-menu-container') || e.target.closest('.phone-menu-sheet')) return;
      if (Date.now() < (this._ignoreMenuCloseUntil || 0)) return;
      this.menuOpen = false;
      this.menuTab = null;
      this.diceStatsOpen = false;
      this.el.querySelector('.dice-stats-popover')?.remove();
      this._updateMenuState();
    });

    // Escape closes Dice stats even after a later HUD render moves focus.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!this.diceStatsOpen && this.menuTab !== 'dice') return;
      e.preventDefault();
      this.diceStatsOpen = false;
      if (this.menuTab === 'dice') this.menuTab = null;
      this._render();
    });
  }

  setAIStatus(message) {
    this.aiStatus = message || null;
    if (!this.gameState?.currentPlayer?.isAI) this.aiStatus = null;
    this._render();
  }

  setMenuTabProvider(fn) {
    this.menuTabProvider = fn;
  }

  setOnMenuOpen(fn) {
    this.onMenuOpen = fn;
  }

  setOnRulesToggle(callback) {
    this.onRulesToggle = callback;
  }

  setOnPhaseTips(callback) {
    this.onPhaseTips = callback;
  }

  setOnExitToLobby(callback) {
    this.onExitToLobby = callback;
  }

  setOnResign(callback) {
    this.onResign = callback;
  }

  setGameState(gameState) {
    this.gameState = gameState;
    gameState.subscribe(() => this._render());
    this._render();
  }

  setNextPhaseCallback(callback) {
    this.onNextPhase = callback;
  }

  setActionLog(actionLog) {
    this.actionLog = actionLog;
  }

  setLastClick(lastClick) {
    this.lastClick = lastClick || null;
    this._renderClarity();
  }

  setClarityContext(partial = {}) {
    this.clarityCtx = { ...this.clarityCtx, ...partial };
    this._renderClarity();
  }

  _render() {
    if (this.gameState && !this.gameState.currentPlayer?.isAI) {
      this.aiStatus = null;
    }
    if (isMobileShell()) {
      this._renderMobile();
      return;
    }

    // Hamburger menu button
    let html = `
      <div class="hud-menu-container">
        <button class="hud-menu-btn" data-action="toggle-menu" title="Menu">
          <span class="hud-menu-icon">☰</span>
        </button>
        <div class="hud-menu-dropdown ${this.menuOpen ? 'open' : ''}">
          <button class="hud-menu-item" data-action="phase-tips">
            <span class="hud-menu-item-icon">ⓘ</span>
            <span>Phase tips</span>
          </button>
          <button class="hud-menu-item" data-action="dice-stats">
            <span class="hud-menu-item-icon">⚀</span>
            <span>Dice stats</span>
          </button>
          <button class="hud-menu-item" data-action="rules">
            <span class="hud-menu-item-icon">📖</span>
            <span>Game Rules</span>
          </button>
          <button class="hud-menu-item" data-action="exit-lobby">
            <span class="hud-menu-item-icon">💾</span>
            <span>Save & Exit</span>
          </button>
          <button class="hud-menu-item" data-action="resign">
            <span class="hud-menu-item-icon">🏳</span>
            <span>Resign</span>
          </button>
        </div>
        ${this.diceStatsOpen ? renderDiceStatsMarkup({ placement: 'popover' }) : ''}
      </div>
    `;

    html += `<span class="hud-title">Tactical Risk</span>`;

    if (this.gameState && this.gameState.phase !== GAME_PHASES.LOBBY) {
      const phase = this.gameState.phase;
      const player = this.gameState.currentPlayer;

      if (player) {
        // Current player indicator - prominent display
        const flagSrc = player.flag ? `assets/flags/${player.flag}` : null;
        html += `
          <div class="hud-current-turn">
            ${flagSrc ? `<img src="${flagSrc}" class="hud-flag-large" alt="${player.name}">` : ''}
            <div class="hud-turn-info">
              <span class="hud-player-name" style="color: ${player.color}">${possessivePhrase(player.name, 'Turn')}</span>
              <span class="hud-phase-name">${this._getPhaseName(phase)}</span>
            </div>
          </div>`;

        // Turn phase progress (during PLAYING)
        if (phase === GAME_PHASES.PLAYING) {
          const currentIndex = TURN_PHASE_ORDER.indexOf(this.gameState.turnPhase);
          html += `
            <div class="hud-phase-progress">
              <span class="hud-round-badge">Round ${this.gameState.round}</span>
              <div class="phase-dots">
                ${TURN_PHASE_ORDER.map((tp, i) => {
                  const isActive = i === currentIndex;
                  const isPast = i < currentIndex;
                  const cls = isActive ? 'active' : isPast ? 'past' : '';
                  return `<span class="phase-dot ${cls}" title="${TURN_PHASE_NAMES[tp]}"></span>`;
                }).join('')}
              </div>
            </div>`;
        }

        // Turn order display
        html += `<div class="hud-turn-order">`;
        const currentIdx = this.gameState.currentPlayerIndex;
        for (let i = 0; i < this.gameState.players.length; i++) {
          const p = this.gameState.players[i];
          const isCurrent = i === currentIdx;
          const isPast = i < currentIdx;
          let cls = isCurrent ? 'current' : isPast ? 'past' : '';
          if (p.surrendered) cls += ' out';
          const flagSrc = p.flag ? `assets/flags/${p.flag}` : null;

          if (i > 0) {
            html += `<span class="turn-order-arrow">→</span>`;
          }

          html += `
            <div class="turn-order-item ${cls}" ${p.surrendered ? 'title="Surrendered"' : ''}>
              ${flagSrc ? `<img src="${flagSrc}" class="turn-order-flag" alt="${p.name}">` : `<span style="color:${p.color}">●</span>`}
            </div>
          `;
        }
        html += `</div>`;
      }
    }

    // Player legend - compact, shows turn order only (detailed stats in Players tab)
    html += `<div class="hud-legend">`;
    if (this.gameState && this.gameState.players.length > 0) {
      for (const p of this.gameState.players) {
        const isActive = this.gameState.currentPlayer?.id === p.id;
        let itemClass = isActive ? ' active' : '';
        if (p.surrendered) itemClass += ' out';
        const flagSrc = p.flag ? `assets/flags/${p.flag}` : null;

        html += `
          <span class="legend-item${itemClass}" ${p.surrendered ? 'title="Surrendered"' : ''}>
            ${flagSrc ? `<img src="${flagSrc}" class="legend-flag" alt="${p.name}">` : `<span class="legend-dot" style="background:${p.color}"></span>`}
            <span class="legend-name">${p.name}</span>${p.surrendered ? '<span class="legend-out">OUT</span>' : ''}
          </span>`;
      }
    }
    html += `</div>`;

    this.el.innerHTML = html;
    this._bindEvents();
    this._syncMapToolsFlag();
    this._syncMenuFlag();
    this._renderClarity();
  }

  // Phone top bar: frosted L0 chips matching Experimental — phase pill,
  // seat, always-visible IPC, help ?, menu. Zoom is always-on BR (no Map btn).
  _renderMobile() {
    const player = this.gameState?.currentPlayer;
    const inGame = this.gameState && this.gameState.phase !== GAME_PHASES.LOBBY && player;
    const phaseName = inGame
      ? formatMobilePhaseWord(this.gameState.phase, this.gameState.turnPhase)
      : '';
    const flagSrc = inGame && player.flag ? `assets/flags/${player.flag}` : null;
    const ipcVal = inGame && this.gameState.getIPCs
      ? this.gameState.getIPCs(player.id)
      : null;

    let identity = `<span class="hud-title">Tactical Risk</span>`;
    if (inGame) {
      identity = `
        <div class="hud-mobile-identity">
          <span class="hud-mobile-chip hud-mobile-phase" title="Phase">${phaseName}</span>
          <span class="hud-mobile-chip hud-mobile-seat">
            ${flagSrc
              ? `<img src="${flagSrc}" class="hud-mobile-flag" alt="">`
              : `<span class="hud-mobile-swatch" style="background:${player.color}"></span>`}
            <span class="hud-mobile-faction" style="color:${readableFactionTextColor(player.color)}">${player.name}</span>
          </span>
          ${ipcVal != null ? `<span class="hud-mobile-chip hud-mobile-ipc" title="IPCs">IPC ${ipcVal}</span>` : ''}
        </div>`;
    }

    let playersHtml = '';
    if (this.gameState?.players?.length) {
      playersHtml = `<div class="hud-mobile-players">`;
      for (const p of this.gameState.players) {
        const pFlag = p.flag ? `assets/flags/${p.flag}` : null;
        const current = this.gameState.currentPlayer?.id === p.id;
        const ipcs = this.gameState.getIPCs?.(p.id);
        const meta = formatMobilePlayerMeta({ ipcs, surrendered: p.surrendered });
        playersHtml += `
          <div class="hud-mobile-player${current ? ' current' : ''}${p.surrendered ? ' out' : ''}">
            ${pFlag ? `<img src="${pFlag}" alt="">` : `<span class="hud-mobile-swatch" style="background:${p.color}"></span>`}
            <span class="hud-mobile-player-name">${p.name}</span>
            ${meta ? `<span class="hud-mobile-player-meta">${meta}</span>` : ''}
          </div>`;
      }
      playersHtml += `</div>`;
    }

    const tabHTML = (this.menuOpen && this.menuTab && this.menuTabProvider)
      ? this.menuTabProvider(this.menuTab)
      : '';
    const tabLabel = this.menuTab === 'stats' ? 'Players'
      : this.menuTab === 'territory' ? 'Territory'
      : this.menuTab === 'log' ? 'Log'
      : this.menuTab === 'dice' ? 'Dice stats'
      : '';

    this.el.innerHTML = `
      ${identity}
      <div class="hud-menu-container hud-mobile-overflow">
        <button class="hud-menu-btn hud-help-btn" data-action="phase-tips" title="How to start" aria-label="How to start">
          <span class="hud-menu-icon">?</span>
        </button>
        <button class="hud-menu-btn" data-action="toggle-menu" title="Menu" aria-label="Menu">
          <span class="hud-menu-icon">☰</span>
        </button>
      </div>
      <div class="phone-menu-sheet ${this.menuOpen ? 'open' : ''}" id="phone-menu-sheet">
        <div class="phone-menu-head">
          <button class="phone-menu-back" data-action="${this.menuTab ? 'menu-home' : 'toggle-menu'}" aria-label="${this.menuTab ? 'Back' : 'Close'}">${this.menuTab ? '←' : '✕'}</button>
          <span class="phone-menu-title">${tabLabel || 'Menu'}</span>
          <span class="phone-menu-wordmark">Tactical Risk</span>
        </div>
        ${this.menuTab ? `
          <div class="phone-menu-panel">${tabHTML}</div>
        ` : `
          <div class="phone-menu-home">
            ${(() => {
              const rows = phoneMenuHomeActions();
              const pin = rows.filter((r) => r.kind === 'danger');
              const rest = rows.filter((r) => r.kind !== 'danger');
              const rowHtml = (row, extra = '') => {
                const tab = row.tab ? ` data-tab="${row.tab}"` : '';
                const danger = row.kind === 'danger' ? ' phone-menu-resign' : '';
                return `
            <button class="phone-menu-row${danger}${extra}" data-action="${row.action}"${tab}>
              <span class="phone-menu-mark" aria-hidden="true"></span>
              <span class="phone-menu-label">${row.label}</span>
              <span class="phone-menu-meta">${row.meta || ''}</span>
            </button>`;
              };
              return `${pin.map((r) => rowHtml(r, ' phone-menu-first')).join('')}
            <div class="phone-menu-list">
              ${rest.map((r) => rowHtml(r)).join('')}
            </div>`;
            })()}
          </div>
          ${shouldShowPhoneMenuPlayerRoster({ mobile: true }) ? playersHtml : ''}
        `}
      </div>
    `;
    // Zoom is always-on under mobile-shell (.19); keep Map tools closed.
    this.mapToolsOpen = false;
    this._bindEvents();
    this._syncMapToolsFlag();
    this._syncMenuFlag();
    this._renderClarity();
  }

  _clarityModel() {
    const gs = this.gameState;
    const player = gs?.currentPlayer;
    const last = this.actionLog?.entries?.length
      ? this.actionLog.entries[this.actionLog.entries.length - 1]
      : null;
    return resolveHudClarity({
      isMultiplayer: !!gs?.isMultiplayer,
      localUserId: this.clarityCtx.localUserId,
      currentPlayerOderId: player?.oderId,
      currentPlayerName: player?.name,
      phase: gs?.phase,
      turnPhase: gs?.turnPhase,
      lastActionEntry: last,
      lastClick: this.lastClick,
      mobile: isMobileShell(),
      currentPlayerIsAI: !!player?.isAI,
      aiStatus: this.aiStatus,
      deployedThisRound: gs?.unitsPlacedThisRound || 0,
      limit: gs?.getUnitsPerRoundLimit?.() || 6,
      poolRemaining: player ? (gs.getTotalUnitsToPlace?.(player.id) || 0) : 0,
      gameCode: this.clarityCtx.gameCode,
      justResumed: this.clarityCtx.justResumed,
      hostPresence: this.clarityCtx.hostPresence,
      hostName: this.clarityCtx.hostName,
      isHost: this.clarityCtx.isHost,
    });
  }

  _renderClarity() {
    if (!this.clarityEl) return;
    const inGame = this.gameState && this.gameState.phase !== GAME_PHASES.LOBBY;
    const mobile = isMobileShell();
    if (!inGame || !shouldShowHudTicker({ mobile })) {
      this.clarityEl.hidden = true;
      this.clarityEl.innerHTML = '';
      return;
    }
    const c = this._clarityModel();
    this.clarityEl.hidden = false;
    this.clarityEl.className = `hud-clarity${c.ownSeat ? ' your-turn' : ' waiting'}`;
    this.clarityEl.innerHTML = `
      <span class="hud-clarity-turn" data-clarity="turn">${c.whoseTurn}</span>
      <span class="hud-clarity-phase" data-clarity="phase">${c.phase}</span>
      ${c.next ? `<span class="hud-clarity-next" data-clarity="next">${c.next}</span>` : ''}
      ${c.budget ? `<span class="hud-clarity-budget" data-clarity="budget">${c.budget}</span>` : ''}
      <span class="hud-clarity-last" data-clarity="last">${c.lastAction}</span>
      <span class="hud-clarity-click" data-clarity="click">${c.click}</span>
      ${c.match ? `<span class="hud-clarity-match" data-clarity="match">${c.match}</span>` : ''}
    `;
  }

  _syncMapToolsFlag() {
    const open = isMobileShell() && !!this.mapToolsOpen && !this.menuOpen;
    setShellFlag('map-tools-open', open);
    setShellFlag('phone-setup', isMobileShell() && isPhoneSetupPhase(this.gameState?.phase));
  }

  _syncMenuFlag() {
    const open = isMobileShell() && !!this.menuOpen;
    setShellFlag('phone-menu-open', open);
    syncBottomSurfaces({ menuOpen: open });
  }

  _updateMenuState() {
    this._syncMenuFlag();
    const sheet = this.el.querySelector('.phone-menu-sheet');
    if (sheet) {
      sheet.classList.toggle('open', this.menuOpen);
      return;
    }
    const dropdown = this.el.querySelector('.hud-menu-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('open', this.menuOpen);
    }
  }

  _toggleMenu() {
    this._ignoreMenuCloseUntil = Date.now() + 400;
    this.menuOpen = !this.menuOpen;
    if (!this.menuOpen) {
      this.menuTab = null;
      this.diceStatsOpen = false;
    }
    if (this.menuOpen) this.mapToolsOpen = false;
    if (this.menuOpen && typeof this.onMenuOpen === 'function') this.onMenuOpen();
    if (isMobileShell()) this._render();
    else this._updateMenuState();
    this._syncMenuFlag();
  }

  _bindEvents() {
    // Phone: open the short ⋯ sheet on this pointer. A leftover click after
    // HUD _render() (setup peek used to steal the same tap) never arrives.
    this.el.querySelectorAll('[data-action="toggle-menu"]').forEach((menuBtn) => {
      menuBtn.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        if (!isMobileShell()) return;
        e.preventDefault();
        this._toggleMenu();
      });
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isMobileShell()) return;
        this._toggleMenu();
      });
    });

    this.el.querySelector('[data-action="toggle-map-tools"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.mapToolsOpen = !this.mapToolsOpen;
      if (this.mapToolsOpen) {
        this.menuOpen = false;
        this.menuTab = null;
      }
      this._syncMapToolsFlag();
      if (isMobileShell()) this._render();
    });

    this.el.querySelector('[data-action="menu-home"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.menuTab = null;
      this._render();
    });

    this.el.querySelectorAll('[data-action="menu-tab"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.menuOpen = true;
        this.menuTab = btn.dataset.tab;
        if (btn.dataset.tab === 'dice') this._focusDice = true;
        this._render();
        if (btn.dataset.tab === 'dice') {
          ensureDiceStatsLoaded(() => {
            if (this.menuTab !== 'dice') return;
            this._focusDice = true;
            this._render();
          });
        }
      });
    });

    this.el.querySelector('[data-action="dice-stats"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.menuOpen = true;
      this.diceStatsOpen = !this.diceStatsOpen;
      if (this.diceStatsOpen) this._focusDice = true;
      this._updateMenuState();
      this._render();
      if (this.diceStatsOpen) {
        ensureDiceStatsLoaded(() => {
          if (!this.diceStatsOpen) return;
          this._focusDice = true;
          this._render();
        });
      }
    });

    this.el.querySelectorAll('[data-dice-tab]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setDiceStatsTab(btn.dataset.diceTab);
        this._render();
      });
    });

    const dicePanel = this.el.querySelector('.dice-stats');
    dicePanel?.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      this.diceStatsOpen = false;
      if (this.menuTab === 'dice') this.menuTab = null;
      this._render();
    });
    if (this._focusDice && dicePanel) {
      this._focusDice = false;
      dicePanel.focus();
    }

    // The phone sheet row is the second [data-action="phase-tips"].
    // querySelector bound only the ? button, so the row did nothing.
    this.el.querySelectorAll('[data-action="phase-tips"]').forEach((phaseTipsItem) => {
      phaseTipsItem.addEventListener('click', () => {
        this.menuOpen = false;
        this._updateMenuState();
        if (this.onPhaseTips) this.onPhaseTips();
      });
    });

    // Rules menu item (desktop dropdown or phone sheet row)
    const rulesItem = this.el.querySelector('[data-action="rules"]');
    rulesItem?.addEventListener('click', () => {
      this.menuOpen = false;
      this._updateMenuState();
      if (this.onRulesToggle) {
        this.onRulesToggle();
      }
    });

    // Exit to lobby menu item. In-app confirm: window.confirm is a no-op
    // in Discord and some iOS web views.
    const exitItem = this.el.querySelector('[data-action="exit-lobby"]');
    exitItem?.addEventListener('click', () => {
      this.menuOpen = false;
      this._updateMenuState();
      if (this.onExitToLobby) {
        // In multiplayer, game is auto-saved; in single player, progress is lost
        const isMultiplayer = this.gameState?.isMultiplayer;
        const message = isMultiplayer
          ? 'Exit to lobby? Your game is saved and you can resume later.'
          : 'Exit to lobby? Your game progress will be lost.';
        void confirmChoice({
          message,
          confirmLabel: 'Save & Exit',
          cancelLabel: 'Cancel',
        }).then((ok) => {
          if (ok) this.onExitToLobby();
        });
      }
    });

    const resignItem = this.el.querySelector('[data-action="resign"]');
    resignItem?.addEventListener('click', () => {
      this.menuOpen = false;
      this._updateMenuState();
      if (this.onResign) {
        const message = this.gameState?.isMultiplayer
          ? 'Resign from this game? Your territories become neutral and your units are removed. If no seated humans remain, the game is deleted. This cannot be undone.'
          : 'Resign from this game? Your territories become neutral and your units are removed. If no humans remain, the game ends. This cannot be undone.';
        void confirmChoice({
          message,
          confirmLabel: 'Resign',
          cancelLabel: 'Cancel',
        }).then((ok) => {
          if (ok) this.onResign();
        });
      }
    });
  }

  _getPhaseName(phase) {
    if (phase === GAME_PHASES.CAPITAL_PLACEMENT) return 'Place Capital';
    if (phase === GAME_PHASES.UNIT_PLACEMENT) return 'Initial Deployment';
    if (phase === GAME_PHASES.PLAYING) {
      return TURN_PHASE_NAMES[this.gameState.turnPhase] || 'Playing';
    }
    return 'Setup';
  }
}
