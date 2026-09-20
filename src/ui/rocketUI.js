// Rocket Attack UI - Modal for launching rocket attacks (Rockets technology)

import { getUnitIconPath } from '../utils/unitIcons.js';

export class RocketUI {
  constructor() {
    this.gameState = null;
    this.unitDefs = null;
    this.onComplete = null;
    this.onCenterCamera = null;

    this.isActive = false;
    this.fromTerritory = null;
    this.targetTerritory = null;
    this.attackResult = null;
    this.phase = 'select'; // 'select', 'rolling', 'result'

    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'rocketPopup';
    this.el.className = 'rocket-popup hidden';
    document.body.appendChild(this.el);
  }

  setGameState(gameState) {
    this.gameState = gameState;
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  setOnComplete(callback) {
    this.onComplete = callback;
  }

  setOnCenterCamera(callback) {
    this.onCenterCamera = callback;
  }

  // Show the rocket attack selection modal
  show(fromTerritory = null) {
    this.isActive = true;
    this.fromTerritory = fromTerritory;
    this.targetTerritory = null;
    this.attackResult = null;
    this.phase = 'select';

    this._render();
    this.el.classList.remove('hidden');
  }

  hide() {
    this.isActive = false;
    this.el.classList.add('hidden');

    if (this.onComplete) {
      this.onComplete();
    }
  }

  // Launch a rocket attack
  async launchRocket(fromTerritory, targetTerritory) {
    this.fromTerritory = fromTerritory;
    this.targetTerritory = targetTerritory;
    this.phase = 'rolling';
    this._render();

    // Animate dice roll
    await this._animateDiceRoll();

    // Execute the attack
    const result = this.gameState.launchRocket(fromTerritory, targetTerritory);
    this.attackResult = result;
    this.phase = 'result';
    this._render();
  }

  async _animateDiceRoll() {
    return new Promise(resolve => {
      let frames = 0;
      const maxFrames = 15;
      const diceEl = this.el.querySelector('.rocket-dice-value');

      const animate = () => {
        if (frames < maxFrames) {
          if (diceEl) {
            diceEl.textContent = Math.floor(Math.random() * 6) + 1;
          }
          frames++;
          setTimeout(animate, 80);
        } else {
          resolve();
        }
      };

      animate();
    });
  }

  _render() {
    if (!this.gameState) return;

    const player = this.gameState.currentPlayer;
    if (!player) return;

    let html = '';

    if (this.phase === 'select') {
      html = this._renderSelectPhase(player);
    } else if (this.phase === 'rolling') {
      html = this._renderRollingPhase(player);
    } else if (this.phase === 'result') {
      html = this._renderResultPhase(player);
    }

    this.el.innerHTML = html;
    this._bindEvents();
  }

  _renderSelectPhase(player) {
    const availableAA = this.gameState.getAvailableRocketAAguns(player.id);

    // Filter to only show AA with valid targets
    const aaWithTargets = [];
    for (const aa of availableAA) {
      const targets = this.gameState.getRocketTargets(aa.territory);
      if (targets.length > 0) {
        aaWithTargets.push({ ...aa, targets });
      }
    }

    return `
      <div class="rocket-header" style="border-left: 5px solid ${player.color}">
        <div class="rocket-title">
          <span class="rocket-icon">🚀</span>
          Rocket Attack
        </div>
        <button class="rocket-close-btn" data-action="close">&times;</button>
      </div>

      <div class="rocket-content">
        <div class="rocket-instructions">
          Select an AA gun to launch a rocket attack against an enemy factory.
          Each AA gun can fire once per turn.
        </div>

        ${aaWithTargets.length === 0 ? `
          <div class="rocket-no-targets">
            No available rocket attacks. AA guns need adjacent enemy factories.
          </div>
        ` : `
          <div class="rocket-sources">
            ${aaWithTargets.map(aa => `
              <div class="rocket-source-card">
                <div class="rocket-source-header">
                  <img src="${getUnitIconPath('aaGun', player.id)}" class="rocket-unit-icon" alt="AA Gun">
                  <span class="rocket-source-name">${aa.territory}</span>
                  <span class="rocket-source-count">${aa.availableCount} available</span>
                </div>
                <div class="rocket-targets">
                  ${aa.targets.map(target => `
                    <button class="rocket-target-btn" data-action="launch"
                            data-from="${aa.territory}" data-target="${target.territory}">
                      <div class="rocket-target-info">
                        <img src="${getUnitIconPath('factory', target.owner)}" class="rocket-unit-icon small" alt="Factory">
                        <span class="rocket-target-name">${target.territory}</span>
                      </div>
                      <div class="rocket-target-owner">
                        ${target.ownerName}: ${target.ownerIPCs} IPCs
                      </div>
                    </button>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <div class="rocket-actions">
        <button class="rocket-btn secondary" data-action="close">Cancel</button>
      </div>
    `;
  }

  _renderRollingPhase(player) {
    const targetOwner = this.gameState.getOwner(this.targetTerritory);
    const targetPlayer = this.gameState.getPlayer(targetOwner);

    return `
      <div class="rocket-header" style="border-left: 5px solid ${player.color}">
        <div class="rocket-title">
          <span class="rocket-icon">🚀</span>
          Rocket Attack
        </div>
      </div>

      <div class="rocket-content">
        <div class="rocket-battle-display">
          <div class="rocket-attacker">
            <div class="rocket-side-label">Launching from</div>
            <div class="rocket-side-territory">${this.fromTerritory}</div>
            <img src="${getUnitIconPath('aaGun', player.id)}" class="rocket-battle-icon" alt="AA Gun">
          </div>

          <div class="rocket-arrow">
            <span class="rocket-projectile">🚀</span>
          </div>

          <div class="rocket-target">
            <div class="rocket-side-label">Target</div>
            <div class="rocket-side-territory">${this.targetTerritory}</div>
            <img src="${getUnitIconPath('factory', targetOwner)}" class="rocket-battle-icon" alt="Factory">
          </div>
        </div>

        <div class="rocket-dice-section rolling">
          <div class="rocket-dice-label">Rolling for damage...</div>
          <div class="rocket-dice">
            <span class="rocket-dice-value">?</span>
          </div>
        </div>
      </div>
    `;
  }

  _renderResultPhase(player) {
    const result = this.attackResult;
    if (!result) return '';

    const targetOwner = this.gameState.getOwner(this.targetTerritory);
    const targetPlayer = this.gameState.getPlayer(targetOwner);

    return `
      <div class="rocket-header ${result.success ? 'success' : 'failed'}" style="border-left: 5px solid ${player.color}">
        <div class="rocket-title">
          <span class="rocket-icon">🚀</span>
          Rocket Attack ${result.success ? 'Result' : 'Failed'}
        </div>
      </div>

      <div class="rocket-content">
        <div class="rocket-battle-display">
          <div class="rocket-attacker">
            <div class="rocket-side-label">Launched from</div>
            <div class="rocket-side-territory">${this.fromTerritory}</div>
            <img src="${getUnitIconPath('aaGun', player.id)}" class="rocket-battle-icon" alt="AA Gun">
          </div>

          <div class="rocket-arrow hit">
            <span class="rocket-explosion">💥</span>
          </div>

          <div class="rocket-target">
            <div class="rocket-side-label">Target</div>
            <div class="rocket-side-territory">${this.targetTerritory}</div>
            <img src="${getUnitIconPath('factory', targetOwner)}" class="rocket-battle-icon" alt="Factory">
          </div>
        </div>

        ${result.success ? `
          <div class="rocket-result-section">
            <div class="rocket-dice-section">
              <div class="rocket-dice-label">Damage Roll</div>
              <div class="rocket-dice result">
                <span class="rocket-dice-value">${result.damage}</span>
              </div>
            </div>

            <div class="rocket-damage-display">
              <div class="rocket-damage-icon">💰</div>
              <div class="rocket-damage-text">
                <span class="rocket-damage-amount">-${result.actualDamage} IPCs</span>
                <span class="rocket-damage-target">${targetPlayer?.name || targetOwner}</span>
              </div>
            </div>

            ${result.actualDamage < result.damage ? `
              <div class="rocket-damage-note">
                (Target only had ${result.targetIPCs} IPCs)
              </div>
            ` : ''}
          </div>
        ` : `
          <div class="rocket-error">
            ${result.error || 'Rocket attack failed'}
          </div>
        `}
      </div>

      <div class="rocket-actions">
        <button class="rocket-btn primary" data-action="close">Done</button>
      </div>
    `;
  }

  _bindEvents() {
    // Close button
    this.el.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.addEventListener('click', () => this.hide());
    });

    // Launch buttons
    this.el.querySelectorAll('[data-action="launch"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const from = btn.dataset.from;
        const target = btn.dataset.target;
        this.launchRocket(from, target);
      });
    });
  }
}
