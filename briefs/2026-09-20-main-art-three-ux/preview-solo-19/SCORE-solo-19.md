# SCORE-solo-19 — Confirm Attack CTA (tip PASS → dual-path port)

**Hold merge.** Tip→main still **STOP**. Dual-path is the ship.

## Tip (playtest only)

Viz **PASS ~97%** on `V2.81.56-ux-solo.19` (PR76 `cursor/unit-sheet-clickthrough-d314`). Hard reload `?three=1&solo=1` @390: `playStage===CONFIRM` shows gold **Confirm Attack** visible, unclipped, tappable. Disabled chrome still reads Tap units / Tap destination.

`.18` Viz PARTIAL ~76% had ORIGIN→UNITS→DEST with Confirm **not reachable**. Do not port that covered CTA.

## Dual-path New UX (already landed)

`V2.81.57-dual-path.3` uses this `.19` reserved Confirm footer — not `.18`:

- `#three-sheet-stack` scrolls peek/battle above Confirm + safe-area
- `#three-bottom` `pointer-events:none`; dest taps live
- `chromeHitRectsFrom` does not register the full dock
- Gold label **Confirm Attack** only at CONFIRM

QC @390: `confirm-attack-390.png` / `.json` — rect `776–832` in `390×844`, `data-cta=confirm-attack`, enabled.

Classic Canvas untouched. Casualty YOU stays behind Confirm (now reachable).
