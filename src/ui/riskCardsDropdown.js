// Risk Cards Dropdown - shows cards on the right side with a collapsible panel

import { shouldShowPurchase } from '../state/gameState.js';

export class RiskCardsDropdown {
  constructor() {
    this.gameState = null;
    this.onTradeCards = null;
    this.isExpanded = false;

    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'riskCardsDropdown';
    this.el.className = 'risk-cards-dropdown hidden';
    document.body.appendChild(this.el);
  }

  setGameState(gameState) {
    this.gameState = gameState;
    gameState.subscribe(() => this._render());
    this._render();
  }

  setOnTradeCards(callback) {
    this.onTradeCards = callback;
  }

  show() {
    this.el.classList.remove('hidden');
    this._render();
  }

  hide() {
    this.el.classList.add('hidden');
  }

  toggle() {
    this.isExpanded = !this.isExpanded;
    this._render();
  }

  _render() {
    if (!this.gameState || this.gameState.gameMode !== 'risk') {
      this.el.classList.add('hidden');
      return;
    }

    const player = this.gameState.currentPlayer;
    if (!player) {
      this.el.classList.add('hidden');
      return;
    }

    this.el.classList.remove('hidden');

    const cards = this.gameState.riskCards?.[player.id] || [];
    const canTrade = this.gameState.canTradeRiskCards?.(player.id);
    const nextValue = this.gameState.getNextRiskCardValue?.(player.id) || 12;
    const turnPhase = this.gameState.turnPhase;

    const cardIcons = {
      infantry: '🚶',
      cavalry: '🐎',
      artillery: '💣',
      wild: '⭐'
    };

    // Count cards by type
    const cardCounts = {};
    cards.forEach(c => {
      cardCounts[c] = (cardCounts[c] || 0) + 1;
    });

    let html = `
      <div class="rcd-header" data-action="toggle">
        <span class="rcd-icon">🃏</span>
        <span class="rcd-title">RISK Cards</span>
        <span class="rcd-count">${cards.length}</span>
        <span class="rcd-arrow ${this.isExpanded ? 'expanded' : ''}">▼</span>
      </div>
    `;

    if (this.isExpanded) {
      html += `<div class="rcd-content">`;

      if (cards.length === 0) {
        html += `<div class="rcd-empty">No cards yet. Conquer territories to earn cards!</div>`;
      } else {
        html += `<div class="rcd-cards">`;
        for (const card of cards) {
          html += `
            <div class="rcd-card ${card}">
              <span class="rcd-card-icon">${cardIcons[card] || '?'}</span>
              <span class="rcd-card-name">${card}</span>
            </div>
          `;
        }
        html += `</div>`;

        // Summary
        html += `<div class="rcd-summary">`;
        for (const [type, count] of Object.entries(cardCounts)) {
          html += `<span class="rcd-summary-item">${cardIcons[type]} ${count}</span>`;
        }
        html += `</div>`;
      }

      // Trade section
      if (canTrade) {
        html += `
          <div class="rcd-trade">
            <div class="rcd-trade-info">
              <span>Trade value:</span>
              <strong>${nextValue} IPCs</strong>
            </div>
            ${shouldShowPurchase(this.gameState.phase, turnPhase) ? `
              <button class="rcd-trade-btn" data-action="trade">Cash In Cards</button>
            ` : `
              <button class="rcd-trade-btn disabled" disabled>Cash In Cards</button>
              <div class="rcd-trade-note">Available during Purchase phase</div>
            `}
          </div>
        `;
      } else if (cards.length >= 5) {
        html += `<div class="rcd-warning">Must trade when you have 5+ cards!</div>`;
      }

      html += `</div>`;
    }

    this.el.innerHTML = html;
    this._bindEvents();
  }

  _bindEvents() {
    this.el.querySelector('[data-action="toggle"]')?.addEventListener('click', () => {
      this.toggle();
    });

    this.el.querySelector('[data-action="trade"]')?.addEventListener('click', () => {
      if (this.onTradeCards) {
        this.onTradeCards();
      }
    });
  }
}
