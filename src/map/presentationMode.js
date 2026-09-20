// Durable Classic | New UX fork. Query wins, then sessionStorage, else Classic.
// Classic at / with no flag is unchanged. Do not invent a second rules engine.

export const UX_STORAGE_KEY = 'tacticalRisk_uxMode';
export const UX_CLASSIC = 'classic';
export const UX_THREE = 'three';

const ON = new Set(['1', 'true', 'yes', 'three', 'new', 'newux']);
const CLASSIC = new Set(['0', 'false', 'no', 'classic', 'canvas', 'off']);

function paramsOf(search = '') {
  const q = String(search || '');
  return new URLSearchParams(q.startsWith('?') ? q : (q ? `?${q}` : ''));
}

function readSession() {
  try {
    if (typeof sessionStorage === 'undefined') return null;
    const raw = String(sessionStorage.getItem(UX_STORAGE_KEY) || '').toLowerCase();
    if (raw === UX_THREE) return UX_THREE;
    if (raw === UX_CLASSIC) return UX_CLASSIC;
  } catch {
    /* private mode */
  }
  return null;
}

export function persistUxMode(mode) {
  const next = mode === UX_THREE ? UX_THREE : UX_CLASSIC;
  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(UX_STORAGE_KEY, next);
  } catch {
    /* private mode */
  }
  return next;
}

export function applyUxQuery(mode, href = typeof location !== 'undefined' ? location.href : 'http://localhost/') {
  const url = new URL(href, 'http://localhost/');
  if (mode === UX_THREE) {
    url.searchParams.set('ux', UX_THREE);
    url.searchParams.delete('three');
  } else {
    url.searchParams.set('ux', UX_CLASSIC);
    url.searchParams.delete('three');
    url.searchParams.delete('solo');
  }
  return url.toString();
}

export function navigateUxMode(mode) {
  const next = persistUxMode(mode);
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
    persistUxMode(UX_CLASSIC);
    return UX_CLASSIC;
  }
  if (ON.has(ux) || ON.has(three)) {
    persistUxMode(UX_THREE);
    return UX_THREE;
  }

  const stored = readSession();
  if (stored) return stored;
  return UX_CLASSIC;
}

export function isThreeUx(search) {
  return resolveUxMode(search) === UX_THREE;
}
