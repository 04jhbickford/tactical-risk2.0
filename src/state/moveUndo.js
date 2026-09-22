// Addressable combat-move history. No gameState import (undoPolicy and
// gameState both call this — keep the edge one-way).

// A later move continues an earlier one when it leaves the earlier destination
// with the same unit type or the same ship. Undoing the earlier row reverts
// that chain newest-first so units land back on the original hex.
export function moveContinues(later, earlier) {
  if (!later || !earlier) return false;
  if (later.player && earlier.player && later.player !== earlier.player) return false;
  if (!later.from || later.from !== earlier.to) return false;
  const types = new Set((earlier.units || []).map((u) => u?.type).filter(Boolean));
  const laterTypes = (later.units || []).map((u) => u?.type).filter(Boolean);
  if (types.size && laterTypes.some((t) => types.has(t))) return true;
  const ships = new Set(earlier.shipIds || []);
  if ((later.shipIds || []).some((id) => ships.has(id))) return true;
  if (!types.size && !(earlier.shipIds || []).length && !laterTypes.length && !(later.shipIds || []).length) {
    return true;
  }
  return false;
}

// Descending indexes: the chosen row plus every later move that chains off it.
export function cascadeUndoIndexes(history, index) {
  const list = Array.isArray(history) ? history : [];
  const start = Number(index);
  if (!Number.isInteger(start) || start < 0 || start >= list.length) return [];
  const picked = new Set([start]);
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = start + 1; i < list.length; i++) {
      if (picked.has(i)) continue;
      for (const j of picked) {
        if (i > j && moveContinues(list[i], list[j])) {
          picked.add(i);
          grew = true;
          break;
        }
      }
    }
  }
  return [...picked].sort((a, b) => b - a);
}
