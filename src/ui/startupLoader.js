// Module-side API for the paint-first #startup-loader in index.html.
// The loader itself is inline HTML/CSS/JS so it paints before this module.

export const STARTUP_LOADER_ID = 'startup-loader';
export const STARTUP_RECOVERY_MS = 16000;
// lastMatch resume / auth / tile fetches must not pin the branded loader.
export const STARTUP_AUTH_TIMEOUT_MS = 6000;
export const STARTUP_MAP_LOAD_TIMEOUT_MS = 10000;
export const STARTUP_RESUME_TIMEOUT_MS = 8000;
export const STARTUP_TILE_TIMEOUT_MS = 4000;

export function getStartupLoaderApi(win = globalThis) {
  return win?.__trStartupLoader || null;
}

export function reportStartupStatus(status, progress, win = globalThis) {
  const api = getStartupLoaderApi(win);
  if (typeof api?.setStatus === 'function') {
    api.setStatus(status, progress);
    return true;
  }
  const statusEl = win?.document?.getElementById?.('startup-loader-status');
  if (statusEl && status) statusEl.textContent = status;
  const fill = win?.document?.getElementById?.('startup-loader-fill');
  if (fill && Number.isFinite(Number(progress))) {
    fill.style.width = `${Math.max(0, Math.min(100, Number(progress)))}%`;
  }
  return !!(statusEl || fill);
}

export function reportStartupError(message, win = globalThis) {
  const api = getStartupLoaderApi(win);
  if (typeof api?.showError === 'function') {
    api.showError(message);
    return true;
  }
  const recover = win?.document?.getElementById?.('startup-loader-recover');
  const statusEl = win?.document?.getElementById?.('startup-loader-status');
  if (statusEl) statusEl.textContent = message || 'Could not start Tactical Risk.';
  if (recover) recover.hidden = false;
  return !!recover;
}

export function dismissStartupLoader(win = globalThis) {
  const api = getStartupLoaderApi(win);
  if (typeof api?.dismiss === 'function') {
    api.dismiss();
    return true;
  }
  const el = win?.document?.getElementById?.(STARTUP_LOADER_ID);
  if (!el) return false;
  el.classList.add('is-done');
  el.setAttribute('hidden', '');
  el.setAttribute('aria-hidden', 'true');
  return true;
}

export function shouldShowStartupRecovery({
  elapsedMs,
  recoveryMs = STARTUP_RECOVERY_MS,
} = {}) {
  return Number(elapsedMs) >= Number(recoveryMs);
}

// A remembered last match must not hold the loader across map tiles +
// Firebase restore. Paint reconnect / home, then resume in a budget.
export function shouldHoldLoaderForLastMatchResume() {
  return false;
}

export function resolveStartupAfterHang({
  lastMatch = null,
  resumed = false,
} = {}) {
  if (resumed) return 'game';
  if (lastMatch?.gameId || lastMatch?.lobbyCode) return 'reconnect';
  return 'home';
}

export function startupSavesAreSafeCopy() {
  return 'Local saves and in-progress games stay on this device.';
}
