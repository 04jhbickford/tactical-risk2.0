// End Turn save failure. The banner is the Retry control main.js shows
// when commitTurnHandoff cannot push. Kept here so a test can render it
// without booting the map.

import { TURN_SAVE_FAILED_WARNING } from '../multiplayer/syncAuthority.js';

export function showTurnSaveWarning(message, onRetry) {
  let banner = document.getElementById('turn-save-warning');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'turn-save-warning';
    banner.setAttribute('role', 'alert');
    banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2100;background:#7f1d1d;color:#fff;padding:10px 16px;font-size:14px;display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;box-shadow:0 2px 8px rgba(0,0,0,0.4);';
    const label = document.createElement('span');
    label.className = 'turn-save-warning-text';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Retry';
    retry.style.cssText = 'background:#fff;color:#7f1d1d;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;min-height:44px;';
    banner.append(label, retry);
    document.body.appendChild(banner);
  }
  banner.querySelector('.turn-save-warning-text').textContent = message || TURN_SAVE_FAILED_WARNING;
  banner.querySelector('button').onclick = () => {
    if (typeof onRetry === 'function') onRetry();
  };
}

export function clearTurnSaveWarning() {
  document.getElementById('turn-save-warning')?.remove();
}
