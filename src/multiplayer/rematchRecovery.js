// After push_exhausted: board must match the last confirmed server doc,
// the optimistic waiting lock drops, and we must not loop empty rematch
// / duplicate combat toasts.

export const PUSH_EXHAUSTED_TOAST_MIN_MS = 4000;

export function shouldShowPushExhaustedNotice({
  lastShownAt = 0,
  now = Date.now(),
  minIntervalMs = PUSH_EXHAUSTED_TOAST_MIN_MS,
} = {}) {
  if (!lastShownAt) return true;
  return (Number(now) - Number(lastShownAt)) >= Number(minIntervalMs);
}

export function resolveWaitingLockAfterExhaust() {
  return false;
}

// Only rematch when combat is still the live phase AND the queue head
// still has an enemy. Empty / already-resolved heads must not reopen.
export function shouldRematchCombatAfterExhaust({
  turnPhase = null,
  queueHasEnemy = false,
} = {}) {
  return turnPhase === 'combat' && !!queueHasEnemy;
}
