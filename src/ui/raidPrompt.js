// Raid-or-attack prompt and the raid resolution sheet.
// Reuses the Resign / NCM confirm chrome so no new colours are introduced.
// Phone: bottom sheet. Desktop and tablet: compact dialog.

import { isMobileShell } from './mobileShell.js';
import { RAID_PROMPT } from '../state/strategicBombing.js';

export { RAID_PROMPT };

function mountConfirm({ label, message, lines = [], buttons, dataset = {} }) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc?.body || typeof doc.createElement !== 'function') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const phone = isMobileShell();
    const root = doc.createElement('div');
    root.className = `tr-confirm ${phone ? 'tr-confirm--sheet' : 'tr-confirm--dialog'}`;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', label || message || 'Strategic bombing');
    for (const [key, value] of Object.entries(dataset)) {
      root.dataset[key] = String(value);
    }

    const backdrop = doc.createElement('div');
    backdrop.className = 'tr-confirm-backdrop';

    const panel = doc.createElement('div');
    panel.className = 'tr-confirm-panel';

    const msg = doc.createElement('p');
    msg.className = 'tr-confirm-message';
    msg.textContent = message;

    const list = doc.createElement('ul');
    list.className = 'tr-confirm-list';
    for (const line of lines || []) {
      const item = doc.createElement('li');
      item.textContent = line;
      list.appendChild(item);
    }

    const actions = doc.createElement('div');
    actions.className = 'tr-confirm-actions';
    const buttonEls = (buttons || []).map((spec) => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = `tr-confirm-btn ${spec.className || ''}`.trim();
      btn.dataset.confirm = spec.value;
      btn.textContent = spec.label;
      actions.appendChild(btn);
      return btn;
    });

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
      resolve(value);
    };
    const onKey = (event) => {
      const key = event?.key;
      if (key === 'Escape') {
        event.preventDefault?.();
        finish(null);
        return;
      }
      if (key !== 'Tab') return;
      const items = buttonEls;
      if (!items.length) return;
      const current = items.indexOf(doc.activeElement);
      event.preventDefault?.();
      const next = event.shiftKey
        ? items[(current - 1 + items.length) % items.length]
        : items[(current + 1) % items.length];
      next?.focus();
    };
    doc.addEventListener('keydown', onKey);
    backdrop.addEventListener('click', () => finish(null));
    buttonEls.forEach((btn, index) => {
      btn.addEventListener('click', () => finish(buttons[index].value));
    });
    buttonEls[0]?.focus();
  });
}

// 'attack' | 'raid' | null (cancel, move does not happen).
export function confirmRaidOrAttack({ territory = '' } = {}) {
  const where = territory ? ` ${territory}` : '';
  return mountConfirm({
    label: RAID_PROMPT,
    message: `${RAID_PROMPT}${where ? ` (${where.trim()})` : ''}`,
    dataset: { raidPrompt: '1', territory: territory || '' },
    buttons: [
      { value: 'attack', label: 'Normal attack', className: 'tr-confirm-cancel' },
      { value: 'raid', label: 'Strategic bombing raid', className: 'tr-confirm-ok' },
    ],
  });
}

export function formatRaidResult(result) {
  if (!result) return 'The raid did not happen.';
  const hits = Number(result.hits) || 0;
  const applied = Number(result.applied) || 0;
  const excess = Number(result.excess) || 0;
  const lines = [];
  lines.push(hits === 1 ? 'Factory AA shot down 1 bomber.' : `Factory AA shot down ${hits} bombers.`);
  lines.push(applied === 1 ? '1 damage on the factory.' : `${applied} damage on the factory.`);
  if (excess > 0) lines.push(`${excess} damage was over the cap and was not applied.`);
  const next = Number(result.next) || 0;
  const place = result.placeable;
  if (place != null) lines.push(`The factory can place ${place}. Damage is now ${next}.`);
  return lines;
}

export function presentStrategicRaid({ territory = '', onRoll } = {}) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc?.body) {
    const result = typeof onRoll === 'function' ? onRoll() : null;
    return Promise.resolve(result);
  }
  return new Promise((resolve) => {
    const phone = isMobileShell();
    const root = doc.createElement('div');
    root.className = `tr-confirm ${phone ? 'tr-confirm--sheet' : 'tr-confirm--dialog'}`;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.dataset.raidResolve = '1';
    root.dataset.territory = territory || '';

    const backdrop = doc.createElement('div');
    backdrop.className = 'tr-confirm-backdrop';
    const panel = doc.createElement('div');
    panel.className = 'tr-confirm-panel';
    const msg = doc.createElement('p');
    msg.className = 'tr-confirm-message';
    msg.textContent = `Strategic bombing raid on ${territory || 'the factory'}. Factory AA fires first, once per bomber, hitting on a 1.`;
    const list = doc.createElement('ul');
    list.className = 'tr-confirm-list';
    const actions = doc.createElement('div');
    actions.className = 'tr-confirm-actions';
    const rollBtn = doc.createElement('button');
    rollBtn.type = 'button';
    rollBtn.className = 'tr-confirm-btn tr-confirm-ok';
    rollBtn.textContent = 'Roll raid';
    actions.appendChild(rollBtn);
    panel.appendChild(msg);
    panel.appendChild(list);
    panel.appendChild(actions);
    root.appendChild(backdrop);
    root.appendChild(panel);
    doc.body.appendChild(root);
    rollBtn.focus();

    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      root.remove();
      resolve(value);
    };
    rollBtn.addEventListener('click', () => {
      const result = typeof onRoll === 'function' ? onRoll() : null;
      list.innerHTML = '';
      for (const line of formatRaidResult(result)) {
        const item = doc.createElement('li');
        item.textContent = line;
        list.appendChild(item);
      }
      rollBtn.textContent = 'Continue';
      rollBtn.onclick = () => finish(result);
    });
  });
}

export async function moveUnitsWithRaidPrompt(gameState, from, to, units, unitDefs, options = {}) {
  if (!gameState?.moveUnits) return { success: false, error: 'No game' };
  let result = gameState.moveUnits(from, to, units, unitDefs, options);
  if (!result?.needsRaidChoice) return result;
  const choice = await confirmRaidOrAttack({ territory: to });
  if (choice !== 'attack' && choice !== 'raid') {
    return { success: false, cancelled: true };
  }
  return gameState.moveUnits(from, to, units, unitDefs, {
    ...options,
    raid: choice === 'raid',
  });
}
