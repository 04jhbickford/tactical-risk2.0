// Unit tooltip that appears on hover over unit icons on the map

import { formatUnitName } from '../utils/unitNames.js';

export class UnitTooltip {
  constructor() {
    this.gameState = null;
    this.unitDefs = null;

    // Create tooltip element
    this.el = document.createElement('div');
    this.el.id = 'unitTooltip';
    this.el.className = 'unit-tooltip hidden';
    document.body.appendChild(this.el);

    this.currentUnit = null;
  }

  setGameState(gameState) {
    this.gameState = gameState;
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  /**
   * Show tooltip for a unit
   * @param {Object} unitInfo - { unitType, owner, quantity, unitDef, territory, isOnCarrier, isOnTransport }
   * @param {number} screenX - Screen X position
   * @param {number} screenY - Screen Y position
   */
  show(unitInfo, screenX, screenY) {
    if (!unitInfo || !unitInfo.unitDef) {
      this.hide();
      return;
    }

    this.currentUnit = unitInfo;
    const def = unitInfo.unitDef;
    const unitType = unitInfo.unitType;

    // Get tech bonuses for this unit's owner
    let attackBonus = 0;
    let defenseBonus = 0;
    let movementBonus = 0;

    if (this.gameState && unitInfo.owner) {
      const owner = unitInfo.owner;

      // Check for relevant tech upgrades using gameState.hasTech()
      // jets: Fighters +1 attack/defense
      if (this.gameState.hasTech(owner, 'jets') && unitType === 'fighter') {
        attackBonus += 1;
        defenseBonus += 1;
      }
      // superSubs: Submarines +1 attack
      if (this.gameState.hasTech(owner, 'superSubs') && unitType === 'submarine') {
        attackBonus += 1;
      }
      // longRangeAircraft: Aircraft +2 movement
      if (this.gameState.hasTech(owner, 'longRangeAircraft') && (unitType === 'fighter' || unitType === 'bomber')) {
        movementBonus += 2;
      }
      // heavyBombers: Bombers roll 2 dice in combat (note in tooltip)
      // No direct stat bonus, but indicate it
    }

    // Calculate final stats
    const baseAttack = def.attack || 0;
    const baseDefense = def.defense || 0;
    const baseMovement = def.movement || 0;

    const totalAttack = baseAttack + attackBonus;
    const totalDefense = baseDefense + defenseBonus;
    const totalMovement = baseMovement + movementBonus;

    // Get player info for color
    let playerColor = '#888';
    let playerName = unitInfo.owner;
    if (this.gameState && unitInfo.owner) {
      const player = this.gameState.getPlayer(unitInfo.owner);
      if (player) {
        playerColor = player.color;
        playerName = player.name;
      }
    }

    // Build tooltip HTML
    let html = `<div class="ut-header" style="border-bottom-color:${playerColor}">`;
    html += `<span class="ut-name">${this._formatUnitName(unitType)}</span>`;
    if (unitInfo.quantity > 1) {
      html += `<span class="ut-count">×${unitInfo.quantity}</span>`;
    }
    html += `</div>`;

    // Stats
    html += `<div class="ut-stats">`;

    // Attack
    html += `<div class="ut-stat">`;
    html += `<span class="ut-stat-icon attack">⚔</span>`;
    html += `<span class="ut-stat-value${attackBonus > 0 ? ' boosted' : ''}">${totalAttack}</span>`;
    if (attackBonus > 0) {
      html += `<span class="ut-bonus">+${attackBonus}</span>`;
    }
    html += `</div>`;

    // Defense
    html += `<div class="ut-stat">`;
    html += `<span class="ut-stat-icon defense">🛡</span>`;
    html += `<span class="ut-stat-value${defenseBonus > 0 ? ' boosted' : ''}">${totalDefense}</span>`;
    if (defenseBonus > 0) {
      html += `<span class="ut-bonus">+${defenseBonus}</span>`;
    }
    html += `</div>`;

    // Movement
    html += `<div class="ut-stat">`;
    html += `<span class="ut-stat-icon movement">→</span>`;
    html += `<span class="ut-stat-value${movementBonus > 0 ? ' boosted' : ''}">${totalMovement}</span>`;
    if (movementBonus > 0) {
      html += `<span class="ut-bonus">+${movementBonus}</span>`;
    }
    html += `</div>`;

    html += `</div>`;

    // Special properties
    const specials = [];
    if (def.hp && def.hp > 1) specials.push(`${def.hp} HP`);
    if (def.antiAir) specials.push('Anti-Air');
    if (def.capacity) specials.push(`Capacity: ${def.capacity}`);
    if (def.aircraftCapacity) specials.push(`Aircraft: ${def.aircraftCapacity}`);
    if (unitInfo.isOnCarrier) specials.push('On Carrier');
    if (unitInfo.isOnTransport) specials.push('On Transport');
    if (unitInfo.isFlying) specials.push('✈ In Flight');
    if (unitInfo.damaged > 0) specials.push('⚠ Damaged');
    // Heavy bombers tech indicator
    if (this.gameState && unitInfo.owner && unitType === 'bomber' && this.gameState.hasTech(unitInfo.owner, 'heavyBombers')) {
      specials.push('🎯 Heavy (2 dice)');
    }

    if (specials.length > 0) {
      html += `<div class="ut-specials">${specials.join(' • ')}</div>`;
    }

    // Owner
    html += `<div class="ut-owner" style="color:${playerColor}">${playerName}</div>`;

    this.el.innerHTML = html;
    this.el.classList.remove('hidden');

    // Position tooltip near mouse but not overlapping
    this._position(screenX, screenY);
  }

  hide() {
    this.el.classList.add('hidden');
    this.currentUnit = null;
  }

  _position(screenX, screenY) {
    const padding = 15;
    const rect = this.el.getBoundingClientRect();
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let left = screenX + padding;
    let top = screenY + padding;

    // Flip to left side if it would go off screen
    if (left + rect.width > viewW - padding) {
      left = screenX - rect.width - padding;
    }

    // Flip above if it would go off bottom
    if (top + rect.height > viewH - padding) {
      top = screenY - rect.height - padding;
    }

    // Ensure within bounds
    left = Math.max(padding, Math.min(left, viewW - rect.width - padding));
    top = Math.max(padding, Math.min(top, viewH - rect.height - padding));

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  _formatUnitName(unitType) {
    return formatUnitName(unitType);
  }
}
