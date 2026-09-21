# dual-path.11 — Experimental desktop chrome

Stamp: **V2.81.57-dual-path.11**. HOLD MERGE. Quiet James.

Experimental (`?ux=three`) was mobile-first. On a laptop the HUD was a
stacked thumb dock; lobby was a single phone column. This tip is
**chrome only** — same `GameState`, same dual-fork rules as `.10`.

## Steal vs invent

Catalog folder `briefs/2026-09-20-boardgame-sandbox-ref/` still has no
LOBBY-SHELLS / SANDBOX-RECS files (same as `.18` LOOKPASS). Patterns
named there + A&A Online / Root desktop:

**Stolen**

- A&A Online / Root **side rail**: combat, deploy, air-land, Confirm dock
  beside the map on wide (`≥1024`). Map keeps full height.
- Root / `bgio-lobby-seat-picker` **multi-column lobby**: home tiles 2-col
  at tablet, 3-col at desktop; seats 2-col; setup options as a right
  column instead of a bottom sheet.
- A&A combat lanes: attacker | defender side-by-side on the rail.
- Mouse: hover wash on tiles (fine pointer only). Denser targets on
  wide (36–44px). Phone keeps 44/56.
- Breakpoints: phone base (≤480 / existing `@430`), tablet `768`,
  desktop `1024+`. Progressive enhancement — phone CSS is unchanged.

**Invented**

- CSS custom property `--three-rail` and `data-three-shell` for QA
  stills. No new grammar, no new stages, no new occupant kinds.

## HARD LOCK

- Classic queryless `/` is still Classic Canvas.
- Experimental @390: lobby MAIN scroll + compact seats + Confirm Attack
  footer reserved. Do not regress `.6` density or `.10` combat dock.
- Dual-fork `.02`–`.07` / `.10` (capture, empty origin, unique air land,
  Undo, one Done, FTR onto CV) not edited.

## Proof

- `node tools/test-experimental-desktop-chrome.mjs`
- `node tools/test-experimental-setup-density.mjs`
- `node tools/test-confirm-attack-cta.mjs`
- `node tools/test-dual-path-mode.mjs`
- Browser stills @390 and @1280 (see `stills/desktop-11-notes.json`)
