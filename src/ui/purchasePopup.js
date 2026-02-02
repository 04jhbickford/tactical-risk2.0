// Purchase popup overlay for buying units

export class PurchasePopup {
  constructor() {
    this.gameState = null;
    this.unitDefs = null;
    this.onPurchaseComplete = null;
    this.purchaseCart = {};
    this.cartCost = 0;

    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'purchasePopup';
    this.el.className = 'purchase-popup hidden';
    document.body.appendChild(this.el);
  }

  setGameState(gameState) {
    this.gameState = gameState;
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  setOnComplete(callback) {
    this.onPurchaseComplete = callback;
  }

  show() {
    this.purchaseCart = {};
    this.cartCost = 0;
    this._render();
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  _render() {
    if (!this.gameState || !this.unitDefs) return;

    const player = this.gameState.currentPlayer;
    if (!player) return;

    const capital = this.gameState.playerState[player.id]?.capitalTerritory;
    const ipcs = this.gameState.getIPCs(player.id);
    const remaining = ipcs - this.cartCost;

    // Filter to land/air combat units only
    const units = Object.entries(this.unitDefs)
      .filter(([_, u]) => (u.isLand || u.isAir) && !u.isBuilding);

    let html = `
      <div class="purchase-popup-content">
        <div class="purchase-header">
          <div class="purchase-title">Purchase Units</div>
          <div class="purchase-budget">
            <span class="budget-label">Budget:</span>
            <span class="budget-value">${remaining} IPCs</span>
            <span class="budget-total">of ${ipcs}</span>
          </div>
        </div>

        <div class="purchase-grid">
          ${units.map(([unitType, def]) => {
            const qty = this.purchaseCart[unitType] || 0;
            const canAdd = remaining >= def.cost;
            const canRemove = qty > 0;
            const imageSrc = def.image ? `assets/units/${def.image}` : null;

            return `
              <div class="purchase-item ${qty > 0 ? 'has-qty' : ''}">
                <div class="item-visual">
                  ${imageSrc ? `<img src="${imageSrc}" class="item-icon" alt="${unitType}">` : `<div class="item-placeholder">${unitType[0].toUpperCase()}</div>`}
                </div>
                <div class="item-info">
                  <div class="item-name">${unitType}</div>
                  <div class="item-stats">A${def.attack} / D${def.defense} / M${def.movement}</div>
                </div>
                <div class="item-cost">${def.cost}$</div>
                <div class="item-controls">
                  <button class="qty-btn minus ${canRemove ? '' : 'disabled'}" data-action="remove" data-unit="${unitType}">−</button>
                  <span class="qty-display">${qty}</span>
                  <button class="qty-btn plus ${canAdd ? '' : 'disabled'}" data-action="add" data-unit="${unitType}">+</button>
                </div>
              </div>`;
          }).join('')}
        </div>

        ${this.cartCost > 0 ? `
          <div class="purchase-summary">
            <div class="summary-items">
              ${Object.entries(this.purchaseCart).map(([type, qty]) => {
                const def = this.unitDefs[type];
                return `<span class="summary-item">${qty}x ${type} (${qty * def.cost}$)</span>`;
              }).join('')}
            </div>
            <div class="summary-total">
              <span>Total:</span>
              <span class="total-cost">${this.cartCost} IPCs</span>
            </div>
          </div>
        ` : ''}

        <div class="purchase-actions">
          ${this.cartCost > 0 ? `
            <button class="purchase-btn clear" data-action="clear">Clear All</button>
            <button class="purchase-btn confirm" data-action="confirm">
              Place at ${capital || 'Capital'}
            </button>
          ` : `
            <button class="purchase-btn skip" data-action="skip">Skip Purchases</button>
          `}
        </div>
      </div>
    `;

    this.el.innerHTML = html;
    this._bindEvents();
  }

  _bindEvents() {
    // Quantity buttons
    this.el.querySelectorAll('.qty-btn:not(.disabled)').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        const unitType = btn.dataset.unit;

        if (action === 'add') {
          this._updateCart(unitType, 1);
        } else if (action === 'remove') {
          this._updateCart(unitType, -1);
        }
      });
    });

    // Action buttons
    this.el.querySelectorAll('.purchase-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;

        if (action === 'clear') {
          this._clearCart();
        } else if (action === 'confirm') {
          this._commitPurchase();
        } else if (action === 'skip') {
          this.hide();
          if (this.onPurchaseComplete) {
            this.onPurchaseComplete();
          }
        }
      });
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

    // Clamp to valid range
    newQty = Math.max(0, newQty);
    if (delta > 0 && remaining < def.cost) {
      return; // Can't afford
    }

    if (newQty === 0) {
      delete this.purchaseCart[unitType];
    } else {
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

    const capital = this.gameState.playerState[player.id]?.capitalTerritory;
    if (!capital) return;

    // Buy all units in cart
    for (const [unitType, qty] of Object.entries(this.purchaseCart)) {
      for (let i = 0; i < qty; i++) {
        this.gameState.purchaseUnit(unitType, capital, this.unitDefs);
      }
    }

    // Clear and close
    this.purchaseCart = {};
    this.cartCost = 0;
    this.hide();

    if (this.onPurchaseComplete) {
      this.onPurchaseComplete();
    }
  }
}
