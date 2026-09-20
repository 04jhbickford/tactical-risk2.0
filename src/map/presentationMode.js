// Durable Classic | New UX fork.
// Queryless / cold load is always Classic Canvas (fail-closed).
// sessionStorage New UX is set only when the user clicks New UX.
// Reading a URL with no ux/three query clears session + local sticky keys.

export const UX_STORAGE_KEY = 'tacticalRisk_uxMode';
export const UX_CLASSIC = 'classic';
export const UX_THREE = 'three';
// Player-facing label. Mode key stays `three` so ?ux=three deep links work.
export const UX_LABEL_EXPERIMENTAL = 'Experimental UX';

const ON = new Set(['1', 'true', 'yes', 'three', 'new', 'newux']);
const CLASSIC = new Set(['0', 'false', 'no', 'classic', 'canvas', 'off']);

function paramsOf(search = '') {
  const q = String(search || '');
  return new URLSearchParams(q.startsWith('?') ? q : (q ? `?${q}` : ''));
}

function hasUxQuery(params) {
  return params.has('ux') || params.has('three');
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

export function persistUxMode(mode) {
  if (mode !== UX_THREE) return clearUxMode();
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(UX_STORAGE_KEY, UX_THREE);
  } catch {
    /* private mode */
  }
  return UX_THREE;
}

export function applyUxQuery(mode, href = typeof location !== 'undefined' ? location.href : 'http://localhost/') {
  const url = new URL(href, 'http://localhost/');
  if (mode === UX_THREE) {
    url.searchParams.set('ux', UX_THREE);
    url.searchParams.delete('three');
  } else {
    url.searchParams.delete('ux');
    url.searchParams.delete('three');
    url.searchParams.delete('solo');
  }
  return url.toString();
}

export function navigateUxMode(mode) {
  const next = mode === UX_THREE ? persistUxMode(UX_THREE) : clearUxMode();
  if (typeof location === 'undefined') return next;
  const dest = applyUxQuery(next, location.href);
  if (dest !== location.href) location.assign(dest);
  else location.reload();
  return next;
}

// Pocket demo only — never the lobby-driven New UX path.
export function isPocketPreviewRequested(search = typeof location !== 'undefined' ? location.search : '') {
  const params = paramsOf(search);
  const pocket = String(params.get('pocket') || '').toLowerCase();
  const max = String(params.get('max') || '').toLowerCase();
  const stress = String(params.get('stress') || '').toLowerCase();
  const demo = String(params.get('demo') || '').toLowerCase();
  return ON.has(pocket) || ON.has(max) || ON.has(stress) || demo === 'max' || demo === 'fat' || demo === 'big';
}

export function resolveUxMode(search = typeof location !== 'undefined' ? location.search : '') {
  const params = paramsOf(search);
  const ux = String(params.get('ux') || '').toLowerCase();
  const three = String(params.get('three') || '').toLowerCase();

  if (CLASSIC.has(ux)) {
    clearUxMode();
    return UX_CLASSIC;
  }
  if (ON.has(ux) || ON.has(three)) {
    // Query carries New UX. Do not persist — queryless must return Classic.
    return UX_THREE;
  }

  // Cold / queryless: Classic always. Visiting ?ux=three must not stick.
  if (!hasUxQuery(params)) clearUxMode();
  return UX_CLASSIC;
}

export function isThreeUx(search) {
  return resolveUxMode(search) === UX_THREE;
}
