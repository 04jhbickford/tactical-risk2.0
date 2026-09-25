// Phone chrome (V2.63/V2.81). Visual split only.
// iPhone shell is max-width: 640px so a ~500 CSS-px Chrome box and
// iPhone-narrow both get the bottom tray — not the 280px tablet rail.
// The V2.61 tablet band is now 641–900; desktop ≥901 stays on its tree.
// Phone CSS lives in @media (max-width: 640px) and html.mobile-shell.
// Landscape phones are 667–956 wide × ~375–440 tall — width-only 640px
// would drop Plus/Pro Max landscape into the tablet tree. Use the short
// side for phone (min ≤640) and keep iPad/desktop out (max <1024).
// Width-only 641–900 stays tablet; 1280×400 / 1280×800 stay desktop.
// No rules / combat / schema changes.

import { GAME_PHASES, TURN_PHASES, TURN_PHASE_ORDER, TURN_PHASE_NAMES } from '../state/gameState.js';
import { MAP_WIDTH, MAP_HEIGHT } from '../map/camera.js';

export const MOBILE_SHELL_MAX_WIDTH = 640;
export const MOBILE_SHELL_QUERY = `(max-width: ${MOBILE_SHELL_MAX_WIDTH}px)`;
export const TABLET_CHROME_MAX_WIDTH = 900;
export const DESKTOP_MIN_WIDTH = 901;
// Below iPad's 1024 long side so Plus / Pro Max landscape (~926–956) stay phone.
export const PHONE_MAX_LONG_SIDE = 1024;

const listeners = [];

export function shouldUseMobileShell(viewportWidth, viewportHeight) {
  const width = Number(viewportWidth);
  if (!Number.isFinite(width)) return false;
  if (width <= MOBILE_SHELL_MAX_WIDTH) return true;
  if (viewportHeight == null || viewportHeight === '') return false;
  const height = Number(viewportHeight);
  if (!Number.isFinite(height)) return false;
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);
  return shortSide <= MOBILE_SHELL_MAX_WIDTH && longSide < PHONE_MAX_LONG_SIDE;
}

export function isMobileShell() {
  return typeof document !== 'undefined' &&
    document.documentElement.classList.contains('mobile-shell');
}

export function onMobileShellChange(fn) {
  if (typeof fn === 'function') listeners.push(fn);
}

function notify(active) {
  for (const fn of listeners) {
    try { fn(active); } catch { /* listener errors must not break chrome */ }
  }
}

export function applyMobileShellClass(viewportWidth, root = (typeof document !== 'undefined' ? document.documentElement : null), viewportHeight) {
  if (!root) return false;
  const active = shouldUseMobileShell(viewportWidth, viewportHeight);
  root.classList.toggle('mobile-shell', active);
  return active;
}

export function setShellFlag(name, on, root = (typeof document !== 'undefined' ? document.documentElement : null)) {
  if (!root || !name) return;
  root.classList.toggle(name, !!on);
}

// Handoff must hide HUD / panel / zoom / chips — not sit on top of them.
export function shouldHideAllGameChrome({ handoffVisible } = {}) {
  return !!handoffVisible;
}

// Auto-battle / combat popup must not leave End Turn, Done, or Max up.
export function shouldHideTurnActionChrome({ combatVisible } = {}) {
  return !!combatVisible;
}

// One enabled primary CTA. End Turn and Done never coexist. Disabled
// (illegal) actions are dropped — not greyed on top of another green.
export function pickMobilePrimaryButtons(buttons) {
  const enabled = (Array.isArray(buttons) ? buttons : []).filter(b => b && !b.disabled);
  const hasDone = enabled.some(b => b.action === 'finish-placement');
  const filtered = hasDone
    ? enabled.filter(b => b.action !== 'next-phase')
    : enabled;
  const primary = filtered.find(b => b.primary) || filtered[0];
  return primary ? [primary] : [];
}

// Always-visible phase identity. Do not copy the tablet 9px / hidden-dots path.
// Playing: "3/7 Combat Movement". Setup phases keep their name.
export function formatMobilePhaseLabel(gamePhase, turnPhase) {
  if (gamePhase === GAME_PHASES.TERRITORY_DRAFT) return 'Territory Draft';
  if (gamePhase === GAME_PHASES.CAPITAL_PLACEMENT) return 'Place Capital';
  if (gamePhase === GAME_PHASES.UNIT_PLACEMENT) return 'Initial Deployment';
  if (gamePhase === GAME_PHASES.PLAYING) {
    const name = TURN_PHASE_NAMES[turnPhase] || 'Playing';
    const idx = TURN_PHASE_ORDER.indexOf(turnPhase);
    if (idx >= 0) return `${idx + 1}/${TURN_PHASE_ORDER.length} ${name}`;
    return name;
  }
  return 'Setup';
}

// HUD chip: ONE phase word. The numbered line stays for logs / desktop.
export function formatMobilePhaseWord(gamePhase, turnPhase) {
  if (gamePhase === GAME_PHASES.TERRITORY_DRAFT) return 'Draft';
  if (gamePhase === GAME_PHASES.CAPITAL_PLACEMENT) return 'Capital';
  if (gamePhase === GAME_PHASES.UNIT_PLACEMENT) return 'Deploy';
  if (gamePhase === GAME_PHASES.PLAYING) {
    if (turnPhase === TURN_PHASES.DEVELOP_TECH) return 'Tech';
    if (turnPhase === TURN_PHASES.PURCHASE) return 'Buy';
    if (turnPhase === TURN_PHASES.COMBAT_MOVE) return 'Combat Move';
    if (turnPhase === TURN_PHASES.COMBAT) return 'Combat';
    if (turnPhase === TURN_PHASES.NON_COMBAT_MOVE) return 'Fortify';
    if (turnPhase === TURN_PHASES.MOBILIZE) return 'Mobilize';
    if (turnPhase === TURN_PHASES.COLLECT_INCOME) return 'Income';
    return 'Play';
  }
  return 'Setup';
}

export const PHONE_MAP_LABEL_MIN_ZOOM = 0.45;
export const PHONE_SELECT_PULSE_MS = 150;
export const PHONE_CONFIRM_PULSE_MS = 250;

export function shouldHidePhoneMapLabel({ mobile, name, peekedName, zoom } = {}) {
  if (!mobile || !name) return false;
  if (peekedName && name === peekedName) return true;
  const z = Number(zoom);
  // World / regional Fit: flag+stack is the read. Names on Germany /
  // South Europe sat on the chips (V2.81.25 P0-8).
  if (Number.isFinite(z) && z < PHONE_MAP_LABEL_MIN_ZOOM) return true;
  return false;
}

// Visible chip meta — never title-only IPC / Surrendered.
export function formatMobilePlayerMeta({ ipcs, surrendered } = {}) {
  const parts = [];
  if (Number.isFinite(Number(ipcs))) parts.push(`${Number(ipcs)}$`);
  if (surrendered) parts.push('OUT');
  return parts.join(' · ');
}

// Phone in-game chrome: Players / Territory / Log live in the menu sheet.
// Never keep a permanent 4-tab bar on the map.
export function shouldShowPhoneChromeTabs({ mobile } = {}) {
  return !mobile;
}

// ⋯ home is a short list. Do not reprint the lobby player roster under it.
export function shouldShowPhoneMenuPlayerRoster({ mobile } = {}) {
  return !mobile;
}

// Resign must be first-viewport on the phone ⋯ sheet — not the last
// row under Players / Territory / Log / Rules / Exit (52dvh clips it).
export const PHONE_MENU_RESIGN_LABEL = 'Resign';
export const PHONE_MENU_RESIGN_META = 'Leave this game';

export function phoneMenuHomeActions() {
  return [
    {
      action: 'resign',
      label: PHONE_MENU_RESIGN_LABEL,
      meta: PHONE_MENU_RESIGN_META,
      kind: 'danger',
    },
    { action: 'menu-tab', tab: 'stats', label: 'Players', meta: '›' },
    { action: 'menu-tab', tab: 'territory', label: 'Territory', meta: '›' },
    { action: 'menu-tab', tab: 'log', label: 'Log', meta: '›' },
    { action: 'menu-tab', tab: 'dice', label: 'Dice stats', meta: '›' },
    { action: 'phase-tips', label: 'Phase tips', meta: '›' },
    { action: 'rules', label: 'Game Rules', meta: '›' },
    { action: 'exit-lobby', label: 'Save & Exit', meta: '›' },
  ];
}

// Resize / orientationchange only re-applies chrome (mobile-shell class +
// camera fit). Never construct or reset GameState from that path.
export function shouldResetGameOnOrientationChange() {
  return false;
}

export function isPhoneMenuResignFirst(actions = phoneMenuHomeActions()) {
  return actions[0]?.action === 'resign';
}

// Peek deploy is chips + one thumb. The 0/6 line is not a second panel.
export function shouldShowPhonePlaceMeta({ mobile, phase, peek } = {}) {
  return !!mobile && phase === GAME_PHASES.UNIT_PLACEMENT && !peek;
}

// Polytopia pair: unit + land. The count stepper waits for both.
export function shouldShowPhoneDeployQty({
  mobile,
  phase,
  unitType,
  territory,
} = {}) {
  return !!mobile
    && phase === GAME_PHASES.UNIT_PLACEMENT
    && !!unitType
    && !!territory;
}

export function shouldAutoStagePhoneDeployPair({
  mobile,
  phase,
  unitType,
  territory,
  queuedForType = 0,
  canAdd = true,
} = {}) {
  void queuedForType;
  return shouldShowPhoneDeployQty({ mobile, phase, unitType, territory })
    && !!canAdd;
}

/** Named dest + this type still has remaining: the icon tap commits now. */
export function shouldIncrementPhonePairIcon({
  hasNamedLand = false,
  unitType = null,
  canAdd = false,
} = {}) {
  return !!hasNamedLand && !!unitType && !!canAdd;
}

/** Remaining of THIS type only. Never a round-cap stand-in, never other types. */
export function remainingEligibleOfType({ available = 0 } = {}) {
  return Math.max(0, Number(available) || 0);
}

/** Icon tap commits one (or Max dumps remaining) of THAT type after dest is named. */
export function shouldCommitPhoneIconTap({
  hasNamedDest = false,
  unitType = null,
  remainingOfType = 0,
} = {}) {
  return !!hasNamedDest && !!unitType && remainingEligibleOfType({ available: remainingOfType }) > 0;
}

/** Exhausted type: leftover taps no-op and clear. Do not retarget another type. */
export function shouldClearPhoneIconAfterExhausted({
  unitType = null,
  remainingOfType = 0,
} = {}) {
  return !!unitType && remainingEligibleOfType({ available: remainingOfType }) <= 0;
}

export function phoneIconCommitCount({
  remainingOfType = 0,
  dumpRemaining = false,
  slotsRemaining = Number.POSITIVE_INFINITY,
} = {}) {
  const typeLeft = remainingEligibleOfType({ available: remainingOfType });
  if (typeLeft <= 0) return 0;
  const slots = Number.isFinite(slotsRemaining)
    ? Math.max(0, Number(slotsRemaining) || 0)
    : typeLeft;
  if (dumpRemaining) return Math.min(typeLeft, slots);
  return Math.min(1, typeLeft, slots);
}

/** Deploy / mobilize icon path still commits immediately (no thumb Confirm).
 *  Combat Move / Fortify keep purchase-class named Confirm: tap units to
 *  stage, then Move to X / Attack X. Generic: icon-commit is placement
 *  only, not movement. */
export function shouldHidePhonePairConfirm({
  mobile = false,
  pairGrammar = false,
  phase = null,
  turnPhase = null,
} = {}) {
  if (!mobile || !pairGrammar) return false;
  if (phase === GAME_PHASES.UNIT_PLACEMENT) return true;
  if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.MOBILIZE) return true;
  return false;
}

/** Combat / Fortify icon taps stage a count. Confirm commits the move. */
export function shouldStagePhoneMoveIcon({
  hasSource = false,
  unitType = null,
  remainingOfType = 0,
} = {}) {
  return !!hasSource && !!unitType
    && remainingEligibleOfType({ available: remainingOfType }) > 0;
}

/** Leftover of THIS type after already-staged count. */
export function remainingUnstagedOfType({ available = 0, staged = 0 } = {}) {
  return Math.max(0, remainingEligibleOfType({ available }) - Math.max(0, Number(staged) || 0));
}

export function canNamePhoneMoveDest({ hasSource = false, destIsLegal = false } = {}) {
  return !!hasSource && !!destIsLegal;
}

export function nextStagedCount({ current = 0, available = 0 } = {}) {
  const cur = Math.max(0, Number(current) || 0);
  const max = Math.max(0, Number(available) || 0);
  if (cur >= max) return cur;
  return cur + 1;
}

// Place Capital / Initial Deployment expand was a 4-tab sheet that ate
// the map. Players / Territory / Log live in the ⋯ sheet only.
export function shouldShowPhoneDetentTabs({ mobile, expanded, phase } = {}) {
  if (!mobile || !expanded) return false;
  if (phase === GAME_PHASES.CAPITAL_PLACEMENT) return false;
  if (phase === GAME_PHASES.UNIT_PLACEMENT) return false;
  return true;
}

// Setup peek is hint + chips + one thumb verb. No ▾ covering list.
export function shouldShowPhoneTrayToggle({ mobile, phase } = {}) {
  if (!mobile) return false;
  if (phase === GAME_PHASES.CAPITAL_PLACEMENT) return false;
  if (phase === GAME_PHASES.UNIT_PLACEMENT) return false;
  return true;
}

// +/−/Fit / minimap stay off the art until Map is tapped in the HUD.
export function shouldParkPhoneMapTools({ mobile } = {}) {
  return !!mobile;
}

/** Setup Fit shows +/−/Fit when Map is open, but the minimap stays off
 *  the art (Skeptic V2.81.32: 120×68 overlay on Fit+world). */
export function shouldHidePhoneSetupMinimap({ mobile, phase } = {}) {
  return !!mobile && isPhoneSetupPhase(phase);
}

// Phone chrome never says Click. Desktop PHASE_HINTS stay Click.
export function phonePointerHint(text, { mobile = false } = {}) {
  if (!mobile || text == null || text === '') return text || '';
  return String(text).replace(/\bClick\b/g, 'Tap').replace(/\bclick\b/g, 'tap');
}

// Initial deployment on phone is a tray of remaining units, not the
// desktop queue/+/-/confirm sheet squeezed into the bottom overlay.
export function shouldUsePhonePlacementTray({ mobile, phase } = {}) {
  return !!mobile && phase === GAME_PHASES.UNIT_PLACEMENT;
}

// Purchase / tech / movement / mobilize still have a body in the DOM.
// V2.67: that body is a hidden region until the peek tray expands.
export function shouldShowPhonePanelBody({
  mobile,
  phase,
  turnPhase,
  airLanding,
  movePending,
} = {}) {
  if (!mobile) return true;
  if (airLanding || movePending) return true;
  if (phase === GAME_PHASES.UNIT_PLACEMENT) return true;
  if (phase === GAME_PHASES.PLAYING) {
    return turnPhase === TURN_PHASES.DEVELOP_TECH
      || turnPhase === TURN_PHASES.PURCHASE
      || turnPhase === TURN_PHASES.COMBAT_MOVE
      || turnPhase === TURN_PHASES.NON_COMBAT_MOVE
      || turnPhase === TURN_PHASES.MOBILIZE;
  }
  return false;
}

// One row of unit/action chips on the peek detent so every land+unit
// phase stays one-handed. Combat Confirm is the only stronger verb.
export function shouldShowPhonePeekUnitRow({ mobile, phase, turnPhase } = {}) {
  if (!mobile) return false;
  if (phase === GAME_PHASES.UNIT_PLACEMENT) return true;
  if (phase === GAME_PHASES.PLAYING) {
    return turnPhase === TURN_PHASES.DEVELOP_TECH
      || turnPhase === TURN_PHASES.PURCHASE
      || turnPhase === TURN_PHASES.MOBILIZE
      || turnPhase === TURN_PHASES.COMBAT_MOVE
      || turnPhase === TURN_PHASES.NON_COMBAT_MOVE;
  }
  return false;
}

// Land+unit phases share one grammar. Purchase is unit+Max only
// (no land pair). Place Capital is land+Confirm (no units).
export function shouldUsePhonePairGrammar({ mobile, phase, turnPhase } = {}) {
  if (!mobile) return false;
  if (phase === GAME_PHASES.UNIT_PLACEMENT) return true;
  if (phase === GAME_PHASES.PLAYING) {
    return turnPhase === TURN_PHASES.MOBILIZE
      || turnPhase === TURN_PHASES.COMBAT_MOVE
      || turnPhase === TURN_PHASES.NON_COMBAT_MOVE;
  }
  return false;
}

// Pair-path Max: Deploy / mobilize dump-and-commit that type (no Confirm).
// Combat / Fortify Max only fills the staged count; named Confirm moves.
// Tech Max still only fills the count; Confirm spends. Purchase Max
// does not need a named land.
export function shouldShowPhonePeekMax({
  mobile,
  phase,
  turnPhase,
  hasNamedLand,
  hasUnitType,
  hasNamedDest = false,
  remainingOfType = 1,
} = {}) {
  if (!mobile) return false;
  if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.DEVELOP_TECH) {
    return true;
  }
  if (!hasUnitType) return false;
  if (remainingEligibleOfType({ available: remainingOfType }) <= 0) return false;
  if (phase === GAME_PHASES.UNIT_PLACEMENT) return !!hasNamedLand;
  if (phase !== GAME_PHASES.PLAYING) return false;
  if (turnPhase === TURN_PHASES.PURCHASE) return true;
  if (turnPhase === TURN_PHASES.MOBILIZE) return !!hasNamedLand;
  if (turnPhase === TURN_PHASES.COMBAT_MOVE
    || turnPhase === TURN_PHASES.NON_COMBAT_MOVE) {
    return !!hasNamedLand && !!hasNamedDest;
  }
  return false;
}

// Default phone chrome is map + thin peek. Expand is opt-in.
// Air-landing keeps the body up. Dest-pending combat / fortify stay
// peeked so Confirm lives in the thumb — not a type-count shop.
export function shouldPeekPhoneTray({
  mobile,
  expanded,
  airLanding,
  movePending,
  phase,
} = {}) {
  void phase;
  void movePending;
  if (!mobile) return false;
  if (expanded) return false;
  if (airLanding) return false;
  return true;
}

// Phone always peeks unless expanded (or air-landing / move-confirm).
// Desktop never collapses. phase/turnPhase kept so existing callers compile.
export function shouldCollapseMobileTray({
  mobile,
  phase,
  turnPhase,
  airLanding,
  movePending,
  expanded,
} = {}) {
  void turnPhase;
  return shouldPeekPhoneTray({ mobile, expanded, airLanding, movePending, phase });
}

// Expanded detent cap — one sheet, not a 280px column or 42/50dvh cover.
export const PHONE_PEEK_EXPANDED_MAX_DVH = 36;

export const PHONE_MIN_ZOOM_FLOOR = 0.10;
export const PHONE_FIT_PAD_TOP = 64;
export const PHONE_FIT_PAD_BOTTOM = 120;

export function phoneUnitIconSize(zoom, { mobile } = {}) {
  if (!mobile) return Math.max(14, Math.min(24, 20 * (Number(zoom) || 0)));
  const z = Number(zoom);
  const safe = Number.isFinite(z) && z > 0 ? z : 1;
  if (safe >= PHONE_COUNTRY_OUTLINE_CLOSE_ZOOM) {
    return Math.max(20, Math.min(36, 28 * safe));
  }
  // ~8 CSS px at dest Fit; cap world-px so a stack cannot cover a continent
  // at world zoom (James V2.81.34: ownership unreadable blobs).
  return Math.min(28, Math.max(16, 8 / safe));
}

export function shouldDrawPhoneOwnershipFlags(zoom, { mobile = false } = {}) {
  if (mobile) return true;
  return Number(zoom) >= 0.35;
}

export function phoneOwnershipFlagSize(zoom, { mobile = false } = {}) {
  const z = Number(zoom);
  const safe = Number.isFinite(z) && z > 0 ? z : 1;
  if (!mobile) return Math.max(16, Math.min(28, 22 * safe));
  if (safe >= PHONE_COUNTRY_OUTLINE_CLOSE_ZOOM) {
    return Math.max(16, Math.min(28, 22 * safe));
  }
  return Math.min(22, Math.max(10, 7 / safe));
}

export function shouldHideUnitsAtZoom(zoom, { mobile } = {}) {
  return !mobile && (Number(zoom) || 0) < 0.35;
}

// Phone Fit is ~0.3–0.5. A 25-world chip on the centroid sits on the
// territory name. Lift the word; drop the stack. Hit-test uses the same dy.
export function phoneMapStackOffsets(zoom, { mobile } = {}) {
  if (!mobile) {
    return { nameDy: 0, unitDy: 25, capitalDy: -35 };
  }
  const z = Math.max(Number(zoom) || 0.4, 0.15);
  return {
    nameDy: -Math.round(18 / z),
    unitDy: Math.round(28 / z),
    capitalDy: -Math.round(36 / z),
  };
}

export function territoryFitPoint(t) {
  if (!t) return null;
  if (Array.isArray(t.center) && Number.isFinite(t.center[0]) && Number.isFinite(t.center[1])) {
    return { x: t.center[0], y: t.center[1] };
  }
  const poly = t.polygons?.[0];
  if (!Array.isArray(poly) || poly.length === 0) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const p of poly) {
    if (Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
      sx += p[0];
      sy += p[1];
      n++;
    }
  }
  return n ? { x: sx / n, y: sy / n } : null;
}

export function boundsFromPoints(points) {
  if (!Array.isArray(points) || points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return null;
  // Scattered worldwide sets are a world fit, not a tiny bbox.
  if (maxX - minX > MAP_WIDTH * 0.7) return null;
  return { minX, minY, maxX, maxY };
}

// Pull x onto the copy nearest seedX so Alaska+Europe does not
// centroid into empty Pacific (V2.81.25 Deploy Fit FAIL).
export function unwrapFitX(x, seedX, mapW = MAP_WIDTH) {
  if (!Number.isFinite(x) || !Number.isFinite(seedX)) return x;
  let n = x;
  let d = n - seedX;
  while (d > mapW / 2) { n -= mapW; d = n - seedX; }
  while (d < -mapW / 2) { n += mapW; d = n - seedX; }
  return n;
}

export function unwrapFitPoints(points, seedX) {
  if (!Array.isArray(points)) return [];
  if (!Number.isFinite(seedX)) return points.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  return points
    .filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y))
    .map(p => ({ x: unwrapFitX(p.x, seedX), y: p.y }));
}

// When owned land spans the world, still return a regional window around
// the seed (dest/capital) so Fit is not a Pacific wrap poster.
export function phoneProblemBounds(points, seedX) {
  const unwrapped = unwrapFitPoints(points, seedX);
  const tight = boundsFromPoints(unwrapped);
  if (tight) return tight;
  if (!unwrapped.length) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const p of unwrapped) {
    sx += p.x;
    sy += p.y;
    n++;
  }
  if (!n) return null;
  const cx = Number.isFinite(seedX) ? seedX : sx / n;
  const cy = sy / n;
  const hw = MAP_WIDTH * 0.16;
  const hh = MAP_HEIGHT * 0.20;
  return {
    minX: cx - hw,
    maxX: cx + hw,
    minY: Math.max(0, cy - hh),
    maxY: Math.min(MAP_HEIGHT, cy + hh),
  };
}

// Contain the problem in the padded rect, but never zoom out so far that
// the 2000-tall map letterboxes on the teal canvas (#3CC0BF).
export function phoneFitZoom({ cssW, cssH, canvasH, bw, bh, maxZoom = 3 } = {}) {
  const w = Math.max(1, Number(cssW) || 1);
  const h = Math.max(1, Number(cssH) || 1);
  const ch = Math.max(1, Number(canvasH) || h);
  const boxW = Math.max(1, Number(bw) || 1);
  const boxH = Math.max(1, Number(bh) || 1);
  const contain = Math.min(w / boxW, h / boxH);
  const fillHeight = ch / MAP_HEIGHT;
  return Math.min(maxZoom, Math.max(contain, fillHeight));
}

export function phoneFitLetterboxesMap({ canvasH, zoom } = {}) {
  const z = Number(zoom);
  const h = Number(canvasH);
  if (!Number.isFinite(z) || z <= 0 || !Number.isFinite(h) || h <= 0) return true;
  return h / z > MAP_HEIGHT + 0.5;
}

export function collectPhoneFitPoints(territories, predicate) {
  const list = Array.isArray(territories) ? territories : Object.values(territories || {});
  const pts = [];
  for (const t of list) {
    if (predicate && !predicate(t)) continue;
    const p = territoryFitPoint(t);
    if (p) pts.push(p);
  }
  return pts;
}

function uniqueNames(list) {
  const out = [];
  const seen = new Set();
  for (const n of Array.isArray(list) ? list : []) {
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function indexTerritoriesByName(territories) {
  const list = Array.isArray(territories) ? territories : Object.values(territories || {});
  const byName = {};
  for (const t of list) {
    if (t?.name) byName[t.name] = t;
  }
  return byName;
}

export function neighborNamesOf(name, byName) {
  const conns = byName?.[name]?.connections;
  return Array.isArray(conns) ? conns.filter(Boolean) : [];
}

// Owned + dests. Selected never replaces that set (one-chip Fit).
// Owned ≤ 1 (Place Capital / first deploy): legal dests / that name, then expand.
export function collectPhoneFitFocusNames({
  ownedNames = [],
  selectedName,
  destinationNames = [],
} = {}) {
  const owned = uniqueNames(ownedNames);
  const dests = uniqueNames(destinationNames);
  if (owned.length <= 1) return uniqueNames([...owned, ...dests, selectedName]);
  return uniqueNames([...owned, ...dests]);
}

export function expandPhoneFitRegionNames(names, territories) {
  const byName = indexTerritoriesByName(territories);
  const out = [];
  const seen = new Set();
  const add = (n) => {
    if (!n || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  for (const name of uniqueNames(names)) {
    add(name);
    for (const n of neighborNamesOf(name, byName)) add(n);
  }
  return out;
}

function ownedClusterContaining(ownedNames, startName, byName) {
  const owned = new Set(ownedNames);
  if (!startName || !owned.has(startName)) return [];
  const out = [];
  const seen = new Set([startName]);
  const stack = [startName];
  while (stack.length) {
    const cur = stack.pop();
    out.push(cur);
    for (const n of neighborNamesOf(cur, byName)) {
      if (!owned.has(n) || seen.has(n)) continue;
      seen.add(n);
      stack.push(n);
    }
  }
  return out;
}

function allOwnedClusters(ownedNames, byName) {
  const seen = new Set();
  const clusters = [];
  for (const name of ownedNames) {
    if (seen.has(name)) continue;
    const cluster = ownedClusterContaining(ownedNames, name, byName);
    for (const n of cluster) seen.add(n);
    if (cluster.length) clusters.push(cluster);
  }
  return clusters;
}

// Worldwide empires: prefer the dest/capital cluster, else the largest.
// Never the whole poster. Never a single selected chip. Never Pacific wrap.
export function pickPhoneFitOwnedCluster(ownedNames, territories, capitalName) {
  const owned = uniqueNames(ownedNames);
  if (owned.length <= 1) return owned;
  const byName = indexTerritoriesByName(territories);
  const pts = [];
  for (const name of owned) {
    const p = territoryFitPoint(byName[name]);
    if (p) pts.push(p);
  }
  if (boundsFromPoints(pts)) return owned;
  const clusters = allOwnedClusters(owned, byName);
  if (capitalName) {
    const dest = clusters.find(c => c.includes(capitalName));
    if (dest) return dest;
  }
  const capital = clusters.find(c => c.some(n => byName[n]?.isCapital));
  if (capital) return capital;
  clusters.sort((a, b) => b.length - a.length);
  return clusters[0] || owned;
}

function destsNearSeed(dests, seed, byName) {
  const seedSet = new Set(seed);
  return uniqueNames(dests).filter(d => (
    seedSet.has(d) || neighborNamesOf(d, byName).some(n => seedSet.has(n))
  ));
}

// Regional window: owned + neighbors / legal dests. Includes adjacent sea
// so a coastal starting region still shows coastline.
export function resolvePhoneFitRegionNames({
  ownedNames = [],
  selectedName,
  destinationNames = [],
  capitalName,
  territories,
} = {}) {
  const byName = indexTerritoriesByName(territories);
  const owned = uniqueNames(ownedNames);
  const dests = uniqueNames(destinationNames);
  const destSeed = [selectedName, capitalName, ...dests].find(n => owned.includes(n)) || null;
  let seedOwned = owned;
  const ownedPts = [];
  for (const name of owned) {
    const p = territoryFitPoint(byName[name]);
    if (p) ownedPts.push(p);
  }
  const worldwide = owned.length > 1 && !boundsFromPoints(ownedPts);
  // Compact multi-owned seeds stay whole (Germany+Poland). Only a worldwide
  // wrap (UK+India, or Russians Europe+Asia+Alaska) may shrink to the dest
  // / capital cluster — otherwise Fit windows the Pacific.
  if (worldwide) {
    const preferred = destSeed
      || (owned.includes(selectedName) ? selectedName : null)
      || (owned.find(n => dests.includes(n)) || null);
    seedOwned = preferred
      ? (ownedClusterContaining(owned, preferred, byName)
        || pickPhoneFitOwnedCluster(owned, territories, preferred))
      : pickPhoneFitOwnedCluster(owned, territories, capitalName);
  }
  const seed = collectPhoneFitFocusNames({
    ownedNames: seedOwned,
    selectedName: seedOwned.length <= 1 ? selectedName : null,
    destinationNames: worldwide ? destsNearSeed(dests, seedOwned, byName) : dests,
  });
  return expandPhoneFitRegionNames(seed, territories);
}

// One chip is not a region. Pad a tiny bbox so Fit never frames a single tile.
export const PHONE_FIT_MIN_REGION_W = MAP_WIDTH * 0.14;
export const PHONE_FIT_MIN_REGION_H = MAP_HEIGHT * 0.16;

export function ensurePhoneFitRegionBounds(bounds) {
  if (!bounds) return null;
  let { minX, maxX, minY, maxY } = bounds;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  if (maxX - minX < PHONE_FIT_MIN_REGION_W) {
    minX = cx - PHONE_FIT_MIN_REGION_W / 2;
    maxX = cx + PHONE_FIT_MIN_REGION_W / 2;
  }
  if (maxY - minY < PHONE_FIT_MIN_REGION_H) {
    minY = cy - PHONE_FIT_MIN_REGION_H / 2;
    maxY = cy + PHONE_FIT_MIN_REGION_H / 2;
  }
  return {
    minX,
    maxX,
    minY: Math.max(0, minY),
    maxY: Math.min(MAP_HEIGHT, maxY),
  };
}

// Home land for Place Capital Fit when this seat has not confirmed.
// Worldwide owned (Russia+Siberia+Alaska) otherwise windows the Pacific.
export const PHONE_FACTION_HOME_LAND = {
  Russians: 'Russia',
  Germans: 'Germany',
  British: 'United Kingdom',
  Japanese: 'Japan',
  Americans: 'East US',
};

/** Skeptic probe lands. A 2p deal often assigns China to the human;
 *  that must still be inspect, never `Place Capital: China`. Home land
 *  of this seat is never inspect-only. */
export const PHONE_CAPITAL_INSPECT_LANDS = new Set([
  'China',
  'Wake Island',
  'French Indo China',
  'Manchuria',
  'Germany',
  'Japan',
]);

export function isPhoneCapitalInspectOnlyLand(name, currentPlayerId) {
  const n = String(name || '');
  if (!n) return false;
  const home = PHONE_FACTION_HOME_LAND[currentPlayerId];
  if (home && n === home) return false;
  return PHONE_CAPITAL_INSPECT_LANDS.has(n);
}

export function phoneHomeTerritoryName(playerId, ownedNames = []) {
  const home = PHONE_FACTION_HOME_LAND[playerId];
  if (home && (!ownedNames.length || ownedNames.includes(home))) return home;
  return null;
}

export function phoneFitSelectedName({
  selectedName,
  ownedNames = [],
  capitalName = null,
} = {}) {
  if (selectedName && ownedNames.includes(selectedName)) return selectedName;
  if (capitalName && ownedNames.includes(capitalName)) return capitalName;
  return null;
}

// Fit frames the current player's owned-land region (capital / home
// cluster when owned land is worldwide), plus neighbors / legal dests.
// Not a world poster, not a one-tile crop, not empty NW Pacific.
export function applyPhoneCameraFit(camera, {
  gameState,
  territories,
  selectedName,
  destinationNames,
  capitalName,
  userTapped = false,
} = {}) {
  if (!camera) return;
  camera.usePhoneMinZoom = true;
  const before = userTapped
    ? { x: camera.x, y: camera.y, z: camera.zoom }
    : null;
  const insets = {
    padding: 12,
    padTop: PHONE_FIT_PAD_TOP,
    padBottom: PHONE_FIT_PAD_BOTTOM,
  };
  const playerId = gameState?.currentPlayer?.id;
  const ownedNames = [];
  if (playerId && territories) {
    const list = Array.isArray(territories) ? territories : Object.values(territories || {});
    for (const t of list) {
      if (!t || t.isWater) continue;
      if (gameState.getOwner?.(t.name) === playerId) ownedNames.push(t.name);
    }
  }
  const home = phoneHomeTerritoryName(playerId, ownedNames);
  const capital = capitalName
    || gameState?.getCapital?.(playerId)
    || home
    || null;
  selectedName = phoneFitSelectedName({
    selectedName, ownedNames, capitalName: capital,
  });
  const focus = resolvePhoneFitRegionNames({
    ownedNames,
    selectedName,
    destinationNames,
    capitalName: capital,
    territories,
  });
  const focusSet = new Set(focus);
  const pts = collectPhoneFitPoints(territories, (t) => focusSet.has(t.name));
  const seedName = [selectedName, capital, ...(destinationNames || [])]
    .find(n => focusSet.has(n));
  const seedPt = seedName
    ? territoryFitPoint(indexTerritoriesByName(territories)[seedName])
    : null;
  const bounds = ensurePhoneFitRegionBounds(phoneProblemBounds(pts, seedPt?.x));
  if (bounds) {
    camera.fitBounds(bounds, { ...insets, fillFrame: true });
  } else {
    camera.fitWorld({ ...insets, fillFrame: true });
  }
  // Already on the dest cluster: first user Fit was a no-op (V2.81.27).
  // Widen to the world so Fit always does something visible.
  if (before && shouldWidenPhoneUserFit({
    beforeZoom: before.z,
    afterZoom: camera.zoom,
    beforeX: before.x,
    afterX: camera.x,
    beforeY: before.y,
    afterY: camera.y,
  })) {
    camera.fitWorld({ ...insets, fillFrame: true });
  }
}

export function worldFitBounds() {
  return { minX: 0, minY: 0, maxX: MAP_WIDTH, maxY: MAP_HEIGHT };
}

export function shouldHighlightPhoneLegalTerritories({ mobile, phase } = {}) {
  return !!mobile && (
    phase === GAME_PHASES.CAPITAL_PLACEMENT || phase === GAME_PHASES.UNIT_PLACEMENT
  );
}

/**
 * Capital STAR only for a land that is actually a confirmed capital.
 * During Place Capital, also require playerState.capitalTerritory so a
 * leaked isCapital flag cannot paint a star+glow on opening (James
 * V2.81.25: star on SE Asia with zero taps).
 */
export function isConfirmedPhoneCapital(territoryName, gameState) {
  if (!territoryName || !gameState?.playerState) return false;
  return Object.values(gameState.playerState).some(
    (ps) => ps?.capitalTerritory === territoryName,
  );
}

export function shouldDrawPhoneCapitalStar(territoryName, gameState) {
  if (!territoryName || !gameState?.isCapital?.(territoryName)) return false;
  // Opening leaked isCapital with no playerState must not paint a star.
  // A named Confirm that actually placed must show the star on THAT land
  // even while the phase is still Place Capital (Skeptic V2.81.31).
  if (gameState.phase === GAME_PHASES.CAPITAL_PLACEMENT) {
    return isConfirmedPhoneCapital(territoryName, gameState);
  }
  return true;
}

/**
 * Circular capital GLOW reads as inspect=commit. Never on Place Capital
 * (opening or peek). After both capitals are down (UNIT_PLACEMENT+), glow
 * may return on confirmed stars.
 */
export function shouldDrawPhoneCapitalGlow(gameState) {
  return gameState?.phase !== GAME_PHASES.CAPITAL_PLACEMENT;
}

// Opening Place Capital / Initial Deploy: owned lands must read BEFORE
// the first tap AND look different from unowned. Cream/ivory is the
// baked map chrome (India and East Indies already wear it) — a cream
// hex-edge is not a legal mark (V2.81.23 James FAIL). Civ gold-hex
// class: dashed gold + gold fill-lite on owned land only.
export const PHONE_LEGAL_FILL_ALPHA = 0.32;
export const PHONE_LEGAL_OUTLINE_CSS_PX = 3;
export const PHONE_LEGAL_OUTLINE_WORLD_MAX = 16;
export const PHONE_LEGAL_DASH_CSS_PX = 10;
export const PHONE_LEGAL_GAP_CSS_PX = 6;
export const PHONE_LEGAL_DASH_WORLD_MAX = 14;
export const PHONE_LEGAL_GAP_WORLD_MAX = 8;
export const PHONE_LEGAL_SOLID_MAX_ZOOM = 0.28;
export const PHONE_LEGAL_EDGE_INK = '#3d2800';
export const PHONE_LEGAL_EDGE_COLOR = '#f5c518';
export const PHONE_LEGAL_FILL_RGB = '255, 208, 32';
export const PHONE_LEGAL_CHROME_CREAM = '#fff3b0';
export const PHONE_COUNTRY_OUTLINE_CSS_PX = 1.25;
export const PHONE_COUNTRY_OUTLINE_WORLD_MIN = 1;
export const PHONE_COUNTRY_OUTLINE_WORLD_MAX = 14;
export const PHONE_COUNTRY_OUTLINE_MIN_ZOOM = 0.4;
export const PHONE_COUNTRY_OUTLINE_CLOSE_ZOOM = 0.85;
/** James V2.81.34 lookpass: fills-only hid every tile edge. Neutral
 *  CSS-px hairline — not gold legal, not a fat world-px stair-step. */
export const PHONE_COUNTRY_HAIRLINE_CSS_PX = 1;
export const PHONE_COUNTRY_HAIRLINE_WORLD_MAX = 5;
export const PHONE_COUNTRY_HAIRLINE_COLOR = 'rgba(0, 0, 0, 0.35)';
/** Same family as land: ~1 CSS-px on teal #44C5BD. Not the 4px
 *  water-mask stroke+shadow (jagged dark coasts). */
export const PHONE_SEA_HAIRLINE_CSS_PX = 1;
export const PHONE_SEA_HAIRLINE_WORLD_MAX = 5;
export const PHONE_SEA_HAIRLINE_COLOR = 'rgba(6, 36, 42, 0.55)';
export const PHONE_LEGAL_HAIRLINE_CSS_PX = 2.25;

// Poly dashed faction-color. Cream/ivory is map chrome — never return it.
export function phoneLegalDashColor(factionHex) {
  const raw = String(factionHex ?? '').trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (!m) return PHONE_LEGAL_EDGE_COLOR;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return `#${h.toLowerCase()}`;
}

export function phoneLegalOutlineWidth(zoom) {
  const z = Number(zoom);
  if (!Number.isFinite(z) || z <= 0) return PHONE_LEGAL_OUTLINE_CSS_PX;
  // Opening / dest-cluster / world Fit: ~2.25 CSS px on owned tiles only.
  // Cap 16 world-px so this stays a tile edge, not a continent hull.
  if (z < PHONE_COUNTRY_OUTLINE_CLOSE_ZOOM) {
    return Math.min(
      PHONE_LEGAL_OUTLINE_WORLD_MAX,
      Math.max(2.5, PHONE_LEGAL_HAIRLINE_CSS_PX / z),
    );
  }
  return Math.min(
    PHONE_LEGAL_OUTLINE_WORLD_MAX,
    Math.max(PHONE_LEGAL_OUTLINE_CSS_PX, PHONE_LEGAL_OUTLINE_CSS_PX / z),
  );
}

export function phoneLegalUsesSolidStroke(zoom) {
  const z = Number(zoom);
  // Dashed sparkle at Fit reads as country strokes. Solid hairline until close.
  return !Number.isFinite(z) || z <= 0 || z < PHONE_COUNTRY_OUTLINE_CLOSE_ZOOM;
}

/** Gold/faction hairline on every owned tile is a worldwide grid
 *  (James V2.81.30 m0atf2x5u). Owned mark is fill-lite only. Peek
 *  supplies the tile outline. Never stroke unowned land. */
export function shouldStrokePhoneLegalHairline(_zoom, { mobile = false } = {}) {
  void _zoom;
  void mobile;
  return false;
}

export function isPhoneSetupPhase(phase) {
  return phase === GAME_PHASES.TERRITORY_DRAFT
    || phase === GAME_PHASES.CAPITAL_PLACEMENT
    || phase === GAME_PHASES.UNIT_PLACEMENT;
}

/** Baked smallMap/baseTiles carry dark-red country ink. Skip at Fit and
 *  during phone setup (dest-cluster zoom is often ≥ 0.85). */
export function shouldSkipPhoneMapArt(zoom, { mobile = false, setup = false } = {}) {
  if (!mobile) return false;
  if (setup) return true;
  const z = Number(zoom);
  if (!Number.isFinite(z) || z <= 0) return true;
  return z < PHONE_COUNTRY_OUTLINE_CLOSE_ZOOM;
}

/** Water-mask stroke+shadow aliases as jagged dark coasts on flat ocean. */
export function shouldSkipPhoneWaterMask({ mobile = false, setup = false } = {}) {
  return !!mobile && !!setup;
}

/** Sea-zone dashes at dest zoom still read as country ink. Setup = fills. */
export function shouldStrokePhoneSeaDashes(zoom, { mobile = false, setup = false } = {}) {
  if (mobile && setup) return false;
  return Number(zoom) >= 0.4;
}

// Phone: a stable ~1 CSS-px sea-zone hairline at Fit / world / setup.
// Desktop keeps dashes (this returns 0). Cap world-px so Fit cannot
// stair-step a fat ocean rim.
export function phoneSeaOutlineWidth(zoom, { mobile = false, setup = false } = {}) {
  void setup;
  if (!mobile) return 0;
  return phoneCountryOutlineWidth(zoom, { mobile: true, setup });
}

export function phoneLegalDashPattern(zoom) {
  if (phoneLegalUsesSolidStroke(zoom)) return [];
  const z = Number(zoom);
  const safe = Number.isFinite(z) && z > 0 ? z : 1;
  return [
    Math.min(PHONE_LEGAL_DASH_WORLD_MAX, PHONE_LEGAL_DASH_CSS_PX / safe),
    Math.min(PHONE_LEGAL_GAP_WORLD_MAX, PHONE_LEGAL_GAP_CSS_PX / safe),
  ];
}

// Phone: a stable ~1 CSS-px dark hairline on every land tile at Fit,
// world, and setup. Cap world-px so the camera cannot stair-step a fat
// rim (James V2.81.32–34). Desktop keeps the 0.4 hide / 1 world-px floor.
export function phoneCountryOutlineWidth(zoom, { mobile = false, setup = false } = {}) {
  void setup;
  const z = Number(zoom);
  if (!mobile) {
    if (!Number.isFinite(z) || z <= 0) return PHONE_COUNTRY_OUTLINE_WORLD_MIN;
    if (z < PHONE_COUNTRY_OUTLINE_MIN_ZOOM) return 0;
    return PHONE_COUNTRY_OUTLINE_WORLD_MIN;
  }
  const safe = Number.isFinite(z) && z > 0 ? z : 1;
  return Math.min(
    PHONE_COUNTRY_HAIRLINE_WORLD_MAX,
    Math.max(1, PHONE_COUNTRY_HAIRLINE_CSS_PX / safe),
  );
}

export function phoneOwnershipSeamWidth(zoom, { mobile = false, setup = false } = {}) {
  const z = Number(zoom);
  const safeZ = Number.isFinite(z) && z > 0 ? z : 1;
  // Same-color fill bleed only. Fat world-px strokes alias into jagged
  // dark country rims at Fit / world (Skeptic V2.81.33). Keep world-px
  // tiny so the camera transform cannot stair-step a rim.
  if (mobile && setup) return 3;
  if (mobile) {
    return Math.min(3, Math.max(1, 1.25 / safeZ));
  }
  return Math.min(3, Math.max(1, 1.25 / safeZ));
}

// User Fit already on the dest cluster is a no-op (V2.81.27). Widen to world.
export function shouldWidenPhoneUserFit({
  beforeZoom, afterZoom, beforeX, afterX, beforeY, afterY,
} = {}) {
  const dz = Math.abs(Number(afterZoom) - Number(beforeZoom));
  const pan = Math.hypot(
    Number(afterX) - Number(beforeX),
    Number(afterY) - Number(beforeY),
  );
  return dz < 0.035 && pan < 60;
}

/** Land dest → land/air only. Sea dest → sea/air only. No dest → all chips. */
export function shouldShowPhoneDeployChip({ destName, destIsWater, unitDef } = {}) {
  if (!unitDef) return false;
  if (!destName) return true;
  if (destIsWater) return !!(unitDef.isSea || unitDef.isAir);
  return !!(unitDef.isLand || unitDef.isAir || unitDef.isBuilding);
}

export function isPhoneLegalSetupSeaDest({
  seaName,
  playerId,
  territories,
  getOwner,
  getUnits,
} = {}) {
  if (!seaName || !playerId) return false;
  const byName = indexTerritoriesByName(territories);
  const sea = byName[seaName];
  if (!sea?.isWater) return false;
  const units = getUnits?.(seaName) || [];
  if (units.some((u) => u?.owner && u.owner !== playerId)) return false;
  // Bind any empty/friendly existing sea — adjacency is a place rule,
  // not a peek lock. V2.81.27 left dest stuck on the capital when the
  // tap was a far ocean (Indian Ocean).
  return true;
}

export function collectPhoneLegalTerritoryNames({
  mobile,
  phase,
  playerId,
  territories,
  getOwner,
  getUnits,
} = {}) {
  if (!shouldHighlightPhoneLegalTerritories({ mobile, phase }) || !playerId) return [];
  const list = Array.isArray(territories) ? territories : Object.values(territories || {});
  const names = [];
  for (const t of list) {
    if (!t || t.isWater) continue;
    if (getOwner?.(t.name) === playerId) names.push(t.name);
  }
  return names;
}

// Faction swatch keeps the raw color. Text on the dark HUD must stay readable.
export function readableFactionTextColor(hex) {
  const raw = String(hex ?? '').trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (!m) return raw || '#e0e0e0';
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  if (lum >= 0.45) return `#${h.toLowerCase()}`;
  const lift = Math.min(1, (0.55 - lum) / 0.55 + 0.35);
  const mix = (c) => Math.round(c + (255 - c) * lift);
  const to = (n) => mix(n).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function initMobileShell() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const apply = () => {
    // Chrome only. Orientation must not reset game state (SCHEMA 11).
    const active = applyMobileShellClass(window.innerWidth, document.documentElement, window.innerHeight);
    notify(active);
  };

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);

  const mq = window.matchMedia(MOBILE_SHELL_QUERY);
  if (typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', apply);
  } else if (typeof mq.addListener === 'function') {
    mq.addListener(apply);
  }
}
