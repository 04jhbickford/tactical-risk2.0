// Firestore rejects `undefined` anywhere in a document. A single
// undefined field on the game-doc `state` blob throws the transaction,
// surfaces as "Connection hiccup", and on exhaust reloads the last
// confirmed doc — wiping an un-persisted combat capture.

export function omitUndefinedDeep(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => {
      const next = omitUndefinedDeep(item);
      return next === undefined ? null : next;
    });
  }
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (child === undefined) continue;
    const next = omitUndefinedDeep(child);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

export function findUndefinedPaths(value, prefix = '') {
  const paths = [];
  if (value === undefined) {
    paths.push(prefix || '(root)');
    return paths;
  }
  if (value === null || typeof value !== 'object') return paths;
  if (Array.isArray(value)) {
    value.forEach((item, i) => {
      paths.push(...findUndefinedPaths(item, `${prefix}[${i}]`));
    });
    return paths;
  }
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    paths.push(...findUndefinedPaths(child, path));
  }
  return paths;
}

// Board units written back from the combat overlay. Spread copies UI-only
// fields (fromCarrier, landingOptions) and any explicit undefined.
export function persistableUnit(unit, extras = {}) {
  if (!unit || !unit.type) return null;
  const out = {
    type: unit.type,
    quantity: Number(unit.quantity) || 0,
    owner: unit.owner ?? null,
  };
  if (extras.moved || unit.moved) out.moved = true;
  if (unit.movementUsed) out.movementUsed = unit.movementUsed;
  if (unit.id) out.id = unit.id;
  if (unit.damaged) out.damaged = true;
  if (unit.damagedCount) out.damagedCount = unit.damagedCount;
  if (Array.isArray(unit.aircraft)) {
    out.aircraft = unit.aircraft.map((craft) => ({
      type: craft.type,
      owner: craft.owner ?? null,
      ...(craft.moved ? { moved: true } : {}),
    }));
  }
  if (Array.isArray(unit.cargo)) {
    out.cargo = unit.cargo.map((item) => ({
      type: item.type,
      owner: item.owner ?? null,
    }));
  }
  return out;
}
