// AI Controller - manages AI players and triggers their turns
// Handles ALL game phases autonomously for AI players

import { AIPlayer } from './aiPlayer.js';
import { GAME_PHASES, TURN_PHASES } from '../state/gameState.js';
import {
  adjacentSeas,
  countOwned,
  isIslandCapital,
  pickIslandAssault,
  pickSecondaryFactorySite,
  pickTransportLoad,
  pickTransportSail,
  planIslandNavyPurchases,
} from './islandNavy.js';

export class AIController {
  constructor() {
    this.gameState = null;
    this.aiPlayers = {}; // playerId -> AIPlayer instance
    this.isProcessing = false;
    this.onAction = null; // Callback when AI takes action
    this.unitDefs = null;
    this.skipMode = false; // Fast-forward AI moves
    this.onStatusUpdate = null; // Callback for AI status messages
    this.canActCheck = null; // Optional authority gate (multiplayer: host only)
    this._checkTimeout = null; // For debouncing AI checks
    this._unsubscribe = null; // Game state subscription
    this.actionLog = null; // Action log for logging AI moves
  }

  // Allow user to skip/fast-forward AI moves
  setSkipMode(skip) {
    this.skipMode = skip;
  }

  toggleSkipMode() {
    this.skipMode = !this.skipMode;
    return this.skipMode;
  }

  setOnStatusUpdate(callback) {
    this.onStatusUpdate = callback;
  }

  // Gate AI processing on an authority check. In multiplayer only the host may
  // run AI turns — every other client must wait for the host's pushes.
  setCanAct(callback) {
    this.canActCheck = callback;
  }

  // Re-checked BETWEEN AI actions too: a failover client must abandon an
  // in-progress AI turn the moment the real host comes back, or the two
  // clients interleave conflicting states (the V2.53 deployment-stuck bug).
  _hasAuthority() {
    return !this.canActCheck || this.canActCheck() === true;
  }

  setActionLog(actionLog) {
    this.actionLog = actionLog;
  }

  _updateStatus(message) {
    if (this.onStatusUpdate) {
      this.onStatusUpdate(message);
    }
    console.log('[AI]', message);
  }

  _logAction(type, data, player) {
    if (this.actionLog && player) {
      this.actionLog.log(type, { ...data, color: player.color });
    }
  }

  setGameState(gameState) {
    // Unsubscribe from old game state
    if (this._unsubscribe) {
      this._unsubscribe();
    }

    this.gameState = gameState;
    this._initAIPlayers();

    // Subscribe to game state changes to auto-trigger AI
    if (gameState) {
      this._unsubscribe = gameState.subscribe(() => {
        this._scheduleAICheck();
      });
    }
  }

  // Schedule an AI check with debouncing
  _scheduleAICheck() {
    if (this._checkTimeout) {
      clearTimeout(this._checkTimeout);
    }
    // In a hidden tab run the check on a microtask instead of a throttled
    // timer, so AI turns keep flowing while the window is in the background
    if (typeof document !== 'undefined' && document.hidden) {
      this._checkTimeout = null;
      Promise.resolve().then(() => this.checkAndProcessAI());
      return;
    }
    this._checkTimeout = setTimeout(() => {
      this._checkTimeout = null;
      this.checkAndProcessAI();
    }, 100);
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
    // Also pass to game state for AI calculations
    if (this.gameState) {
      this.gameState.unitDefs = unitDefs;
    }
    // Update AI players
    for (const aiPlayer of Object.values(this.aiPlayers)) {
      aiPlayer.unitDefs = unitDefs;
    }
  }

  setOnAction(callback) {
    this.onAction = callback;
  }

  _initAIPlayers() {
    this.aiPlayers = {};
    if (!this.gameState?.players) return;

    for (const player of this.gameState.players) {
      if (player.isAI) {
        console.log('[AI] Initializing AI player:', player.id, 'difficulty:', player.aiDifficulty);
        const aiPlayer = new AIPlayer(
          this.gameState,
          player.id,
          player.aiDifficulty || 'medium'
        );
        aiPlayer.unitDefs = this.unitDefs;
        this.aiPlayers[player.id] = aiPlayer;
      }
    }

    // Trigger initial check after a short delay
    setTimeout(() => this._scheduleAICheck(), 500);
  }

  // Check if current player is AI and process their turn
  async checkAndProcessAI() {
    if (this.isProcessing) return false;
    if (!this.gameState) return false;

    // Not authoritative (e.g. non-host multiplayer client) — never run AI turns
    if (this.canActCheck && !this.canActCheck()) return false;

    // Don't process during lobby phase
    if (this.gameState.phase === GAME_PHASES.LOBBY) return false;
    if (this.gameState.gameOver) return false;

    const currentPlayer = this.gameState.currentPlayer;
    if (!currentPlayer?.isAI) return false;

    const aiPlayer = this.aiPlayers[currentPlayer.id];
    if (!aiPlayer) {
      // AI player not initialized, try to create it
      console.log('[AI] Creating AIPlayer for', currentPlayer.id);
      const newAI = new AIPlayer(
        this.gameState,
        currentPlayer.id,
        currentPlayer.aiDifficulty || 'medium'
      );
      newAI.unitDefs = this.unitDefs;
      this.aiPlayers[currentPlayer.id] = newAI;
    }

    this.isProcessing = true;
    this._updateStatus(`${currentPlayer.name} is thinking...`);

    try {
      await this._processAITurn(this.aiPlayers[currentPlayer.id], currentPlayer);
    } catch (err) {
      console.error('[AI] Error during AI turn:', err);
    }

    this.isProcessing = false;

    // Schedule another check in case we need to continue
    this._scheduleAICheck();

    return true;
  }

  async _processAITurn(aiPlayer, player) {
    if (this.gameState?.gameOver) return;
    const phase = this.gameState.phase;
    const turnPhase = this.gameState.turnPhase;

    if (!this._hasAuthority()) return;

    // Handle different game phases
    if (phase === GAME_PHASES.CAPITAL_PLACEMENT) {
      await this._handleCapitalPlacement(aiPlayer, player);
    } else if (phase === GAME_PHASES.UNIT_PLACEMENT) {
      await this._handleInitialPlacement(aiPlayer, player);
    } else if (phase === GAME_PHASES.PLAYING) {
      await this._handlePlayingPhase(aiPlayer, player, turnPhase);
    }
  }

  // ============================================
  // CAPITAL PLACEMENT
  // ============================================
  async _handleCapitalPlacement(aiPlayer, player) {
    this._updateStatus(`${player.name} is choosing capital location...`);
    // No theatrical delay — human Confirm on this load must reach DEPLOY
    // when the other seat is AI (Skeptic V2.81.32 left CAPITAL).

    // Get owned territories
    const owned = this.gameState.territories
      .filter(t => !t.isWater && this.gameState.getOwner(t.name) === player.id)
      .map(t => t.name);

    if (owned.length === 0) return;

    // Choose based on difficulty
    let choice;
    if (aiPlayer.difficulty === 'hard') {
      // Pick territory with most connections (strategic)
      choice = owned.reduce((best, t) => {
        const connections = this.gameState.getConnections(t).length;
        const bestConnections = this.gameState.getConnections(best).length;
        return connections > bestConnections ? t : best;
      });
    } else if (aiPlayer.difficulty === 'easy') {
      // Random choice
      choice = owned[Math.floor(Math.random() * owned.length)];
    } else {
      // Medium: pick territory with most friendly neighbors
      choice = this._findCentralTerritory(owned, player.id);
    }

    this._updateStatus(`${player.name} places capital in ${choice}`);
    this.gameState.placeCapital(choice);
    this._logAction('capital', { message: `${player.name} placed capital at ${choice}`, territory: choice }, player);
    this._notifyAction('placeCapital', { territory: choice });
  }

  // ============================================
  // INITIAL UNIT PLACEMENT (6 or 7 units per round)
  // ============================================
  async _handleInitialPlacement(aiPlayer, player) {
    this._updateStatus(`${player.name} is placing units...`);
    await this._delay(this._getActionDelay() / 2);

    const unitsToPlace = this.gameState.getUnitsToPlace(player.id);
    const totalRemaining = this.gameState.getTotalUnitsToPlace(player.id);

    if (totalRemaining === 0) {
      // No units left, finish placement round
      this.gameState.finishPlacementRound(this.unitDefs);
      this._notifyAction('finishPlacement', {});
      return;
    }

    // Get owned territories for land units
    const ownedLand = this.gameState.territories
      .filter(t => !t.isWater && this.gameState.getOwner(t.name) === player.id)
      .map(t => t.name);

    // Get adjacent sea zones for naval units
    const ownedSeas = this._getAdjacentSeaZones(player.id);

    // Place units this round (7 for final round, 6 otherwise)
    let placedThisRound = 0;
    const limit = this.gameState.getUnitsPerRoundLimit?.() || 6;
    const maxThisRound = Math.min(limit, totalRemaining);

    while (placedThisRound < maxThisRound) {
      // Authority may have shifted mid-turn (host returned) — stop immediately
      if (!this._hasAuthority()) return;

      // Find a unit type that can actually be placed
      let unitType = null;
      let isNaval = false;

      for (const unit of unitsToPlace) {
        if (unit.quantity > 0) {
          const def = this.unitDefs?.[unit.type];
          if (def) {
            // Skip naval units if no valid sea zones
            if (def.isSea && ownedSeas.length === 0) continue;
            // Skip land units if no owned land (shouldn't happen)
            if (def.isLand && ownedLand.length === 0) continue;
            unitType = unit.type;
            isNaval = def.isSea;
            break;
          }
        }
      }

      if (!unitType) break; // No placeable units remaining

      // Pick territory based on unit type and difficulty
      let territory;
      if (isNaval && ownedSeas.length > 0) {
        territory = ownedSeas[Math.floor(Math.random() * ownedSeas.length)];
      } else if (ownedLand.length > 0) {
        territory = this._pickPlacementTerritory(ownedLand, player.id, aiPlayer.difficulty);
      } else {
        break;
      }

      // Place the unit
      const result = this.gameState.placeInitialUnit(territory, unitType, this.unitDefs);
      if (result.success) {
        placedThisRound++;
        await this._delay(150); // Small delay for visual feedback
        this._notifyAction('placeUnit', { unitType, territory });
      } else {
        break;
      }
    }

    // Finish placement round after placing units
    await this._delay(300);
    if (!this._hasAuthority()) return;
    this.gameState.finishPlacementRound(this.unitDefs);
    this._notifyAction('finishPlacement', {});
  }

  // ============================================
  // PLAYING PHASE (all turn phases)
  // ============================================
  async _handlePlayingPhase(aiPlayer, player, turnPhase) {
    // Leftover setup turnPhase must never run tech / purchase / End Phase.
    if (this.gameState.phase !== GAME_PHASES.PLAYING) return;
    switch (turnPhase) {
      case TURN_PHASES.DEVELOP_TECH:
        await this._handleTechResearch(aiPlayer, player);
        break;
      case TURN_PHASES.PURCHASE:
        await this._handlePurchase(aiPlayer, player);
        break;
      case TURN_PHASES.COMBAT_MOVE:
        await this._handleCombatMove(aiPlayer, player);
        break;
      case TURN_PHASES.COMBAT:
        await this._handleCombat(aiPlayer, player);
        break;
      case TURN_PHASES.NON_COMBAT_MOVE:
        await this._handleNonCombatMove(aiPlayer, player);
        break;
      case TURN_PHASES.MOBILIZE:
        await this._handleMobilize(aiPlayer, player);
        break;
      case TURN_PHASES.COLLECT_INCOME:
        // Auto-handled by game state
        this.gameState.nextPhase();
        this._notifyAction('nextPhase', {});
        break;
      default:
        // Skip unknown phases
        this.gameState.nextPhase();
        this._notifyAction('nextPhase', {});
    }
  }

  // ============================================
  // TECH RESEARCH
  // ============================================
  async _handleTechResearch(aiPlayer, player) {
    this._updateStatus(`${player.name} considering technology research...`);
    await this._delay(this._getActionDelay() / 2);

    const ipcs = this.gameState.getIPCs(player.id);
    const availableTechs = this.gameState.getAvailableTechs?.(player.id) || [];

    // Decide whether to research based on difficulty and resources
    let diceCount = 0;
    if (availableTechs.length > 0 && ipcs >= 5) {
      if (aiPlayer.difficulty === 'hard' && ipcs >= 15) {
        diceCount = Math.min(3, Math.floor(ipcs / 5));
      } else if (aiPlayer.difficulty === 'medium' && ipcs >= 20) {
        diceCount = Math.min(2, Math.floor(ipcs / 5));
      } else if (aiPlayer.difficulty === 'easy' && ipcs >= 30 && Math.random() > 0.5) {
        diceCount = 1;
      }
    }

    if (diceCount > 0) {
      this._updateStatus(`${player.name} researching technology (${diceCount} dice)...`);
      this.gameState.purchaseTechDice(player.id, diceCount);
      await this._delay(500);

      const result = this.gameState.rollTechDice(player.id);
      if (result.success && availableTechs.length > 0) {
        // Pick a tech to unlock
        const techId = availableTechs[0];
        this.gameState.unlockTech(player.id, techId);
        this._updateStatus(`${player.name} unlocked ${techId}!`);
      }
      await this._delay(300);
    }

    this.gameState.nextPhase();
    this._notifyAction('nextPhase', {});
  }

  // ============================================
  // PURCHASE PHASE - Strategic
  // ============================================
  async _handlePurchase(aiPlayer, player) {
    this._updateStatus(`${player.name} purchasing units...`);
    await this._delay(this._getActionDelay());

    const ipcs = this.gameState.getIPCs(player.id);
    if (ipcs <= 0 || !this.unitDefs) {
      this.gameState.nextPhase();
      this._notifyAction('nextPhase', {});
      return;
    }

    const capital = this.gameState.playerState[player.id]?.capitalTerritory;
    if (!capital) {
      this.gameState.nextPhase();
      this._notifyAction('nextPhase', {});
      return;
    }

    // Get strategic analysis
    const strategy = this._analyzeStrategicSituation(player.id, aiPlayer.difficulty);

    const capitalZone = this.gameState.territoryByName?.[capital];
    const islandStart = isIslandCapital(this.gameState.territoryByName, capital);
    let remaining = ipcs;
    const purchased = [];

    // Island capitals (no land step, including land bridges) buy a
    // transport and an escort before a land army. Japan, the UK, and
    // Eire can walk, so they keep the normal purchase list.
    if (islandStart && !strategy.threatenedCapital && capitalZone) {
      const sea = adjacentSeas(this.gameState.territoryByName, capital)[0];
      const owned = this.gameState.getPlayerTerritories?.(player.id) || [];
      const factoryCost = this.unitDefs.factory?.cost || 0;
      const site = factoryCost > 0
        ? pickSecondaryFactorySite({
          territoryByName: this.gameState.territoryByName,
          capitalName: capital,
          ownedLands: owned,
          factoryAt: (name) => (this.gameState.units[name] || []).some((unit) => unit.type === 'factory'),
          friendlyAtStart: this.gameState.friendlyTerritoriesAtTurnStart,
        })
        : null;
      const plan = planIslandNavyPurchases({
        ipcs: remaining,
        unitDefs: this.unitDefs,
        transportCount: countOwned(this.gameState.units, player.id, ['transport']),
        escortCount: countOwned(this.gameState.units, player.id, ['submarine', 'destroyer', 'cruiser', 'battleship', 'carrier']),
        threatened: false,
        reserve: site ? factoryCost : 0,
      });
      for (const buy of plan.buys) {
        const where = buy.placement === 'sea' ? sea : capital;
        if (!where) continue;
        for (let i = 0; i < buy.count; i++) {
          if (!this.gameState.purchaseUnit(buy.unitType, where, this.unitDefs)) break;
          remaining -= this.unitDefs[buy.unitType]?.cost || 0;
          purchased.push(buy.unitType);
        }
      }
      if (site && remaining >= factoryCost) {
        const queued = this.gameState.addToPendingPurchases('factory', this.unitDefs, site);
        if (queued?.success !== false && this.gameState.pendingPurchases?.some((row) => row.type === 'factory' && row.owner === player.id)) {
          remaining -= factoryCost;
          purchased.push('factory');
        }
      }
    }

    // Determine purchase priorities based on strategic situation.
    // An island start already spent on navy; skip the continental list
    // unless the capital is threatened and the navy plan was skipped.
    const priorities = (islandStart && !strategy.threatenedCapital)
      ? []
      : this._getStrategicPurchasePriorities(
        aiPlayer.difficulty,
        strategy,
        player.id
      );

    for (const { unitType, maxCount } of priorities) {
      const def = this.unitDefs[unitType];
      if (!def || def.cost > remaining) continue;

      // Buy units up to max count
      let count = Math.min(maxCount, Math.floor(remaining / def.cost));

      for (let i = 0; i < count && remaining >= def.cost; i++) {
        this.gameState.purchaseUnit(unitType, capital, this.unitDefs);
        remaining -= def.cost;
        purchased.push(unitType);
      }
    }

    if (purchased.length > 0) {
      const summary = {};
      purchased.forEach(t => summary[t] = (summary[t] || 0) + 1);
      const unitStr = Object.entries(summary).map(([t, n]) => `${n} ${t}`).join(', ');
      this._logAction('purchase', { message: `${player.name} purchased ${unitStr}` }, player);
    }

    this._notifyAction('purchase', {});
    await this._delay(300);
    this.gameState.nextPhase();
    this._notifyAction('nextPhase', {});
  }

  // Get strategic purchase priorities based on game situation
  _getStrategicPurchasePriorities(difficulty, strategy, playerId) {
    const priorities = [];

    if (strategy.threatenedCapital && strategy.capitalDefenseNeeded > 0) {
      // Capital is threatened - buy defenders
      priorities.push({ unitType: 'infantry', maxCount: 6 }); // Cheap, good defense
      priorities.push({ unitType: 'artillery', maxCount: 2 }); // Support
      priorities.push({ unitType: 'fighter', maxCount: 1 }); // Air defense
    } else if (strategy.nearVictory) {
      // We're close to winning - buy offensive units
      priorities.push({ unitType: 'armour', maxCount: 4 }); // Fast, strong attack
      priorities.push({ unitType: 'fighter', maxCount: 2 }); // Air support
      priorities.push({ unitType: 'infantry', maxCount: 3 }); // Casualties
    } else if (strategy.enemyNearVictory) {
      // Enemy is close to winning - buy mixed units to attack/defend
      priorities.push({ unitType: 'armour', maxCount: 2 });
      priorities.push({ unitType: 'infantry', maxCount: 4 });
      priorities.push({ unitType: 'fighter', maxCount: 1 });
    } else {
      // Normal situation - use difficulty-based priorities
      if (difficulty === 'hard') {
        priorities.push({ unitType: 'armour', maxCount: 3 });
        priorities.push({ unitType: 'artillery', maxCount: 2 });
        priorities.push({ unitType: 'fighter', maxCount: 1 });
        priorities.push({ unitType: 'infantry', maxCount: 5 });
      } else if (difficulty === 'easy') {
        priorities.push({ unitType: 'infantry', maxCount: 4 });
        priorities.push({ unitType: 'armour', maxCount: 1 });
      } else {
        priorities.push({ unitType: 'infantry', maxCount: 4 });
        priorities.push({ unitType: 'armour', maxCount: 2 });
        priorities.push({ unitType: 'artillery', maxCount: 2 });
      }
    }

    return priorities;
  }

  // ============================================
  // COMBAT MOVE - Strategic AI
  // ============================================
  async _handleCombatMove(aiPlayer, player) {
    this._updateStatus(`${player.name} planning attacks...`);
    await this._delay(this._getActionDelay());

    // Get strategic analysis
    const strategy = this._analyzeStrategicSituation(player.id, aiPlayer.difficulty);

    await this._projectIslandNavy(player, 'combat');

    // Get all potential attack targets with priority scores
    const attackTargets = this._evaluateAttackTargets(player.id, aiPlayer.difficulty, strategy);

    // Sort by priority (highest first)
    attackTargets.sort((a, b) => b.priority - a.priority);

    // Execute attacks starting with highest priority
    let attacksMade = 0;
    const maxAttacks = aiPlayer.difficulty === 'hard' ? 5 :
                       aiPlayer.difficulty === 'easy' ? 2 : 3;

    for (const target of attackTargets) {
      if (attacksMade >= maxAttacks) break;
      if (target.priority <= 0) continue;

      // Check if we still have enough units to attack
      const currentUnits = this._getAvailableAttackers(target.source, player.id);
      if (currentUnits.length === 0) continue;

      const attackPower = this._calculatePower(currentUnits, true);
      const defensePower = this._calculatePower(target.defenders, false);

      // Recalculate ratio in case units moved
      const ratio = attackPower / (defensePower || 0.5);
      const threshold = aiPlayer.difficulty === 'hard' ? 1.2 :
                       aiPlayer.difficulty === 'easy' ? 2.5 : 1.5;

      // Higher threshold if this would leave capital undefended
      const effectiveThreshold = target.leavesCapitalWeak ? threshold * 1.5 : threshold;

      if (ratio >= effectiveThreshold) {
        // Collect units to attack
        const unitsToMove = [];
        let unitsCommitted = 0;

        for (const unit of currentUnits) {
          const def = this.unitDefs?.[unit.type];
          if (def && def.attack > 0) {
            // Leave at least 1 unit behind unless this is a capital attack
            const qtyToMove = target.isEnemyCapital ? unit.quantity :
                             Math.max(1, unit.quantity - 1);

            if (qtyToMove > 0) {
              unitsToMove.push({ type: unit.type, quantity: qtyToMove });
              unitsCommitted += qtyToMove;
            }
          }
        }

        // Only attack if we're actually committing troops
        if (unitsToMove.length > 0 && unitsCommitted > 0) {
          this._updateStatus(`${player.name} attacking ${target.territory}...`);

          // Execute the move
          const moveResult = this.gameState.moveUnits(
            target.source,
            target.territory,
            unitsToMove,
            this.unitDefs
          );

          if (moveResult && moveResult.success !== false) {
            attacksMade++;
            const unitStr = unitsToMove.map(u => `${u.quantity} ${u.type}`).join(', ');
            this._logAction('attack', {
              message: `${player.name} attacks ${target.territory} with ${unitStr}`,
              from: target.source,
              to: target.territory
            }, player);

            await this._delay(this.skipMode ? 100 : 300);
          }
        }
      }
    }

    if (attacksMade === 0) {
      this._updateStatus(`${player.name} holds position...`);
    }

    this._notifyAction('combatMove', {});
    await this._delay(200);
    this.gameState.nextPhase();
    this._notifyAction('nextPhase', {});
  }

  // ============================================
  // STRATEGIC ANALYSIS
  // ============================================
  _analyzeStrategicSituation(playerId, difficulty) {
    const strategy = {
      myCapitals: 0,
      enemyCapitals: [],
      threatenedCapital: false,
      capitalDefenseNeeded: 0,
      nearVictory: false,
      enemyNearVictory: null,
    };

    // Count capitals controlled
    const capitalControl = {};
    const capitalLocations = {};

    for (const [territory, state] of Object.entries(this.gameState.territoryState)) {
      if (state.isCapital) {
        const owner = state.owner;
        capitalControl[owner] = (capitalControl[owner] || 0) + 1;

        if (!capitalLocations[owner]) capitalLocations[owner] = [];
        capitalLocations[owner].push(territory);

        if (owner !== playerId) {
          strategy.enemyCapitals.push({
            territory,
            owner,
            originalOwner: this._getOriginalCapitalOwner(territory)
          });
        }
      }
    }

    strategy.myCapitals = capitalControl[playerId] || 0;

    // Check if near victory (controlling 2+ capitals, need 3 to win)
    if (strategy.myCapitals >= 2) {
      strategy.nearVictory = true;
    }

    // Check if any enemy is near victory
    for (const [enemyId, count] of Object.entries(capitalControl)) {
      if (enemyId !== playerId && count >= 2) {
        strategy.enemyNearVictory = enemyId;
      }
    }

    // Check if our capital is threatened
    const myCapital = this.gameState.playerState[playerId]?.capitalTerritory;
    if (myCapital) {
      const threats = this._getThreatsToTerritory(myCapital, playerId);
      strategy.threatenedCapital = threats.totalPower > 0;

      // Calculate how much defense we need
      const myDefenders = this._getTerritoryDefenders(myCapital, playerId);
      const myDefense = this._calculatePower(myDefenders, false);
      strategy.capitalDefenseNeeded = Math.max(0, threats.totalPower * 1.5 - myDefense);
    }

    return strategy;
  }

  // Evaluate all potential attack targets with priority scores
  _evaluateAttackTargets(playerId, difficulty, strategy) {
    const targets = [];

    const owned = this.gameState.territories
      .filter(t => !t.isWater && this.gameState.getOwner(t.name) === playerId);

    const myCapital = this.gameState.playerState[playerId]?.capitalTerritory;

    for (const territory of owned) {
      const attackers = this._getAvailableAttackers(territory.name, playerId);
      if (attackers.length === 0) continue;

      const myPower = this._calculatePower(attackers, true);
      const connections = this.gameState.getConnections(territory.name);

      for (const targetName of connections) {
        const targetOwner = this.gameState.getOwner(targetName);
        const targetTerritory = this.gameState.territories.find(t => t.name === targetName);

        if (targetTerritory?.isWater) continue;
        if (!targetOwner || targetOwner === playerId) continue;
        if (this.gameState.areAllies?.(playerId, targetOwner)) continue;

        const defenders = this.gameState.units[targetName] || [];
        const defensePower = this._calculatePower(defenders, false);

        // Base priority: power ratio
        let priority = (myPower / (defensePower || 0.5)) * 10;

        // Check if this is an enemy capital
        const isEnemyCapital = strategy.enemyCapitals.some(c => c.territory === targetName);

        // Priority bonuses
        if (isEnemyCapital) {
          priority += 50; // High priority to capture capitals

          // Even higher if we're near victory
          if (strategy.nearVictory) {
            priority += 30; // Go for the win!
          }
        }

        // Bonus for attacking an enemy who is near victory
        if (strategy.enemyNearVictory === targetOwner) {
          priority += 25; // Stop them from winning
        }

        // Bonus for weak targets (easy conquest)
        if (defensePower < 3) {
          priority += 15;
        }

        // Check if attacking from here leaves our capital weak
        let leavesCapitalWeak = false;
        if (territory.name === myCapital || this._isAdjacentTo(territory.name, myCapital)) {
          if (strategy.threatenedCapital) {
            priority -= 30; // Don't weaken capital defense
            leavesCapitalWeak = true;
          }
        }

        // Difficulty adjustments
        if (difficulty === 'easy') {
          priority *= 0.7; // Less aggressive
          priority += Math.random() * 20; // More random
        } else if (difficulty === 'hard') {
          // Hard AI is more calculating, less random
          priority *= 1.2;
        } else {
          priority += Math.random() * 10; // Some randomness for medium
        }

        targets.push({
          territory: targetName,
          source: territory.name,
          defenders,
          priority,
          isEnemyCapital,
          leavesCapitalWeak,
        });
      }
    }

    return targets;
  }

  // Get available attacking units from a territory
  _getAvailableAttackers(territory, playerId) {
    const units = this.gameState.units[territory];
    if (!units) return [];

    return units.filter(u =>
      u.owner === playerId &&
      !u.moved &&
      this.unitDefs?.[u.type]?.attack > 0
    );
  }

  // Get defenders in a territory for a specific owner
  _getTerritoryDefenders(territory, playerId) {
    const units = this.gameState.units[territory];
    if (!units) return [];
    return units.filter(u => u.owner === playerId);
  }

  // Get threats to a territory from adjacent enemies
  _getThreatsToTerritory(territory, playerId) {
    const connections = this.gameState.getConnections(territory);
    let totalPower = 0;
    const threats = [];

    for (const conn of connections) {
      const owner = this.gameState.getOwner(conn);
      const isWater = this.gameState.territories.find(t => t.name === conn)?.isWater;

      if (owner && owner !== playerId && !isWater) {
        if (!this.gameState.areAllies?.(playerId, owner)) {
          const units = this.gameState.units[conn] || [];
          const power = this._calculatePower(units, true);
          if (power > 0) {
            totalPower += power;
            threats.push({ territory: conn, owner, power });
          }
        }
      }
    }

    return { totalPower, threats };
  }

  // Get the original owner of a capital territory
  _getOriginalCapitalOwner(territory) {
    for (const [playerId, state] of Object.entries(this.gameState.playerState)) {
      if (state.capitalTerritory === territory) {
        return playerId;
      }
    }
    return null;
  }

  // Check if two territories are adjacent
  _isAdjacentTo(territory1, territory2) {
    if (!territory1 || !territory2) return false;
    const connections = this.gameState.getConnections(territory1);
    return connections.includes(territory2);
  }

  // ============================================
  // COMBAT RESOLUTION
  // ============================================
  async _handleCombat(aiPlayer, player) {
    this._updateStatus(`${player.name} resolving combat...`);

    // Auto-resolve all combats
    while (this.gameState.combatQueue && this.gameState.combatQueue.length > 0) {
      const combat = this.gameState.combatQueue[0];
      this._updateStatus(`Battle for ${combat}...`);

      // Auto-battle until resolved
      let safety = 100;
      while (safety-- > 0) {
        const result = this.gameState.resolveCombat(combat, this.unitDefs);
        if (!result || result.resolved) break;
        await this._delay(this.skipMode ? 20 : 200);
      }

      await this._delay(this.skipMode ? 50 : 300);
    }

    this._notifyAction('combat', {});
    await this._delay(200);
    this.gameState.nextPhase();
    this._notifyAction('nextPhase', {});
  }

  // ============================================
  // NON-COMBAT MOVE - Strategic
  // ============================================
  async _handleNonCombatMove(aiPlayer, player) {
    this._updateStatus(`${player.name} repositioning units...`);
    await this._delay(this._getActionDelay() / 2);

    // Get strategic analysis
    const strategy = this._analyzeStrategicSituation(player.id, aiPlayer.difficulty);
    const myCapital = this.gameState.playerState[player.id]?.capitalTerritory;

    // Priority 1: Reinforce capital if threatened
    if (strategy.threatenedCapital && myCapital) {
      await this._reinforceCapital(player.id, myCapital, strategy);
    }

    // Priority 2: Move units toward enemy capitals if we're winning
    if (strategy.nearVictory && strategy.enemyCapitals.length > 0) {
      await this._advanceTowardCapitals(player.id, strategy);
    }

    // Priority 3: Reinforce frontline territories
    await this._reinforceFrontlines(player.id, aiPlayer.difficulty);

    // Island navy that still has cargo sails one sea toward an enemy coast.
    await this._projectIslandNavy(player, 'noncombat');

    this._notifyAction('nonCombatMove', {});
    this.gameState.nextPhase();
    this._notifyAction('nextPhase', {});
  }

  // Reinforce capital with nearby units
  async _reinforceCapital(playerId, capital, strategy) {
    const connections = this.gameState.getConnections(capital);
    const capitalDefense = this._calculatePower(
      this._getTerritoryDefenders(capital, playerId), false
    );

    // Need more defense than threats
    const needed = strategy.capitalDefenseNeeded;
    if (needed <= 0) return;

    let reinforced = 0;

    for (const source of connections) {
      if (this.gameState.getOwner(source) !== playerId) continue;
      if (reinforced >= needed) break;

      const units = this.gameState.units[source] || [];
      const myUnits = units.filter(u => u.owner === playerId && !u.moved);

      // Leave at least 1 unit behind
      for (const unit of myUnits) {
        if (unit.quantity > 1) {
          const toMove = Math.min(unit.quantity - 1, Math.ceil(needed - reinforced));
          if (toMove > 0) {
            const def = this.unitDefs?.[unit.type];
            const result = this.gameState.moveUnits(
              source,
              capital,
              [{ type: unit.type, quantity: toMove }],
              this.unitDefs
            );
            if (result && result.success !== false) {
              reinforced += (def?.defense || 1) * toMove;
            }
          }
        }
      }
    }

    if (reinforced > 0) {
      await this._delay(100);
    }
  }

  // Advance units toward enemy capitals when winning
  async _advanceTowardCapitals(playerId, strategy) {
    // Find closest enemy capital
    const targetCapital = strategy.enemyCapitals[0];
    if (!targetCapital) return;

    const owned = this.gameState.territories
      .filter(t => !t.isWater && this.gameState.getOwner(t.name) === playerId);

    for (const territory of owned) {
      const units = this.gameState.units[territory.name];
      if (!units || units.length <= 1) continue;

      const myUnits = units.filter(u => u.owner === playerId && !u.moved);
      if (myUnits.length === 0) continue;

      // Find path toward target capital
      const connections = this.gameState.getConnections(territory.name);
      const friendlyConnections = connections.filter(c =>
        this.gameState.getOwner(c) === playerId &&
        this._isCloserTo(c, targetCapital.territory, territory.name)
      );

      if (friendlyConnections.length > 0) {
        const destination = friendlyConnections[0];

        for (const unit of myUnits) {
          if (unit.quantity > 1) {
            const toMove = Math.floor(unit.quantity / 2);
            if (toMove > 0) {
              this.gameState.moveUnits(
                territory.name,
                destination,
                [{ type: unit.type, quantity: toMove }],
                this.unitDefs
              );
            }
          }
        }
        await this._delay(50);
      }
    }
  }

  // Reinforce frontline territories
  async _reinforceFrontlines(playerId, difficulty) {
    const owned = this.gameState.territories
      .filter(t => !t.isWater && this.gameState.getOwner(t.name) === playerId);

    for (const territory of owned) {
      const units = this.gameState.units[territory.name];
      if (!units || units.length === 0) continue;

      const myUnits = units.filter(u => u.owner === playerId && !u.moved);
      if (myUnits.length <= 1) continue;

      // Skip frontline territories - they don't need to send units away
      if (this._isFrontline(territory.name, playerId)) continue;

      // Find friendly frontline territories to reinforce
      const connections = this.gameState.getConnections(territory.name);
      for (const target of connections) {
        if (this.gameState.getOwner(target) !== playerId) continue;
        if (!this._isFrontline(target, playerId)) continue;

        const targetUnits = this.gameState.units[target] || [];
        const targetCount = targetUnits.filter(u => u.owner === playerId)
          .reduce((sum, u) => sum + u.quantity, 0);
        const sourceCount = myUnits.reduce((sum, u) => sum + u.quantity, 0);

        // Move half of excess units to frontline
        if (sourceCount > targetCount + 2) {
          const unitsToMove = [];
          for (const unit of myUnits) {
            if (unit.quantity > 1 && !unit.moved) {
              const toMove = Math.floor(unit.quantity / 2);
              if (toMove > 0) {
                unitsToMove.push({ type: unit.type, quantity: toMove });
              }
            }
          }

          if (unitsToMove.length > 0) {
            this.gameState.moveUnits(territory.name, target, unitsToMove, this.unitDefs);
            await this._delay(50);
          }
        }
      }
    }
  }

  // Check if territory A is closer to target than territory B
  _isCloserTo(a, target, b) {
    // Simple distance check using connections (BFS depth)
    const distA = this._getConnectionDistance(a, target);
    const distB = this._getConnectionDistance(b, target);
    return distA < distB;
  }

  // Get connection distance between two territories (simple BFS)
  _getConnectionDistance(from, to, maxDepth = 10) {
    if (from === to) return 0;

    const visited = new Set([from]);
    let queue = [from];
    let depth = 0;

    while (queue.length > 0 && depth < maxDepth) {
      depth++;
      const nextQueue = [];

      for (const current of queue) {
        const connections = this.gameState.getConnections(current);
        for (const conn of connections) {
          if (conn === to) return depth;
          if (!visited.has(conn)) {
            visited.add(conn);
            nextQueue.push(conn);
          }
        }
      }

      queue = nextQueue;
    }

    return maxDepth + 1; // Not found within max depth
  }

  // Load, sail, or unload one transport when the capital is an island.
  // Combat unloads onto an enemy coast. Non-combat only sails.
  async _projectIslandNavy(player, mode) {
    const capital = this.gameState.playerState[player.id]?.capitalTerritory;
    if (!isIslandCapital(this.gameState.territoryByName, capital)) return;

    const enemyLand = (name) => {
      const owner = this.gameState.getOwner(name);
      return !!(owner && owner !== player.id && !this.gameState.areAllies?.(player.id, owner));
    };
    const emptyLand = (name) => {
      const stacks = this.gameState.units[name] || [];
      return !stacks.some((unit) => (
        unit
        && unit.owner !== player.id
        && !this.gameState.areAllies?.(player.id, unit.owner)
        && unit.type !== 'factory'
        && (Number(unit.quantity) || 0) > 0
      ));
    };
    const seaHostile = (name) => (this.gameState.units[name] || []).some((unit) => (
      unit
      && unit.owner !== player.id
      && !this.gameState.areAllies?.(player.id, unit.owner)
      && (Number(unit.quantity) || 0) > 0
    ));

    if (mode === 'combat') {
      const assault = pickIslandAssault({
        territoryByName: this.gameState.territoryByName,
        units: this.gameState.units,
        playerId: player.id,
        enemyLand,
        emptyLand,
      });
      if (assault) {
        const dropped = this.gameState.unloadTransport(assault.sea, assault.transportIndex, assault.coast);
        if (dropped?.success !== false) {
          this._logAction('attack', {
            message: `${player.name} lands at ${assault.coast}`,
            from: assault.sea,
            to: assault.coast,
          }, player);
          return;
        }
      }
      const infantry = (this.gameState.units[capital] || [])
        .filter((unit) => unit.type === 'infantry' && unit.owner === player.id)
        .reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
      const load = pickTransportLoad({
        territoryByName: this.gameState.territoryByName,
        capitalName: capital,
        infantryAtCapital: infantry,
        units: this.gameState.units,
        playerId: player.id,
      });
      if (load) {
        this.gameState.moveUnits(
          load.from,
          load.sea,
          [{ type: load.unitType, quantity: load.quantity }],
          this.unitDefs,
        );
      }
    }

    const sail = pickTransportSail({
      territoryByName: this.gameState.territoryByName,
      units: this.gameState.units,
      playerId: player.id,
      enemyLand,
      seaHostile,
    });
    if (sail && (mode === 'combat' || mode === 'noncombat')) {
      this.gameState.moveUnits(sail.from, sail.to, [{ type: 'transport', quantity: 1 }], this.unitDefs);
    }
  }

  _refundPending(playerId, unitType) {
    const rows = (this.gameState.pendingPurchases || []).filter((row) => row.owner === playerId && row.type === unitType);
    for (const row of rows) {
      const refund = (Number(row.cost) || 0) * (Number(row.quantity) || 0);
      if (this.gameState.playerState?.[playerId]) {
        this.gameState.playerState[playerId].ipcs += refund;
      }
    }
    this.gameState.pendingPurchases = (this.gameState.pendingPurchases || [])
      .filter((row) => !(row.owner === playerId && row.type === unitType));
  }

  // ============================================
  // MOBILIZE (place purchased units)
  // ============================================
  async _handleMobilize(aiPlayer, player) {
    this._updateStatus(`${player.name} mobilizing units...`);
    await this._delay(this._getActionDelay() / 2);

    // Island-start factories are queued in purchase and placed here.
    const pending = (this.gameState.pendingPurchases || [])
      .filter((row) => row.owner === player.id && row.type === 'factory' && row.territory);
    for (const row of pending) {
      const qty = row.quantity || 0;
      for (let i = 0; i < qty; i++) {
        const placed = this.gameState.mobilizeUnit('factory', row.territory, this.unitDefs);
        if (!placed?.success) {
          this._refundPending(player.id, 'factory');
          break;
        }
      }
    }

    // Units are placed during purchase at capital, just advance
    this._notifyAction('mobilize', {});
    this.gameState.nextPhase();
    this._notifyAction('nextPhase', {});
  }

  // ============================================
  // HELPER METHODS
  // ============================================
  _calculatePower(units, isAttack) {
    if (!units || !this.unitDefs) return 0;
    let power = 0;
    for (const unit of units) {
      const def = this.unitDefs[unit.type];
      if (!def) continue;
      power += (isAttack ? def.attack : def.defense) * (unit.quantity || 1);
    }
    return power;
  }


  _pickPlacementTerritory(territories, playerId, difficulty) {
    const myCapital = this.gameState.playerState[playerId]?.capitalTerritory;

    // Score each territory based on strategic value
    const scored = territories.map(t => {
      let score = 0;

      // Highest priority: own capital (concentrate defense)
      if (t === myCapital) {
        score += 100;
      }

      // High priority: adjacent to own capital
      if (myCapital && this._isAdjacentTo(t, myCapital)) {
        score += 60;
      }

      // High priority: adjacent to enemy capitals (offensive position)
      const adjacentToEnemyCapital = this._isAdjacentToEnemyCapital(t, playerId);
      if (adjacentToEnemyCapital) {
        score += 80;
      }

      // Medium priority: frontline territories
      if (this._isFrontline(t, playerId)) {
        score += 30;
      }

      // Lower priority: territories with many connections (strategic)
      const connections = this.gameState.getConnections(t);
      score += connections.length * 2;

      // Penalty for territories far from any frontline
      if (!this._isFrontline(t, playerId) && !this._isAdjacentTo(t, myCapital)) {
        score -= 20;
      }

      return { territory: t, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    if (difficulty === 'hard') {
      // Hard AI: always pick best or second best
      const topChoices = scored.slice(0, 2);
      return topChoices[Math.floor(Math.random() * topChoices.length)].territory;
    } else if (difficulty === 'medium') {
      // Medium AI: pick from top 4
      const topChoices = scored.slice(0, Math.min(4, scored.length));
      return topChoices[Math.floor(Math.random() * topChoices.length)].territory;
    } else {
      // Easy AI: pick from top half, with some randomness
      const topHalf = scored.slice(0, Math.max(1, Math.floor(scored.length / 2)));
      return topHalf[Math.floor(Math.random() * topHalf.length)].territory;
    }
  }

  // Check if territory is adjacent to any enemy capital
  _isAdjacentToEnemyCapital(territory, playerId) {
    const connections = this.gameState.getConnections(territory);
    for (const conn of connections) {
      // Check if this connection is someone else's capital
      for (const [pId, pState] of Object.entries(this.gameState.playerState)) {
        if (pId !== playerId && pState.capitalTerritory === conn) {
          return true;
        }
      }
    }
    return false;
  }

  _findCentralTerritory(territories, playerId) {
    let best = territories[0];
    let bestScore = 0;

    for (const t of territories) {
      const connections = this.gameState.getConnections(t);
      const friendlyNeighbors = connections.filter(c =>
        this.gameState.getOwner(c) === playerId
      ).length;
      if (friendlyNeighbors > bestScore) {
        bestScore = friendlyNeighbors;
        best = t;
      }
    }
    return best;
  }

  _isFrontline(territory, playerId) {
    const connections = this.gameState.getConnections(territory);
    return connections.some(c => {
      const owner = this.gameState.getOwner(c);
      const isWater = this.gameState.territories.find(t => t.name === c)?.isWater;
      return owner && owner !== playerId && !isWater;
    });
  }

  _getAdjacentSeaZones(playerId) {
    const seaZones = new Set();
    const owned = this.gameState.territories
      .filter(t => !t.isWater && this.gameState.getOwner(t.name) === playerId);

    for (const territory of owned) {
      const t = this.gameState.territories.find(x => x.name === territory.name);
      if (!t?.connections) continue;

      for (const conn of t.connections) {
        const connT = this.gameState.territories.find(x => x.name === conn);
        if (connT?.isWater) {
          seaZones.add(conn);
        }
      }
    }
    return [...seaZones];
  }

  _notifyAction(action, data) {
    if (this.onAction) {
      this.onAction(action, data);
    }
  }

  _delay(ms) {
    // Hidden tab: skip cosmetic delays entirely. Nobody is watching, and
    // browsers throttle chained timers in hidden tabs so hard (≥1s each,
    // eventually 1/minute) that AI turns would stall for minutes — in
    // multiplayer this froze the game whenever the host alt-tabbed away.
    if (typeof document !== 'undefined' && document.hidden) {
      return Promise.resolve();
    }
    // In skip mode, use minimal delays
    const actualDelay = this.skipMode ? Math.min(ms, 50) : ms;
    return new Promise(resolve => setTimeout(resolve, actualDelay));
  }

  // Get appropriate delay based on skip mode
  _getActionDelay() {
    if (this.skipMode) return 100;
    return 800; // Default visible delay so players can see moves
  }
}
