// Sidebar panel showing continent bonuses and player stats

import { shouldShowPurchase } from '../state/gameState.js';

export class ContinentPanel {
  constructor(continents) {
    this.continents = continents;
    this.gameState = null;
    this.unitDefs = null;
    this.onTradeCards = null;
    this.el = null;
    // Persist collapsed state across renders - start all sections minimized
    this.collapsedSections = {
      'player-stats': true,
      'continent-bonuses': true,
      'risk-cards': true
    };
    this._create();
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  setOnTradeCards(callback) {
    this.onTradeCards = callback;
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'continent-panel';
    this.el.className = 'sidebar-info-panel hidden';

    // Append to sidebar instead of body
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
      sidebar.appendChild(this.el);
    } else {
      document.body.appendChild(this.el);
    }
  }

  setGameState(gameState) {
    this.gameState = gameState;
    gameState.subscribe(() => this._render());
    this._render();
  }

  show() {
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  _render() {
    if (!this.gameState) {
      this.el.innerHTML = '';
      return;
    }

    let html = '';

    // Player Stats Section
    html += this._renderPlayerStats();

    // Continent Bonuses Section
    html += this._renderContinentBonuses();

    // Risk Cards Section (only in Risk mode)
    if (this.gameState.gameMode === 'risk') {
      html += this._renderRiskCards();
    }

    this.el.innerHTML = html;
    this._bindEvents();
  }

  _renderPlayerStats() {
    const players = this.gameState.players || [];
    const isCollapsed = this.collapsedSections['player-stats'];

    let html = `
      <div class="info-section player-stats-section ${isCollapsed ? 'collapsed' : ''}">
        <div class="info-section-header" data-toggle="player-stats">
          <span class="info-section-title">Player Stats</span>
          <span class="info-section-toggle">${isCollapsed ? '▶' : '▼'}</span>
        </div>
        <div class="info-section-content" id="player-stats-content">
          <div class="player-stats-grid">
    `;

    for (const player of players) {
      const ipcs = this.gameState.getIPCs(player.id);
      const territories = this.gameState.getPlayerTerritories(player.id).length;
      const units = this._countPlayerUnits(player.id);
      const continentsControlled = this._getControlledContinents(player.id);
      const riskCards = this.gameState.riskCards?.[player.id]?.length || 0;
      const techs = this.gameState.playerTechs?.[player.id] || [];
      const isCurrentPlayer = this.gameState.currentPlayer?.id === player.id;
      const isEliminated = territories === 0;

      html += `
        <div class="player-stat-row ${isCurrentPlayer ? 'current' : ''} ${isEliminated ? 'eliminated' : ''}"
             style="border-left: 4px solid ${player.color}">
          <div class="ps-name">
            ${player.flag ? `<img src="assets/flags/${player.flag}" class="ps-flag" alt="">` : ''}
            <span>${player.name}</span>
            ${isEliminated ? '<span class="ps-eliminated">OUT</span>' : ''}
          </div>
          <div class="ps-stats">
            <span class="ps-stat" title="IPCs"><span class="ps-icon">💰</span>${ipcs}</span>
            <span class="ps-stat" title="Territories"><span class="ps-icon">🗺️</span>${territories}</span>
            <span class="ps-stat" title="Units"><span class="ps-icon">⚔️</span>${units}</span>
            ${this.gameState.gameMode === 'risk' ? `<span class="ps-stat" title="Risk Cards"><span class="ps-icon">🃏</span>${riskCards}</span>` : ''}
          </div>
          ${continentsControlled.length > 0 ? `
            <div class="ps-continents" title="Controlled Continents">
              ${continentsControlled.map(c => `<span class="ps-continent" style="background:${c.color}">${c.name.substring(0, 2)}</span>`).join('')}
            </div>
          ` : ''}
          ${techs.length > 0 ? `
            <div class="ps-techs" title="Technologies">
              ${techs.map(t => `<span class="ps-tech">${this._getTechIcon(t)}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `;
    }

    html += `
          </div>
        </div>
      </div>
    `;

    return html;
  }

  _renderContinentBonuses() {
    const isCollapsed = this.collapsedSections['continent-bonuses'];

    let html = `
      <div class="info-section continent-bonuses-section ${isCollapsed ? 'collapsed' : ''}">
        <div class="info-section-header" data-toggle="continent-bonuses">
          <span class="info-section-title">Continent Bonuses</span>
          <span class="info-section-toggle">${isCollapsed ? '▶' : '▼'}</span>
        </div>
        <div class="info-section-content" id="continent-bonuses-content">
          <div class="continent-list">
    `;

    for (const continent of this.continents) {
      const controller = this._getController(continent);
      const controllerName = controller ? controller.name : 'Contested';
      const controllerColor = controller ? controller.color : '#555';
      const territoryCount = continent.territories.length;

      html += `
        <div class="continent-row">
          <div class="cr-name">
            <span class="cr-color" style="background:${continent.color}"></span>
            <span>${continent.name}</span>
          </div>
          <div class="cr-bonus">+${continent.bonus}</div>
          <div class="cr-controller" style="color:${controllerColor}">
            ${controller ? controllerName : '<span class="contested">—</span>'}
          </div>
        </div>
      `;
    }

    html += `
          </div>
        </div>
      </div>
    `;

    return html;
  }

  _renderRiskCards() {
    const player = this.gameState.currentPlayer;
    if (!player) return '';

    const isCollapsed = this.collapsedSections['risk-cards'];
    const cards = this.gameState.riskCards?.[player.id] || [];
    const canTrade = this.gameState.canTradeRiskCards?.(player.id);
    const nextValue = this.gameState.getNextRiskCardValue?.(player.id) || 12;
    const turnPhase = this.gameState.turnPhase;

    const cardIcons = {
      infantry: '🚶',
      cavalry: '🐎',
      artillery: '💣',
      wild: '⭐'
    };

    // Count cards by type
    const cardCounts = {};
    cards.forEach(c => {
      cardCounts[c] = (cardCounts[c] || 0) + 1;
    });

    let html = `
      <div class="info-section risk-cards-section ${isCollapsed ? 'collapsed' : ''}">
        <div class="info-section-header" data-toggle="risk-cards">
          <span class="info-section-title">🃏 Risk Cards (${cards.length})</span>
          <span class="info-section-toggle">${isCollapsed ? '▶' : '▼'}</span>
        </div>
        <div class="info-section-content" id="risk-cards-content">
    `;

    if (cards.length === 0) {
      html += `<div class="rc-empty">No cards. Conquer territories to earn cards!</div>`;
    } else {
      // Show card summary
      html += `<div class="rc-summary">`;
      for (const [type, count] of Object.entries(cardCounts)) {
        html += `<span class="rc-summary-item">${cardIcons[type] || '?'} ${type}: ${count}</span>`;
      }
      html += `</div>`;

      // Trade section
      if (canTrade) {
        html += `
          <div class="rc-trade">
            <span class="rc-trade-value">Trade value: <strong>${nextValue} IPCs</strong></span>
            ${shouldShowPurchase(this.gameState.phase, turnPhase) ? `
              <button class="rc-trade-btn" data-action="trade-cards">Cash In</button>
            ` : `
              <span class="rc-trade-note">(Available in Purchase phase)</span>
            `}
          </div>
        `;
      } else if (cards.length >= 5) {
        html += `<div class="rc-warning">⚠️ Must trade when you have 5+ cards!</div>`;
      }
    }

    html += `
        </div>
      </div>
    `;

    return html;
  }

  _bindEvents() {
    // Toggle sections
    this.el.querySelectorAll('.info-section-header').forEach(header => {
      header.addEventListener('click', () => {
        const section = header.closest('.info-section');
        const sectionId = header.dataset.toggle;

        section.classList.toggle('collapsed');
        const isCollapsed = section.classList.contains('collapsed');

        // Persist the collapsed state
        if (sectionId) {
          this.collapsedSections[sectionId] = isCollapsed;
        }

        const toggle = header.querySelector('.info-section-toggle');
        if (toggle) {
          toggle.textContent = isCollapsed ? '▶' : '▼';
        }
      });
    });

    // Trade cards button
    this.el.querySelector('[data-action="trade-cards"]')?.addEventListener('click', () => {
      if (this.onTradeCards) {
        this.onTradeCards();
      }
    });
  }

  _countPlayerUnits(playerId) {
    let count = 0;
    const territories = this.gameState.territories || {};
    for (const name in territories) {
      const terr = territories[name];
      if (terr.owner === playerId && terr.units) {
        for (const unitType in terr.units) {
          count += terr.units[unitType] || 0;
        }
      }
    }
    return count;
  }

  _getControlledContinents(playerId) {
    const controlled = [];
    for (const continent of this.continents) {
      const controller = this._getController(continent);
      if (controller && controller.id === playerId) {
        controlled.push(continent);
      }
    }
    return controlled;
  }

  _getController(continent) {
    if (!this.gameState) return null;

    // Check if any single player controls all territories
    let controller = null;
    for (const territoryName of continent.territories) {
      const owner = this.gameState.getOwner(territoryName);
      if (!owner) return null; // Unowned territory
      if (!controller) {
        controller = owner;
      } else if (controller !== owner) {
        return null; // Different owners
      }
    }

    if (controller) {
      const player = this.gameState.players.find(p => p.id === controller);
      return player || null;
    }
    return null;
  }

  _getTechIcon(tech) {
    const icons = {
      jets: '✈️',
      rockets: '🚀',
      superSubs: '🐋',
      longRangeAir: '🦅',
      heavyBombers: '💣',
      industrialTech: '🏭',
    };
    return icons[tech] || '🔬';
  }
}
