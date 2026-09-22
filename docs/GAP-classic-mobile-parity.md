# GAP — Classic mobile chrome vs Experimental @390

**As-of:** 2026-09-22 · LIVE stamp `V2.81.57-dual-path.18`  
**Viewports:** Classic `?ux=classic` @390 CSS px · Experimental `?ux=three` @390 CSS px  
**Scope:** UI/UX chrome / IA / touch only. SCHEMA 11 frozen. Classic 2D Canvas map stays.

Rollback tags: `stable-version-2` → `.17` · `stable-version-3` / `stable-state-3` → `.18` (pre full parity + Experimental kill).

Stills: `gap-390/classic-lobby-home.png`, `gap-390/exp-lobby-home.png` (also under `/opt/cursor/artifacts/gap-390/`).

---

## What `.18` already borrowed (not re-listed as Must-port)

Under `html.mobile-shell` only:

- In-tile `− / count / +` peek tiles (`.phone-peek-tile` / `.phone-peek-step`)
- Reserved thumb Confirm row (`.pp-peek-cta-row`)
- `@media (max-width: 430px)` denser tiles / Confirm / combat chips
- Lobby/list `touch-action: pan-y`
- Peek-row map click-through seal (`pointer-events: none` on row; tiles/steps `auto` + stepper `stopPropagation`)

James still reports Classic mobile ≠ Experimental after `.18` — residual gaps are **shell IA**, not more peek-tile borrowing.

---

## Top gaps that made `.18` feel wrong

1. **Lobby shell** — Classic opaque `#lobby.lobby-overlay` vs Experimental frosted `#three-lobby` over live map.
2. **Top HUD IA** — Classic flag + phase word + Map + ⋯ vs Experimental ☰ + phase chip + seat pip + **always-visible IPC** + **?**.
3. **Zoom placement** — Classic Map-tools gate → top-right; Experimental always-on bottom-right above CTA.
4. **Confirm vocabulary / gold rail** — Classic `Attack X` / `End {phase} →` vs Experimental `Confirm Attack` / `End Phase · …` exclusive gold `#three-confirm`.
5. **Combat surface** — Classic separate full-screen `.phone-combat-sheet` vs Experimental `#three-battle` nested in the same bottom dock as peek.

---

## Inventory by BRIEF surface

| # | Surface | Must-port | Defer | Never (gameplay) |
|---|---------|-----------|-------|------------------|
| 1 | Lobby / New Local / Open Games / My Games | Frosted lobby over map; map bleed-through under `mobile-shell`; hide Map/HUD bleed during lobby | Path kicker copy; My Games on Classic home (keep); card SVG micro-tweaks | Firebase lobby payloads |
| 2 | Seat setup / Start | Teams toggle in reserved footer with Start (match Exp footer IA) | Color-pip check SVG; seat-row px polish | Classic 1942 mode option if phone stays Risk-only |
| 3 | Place capital / initial deploy | Confirm label pattern `Confirm: Capital in X` / `Confirm: Deploy in X` | Icon-commit vs Confirm-only deploy model | Capital/deploy legality |
| 4 | Purchase / buy panel | End-phase Confirm copy `End Phase · Purchase…` | Tile visual polish beyond `.18` | Buy costs / IPC math |
| 5 | Combat move / NCM | `Confirm Attack` / `Confirm: Move to X`; idle gold ghost; `End Phase · …` | — | Move legality / combat staging rules |
| 6 | Combat / casualty / dice / Confirm Attack | Nest phone combat into bottom-surface dock feel; Confirm verb prefix `Confirm: …` | Dice hero art; casualty column width | Combat math / finalize |
| 7 | Air land / carrier land | Peek + `Confirm: Land in X` / CV labels matching Exp | — | Landing / carrier rules |
| 8 | Research / tech | `Confirm: Roll N tech dice` / Unlock copy; breakthrough in bottom dock when possible | Tech tile polish | Tech unlock tables |
| 9 | End turn / phase chips / HUD | Phase chip + IPC chip + help `?` on phone HUD; hide Map-tools btn (zoom always on) | ⋯ vs ☰ glyph | Turn order / phase machine |
| 10 | Peek trays / sheets / footers / steppers / touch | Always-on BR zoom; seal HUD/CTA/zoom like Exp; gold exclusive Confirm rail | Safe-area micro-align | — |
| 11 | Desktop Experimental-only | — | — | **Never** force grow-frame rails / `#three-context` onto Classic desktop |

### Online IA note

Classic Online hub has **Open Games** browse; Experimental home online is Create / Join / My Games. **Keep Classic Open Games** (feature win) — do not strip to match Exp. Visual chrome (frost/footer) still Must-port.

---

## Must-port implementation touch points (Phase 2)

| Item | Classic files | Exp reference |
|------|---------------|---------------|
| Frosted lobby + map bleed | `style.css` `#lobby` / `.lobby-overlay` under phone tree; `lobby.js` show/hide + `html` class | `#three-lobby`, `has-lobby` |
| Teams in Start footer | `lobby.js` `_renderMobileLocalSetup` | `.three-lobby-footer` |
| HUD chips + IPC + ? | `hud.js` `_renderMobile`; `style.css` `#hud` mobile | `#three-l0` |
| Confirm copy + gold rail | `playerPanel.js` `resolvePhoneMoveCta` + phase labels; `.pp-confirm-btn` | `#three-confirm` / `setConfirmReady` |
| Zoom always BR | `style.css` `#zoom-controls`; drop Map-tools gate on phone | `#three-zoom` |
| Combat in bottom dock | `combatUI.js` / `bottomSurface.js` / phone combat CSS | `#three-battle` in `#three-bottom` |
| Chrome seal | `panelClickLock.js` + HUD/CTA/zoom | `threeChromeEvents.sealChromeControl` |

---

## Hard locks

- SCHEMA 11 · no gameplay/rules/combat math/move legality/sync/Firebase payload changes
- Classic desktop (≥901 / non-`mobile-shell`) stays Classic unless a tiny shared bug fix (document)
- Discord turn pings stay paused · Tesla corporate off
- Do **not** replace Classic Canvas with Three.js for chrome parity

## Phase 3 (after `.19` LIVE proof)

Kill selectable Experimental path: remove Interface picker, redirect `?ux=three` (+ aliases) to unified Classic shell (with mobile chrome), stamp `V2.81.57-unified.1`. Keep git history. Tag `pre-unify` on `.19` SHA if not already covered by `stable-version-3` chain.
