# SCORE-solo-18 → dual-path P0

Viz gated tip `.18` **PARTIAL ~76%**. Not a ship gate for dual-path, but the combat hole is **P0** on New UX.

## Fail (tip .18 @390)

Combat Move ORIGIN → UNITS → DEST reached. Gold **Confirm Attack** CTA **not reachable** (clipped / covered / dock swallowed dest taps). Regression vs `.16` (`Confirm: Attack Finland Norway` visible and tappable). Casualty YOU was NOT-REACHED because this path was broken.

## Fix (dual-path New UX — `V2.81.57-dual-path.4`)

Port tip `.19` dock, not a second engine:

- `#three-sheet-stack` scrolls peek/battle above a reserved Confirm footer + safe-area
- `#three-bottom` stays `pointer-events:none`; only Confirm / peek / battle / Undo take hits
- `chromeHitRectsFrom` no longer registers the full bottom dock (dest taps live)
- Gold label is **Confirm Attack**
- Classic Canvas / `src/ui/movementUI.js` untouched

Hold merge. Classic default path has zero intentional change.
