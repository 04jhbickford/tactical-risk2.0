// Place every pending purchase the selected factory or sea zone can take.
// Ships follow the chosen sea zone, or the only sea adjacent to a factory.
// Several seas and no choice skips ships and says so.

export function adjacentMobilizeSeas(gameState, territoryName, playerId) {
  const territory = gameState?.territoryByName?.[territoryName];
  if (!territory || territory.isWater) return [];
  const valid = gameState._getValidNavalPlacementZones?.(playerId);
  const seas = [];
  for (const conn of territory.connections || []) {
    const other = gameState.territoryByName?.[conn];
    if (!other?.isWater) continue;
    if (valid && typeof valid.has === 'function' && !valid.has(conn)) continue;
    seas.push(conn);
  }
  return seas;
}

function pendingFor(gameState, playerId, pred) {
  return (gameState?.getPendingPurchases?.() || []).filter((item) => (
    item
    && item.owner === playerId
    && (Number(item.quantity) || 0) > 0
    && pred(item)
  ));
}

function factoriesWithRoom(gameState, playerId) {
  const start = gameState?.factoriesAtTurnStart;
  const names = start instanceof Set ? [...start] : [];
  return names.filter((name) => {
    if (gameState.getOwner?.(name) !== playerId) return false;
    return (gameState.getFactoryPlacementLimit?.(name, playerId) || 0) > 0;
  });
}

function seaZonesWithRoom(gameState, playerId) {
  const zones = [];
  for (const name of factoriesWithRoom(gameState, playerId)) {
    const territory = gameState.territoryByName?.[name];
    for (const conn of territory?.connections || []) {
      if (!gameState.territoryByName?.[conn]?.isWater) continue;
      if (!zones.includes(conn)) zones.push(conn);
    }
  }
  return zones;
}

// One legal land territory prompts "deploy all units to X?". The same for
// one legal sea. Two or more of either kind stay silent for that kind.
// Both questions share one message when both apply.
export function deployAllPrompt(gameState, unitDefs) {
  const player = gameState?.currentPlayer;
  if (!player || gameState.turnPhase !== 'mobilize') return null;
  const landPending = pendingFor(gameState, player.id, (item) => unitDefs?.[item.type]?.isLand);
  const seaPending = pendingFor(gameState, player.id, (item) => unitDefs?.[item.type]?.isSea);
  const lines = [];
  let land = null;
  let sea = null;
  if (landPending.length) {
    const factories = factoriesWithRoom(gameState, player.id);
    if (factories.length === 1) {
      land = factories[0];
      lines.push(`deploy all units to ${land}?`);
    }
  }
  if (seaPending.length) {
    const zones = seaZonesWithRoom(gameState, player.id);
    if (zones.length === 1) {
      sea = zones[0];
      lines.push(`deploy all units to ${sea}?`);
    }
  }
  if (!lines.length) return null;
  return { lines, message: lines.join('\n'), land, sea };
}

export function applyDeployAllPrompt(gameState, unitDefs, plan) {
  if (!plan) return { placed: [] };
  const placed = [];
  if (plan.land) {
    const land = runMobilizeDeployAll(gameState, unitDefs, { territory: plan.land });
    placed.push(...(land.placed || []));
  }
  if (plan.sea) {
    const still = pendingFor(gameState, gameState.currentPlayer?.id, (item) => unitDefs?.[item.type]?.isSea);
    if (still.length) {
      const sea = runMobilizeDeployAll(gameState, unitDefs, { territory: plan.sea });
      placed.push(...(sea.placed || []));
    }
  }
  return { placed };
}

export function runMobilizeDeployAll(gameState, unitDefs, {
  territory,
  sourceFactory = null,
} = {}, { beforeFlush } = {}) {
  const player = gameState?.currentPlayer;
  const dest = gameState?.territoryByName?.[territory];
  const placed = [];
  const notes = [];
  if (!player || !dest) {
    const note = 'No territory selected';
    beforeFlush?.({ placed, note });
    return { placed, note };
  }

  const pending = (gameState.getPendingPurchases?.() || [])
    .filter((item) => item && item.owner === player.id && item.quantity > 0)
    .map((item) => ({ type: item.type, quantity: item.quantity }));

  const isWater = !!dest.isWater;
  let shipZone = isWater ? territory : null;
  const hasShips = pending.some((item) => unitDefs?.[item.type]?.isSea);
  if (!isWater && hasShips) {
    const seas = adjacentMobilizeSeas(gameState, territory, player.id);
    if (seas.length === 1) shipZone = seas[0];
    else if (seas.length === 0) notes.push('ships not placed (no adjacent sea zone)');
    else notes.push('ships not placed (choose a sea zone)');
  }

  gameState.pauseNotifications();
  try {
    for (const item of pending) {
      const def = unitDefs?.[item.type];
      let destName = null;
      if (def?.isSea) destName = shipZone;
      else if (def?.isAir && isWater) destName = territory;
      else if ((def?.isLand || def?.isAir || def?.isBuilding) && !isWater) destName = territory;
      if (!destName) {
        if (!def?.isSea) notes.push(`${item.quantity}x ${item.type} not placed`);
        continue;
      }
      const factory = (def?.isSea || (def?.isAir && isWater))
        ? (sourceFactory || (!isWater ? territory : null))
        : null;
      let count = 0;
      let lastError = '';
      for (let i = 0; i < item.quantity; i++) {
        const result = gameState.mobilizeUnit(item.type, destName, unitDefs, {
          sourceFactory: factory,
        });
        if (!result?.success) {
          lastError = result?.error || 'could not place';
          break;
        }
        count += 1;
      }
      if (count > 0) placed.push({ type: item.type, quantity: count, territory: destName });
      const left = item.quantity - count;
      if (left > 0) notes.push(`${left}x ${item.type} not placed (${lastError})`);
    }
  } finally {
    const note = notes.join('; ');
    beforeFlush?.({ placed, note });
    gameState.resumeNotifications({ flush: true });
    return { placed, note };
  }
}
