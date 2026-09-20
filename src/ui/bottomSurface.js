// One phone bottom surface at a time. Sheets / guides demote siblings.
// Confirm / Resign / Max stay on the CTA rail (≥44pt, safe-area).
// Theme stays Tactical Risk — pattern only (no parchment / threeui).

export const BOTTOM_SURFACE = {
  CTA: 'cta',
  PEEK: 'peek',
  GUIDE: 'guide',
  SHEET: 'sheet',
  MENU: 'menu',
};

// Documented z-index ladder (phone / mobile-shell):
//   40  territory / unit tooltips (under HUD)
//   50  leftover desktop sidebar (.player-panel, unscoped)
//   60  peek tray / #sidebar (phone)
//   65  CTA rail (Confirm / Resign / Max) — never covered
//   70  #hud
//   75  phase-guide card (inset above --mobile-cta)
//  150  leftover purchase / tech side sheets
//  200  combat sheet + phone ⋯ menu
// 2000 critical banners
export const BOTTOM_SURFACE_Z = {
  tooltip: 40,
  leftoverSidebar: 50,
  peekTray: 60,
  ctaRail: 65,
  hud: 70,
  phaseGuide: 75,
  leftoverSheet: 150,
  sheet: 200,
  phoneMenu: 200,
  banner: 2000,
};

export function resolveActiveBottomSurface({
  menuOpen = false,
  sheetVisible = false,
  phaseGuideVisible = false,
  peekVisible = true,
} = {}) {
  if (menuOpen) return BOTTOM_SURFACE.MENU;
  if (sheetVisible) return BOTTOM_SURFACE.SHEET;
  if (phaseGuideVisible) return BOTTOM_SURFACE.GUIDE;
  if (peekVisible) return BOTTOM_SURFACE.PEEK;
  return BOTTOM_SURFACE.CTA;
}

export function shouldCollapsePeekForSurface(surface) {
  return surface === BOTTOM_SURFACE.GUIDE
    || surface === BOTTOM_SURFACE.SHEET
    || surface === BOTTOM_SURFACE.MENU;
}

export function shouldHidePhaseGuideForSurface(surface) {
  return surface === BOTTOM_SURFACE.SHEET
    || surface === BOTTOM_SURFACE.MENU;
}

export function shouldKeepCtaRailForSurface(surface) {
  // Combat / purchase / tech sheets own their own buttons.
  // Guide and peek keep Confirm / Resign / Max on the rail.
  return surface !== BOTTOM_SURFACE.SHEET && surface !== BOTTOM_SURFACE.MENU;
}

export function readBottomSurfaceInputs(root = (typeof document !== 'undefined' ? document.documentElement : null)) {
  const c = root?.classList;
  return {
    menuOpen: !!c?.contains('phone-menu-open'),
    sheetVisible: !!(c?.contains('combat-active')
      || c?.contains('purchase-active')
      || c?.contains('tech-active')),
    phaseGuideVisible: !!c?.contains('phase-guide-open'),
    peekVisible: true,
  };
}

export function applyBottomSurfaceFlags(surface, root = (typeof document !== 'undefined' ? document.documentElement : null)) {
  if (!root?.classList) return surface;
  root.classList.toggle('bottom-surface-guide', surface === BOTTOM_SURFACE.GUIDE);
  root.classList.toggle('bottom-surface-sheet', surface === BOTTOM_SURFACE.SHEET);
  root.classList.toggle('bottom-surface-menu', surface === BOTTOM_SURFACE.MENU);
  root.classList.toggle('bottom-surface-peek', surface === BOTTOM_SURFACE.PEEK);
  return surface;
}

export function syncBottomSurfaces(partial = {}, root = (typeof document !== 'undefined' ? document.documentElement : null)) {
  const inputs = { ...readBottomSurfaceInputs(root), ...partial };
  const surface = resolveActiveBottomSurface(inputs);
  return applyBottomSurfaceFlags(surface, root);
}
