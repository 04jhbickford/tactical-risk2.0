// Surrender / leave-game support for Tactical Risk multiplayer
// Applies a surrender directly to a serialized game state (the `state` field of a
// Firestore game document), so a player can leave a game from the "My Games" list
// without loading the full game session.
//
// The transform mirrors the live-session rules in gameState.js:
// - the player keeps their slot in players[] but is flagged `surrendered`
//   (nextTurn / finishPlacementRound / placeCapital skip surrendered players)
// - their territories become neutral and their capital stops counting for victory
// - their units are removed from the board (including carrier/transport cargo)
// - if it was their turn, the turn advances to the next non-surrendered player

import {
  doc,
  runTransaction,
  deleteDoc,
  serverTimestamp,
  arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFirebaseDb } from './firebase.js';
// Pure transform lives in surrenderCore.js (no Firebase imports) so the node
// robustness harness can exercise the exact same logic. Re-exported here for
// existing importers.
import { applySurrenderToState, shouldDeleteGameAfterResign } from './surrenderCore.js';
import { rewriteLobbyHostAfterResign } from './hostHandoff.js';
export { applySurrenderToState, shouldDeleteGameAfterResign };

const DELETE_RETRY_ATTEMPTS = 3;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function deleteGameDocWithRetry(gameRef, { attempts = DELETE_RETRY_ATTEMPTS } = {}) {
  let lastError = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      await deleteDoc(gameRef);
      return { deleted: true };
    } catch (err) {
      lastError = err;
      if (i < attempts) await delay(150 * i);
    }
  }
  return { deleted: false, error: lastError?.message || String(lastError) };
}

export function isAllResignDeleteFailure(outcome) {
  return !!(outcome && outcome.success && outcome.shouldDelete && outcome.deleted !== true);
}

export async function retryDeleteFinishedGame(gameId) {
  const db = getFirebaseDb();
  if (!db || !gameId) return { success: false, deleted: false, error: 'Not connected', shouldDelete: true };
  const gameRef = doc(db, 'games', gameId);
  const result = await deleteGameDocWithRetry(gameRef);
  return {
    success: !!result.deleted,
    deleted: !!result.deleted,
    error: result.error,
    shouldDelete: true,
  };
}

// Surrender/leave a game from outside a live session (e.g. the My Games list).
// Uses a transaction so we never clobber a concurrent state push.
export async function leaveGame(gameId, userId) {
  const db = getFirebaseDb();
  if (!db) return { success: false, error: 'Not connected' };

  try {
    const gameRef = doc(db, 'games', gameId);

    const outcome = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(gameRef);
      if (!snapshot.exists()) {
        return { success: false, error: 'Game not found' };
      }

      const data = snapshot.data();

      // Game never initialized (still 'starting' with no state): just remove
      // the player from the roster so it drops off their list
      if (!data.state) {
        transaction.update(gameRef, {
          playerUserIds: arrayRemove(userId),
          updatedAt: serverTimestamp()
        });
        return { success: true, surrendered: false };
      }

      const state = data.state;
      const result = applySurrenderToState(state, userId);
      if (!result.changed) {
        // Not a player in the state (spectator?) — still remove from roster
        transaction.update(gameRef, {
          playerUserIds: arrayRemove(userId),
          updatedAt: serverTimestamp()
        });
        return { success: true, surrendered: false };
      }

      // If the game is over, or no human players remain (AI-only games
      // can't continue — the host ran the AI), finish the game
      const status = (result.gameOver || !result.humansRemain) ? 'finished' : (data.status || 'active');

      // If the leaving player was the host, rewrite lobbyData hostId + isHost
      // so live clients (no rejoin) pick up AI authority from the snapshot.
      const surrenderedIds = new Set(
        (state.players || []).filter(p => p.surrendered).map(p => p.oderId)
      );
      const lobbyData = rewriteLobbyHostAfterResign({
        lobbyData: data.lobbyData,
        leavingUserId: userId,
        surrenderedIds,
      });

      const deleteAfter = shouldDeleteGameAfterResign({ humansRemain: result.humansRemain });
      if (deleteAfter) {
        // Keep the resigning seat in playerUserIds so a follow-up delete
        // is authorized (rules: seated player + status finished).
        transaction.update(gameRef, {
          state,
          stateVersion: (data.stateVersion || 0) + 1,
          currentPlayerId: result.currentPlayerId,
          status: 'finished',
          lobbyData,
          updatedAt: serverTimestamp()
        });
        return { success: true, surrendered: true, gameFinished: true, shouldDelete: true };
      }

      transaction.update(gameRef, {
        state,
        stateVersion: (data.stateVersion || 0) + 1,
        currentPlayerId: result.currentPlayerId,
        status,
        lobbyData,
        playerUserIds: arrayRemove(userId),
        updatedAt: serverTimestamp()
      });

      return { success: true, surrendered: true, gameFinished: status === 'finished', shouldDelete: false };
    });

    if (outcome?.success && outcome.shouldDelete) {
      const deleted = await deleteGameDocWithRetry(gameRef);
      if (deleted.deleted) return { ...outcome, deleted: true };
      console.error('[Surrender] delete after all-resign failed:', deleted.error);
      return { ...outcome, deleted: false, error: deleted.error };
    }

    return outcome;
  } catch (error) {
    console.error('[Surrender] leaveGame failed:', error);
    return { success: false, error: error.message };
  }
}
