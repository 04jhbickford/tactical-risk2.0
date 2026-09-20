// Placement UI for initial Risk setup - 6-unit clockwise placement rounds
// Flow: Click territory first, then click units to place on that territory

import { GAME_PHASES } from '../state/gameState.js';
import { getUnitIconPath } from '../utils/unitIcons.js';

export class PlacementUI {
  constructor() {
    this.gameState = null;
    this.unitDefs = null;
    this.territoryByName = null;
    this.selectedTerritory = null;  // Selected territory to place units on
    this.onPlacementComplete = null;
    this.onUnitPlaced = null;  // Callback when a unit is placed (for logging)
    this.isMinimized = false;

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

  setOnUnitPlaced(callback) {
    this.onUnitPlaced = callback;
  }

  isActive() {
    // Stay active during unit placement phase - even if no units left (to allow passing)
    // But only for human players - AI handles its own placement
    if (!this.gameState) return false;
    if (this.gameState.phase !== GAME_PHASES.UNIT_PLACEMENT) return false;
    const player = this.gameState.currentPlayer;
    return player && !player.isAI;
  }

  show() {
    this.selectedTerritory = null;
    this._render();
    // Keep hidden - placement now handled inline in player panel Actions tab
    // this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  // Called when user clicks a territory during placement - selects it for unit placement
  handleTerritoryClick(territory) {
    if (!this.isActive()) return false;

    const player = this.gameState.currentPlayer;
    if (!player) return false;

    // Check if this is a valid territory to place on
    const isValidLand = this.gameState.getOwner(territory.name) === player.id;
    const isValidSea = territory.isWater && this._isAdjacentToOwnedCoastal(territory.name, player.id);

    if (isValidLand || isValidSea) {
      this.selectedTerritory = territory;
      this._render();
      return true;
    }

    return false;
  }

  _isAdjacentToOwnedCoastal(seaZoneName, playerId) {
    const seaZone = this.territoryByName[seaZoneName];
    if (!seaZone || !seaZone.isWater) return false;

    // Check if any adjacent territory is owned by player and is coastal
    for (const conn of seaZone.connections) {
      const t = this.territoryByName[conn];
      if (t && !t.isWater && this.gameState.getOwner(conn) === playerId) {
        return true;
      }
    }
    return false;
  }

  // Place a unit on the selected territory (called when clicking a unit button)
  _placeUnit(unitType) {
    if (!this.selectedTerritory || !this.isActive()) return;

    const player = this.gameState.currentPlayer;
    if (!player) return;

    const result = this.gameState.placeInitialUnit(
      this.selectedTerritory.name,
      unitType,
      this.unitDefs
    );

    if (result.success) {
      // Don't auto-advance - let user review and undo if needed
      // The "Done - Next Player" button will appear when 6 units placed

      // Notify about the placed unit (for logging)
      if (this.onUnitPlaced) {
        this.onUnitPlaced(unitType, this.selectedTerritory.name, player);
      }

      if (this.onPlacementComplete) {
        this.onPlacementComplete();
      }

      this._render();
    }
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
      <div class="pl-header" style="border-left: 5px solid ${player.color}; background: linear-gradient(90deg, ${player.color}33 0%, transparent 100%);">
        <div class="pl-color-bar" style="background: ${player.color}"></div>
        <div class="pl-title">Initial Deployment</div>
        <div class="pl-player" style="color: ${player.color}">${player.name}</div>
        <button class="left-modal-minimize-btn" data-action="toggle-minimize" title="${this.isMinimized ? 'Expand' : 'Minimize'}">${this.isMinimized ? '▶' : '◀'}</button>
      </div>

      <div class="pl-progress">
        <div class="pl-round">Round ${this.gameState.placementRound || 1}</div>
        <div class="pl-placed">${placedThisRound} of ${maxThisRound} placed this round</div>
        <div class="pl-progress-bar">
          <div class="pl-progress-fill" style="width: ${(placedThisRound / maxThisRound) * 100}%"></div>
        </div>
      </div>
    `;

    // Show selected territory or instruction
    if (this.selectedTerritory) {
      const isSeaZone = this.selectedTerritory.isWater;
      html += `
        <div class="pl-selected-territory">
          <span class="pl-selected-label">Placing on:</span>
          <span class="pl-selected-name">${this.selectedTerritory.name}</span>
          <button class="pl-deselect-btn" data-action="deselect">×</button>
        </div>
        <div class="pl-instructions">Click a unit below to place it here</div>
      `;

      // Filter units based on territory type
      const availableUnits = unitsToPlace.filter(u => {
        if (u.quantity <= 0) return false;
        const def = this.unitDefs[u.type];
        if (!def) return false;

        // Sea zones can accept naval units, plus fighters on carriers, land units on transports
        if (isSeaZone) {
          // Naval units can always be placed
          if (def.isSea) return true;

          // Check for carriers/transports in this sea zone
          const seaUnits = this.gameState.getUnitsAt(this.selectedTerritory.name);

          // Air units can be placed if there's a carrier with capacity
          if (def.isAir) {
            const carriers = seaUnits.filter(c => c.type === 'carrier' && c.owner === player.id);
            const carrierDef = this.unitDefs.carrier;
            if (carrierDef && carrierDef.canCarry?.includes(u.type)) {
              for (const carrier of carriers) {
                const currentAircraft = carrier.aircraft || [];
                if (currentAircraft.length < (carrierDef.aircraftCapacity || 2)) {
                  return true;
                }
              }
            }
            return false;
          }

          // Land units can be placed if there's a transport with capacity
          if (def.isLand && !def.isBuilding) {
            const transports = seaUnits.filter(t => t.type === 'transport' && t.owner === player.id);
            const transportDef = this.unitDefs.transport;
            if (transportDef && transportDef.canCarry?.includes(u.type)) {
              for (const transport of transports) {
                const currentCargo = transport.cargo || [];
                if (this._canLoadOnTransport(currentCargo, u.type)) {
                  return true;
                }
              }
            }
            return false;
          }

          return false;
        }
        // Land territories accept land, air, and buildings
        return def.isLand || def.isAir || def.isBuilding;
      });

      if (availableUnits.length > 0) {
        html += `<div class="pl-units">`;
        for (const unit of availableUnits) {
          html += this._renderUnitButton(unit);
        }
        html += `</div>`;
      } else {
        const seaZoneMsg = isSeaZone
          ? 'No units to place here. Naval units, fighters on carriers, and troops on transports are allowed.'
          : 'No land units available to place';
        html += `<div class="pl-no-units">${seaZoneMsg}</div>`;
      }
    } else {
      html += `
        <div class="pl-instructions">
          <strong>Click a territory</strong> on the map to select where to place units
        </div>
      `;

      // Show summary of remaining units
      html += `<div class="pl-remaining-summary">`;
      html += `<div class="pl-remaining-label">Units to place:</div>`;

      const landUnits = unitsToPlace.filter(u => {
        const def = this.unitDefs[u.type];
        return def && (def.isLand || def.isAir || def.isBuilding) && u.quantity > 0;
      });
      const navalUnits = unitsToPlace.filter(u => {
        const def = this.unitDefs[u.type];
        return def && def.isSea && u.quantity > 0;
      });

      if (landUnits.length > 0) {
        html += `<div class="pl-summary-group">`;
        html += `<span class="pl-summary-label">Land:</span>`;
        html += landUnits.map(u => `${u.quantity}× ${u.type}`).join(', ');
        html += `</div>`;
      }
      if (navalUnits.length > 0) {
        html += `<div class="pl-summary-group">`;
        html += `<span class="pl-summary-label">Naval:</span>`;
        html += navalUnits.map(u => `${u.quantity}× ${u.type}`).join(', ');
        html += `</div>`;
      }
      html += `</div>`;
    }

    // Actions - must place 6 units before passing (unless no units left)
    const canUndo = this.gameState.placementHistory && this.gameState.placementHistory.length > 0;
    const roundComplete = placedThisRound >= 6 || totalRemaining === 0;

    html += `
      <div class="pl-actions">
        ${canUndo ? `
          <button class="pl-btn undo" data-action="undo">Undo Last</button>
        ` : ''}
        ${roundComplete ? `
          <button class="pl-btn done primary" data-action="finish">
            ✓ Done - Next Player
          </button>
        ` : `
          <div class="pl-progress-hint">Place ${6 - placedThisRound} more unit${6 - placedThisRound !== 1 ? 's' : ''} to continue</div>
        `}
      </div>
    `;

    this.el.innerHTML = html;
    // Keep hidden - placement now handled inline in player panel Actions tab
    // this.el.classList.remove('hidden');
    this._bindEvents();
  }

  _renderUnitButton(unit) {
    const def = this.unitDefs[unit.type];
    const player = this.gameState.currentPlayer;
    // Use faction-specific icon
    const imageSrc = player ? getUnitIconPath(unit.type, player.id) : (def?.image ? `assets/units/${def.image}` : null);

    return `
      <button class="pl-unit-btn" data-unit="${unit.type}">
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
    // Minimize toggle
    this.el.querySelector('[data-action="toggle-minimize"]')?.addEventListener('click', () => {
      this.isMinimized = !this.isMinimized;
      this.el.classList.toggle('minimized', this.isMinimized);
      this._render();
    });

    // Unit buttons - clicking places the unit immediately
    this.el.querySelectorAll('.pl-unit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const unitType = btn.dataset.unit;
        this._placeUnit(unitType);
      });
    });

    // Deselect territory
    this.el.querySelector('[data-action="deselect"]')?.addEventListener('click', () => {
      this.selectedTerritory = null;
      this._render();
    });

    // Action buttons
    this.el.querySelector('[data-action="undo"]')?.addEventListener('click', () => {
      this.gameState.undoPlacement();
      if (this.onPlacementComplete) this.onPlacementComplete();
    });

    this.el.querySelector('[data-action="finish"]')?.addEventListener('click', () => {
      this.gameState.finishPlacementRound(this.unitDefs);
      this.selectedTerritory = null;
      if (this.onPlacementComplete) this.onPlacementComplete();
    });
  }

  getSelectedTerritory() {
    return this.selectedTerritory;
  }

  clearSelection() {
    this.selectedTerritory = null;
    this._render();
  }

  // Check if a unit can be loaded onto a transport given current cargo
  _canLoadOnTransport(cargo, unitType) {
    // Transport capacity: 2 infantry OR 1 infantry + 1 other ground unit
    const otherCount = cargo.filter(c => c.type !== 'infantry').length;
    const totalCount = cargo.length;

    if (totalCount >= 2) {
      return false;
    }

    if (unitType === 'infantry') {
      return true; // Infantry can always be added if not full
    } else {
      return otherCount === 0; // Only add non-infantry if no other tank/artillery
    }
  }
}
