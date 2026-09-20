# Dual-path Classic | New UX — lookpass

Stamp: **V2.81.57-dual-path.2**
Hold merge for Viz gate + James look.

## Paths

| Path | How | Chrome |
|---|---|---|
| **Classic** (default) | `/` or `?ux=classic` | Existing Canvas lobby / MP / HUD. No intentional behavior change. |
| **New UX** | Lobby picker or `?ux=three` (`?three=1` alias) + `sessionStorage.tacticalRisk_uxMode` | Three chrome for create / join / setup / deploy / phases / combat / win. Same `GameState` + Firebase. |
| Pocket demo | `?ux=three&pocket=1` or `?max=1` | Isolated tip pocket. Not the lobby path. |

## Catalog (steal, not invent)

See `briefs/2026-09-20-boardgame-sandbox-ref/LOOKPASS.md`: seat cards Human / AI / Empty, income Confirm gate, combat nested stages, YOU casualty pick.

## P0 — Confirm Attack @390 (tip .18 Viz PARTIAL)

Tip `.18` combat ORIGIN→UNITS→DEST reached; gold **Confirm Attack** was clipped / not tappable because `#three-bottom` swallowed dest taps and peek/battle grew over the footer. Ported tip `.19` dock (Viz PASS ~97%): `#three-sheet-stack` scrolls above a reserved Confirm footer; hit-test is Confirm (and Undo) only. Label is `Confirm Attack`. Classic Canvas untouched. Cite: `briefs/2026-09-20-main-art-three-ux/preview-solo-19/SCORE-solo-19.md`. Tip→main STOP.

## Known stubs (from tip .18)

Retreat tiles, bombard tiles, sub-vs-air / first-strike split. Naval fights still auto-resolve in the Three adapter.
