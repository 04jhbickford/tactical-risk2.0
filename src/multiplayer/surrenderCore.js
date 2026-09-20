// Pure surrender transform — no Firebase imports, so it is usable from both
// the live client (surrender.js wraps it in a Firestore transaction) and the
// node-based robustness harness (tools/robustness-harness.mjs).
//
// The transform mirrors the live-session rules in gameState.js:
// - the player keeps their slot in players[] but is flagged `surrendered`
//   (nextTurn / finishPlacementRound / placeCapital skip surrendered players)
// - their territories become neutral and their capital stops counting for victory
// - their units are removed from the board (including carrier/transport cargo)
// - if it was their turn, the turn advances to the next non-surrendered player

const PHASE_PLAYING = 'playing';
const PHASE_UNIT_PLACEMENT = 'unit_placement';
const TURN_PHASE_TECH = 'develop_tech';

// Mutates the serialized state in place. Returns a summary:
// { changed, currentPlayerId, gameOver, humansRemain }
export function applySurrenderToState(state, oderId) {
  const result = { changed: false, currentPlayerId: null, gameOver: false, humansRemain: false };
  if (!state?.players) return result;

  const playerIndex = state.players.findIndex(p =>
    (oderId && p.oderId === oderId) || (oderId && p.id === oderId)
  );
  if (playerIndex === -1) return result;

  const player = state.players[playerIndex];
  if (player.surrendered) return result; // Already surrendered

  player.surrendered = true;
  result.changed = true;

  // Neutralize territories; a surrendered player's capital no longer counts
  // toward capital-victory thresholds
  const capital = state.playerState?.[player.id]?.capitalTerritory;
  for (const [territory, tState] of Object.entries(state.territoryState || {})) {
    if (tState.owner === player.id) {
      tState.owner = null;
      if (territory === capital) {
        tState.isCapital = false;
      }
    }
  }

  // Remove the player's units from the board, including aircraft on carriers
  // and cargo on transports owned by other players
  for (const [territory, units] of Object.entries(state.units || {})) {
    const remaining = units.filter(u => u.owner !== player.id);
    for (const unit of remaining) {
      if (unit.aircraft) {
        unit.aircraft = unit.aircraft.filter(a => a.owner !== player.id);
      }
      if (unit.cargo) {
        unit.cargo = unit.cargo.filter(c => c.owner !== player.id);
      }
    }
    state.units[territory] = remaining;
  }

  // Nothing left to deploy
  if (state.unitsToPlace) {
    state.unitsToPlace[player.id] = [];
  }
  // No pending purchases
  if (state.pendingPurchases) {
    state.pendingPurchases = state.pendingPurchases.filter(p => p.owner !== player.id);
  }

  const activePlayers = state.players.filter(p => !p.surrendered);
  result.humansRemain = activePlayers.some(p => !p.isAI);

  // Victory check: last non-surrendered player standing wins
  if (activePlayers.length === 1 && !state.gameOver) {
    state.gameOver = true;
    state.winner = activePlayers[0].name;
    state.winCondition = 'Last player standing — all others surrendered';
    result.gameOver = true;
  } else if (activePlayers.length === 0) {
    state.gameOver = true;
    result.gameOver = true;
  }

  // If it was the surrendering player's turn, advance to the next non-surrendered player
  if (state.currentPlayerIndex === playerIndex && !state.gameOver) {
    let idx = state.currentPlayerIndex;
    for (let i = 0; i < state.players.length; i++) {
      idx = (idx + 1) % state.players.length;
      const candidate = state.players[idx];
      if (candidate.surrendered) continue;
      // During deployment, prefer a player that still has units to place
      if (state.phase === PHASE_UNIT_PLACEMENT) {
        const toPlace = state.unitsToPlace?.[candidate.id] || [];
        if (!toPlace.some(u => u.quantity > 0)) continue;
      }
      break;
    }
    state.currentPlayerIndex = idx;

    if (state.phase === PHASE_UNIT_PLACEMENT) {
      // If nobody has units left to place, the deployment phase is over
      const anyoneCanPlace = state.players.some(p =>
        !p.surrendered && (state.unitsToPlace?.[p.id] || []).some(u => u.quantity > 0)
      );
      if (!anyoneCanPlace) {
        state.phase = PHASE_PLAYING;
        state.turnPhase = TURN_PHASE_TECH;
      }
      state.unitsPlacedThisRound = 0;
    } else if (state.phase === PHASE_PLAYING) {
      // Fresh turn for the next player
      state.turnPhase = TURN_PHASE_TECH;
      state.combatQueue = [];
    }

    // Force clients to recompute turn-start snapshots for the new current player
    delete state.friendlyTerritoriesAtTurnStart;
    delete state.factoriesAtTurnStart;
  }

  const currentPlayer = state.players[state.currentPlayerIndex];
  result.currentPlayerId = currentPlayer?.oderId || currentPlayer?.id || null;

  return result;
}

// All-resign / last seated human out: delete the Firestore game doc.
// SCHEMA 11 — uses surrendered. Bulk wipe of existing games is a
// separate product action, not this helper.
export function shouldDeleteGameAfterResign({ humansRemain = true } = {}) {
  return humansRemain === false;
}

export function resolveResignPlayerId({
  players = [],
  authUserId = null,
  currentPlayerId = null,
} = {}) {
  if (authUserId && players.some((p) => p?.oderId === authUserId || p?.id === authUserId)) {
    return authUserId;
  }
  const humans = (players || []).filter((p) => p && !p.isAI && !p.surrendered);
  return humans[0]?.oderId || humans[0]?.id || currentPlayerId || null;
}
