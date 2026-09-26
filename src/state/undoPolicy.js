// Undo is the default for place / deploy / purchase / move.
// Battles (combat resolve) and an irreversible pass (Done / next player)
// are not undoable. Does not change map or combat math.

import { GAME_PHASES, TURN_PHASES } from './gameState.js';
import { cascadeUndoIndexes, moveContinues } from './moveUndo.js';

export { cascadeUndoIndexes, moveContinues };

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

export function canUndoMoveAt({
  index = -1,
  turnPhase = null,
  moveHistoryLength = 0,
  undoLockMoveCount = 0,
} = {}) {
  if (!canUndoLastMove({ turnPhase, moveHistoryLength, undoLockMoveCount })) return false;
  const i = Number(index);
  if (!Number.isInteger(i) || i < 0 || i >= Number(moveHistoryLength)) return false;
  return i >= Number(undoLockMoveCount || 0);
}

export function listAddressableMoveRows(moveHistory, {
  undoLockMoveCount = 0,
  turnPhase = null,
} = {}) {
  const history = Array.isArray(moveHistory) ? moveHistory : [];
  const rows = [];
  for (let i = history.length - 1; i >= 0; i--) {
    const move = history[i];
    if (!move) continue;
    rows.push({
      id: move.id || `idx-${i}`,
      index: i,
      move,
      canUndo: canUndoMoveAt({
        index: i,
        turnPhase,
        moveHistoryLength: history.length,
        undoLockMoveCount,
      }),
    });
  }
  return rows;
}

export function formatRecentMove(move) {
  if (!move || typeof move !== 'object') return '';

  const units = Array.isArray(move.units) ? move.units : [];
  const unitStr = units
    .filter(u => u && typeof u.type === 'string' && u.type.length > 0)
    .map(u => {
      const qty = Number(u.quantity);
      const n = Number.isFinite(qty) && qty > 0 ? qty : 1;
      return `${n}${u.type.charAt(0)}`;
    })
    .join(',');

  const from = typeof move.from === 'string' ? move.from : '';
  const to = typeof move.to === 'string' ? move.to : '';

  if (unitStr && from && to) return `${unitStr}: ${from} → ${to}`;
  if (unitStr) return unitStr;

  if (Array.isArray(move.shipIds) && move.shipIds.length > 0 && from && to) {
    const n = move.shipIds.length;
    return `${n} ship${n === 1 ? '' : 's'}: ${from} → ${to}`;
  }

  if (from && to) return `${from} → ${to}`;
  return '';
}

export function resolveUndoAction({
  phase = null,
  turnPhase = null,
  canUndoPlacement = false,
  canUndoCapital = false,
  canUndoMove = false,
  canUndoPurchase = false,
  canUndoMobilize = false,
  canUndoAirLanding = false,
} = {}) {
  if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.COMBAT) {
    // Combat dice/resolve stays locked. Post-combat air land is undoable
    // (9.20.26.06) — Classic chrome used to hide Undo for the whole COMBAT phase.
    if (canUndoAirLanding) {
      return { show: true, action: 'undo-air-landing', reason: null };
    }
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

// Labeled action-bar Undo. Placement, purchase, and mobilize keep their
// existing controls. Movement and combat air-landing are the bar cases.
export function resolveMovementUndoBar({
  phase = null,
  turnPhase = null,
  moveHistory = [],
  undoLockMoveCount = 0,
  airLandingCount = 0,
} = {}) {
  if (phase !== GAME_PHASES.PLAYING) {
    return { show: false, count: 0, action: null };
  }
  if (turnPhase === TURN_PHASES.COMBAT_MOVE || turnPhase === TURN_PHASES.NON_COMBAT_MOVE) {
    const count = listAddressableMoveRows(moveHistory, { undoLockMoveCount, turnPhase })
      .filter((row) => row.canUndo).length;
    if (count <= 0) return { show: false, count: 0, action: null };
    return { show: true, count, action: 'undo-move' };
  }
  if (turnPhase === TURN_PHASES.COMBAT) {
    const count = Number(airLandingCount) || 0;
    if (count <= 0) return { show: false, count: 0, action: null };
    return { show: true, count, action: 'undo-air-landing' };
  }
  return { show: false, count: 0, action: null };
}

export function formatUndoBarLabel(count) {
  const n = Number(count);
  return `Undo (${Number.isFinite(n) && n > 0 ? n : 0})`;
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
  canUndoAirLanding = false,
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
    canUndoAirLanding,
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
