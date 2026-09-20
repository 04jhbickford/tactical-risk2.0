// Air Landing UI - Map-based view for selecting where air units land after ALL combats

import { getUnitIconPath } from '../utils/unitIcons.js';

export class AirLandingUI {
  constructor() {
    this.gameState = null;
    this.unitDefs = null;
    this.territoryByName = null;

    // All pending landings grouped by origin territory
    this.pendingByTerritory = []; // [{ originTerritory, units: [...] }, ...]
    this.currentTerritoryIndex = 0;

    // Current territory's air units
    this.airUnitsToLand = [];
    this.selectedLandings = {};
    this.currentUnitIndex = 0;
    this.combatTerritory = null;

    this.onComplete = null;
    this.onTerritoryComplete = null; // Called when one territory's landings are done
    this.onHighlightTerritory = null;
    this.onCenterCamera = null; // Callback to center camera on territory

    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'airLandingPanel';
    this.el.className = 'air-landing-panel hidden';
    document.body.appendChild(this.el);
  }

  setGameState(gameState) {
    this.gameState = gameState;
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
    this.onComplete = callback;
  }

  setOnTerritoryComplete(callback) {
    this.onTerritoryComplete = callback;
  }

  setOnHighlightTerritory(callback) {
    this.onHighlightTerritory = callback;
  }

  setOnCenterCamera(callback) {
    this.onCenterCamera = callback;
  }

  isActive() {
    return !this.el.classList.contains('hidden') && this.airUnitsToLand.length > 0;
  }

  // Initialize with all pending air landings from gameState
  startConsolidatedLanding() {
    const pending = this.gameState.getPendingAirLandings();
    if (!pending || pending.length === 0) {
      return false;
    }

    this.pendingByTerritory = pending.map(p => ({
      originTerritory: p.originTerritory,
      units: [...p.units],
      landings: {},
      crashes: []
    }));
    this.currentTerritoryIndex = 0;

    // Start with first territory
    this._loadCurrentTerritory();
    this.el.classList.remove('hidden');

    return true;
  }

  _loadCurrentTerritory() {
    const current = this.pendingByTerritory[this.currentTerritoryIndex];
    if (!current) return;

    this.combatTerritory = current.originTerritory;
    this.airUnitsToLand = current.units;
    this.selectedLandings = current.landings;
    this.currentUnitIndex = 0;

    // Center camera on this territory
    if (this.onCenterCamera && this.territoryByName) {
      const territory = this.territoryByName[this.combatTerritory];
      if (territory) {
        this.onCenterCamera(territory);
      }
    }

    this._render();
  }

  hide() {
    this.el.classList.add('hidden');
    this.pendingByTerritory = [];
    this.airUnitsToLand = [];
    this.selectedLandings = {};
    this.currentUnitIndex = 0;
    this.currentTerritoryIndex = 0;
    // Clear any highlights
    if (this.onHighlightTerritory) {
      this.onHighlightTerritory(null, false);
    }
  }

  // Called when user clicks a territory on the map
  handleTerritoryClick(territory) {
    if (!this.isActive()) return false;

    const currentUnit = this.airUnitsToLand[this.currentUnitIndex];
    if (!currentUnit) return false;

    // Check if this is a valid landing destination
    const validDest = currentUnit.landingOptions.find(opt => opt.territory === territory.name);
    if (validDest) {
      const unitKey = currentUnit.id || currentUnit.type;
      this.selectedLandings[unitKey] = territory.name;

      // Save to current territory's data
      const current = this.pendingByTerritory[this.currentTerritoryIndex];
      if (current) {
        current.landings[unitKey] = territory.name;
      }

      // Move to next unit if available
      if (this.currentUnitIndex < this.airUnitsToLand.length - 1) {
        this.currentUnitIndex++;
      }

      this._render();

      // Check if all units for this territory are assigned
      this._checkAutoAdvance();

      return true;
    }

    return false;
  }

  _checkAutoAdvance() {
    // Check if all units have landing selections (or will crash)
    const allSelected = this.airUnitsToLand.every(u => {
      const unitKey = u.id || u.type;
      return u.landingOptions.length === 0 || this.selectedLandings[unitKey];
    });

    // If all selected and there are more territories, show next button prominently
    // Auto-advance is handled by confirm button
  }

  // Get valid destinations for current unit (for map highlighting)
  getValidDestinations() {
    if (!this.isActive()) return [];

    const currentUnit = this.airUnitsToLand[this.currentUnitIndex];
    if (!currentUnit) return [];

    return currentUnit.landingOptions.map(opt => opt.territory);
  }

  // Get all valid destinations for all units (for persistent highlighting)
  getAllValidDestinations() {
    if (!this.isActive()) return [];

    const allDests = new Set();
    for (const unit of this.airUnitsToLand) {
      for (const opt of unit.landingOptions) {
        allDests.add(opt.territory);
      }
    }
    return Array.from(allDests);
  }

  _render() {
    if (!this.gameState || !this.unitDefs) return;

    const player = this.gameState.currentPlayer;
    if (!player) return;

    const totalTerritories = this.pendingByTerritory.length;
    const totalUnits = this.airUnitsToLand.length;
    const currentUnit = this.airUnitsToLand[this.currentUnitIndex];

    // Check if all units have landing selections (or will crash)
    const allSelected = this.airUnitsToLand.every(u => {
      const unitKey = u.id || u.type;
      return u.landingOptions.length === 0 || this.selectedLandings[unitKey];
    });

    const isLastTerritory = this.currentTerritoryIndex >= totalTerritories - 1;

    let html = `
      <div class="alp-header" style="border-left: 5px solid ${player.color}">
        <div class="alp-title">
          <span class="alp-icon">✈️</span>
          Air Unit Landing
        </div>
        <div class="alp-subtitle">From: ${this.combatTerritory}</div>
      </div>

      ${totalTerritories > 1 ? `
        <div class="alp-territory-progress">
          Territory ${this.currentTerritoryIndex + 1} of ${totalTerritories}
          <div class="alp-territory-dots">
            ${this.pendingByTerritory.map((_, i) => `
              <span class="alp-territory-dot ${i === this.currentTerritoryIndex ? 'current' : ''} ${i < this.currentTerritoryIndex ? 'done' : ''}"></span>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <div class="alp-instructions">
        Click the map or use dropdown to select landing locations.
        Units can only land in territories <strong>friendly at turn start</strong>.
      </div>

      <div class="alp-progress">
        Unit ${this.currentUnitIndex + 1} of ${totalUnits}
      </div>
    `;

    // Render each air unit
    for (let i = 0; i < this.airUnitsToLand.length; i++) {
      const airUnit = this.airUnitsToLand[i];
      const def = this.unitDefs[airUnit.type];
      const imageSrc = getUnitIconPath(airUnit.type, player.id);
      const unitKey = airUnit.id || airUnit.type;
      const selectedDest = this.selectedLandings[unitKey];
      const hasOptions = airUnit.landingOptions.length > 0;
      const isCurrentUnit = i === this.currentUnitIndex;

      // Get movement info
      const originInfo = this.gameState.airUnitOrigins[this.combatTerritory]?.[airUnit.type];
      const totalMovement = def?.movement || 4;
      const distanceTraveled = originInfo?.distance || 0;
      const remainingMovement = Math.max(0, totalMovement - distanceTraveled);

      // Display unit number if there are multiple of same type
      const sameTypeUnits = this.airUnitsToLand.filter(u => u.type === airUnit.type);
      const unitIndex = sameTypeUnits.indexOf(airUnit) + 1;
      const displayName = sameTypeUnits.length > 1
        ? `${airUnit.type} #${unitIndex}`
        : `${airUnit.quantity}× ${airUnit.type}`;

      html += `
        <div class="alp-unit ${isCurrentUnit ? 'current' : ''} ${!hasOptions ? 'no-options' : ''} ${selectedDest ? 'selected' : ''}">
          <div class="alp-unit-header" data-index="${i}">
            <div class="alp-unit-info">
              ${imageSrc ? `<img src="${imageSrc}" class="alp-unit-icon" alt="${airUnit.type}">` : ''}
              <div class="alp-unit-details">
                <span class="alp-unit-name">${displayName}</span>
                <span class="alp-unit-movement">${remainingMovement}/${totalMovement} movement left</span>
              </div>
            </div>
            ${selectedDest ? `<span class="alp-unit-check">✓</span>` : ''}
          </div>

          ${isCurrentUnit || selectedDest ? `
            <div class="alp-unit-content">
              ${hasOptions ? `
                <select class="alp-dest-select" data-unit="${unitKey}">
                  <option value="">-- Click map or select --</option>
                  ${airUnit.landingOptions.map(opt =>
                    `<option value="${opt.territory}" ${selectedDest === opt.territory ? 'selected' : ''}>
                      ${opt.territory} ${opt.isCarrier ? '(Carrier)' : ''} - ${opt.distance} tile${opt.distance !== 1 ? 's' : ''} away
                    </option>`
                  ).join('')}
                </select>
              ` : `
                <div class="alp-crash-warning">
                  <span class="alp-crash-icon">💥</span>
                  <span>No valid landing - Unit will CRASH!</span>
                </div>
              `}
            </div>
          ` : ''}
        </div>
      `;
    }

    // Actions
    html += `
      <div class="alp-actions">
        <button class="alp-btn primary" data-action="confirm" ${!allSelected ? 'disabled' : ''}>
          ${allSelected && !isLastTerritory ? 'Next Territory →' : 'Confirm Landings'}
        </button>
      </div>
    `;

    this.el.innerHTML = html;
    this._bindEvents();
  }

  _bindEvents() {
    // Unit headers - click to focus
    this.el.querySelectorAll('.alp-unit-header').forEach(header => {
      header.addEventListener('click', () => {
        const index = parseInt(header.dataset.index, 10);
        if (!isNaN(index) && index !== this.currentUnitIndex) {
          this.currentUnitIndex = index;
          this._render();
        }
      });
    });

    // Destination dropdowns
    this.el.querySelectorAll('.alp-dest-select').forEach(select => {
      select.addEventListener('mouseover', (e) => {
        if (e.target.tagName === 'OPTION' && e.target.value) {
          if (this.onHighlightTerritory) {
            this.onHighlightTerritory(e.target.value, true);
          }
        }
      });

      select.addEventListener('mouseout', () => {
        if (this.onHighlightTerritory) {
          this.onHighlightTerritory(null, false);
        }
      });

      select.addEventListener('change', () => {
        const unitKey = select.dataset.unit;
        const destination = select.value;

        if (destination) {
          this.selectedLandings[unitKey] = destination;
          // Save to current territory's data
          const current = this.pendingByTerritory[this.currentTerritoryIndex];
          if (current) {
            current.landings[unitKey] = destination;
          }
        } else {
          delete this.selectedLandings[unitKey];
          const current = this.pendingByTerritory[this.currentTerritoryIndex];
          if (current) {
            delete current.landings[unitKey];
          }
        }
        this._render();
      });
    });

    // Confirm button
    this.el.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
      this._confirmCurrentTerritory();
    });
  }

  _confirmCurrentTerritory() {
    const current = this.pendingByTerritory[this.currentTerritoryIndex];
    if (!current) return;

    // Build crashes list for this territory
    current.crashes = [];
    for (const unit of this.airUnitsToLand) {
      const unitKey = unit.id || unit.type;
      if (unit.landingOptions.length === 0) {
        current.crashes.push(unitKey);
      }
    }

    // Notify that this territory's landings are complete
    if (this.onTerritoryComplete) {
      this.onTerritoryComplete({
        originTerritory: current.originTerritory,
        landings: { ...current.landings },
        crashes: [...current.crashes]
      });
    }

    // Move to next territory or finish
    if (this.currentTerritoryIndex < this.pendingByTerritory.length - 1) {
      this.currentTerritoryIndex++;
      this._loadCurrentTerritory();
    } else {
      // All territories done
      this._finishAllLandings();
    }
  }

  _finishAllLandings() {
    // Clear pending air landings from gameState
    this.gameState.clearPendingAirLandings();

    // Notify completion
    if (this.onComplete) {
      this.onComplete({
        territories: this.pendingByTerritory.map(t => ({
          originTerritory: t.originTerritory,
          landings: t.landings,
          crashes: t.crashes
        }))
      });
    }

    this.hide();
  }
}
