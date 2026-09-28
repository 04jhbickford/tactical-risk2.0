// Human prompt before Non-Combat Move ends. The AI never opens this.
// Phone: bottom sheet. Desktop and tablet: compact dialog.
// Reuses the Resign confirm chrome so no new colours are introduced.

import { isMobileShell } from './mobileShell.js';

export function confirmNcmAirWarning({
  title = '',
  lines = [],
  count = 0,
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
    root.setAttribute('aria-label', title || 'Aircraft landing');
    root.dataset.ncmAirWarning = '1';
    root.dataset.count = String(count);

    const backdrop = doc.createElement('div');
    backdrop.className = 'tr-confirm-backdrop';

    const panel = doc.createElement('div');
    panel.className = 'tr-confirm-panel';

    const msg = doc.createElement('p');
    msg.className = 'tr-confirm-message';
    msg.textContent = title;

    const list = doc.createElement('ul');
    list.className = 'tr-confirm-list';
    for (const line of lines || []) {
      const item = doc.createElement('li');
      item.textContent = line;
      list.appendChild(item);
    }

    const actions = doc.createElement('div');
    actions.className = 'tr-confirm-actions';

    const backBtn = doc.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'tr-confirm-btn tr-confirm-cancel';
    backBtn.dataset.confirm = 'cancel';
    backBtn.textContent = 'Go back';

    const endBtn = doc.createElement('button');
    endBtn.type = 'button';
    endBtn.className = 'tr-confirm-btn tr-confirm-ok';
    endBtn.dataset.confirm = 'ok';
    endBtn.textContent = 'End anyway';

    actions.appendChild(backBtn);
    actions.appendChild(endBtn);
    panel.appendChild(msg);
    if ((lines || []).length) panel.appendChild(list);
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
    const focusables = () => [backBtn, endBtn];
    const onKey = (event) => {
      const key = event?.key;
      if (key === 'Escape') {
        event.preventDefault?.();
        finish(false);
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
    backBtn.addEventListener('click', () => finish(false));
    endBtn.addEventListener('click', () => finish(true));
    backBtn.focus();
  });
}
