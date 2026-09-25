// In-app confirm. In-app browsers (Discord, some iOS web views) block or
// auto-cancel window.confirm, so Resign / Save & Exit never ran.
// Phone: bottom sheet, 44px targets, above the home indicator.
// Desktop: compact centered dialog. Esc cancels, Enter confirms.

import { isMobileShell } from './mobileShell.js';

export function confirmChoice({
  message = '',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
} = {}) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc?.body || typeof doc.createElement !== 'function') {
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    const phone = isMobileShell();
    const root = doc.createElement('div');
    root.className = `tr-confirm ${phone ? 'tr-confirm--sheet' : 'tr-confirm--dialog'}`;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', confirmLabel);

    const backdrop = doc.createElement('div');
    backdrop.className = 'tr-confirm-backdrop';

    const panel = doc.createElement('div');
    panel.className = 'tr-confirm-panel';

    const msg = doc.createElement('p');
    msg.className = 'tr-confirm-message';
    msg.textContent = String(message ?? '');

    const actions = doc.createElement('div');
    actions.className = 'tr-confirm-actions';

    const cancelBtn = doc.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'tr-confirm-btn tr-confirm-cancel';
    cancelBtn.setAttribute('data-confirm', 'cancel');
    cancelBtn.textContent = cancelLabel;

    const okBtn = doc.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'tr-confirm-btn tr-confirm-ok';
    okBtn.setAttribute('data-confirm', 'ok');
    okBtn.textContent = confirmLabel;

    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    panel.appendChild(msg);
    panel.appendChild(actions);
    root.appendChild(backdrop);
    root.appendChild(panel);
    doc.body.appendChild(root);

    const previouslyFocused = doc.activeElement;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      doc.removeEventListener('keydown', onKey);
      root.remove();
      if (previouslyFocused && previouslyFocused.focus) {
        try { previouslyFocused.focus(); } catch { /* node is gone */ }
      }
      resolve(!!value);
    };
    const focusables = () => [cancelBtn, okBtn];
    const onKey = (event) => {
      const key = event?.key;
      if (key === 'Escape') {
        event.preventDefault?.();
        finish(false);
        return;
      }
      if (key === 'Enter') {
        event.preventDefault?.();
        finish(true);
        return;
      }
      if (key !== 'Tab') return;
      const items = focusables();
      const current = items.indexOf(doc.activeElement);
      event.preventDefault?.();
      const next = event.shiftKey
        ? items[(current - 1 + items.length) % items.length]
        : items[(current + 1) % items.length];
      next?.focus();
    };
    doc.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', () => finish(false));
    cancelBtn.addEventListener('click', () => finish(false));
    okBtn.addEventListener('click', () => finish(true));
    okBtn.focus();
  });
}
