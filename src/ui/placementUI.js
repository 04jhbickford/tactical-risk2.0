// Placement UI for initial Risk setup - 6-unit clockwise placement rounds

import { GAME_PHASES } from '../state/gameState.js';

export class PlacementUI {
  constructor() {
    this.gameState = null;
    this.unitDefs = null;
    this.territoryByName = null;
    this.selectedUnit = null;
    this.onPlacementComplete = null;

    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'placementPanel';
    this.el.className = 'placement-panel hidden';
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
    this.onPlacementComplete = callback;
  }

  isActive() {
    return this.gameState &&
      this.gameState.phase === GAME_PHASES.UNIT_PLACEMENT &&
      this.gameState.hasUnitsToPlace(this.gameState.currentPlayer?.id);
  }

  show() {
    this.selectedUnit = null;
    this._render();
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  // Called when user clicks a territory during placement
  handleTerritoryClick(territory) {
    if (!this.isActive() || !this.selectedUnit) return false;

    const player = this.gameState.currentPlayer;
    if (!player) return false;

    const unitDef = this.unitDefs[this.selectedUnit];
    if (!unitDef) return false;

    // Validate placement
    const result = this.gameState.placeInitialUnit(territory.name, this.selectedUnit, this.unitDefs);

    if (result.success) {
      // Check if we've placed 6 units this round (or have no more to place)
      const totalRemaining = this.gameState.getTotalUnitsToPlace(player.id);
      if (result.unitsPlacedThisRound >= 6 || totalRemaining === 0) {
        // Automatically end round
        this.gameState.finishPlacementRound();
        this.selectedUnit = null;
      }

      if (this.onPlacementComplete) {
        this.onPlacementComplete();
      }

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

    const player = this.gameState.currentPlayer;
    if (!player) return;

    const unitsToPlace = this.gameState.getUnitsToPlace(player.id);
    const totalRemaining = this.gameState.getTotalUnitsToPlace(player.id);
    const placedThisRound = this.gameState.unitsPlacedThisRound || 0;
    const maxThisRound = Math.min(6, totalRemaining + placedThisRound);

    let html = `
      <div class="pl-header">
        <div class="pl-title">Initial Deployment</div>
        <div class="pl-player" style="color: ${player.color}">${player.name}</div>
      </div>

      <div class="pl-progress">
        <div class="pl-round">Round ${this.gameState.placementRound || 1}</div>
        <div class="pl-placed">${placedThisRound} of ${maxThisRound} placed this round</div>
        <div class="pl-progress-bar">
          <div class="pl-progress-fill" style="width: ${(placedThisRound / maxThisRound) * 100}%"></div>
        </div>
      </div>

      <div class="pl-instructions">
        ${this.selectedUnit
          ? `Click a valid territory to place <strong>${this.selectedUnit}</strong>`
          : 'Select a unit to place'}
      </div>

      <div class="pl-units">
    `;

    // Group units by type (land/naval)
    const landUnits = unitsToPlace.filter(u => {
      const def = this.unitDefs[u.type];
      return def && (def.isLand || def.isAir || def.isBuilding);
    });
    const navalUnits = unitsToPlace.filter(u => {
      const def = this.unitDefs[u.type];
      return def && def.isSea;
    });

    if (landUnits.some(u => u.quantity > 0)) {
      html += `<div class="pl-unit-group"><div class="pl-group-label">Land/Air Units</div>`;
      for (const unit of landUnits) {
        if (unit.quantity <= 0) continue;
        html += this._renderUnitButton(unit);
      }
      html += `</div>`;
    }

    if (navalUnits.some(u => u.quantity > 0)) {
      html += `<div class="pl-unit-group"><div class="pl-group-label">Naval Units</div>`;
      for (const unit of navalUnits) {
        if (unit.quantity <= 0) continue;
        html += this._renderUnitButton(unit);
      }
      html += `</div>`;
    }

    html += `</div>`;

    // Actions
    html += `
      <div class="pl-actions">
        ${this.gameState.placementHistory.length > 0 ? `
          <button class="pl-btn undo" data-action="undo">Undo Last</button>
        ` : ''}
        ${placedThisRound > 0 ? `
          <button class="pl-btn done" data-action="finish">End Round</button>
        ` : ''}
      </div>
    `;

    this.el.innerHTML = html;
    this.el.classList.remove('hidden');
    this._bindEvents();
  }

  _renderUnitButton(unit) {
    const def = this.unitDefs[unit.type];
    const imageSrc = def?.image ? `assets/units/${def.image}` : null;
    const isSelected = this.selectedUnit === unit.type;

    return `
      <button class="pl-unit-btn ${isSelected ? 'selected' : ''}" data-unit="${unit.type}">
        <div class="pl-unit-icon-wrapper">
          ${imageSrc ? `<img src="${imageSrc}" class="pl-unit-icon" alt="${unit.type}">` : ''}
        </div>
        <div class="pl-unit-info">
          <span class="pl-unit-name">${unit.type}</span>
          <span class="pl-unit-qty">x${unit.quantity}</span>
        </div>
      </button>
    `;
  }

  _bindEvents() {
    // Unit selection
    this.el.querySelectorAll('.pl-unit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const unitType = btn.dataset.unit;
        this.selectedUnit = this.selectedUnit === unitType ? null : unitType;
        this._render();
      });
    });

    // Action buttons
    this.el.querySelector('[data-action="undo"]')?.addEventListener('click', () => {
      this.gameState.undoPlacement();
      if (this.onPlacementComplete) this.onPlacementComplete();
    });

    this.el.querySelector('[data-action="finish"]')?.addEventListener('click', () => {
      this.gameState.finishPlacementRound();
      this.selectedUnit = null;
      if (this.onPlacementComplete) this.onPlacementComplete();
    });
  }

  getSelectedUnit() {
    return this.selectedUnit;
  }
}
