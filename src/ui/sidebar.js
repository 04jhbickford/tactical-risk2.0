// Sidebar panel showing territory info and game actions

import { GAME_PHASES } from '../state/gameState.js';

export class Sidebar {
  constructor(territoryRenderer, continents, onNavigate) {
    this.territoryRenderer = territoryRenderer;
    this.continents = continents;
    this.onNavigate = onNavigate;
    this.gameState = null;
    this.unitDefs = null;
    this.onAction = null; // callback for game actions

    this.el = document.getElementById('sidebar');
    this.contentEl = document.getElementById('sidebarContent');
    this.closeBtn = document.getElementById('sidebarClose');
    this.closeBtn.addEventListener('click', () => this.hide());

    this.continentByTerritory = {};
    for (const c of continents) {
      for (const t of c.territories) {
        this.continentByTerritory[t] = c;
      }
    }

    this.currentTerritory = null;
  }

  setGameState(gameState) {
    this.gameState = gameState;
    gameState.subscribe(() => {
      if (this.currentTerritory) {
        this.show(this.currentTerritory);
      }
    });
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  setActionCallback(callback) {
    this.onAction = callback;
  }

  show(territory) {
    if (!territory) return;
    this.currentTerritory = territory;
    this.el.classList.remove('hidden');

    const t = territory;
    const isLand = !t.isWater;
    const continent = isLand ? this.continentByTerritory[t.name] : null;

    let html = `<div class="sb-name">${t.name}</div>`;

    if (this.gameState) {
      const owner = this.gameState.getOwner(t.name);
      const ownerPlayer = owner ? this.gameState.getPlayer(owner) : null;
      const ownerColor = owner ? this.gameState.getPlayerColor(owner) : '#888';
      const ownerName = ownerPlayer?.name || 'Unclaimed';
      const ownerFlag = ownerPlayer?.flag || null;

      if (isLand && owner) {
        html += `
          <div class="sb-section">
            <div class="sb-label">Owner</div>
            <div class="sb-value sb-owner">
              ${ownerFlag ? `<img src="assets/flags/${ownerFlag}" class="sb-owner-flag" alt="${ownerName}">` : `<span class="sb-color-badge" style="background:${ownerColor}"></span>`}
              <span class="sb-owner-name" style="color:${ownerColor}">${ownerName}</span>
            </div>
          </div>`;
      }

      // Capital indicator
      if (this.gameState.isCapital(t.name)) {
        html += `
          <div class="sb-section">
            <div class="sb-label">Status</div>
            <div class="sb-value sb-capital">
              ${ownerFlag ? `<img src="assets/flags/${ownerFlag}" class="sb-capital-flag" alt="${ownerName}">` : ''}
              <span>★ Capital City</span>
            </div>
          </div>`;
      }
    }

    if (isLand) {
      html += `
        <div class="sb-section">
          <div class="sb-label">Production</div>
          <div class="sb-value">${t.production || 0} IPCs</div>
        </div>`;

      if (continent) {
        html += `
          <div class="sb-section">
            <div class="sb-label">Continent</div>
            <div class="sb-value">
              <span class="sb-continent-dot" style="background:${continent.color}"></span>
              ${continent.name} (+${continent.bonus} bonus)
            </div>
          </div>`;
      }
    } else {
      html += `
        <div class="sb-section">
          <div class="sb-label">Type</div>
          <div class="sb-value">Sea Zone</div>
        </div>`;
    }

    // Units section
    if (this.gameState) {
      const units = this.gameState.getUnitsAt(t.name);
      if (units && units.length > 0) {
        html += `
          <div class="sb-section">
            <div class="sb-label">Units</div>
            <ul class="sb-units">`;
        for (const u of units) {
          const ownerColor = this.gameState.getPlayerColor(u.owner);
          const stats = this.unitDefs?.[u.type];
          const statStr = stats ? `A${stats.attack}/D${stats.defense}` : '';
          html += `
            <li class="sb-unit-item">
              <span class="sb-unit-badge" style="background:${ownerColor}"></span>
              <span class="sb-unit-type">${u.type}</span>
              <span class="sb-unit-qty">x${u.quantity}</span>
              <span class="sb-unit-stats">${statStr}</span>
            </li>`;
        }
        html += `</ul></div>`;
      }

      // Action buttons based on game phase
      html += this._renderActions(t);
    }

    // Adjacent territories
    if (t.connections && t.connections.length > 0) {
      const landConns = t.connections.filter(c => {
        const ct = this.territoryRenderer.territoryByName[c];
        return ct && !ct.isWater;
      });
      const seaConns = t.connections.filter(c => {
        const ct = this.territoryRenderer.territoryByName[c];
        return ct && ct.isWater;
      });

      html += `<div class="sb-section"><div class="sb-label">Adjacent</div>`;

      if (landConns.length > 0) {
        html += `<ul class="sb-connections">`;
        for (const conn of landConns.slice(0, 8)) {
          html += `<li><span class="sb-conn-link" data-territory="${conn}">${conn}</span></li>`;
        }
        if (landConns.length > 8) html += `<li>...and ${landConns.length - 8} more</li>`;
        html += `</ul>`;
      }

      if (seaConns.length > 0) {
        html += `<div class="sb-sublabel">Sea Zones</div><ul class="sb-connections">`;
        for (const conn of seaConns.slice(0, 4)) {
          html += `<li><span class="sb-conn-link water" data-territory="${conn}">${conn}</span></li>`;
        }
        if (seaConns.length > 4) html += `<li>...and ${seaConns.length - 4} more</li>`;
        html += `</ul>`;
      }

      html += `</div>`;
    }

    this.contentEl.innerHTML = html;
    this._bindEvents();
  }

  _renderActions(territory) {
    if (!this.gameState) return '';

    const phase = this.gameState.phase;
    const player = this.gameState.currentPlayer;
    if (!player) return '';

    const owner = this.gameState.getOwner(territory.name);
    const isOwnTerritory = owner === player.id;

    let html = '';

    // Capital placement phase
    if (phase === GAME_PHASES.CAPITAL_PLACEMENT && isOwnTerritory && !territory.isWater) {
      html += `
        <div class="sb-section sb-actions">
          <button class="sb-action-btn primary" data-action="place-capital" data-territory="${territory.name}">
            ★ Place Capital Here
          </button>
        </div>`;
    }

    // Unit placement phase
    if (phase === GAME_PHASES.UNIT_PLACEMENT && this.unitDefs) {
      const capital = this.gameState.playerState[player.id]?.capitalTerritory;
      const adjacentSeas = capital ? this.gameState.getAdjacentSeaZones(capital) : [];
      const isCapital = territory.name === capital;
      const isAdjacentSea = adjacentSeas.includes(territory.name);

      if (isCapital || isAdjacentSea) {
        const ipcs = this.gameState.getIPCs(player.id);

        html += `<div class="sb-section sb-actions">`;
        html += `<div class="sb-label">Purchase Units (${ipcs} IPCs)</div>`;
        html += `<div class="sb-unit-shop">`;

        // Show purchasable units
        const unitList = isCapital
          ? Object.entries(this.unitDefs).filter(([_, u]) => u.isLand || u.isAir)
          : Object.entries(this.unitDefs).filter(([_, u]) => u.isSea);

        for (const [unitType, def] of unitList) {
          if (def.isBuilding) continue; // Can't buy factories
          const canAfford = ipcs >= def.cost;
          const disabledClass = canAfford ? '' : ' disabled';

          html += `
            <button class="sb-buy-btn${disabledClass}" data-action="buy-unit" data-unit="${unitType}" data-territory="${territory.name}" ${canAfford ? '' : 'disabled'}>
              <span class="buy-name">${unitType}</span>
              <span class="buy-cost">${def.cost}$</span>
            </button>`;
        }

        html += `</div>`;
        html += `
          <button class="sb-action-btn" data-action="finish-placement">
            Done Placing Units
          </button>`;
        html += `</div>`;
      }
    }

    return html;
  }

  _bindEvents() {
    // Connection links
    this.contentEl.querySelectorAll('.sb-conn-link').forEach(link => {
      link.addEventListener('click', () => {
        const name = link.dataset.territory;
        if (this.onNavigate) this.onNavigate(name);
      });
    });

    // Action buttons
    this.contentEl.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const territory = btn.dataset.territory;
        const unit = btn.dataset.unit;

        if (this.onAction) {
          this.onAction(action, { territory, unit });
        }
      });
    });
  }

  hide() {
    this.el.classList.add('hidden');
    this.currentTerritory = null;
  }

  get isVisible() {
    return !this.el.classList.contains('hidden');
  }
}
