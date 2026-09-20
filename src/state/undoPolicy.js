// Undo is the default for place / deploy / purchase / move.
// Battles (combat resolve) and an irreversible pass (Done / next player)
// are not undoable. Does not change map or combat math.

import { GAME_PHASES, TURN_PHASES } from './gameState.js';

export function canUndoLastMove({
  turnPhase = null,
  moveHistoryLength = 0,
  undoLockMoveCount = 0,
} = {}) {
  if (turnPhase !== TURN_PHASES.COMBAT_MOVE && turnPhase !== TURN_PHASES.NON_COMBAT_MOVE) {
    return false;
  }
  return Number(moveHistoryLength) > Number(undoLockMoveCount || 0);
}

export function resolveUndoAction({
  phase = null,
  turnPhase = null,
  canUndoPlacement = false,
  canUndoCapital = false,
  canUndoMove = false,
  canUndoPurchase = false,
  canUndoMobilize = false,
} = {}) {
  if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.COMBAT) {
    return { show: false, action: null, reason: 'combat' };
  }
  if (phase === GAME_PHASES.UNIT_PLACEMENT && canUndoPlacement) {
    return { show: true, action: 'undo-placement', reason: null };
  }
  if (phase === GAME_PHASES.CAPITAL_PLACEMENT && canUndoCapital) {
    return { show: true, action: 'undo-capital', reason: null };
  }
  if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.PURCHASE && canUndoPurchase) {
    return { show: true, action: 'undo-purchase', reason: null };
  }
  if (phase === GAME_PHASES.PLAYING
    && (turnPhase === TURN_PHASES.COMBAT_MOVE || turnPhase === TURN_PHASES.NON_COMBAT_MOVE)) {
    if (!canUndoMove) {
      return { show: false, action: null, reason: null };
    }
    return { show: true, action: 'undo-move', reason: null };
  }
  if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.MOBILIZE && canUndoMobilize) {
    return { show: true, action: 'undo-mobilize', reason: null };
  }
  return { show: false, action: null, reason: null };
}

export function shouldShowUndoChrome({
  mobile = false,
  phase = null,
  turnPhase = null,
  canUndoPlacement = false,
  canUndoCapital = false,
  canUndoMove = false,
  canUndoPurchase = false,
  canUndoMobilize = false,
} = {}) {
  void mobile;
  return resolveUndoAction({
    phase,
    turnPhase,
    canUndoPlacement,
    canUndoCapital,
    canUndoMove,
    canUndoPurchase,
    canUndoMobilize,
  });
}

const PASS_LOCKS = new Set(['finish-placement']);
const UNDO_LOCKS = new Set(['undo-placement', 'undo-capital']);
const QUEUE_LOCKS = new Set(['place-queue', 'place-queue-max']);

// Undo must not pass. A map / overlay click must not Done (B33 / B34).
export function shouldPassPlacementTurn({
  action = null,
  lockAction = null,
  fromOverlayCommit = false,
  mapClick = false,
} = {}) {
  if (action !== 'finish-placement') return false;
  if (fromOverlayCommit || mapClick) return false;
  if (UNDO_LOCKS.has(lockAction) || QUEUE_LOCKS.has(lockAction)) return false;
  if (lockAction && !PASS_LOCKS.has(lockAction)) return false;
  return true;
}

export function shouldApplyUndoAction({
  action = null,
  lockAction = null,
} = {}) {
  if (action !== 'undo-placement' && action !== 'undo-capital') return false;
  if (lockAction && PASS_LOCKS.has(lockAction)) return false;
  return true;
}
