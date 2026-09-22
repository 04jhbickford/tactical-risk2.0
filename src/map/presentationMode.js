// Unified product shell (post dual-path). Classic Canvas + mobile chrome is
// the only player-facing path. Experimental (`three`) deep links redirect here.
// threeSolo* modules remain in-tree for history / conservative cleanup — they
// are not booted from main.js after V2.81.57-unified.1.

export const UX_STORAGE_KEY = 'tacticalRisk_uxMode';
export const UX_CLASSIC = 'classic';
export const UX_THREE = 'three';
/** @deprecated Label kept for any leftover copy; picker is gone. */
export const UX_LABEL_EXPERIMENTAL = 'Experimental UX';

const ON = new Set(['1', 'true', 'yes', 'three', 'new', 'newux']);
const CLASSIC = new Set(['0', 'false', 'no', 'classic', 'canvas', 'off']);

function paramsOf(search = '') {
  const q = String(search || '');
  return new URLSearchParams(q.startsWith('?') ? q : (q ? `?${q}` : ''));
}

export function clearUxMode() {
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(UX_STORAGE_KEY);
  } catch {
    /* private mode */
  }
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(UX_STORAGE_KEY);
  } catch {
    /* private mode */
  }
  return UX_CLASSIC;
}

export function persistUxMode(_mode) {
  // Unified: never sticky-persist Experimental.
  return clearUxMode();
}

/** Canonical URL for the unified shell — strips ux/three/solo Experimental aliases. */
export function applyUxQuery(_mode, href = typeof location !== 'undefined' ? location.href : 'http://localhost/') {
  const url = new URL(href, 'http://localhost/');
  url.searchParams.delete('ux');
  url.searchParams.delete('three');
  url.searchParams.delete('solo');
  return url.toString();
}

/** @deprecated Picker removed in unified.1 — returns empty so callers paint nothing. */
export function lobbyInterfaceChoices(_active = UX_CLASSIC) {
  return { classic: null, experimental: null };
}

export function navigateUxMode(_mode) {
  clearUxMode();
  if (typeof location === 'undefined') return UX_CLASSIC;
  const dest = applyUxQuery(UX_CLASSIC, location.href);
  if (dest !== location.href) location.assign(dest);
  else location.reload();
  return UX_CLASSIC;
}

export function isPocketPreviewRequested(search = typeof location !== 'undefined' ? location.search : '') {
  const params = paramsOf(search);
  const pocket = String(params.get('pocket') || '').toLowerCase();
  const max = String(params.get('max') || '').toLowerCase();
  const stress = String(params.get('stress') || '').toLowerCase();
  const demo = String(params.get('demo') || '').toLowerCase();
  return ON.has(pocket) || ON.has(max) || ON.has(stress) || demo === 'max' || demo === 'fat' || demo === 'big';
}

/**
 * Unified resolver: always Classic. Experimental query aliases still parse as
 * "requested three" only so boot can strip them via redirectUxAliasesIfNeeded.
 */
export function resolveUxMode(search = typeof location !== 'undefined' ? location.search : '') {
  const params = paramsOf(search);
  const ux = String(params.get('ux') || '').toLowerCase();
  const three = String(params.get('three') || '').toLowerCase();
  // Ignore leftover Classic/Experimental sticky storage.
  clearUxMode();
  if (ON.has(ux) || ON.has(three) || CLASSIC.has(ux)) {
    // Deep links exist — product is unified Classic either way.
    return UX_CLASSIC;
  }
  return UX_CLASSIC;
}

export function isThreeUx(search = typeof location !== 'undefined' ? location.search : '') {
  return false;
}

/** If URL still carries Experimental aliases, rewrite to clean unified URL. */
export function redirectUxAliasesIfNeeded(href = typeof location !== 'undefined' ? location.href : '') {
  if (typeof location === 'undefined') return false;
  const url = new URL(href || location.href, location.origin);
  const ux = String(url.searchParams.get('ux') || '').toLowerCase();
  const three = String(url.searchParams.get('three') || '').toLowerCase();
  const solo = url.searchParams.has('solo');
  const dirty = ON.has(ux) || CLASSIC.has(ux) || ON.has(three) || solo;
  if (!dirty) return false;
  const clean = applyUxQuery(UX_CLASSIC, url.toString());
  if (clean === location.href) return false;
  location.replace(clean);
  return true;
}
