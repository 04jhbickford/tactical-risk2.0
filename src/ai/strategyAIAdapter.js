/**
 * Strategy AI Adapter
 * Integrates the advanced Strategy AI system with the existing game infrastructure.
 *
 * This adapter translates between the game's existing API and the new strategy AI.
 * It can be used alongside or in place of the existing AIPlayer class.
 */

import { EasyAI, MediumAI, HardAI, UNIT_STATS } from './strategyAI.js';

/**
 * Battle outcome calculator that wraps the game's combat system
 * This function must match the signature expected by the Strategy AI
 */
function createBattleCalculator(gameState, unitDefs) {
  return function calculateBattleOutcome(attackerUnits, defenderUnits, attackerSupport, defenderSupport) {
    // Convert unit objects to arrays if needed
    const attackerArray = [];
    const defenderArray = [];

    for (const [type, qty] of Object.entries(attackerUnits || {})) {
      if (qty > 0) {
        attackerArray.push({ type, quantity: qty });
      }
    }

    for (const [type, qty] of Object.entries(defenderUnits || {})) {
      if (qty > 0) {
        defenderArray.push({ type, quantity: qty });
      }
    }

    // Calculate attack and defense values
    const unitStats = unitDefs || UNIT_STATS;

    let attackerPower = 0;
    let attackerHP = 0;
    for (const unit of attackerArray) {
      const stats = unitStats[unit.type];
      if (stats) {
        attackerPower += (stats.attack || 0) * unit.quantity;
        attackerHP += unit.quantity;
      }
    }

    let defenderPower = 0;
    let defenderHP = 0;
    for (const unit of defenderArray) {
      const stats = unitStats[unit.type];
      if (stats) {
        defenderPower += (stats.defense || 0) * unit.quantity;
        defenderHP += unit.quantity;
      }
    }

    // Simple probability calculation based on power ratios
    // This is a heuristic - replace with actual battle simulation if available
    const totalPower = attackerPower + defenderPower;
    let winProbability = 0.5;

    if (totalPower > 0) {
      // Base probability from power ratio
      winProbability = attackerPower / totalPower;

      // Adjust for unit count (more units = more consistent)
      const unitRatio = attackerHP / Math.max(1, attackerHP + defenderHP);
      winProbability = winProbability * 0.7 + unitRatio * 0.3;

      // Clamp to reasonable range
      winProbability = Math.max(0.05, Math.min(0.95, winProbability));
    }

    // Estimate expected losses based on probability
    const expectedAttackerLosses = {};
    const expectedDefenderLosses = {};

    // Estimate losses (simplified model)
    const attackerLossRatio = 1 - winProbability;
    const defenderLossRatio = winProbability;

    for (const unit of attackerArray) {
      const expectedLoss = Math.ceil(unit.quantity * attackerLossRatio * 0.5);
      if (expectedLoss > 0) {
        expectedAttackerLosses[unit.type] = expectedLoss;
      }
    }

    for (const unit of defenderArray) {
      const expectedLoss = Math.ceil(unit.quantity * defenderLossRatio * 0.7);
      if (expectedLoss > 0) {
        expectedDefenderLosses[unit.type] = expectedLoss;
      }
    }

    return {
      winProbability,
      attackerWinChance: winProbability,
      winner: winProbability > 0.5 ? 'attacker' : 'defender',
      attackerWins: winProbability > 0.5,
      expectedAttackerLosses,
      expectedDefenderLosses,
    };
  };
}

/**
 * Adapts the game state to the format expected by Strategy AI
 */
function adaptGameState(gameState) {
  // The game state is already mostly compatible
  // This function handles any necessary transformations

  const adapted = {
    phase: gameState.turnPhase,
    turnPhase: gameState.turnPhase,
    currentPlayerId: gameState.currentPlayer?.id,
    players: gameState.players || [],
    territories: gameState.territories || Object.values(gameState.territoryByName || {}),
    territoryByName: gameState.territoryByName || {},
    continents: gameState.continents || [],
    victoryObjectives: gameState.victoryObjectives || [],

    // Helper methods from gameState
    getOwner: (territoryName) => gameState.getOwner?.(territoryName),
    getUnitsAt: (territoryName) => gameState.getUnitsAt?.(territoryName) || [],
    getCapital: (playerId) => gameState.getCapital?.(playerId),
    isCapital: (territoryName) => gameState.isCapital?.(territoryName),
    getPlayer: (playerId) => gameState.getPlayer?.(playerId),
  };

  // Adapt territories to include owner info
  adapted.territories = adapted.territories.map(t => ({
    ...t,
    id: t.name || t.id,
    name: t.name || t.id,
    ownerId: gameState.getOwner?.(t.name || t.id),
    owner: gameState.getOwner?.(t.name || t.id),
    ipcValue: t.production || t.ipcValue || 0,
    production: t.production || t.ipcValue || 0,
    neighbors: t.connections || t.neighbors || [],
    connections: t.connections || t.neighbors || [],
    isCapital: gameState.isCapital?.(t.name || t.id),
    isWater: t.isWater || false,
    units: gameState.getUnitsAt?.(t.name || t.id) || [],
  }));

  return adapted;
}

/**
 * Strategy AI Player Adapter
 * Wraps the Strategy AI to work with the existing game infrastructure
 */
export class StrategyAIPlayer {
  constructor(gameState, playerId, difficulty = 'medium', unitDefs = null) {
    this.gameState = gameState;
    this.playerId = playerId;
    this.difficulty = difficulty;
    this.unitDefs = unitDefs;

    // Think delays for visual feedback
    this.thinkDelay = difficulty === 'easy' ? 600 : difficulty === 'hard' ? 200 : 400;

    // Create the battle calculator
    const battleCalculator = createBattleCalculator(gameState, unitDefs);

    // Create the appropriate AI instance
    const unitStats = this._buildUnitStats(unitDefs);

    switch (difficulty) {
      case 'easy':
        this.ai = new EasyAI(playerId, battleCalculator, unitStats);
        break;
      case 'hard':
        this.ai = new HardAI(playerId, battleCalculator, unitStats);
        break;
      default:
        this.ai = new MediumAI(playerId, battleCalculator, unitStats);
    }

    // Track pending purchases for placement phase
    this.pendingPurchases = [];
  }

  /**
   * Build unit stats from game's unit definitions
   */
  _buildUnitStats(unitDefs) {
    if (!unitDefs) return UNIT_STATS;

    const stats = {};
    for (const [type, def] of Object.entries(unitDefs)) {
      stats[type] = {
        attack: def.attack || 0,
        defense: def.defense || 0,
        cost: def.cost || 0,
        movement: def.movement || 1,
        value: def.cost || 0,
        isLand: def.isLand || false,
        isSea: def.isSea || false,
        isAir: def.isAir || false,
      };
    }
    return stats;
  }

  /**
   * Helper delay function
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Main entry point - compatible with existing AIPlayer interface
   */
  async takeTurn(phase, callbacks = {}) {
    await this._delay(this.thinkDelay);

    const adaptedState = adaptGameState(this.gameState);

    switch (phase) {
      case 'CAPITAL_PLACEMENT':
        return this._placeCapital(callbacks);

      case 'UNIT_PLACEMENT':
        return this._placeUnits(adaptedState, callbacks);

      case 'PURCHASE':
        return this._purchase(adaptedState, callbacks);

      case 'COMBAT_MOVE':
        return this._combatMove(adaptedState, callbacks);

      case 'COMBAT':
        return this._resolveCombat(callbacks);

      case 'NON_COMBAT_MOVE':
        return this._nonCombatMove(adaptedState, callbacks);

      case 'MOBILIZE':
        return this._mobilize(adaptedState, callbacks);

      default:
        return { done: true };
    }
  }

  /**
   * Capital Placement - Find best strategic capital location
   * Enforces minimum 2-territory separation from other capitals
   */
  async _placeCapital(callbacks) {
    const ownedTerritories = this.gameState.getPlayerTerritories?.(this.playerId) || [];
    const landTerritories = ownedTerritories.filter(name => {
      const t = this.gameState.territoryByName?.[name];
      return t && !t.isWater;
    });

    if (landTerritories.length === 0) {
      return { done: true };
    }

    // Get all existing capitals from multiple sources for robustness
    const existingCapitals = new Set();

    // Method 1: Check playerState.capitalTerritory
    for (const player of (this.gameState.players || [])) {
      if (player.id !== this.playerId) {
        const playerCapital = this.gameState.playerState?.[player.id]?.capitalTerritory;
        if (playerCapital) {
          existingCapitals.add(playerCapital);
        }
      }
    }

    // Method 2: Check territoryState.isCapital flag
    for (const [terrName, terrState] of Object.entries(this.gameState.territoryState || {})) {
      if (terrState.isCapital && terrState.owner !== this.playerId) {
        existingCapitals.add(terrName);
      }
    }

    // Method 3: Use getCapital helper if available
    for (const player of (this.gameState.players || [])) {
      if (player.id !== this.playerId) {
        const cap = this.gameState.getCapital?.(player.id);
        if (cap) {
          existingCapitals.add(cap);
        }
      }
    }

    // Helper function to check if a territory is too close to existing capitals
    const isTooCloseToCapital = (terrName) => {
      // Distance 0: Is a capital
      if (existingCapitals.has(terrName)) {
        return true;
      }

      const connections = this.gameState.territoryByName?.[terrName]?.connections || [];

      // Distance 1: Adjacent to a capital
      for (const conn of connections) {
        if (existingCapitals.has(conn)) {
          return true;
        }
      }

      // Distance 2: Neighbor of neighbor is a capital
      for (const conn of connections) {
        const conn2 = this.gameState.territoryByName?.[conn]?.connections || [];
        for (const neighbor2 of conn2) {
          if (existingCapitals.has(neighbor2)) {
            return true;
          }
        }
      }

      return false;
    };

    // Score each territory for capital placement
    let bestTerritory = null;
    let bestScore = -Infinity;

    for (const terrName of landTerritories) {
      const territory = this.gameState.territoryByName[terrName];
      if (!territory) continue;

      // CRITICAL: Skip territories within 2 spaces of existing capitals
      if (isTooCloseToCapital(terrName)) {
        continue; // Don't even consider this territory
      }

      let score = 0;
      const connections = territory.connections || [];

      // Higher production is better
      score += (territory.production || 0) * 3;

      // More friendly connections (defensibility) is better
      const friendlyConnections = connections.filter(c => {
        const owner = this.gameState.getOwner?.(c);
        return owner === this.playerId;
      }).length;
      score += friendlyConnections * 2;

      // Fewer enemy borders is better
      const enemyConnections = connections.filter(c => {
        const owner = this.gameState.getOwner?.(c);
        return owner && owner !== this.playerId;
      }).length;
      score -= enemyConnections * 1.5;

      // Central location in our territory is better
      score += Math.min(friendlyConnections, 3) * 1;

      if (score > bestScore) {
        bestScore = score;
        bestTerritory = terrName;
      }
    }

    // Fallback: if no valid territory found (all too close), pick the best we can
    if (!bestTerritory && landTerritories.length > 0) {
      // Just pick the highest production territory as fallback
      let fallbackBest = null;
      let fallbackScore = -Infinity;
      for (const terrName of landTerritories) {
        const t = this.gameState.territoryByName[terrName];
        const prod = t?.production || 0;
        if (prod > fallbackScore) {
          fallbackScore = prod;
          fallbackBest = terrName;
        }
      }
      bestTerritory = fallbackBest;
    }

    if (bestTerritory) {
      if (callbacks.onPlaceCapital) {
        callbacks.onPlaceCapital(bestTerritory);
      }
      return { done: true, action: 'placeCapital', territory: bestTerritory };
    }

    return { done: true };
  }

  /**
   * Initial Unit Placement - Strategic unit distribution
   */
  async _placeUnits(adaptedState, callbacks) {
    // Get remaining units to place
    const remainingUnits = this.gameState.getUnplacedUnits?.(this.playerId);
    if (!remainingUnits || Object.keys(remainingUnits).length === 0) {
      return { done: true };
    }

    // Get owned territories
    const ownedTerritories = this.gameState.getPlayerTerritories?.(this.playerId) || [];
    const landTerritories = ownedTerritories.filter(name => {
      const t = this.gameState.territoryByName?.[name];
      return t && !t.isWater;
    });

    if (landTerritories.length === 0) {
      return { done: true };
    }

    // Score territories for placement
    const capital = this.gameState.getCapital?.(this.playerId);
    const placementScores = [];

    for (const terrName of landTerritories) {
      const territory = this.gameState.territoryByName[terrName];
      if (!territory) continue;

      let score = 0;

      // Capital gets high priority
      if (terrName === capital) {
        score += 50;
      }

      // Border territories need more units
      const connections = territory.connections || [];
      const enemyBorders = connections.filter(c => {
        const owner = this.gameState.getOwner?.(c);
        return owner && owner !== this.playerId;
      }).length;
      score += enemyBorders * 10;

      // Higher production territories are worth defending
      score += (territory.production || 0) * 2;

      placementScores.push({ territory: terrName, score });
    }

    // Sort by score
    placementScores.sort((a, b) => b.score - a.score);

    // Place one unit at highest priority location
    const unitTypes = Object.keys(remainingUnits).filter(t => remainingUnits[t] > 0);
    if (unitTypes.length > 0 && placementScores.length > 0) {
      const unitType = unitTypes[0];
      const targetTerritory = placementScores[0].territory;

      if (callbacks.onPlaceUnit) {
        callbacks.onPlaceUnit(unitType, targetTerritory);
      }
      return { done: false, action: 'placeUnit', unitType, territory: targetTerritory };
    }

    return { done: true };
  }

  /**
   * Purchase Phase - Use Strategy AI for smart purchases
   */
  async _purchase(adaptedState, callbacks) {
    adaptedState.phase = 'purchase';
    const action = this.ai.getBestAction(adaptedState);

    // Store purchases for placement phase
    this.pendingPurchases = action.purchases || [];

    // Execute purchases
    for (const purchase of this.pendingPurchases) {
      for (let i = 0; i < purchase.quantity; i++) {
        const result = this.gameState.purchaseUnit?.(this.playerId, purchase.unitType);
        if (!result?.success) break;

        if (callbacks.onPurchase) {
          callbacks.onPurchase(purchase.unitType);
        }
      }
    }

    return { done: true, action: 'purchase', purchases: this.pendingPurchases };
  }

  /**
   * Combat Move Phase - Use Strategy AI for attack decisions
   */
  async _combatMove(adaptedState, callbacks) {
    adaptedState.phase = 'combatMove';
    const action = this.ai.getBestAction(adaptedState);

    const attacks = action.attacks || [];
    let movesMade = 0;

    for (const attack of attacks) {
      // Convert units object to array format
      const unitsToMove = [];
      for (const [type, qty] of Object.entries(attack.units || {})) {
        if (qty > 0) {
          unitsToMove.push({ type, quantity: qty });
        }
      }

      if (unitsToMove.length === 0) continue;

      // Execute the move
      const result = this.gameState.moveUnits?.(
        attack.from,
        attack.to,
        unitsToMove,
        this.unitDefs
      );

      if (result?.success) {
        movesMade++;
        if (callbacks.onMove) {
          callbacks.onMove(attack.from, attack.to, unitsToMove);
        }
        await this._delay(this.thinkDelay / 2);
      }
    }

    return { done: true, action: 'combatMove', movesMade };
  }

  /**
   * Combat Resolution - Let game handle combat, AI makes retreat decisions
   */
  async _resolveCombat(callbacks) {
    // Combat is typically handled by the game, AI just observes
    // Could add retreat logic here if needed
    return { done: true };
  }

  /**
   * Non-Combat Move Phase - Use Strategy AI for reinforcement
   */
  async _nonCombatMove(adaptedState, callbacks) {
    adaptedState.phase = 'nonCombatMove';
    const action = this.ai.getBestAction(adaptedState);

    const moves = action.moves || [];
    let movesMade = 0;

    for (const move of moves) {
      // Convert units object to array format
      const unitsToMove = [];
      for (const [type, qty] of Object.entries(move.units || {})) {
        if (qty > 0) {
          unitsToMove.push({ type, quantity: qty });
        }
      }

      if (unitsToMove.length === 0) continue;

      // Execute the move
      const result = this.gameState.moveUnits?.(
        move.from,
        move.to,
        unitsToMove,
        this.unitDefs
      );

      if (result?.success) {
        movesMade++;
        if (callbacks.onMove) {
          callbacks.onMove(move.from, move.to, unitsToMove);
        }
        await this._delay(this.thinkDelay / 3);
      }
    }

    return { done: true, action: 'nonCombatMove', movesMade };
  }

  /**
   * Mobilize Phase - Place purchased units strategically
   */
  async _mobilize(adaptedState, callbacks) {
    // Get units to place
    const unplacedUnits = this.gameState.getPurchasedUnits?.(this.playerId) ||
                          this.gameState.getUnmobilizedUnits?.(this.playerId);

    if (!unplacedUnits || unplacedUnits.length === 0) {
      return { done: true };
    }

    // Get territories with factories
    const ownedTerritories = this.gameState.getPlayerTerritories?.(this.playerId) || [];
    const capital = this.gameState.getCapital?.(this.playerId);

    // Find valid placement locations
    const placementLocations = [];

    for (const terrName of ownedTerritories) {
      const territory = this.gameState.territoryByName?.[terrName];
      if (!territory || territory.isWater) continue;

      // Check if has factory or is capital
      const units = this.gameState.getUnitsAt?.(terrName) || [];
      const hasFactory = units.some(u => u.type === 'factory');

      if (hasFactory || terrName === capital) {
        // Score the location based on threat
        let score = 0;

        // Capital gets priority when threatened
        if (terrName === capital) {
          score += 30;
        }

        // Front-line locations get priority
        const connections = territory.connections || [];
        const enemyBorders = connections.filter(c => {
          const owner = this.gameState.getOwner?.(c);
          return owner && owner !== this.playerId;
        }).length;
        score += enemyBorders * 10;

        // Higher production is worth more
        score += (territory.production || 0) * 2;

        placementLocations.push({ territory: terrName, score, isCapital: terrName === capital });
      }
    }

    // Sort by score
    placementLocations.sort((a, b) => b.score - a.score);

    if (placementLocations.length === 0) {
      return { done: true };
    }

    // Place first unit at best location
    const bestLocation = placementLocations[0];
    const unitToPlace = unplacedUnits[0];

    const result = this.gameState.mobilizeUnit?.(
      this.playerId,
      unitToPlace.type,
      bestLocation.territory
    );

    if (result?.success) {
      if (callbacks.onMobilize) {
        callbacks.onMobilize(unitToPlace.type, bestLocation.territory);
      }
      return { done: false, action: 'mobilize', unitType: unitToPlace.type, territory: bestLocation.territory };
    }

    return { done: true };
  }

  /**
   * Called at end of turn for pattern tracking
   */
  onTurnEnd() {
    const adaptedState = adaptGameState(this.gameState);
    this.ai.onTurnEnd(adaptedState);
  }
}

/**
 * Factory function to create the appropriate AI player
 */
export function createStrategyAI(gameState, playerId, difficulty, unitDefs) {
  return new StrategyAIPlayer(gameState, playerId, difficulty, unitDefs);
}

// Export for direct import
export { EasyAI, MediumAI, HardAI };
