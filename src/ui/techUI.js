// Tech Research UI - popup for developing technologies during DEVELOP_TECH phase

import { TECHNOLOGIES } from '../state/gameState.js';

export class TechUI {
  constructor() {
    this.gameState = null;
    this.onComplete = null;
    this.diceCount = 0;
    this.lastRolls = null;
    this.breakthrough = false;

    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'techPopup';
    this.el.className = 'tech-popup hidden';
    document.body.appendChild(this.el);
  }

  setGameState(gameState) {
    this.gameState = gameState;
  }

  setOnComplete(callback) {
    this.onComplete = callback;
  }

  show() {
    this.diceCount = 0;
    this.lastRolls = null;
    this.breakthrough = false;
    this._render();
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  _render() {
    if (!this.gameState) return;

    const player = this.gameState.currentPlayer;
    if (!player) return;

    const ipcs = this.gameState.getIPCs(player.id);
    const techState = this.gameState.playerTechs[player.id] || { techTokens: 0, unlockedTechs: [] };
    const maxDice = Math.floor(ipcs / 5);
    const availableTechs = this.gameState.getAvailableTechs(player.id);

    let html = `
      <div class="tech-content">
        <div class="tech-header">
          <div class="tech-title">Technology Research</div>
          <div class="tech-player" style="color: ${player.color}">${player.name}</div>
        </div>

        <div class="tech-budget">
          <span class="tech-budget-label">Available IPCs:</span>
          <span class="tech-budget-value">${ipcs}</span>
          <span class="tech-cost-note">(5 IPCs per research die)</span>
        </div>
    `;

    // If we have a breakthrough, show tech selection
    if (this.breakthrough) {
      html += `
        <div class="tech-breakthrough">
          <div class="tech-breakthrough-title">Breakthrough!</div>
          <div class="tech-breakthrough-desc">Choose a technology to unlock:</div>
          <div class="tech-options">
            ${availableTechs.map(techId => {
              const tech = TECHNOLOGIES[techId];
              return `
                <button class="tech-option" data-tech="${techId}">
                  <span class="tech-option-name">${tech.name}</span>
                  <span class="tech-option-desc">${tech.description}</span>
                </button>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else if (this.lastRolls) {
      // Show roll results
      html += `
        <div class="tech-results">
          <div class="tech-results-title">Research Results</div>
          <div class="tech-dice">
            ${this.lastRolls.map(roll => `
              <div class="tech-die ${roll === 6 ? 'success' : ''}">${roll}</div>
            `).join('')}
          </div>
          <div class="tech-results-msg ${this.lastRolls.some(r => r === 6) ? 'success' : 'fail'}">
            ${this.lastRolls.some(r => r === 6) ? 'Breakthrough! Roll a 6!' : 'No breakthrough this time.'}
          </div>
        </div>
      `;
    } else {
      // Show dice selection
      html += `
        <div class="tech-dice-select">
          <div class="tech-dice-label">Research Dice: <span class="tech-dice-count">${this.diceCount}</span></div>
          <div class="tech-dice-controls">
            <button class="tech-dice-btn minus" ${this.diceCount <= 0 ? 'disabled' : ''}>−</button>
            <input type="range" class="tech-dice-slider" min="0" max="${maxDice}" value="${this.diceCount}">
            <button class="tech-dice-btn plus" ${this.diceCount >= maxDice ? 'disabled' : ''}>+</button>
          </div>
          <div class="tech-dice-cost">Cost: ${this.diceCount * 5} IPCs</div>
        </div>
      `;
    }

    // Unlocked techs
    if (techState.unlockedTechs.length > 0) {
      html += `
        <div class="tech-unlocked">
          <div class="tech-unlocked-label">Unlocked Technologies:</div>
          <div class="tech-unlocked-list">
            ${techState.unlockedTechs.map(techId => {
              const tech = TECHNOLOGIES[techId];
              return `<span class="tech-badge">${tech.name}</span>`;
            }).join('')}
          </div>
        </div>
      `;
    }

    // Actions
    html += `<div class="tech-actions">`;

    if (this.breakthrough) {
      // No skip button during breakthrough - must choose
    } else if (this.lastRolls) {
      html += `
        <button class="tech-btn done" data-action="done">Continue</button>
      `;
    } else {
      if (this.diceCount > 0) {
        html += `
          <button class="tech-btn roll" data-action="roll">Roll Research Dice</button>
        `;
      }
      html += `
        <button class="tech-btn skip" data-action="skip">Skip Research</button>
      `;
    }

    html += `</div></div>`;

    this.el.innerHTML = html;
    this._bindEvents();
  }

  _bindEvents() {
    // Dice controls
    this.el.querySelector('.tech-dice-btn.minus')?.addEventListener('click', () => {
      if (this.diceCount > 0) {
        this.diceCount--;
        this._render();
      }
    });

    this.el.querySelector('.tech-dice-btn.plus')?.addEventListener('click', () => {
      const ipcs = this.gameState.getIPCs(this.gameState.currentPlayer.id);
      const maxDice = Math.floor(ipcs / 5);
      if (this.diceCount < maxDice) {
        this.diceCount++;
        this._render();
      }
    });

    this.el.querySelector('.tech-dice-slider')?.addEventListener('input', (e) => {
      this.diceCount = parseInt(e.target.value);
      this._render();
    });

    // Tech selection (after breakthrough)
    this.el.querySelectorAll('.tech-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const techId = btn.dataset.tech;
        this.gameState.unlockTech(this.gameState.currentPlayer.id, techId);
        this.breakthrough = false;
        this.lastRolls = null;
        this._complete();
      });
    });

    // Action buttons
    this.el.querySelectorAll('.tech-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;

        switch (action) {
          case 'roll':
            this._rollDice();
            break;
          case 'skip':
          case 'done':
            this._complete();
            break;
        }
      });
    });
  }

  _rollDice() {
    if (this.diceCount <= 0) return;

    const player = this.gameState.currentPlayer;

    // Purchase the dice first
    this.gameState.purchaseTechDice(player.id, this.diceCount);

    // Roll
    const result = this.gameState.rollTechDice(player.id);
    this.lastRolls = result.rolls;
    this.breakthrough = result.success;
    this.diceCount = 0;

    this._render();
  }

  _complete() {
    this.hide();
    if (this.onComplete) {
      this.onComplete();
    }
  }
}
