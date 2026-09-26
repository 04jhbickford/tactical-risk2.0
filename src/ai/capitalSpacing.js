// AI capital spacing. Humans still place wherever they click.
// When any owned territory is at least two graph steps from every
// other capital, the AI chooses inside that subset. Otherwise the
// pool is the full owned list, in the same order as today.

export function graphDistance(from, to, neighbors) {
  if (from === to) return 0;
  if (typeof neighbors !== 'function') return Infinity;
  const queue = [[from, 0]];
  const seen = new Set([from]);
  while (queue.length > 0) {
    const [node, dist] = queue.shift();
    const nexts = neighbors(node) || [];
    for (const next of nexts) {
      if (seen.has(next)) continue;
      if (next === to) return dist + 1;
      seen.add(next);
      queue.push([next, dist + 1]);
    }
  }
  return Infinity;
}

export function capitalChoicePool(owned, existingCapitals, neighbors) {
  const ownedList = Array.isArray(owned) ? owned.slice() : [];
  const capitals = (existingCapitals || []).filter((name) => typeof name === 'string' && name);
  if (ownedList.length === 0 || capitals.length === 0) return ownedList;
  const spaced = ownedList.filter((territory) => {
    const nearest = capitals.reduce((min, capital) => {
      return Math.min(min, graphDistance(territory, capital, neighbors));
    }, Infinity);
    return nearest >= 2;
  });
  return spaced.length > 0 ? spaced : ownedList;
}

// Same difficulty rules as the previous capital chooser, applied to pool.
// Hard: most connections, ties keep the earlier territory.
// Easy: random index in the pool.
// Medium: most friendly neighbors, ties keep the first, all-zero keeps pool[0].
export function pickCapitalFromPool(pool, difficulty, {
  connectionCount = () => 0,
  friendlyNeighborCount = () => 0,
  random = Math.random,
} = {}) {
  const list = Array.isArray(pool) ? pool : [];
  if (list.length === 0) return null;
  if (difficulty === 'hard') {
    return list.reduce((best, territory) => (
      connectionCount(territory) > connectionCount(best) ? territory : best
    ));
  }
  if (difficulty === 'easy') {
    const index = Math.floor(Number(random()) * list.length);
    return list[Math.max(0, Math.min(list.length - 1, index))] ?? list[0];
  }
  let best = list[0];
  let bestScore = 0;
  for (const territory of list) {
    const score = friendlyNeighborCount(territory);
    if (score > bestScore) {
      bestScore = score;
      best = territory;
    }
  }
  return best;
}
