// Classic historical seats beyond the original five. Chinese and ANZAC
// exist only when they are actually seated. A five-power game keeps the
// setup.json owners. Pacific does not use this table.

export const CLASSIC_SEAT_ORDER = Object.freeze([
  'Russians',
  'Germans',
  'British',
  'Japanese',
  'Americans',
  'Chinese',
  'ANZAC',
]);

export const CLASSIC_EXTRA_SEATS = Object.freeze({
  Chinese: Object.freeze({
    from: 'Americans',
    lands: Object.freeze(['China']),
  }),
  ANZAC: Object.freeze({
    from: 'British',
    lands: Object.freeze(['Australia', 'New Zealand']),
  }),
});

export function orderClassicPlayers(selectedPlayers, turnOrder = CLASSIC_SEAT_ORDER) {
  const list = Array.isArray(selectedPlayers) ? selectedPlayers : [];
  const byId = new Map(list.map((player) => [player?.id, player]));
  const ordered = [];
  for (const id of turnOrder || []) {
    if (byId.has(id)) ordered.push(byId.get(id));
  }
  for (const player of list) {
    if (player && !ordered.includes(player)) ordered.push(player);
  }
  return ordered;
}

export function classicExtraLands(playerId) {
  return CLASSIC_EXTRA_SEATS[playerId]?.lands || null;
}

export function sumPrintedIpc(landNames, territories) {
  const byName = new Map((territories || []).map((territory) => [territory?.name, territory]));
  let sum = 0;
  for (const name of landNames || []) {
    sum += Number(byName.get(name)?.production) || 0;
  }
  return sum;
}

/** Printed IPC of the lands an extra power receives. Null for the original five. */
export function classicExtraStartingPUs(playerId, territories) {
  const lands = classicExtraLands(playerId);
  if (!lands) return null;
  return sumPrintedIpc(lands, territories);
}

/** Move only the listed lands, and only the units already on them. */
export function applyClassicSeatOwners(territoryState, units, seatedIds) {
  const seated = new Set(seatedIds || []);
  for (const [playerId, spec] of Object.entries(CLASSIC_EXTRA_SEATS)) {
    if (!seated.has(playerId)) continue;
    for (const territory of spec.lands) {
      const state = territoryState?.[territory];
      if (state && state.owner === spec.from) state.owner = playerId;
      const rows = units?.[territory];
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        if (row?.owner === spec.from) row.owner = playerId;
      }
    }
  }
}
