// Hybrid Three HUD hit isolation. Preview only.
// Classic click-through: a stepper / zoom tap must not select the land
// under the chrome (Congo / FEA under INF + at 390).
//
// Do NOT stopPropagation in capture on an ancestor. That eats the
// child's pointer before [data-step] can fire. Seal on bubble so
// children activate, then the surface keeps the event off the canvas.

import { isPointInPanelRect } from '../ui/panelClickLock.js';

export const CHROME_DOWN_EVENTS = ['pointerdown', 'touchstart', 'mousedown'];
export const CHROME_UP_EVENTS = ['pointerup', 'touchend', 'mouseup', 'click'];
export const CHROME_ALL_EVENTS = [...CHROME_DOWN_EVENTS, ...CHROME_UP_EVENTS];

export function sealChromeEvent(e, { prevent = true } = {}) {
  if (!e) return;
  if (typeof e.stopPropagation === 'function') e.stopPropagation();
  if (prevent && e.cancelable !== false && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }
}

export function isPointInAnyRect(clientX, clientY, rects = []) {
  return (Array.isArray(rects) ? rects : []).some(
    (rect) => isPointInPanelRect(clientX, clientY, rect),
  );
}

export function eventElement(e) {
  if (!e) return null;
  const path = typeof e.composedPath === 'function' ? e.composedPath() : null;
  if (path?.length) {
    const fromPath = path.find((n) => n && typeof n.closest === 'function');
    if (fromPath) return fromPath;
  }
  const t = e.target;
  if (t && typeof t.closest === 'function') return t;
  return t?.parentElement || null;
}

export function clientPointOf(e) {
  if (!e) return null;
  if (Number.isFinite(e.clientX) && Number.isFinite(e.clientY)) {
    return { x: e.clientX, y: e.clientY };
  }
  const t = e.changedTouches?.[0] || e.touches?.[0];
  if (t && Number.isFinite(t.clientX) && Number.isFinite(t.clientY)) {
    return { x: t.clientX, y: t.clientY };
  }
  return null;
}

export function rectFromElement(el) {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const r = el.getBoundingClientRect();
  if (!r || r.width <= 0 || r.height <= 0) return null;
  return {
    left: r.left,
    right: r.right,
    top: r.top,
    bottom: r.bottom,
  };
}

export function chromeHitRectsFrom(api = {}) {
  const els = [];
  const push = (el) => {
    if (!el || el.hidden) return;
    els.push(el);
  };
  push(api.zoom);
  push(api.l0);
  if (api.isSheetOpen?.() || api.sheet?.classList?.contains('is-open')) {
    push(api.sheet);
  }
  if (api.isLobbyOpen?.() || api.lobby?.classList?.contains('is-open')) {
    push(api.lobby);
  }
  if (api.isTutorialOpen?.() || api.tutorial?.classList?.contains('is-open')) {
    push(api.tutorial);
  }
  const peekOn = api.peek?.classList?.contains('is-on');
  const battleOn = api.battleEl?.classList?.contains('is-on');
  if (peekOn) push(api.peek);
  if (battleOn) push(api.battleEl);
  if (peekOn || battleOn) push(api.bottom);
  push(api.confirm);
  return els.map(rectFromElement).filter(Boolean);
}

export function shouldIgnoreMapHit({
  sheetOpen = false,
  lobbyOpen = false,
  tutorialOpen = false,
  battleOpen = false,
  targetInChrome = false,
  clientX,
  clientY,
  rects = [],
} = {}) {
  if (lobbyOpen) return true;
  if (tutorialOpen) return true;
  if (sheetOpen) return true;
  if (battleOpen) return true;
  if (targetInChrome) return true;
  return isPointInAnyRect(clientX, clientY, rects);
}

export function sealChromeControl(el, { prevent = true } = {}) {
  if (!el || el.dataset?.chromeSealed === '1') return el;
  if (el.dataset) el.dataset.chromeSealed = '1';
  for (const type of CHROME_ALL_EVENTS) {
    const isTouch = type === 'touchstart' || type === 'touchend';
    const doPrevent = prevent && (type === 'pointerdown' || type === 'touchstart' || type === 'click');
    // Non-passive touchstart on a scrollport (even without preventDefault)
    // makes iOS / Chrome-mobile wait and often never start a finger-pan.
    el.addEventListener(type, (e) => {
      if (!prevent && isTouch) {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        return;
      }
      sealChromeEvent(e, { prevent: doPrevent });
    }, { passive: !doPrevent });
  }
  return el;
}

// Map chrome: activate on pointerdown (touch-safe). Debounce swallows the
// trailing pointerup/click from the same gesture.
// Scrollable surfaces (lobby / tutorial): pass { prevent:false } and
// activate on click only. pointerdown + preventDefault on touchstart
// steal vertical finger-pan when the gesture starts on a seat / chip.
export function bindSealedActivate(root, selector, handler, { prevent = true } = {}) {
  if (!root || typeof handler !== 'function') return;
  let lastAt = 0;
  const fire = (e) => {
    const node = eventElement(e);
    const hit = selector ? node?.closest?.(selector) : root;
    if (!hit || hit.disabled) return;
    if (selector && root !== hit && !root.contains(hit)) return;
    const now = Date.now();
    if (now - lastAt < 280) return;
    lastAt = now;
    handler(e, hit);
  };
  if (prevent) {
    root.addEventListener('pointerdown', fire);
    root.addEventListener('pointerup', fire);
  }
  root.addEventListener('click', fire);
  sealChromeControl(root, { prevent });
}
