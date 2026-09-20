# Phase 2 — Tablet/Mobile Support Plan

Greenlit 7.14.26; implemented in V2.50 (commits 9db8a35 → this one).
Desktop is primary; every change is feature-detected (`pointer: coarse`,
touch events) or breakpoint-gated so mouse+keyboard desktop play is untouched.

## Status

- ✅ P0-1/2/3: `src/input/touchInput.js` — tap/pan/pinch on the map (synthesizes
  the same mouse/wheel events desktop uses; pinch-release can't phantom-tap),
  minimap tap/drag, 44px on-screen zoom buttons. Tap-based unit movement works
  through the existing click flow (tap source → sidebar steppers → tap dest →
  Confirm Move) AND touch-drag works via synthesis.
- ✅ P1: tap-to-peek territory tooltip (fromTouch-marked events only); visible
  ✕ overlay on surrendered players in the turn-order strip.
- ✅ P2: `pointer: coarse` 44px targets (steppers, tabs, swatches, menus,
  minimap 300×171); ≤900px breakpoint (280px sidebar, 2-col grids); all
  gameplay popups capped at 90dvh with scroll on coarse/short viewports.
- ✅ P3: dvh fallbacks for the two 100vh sites; viewport meta hardened
  (user-scalable=no, viewport-fit=cover) so page-zoom can't fight canvas
  pinch; touch-action/user-select guards (done in P0); presence unload on
  mobile is covered by the existing 2-minute staleness timeout.
- ⬜ REMAINING: verification on a physical iPad/Android tablet (gesture feel,
  Safari quirks, full multiplayer session start-to-finish on device). All
  in-browser verification so far used synthetic TouchEvents in Chromium.

## Findings from the V2.49 end-to-end review (desktop audit)

These are the concrete blockers observed in the current code, in priority order:

### P0 — game is fundamentally unplayable on touch today

1. **The map canvas has zero touch handling.** `src/main.js` binds only
   `mousedown` / `mousemove` / `mouseup` / `wheel` (lines ~1301–1689). The only
   touch listener in the whole codebase is presence activity tracking
   (`presenceManager.js`). Needed: pointer-events (or touch-events) unification
   for: tap-to-select territory, drag-to-pan, pinch-to-zoom (no keyboard/wheel
   alternative exists), and long-press or tap-tap-confirm to replace
   drag-and-drop unit movement.
2. **Unit movement is drag-and-drop only** during combat/non-combat move
   (dragStartPos / dragSourceTerritory flow in main.js). Tap-based fallback:
   tap source → tap destination → confirm from the existing sidebar move UI
   (which already has quantity steppers and a Confirm button — reuse it).
3. **Zoom is mouse-wheel only** (`camera.onWheel`). Add pinch gesture +
   on-screen +/− zoom buttons (the buttons also help desktop trackpad users).

### P1 — hidden or hover-only UI

4. **Territory and unit tooltips are hover-only** (`territoryTooltip.js`,
   `unitTooltip.js`, shown from canvas `mousemove`). On touch these never
   appear — and they carry real information (IPC value, factory capacity,
   unit stacks). Tap-select already opens the sidebar Territory tab; make that
   tab the touch-first surface for this info instead of the tooltip.
5. **HUD phase-dots use `title` attributes** (hover-only) for phase names.
   Current phase name is shown as text, so this is minor — but the turn-order
   strip's "Surrendered" title is also hover-only; add a visible OUT badge on
   small screens (legend already has one).

### P2 — layout and sizing

6. **Only one `@media` query exists in all of style.css** (min-width: 600px,
   line ~2343). There is no responsive layout at all. The sidebar (#sidebar),
   HUD bar, and modals (turn summary, combat UI, purchase popup, tech UI,
   rules panel) need breakpoints for ~768–1024px (tablet landscape is the
   target: iPad landscape 1024×768 minimum).
7. **Touch targets below 44×44:** `pp-qty-btn` (+/−/Max steppers), color
   swatches in lobby setup, `mp-refresh-btn`, admin 🗑 buttons, HUD phase dots,
   tab buttons. Gate size bumps behind `@media (pointer: coarse)`.
8. **Minimap is 233×133 with pixel-precision click-to-jump** — too small for
   fingers; enlarge on coarse-pointer devices.
9. **Modals need scroll audits on short viewports** (combat UI is tall; turn
   summary has max-height 80vh already — good pattern, apply everywhere).
10. **Lobby/multiplayer screens** are centered fixed-width cards — mostly fine,
    but the faction player-grid (5 cards) needs wrapping below ~900px.

### P3 — platform behaviors

11. `confirm()` dialogs (exit, leave game, admin delete) work on mobile but are
    ugly; optional in-app modal replacement.
12. Prevent double-tap zoom / text selection on the canvas
    (`touch-action: none` on #mapCanvas once touch handlers exist).
13. iOS Safari viewport height (address-bar collapse) — use `dvh` units for
    full-height overlays.
14. `beforeunload` presence cleanup doesn't fire reliably on mobile Safari —
    presence staleness (2-min timeout) already covers this; verify.

## Acceptance target

A full multiplayer session on iPad (Safari + Chrome): sign in → create game →
second player joins on desktop → capitals → deployment → all combat phases →
mobilize → income → next turn → surrender/leave → victory screen. Genuinely
playable, not merely rendering.

## Non-negotiable guardrail

Desktop input paths must remain byte-identical in behavior: all touch handlers
added alongside (not replacing) mouse handlers; all layout changes behind
`@media (pointer: coarse)` / width breakpoints; test desktop after every change.
