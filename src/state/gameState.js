// Central game state for all game modes

import {
  knownUnitsToPlace,
  countKnownUnitsToPlace,
  canFinishPlacementRound as canFinishPlacementRoundPred,
  cloneUnitsToPlace,
  onlyNavalRemaining,
  resolvePlayerDeployPool,
  shouldRestoreStartingDeployPool,
} from './placementPass.js';
import { resolveDeployedThisRoundAfterLoad } from './placeQueue.js';
import {
  applyAirLandingPlan,
  buildLandingPlan,
  clearPendingLandingDestinations,
  hasLegalAirLandingFrom,
  looseAirOverWater,
  markPendingAirLandingsApplied,
  preferAirLandingOption,
  takeAirUnitsFromTerritory,
  unappliedLandingPlan,
  upsertPendingAirLanding,
  wasFriendlyAtTurnStart,
} from './airLanding.js';
import { airCombatMoveMayOccupy, landOnlySeaAttackIllegal, moveSelectionProfile, seaZoneHasEnemyForAirAttack } from './combatMoveEligibility.js';
import { cascadeUndoIndexes } from './moveUndo.js';
import { emitGameEvent, summarizeUnits } from '../multiplayer/gameEventLog.js';
import { omitUndefinedDeep } from './persistState.js';
import { flushDiceBuffer, observeRolledDie } from '../stats/diceTracker.js';

function cloneMoveHistory(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    if (!row || typeof row !== 'object') return row;
    const copy = { ...row };
    if (Array.isArray(row.units)) copy.units = row.units.map((unit) => ({ ...unit }));
    if (Array.isArray(row.shipIds)) copy.shipIds = row.shipIds.slice();
    return copy;
  });
}
import { captureIfAttackerHolds, finalizeAttackerHoldsOnBoard } from './combatFinalize.js';
import {
  canPlaceAirOnCarrierInSeaZone,
  countCarrierAir,
  loadOneAirOntoCarrier,
  takeAirFromCarriers,
  unloadOneAirFromCarrier,
} from './carrierPlacement.js';
import {
  factoryProductionLimit,
  factoryProductionUsed,
  resolveSeaMobilizeFactory,
} from './mobilizeSource.js';

export const GAME_PHASES = {
  LOBBY: 'lobby',
  CAPITAL_PLACEMENT: 'capital_placement',
  UNIT_PLACEMENT: 'unit_placement',
  PLAYING: 'playing',
};

// Turn phases within PLAYING
export const TURN_PHASES = {
  DEVELOP_TECH: 'develop_tech',
  PURCHASE: 'purchase',
  COMBAT_MOVE: 'combat_move',
  COMBAT: 'combat',
  NON_COMBAT_MOVE: 'non_combat_move',
  MOBILIZE: 'mobilize',
  COLLECT_INCOME: 'collect_income',
};

export const TURN_PHASE_ORDER = [
  TURN_PHASES.DEVELOP_TECH,
  TURN_PHASES.PURCHASE,
  TURN_PHASES.COMBAT_MOVE,
  TURN_PHASES.COMBAT,
  TURN_PHASES.NON_COMBAT_MOVE,
  TURN_PHASES.MOBILIZE,
  TURN_PHASES.COLLECT_INCOME,
];

export const TURN_PHASE_NAMES = {
  [TURN_PHASES.DEVELOP_TECH]: 'Develop Tech',
  [TURN_PHASES.PURCHASE]: 'Purchase Units',
  [TURN_PHASES.COMBAT_MOVE]: 'Combat Movement',
  [TURN_PHASES.COMBAT]: 'Conduct Combat',
  [TURN_PHASES.NON_COMBAT_MOVE]: 'Non-Combat Movement',
  [TURN_PHASES.MOBILIZE]: 'Mobilize Units',
  [TURN_PHASES.COLLECT_INCOME]: 'Collect Income',
};

// Setup (capital / initial deployment) does not use playing turnPhase.
// Constructor used to default to `purchase`, so every initial-deploy
// push advertised phase=purchase (ZUJMNP V2.76). Persist `setup` instead
// of any PLAYING leftover. Do not rewrite leftovers into develop_tech —
// that is the V2.73 dump combo. Playing UI still requires phase === PLAYING.
export const SETUP_TURN_PHASE = 'setup';

export function resolvePersistedTurnPhase(phase, turnPhase) {
  if (phase !== GAME_PHASES.PLAYING) return SETUP_TURN_PHASE;
  return turnPhase || TURN_PHASES.DEVELOP_TECH;
}

export function isSetupPhase(phase) {
  return phase === GAME_PHASES.CAPITAL_PLACEMENT
    || phase === GAME_PHASES.UNIT_PLACEMENT;
}

export function isPlayingPhase(phase) {
  return phase === GAME_PHASES.PLAYING;
}

/** True only when turnPhase may drive tech / purchase / End Phase / AI playing. */
export function shouldDrivePlayingTurnPhase(phase) {
  return phase === GAME_PHASES.PLAYING;
}

export function shouldShowTechResearch(phase, turnPhase) {
  return phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.DEVELOP_TECH;
}

/** True only when purchase chrome / trade / buy actions may run. */
export function shouldShowPurchase(phase, turnPhase) {
  return phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.PURCHASE;
}

export function shouldShowInitialDeployment(phase) {
  return phase === GAME_PHASES.UNIT_PLACEMENT;
}

// Available technologies (A&A style)
export const TECHNOLOGIES = {
  jets: { name: 'Jets', description: 'Fighters +1 attack/defense' },
  rockets: { name: 'Rockets', description: 'AA guns can bombard adjacent territories' },
  superSubs: { name: 'Super Submarines', description: 'Submarines +1 attack' },
  longRangeAircraft: { name: 'Long Range Aircraft', description: 'Aircraft +2 movement' },
  heavyBombers: { name: 'Heavy Bombers', description: 'Bombers roll 2 dice in combat' },
  industrialTech: { name: 'Industrial Technology', description: 'Units cost -1 IPC (min 1)' },
};

// RISK card trade values (escalating)
export const RISK_CARD_VALUES = [12, 18, 24, 30, 36, 45, 60, 75];

// Land bridges - allow land movement between these territories without naval transport
export const LAND_BRIDGES = [
  ['Alaska', 'Soviet Far East'],
  ['East Canada', 'Eire'],
  ['Brazil', 'French West Africa'],
  ['East US', 'Cuba'],
  ['Eire', 'United Kingdom'],
  ['United Kingdom', 'Finland Norway'],
  ['United Kingdom', 'West Europe'],  // Channel crossing
  ['South Europe', 'Anglo Sudan Egypt'],
  ['Syria Jordan', 'Anglo Sudan Egypt'],
  ['French Indo China', 'East Indies'],  // Note: "French Indo China" (no hyphen) matches territory name
  ['East Indies', 'Australia'],
  ['Australia', 'New Zealand'],
  ['Kenya-Rhodesia', 'Madagascar'],
  ['Spain', 'Algeria'],  // Strait of Gibraltar
  ['Japan', 'Manchuria'],  // Korea Strait crossing
  ['Italian East Africa', 'Saudi Arabia'],  // Red Sea crossing
];

// Starting IPCs by player count for Risk mode
export const STARTING_IPCS_BY_PLAYER_COUNT = {
  2: 35,
  3: 30,
  4: 21,
  5: 18,
  6: 15,
  7: 12,
};

// Starting units for Risk mode (per player)
// Note: Fighters and carriers are placed independently - no auto-assignment
export const RISK_STARTING_UNITS = {
  land: [
    { type: 'bomber', quantity: 1 },
    { type: 'fighter', quantity: 2 }, // Both fighters are in land, placed independently
    { type: 'armour', quantity: 3 },
    { type: 'artillery', quantity: 3 },
    { type: 'infantry', quantity: 9 },
    { type: 'factory', quantity: 1 },
  ],
  naval: [
    { type: 'battleship', quantity: 1 },
    { type: 'carrier', quantity: 1 },
    { type: 'cruiser', quantity: 1 },
    { type: 'destroyer', quantity: 1 },
    { type: 'submarine', quantity: 1 },
    { type: 'transport', quantity: 1 },
  ],
};

/** Local 1-human + AI: the human sits first so opening HUD/camera match
 *  the current placer (Skeptic V2.81.32: Germans CAPITAL / Pacific star
 *  while the human was Russians). Multiplayer keeps a full shuffle. */
export function orderRiskSetupSeats(selectedPlayers, {
  isMultiplayer = false,
  shuffle,
} = {}) {
  const list = Array.isArray(selectedPlayers) ? [...selectedPlayers] : [];
  const mix = typeof shuffle === 'function' ? shuffle : ((arr) => arr);
  const humans = list.filter((p) => !p?.isAI);
  if (!isMultiplayer && humans.length === 1 && list.some((p) => p?.isAI)) {
    const human = humans[0];
    return [human, ...mix(list.filter((p) => p !== human))];
  }
  return mix(list);
}

export class GameState {
  constructor(setup, territories, continents) {
    this.setup = setup;
    this.territories = territories;
    this.continents = continents;
    this.gameMode = null;
    this.alliancesEnabled = false;
    this.teamsEnabled = false;

    this.players = [];
    this.currentPlayerIndex = 0;
    this.round = 1;
    this.phase = GAME_PHASES.LOBBY;
    this.turnPhase = SETUP_TURN_PHASE;

    // Territory state: { territoryName: { owner: playerId, isCapital: bool } }
    this.territoryState = {};

    // Units: { territoryName: [{ type, quantity, owner, moved?: bool }] }
    this.units = {};

    // Player resources: { playerId: { ipcs, hasPlacedCapital, capitalTerritory } }
    this.playerState = {};

    // Pending purchases for current turn: [{ type, quantity, territory }]
    this.pendingPurchases = [];

    // Territories with pending combat
    this.combatQueue = [];

    // Movement history for current turn: [{ from, to, units }]
    this.moveHistory = [];
    // Moves at or below this index are locked after combat resolve / leaving
    // combat movement. Retreat still reads the full history (no combat math change).
    this.undoLockMoveCount = 0;

    // Air unit origins: { territory: { unitType: { origin: territoryName, distance: n } } }
    // Tracks where air units came from and how far they traveled for post-combat landing
    this.airUnitOrigins = {};

    // Territories friendly at turn start (for air landing - can only land in these)
    this.friendlyTerritoriesAtTurnStart = new Set();

    // Victory state
    this.gameOver = false;
    this.winner = null; // 'Allies', 'Axis', or player name
    this.winCondition = null;
    // Additive: New UX income Confirm preview. Classic _collectIncome unchanged.
    this.lastIncome = null;

    // Combat log for current round
    this.combatLog = [];

    // Persisted combat dice + force snapshots (additive, SCHEMA 11).
    // Bounded so Firestore docs stay small. Used to audit AA/combat soft-locks.
    this.combatTelemetry = [];

    // Tech research state: { playerId: { techTokens: n, unlockedTechs: [] } }
    this.playerTechs = {};

    // RISK cards: { playerId: [ 'infantry', 'cavalry', 'artillery', 'wild' ] }
    this.riskCards = {};
    // Track how many times each player has traded cards (for escalating values)
    this.cardTradeCount = {};
    // Track if player has conquered a territory this turn (for Risk card award - one per turn)
    this.conqueredThisTurn = {};
    // Additive Set. Classic NCM validation does not read this (fail closed).
    this.capturedThisTurn = new Set();

    // Territories with amphibious assault this turn (for shore bombardment - only bombard with amphibious units)
    this.amphibiousTerritories = new Set();

    // Track amphibious assault details for naval combat dependency
    // Maps land territory to { seaZone, units: [{ type, quantity, owner }] }
    // If naval combat in seaZone is lost, these units are destroyed
    this.amphibiousAssaultDetails = {};

    // Track AA guns that have fired rockets this turn (Rockets tech)
    // Format: { 'territoryName': count } - how many AA guns at this territory have fired
    this.rocketsUsedThisTurn = {};

    // Pending air landings accumulated from all combats (processed at end of combat phase)
    // Format: [{ originTerritory, units: [{ id, type, quantity, landingOptions }] }]
    this.pendingAirLandings = [];

    // Placement history for undo: [{ territory, unitType, owner }]
    this.placementHistory = [];
    // In-memory last capital only (not in toJSON — SCHEMA 11).
    this._lastCapital = null;

    // Mobilization history for undo during MOBILIZE phase: [{ territory, unitType, owner, cost }]
    this.mobilizationHistory = [];

    // Initial setup state for Risk mode
    this.unitsToPlace = {}; // { playerId: [{ type, quantity }] }
    this.unitsPlacedThisRound = 0;
    this.unitsPlacedThisRoundOwnerId = null;
    this.placementRound = 0;

    // Multiplayer state
    this.isMultiplayer = false;
    this.syncManager = null; // Reference to SyncManager for pushing state changes

    // Turn events for turn summary modal (multiplayer)
    // Tracks battles, territory captures, etc. for showing what happened during other players' turns
    this.turnEvents = [];

    // Build lookups
    this.territoryByName = {};
    this.landTerritories = [];
    for (const t of territories) {
      this.territoryByName[t.name] = t;
      if (!t.isWater) {
        this.landTerritories.push(t);
      }
    }

    this.continentByTerritory = {};
    for (const c of continents) {
      for (const tName of c.territories) {
        this.continentByTerritory[tName] = c;
      }
    }

    this._listeners = [];
    // Depth counter: auto-battle (and similar bursts) pause per-step notifies
    // so Firestore is not hammered; resume flushes a single notify.
    this._notifyPauseDepth = 0;

    // Individual ship tracking (for carriers/transports with cargo)
    this._shipIdCounter = 0;
  }

  // Generate unique ID for individual ship tracking
  _generateShipId(type) {
    this._shipIdCounter++;
    return `${type}_${this._shipIdCounter}`;
  }

  // Split a grouped ship into an individual ship with unique ID
  // Used when loading cargo onto a ship - that ship becomes individually tracked
  _individualizeShip(territory, shipType, playerId) {
    const units = this.units[territory] || [];

    // Find a grouped ship (no id, quantity > 0)
    const grouped = units.find(u =>
      u.type === shipType && u.owner === playerId && !u.id && u.quantity > 0
    );

    if (!grouped) return null;

    // Split off one ship with unique ID
    grouped.quantity--;
    const individual = {
      type: shipType,
      quantity: 1,
      owner: playerId,
      id: this._generateShipId(shipType),
      aircraft: [],
      cargo: [],
      moved: grouped.moved || false,
      movementUsed: grouped.movementUsed || 0
    };
    units.push(individual);

    // Clean up empty group
    if (grouped.quantity <= 0) {
      const idx = units.indexOf(grouped);
      units.splice(idx, 1);
    }

    return individual;
  }

  // Get all individual ships (carriers/transports with cargo) in a territory
  getIndividualShips(territory, playerId, shipType = null) {
    const units = this.units[territory] || [];
    return units.filter(u => {
      if (u.owner !== playerId) return false;
      if (shipType && u.type !== shipType) return false;
      if (!u.id) return false; // Only individualized ships have IDs
      if (u.type !== 'carrier' && u.type !== 'transport') return false;
      return true;
    });
  }

  // Get all ships (including grouped) with cargo info for UI
  getShipsWithCargo(territory, playerId, shipType = null) {
    const units = this.units[territory] || [];
    const result = [];

    for (const u of units) {
      if (u.owner !== playerId) continue;
      if (shipType && u.type !== shipType) continue;
      if (u.type !== 'carrier' && u.type !== 'transport') continue;

      if (u.id) {
        // Individual ship - add directly
        result.push({
          id: u.id,
          type: u.type,
          cargo: u.cargo || [],
          aircraft: u.aircraft || [],
          moved: u.moved || false
        });
      } else {
        // Grouped ships - expand to individual entries (without IDs)
        for (let i = 0; i < u.quantity; i++) {
          result.push({
            id: null,
            type: u.type,
            cargo: i === 0 ? (u.cargo || []) : [], // Only first gets shared cargo
            aircraft: i === 0 ? (u.aircraft || []) : [], // Only first gets shared aircraft
            moved: u.moved || false,
            groupIndex: i
          });
        }
      }
    }

    return result;
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  getPlayerColor(playerId) {
    const player = this.players.find(p => p.id === playerId);
    return player ? player.color : '#888888';
  }

  getPlayerLightColor(playerId) {
    const player = this.players.find(p => p.id === playerId);
    return player ? player.lightColor : '#aaaaaa';
  }

  getPlayerFlag(playerId) {
    const player = this.players.find(p => p.id === playerId);
    return player?.flag || null;
  }

  getPlayer(playerId) {
    return this.players.find(p => p.id === playerId) || null;
  }

  // Initialize game based on mode
  initGame(mode, selectedPlayers, options = {}) {
    this.gameMode = mode;
    this.alliancesEnabled = options.alliancesEnabled || (mode === 'classic');
    this.teamsEnabled = options.teamsEnabled || false;

    if (mode === 'classic') {
      this._initClassicMode(selectedPlayers);
    } else if (mode === 'risk') {
      this._initRiskMode(selectedPlayers, options);
    }

    this._notify();
  }

  // Check if two players are allies (same team or same alliance)
  areAllies(playerId1, playerId2) {
    const p1 = this.players.find(p => p.id === playerId1);
    const p2 = this.players.find(p => p.id === playerId2);
    if (!p1 || !p2) return false;

    // Check team membership first (team mode)
    if (this.teamsEnabled) {
      if (p1.teamId && p2.teamId && p1.teamId === p2.teamId) {
        return true;
      }
    }

    // Check alliance (classic alliance system)
    if (this.alliancesEnabled) {
      if (p1.alliance && p1.alliance === p2.alliance) {
        return true;
      }
    }

    return false;
  }

  // Get alliance for a player
  getAlliance(playerId) {
    const player = this.players.find(p => p.id === playerId);
    return player?.alliance || null;
  }

  _initClassicMode(selectedPlayers) {
    const classicData = this.setup.classic;

    this.players = selectedPlayers.map((p, i) => ({
      ...p,
      turnOrder: i,
    }));

    // Set territory ownership from classic data
    for (const [territory, owner] of Object.entries(classicData.territoryOwners)) {
      this.territoryState[territory] = {
        owner: owner,
        isCapital: false,
      };
    }

    // Set unit placements from classic data
    for (const [territory, placements] of Object.entries(classicData.unitPlacements)) {
      this.units[territory] = placements.map(p => ({ ...p }));
    }

    // Initialize player state with starting PUs
    for (const p of this.players) {
      const factionData = classicData.factions.find(f => f.id === p.id);
      this.playerState[p.id] = {
        ipcs: factionData?.startingPUs || 0,
        hasPlacedCapital: true,
        capitalTerritory: null,
      };
    }

    this.phase = GAME_PHASES.PLAYING;
    this.currentPlayerIndex = 0;
  }

  _initRiskMode(selectedPlayers, options = {}) {
    const riskData = this.setup.risk;
    const playerCount = selectedPlayers.length;

    // Use custom starting IPCs if provided, otherwise use player count-based defaults
    const startingIPCs = options.startingIPCs || STARTING_IPCS_BY_PLAYER_COUNT[playerCount] || 18;

    // Randomize player order for initial placement. Local 1-human + AI
    // seats the human first so opening Place Capital is that seat.
    const shuffledPlayers = orderRiskSetupSeats(selectedPlayers, {
      isMultiplayer: this.isMultiplayer === true,
      shuffle: (arr) => this._shuffleArray(arr),
    });

    this.players = shuffledPlayers.map((p, i) => ({
      ...p,
      turnOrder: i,
    }));

    // Initialize player state
    for (const p of this.players) {
      this.playerState[p.id] = {
        ipcs: startingIPCs,
        hasPlacedCapital: false,
        capitalTerritory: null,
      };

      // Initialize tech state
      this.playerTechs[p.id] = {
        techTokens: 0,
        unlockedTechs: [],
      };

      // Initialize RISK cards
      this.riskCards[p.id] = [];
      this.cardTradeCount[p.id] = 0;

      // Initialize units to place (deep copy)
      this.unitsToPlace[p.id] = [
        ...RISK_STARTING_UNITS.land.map(u => ({ ...u })),
        ...RISK_STARTING_UNITS.naval.map(u => ({ ...u })),
      ];
    }

    // Randomly assign territories
    this._assignTerritories();

    // Place 1 infantry on each territory
    this._placeStartingInfantry();

    this.phase = GAME_PHASES.CAPITAL_PLACEMENT;
    this.currentPlayerIndex = 0;
    this.placementRound = 1;
  }

  _assignTerritories() {
    const shuffled = [...this.landTerritories].sort(() => Math.random() - 0.5);

    let playerIndex = 0;
    for (const t of shuffled) {
      const player = this.players[playerIndex];
      this.territoryState[t.name] = {
        owner: player.id,
        isCapital: false,
      };
      playerIndex = (playerIndex + 1) % this.players.length;
    }
  }

  _placeStartingInfantry() {
    for (const [territoryName, state] of Object.entries(this.territoryState)) {
      this.units[territoryName] = [{
        type: 'infantry',
        quantity: 1,
        owner: state.owner,
      }];
    }
  }

  getOwner(territoryName) {
    return this.territoryState[territoryName]?.owner || null;
  }

  // New UX helper only. Classic combat-move / NCM still uses getOwner + isEnemy.
  isNcmFriendly(territoryName, playerId) {
    const owner = this.getOwner(territoryName);
    if (owner === playerId || this.areAllies(playerId, owner)) return true;
    return this.capturedThisTurn instanceof Set && this.capturedThisTurn.has(territoryName);
  }

  // Preview collect-income IPCs. Does not mutate. Classic _collectIncome stays.
  getCollectIncomeAmount(playerId = this.currentPlayer?.id) {
    if (!playerId) return 0;
    if (!this.canCollectIncome(playerId)) return 0;

    let income = 0;
    const capitalTerritory = this.playerState[playerId]?.capitalTerritory;

    for (const [territory, state] of Object.entries(this.territoryState)) {
      if (state.owner !== playerId) continue;
      if (territory === capitalTerritory) {
        income += 10;
        continue;
      }
      const t = this.territoryByName[territory];
      if (t && t.production) income += t.production;
    }

    for (const continent of this.continents || []) {
      if (this.controlsContinent(playerId, continent.name)) {
        income += continent.bonus;
      }
    }
    return income;
  }

  isCapital(territoryName) {
    return this.territoryState[territoryName]?.isCapital || false;
  }

  // Get effective IPC value for a territory (capitals are worth 10 IPCs)
  getEffectiveIpc(territoryName) {
    const t = this.territoryByName[territoryName];
    if (!t || t.isWater) return 0;

    // Capitals are always worth 10 IPCs
    if (this.isCapital(territoryName)) {
      return 10;
    }

    return t.production || 0;
  }

  // Get factory capacity for a territory (capital factory = 20, other factories = 5)
  // Returns null if no factory present
  getFactoryCapacity(territoryName) {
    const units = this.units[territoryName] || [];
    const hasFactory = units.some(u => u.type === 'factory');
    if (!hasFactory) return null;

    // Check if this is a capital
    if (this.isCapital(territoryName)) {
      return 20;
    }

    return 5;
  }

  getCapital(playerId) {
    return this.playerState[playerId]?.capitalTerritory || null;
  }

  getConnections(territoryName) {
    const territory = this.territoryByName[territoryName];
    const baseConnections = territory?.connections || [];

    // Add land bridge connections
    const landBridgeConnections = [];
    for (const [t1, t2] of LAND_BRIDGES) {
      if (t1 === territoryName && !baseConnections.includes(t2)) {
        landBridgeConnections.push(t2);
      } else if (t2 === territoryName && !baseConnections.includes(t1)) {
        landBridgeConnections.push(t1);
      }
    }

    return [...baseConnections, ...landBridgeConnections];
  }

  // Get all territories reachable by air unit within movement range
  // Air units can fly over any terrain (land or water)
  getReachableTerritoriesForAir(fromTerritory, movementRange, playerId, isCombatMove = false) {
    const reachable = new Map(); // territory -> { distance, path }
    const visited = new Set();
    const queue = [{ territory: fromTerritory, distance: 0, path: [fromTerritory] }];

    while (queue.length > 0) {
      const { territory, distance, path } = queue.shift();

      if (visited.has(territory)) continue;
      visited.add(territory);

      // Don't add starting territory to results
      if (territory !== fromTerritory) {
        reachable.set(territory, { distance, path });
      }

      // Stop if we've reached max movement
      if (distance >= movementRange) continue;

      // Get all connections (including land bridges for air traversal)
      const connections = this.getConnections(territory);

      for (const conn of connections) {
        if (visited.has(conn)) continue;

        queue.push({
          territory: conn,
          distance: distance + 1,
          path: [...path, conn]
        });
      }
    }

    return reachable;
  }

  // Check if air unit can reach destination within movement range
  canAirUnitReach(fromTerritory, toTerritory, movementRange) {
    const reachable = this.getReachableTerritoriesForAir(fromTerritory, movementRange, null, false);
    return reachable.has(toTerritory);
  }

  // Calculate distance between two territories for air units (BFS shortest path)
  // Uses getConnections() which includes land bridges
  _calculateAirDistance(fromTerritory, toTerritory) {
    if (fromTerritory === toTerritory) return 0;

    const visited = new Set([fromTerritory]);
    const queue = [{ territory: fromTerritory, distance: 0 }];

    while (queue.length > 0) {
      const { territory, distance } = queue.shift();

      // Use getConnections to include land bridges
      const connections = this.getConnections(territory);

      for (const conn of connections) {
        if (conn === toTerritory) return distance + 1;
        if (!visited.has(conn)) {
          visited.add(conn);
          queue.push({ territory: conn, distance: distance + 1 });
        }
      }
    }

    return 999; // Unreachable
  }

  // Get valid landing territories for air unit after combat
  // IMPORTANT: Air units can ONLY land in territories that were friendly at the START of the turn
  getAirLandingOptions(territory, unitType, unitDefs, { allowFreshMove = false } = {}) {
    const player = this.currentPlayer;
    if (!player) return [];

    const unitDef = unitDefs[unitType];
    if (!unitDef?.isAir) return [];

    // Get origin tracking info - if no origin tracked, assume unit started here
    const originInfo = this.airUnitOrigins[territory]?.[unitType];
    // A failed path search stores 999. Treating that as "already flew the
    // whole map" left fighters with 0 landing range over open water.
    const rawDistance = originInfo?.distance || 0;
    const distanceTraveled = rawDistance >= 999 ? 0 : rawDistance;
    // Apply Long Range Aircraft tech bonus (+2 movement for fighters and bombers)
    const hasLongRange = this.hasTech(player.id, 'longRangeAircraft');
    const baseMovement = unitDef.movement || 4;
    const totalMovement = hasLongRange ? baseMovement + 2 : baseMovement;
    const remainingMovement = Math.max(0, totalMovement - distanceTraveled);
    const movedWithoutOrigin = !originInfo && (this.units[territory] || []).some((unit) => (
      unit.type === unitType && unit.owner === player.id && unit.moved
    ));

    // Moved aircraft with no origin must not be granted a fresh full move
    // in the landing picker (9.21.26.11 excess options). Automatic
    // phase-exit landing may still search, or those fighters only crash.
    const searchRange = distanceTraveled > 0
      ? remainingMovement
      : (movedWithoutOrigin && !allowFreshMove ? 0 : totalMovement);
    const reachable = this.getReachableTerritoriesForAir(territory, searchRange, player.id, false);
    const validLandings = [];

    // Debug logging for air landing issues
    if (reachable.size === 0) {
      console.warn(`Air landing: No reachable territories from ${territory} with range ${searchRange}`);
    }

    // Get territories that were friendly at turn start. Just-captured land
    // stays illegal even when the saved set is empty (9.21.26.07).

    // CRITICAL FIX: Also check the CURRENT territory (starting position) for carrier landing
    // getReachableTerritoriesForAir excludes the starting territory, but air units CAN land
    // on a carrier in the same sea zone they just attacked in
    const currentT = this.territoryByName[territory];
    if (currentT?.isWater) {
      const seaUnits = this.units[territory] || [];
      const carriers = seaUnits.filter(u => u.type === 'carrier' && u.owner === player.id);
      const carrierDef = unitDefs.carrier;

      if (carrierDef && carriers.length > 0) {
        let capacity = 0;
        for (const carrier of carriers) {
          const aircraft = carrier.aircraft || [];
          capacity += Math.max(0, (carrierDef.aircraftCapacity || 2) - aircraft.length);
        }
        if (capacity > 0 && carrierDef.canCarry?.includes(unitType)) {
          validLandings.push({ territory: territory, distance: 0, isCarrier: true });
        }
      }
    }

    for (const [destName, info] of reachable) {
      // CRITICAL: Only allow landing in territories that were friendly at the START of the turn
      // Newly captured territories are NOT valid landing spots (unless using fallback)
      const wasFriendlyAtStart = wasFriendlyAtTurnStart(this, destName, player.id);

      // Skip if not friendly at turn start (unless it's a carrier which moves with the fleet)
      const destT = this.territoryByName[destName];

      if (destT?.isWater) {
        // Carriers: check if there's a friendly carrier with capacity
        const seaUnits = this.units[destName] || [];
        const carriers = seaUnits.filter(u => u.type === 'carrier' && u.owner === player.id);
        const carrierDef = unitDefs.carrier;

        if (carrierDef && carriers.length > 0) {
          // Check for capacity
          let capacity = 0;
          for (const carrier of carriers) {
            const aircraft = carrier.aircraft || [];
            capacity += Math.max(0, (carrierDef.aircraftCapacity || 2) - aircraft.length);
          }
          if (capacity > 0 && carrierDef.canCarry?.includes(unitType)) {
            validLandings.push({ territory: destName, distance: info.distance, isCarrier: true });
          }
        }
      } else if (wasFriendlyAtStart) {
        // Land territory - must have been friendly at turn start
        validLandings.push({ territory: destName, distance: info.distance, isCarrier: false });
      }
    }

    // Sort by distance (closest first)
    validLandings.sort((a, b) => a.distance - b.distance);

    return validLandings;
  }

  // Clear air unit origins for a territory (after landing resolution)
  clearAirUnitOrigins(territory) {
    delete this.airUnitOrigins[territory];
  }

  // Check if an air unit can land somewhere valid after moving from->to
  // Returns { canLand: boolean, remainingMovement: number }
  checkAirUnitCanLand(fromTerritory, toTerritory, unitType, unitDefs) {
    const player = this.currentPlayer;
    if (!player) return { canLand: false, remainingMovement: 0 };

    const unitDef = unitDefs[unitType];
    if (!unitDef?.isAir) return { canLand: true, remainingMovement: 0 };

    const totalMovement = unitDef.movement || 4;

    // Get current tracking info if the unit already moved
    const existingOrigin = this.airUnitOrigins[fromTerritory]?.[unitType];
    const previousDistance = existingOrigin?.distance || 0;

    // Calculate new distance
    const newDistance = this._calculateAirDistance(fromTerritory, toTerritory);
    const totalDistanceTraveled = previousDistance + newDistance;
    const remainingMovement = Math.max(0, totalMovement - totalDistanceTraveled);

    // The arrival hex itself is a landing when it was friendly at turn start
    // or already holds a friendly carrier. Just-captured land is not.
    const arrived = this.territoryByName[toTerritory];
    if (!arrived?.isWater && wasFriendlyAtTurnStart(this, toTerritory, player.id)) {
      return { canLand: true, remainingMovement };
    }
    if (arrived?.isWater) {
      const here = this.units[toTerritory] || [];
      const carriersHere = here.filter(u => u.type === 'carrier' && u.owner === player.id);
      const carrierDef = unitDefs.carrier;
      if (carrierDef?.canCarry?.includes(unitType) && carriersHere.some((carrier) => {
        const aboard = carrier.aircraft || [];
        return aboard.length < (carrierDef.aircraftCapacity || 2);
      })) {
        return { canLand: true, remainingMovement };
      }
    }

    const reachable = this.getReachableTerritoriesForAir(toTerritory, remainingMovement, player.id, false);

    for (const [destName] of reachable) {
      const destT = this.territoryByName[destName];

      if (destT?.isWater) {
        const seaUnits = this.units[destName] || [];
        const carriers = seaUnits.filter(u => u.type === 'carrier' && u.owner === player.id);
        if (carriers.length > 0) {
          const carrierDef = unitDefs.carrier;
          if (carrierDef?.canCarry?.includes(unitType)) {
            return { canLand: true, remainingMovement };
          }
        }
      } else if (wasFriendlyAtTurnStart(this, destName, player.id)) {
        return { canLand: true, remainingMovement };
      }
    }

    return { canLand: false, remainingMovement };
  }

  // Get flight path for air unit (for validation and display)
  getAirFlightPath(fromTerritory, toTerritory, movementRange) {
    const reachable = this.getReachableTerritoriesForAir(fromTerritory, movementRange, null, false);
    const info = reachable.get(toTerritory);
    return info ? info.path : null;
  }

  // Get all territories reachable by sea unit within movement range
  // Sea units can only move through water territories
  getReachableTerritoriesForSea(fromTerritory, movementRange, playerId, isCombatMove = false) {
    const reachable = new Map(); // territory -> { distance, path }
    const visited = new Set();
    const queue = [{ territory: fromTerritory, distance: 0, path: [fromTerritory] }];

    while (queue.length > 0) {
      const { territory, distance, path } = queue.shift();

      if (visited.has(territory)) continue;
      visited.add(territory);

      const t = this.territoryByName[territory];
      if (!t) continue;

      // Can only move through water
      if (territory !== fromTerritory && !t.isWater) continue;

      // Hostile sea zone: any enemy unit (including transports) is a battle.
      // Origin is not hostile for pathing — you may still leave it.
      const hasEnemyFleet = territory !== fromTerritory
        && seaZoneHasEnemyForAirAttack(this, territory, playerId);

      // Don't add starting territory to results
      if (territory !== fromTerritory) {
        // In non-combat move, can't enter hostile sea zones
        if (!isCombatMove && hasEnemyFleet) {
          // Can't enter this zone, but don't stop search
        } else {
          reachable.set(territory, { distance, path });
        }
      }

      // Stop if we've reached max movement
      if (distance >= movementRange) continue;

      // Must stop on entering a hostile sea zone. Combat move used to path
      // through, so Confirm Attack could leave the ships uncommitted and a
      // later snapshot drew them back in the origin zone.
      if (hasEnemyFleet) continue;

      // Get all connections
      const connections = this.getConnections(territory);

      for (const conn of connections) {
        if (visited.has(conn)) continue;

        const connT = this.territoryByName[conn];
        // Only move to water territories
        if (!connT?.isWater) continue;

        queue.push({
          territory: conn,
          distance: distance + 1,
          path: [...path, conn]
        });
      }
    }

    return reachable;
  }

  // Check if sea unit can reach destination within movement range
  canSeaUnitReach(fromTerritory, toTerritory, movementRange, playerId, isCombatMove) {
    const reachable = this.getReachableTerritoriesForSea(fromTerritory, movementRange, playerId, isCombatMove);
    return reachable.has(toTerritory);
  }

  // Get all territories reachable by land unit within movement range
  // Land units can only move through friendly/allied land territories (blitzing)
  // In combat move, can pass through friendly to reach enemy
  // In non-combat move, can only enter friendly/allied
  // BLITZ RULE: Units with movement > 1 can pass through UNDEFENDED enemy territories
  // (capturing them as they pass), allowing them to continue and attack
  getReachableTerritoriesForLand(fromTerritory, movementRange, playerId, isCombatMove = false) {
    const reachable = new Map(); // territory -> { distance, path, blitzedTerritories }
    const visited = new Set();
    const queue = [{ territory: fromTerritory, distance: 0, path: [fromTerritory], blitzed: [] }];

    while (queue.length > 0) {
      const { territory, distance, path, blitzed } = queue.shift();

      if (visited.has(territory)) continue;
      visited.add(territory);

      const t = this.territoryByName[territory];
      if (!t) continue;

      // Can't pass through water (land units)
      if (territory !== fromTerritory && t.isWater) continue;

      // Check ownership for passability
      const owner = this.getOwner(territory);
      const isFriendly = owner === playerId;
      const isAllied = owner && this.areAllies(playerId, owner);
      const isEnemy = owner && owner !== playerId && !isAllied;

      // Check if enemy territory is undefended (can be blitzed)
      let isUndefended = false;
      if (isEnemy) {
        const units = this.units[territory] || [];
        const enemyUnits = units.filter(u => u.owner !== playerId && !this.areAllies(playerId, u.owner));
        isUndefended = enemyUnits.length === 0;
      }

      // Don't add starting territory to results
      if (territory !== fromTerritory) {
        // In combat move: can reach enemy territories as final destination
        // In non-combat move: can only reach friendly/allied
        if (isCombatMove || isFriendly || isAllied || !owner) {
          reachable.set(territory, { distance, path, blitzedTerritories: blitzed });
        }
      }

      // Stop if we've reached max movement
      if (distance >= movementRange) continue;

      // Can continue through friendly/allied territories
      // BLITZ: Also can continue through UNDEFENDED enemy territories (capturing them)
      // (movement must be > 1 for blitz, which is already implied by distance < movementRange)
      let canContinue = isFriendly || isAllied || !owner;
      let newBlitzed = [...blitzed];
      if (!canContinue && isEnemy && isUndefended && isCombatMove && territory !== fromTerritory) {
        // Blitz through this undefended enemy territory
        canContinue = true;
        newBlitzed.push(territory);
      }
      if (territory !== fromTerritory && !canContinue) continue;

      // Get all connections (including land bridges)
      const connections = this.getConnections(territory);

      for (const conn of connections) {
        if (visited.has(conn)) continue;

        const connT = this.territoryByName[conn];
        // Skip water territories
        if (connT?.isWater) continue;

        queue.push({
          territory: conn,
          distance: distance + 1,
          path: [...path, conn],
          blitzed: newBlitzed
        });
      }
    }

    return reachable;
  }

  // Check if land unit can reach destination within movement range
  canLandUnitReach(fromTerritory, toTerritory, movementRange, playerId, isCombatMove) {
    const reachable = this.getReachableTerritoriesForLand(fromTerritory, movementRange, playerId, isCombatMove);
    return reachable.has(toTerritory);
  }

  // Get land unit path for validation and display (includes blitzed territories)
  getLandUnitPath(fromTerritory, toTerritory, movementRange, playerId, isCombatMove) {
    const reachable = this.getReachableTerritoriesForLand(fromTerritory, movementRange, playerId, isCombatMove);
    const info = reachable.get(toTerritory);
    return info ? { path: info.path, blitzedTerritories: info.blitzedTerritories || [] } : null;
  }

  // Get blitzed territories for a path
  getBlitzedTerritories(fromTerritory, toTerritory, movementRange, playerId) {
    const reachable = this.getReachableTerritoriesForLand(fromTerritory, movementRange, playerId, true);
    const info = reachable.get(toTerritory);
    return info?.blitzedTerritories || [];
  }

  // Check if two territories are connected by land bridge
  hasLandBridge(t1Name, t2Name) {
    for (const [a, b] of LAND_BRIDGES) {
      if ((a === t1Name && b === t2Name) || (a === t2Name && b === t1Name)) {
        return true;
      }
    }
    return false;
  }

  isWater(territoryName) {
    const territory = this.territoryByName[territoryName];
    return territory?.isWater || false;
  }

  getUnitsAt(territoryName) {
    return this.units[territoryName] || [];
  }

  getUnits(territoryName, playerId = null) {
    const units = this.units[territoryName] || [];
    if (playerId) {
      return units.filter(u => u.owner === playerId);
    }
    return units;
  }

  getIPCs(playerId) {
    return this.playerState[playerId]?.ipcs || 0;
  }

  getPlayerTerritories(playerId) {
    return Object.entries(this.territoryState)
      .filter(([_, state]) => state.owner === playerId)
      .map(([name, _]) => name);
  }

  controlsContinent(playerId, continentName) {
    const continent = this.continents.find(c => c.name === continentName);
    if (!continent) return false;
    return continent.territories.every(t => this.getOwner(t) === playerId);
  }

  getContinentBonuses(playerId) {
    const bonuses = [];
    for (const c of this.continents) {
      if (this.controlsContinent(playerId, c.name)) {
        bonuses.push({ name: c.name, bonus: c.bonus });
      }
    }
    return bonuses;
  }

  getAdjacentSeaZones(territoryName) {
    const territory = this.territoryByName[territoryName];
    if (!territory) return [];
    return territory.connections.filter(conn => {
      const t = this.territoryByName[conn];
      return t && t.isWater;
    });
  }

  // Place capital for current player (Risk mode)
  placeCapital(territoryName) {
    const player = this.currentPlayer;
    if (!player) return false;

    const state = this.territoryState[territoryName];
    if (!state || state.owner !== player.id) return false;

    state.isCapital = true;
    this.playerState[player.id].hasPlacedCapital = true;
    this.playerState[player.id].capitalTerritory = territoryName;

    // Auto-place AA gun and factory on capital
    const units = this.units[territoryName] || [];
    units.push({ type: 'aaGun', quantity: 1, owner: player.id });
    units.push({ type: 'factory', quantity: 1, owner: player.id });
    this.units[territoryName] = units;

    // Remove factory from units to place (it's been auto-placed on capital)
    const unitsToPlace = this.unitsToPlace[player.id] || [];
    const factoryEntry = unitsToPlace.find(u => u.type === 'factory');
    const factoryTaken = !!(factoryEntry && factoryEntry.quantity > 0);
    if (factoryEntry) {
      factoryEntry.quantity = Math.max(0, factoryEntry.quantity - 1);
    }

    const lastCapital = {
      territory: territoryName,
      playerId: player.id,
      playerIndex: this.currentPlayerIndex,
      prevPhase: this.phase,
      factoryTaken,
    };

    // Advance to the next non-surrendered player
    let capGuard = 0;
    do {
      this.currentPlayerIndex++;
      if (this.currentPlayerIndex >= this.players.length) {
        this.currentPlayerIndex = 0;
        this.phase = GAME_PHASES.UNIT_PLACEMENT;
        this.turnPhase = SETUP_TURN_PHASE;
        this.unitsPlacedThisRound = 0;
        this.unitsPlacedThisRoundOwnerId = null;
        this.ensureInitialDeployPools();
      }
      capGuard++;
    } while (this.players[this.currentPlayerIndex]?.surrendered && capGuard < this.players.length);

    this._lastCapital = lastCapital;
    this._notify();
    this.autoSave(); // Persist setup progress — losing capitals to a closed tab is brutal
    return true;
  }

  canUndoLastCapital() {
    return !!this._lastCapital && (this.placementHistory || []).length === 0;
  }

  undoLastCapital() {
    const last = this._lastCapital;
    if (!last || (this.placementHistory || []).length > 0) return false;

    const units = this.units[last.territory] || [];
    const removeOne = (type) => {
      const entry = units.find(u => u.type === type && u.owner === last.playerId);
      if (!entry) return;
      const qty = Number(entry.quantity) || 1;
      if (qty <= 1) units.splice(units.indexOf(entry), 1);
      else entry.quantity = qty - 1;
    };
    removeOne('aaGun');
    removeOne('factory');
    this.units[last.territory] = units;

    if (last.factoryTaken) {
      const pool = this.unitsToPlace[last.playerId] || [];
      const factory = pool.find(u => u.type === 'factory');
      if (factory) factory.quantity++;
      else pool.push({ type: 'factory', quantity: 1 });
      this.unitsToPlace[last.playerId] = pool;
    }

    const state = this.territoryState[last.territory];
    if (state) state.isCapital = false;
    if (this.playerState[last.playerId]) {
      this.playerState[last.playerId].hasPlacedCapital = false;
      this.playerState[last.playerId].capitalTerritory = null;
    }
    this.currentPlayerIndex = last.playerIndex;
    this.phase = last.prevPhase;
    this._lastCapital = null;
    this._notify();
    return true;
  }

  _buildStartingDeployPool({ factoryAlreadyPlaced = false } = {}) {
    const land = RISK_STARTING_UNITS.land.map((u) => ({ ...u }));
    if (factoryAlreadyPlaced) {
      const factory = land.find((u) => u.type === 'factory');
      if (factory) factory.quantity = 0;
    }
    return [
      ...land.filter((u) => u.quantity > 0),
      ...RISK_STARTING_UNITS.naval.map((u) => ({ ...u })),
    ];
  }

  // First UNIT_PLACEMENT wave with no land/air in the seat pool is a
  // deserialize / key miss — not "this faction has no land IPC."
  ensureInitialDeployPools() {
    if (this.phase !== GAME_PHASES.UNIT_PLACEMENT) return false;
    let restored = false;
    for (const [i, p] of (this.players || []).entries()) {
      const rows = resolvePlayerDeployPool(this.unitsToPlace, p.id, [p.name]);
      this.unitsToPlace[p.id] = rows;
      const isCurrentSeat = i === this.currentPlayerIndex;
      if (shouldRestoreStartingDeployPool({
        phase: this.phase,
        placementRound: this.placementRound || 1,
        placedThisRound: isCurrentSeat ? (this.unitsPlacedThisRound || 0) : 0,
        pool: rows,
        isCurrentSeat,
      })) {
        this.unitsToPlace[p.id] = this._buildStartingDeployPool({
          factoryAlreadyPlaced: !!this.playerState?.[p.id]?.hasPlacedCapital,
        });
        restored = true;
      }
    }
    if (restored) this._deployPoolRestored = true;
    return restored;
  }

  // Get units that current player still needs to place (Risk mode)
  getUnitsToPlace(playerId) {
    const player = this.players?.find((p) => p.id === playerId);
    return resolvePlayerDeployPool(this.unitsToPlace, playerId, [
      player?.name,
    ]);
  }

  // Check if player has units left to place.
  // When unitDefs is passed, unknown types (no def) do not count — they
  // cannot be placed and must not keep the pass locked.
  hasUnitsToPlace(playerId, unitDefs) {
    if (unitDefs) return countKnownUnitsToPlace(this.getUnitsToPlace(playerId), unitDefs) > 0;
    const units = this.getUnitsToPlace(playerId);
    return units.some(u => u.quantity > 0);
  }

  getKnownUnitsToPlace(playerId, unitDefs) {
    return knownUnitsToPlace(this.getUnitsToPlace(playerId), unitDefs);
  }

  // Get total unit count left to place
  getTotalUnitsToPlace(playerId, unitDefs) {
    if (unitDefs) return countKnownUnitsToPlace(this.getUnitsToPlace(playerId), unitDefs);
    const units = this.getUnitsToPlace(playerId);
    return units.reduce((sum, u) => sum + u.quantity, 0);
  }

  canFinishPlacementRound(playerId, unitDefs, { allowNavalSkip = false } = {}) {
    return canFinishPlacementRoundPred({
      placedThisRound: this.unitsPlacedThisRound || 0,
      limit: this.getUnitsPerRoundLimit(),
      remainingKnown: this.getTotalUnitsToPlace(playerId, unitDefs),
      hasPlaceable: this.hasPlaceableUnits(playerId, unitDefs),
      onlyNavalRemaining: onlyNavalRemaining(this.getUnitsToPlace(playerId), unitDefs),
      allowNavalSkip,
    });
  }

  // Check if player has any units that can actually be placed (have valid locations)
  hasPlaceableUnits(playerId, unitDefs) {
    const units = this.getUnitsToPlace(playerId);
    if (!units.some(u => u.quantity > 0)) return false;

    // B19: Done/skip leftover ships must not hand the seat straight back.
    if (this.playerState[playerId]?.skipLeftoverNaval
      && onlyNavalRemaining(units, unitDefs)) {
      return false;
    }

    // Get player's owned territories and valid sea zones
    const ownedTerritories = this.getPlayerTerritories(playerId);
    if (ownedTerritories.length === 0) return false;

    // Find valid sea zones (adjacent to owned coastal territories, not occupied by enemies)
    const validSeaZones = new Set();
    for (const tName of ownedTerritories) {
      const t = this.territoryByName[tName];
      if (!t || t.isWater) continue;
      for (const conn of t.connections) {
        const ct = this.territoryByName[conn];
        if (ct && ct.isWater) {
          // Check not occupied by enemy during setup
          const existingUnits = this.units[conn] || [];
          const enemyUnits = existingUnits.filter(u => u.owner !== playerId);
          if (enemyUnits.length === 0) {
            validSeaZones.add(conn);
          }
        }
      }
    }

    // Check each unit type
    for (const unitEntry of units) {
      if (unitEntry.quantity <= 0) continue;
      const def = unitDefs?.[unitEntry.type];
      if (!def) continue;

      // Land units: can place on owned territories
      if (def.isLand) return true;

      // Building units (factories): can place on owned land territories
      if (def.isBuilding) return true;

      // Naval units: can place on valid sea zones
      if (def.isSea && validSeaZones.size > 0) return true;

      // Air units: can place on owned territories OR on carriers in valid sea zones
      if (def.isAir) {
        // Can always place on owned land
        return true;
      }
    }

    return false;
  }

  // Check if this is the final placement round (all players have ≤ 7 units remaining)
  isFinalPlacementRound() {
    if (!this.players) return false;
    return this.players.every(p => this.getTotalUnitsToPlace(p.id) <= 7);
  }

  // Get the units per round limit (always 6)
  getUnitsPerRoundLimit() {
    return 6;
  }

  // Place an initial unit during Risk setup (6-unit rounds)
  placeInitialUnit(territoryName, unitType, unitDefs) {
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    // Enforce unit limit per turn during initial placement (7 for final round, 6 otherwise)
    const limit = this.getUnitsPerRoundLimit();
    if (this.unitsPlacedThisRound >= limit) {
      return { success: false, error: `You can only place up to ${limit} units per turn. Click "Done" to continue.` };
    }

    // Check if player has this unit to place
    const unitsToPlace = this.getUnitsToPlace(player.id);
    this.unitsToPlace[player.id] = unitsToPlace;
    const unitEntry = unitsToPlace.find(u => u.type === unitType && u.quantity > 0);
    if (!unitEntry) {
      return { success: false, error: `No ${unitType} available to place` };
    }

    const unitDef = unitDefs[unitType];
    if (!unitDef) return { success: false, error: 'Unknown unit type' };

    // Validate placement location
    const capital = this.playerState[player.id]?.capitalTerritory;
    const territory = this.territoryByName[territoryName];
    if (!territory) return { success: false, error: 'Unknown territory' };

    // Naval units: can be placed on any sea zone adjacent to ANY owned coastal territory
    if (unitDef.isSea) {
      const ownedCoastal = this.getPlayerTerritories(player.id).filter(tName => {
        const t = this.territoryByName[tName];
        return t && !t.isWater && t.connections.some(conn => {
          const ct = this.territoryByName[conn];
          return ct && ct.isWater;
        });
      });
      const validSeaZones = new Set();
      for (const coastal of ownedCoastal) {
        const t = this.territoryByName[coastal];
        for (const conn of t.connections) {
          const ct = this.territoryByName[conn];
          if (ct && ct.isWater) validSeaZones.add(conn);
        }
      }
      if (!validSeaZones.has(territoryName)) {
        return { success: false, error: 'Naval units must be placed on sea zones adjacent to your coastal territories' };
      }

      // During setup: prevent placing naval units in sea zones occupied by other players
      if (this.phase === GAME_PHASES.UNIT_PLACEMENT) {
        const existingUnits = this.units[territoryName] || [];
        const enemyUnits = existingUnits.filter(u => u.owner !== player.id);
        if (enemyUnits.length > 0) {
          return { success: false, error: 'Cannot place naval units in a sea zone occupied by another faction during setup' };
        }
      }
    } else {
      // Land/air units: check if can be placed
      const owner = this.getOwner(territoryName);
      const t = this.territoryByName[territoryName];

      // Check if placing on a sea zone with carrier (for fighters) or transport (for ground)
      if (t && t.isWater) {
        const seaUnits = this.units[territoryName] || [];

        if (unitDef.isAir) {
          const loaded = loadOneAirOntoCarrier(this, territoryName, unitType, player.id, unitDefs);
          if (!loaded.success) {
            return { success: false, error: loaded.error || 'No carrier with capacity to hold this aircraft' };
          }
          unitEntry.quantity--;
          // Track placement for undo (special carrier placement)
          this.placementHistory.push({
            territory: territoryName,
            unitType,
            owner: player.id,
            onCarrier: true,
          });
          this.unitsPlacedThisRound++;
          this.unitsPlacedThisRoundOwnerId = player.id;
          this._lastCapital = null;
          this._notify();
          return { success: true, unitsPlacedThisRound: this.unitsPlacedThisRound };
        } else if (unitDef.isLand) {
          // Ground units can be placed on transports
          const transports = seaUnits.filter(u => u.type === 'transport' && u.owner === player.id);
          const transportDef = unitDefs.transport;
          // Find transport with capacity
          let placed = false;
          for (const transport of transports) {
            const currentCargo = transport.cargo || [];
            if (transportDef && this._canLoadOnTransport(currentCargo, unitType)) {
              if (transportDef.canCarry?.includes(unitType)) {
                // Place on transport
                unitEntry.quantity--;
                transport.cargo = transport.cargo || [];
                transport.cargo.push({ type: unitType, owner: player.id });
                placed = true;
                break;
              }
            }
          }
          if (!placed) {
            return { success: false, error: 'No transport with capacity to hold this unit' };
          }
          // Track placement for undo (special transport placement)
          this.placementHistory.push({
            territory: territoryName,
            unitType,
            owner: player.id,
            onTransport: true,
          });
          this.unitsPlacedThisRound++;
          this.unitsPlacedThisRoundOwnerId = player.id;
          this._lastCapital = null;
          this._notify();
          return { success: true, unitsPlacedThisRound: this.unitsPlacedThisRound };
        } else {
          return { success: false, error: 'Cannot place this unit type on water' };
        }
      } else if (owner !== player.id) {
        return { success: false, error: 'Must place on your own territory' };
      }
    }

    // Place the unit on land territory
    unitEntry.quantity--;
    const units = this.units[territoryName] || [];
    const existing = units.find(u => u.type === unitType && u.owner === player.id);
    if (existing) {
      existing.quantity++;
    } else {
      units.push({ type: unitType, quantity: 1, owner: player.id });
    }
    this.units[territoryName] = units;

    // Track placement for undo
    this.placementHistory.push({
      territory: territoryName,
      unitType,
      owner: player.id,
    });

    this.unitsPlacedThisRound++;
    this.unitsPlacedThisRoundOwnerId = player.id;
    this._lastCapital = null;

    this._notify();
    return { success: true, unitsPlacedThisRound: this.unitsPlacedThisRound };
  }

  // Deploy N must place N. Pause notifies so a mid-batch re-render cannot
  // put Undo under the Deploy tap (B13/B18) or retarget the remaining drops.
  placeInitialUnitsBatch(territoryName, unitTypes, unitDefs) {
    const types = Array.isArray(unitTypes) ? unitTypes : [];
    const placed = [];
    const failed = [];
    this.pauseNotifications();
    try {
      for (const unitType of types) {
        const result = this.placeInitialUnit(territoryName, unitType, unitDefs);
        if (result?.success) placed.push(unitType);
        else failed.push({ unitType, error: result?.error || 'failed' });
      }
    } finally {
      this.resumeNotifications({ flush: true });
    }
    return {
      placed: placed.length,
      placedTypes: placed,
      requested: types.length,
      failed,
      territory: territoryName,
      unitsPlacedThisRound: this.unitsPlacedThisRound,
    };
  }

  // Undo last unit placement
  undoPlacement() {
    if (this.placementHistory.length === 0) return false;

    const player = this.currentPlayer;
    if (!player) return false;

    const lastPlacement = this.placementHistory.pop();
    if (lastPlacement.owner !== player.id) {
      // Shouldn't happen, but restore and return
      this.placementHistory.push(lastPlacement);
      return false;
    }

    // Handle carrier placement undo
    if (lastPlacement.onCarrier) {
      const seaUnits = this.units[lastPlacement.territory] || [];
      const carriers = seaUnits.filter(u => u.type === 'carrier' && u.owner === player.id);
      for (const carrier of carriers) {
        const aircraft = carrier.aircraft || [];
        const idx = aircraft.findIndex(a => a.type === lastPlacement.unitType && a.owner === player.id);
        if (idx >= 0) {
          aircraft.splice(idx, 1);
          break;
        }
      }
    // Handle transport placement undo
    } else if (lastPlacement.onTransport) {
      const seaUnits = this.units[lastPlacement.territory] || [];
      const transports = seaUnits.filter(u => u.type === 'transport' && u.owner === player.id);
      for (const transport of transports) {
        const cargo = transport.cargo || [];
        const idx = cargo.findIndex(c => c.type === lastPlacement.unitType && c.owner === player.id);
        if (idx >= 0) {
          cargo.splice(idx, 1);
          break;
        }
      }
    } else {
      // Remove unit from territory (normal placement)
      const units = this.units[lastPlacement.territory] || [];
      const unitEntry = units.find(u => u.type === lastPlacement.unitType && u.owner === player.id);
      if (unitEntry) {
        unitEntry.quantity--;
        if (unitEntry.quantity <= 0) {
          const idx = units.indexOf(unitEntry);
          units.splice(idx, 1);
        }
      }
    }

    // If it was a purchased unit, refund IPCs
    if (lastPlacement.purchased && lastPlacement.cost) {
      this.playerState[player.id].ipcs += lastPlacement.cost;
    } else {
      // If it was from starting units, restore to pool
      const unitsToPlace = this.getUnitsToPlace(player.id);
      this.unitsToPlace[player.id] = unitsToPlace;
      const poolEntry = unitsToPlace.find(u => u.type === lastPlacement.unitType);
      if (poolEntry) {
        poolEntry.quantity++;
      } else {
        unitsToPlace.push({ type: lastPlacement.unitType, quantity: 1 });
      }
    }
    // DEPLOYED is unitsPlacedThisRound. Undo must always drop it or the
    // next + looks like it vanished the restored unit (B15).
    this.unitsPlacedThisRound = Math.max(0, this.unitsPlacedThisRound - 1);

    this._notify();
    return true;
  }

  // Finish current player's placement round (6 units max, or all remaining)
  // unitDefs is optional but needed for accurate placeable check
  finishPlacementRound(unitDefs = null, { allowNavalSkip = false } = {}) {
    if (this.phase !== GAME_PHASES.UNIT_PLACEMENT) {
      return { ok: false, reason: 'wrong-phase' };
    }
    const player = this.currentPlayer;
    if (!player) return { ok: false, reason: 'no-player' };
    if (!this.canFinishPlacementRound(player.id, unitDefs, { allowNavalSkip })) {
      return { ok: false, reason: 'not-ready' };
    }
    if (allowNavalSkip && onlyNavalRemaining(this.getUnitsToPlace(player.id), unitDefs)) {
      if (!this.playerState[player.id]) this.playerState[player.id] = {};
      this.playerState[player.id].skipLeftoverNaval = true;
    }

    this.unitsPlacedThisRound = 0;
    this.unitsPlacedThisRoundOwnerId = null;
    this.turnPhase = this.phase === GAME_PHASES.PLAYING
      ? this.turnPhase
      : SETUP_TURN_PHASE;
    this.placementHistory = []; // Clear undo history for this round

    // Check if all players have finished placing - either no units left OR no placeable units
    const anyPlayerCanPlace = this.players.some(p => {
      if (p.surrendered) return false;
      const hasUnits = this.hasUnitsToPlace(p.id, unitDefs);
      if (!hasUnits) return false;
      if (unitDefs) {
        return this.hasPlaceableUnits(p.id, unitDefs);
      }
      return hasUnits;
    });

    if (!anyPlayerCanPlace) {
      // All units placed (or unplaceable) — advance index once (original behaviour) then
      // transition to the playing phase so the correct player goes first.
      this.currentPlayerIndex++;
      if (this.currentPlayerIndex >= this.players.length) {
        this.currentPlayerIndex = 0;
      }
      // Don't hand the first playing turn to a surrendered player
      let firstTurnGuard = 0;
      while (this.players[this.currentPlayerIndex]?.surrendered && firstTurnGuard < this.players.length) {
        this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
        firstTurnGuard++;
      }
      this.phase = GAME_PHASES.PLAYING;
      this.turnPhase = TURN_PHASES.DEVELOP_TECH;
      this._initFriendlyTerritoriesAtTurnStart();
    } else {
      // Advance to the next player who still has units to place, skipping fully-deployed
      // and surrendered players. Without this a fully-deployed player must manually click
      // "Next Player" every round even though they have nothing to place.
      let iterations = 0;
      do {
        this.currentPlayerIndex++;
        if (this.currentPlayerIndex >= this.players.length) {
          this.currentPlayerIndex = 0;
          this.placementRound++;
        }
        iterations++;
        const p = this.players[this.currentPlayerIndex];
        if (p.surrendered) continue;
        const hasUnits = this.hasUnitsToPlace(p.id, unitDefs);
        const canPlace = hasUnits && (!unitDefs || this.hasPlaceableUnits(p.id, unitDefs));
        if (canPlace) break;
        // Safety guard: anyPlayerCanPlace confirmed someone can place, so this loop
        // will always find a candidate within one full cycle.
      } while (iterations < this.players.length);
    }

    this._notify();
    this.autoSave(); // Persist deployment progress for hotseat resume
    return {
      ok: true,
      currentPlayerIndex: this.currentPlayerIndex,
      phase: this.phase,
    };
  }

  // Add unit to pending purchases (PURCHASE phase) - units placed during MOBILIZE
  // territory parameter specifies where the unit will be placed during mobilize
  addToPendingPurchases(unitType, unitDefs, territory = null) {
    if (!shouldShowPurchase(this.phase, this.turnPhase)) {
      return { success: false, error: 'Can only purchase during Purchase phase' };
    }
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    const unitDef = unitDefs[unitType];
    if (!unitDef) return { success: false, error: 'Unknown unit type' };

    // Check mobilization capacity - cannot buy more units than we can place
    const capacity = this.getMobilizationCapacity(player.id);
    const currentPurchases = this.getPendingPurchaseCount(player.id);
    if (currentPurchases >= capacity) {
      return { success: false, error: `Mobilization capacity reached (${capacity} units max - capital: 20, factories: 5 each)` };
    }

    // Apply industrial tech discount (-1 IPC, min 1)
    let cost = unitDef.cost;
    if (this.hasTech(player.id, 'industrialTech')) {
      cost = Math.max(1, cost - 1);
    }

    if (this.playerState[player.id].ipcs < cost) {
      return { success: false, error: 'Not enough IPCs' };
    }

    // Deduct IPCs
    this.playerState[player.id].ipcs -= cost;

    // Add to pending purchases - track territory if specified (store actual cost paid)
    const existing = this.pendingPurchases.find(p =>
      p.type === unitType && p.owner === player.id && p.territory === territory
    );
    if (existing) {
      existing.quantity++;
    } else {
      this.pendingPurchases.push({ type: unitType, quantity: 1, owner: player.id, cost, territory });
    }

    this._notify();
    emitGameEvent('purchase', {
      gameState: this,
      payload: {
        unitType,
        quantity: 1,
        ipcDelta: -cost,
        territory: territory || null,
      },
    });
    return { success: true };
  }

  // Remove unit from pending purchases (undo during PURCHASE phase)
  removeFromPendingPurchases(unitType, unitDefs) {
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    const unitDef = unitDefs[unitType];
    if (!unitDef) return { success: false, error: 'Unknown unit type' };

    const existing = this.pendingPurchases.find(p => p.type === unitType && p.owner === player.id);
    if (!existing || existing.quantity <= 0) {
      return { success: false, error: 'No units to remove' };
    }

    // Refund IPCs (use stored cost which includes any tech discounts)
    this.playerState[player.id].ipcs += existing.cost || unitDef.cost;

    // Remove from pending
    existing.quantity--;
    if (existing.quantity <= 0) {
      const idx = this.pendingPurchases.indexOf(existing);
      this.pendingPurchases.splice(idx, 1);
    }

    this._notify();
    return { success: true };
  }

  // Undo the last pending purchase (one unit). Purchase + is undoable;
  // leaving the phase / passing the seat is not.
  undoLastPurchase(unitDefs) {
    if (!shouldShowPurchase(this.phase, this.turnPhase)) {
      return { success: false, error: 'Can only undo during purchase' };
    }
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };
    const mine = (this.pendingPurchases || []).filter(p => p.owner === player.id && p.quantity > 0);
    if (mine.length === 0) return { success: false, error: 'No purchases to undo' };
    return this.removeFromPendingPurchases(mine[mine.length - 1].type, unitDefs);
  }

  // Get pending purchases for current player
  getPendingPurchases() {
    const player = this.currentPlayer;
    if (!player) return [];
    return this.pendingPurchases.filter(p => p.owner === player.id);
  }

  // Clear pending purchases (refund IPCs)
  clearPendingPurchases(unitDefs) {
    const player = this.currentPlayer;
    if (!player) return;

    for (const purchase of this.pendingPurchases) {
      if (purchase.owner === player.id) {
        const unitDef = unitDefs[purchase.type];
        if (unitDef) {
          this.playerState[player.id].ipcs += unitDef.cost * purchase.quantity;
        }
      }
    }

    this.pendingPurchases = this.pendingPurchases.filter(p => p.owner !== player.id);
    this._notify();
  }

  // Mobilize a single pending unit to a territory (MOBILIZE phase)
  mobilizeUnit(unitType, territoryName, unitDefs, options = {}) {
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    const unitDef = unitDefs[unitType];
    if (!unitDef) return { success: false, error: 'Unknown unit type' };

    // Check if we have this unit pending
    const pending = this.pendingPurchases.find(p => p.type === unitType && p.owner === player.id && p.quantity > 0);
    if (!pending) {
      return { success: false, error: 'No pending units of this type' };
    }

    const capital = this.playerState[player.id].capitalTerritory;

    // Validate placement location
    if (unitDef.isSea) {
      // Naval units: placed on sea zones adjacent to territories with factories.
      // The producing factory's cap is spent, and a shared sea zone must name
      // which factory (9.21.26.09 / 09b).
      const validSeaZones = this._getValidNavalPlacementZones(player.id);
      if (!validSeaZones.has(territoryName)) {
        return { success: false, error: 'Naval units must be placed on sea zones adjacent to territories with factories' };
      }
      const resolved = resolveSeaMobilizeFactory(
        this, territoryName, player.id, options.sourceFactory || null,
      );
      if (!resolved.ok) {
        return {
          success: false,
          error: resolved.error,
          factories: resolved.factories,
          ambiguous: !!resolved.ambiguous,
        };
      }
      const limit = factoryProductionLimit(resolved.factory, capital);
      const used = factoryProductionUsed(this.mobilizationHistory, resolved.factory, player.id);
      if (used >= limit) {
        return { success: false, error: `Factory production limit reached (${limit} units per turn)` };
      }
      const cost = pending.cost || unitDef.cost;
      pending.quantity--;
      if (pending.quantity <= 0) {
        const idx = this.pendingPurchases.indexOf(pending);
        this.pendingPurchases.splice(idx, 1);
      }
      const units = this.units[territoryName] || [];
      units.push({
        type: unitType,
        quantity: 1,
        owner: player.id,
        ...(unitType === 'carrier' ? { aircraft: [] } : {}),
        ...(unitType === 'transport' ? { cargo: [] } : {}),
      });
      this.units[territoryName] = units;
      if (unitType === 'carrier' || unitType === 'transport') {
        this._individualizeShip(territoryName, unitType, player.id);
      }
      this.mobilizationHistory.push({
        territory: territoryName,
        unitType,
        owner: player.id,
        cost,
        sourceFactory: resolved.factory,
      });
      this._notify();
      return { success: true, sourceFactory: resolved.factory };
    } else if (unitDef.isAir && this.territoryByName[territoryName]?.isWater) {
      // 9.20.26.07 — fighters may mobilize onto a friendly carrier in a
      // factory-adjacent sea zone (same dests as new ships).
      if (!canPlaceAirOnCarrierInSeaZone(this, territoryName, unitType, player.id, unitDefs, {
        requireFactoryAdjacent: true,
      })) {
        return {
          success: false,
          error: 'Aircraft must be placed on a factory or a friendly carrier in a sea zone adjacent to a factory',
        };
      }
      const resolved = resolveSeaMobilizeFactory(
        this, territoryName, player.id, options.sourceFactory || null,
      );
      if (!resolved.ok) {
        return {
          success: false,
          error: resolved.error,
          factories: resolved.factories,
          ambiguous: !!resolved.ambiguous,
        };
      }
      const airLimit = factoryProductionLimit(resolved.factory, capital);
      const airUsed = factoryProductionUsed(this.mobilizationHistory, resolved.factory, player.id);
      if (airUsed >= airLimit) {
        return { success: false, error: `Factory production limit reached (${airLimit} units per turn)` };
      }

      const cost = pending.cost || unitDef.cost;
      pending.quantity--;
      if (pending.quantity <= 0) {
        const idx = this.pendingPurchases.indexOf(pending);
        this.pendingPurchases.splice(idx, 1);
      }

      const loaded = loadOneAirOntoCarrier(this, territoryName, unitType, player.id, unitDefs);
      if (!loaded.success) {
        const restore = this.pendingPurchases.find((p) => p.type === unitType && p.owner === player.id);
        if (restore) restore.quantity++;
        else {
          this.pendingPurchases.push({
            type: unitType,
            quantity: 1,
            owner: player.id,
            cost,
          });
        }
        return loaded;
      }

      this.mobilizationHistory.push({
        territory: territoryName,
        unitType,
        owner: player.id,
        cost,
        onCarrier: true,
        sourceFactory: resolved.factory,
      });
      this._notify();
      return { success: true };
    } else if (unitDef.isBuilding) {
      // Factories: placed on owned land territories without a factory
      // CRITICAL: Cannot place on territories captured this turn
      const owner = this.getOwner(territoryName);
      if (owner !== player.id) {
        return { success: false, error: 'Factories must be placed on your own territories' };
      }
      const t = this.territoryByName[territoryName];
      if (t?.isWater) {
        return { success: false, error: 'Factories cannot be placed on water' };
      }
      // Check if territory was owned at turn start (cannot place on newly captured territories)
      const friendlyAtStart = this.friendlyTerritoriesAtTurnStart || new Set();
      if (friendlyAtStart.size > 0 && !friendlyAtStart.has(territoryName)) {
        return { success: false, error: 'Factories cannot be placed on territories captured this turn' };
      }
      // Check if territory already has a factory
      const units = this.units[territoryName] || [];
      const hasFactory = units.some(u => u.type === 'factory');
      if (hasFactory) {
        return { success: false, error: 'Territory already has a factory' };
      }
    } else {
      // Land/air units: placed on territories with factories that existed at turn START
      // Newly built factories cannot accept units in the same turn (A&A rule)
      // Only use fallback if factoriesAtTurnStart was never initialized (old saves)
      const validFactories = (this.factoriesAtTurnStart instanceof Set)
        ? this.factoriesAtTurnStart
        : new Set(this._getFactoryTerritories(player.id));
      if (!validFactories.has(territoryName)) {
        return { success: false, error: 'Units must be placed on territories with factories (factories built this turn cannot accept units)' };
      }

      // Factory production limit check
      // Capital factories can produce 20 units per turn, non-capital 5 units
      const isCapitalFactory = territoryName === capital;
      const productionLimit = factoryProductionLimit(territoryName, capital);
      const unitsPlacedHere = factoryProductionUsed(
        this.mobilizationHistory, territoryName, player.id,
      );
      if (unitsPlacedHere >= productionLimit) {
        return { success: false, error: `Factory production limit reached (${productionLimit} units per turn for ${isCapitalFactory ? 'capital' : 'non-capital'} factories)` };
      }
    }

    // Place the unit
    const cost = pending.cost || unitDef.cost;
    pending.quantity--;
    if (pending.quantity <= 0) {
      const idx = this.pendingPurchases.indexOf(pending);
      this.pendingPurchases.splice(idx, 1);
    }

    const units = this.units[territoryName] || [];
    const existing = units.find(u => u.type === unitType && u.owner === player.id);
    if (existing) {
      existing.quantity++;
    } else {
      units.push({ type: unitType, quantity: 1, owner: player.id });
    }
    this.units[territoryName] = units;

    // Track for undo
    this.mobilizationHistory.push({
      territory: territoryName,
      unitType,
      owner: player.id,
      cost,
    });

    this._notify();
    return { success: true };
  }

  // Undo last mobilization (during MOBILIZE phase)
  undoMobilization(unitDefs) {
    if (this.turnPhase !== TURN_PHASES.MOBILIZE) {
      return { success: false, error: 'Can only undo during mobilize phase' };
    }

    if (this.mobilizationHistory.length === 0) {
      return { success: false, error: 'No placements to undo' };
    }

    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    const lastPlacement = this.mobilizationHistory.pop();
    if (lastPlacement.owner !== player.id) {
      // Shouldn't happen, but restore and return
      this.mobilizationHistory.push(lastPlacement);
      return { success: false, error: 'Cannot undo other player placements' };
    }

    if (lastPlacement.onCarrier) {
      unloadOneAirFromCarrier(this, lastPlacement.territory, lastPlacement.unitType, player.id);
    } else {
      // Remove unit from territory
      const units = this.units[lastPlacement.territory] || [];
      const unitEntry = units.find(u => u.type === lastPlacement.unitType && u.owner === player.id);
      if (unitEntry) {
        unitEntry.quantity--;
        if (unitEntry.quantity <= 0) {
          const idx = units.indexOf(unitEntry);
          units.splice(idx, 1);
        }
      }
    }

    // Add back to pending purchases
    const existing = this.pendingPurchases.find(p =>
      p.type === lastPlacement.unitType && p.owner === player.id
    );
    if (existing) {
      existing.quantity++;
    } else {
      const unitDef = unitDefs[lastPlacement.unitType];
      this.pendingPurchases.push({
        type: lastPlacement.unitType,
        quantity: 1,
        owner: player.id,
        cost: lastPlacement.cost || unitDef?.cost || 0,
      });
    }

    this._notify();
    return { success: true };
  }

  // Get territories with factories for a player
  _getFactoryTerritories(playerId) {
    const territories = [];
    const capital = this.playerState[playerId]?.capitalTerritory;
    if (capital) territories.push(capital);

    // Check for factory buildings
    for (const [terrName, units] of Object.entries(this.units)) {
      const hasFactory = units.some(u => u.type === 'factory' && u.owner === playerId);
      if (hasFactory && !territories.includes(terrName)) {
        territories.push(terrName);
      }
    }

    return territories;
  }

  // Calculate total mobilization capacity for a player
  // Capital = 20 units, each additional factory = 5 units
  getMobilizationCapacity(playerId) {
    const capital = this.playerState[playerId]?.capitalTerritory;
    let totalCapacity = 0;

    // Capital provides 20 capacity if player still owns it
    if (capital && this.getOwner(capital) === playerId) {
      totalCapacity += 20;
    }

    // Each additional factory provides 5 capacity
    for (const [terrName, units] of Object.entries(this.units)) {
      // Skip capital (already counted)
      if (terrName === capital) continue;

      // Check if territory is owned by player
      if (this.getOwner(terrName) !== playerId) continue;

      // Check for factory
      const hasFactory = units.some(u => u.type === 'factory' && u.owner === playerId);
      if (hasFactory) {
        totalCapacity += 5;
      }
    }

    return totalCapacity;
  }

  // Get current pending purchase count for a player
  getPendingPurchaseCount(playerId) {
    return this.pendingPurchases
      .filter(p => p.owner === playerId)
      .reduce((sum, p) => sum + (p.quantity || 1), 0);
  }

  // Get valid sea zones for naval unit placement
  _getValidNavalPlacementZones(playerId) {
    const validZones = new Set();
    const factoryTerritories = this._getFactoryTerritories(playerId);

    for (const terrName of factoryTerritories) {
      const t = this.territoryByName[terrName];
      if (!t) continue;

      // Find adjacent sea zones
      for (const conn of t.connections || []) {
        const ct = this.territoryByName[conn];
        if (ct && ct.isWater) {
          validZones.add(conn);
        }
      }
    }

    return validZones;
  }

  // Legacy method - kept for initial deployment phase
  purchaseUnit(unitType, territoryName, unitDefs) {
    const player = this.currentPlayer;
    if (!player) return false;

    const unitDef = unitDefs[unitType];
    if (!unitDef) return false;

    const cost = unitDef.cost;
    if (this.playerState[player.id].ipcs < cost) return false;

    const capital = this.playerState[player.id].capitalTerritory;

    if (unitDef.isSea) {
      // During unit placement, allow placement on any sea adjacent to ANY owned coastal territory
      const ownedCoastal = this.getPlayerTerritories(player.id).filter(tName => {
        const t = this.territoryByName[tName];
        return t && !t.isWater && t.connections.some(conn => {
          const ct = this.territoryByName[conn];
          return ct && ct.isWater;
        });
      });
      const validSeaZones = new Set();
      for (const coastal of ownedCoastal) {
        const t = this.territoryByName[coastal];
        for (const conn of t.connections) {
          const ct = this.territoryByName[conn];
          if (ct && ct.isWater) validSeaZones.add(conn);
        }
      }
      if (!validSeaZones.has(territoryName)) return false;
    } else {
      // Land/air units can only be placed at capital during purchase
      if (territoryName !== capital) return false;
    }

    this.playerState[player.id].ipcs -= cost;

    const units = this.units[territoryName] || [];
    const existing = units.find(u => u.type === unitType && u.owner === player.id);
    if (existing) {
      existing.quantity++;
    } else {
      units.push({ type: unitType, quantity: 1, owner: player.id });
    }
    this.units[territoryName] = units;

    // Track for undo
    this.placementHistory.push({
      territory: territoryName,
      unitType,
      owner: player.id,
      purchased: true,
      cost,
    });

    this._notify();
    return true;
  }

  finishPlacement() {
    this.currentPlayerIndex++;
    if (this.currentPlayerIndex >= this.players.length) {
      this.currentPlayerIndex = 0;
      this.phase = GAME_PHASES.PLAYING;
      // Initialize friendly territories for first turn
      this._initFriendlyTerritoriesAtTurnStart();
    }
    this._notify();
  }

  // A player is out of play if they surrendered, or are fully eliminated
  // (no territories and no units anywhere, including carried aircraft/cargo).
  // Out-of-play players keep their slot in the players array so saved games and
  // colors stay stable, but they never get a turn again — otherwise a wiped-out
  // player who never logs back in would stall a multiplayer game forever.
  _isOutOfPlay(player) {
    if (!player) return false;
    if (player.surrendered) return true;

    const ownsTerritory = Object.values(this.territoryState).some(s => s.owner === player.id);
    if (ownsTerritory) return false;

    for (const units of Object.values(this.units)) {
      for (const u of units) {
        if (u.owner === player.id && (u.quantity || 1) > 0) return false;
        if (u.aircraft?.some(a => a.owner === player.id)) return false;
        if (u.cargo?.some(c => c.owner === player.id)) return false;
      }
    }
    return true;
  }

  nextTurn() {
    // Turn cycle only exists inside PLAYING. Setup must use
    // finishPlacementRound / placeCapital. An unguarded call during
    // unit_placement leaves phase as unit_placement and sets
    // turnPhase to develop_tech — the V2.73 dump combo.
    if (this.phase !== GAME_PHASES.PLAYING) {
      console.warn(`nextTurn() ignored: game phase is '${this.phase}', not playing`);
      return;
    }

    // Advance to the next player still in the game
    let advanceGuard = 0;
    do {
      this.currentPlayerIndex++;
      if (this.currentPlayerIndex >= this.players.length) {
        this.currentPlayerIndex = 0;
        this.round++;
        // Clear combat log at start of new round
        this.clearCombatLog();
      }
      advanceGuard++;
    } while (this._isOutOfPlay(this.players[this.currentPlayerIndex]) && advanceGuard < this.players.length);

    // Last player standing wins (everyone else surrendered or was eliminated)
    if (!this.gameOver) {
      const alive = this.players.filter(p => !this._isOutOfPlay(p));
      if (alive.length === 1) {
        this.gameOver = true;
        this.winner = alive[0].name;
        this.winCondition = 'Last player standing';
      }
    }
    // Reset turn state - start with tech development phase
    this.turnPhase = TURN_PHASES.DEVELOP_TECH;
    this.unitsPlacedThisRound = 0;
    this.unitsPlacedThisRoundOwnerId = null;
    this.pendingPurchases = [];
    this.combatQueue = [];
    this.moveHistory = [];
    this.undoLockMoveCount = 0;
    this.placementHistory = [];
    this.mobilizationHistory = []; // Reset mobilization undo history for new turn
    this.airUnitOrigins = {}; // Reset air unit tracking for new turn
    this.capturedThisTurn = new Set();

    // Track territories that are friendly at the START of this turn (for air landing)
    this._initFriendlyTerritoriesAtTurnStart();

    // Reset per-turn state
    this.amphibiousTerritories = new Set();
    this.amphibiousAssaultDetails = {};
    this.rocketsUsedThisTurn = {};
    this.pendingAirLandings = [];

    // Reset conquered flag for Risk card (one card per turn)
    const player = this.currentPlayer;
    if (player) {
      this.conqueredThisTurn[player.id] = false;
    }
    this._clearMovedFlags();
    this._notify();
    this.autoSave(); // Auto-save after each turn
    emitGameEvent('phase', {
      gameState: this,
      payload: { action: 'turnStart', round: this.round },
    });
  }

  // Helper: populate friendly territories at turn start (for air landing validation)
  _initFriendlyTerritoriesAtTurnStart() {
    const player = this.currentPlayer;
    this.friendlyTerritoriesAtTurnStart = new Set();
    this.factoriesAtTurnStart = new Set();
    if (player) {
      for (const [terrName, state] of Object.entries(this.territoryState)) {
        if (state.owner === player.id || this.areAllies(player.id, state.owner)) {
          this.friendlyTerritoriesAtTurnStart.add(terrName);
        }
      }
      // Track factories at turn start for mobilization rules
      const factories = this._getFactoryTerritories(player.id);
      for (const terrName of factories) {
        this.factoriesAtTurnStart.add(terrName);
      }
    }
  }

  // Check if a phase should be skipped (nothing to do)
  _shouldSkipPhase(phase) {
    const player = this.currentPlayer;
    if (!player) return false;

    switch (phase) {
      case TURN_PHASES.COMBAT:
        // Skip if no combats pending
        this._detectCombats();
        return this.combatQueue.length === 0;

      case TURN_PHASES.MOBILIZE:
        // Skip if nothing was purchased
        return this.pendingPurchases.length === 0;

      default:
        return false;
    }
  }

  // Advance to the next turn phase
  nextPhase() {
    // Turn phases only exist inside the PLAYING phase. Refusing to advance
    // here makes setup-phase turnPhase corruption structurally impossible —
    // in the V2.53 playtest a racing client pushed phase=unit_placement with
    // turnPhase=purchase, wedging the game.
    if (this.phase !== GAME_PHASES.PLAYING) {
      console.warn(`nextPhase() ignored: game phase is '${this.phase}', not playing`);
      return;
    }

    let currentIndex = TURN_PHASE_ORDER.indexOf(this.turnPhase);
    const leavingPhase = this.turnPhase;

    // Fail-closed: named post-combat landings apply on any advance
    // (COMBAT→NCM and leftover NCM overlay → mobilize).
    this.applyPendingAirLandings({ notify: false });

    // Loose air over water is legal during the phase (battle hex, or an NCM
    // hop). Landing/crash runs only when that phase actually ends. Doing it
    // before the combat-queue guard pulled attackers out of an unresolved
    // battle and then refused to leave COMBAT (9.21.26.02).
    const landLooseAirIfLeavingAirPhase = () => {
      if (leavingPhase !== TURN_PHASES.COMBAT && leavingPhase !== TURN_PHASES.NON_COMBAT_MOVE) return;
      const defs = this._unitDefs || this.unitDefs || {};
      this.relocateAirFromCapturedLand(defs);
      this.resolveLooseAirOverWater(defs);
    };

    while (currentIndex < TURN_PHASE_ORDER.length - 1) {
      currentIndex++;
      const nextPhase = TURN_PHASE_ORDER[currentIndex];

      // Handle special phase transitions
      if (nextPhase === TURN_PHASES.COMBAT) {
        this._detectCombats();
        // Skip if no combats
        if (this.combatQueue.length === 0) {
          continue;
        }
      } else if (nextPhase === TURN_PHASES.NON_COMBAT_MOVE) {
        // Block advancing if there are unresolved combats
        if (this.combatQueue && this.combatQueue.length > 0) {
          // Cannot advance - combats must be resolved first
          console.warn('Cannot advance to non-combat move: unresolved combats remain');
          return; // Don't advance, stay in current phase
        }
        this.applyPendingAirLandings({ notify: false });
      } else if (nextPhase === TURN_PHASES.MOBILIZE) {
        // Check if there are any pending purchases to place
        const player = this.currentPlayer;
        const hasPurchases = this.pendingPurchases.some(p => p.owner === player.id);
        if (!hasPurchases) {
          // Skip mobilize phase if nothing to place
          continue;
        }
      } else if (nextPhase === TURN_PHASES.COLLECT_INCOME) {
        // Block advancing from MOBILIZE if there are still pending purchases
        if (this.turnPhase === TURN_PHASES.MOBILIZE) {
          const player = this.currentPlayer;
          const remainingPurchases = this.pendingPurchases.filter(p => p.owner === player.id);
          const totalRemaining = remainingPurchases.reduce((sum, p) => sum + p.quantity, 0);
          if (totalRemaining > 0) {
            console.warn('Cannot advance: must place all purchased units first');
            return; // Don't advance, stay in mobilize phase
          }
        }
        landLooseAirIfLeavingAirPhase();
        this._collectIncome();
        // Auto-advance to next player
        this.nextTurn();
        return;
      }

      // Leaving combat movement commits those moves. Undo stays available
      // for later NCM moves. Combat phase itself is never undoable.
      if (this.turnPhase === TURN_PHASES.COMBAT_MOVE) {
        this.undoLockMoveCount = this.moveHistory.length;
      }

      // COMBAT→NCM and NCM→mobilize: aircraft cannot remain over open water.
      landLooseAirIfLeavingAirPhase();
      // Set the phase and break
      this.turnPhase = nextPhase;
      break;
    }

    this._notify();
    this.autoSave(); // Auto-save after each phase change
    emitGameEvent('phase', {
      gameState: this,
      payload: { action: 'nextPhase', turnPhase: this.turnPhase },
    });
  }

  // Get current turn phase name
  getTurnPhaseName() {
    return TURN_PHASE_NAMES[this.turnPhase] || this.turnPhase;
  }

  // Purchase units (during PURCHASE phase)
  purchaseForMobilization(unitType, quantity, unitDefs) {
    if (!shouldShowPurchase(this.phase, this.turnPhase)) return false;

    const player = this.currentPlayer;
    if (!player) return false;

    const unitDef = unitDefs[unitType];
    if (!unitDef) return false;

    const totalCost = unitDef.cost * quantity;
    if (this.playerState[player.id].ipcs < totalCost) return false;

    this.playerState[player.id].ipcs -= totalCost;

    // Add to pending purchases — owner is required so getPendingPurchases
    // (filters by current player) still sees fighters / air after buy.
    const existing = this.pendingPurchases.find(p => p.type === unitType && p.owner === player.id);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.pendingPurchases.push({ type: unitType, quantity, owner: player.id });
    }

    this._notify();
    emitGameEvent('purchase', {
      gameState: this,
      payload: {
        unitType,
        quantity,
        ipcDelta: -totalCost,
        via: 'purchaseForMobilization',
      },
    });
    return true;
  }

  // Move units (during COMBAT_MOVE or NON_COMBAT_MOVE phase)
  // options.shipIds: array of specific ship IDs to move (for carriers/transports with cargo)
  // options.targetShipId: specific ship to load cargo onto
  moveUnits(fromTerritory, toTerritory, unitsToMove, unitDefs, options = {}) {
    const isCombatMove = this.turnPhase === TURN_PHASES.COMBAT_MOVE;
    const isNonCombatMove = this.turnPhase === TURN_PHASES.NON_COMBAT_MOVE;

    if (!isCombatMove && !isNonCombatMove) return { success: false, error: 'Not in movement phase' };

    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    const fromT = this.territoryByName[fromTerritory];
    const toT = this.territoryByName[toTerritory];
    if (!fromT || !toT) return { success: false, error: 'Invalid territory' };

    // Check for adjacent connection (includes land bridges)
    const connections = this.getConnections(fromTerritory);
    const isAdjacent = connections.includes(toTerritory);
    const isLandBridge = this.hasLandBridge(fromTerritory, toTerritory);

    // Check destination ownership. Sea zones are unowned, so an enemy fleet
    // is what makes sea→sea a combat-move attack.
    const toOwner = this.getOwner(toTerritory);
    const isEnemy = toOwner && toOwner !== player.id && !this.areAllies(player.id, toOwner);
    const isAllied = toOwner && toOwner !== player.id && this.areAllies(player.id, toOwner);
    const hostileSea = !!(toT?.isWater && seaZoneHasEnemyForAirAttack(this, toTerritory, player.id));

    // Non-combat move rules
    if (isNonCombatMove) {
      // Cannot enter enemy territory or a sea zone that still has enemies
      if (isEnemy || hostileSea) {
        return { success: false, error: 'Cannot enter enemy territory in non-combat move' };
      }
      // Can freely pass through allied territories
    }

    // Combat move rules - can move through friendly and allied territories to reach enemy
    // (Allied territories are passable during combat move)

    // Validate and move each unit
    const fromUnits = this.units[fromTerritory] || [];

    // Separate units by type for different validation
    const airUnits = unitsToMove.filter(u => unitDefs[u.type]?.isAir);
    const landUnits = unitsToMove.filter(u => unitDefs[u.type]?.isLand);
    const seaUnits = unitsToMove.filter(u => unitDefs[u.type]?.isSea);

    // For sea units, check if destination is reachable within movement range
    if (seaUnits.length > 0) {
      if (!toT?.isWater) {
        return { success: false, error: 'Naval units can only move to sea zones' };
      }
      // Get max sea movement range of units being moved
      let maxSeaMovement = 0;
      for (const seaUnit of seaUnits) {
        const def = unitDefs[seaUnit.type];
        if (def?.movement > maxSeaMovement) {
          maxSeaMovement = def.movement;
        }
      }
      // Check if destination is reachable within movement range
      if (!isAdjacent && maxSeaMovement > 1) {
        if (!this.canSeaUnitReach(fromTerritory, toTerritory, maxSeaMovement, player.id, isCombatMove)) {
          return { success: false, error: 'Sea zone not reachable within movement range' };
        }
      } else if (!isAdjacent) {
        return { success: false, error: 'Sea zones not connected for naval units' };
      }
    }

    // Land-only combat move cannot attack a sea zone. Loading onto a friendly
    // transport (amphibious) is the only water dest, and only when one exists.
    if (isCombatMove && toT?.isWater && airUnits.length === 0 && landUnits.length > 0 && seaUnits.length === 0) {
      const profile = moveSelectionProfile(
        Object.fromEntries(landUnits.map((unit) => [unit.type, unit.quantity])),
        unitDefs,
      );
      const hasFriendlyTransport = (this.units[toTerritory] || []).some((unit) => (
        unit.type === 'transport' && unit.owner === player.id && (Number(unit.quantity) || 0) > 0
      ));
      if (landOnlySeaAttackIllegal(profile, true) && !hasFriendlyTransport) {
        return { success: false, error: 'Land units cannot attack a sea zone' };
      }
    }

    // For land units, check if destination is reachable (multi-hop for tanks with movement > 1)
    // Also check if loading onto transport is allowed during non-combat
    let loadingOntoTransport = false;
    for (const landUnit of landUnits) {
      const unitDef = unitDefs[landUnit.type];
      if (!unitDef) continue;

      const movementRange = unitDef.movement || 1;

      // Check terrain - allow loading onto transport during movement phases
      // Combat move loading allowed for amphibious assaults (per A&A rules)
      if (toT?.isWater) {
        // For units with movement > 1, check if any territory adjacent to the sea zone
        // is reachable within the unit's movement range
        let canReachSeaZone = isAdjacent;

        if (!canReachSeaZone && movementRange > 1 && (isNonCombatMove || isCombatMove)) {
          // Find all land territories adjacent to the sea zone
          const seaZoneConns = toT.connections || [];
          for (const adjTerr of seaZoneConns) {
            const adjT = this.territoryByName[adjTerr];
            if (!adjT || adjT.isWater) continue;

            // Check if this adjacent territory is reachable within (movementRange - 1) steps
            // (we need 1 step left to load onto transport)
            if (adjTerr === fromTerritory) {
              canReachSeaZone = true;
              break;
            }
            if (this.canLandUnitReach(fromTerritory, adjTerr, movementRange - 1, player.id, isCombatMove)) {
              canReachSeaZone = true;
              break;
            }
          }
        }

        if ((isNonCombatMove || isCombatMove) && canReachSeaZone) {
          // Check if there's a transport with capacity
          const seaUnits = this.units[toTerritory] || [];
          const transports = seaUnits.filter(u => u.type === 'transport' && u.owner === player.id);
          const transportDef = unitDefs.transport;

          if (transportDef && transportDef.canCarry?.includes(landUnit.type)) {
            // Calculate total slots available for this unit type across all transports
            // NOTE: Grouped transports (quantity > 1) have no cargo, individual transports have IDs
            let availableSlots = 0;
            for (const transport of transports) {
              const currentCargo = transport.cargo || [];
              const slotsPerShip = this._countAvailableSlotsForType(currentCargo, landUnit.type);
              // For grouped transports, multiply by quantity (grouped transports have no cargo)
              const shipCount = transport.id ? 1 : (transport.quantity || 1);
              availableSlots += slotsPerShip * shipCount;
            }
            if (availableSlots >= landUnit.quantity) {
              loadingOntoTransport = true;
            } else {
              return { success: false, error: `Not enough transport capacity (need ${landUnit.quantity}, have ${availableSlots} slots)` };
            }
          } else {
            return { success: false, error: 'Land units cannot enter water without transport' };
          }
        } else {
          return { success: false, error: 'Land units cannot enter water without transport' };
        }
      } else if (movementRange > 1) {
        // Units with movement > 1 (like tanks) can blitz through friendly territory
        if (!this.canLandUnitReach(fromTerritory, toTerritory, movementRange, player.id, isCombatMove)) {
          return { success: false, error: `${landUnit.type} cannot reach ${toTerritory} (movement: ${movementRange})` };
        }
      } else {
        // Movement 1 units require adjacency
        if (!isAdjacent) {
          return { success: false, error: `${landUnit.type} can only move to adjacent territories` };
        }
      }
    }

    // For air units, check if destination is within movement range
    // Also check if landing on carrier is allowed during non-combat
    let landingOnCarrier = false;
    const hasLongRangeAircraft = this.hasTech(player.id, 'longRangeAircraft');
    for (const airUnit of airUnits) {
      const unitDef = unitDefs[airUnit.type];
      if (!unitDef) continue;

      // Apply Long Range Aircraft tech bonus (+2 movement for fighters and bombers)
      const baseMovement = unitDef.movement || 4;
      const movementRange = hasLongRangeAircraft ? baseMovement + 2 : baseMovement;

      // Check if destination is reachable within air unit's movement range
      if (!this.canAirUnitReach(fromTerritory, toTerritory, movementRange)) {
        return { success: false, error: `${airUnit.type} cannot reach ${toTerritory} (movement: ${movementRange})` };
      }

      const airDistance = this._calculateAirDistance(fromTerritory, toTerritory);
      const airRemaining = movementRange - airDistance;
      // Just-captured land is friendly to ground units only (9.21.26.07).
      if (!toT?.isWater && !wasFriendlyAtTurnStart(this, toTerritory, player.id) && !(isCombatMove && isEnemy)) {
        return { success: false, error: 'Air cannot land on a territory captured this turn' };
      }
      // Empty enemy or neutral land is not a combat-move attack. Aircraft
      // do not conquer it and must not end the move sitting on it.
      if (isCombatMove && !toT?.isWater && !airCombatMoveMayOccupy(this, toTerritory, player.id)) {
        return { success: false, error: 'Aircraft cannot attack or occupy an empty territory' };
      }
      if (isCombatMove && !hasLegalAirLandingFrom(
        this, toTerritory, airRemaining, airUnit.type, unitDefs, player.id,
      )) {
        return { success: false, error: `${airUnit.type} cannot land after reaching ${toTerritory}` };
      }

      // Check if landing on water (needs carrier OR attacking enemy naval units)
      if (toT?.isWater) {
        const seaUnits = this.units[toTerritory] || [];
        const carriers = seaUnits.filter(u => u.type === 'carrier' && u.owner === player.id);
        const carrierDef = unitDefs.carrier;

        // Check if there are enemy naval units to attack (combat move)
        const enemyNaval = seaUnits.filter(u =>
          u.owner !== player.id && !this.areAllies(player.id, u.owner)
        );
        const hasEnemyNaval = enemyNaval.some(u => u.quantity > 0);

        if (isCombatMove && hasEnemyNaval) {
          // During combat move, air units can attack naval units without landing
          // They will need to land after combat (validated separately)
          // Just ensure they have enough movement to return somewhere
          // This check is done later during air landing phase
          landingOnCarrier = false; // Not landing on carrier, attacking then returning
        } else if (carrierDef && carrierDef.canCarry?.includes(airUnit.type)) {
          // Calculate total capacity available
          let availableCapacity = 0;
          for (const carrier of carriers) {
            const currentAircraft = carrier.aircraft || [];
            const capacity = carrierDef.aircraftCapacity || 2;
            availableCapacity += Math.max(0, capacity - currentAircraft.length);
          }
          if (availableCapacity >= airUnit.quantity) {
            landingOnCarrier = true;
          } else {
            return { success: false, error: 'Not enough carrier capacity for aircraft' };
          }
        } else {
          return { success: false, error: 'Aircraft cannot land on water without a carrier' };
        }
      }
    }

    // Track which ship IDs were moved (for move history)
    const movedShipIds = [];

    // Handle moving specific ships by ID (carriers/transports with cargo)
    // IMPORTANT: Don't return early - continue to process unitsToMove as well
    if (options.shipIds && options.shipIds.length > 0) {
      const toUnits = this.units[toTerritory] || [];

      for (const shipId of options.shipIds) {
        const shipIdx = fromUnits.findIndex(u => u.id === shipId && u.owner === player.id);
        if (shipIdx < 0) {
          return { success: false, error: `Ship ${shipId} not found` };
        }

        const ship = fromUnits[shipIdx];
        const shipDef = unitDefs[ship.type];
        const maxMove = shipDef?.movement || 2;
        const movementUsed = ship.movementUsed || 0;

        if (movementUsed >= maxMove) {
          return { success: false, error: `Ship ${shipId} has no movement remaining` };
        }

        // Remove from source
        fromUnits.splice(shipIdx, 1);

        // Add to destination with movement tracked. Entering a hostile sea
        // zone ends the ship's move (A&A must-stop) so Confirm Attack commits.
        if (isCombatMove && hostileSea) {
          ship.movementUsed = maxMove;
          ship.moved = true;
        } else {
          ship.movementUsed = movementUsed + 1;
          ship.moved = ship.movementUsed >= maxMove;
        }
        toUnits.push(ship);
        movedShipIds.push(shipId);
      }

      this.units[toTerritory] = toUnits;
    }

    // Optimize transport loading if loading land units onto transports
    // Sort to load non-infantry first (tanks/artillery have limited slots)
    if (loadingOntoTransport && toT?.isWater) {
      // Build a map of units to load for optimization
      const unitsToLoadMap = {};
      for (const moveUnit of unitsToMove) {
        const unitDef = unitDefs[moveUnit.type];
        if (unitDef?.isLand) {
          unitsToLoadMap[moveUnit.type] = (unitsToLoadMap[moveUnit.type] || 0) + moveUnit.quantity;
        }
      }

      // Get all transports at destination
      const destUnits = this.units[toTerritory] || [];
      const transports = destUnits.filter(u => u.type === 'transport' && u.owner === player.id);

      // Optimize cargo distribution
      this._optimizeTransportCargo(transports, unitsToLoadMap, player.id);

      // Sort unitsToMove so non-infantry loads first
      unitsToMove.sort((a, b) => {
        const aIsInf = a.type === 'infantry' ? 1 : 0;
        const bIsInf = b.type === 'infantry' ? 1 : 0;
        return aIsInf - bIsInf; // Non-infantry first
      });
    }

    const launchedFromCarrier = {};
    for (const moveUnit of unitsToMove) {
      const unitDef = unitDefs[moveUnit.type];
      if (!unitDef) continue;

      // Helper to check if unit has remaining movement
      const hasRemainingMovement = (u) => {
        if (u.moved) return false;
        // For sea units with multi-hop, check movementUsed
        if (unitDef.isSea && (unitDef.movement || 1) > 1) {
          const maxMove = unitDef.movement || 1;
          const used = u.movementUsed || 0;
          return used < maxMove;
        }
        return true;
      };

      // Fighters selected on a carrier are not loose stacks. Launch the
      // shortfall off friendly carriers in this sea zone (9.21.26.10).
      if (unitDef.isAir && fromT?.isWater) {
        const loose = fromUnits
          .filter((u) => u.type === moveUnit.type && u.owner === player.id && hasRemainingMovement(u) && !u.id)
          .reduce((sum, u) => sum + (u.quantity || 0), 0);
        if (loose < moveUnit.quantity) {
          const need = moveUnit.quantity - loose;
          const aboard = countCarrierAir(this, fromTerritory, moveUnit.type, player.id);
          if (loose + aboard < moveUnit.quantity) {
            return { success: false, error: `Not enough ${moveUnit.type} to move` };
          }
          const got = takeAirFromCarriers(this, fromTerritory, moveUnit.type, player.id, need);
          if (got > 0) {
            fromUnits.push({ type: moveUnit.type, quantity: got, owner: player.id });
            launchedFromCarrier[moveUnit.type] = (launchedFromCarrier[moveUnit.type] || 0) + got;
          }
        }
      }

      // Find ALL matching units (grouped) that can provide units
      // This handles multiple stacks with different movementUsed values
      const sourceStacks = fromUnits.filter(u =>
        u.type === moveUnit.type &&
        u.owner === player.id &&
        hasRemainingMovement(u) &&
        !u.id // Only grouped units
      );

      // Calculate total available
      const totalAvailable = sourceStacks.reduce((sum, u) => sum + u.quantity, 0);

      if (totalAvailable < moveUnit.quantity) {
        return { success: false, error: `Not enough ${moveUnit.type} to move` };
      }

      // Check movement rules
      // Air units can fly over any terrain (land or water) - already validated above
      if (unitDef.isAir) {
        // Air units validated above for multi-hop movement
        // They can land on water if there's a carrier (handled below)
      } else if (isLandBridge) {
        // Land bridges allow land units to cross without naval transport
        if (unitDef.isSea) {
          return { success: false, error: 'Naval units cannot use land bridges' };
        }
      } else {
        // Normal movement rules for land and sea units
        // Allow land units to water if loading onto transport (validated above)
        if (unitDef.isLand && toT?.isWater && !loadingOntoTransport) {
          return { success: false, error: 'Land units cannot enter water' };
        }
        if (unitDef.isSea && !toT?.isWater) {
          return { success: false, error: 'Sea units cannot enter land' };
        }
      }

      // Perform the move - pull from multiple stacks if needed
      // Track how much we took from each stack (for sea units with multi-hop)
      const takenByMovementUsed = {}; // { movementUsed: quantity }
      let remaining = moveUnit.quantity;

      for (const sourceUnit of sourceStacks) {
        if (remaining <= 0) break;

        const toTake = Math.min(remaining, sourceUnit.quantity);
        const srcMovementUsed = sourceUnit.movementUsed || 0;

        // Track for sea unit multi-hop
        takenByMovementUsed[srcMovementUsed] = (takenByMovementUsed[srcMovementUsed] || 0) + toTake;

        sourceUnit.quantity -= toTake;
        remaining -= toTake;

        if (sourceUnit.quantity <= 0) {
          const idx = fromUnits.indexOf(sourceUnit);
          fromUnits.splice(idx, 1);
        }
      }

      // Handle special loading onto carriers/transports
      const toUnits = this.units[toTerritory] || [];

      if (unitDef.isAir && landingOnCarrier && toT?.isWater) {
        // Load onto carrier - individualize ship when loading aircraft
        const carrierDef = unitDefs.carrier;
        let remaining = moveUnit.quantity;

        // First try individual carriers (already have IDs)
        const individualCarriers = toUnits.filter(u =>
          u.type === 'carrier' && u.owner === player.id && u.id
        );

        for (const carrier of individualCarriers) {
          if (remaining <= 0) break;
          carrier.aircraft = carrier.aircraft || [];
          const capacity = carrierDef?.aircraftCapacity || 2;
          const available = capacity - carrier.aircraft.length;
          const toLoad = Math.min(remaining, available);

          for (let i = 0; i < toLoad; i++) {
            carrier.aircraft.push({ type: moveUnit.type, owner: player.id });
          }
          remaining -= toLoad;
        }

        // Then use grouped carriers - individualize each one used
        while (remaining > 0) {
          const newCarrier = this._individualizeShip(toTerritory, 'carrier', player.id);
          if (!newCarrier) break;

          newCarrier.aircraft = newCarrier.aircraft || [];
          const capacity = carrierDef?.aircraftCapacity || 2;
          const available = capacity - newCarrier.aircraft.length;
          const toLoad = Math.min(remaining, available);

          for (let i = 0; i < toLoad; i++) {
            newCarrier.aircraft.push({ type: moveUnit.type, owner: player.id });
          }
          remaining -= toLoad;
        }
      } else if (unitDef.isLand && loadingOntoTransport && toT?.isWater) {
        // Load onto transport - individualize ship when loading cargo
        let remaining = moveUnit.quantity;

        // First try individual transports (already have IDs)
        const individualTransports = toUnits.filter(u =>
          u.type === 'transport' && u.owner === player.id && u.id
        );

        for (const transport of individualTransports) {
          if (remaining <= 0) break;
          transport.cargo = transport.cargo || [];

          while (remaining > 0 && this._canLoadOnTransport(transport.cargo, moveUnit.type)) {
            transport.cargo.push({ type: moveUnit.type, owner: player.id });
            remaining--;
          }
        }

        // Then use grouped transports - individualize each one used
        while (remaining > 0) {
          const newTransport = this._individualizeShip(toTerritory, 'transport', player.id);
          if (!newTransport) break;

          while (remaining > 0 && this._canLoadOnTransport(newTransport.cargo, moveUnit.type)) {
            newTransport.cargo.push({ type: moveUnit.type, owner: player.id });
            remaining--;
          }
        }
      } else {
        // Normal movement - add to destination
        // For sea units with movement > 1, track movementUsed to allow multi-hop
        const maxMovement = unitDef.movement || 1;

        if (unitDef.isSea && maxMovement > 1) {
          // Sea units with multi-hop capability need individual tracking
          // Units from different source stacks (different movementUsed) go to different dest stacks

          for (const [srcMovementStr, quantity] of Object.entries(takenByMovementUsed)) {
            const srcMovement = parseInt(srcMovementStr);
            const stopForBattle = isCombatMove && hostileSea;
            const newMovementUsed = stopForBattle ? maxMovement : srcMovement + 1;
            const isFullyMoved = stopForBattle || newMovementUsed >= maxMovement;

            // Find matching stack at destination with same movement state
            const destUnit = toUnits.find(u =>
              u.type === moveUnit.type &&
              u.owner === player.id &&
              (u.movementUsed || 0) === newMovementUsed
            );

            if (destUnit) {
              destUnit.quantity += quantity;
            } else {
              toUnits.push({
                type: moveUnit.type,
                quantity: quantity,
                owner: player.id,
                moved: isFullyMoved,
                movementUsed: newMovementUsed
              });
            }
          }
        } else {
          // Land/air units or sea units with movement=1: use simple moved flag
          const destUnit = toUnits.find(u => u.type === moveUnit.type && u.owner === player.id && u.moved);
          if (destUnit) {
            // Merge with existing moved stack
            destUnit.quantity += moveUnit.quantity;
          } else {
            // Create new moved stack (separate from any unmoved units in territory)
            toUnits.push({
              type: moveUnit.type,
              quantity: moveUnit.quantity,
              owner: player.id,
              moved: true
            });
          }
        }
      }
      this.units[toTerritory] = toUnits;
    }

    // Check if we captured an empty enemy territory (land only, not water)
    // Per A&A rules: Only LAND units can capture territory - air units cannot hold ground
    let captured = false;
    let cardAwarded = null;

    // Check if we moved any land units (only land units can capture)
    const movedLandUnits = unitsToMove.some(u => {
      const def = unitDefs[u.type];
      return def && def.isLand;
    });

    // TANK BLITZ: Capture undefended enemy territories along the path
    // Only during combat move, only for land units with movement > 1
    let blitzedCaptures = []; // Array of { territory, previousOwner }
    if (isCombatMove && movedLandUnits) {
      // Find max movement range of land units being moved
      let maxLandMovement = 0;
      for (const moveUnit of unitsToMove) {
        const def = unitDefs[moveUnit.type];
        if (def?.isLand && (def.movement || 1) > maxLandMovement) {
          maxLandMovement = def.movement || 1;
        }
      }

      // If we have tanks (movement > 1), check for blitzed territories
      if (maxLandMovement > 1) {
        const blitzedTerritories = this.getBlitzedTerritories(fromTerritory, toTerritory, maxLandMovement, player.id);

        // Capture each blitzed territory
        for (const blitzedTerrName of blitzedTerritories) {
          const blitzedOwner = this.getOwner(blitzedTerrName);
          if (blitzedOwner && blitzedOwner !== player.id) {
            // Track for undo
            blitzedCaptures.push({ territory: blitzedTerrName, previousOwner: blitzedOwner });

            // Capture the territory
            this.territoryState[blitzedTerrName].owner = player.id;

            // Award Risk card for conquering (one per turn per Risk rules)
            if (!this.conqueredThisTurn[player.id]) {
              this.conqueredThisTurn[player.id] = true;
              cardAwarded = this.awardRiskCard(player.id);
            }
          }
        }
      }
    }

    if (!toT?.isWater && isEnemy && movedLandUnits) {
      // Check if there are any enemy units remaining
      const enemyUnits = this.units[toTerritory]?.filter(u =>
        u.owner !== player.id && !this.areAllies(player.id, u.owner)
      ) || [];
      if (enemyUnits.length === 0) {
        // Capture the territory immediately
        this.territoryState[toTerritory].owner = player.id;
        captured = true;

        // Award Risk card for conquering (one per turn per Risk rules)
        if (!this.conqueredThisTurn[player.id]) {
          this.conqueredThisTurn[player.id] = true;
          cardAwarded = this.awardRiskCard(player.id);
        }
      }
    }

    // Record move with full info for undo
    this._pushMove({
      from: fromTerritory,
      to: toTerritory,
      units: unitsToMove.map(u => ({ ...u })),
      shipIds: movedShipIds.length > 0 ? movedShipIds : undefined,
      player: player.id,
      captured, // Track if territory was captured for undo
      previousOwner: isEnemy ? toOwner : null,
      loadedOntoTransport: loadingOntoTransport, // Track for undo - remove from cargo
      loadedOntoCarrier: landingOnCarrier, // Track for undo - remove from aircraft
      launchedFromCarrier: Object.keys(launchedFromCarrier).length > 0 ? launchedFromCarrier : undefined,
      blitzedCaptures: blitzedCaptures.length > 0 ? blitzedCaptures : undefined, // Track blitzed territories for undo
    });

    // Track air unit origins for post-combat landing (combat move only)
    if (isCombatMove) {
      for (const moveUnit of unitsToMove) {
        const def = unitDefs[moveUnit.type];
        if (def?.isAir) {
          // Calculate distance traveled
          const distance = this._calculateAirDistance(fromTerritory, toTerritory);

          // Store origin info for this territory
          if (!this.airUnitOrigins[toTerritory]) {
            this.airUnitOrigins[toTerritory] = {};
          }

          // Track origin - if moving again, keep original origin
          const existingOrigin = this.airUnitOrigins[fromTerritory]?.[moveUnit.type];
          if (existingOrigin) {
            // Already moved once, update destination but keep original origin
            this.airUnitOrigins[toTerritory][moveUnit.type] = {
              origin: existingOrigin.origin,
              distance: existingOrigin.distance + distance,
              movement: def.movement,
            };
            // Remove from old location tracking
            delete this.airUnitOrigins[fromTerritory][moveUnit.type];
          } else {
            // First move - record origin
            this.airUnitOrigins[toTerritory][moveUnit.type] = {
              origin: fromTerritory,
              distance: distance,
              movement: def.movement,
            };
          }
        }
      }
    }

    this._notify();
    const isAttack = isCombatMove && (isEnemy || hostileSea) && !captured;
    emitGameEvent(isAttack ? 'attack' : 'move', {
      gameState: this,
      territory: toTerritory,
      payload: {
        from: fromTerritory,
        to: toTerritory,
        units: summarizeUnits(unitsToMove),
        combatMove: isCombatMove,
        captured,
        cardAwarded: cardAwarded || null,
      },
    });
    return {
      success: true,
      from: fromTerritory,
      to: toTerritory,
      units: unitsToMove,
      shipIds: movedShipIds.length > 0 ? movedShipIds : undefined,
      captured,
      cardAwarded,
      isAttack,
      blitzedCaptures: blitzedCaptures.length > 0 ? blitzedCaptures : undefined,
    };
  }

  _pushMove(entry) {
    if (!this.moveHistory) this.moveHistory = [];
    this._moveSerial = (Number(this._moveSerial) || 0) + 1;
    const id = entry?.id || `mv${this._moveSerial}`;
    this.moveHistory.push({ ...entry, id });
    return id;
  }

  _ensureMoveIds() {
    if (!this.moveHistory) this.moveHistory = [];
    for (let i = 0; i < this.moveHistory.length; i++) {
      const move = this.moveHistory[i];
      if (move && !move.id) {
        this._moveSerial = (Number(this._moveSerial) || 0) + 1;
        move.id = `mv${this._moveSerial}`;
      }
    }
  }

  _movementUndoPhaseError() {
    if (this.turnPhase === TURN_PHASES.COMBAT) {
      return { success: false, error: 'Cannot undo after combat resolve' };
    }
    if (this.turnPhase !== TURN_PHASES.COMBAT_MOVE && this.turnPhase !== TURN_PHASES.NON_COMBAT_MOVE) {
      return { success: false, error: 'Can only undo during movement phases' };
    }
    return null;
  }

  // Undo the newest movement. Same phase lock as before.
  undoLastMove() {
    const blocked = this._movementUndoPhaseError();
    if (blocked) return blocked;
    if ((this.moveHistory?.length || 0) <= (this.undoLockMoveCount || 0)) {
      return { success: false, error: 'Cannot undo a committed combat move' };
    }
    return this.undoMoveAt(this.moveHistory.length - 1);
  }

  undoMoveById(id) {
    this._ensureMoveIds();
    const want = String(id || '');
    let index = this.moveHistory.findIndex((m) => m && m.id === want);
    if (index < 0) {
      const legacy = /^idx-(\d+)$/.exec(want);
      if (legacy) index = Number(legacy[1]);
    }
    if (index < 0) return { success: false, error: 'Move not found' };
    return this.undoMoveAt(index);
  }

  // Revert every unlocked combat / non-combat move, newest first.
  undoAllMoves() {
    let undone = 0;
    let guard = 0;
    while ((this.moveHistory?.length || 0) > (this.undoLockMoveCount || 0) && guard < 40) {
      guard += 1;
      const before = this.moveHistory.length;
      const result = this.undoLastMove();
      if (!result?.success) break;
      undone += result.undone || 1;
      if (this.moveHistory.length >= before) break;
    }
    return { success: undone > 0, undone };
  }

  _moveHasLaterContinuation(index) {
    const earlier = this.moveHistory?.[index];
    if (!earlier) return false;
    for (let i = index + 1; i < this.moveHistory.length; i++) {
      if (cascadeUndoIndexes(this.moveHistory, index).includes(i) && i !== index) return true;
    }
    return false;
  }

  _moveUnitsStillAtDestination(move) {
    if (!move) return false;
    const toUnits = this.units?.[move.to] || [];
    if (move.shipIds?.length) {
      return move.shipIds.every((id) => toUnits.some((u) => u.id === id));
    }
    if (move.isAmphibious || move.loadedOntoTransport || move.loadedOntoCarrier) return true;
    const units = Array.isArray(move.units) ? move.units : [];
    if (!units.length) return false;
    for (const unit of units) {
      const need = Number(unit.quantity) || 1;
      const have = toUnits
        .filter((stack) => stack.type === unit.type && stack.owner === move.player && !stack.id)
        .reduce((sum, stack) => sum + (Number(stack.quantity) || 0), 0);
      if (have < need) return false;
    }
    return true;
  }

  // Undo one listed row. Later moves stay until their own Undo is clicked.
  undoMoveAt(index) {
    const blocked = this._movementUndoPhaseError();
    if (blocked) return blocked;
    this._ensureMoveIds();
    const lock = this.undoLockMoveCount || 0;
    if (!Number.isInteger(index) || index < lock || index >= this.moveHistory.length) {
      return { success: false, error: 'Cannot undo a committed combat move' };
    }
    // 9.22.26.04: the clicked row is the only undo. A later hop of the same
    // units is a different row. If those units have already left this
    // destination, refuse instead of reverting the rest of the stack.
    if (this._moveHasLaterContinuation(index) && !this._moveUnitsStillAtDestination(this.moveHistory[index])) {
      return { success: false, error: 'Undo the later move of these units first' };
    }
    const order = [index];
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };
    for (const i of order) {
      if (this.moveHistory[i]?.player !== player.id) {
        return { success: false, error: 'Cannot undo other player moves' };
      }
    }
    const moves = order.map((i) => this.moveHistory[i]);
    for (const i of order) this.moveHistory.splice(i, 1);
    for (const move of moves) this._applyMoveUndo(move);
    this._notify();
    return { success: true, undone: moves.length, id: moves[moves.length - 1]?.id || null };
  }

  _applyMoveUndo(lastMove) {
    const player = this.currentPlayer;

    // Move units back from destination to source
    const toUnits = this.units[lastMove.to] || [];
    const fromUnits = this.units[lastMove.from] || [];

    // Handle amphibious unload (cargo was unloaded from transport)
    if (lastMove.isAmphibious && lastMove.transportId) {
      // Find the transport in the source territory (sea zone)
      const transport = fromUnits.find(u => u.id === lastMove.transportId);

      for (const moveUnit of lastMove.units) {
        // Remove from destination (land territory)
        const destUnit = toUnits.find(u => u.type === moveUnit.type && u.owner === player.id && !u.id);
        if (destUnit) {
          destUnit.quantity -= moveUnit.quantity;
          if (destUnit.quantity <= 0) {
            const idx = toUnits.indexOf(destUnit);
            toUnits.splice(idx, 1);
          }
        }

        // Put cargo back on transport
        if (transport) {
          transport.cargo = transport.cargo || [];
          const existingCargo = transport.cargo.find(c => c.type === moveUnit.type);
          if (existingCargo) {
            existingCargo.quantity = (existingCargo.quantity || 1) + moveUnit.quantity;
          } else {
            transport.cargo.push({ type: moveUnit.type, quantity: moveUnit.quantity, owner: player.id });
          }
        }
      }

      this.units[lastMove.from] = fromUnits;
      this.units[lastMove.to] = toUnits;

      // Check if any friendly units remain in destination - if not, remove from amphibiousTerritories
      const remainingFriendly = toUnits.filter(u => u.owner === player.id);
      if (remainingFriendly.length === 0 && this.amphibiousTerritories) {
        this.amphibiousTerritories.delete(lastMove.to);
      }
      if (lastMove.captured && lastMove.previousOwner && this.territoryState[lastMove.to]) {
        this.territoryState[lastMove.to].owner = lastMove.previousOwner;
      }
      return { success: true };
    }

    // Handle individual ships (transports/carriers with cargo) moved by ID
    if (lastMove.shipIds && lastMove.shipIds.length > 0) {
      for (const shipId of lastMove.shipIds) {
        // Find ship in destination
        const shipIdx = toUnits.findIndex(u => u.id === shipId);
        if (shipIdx >= 0) {
          const ship = toUnits.splice(shipIdx, 1)[0];
          delete ship.moved;
          // Reset movement counter - reduce by 1 for this undone move
          if (ship.movementUsed) {
            ship.movementUsed = Math.max(0, ship.movementUsed - 1);
          }
          fromUnits.push(ship);
        }
      }
    }

    // Handle units loaded onto transports - remove from cargo
    if (lastMove.loadedOntoTransport) {
      for (const moveUnit of lastMove.units) {
        let remaining = moveUnit.quantity;
        // Find transports at destination and remove cargo
        const transports = toUnits.filter(u => u.type === 'transport' && u.owner === player.id);
        for (const transport of transports) {
          if (remaining <= 0) break;
          const cargo = transport.cargo || [];
          for (let i = cargo.length - 1; i >= 0 && remaining > 0; i--) {
            if (cargo[i].type === moveUnit.type && cargo[i].owner === player.id) {
              cargo.splice(i, 1);
              remaining--;
            }
          }
        }

        // Add back to source (without moved flag)
        const sourceUnit = fromUnits.find(u => u.type === moveUnit.type && u.owner === player.id && !u.id);
        if (sourceUnit) {
          sourceUnit.quantity += moveUnit.quantity;
          delete sourceUnit.moved;
        } else {
          fromUnits.push({
            type: moveUnit.type,
            quantity: moveUnit.quantity,
            owner: player.id,
          });
        }
      }
    } else if (lastMove.loadedOntoCarrier) {
      // Handle aircraft loaded onto carriers - remove from carrier.aircraft
      for (const moveUnit of lastMove.units) {
        let remaining = moveUnit.quantity;
        // Find carriers at destination and remove aircraft
        const carriers = toUnits.filter(u => u.type === 'carrier' && u.owner === player.id);
        for (const carrier of carriers) {
          if (remaining <= 0) break;
          const aircraft = carrier.aircraft || [];
          for (let i = aircraft.length - 1; i >= 0 && remaining > 0; i--) {
            if (aircraft[i].type === moveUnit.type && aircraft[i].owner === player.id) {
              aircraft.splice(i, 1);
              remaining--;
            }
          }
        }

        // Add back to source (without moved flag)
        const sourceUnit = fromUnits.find(u => u.type === moveUnit.type && u.owner === player.id && !u.id);
        if (sourceUnit) {
          sourceUnit.quantity += moveUnit.quantity;
          delete sourceUnit.moved;
        } else {
          fromUnits.push({
            type: moveUnit.type,
            quantity: moveUnit.quantity,
            owner: player.id,
          });
        }
      }
    } else {
      // Handle regular units (aggregated by type)
      for (const moveUnit of lastMove.units) {
        // Remove from destination
        const destUnit = toUnits.find(u => u.type === moveUnit.type && u.owner === player.id && !u.id);
        if (destUnit) {
          destUnit.quantity -= moveUnit.quantity;
          if (destUnit.quantity <= 0) {
            const idx = toUnits.indexOf(destUnit);
            toUnits.splice(idx, 1);
          }
        }

        // Add back to source (without moved flag)
        const sourceUnit = fromUnits.find(u => u.type === moveUnit.type && u.owner === player.id && !u.id);
        if (sourceUnit) {
          sourceUnit.quantity += moveUnit.quantity;
          delete sourceUnit.moved;
        } else {
          fromUnits.push({
            type: moveUnit.type,
            quantity: moveUnit.quantity,
            owner: player.id,
          });
        }
      }
      const launched = lastMove.launchedFromCarrier || null;
      if (launched) {
        const defs = this._unitDefs || this.unitDefs || {
          carrier: { aircraftCapacity: 2, canCarry: ['fighter', 'tacticalBomber'] },
        };
        for (const [type, qty] of Object.entries(launched)) {
          let left = Number(qty) || 0;
          const loose = fromUnits.find((u) => u.type === type && u.owner === player.id && !u.id);
          if (!loose || left <= 0) continue;
          const take = Math.min(loose.quantity || 0, left);
          loose.quantity -= take;
          if (loose.quantity <= 0) {
            const idx = fromUnits.indexOf(loose);
            if (idx >= 0) fromUnits.splice(idx, 1);
          }
          for (let i = 0; i < take; i++) {
            loadOneAirOntoCarrier(this, lastMove.from, type, player.id, defs);
          }
        }
      }
    }

    this.units[lastMove.from] = fromUnits;
    this.units[lastMove.to] = toUnits;

    // If territory was captured by this move, restore previous owner
    if (lastMove.captured && lastMove.previousOwner) {
      this.territoryState[lastMove.to].owner = lastMove.previousOwner;
    }

    // Restore blitzed territories to their previous owners
    if (lastMove.blitzedCaptures && lastMove.blitzedCaptures.length > 0) {
      for (const blitzed of lastMove.blitzedCaptures) {
        this.territoryState[blitzed.territory].owner = blitzed.previousOwner;
      }
    }

    // Restore air unit origins - remove tracking for destination, could restore to source
    // For simplicity, just clear the destination tracking (air unit is back at source)
    if (this.airUnitOrigins && this.airUnitOrigins[lastMove.to]) {
      for (const moveUnit of lastMove.units) {
        if (this.airUnitOrigins[lastMove.to][moveUnit.type]) {
          delete this.airUnitOrigins[lastMove.to][moveUnit.type];
        }
      }
      // Clean up empty objects
      if (Object.keys(this.airUnitOrigins[lastMove.to]).length === 0) {
        delete this.airUnitOrigins[lastMove.to];
      }
    }
    return { success: true };
  }

  // Retreat all attacking units from a combat territory back to where they came from
  retreatFromCombat(combatTerritory) {
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    // Find all moves that went TO this combat territory
    const movesToRetreat = this.moveHistory.filter(m =>
      m.to === combatTerritory && m.player === player.id
    );

    if (movesToRetreat.length === 0) {
      return { success: false, error: 'No moves to retreat' };
    }

    const combatUnits = this.units[combatTerritory] || [];

    // Move each unit back to its origin
    for (const move of movesToRetreat) {
      const fromUnits = this.units[move.from] || [];

      for (const moveUnit of move.units) {
        // Find unit in combat territory
        const combatUnit = combatUnits.find(u =>
          u.type === moveUnit.type && u.owner === player.id
        );

        if (combatUnit) {
          // Calculate how many to retreat (might be fewer due to casualties)
          const retreatQty = Math.min(combatUnit.quantity, moveUnit.quantity);

          if (retreatQty > 0) {
            // Remove from combat territory
            combatUnit.quantity -= retreatQty;
            if (combatUnit.quantity <= 0) {
              const idx = combatUnits.indexOf(combatUnit);
              combatUnits.splice(idx, 1);
            }

            // Add back to origin territory
            const originUnit = fromUnits.find(u =>
              u.type === moveUnit.type && u.owner === player.id
            );
            if (originUnit) {
              originUnit.quantity += retreatQty;
            } else {
              fromUnits.push({
                type: moveUnit.type,
                quantity: retreatQty,
                owner: player.id,
              });
            }
            this.units[move.from] = fromUnits;
          }
        }
      }
    }

    this.units[combatTerritory] = combatUnits;
    this._notify();
    return { success: true };
  }

  // Get valid retreat destinations for a combat territory (A&A rule: territories units came from)
  getRetreatDestinations(combatTerritory) {
    const player = this.currentPlayer;
    if (!player) return [];

    // Find all moves that went TO this combat territory
    const movesToRetreat = this.moveHistory.filter(m =>
      m.to === combatTerritory && m.player === player.id
    );

    // Get unique origin territories
    const destinations = new Set();
    for (const move of movesToRetreat) {
      // Only include friendly/allied territories as retreat options
      const owner = this.getOwner(move.from);
      if (move.from && (owner === player.id || this.areAllies(player.id, owner) || !owner)) {
        destinations.add(move.from);
      }
    }

    return Array.from(destinations);
  }

  // Retreat ALL units from combat to a SINGLE destination (A&A rule)
  retreatToTerritory(combatTerritory, destination) {
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    const validDestinations = this.getRetreatDestinations(combatTerritory);
    if (!validDestinations.includes(destination)) {
      return { success: false, error: 'Invalid retreat destination' };
    }

    const combatUnits = this.units[combatTerritory] || [];
    const destUnits = this.units[destination] || [];

    // Move all player's land/sea units to the destination
    // (Air units are handled separately via air landing)
    const unitsToRetreat = combatUnits.filter(u =>
      u.owner === player.id && u.type !== 'factory'
    );

    for (const unit of unitsToRetreat) {
      const unitDef = this.territoryByName[destination]?.isWater
        ? { isSea: true } // Simplified check
        : { isLand: true };

      // Move unit to destination
      const destUnit = destUnits.find(u => u.type === unit.type && u.owner === player.id);
      if (destUnit) {
        destUnit.quantity += unit.quantity;
      } else {
        destUnits.push({
          type: unit.type,
          quantity: unit.quantity,
          owner: player.id,
        });
      }

      // Remove from combat territory
      unit.quantity = 0;
    }

    // Clean up empty units
    this.units[combatTerritory] = combatUnits.filter(u => u.quantity > 0);
    this.units[destination] = destUnits;

    this._notify();
    emitGameEvent('retreat', {
      gameState: this,
      territory: combatTerritory,
      payload: {
        destination,
        units: summarizeUnits(unitsToRetreat),
      },
    });
    return { success: true };
  }

  // Detect territories where combat should occur
  // Per A&A rules: Naval battles are resolved before land battles (amphibious assaults)
  _detectCombats(unitDefs = this._unitDefs || {}) {
    // Finalize leftover land holds before wiping the queue. Otherwise a
    // dismissed overlay / last-defender-dead hex is dropped and never
    // flips political control (35RB85 / 9.20.26.02).
    finalizeAttackerHoldsOnBoard(this, { unitDefs });
    this.combatQueue = [];
    this.clearedSeaZones = new Set(); // Track sea zones cleared for shore bombardment
    // Note: amphibiousTerritories is set during combat move and used during combat phase
    const player = this.currentPlayer;
    if (!player) return;

    const navalCombats = [];
    const landCombats = [];

    for (const [territory, units] of Object.entries(this.units)) {
      const hasPlayerUnits = units.some(u => u.owner === player.id);
      const hasEnemyUnits = units.some(u =>
        u.owner !== player.id && !this.areAllies(player.id, u.owner)
      );

      if (hasPlayerUnits && hasEnemyUnits) {
        const t = this.territoryByName[territory];
        if (t?.isWater) {
          navalCombats.push(territory);
        } else {
          landCombats.push(territory);
        }
      }
    }

    // Naval battles first, then land battles
    this.combatQueue = [...navalCombats, ...landCombats];
  }

  // Mark a sea zone as cleared for shore bombardment (after winning naval battle)
  markSeaZoneCleared(seaZone) {
    if (!this.clearedSeaZones) this.clearedSeaZones = new Set();
    this.clearedSeaZones.add(seaZone);
  }

  // Check if a sea zone is clear for shore bombardment
  // Per A&A rules: If there was a naval battle, NO bombardment is allowed (even if you won)
  isSeaZoneClearedForBombardment(seaZone) {
    const units = this.units[seaZone] || [];
    const player = this.currentPlayer;
    if (!player) return false;

    // If a naval battle occurred here this turn, no bombardment allowed
    if (this.clearedSeaZones?.has(seaZone)) {
      return false; // Had naval battle - no bombardment per A&A rules
    }

    // Check for enemy combat units (anything that isn't ours or an ally's)
    const hasEnemyCombatUnits = units.some(u => {
      if (u.owner === player.id) return false;
      if (this.areAllies(player.id, u.owner)) return false;
      // Any enemy unit in sea zone blocks bombardment
      return true;
    });

    // Only allow bombardment if no enemy ships and no naval battle
    return !hasEnemyCombatUnits;
  }

  // Check if a territory has amphibious attackers (units unloaded from transports)
  hasAmphibiousAssault(territory) {
    return this.amphibiousTerritories?.has(territory) || false;
  }

  // Get land territories dependent on a specific sea zone for amphibious assault
  getAmphibiousAssaultsFromSeaZone(seaZone) {
    const dependent = [];
    for (const [landTerritory, details] of Object.entries(this.amphibiousAssaultDetails || {})) {
      if (details.seaZone === seaZone) {
        dependent.push(landTerritory);
      }
    }
    return dependent;
  }

  // Cancel amphibious assault when naval combat is lost
  // Per A&A rules: if you lose the naval battle, troops on transports are destroyed
  cancelAmphibiousAssault(landTerritory) {
    const details = this.amphibiousAssaultDetails?.[landTerritory];
    if (!details) return { cancelled: false };

    const player = this.currentPlayer;
    if (!player) return { cancelled: false };

    const units = this.units[landTerritory] || [];
    const destroyedUnits = [];

    // Remove the amphibious units from the land territory
    for (const amphibUnit of details.units) {
      const landUnit = units.find(u =>
        u.type === amphibUnit.type &&
        u.owner === amphibUnit.owner
      );
      if (landUnit) {
        const toRemove = Math.min(landUnit.quantity, amphibUnit.quantity);
        landUnit.quantity -= toRemove;
        destroyedUnits.push({ type: amphibUnit.type, quantity: toRemove });
      }
    }

    // Clean up units with 0 quantity
    this.units[landTerritory] = units.filter(u => u.quantity > 0);

    // Remove from amphibious tracking
    this.amphibiousTerritories.delete(landTerritory);
    delete this.amphibiousAssaultDetails[landTerritory];

    // Remove from combat queue if no attackers remain
    const remainingAttackers = (this.units[landTerritory] || [])
      .filter(u => u.owner === player.id);
    if (remainingAttackers.length === 0) {
      this.combatQueue = this.combatQueue.filter(t => t !== landTerritory);
    }

    this._notify();
    return { cancelled: true, destroyedUnits };
  }

  // Check if a sea zone has a contested naval battle blocking amphibious assault
  hasContestedSeaZoneForAmphibious(landTerritory) {
    const details = this.amphibiousAssaultDetails?.[landTerritory];
    if (!details) return false;

    const seaZone = details.seaZone;
    const player = this.currentPlayer;
    if (!player) return false;

    const seaUnits = this.units[seaZone] || [];
    const hasEnemyShips = seaUnits.some(u =>
      u.owner !== player.id && !this.areAllies(player.id, u.owner)
    );

    return hasEnemyShips;
  }

  // Resolve combat in a territory (dice combat with naval rules)
  resolveCombat(territory, unitDefs) {
    const units = this.units[territory] || [];
    const player = this.currentPlayer;
    if (!player) return null;

    const attackers = units.filter(u => u.owner === player.id);
    // All enemy units in territory (for rolling dice - AA guns still roll at aircraft)
    const allDefenders = units.filter(u => u.owner !== player.id && !this.areAllies(player.id, u.owner));
    // Combat defenders - units that can actually stop an attack (exclude factories and 0/0 units)
    const combatDefenders = allDefenders.filter(u => {
      // Factories are captured, not combat units
      if (u.type === 'factory') return false;
      // Units with 0 attack and 0 defense can't stop an attack
      const def = unitDefs[u.type];
      if (def && def.defense === 0 && def.attack === 0) return false;
      return true;
    });

    if (attackers.length === 0 || combatDefenders.length === 0) {
      // Shared land-hold capture (9.20.26.02). Air-only / attacker wipe
      // leave the original owner — same gate as combatUI + Experimental.
      const capture = attackers.length > 0
        ? captureIfAttackerHolds(this, territory, {
          playerId: player.id,
          unitDefs,
        })
        : { captured: false };
      // Repair damaged ships at end of combat
      this._repairDamagedShips(units, unitDefs);
      // Remove from combat queue
      this.combatQueue = this.combatQueue.filter(t => t !== territory);
      this._notify();
      return {
        resolved: true,
        winner: attackers.length > 0 ? 'attacker' : 'defender',
        conquered: !!capture.captured,
      };
    }

    const t = this.territoryByName[territory];
    const isNavalBattle = t?.isWater;

    // Shore bombardment: ships in adjacent sea zones can bombard land battles (first round only)
    let bombardmentHits = 0;
    let bombardmentRolls = [];
    if (!isNavalBattle && !this._combatRoundsTracker?.[territory]) {
      const bombardmentResult = this._calculateShoreBombardment(territory, player.id, unitDefs);
      bombardmentHits = bombardmentResult.hits;
      bombardmentRolls = bombardmentResult.rolls;
    }
    // Track combat rounds
    if (!this._combatRoundsTracker) this._combatRoundsTracker = {};
    this._combatRoundsTracker[territory] = (this._combatRoundsTracker[territory] || 0) + 1;

    // Roll dice for combat (allDefenders includes AA guns which can fire at aircraft)
    const { hits: attackHits, rolls: attackRolls } = this._rollCombatWithRolls(attackers, 'attack', unitDefs);
    const { hits: defenseHits, rolls: defenseRolls } = this._rollCombatWithRolls(allDefenders, 'defense', unitDefs);

    // Add bombardment hits to attack hits
    const totalAttackHits = attackHits + bombardmentHits;

    // Apply casualties (handles multi-hit ships)
    // Defenders take hits from attacks + bombardment
    const attackerCasualties = this._applyCasualtiesWithDamage(allDefenders, totalAttackHits, unitDefs, isNavalBattle);
    const defenderCasualties = this._applyCasualtiesWithDamage(attackers, defenseHits, unitDefs, isNavalBattle);

    // Clean up destroyed units (quantity <= 0)
    // IMPORTANT: Preserve factories - they are captured, never destroyed
    this.units[territory] = units.filter(u => u.quantity > 0 || u.type === 'factory');

    // Check if combat is over
    // Note: Factories are captured (not destroyed) and AA guns have 0 combat value
    // Only count units that can actually fight as "remaining"
    const remainingAttackers = this.units[territory].filter(u => u.owner === player.id);
    const remainingDefenders = this.units[territory].filter(u => {
      if (u.owner === player.id || this.areAllies(player.id, u.owner)) return false;
      // Factories are captured, not combat units - don't count them as defenders
      if (u.type === 'factory') return false;
      // AA guns with 0 defense can't stop an attack - they're captured with the territory
      const def = unitDefs[u.type];
      if (def && def.defense === 0 && def.attack === 0) return false;
      return true;
    });

    const result = {
      attackHits,
      defenseHits,
      bombardmentHits,
      bombardmentRolls,
      attackRolls,
      defenseRolls,
      attackerCasualties,
      defenderCasualties,
      attackersRemaining: remainingAttackers.reduce((sum, u) => sum + u.quantity, 0),
      defendersRemaining: remainingDefenders.reduce((sum, u) => sum + u.quantity, 0),
    };

    if (remainingDefenders.length === 0) {
      // Attacker wins
      if (isNavalBattle) {
        // Naval battle won - mark sea zone as cleared for shore bombardment
        this.markSeaZoneCleared(territory);
      } else {
        // Land battle won - capture territory
        const defender = allDefenders[0]?.owner;
        this.territoryState[territory].owner = player.id;

        // Log territory capture for turn summary modal (multiplayer)
        this.logTerritoryCapture(territory, defender, player.id);

        // Transfer factory and AA gun ownership to the winner (captured, not destroyed - A&A Anniversary rules)
        const territoryUnits = this.units[territory] || [];
        for (const unit of territoryUnits) {
          if (unit.type === 'factory' || unit.type === 'aaGun') {
            unit.owner = player.id;
            // Ensure unit has quantity (safeguard)
            if (!unit.quantity || unit.quantity < 1) {
              unit.quantity = 1;
            }
          }
        }

        // Award Risk card for conquering (one per turn per Risk rules)
        if (!this.conqueredThisTurn[player.id]) {
          this.conqueredThisTurn[player.id] = true;
          const cardType = this.awardRiskCard(player.id);
          result.cardAwarded = cardType;
        }

        // Handle capital capture (IPC transfer, victory check)
        this.handleCapitalCapture(territory, player.id, defender);
      }
      // Repair surviving damaged ships
      this._repairDamagedShips(this.units[territory], unitDefs);
      this.combatQueue = this.combatQueue.filter(t => t !== territory);
      // Clean up combat rounds tracker
      if (this._combatRoundsTracker) delete this._combatRoundsTracker[territory];
      result.resolved = true;
      result.winner = 'attacker';
      result.conquered = !isNavalBattle; // Only land territories are "conquered"
    } else if (remainingAttackers.length === 0) {
      // Repair surviving damaged ships
      this._repairDamagedShips(this.units[territory], unitDefs);
      this.combatQueue = this.combatQueue.filter(t => t !== territory);
      // Clean up combat rounds tracker
      if (this._combatRoundsTracker) delete this._combatRoundsTracker[territory];
      result.resolved = true;
      result.winner = 'defender';
    } else {
      result.resolved = false;
    }

    this.recordCombatTelemetry({
      kind: 'combat',
      territory,
      hits: { attack: totalAttackHits, defense: defenseHits },
      attackRolls: attackRolls.map((r) => r.roll),
      defenseRolls: defenseRolls.map((r) => r.roll),
      attackForce: attackers,
      defenseForce: combatDefenders,
      survivors: remainingAttackers,
      wiped: remainingAttackers.length === 0,
    });

    this._notify();
    flushDiceBuffer(this);
    return result;
  }

  // Central d6 roller (Bug 4). Every die in the game funnels through here so
  // rolls can be logged for empirical fairness auditing. Gameplay is UNCHANGED:
  // still an unseeded Math.random() d6 — there is no seeding anywhere. The
  // "predetermined rolls" report was a byproduct of Bug 1 (the same combat
  // re-resolved across refreshes on un-persisted state → similar outcomes).
  // The log is in-memory only (never serialized into toJSON / Firestore) and
  // bounded to the last 500 rolls; inspect via getRollLog() from the console.
  //
  // context may be a string (legacy) or
  // {context, side, unit, need, playerSeat}. The observe-only tracker records
  // the face after it is chosen and never changes it. Tracker state is not
  // part of the save (schema stays 11).
  _rollDie(context = 'combat') {
    const roll = Math.floor(Math.random() * 6) + 1;
    if (!this._rollLog) this._rollLog = [];
    const label = typeof context === 'string' ? context : (context?.context || 'combat');
    this._rollLog.push({ t: Date.now(), context: label, roll });
    if (this._rollLog.length > 500) this._rollLog.shift();
    try {
      observeRolledDie(this, context, roll);
    } catch (err) {
      try { console.debug('[dice] record skipped', err?.message || err); } catch { /* ignore */ }
    }
    return roll;
  }

  // Snapshot of recent die rolls for auditing (Bug 4 investigation aid).
  getRollLog() {
    return this._rollLog ? this._rollLog.slice() : [];
  }

  // Persist a compact combat-round snapshot (AA or regular dice) on the
  // game doc so a reload / other client can still see what was rolled.
  // In-memory _rollLog is not enough — it never survived Firestore.
  recordCombatTelemetry(entry = {}) {
    if (!this.combatTelemetry) this.combatTelemetry = [];
    const capRolls = (rolls) => {
      const list = Array.isArray(rolls) ? rolls.slice(0, 24) : [];
      return list.map((n) => Number(n) || 0);
    };
    const capForce = (force) => (Array.isArray(force) ? force.slice(0, 16).map((u) => ({
      type: u?.type || 'unit',
      quantity: Number(u?.quantity) || 0,
    })) : []);
    this.combatTelemetry.push({
      t: Date.now(),
      round: this.round,
      kind: entry.kind || 'combat',
      territory: entry.territory || null,
      hits: entry.hits ?? 0,
      rolls: capRolls(entry.rolls),
      attackRolls: capRolls(entry.attackRolls),
      defenseRolls: capRolls(entry.defenseRolls),
      attackForce: capForce(entry.attackForce),
      defenseForce: capForce(entry.defenseForce),
      survivors: capForce(entry.survivors),
      wiped: !!entry.wiped,
    });
    if (this.combatTelemetry.length > 40) {
      this.combatTelemetry = this.combatTelemetry.slice(-40);
    }
    const kind = entry.kind === 'aa' ? 'aa' : 'combat';
    emitGameEvent(kind, {
      gameState: this,
      territory: entry.territory || null,
      payload: {
        hits: entry.hits ?? 0,
        rolls: capRolls(entry.rolls),
        attackRolls: capRolls(entry.attackRolls),
        defenseRolls: capRolls(entry.defenseRolls),
        forcesBefore: {
          attack: capForce(entry.attackForce),
          defense: capForce(entry.defenseForce),
        },
        forcesAfter: { attack: capForce(entry.survivors) },
        wiped: !!entry.wiped,
        via: 'combatTelemetry',
      },
    });
  }

  getCombatTelemetry() {
    return this.combatTelemetry ? this.combatTelemetry.slice() : [];
  }

  _rollCombatWithRolls(units, type, unitDefs) {
    let hits = 0;
    const rolls = [];

    for (const unit of units) {
      const def = unitDefs[unit.type];
      if (!def) continue;
      const hitValue = type === 'attack' ? def.attack : def.defense;

      for (let i = 0; i < unit.quantity; i++) {
        const roll = this._rollDie({
          context: 'combat',
          side: type === 'attack' ? 'attacker' : 'defender',
          unit: unit.type,
          need: hitValue,
          playerSeat: unit.owner,
        });
        rolls.push({ unit: unit.type, roll, hit: roll <= hitValue });
        if (roll <= hitValue) hits++;
      }
    }
    return { hits, rolls };
  }

  _rollCombat(units, type, unitDefs) {
    return this._rollCombatWithRolls(units, type, unitDefs).hits;
  }

  // Calculate shore bombardment from ships in adjacent sea zones
  _calculateShoreBombardment(territory, attackerId, unitDefs) {
    let hits = 0;
    const rolls = [];

    // Find adjacent sea zones
    const t = this.territoryByName[territory];
    if (!t || t.isWater) return { hits: 0, rolls: [] };

    const connections = t.connections || [];
    for (const connName of connections) {
      const connT = this.territoryByName[connName];
      if (!connT?.isWater) continue;

      // Per A&A rules: Shore bombardment only allowed from sea zones where:
      // 1. There are no enemy ships, OR
      // 2. The naval battle was already won (sea zone cleared)
      if (!this.isSeaZoneClearedForBombardment(connName)) {
        continue; // Skip - naval battle not yet resolved
      }

      // Check for friendly ships that can bombard
      const seaUnits = this.units[connName] || [];
      for (const unit of seaUnits) {
        if (unit.owner !== attackerId) continue;

        const def = unitDefs[unit.type];
        if (!def?.isSea) continue;

        // Ships that can bombard: battleships (attack 4) and cruisers (attack 3)
        // In A&A, only battleships and cruisers can shore bombard
        if (unit.type === 'battleship' || unit.type === 'cruiser') {
          const bombardValue = def.attack;
          for (let i = 0; i < unit.quantity; i++) {
            const roll = this._rollDie({
              context: 'bombard',
              side: 'attacker',
              unit: unit.type,
              need: bombardValue,
              playerSeat: attackerId,
            });
            const isHit = roll <= bombardValue;
            rolls.push({ unit: unit.type, roll, hit: isHit, source: connName });
            if (isHit) hits++;
          }
        }
      }
    }

    return { hits, rolls };
  }

  _applyCasualtiesWithDamage(units, hits, unitDefs, isNavalBattle) {
    const casualties = [];
    let remaining = hits;

    // For naval battles, first try to damage multi-hit ships before destroying units
    if (isNavalBattle) {
      // Prioritize damaging already-damaged ships to destroy them
      const multiHitShips = units.filter(u => {
        const def = unitDefs[u.type];
        return def?.hp > 1;
      });

      // First, finish off damaged ships
      for (const unit of multiHitShips) {
        if (remaining <= 0) break;
        if (unit.damaged && unit.quantity > 0) {
          // Destroy damaged ship
          unit.quantity--;
          remaining--;
          casualties.push({ type: unit.type, destroyed: true, wasDamaged: true });
        }
      }

      // Then, damage undamaged multi-hit ships
      for (const unit of multiHitShips) {
        if (remaining <= 0) break;
        const undamaged = unit.quantity - (unit.damagedCount || 0);
        if (undamaged > 0) {
          // Damage the ship instead of destroying
          unit.damagedCount = (unit.damagedCount || 0) + 1;
          unit.damaged = true;
          remaining--;
          casualties.push({ type: unit.type, damaged: true });
        }
      }
    }

    // Apply remaining hits to cheapest units first
    const sorted = [...units].filter(u => {
      const def = unitDefs[u.type];
      // Skip factories - they are captured, not destroyed
      if (u.type === 'factory') return false;
      // Skip multi-hit ships that are only damaged (not destroyed)
      return !(def?.hp > 1 && u.damaged && !u.destroyed);
    }).sort((a, b) => {
      const costA = unitDefs[a.type]?.cost || 0;
      const costB = unitDefs[b.type]?.cost || 0;
      return costA - costB;
    });

    for (const unit of sorted) {
      if (remaining <= 0) break;
      const remove = Math.min(unit.quantity, remaining);
      unit.quantity -= remove;
      remaining -= remove;
      for (let i = 0; i < remove; i++) {
        casualties.push({ type: unit.type, destroyed: true });
      }
    }

    return casualties;
  }

  _applyCasualties(units, hits, unitDefs) {
    this._applyCasualtiesWithDamage(units, hits, unitDefs, false);
  }

  // Repair damaged ships at end of combat
  _repairDamagedShips(units, unitDefs) {
    for (const unit of units) {
      const def = unitDefs?.[unit.type];
      if (def?.hp > 1 && unit.damaged) {
        // Ship survived combat - repair it
        unit.damaged = false;
        unit.damagedCount = 0;
      }
    }
  }

  // Repair all damaged battleships owned by a player at end of turn (A&A Anniversary rule)
  _repairPlayerBattleships(playerId) {
    for (const [territory, units] of Object.entries(this.units)) {
      for (const unit of units) {
        if (unit.owner === playerId && unit.type === 'battleship' && unit.damaged) {
          unit.damaged = false;
          unit.damagedCount = 0;
        }
      }
    }
  }

  // Fisher-Yates shuffle for randomizing player order
  _shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // Apply specific casualties (for player selection)
  applyCasualtiesManual(territory, casualties, isAttacker, unitDefs) {
    const units = this.units[territory] || [];
    const player = this.currentPlayer;
    if (!player) return { success: false };

    const targetUnits = isAttacker
      ? units.filter(u => u.owner === player.id)
      : units.filter(u => u.owner !== player.id);

    for (const casualty of casualties) {
      const unit = targetUnits.find(u => u.type === casualty.type && u.quantity > 0);
      if (unit) {
        if (casualty.damage) {
          // Damage a multi-hit ship
          unit.damaged = true;
          unit.damagedCount = (unit.damagedCount || 0) + 1;
        } else {
          // Destroy unit
          unit.quantity--;
        }
      }
    }

    // Clean up destroyed units
    this.units[territory] = units.filter(u => u.quantity > 0);
    this._notify();
    return { success: true };
  }

  // Place purchased units at their designated territories (selected during purchase phase)
  _mobilizePurchases() {
    const player = this.currentPlayer;
    if (!player) return;

    // Get player's pending purchases
    const playerPurchases = this.pendingPurchases.filter(p => p.owner === player.id);
    if (playerPurchases.length === 0) return;

    // Place each purchase at its designated territory
    for (const purchase of playerPurchases) {
      const territory = purchase.territory;
      if (!territory) {
        console.warn('Purchase missing territory:', purchase);
        continue;
      }

      const units = this.units[territory] || [];
      const existing = units.find(u => u.type === purchase.type && u.owner === player.id);
      if (existing) {
        existing.quantity += purchase.quantity;
      } else {
        units.push({ type: purchase.type, quantity: purchase.quantity, owner: player.id });
      }
      this.units[territory] = units;
    }

    // Remove player's purchases from pending
    this.pendingPurchases = this.pendingPurchases.filter(p => p.owner !== player.id);
  }

  // Collect income from territories
  _collectIncome() {
    const player = this.currentPlayer;
    if (!player) return;

    // Repair damaged battleships at turn end (A&A Anniversary rule)
    this._repairPlayerBattleships(player.id);

    // Cannot collect income if capital is captured
    if (!this.canCollectIncome(player.id)) {
      return;
    }

    let income = 0;
    const capitalTerritory = this.playerState[player.id]?.capitalTerritory;

    for (const [territory, state] of Object.entries(this.territoryState)) {
      if (state.owner === player.id) {
        // Capitals always produce 10 IPCs
        if (territory === capitalTerritory) {
          income += 10;
        } else {
          const t = this.territoryByName[territory];
          if (t && t.production) {
            income += t.production;
          }
        }
      }
    }

    // Add continent bonuses
    for (const continent of this.continents) {
      if (this.controlsContinent(player.id, continent.name)) {
        income += continent.bonus;
      }
    }

    this.playerState[player.id].ipcs += income;
    emitGameEvent('ui', {
      gameState: this,
      payload: { action: 'collectIncome', ipcDelta: income },
    });
  }

  _clearMovedFlags() {
    // Clear moved flags and consolidate duplicate stacks
    for (const territory of Object.keys(this.units)) {
      const units = this.units[territory];

      // Clear flags first
      for (const unit of units) {
        delete unit.moved;
        delete unit.movementUsed;
        // Fighters that landed on a carrier keep their own moved flag.
        // Clearing only the carrier left prior-turn air unable to attack.
        if (Array.isArray(unit.aircraft)) {
          for (const craft of unit.aircraft) {
            if (!craft) continue;
            delete craft.moved;
            delete craft.movementUsed;
          }
        }
        if (Array.isArray(unit.cargo)) {
          for (const item of unit.cargo) {
            if (!item) continue;
            delete item.moved;
            delete item.movementUsed;
          }
        }
      }

      // Consolidate duplicate stacks (same type + owner, no special properties)
      // Skip units with IDs, cargo, or aircraft - those need to stay individual
      const consolidated = [];
      const grouped = new Map(); // key: "type_owner" -> quantity

      for (const unit of units) {
        // Keep individual ships (with IDs) and units with cargo/aircraft separate
        if (unit.id || (unit.cargo && unit.cargo.length > 0) || (unit.aircraft && unit.aircraft.length > 0)) {
          consolidated.push(unit);
        } else {
          const key = `${unit.type}_${unit.owner}`;
          const existing = grouped.get(key);
          if (existing) {
            existing.quantity += unit.quantity;
          } else {
            grouped.set(key, { type: unit.type, owner: unit.owner, quantity: unit.quantity });
          }
        }
      }

      // Add consolidated groups
      for (const unit of grouped.values()) {
        consolidated.push(unit);
      }

      this.units[territory] = consolidated;
    }
  }

  // Handle capital capture - called when territory ownership changes
  handleCapitalCapture(territory, newOwner, previousOwner) {
    // Check if this territory is a capital
    const state = this.territoryState[territory];
    if (!state || !state.isCapital) return;

    // Find the player who lost their capital
    const loser = this.players.find(p =>
      this.playerState[p.id]?.capitalTerritory === territory
    );

    if (!loser) return;

    // Transfer IPCs from loser to captor
    const captorState = this.playerState[newOwner];
    const loserState = this.playerState[loser.id];

    if (captorState && loserState) {
      captorState.ipcs += loserState.ipcs;
      loserState.ipcs = 0;
      loserState.capitalCaptured = true;
    }

    // Check victory conditions
    this._checkVictoryConditions();
  }

  // Check if victory conditions are met
  _checkVictoryConditions() {
    if (this.gameOver) return;

    if (this.gameMode === 'classic' || this.alliancesEnabled) {
      this._checkAllianceVictory();
    } else if (this.teamsEnabled) {
      this._checkTeamVictory();
    } else {
      this._checkCapitalVictory();
    }
  }

  // Team victory: a team wins when they control all enemy capitals
  _checkTeamVictory() {
    // Group players by team
    const teams = {};
    const noTeamPlayers = [];

    for (const player of this.players) {
      if (player.teamId) {
        if (!teams[player.teamId]) {
          teams[player.teamId] = [];
        }
        teams[player.teamId].push(player.id);
      } else {
        noTeamPlayers.push(player.id);
      }
    }

    // Count capitals controlled by each team
    const teamCapitals = {};
    const totalCapitals = {};

    for (const [territory, state] of Object.entries(this.territoryState)) {
      if (state.isCapital) {
        const owner = state.owner;
        if (!owner) continue;

        const ownerPlayer = this.getPlayer(owner);
        const teamId = ownerPlayer?.teamId;

        if (teamId) {
          teamCapitals[teamId] = (teamCapitals[teamId] || 0) + 1;
        }

        // Count total capitals per original owner's team for victory threshold
        const originalOwnerId = state.originalOwner || owner;
        const originalPlayer = this.getPlayer(originalOwnerId);
        const originalTeam = originalPlayer?.teamId;

        if (originalTeam) {
          totalCapitals[originalTeam] = (totalCapitals[originalTeam] || 0) + 1;
        }
      }
    }

    // Check if any team controls all enemy capitals
    const teamIds = Object.keys(teams);

    for (const teamId of teamIds) {
      // Calculate enemy capitals (capitals belonging to other teams)
      let enemyCapitals = 0;
      let enemyCapitalsControlled = 0;

      for (const [territory, state] of Object.entries(this.territoryState)) {
        if (state.isCapital) {
          const originalOwnerId = state.originalOwner || state.owner;
          const originalPlayer = this.getPlayer(originalOwnerId);
          const originalTeam = originalPlayer?.teamId;

          // If this capital belongs to a different team
          if (originalTeam && originalTeam !== parseInt(teamId)) {
            enemyCapitals++;
            // Check if current owner is on our team
            const currentOwner = state.owner;
            const currentPlayer = this.getPlayer(currentOwner);
            if (currentPlayer?.teamId === parseInt(teamId)) {
              enemyCapitalsControlled++;
            }
          }
        }
      }

      // Team wins if they control all enemy capitals
      if (enemyCapitals > 0 && enemyCapitalsControlled === enemyCapitals) {
        const teamPlayers = teams[teamId].map(id => this.getPlayer(id)?.name).join(', ');
        this.gameOver = true;
        this.winner = `Team ${teamId}`;
        this.winCondition = `Team Victory - ${teamPlayers} captured all enemy capitals`;
        this._notify();
        return;
      }
    }
  }

  _checkAllianceVictory() {
    // Get capitals by alliance
    const alliedCapitals = ['Russia', 'United Kingdom', 'East US'];
    const axisCapitals = ['Germany', 'Japan'];

    const alliedControlled = alliedCapitals.filter(t => {
      const owner = this.getOwner(t);
      return owner && this.getAlliance(owner) === 'Allies';
    });

    const axisControlled = axisCapitals.filter(t => {
      const owner = this.getOwner(t);
      return owner && this.getAlliance(owner) === 'Axis';
    });

    // Axis wins: Control 2/3 Allied capitals while holding both Axis capitals
    if (axisControlled.length === 2) {
      const axisCapturedAllied = alliedCapitals.filter(t => {
        const owner = this.getOwner(t);
        return owner && this.getAlliance(owner) === 'Axis';
      });

      if (axisCapturedAllied.length >= 2) {
        this.gameOver = true;
        this.winner = 'Axis';
        this.winCondition = 'Capital Victory - Axis controls 2 Allied capitals';
        this._notify();
        return;
      }
    }

    // Allies win: Control both Axis capitals while holding all 3 Allied capitals
    if (alliedControlled.length === 3) {
      const alliedCapturedAxis = axisCapitals.filter(t => {
        const owner = this.getOwner(t);
        return owner && this.getAlliance(owner) === 'Allies';
      });

      if (alliedCapturedAxis.length === 2) {
        this.gameOver = true;
        this.winner = 'Allies';
        this.winCondition = 'Capital Victory - Allies controls both Axis capitals';
        this._notify();
        return;
      }
    }
  }

  _checkCapitalVictory() {
    // Count total capitals and who controls what
    const capitalControl = {};
    let totalCapitals = 0;

    for (const [territory, state] of Object.entries(this.territoryState)) {
      if (state.isCapital) {
        totalCapitals++;
        const owner = state.owner;
        capitalControl[owner] = (capitalControl[owner] || 0) + 1;
      }
    }

    // Determine victory threshold based on player count
    const playerCount = this.players.length;
    let requiredCapitals;

    if (playerCount <= 3) {
      // 2-3 players: must control ALL capitals
      requiredCapitals = totalCapitals;
    } else {
      // 4+ players: must control majority (more than half)
      requiredCapitals = Math.floor(totalCapitals / 2) + 1;
    }

    for (const [playerId, count] of Object.entries(capitalControl)) {
      if (count >= requiredCapitals) {
        const player = this.getPlayer(playerId);
        this.gameOver = true;
        this.winner = player?.name || playerId;
        const condition = playerCount <= 3 ? 'all capitals' : `${count}/${totalCapitals} capitals (majority)`;
        this.winCondition = `Capital Victory - Controls ${condition}`;
        this._notify();
        return;
      }
    }
  }

  // Check if a player can collect income (capital not captured)
  canCollectIncome(playerId) {
    const pState = this.playerState[playerId];
    if (!pState) return false;

    const capitalTerritory = pState.capitalTerritory;
    if (!capitalTerritory) return true;

    // Check if capital is still owned by this player
    return this.getOwner(capitalTerritory) === playerId;
  }

  // Check if a player is eliminated (no units and no capital)
  isPlayerEliminated(playerId) {
    // Check if they own any territories
    const ownedTerritories = Object.entries(this.territoryState)
      .filter(([_, state]) => state.owner === playerId);

    if (ownedTerritories.length === 0) return true;

    // Check if they have any units
    let hasUnits = false;
    for (const units of Object.values(this.units)) {
      if (units.some(u => u.owner === playerId && u.quantity > 0)) {
        hasUnits = true;
        break;
      }
    }

    return !hasUnits && ownedTerritories.length === 0;
  }

  // Add a combat result to the log
  logCombat(result) {
    const attackerLosses = result.attackerLosses ?? 0;
    const defenderLosses = result.defenderLosses ?? 0;
    this.combatLog.push({
      round: this.round,
      timestamp: Date.now(),
      ...result,
      attackerLosses,
      defenderLosses,
    });

    // Also add to turnEvents for turn summary modal (multiplayer).
    // Do not write undefined — Firestore rejects the whole game-doc push
    // (hiccup → exhaust → capture rolls back).
    const attackerId = result.attackerId || this.currentPlayer?.id || null;
    this.turnEvents.push({
      type: 'combat',
      playerId: attackerId,
      timestamp: Date.now(),
      territory: result.territory ?? null,
      attacker: result.attacker ?? null,
      defender: result.defender ?? null,
      attackerId,
      defenderId: result.defenderId ?? null,
      outcome: result.winner === 'attacker' ? 'attacker' : 'defender',
      attackerLosses,
      defenderLosses,
    });
  }

  // Get combat log for display
  getCombatLog() {
    return this.combatLog;
  }

  // Clear combat log (called at start of new round)
  clearCombatLog() {
    this.combatLog = [];
  }

  // --- Turn Events for Turn Summary Modal ---

  // Add a territory captured event
  logTerritoryCapture(territory, fromPlayer, toPlayer) {
    this.turnEvents.push({
      type: 'territory_captured',
      playerId: toPlayer,
      timestamp: Date.now(),
      territory,
      fromPlayer,
      toPlayer
    });
  }

  // Get turn events since a given index
  getTurnEventsSince(index) {
    return this.turnEvents.slice(index);
  }

  // Get the current index (length) of turn events
  getTurnEventsLastIndex() {
    return this.turnEvents.length;
  }

  // Clear turn events (called when starting a new game)
  clearTurnEvents() {
    this.turnEvents = [];
  }

  // --- Tech Research System ---

  // Purchase tech research dice (5 IPCs each)
  purchaseTechDice(playerId, count) {
    const pState = this.playerState[playerId];
    if (!pState) return false;

    const cost = count * 5;
    if (pState.ipcs < cost) return false;

    pState.ipcs -= cost;

    if (!this.playerTechs[playerId]) {
      this.playerTechs[playerId] = { techTokens: 0, unlockedTechs: [] };
    }
    this.playerTechs[playerId].techTokens += count;

    this._notify();
    return true;
  }

  // Roll tech dice - returns { success: bool, rolls: [], tech?: string }
  rollTechDice(playerId) {
    const techState = this.playerTechs[playerId];
    if (!techState || techState.techTokens <= 0) {
      return { success: false, rolls: [] };
    }

    const rolls = [];
    let breakthrough = false;

    for (let i = 0; i < techState.techTokens; i++) {
      const roll = this._rollDie({
        context: 'tech',
        side: 'attacker',
        unit: 'tech',
        need: 6,
        playerSeat: playerId,
      });
      rolls.push(roll);
      if (roll === 6) breakthrough = true;
    }

    // Reset tokens after rolling (they're consumed)
    techState.techTokens = 0;

    this._notify();
    flushDiceBuffer(this);
    return { success: breakthrough, rolls };
  }

  // Unlock a specific tech (called after breakthrough)
  unlockTech(playerId, techId) {
    const techState = this.playerTechs[playerId];
    if (!techState) return false;

    if (!TECHNOLOGIES[techId]) return false;
    if (techState.unlockedTechs.includes(techId)) return false;

    techState.unlockedTechs.push(techId);
    this._notify();
    return true;
  }

  // Check if player has a tech
  hasTech(playerId, techId) {
    return this.playerTechs[playerId]?.unlockedTechs.includes(techId) || false;
  }

  // Get available techs for player (ones they don't have yet)
  getAvailableTechs(playerId) {
    const unlocked = this.playerTechs[playerId]?.unlockedTechs || [];
    return Object.keys(TECHNOLOGIES).filter(t => !unlocked.includes(t));
  }

  // --- RISK Cards System ---

  // Award a RISK card to player (called on successful territory capture)
  awardRiskCard(playerId) {
    if (!this.riskCards[playerId]) {
      this.riskCards[playerId] = [];
    }

    // RISK card types: infantry, cavalry, artillery, wild
    const cardTypes = ['infantry', 'cavalry', 'artillery', 'wild'];
    // Wild is rarer
    const weights = [30, 30, 30, 10];
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * totalWeight;

    let cardType = cardTypes[0];
    for (let i = 0; i < weights.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        cardType = cardTypes[i];
        break;
      }
    }

    this.riskCards[playerId].push(cardType);
    this._notify();
    return cardType;
  }

  // Check if player can trade cards (needs 3+ cards with a valid set)
  canTradeRiskCards(playerId) {
    const cards = this.riskCards[playerId] || [];
    if (cards.length < 3) return false;

    // Check for valid sets: 3 of a kind, or 1 of each, or 2 + wild, or 3 wilds
    return this._findValidCardSet(cards) !== null;
  }

  // Find all valid card sets that can be traded
  _findAllValidCardSets(cards) {
    const counts = { infantry: 0, cavalry: 0, artillery: 0, wild: 0 };
    for (const c of cards) counts[c]++;

    const validSets = [];

    // 3 of same type
    for (const type of ['infantry', 'cavalry', 'artillery']) {
      if (counts[type] >= 3) validSets.push([type, type, type]);
    }

    // 3 wilds
    if (counts.wild >= 3) validSets.push(['wild', 'wild', 'wild']);

    // 1 of each (no wilds used)
    if (counts.infantry >= 1 && counts.cavalry >= 1 && counts.artillery >= 1) {
      validSets.push(['infantry', 'cavalry', 'artillery']);
    }

    // 2 of a kind + 1 wild
    for (const type of ['infantry', 'cavalry', 'artillery']) {
      if (counts[type] >= 2 && counts.wild >= 1) {
        validSets.push([type, type, 'wild']);
      }
    }

    // 1 of a kind + 2 wilds
    for (const type of ['infantry', 'cavalry', 'artillery']) {
      if (counts[type] >= 1 && counts.wild >= 2) {
        validSets.push([type, 'wild', 'wild']);
      }
    }

    // 2 different types + 1 wild (making "1 of each" with wild)
    const types = ['infantry', 'cavalry', 'artillery'].filter(t => counts[t] >= 1);
    if (types.length >= 2 && counts.wild >= 1) {
      // Add all combinations of 2 types + wild
      for (let i = 0; i < types.length; i++) {
        for (let j = i + 1; j < types.length; j++) {
          validSets.push([types[i], types[j], 'wild']);
        }
      }
    }

    return validSets;
  }

  _findValidCardSet(cards) {
    const sets = this._findAllValidCardSets(cards);
    return sets.length > 0 ? sets[0] : null;
  }

  // Get all valid card sets for selection UI
  getValidCardSets(playerId) {
    const cards = this.riskCards[playerId] || [];
    return this._findAllValidCardSets(cards);
  }

  // Trade RISK cards for IPCs
  tradeRiskCards(playerId) {
    // Can only trade during PLAYING + purchase phase
    if (!shouldShowPurchase(this.phase, this.turnPhase)) {
      return { success: false, ipcs: 0, error: 'Can only trade cards during Purchase phase' };
    }

    const cards = this.riskCards[playerId] || [];
    const set = this._findValidCardSet(cards);
    if (!set) return { success: false, ipcs: 0 };

    // Remove the cards used
    for (const cardType of set) {
      const idx = cards.indexOf(cardType);
      if (idx >= 0) cards.splice(idx, 1);
    }

    // Get trade value based on how many times player has traded
    const tradeNum = this.cardTradeCount[playerId] || 0;
    const value = RISK_CARD_VALUES[Math.min(tradeNum, RISK_CARD_VALUES.length - 1)];

    // Increment trade count and award IPCs
    this.cardTradeCount[playerId] = tradeNum + 1;
    this.playerState[playerId].ipcs += value;

    this._notify();
    return { success: true, ipcs: value };
  }

  // Get current RISK card trade value for player
  getNextRiskCardValue(playerId) {
    const tradeNum = this.cardTradeCount[playerId] || 0;
    return RISK_CARD_VALUES[Math.min(tradeNum, RISK_CARD_VALUES.length - 1)];
  }

  // Trade a specific set of RISK cards (for UI selection)
  tradeSpecificCards(playerId, cardSet) {
    // Can only trade during PLAYING + purchase phase
    if (!shouldShowPurchase(this.phase, this.turnPhase)) {
      return { success: false, ipcs: 0, error: 'Can only trade cards during Purchase phase' };
    }

    const cards = this.riskCards[playerId] || [];

    // Validate the set exists in player's hand
    const tempCards = [...cards];
    for (const cardType of cardSet) {
      const idx = tempCards.indexOf(cardType);
      if (idx < 0) {
        return { success: false, ipcs: 0, error: 'Invalid card set' };
      }
      tempCards.splice(idx, 1);
    }

    // Remove the cards from player's hand
    for (const cardType of cardSet) {
      const idx = cards.indexOf(cardType);
      if (idx >= 0) cards.splice(idx, 1);
    }

    // Get trade value based on how many times player has traded
    const tradeNum = this.cardTradeCount[playerId] || 0;
    const value = RISK_CARD_VALUES[Math.min(tradeNum, RISK_CARD_VALUES.length - 1)];

    // Increment trade count and award IPCs
    this.cardTradeCount[playerId] = tradeNum + 1;
    this.playerState[playerId].ipcs += value;

    this._notify();
    return { success: true, ipcs: value };
  }

  // --- Transport & Carrier System ---

  // Land units that unload into an empty hostile territory take it.
  // A territory that still has defenders stays for the combat phase.
  _captureEmptyHostileLand(territoryName) {
    if (this.turnPhase !== TURN_PHASES.COMBAT_MOVE) return null;
    const zone = this.territoryByName?.[territoryName];
    if (!zone || zone.isWater) return null;
    const player = this.currentPlayer;
    if (!player) return null;
    const owner = this.getOwner(territoryName);
    const hostile = !!(owner && owner !== player.id && !this.areAllies(player.id, owner));
    if (owner && !hostile) return null;
    const defenders = (this.units[territoryName] || []).some((unit) => (
      unit
      && unit.owner !== player.id
      && !this.areAllies(player.id, unit.owner)
      && (Number(unit.quantity) || 0) > 0
      && unit.type !== 'factory'
    ));
    if (defenders) return null;
    if (!this.territoryState[territoryName]) this.territoryState[territoryName] = {};
    this.territoryState[territoryName].owner = player.id;
    if (!(this.capturedThisTurn instanceof Set)) this.capturedThisTurn = new Set();
    this.capturedThisTurn.add(territoryName);
    let cardAwarded = null;
    if (!this.conqueredThisTurn[player.id]) {
      this.conqueredThisTurn[player.id] = true;
      cardAwarded = this.awardRiskCard(player.id);
    }
    return { captured: true, previousOwner: owner || null, cardAwarded };
  }

  // Load a unit onto a transport in the same sea zone
  loadTransport(seaZone, transportIndex, unitType, landTerritory, unitDefs) {
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    const seaUnits = this.units[seaZone] || [];
    const transports = seaUnits.filter(u => u.type === 'transport' && u.owner === player.id);
    if (transportIndex >= transports.length) {
      return { success: false, error: 'Invalid transport' };
    }

    const transport = transports[transportIndex];
    const transportDef = unitDefs.transport;

    // Check if transport can carry this unit type
    if (!transportDef.canCarry?.includes(unitType)) {
      return { success: false, error: `Transports cannot carry ${unitType}` };
    }

    // Check cargo capacity
    const currentCargo = transport.cargo || [];
    const canLoad = this._canLoadOnTransport(currentCargo, unitType);
    if (!canLoad) {
      return { success: false, error: 'Transport is full' };
    }

    // Check if unit exists in adjacent land territory
    const landUnits = this.units[landTerritory] || [];
    const sourceUnit = landUnits.find(u => u.type === unitType && u.owner === player.id && !u.moved);
    if (!sourceUnit || sourceUnit.quantity < 1) {
      return { success: false, error: `No ${unitType} available to load` };
    }

    // Move unit to transport
    sourceUnit.quantity--;
    if (sourceUnit.quantity <= 0) {
      const idx = landUnits.indexOf(sourceUnit);
      landUnits.splice(idx, 1);
    }

    transport.cargo = transport.cargo || [];
    transport.cargo.push({ type: unitType, owner: player.id });

    this._notify();
    return { success: true };
  }

  // Check if a unit can be loaded onto a transport given current cargo
  _canLoadOnTransport(cargo, unitType) {
    // Transport capacity: 2 infantry OR 1 infantry + 1 other ground unit
    // Valid combinations: 2 inf, 1 inf + 1 tank, 1 inf + 1 artillery, or 1 tank/artillery alone
    const infantryCount = cargo.filter(c => c.type === 'infantry').length;
    const otherCount = cargo.filter(c => c.type !== 'infantry').length;
    const totalCount = cargo.length;

    // Transport is full at 2 units
    if (totalCount >= 2) {
      return false;
    }

    if (unitType === 'infantry') {
      // Infantry can always be added if transport not full
      // - Empty: start with infantry
      // - 1 infantry: makes 2 infantry (valid)
      // - 1 other: makes 1 inf + 1 other (valid)
      return true;
    } else {
      // Non-infantry (tank/artillery) can be added if:
      // - Empty: 1 tank alone
      // - 1 infantry only: makes 1 inf + 1 tank (valid)
      // Cannot add if there's already a non-infantry (no 2 tanks)
      return otherCount === 0;
    }
  }

  // Count how many units of a given type can fit on a transport
  _countAvailableSlotsForType(cargo, unitType) {
    const totalCount = cargo.length;
    const otherCount = cargo.filter(c => c.type !== 'infantry').length;

    if (totalCount >= 2) return 0; // Full

    if (unitType === 'infantry') {
      // Infantry can fill all remaining slots (max 2 total on transport)
      return 2 - totalCount;
    } else {
      // Non-infantry can only be added if no other non-infantry present
      // And only 1 slot is available for non-infantry per transport
      return otherCount === 0 ? 1 : 0;
    }
  }

  // Optimize transport cargo to maximize loading capacity
  // Reorganizes existing cargo to make room for non-infantry units
  _optimizeTransportCargo(transports, unitsToLoad, playerId) {
    // unitsToLoad: { infantry: 10, armour: 2, artillery: 1, ... }
    const nonInfantryTypes = Object.keys(unitsToLoad).filter(t => t !== 'infantry');
    const nonInfantryCount = nonInfantryTypes.reduce((sum, t) => sum + unitsToLoad[t], 0);
    const infantryCount = unitsToLoad.infantry || 0;

    if (nonInfantryCount === 0) return; // No optimization needed

    // Calculate current state
    let transportsWithOnlyInfantry = [];
    let transportsWithNonInfantry = [];
    let emptyTransports = [];

    for (const transport of transports) {
      const cargo = transport.cargo || [];
      const hasNonInfantry = cargo.some(c => c.type !== 'infantry');
      const infantryOnBoard = cargo.filter(c => c.type === 'infantry').length;

      if (cargo.length === 0) {
        emptyTransports.push(transport);
      } else if (hasNonInfantry) {
        transportsWithNonInfantry.push(transport);
      } else if (infantryOnBoard > 0) {
        transportsWithOnlyInfantry.push(transport);
      }
    }

    // Calculate how many transports we need for non-infantry
    // Each transport can hold at most 1 non-infantry unit
    const transportsNeededForNonInf = nonInfantryCount;

    // Available slots for non-infantry = empty transports + transports with only 1 infantry
    const availableForNonInf = emptyTransports.length +
      transportsWithOnlyInfantry.filter(t => (t.cargo || []).length === 1).length;

    // If we have enough slots, great. Otherwise, we need to rearrange.
    if (availableForNonInf >= transportsNeededForNonInf) {
      // Rearrange: move infantry from half-full transports to make room for non-infantry
      // Priority: use empty transports first, then half-full (1 infantry) transports

      // Sort half-full transports by having exactly 1 infantry
      const halfFullTransports = transportsWithOnlyInfantry.filter(t => (t.cargo || []).length === 1);

      // For each non-infantry to load, ensure we have a spot
      let nonInfSlotsNeeded = nonInfantryCount;

      // Empty transports can each take 1 non-infantry
      nonInfSlotsNeeded -= emptyTransports.length;

      // If we still need slots, we need to convert some half-full (1 inf) transports
      // Those already have room for 1 non-infantry (1 inf + 1 tank is valid)
      // No rearrangement needed for those

      // But if we have transports with 2 infantry and need more non-inf slots,
      // we need to move 1 infantry off to make room
      if (nonInfSlotsNeeded > halfFullTransports.length) {
        const fullInfantryTransports = transportsWithOnlyInfantry.filter(t => (t.cargo || []).length === 2);
        const slotsToFree = nonInfSlotsNeeded - halfFullTransports.length;

        // Try to move infantry from full-infantry transports to other transports
        for (let i = 0; i < Math.min(slotsToFree, fullInfantryTransports.length); i++) {
          const sourceTransport = fullInfantryTransports[i];
          const cargo = sourceTransport.cargo || [];

          // Find infantry to move
          const infIndex = cargo.findIndex(c => c.type === 'infantry');
          if (infIndex === -1) continue;

          // Find a transport that can accept infantry
          // Look for empty transports first, then half-full with 1 non-infantry
          let targetTransport = emptyTransports.find(t => (t.cargo || []).length < 2);
          if (!targetTransport) {
            targetTransport = transportsWithNonInfantry.find(t => (t.cargo || []).length < 2);
          }

          if (targetTransport) {
            // Move infantry
            const inf = cargo.splice(infIndex, 1)[0];
            targetTransport.cargo = targetTransport.cargo || [];
            targetTransport.cargo.push(inf);
          }
        }
      }
    }
  }

  // Unload units from transport to coastal territory
  unloadTransport(seaZone, transportIndex, coastalTerritory) {
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    const seaUnits = this.units[seaZone] || [];
    const transports = seaUnits.filter(u => u.type === 'transport' && u.owner === player.id);
    if (transportIndex >= transports.length) {
      return { success: false, error: 'Invalid transport' };
    }

    const transport = transports[transportIndex];
    if (!transport.cargo || transport.cargo.length === 0) {
      return { success: false, error: 'Transport has no cargo' };
    }

    // Ensure transport has a unique ID for undo tracking
    if (!transport.id) {
      transport.id = this._generateShipId('transport');
    }

    // Check adjacency
    const seaT = this.territoryByName[seaZone];
    if (!seaT || !seaT.connections.includes(coastalTerritory)) {
      return { success: false, error: 'Territory not adjacent to sea zone' };
    }

    const coastalT = this.territoryByName[coastalTerritory];
    if (coastalT?.isWater) {
      return { success: false, error: 'Cannot unload to water' };
    }

    // Unload all cargo to coastal territory
    // IMPORTANT: Don't merge with unmoved units - keep them separate so they can still move
    const coastalUnits = this.units[coastalTerritory] || [];
    const unloadedUnits = []; // Track for move history

    for (const cargo of transport.cargo) {
      const existing = coastalUnits.find(u => u.type === cargo.type && u.owner === cargo.owner && u.moved);
      if (existing) {
        existing.quantity++;
      } else {
        coastalUnits.push({ type: cargo.type, quantity: 1, owner: cargo.owner, moved: true });
      }
      // Track each unit for undo
      const tracked = unloadedUnits.find(u => u.type === cargo.type);
      if (tracked) {
        tracked.quantity++;
      } else {
        unloadedUnits.push({ type: cargo.type, quantity: 1 });
      }
    }
    this.units[coastalTerritory] = coastalUnits;

    // Mark as amphibious assault if unloading during combat move to non-friendly territory
    // This includes enemy territories AND undefended/neutral territories (for shore bombardment)
    if (this.turnPhase === TURN_PHASES.COMBAT_MOVE) {
      const owner = this.getOwner(coastalTerritory);
      // Mark as amphibious if: no owner (undefended), or enemy owned, or not an ally
      const isNonFriendly = !owner || (owner !== player.id && !this.areAllies(player.id, owner));
      if (isNonFriendly) {
        this.amphibiousTerritories.add(coastalTerritory);

        // Track amphibious assault details for naval combat dependency
        // If naval combat in this sea zone is lost, these units will be destroyed
        if (!this.amphibiousAssaultDetails[coastalTerritory]) {
          this.amphibiousAssaultDetails[coastalTerritory] = {
            seaZone: seaZone,
            units: []
          };
        }
        for (const unit of unloadedUnits) {
          this.amphibiousAssaultDetails[coastalTerritory].units.push({
            type: unit.type,
            quantity: unit.quantity,
            owner: player.id
          });
        }
      }
    }

    const capture = this._captureEmptyHostileLand(coastalTerritory);

    // Track in move history for undo - mark as amphibious unload
    if (unloadedUnits.length > 0) {
      this._pushMove({
        from: seaZone,
        to: coastalTerritory,
        units: unloadedUnits,
        player: player.id,
        isAmphibious: true,
        transportId: transport.id,
        captured: !!capture?.captured,
        previousOwner: capture?.previousOwner || null,
      });
    }

    // Clear transport cargo
    transport.cargo = [];

    this._notify();
    return { success: true };
  }

  // Unload a single unit from transport to coastal territory
  unloadSingleUnit(seaZone, transportIndex, unitType, coastalTerritory) {
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    const seaUnits = this.units[seaZone] || [];
    const transports = seaUnits.filter(u => u.type === 'transport' && u.owner === player.id);
    if (transportIndex >= transports.length) {
      return { success: false, error: 'Invalid transport' };
    }

    const transport = transports[transportIndex];
    if (!transport.cargo || transport.cargo.length === 0) {
      return { success: false, error: 'Transport has no cargo' };
    }

    // Ensure transport has a unique ID for undo tracking
    if (!transport.id) {
      transport.id = this._generateShipId('transport');
    }

    // Find the unit in cargo
    const cargoIdx = transport.cargo.findIndex(c => c.type === unitType && c.owner === player.id);
    if (cargoIdx < 0) {
      return { success: false, error: `No ${unitType} in transport` };
    }

    // Check adjacency
    const seaT = this.territoryByName[seaZone];
    if (!seaT || !seaT.connections.includes(coastalTerritory)) {
      return { success: false, error: 'Territory not adjacent to sea zone' };
    }

    const coastalT = this.territoryByName[coastalTerritory];
    if (coastalT?.isWater) {
      return { success: false, error: 'Cannot unload to water' };
    }

    // Remove from transport cargo
    transport.cargo.splice(cargoIdx, 1);

    // Add to coastal territory
    // IMPORTANT: Don't merge with unmoved units - keep them separate so they can still move
    const coastalUnits = this.units[coastalTerritory] || [];
    const existing = coastalUnits.find(u => u.type === unitType && u.owner === player.id && u.moved);
    if (existing) {
      existing.quantity++;
    } else {
      coastalUnits.push({ type: unitType, quantity: 1, owner: player.id, moved: true });
    }
    this.units[coastalTerritory] = coastalUnits;

    // Mark as amphibious assault if unloading during combat move to non-friendly territory
    // This includes enemy territories AND undefended/neutral territories (for shore bombardment)
    if (this.turnPhase === TURN_PHASES.COMBAT_MOVE) {
      const owner = this.getOwner(coastalTerritory);
      // Mark as amphibious if: no owner (undefended), or enemy owned, or not an ally
      const isNonFriendly = !owner || (owner !== player.id && !this.areAllies(player.id, owner));
      if (isNonFriendly) {
        this.amphibiousTerritories.add(coastalTerritory);

        // Track amphibious assault details for naval combat dependency
        // If naval combat in this sea zone is lost, these units will be destroyed
        if (!this.amphibiousAssaultDetails[coastalTerritory]) {
          this.amphibiousAssaultDetails[coastalTerritory] = {
            seaZone: seaZone,
            units: []
          };
        }
        this.amphibiousAssaultDetails[coastalTerritory].units.push({
          type: unitType,
          quantity: 1,
          owner: player.id
        });
      }
    }

    const capture = this._captureEmptyHostileLand(coastalTerritory);

    // Track in move history for undo - mark as amphibious unload
    this._pushMove({
      from: seaZone,
      to: coastalTerritory,
      units: [{ type: unitType, quantity: 1 }],
      player: player.id,
      isAmphibious: true,
      transportId: transport.id,
      captured: !!capture?.captured,
      previousOwner: capture?.previousOwner || null,
    });

    this._notify();
    return { success: true };
  }

  // Land a fighter on a carrier
  landOnCarrier(seaZone, carrierIndex, fighterType, fromTerritory, unitDefs) {
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    const seaUnits = this.units[seaZone] || [];
    const carriers = seaUnits.filter(u => u.type === 'carrier' && u.owner === player.id);
    if (carrierIndex >= carriers.length) {
      return { success: false, error: 'Invalid carrier' };
    }

    const carrier = carriers[carrierIndex];
    const carrierDef = unitDefs.carrier;

    // Check if carrier can carry this aircraft type
    if (!carrierDef.canCarry?.includes(fighterType)) {
      return { success: false, error: `Carriers cannot carry ${fighterType}` };
    }

    // Check capacity
    const currentAircraft = carrier.aircraft || [];
    if (currentAircraft.length >= carrierDef.aircraftCapacity) {
      return { success: false, error: 'Carrier is full' };
    }

    // Find the fighter in source territory
    const sourceUnits = this.units[fromTerritory] || [];
    const sourceUnit = sourceUnits.find(u => u.type === fighterType && u.owner === player.id);
    if (!sourceUnit || sourceUnit.quantity < 1) {
      return { success: false, error: `No ${fighterType} available` };
    }

    // Move fighter to carrier
    sourceUnit.quantity--;
    if (sourceUnit.quantity <= 0) {
      const idx = sourceUnits.indexOf(sourceUnit);
      sourceUnits.splice(idx, 1);
    }

    carrier.aircraft = carrier.aircraft || [];
    carrier.aircraft.push({ type: fighterType, owner: player.id });

    this._notify();
    return { success: true };
  }

  // Launch aircraft from carrier (they can then move independently)
  launchFromCarrier(seaZone, carrierIndex, aircraftIndex) {
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    const seaUnits = this.units[seaZone] || [];
    const carriers = seaUnits.filter(u => u.type === 'carrier' && u.owner === player.id);
    if (carrierIndex >= carriers.length) {
      return { success: false, error: 'Invalid carrier' };
    }

    const carrier = carriers[carrierIndex];
    if (!carrier.aircraft || aircraftIndex >= carrier.aircraft.length) {
      return { success: false, error: 'Invalid aircraft' };
    }

    const aircraft = carrier.aircraft[aircraftIndex];

    // Add aircraft to the sea zone as a unit (it will need to land somewhere at end of turn)
    const existing = seaUnits.find(u => u.type === aircraft.type && u.owner === aircraft.owner);
    if (existing) {
      existing.quantity++;
    } else {
      seaUnits.push({ type: aircraft.type, quantity: 1, owner: aircraft.owner });
    }

    // Remove from carrier
    carrier.aircraft.splice(aircraftIndex, 1);

    this._notify();
    return { success: true };
  }

  // Get transport cargo summary for UI
  getTransportCargo(seaZone, playerId) {
    const units = this.units[seaZone] || [];
    const transports = units.filter(u => u.type === 'transport' && u.owner === playerId);
    return transports.map((t, i) => ({
      index: i,
      cargo: t.cargo || [],
      capacity: 2
    }));
  }

  // Get carrier aircraft summary for UI
  getCarrierAircraft(seaZone, playerId) {
    const units = this.units[seaZone] || [];
    const carriers = units.filter(u => u.type === 'carrier' && u.owner === playerId);
    return carriers.map((c, i) => ({
      index: i,
      aircraft: c.aircraft || [],
      capacity: 2,
      damaged: c.damaged || false
    }));
  }

  // === ROCKETS TECHNOLOGY ===

  // Get available AA guns for rocket attacks (ones that haven't fired this turn)
  getAvailableRocketAAguns(playerId) {
    if (!this.hasTech(playerId, 'rockets')) return [];

    const available = [];
    for (const [terrName, units] of Object.entries(this.units)) {
      const territory = this.territoryByName[terrName];
      if (!territory || territory.isWater) continue;
      if (this.getOwner(terrName) !== playerId) continue;

      const aaGuns = units.filter(u => u.type === 'aaGun' && u.owner === playerId);
      const totalAA = aaGuns.reduce((sum, u) => sum + (u.quantity || 1), 0);
      const usedCount = this.rocketsUsedThisTurn[terrName] || 0;
      const availableCount = totalAA - usedCount;

      if (availableCount > 0) {
        available.push({
          territory: terrName,
          aaCount: totalAA,
          availableCount,
          usedCount
        });
      }
    }
    return available;
  }

  // Get valid rocket targets from a territory (adjacent enemy factories)
  getRocketTargets(fromTerritory) {
    const player = this.currentPlayer;
    if (!player) return [];

    const territory = this.territoryByName[fromTerritory];
    if (!territory) return [];

    const targets = [];
    for (const connName of territory.connections || []) {
      const conn = this.territoryByName[connName];
      if (!conn || conn.isWater) continue;

      const owner = this.getOwner(connName);
      if (!owner || owner === player.id || this.areAllies(player.id, owner)) continue;

      // Check for factory
      const units = this.units[connName] || [];
      const hasFactory = units.some(u => u.type === 'factory' && u.owner === owner);
      if (hasFactory) {
        const ownerPlayer = this.getPlayer(owner);
        targets.push({
          territory: connName,
          owner,
          ownerName: ownerPlayer?.name || owner,
          ownerIPCs: this.getIPCs(owner)
        });
      }
    }
    return targets;
  }

  // Execute a rocket attack
  // Returns: { success, damage, targetIPCs, message }
  launchRocket(fromTerritory, targetTerritory) {
    const player = this.currentPlayer;
    if (!player) return { success: false, error: 'No current player' };

    // Verify rockets tech
    if (!this.hasTech(player.id, 'rockets')) {
      return { success: false, error: 'Rockets technology not researched' };
    }

    // Verify phase
    if (this.turnPhase !== TURN_PHASES.COMBAT_MOVE) {
      return { success: false, error: 'Rockets can only be launched during combat move phase' };
    }

    // Verify AA gun availability
    const from = this.territoryByName[fromTerritory];
    if (!from || from.isWater) {
      return { success: false, error: 'Invalid source territory' };
    }
    if (this.getOwner(fromTerritory) !== player.id) {
      return { success: false, error: 'You do not control the source territory' };
    }

    const aaUnits = (this.units[fromTerritory] || []).filter(u => u.type === 'aaGun' && u.owner === player.id);
    const totalAA = aaUnits.reduce((sum, u) => sum + (u.quantity || 1), 0);
    const usedCount = this.rocketsUsedThisTurn[fromTerritory] || 0;
    if (usedCount >= totalAA) {
      return { success: false, error: 'All AA guns at this territory have already fired rockets' };
    }

    // Verify target
    const target = this.territoryByName[targetTerritory];
    if (!target || target.isWater) {
      return { success: false, error: 'Invalid target territory' };
    }
    if (!from.connections?.includes(targetTerritory)) {
      return { success: false, error: 'Target not adjacent' };
    }

    const targetOwner = this.getOwner(targetTerritory);
    if (!targetOwner || targetOwner === player.id || this.areAllies(player.id, targetOwner)) {
      return { success: false, error: 'Target must be enemy territory' };
    }

    const targetUnits = this.units[targetTerritory] || [];
    const hasFactory = targetUnits.some(u => u.type === 'factory' && u.owner === targetOwner);
    if (!hasFactory) {
      return { success: false, error: 'Target must have a factory' };
    }

    // Roll for damage (1d6). Same formula as every other die; recorded after.
    const damage = this._rollDie({
      context: 'rocket',
      side: 'attacker',
      unit: 'aaGun',
      need: null,
      playerSeat: player.id,
    });
    const targetIPCs = this.getIPCs(targetOwner);
    const actualDamage = Math.min(damage, targetIPCs);

    // Apply damage
    this.playerState[targetOwner].ipcs -= actualDamage;

    // Mark AA gun as used
    this.rocketsUsedThisTurn[fromTerritory] = usedCount + 1;

    const targetPlayer = this.getPlayer(targetOwner);
    const message = `Rocket attack on ${targetTerritory}! Rolled ${damage}, ${targetPlayer?.name || targetOwner} loses ${actualDamage} IPCs.`;

    this._notify();
    flushDiceBuffer(this);

    return {
      success: true,
      damage,
      actualDamage,
      targetIPCs,
      targetOwner,
      message
    };
  }

  // Air that survived on land taken this turn must leave before the phase
  // ends. Bots never open the landing picker (9.21.26.07).
  relocateAirFromCapturedLand(unitDefs = this._unitDefs || this.unitDefs || {}) {
    const player = this.currentPlayer;
    if (!player) return { moved: 0, crashed: 0 };
    let moved = 0;
    let crashed = 0;
    for (const [name, stacks] of Object.entries(this.units || {})) {
      const territory = this.territoryByName?.[name];
      if (!territory || territory.isWater) continue;
      if (wasFriendlyAtTurnStart(this, name, player.id)) continue;
      for (const unit of [...(stacks || [])]) {
        if (unit.owner !== player.id || !unitDefs[unit.type]?.isAir) continue;
        let left = unit.quantity || 0;
        let guard = 0;
        while (left > 0 && guard++ < 40) {
          const options = (this.getAirLandingOptions(name, unit.type, unitDefs, {
            allowFreshMove: true,
          }) || []).filter((opt) => opt.territory && opt.territory !== name);
          const choice = preferAirLandingOption(options);
          if (!choice?.territory) {
            const origin = this.units[name] || [];
            crashed += takeAirUnitsFromTerritory(origin, {
              type: unit.type,
              owner: player.id,
              quantity: left,
            });
            this.units[name] = origin;
            left = 0;
            break;
          }
          const applied = applyAirLandingPlan({
            units: this.units,
            territoryByName: this.territoryByName,
            originTerritory: name,
            owner: player.id,
            plan: [{
              id: `${unit.type}_cap_${guard}`,
              type: unit.type,
              quantity: 1,
              destination: choice.territory,
            }],
            unitDefs,
          });
          const n = (applied || []).reduce((sum, item) => sum + (item.stayed ? 0 : (item.quantity || 0)), 0);
          if (n <= 0) {
            const origin = this.units[name] || [];
            const taken = takeAirUnitsFromTerritory(origin, {
              type: unit.type,
              owner: player.id,
              quantity: 1,
            });
            this.units[name] = origin;
            crashed += taken;
            left -= taken;
            continue;
          }
          moved += n;
          left -= n;
        }
      }
    }
    return { moved, crashed };
  }

  // Fighters/bombers cannot end combat or NCM over open water.
  // Land on the nearest legal territory, else a friendly carrier, else crash.
  resolveLooseAirOverWater(unitDefs = this._unitDefs || this.unitDefs || {}) {
    const player = this.currentPlayer;
    if (!player) return { landed: 0, crashed: 0 };
    const loose = looseAirOverWater(this.units, this.territoryByName, player.id, unitDefs);
    let landed = 0;
    let crashed = 0;
    for (const group of loose) {
      let left = group.quantity;
      let guard = 0;
      while (left > 0 && guard++ < 40) {
        const options = this.getAirLandingOptions(group.territory, group.type, unitDefs, {
          allowFreshMove: true,
        }) || [];
        const choice = preferAirLandingOption(options);
        const sameHex = choice?.territory === group.territory;
        if (!choice?.territory || (sameHex && !choice.isCarrier)) {
          const origin = this.units[group.territory] || [];
          const taken = takeAirUnitsFromTerritory(origin, {
            type: group.type,
            owner: player.id,
            quantity: left,
          });
          this.units[group.territory] = origin;
          crashed += taken;
          left = 0;
          break;
        }
        const applied = applyAirLandingPlan({
          units: this.units,
          territoryByName: this.territoryByName,
          originTerritory: group.territory,
          owner: player.id,
          plan: [{
            id: `${group.type}_land_${guard}`,
            type: group.type,
            quantity: 1,
            destination: choice.territory,
          }],
          unitDefs,
        });
        const moved = (applied || []).reduce((sum, item) => sum + (item.stayed ? 0 : (item.quantity || 0)), 0);
        if (moved <= 0) {
          const origin = this.units[group.territory] || [];
          const taken = takeAirUnitsFromTerritory(origin, {
            type: group.type,
            owner: player.id,
            quantity: 1,
          });
          this.units[group.territory] = origin;
          crashed += taken;
          left -= taken;
          continue;
        }
        landed += moved;
        left -= moved;
      }
    }
    if (landed > 0 || crashed > 0) this._notify();
    return { landed, crashed };
  }

  // === PENDING AIR LANDINGS ===

  // Add air units needing landing from a completed combat
  addPendingAirLandings(originTerritory, airUnits) {
    if (!airUnits || airUnits.length === 0) return;

    for (const unit of airUnits) {
      this.pendingAirLandings = upsertPendingAirLanding(this.pendingAirLandings, {
        originTerritory,
        id: unit.id,
        type: unit.type,
        quantity: unit.quantity || 1,
        destination: unit.destination || null,
        applied: !!unit.applied,
      });
    }
  }

  // Record one selected landing immediately so Confirm / NCM / a reload
  // still has the destination even if the combat overlay is gone.
  recordAirLandingSelection({
    originTerritory,
    id,
    type,
    quantity = 1,
    destination,
    notify = true,
  } = {}) {
    if (!originTerritory || !type || !destination) return this.pendingAirLandings;
    this.pendingAirLandings = upsertPendingAirLanding(this.pendingAirLandings, {
      originTerritory,
      id,
      type,
      quantity,
      destination,
    });
    if (notify) this._notify();
    return this.pendingAirLandings;
  }

  clearAirLandingSelections(originTerritory = null, { notify = true } = {}) {
    this.pendingAirLandings = clearPendingLandingDestinations(
      this.pendingAirLandings,
      originTerritory,
    );
    if (notify) this._notify();
    return this.pendingAirLandings;
  }

  // Board-level apply. Combat overlay callers must also drop those aircraft
  // from combatState.attackers so _finalizeCombat cannot write them back.
  applyAirLandings(originTerritory, {
    landings = {},
    airUnitsToLand = [],
    unitDefs = {},
    notify = true,
  } = {}) {
    const player = this.currentPlayer;
    if (!player || !originTerritory) {
      return { success: false, applied: [], error: 'No origin or current player' };
    }

    const sourceUnits = airUnitsToLand.length > 0
      ? airUnitsToLand
      : (this.pendingAirLandings.find((entry) => entry.originTerritory === originTerritory)?.units || []);
    const plan = buildLandingPlan(sourceUnits, landings);
    const applied = applyAirLandingPlan({
      units: this.units,
      territoryByName: this.territoryByName,
      originTerritory,
      owner: player.id,
      plan,
      unitDefs,
    });

    this.pendingAirLandings = markPendingAirLandingsApplied(
      this.pendingAirLandings,
      originTerritory,
      applied
    );
    if (applied.length > 0) {
      this.clearAirUnitOrigins(originTerritory);
    }
    if (notify) this._notify();
    return { success: true, applied };
  }

  applyPendingAirLandings({ unitDefs = {}, notify = true } = {}) {
    const leftover = unappliedLandingPlan(this.pendingAirLandings);
    const appliedAll = [];
    for (const entry of leftover) {
      const result = this.applyAirLandings(entry.originTerritory, {
        airUnitsToLand: entry.units,
        landings: Object.fromEntries(
          (entry.units || [])
            .filter((unit) => unit.id && unit.destination)
            .map((unit) => [unit.id, unit.destination])
        ),
        unitDefs,
        notify: false,
      });
      if (result.applied?.length) appliedAll.push(...result.applied);
    }
    if (notify && appliedAll.length > 0) this._notify();
    return { success: true, applied: appliedAll };
  }

  // Check if there are pending air landings
  hasPendingAirLandings() {
    return this.pendingAirLandings.length > 0;
  }

  // Get all pending air landings
  getPendingAirLandings() {
    return this.pendingAirLandings;
  }

  // Clear pending air landings after they've been processed
  clearPendingAirLandings() {
    this.pendingAirLandings = [];
  }

  subscribe(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(cb => cb !== callback);
    };
  }

  pauseNotifications() {
    this._notifyPauseDepth++;
  }

  resumeNotifications({ flush = true } = {}) {
    if (this._notifyPauseDepth > 0) this._notifyPauseDepth--;
    if (this._notifyPauseDepth === 0 && flush) this._notify();
  }

  _notify() {
    if (this._notifyPauseDepth > 0) return;
    // Every board change persists. Remote apply sets _suppressPersist so a
    // snapshot echo cannot bump actionSeq and then refuse the next snapshot.
    if (!this._suppressPersist) {
      this.actionSeq = (Number(this.actionSeq) || 0) + 1;
      this.autoSave();
    }
    for (const cb of this._listeners) {
      cb(this);
    }
    // Note: multiplayer state push is handled by the subscription in main.js,
    // which correctly guards against pushing during remote state loads (isLoading check).
    // Do NOT push directly here — it bypasses that guard.
  }

  toJSON() {
    return omitUndefinedDeep({
      version: 11, // v11: Added turn events for turn summary modal
      gameMode: this.gameMode,
      alliancesEnabled: this.alliancesEnabled,
      teamsEnabled: this.teamsEnabled,
      isMultiplayer: this.isMultiplayer,
      players: this.players, // Players now include oderId for multiplayer
      currentPlayerIndex: this.currentPlayerIndex,
      round: this.round,
      phase: this.phase,
      turnPhase: resolvePersistedTurnPhase(this.phase, this.turnPhase),
      territoryState: this.territoryState,
      units: this.units,
      playerState: this.playerState,
      pendingPurchases: this.pendingPurchases,
      combatQueue: this.combatQueue,
      gameOver: this.gameOver,
      winner: this.winner,
      winCondition: this.winCondition,
      playerTechs: this.playerTechs,
      riskCards: this.riskCards,
      cardTradeCount: this.cardTradeCount,
      unitsToPlace: cloneUnitsToPlace(this.unitsToPlace),
      placementRound: this.placementRound,
      // Additive (no schema bump): mid-wave rejoin must restore the 6-unit cap.
      unitsPlacedThisRound: this.unitsPlacedThisRound || 0,
      // Additive (no schema bump): undo must survive refresh and peer hydrate.
      placementHistory: (this.placementHistory || []).map((row) => ({ ...row })),
      // v8: Save air unit origin tracking for proper landing calculation after load
      airUnitOrigins: this.airUnitOrigins,
      friendlyTerritoriesAtTurnStart: Array.from(this.friendlyTerritoriesAtTurnStart || []),
      // v9: Save factories at turn start for mobilization validation
      factoriesAtTurnStart: Array.from(this.factoriesAtTurnStart || []),
      // v11: Turn events for turn summary modal (multiplayer)
      turnEvents: this.turnEvents,
      // Additive (no schema bump): last ~40 AA/combat dice + force snapshots.
      combatTelemetry: (this.combatTelemetry || []).map((entry) => ({ ...entry })),
      // Additive config (no schema bump): AI-when-unattended policy (Bug 2).
      // Default false = AI pauses when no human is present. Old clients ignore
      // the extra field; a missing field loads as false. See aiPolicy.js.
      aiRunsWhenUnattended: this.aiRunsWhenUnattended ?? false,
      // Additive (no schema bump): per-row Undo for the current turn.
      // Old saves omit the fields and load as [] / 0. nextTurn still clears
      // both. Undo refuses a row whose player is not the current seat.
      moveHistory: cloneMoveHistory(this.moveHistory),
      undoLockMoveCount: Number(this.undoLockMoveCount) || 0,
      // Monotonic board revision. A cloud snapshot with a lower seq must not
      // clobber in-progress moves (9.21.26.04).
      actionSeq: Number(this.actionSeq) || 0,
      uiGesture: this.uiGesture || null,
      // Additive: post-combat air landing plan. Must survive a mid-landing
      // reload so Confirm / NCM can still move the aircraft.
      pendingAirLandings: (this.pendingAirLandings || []).map((entry) => ({
        originTerritory: entry.originTerritory,
        units: (entry.units || []).map((unit) => ({ ...unit })),
      })),
    });
  }

  loadFromJSON(data) {
    if (data.version < 3) throw new Error('Incompatible save version');
    this._suppressPersist = true;
    try {
      this._loadFromJSONBody(data);
    } finally {
      this._suppressPersist = false;
    }
  }

  _loadFromJSONBody(data) {
    const prevPlayerId = this.currentPlayer?.id;
    const prevPlacedThisRound = this.unitsPlacedThisRound || 0;
    const prevPlacementRound = this.placementRound || 0;
    const prevActionSeq = Number(this.actionSeq) || 0;
    this.gameMode = data.gameMode;
    this.alliancesEnabled = data.alliancesEnabled ?? (data.gameMode === 'classic');
    this.teamsEnabled = data.teamsEnabled ?? false;
    // v10: Multiplayer flag (don't overwrite if already set - syncManager sets it before load)
    if (data.isMultiplayer !== undefined && !this.isMultiplayer) {
      this.isMultiplayer = data.isMultiplayer;
    }
    this.players = data.players;
    this.currentPlayerIndex = data.currentPlayerIndex;
    this.round = data.round;
    this.phase = data.phase;
    this.turnPhase = resolvePersistedTurnPhase(this.phase, data.turnPhase);
    // Load AND apply (syncManager uses this method) share one rule:
    // setup phases ignore turnPhase. Do not rewrite leftover `purchase`
    // into `develop_tech` — that "heal" created/preserved the V2.73
    // dump (unit_placement + develop_tech) and then treated it as valid.
    // Playing UI / techUI / AI playing paths require phase === PLAYING.
    this._normalizeAfterLoad();
    this.territoryState = data.territoryState;
    this.units = data.units;
    this.playerState = data.playerState;
    this.pendingPurchases = data.pendingPurchases || [];
    this.combatQueue = data.combatQueue || [];
    this.gameOver = data.gameOver || false;
    this.winner = data.winner || null;
    this.winCondition = data.winCondition || null;
    this.playerTechs = data.playerTechs || {};
    this.riskCards = data.riskCards || {};
    this.cardTradeCount = data.cardTradeCount || {};
    this.unitsToPlace = cloneUnitsToPlace(data.unitsToPlace || {});
    this.placementRound = data.placementRound || 0;
    // Same seat + stale remote 0/missing must not wipe a local 1/6 (B28).
    const nextPlayerId = this.players?.[this.currentPlayerIndex]?.id;
    const remoteActionSeq = Number(data.actionSeq) || 0;
    this.unitsPlacedThisRound = resolveDeployedThisRoundAfterLoad({
      prevPlayerId,
      nextPlayerId,
      remotePlacedThisRound: data.unitsPlacedThisRound,
      localPlacedThisRound: prevPlacedThisRound,
      prevPlacementRound,
      nextPlacementRound: this.placementRound,
      localPlacedOwnerId: this.unitsPlacedThisRoundOwnerId,
      remoteActionSeq,
      localActionSeq: prevActionSeq,
    });
    if (remoteActionSeq >= prevActionSeq) {
      this.placementHistory = Array.isArray(data.placementHistory)
        ? data.placementHistory.map((row) => ({ ...row }))
        : [];
    }
    this.unitsPlacedThisRoundOwnerId = this.unitsPlacedThisRound > 0
      ? (this.unitsPlacedThisRoundOwnerId && this.unitsPlacedThisRoundOwnerId === nextPlayerId
        ? this.unitsPlacedThisRoundOwnerId
        : nextPlayerId || null)
      : null;
    this.ensureInitialDeployPools();

    // v8: Restore air unit tracking for proper landing calculation
    this.airUnitOrigins = data.airUnitOrigins || {};
    if (data.friendlyTerritoriesAtTurnStart) {
      this.friendlyTerritoriesAtTurnStart = new Set(data.friendlyTerritoriesAtTurnStart);
    } else {
      // Older saves (v7 and below): Re-initialize friendly territories
      // This is approximate but better than empty - includes all currently owned territories
      this._initFriendlyTerritoriesAtTurnStart();
    }

    // v9: Restore factories at turn start for mobilization validation
    if (data.factoriesAtTurnStart) {
      this.factoriesAtTurnStart = new Set(data.factoriesAtTurnStart);
    } else {
      // Older saves (v8 and below): Initialize from current factories
      // This allows placing on any currently owned factory (less restrictive, but better than broken)
      this.factoriesAtTurnStart = new Set(this._getFactoryTerritories(this.currentPlayer?.id));
    }

    // v11: Restore turn events for turn summary modal
    this.turnEvents = data.turnEvents || [];
    this.combatTelemetry = Array.isArray(data.combatTelemetry)
      ? data.combatTelemetry.map((entry) => ({ ...entry }))
      : [];

    // AI-when-unattended policy (Bug 2). Default false: pause AI when no human
    // is present. Older docs without the field load as the safe default.
    this.aiRunsWhenUnattended = data.aiRunsWhenUnattended ?? false;

    // Reset per-turn state on load (fresh state for the turn)
    this.rocketsUsedThisTurn = {};
    // Restore named landings. Wiping this on every snapshot was the
    // multiplayer path that discarded Eastern US after combat (Robert 19 Sep).
    this.pendingAirLandings = (data.pendingAirLandings || []).map((entry) => ({
      originTerritory: entry.originTerritory,
      units: (entry.units || []).map((unit) => ({ ...unit })),
    }));
    this.actionSeq = Number(data.actionSeq) || 0;
    this.uiGesture = data.uiGesture || null;
    this.uiGestureActive = !!(
      this.uiGesture?.active
      || (this.uiGesture?.selectedUnits && Object.values(this.uiGesture.selectedUnits).some((n) => Number(n) > 0))
      || this.uiGesture?.landing
    );
    // Start-of-turn phases have no legal "already moved" air. A stuck moved
    // flag from the previous turn made Attack a no-op (9.21.26.03).
    if (this.turnPhase === TURN_PHASES.DEVELOP_TECH || this.turnPhase === TURN_PHASES.PURCHASE) {
      this._clearMovedFlags();
    }
    this.amphibiousTerritories = new Set();
    this.amphibiousAssaultDetails = {};
    // Optional fields. A save from before this build has neither.
    this.moveHistory = cloneMoveHistory(data.moveHistory);
    this.undoLockMoveCount = Number.isFinite(Number(data.undoLockMoveCount))
      ? Number(data.undoLockMoveCount)
      : 0;
    this.conqueredThisTurn = {};
    this.capturedThisTurn = new Set(data.capturedThisTurn || []);

    this._notify();
  }

  // After load/apply: a wedged setup doc must present as setup, not
  // Research. turnPhase is unused storage until phase === PLAYING.
  _normalizeAfterLoad() {
    if (this.phase !== GAME_PHASES.PLAYING) {
      this.turnPhase = SETUP_TURN_PHASE;
    }
  }

  saveToFile() {
    const data = JSON.stringify(this.toJSON(), null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tactical-risk-save.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  loadFromFile() {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return reject(new Error('No file'));
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            this.loadFromJSON(JSON.parse(ev.target.result));
            resolve();
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsText(file);
      };
      input.click();
    });
  }

  // Auto-save to localStorage for pass-and-play
  autoSave() {
    // Online games persist in Firestore — never write them to the local
    // autosave slot, or they'd overwrite a hotseat save AND show up in
    // "My Games" as a broken 'local' game with no sync manager
    if (this.isMultiplayer) return false;
    try {
      const data = JSON.stringify(this.toJSON());
      localStorage.setItem('tacticalRisk_autoSave', data);
      localStorage.setItem('tacticalRisk_autoSave_time', new Date().toISOString());
      return true;
    } catch (err) {
      console.warn('Auto-save failed:', err);
      return false;
    }
  }

  // Load from auto-save
  static loadAutoSave() {
    try {
      const data = localStorage.getItem('tacticalRisk_autoSave');
      if (!data) return null;
      return JSON.parse(data);
    } catch (err) {
      console.warn('Load auto-save failed:', err);
      return null;
    }
  }

  // Check if auto-save exists
  static hasAutoSave() {
    return localStorage.getItem('tacticalRisk_autoSave') !== null;
  }

  // Get auto-save timestamp
  static getAutoSaveTime() {
    return localStorage.getItem('tacticalRisk_autoSave_time');
  }

  // Clear auto-save
  static clearAutoSave() {
    localStorage.removeItem('tacticalRisk_autoSave');
    localStorage.removeItem('tacticalRisk_autoSave_time');
  }
}
