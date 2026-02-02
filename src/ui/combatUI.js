// Enhanced combat resolution UI with dice animation, probability, and casualty selection

export class CombatUI {
  constructor() {
    this.gameState = null;
    this.unitDefs = null;
    this.onCombatComplete = null;

    this.currentTerritory = null;
    this.combatState = null; // { attackers, defenders, phase, pendingCasualties }
    this.diceAnimation = null;
    this.lastRolls = null;

    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'combatPopup';
    this.el.className = 'combat-popup hidden';
    document.body.appendChild(this.el);
  }

  setGameState(gameState) {
    this.gameState = gameState;
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  setOnComplete(callback) {
    this.onCombatComplete = callback;
  }

  hasCombats() {
    return this.gameState && this.gameState.combatQueue.length > 0;
  }

  showNextCombat() {
    if (!this.hasCombats()) {
      this.hide();
      return;
    }

    this.currentTerritory = this.gameState.combatQueue[0];
    this._initCombatState();
    this._render();
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
    this.currentTerritory = null;
    this.combatState = null;
    this.diceAnimation = null;
    this.lastRolls = null;
  }

  _initCombatState() {
    const player = this.gameState.currentPlayer;
    const units = this.gameState.getUnitsAt(this.currentTerritory);

    const attackers = units
      .filter(u => u.owner === player.id)
      .map(u => ({ ...u }));

    const defenders = units
      .filter(u => u.owner !== player.id && !this.gameState.areAllies(player.id, u.owner))
      .map(u => ({ ...u }));

    // Check for AA guns and attacking aircraft
    const aaGuns = defenders.filter(u => u.type === 'aaGun');
    const attackingAir = attackers.filter(u => {
      const def = this.unitDefs[u.type];
      return def && def.isAir;
    });

    this.combatState = {
      attackers,
      defenders,
      phase: aaGuns.length > 0 && attackingAir.length > 0 ? 'aaFire' : 'ready',
      pendingAttackerCasualties: 0,
      pendingDefenderCasualties: 0,
      selectedAttackerCasualties: {},
      selectedDefenderCasualties: {},
      winner: null,
      aaFired: false,
      aaResults: null,
    };

    this.lastRolls = null;
  }

  _rollAAFire() {
    const { attackers } = this.combatState;

    // Count attacking aircraft
    const attackingAir = attackers.filter(u => {
      const def = this.unitDefs[u.type];
      return def && def.isAir;
    });

    const totalAircraft = attackingAir.reduce((sum, u) => sum + u.quantity, 0);

    // Roll 1 die per aircraft, hits on 1
    const rolls = [];
    let hits = 0;
    for (let i = 0; i < totalAircraft; i++) {
      const roll = Math.floor(Math.random() * 6) + 1;
      const hit = roll === 1;
      rolls.push({ roll, hit });
      if (hit) hits++;
    }

    this.combatState.aaResults = { rolls, hits };
    this.combatState.aaFired = true;

    // Auto-select aircraft casualties (cheapest first)
    if (hits > 0) {
      const airCasualties = this._selectCheapestAircraftCasualties(attackers, hits);

      // Apply AA casualties immediately
      for (const [type, count] of Object.entries(airCasualties)) {
        const unit = attackers.find(u => u.type === type);
        if (unit) unit.quantity -= count;
      }

      // Remove dead units
      this.combatState.attackers = attackers.filter(u => u.quantity > 0);
    }

    // Move to ready phase if there are still attackers
    if (this._getTotalUnits(this.combatState.attackers) > 0 &&
        this._getTotalUnits(this.combatState.defenders.filter(u => u.type !== 'aaGun')) > 0) {
      this.combatState.phase = 'ready';
    } else if (this._getTotalUnits(this.combatState.attackers) === 0) {
      this.combatState.phase = 'resolved';
      this.combatState.winner = 'defender';
    } else {
      // Only AA guns left defending - attacker wins
      this.combatState.phase = 'resolved';
      this.combatState.winner = 'attacker';
    }

    this._render();
  }

  _selectCheapestAircraftCasualties(units, count) {
    const airUnits = units.filter(u => {
      const def = this.unitDefs[u.type];
      return def && def.isAir && u.quantity > 0;
    }).sort((a, b) => {
      const costA = this.unitDefs[a.type]?.cost || 999;
      const costB = this.unitDefs[b.type]?.cost || 999;
      return costA - costB;
    });

    const selected = {};
    let remaining = count;

    for (const unit of airUnits) {
      if (remaining <= 0) break;
      const take = Math.min(unit.quantity, remaining);
      selected[unit.type] = take;
      remaining -= take;
    }

    return selected;
  }

  _calculateProbability() {
    // Simplified probability calculation based on expected hits
    const { attackers, defenders } = this.combatState;

    let attackPower = 0;
    let attackUnits = 0;
    for (const unit of attackers) {
      const def = this.unitDefs[unit.type];
      if (def && def.attack > 0) {
        attackPower += (def.attack / 6) * unit.quantity;
        attackUnits += unit.quantity;
      }
    }

    let defensePower = 0;
    let defenseUnits = 0;
    for (const unit of defenders) {
      const def = this.unitDefs[unit.type];
      if (def && def.defense > 0) {
        defensePower += (def.defense / 6) * unit.quantity;
        defenseUnits += unit.quantity;
      }
    }

    if (attackUnits === 0 || defenseUnits === 0) {
      return attackUnits > 0 ? 100 : 0;
    }

    // Simplified: compare expected hits per round vs units
    const attackerAdvantage = (attackPower / defenseUnits) - (defensePower / attackUnits);
    // Convert to percentage (sigmoid-like)
    const probability = 50 + (attackerAdvantage * 30);
    return Math.max(5, Math.min(95, probability));
  }

  _getTotalUnits(units) {
    return units.reduce((sum, u) => sum + u.quantity, 0);
  }

  _rollDice() {
    const { attackers, defenders } = this.combatState;

    // Roll for attackers
    const attackRolls = [];
    let attackHits = 0;
    for (const unit of attackers) {
      const def = this.unitDefs[unit.type];
      if (!def) continue;
      for (let i = 0; i < unit.quantity; i++) {
        const roll = Math.floor(Math.random() * 6) + 1;
        const hit = roll <= def.attack;
        attackRolls.push({ roll, hit, unitType: unit.type });
        if (hit) attackHits++;
      }
    }

    // Roll for defenders
    const defenseRolls = [];
    let defenseHits = 0;
    for (const unit of defenders) {
      const def = this.unitDefs[unit.type];
      if (!def) continue;
      for (let i = 0; i < unit.quantity; i++) {
        const roll = Math.floor(Math.random() * 6) + 1;
        const hit = roll <= def.defense;
        defenseRolls.push({ roll, hit, unitType: unit.type });
        if (hit) defenseHits++;
      }
    }

    this.lastRolls = { attackRolls, defenseRolls, attackHits, defenseHits };
    return { attackHits, defenseHits };
  }

  async _animateDiceRoll() {
    this.combatState.phase = 'rolling';
    this._render();

    // Animate dice for 0.5 seconds
    const duration = 500;
    const startTime = Date.now();

    return new Promise(resolve => {
      const animate = () => {
        const elapsed = Date.now() - startTime;
        if (elapsed < duration) {
          // Update with random dice values
          this._renderDiceAnimation();
          requestAnimationFrame(animate);
        } else {
          // Final roll
          const result = this._rollDice();
          this.combatState.pendingDefenderCasualties = result.attackHits;
          this.combatState.pendingAttackerCasualties = result.defenseHits;
          this.combatState.phase = 'selectCasualties';
          this._autoSelectCasualties();
          this._render();
          resolve(result);
        }
      };
      animate();
    });
  }

  _renderDiceAnimation() {
    // Just update the dice display with random values
    const diceContainer = this.el.querySelector('.dice-animation');
    if (!diceContainer) return;

    const { attackers, defenders } = this.combatState;
    const attackCount = this._getTotalUnits(attackers);
    const defenseCount = this._getTotalUnits(defenders);

    let html = '<div class="dice-row attacking">';
    for (let i = 0; i < Math.min(attackCount, 10); i++) {
      const roll = Math.floor(Math.random() * 6) + 1;
      html += `<div class="die rolling">${roll}</div>`;
    }
    if (attackCount > 10) html += `<span class="dice-more">+${attackCount - 10} more</span>`;
    html += '</div>';

    html += '<div class="dice-row defending">';
    for (let i = 0; i < Math.min(defenseCount, 10); i++) {
      const roll = Math.floor(Math.random() * 6) + 1;
      html += `<div class="die rolling">${roll}</div>`;
    }
    if (defenseCount > 10) html += `<span class="dice-more">+${defenseCount - 10} more</span>`;
    html += '</div>';

    diceContainer.innerHTML = html;
  }

  _autoSelectCasualties() {
    // Auto-select cheapest units as casualties
    const { attackers, defenders, pendingAttackerCasualties, pendingDefenderCasualties } = this.combatState;

    this.combatState.selectedAttackerCasualties = this._selectCheapestCasualties(attackers, pendingAttackerCasualties);
    this.combatState.selectedDefenderCasualties = this._selectCheapestCasualties(defenders, pendingDefenderCasualties);
  }

  _selectCheapestCasualties(units, count) {
    const sorted = [...units]
      .filter(u => u.quantity > 0)
      .sort((a, b) => {
        const costA = this.unitDefs[a.type]?.cost || 999;
        const costB = this.unitDefs[b.type]?.cost || 999;
        return costA - costB;
      });

    const selected = {};
    let remaining = count;

    for (const unit of sorted) {
      if (remaining <= 0) break;
      const take = Math.min(unit.quantity, remaining);
      selected[unit.type] = take;
      remaining -= take;
    }

    return selected;
  }

  _getTotalSelectedCasualties(selected) {
    return Object.values(selected).reduce((sum, n) => sum + n, 0);
  }

  _applyCasualties() {
    const { attackers, defenders, selectedAttackerCasualties, selectedDefenderCasualties } = this.combatState;

    // Apply attacker casualties
    for (const [type, count] of Object.entries(selectedAttackerCasualties)) {
      const unit = attackers.find(u => u.type === type);
      if (unit) unit.quantity -= count;
    }

    // Apply defender casualties
    for (const [type, count] of Object.entries(selectedDefenderCasualties)) {
      const unit = defenders.find(u => u.type === type);
      if (unit) unit.quantity -= count;
    }

    // Remove dead units
    this.combatState.attackers = attackers.filter(u => u.quantity > 0);
    this.combatState.defenders = defenders.filter(u => u.quantity > 0);

    // Check for resolution
    if (this.combatState.defenders.length === 0) {
      this.combatState.phase = 'resolved';
      this.combatState.winner = 'attacker';
    } else if (this.combatState.attackers.length === 0) {
      this.combatState.phase = 'resolved';
      this.combatState.winner = 'defender';
    } else {
      // Continue combat
      this.combatState.phase = 'ready';
      this.combatState.pendingAttackerCasualties = 0;
      this.combatState.pendingDefenderCasualties = 0;
      this.combatState.selectedAttackerCasualties = {};
      this.combatState.selectedDefenderCasualties = {};
      this.lastRolls = null;
    }

    this._render();
  }

  _finalizeCombat() {
    // Apply final state to game
    const player = this.gameState.currentPlayer;
    const units = [];
    const previousOwner = this.gameState.getOwner(this.currentTerritory);
    const defenderPlayer = this.gameState.getPlayer(previousOwner);

    // Add surviving attackers
    for (const unit of this.combatState.attackers) {
      if (unit.quantity > 0) {
        units.push({ ...unit, moved: true });
      }
    }

    // Add surviving defenders
    for (const unit of this.combatState.defenders) {
      if (unit.quantity > 0) {
        units.push({ ...unit });
      }
    }

    this.gameState.units[this.currentTerritory] = units;

    // Log combat result
    this.gameState.logCombat({
      territory: this.currentTerritory,
      attacker: player.name,
      defender: defenderPlayer?.name || 'Unknown',
      winner: this.combatState.winner,
      attackerSurvivors: this._getTotalUnits(this.combatState.attackers),
      defenderSurvivors: this._getTotalUnits(this.combatState.defenders),
    });

    // Update territory ownership if attacker won
    if (this.combatState.winner === 'attacker') {
      this.gameState.territoryState[this.currentTerritory].owner = player.id;

      // Handle capital capture (IPC transfer, victory check)
      this.gameState.handleCapitalCapture(this.currentTerritory, player.id, previousOwner);
    }

    // Remove from combat queue
    this.gameState.combatQueue = this.gameState.combatQueue.filter(t => t !== this.currentTerritory);
    this.gameState._notify();
  }

  async _autoBattle() {
    // Run combat to completion automatically
    while (this.combatState.phase !== 'resolved') {
      if (this.combatState.phase === 'aaFire') {
        this._rollAAFire();
        await new Promise(r => setTimeout(r, 150));
      }
      if (this.combatState.phase === 'ready') {
        await this._animateDiceRoll();
        await new Promise(r => setTimeout(r, 100));
      }
      if (this.combatState.phase === 'selectCasualties') {
        this._applyCasualties();
        await new Promise(r => setTimeout(r, 150));
      }
    }
  }

  _render() {
    if (!this.currentTerritory || !this.gameState || !this.combatState) return;

    const player = this.gameState.currentPlayer;
    const { attackers, defenders, phase, winner } = this.combatState;

    const defenderOwner = defenders[0]?.owner;
    const defenderPlayer = this.gameState.getPlayer(defenderOwner);

    const probability = this._calculateProbability();

    let html = `
      <div class="combat-content">
        <div class="combat-header">
          <div class="combat-title">Battle for ${this.currentTerritory}</div>
          <div class="combat-remaining">${this.gameState.combatQueue.length} battle(s) remaining</div>
        </div>

        <!-- Probability Bar -->
        <div class="probability-bar-container">
          <div class="prob-label attacker">${player.name} (${Math.round(probability)}%)</div>
          <div class="probability-bar">
            <div class="prob-fill attacker" style="width: ${probability}%; background: ${player.color}"></div>
            <div class="prob-fill defender" style="width: ${100 - probability}%; background: ${defenderPlayer?.color || '#888'}"></div>
            <div class="prob-marker" style="left: ${probability}%"></div>
          </div>
          <div class="prob-label defender">${defenderPlayer?.name || 'Defender'} (${Math.round(100 - probability)}%)</div>
        </div>

        <!-- Forces -->
        <div class="combat-forces">
          <div class="force attacker">
            <div class="force-header" style="border-color: ${player.color}">
              <span class="force-label">Attacker</span>
              <span class="force-name" style="color: ${player.color}">${player.name}</span>
              <span class="force-count">${this._getTotalUnits(attackers)} units</span>
            </div>
            <div class="force-units">
              ${this._renderForceUnits(attackers, 'attacker')}
            </div>
          </div>

          <div class="combat-vs">VS</div>

          <div class="force defender">
            <div class="force-header" style="border-color: ${defenderPlayer?.color || '#888'}">
              <span class="force-label">Defender</span>
              <span class="force-name" style="color: ${defenderPlayer?.color || '#888'}">${defenderPlayer?.name || 'Unknown'}</span>
              <span class="force-count">${this._getTotalUnits(defenders)} units</span>
            </div>
            <div class="force-units">
              ${this._renderForceUnits(defenders, 'defender')}
            </div>
          </div>
        </div>
    `;

    // AA Fire phase
    if (phase === 'aaFire') {
      html += `
        <div class="aa-fire-section">
          <div class="aa-title">Anti-Aircraft Fire</div>
          <div class="aa-desc">AA guns fire at attacking aircraft (hits on 1)</div>
        </div>
      `;
    }

    // AA Results
    if (this.combatState.aaFired && this.combatState.aaResults) {
      const { rolls, hits } = this.combatState.aaResults;
      html += `
        <div class="aa-results">
          <div class="aa-result-header">AA Fire Results: ${hits} hit(s)</div>
          <div class="dice-display">
            ${rolls.slice(0, 12).map(r => `<div class="die ${r.hit ? 'hit' : 'miss'}">${r.roll}</div>`).join('')}
            ${rolls.length > 12 ? `<span class="dice-more">+${rolls.length - 12}</span>` : ''}
          </div>
        </div>
      `;
    }

    // Dice animation area
    if (phase === 'rolling') {
      html += `
        <div class="dice-section">
          <div class="dice-title">Rolling dice...</div>
          <div class="dice-animation"></div>
        </div>
      `;
    }

    // Show dice results
    if (this.lastRolls && phase === 'selectCasualties') {
      html += this._renderDiceResults();
    }

    // Casualty selection
    if (phase === 'selectCasualties') {
      html += this._renderCasualtySelection();
    }

    // Victory/defeat message
    if (phase === 'resolved') {
      html += `
        <div class="combat-result ${winner}">
          <div class="result-message">
            ${winner === 'attacker'
              ? `<span style="color: ${player.color}">${player.name}</span> captures ${this.currentTerritory}!`
              : `<span style="color: ${defenderPlayer?.color || '#888'}">${defenderPlayer?.name || 'Defender'}</span> holds ${this.currentTerritory}!`
            }
          </div>
        </div>
      `;
    }

    // Actions
    html += `<div class="combat-actions">`;

    if (phase === 'aaFire') {
      html += `
        <button class="combat-btn roll" data-action="aa-fire">
          <span class="btn-icon">🎯</span> Fire AA Guns
        </button>
      `;
    } else if (phase === 'ready') {
      html += `
        <button class="combat-btn roll" data-action="roll">
          <span class="btn-icon">🎲</span> Roll Dice
        </button>
        <button class="combat-btn auto" data-action="auto-battle">
          <span class="btn-icon">⚡</span> Auto Battle
        </button>
        <button class="combat-btn retreat" data-action="retreat">Retreat</button>
      `;
    } else if (phase === 'selectCasualties') {
      html += `
        <button class="combat-btn confirm" data-action="confirm-casualties">
          Confirm Casualties
        </button>
      `;
    } else if (phase === 'resolved') {
      html += `
        <button class="combat-btn next" data-action="next">
          ${this.gameState.combatQueue.length > 1 ? 'Next Battle' : 'End Combat Phase'}
        </button>
      `;
    }

    html += `</div></div>`;

    this.el.innerHTML = html;
    this._bindEvents();
  }

  _renderForceUnits(units, side) {
    if (units.length === 0 || this._getTotalUnits(units) === 0) {
      return '<div class="no-units">No units remaining</div>';
    }

    return units.filter(u => u.quantity > 0).map(u => {
      const def = this.unitDefs[u.type];
      const imageSrc = def?.image ? `assets/units/${def.image}` : null;
      const stat = side === 'attacker' ? def?.attack : def?.defense;

      return `
        <div class="combat-unit">
          ${imageSrc ? `<img src="${imageSrc}" class="combat-unit-icon" alt="${u.type}">` : ''}
          <span class="combat-unit-qty">×${u.quantity}</span>
          <span class="combat-unit-name">${u.type}</span>
          <span class="combat-unit-stat">${side === 'attacker' ? 'A' : 'D'}${stat || 0}</span>
        </div>
      `;
    }).join('');
  }

  _renderDiceResults() {
    const { attackRolls, defenseRolls, attackHits, defenseHits } = this.lastRolls;

    return `
      <div class="dice-results">
        <div class="dice-result-row">
          <span class="dice-result-label">Attack Hits:</span>
          <span class="dice-result-value hits">${attackHits}</span>
          <div class="dice-display">
            ${attackRolls.slice(0, 12).map(r => `<div class="die ${r.hit ? 'hit' : 'miss'}">${r.roll}</div>`).join('')}
            ${attackRolls.length > 12 ? `<span class="dice-more">+${attackRolls.length - 12}</span>` : ''}
          </div>
        </div>
        <div class="dice-result-row">
          <span class="dice-result-label">Defense Hits:</span>
          <span class="dice-result-value hits">${defenseHits}</span>
          <div class="dice-display">
            ${defenseRolls.slice(0, 12).map(r => `<div class="die ${r.hit ? 'hit' : 'miss'}">${r.roll}</div>`).join('')}
            ${defenseRolls.length > 12 ? `<span class="dice-more">+${defenseRolls.length - 12}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  _renderCasualtySelection() {
    const {
      attackers, defenders,
      pendingAttackerCasualties, pendingDefenderCasualties,
      selectedAttackerCasualties, selectedDefenderCasualties
    } = this.combatState;

    const attackerTotal = this._getTotalSelectedCasualties(selectedAttackerCasualties);
    const defenderTotal = this._getTotalSelectedCasualties(selectedDefenderCasualties);

    let html = `<div class="casualty-selection">`;

    // Attacker casualties (controlled by current player)
    if (pendingAttackerCasualties > 0) {
      html += `
        <div class="casualty-group attacker">
          <div class="casualty-header">
            <span class="casualty-title">Select ${pendingAttackerCasualties} Attacker Casualties</span>
            <span class="casualty-count ${attackerTotal === pendingAttackerCasualties ? 'complete' : 'incomplete'}">
              ${attackerTotal}/${pendingAttackerCasualties}
            </span>
          </div>
          <div class="casualty-units">
            ${this._renderCasualtyUnits(attackers, selectedAttackerCasualties, 'attacker')}
          </div>
        </div>
      `;
    }

    // Defender casualties (auto-selected)
    if (pendingDefenderCasualties > 0) {
      html += `
        <div class="casualty-group defender">
          <div class="casualty-header">
            <span class="casualty-title">Defender Loses ${pendingDefenderCasualties} Units</span>
            <span class="casualty-count complete">${defenderTotal}/${pendingDefenderCasualties}</span>
          </div>
          <div class="casualty-units readonly">
            ${this._renderCasualtyUnits(defenders, selectedDefenderCasualties, 'defender', true)}
          </div>
        </div>
      `;
    }

    html += `</div>`;
    return html;
  }

  _renderCasualtyUnits(units, selected, side, readonly = false) {
    return units.filter(u => u.quantity > 0).map(u => {
      const def = this.unitDefs[u.type];
      const imageSrc = def?.image ? `assets/units/${def.image}` : null;
      const selectedCount = selected[u.type] || 0;

      return `
        <div class="casualty-unit ${selectedCount > 0 ? 'has-casualties' : ''}">
          <div class="casualty-unit-info">
            ${imageSrc ? `<img src="${imageSrc}" class="casualty-icon" alt="${u.type}">` : ''}
            <span class="casualty-name">${u.type}</span>
            <span class="casualty-avail">(${u.quantity})</span>
          </div>
          ${!readonly ? `
            <div class="casualty-controls">
              <button class="casualty-btn minus" data-side="${side}" data-unit="${u.type}" ${selectedCount <= 0 ? 'disabled' : ''}>−</button>
              <span class="casualty-selected">${selectedCount}</span>
              <button class="casualty-btn plus" data-side="${side}" data-unit="${u.type}" ${selectedCount >= u.quantity ? 'disabled' : ''}>+</button>
            </div>
          ` : `
            <div class="casualty-controls readonly">
              <span class="casualty-selected">${selectedCount}</span>
            </div>
          `}
        </div>
      `;
    }).join('');
  }

  _bindEvents() {
    // Action buttons
    this.el.querySelectorAll('.combat-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;

        switch (action) {
          case 'aa-fire':
            this._rollAAFire();
            break;
          case 'roll':
            await this._animateDiceRoll();
            break;
          case 'auto-battle':
            await this._autoBattle();
            break;
          case 'retreat':
            this._retreat();
            break;
          case 'confirm-casualties':
            this._applyCasualties();
            break;
          case 'next':
            this._finalizeCombat();
            this._nextCombat();
            break;
        }
      });
    });

    // Casualty selection buttons
    this.el.querySelectorAll('.casualty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const side = btn.dataset.side;
        const unitType = btn.dataset.unit;
        const delta = btn.classList.contains('plus') ? 1 : -1;

        this._adjustCasualty(side, unitType, delta);
      });
    });
  }

  _adjustCasualty(side, unitType, delta) {
    const { attackers, pendingAttackerCasualties, selectedAttackerCasualties } = this.combatState;

    if (side !== 'attacker') return; // Only attacker can adjust

    const unit = attackers.find(u => u.type === unitType);
    if (!unit) return;

    const current = selectedAttackerCasualties[unitType] || 0;
    const newValue = Math.max(0, Math.min(unit.quantity, current + delta));

    // Check we don't exceed required casualties
    const currentTotal = this._getTotalSelectedCasualties(selectedAttackerCasualties);
    const newTotal = currentTotal - current + newValue;

    if (newTotal <= pendingAttackerCasualties) {
      selectedAttackerCasualties[unitType] = newValue;
      this._render();
    }
  }

  _retreat() {
    // Remove from combat queue without resolving
    this.gameState.combatQueue = this.gameState.combatQueue.filter(t => t !== this.currentTerritory);
    this.gameState._notify();
    this._nextCombat();
  }

  _nextCombat() {
    if (this.gameState.combatQueue.length > 0) {
      this.currentTerritory = this.gameState.combatQueue[0];
      this._initCombatState();
      this._render();
    } else {
      this.hide();
      if (this.onCombatComplete) {
        this.onCombatComplete();
      }
    }
  }
}
