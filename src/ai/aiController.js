// AI Controller - manages AI players and triggers their turns
// Handles ALL game phases autonomously for AI players

import { AIPlayer } from './aiPlayer.js';
import { GAME_PHASES, TURN_PHASES } from '../state/gameState.js';
import { DIRECT_TECH_IPC_COST, airUnitsEnabled, navalUnitsEnabled, unitFamilyEnabled } from '../gameOptions.js';
import { tacticalBombersEnabled } from '../state/tacticalPairing.js';
import { MECHANIZED_INFANTRY, mechanizedInfantryEnabled } from '../state/mechanizedInfantry.js';
import { capitalChoicePool, pickCapitalFromPool } from './capitalSpacing.js';
import {
  allowsLosingTrade,
  captureWinsGame,
  difficultyKnobs,
  normalizeAiDifficulty,
} from './difficulty.js';
import {
  attackPriorityBonus,
  capitalBiasScore,
  capitalPlacementFacts,
  layeredKnobs,
  nukeUnitType,
  NUKE_TECH_CANDIDATES,
  preferredTechId,
  techBias,
  tiltPurchasePriorities,
} from './specialization.js';
import {
  adjacentSeas,
  countOwned,
  isIslandCapital,
  landMoveTargets,
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
          this._seatLevel(player)
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
        this._seatLevel(currentPlayer)
      );
      newAI.unitDefs = this.unitDefs;
      this.aiPlayers[currentPlayer.id] = newAI;
    }

    this.isProcessing = true;
    this._updateStatus(`${currentPlayer.name} is thinking...`);
    const seatAtStart = currentPlayer.id;
    const progressBefore = this._aiProgressKey();

    try {
      await this._processAITurn(this.aiPlayers[currentPlayer.id], currentPlayer);
    } catch (err) {
      console.error('[AI] Error during AI turn:', err);
    }

    // A thrown phase, a battle that cannot hit, or a placement that cannot
    // legally finish must not leave the seat here. The turn ping never fires
    // until this client hands off.
    if (
      this._hasAuthority()
      && !this.gameState.gameOver
      && this.gameState.currentPlayer?.id === seatAtStart
      && this.gameState.currentPlayer?.isAI
      && this._aiProgressKey() === progressBefore
    ) {
      this._forceAiHandoff(this.gameState.currentPlayer);
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
    if (phase === GAME_PHASES.TERRITORY_DRAFT) {
      await this._handleDraftPick(player);
    } else if (phase === GAME_PHASES.CAPITAL_PLACEMENT) {
      await this._handleCapitalPlacement(aiPlayer, player);
    } else if (phase === GAME_PHASES.UNIT_PLACEMENT) {
      await this._handleInitialPlacement(aiPlayer, player);
    } else if (phase === GAME_PHASES.PLAYING) {
      await this._handlePlayingPhase(aiPlayer, player, turnPhase);
    }
  }

  // ============================================
  // TERRITORY DRAFT
  // ============================================
  async _handleDraftPick(player) {
    this._updateStatus(`${player.name} is drafting a territory...`);
    const choice = this.gameState.chooseAiDraftTerritory(player.id);
    if (!choice) return;
    const ok = this.gameState.pickDraftTerritory(choice);
    if (ok !== true) return;
    this._updateStatus(`${player.name} drafts ${choice}`);
    this._logAction('draft', { message: `${player.name} drafted ${choice}`, territory: choice }, player);
    this._notifyAction('draftPick', { territory: choice });
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

    // Prefer a territory at least two steps from capitals already placed.
    // If none exist, the pool is `owned` in today's order and the same
    // difficulty rules run on it.
    const existingCapitals = [];
    for (const [id, state] of Object.entries(this.gameState.playerState || {})) {
      if (id !== player.id && state?.capitalTerritory) {
        existingCapitals.push(state.capitalTerritory);
      }
    }
    const pool = capitalChoicePool(
      owned,
      existingCapitals,
      (name) => this.gameState.getConnections(name),
    );
    const knobs = this._seatKnobs(player);
    const choice = pickCapitalFromPool(pool, this._placementTier(aiPlayer, player), {
      connectionCount: (territory) => this.gameState.getConnections(territory).length,
      friendlyNeighborCount: (territory) => this.gameState.getConnections(territory)
        .filter((neighbor) => this.gameState.getOwner(neighbor) === player.id).length,
      random: Math.random,
      biasScore: knobs.capitalBias === 'none'
        ? null
        : (territory) => capitalBiasScore(knobs.capitalBias, this._capitalFacts(territory)),
    });
    if (!choice) return;

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

      // One illegal sea must not abandon the land still in the pool.
      // Try every open destination, then the next unit type.
      const pool = this.gameState.getUnitsToPlace(player.id);
      let placed = false;
      for (const unit of pool) {
        if (!(unit.quantity > 0) || placed) continue;
        const def = this.unitDefs?.[unit.type];
        if (!def) continue;
        const spots = def.isSea
          ? ownedSeas.filter((sea) => this._setupSeaIsOpen(sea, player.id))
          : ownedLand;
        if (spots.length === 0) continue;
        const ordered = def.isSea
          ? spots
          : [this._pickPlacementTerritory(spots, player.id, this._placementTier(aiPlayer, player)), ...spots];
        for (const territory of ordered) {
          if (!territory) continue;
          const result = this.gameState.placeInitialUnit(territory, unit.type, this.unitDefs);
          if (result?.success) {
            placedThisRound++;
            placed = true;
            await this._delay(150);
            this._notifyAction('placeUnit', { unitType: unit.type, territory });
            break;
          }
        }
      }
      if (!placed) break;
    }

    // Finish placement round after placing units. Leftover ships with
    // nowhere legal to go must not pin the seat on this round.
    await this._delay(300);
    if (!this._hasAuthority()) return;
    const done = this.gameState.finishPlacementRound(this.unitDefs);
    if (done?.ok === false && done.reason === 'not-ready') {
      this.gameState.finishPlacementRound(this.unitDefs, { allowNavalSkip: true });
    }
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
    if (this.gameState.gameOptions?.techAcquisition === 'buy') {
      this.gameState.nextPhase();
      this._notifyAction('nextPhase', {});
      return;
    }
    this._updateStatus(`${player.name} considering technology research...`);
    await this._delay(this._getActionDelay() / 2);

    const ipcs = this.gameState.getIPCs(player.id);
    const availableTechs = this.gameState.getAvailableTechs?.(player.id) || [];

    // Decide whether to research based on difficulty and resources.
    // A specialization spends earlier only when its named tech is actually
    // in the list. A missing id leaves the difficulty rule alone.
    let diceCount = 0;
    const level = this._seatLevel(player, aiPlayer);
    const bias = techBias(player?.aiSpecialization, availableTechs, this.gameState?.gameOptions);
    if (availableTechs.length > 0 && ipcs >= 5) {
      if (bias.eager && ipcs >= 10) {
        const cap = level === 'easy' ? 2 : 3;
        diceCount = Math.min(cap, Math.floor(ipcs / 5));
      } else if ((level === 'hard' || level === 'hardest') && ipcs >= 15) {
        diceCount = Math.min(3, Math.floor(ipcs / 5));
      } else if (level === 'medium' && ipcs >= 20) {
        diceCount = Math.min(2, Math.floor(ipcs / 5));
      } else if (level === 'easy' && ipcs >= 30 && Math.random() > 0.5) {
        diceCount = 1;
      }
    }

    if (diceCount > 0) {
      this._updateStatus(`${player.name} researching technology (${diceCount} dice)...`);
      this.gameState.purchaseTechDice(player.id, diceCount);
      await this._delay(500);

      const result = this.gameState.rollTechDice(player.id);
      let picks = result.picks ?? (result.success ? 1 : 0);
      while (picks > 0) {
        const next = this.gameState.getAvailableTechs?.(player.id) || [];
        if (next.length === 0) break;
        const pick = preferredTechId(player?.aiSpecialization, next, this.gameState?.gameOptions) || next[0];
        this.gameState.unlockTech(player.id, pick);
        this._updateStatus(`${player.name} unlocked ${pick}!`);
        picks -= 1;
      }
      await this._delay(300);
    }

    this.gameState.nextPhase();
    this._notifyAction('nextPhase', {});
  }

  // ============================================
  // PURCHASE PHASE - Strategic
  // ============================================
  _maybeBuyDirectTech(player) {
    if (this.gameState.gameOptions?.techAcquisition !== 'buy') return;
    const level = this._seatLevel(player);
    const available = this.gameState.getAvailableTechs?.(player.id) || [];
    if (!available.length) return;
    const bias = techBias(player?.aiSpecialization, available, this.gameState?.gameOptions);
    if (level === 'easy' && !bias.eager) return;
    const ipcs = this.gameState.getIPCs(player.id);
    const reserve = bias.eager || level === 'hard' || level === 'hardest' ? 0 : 35;
    if (ipcs < DIRECT_TECH_IPC_COST + reserve) return;
    const pick = bias.pick || available[0];
    this.gameState.buyTech(player.id, pick);
  }

  _cashRequiredRiskCards(player) {
    let guard = 0;
    while (this.gameState.mustCashRiskCards?.(player.id) && guard < 8) {
      guard += 1;
      const result = this.gameState.tradeRiskCards(player.id);
      if (!result?.success) break;
    }
  }

  async _handlePurchase(aiPlayer, player) {
    this._cashRequiredRiskCards(player);
    this._maybeBuyDirectTech(player);
    this._updateStatus(`${player.name} purchasing units...`);
    await this._delay(this._getActionDelay());

    this.gameState.repairIfNothingCanBePlaced?.(player.id);
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

    // Get strategic analysis. Difficulty sets the ratios. Specialization
    // only tilts boats, the unit mix, and tech.
    const level = this._seatLevel(player, aiPlayer);
    const knobs = this._seatKnobs(player);
    const strategy = this._analyzeStrategicSituation(player.id, level);

    const capitalZone = this.gameState.territoryByName?.[capital];
    const landBridges = this.gameState.activeLandBridges?.();
    const islandStart = isIslandCapital(this.gameState.territoryByName, capital, landBridges);
    const landPath = this._hasLandPathToEnemy(player.id);
    // Harder and Hardest buy boats only when no land path reaches an enemy.
    // Easier and Medium keep today's island navy.
    const navalOn = navalUnitsEnabled(this.gameState?.gameOptions);
    const airOn = airUnitsEnabled(this.gameState?.gameOptions);
    const buyBoats = navalOn && islandStart && !strategy.threatenedCapital && !!capitalZone
      && !(knobs.boatsNeedNoLandPath && landPath);
    let remaining = ipcs;
    const purchased = [];

    // Island capitals (no land step, including land bridges) buy a
    // transport and an escort before a land army. Japan, the UK, and
    // Eire can walk, so they keep the normal purchase list.
    if (buyBoats) {
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
          landBridges,
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
          if (!this._queuePurchase(buy.unitType, where)) break;
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

    // Admiral buys a transport and an escort from a coastal capital even
    // when a land path exists. The island plan above already did that
    // job, so this runs only when that plan was skipped. Land buys follow.
    if (navalOn && !buyBoats && knobs.preferBoats && !strategy.threatenedCapital && capitalZone) {
      const sea = adjacentSeas(this.gameState.territoryByName, capital)[0];
      if (sea) {
        const plan = planIslandNavyPurchases({
          ipcs: remaining,
          unitDefs: this.unitDefs,
          transportCount: countOwned(this.gameState.units, player.id, ['transport']),
          escortCount: countOwned(this.gameState.units, player.id, ['submarine', 'destroyer', 'cruiser', 'battleship', 'carrier']),
          threatened: false,
          reserve: 0,
        });
        for (const buy of plan.buys) {
          if (buy.placement !== 'sea') continue;
          for (let i = 0; i < buy.count; i++) {
            if (!this._queuePurchase(buy.unitType, sea)) break;
            remaining -= this.unitDefs[buy.unitType]?.cost || 0;
            purchased.push(buy.unitType);
          }
        }
      }
    }

    // Determine purchase priorities based on strategic situation.
    // An island start already spent on navy; skip the continental list
    // unless the capital is threatened and the navy plan was skipped.
    const priorities = buyBoats
      ? []
      : tiltPurchasePriorities(
        this._getStrategicPurchasePriorities(level, strategy, player.id),
        knobs.specialization,
        {
          mechanized: mechanizedInfantryEnabled(this.gameState?.gameOptions),
          nukeUnit: knobs.specialization === 'rico' ? nukeUnitType(this.unitDefs) : null,
          gameOptions: this.gameState?.gameOptions,
        },
      );

    for (const { unitType, maxCount } of priorities) {
      const def = this.unitDefs[unitType];
      if (!def || def.cost > remaining) continue;
      if (!unitFamilyEnabled(this.gameState?.gameOptions, unitType, def)) continue;
      // Off never lists this unit. On buys one only when a fighter or tank
      // is already on the board or was just purchased this phase.
      if (unitType === 'tacticalBomber') {
        if (!tacticalBombersEnabled(this.gameState?.gameOptions)) continue;
        if (this._pairingPartnerCount(player.id) < 1) continue;
      }
      if (unitType === MECHANIZED_INFANTRY && !mechanizedInfantryEnabled(this.gameState?.gameOptions)) {
        continue;
      }

      // Buy units up to max count
      let count = Math.min(maxCount, Math.floor(remaining / def.cost));

      for (let i = 0; i < count && remaining >= def.cost; i++) {
        if (!this._queuePurchase(unitType, capital)) break;
        remaining -= def.cost;
        purchased.push(unitType);
      }
    }

    // Bombadere still wants one bomber when the island navy skipped the
    // land list. A threatened capital keeps the defensive buy.
    if (airOn && knobs.raidFactories && !strategy.threatenedCapital && !purchased.includes('bomber')) {
      const bomber = this.unitDefs?.bomber;
      if (bomber && remaining >= bomber.cost) {
        if (this._queuePurchase('bomber', capital)) {
          remaining -= bomber.cost;
          purchased.push('bomber');
        }
      }
    }

    // Island starts skip the land list. One tactical bomber from what the
    // navy plan left, and only when a fighter or tank is already owned.
    if (airOn && tacticalBombersEnabled(this.gameState?.gameOptions)
      && islandStart
      && !strategy.threatenedCapital
      && this._pairingPartnerCount(player.id) > 0) {
      const tac = this.unitDefs.tacticalBomber;
      if (tac && remaining >= tac.cost) {
        if (this._queuePurchase('tacticalBomber', capital)) {
          remaining -= tac.cost;
          purchased.push('tacticalBomber');
        }
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
    const level = normalizeAiDifficulty(difficulty);
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
      if (level === 'hard' || level === 'hardest') {
        priorities.push({ unitType: 'armour', maxCount: 3 });
        priorities.push({ unitType: 'artillery', maxCount: 2 });
        priorities.push({ unitType: 'fighter', maxCount: 1 });
        priorities.push({ unitType: 'infantry', maxCount: 5 });
      } else if (level === 'easy') {
        priorities.push({ unitType: 'infantry', maxCount: 4 });
        priorities.push({ unitType: 'armour', maxCount: 1 });
      } else {
        priorities.push({ unitType: 'infantry', maxCount: 4 });
        priorities.push({ unitType: 'armour', maxCount: 2 });
        priorities.push({ unitType: 'artillery', maxCount: 2 });
      }
    }

    this._insertTacticalBomberPriority(priorities);
    this._insertMechanizedInfantryPriority(priorities);
    return priorities;
  }

  // A few mechanized infantry, next to the infantry row. No-op while the
  // option is off, so the purchase list stays today's.
  _insertMechanizedInfantryPriority(priorities) {
    if (!mechanizedInfantryEnabled(this.gameState?.gameOptions)) return;
    if (!priorities.length) return;
    const infantryAt = priorities.findIndex((row) => row.unitType === 'infantry');
    const at = infantryAt >= 0 ? infantryAt + 1 : priorities.length;
    priorities.splice(at, 0, { unitType: MECHANIZED_INFANTRY, maxCount: 2 });
  }

  // One tactical bomber, next to the fighter or tank it pairs with.
  // No-op while the option is off, so the purchase list stays today's.
  _insertTacticalBomberPriority(priorities) {
    if (!tacticalBombersEnabled(this.gameState?.gameOptions)) return;
    const fighterAt = priorities.findIndex((row) => row.unitType === 'fighter');
    const armourAt = priorities.findIndex((row) => row.unitType === 'armour');
    const anchor = fighterAt >= 0 ? fighterAt : armourAt;
    if (anchor < 0) return;
    priorities.splice(anchor + 1, 0, { unitType: 'tacticalBomber', maxCount: 1 });
  }

  // Fighters and tanks (catalog id armour), including cargo and carrier air.
  _pairingPartnerCount(playerId) {
    let total = 0;
    const add = (unit) => {
      if (!unit || unit.owner !== playerId) return;
      if (unit.type !== 'fighter' && unit.type !== 'armour') return;
      const raw = unit.quantity;
      const qty = raw == null ? 1 : Number(raw);
      if (qty > 0) total += qty;
    };
    for (const stack of Object.values(this.gameState?.units || {})) {
      for (const unit of stack || []) {
        add(unit);
        for (const air of unit.aircraft || []) add(air);
        for (const cargo of unit.cargo || []) add(cargo);
      }
    }
    // Queued this phase. They are not on the board until mobilize.
    for (const row of this.gameState?.pendingPurchases || []) {
      if (!row || row.owner !== playerId) continue;
      if (row.type !== 'fighter' && row.type !== 'armour') continue;
      const qty = Number(row.quantity) || 0;
      if (qty > 0) total += qty;
    }
    return total;
  }

  // ============================================
  // COMBAT MOVE - Strategic AI
  // ============================================
  async _handleCombatMove(aiPlayer, player) {
    this._updateStatus(`${player.name} planning attacks...`);
    await this._delay(this._getActionDelay());

    // Get strategic analysis. The seat's stored level is the only input.
    // Specialization adds a priority nudge and, for Bombadere, factory raids.
    const level = this._seatLevel(player, aiPlayer);
    const knobs = this._seatKnobs(player);
    const strategy = this._analyzeStrategicSituation(player.id, level);
    const denial = knobs.denyContinent ? this._denialTarget(player.id) : null;

    await this._raidFactories(player);
    await this._projectIslandNavy(player, 'combat');

    // Adjacent land attacks only. Hardest does not search past this list.
    const attackTargets = this._evaluateAttackTargets(player.id, level, strategy, denial);

    // Sort by priority (highest first)
    attackTargets.sort((a, b) => b.priority - a.priority);

    // Execute attacks starting with highest priority
    let attacksMade = 0;
    let parkedDenial = false;
    const maxAttacks = knobs.attackCap;
    const myCapital = this.gameState.playerState[player.id]?.capitalTerritory;

    for (const target of attackTargets) {
      if (attacksMade >= maxAttacks) break;
      if (target.priority <= 0) continue;
      if (parkedDenial && denial && denial.lands.includes(target.territory) && target.territory !== denial.territory) {
        continue;
      }

      // Check if we still have enough units to attack
      const currentUnits = this._getAvailableAttackers(target.source, player.id);
      if (currentUnits.length === 0) continue;

      const attackPower = this._calculatePower(currentUnits, true);
      const defensePower = this._calculatePower(target.defenders, false);

      // Recalculate ratio in case units moved
      const ratio = attackPower / (defensePower || 0.5);
      const threshold = knobs.attackRatio;

      // Higher threshold if this would leave capital undefended
      const effectiveThreshold = target.leavesCapitalWeak ? threshold * 1.5 : threshold;
      const winsGame = captureWinsGame(this.gameState, player.id, target.territory);
      const takeFight = ratio >= effectiveThreshold || allowsLosingTrade(level, winsGame);

      if (takeFight) {
        // Collect units to attack
        const unitsToMove = [];
        let unitsCommitted = 0;

        for (const unit of currentUnits) {
          const def = this.unitDefs?.[unit.type];
          if (def && def.attack > 0) {
            // Leave at least 1 unit behind unless this is a capital attack.
            // Easier never empties its own capital.
            let qtyToMove = target.isEnemyCapital ? unit.quantity :
                             Math.max(1, unit.quantity - 1);
            if (knobs.keepCapitalGarrison && target.source === myCapital) {
              qtyToMove = Math.max(0, (unit.quantity || 0) - 1);
            }

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
            if (denial && target.territory === denial.territory) parkedDenial = true;
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

    // Purchase gear-up stays the existing signal. Hardest's losing trade
    // uses the live win instead (Classic capitals, or a Pacific city).
    if (strategy.myCapitals >= 2) {
      strategy.nearVictory = true;
    }

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
      strategy.adjacentThreat = threats.totalPower;

      // Match the force next door. Harder uses 1x. Easier and Medium
      // keep a 1.5x cushion. Neither is a fixed pile of units.
      const myDefenders = this._getTerritoryDefenders(myCapital, playerId);
      const myDefense = this._calculatePower(myDefenders, false);
      const multiplier = difficultyKnobs(difficulty).capitalThreatMultiplier;
      strategy.capitalDefenseNeeded = Math.max(0, threats.totalPower * multiplier - myDefense);
    }

    return strategy;
  }

  // Evaluate all potential attack targets with priority scores
  _evaluateAttackTargets(playerId, difficulty, strategy, denial = null) {
    const targets = [];
    const level = normalizeAiDifficulty(difficulty);
    const finish = difficultyKnobs(level).walkContinent
      ? this._finishableContinent(playerId, level)
      : null;

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

        if (finish && finish.gap === targetName) priority += 40;
        if (denial && !denial.ownedByUs && denial.territory === targetName) priority += 35;

        // Easier is less aggressive and a bit random. Medium takes the
        // best even fight with no jitter. Harder and Hardest do not roll.
        if (level === 'easy') {
          priority *= 0.7;
          priority += Math.random() * 20;
        } else if (level === 'hard' || level === 'hardest') {
          priority *= 1.2;
        }

        const seat = this.gameState.getPlayer?.(playerId);
        priority += attackPriorityBonus(seat?.aiSpecialization, {
          coastal: adjacentSeas(this.gameState.territoryByName, targetName).length > 0,
          defensePower,
          hasArmour: attackers.some((unit) => unit.type === 'armour' && (unit.quantity || 0) > 0),
          factory: (this.gameState.units[targetName] || []).some((unit) => unit.type === 'factory'),
          isEnemyCapital,
          nukeReady: this._nukeReady(playerId),
        }, this.gameState?.gameOptions);

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

    // AI does not choose raids. Anything already flagged (a human did) still resolves.
    while (this.gameState.raidQueue && this.gameState.raidQueue.length > 0) {
      const territory = this.gameState.raidQueue[0];
      this.gameState.resolveStrategicRaid(territory, this.unitDefs);
      await this._delay(this.skipMode ? 20 : 200);
    }

    // Auto-resolve all combats. A battle that never sets resolved used to
    // spin here forever, so the turn never ended and no turn ping was sent.
    let battles = 0;
    while (this.gameState.combatQueue && this.gameState.combatQueue.length > 0 && battles++ < 30) {
      const combat = this.gameState.combatQueue[0];
      this._updateStatus(`Battle for ${combat}...`);

      let safety = 100;
      while (safety-- > 0) {
        const result = this.gameState.resolveCombat(combat, this.unitDefs);
        if (!result || result.resolved) break;
        await this._delay(this.skipMode ? 20 : 200);
      }

      if (this.gameState.combatQueue?.[0] === combat) {
        this.gameState.combatQueue = this.gameState.combatQueue.filter((name) => name !== combat);
        this.gameState._endBattle?.(combat);
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

    // Classic aircraft are still airborne after combat. Land them now,
    // inside non-combat, using the movement they have left.
    this.gameState.landAirDuringNonCombat?.(this.unitDefs);

    // Get strategic analysis
    const level = this._seatLevel(player, aiPlayer);
    const knobs = difficultyKnobs(level);
    const strategy = this._analyzeStrategicSituation(player.id, level);
    const myCapital = this.gameState.playerState[player.id]?.capitalTerritory;
    const denial = knobs.denyContinent ? this._denialTarget(player.id) : null;
    const hold = denial?.ownedByUs ? denial.territory : null;

    // Priority 1: Reinforce capital if threatened
    if (strategy.threatenedCapital && myCapital) {
      await this._reinforceCapital(player.id, myCapital, strategy, hold);
    }

    // Harder and Hardest walk one step toward a continent they can finish.
    if (knobs.walkContinent) {
      await this._walkTowardContinent(player.id, level);
    }

    // Priority 2: Move units toward enemy capitals if a real win is open
    if (strategy.nearVictory && strategy.enemyCapitals.length > 0 && level !== 'easy') {
      await this._advanceTowardCapitals(player.id, strategy, hold);
    }

    // Easier leaves the rest of the map thin. Medium and above still
    // reinforce a front.
    if (knobs.spreadToFront) {
      await this._reinforceFrontlines(player.id, level, hold);
    }

    // Island navy that still has cargo sails one sea toward an enemy coast.
    await this._projectIslandNavy(player, 'noncombat');

    this._notifyAction('nonCombatMove', {});
    this.gameState.nextPhase();
    this._notifyAction('nextPhase', {});
  }

  // Reinforce capital with nearby units
  async _reinforceCapital(playerId, capital, strategy, hold = null) {
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

      if (source === hold) continue;
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
  async _advanceTowardCapitals(playerId, strategy, hold = null) {
    // Find closest enemy capital
    const targetCapital = strategy.enemyCapitals[0];
    if (!targetCapital) return;

    const owned = this.gameState.territories
      .filter(t => !t.isWater && this.gameState.getOwner(t.name) === playerId);

    for (const territory of owned) {
      if (territory.name === hold) continue;
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
  async _reinforceFrontlines(playerId, difficulty, hold = null) {
    const owned = this.gameState.territories
      .filter(t => !t.isWater && this.gameState.getOwner(t.name) === playerId);

    for (const territory of owned) {
      if (territory.name === hold) continue;
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
    const island = isIslandCapital(this.gameState.territoryByName, capital, this.gameState.activeLandBridges?.());
    // Admiral sails and lands even when the capital is not an island.
    const admiral = this._seatKnobs(player).preferBoats;
    if (!island && !admiral) return;

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
    const ipcBefore = this.gameState._ledgerIpc
      ? { ...this.gameState._ledgerIpc }
      : null;
    const rows = (this.gameState.pendingPurchases || []).filter((row) => row.owner === playerId && row.type === unitType);
    for (const row of rows) {
      const refund = (Number(row.cost) || 0) * (Number(row.quantity) || 0);
      if (this.gameState.playerState?.[playerId]) {
        this.gameState.playerState[playerId].ipcs += refund;
      }
    }
    this.gameState.pendingPurchases = (this.gameState.pendingPurchases || [])
      .filter((row) => !(row.owner === playerId && row.type === unitType));
    this.gameState._emitLedger?.('purchase', {
      playerId,
      ipcBefore,
      payload: { action: 'refundPending', unitType },
    });
  }

  // ============================================
  // MOBILIZE (place purchased units)
  // ============================================
  _queuePurchase(unitType, territory) {
    const result = this.gameState.addToPendingPurchases(unitType, this.unitDefs, territory || null);
    return !!(result && result.success);
  }

  _mobilizeWhere(player, row) {
    const def = this.unitDefs?.[row.type];
    if (!def) return null;
    const capital = this.gameState.playerState[player.id]?.capitalTerritory || null;
    const seas = [...(this.gameState._getValidNavalPlacementZones?.(player.id) || [])];
    const started = this.gameState.factoriesAtTurnStart;
    const landFactories = (started instanceof Set && started.size > 0)
      ? [...started]
      : (this.gameState._getFactoryTerritories?.(player.id) || []);
    if (def.isSea) {
      if (row.territory && seas.includes(row.territory)) return [row.territory, ...seas.filter((name) => name !== row.territory)];
      return seas;
    }
    if (def.isBuilding) return row.territory ? [row.territory] : [];
    const preferred = (row.territory && landFactories.includes(row.territory))
      ? row.territory
      : (landFactories.includes(capital) ? capital : landFactories[0]);
    return preferred ? [preferred] : [];
  }

  async _handleMobilize(aiPlayer, player) {
    this._updateStatus(`${player.name} mobilizing units...`);
    await this._delay(this._getActionDelay() / 2);

    // Same placement rules as a human: sea to a factory sea zone, land and
    // air onto a factory territory. Nothing loads onto a transport here.
    const pending = (this.gameState.pendingPurchases || [])
      .filter((row) => row.owner === player.id && (row.quantity || 0) > 0);
    for (const row of pending) {
      const qty = row.quantity || 0;
      for (let i = 0; i < qty; i++) {
        const choices = this._mobilizeWhere(player, row);
        let placed = null;
        for (const where of choices) {
          placed = this.gameState.mobilizeUnit(row.type, where, this.unitDefs);
          if (placed?.success) break;
        }
        if (!placed?.success) {
          this._refundPending(player.id, row.type);
          break;
        }
      }
    }

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

    const tier = normalizeAiDifficulty(difficulty);
    if (tier === 'hard' || tier === 'hardest') {
      // Hard AI: always pick best or second best
      const topChoices = scored.slice(0, 2);
      return topChoices[Math.floor(Math.random() * topChoices.length)].territory;
    } else if (tier === 'medium') {
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

  // Bombadere sends bombers on a factory raid before the land attacks.
  // Other specializations, and a tree with no bomber, do nothing.
  async _raidFactories(player) {
    if (!this._seatKnobs(player).raidFactories) return;
    const range = (this.unitDefs?.bomber?.movement || 6)
      + (this.gameState.hasTech?.(player.id, 'longRangeAircraft') ? 2 : 0);
    const factories = [];
    for (const territory of this.gameState.territories || []) {
      if (territory.isWater) continue;
      const stacks = this.gameState.units[territory.name] || [];
      const factory = stacks.some((unit) => unit.type === 'factory' && (unit.quantity || 0) > 0);
      if (!factory) continue;
      const owner = this.gameState.getOwner(territory.name);
      if (!owner || owner === player.id || this.gameState.areAllies?.(player.id, owner)) continue;
      factories.push(territory.name);
    }
    if (!factories.length) return;
    for (const [from, stacks] of Object.entries(this.gameState.units || {})) {
      const bombers = (stacks || []).filter((unit) => (
        unit.owner === player.id && unit.type === 'bomber' && !unit.moved && (unit.quantity || 0) > 0
      ));
      if (!bombers.length) continue;
      const qty = bombers.reduce((sum, unit) => sum + (unit.quantity || 0), 0);
      let target = null;
      for (const name of factories) {
        if (this.gameState.canAirUnitReach?.(from, name, range)) {
          target = name;
          break;
        }
      }
      if (!target) continue;
      this.gameState.moveUnits(
        from,
        target,
        [{ type: 'bomber', quantity: qty }],
        this.unitDefs,
        { raid: true },
      );
    }
  }

  _nukeReady(playerId) {
    const player = this.gameState.getPlayer?.(playerId);
    if (this._seatKnobs(player).attackBias !== 'nuke') return false;
    const unlocked = this.gameState.playerTechs?.[playerId]?.unlockedTechs || [];
    return NUKE_TECH_CANDIDATES.some((id) => unlocked.includes(id));
  }

  _capitalFacts(name) {
    const byName = this.gameState.territoryByName || {};
    const bridges = this.gameState.activeLandBridges?.();
    return capitalPlacementFacts(name, {
      territoryByName: byName,
      landNeighbors: (next) => landMoveTargets(byName, next, bridges),
      allNeighbors: (next) => this.gameState.getConnections?.(next) || byName[next]?.connections || [],
    });
  }

  // Difficulty knobs, plus the specialization flags. General adds none.
  _seatKnobs(player) {
    return layeredKnobs(
      this._seatLevel(player),
      player?.aiSpecialization,
      this.gameState?.gameOptions,
    );
  }

  // The seat field is the level. Saved easy / medium / hard stay those ids.
  _seatLevel(player, aiPlayer = null) {
    let level = normalizeAiDifficulty(player?.aiDifficulty ?? aiPlayer?.difficulty);
    if (level === 'human') level = 'medium';
    if (aiPlayer) aiPlayer.difficulty = level;
    if (player?.isAI) player.aiDifficulty = level;
    return level;
  }

  // Capital spacing only knows easy, medium, and hard. Hardest places like Harder.
  _placementTier(aiPlayer, player) {
    const level = this._seatLevel(player, aiPlayer);
    return level === 'hardest' ? 'hard' : level;
  }

  _landNeighbors(name) {
    return (this.gameState.getConnections(name) || []).filter((next) => {
      const territory = this.gameState.territoryByName?.[next];
      return !!(territory && !territory.isWater);
    });
  }

  // True when owned land can step to enemy land. Water does not count.
  _hasLandPathToEnemy(playerId) {
    const queue = [];
    for (const [name, state] of Object.entries(this.gameState.territoryState || {})) {
      if (state?.owner !== playerId) continue;
      if (this.gameState.territoryByName?.[name]?.isWater) continue;
      queue.push(name);
    }
    const seen = new Set();
    while (queue.length) {
      const name = queue.shift();
      if (seen.has(name)) continue;
      seen.add(name);
      for (const next of this._landNeighbors(name)) {
        const owner = this.gameState.getOwner(next);
        if (owner && owner !== playerId && !this.gameState.areAllies?.(playerId, owner)) return true;
        if (owner === playerId) queue.push(next);
      }
    }
    return false;
  }

  _continentLands(continent) {
    return (continent?.territories || []).filter((name) => {
      const territory = this.gameState.territoryByName?.[name];
      return !!(territory && !territory.isWater);
    });
  }

  // One continent we already own except a single enemy territory we can
  // reach by land, and only when the force we have there beats our ratio.
  _finishableContinent(playerId, level) {
    const knobs = difficultyKnobs(level);
    let best = null;
    for (const continent of this.gameState.continents || []) {
      const lands = this._continentLands(continent);
      if (lands.length < 2) continue;
      const missing = lands.filter((name) => this.gameState.getOwner(name) !== playerId);
      if (missing.length !== 1) continue;
      const gap = missing[0];
      const owner = this.gameState.getOwner(gap);
      if (!owner || owner === playerId || this.gameState.areAllies?.(playerId, owner)) continue;
      const from = this._landNeighbors(gap).find((name) => this.gameState.getOwner(name) === playerId);
      if (!from) continue;
      let attack = 0;
      for (const name of lands) {
        if (this.gameState.getOwner(name) !== playerId) continue;
        const mine = (this.gameState.units[name] || []).filter((unit) => unit.owner === playerId);
        attack += this._calculatePower(mine, true);
      }
      const defense = this._calculatePower(this.gameState.units[gap] || [], false);
      if (attack / (defense || 0.5) < knobs.attackRatio) continue;
      const bonus = Number(continent.bonus) || 0;
      if (!best || bonus > best.bonus) best = { gap, from, bonus, lands };
    }
    return best;
  }

  // One step toward that gap. Not a search of every friendly territory.
  async _walkTowardContinent(playerId, level) {
    const finish = this._finishableContinent(playerId, level);
    if (!finish) return;
    const sources = this._landNeighbors(finish.from).filter((name) => (
      name !== finish.gap && this.gameState.getOwner(name) === playerId
    ));
    for (const source of sources) {
      const orders = [];
      for (const unit of this.gameState.units[source] || []) {
        if (unit.owner !== playerId || unit.moved) continue;
        const def = this.unitDefs?.[unit.type];
        if (!def || !(def.attack > 0) || !(unit.quantity > 1)) continue;
        const toMove = Math.floor(unit.quantity / 2);
        if (toMove > 0) orders.push({ type: unit.type, quantity: toMove });
      }
      if (orders.length === 0) continue;
      this.gameState.moveUnits(source, finish.from, orders, this.unitDefs);
      return;
    }
  }

  // One weak territory that blocks someone else's continent bonus.
  _denialTarget(playerId) {
    let best = null;
    for (const continent of this.gameState.continents || []) {
      const lands = this._continentLands(continent);
      if (lands.length < 2) continue;
      const byOwner = new Map();
      for (const name of lands) {
        const owner = this.gameState.getOwner(name) || '';
        if (!byOwner.has(owner)) byOwner.set(owner, []);
        byOwner.get(owner).push(name);
      }
      for (const [owner, held] of byOwner) {
        if (!owner || owner === playerId) continue;
        if (this.gameState.areAllies?.(playerId, owner)) continue;
        if (held.length !== lands.length - 1) continue;
        const gap = lands.find((name) => this.gameState.getOwner(name) !== owner);
        if (!gap) continue;
        const defense = this._calculatePower(
          (this.gameState.units[gap] || []).filter((unit) => unit.owner && unit.owner !== playerId),
          false,
        );
        if (defense > 2) continue;
        const ownedByUs = this.gameState.getOwner(gap) === playerId;
        const adjacent = this._landNeighbors(gap).some((name) => this.gameState.getOwner(name) === playerId);
        if (!ownedByUs && !adjacent) continue;
        const bonus = Number(continent.bonus) || 0;
        if (!best || bonus > best.bonus) {
          best = { territory: gap, lands, ownedByUs, bonus, continent: continent.name };
        }
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

  _aiProgressKey() {
    const gs = this.gameState;
    if (!gs) return '';
    return [
      gs.phase,
      gs.turnPhase,
      gs.currentPlayerIndex,
      gs.round,
      gs.unitsPlacedThisRound || 0,
      (gs.combatQueue || []).length,
      (gs.raidQueue || []).length,
      (gs.pendingPurchases || []).length,
    ].join('|');
  }

  _refundAllPending(playerId) {
    const rows = (this.gameState.pendingPurchases || []).filter((row) => row.owner === playerId);
    let back = 0;
    for (const row of rows) {
      const cost = Number(row.cost) || Number(this.unitDefs?.[row.type]?.cost) || 0;
      back += cost * (Number(row.quantity) || 0);
    }
    if (back > 0 && this.gameState.playerState?.[playerId]) {
      this.gameState.playerState[playerId].ipcs = (Number(this.gameState.playerState[playerId].ipcs) || 0) + back;
    }
    this.gameState.pendingPurchases = (this.gameState.pendingPurchases || [])
      .filter((row) => row.owner !== playerId);
  }

  // The phase handler returned the same seat. End the turn anyway.
  _forceAiHandoff(player) {
    const gs = this.gameState;
    if (!gs || !player || gs.currentPlayer?.id !== player.id || gs.gameOver) return;
    console.warn('[AI] Forcing a handoff from', gs.phase, gs.turnPhase, player.id);

    if (gs.phase === GAME_PHASES.PLAYING) {
      let guard = 0;
      while (gs.currentPlayer?.id === player.id && !gs.gameOver && guard++ < 8) {
        const phase = gs.turnPhase;
        const index = gs.currentPlayerIndex;
        gs.combatQueue = [];
        gs.raidQueue = [];
        if (phase === TURN_PHASES.PURCHASE || phase === TURN_PHASES.MOBILIZE) {
          this._refundAllPending(player.id);
        }
        gs.nextPhase();
        if (gs.currentPlayer?.id === player.id && gs.currentPlayerIndex === index && gs.turnPhase === phase) {
          gs.combatQueue = [];
          gs.raidQueue = [];
          this._refundAllPending(player.id);
          gs.nextTurn();
          break;
        }
      }
      return;
    }

    if (gs.phase === GAME_PHASES.UNIT_PLACEMENT) {
      const done = gs.finishPlacementRound(this.unitDefs, { allowNavalSkip: true });
      if (done?.ok === false && gs.currentPlayer?.id === player.id) {
        const pool = gs.getUnitsToPlace(player.id);
        for (const row of pool || []) row.quantity = 0;
        gs.finishPlacementRound(this.unitDefs, { allowNavalSkip: true });
      }
      return;
    }

    if (gs.phase === GAME_PHASES.TERRITORY_DRAFT && gs.draft) {
      gs.draft.pickIndex = (Number(gs.draft.pickIndex) || 0) + 1;
      if (gs.draft.pickIndex >= (gs.draft.order || []).length) gs._completeTerritoryDraft?.();
      else gs._syncDraftSeat?.();
      return;
    }

    if (gs.phase === GAME_PHASES.CAPITAL_PLACEMENT) {
      let capGuard = 0;
      do {
        gs.currentPlayerIndex++;
        if (gs.currentPlayerIndex >= gs.players.length) {
          gs.currentPlayerIndex = 0;
          gs.phase = GAME_PHASES.UNIT_PLACEMENT;
          gs.turnPhase = 'setup';
          gs.unitsPlacedThisRound = 0;
          break;
        }
        capGuard++;
      } while (gs.players[gs.currentPlayerIndex]?.surrendered && capGuard < gs.players.length);
    }
  }

  _setupSeaIsOpen(seaName, playerId) {
    const units = this.gameState.units?.[seaName] || [];
    return !units.some((unit) => (
      unit?.owner && unit.owner !== playerId && (Number(unit.quantity) || 0) > 0
    ));
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
