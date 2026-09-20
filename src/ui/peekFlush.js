// One path: any phase or seat change clears peek land names, inspect
// hints, and an illegal Confirm (desktop + phone). A leftover Confirm
// after the flush is a looks-broken bar — James lock.

export function shouldFlushPeekOnPhaseOrSeatChange({
  prevPhase = null,
  nextPhase = null,
  prevTurnPhase = null,
  nextTurnPhase = null,
  prevSeatId = null,
  nextSeatId = null,
} = {}) {
  if (prevPhase == null && prevTurnPhase == null && prevSeatId == null) {
    return false;
  }
  return prevPhase !== nextPhase
    || prevTurnPhase !== nextTurnPhase
    || prevSeatId !== nextSeatId;
}

export const LOOKS_BROKEN_CONFIRM_COPY = 'That Confirm no longer applies — tap a land.';

export function flushPeekState({
  hadCapitalPeekName = false,
  capitalPeekStillLegal = false,
  hadDeployPeekName = false,
  hadSelectedTerritory = false,
} = {}) {
  const leftoverIllegalConfirm = !!(hadCapitalPeekName && !capitalPeekStillLegal);
  return {
    selectedTerritory: null,
    phoneCapitalLandName: null,
    phoneDeployLandName: null,
    inspectHint: null,
    looksBroken: leftoverIllegalConfirm || (!!hadSelectedTerritory && !capitalPeekStillLegal && hadCapitalPeekName),
    looksBrokenReason: leftoverIllegalConfirm ? LOOKS_BROKEN_CONFIRM_COPY : null,
    hadDeployPeekName: !!hadDeployPeekName,
  };
}

export function looksBrokenBarHtml(reason) {
  if (!reason) return '';
  return `<div class="pp-looks-broken-bar" role="status">${reason}</div>`;
}
