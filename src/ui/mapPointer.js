// Desktop map gestures during combat move and non-combat move.
// Left-click selects a territory. Right-click confirms the selected units'
// move. A unit drag starts only when the pointer goes down on a unit that
// is already selected; everything else pans the map.

const MOVE_PHASES = new Set(['combat_move', 'non_combat_move']);

export function isMovementTurnPhase(turnPhase) {
  return MOVE_PHASES.has(turnPhase);
}

export function selectionIncludesHitUnit(selectedUnits, unitHit) {
  if (!unitHit?.unitType) return false;
  const type = unitHit.unitType;
  const picked = selectedUnits || {};
  if ((Number(picked[type]) || 0) > 0) return true;
  return Object.entries(picked).some(([key, qty]) => {
    if (!(Number(qty) > 0)) return false;
    if (key === type) return true;
    if (key.startsWith('aircraft:') && key.endsWith(`:${type}`)) return true;
    if (key.startsWith('cargo:') && key.endsWith(`:${type}`)) return true;
    if (key.startsWith('ship:') && (unitHit.unitDef?.isSea || unitHit.isFlying === false)) {
      return unitHit.unitType === type;
    }
    return false;
  });
}

export function pointerStartsUnitDrag({
  button = 0,
  turnPhase = null,
  isAI = false,
  unitHit = null,
  selectedUnits = null,
  currentPlayerId = null,
} = {}) {
  if (button !== 0 || isAI) return false;
  if (!isMovementTurnPhase(turnPhase)) return false;
  if (!unitHit || !currentPlayerId || unitHit.owner !== currentPlayerId) return false;
  return selectionIncludesHitUnit(selectedUnits, unitHit);
}

export function rightClickConfirmsMove({
  button = 2,
  turnPhase = null,
  hasSelection = false,
  destLegal = false,
} = {}) {
  if (button !== 2) return false;
  if (!isMovementTurnPhase(turnPhase)) return false;
  return !!hasSelection && !!destLegal;
}
