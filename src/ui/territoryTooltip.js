// Territory tooltip that appears on hover over the map

export class TerritoryTooltip {
  constructor(continents) {
    this.continents = continents;
    this.gameState = null;
    this.unitDefs = null;

    // Build continent lookup
    this.continentByTerritory = {};
    for (const c of continents) {
      for (const t of c.territories) {
        this.continentByTerritory[t] = c;
      }
    }

    // Create tooltip element
    this.el = document.createElement('div');
    this.el.id = 'territoryTooltip';
    this.el.className = 'territory-tooltip hidden';
    document.body.appendChild(this.el);

    this.currentTerritory = null;
  }

  setGameState(gameState) {
    this.gameState = gameState;
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  show(territory, screenX, screenY) {
    if (!territory) {
      this.hide();
      return;
    }

    this.currentTerritory = territory;
    const t = territory;
    const isLand = !t.isWater;
    const continent = isLand ? this.continentByTerritory[t.name] : null;

    let html = `<div class="tt-header">${t.name}</div>`;

    // Owner info
    if (this.gameState && isLand) {
      const owner = this.gameState.getOwner(t.name);
      if (owner) {
        const player = this.gameState.getPlayer(owner);
        const flag = player?.flag;
        html += `<div class="tt-owner">`;
        if (flag) {
          html += `<img src="assets/flags/${flag}" class="tt-flag" alt="">`;
        }
        html += `<span style="color:${player?.color || '#888'}">${player?.name || owner}</span>`;
        html += `</div>`;
      }

      // Capital indicator
      if (this.gameState.isCapital(t.name)) {
        html += `<div class="tt-capital">★ Capital</div>`;
      }
    }

    // Production & Continent
    if (isLand) {
      html += `<div class="tt-stats">`;
      html += `<span class="tt-ipc">${t.production || 0} IPC</span>`;
      if (continent) {
        html += `<span class="tt-continent" style="border-color:${continent.color}">${continent.name}</span>`;
      }
      html += `</div>`;
    } else {
      html += `<div class="tt-type">Sea Zone</div>`;
    }

    // Units
    if (this.gameState) {
      const units = this.gameState.getUnitsAt(t.name);
      if (units && units.length > 0) {
        html += `<div class="tt-units">`;
        for (const u of units) {
          const color = this.gameState.getPlayerColor(u.owner);
          html += `<span class="tt-unit" style="border-color:${color}">${u.quantity}x ${u.type}</span>`;
        }
        html += `</div>`;
      }
    }

    this.el.innerHTML = html;
    this.el.classList.remove('hidden');

    // Position tooltip near cursor but within viewport
    this._position(screenX, screenY);
  }

  _position(x, y) {
    const padding = 15;
    const rect = this.el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Default: show to right and below cursor
    let left = x + padding;
    let top = y + padding;

    // Flip if would go off-screen
    if (left + rect.width > vw - padding) {
      left = x - rect.width - padding;
    }
    if (top + rect.height > vh - padding) {
      top = y - rect.height - padding;
    }

    // Ensure minimum position
    left = Math.max(padding, left);
    top = Math.max(padding, top);

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  hide() {
    this.el.classList.add('hidden');
    this.currentTerritory = null;
  }

  get isVisible() {
    return !this.el.classList.contains('hidden');
  }
}
