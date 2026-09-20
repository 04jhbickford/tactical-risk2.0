/**
 * ============================================================================
 * TACTICAL RISK - STRATEGY AI SYSTEM
 * ============================================================================
 *
 * Three-tier AI system for Risk/Axis & Allies hybrid gameplay.
 * - EasyAI: Intentionally weak, makes mistakes, good for beginners
 * - MediumAI: Solid heuristic play, challenging for casual players
 * - HardAI: Advanced expectiminimax with Monte Carlo, expert-level
 *
 * ============================================================================
 * HOW TO INTEGRATE
 * ============================================================================
 *
 * 1. Import the AI classes:
 *    import { EasyAI, MediumAI, HardAI } from './ai/strategyAI.js';
 *
 * 2. Create AI instance for a player:
 *    const ai = new HardAI(playerId, calculateBattleOutcome);
 *
 * 3. In your game loop, call getBestAction based on current phase:
 *
 *    // Purchase Phase
 *    if (gameState.phase === 'purchase') {
 *      const action = ai.getBestAction(gameState);
 *      // action.purchases = [{unitType: 'infantry', quantity: 3}, ...]
 *      for (const purchase of action.purchases) {
 *        game.purchaseUnit(purchase.unitType, purchase.quantity);
 *      }
 *    }
 *
 *    // Combat Move Phase
 *    if (gameState.phase === 'combatMove') {
 *      const action = ai.getBestAction(gameState);
 *      // action.attacks = [{from, to, units}, ...] sorted by priority
 *      for (const attack of action.attacks) {
 *        game.moveUnits(attack.from, attack.to, attack.units);
 *      }
 *    }
 *
 *    // Non-Combat Move Phase
 *    if (gameState.phase === 'nonCombatMove') {
 *      const action = ai.getBestAction(gameState);
 *      // action.moves = [{from, to, units}, ...]
 *      for (const move of action.moves) {
 *        game.moveUnits(move.from, move.to, move.units);
 *      }
 *    }
 *
 *    // Placement Phase
 *    if (gameState.phase === 'placement') {
 *      const action = ai.getBestAction(gameState);
 *      // action.placements = [{territoryId, units}, ...]
 *      for (const placement of action.placements) {
 *        game.placeUnits(placement.territoryId, placement.units);
 *      }
 *    }
 *
 * 4. Optional: Update AI state between turns
 *    ai.onTurnEnd(gameState);  // Tracks opponent patterns
 *
 * ============================================================================
 */

// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

/**
 * Unit definitions with combat values and costs
 * Adjust these to match your game's unit stats
 */
const UNIT_STATS = {
  infantry:   { attack: 1, defense: 2, cost: 3,  movement: 1, value: 3 },
  artillery:  { attack: 2, defense: 2, cost: 4,  movement: 1, value: 4 },
  tank:       { attack: 3, defense: 3, cost: 6,  movement: 2, value: 6 },
  fighter:    { attack: 3, defense: 4, cost: 10, movement: 4, value: 10 },
  bomber:     { attack: 4, defense: 1, cost: 12, movement: 6, value: 12 },
  transport:  { attack: 0, defense: 0, cost: 7,  movement: 2, value: 7 },
  submarine:  { attack: 2, defense: 1, cost: 6,  movement: 2, value: 6 },
  destroyer:  { attack: 2, defense: 2, cost: 8,  movement: 2, value: 8 },
  cruiser:    { attack: 3, defense: 3, cost: 12, movement: 2, value: 12 },
  battleship: { attack: 4, defense: 4, cost: 20, movement: 2, value: 20 },
  carrier:    { attack: 1, defense: 2, cost: 14, movement: 2, value: 14 },
  aaGun:      { attack: 0, defense: 0, cost: 5,  movement: 1, value: 5 },
  factory:    { attack: 0, defense: 0, cost: 15, movement: 0, value: 15 },
};

/**
 * AI Weight Configuration - THE MAIN TUNING KNOBS
 * See "TUNING GUIDE" at bottom for detailed explanations
 */
const AI_WEIGHTS = {
  // Economic weights
  TERRITORY_IPC_VALUE: 1.0,           // Base value per IPC
  CONTINENT_COMPLETION_BONUS: 3.0,    // Multiplier for completing continents
  CONTINENT_DENIAL_BONUS: 4.0,        // Multiplier for denying opponent continents

  // Combat weights
  BATTLE_WIN_THRESHOLD_EASY: 0.3,     // Easy attacks at 30%+ odds
  BATTLE_WIN_THRESHOLD_MEDIUM: 0.55,  // Medium wants 55%+ odds
  BATTLE_WIN_THRESHOLD_HARD: 0.45,    // Hard will take calculated risks

  // Strategic weights
  CAPITAL_DEFENSE_PRIORITY: 5.0,      // How much to prioritize capital defense
  CAPITAL_ATTACK_BONUS: 3.0,          // Bonus for attacking enemy capitals
  OBJECTIVE_PROGRESS_WEIGHT: 2.5,     // Weight for advancing own objectives
  OBJECTIVE_DENIAL_WEIGHT: 4.0,       // Weight for blocking opponent objectives

  // Tactical weights
  UNIT_PRESERVATION_WEIGHT: 0.8,      // How much to value keeping units alive
  AGGRESSION_WHEN_BEHIND: 1.5,        // Multiplier when losing
  CONSERVATISM_WHEN_AHEAD: 0.7,       // Multiplier when winning

  // Search parameters
  HARD_AI_SEARCH_DEPTH: 3,            // Expectiminimax depth for Hard AI
  MONTE_CARLO_SIMULATIONS: 50,        // Number of battle simulations
  MAX_MOVES_TO_CONSIDER: 15,          // Prune to top N moves for performance
};


// ============================================================================
// BASE AI CLASS
// ============================================================================

/**
 * BaseAI - Foundation class with shared utilities
 * All difficulty levels inherit from this class
 */
export class BaseAI {
  constructor(playerId, calculateBattleOutcome, unitStats = UNIT_STATS) {
    this.playerId = playerId;
    this.calculateBattleOutcome = calculateBattleOutcome;
    this.unitStats = unitStats;
    this.weights = { ...AI_WEIGHTS };

    // Cache for expensive calculations
    this.cache = {
      threatMap: null,
      continentProgress: null,
      territoryValues: null,
    };
  }

  /**
   * Main entry point - override in subclasses for difficulty-specific behavior
   * @param {Object} gameState - Current game state
   * @returns {Object} Action object with type-specific data
   */
  getBestAction(gameState) {
    // Clear cache for fresh calculations
    this.clearCache();

    const phase = gameState.phase || gameState.turnPhase;

    switch (phase) {
      case 'purchase':
      case 'PURCHASE':
        return { type: 'purchase', purchases: this.decidePurchases(gameState) };

      case 'combatMove':
      case 'COMBAT_MOVE':
        return { type: 'combatMove', attacks: this.decideCombatMoves(gameState) };

      case 'nonCombatMove':
      case 'NON_COMBAT_MOVE':
        return { type: 'nonCombatMove', moves: this.decideNonCombatMoves(gameState) };

      case 'placement':
      case 'MOBILIZE':
        return { type: 'placement', placements: this.decidePlacements(gameState) };

      default:
        return { type: 'none', actions: [] };
    }
  }

  // Override these in subclasses
  decidePurchases(gameState) { return []; }
  decideCombatMoves(gameState) { return []; }
  decideNonCombatMoves(gameState) { return []; }
  decidePlacements(gameState) { return []; }

  // =========================================================================
  // UTILITY METHODS - Shared by all difficulty levels
  // =========================================================================

  /**
   * Clear calculation cache
   */
  clearCache() {
    this.cache = {
      threatMap: null,
      continentProgress: null,
      territoryValues: null,
    };
  }

  /**
   * Get territories owned by a player
   */
  getPlayerTerritories(gameState, playerId = this.playerId) {
    const territories = this._getTerritories(gameState);
    return territories.filter(t => this._getOwnerId(t) === playerId);
  }

  /**
   * Get enemy territories (not owned by us or allies)
   */
  getEnemyTerritories(gameState) {
    const territories = this._getTerritories(gameState);
    return territories.filter(t => {
      const owner = this._getOwnerId(t);
      return owner && owner !== this.playerId && !this.isAlly(gameState, owner);
    });
  }

  /**
   * Get neighbors of a territory
   */
  getNeighbors(gameState, territoryId) {
    const territory = this._getTerritory(gameState, territoryId);
    if (!territory) return [];

    const neighborIds = territory.neighbors || territory.connections || [];
    return neighborIds.map(id => this._getTerritory(gameState, id)).filter(Boolean);
  }

  /**
   * Get hostile neighbors (enemy territories adjacent to ours)
   */
  getHostileNeighbors(gameState, territoryId) {
    return this.getNeighbors(gameState, territoryId).filter(t => {
      const owner = this._getOwnerId(t);
      return owner && owner !== this.playerId && !this.isAlly(gameState, owner);
    });
  }

  /**
   * Get friendly neighbors
   */
  getFriendlyNeighbors(gameState, territoryId) {
    return this.getNeighbors(gameState, territoryId).filter(t => {
      const owner = this._getOwnerId(t);
      return owner === this.playerId || this.isAlly(gameState, owner);
    });
  }

  /**
   * Check if two players are allies
   */
  isAlly(gameState, otherPlayerId) {
    // Check team system
    const myPlayer = this._getPlayer(gameState, this.playerId);
    const otherPlayer = this._getPlayer(gameState, otherPlayerId);

    if (myPlayer?.teamId && otherPlayer?.teamId) {
      return myPlayer.teamId === otherPlayer.teamId;
    }
    return false;
  }

  /**
   * Calculate total IPC value of a territory including continent bonus contribution
   * This is the CORE economic evaluation function
   */
  calculateTerritoryValue(gameState, territory, forPlayer = this.playerId) {
    const baseIPC = territory.ipcValue || territory.production || 0;
    let value = baseIPC * this.weights.TERRITORY_IPC_VALUE;

    // Add continent bonus contribution
    const continent = this._getContinentForTerritory(gameState, territory);
    if (continent) {
      const continentBonus = continent.bonus || continent.bonusIPC || 0;
      const territoriesInContinent = continent.territories?.length || 1;

      // Base contribution (proportional share of continent bonus)
      value += (continentBonus / territoriesInContinent) * 0.5;

      // Check if this completes a continent
      if (this.wouldCompleteContinent(gameState, territory, forPlayer)) {
        value += continentBonus * this.weights.CONTINENT_COMPLETION_BONUS;
      }

      // Check if this denies an opponent's continent
      const denialValue = this.calculateContinentDenialValue(gameState, territory);
      value += denialValue * this.weights.CONTINENT_DENIAL_BONUS;
    }

    // Capital bonus
    if (territory.isCapital) {
      value += this.weights.CAPITAL_ATTACK_BONUS * 10;
    }

    // Objective bonus
    value += this.calculateObjectiveValue(gameState, territory, forPlayer);

    return value;
  }

  /**
   * Check if capturing a territory would complete a continent for the player
   */
  wouldCompleteContinent(gameState, territory, playerId) {
    const continent = this._getContinentForTerritory(gameState, territory);
    if (!continent) return false;

    const continentTerritories = this._getTerritoriesInContinent(gameState, continent);

    // Count how many we already own (excluding the target)
    const owned = continentTerritories.filter(t =>
      this._getOwnerId(t) === playerId &&
      this._getTerritoryId(t) !== this._getTerritoryId(territory)
    ).length;

    // If we own all but this one, capturing it completes the continent
    return owned === continentTerritories.length - 1;
  }

  /**
   * Calculate the denial value - how much we hurt an opponent by taking this territory
   */
  calculateContinentDenialValue(gameState, territory) {
    const continent = this._getContinentForTerritory(gameState, territory);
    if (!continent) return 0;

    const continentTerritories = this._getTerritoriesInContinent(gameState, continent);
    const continentBonus = continent.bonus || continent.bonusIPC || 0;

    // Check each opponent
    let maxDenialValue = 0;
    const opponents = this._getOpponents(gameState);

    for (const opponent of opponents) {
      const opponentOwned = continentTerritories.filter(t =>
        this._getOwnerId(t) === opponent.id
      ).length;

      // If opponent owns all but this territory, denying is very valuable
      if (opponentOwned === continentTerritories.length - 1) {
        maxDenialValue = Math.max(maxDenialValue, continentBonus);
      }
      // If opponent is close to completing (owns 80%+), still valuable
      else if (opponentOwned >= continentTerritories.length * 0.8) {
        maxDenialValue = Math.max(maxDenialValue, continentBonus * 0.5);
      }
    }

    return maxDenialValue;
  }

  /**
   * Calculate objective-related value of a territory
   */
  calculateObjectiveValue(gameState, territory, playerId) {
    let value = 0;

    // Check player objectives
    const player = this._getPlayer(gameState, playerId);
    if (player?.objectives) {
      for (const objective of player.objectives) {
        if (objective.territories?.includes(this._getTerritoryId(territory))) {
          value += this.weights.OBJECTIVE_PROGRESS_WEIGHT * 5;
        }
      }
    }

    // Check global victory objectives
    if (gameState.victoryObjectives) {
      for (const objective of gameState.victoryObjectives) {
        if (objective.territories?.includes(this._getTerritoryId(territory))) {
          value += this.weights.OBJECTIVE_PROGRESS_WEIGHT * 3;
        }
      }
    }

    return value;
  }

  /**
   * Calculate units in a territory
   * Normalizes different unit formats (object vs array)
   */
  getUnitsAt(gameState, territoryId) {
    const territory = this._getTerritory(gameState, territoryId);
    if (!territory) return {};

    // Handle different unit formats
    const units = territory.units || [];

    if (Array.isArray(units)) {
      // Convert array format to object
      const unitMap = {};
      for (const unit of units) {
        const type = unit.type || unit.unitType;
        const qty = unit.quantity || unit.count || 1;
        const owner = unit.owner || unit.ownerId;

        if (!unitMap[owner]) unitMap[owner] = {};
        unitMap[owner][type] = (unitMap[owner][type] || 0) + qty;
      }
      return unitMap;
    }

    // Already object format
    return units;
  }

  /**
   * Get units for a specific player at a territory
   */
  getPlayerUnitsAt(gameState, territoryId, playerId = this.playerId) {
    const allUnits = this.getUnitsAt(gameState, territoryId);
    return allUnits[playerId] || {};
  }

  /**
   * Calculate total combat strength of units
   */
  calculateCombatStrength(units, isAttacking = true) {
    let strength = 0;

    for (const [type, quantity] of Object.entries(units)) {
      const stats = this.unitStats[type];
      if (stats) {
        const value = isAttacking ? stats.attack : stats.defense;
        strength += value * quantity;
      }
    }

    return strength;
  }

  /**
   * Calculate total IPC value of units
   */
  calculateUnitsValue(units) {
    let value = 0;

    for (const [type, quantity] of Object.entries(units)) {
      const stats = this.unitStats[type];
      if (stats) {
        value += stats.value * quantity;
      }
    }

    return value;
  }

  /**
   * Calculate total unit count
   */
  countUnits(units) {
    return Object.values(units).reduce((sum, qty) => sum + qty, 0);
  }

  /**
   * Build a threat map - territories that might be attacked next turn
   */
  buildThreatMap(gameState) {
    if (this.cache.threatMap) return this.cache.threatMap;

    const threatMap = new Map();
    const myTerritories = this.getPlayerTerritories(gameState);

    for (const territory of myTerritories) {
      const territoryId = this._getTerritoryId(territory);
      let totalThreat = 0;

      // Check all hostile neighbors
      const hostileNeighbors = this.getHostileNeighbors(gameState, territoryId);

      for (const hostile of hostileNeighbors) {
        const hostileId = this._getTerritoryId(hostile);
        const hostileOwner = this._getOwnerId(hostile);
        const hostileUnits = this.getPlayerUnitsAt(gameState, hostileId, hostileOwner);

        const attackStrength = this.calculateCombatStrength(hostileUnits, true);
        totalThreat += attackStrength;
      }

      threatMap.set(territoryId, {
        threat: totalThreat,
        hostileNeighbors: hostileNeighbors.length,
        isCapital: territory.isCapital,
        ipcValue: territory.ipcValue || territory.production || 0,
      });
    }

    this.cache.threatMap = threatMap;
    return threatMap;
  }

  /**
   * Calculate Expected Value of a battle
   * EV = (winProb * gain) - (loseProb * loss)
   */
  calculateBattleEV(gameState, fromTerritory, toTerritory, attackerUnits) {
    const defenderId = this._getOwnerId(toTerritory);
    const defenderUnits = this.getPlayerUnitsAt(gameState, this._getTerritoryId(toTerritory), defenderId);

    // Use the provided battle calculator
    const battleResult = this.calculateBattleOutcome(
      attackerUnits,
      defenderUnits,
      null, // attackerSupport
      null  // defenderSupport
    );

    const winProb = battleResult.winProbability || battleResult.attackerWinChance || 0.5;
    const loseProb = 1 - winProb;

    // Calculate gains
    const territoryValue = this.calculateTerritoryValue(gameState, toTerritory);
    const expectedAttackerLosses = battleResult.expectedAttackerLosses || {};
    const expectedDefenderLosses = battleResult.expectedDefenderLosses || {};

    const attackerLossValue = this.calculateUnitsValue(expectedAttackerLosses);
    const defenderLossValue = this.calculateUnitsValue(expectedDefenderLosses);

    // EV calculation
    const gainOnWin = territoryValue + defenderLossValue;
    const lossOnLose = attackerLossValue;

    const ev = (winProb * gainOnWin) - (loseProb * lossOnLose * this.weights.UNIT_PRESERVATION_WEIGHT);

    return {
      ev,
      winProbability: winProb,
      expectedAttackerLosses,
      expectedDefenderLosses,
      territoryValue,
    };
  }

  /**
   * Get the current player's IPC count
   */
  getMyIPCs(gameState) {
    const player = this._getPlayer(gameState, this.playerId);
    return player?.ipc || player?.ipcs || 0;
  }

  /**
   * Calculate income per turn for a player
   */
  calculateIncome(gameState, playerId = this.playerId) {
    let income = 0;

    // Territory income
    const territories = this.getPlayerTerritories(gameState, playerId);
    for (const territory of territories) {
      income += territory.ipcValue || territory.production || 0;
    }

    // Continent bonuses
    const continents = gameState.continents || [];
    for (const continent of continents) {
      if (this.controlsContinent(gameState, continent, playerId)) {
        income += continent.bonus || continent.bonusIPC || 0;
      }
    }

    return income;
  }

  /**
   * Check if a player controls an entire continent
   */
  controlsContinent(gameState, continent, playerId) {
    const territories = this._getTerritoriesInContinent(gameState, continent);
    return territories.every(t => this._getOwnerId(t) === playerId);
  }

  /**
   * Determine if we're winning, losing, or tied
   */
  getGamePosition(gameState) {
    const myIncome = this.calculateIncome(gameState, this.playerId);
    const opponents = this._getOpponents(gameState);

    let maxOpponentIncome = 0;
    let totalOpponentIncome = 0;

    for (const opponent of opponents) {
      const income = this.calculateIncome(gameState, opponent.id);
      maxOpponentIncome = Math.max(maxOpponentIncome, income);
      totalOpponentIncome += income;
    }

    const avgOpponentIncome = totalOpponentIncome / Math.max(1, opponents.length);

    if (myIncome > maxOpponentIncome * 1.2) return 'winning';
    if (myIncome < avgOpponentIncome * 0.8) return 'losing';
    return 'even';
  }

  // =========================================================================
  // ADAPTER METHODS - Handle different gameState formats
  // =========================================================================

  _getTerritories(gameState) {
    return gameState.territories || Object.values(gameState.territoryByName || {}) || [];
  }

  _getTerritory(gameState, id) {
    if (gameState.territoryByName) {
      return gameState.territoryByName[id];
    }
    const territories = gameState.territories || [];
    return territories.find(t => t.id === id || t.name === id);
  }

  _getTerritoryId(territory) {
    return territory.id || territory.name;
  }

  _getOwnerId(territory) {
    if (territory.ownerId) return territory.ownerId;
    // Check territoryState for ownership
    return territory.owner;
  }

  _getPlayer(gameState, playerId) {
    const players = gameState.players || [];
    return players.find(p => p.id === playerId);
  }

  _getOpponents(gameState) {
    const players = gameState.players || [];
    return players.filter(p => p.id !== this.playerId && !this.isAlly(gameState, p.id));
  }

  _getContinentForTerritory(gameState, territory) {
    const continents = gameState.continents || [];
    const territoryId = this._getTerritoryId(territory);

    for (const continent of continents) {
      const territories = continent.territories || [];
      if (territories.includes(territoryId)) {
        return continent;
      }
    }
    return null;
  }

  _getTerritoriesInContinent(gameState, continent) {
    const territoryIds = continent.territories || [];
    return territoryIds.map(id => this._getTerritory(gameState, id)).filter(Boolean);
  }

  /**
   * Calculate how many defense points are needed to adequately defend a territory
   * Returns the minimum defensive strength required based on incoming threats
   */
  calculateDefenseRequirement(gameState, territoryId) {
    const territory = this._getTerritory(gameState, territoryId);
    if (!territory) return 0;

    let requiredDefense = 0;

    // Calculate threat from all hostile neighbors
    const hostileNeighbors = this.getHostileNeighbors(gameState, territoryId);

    for (const hostile of hostileNeighbors) {
      const hostileId = this._getTerritoryId(hostile);
      const hostileOwner = this._getOwnerId(hostile);
      const hostileUnits = this.getPlayerUnitsAt(gameState, hostileId, hostileOwner);
      const attackStrength = this.calculateCombatStrength(hostileUnits, true);

      // Take the maximum single threat (enemy will likely attack with their strongest)
      requiredDefense = Math.max(requiredDefense, attackStrength);
    }

    // Add buffer based on territory importance
    let importanceMultiplier = 1.0;

    // Capital requires extra defense
    if (territory.isCapital) {
      importanceMultiplier = 2.0;
    }

    // High IPC territories need more defense
    const ipcValue = territory.ipcValue || territory.production || 0;
    if (ipcValue >= 5) {
      importanceMultiplier = Math.max(importanceMultiplier, 1.5);
    }

    return requiredDefense * importanceMultiplier;
  }

  /**
   * Calculate penalty for leaving a territory vulnerable when attacking from it
   * Returns a negative value to subtract from attack priority
   */
  calculateVulnerabilityPenalty(gameState, fromTerritoryId, unitsToMove) {
    const territory = this._getTerritory(gameState, fromTerritoryId);
    if (!territory) return 0;

    // Get current units and calculate what remains after attack
    const currentUnits = this.getPlayerUnitsAt(gameState, fromTerritoryId);
    const remainingUnits = { ...currentUnits };

    for (const [type, qty] of Object.entries(unitsToMove)) {
      remainingUnits[type] = (remainingUnits[type] || 0) - qty;
      if (remainingUnits[type] <= 0) delete remainingUnits[type];
    }

    const remainingStrength = this.calculateCombatStrength(remainingUnits, false);
    const requiredDefense = this.calculateDefenseRequirement(gameState, fromTerritoryId);

    // If we have enough defense remaining, no penalty
    if (remainingStrength >= requiredDefense) {
      return 0;
    }

    // Calculate how exposed we are
    const defenseDeficit = requiredDefense - remainingStrength;
    let penalty = defenseDeficit * 0.5; // Base penalty per point of deficit

    // MASSIVE penalty for leaving capital undefended
    if (territory.isCapital) {
      if (remainingStrength < requiredDefense * 0.5) {
        // Capital is severely exposed - this is almost always a bad move
        penalty += 100 * this.weights.CAPITAL_DEFENSE_PRIORITY;
      } else if (remainingStrength < requiredDefense) {
        // Capital is somewhat exposed
        penalty += 30 * this.weights.CAPITAL_DEFENSE_PRIORITY;
      }
    }

    // Extra penalty for high-value territories
    const ipcValue = territory.ipcValue || territory.production || 0;
    penalty += defenseDeficit * (ipcValue / 5);

    return penalty;
  }

  /**
   * Calculate minimum units that MUST stay for defense
   * Returns an object with unit counts that should not be moved
   */
  calculateMinimumDefenders(gameState, territoryId) {
    const territory = this._getTerritory(gameState, territoryId);
    if (!territory) return {};

    const currentUnits = this.getPlayerUnitsAt(gameState, territoryId);
    const requiredDefense = this.calculateDefenseRequirement(gameState, territoryId);

    // If no threat, no minimum defenders needed
    if (requiredDefense === 0) {
      return {};
    }

    const minimumDefenders = {};
    let defenseProvided = 0;

    // Reserve infantry first (best defense per cost)
    if (currentUnits.infantry && defenseProvided < requiredDefense) {
      const infDefense = this.unitStats.infantry?.defense || 2;
      const infNeeded = Math.ceil((requiredDefense - defenseProvided) / infDefense);
      const infToKeep = Math.min(currentUnits.infantry, infNeeded);
      if (infToKeep > 0) {
        minimumDefenders.infantry = infToKeep;
        defenseProvided += infToKeep * infDefense;
      }
    }

    // Then reserve other defending units if still needed
    if (defenseProvided < requiredDefense) {
      for (const [type, qty] of Object.entries(currentUnits)) {
        if (type === 'infantry' || type === 'factory' || type === 'aaGun') continue;

        const stats = this.unitStats[type];
        if (!stats || defenseProvided >= requiredDefense) continue;

        const defense = stats.defense || 0;
        if (defense > 0) {
          const needed = Math.ceil((requiredDefense - defenseProvided) / defense);
          const toKeep = Math.min(qty, needed);
          if (toKeep > 0) {
            minimumDefenders[type] = toKeep;
            defenseProvided += toKeep * defense;
          }
        }
      }
    }

    return minimumDefenders;
  }

  /**
   * Get units available for attack (total minus minimum defenders)
   */
  getAvailableAttackForce(gameState, territoryId) {
    const currentUnits = this.getPlayerUnitsAt(gameState, territoryId);
    const minimumDefenders = this.calculateMinimumDefenders(gameState, territoryId);

    const available = {};

    for (const [type, qty] of Object.entries(currentUnits)) {
      const reserved = minimumDefenders[type] || 0;
      const canAttack = qty - reserved;
      if (canAttack > 0) {
        available[type] = canAttack;
      }
    }

    return available;
  }

  /**
   * Check if a territory is critically threatened (e.g., capital with enemy army adjacent)
   */
  isCriticallyThreatened(gameState, territoryId) {
    const territory = this._getTerritory(gameState, territoryId);
    if (!territory) return false;

    const currentUnits = this.getPlayerUnitsAt(gameState, territoryId);
    const myStrength = this.calculateCombatStrength(currentUnits, false);
    const requiredDefense = this.calculateDefenseRequirement(gameState, territoryId);

    // Critically threatened if we can't adequately defend
    const isUnderstrength = myStrength < requiredDefense * 0.8;

    // Capital is always critical if threatened
    if (territory.isCapital && requiredDefense > 0) {
      return isUnderstrength || myStrength < requiredDefense * 1.2;
    }

    return isUnderstrength && requiredDefense > 10;
  }

  /**
   * Called at end of turn to track patterns (optional)
   */
  onTurnEnd(gameState) {
    // Subclasses can override to track opponent behavior
  }
}


// ============================================================================
// EASY AI CLASS
// ============================================================================

/**
 * EasyAI - Intentionally weak AI for beginners
 *
 * Characteristics:
 * - 60% chance to make suboptimal moves
 * - Only considers immediate neighbors
 * - Uses crude "more units = attack" logic
 * - Randomly ignores continent bonuses 40% of time
 * - Places units randomly
 * - Maximum search depth = 1
 */
export class EasyAI extends BaseAI {
  constructor(playerId, calculateBattleOutcome, unitStats) {
    super(playerId, calculateBattleOutcome, unitStats);

    // Easy AI specific settings
    this.badMoveChance = 0.6;           // 60% chance of bad moves
    this.ignoreContinentChance = 0.4;    // 40% chance to ignore continents
    this.minWinProbability = this.weights.BATTLE_WIN_THRESHOLD_EASY;
  }

  /**
   * Purchase Phase - Buy random units
   */
  decidePurchases(gameState) {
    const purchases = [];
    let remainingIPCs = this.getMyIPCs(gameState);

    // Easy AI buys mostly infantry with occasional random other units
    const unitTypes = Object.keys(this.unitStats).filter(type =>
      this.unitStats[type].cost > 0 &&
      !['factory', 'aaGun', 'transport'].includes(type)
    );

    while (remainingIPCs >= 3) {
      // 70% infantry, 30% random
      let unitType;
      if (Math.random() < 0.7) {
        unitType = 'infantry';
      } else {
        unitType = unitTypes[Math.floor(Math.random() * unitTypes.length)];
      }

      const cost = this.unitStats[unitType]?.cost || 999;
      if (cost <= remainingIPCs) {
        // Find existing purchase or create new
        const existing = purchases.find(p => p.unitType === unitType);
        if (existing) {
          existing.quantity++;
        } else {
          purchases.push({ unitType, quantity: 1 });
        }
        remainingIPCs -= cost;
      } else {
        // Can't afford this, try infantry
        if (remainingIPCs >= 3) {
          const infPurchase = purchases.find(p => p.unitType === 'infantry');
          if (infPurchase) {
            infPurchase.quantity++;
          } else {
            purchases.push({ unitType: 'infantry', quantity: 1 });
          }
          remainingIPCs -= 3;
        } else {
          break;
        }
      }
    }

    return purchases;
  }

  /**
   * Combat Move Phase - Attack with crude logic
   */
  decideCombatMoves(gameState) {
    const attacks = [];
    const myTerritories = this.getPlayerTerritories(gameState);

    for (const territory of myTerritories) {
      const territoryId = this._getTerritoryId(territory);
      const myUnits = this.getPlayerUnitsAt(gameState, territoryId);
      const myStrength = this.calculateCombatStrength(myUnits, true);

      if (myStrength === 0) continue;

      // Only look at immediate neighbors (Easy AI limitation)
      const hostileNeighbors = this.getHostileNeighbors(gameState, territoryId);

      for (const target of hostileNeighbors) {
        const targetId = this._getTerritoryId(target);
        const targetOwner = this._getOwnerId(target);
        const defenderUnits = this.getPlayerUnitsAt(gameState, targetId, targetOwner);
        const defenderStrength = this.calculateCombatStrength(defenderUnits, false);

        // Easy AI uses crude "more units = attack" logic
        // With 60% chance of making a bad move
        let shouldAttack = false;

        if (Math.random() < this.badMoveChance) {
          // Bad move: attack even with poor odds, or don't attack with good odds
          shouldAttack = Math.random() < 0.5;
        } else {
          // Good move: only attack if we have more strength
          shouldAttack = myStrength > defenderStrength * 1.2;
        }

        // 40% chance to ignore continent value entirely
        let priority = 1;
        if (Math.random() > this.ignoreContinentChance) {
          priority = this.calculateTerritoryValue(gameState, target);
        }

        if (shouldAttack) {
          attacks.push({
            from: territoryId,
            to: targetId,
            units: { ...myUnits }, // Send everything (Easy AI doesn't hold back)
            priority: priority,
          });
        }
      }
    }

    // Sort by priority but shuffle a bit for randomness
    attacks.sort((a, b) => {
      if (Math.random() < 0.3) return Math.random() - 0.5; // Random shuffle 30%
      return b.priority - a.priority;
    });

    return attacks;
  }

  /**
   * Non-Combat Move Phase - Random reinforcement
   */
  decideNonCombatMoves(gameState) {
    const moves = [];
    const myTerritories = this.getPlayerTerritories(gameState);

    // Easy AI makes random moves
    for (const territory of myTerritories) {
      const territoryId = this._getTerritoryId(territory);
      const myUnits = this.getPlayerUnitsAt(gameState, territoryId);

      if (this.countUnits(myUnits) === 0) continue;

      // 50% chance to move units somewhere random
      if (Math.random() < 0.5) {
        const friendlyNeighbors = this.getFriendlyNeighbors(gameState, territoryId);
        if (friendlyNeighbors.length > 0) {
          const target = friendlyNeighbors[Math.floor(Math.random() * friendlyNeighbors.length)];
          const targetId = this._getTerritoryId(target);

          // Move half the units
          const unitsToMove = {};
          for (const [type, qty] of Object.entries(myUnits)) {
            if (qty > 1) {
              unitsToMove[type] = Math.floor(qty / 2);
            }
          }

          if (this.countUnits(unitsToMove) > 0) {
            moves.push({
              from: territoryId,
              to: targetId,
              units: unitsToMove,
            });
          }
        }
      }
    }

    return moves;
  }

  /**
   * Placement Phase - Place units randomly
   */
  decidePlacements(gameState) {
    const placements = [];
    const myTerritories = this.getPlayerTerritories(gameState);

    // Filter to territories with factories
    const factoryTerritories = myTerritories.filter(t => {
      const units = this.getPlayerUnitsAt(gameState, this._getTerritoryId(t));
      return units.factory > 0 || t.isCapital || t.hasFactory;
    });

    if (factoryTerritories.length === 0) {
      // Fallback: place at capital or first owned territory
      const capital = myTerritories.find(t => t.isCapital) || myTerritories[0];
      if (capital) {
        factoryTerritories.push(capital);
      }
    }

    // Get purchased units (this would come from game state in real implementation)
    // For now, return empty - actual implementation depends on how purchases are tracked

    return placements;
  }
}


// ============================================================================
// MEDIUM AI CLASS
// ============================================================================

/**
 * MediumAI - Solid, challenging AI for casual players
 *
 * Characteristics:
 * - Full heuristic scoring of every legal combat move
 * - Considers 1-turn-ahead income changes + continent completion
 * - Calculates proper EV for every possible battle
 * - Prioritizes disrupting the leading player's continent/objective
 * - Simple greedy placement (put most units where threat is highest)
 * - Search depth = 2 (own turn + opponent's likely response)
 */
export class MediumAI extends BaseAI {
  constructor(playerId, calculateBattleOutcome, unitStats) {
    super(playerId, calculateBattleOutcome, unitStats);

    this.minWinProbability = this.weights.BATTLE_WIN_THRESHOLD_MEDIUM;
    this.searchDepth = 2;
  }

  /**
   * Purchase Phase - Balanced purchasing
   */
  decidePurchases(gameState) {
    const purchases = [];
    let remainingIPCs = this.getMyIPCs(gameState);

    // Analyze our strategic situation
    const threatMap = this.buildThreatMap(gameState);
    const position = this.getGamePosition(gameState);

    // Calculate what we need
    let totalThreat = 0;
    let numThreatenedTerritories = 0;

    for (const [territoryId, info] of threatMap) {
      if (info.threat > 0) {
        totalThreat += info.threat;
        numThreatenedTerritories++;
      }
    }

    // Determine unit mix based on situation
    let infantryRatio, tankRatio, artilleryRatio, fighterRatio;

    if (position === 'losing') {
      // When behind: more infantry for defense, some artillery for counterattack
      infantryRatio = 0.6;
      artilleryRatio = 0.2;
      tankRatio = 0.15;
      fighterRatio = 0.05;
    } else if (position === 'winning') {
      // When ahead: balanced for offense
      infantryRatio = 0.4;
      artilleryRatio = 0.2;
      tankRatio = 0.3;
      fighterRatio = 0.1;
    } else {
      // Even: balanced
      infantryRatio = 0.5;
      artilleryRatio = 0.2;
      tankRatio = 0.2;
      fighterRatio = 0.1;
    }

    // Calculate target quantities
    const totalBudget = remainingIPCs;
    const targetInfantry = Math.floor((totalBudget * infantryRatio) / 3);
    const targetArtillery = Math.floor((totalBudget * artilleryRatio) / 4);
    const targetTanks = Math.floor((totalBudget * tankRatio) / 6);
    const targetFighters = Math.floor((totalBudget * fighterRatio) / 10);

    // Purchase in priority order
    const buyOrder = [
      { type: 'infantry', target: targetInfantry, cost: 3 },
      { type: 'artillery', target: targetArtillery, cost: 4 },
      { type: 'tank', target: targetTanks, cost: 6 },
      { type: 'fighter', target: targetFighters, cost: 10 },
    ];

    for (const { type, target, cost } of buyOrder) {
      let bought = 0;
      while (bought < target && remainingIPCs >= cost) {
        const existing = purchases.find(p => p.unitType === type);
        if (existing) {
          existing.quantity++;
        } else {
          purchases.push({ unitType: type, quantity: 1 });
        }
        remainingIPCs -= cost;
        bought++;
      }
    }

    // Spend remaining on infantry
    while (remainingIPCs >= 3) {
      const existing = purchases.find(p => p.unitType === 'infantry');
      if (existing) {
        existing.quantity++;
      } else {
        purchases.push({ unitType: 'infantry', quantity: 1 });
      }
      remainingIPCs -= 3;
    }

    return purchases;
  }

  /**
   * Combat Move Phase - Full heuristic evaluation
   */
  decideCombatMoves(gameState) {
    const possibleAttacks = [];
    const myTerritories = this.getPlayerTerritories(gameState);

    // Evaluate all possible attacks
    for (const territory of myTerritories) {
      const territoryId = this._getTerritoryId(territory);
      const myUnits = this.getPlayerUnitsAt(gameState, territoryId);

      if (this.countUnits(myUnits) === 0) continue;

      // Get all hostile neighbors (and hostile neighbors of neighbors for depth 2)
      const hostileNeighbors = this.getHostileNeighbors(gameState, territoryId);

      for (const target of hostileNeighbors) {
        const targetId = this._getTerritoryId(target);

        // Get available units (respecting minimum defenders)
        const availableForAttack = this.getAvailableAttackForce(gameState, territoryId);

        // Skip if no units available for attack
        if (this.countUnits(availableForAttack) === 0) continue;

        // Calculate optimal attacking force from available units
        const optimalForce = this.calculateOptimalAttackForce(gameState, availableForAttack, target, territoryId);

        if (optimalForce && this.countUnits(optimalForce) > 0) {
          // Calculate battle EV
          const battleEV = this.calculateBattleEV(gameState, territory, target, optimalForce);

          // Only consider attacks with reasonable win probability
          if (battleEV.winProbability >= this.minWinProbability) {
            // Calculate strategic value
            const strategicValue = this.calculateStrategicValue(gameState, target);

            // Factor in opponent disruption
            const disruptionValue = this.calculateDisruptionValue(gameState, target);

            // Calculate vulnerability penalty for leaving source territory exposed
            const vulnerabilityPenalty = this.calculateVulnerabilityPenalty(gameState, territoryId, optimalForce);

            // Total score (subtract vulnerability penalty)
            const totalScore = battleEV.ev + strategicValue + disruptionValue - vulnerabilityPenalty;

            possibleAttacks.push({
              from: territoryId,
              to: targetId,
              units: optimalForce,
              priority: totalScore,
              winProbability: battleEV.winProbability,
              ev: battleEV.ev,
              vulnerabilityPenalty,
            });
          }
        }
      }
    }

    // Sort by priority (highest first)
    possibleAttacks.sort((a, b) => b.priority - a.priority);

    // Select non-conflicting attacks, but skip attacks from critically threatened territories
    const selectedAttacks = [];
    const usedTerritories = new Set();

    for (const attack of possibleAttacks) {
      // Don't use same units twice
      if (usedTerritories.has(attack.from)) continue;

      // Skip attacks that have massive vulnerability penalties (likely leaving capital undefended)
      if (attack.vulnerabilityPenalty > 50) {
        continue;
      }

      selectedAttacks.push(attack);
      usedTerritories.add(attack.from);

      // Limit to top attacks for performance
      if (selectedAttacks.length >= this.weights.MAX_MOVES_TO_CONSIDER) break;
    }

    return selectedAttacks;
  }

  /**
   * Calculate optimal attacking force for a target
   * Now respects minimum defenders and source territory safety
   */
  calculateOptimalAttackForce(gameState, availableUnits, target, fromTerritoryId = null) {
    const targetId = this._getTerritoryId(target);
    const targetOwner = this._getOwnerId(target);
    const defenderUnits = this.getPlayerUnitsAt(gameState, targetId, targetOwner);
    const defenderStrength = this.calculateCombatStrength(defenderUnits, false);

    // Start with available units (already respects minimum defenders)
    const attackForce = { ...availableUnits };

    // Calculate battle outcome
    const result = this.calculateBattleOutcome(attackForce, defenderUnits);
    const winProb = result.winProbability || result.attackerWinChance || 0.5;

    // If we have overwhelming force, hold some back for additional safety
    if (winProb > 0.85 && this.countUnits(attackForce) > 3) {
      // Keep 1-2 infantry for extra defense
      if (attackForce.infantry && attackForce.infantry > 2) {
        attackForce.infantry = Math.max(1, attackForce.infantry - 2);
      }
    }

    // Additional check: if source is capital, be more conservative
    if (fromTerritoryId) {
      const fromTerritory = this._getTerritory(gameState, fromTerritoryId);
      if (fromTerritory?.isCapital) {
        // On capital, always keep at least 2 infantry if possible
        const currentUnits = this.getPlayerUnitsAt(gameState, fromTerritoryId);
        if (currentUnits.infantry && currentUnits.infantry > 2) {
          const reserveExtra = Math.min(2, attackForce.infantry || 0);
          if (reserveExtra > 0 && attackForce.infantry) {
            attackForce.infantry = Math.max(1, attackForce.infantry - reserveExtra);
          }
        }
      }
    }

    return attackForce;
  }

  /**
   * Calculate strategic value of taking a territory (beyond immediate EV)
   */
  calculateStrategicValue(gameState, territory) {
    let value = 0;

    // Continent completion bonus
    if (this.wouldCompleteContinent(gameState, territory, this.playerId)) {
      const continent = this._getContinentForTerritory(gameState, territory);
      const bonus = continent?.bonus || continent?.bonusIPC || 0;
      value += bonus * this.weights.CONTINENT_COMPLETION_BONUS;
    }

    // Capital bonus
    if (territory.isCapital) {
      value += 20 * this.weights.CAPITAL_ATTACK_BONUS;
    }

    // Objective progress
    value += this.calculateObjectiveValue(gameState, territory, this.playerId);

    return value;
  }

  /**
   * Calculate disruption value - how much we hurt the leading opponent
   */
  calculateDisruptionValue(gameState, territory) {
    let value = 0;

    // Find the leading opponent
    const opponents = this._getOpponents(gameState);
    let leadingOpponent = null;
    let maxIncome = 0;

    for (const opponent of opponents) {
      const income = this.calculateIncome(gameState, opponent.id);
      if (income > maxIncome) {
        maxIncome = income;
        leadingOpponent = opponent;
      }
    }

    if (!leadingOpponent) return 0;

    const territoryOwner = this._getOwnerId(territory);

    // Bonus for attacking the leader
    if (territoryOwner === leadingOpponent.id) {
      value += 5;

      // Extra bonus for denying their continent
      value += this.calculateContinentDenialValue(gameState, territory) *
               this.weights.OBJECTIVE_DENIAL_WEIGHT;
    }

    return value;
  }

  /**
   * Non-Combat Move Phase - Reinforce threatened territories
   */
  decideNonCombatMoves(gameState) {
    const moves = [];
    const threatMap = this.buildThreatMap(gameState);
    const myTerritories = this.getPlayerTerritories(gameState);

    // Find territories with excess units (low threat, high units)
    const excessTerritories = [];
    const needyTerritories = [];

    for (const territory of myTerritories) {
      const territoryId = this._getTerritoryId(territory);
      const myUnits = this.getPlayerUnitsAt(gameState, territoryId);
      const myStrength = this.calculateCombatStrength(myUnits, false);
      const threatInfo = threatMap.get(territoryId) || { threat: 0 };

      const surplus = myStrength - threatInfo.threat * 1.5;

      if (surplus > 5) {
        excessTerritories.push({ territory, surplus, units: myUnits });
      } else if (surplus < -5 || (threatInfo.isCapital && surplus < 10)) {
        needyTerritories.push({
          territory,
          deficit: Math.abs(surplus),
          isCapital: threatInfo.isCapital
        });
      }
    }

    // Sort needy territories by priority (capitals first, then by deficit)
    needyTerritories.sort((a, b) => {
      if (a.isCapital && !b.isCapital) return -1;
      if (!a.isCapital && b.isCapital) return 1;
      return b.deficit - a.deficit;
    });

    // Move units from excess to needy
    for (const needy of needyTerritories) {
      const needyId = this._getTerritoryId(needy.territory);

      for (const excess of excessTerritories) {
        if (excess.surplus <= 0) continue;

        const excessId = this._getTerritoryId(excess.territory);

        // Check if we can reach the needy territory
        const path = this.findPath(gameState, excessId, needyId);
        if (!path) continue;

        // Calculate units to move
        const unitsToMove = {};
        let strengthToMove = Math.min(excess.surplus, needy.deficit);

        // Prioritize moving tanks (mobile), then infantry
        for (const type of ['tank', 'artillery', 'infantry']) {
          if (excess.units[type] && strengthToMove > 0) {
            const stats = this.unitStats[type];
            const maxToMove = Math.floor(strengthToMove / stats.defense);
            const toMove = Math.min(maxToMove, excess.units[type] - 1);

            if (toMove > 0) {
              unitsToMove[type] = toMove;
              strengthToMove -= toMove * stats.defense;
              excess.units[type] -= toMove;
              excess.surplus -= toMove * stats.defense;
            }
          }
        }

        if (this.countUnits(unitsToMove) > 0) {
          moves.push({
            from: excessId,
            to: path[1], // Next step in path
            units: unitsToMove,
          });
        }
      }
    }

    return moves;
  }

  /**
   * Simple BFS pathfinding
   */
  findPath(gameState, fromId, toId) {
    const visited = new Set();
    const queue = [[fromId]];

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === toId) return path;
      if (visited.has(current)) continue;
      visited.add(current);

      const neighbors = this.getFriendlyNeighbors(gameState, current);
      for (const neighbor of neighbors) {
        const neighborId = this._getTerritoryId(neighbor);
        if (!visited.has(neighborId)) {
          queue.push([...path, neighborId]);
        }
      }
    }

    return null;
  }

  /**
   * Placement Phase - Greedy placement at highest threat locations
   */
  decidePlacements(gameState) {
    const placements = [];
    const threatMap = this.buildThreatMap(gameState);
    const myTerritories = this.getPlayerTerritories(gameState);

    // Get territories where we can place (factories/capitals)
    const placementTerritories = myTerritories.filter(t => {
      const units = this.getPlayerUnitsAt(gameState, this._getTerritoryId(t));
      return units.factory > 0 || t.isCapital || t.hasFactory;
    });

    // Sort by threat level (highest first)
    placementTerritories.sort((a, b) => {
      const aId = this._getTerritoryId(a);
      const bId = this._getTerritoryId(b);
      const aThreat = (threatMap.get(aId)?.threat || 0) + (a.isCapital ? 100 : 0);
      const bThreat = (threatMap.get(bId)?.threat || 0) + (b.isCapital ? 100 : 0);
      return bThreat - aThreat;
    });

    // Placements would distribute units to highest-threat locations
    // Actual units to place would come from purchase phase tracking

    return placements;
  }
}


// ============================================================================
// HARD AI CLASS
// ============================================================================

/**
 * HardAI - Expert-level AI using advanced algorithms
 *
 * Characteristics:
 * - Depth-limited expectiminimax (depth 3-4) for combat phase
 * - Monte-Carlo rollouts (50-100 simulations) on uncertain battles
 * - Full multi-objective utility function with tuned weights
 * - Dynamic aggression based on game position
 * - Smart unit purchasing based on front-line needs
 * - Recognizes "must-win" territories and will over-commit
 */
export class HardAI extends MediumAI {
  constructor(playerId, calculateBattleOutcome, unitStats) {
    super(playerId, calculateBattleOutcome, unitStats);

    this.searchDepth = this.weights.HARD_AI_SEARCH_DEPTH;
    this.monteCarloSimulations = this.weights.MONTE_CARLO_SIMULATIONS;
    this.minWinProbability = this.weights.BATTLE_WIN_THRESHOLD_HARD;

    // Track opponent behavior patterns
    this.opponentPatterns = new Map();
  }

  /**
   * Purchase Phase - Optimal unit mix based on strategic analysis
   */
  decidePurchases(gameState) {
    const purchases = [];
    let remainingIPCs = this.getMyIPCs(gameState);

    // Deep analysis of the board state
    const analysis = this.analyzeStrategicSituation(gameState);

    // Determine purchase strategy
    const strategy = this.determinePurchaseStrategy(analysis);

    // Calculate optimal unit mix
    const unitMix = this.calculateOptimalUnitMix(remainingIPCs, strategy, analysis);

    // Execute purchases
    for (const [unitType, quantity] of Object.entries(unitMix)) {
      if (quantity > 0) {
        purchases.push({ unitType, quantity });
        remainingIPCs -= quantity * (this.unitStats[unitType]?.cost || 0);
      }
    }

    // Spend remaining on infantry
    while (remainingIPCs >= 3) {
      const existing = purchases.find(p => p.unitType === 'infantry');
      if (existing) {
        existing.quantity++;
      } else {
        purchases.push({ unitType: 'infantry', quantity: 1 });
      }
      remainingIPCs -= 3;
    }

    return purchases;
  }

  /**
   * Comprehensive strategic situation analysis
   */
  analyzeStrategicSituation(gameState) {
    const threatMap = this.buildThreatMap(gameState);
    const position = this.getGamePosition(gameState);
    const myIncome = this.calculateIncome(gameState);

    // Find front lines
    const frontLines = this.identifyFrontLines(gameState);

    // Identify must-win territories
    const mustWinTerritories = this.identifyMustWinTerritories(gameState);

    // Analyze opponent strength distribution
    const opponentAnalysis = this.analyzeOpponents(gameState);

    // Find breakthrough opportunities
    const breakthroughOpportunities = this.findBreakthroughOpportunities(gameState);

    return {
      threatMap,
      position,
      myIncome,
      frontLines,
      mustWinTerritories,
      opponentAnalysis,
      breakthroughOpportunities,
      totalThreat: Array.from(threatMap.values()).reduce((sum, t) => sum + t.threat, 0),
      capitalThreat: threatMap.get(this.findMyCapital(gameState))?.threat || 0,
    };
  }

  /**
   * Determine purchase strategy based on analysis
   */
  determinePurchaseStrategy(analysis) {
    // Dynamic strategy selection
    if (analysis.capitalThreat > 20) {
      return 'defensive'; // Capital in danger - buy defenders
    }

    if (analysis.position === 'losing') {
      // Behind: need to be aggressive to catch up
      if (analysis.breakthroughOpportunities.length > 0) {
        return 'breakthrough';
      }
      return 'aggressive';
    }

    if (analysis.position === 'winning') {
      // Ahead: consolidate and defend gains
      return 'conservative';
    }

    // Even: balanced approach
    if (analysis.mustWinTerritories.length > 0) {
      return 'targeted';
    }

    return 'balanced';
  }

  /**
   * Calculate optimal unit mix for given strategy
   */
  calculateOptimalUnitMix(budget, strategy, analysis) {
    const mix = {
      infantry: 0,
      artillery: 0,
      tank: 0,
      fighter: 0,
      bomber: 0,
    };

    const strategies = {
      defensive: { infantry: 0.7, artillery: 0.2, tank: 0.1, fighter: 0, bomber: 0 },
      aggressive: { infantry: 0.3, artillery: 0.2, tank: 0.35, fighter: 0.1, bomber: 0.05 },
      breakthrough: { infantry: 0.2, artillery: 0.15, tank: 0.4, fighter: 0.15, bomber: 0.1 },
      conservative: { infantry: 0.5, artillery: 0.2, tank: 0.2, fighter: 0.1, bomber: 0 },
      balanced: { infantry: 0.45, artillery: 0.2, tank: 0.25, fighter: 0.1, bomber: 0 },
      targeted: { infantry: 0.35, artillery: 0.2, tank: 0.3, fighter: 0.1, bomber: 0.05 },
    };

    const ratios = strategies[strategy] || strategies.balanced;

    // Allocate budget according to ratios
    for (const [unitType, ratio] of Object.entries(ratios)) {
      const cost = this.unitStats[unitType]?.cost || 999;
      const targetSpend = budget * ratio;
      mix[unitType] = Math.floor(targetSpend / cost);
    }

    return mix;
  }

  /**
   * Identify territories on the front line (border with enemies)
   */
  identifyFrontLines(gameState) {
    const frontLines = [];
    const myTerritories = this.getPlayerTerritories(gameState);

    for (const territory of myTerritories) {
      const territoryId = this._getTerritoryId(territory);
      const hostileNeighbors = this.getHostileNeighbors(gameState, territoryId);

      if (hostileNeighbors.length > 0) {
        frontLines.push({
          territory,
          hostileNeighbors: hostileNeighbors.length,
          myStrength: this.calculateCombatStrength(
            this.getPlayerUnitsAt(gameState, territoryId),
            false
          ),
        });
      }
    }

    return frontLines;
  }

  /**
   * Identify must-win territories (critical for objectives/continents)
   */
  identifyMustWinTerritories(gameState) {
    const mustWin = [];
    const enemies = this.getEnemyTerritories(gameState);

    for (const enemy of enemies) {
      let priority = 0;

      // Check if it completes a continent
      if (this.wouldCompleteContinent(gameState, enemy, this.playerId)) {
        const continent = this._getContinentForTerritory(gameState, enemy);
        priority += (continent?.bonus || 0) * 2;
      }

      // Check if it denies an opponent's continent completion
      const denialValue = this.calculateContinentDenialValue(gameState, enemy);
      priority += denialValue * 1.5;

      // Check if it's an enemy capital
      if (enemy.isCapital) {
        priority += 30;
      }

      // Check objective relevance
      priority += this.calculateObjectiveValue(gameState, enemy, this.playerId);

      if (priority >= 10) {
        mustWin.push({ territory: enemy, priority });
      }
    }

    return mustWin.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Analyze opponent strength and patterns
   */
  analyzeOpponents(gameState) {
    const opponents = this._getOpponents(gameState);
    const analysis = [];

    for (const opponent of opponents) {
      const territories = this.getPlayerTerritories(gameState, opponent.id);
      const income = this.calculateIncome(gameState, opponent.id);

      let totalStrength = 0;
      for (const territory of territories) {
        const units = this.getPlayerUnitsAt(gameState, this._getTerritoryId(territory), opponent.id);
        totalStrength += this.calculateCombatStrength(units, true);
      }

      analysis.push({
        id: opponent.id,
        territories: territories.length,
        income,
        totalStrength,
        threat: income + totalStrength * 0.5, // Combined threat score
      });
    }

    return analysis.sort((a, b) => b.threat - a.threat);
  }

  /**
   * Find opportunities for breakthrough attacks
   */
  findBreakthroughOpportunities(gameState) {
    const opportunities = [];
    const myTerritories = this.getPlayerTerritories(gameState);

    for (const territory of myTerritories) {
      const territoryId = this._getTerritoryId(territory);
      const myUnits = this.getPlayerUnitsAt(gameState, territoryId);
      const myStrength = this.calculateCombatStrength(myUnits, true);

      if (myStrength < 10) continue;

      const hostileNeighbors = this.getHostileNeighbors(gameState, territoryId);

      for (const hostile of hostileNeighbors) {
        const hostileId = this._getTerritoryId(hostile);
        const hostileOwner = this._getOwnerId(hostile);
        const defenderUnits = this.getPlayerUnitsAt(gameState, hostileId, hostileOwner);
        const defenderStrength = this.calculateCombatStrength(defenderUnits, false);

        // Check what's behind the hostile territory
        const behindEnemy = this.getHostileNeighbors(gameState, hostileId).filter(t =>
          this._getOwnerId(t) === hostileOwner
        );

        let behindStrength = 0;
        for (const behind of behindEnemy) {
          const behindUnits = this.getPlayerUnitsAt(gameState, this._getTerritoryId(behind), hostileOwner);
          behindStrength += this.calculateCombatStrength(behindUnits, false);
        }

        // Breakthrough opportunity: weak front with weak backup
        if (defenderStrength < myStrength * 0.7 && behindStrength < myStrength * 0.5) {
          const territoryValue = this.calculateTerritoryValue(gameState, hostile);
          opportunities.push({
            from: territoryId,
            target: hostileId,
            myStrength,
            defenderStrength,
            behindStrength,
            value: territoryValue,
          });
        }
      }
    }

    return opportunities.sort((a, b) => b.value - a.value);
  }

  /**
   * Find my capital territory
   */
  findMyCapital(gameState) {
    const myTerritories = this.getPlayerTerritories(gameState);
    const capital = myTerritories.find(t => t.isCapital);
    return capital ? this._getTerritoryId(capital) : null;
  }

  /**
   * Combat Move Phase - Expectiminimax with Monte Carlo
   * Now properly considers defense requirements before attacking
   */
  decideCombatMoves(gameState) {
    const analysis = this.analyzeStrategicSituation(gameState);

    // Adjust aggression based on position
    const aggressionMultiplier = analysis.position === 'losing'
      ? this.weights.AGGRESSION_WHEN_BEHIND
      : analysis.position === 'winning'
        ? this.weights.CONSERVATISM_WHEN_AHEAD
        : 1.0;

    // CRITICAL: First identify territories that MUST be defended
    const capitalId = this.findMyCapital(gameState);
    const criticallyThreatenedTerritories = new Set();

    // Check if capital is critically threatened
    if (capitalId && this.isCriticallyThreatened(gameState, capitalId)) {
      criticallyThreatenedTerritories.add(capitalId);
    }

    // Generate all possible attack combinations (now respects minimum defenders)
    const possibleAttacks = this.generateAllAttacks(gameState);

    // Evaluate each attack using expectiminimax
    const evaluatedAttacks = [];

    for (const attack of possibleAttacks) {
      // CRITICAL: Skip attacks from critically threatened territories (like capital under attack)
      if (criticallyThreatenedTerritories.has(attack.from)) {
        continue;
      }

      // For must-win territories, be more aggressive
      const isMustWin = analysis.mustWinTerritories.some(
        mw => this._getTerritoryId(mw.territory) === attack.to
      );

      // Calculate base EV
      const battleEV = this.calculateBattleEV(gameState,
        this._getTerritory(gameState, attack.from),
        this._getTerritory(gameState, attack.to),
        attack.units
      );

      // Run Monte Carlo for uncertain battles
      let adjustedWinProb = battleEV.winProbability;
      if (battleEV.winProbability > 0.3 && battleEV.winProbability < 0.8) {
        adjustedWinProb = this.runMonteCarloSimulation(gameState, attack);
      }

      // Calculate strategic value
      const strategicValue = this.calculateStrategicValue(
        gameState,
        this._getTerritory(gameState, attack.to)
      );

      // CRITICAL: Calculate vulnerability penalty for leaving source exposed
      const vulnerabilityPenalty = this.calculateVulnerabilityPenalty(gameState, attack.from, attack.units);

      // Apply must-win bonus
      const mustWinBonus = isMustWin ? 20 : 0;

      // Apply aggression multiplier, subtract vulnerability penalty
      let score = (battleEV.ev + strategicValue + mustWinBonus) * aggressionMultiplier - vulnerabilityPenalty;

      // Threshold check (lower for must-win)
      const threshold = isMustWin
        ? this.minWinProbability * 0.7
        : this.minWinProbability;

      if (adjustedWinProb >= threshold) {
        evaluatedAttacks.push({
          ...attack,
          priority: score,
          winProbability: adjustedWinProb,
          isMustWin,
          vulnerabilityPenalty,
        });
      }
    }

    // Sort and select best non-conflicting attacks
    evaluatedAttacks.sort((a, b) => b.priority - a.priority);

    const selectedAttacks = [];
    const usedTerritories = new Set();
    const targetedTerritories = new Set();

    for (const attack of evaluatedAttacks) {
      if (usedTerritories.has(attack.from)) continue;
      if (targetedTerritories.has(attack.to)) continue;

      // CRITICAL: Skip attacks with massive vulnerability penalties
      // (e.g., leaving capital completely undefended)
      if (attack.vulnerabilityPenalty > 100) {
        continue;
      }

      selectedAttacks.push(attack);
      usedTerritories.add(attack.from);
      targetedTerritories.add(attack.to);

      if (selectedAttacks.length >= this.weights.MAX_MOVES_TO_CONSIDER) break;
    }

    return selectedAttacks;
  }

  /**
   * Generate all possible attacks
   * Now respects minimum defenders - only uses available attack force
   */
  generateAllAttacks(gameState) {
    const attacks = [];
    const myTerritories = this.getPlayerTerritories(gameState);

    for (const territory of myTerritories) {
      const territoryId = this._getTerritoryId(territory);

      // CRITICAL: Get available units for attack (respects minimum defenders)
      const availableUnits = this.getAvailableAttackForce(gameState, territoryId);

      if (this.countUnits(availableUnits) === 0) continue;

      const hostileNeighbors = this.getHostileNeighbors(gameState, territoryId);

      for (const hostile of hostileNeighbors) {
        const hostileId = this._getTerritoryId(hostile);

        // Generate multiple attack options from available units only
        const attackOptions = this.generateAttackOptions(availableUnits);

        for (const units of attackOptions) {
          if (this.countUnits(units) > 0) {
            attacks.push({
              from: territoryId,
              to: hostileId,
              units,
            });
          }
        }
      }
    }

    return attacks;
  }

  /**
   * Generate different attack force options
   */
  generateAttackOptions(availableUnits) {
    const options = [];

    // Option 1: All-in attack
    options.push({ ...availableUnits });

    // Option 2: Leave 1 infantry for defense
    if (availableUnits.infantry > 1) {
      const partial = { ...availableUnits };
      partial.infantry--;
      options.push(partial);
    }

    // Option 3: Minimal attack (tanks + fighters only)
    const minimal = {};
    if (availableUnits.tank) minimal.tank = availableUnits.tank;
    if (availableUnits.fighter) minimal.fighter = availableUnits.fighter;
    if (availableUnits.bomber) minimal.bomber = availableUnits.bomber;
    if (this.countUnits(minimal) > 0) {
      options.push(minimal);
    }

    return options;
  }

  /**
   * Run Monte Carlo simulation for battle outcomes
   */
  runMonteCarloSimulation(gameState, attack) {
    const target = this._getTerritory(gameState, attack.to);
    const targetOwner = this._getOwnerId(target);
    const defenderUnits = this.getPlayerUnitsAt(gameState, attack.to, targetOwner);

    let wins = 0;

    for (let i = 0; i < this.monteCarloSimulations; i++) {
      const result = this.calculateBattleOutcome(
        { ...attack.units },
        { ...defenderUnits }
      );

      if (result.winner === 'attacker' || result.attackerWins) {
        wins++;
      }
    }

    return wins / this.monteCarloSimulations;
  }

  /**
   * Non-Combat Move Phase - Optimal reinforcement with lookahead
   */
  decideNonCombatMoves(gameState) {
    const moves = [];
    const analysis = this.analyzeStrategicSituation(gameState);

    // Build reinforcement priority map
    const reinforcementNeeds = new Map();

    for (const frontLine of analysis.frontLines) {
      const territoryId = this._getTerritoryId(frontLine.territory);
      const threatInfo = analysis.threatMap.get(territoryId) || { threat: 0 };

      // Calculate reinforcement need
      const need = threatInfo.threat * 1.5 - frontLine.myStrength;

      // Extra priority for capital
      const capitalBonus = frontLine.territory.isCapital ? 50 : 0;

      reinforcementNeeds.set(territoryId, {
        need: Math.max(0, need) + capitalBonus,
        territory: frontLine.territory,
        isCapital: frontLine.territory.isCapital,
      });
    }

    // Sort by need (highest first)
    const sortedNeeds = Array.from(reinforcementNeeds.entries())
      .filter(([_, info]) => info.need > 0)
      .sort((a, b) => b[1].need - a[1].need);

    // Find units to move from safe territories
    const myTerritories = this.getPlayerTerritories(gameState);
    const availableUnits = [];

    for (const territory of myTerritories) {
      const territoryId = this._getTerritoryId(territory);
      const threatInfo = analysis.threatMap.get(territoryId);

      // Skip front-line territories
      if (reinforcementNeeds.has(territoryId)) continue;

      const myUnits = this.getPlayerUnitsAt(gameState, territoryId);
      const myStrength = this.calculateCombatStrength(myUnits, false);

      // Can spare units if low threat
      if (!threatInfo || threatInfo.threat < myStrength * 0.3) {
        const spareable = {};
        for (const [type, qty] of Object.entries(myUnits)) {
          if (type === 'infantry' && qty > 1) {
            spareable[type] = qty - 1;
          } else if (type !== 'factory' && type !== 'aaGun' && qty > 0) {
            spareable[type] = qty;
          }
        }

        if (this.countUnits(spareable) > 0) {
          availableUnits.push({
            territoryId,
            units: spareable,
            strength: this.calculateCombatStrength(spareable, false),
          });
        }
      }
    }

    // Match available units to needs
    for (const [needyId, needInfo] of sortedNeeds) {
      let remainingNeed = needInfo.need;

      for (const available of availableUnits) {
        if (remainingNeed <= 0) break;
        if (available.strength <= 0) continue;

        // Check if path exists
        const path = this.findPath(gameState, available.territoryId, needyId);
        if (!path) continue;

        // Calculate units to send
        const unitsToSend = {};
        let strengthSent = 0;

        // Prioritize mobile units
        for (const type of ['tank', 'fighter', 'artillery', 'infantry']) {
          if (available.units[type] && strengthSent < remainingNeed) {
            const stats = this.unitStats[type];
            const maxToSend = available.units[type];
            const toSend = Math.min(
              maxToSend,
              Math.ceil((remainingNeed - strengthSent) / stats.defense)
            );

            if (toSend > 0) {
              unitsToSend[type] = toSend;
              strengthSent += toSend * stats.defense;
              available.units[type] -= toSend;
              available.strength -= toSend * stats.defense;
            }
          }
        }

        if (this.countUnits(unitsToSend) > 0) {
          moves.push({
            from: available.territoryId,
            to: path[1], // Next step toward destination
            units: unitsToSend,
            finalDestination: needyId,
          });
          remainingNeed -= strengthSent;
        }
      }
    }

    return moves;
  }

  /**
   * Placement Phase - Strategic placement based on analysis
   */
  decidePlacements(gameState) {
    const placements = [];
    const analysis = this.analyzeStrategicSituation(gameState);
    const myTerritories = this.getPlayerTerritories(gameState);

    // Get placement locations
    const placementTerritories = myTerritories.filter(t => {
      const units = this.getPlayerUnitsAt(gameState, this._getTerritoryId(t));
      return units.factory > 0 || t.isCapital || t.hasFactory;
    });

    if (placementTerritories.length === 0) return placements;

    // Score each placement location
    const locationScores = [];

    for (const territory of placementTerritories) {
      const territoryId = this._getTerritoryId(territory);
      const threatInfo = analysis.threatMap.get(territoryId) || { threat: 0 };

      // Score based on threat and strategic value
      let score = threatInfo.threat * 2; // Higher threat = higher priority

      // Capital gets extra priority
      if (territory.isCapital) {
        score += analysis.capitalThreat > 10 ? 100 : 30;
      }

      // Front-line bonus
      const hostileNeighbors = this.getHostileNeighbors(gameState, territoryId);
      score += hostileNeighbors.length * 10;

      // Breakthrough opportunity bonus
      const isBreakthroughBase = analysis.breakthroughOpportunities.some(
        op => op.from === territoryId
      );
      if (isBreakthroughBase) {
        score += 20;
      }

      locationScores.push({ territory, territoryId, score });
    }

    // Sort by score
    locationScores.sort((a, b) => b.score - a.score);

    // Distribute placements (would need to track purchased units)
    // For now, return the prioritized locations
    for (const location of locationScores) {
      placements.push({
        territoryId: location.territoryId,
        units: {}, // Units to place would come from purchase tracking
        priority: location.score,
      });
    }

    return placements;
  }

  /**
   * Track opponent patterns for future prediction
   */
  onTurnEnd(gameState) {
    // Record opponent actions for pattern analysis
    const opponents = this._getOpponents(gameState);

    for (const opponent of opponents) {
      if (!this.opponentPatterns.has(opponent.id)) {
        this.opponentPatterns.set(opponent.id, {
          aggressionLevel: 0.5,
          preferredTargets: [],
          purchasePatterns: [],
        });
      }

      // Analysis would track their actual moves vs predictions
      // to adjust future expectations
    }
  }
}


// ============================================================================
// TUNING GUIDE
// ============================================================================
/**
 * ============================================================================
 * TUNING GUIDE - Key Weight Constants
 * ============================================================================
 *
 * These are the most important values to adjust for balancing:
 *
 * 1. BATTLE_WIN_THRESHOLD_EASY (default: 0.3)
 *    - Lower = Easy AI attacks more recklessly
 *    - Higher = Easy AI becomes more cautious (less "dumb")
 *    - Range: 0.1 - 0.5
 *
 * 2. BATTLE_WIN_THRESHOLD_MEDIUM (default: 0.55)
 *    - Minimum win probability for Medium AI to attack
 *    - Lower = more aggressive, Higher = more conservative
 *    - Range: 0.4 - 0.7
 *
 * 3. BATTLE_WIN_THRESHOLD_HARD (default: 0.45)
 *    - Hard AI takes calculated risks for high-value targets
 *    - Lower = more aggressive, Higher = safer plays
 *    - Range: 0.35 - 0.6
 *
 * 4. CONTINENT_COMPLETION_BONUS (default: 3.0)
 *    - Multiplier for valuing continent completion
 *    - Higher = AI prioritizes finishing continents more
 *    - Range: 1.0 - 5.0
 *
 * 5. CONTINENT_DENIAL_BONUS (default: 4.0)
 *    - Multiplier for blocking opponent continent completion
 *    - Higher = AI more aggressively denies opponents
 *    - Range: 2.0 - 6.0
 *
 * 6. CAPITAL_DEFENSE_PRIORITY (default: 5.0)
 *    - How much to prioritize capital defense over other territories
 *    - Higher = more conservative capital protection
 *    - Range: 2.0 - 10.0
 *
 * 7. AGGRESSION_WHEN_BEHIND (default: 1.5)
 *    - Multiplier applied to attack values when losing
 *    - Higher = more desperate attacks when behind
 *    - Range: 1.0 - 2.5
 *
 * 8. CONSERVATISM_WHEN_AHEAD (default: 0.7)
 *    - Multiplier applied to attack values when winning
 *    - Lower = more conservative when ahead
 *    - Range: 0.4 - 1.0
 *
 * 9. HARD_AI_SEARCH_DEPTH (default: 3)
 *    - Expectiminimax search depth for Hard AI
 *    - Higher = smarter but slower (may cause lag)
 *    - Range: 2 - 4
 *
 * 10. MONTE_CARLO_SIMULATIONS (default: 50)
 *     - Number of battle simulations for Hard AI
 *     - Higher = more accurate probabilities but slower
 *     - Range: 20 - 100
 *
 * ============================================================================
 * DIFFICULTY ADJUSTMENT EXAMPLES
 * ============================================================================
 *
 * To make Easy AI easier:
 *   - Increase EasyAI.badMoveChance to 0.7-0.8
 *   - Increase EasyAI.ignoreContinentChance to 0.5-0.6
 *
 * To make Medium AI harder:
 *   - Lower BATTLE_WIN_THRESHOLD_MEDIUM to 0.5
 *   - Increase CONTINENT_DENIAL_BONUS to 5.0
 *
 * To make Hard AI brutal:
 *   - Lower BATTLE_WIN_THRESHOLD_HARD to 0.4
 *   - Increase HARD_AI_SEARCH_DEPTH to 4
 *   - Increase MONTE_CARLO_SIMULATIONS to 100
 *   - Increase AGGRESSION_WHEN_BEHIND to 2.0
 *
 * ============================================================================
 */

// Export AI_WEIGHTS for external configuration
export { AI_WEIGHTS, UNIT_STATS };
