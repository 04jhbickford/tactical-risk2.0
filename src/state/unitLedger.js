// Unit and IPC ledger helpers. Additive `ledgerId` on a stack is optional.
// Old saves omit it and still load. Ship `id` stays the cargo identity.

let seq = 0;

export function resetLedgerIdSeq(n = 0) {
  seq = Number(n) || 0;
}

// A loaded save already has ids. New mints continue past the highest suffix
// so infantry_1 is not issued twice.
export function syncLedgerIdSeq(units) {
  let max = 0;
  const note = (id) => {
    const match = String(id || '').match(/_(\d+)$/);
    if (match) max = Math.max(max, Number(match[1]));
  };
  for (const list of Object.values(units || {})) {
    if (!Array.isArray(list)) continue;
    for (const unit of list) {
      if (!unit || typeof unit !== 'object') continue;
      note(unit.ledgerId);
      if (Array.isArray(unit.alsoIds)) unit.alsoIds.forEach(note);
    }
  }
  if (max > seq) seq = max;
}

export function mintLedgerId(prefix = 'u') {
  seq += 1;
  const stem = String(prefix || 'u').replace(/[^A-Za-z0-9_]/g, '').slice(0, 24) || 'u';
  return `${stem}_${seq}`;
}

export function ensureLedgerIds(units, mint = mintLedgerId) {
  if (!units || typeof units !== 'object') return units;
  for (const list of Object.values(units)) {
    if (!Array.isArray(list)) continue;
    for (const unit of list) {
      if (!unit || typeof unit !== 'object') continue;
      if (!unit.ledgerId) unit.ledgerId = mint(unit.type || 'u');
      if (!Array.isArray(unit.alsoIds)) unit.alsoIds = [];
    }
  }
  return units;
}

export function absorbLedgerIds(survivor, absorbed) {
  if (!survivor || !absorbed || survivor === absorbed) return;
  if (!survivor.ledgerId && absorbed.ledgerId) survivor.ledgerId = absorbed.ledgerId;
  if (!Array.isArray(survivor.alsoIds)) survivor.alsoIds = [];
  const extra = [];
  if (absorbed.ledgerId && absorbed.ledgerId !== survivor.ledgerId) extra.push(absorbed.ledgerId);
  if (Array.isArray(absorbed.alsoIds)) extra.push(...absorbed.alsoIds);
  for (const id of extra) {
    if (id && id !== survivor.ledgerId && !survivor.alsoIds.includes(id)) survivor.alsoIds.push(id);
  }
}

export function unitIdentityIds(unit) {
  if (!unit) return [];
  const ids = [];
  if (unit.ledgerId) ids.push(unit.ledgerId);
  if (unit.id && unit.id !== unit.ledgerId) ids.push(String(unit.id));
  if (Array.isArray(unit.alsoIds)) {
    for (const id of unit.alsoIds) {
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

function pushRow(rows, unit, territory) {
  const quantity = Number(unit?.quantity) || 0;
  if (!unit || quantity <= 0) return;
  const ids = unitIdentityIds(unit);
  rows.push({
    id: unit.ledgerId || unit.id || ids[0] || null,
    ids: ids.length ? ids : (unit.ledgerId ? [unit.ledgerId] : []),
    type: unit.type || 'unit',
    owner: unit.owner || null,
    territory,
    quantity,
  });
}

export function indexUnits(units) {
  const rows = [];
  for (const [territory, list] of Object.entries(units || {})) {
    if (!Array.isArray(list)) continue;
    for (const unit of list) pushRow(rows, unit, territory);
  }
  return rows;
}

// Pending air is still on the board for the ledger. A legal retreat parks
// it here; a deleted stack does not appear.
export function indexBoard(gameState) {
  const rows = indexUnits(gameState?.units);
  for (const entry of gameState?.pendingAirLandings || []) {
    const territory = `pending:${entry?.originTerritory || 'air'}`;
    for (const unit of entry?.units || []) pushRow(rows, unit, territory);
  }
  return rows;
}

function rowCopy(row, quantity, extra = {}) {
  return {
    id: row.id,
    type: row.type,
    owner: row.owner,
    territory: row.territory,
    quantity,
    ...extra,
  };
}

export function diffUnitIndex(before, after) {
  const beforeById = new Map();
  for (const row of before || []) {
    for (const id of row.ids?.length ? row.ids : (row.id ? [row.id] : [])) {
      if (id && !beforeById.has(id)) beforeById.set(id, row);
    }
  }
  const afterById = new Map();
  for (const row of after || []) {
    for (const id of row.ids?.length ? row.ids : (row.id ? [row.id] : [])) {
      if (id && !afterById.has(id)) afterById.set(id, row);
    }
  }
  const created = [];
  const destroyed = [];
  const moved = [];
  const seen = new Set();
  for (const [id, row] of afterById) {
    seen.add(id);
    const prev = beforeById.get(id);
    if (!prev) {
      created.push(rowCopy(row, row.quantity));
      continue;
    }
    if (prev.territory !== row.territory) {
      moved.push({
        id,
        type: row.type,
        owner: row.owner,
        from: prev.territory,
        to: row.territory,
        quantity: row.quantity,
      });
    }
    const delta = row.quantity - prev.quantity;
    if (delta > 0) created.push(rowCopy(row, delta));
    if (delta < 0) destroyed.push(rowCopy(row, -delta, { territory: prev.territory }));
  }
  for (const [id, row] of beforeById) {
    if (seen.has(id)) continue;
    destroyed.push(rowCopy(row, row.quantity));
  }
  return { created, destroyed, moved };
}

export function ipcMapFromState(gameState) {
  const out = {};
  for (const player of gameState?.players || []) {
    if (!player?.id) continue;
    const raw = gameState.playerState?.[player.id]?.ipcs;
    out[player.id] = Math.max(0, Math.floor(Number(raw) || 0));
  }
  return out;
}

export function totalUnitQuantity(units) {
  let n = 0;
  for (const list of Object.values(units || {})) {
    if (!Array.isArray(list)) continue;
    for (const unit of list) n += Number(unit?.quantity) || 0;
  }
  return n;
}

export function collectUnitIds(units, pendingAir = []) {
  const ids = new Set();
  const absorb = (unit) => {
    for (const id of unitIdentityIds(unit)) ids.add(id);
  };
  for (const list of Object.values(units || {})) {
    if (!Array.isArray(list)) continue;
    for (const unit of list) {
      if ((Number(unit?.quantity) || 0) > 0) absorb(unit);
    }
  }
  for (const entry of pendingAir || []) {
    for (const unit of entry?.units || []) {
      if ((Number(unit?.quantity) || 0) > 0) absorb(unit);
    }
  }
  return ids;
}
