// Multiplayer Guard for Tactical Risk
// Blocks non-active players from making game actions

export class MultiplayerGuard {
  constructor(syncManager) {
    this.syncManager = syncManager;
    this.wrappedMethods = [];
  }

  // Wrap GameState methods to block non-active players
  wrapGameState(gameState) {
    // Methods that modify game state and should be blocked for non-active players
    const methodsToWrap = [
      // Turn and phase management
      'nextPhase',
      'nextTurn',
      // Capital placement (initial game setup)
      'placeCapital',
      'setCapital',
      // Initial unit placement (Risk-style setup)
      'placeInitialUnit',
      'placeInitialUnits',
      'finishPlacementRound',
      'undoPlacement',
      'undoLastCapital',
      // Movement
      'moveUnits',
      // Purchases
      'purchaseUnit',
      'cancelPurchase',
      'confirmPurchases',
      'addToPendingPurchases',
      'removeFromPendingPurchases',
      'clearPendingPurchases',
      // Mobilization
      'mobilizeUnit',
      'mobilizeUnits',
      'undoMobilization',
      // Combat
      'resolveCombat',
      'retreatUnits',
      'finishCombat',
      'finishAllCombats',
      // Territory and units
      'setTerritoryOwner',
      'addUnit',
      'removeUnit',
      'placeUnit',
      // IPCs
      'addIPCs',
      'removeIPCs',
      // Tech
      'developTech',
      // Risk cards
      'tradeRiskCards',
      'tradeSpecificCards',
      // Rocket attacks
      'fireRocket',
      // Placement UI methods
      'selectUnitToPlace',
      'confirmPlacement',
      'cancelPlacement',
      // Air landings
      'applyAirLandings'
    ];

    for (const methodName of methodsToWrap) {
      if (typeof gameState[methodName] === 'function') {
        const original = gameState[methodName].bind(gameState);

        gameState[methodName] = (...args) => {
          // Check if multiplayer and not active player
          if (gameState.isMultiplayer && this.syncManager) {
            const userId = this.syncManager.userId;
            // AI authority = host, or the failover client when the host is offline
            const hasAIAuthority = this.syncManager.hasAIAuthority();
            const currentPlayer = gameState.currentPlayer;
            // Use live oderId comparison instead of the cached isActivePlayer flag.
            // The cached flag lags by the push debounce + network round-trip, creating
            // a window where the previous active player can act on the new player's turn.
            const isActive = currentPlayer?.oderId === userId;

            console.log(`[Guard] ${methodName}: isActive=${isActive}, aiAuthority=${hasAIAuthority}, currentPlayer=${currentPlayer?.name} (oderId=${currentPlayer?.oderId}), myUserId=${userId}`);

            if (!isActive && !hasAIAuthority) {
              console.warn(`[Guard] BLOCKED ${methodName} - not your turn`);
              return { success: false, error: 'Not your turn' };
            }
            // AI authority may act for AI players only — never for another human
            if (!isActive && hasAIAuthority && !currentPlayer?.isAI) {
              console.warn(`[Guard] BLOCKED ${methodName} - AI authority but current player is not AI`);
              return { success: false, error: 'Not your turn' };
            }
          }
          return original(...args);
        };

        this.wrappedMethods.push({ gameState, methodName, original });
      }
    }
  }

  // Restore original methods (useful for cleanup)
  unwrap() {
    for (const { gameState, methodName, original } of this.wrappedMethods) {
      gameState[methodName] = original;
    }
    this.wrappedMethods = [];
  }

  // Check if an action is allowed
  isActionAllowed(gameState) {
    if (!gameState.isMultiplayer) return true;
    if (!this.syncManager) return true;
    // Live check (same as wrapGameState) — the cached flag can lag turn changes
    return gameState.currentPlayer?.oderId === this.syncManager.userId;
  }

  // Get a user-friendly message for blocked actions
  getBlockedMessage() {
    return "It's not your turn. Please wait for the current player to finish.";
  }
}

// Factory function
export function createMultiplayerGuard(syncManager) {
  return new MultiplayerGuard(syncManager);
}
