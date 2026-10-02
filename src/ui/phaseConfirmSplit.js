// Bottom bar: the large control only advances the phase. A smaller
// confirm appears only when that action is ready, and it never advances.

export const PHASE_ADVANCE_ACTIONS = ['next-phase', 'finish-placement'];

export const CONTEXT_CONFIRM_ACTIONS = [
  'confirm-move',
  'confirm-placement',
  'confirm-mobilize',
  'confirm-purchase',
  'confirm-air-landing',
  'place-capital',
  'roll-tech',
];

export function isPhaseAdvanceAction(action) {
  return PHASE_ADVANCE_ACTIONS.includes(action);
}

export function isContextConfirmAction(action) {
  return CONTEXT_CONFIRM_ACTIONS.includes(action);
}

// Phone pins the blue confirm (or the lone End phase) to the screen edge.
// Desktop keeps Continue and End phase in the right pane. End phase is
// rendered after Continue, so it sits at the bottom of that pane.
export function bottomActionEdgeClass({ mobile = false, role = 'advance', hasConfirm = false } = {}) {
  if (!mobile) return '';
  if (role === 'confirm' || !hasConfirm) return 'pp-confirm-edge';
  return '';
}

// Roll N carried stays in the tech panel. Phone still offers it as the
// bottom confirm. Desktop does not duplicate it as a long blue bar.
export function shouldOfferBottomTechRoll(mobile) {
  return !!mobile;
}

function confirmIsAvailable(confirm) {
  if (!confirm || confirm.disabled || confirm.selectUnits) return false;
  if (isPhaseAdvanceAction(confirm.action)) return false;
  return true;
}

// Green is always a phase advance. A caller that stuffs a confirm action
// into the advance slot still gets next-phase. Blue is omitted until the
// contextual confirm is enabled.
export function resolvePhaseConfirmSplit({ confirm = null, advance = null } = {}) {
  const blue = confirmIsAvailable(confirm)
    ? { ...confirm, role: 'confirm' }
    : null;

  if (!advance) return { confirm: blue, advance: null };

  const greenAction = isPhaseAdvanceAction(advance.action) ? advance.action : 'next-phase';
  return {
    confirm: blue,
    advance: {
      ...advance,
      action: greenAction,
      role: 'advance',
    },
  };
}
