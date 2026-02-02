// Player-focused panel showing current player info, turn phase, and actions

import { GAME_PHASES, TURN_PHASES, TURN_PHASE_NAMES } from '../state/gameState.js';

const PHASE_DESCRIPTIONS = {
  [GAME_PHASES.CAPITAL_PLACEMENT]: 'Click on one of your territories to place your capital city.',
  [GAME_PHASES.UNIT_PLACEMENT]: 'Purchase units to place at your capital or adjacent sea zones.',
  [TURN_PHASES.DEVELOP_TECH]: 'Spend IPCs on research dice to unlock new technologies.',
  [TURN_PHASES.PURCHASE]: 'Purchase new units. They will be placed during the Mobilize phase.',
  [TURN_PHASES.COMBAT_MOVE]: 'Move units into enemy territories to initiate combat.',
  [TURN_PHASES.COMBAT]: 'Resolve combat in contested territories.',
  [TURN_PHASES.NON_COMBAT_MOVE]: 'Move units that did not engage in combat.',
  [TURN_PHASES.MOBILIZE]: 'Place your purchased units at factories.',
  [TURN_PHASES.COLLECT_INCOME]: 'Collect IPCs from your territories.',
};

export class PlayerPanel {
  constructor() {
    this.gameState = null;
    this.unitDefs = null;
    this.onAction = null;
    this.selectedTerritory = null;

    // Create panel element (replaces sidebar)
    this.el = document.getElementById('sidebar');
    this.el.innerHTML = '';
    this.el.className = 'player-panel';
  }

  setGameState(gameState) {
    this.gameState = gameState;
    gameState.subscribe(() => this._render());
    this._render();
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  setActionCallback(callback) {
    this.onAction = callback;
  }

  setSelectedTerritory(territory) {
    this.selectedTerritory = territory;
    this._render();
  }

  show() {
    this.el.classList.remove('hidden');
    this._render();
  }

  hide() {
    this.el.classList.add('hidden');
  }

  _render() {
    if (!this.gameState) {
      this.el.innerHTML = '';
      return;
    }

    const player = this.gameState.currentPlayer;
    if (!player) {
      this.el.innerHTML = '';
      return;
    }

    const phase = this.gameState.phase;
    const turnPhase = this.gameState.turnPhase;
    const ipcs = this.gameState.getIPCs(player.id);
    const territories = this.gameState.getPlayerTerritories(player.id).length;

    let html = '';

    // Player header
    html += `
      <div class="pp-header">
        ${player.flag ? `<img src="assets/flags/${player.flag}" class="pp-flag" alt="${player.name}">` : ''}
        <div class="pp-player-info">
          <div class="pp-player-name" style="color:${player.color}">${player.name}</div>
          ${player.alliance ? `<span class="pp-alliance ${player.alliance.toLowerCase()}">${player.alliance}</span>` : ''}
        </div>
      </div>`;

    // Current phase
    const phaseName = this._getPhaseName(phase, turnPhase);
    const phaseDesc = this._getPhaseDescription(phase, turnPhase);

    html += `
      <div class="pp-phase">
        <div class="pp-phase-label">${phase === GAME_PHASES.PLAYING ? `Round ${this.gameState.round}` : 'Setup'}</div>
        <div class="pp-phase-name">${phaseName}</div>
        <div class="pp-phase-desc">${phaseDesc}</div>
      </div>`;

    // Resources
    html += `
      <div class="pp-resources">
        <div class="pp-resource">
          <div class="pp-resource-value">${ipcs}</div>
          <div class="pp-resource-label">IPCs</div>
        </div>
        <div class="pp-resource">
          <div class="pp-resource-value">${territories}</div>
          <div class="pp-resource-label">Territories</div>
        </div>
      </div>`;

    // RISK Cards (only in Risk mode)
    if (this.gameState.gameMode === 'risk') {
      const cards = this.gameState.riskCards?.[player.id] || [];
      const canTrade = this.gameState.canTradeRiskCards?.(player.id);
      const nextValue = this.gameState.getNextRiskCardValue?.(player.id) || 12;

      if (cards.length > 0 || canTrade) {
        html += `
          <div class="pp-risk-cards">
            <div class="pp-cards-label">RISK Cards (${cards.length})</div>
            <div class="pp-cards-list">
              ${cards.map(c => `<span class="pp-card ${c}">${c}</span>`).join('')}
            </div>
            ${canTrade ? `
              <button class="pp-trade-btn" data-action="trade-cards">
                Trade Cards for ${nextValue} IPCs
              </button>
            ` : cards.length >= 5 ? `
              <div class="pp-cards-note">Must trade when you have 5+ cards</div>
            ` : ''}
          </div>
        `;
      }
    }

    // Actions
    html += `<div class="pp-actions">`;
    html += this._renderActions(phase, turnPhase, player);
    html += `</div>`;

    this.el.innerHTML = html;
    this._bindEvents();
  }

  _getPhaseName(phase, turnPhase) {
    if (phase === GAME_PHASES.CAPITAL_PLACEMENT) return 'Place Capital';
    if (phase === GAME_PHASES.UNIT_PLACEMENT) return 'Initial Deployment';
    if (phase === GAME_PHASES.PLAYING) return TURN_PHASE_NAMES[turnPhase] || turnPhase;
    return 'Setup';
  }

  _getPhaseDescription(phase, turnPhase) {
    if (phase === GAME_PHASES.CAPITAL_PLACEMENT) return PHASE_DESCRIPTIONS[GAME_PHASES.CAPITAL_PLACEMENT];
    if (phase === GAME_PHASES.UNIT_PLACEMENT) return PHASE_DESCRIPTIONS[GAME_PHASES.UNIT_PLACEMENT];
    if (phase === GAME_PHASES.PLAYING) return PHASE_DESCRIPTIONS[turnPhase] || '';
    return '';
  }

  _renderActions(phase, turnPhase, player) {
    let html = '';

    // Capital placement phase
    if (phase === GAME_PHASES.CAPITAL_PLACEMENT) {
      if (this.selectedTerritory && !this.selectedTerritory.isWater) {
        const owner = this.gameState.getOwner(this.selectedTerritory.name);
        if (owner === player.id) {
          html += `
            <button class="pp-action-btn" data-action="place-capital" data-territory="${this.selectedTerritory.name}">
              Place Capital in ${this.selectedTerritory.name}
            </button>`;
        } else {
          html += `<p class="pp-hint">Select one of your own territories</p>`;
        }
      } else {
        html += `<p class="pp-hint">Click on your territory to select capital location</p>`;
      }
    }

    // Unit placement phase
    if (phase === GAME_PHASES.UNIT_PLACEMENT) {
      html += this._renderUnitPurchase(player);
    }

    // Playing phase
    if (phase === GAME_PHASES.PLAYING) {
      // Phase-specific content
      if (turnPhase === TURN_PHASES.DEVELOP_TECH) {
        html += `
          <button class="pp-action-btn" data-action="open-tech">
            Research Technology
          </button>`;
      }

      if (turnPhase === TURN_PHASES.PURCHASE) {
        html += `
          <button class="pp-action-btn" data-action="open-purchase">
            Purchase Units
          </button>`;
      }

      if (turnPhase === TURN_PHASES.COMBAT_MOVE || turnPhase === TURN_PHASES.NON_COMBAT_MOVE) {
        const canUndo = turnPhase === TURN_PHASES.COMBAT_MOVE &&
          this.gameState.moveHistory && this.gameState.moveHistory.length > 0;

        html += `
          <div class="pp-movement-hint">
            <p>Click a territory with your units to select them, then click a destination.</p>
            ${canUndo ? `<button class="pp-undo-btn" data-action="undo-move">Undo Last Move</button>` : ''}
          </div>`;
      }

      if (turnPhase === TURN_PHASES.COMBAT) {
        const combatCount = this.gameState.combatQueue?.length || 0;
        if (combatCount > 0) {
          html += `
            <div class="pp-combat-info">
              <span class="combat-count">${combatCount}</span> battle(s) pending
            </div>
            <button class="pp-action-btn combat" data-action="open-combat">
              Resolve Combat
            </button>`;
        } else {
          html += `<p class="pp-hint">No battles to resolve</p>`;
        }
      }

      // End phase button
      html += `
        <button class="pp-action-btn secondary" data-action="next-phase">
          End ${this._getPhaseName(phase, turnPhase)}
        </button>`;
    }

    return html;
  }

  _renderUnitPurchase(player) {
    const capital = this.gameState.playerState[player.id]?.capitalTerritory;
    if (!capital) return '<p class="pp-hint">Place your capital first</p>';

    const ipcs = this.gameState.getIPCs(player.id);

    let html = `<div class="pp-purchase">`;

    // Show current budget
    html += `
      <div class="pp-budget-display">
        <span class="pp-budget-label">Available Budget</span>
        <span class="pp-budget-value">${ipcs} IPCs</span>
      </div>`;

    // Buy units button - triggers popup
    html += `
      <button class="pp-action-btn" data-action="open-purchase">
        Buy Units
      </button>`;

    html += `
      <button class="pp-action-btn secondary" data-action="finish-placement">
        Done - Next Player
      </button>`;
    html += `</div>`;

    return html;
  }

  _bindEvents() {
    this.el.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const territory = btn.dataset.territory;

        // Pass all actions to callback
        if (this.onAction) {
          this.onAction(action, { territory });
        }
      });
    });
  }
}
