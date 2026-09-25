// Tech Research UI - popup for developing technologies during DEVELOP_TECH phase

import { TECHNOLOGIES, shouldShowTechResearch } from '../state/gameState.js';
import { setShellFlag } from './mobileShell.js';
import { syncBottomSurfaces } from './bottomSurface.js';

export class TechUI {
  constructor() {
    this.gameState = null;
    this.onComplete = null;
    this.diceCount = 0;
    this.lastRolls = null;
    this.breakthrough = false;
    this.picksLeft = 0;
    this.isMinimized = false;

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
    if (!shouldShowTechResearch(this.gameState?.phase, this.gameState?.turnPhase)) {
      return;
    }
    this.diceCount = 0;
    this.lastRolls = null;
    this.breakthrough = false;
    this.picksLeft = 0;
    this._render();
    this.el.classList.remove('hidden');
    this._syncSheetFlag();
  }

  hide() {
    this.el.classList.add('hidden');
    this._syncSheetFlag();
  }

  _syncSheetFlag() {
    const visible = !!this.el && !this.el.classList.contains('hidden');
    setShellFlag('tech-active', visible);
    syncBottomSurfaces();
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
          <button class="left-modal-minimize-btn" data-action="toggle-minimize" title="${this.isMinimized ? 'Expand' : 'Minimize'}">${this.isMinimized ? '□' : '—'}</button>
        </div>

        <div class="tech-budget">
          <span class="tech-budget-label">Available IPCs:</span>
          <span class="tech-budget-value">${ipcs}</span>
          <span class="tech-cost-note">(5 IPCs per research die)</span>
        </div>
    `;

    // If we have a breakthrough, show tech selection
    if (this.breakthrough) {
      // Check if there are any available techs to unlock
      if (availableTechs.length === 0) {
        // All techs already unlocked - show message and continue button
        html += `
          <div class="tech-breakthrough">
            <div class="tech-breakthrough-title">Breakthrough!</div>
            <div class="tech-breakthrough-desc" style="color: #888;">
              You've already unlocked all technologies! Your research breakthrough has no effect.
            </div>
            <button class="tech-btn done" data-action="done" style="margin-top: 12px;">Continue</button>
          </div>
        `;
      } else {
        const picksLeft = this.picksLeft || 1;
        const pickLine = picksLeft > 1
          ? `Choose ${picksLeft} technologies (each 6 is one):`
          : 'Choose a technology to unlock:';
        html += `
          <div class="tech-breakthrough">
            <div class="tech-breakthrough-title">Breakthrough!</div>
            <div class="tech-breakthrough-desc">${pickLine}</div>
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
      }
    } else if (this.lastRolls) {
      // Show roll results - horizontal row like combat
      html += `
        <div class="tech-results">
          <div class="tech-results-title">Research Results</div>
          <div class="dice-display tech-dice-row">
            ${this.lastRolls.map(roll => `
              <div class="die ${roll === 6 ? 'hit' : 'miss'}">${roll}</div>
            `).join('')}
          </div>
          <div class="tech-results-msg ${this.lastRolls.some(r => r === 6) ? 'success' : 'fail'}">
            ${this._breakthroughMessage(this.lastRolls)}
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
    // Minimize toggle
    this.el.querySelector('[data-action="toggle-minimize"]')?.addEventListener('click', () => {
      this.isMinimized = !this.isMinimized;
      this.el.classList.toggle('minimized', this.isMinimized);
      this._render();
    });

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
        if (this._consumeTechPick()) return;
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

  async _rollDice() {
    if (this.diceCount <= 0) return;

    const player = this.gameState.currentPlayer;

    // Purchase the dice first
    this.gameState.purchaseTechDice(player.id, this.diceCount);

    // Show rolling animation for 1 second
    this._showRollingAnimation();

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Roll
    const result = this.gameState.rollTechDice(player.id);
    this.lastRolls = result.rolls;
    this.picksLeft = result.picks ?? (result.success ? 1 : 0);
    this.breakthrough = this.picksLeft > 0;
    this.diceCount = 0;

    this._render();
  }

  _showRollingAnimation() {
    const diceArea = this.el.querySelector('.tech-dice-select');
    if (!diceArea) return;

    let html = `
      <div class="tech-rolling">
        <div class="tech-rolling-title">Rolling ${this.diceCount} dice...</div>
        <div class="dice-display tech-dice-row">
    `;

    for (let i = 0; i < this.diceCount; i++) {
      const delay = i * 30;
      html += `<div class="die die-3d rolling" style="animation-delay: ${delay}ms">${Math.floor(Math.random() * 6) + 1}</div>`;
    }

    html += `</div></div>`;
    diceArea.innerHTML = html;

    // Animate values
    const animateInterval = setInterval(() => {
      const dice = diceArea.querySelectorAll('.die');
      dice.forEach(die => {
        die.textContent = Math.floor(Math.random() * 6) + 1;
      });
    }, 100);

    setTimeout(() => clearInterval(animateInterval), 1000);
  }

  _breakthroughMessage(rolls) {
    const sixes = (rolls || []).filter((face) => face === 6).length;
    if (sixes <= 0) return 'No breakthrough this time.';
    const picks = this.picksLeft || (sixes > 0 ? 1 : 0);
    if (picks > 1) return `${picks} breakthroughs. Pick ${picks} technologies.`;
    return 'Breakthrough! Rolled a 6!';
  }

  // One distinct tech per breakthrough. Off is a single pick (today).
  _consumeTechPick({ centered = false, playerId = null } = {}) {
    this.picksLeft = Math.max(0, (this.picksLeft || 1) - 1);
    const id = playerId || this.gameState?.currentPlayer?.id;
    const more = id ? (this.gameState.getAvailableTechs(id) || []) : [];
    if (this.picksLeft > 0 && more.length > 0) {
      this.breakthrough = true;
      if (centered) this._showCenteredTechSelection(this.lastRolls || [], id);
      else this._render();
      return true;
    }
    this.breakthrough = false;
    this.picksLeft = 0;
    this.lastRolls = null;
    if (centered) {
      this._hideCenteredDiceResult();
      if (this.onComplete) this.onComplete();
    } else {
      this._complete();
    }
    return true;
  }

  _complete() {
    this.hide();
    if (this.onComplete) {
      this.onComplete();
    }
  }

  // Inline roll - shows centered dice result instead of full modal
  async performInlineRoll(diceCount) {
    if (diceCount <= 0) return;
    if (!shouldShowTechResearch(this.gameState?.phase, this.gameState?.turnPhase)) {
      return;
    }

    const player = this.gameState.currentPlayer;
    if (!player) return;

    // Purchase the dice first
    this.gameState.purchaseTechDice(player.id, diceCount);

    // Create centered dice result overlay
    this._showCenteredDiceResult(diceCount, null, true); // Show rolling state

    // Wait for rolling animation
    await new Promise(resolve => setTimeout(resolve, 1200));

    // Perform the actual roll
    const result = this.gameState.rollTechDice(player.id);
    this.picksLeft = result.picks ?? (result.success ? 1 : 0);
    this.breakthrough = this.picksLeft > 0;

    // Show final result
    this._showCenteredDiceResult(diceCount, result, false);

    // If breakthrough, show tech selection in centered overlay
    if (this.picksLeft > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      this._showCenteredTechSelection(result.rolls, player.id);
    } else {
      // Auto-hide after 2 seconds if no breakthrough
      await new Promise(resolve => setTimeout(resolve, 2000));
      this._hideCenteredDiceResult();
      if (this.onComplete) {
        this.onComplete();
      }
    }
  }

  _showCenteredDiceResult(diceCount, result, isRolling) {
    // Create or reuse overlay element
    let overlay = document.getElementById('techDiceOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'techDiceOverlay';
      overlay.className = 'tech-dice-overlay';
      document.body.appendChild(overlay);
    }

    let html = `<div class="tech-dice-result-box">`;

    if (isRolling) {
      html += `
        <div class="tech-dice-result-title">Rolling Research Dice...</div>
        <div class="dice-display tech-dice-centered">`;
      for (let i = 0; i < diceCount; i++) {
        const delay = i * 50;
        html += `<div class="die die-3d rolling" style="animation-delay: ${delay}ms">${Math.floor(Math.random() * 6) + 1}</div>`;
      }
      html += `</div></div>`;

      // Start rolling animation
      overlay.innerHTML = html;
      overlay.classList.remove('hidden');

      // Animate dice values
      const animateInterval = setInterval(() => {
        const dice = overlay.querySelectorAll('.die');
        dice.forEach(die => {
          die.textContent = Math.floor(Math.random() * 6) + 1;
        });
      }, 80);

      // Store interval for cleanup
      overlay.dataset.animateInterval = animateInterval;
    } else {
      // Clear any animation interval
      if (overlay.dataset.animateInterval) {
        clearInterval(parseInt(overlay.dataset.animateInterval));
      }

      const hasBreakthrough = result?.success;
      html += `
        <div class="tech-dice-result-title">${hasBreakthrough ? '🔬 BREAKTHROUGH!' : 'Research Results'}</div>
        <div class="dice-display tech-dice-centered">
          ${result.rolls.map(roll => `
            <div class="die ${roll === 6 ? 'hit' : 'miss'}">${roll}</div>
          `).join('')}
        </div>
        <div class="tech-dice-result-msg ${hasBreakthrough ? 'success' : 'fail'}">
          ${hasBreakthrough ? 'Rolled a 6! Choose your technology...' : 'No breakthrough this time'}
        </div>
        ${!hasBreakthrough ? `<button class="tech-dice-close-btn">Continue</button>` : ''}
      </div>`;

      overlay.innerHTML = html;
      overlay.classList.remove('hidden');
      overlay.classList.toggle('breakthrough', hasBreakthrough);

      // Add click handler for close button
      if (!hasBreakthrough) {
        overlay.querySelector('.tech-dice-close-btn')?.addEventListener('click', () => {
          this._hideCenteredDiceResult();
          if (this.onComplete) {
            this.onComplete();
          }
        });
      }
    }
  }

  _hideCenteredDiceResult() {
    const overlay = document.getElementById('techDiceOverlay');
    if (overlay) {
      if (overlay.dataset.animateInterval) {
        clearInterval(parseInt(overlay.dataset.animateInterval));
      }
      overlay.classList.add('hidden');
    }
  }

  _showCenteredTechSelection(rolls, playerId) {
    const overlay = document.getElementById('techDiceOverlay');
    if (!overlay) return;

    // Get available techs
    const techState = this.gameState.playerTechs?.[playerId] || { unlockedTechs: [] };
    const unlockedTechs = techState.unlockedTechs || [];
    const availableTechs = Object.entries(TECHNOLOGIES)
      .filter(([id, _]) => !unlockedTechs.includes(id));

    let html = `<div class="tech-dice-result-box breakthrough">
      <div class="tech-dice-result-title">🔬 BREAKTHROUGH!</div>
      <div class="dice-display tech-dice-centered">
        ${rolls.map(roll => `
          <div class="die ${roll === 6 ? 'hit' : 'miss'}">${roll}</div>
        `).join('')}
      </div>
      <div class="tech-select-header">${(this.picksLeft || 1) > 1 ? `Choose ${this.picksLeft} technologies:` : 'Choose a Technology to Unlock:'}</div>
      <div class="tech-select-options">`;

    for (const [id, tech] of availableTechs) {
      html += `
        <button class="tech-select-btn" data-tech="${id}">
          <span class="tech-select-name">${tech.name}</span>
          <span class="tech-select-desc">${tech.description}</span>
        </button>`;
    }

    html += `</div></div>`;

    overlay.innerHTML = html;
    overlay.classList.add('breakthrough');

    // Bind click events for tech selection
    overlay.querySelectorAll('.tech-select-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const techId = btn.dataset.tech;
        this.gameState.unlockTech(playerId, techId);
        if (this._consumeTechPick({ centered: true, playerId })) return;
      });
    });
  }
}
