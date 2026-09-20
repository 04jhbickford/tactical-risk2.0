// Mobilize UI for placing purchased units during MOBILIZE phase

import { TURN_PHASES } from '../state/gameState.js';
import { getUnitIconPath } from '../utils/unitIcons.js';

export class MobilizeUI {
  constructor() {
    this.gameState = null;
    this.unitDefs = null;
    this.territoryByName = null;
    this.selectedTerritory = null;
    this.onMobilizeComplete = null;
    this.onUnitsMobilized = null;  // Callback when units are mobilized (for logging)

    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'mobilizePanel';
    this.el.className = 'mobilize-panel hidden';
    document.body.appendChild(this.el);
  }

  setGameState(gameState) {
    this.gameState = gameState;
    if (gameState) {
      gameState.subscribe(() => this._render());
    }
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  setTerritories(territories) {
    this.territoryByName = {};
    for (const t of territories) {
      this.territoryByName[t.name] = t;
    }
  }

  setOnComplete(callback) {
    this.onMobilizeComplete = callback;
  }

  setOnUnitsMobilized(callback) {
    this.onUnitsMobilized = callback;
  }

  isActive() {
    // Disabled - now using inline mobilize UI in Actions tab
    // The old modal is no longer shown, so don't intercept clicks
    return false;
  }

  show() {
    this.selectedTerritory = null;
    this._render();
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  // Called when user clicks a territory during mobilize phase
  handleTerritoryClick(territory) {
    if (!this.isActive()) return false;

    const player = this.gameState.currentPlayer;
    if (!player) return false;

    // Check if valid placement location
    const factoryTerritories = this.gameState._getFactoryTerritories(player.id);
    const validNavalZones = this.gameState._getValidNavalPlacementZones(player.id);

    const isValidLand = factoryTerritories.includes(territory.name);
    const isValidSea = validNavalZones.has(territory.name);

    // Check if player has pending factories to place
    const pendingUnits = this.gameState.getPendingPurchases();
    const hasPendingFactory = pendingUnits.some(u => u.type === 'factory');

    // For factory placement, allow any territory owned at START of turn (A&A rule)
    // This prevents placing factories in territories captured this turn
    const friendlyAtStart = this.gameState.friendlyTerritoriesAtTurnStart || new Set();
    const wasOwnedAtTurnStart = friendlyAtStart.has(territory.name) && !territory.isWater;
    const hasExistingFactory = (this.gameState.units[territory.name] || [])
      .some(u => u.type === 'factory' && u.owner === player.id);
    const isValidForFactory = hasPendingFactory && wasOwnedAtTurnStart && !hasExistingFactory;

    if (isValidLand || isValidSea || isValidForFactory) {
      this.selectedTerritory = territory;
      this._render();
      return true;
    }

    return false;
  }

  _render() {
    if (!this.gameState || !this.unitDefs) {
      this.el.innerHTML = '';
      return;
    }

    if (!this.isActive()) {
      this.hide();
      return;
    }

    // Don't auto-show - inline mobilize UI in Actions tab is now used instead
    // Keep this hidden unless explicitly shown
    // this.el.classList.remove('hidden');

    const player = this.gameState.currentPlayer;
    if (!player) return;

    const pendingUnits = this.gameState.getPendingPurchases();
    const totalPending = pendingUnits.reduce((sum, u) => sum + u.quantity, 0);

    let html = `
      <div class="mob-header" style="border-left: 5px solid ${player.color}">
        <div class="mob-title">Mobilize Units</div>
        <div class="mob-player" style="color: ${player.color}">${player.name}</div>
      </div>
    `;

    if (totalPending === 0) {
      html += `
        <div class="mob-empty">
          <p>No units to place.</p>
          <button class="mob-btn primary" data-action="done">Continue</button>
        </div>
      `;
    } else if (this.selectedTerritory) {
      const isSeaZone = this.selectedTerritory.isWater;

      html += `
        <div class="mob-selected">
          <span class="mob-label">Placing at:</span>
          <span class="mob-territory">${this.selectedTerritory.name}</span>
          <button class="mob-deselect" data-action="deselect">×</button>
        </div>
        <div class="mob-instructions">Click a unit to place it here</div>
      `;

      // Filter units based on territory type
      const availableUnits = pendingUnits.filter(u => {
        const def = this.unitDefs[u.type];
        if (!def) return false;
        if (isSeaZone) return def.isSea;
        // Land territories can have land units, air units, and buildings (factories)
        return def.isLand || def.isAir || def.isBuilding;
      });

      if (availableUnits.length > 0) {
        const totalAvailable = availableUnits.reduce((sum, u) => sum + u.quantity, 0);
        html += `<div class="mob-units">`;
        for (const unit of availableUnits) {
          html += this._renderUnitButton(unit);
        }
        html += `</div>`;

        // Add "Place All" button if multiple units
        if (totalAvailable > 1) {
          html += `
            <div class="mob-place-all">
              <button class="mob-btn secondary" data-action="place-all">Place All (${totalAvailable})</button>
            </div>
          `;
        }
      } else {
        html += `<div class="mob-no-units">No ${isSeaZone ? 'naval' : 'land/air'} units to place here</div>`;
      }
    } else {
      html += `
        <div class="mob-instructions">
          <strong>Click a territory</strong> with a factory to place units
        </div>
        <div class="mob-pending">
          <div class="mob-pending-label">Units to place:</div>
      `;

      const landUnits = pendingUnits.filter(u => {
        const def = this.unitDefs[u.type];
        return def && (def.isLand || def.isAir || def.isBuilding);
      });
      const navalUnits = pendingUnits.filter(u => {
        const def = this.unitDefs[u.type];
        return def && def.isSea;
      });

      if (landUnits.length > 0) {
        html += `<div class="mob-group"><span class="mob-group-label">Land/Air:</span> ${landUnits.map(u => `${u.quantity}× ${u.type}`).join(', ')}</div>`;
      }
      if (navalUnits.length > 0) {
        html += `<div class="mob-group"><span class="mob-group-label">Naval:</span> ${navalUnits.map(u => `${u.quantity}× ${u.type}`).join(', ')}</div>`;
      }

      html += `</div>`;
    }

    // Actions
    if (totalPending > 0) {
      html += `
        <div class="mob-actions">
          <span class="mob-remaining">${totalPending} unit${totalPending !== 1 ? 's' : ''} remaining</span>
        </div>
      `;
    }

    this.el.innerHTML = html;
    // Don't auto-show - inline mobilize UI in Actions tab is now used
    // this.el.classList.remove('hidden');
    this._bindEvents();
  }

  _renderUnitButton(unit) {
    const def = this.unitDefs[unit.type];
    const player = this.gameState.currentPlayer;
    const imageSrc = player ? getUnitIconPath(unit.type, player.id) : (def?.image ? `assets/units/${def.image}` : null);

    return `
      <div class="mob-unit-row">
        <button class="mob-unit-btn" data-unit="${unit.type}" data-action="place-one">
          <div class="mob-unit-icon-wrapper">
            ${imageSrc ? `<img src="${imageSrc}" class="mob-unit-icon" alt="${unit.type}">` : ''}
          </div>
          <div class="mob-unit-info">
            <span class="mob-unit-name">${unit.type}</span>
            <span class="mob-unit-qty">×${unit.quantity}</span>
          </div>
        </button>
        ${unit.quantity > 1 ? `
          <button class="mob-max-btn" data-unit="${unit.type}" data-action="place-type-all" title="Place all ${unit.type}">All</button>
        ` : ''}
      </div>
    `;
  }

  _bindEvents() {
    // Unit buttons - place one
    this.el.querySelectorAll('[data-action="place-one"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const unitType = btn.dataset.unit;
        this._placeUnit(unitType);
      });
    });

    // Max button for single unit type
    this.el.querySelectorAll('[data-action="place-type-all"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const unitType = btn.dataset.unit;
        this._placeAllOfType(unitType);
      });
    });

    // Place all button (all units)
    this.el.querySelector('[data-action="place-all"]')?.addEventListener('click', () => {
      this._placeAllUnits();
    });

    // Deselect
    this.el.querySelector('[data-action="deselect"]')?.addEventListener('click', () => {
      this.selectedTerritory = null;
      this._render();
    });

    // Done button
    this.el.querySelector('[data-action="done"]')?.addEventListener('click', () => {
      this.hide();
      if (this.onMobilizeComplete) {
        this.onMobilizeComplete();
      }
    });
  }

  _placeUnit(unitType) {
    if (!this.selectedTerritory || !this.isActive()) return;

    const player = this.gameState.currentPlayer;
    const result = this.gameState.mobilizeUnit(
      unitType,
      this.selectedTerritory.name,
      this.unitDefs
    );

    if (result.success) {
      // Log the mobilization
      if (this.onUnitsMobilized && player) {
        this.onUnitsMobilized(player, [{ type: unitType, quantity: 1 }], this.selectedTerritory.name);
      }

      // Check if all units placed
      const remaining = this.gameState.getPendingPurchases();
      if (remaining.length === 0) {
        this.selectedTerritory = null;
        if (this.onMobilizeComplete) {
          this.onMobilizeComplete();
        }
      }
      this._render();
    } else {
      console.warn('Mobilize failed:', result.error);
    }
  }

  _placeAllOfType(unitType) {
    if (!this.selectedTerritory || !this.isActive()) return;

    const player = this.gameState.currentPlayer;
    const pending = this.gameState.getPendingPurchases();
    const unit = pending.find(u => u.type === unitType);
    if (!unit) return;

    const quantityToPlace = unit.quantity;
    let placed = 0;

    // Place all units of this type
    for (let i = 0; i < quantityToPlace; i++) {
      const result = this.gameState.mobilizeUnit(
        unitType,
        this.selectedTerritory.name,
        this.unitDefs
      );
      if (!result.success) break;
      placed++;
    }

    // Log the mobilization
    if (this.onUnitsMobilized && player && placed > 0) {
      this.onUnitsMobilized(player, [{ type: unitType, quantity: placed }], this.selectedTerritory.name);
    }

    // Check if all units placed
    const remaining = this.gameState.getPendingPurchases();
    if (remaining.length === 0) {
      this.selectedTerritory = null;
      if (this.onMobilizeComplete) {
        this.onMobilizeComplete();
      }
    }
    this._render();
  }

  _placeAllUnits() {
    if (!this.selectedTerritory || !this.isActive()) return;

    const player = this.gameState.currentPlayer;
    const isSeaZone = this.selectedTerritory.isWater;

    // Filter units that can be placed here
    const pending = this.gameState.getPendingPurchases();
    const availableUnits = pending.filter(u => {
      const def = this.unitDefs[u.type];
      if (!def) return false;
      if (isSeaZone) return def.isSea;
      return def.isLand || def.isAir || def.isBuilding;
    });

    const placedUnits = [];

    // Place all available units
    for (const unit of availableUnits) {
      let placed = 0;
      const quantityToPlace = unit.quantity;  // Capture before loop as quantity changes
      for (let i = 0; i < quantityToPlace; i++) {
        const result = this.gameState.mobilizeUnit(
          unit.type,
          this.selectedTerritory.name,
          this.unitDefs
        );
        if (!result.success) break;
        placed++;
      }
      if (placed > 0) {
        placedUnits.push({ type: unit.type, quantity: placed });
      }
    }

    // Log the mobilization
    if (this.onUnitsMobilized && player && placedUnits.length > 0) {
      this.onUnitsMobilized(player, placedUnits, this.selectedTerritory.name);
    }

    // Check if all units placed
    const remaining = this.gameState.getPendingPurchases();
    if (remaining.length === 0) {
      this.selectedTerritory = null;
      if (this.onMobilizeComplete) {
        this.onMobilizeComplete();
      }
    }
    this._render();
  }

  getSelectedTerritory() {
    return this.selectedTerritory;
  }

  clearSelection() {
    this.selectedTerritory = null;
    this._render();
  }
}
