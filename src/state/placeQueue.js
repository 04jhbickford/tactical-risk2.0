// Initial-deploy / mobilize queue math. One tap = one row, ±1.
// Commit happens only on Deploy — the queue is not game state.

export function queuedCount(queue = {}) {
  return Object.values(queue).reduce((sum, q) => sum + (Number(q) || 0), 0);
}

export function applyPlaceQueueDelta({
  queue = {},
  unitType,
  delta = 0,
  available = 0,
  slotsRemaining = 0,
} = {}) {
  const nextQueue = { ...queue };
  if (!unitType) return nextQueue;
  const current = Number(queue[unitType]) || 0;
  const others = queuedCount(queue) - current;
  const maxForRow = Math.min(
    Math.max(0, Number(available) || 0),
    Math.max(0, (Number(slotsRemaining) || 0) - others),
  );
  const next = Math.max(0, Math.min(maxForRow, current + Number(delta)));
  nextQueue[unitType] = next;
  return nextQueue;
}

// + at the round cap must no-op. It must not decrement another staged type.
export function canAddToPlaceQueue({
  queue = {},
  unitType,
  available = 0,
  slotsRemaining = 0,
} = {}) {
  const current = Number(queue[unitType]) || 0;
  const next = applyPlaceQueueDelta({
    queue, unitType, delta: 1, available, slotsRemaining,
  });
  return (Number(next[unitType]) || 0) > current;
}

// Staging (+ / Max) does not need a legal tile. Deploy still does (B29).
export function canStagePlaceQueue(args = {}) {
  return canAddToPlaceQueue(args);
}

// Pool lookup must survive TacticalBomber vs tacticalBomber (B29).
export function quantityAvailableForType(unitsToPlace = [], unitType) {
  if (!unitType || !Array.isArray(unitsToPlace)) return 0;
  const want = String(unitType);
  const exact = unitsToPlace.find((u) => u?.type === want);
  if (exact) return Number(exact.quantity) || 0;
  const lower = want.toLowerCase();
  const fuzzy = unitsToPlace.find((u) => String(u?.type || '').toLowerCase() === lower);
  return Number(fuzzy?.quantity) || 0;
}

export function expandPlaceQueue(queue = {}) {
  const out = [];
  for (const [type, qty] of Object.entries(queue || {})) {
    const n = Number(qty) || 0;
    for (let i = 0; i < n; i++) out.push(type);
  }
  return out;
}

// Max fills THIS row only, up to remaining slots this round (not other types).
export function applyPlaceQueueMax({
  queue = {},
  unitType,
  available = 0,
  slotsRemaining = 0,
} = {}) {
  return applyPlaceQueueDelta({
    queue,
    unitType,
    delta: Number.POSITIVE_INFINITY,
    available,
    slotsRemaining,
  });
}

// DEPLOYED resets only when the seat (or placement wave) changes.
// Same seat + remote 0/missing is a stale snapshot — keep the local 1/6 (B28).
export function shouldResetDeployedThisRound({
  prevPlayerId,
  nextPlayerId,
  remotePlacedThisRound,
  localPlacedThisRound,
  prevPlacementRound,
  nextPlacementRound,
} = {}) {
  if (prevPlayerId && nextPlayerId && prevPlayerId !== nextPlayerId) return true;
  if (
    prevPlacementRound != null
    && nextPlacementRound != null
    && Number(nextPlacementRound) > Number(prevPlacementRound)
  ) {
    return true;
  }
  return false;
}

export function resolveDeployedThisRoundAfterLoad({
  prevPlayerId,
  nextPlayerId,
  remotePlacedThisRound,
  localPlacedThisRound = 0,
  prevPlacementRound,
  nextPlacementRound,
  localPlacedOwnerId = null,
} = {}) {
  const remoteNum = remotePlacedThisRound == null
    ? 0
    : Math.max(0, Number(remotePlacedThisRound) || 0);
  const localNum = Math.max(0, Number(localPlacedThisRound) || 0);
  if (shouldResetDeployedThisRound({
    prevPlayerId,
    nextPlayerId,
    remotePlacedThisRound,
    localPlacedThisRound,
    prevPlacementRound,
    nextPlacementRound,
  })) {
    return remoteNum;
  }
  // B35: a spectated 6/6 belongs to the previous seat. Do not keep it
  // when YOUR TURN arrives (even if currentPlayer was already flipped).
  if (localPlacedOwnerId && nextPlayerId && localPlacedOwnerId !== nextPlayerId) {
    return remoteNum;
  }
  return Math.max(localNum, remoteNum);
}

// DEPLOYED is units on the map this round. Max / + only change the queue.
export function deployedThisRoundDisplay(placedThisRound) {
  return Math.max(0, Number(placedThisRound) || 0);
}

// James lock: 6/6 this round + 1 still in the pool is not a contradiction.
// Never label that as "Remaining to deploy: 1" next to Deployed 6/6.
export function placementBudgetCopy({
  deployedThisRound = 0,
  limit = 6,
  poolRemaining = 0,
} = {}) {
  const deployed = deployedThisRoundDisplay(deployedThisRound);
  const cap = Math.max(1, Number(limit) || 6);
  const pool = Math.max(0, Number(poolRemaining) || 0);
  const roundFull = deployed >= cap;
  const leftoverAfterCap = roundFull && pool > 0;
  return {
    deployedLabel: 'Deployed this round',
    deployedText: `${deployed}/${cap}`,
    remainingLabel: leftoverAfterCap ? 'Still in your pool' : 'Remaining in your pool',
    remainingText: leftoverAfterCap
      ? `${pool} next round`
      : `${pool} unit${pool === 1 ? '' : 's'}`,
    remainingHint: leftoverAfterCap
      ? `Round cap is ${cap}. ${pool} unit${pool === 1 ? '' : 's'} wait for your next placement turn.`
      : null,
    leftoverAfterCap,
  };
}

// Keep the staged queue when Deploy places 0 (invalid tile / empty batch)
// so the next tap is not a no-op (B24).
export function queueAfterDeployAttempt({ queueBefore = {}, placed = 0 } = {}) {
  if (Number(placed) > 0) return {};
  return { ...(queueBefore || {}) };
}
