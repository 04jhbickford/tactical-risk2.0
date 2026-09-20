// Purchase panel for buying units - left-side panel with map-based territory selection
// Flow: Click territory on map (factory or adjacent sea zone), then buy units for that location

import { getUnitIconPath } from '../utils/unitIcons.js';
import { shouldShowPurchase } from '../state/gameState.js';
import { setShellFlag } from './mobileShell.js';
import { syncBottomSurfaces } from './bottomSurface.js';

export class PurchasePopup {
  constructor() {
    this.gameState = null;
    this.unitDefs = null;
    this.onPurchaseComplete = null;
    this.onHighlightTerritory = null; // Callback for territory highlighting
    this.purchaseCart = {};
    this.cartCost = 0;
    this.selectedTerritory = null; // Territory to place purchased units
    this.territories = null;

    this.isMinimized = false;

    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'purchasePanel';
    this.el.className = 'purchase-panel hidden';
    document.body.appendChild(this.el);

  }

  setGameState(gameState) {
    this.gameState = gameState;
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  setTerritories(territories) {
    this.territories = {};
    for (const t of territories) {
      this.territories[t.name] = t;
    }
  }

  setOnComplete(callback) {
    this.onPurchaseComplete = callback;
  }

  setOnHighlightTerritory(callback) {
    this.onHighlightTerritory = callback;
  }

  isPurchasePhase() {
    // Must be in PLAYING phase AND PURCHASE turn phase
    // (turnPhase defaults to PURCHASE, so we need to check phase too)
    return !!(this.gameState && shouldShowPurchase(this.gameState.phase, this.gameState.turnPhase));
  }

  show() {
    this.purchaseCart = {};
    this.cartCost = 0;
    this.selectedTerritory = null;
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
    setShellFlag('purchase-active', visible);
    syncBottomSurfaces();
  }

  // Called when user clicks a territory on the map during purchase phase
  handleTerritoryClick(territory) {
    if (!this.isPurchasePhase()) return false;

    const player = this.gameState.currentPlayer;
    if (!player) return false;

    // Check valid locations:
    // 1. Factory territories (can buy land/air/buildings)
    // 2. Any owned land territory (can buy factory there)
    // 3. Adjacent sea zones to factories (can buy naval units)
    const factoryTerritories = this._getFactoryTerritories(player.id);
    const ownedTerritories = this._getOwnedTerritories(player.id);
    const adjacentSeaZones = this._getAdjacentSeaZones(factoryTerritories);

    const isValidFactory = factoryTerritories.includes(territory.name);
    const isValidOwned = ownedTerritories.includes(territory.name);
    const isValidSeaZone = adjacentSeaZones.includes(territory.name);

    if (isValidFactory || isValidOwned || isValidSeaZone) {
      this.selectedTerritory = territory.name;
      this._render();
      return true;
    }

    return false;
  }

  // Get valid territories for purchase (for map highlighting)
  getValidPurchaseTerritories() {
    if (!this.isPurchasePhase() || !this.gameState) return [];

    const player = this.gameState.currentPlayer;
    if (!player) return [];

    const factoryTerritories = this._getFactoryTerritories(player.id);
    const ownedTerritories = this._getOwnedTerritories(player.id);
    const adjacentSeaZones = this._getAdjacentSeaZones(factoryTerritories);

    // Include all owned territories (for factory purchase) and adjacent sea zones
    return [...new Set([...factoryTerritories, ...ownedTerritories, ...adjacentSeaZones])];
  }

  _render() {
    if (!this.gameState || !this.unitDefs) return;

    const player = this.gameState.currentPlayer;
    if (!player) return;

    const ipcs = this.gameState.getIPCs(player.id);
    const remaining = ipcs - this.cartCost;

    // Show unit purchase directly - no territory selection needed
    // Territory selection happens during MOBILIZE phase
    this._renderUnitPurchase(player, ipcs, remaining);
  }

  _renderTerritoryPrompt(player, ipcs) {
    const factoryTerritories = this._getFactoryTerritories(player.id);
    const adjacentSeaZones = this._getAdjacentSeaZones(factoryTerritories);
    const ownedTerritories = this._getOwnedTerritories(player.id);
    // Territories where you can build a factory (owned but no factory yet)
    const buildableTerritories = ownedTerritories.filter(name => !factoryTerritories.includes(name));

    let html = `
            <div class="pp-header">
        <div class="pp-title">Purchase Units</div>
        <button class="left-modal-minimize-btn" data-action="toggle-minimize" title="${this.isMinimized ? 'Expand' : 'Minimize'}">${this.isMinimized ? '□' : '—'}</button>
      </div>

      <div class="pp-budget">
        <span class="pp-budget-label">Budget:</span>
        <span class="pp-budget-value">$${ipcs}</span>
      </div>

      <div class="pp-instructions">
        <strong>Click a territory</strong> on the map to select where to purchase units
      </div>

      <div class="pp-valid-locations">
        <div class="pp-location-group">
          <div class="pp-group-header">Factories (Land/Air Units)</div>
          <div class="pp-location-list">
            ${factoryTerritories.map(name => `
              <div class="pp-location-item"
                   data-territory="${name}"
                   title="Click to select">
                ${name}
              </div>
            `).join('')}
            ${factoryTerritories.length === 0 ? `
              <div class="pp-empty">No factories</div>
            ` : ''}
          </div>
        </div>

        <div class="pp-location-group">
          <div class="pp-group-header">Sea Zones (Naval Units)</div>
          <div class="pp-location-list">
            ${adjacentSeaZones.map(name => `
              <div class="pp-location-item sea"
                   data-territory="${name}"
                   title="Click to select">
                ${name}
              </div>
            `).join('')}
            ${adjacentSeaZones.length === 0 ? `
              <div class="pp-empty">No sea zones near factories</div>
            ` : ''}
          </div>
        </div>

        <div class="pp-location-group">
          <div class="pp-group-header">Build Factory (New)</div>
          <div class="pp-location-list">
            ${buildableTerritories.slice(0, 10).map(name => `
              <div class="pp-location-item factory-build"
                   data-territory="${name}"
                   title="Build a factory here">
                ${name}
              </div>
            `).join('')}
            ${buildableTerritories.length > 10 ? `
              <div class="pp-more">+${buildableTerritories.length - 10} more (click on map)</div>
            ` : ''}
            ${buildableTerritories.length === 0 ? `
              <div class="pp-empty">All territories have factories</div>
            ` : ''}
          </div>
        </div>
      </div>

      <div class="pp-actions">
        <button class="pp-btn skip" data-action="skip">Skip Purchase Phase</button>
      </div>
    `;

    this.el.innerHTML = html;
    this._bindPromptEvents();
  }

  _getFactoryTerritories(playerId) {
    const factories = [];
    for (const [name, state] of Object.entries(this.gameState.territoryState)) {
      if (state.owner !== playerId) continue;
      const units = this.gameState.units[name] || [];
      if (units.some(u => u.type === 'factory' && u.owner === playerId)) {
        factories.push(name);
      }
    }
    return factories;
  }

  _getAdjacentSeaZones(factoryTerritories) {
    const seaZones = new Set();
    for (const terrName of factoryTerritories) {
      const territory = this.territories?.[terrName];
      if (!territory) continue;
      for (const conn of territory.connections || []) {
        const connT = this.territories?.[conn];
        if (connT?.isWater) {
          seaZones.add(conn);
        }
      }
    }
    return Array.from(seaZones);
  }

  _getOwnedTerritories(playerId) {
    const owned = [];
    for (const [name, state] of Object.entries(this.gameState.territoryState)) {
      if (state.owner === playerId) {
        const t = this.territories?.[name];
        // Only land territories (not sea zones)
        if (t && !t.isWater) {
          owned.push(name);
        }
      }
    }
    return owned;
  }

  _renderUnitPurchase(player, ipcs, remaining) {
    // Check what placement options player has
    const factoryTerritories = this._getFactoryTerritories(player.id);
    const adjacentSeaZones = this._getAdjacentSeaZones(factoryTerritories);
    const hasFactories = factoryTerritories.length > 0;
    const hasSeaZones = adjacentSeaZones.length > 0;
    const ownedTerritories = this._getOwnedTerritories(player.id);
    const canBuildFactory = ownedTerritories.some(name => !factoryTerritories.includes(name));

    // Get mobilization capacity
    const mobilizationCapacity = this.gameState.getMobilizationCapacity?.(player.id) || 20;
    const currentPurchases = this.gameState.getPendingPurchaseCount?.(player.id) || 0;
    const remainingCapacity = mobilizationCapacity - currentPurchases;

    // Show all units that can be placed somewhere
    const units = Object.entries(this.unitDefs)
      .filter(([type, u]) => {
        // AA guns can now be purchased

        // Can buy land/air units if player has factories
        if ((u.isLand || u.isAir) && hasFactories) return true;

        // Can buy naval units if player has sea zones adjacent to factories
        if (u.isSea && hasSeaZones) return true;

        // Can buy factory if player has territory without factory
        if (u.isBuilding && canBuildFactory) return true;

        return false;
      });

    let html = `
      <div class="pp-header">
        <div class="pp-title">Purchase Units</div>
        <button class="left-modal-minimize-btn" data-action="toggle-minimize" title="${this.isMinimized ? 'Expand' : 'Minimize'}">${this.isMinimized ? '□' : '—'}</button>
      </div>

      <div class="pp-budget">
        <span class="pp-budget-label">IPCs:</span>
        <span class="pp-budget-value ${remaining < 5 ? 'low' : ''}">$${remaining}</span>
        <span class="pp-budget-total">/ $${ipcs}</span>
      </div>

      <div class="pp-capacity ${remainingCapacity <= 0 ? 'at-limit' : ''}">
        <span class="pp-capacity-label">Capacity:</span>
        <span class="pp-capacity-value">${currentPurchases}/${mobilizationCapacity}</span>
        <span class="pp-capacity-hint">(Capital: 20, Factory: 5)</span>
      </div>

      <div class="pp-instructions-small">
        Units will be placed during Mobilize phase
      </div>

      <div class="pp-units">
    `;

    for (const [unitType, def] of units) {
      const qty = this.purchaseCart[unitType] || 0;
      const canAdd = remaining >= def.cost && remainingCapacity > 0;
      const imageSrc = getUnitIconPath(unitType, player.id);

      html += `
        <div class="pp-unit-row ${qty > 0 ? 'has-qty' : ''}" data-unit="${unitType}">
          <div class="pp-unit-info">
            ${imageSrc ? `<img src="${imageSrc}" class="pp-unit-icon" alt="${unitType}">` : ''}
            <span class="pp-unit-name">${unitType}</span>
            <span class="pp-unit-cost">$${def.cost}</span>
            <span class="pp-unit-stats">A${def.attack}/D${def.defense}/M${def.movement}</span>
          </div>
          <div class="pp-unit-controls">
            <button class="pp-qty-btn" data-unit="${unitType}" data-delta="-1" ${qty <= 0 ? 'disabled' : ''}>−</button>
            <span class="pp-qty">${qty}</span>
            <button class="pp-qty-btn" data-unit="${unitType}" data-delta="1" ${!canAdd ? 'disabled' : ''}>+</button>
            <button class="pp-max-btn" data-unit="${unitType}" ${!canAdd ? 'disabled' : ''}>Max</button>
          </div>
        </div>
      `;
    }

    html += `</div>`;

    // Cart summary
    if (this.cartCost > 0) {
      const cartItems = Object.entries(this.purchaseCart)
        .filter(([_, qty]) => qty > 0)
        .map(([type, qty]) => `${qty}× ${type}`)
        .join(', ');

      html += `
        <div class="pp-summary">
          <div class="pp-summary-items">${cartItems}</div>
          <div class="pp-summary-total">Total: $${this.cartCost}</div>
        </div>
      `;
    }

    // Actions
    html += `
      <div class="pp-actions">
        ${this.cartCost > 0 ? `
          <button class="pp-btn clear" data-action="clear">Clear</button>
          <button class="pp-btn confirm" data-action="confirm">Confirm Purchase</button>
        ` : `
          <button class="pp-btn done" data-action="done">Done</button>
        `}
      </div>
    `;

    this.el.innerHTML = html;
    this._bindEvents();
  }

  _bindPromptEvents() {
    // Location item clicks
    this.el.querySelectorAll('.pp-location-item').forEach(item => {
      item.addEventListener('click', () => {
        this.selectedTerritory = item.dataset.territory;
        this._render();
      });

      // Hover highlighting
      item.addEventListener('mouseenter', () => {
        if (this.onHighlightTerritory) {
          this.onHighlightTerritory(item.dataset.territory, true);
        }
      });

      item.addEventListener('mouseleave', () => {
        if (this.onHighlightTerritory) {
          this.onHighlightTerritory(null, false);
        }
      });
    });

    // Skip button
    this.el.querySelector('[data-action="skip"]')?.addEventListener('click', () => {
      this.hide();
      if (this.onPurchaseComplete) {
        this.onPurchaseComplete();
      }
    });
  }

  _bindEvents() {
    // Minimize toggle
    this.el.querySelector('[data-action="toggle-minimize"]')?.addEventListener('click', () => {
      this.isMinimized = !this.isMinimized;
      this.el.classList.toggle('minimized', this.isMinimized);
      this._render();
    });

    // Quantity buttons
    this.el.querySelectorAll('.pp-qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const unit = btn.dataset.unit;
        const delta = parseInt(btn.dataset.delta);
        this._updateCart(unit, delta);
      });
    });

    // Max buttons
    this.el.querySelectorAll('.pp-max-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const unit = btn.dataset.unit;
        this._setMax(unit);
      });
    });

    // Action buttons
    this.el.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
      this._clearCart();
    });

    this.el.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
      this._commitPurchase();
    });

    this.el.querySelector('[data-action="done"]')?.addEventListener('click', () => {
      this.hide();
      if (this.onPurchaseComplete) {
        this.onPurchaseComplete();
      }
    });
  }

  _updateCart(unitType, delta) {
    const def = this.unitDefs?.[unitType];
    if (!def) return;

    const player = this.gameState.currentPlayer;
    const ipcs = this.gameState.getIPCs(player.id);
    const remaining = ipcs - this.cartCost;

    const currentQty = this.purchaseCart[unitType] || 0;
    let newQty = currentQty + delta;

    newQty = Math.max(0, newQty);
    if (delta > 0 && remaining < def.cost) {
      return;
    }


    if (newQty === 0) {
      delete this.purchaseCart[unitType];
    } else {
      this.purchaseCart[unitType] = newQty;
    }

    this._recalculateCartCost();
    this._render();
  }

  _setMax(unitType) {
    const def = this.unitDefs?.[unitType];
    if (!def) return;

    const player = this.gameState.currentPlayer;
    const ipcs = this.gameState.getIPCs(player.id);
    const remaining = ipcs - this.cartCost;
    const currentQty = this.purchaseCart[unitType] || 0;

    let additionalAffordable = Math.floor(remaining / def.cost);


    const newQty = currentQty + additionalAffordable;

    if (newQty > 0) {
      this.purchaseCart[unitType] = newQty;
    }

    this._recalculateCartCost();
    this._render();
  }

  _clearCart() {
    this.purchaseCart = {};
    this.cartCost = 0;
    this._render();
  }

  _recalculateCartCost() {
    this.cartCost = 0;
    for (const [unitType, qty] of Object.entries(this.purchaseCart)) {
      const def = this.unitDefs?.[unitType];
      if (def) {
        this.cartCost += def.cost * qty;
      }
    }
  }

  _commitPurchase() {
    const player = this.gameState.currentPlayer;
    if (!player) return;

    // Add all units to pending purchases (territory selected during mobilize phase)
    for (const [unitType, qty] of Object.entries(this.purchaseCart)) {
      for (let i = 0; i < qty; i++) {
        const result = this.gameState.addToPendingPurchases(unitType, this.unitDefs, null);
        if (!result.success) {
          console.warn('Failed to add to pending purchases:', result.error);
          break;
        }
      }
    }

    this.purchaseCart = {};
    this.cartCost = 0;

    // Go back to territory selection (user might want to buy at another location)
    this.selectedTerritory = null;
    this._render();
  }

  getSelectedTerritory() {
    return this.selectedTerritory ? this.territories?.[this.selectedTerritory] : null;
  }

  clearSelection() {
    this.selectedTerritory = null;
    this._render();
  }
}
