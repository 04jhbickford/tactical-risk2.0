// V2.81.57-unified.32 — green advances the phase; blue confirms the action.

import { GAME_VERSION } from '../src/version.js';
import {
  CONTEXT_CONFIRM_ACTIONS,
  resolvePhaseConfirmSplit,
} from '../src/ui/phaseConfirmSplit.js';

let failures = 0;
const check = (label, cond) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label);
  } else {
    console.log('ok  :', label);
  }
};

check('stamp is V2.81.57-unified.32', GAME_VERSION === 'V2.81.57-unified.32');

console.log('=== pending named move keeps blue confirm and green advance ===');
{
  const split = resolvePhaseConfirmSplit({
    confirm: {
      action: 'confirm-move',
      label: 'Confirm: Move to West Russia',
      disabled: false,
    },
    advance: {
      action: 'next-phase',
      label: 'End Phase · Combat Move',
      disabled: false,
    },
  });
  check('blue confirm is present', split.confirm?.action === 'confirm-move'
    && split.confirm.label === 'Confirm: Move to West Russia'
    && split.confirm.role === 'confirm');
  check('green action is phase advance only', split.advance?.action === 'next-phase'
    && split.advance.role === 'advance');
}

console.log('=== nothing pending is green phase advance only ===');
{
  const split = resolvePhaseConfirmSplit({
    confirm: null,
    advance: {
      action: 'next-phase',
      label: 'End Phase · Purchase',
      disabled: false,
    },
  });
  check('no confirm action', split.confirm == null);
  check('green phase advance only', split.advance?.action === 'next-phase');
}

console.log('=== green is never a contextual confirm ===');
{
  for (const action of CONTEXT_CONFIRM_ACTIONS) {
    const asAdvance = resolvePhaseConfirmSplit({
      confirm: null,
      advance: { action, label: action, disabled: false },
    });
    const beside = resolvePhaseConfirmSplit({
      confirm: { action, label: action, disabled: false },
      advance: { action: 'next-phase', label: 'End Phase', disabled: false },
    });
    check(`green rejects ${action}`, asAdvance.advance?.action === 'next-phase'
      && asAdvance.confirm == null
      && beside.advance?.action === 'next-phase'
      && beside.confirm?.action === action
      && beside.confirm?.role === 'confirm');
  }
  const placement = resolvePhaseConfirmSplit({
    confirm: { action: 'confirm-placement', label: 'Confirm: Deploy in France', disabled: false },
    advance: { action: 'finish-placement', label: 'Done - Next Player →', disabled: true },
  });
  check('deploy confirm stays blue and Done stays the advance',
    placement.confirm?.action === 'confirm-placement'
    && placement.advance?.action === 'finish-placement');
  const ghost = resolvePhaseConfirmSplit({
    confirm: { action: 'confirm-move', label: 'Confirm: Move to France', disabled: true, selectUnits: true },
    advance: { action: 'next-phase', label: 'End Phase · Combat Move', disabled: false },
  });
  check('a confirm that is not available stays off the bar', ghost.confirm == null
    && ghost.advance?.action === 'next-phase');
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll phase-confirm split checks passed');
