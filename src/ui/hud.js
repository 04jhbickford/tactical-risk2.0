// Top bar HUD: game title, current turn info, player legend

import { GAME_PHASES, TURN_PHASES, TURN_PHASE_ORDER, TURN_PHASE_NAMES } from '../state/gameState.js';

export class HUD {
  constructor() {
    this.gameState = null;
    this.onNextPhase = null;
    this.el = document.getElementById('hud');
    this._render();
  }

  setGameState(gameState) {
    this.gameState = gameState;
    gameState.subscribe(() => this._render());
    this._render();
  }

  setNextPhaseCallback(callback) {
    this.onNextPhase = callback;
  }

  _render() {
    let html = `<span class="hud-title">Tactical Risk</span>`;

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
              <span class="hud-player-name" style="color: ${player.color}">${player.name}'s Turn</span>
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
          const cls = isCurrent ? 'current' : isPast ? 'past' : '';
          const flagSrc = p.flag ? `assets/flags/${p.flag}` : null;

          if (i > 0) {
            html += `<span class="turn-order-arrow">→</span>`;
          }

          html += `
            <div class="turn-order-item ${cls}">
              ${flagSrc ? `<img src="${flagSrc}" class="turn-order-flag" alt="${p.name}">` : `<span style="color:${p.color}">●</span>`}
            </div>
          `;
        }
        html += `</div>`;
      }
    }

    // Player legend - shows all players with active indicator
    html += `<div class="hud-legend">`;
    if (this.gameState && this.gameState.players.length > 0) {
      for (const p of this.gameState.players) {
        const isActive = this.gameState.currentPlayer?.id === p.id;
        const activeClass = isActive ? ' active' : '';
        const ipcs = this.gameState.getIPCs(p.id);
        const territories = this.gameState.getPlayerTerritories(p.id).length;
        const flagSrc = p.flag ? `assets/flags/${p.flag}` : null;

        html += `
          <span class="legend-item${activeClass}">
            ${flagSrc ? `<img src="${flagSrc}" class="legend-flag" alt="${p.name}">` : `<span class="legend-dot" style="background:${p.color}"></span>`}
            <span class="legend-name">${p.name}</span>
            <span class="legend-stats">${territories}T / ${ipcs}$</span>
          </span>`;
      }
    }
    html += `</div>`;

    this.el.innerHTML = html;
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
