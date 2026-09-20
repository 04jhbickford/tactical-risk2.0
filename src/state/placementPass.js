// Pure placement-pass helpers. No Firebase. Used by GameState and harnesses
// so Done / rejoin / leftover-unit rules stay one source of truth.

// Firestore / JSON can turn [{type,quantity}] into {0:{...},1:{...}}
// or {infantry:9,transport:1}. Empty land + "Remaining 1" is that shape,
// not "Russians have no land IPC."
export function coerceUnitsToPlaceRows(rows) {
  if (Array.isArray(rows)) {
    return rows.map((u) => ({
      type: u?.type,
      quantity: Number(u?.quantity) || 0,
    })).filter((u) => !!u.type);
  }
  if (!rows || typeof rows !== 'object') return [];
  const keys = Object.keys(rows);
  if (keys.length === 0) return [];
  const numeric = keys.every((k) => /^\d+$/.test(k));
  if (numeric) {
    return coerceUnitsToPlaceRows(
      keys.sort((a, b) => Number(a) - Number(b)).map((k) => rows[k]),
    );
  }
  return keys.map((type) => {
    const val = rows[type];
    if (val && typeof val === 'object') {
      return {
        type: val.type || type,
        quantity: Number(val.quantity) || 0,
      };
    }
    return { type, quantity: Number(val) || 0 };
  }).filter((u) => !!u.type);
}

export function resolvePlayerDeployPool(unitsToPlace, playerId, aliases = []) {
  const map = unitsToPlace && typeof unitsToPlace === 'object' ? unitsToPlace : {};
  const keys = [playerId, ...aliases].filter(Boolean);
  for (const key of keys) {
    if (map[key] != null) return coerceUnitsToPlaceRows(map[key]);
  }
  const want = String(playerId || '').toLowerCase();
  if (want) {
    for (const [key, rows] of Object.entries(map)) {
      if (String(key).toLowerCase() === want) return coerceUnitsToPlaceRows(rows);
    }
  }
  return [];
}

export const STARTING_LAND_AIR_TYPES = new Set([
  'infantry', 'armour', 'artillery', 'fighter', 'bomber', 'tacticalBomber', 'aaGun',
]);

export function poolHasLandOrAir(pool, unitDefs) {
  return coerceUnitsToPlaceRows(pool).some((u) => {
    if (!(u.quantity > 0)) return false;
    const def = unitDefs?.[u.type];
    if (def?.isLand || def?.isAir) return true;
    if (def?.isBuilding && u.type !== 'factory') return true;
    if (!def && STARTING_LAND_AIR_TYPES.has(u.type)) return true;
    return false;
  });
}

// First placement wave, 0 deployed, and THIS seat has no land/air left
// in the pool — restore the starting kit. Later waves may legitimately
// be ships-only. A finished earlier seat's empty pool is not a deserialize
// miss: using the current seat's 0-placed flag to restock everyone is
// what rewound turn order after a refresh (A3/A4).
export function shouldRestoreStartingDeployPool({
  phase,
  placementRound = 1,
  placedThisRound = 0,
  pool,
  unitDefs,
  isCurrentSeat = true,
} = {}) {
  if (isCurrentSeat === false) return false;
  if (String(phase) !== 'unit_placement') return false;
  if (Number(placedThisRound) > 0) return false;
  if (Number(placementRound) > 1) return false;
  return !poolHasLandOrAir(pool, unitDefs);
}

export function categorizeUnitsToPlace(unitsToPlace, unitDefs) {
  const known = knownUnitsToPlace(unitsToPlace, unitDefs);
  return {
    land: known.filter((u) => !!unitDefs?.[u.type]?.isLand),
    air: known.filter((u) => !!unitDefs?.[u.type]?.isAir),
    naval: known.filter((u) => !!unitDefs?.[u.type]?.isSea),
  };
}

export function knownUnitsToPlace(unitsToPlace, unitDefs) {
  return coerceUnitsToPlaceRows(unitsToPlace).filter(u => {
    if (!u || !(u.quantity > 0)) return false;
    if (!unitDefs) return true;
    return !!unitDefs[u.type];
  });
}

export function countKnownUnitsToPlace(unitsToPlace, unitDefs) {
  return knownUnitsToPlace(unitsToPlace, unitDefs)
    .reduce((sum, u) => sum + (Number(u.quantity) || 0), 0);
}

export function onlyNavalRemaining(unitsToPlace, unitDefs) {
  const known = knownUnitsToPlace(unitsToPlace, unitDefs);
  if (known.length === 0) return false;
  return known.every(u => !!unitDefs?.[u.type]?.isSea);
}

// Done is legal when the round cap is hit, nothing known remains,
// nothing remaining can legally be placed (ghost / landlocked leftover),
// or leftover ships are skipped from an inland/non-sea selection (B19).
export function canFinishPlacementRound({
  placedThisRound = 0,
  limit = 6,
  remainingKnown = 0,
  hasPlaceable = false,
  onlyNavalRemaining: onlyNaval = false,
  allowNavalSkip = false,
} = {}) {
  return Number(placedThisRound) >= Number(limit)
    || Number(remainingKnown) <= 0
    || !hasPlaceable
    || (!!allowNavalSkip && !!onlyNaval);
}

// After a committed Done, the next actor is the next non-skipped player
// who still has a known placeable unit. If nobody does, play begins.
export function resolveNextPlacementSeat({
  currentPlayerIndex = 0,
  playerCount = 0,
  placementRound = 0,
  canPlaceAt,
} = {}) {
  const n = Number(playerCount) || 0;
  if (n <= 0) {
    return { currentPlayerIndex: 0, placementRound, phase: 'playing' };
  }
  let index = Number(currentPlayerIndex) || 0;
  let round = Number(placementRound) || 0;
  let found = false;
  for (let i = 0; i < n; i++) {
    index += 1;
    if (index >= n) {
      index = 0;
      round += 1;
    }
    if (typeof canPlaceAt === 'function' ? canPlaceAt(index) : true) {
      found = true;
      break;
    }
  }
  if (!found) {
    return { currentPlayerIndex: index, placementRound: round, phase: 'playing' };
  }
  return { currentPlayerIndex: index, placementRound: round, phase: 'unit_placement' };
}

// Rejoin: remote JSON is authority. A local-only pass that never wrote
// must not win. A committed pass (newer remote seat) must win.
export function pickAuthoritativePlacementSnapshot({
  remote,
  local,
  remoteVersion = 0,
  localVersion = 0,
} = {}) {
  if (!remote) return local || null;
  if (!local) return remote;
  if (Number(remoteVersion) !== Number(localVersion)) {
    return Number(remoteVersion) > Number(localVersion) ? remote : local;
  }
  return remote;
}

// Point-in-time copy so a Done/place write cannot share a live
// unitsToPlace reference that another client never sees decrement.
export function cloneUnitsToPlace(unitsToPlace) {
  const src = unitsToPlace && typeof unitsToPlace === 'object' ? unitsToPlace : {};
  const out = {};
  for (const [playerId, rows] of Object.entries(src)) {
    out[playerId] = coerceUnitsToPlaceRows(rows);
  }
  return out;
}

export function remainingDeployByPlayer(unitsToPlace, playerIds, unitDefs) {
  const ids = Array.isArray(playerIds) ? playerIds : Object.keys(unitsToPlace || {});
  const out = {};
  for (const id of ids) {
    out[id] = countKnownUnitsToPlace(unitsToPlace?.[id], unitDefs);
  }
  return out;
}

// Guest must apply the remote doc when the seat changes even if
// stateVersion did not bump — otherwise currentPlayer flips and
// unitsToPlace stays at the starting 25.
export function shouldApplyRemoteGameState({
  remoteVersion = 0,
  localVersion = 0,
  remoteCurrentPlayerId = null,
  localCurrentPlayerId = null,
  force = false,
} = {}) {
  if (force) return true;
  if (Number(remoteVersion) > Number(localVersion)) return true;
  if (remoteCurrentPlayerId && remoteCurrentPlayerId !== localCurrentPlayerId) {
    return true;
  }
  return false;
}

// Sync debug / push labels must advertise game phase, never leftover turnPhase.
export function syncPushPhaseLabel(phase, _turnPhase) {
  void _turnPhase;
  return phase || null;
}
