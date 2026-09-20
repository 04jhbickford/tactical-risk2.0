# Dual-path Classic | New UX — lookpass

Stamp: **V2.81.57-dual-path.4**
Hold merge for Viz gate + James look.

## Paths

| Path | How | Chrome |
|---|---|---|
| **Classic** (default) | `/` queryless or `?ux=classic` — cold load always Classic (clears three session) | Existing Canvas lobby / MP / HUD. No intentional behavior change. |
| **New UX** | Click **New UX** or `?ux=three` (`?three=1` alias). Queryless does not stick. | Three chrome for create / join / setup / deploy / phases / combat / win. Same `GameState` + Firebase. |
| Pocket demo | `?ux=three&pocket=1` or `?max=1` | Isolated tip pocket. Not the lobby path. |

## Catalog (steal, not invent)

See `briefs/2026-09-20-boardgame-sandbox-ref/LOOKPASS.md`: seat cards Human / AI / Empty, income Confirm gate, combat nested stages, YOU casualty pick.

## P0 — Confirm Attack @390 (tip .18 Viz PARTIAL)

Tip `.18` combat ORIGIN→UNITS→DEST reached; gold **Confirm Attack** was clipped / not tappable because `#three-bottom` swallowed dest taps and peek/battle grew over the footer. Ported tip `.19` dock (Viz PASS ~97%): `#three-sheet-stack` scrolls above a reserved Confirm footer; hit-test is Confirm (and Undo) only. Label is `Confirm Attack`. Classic Canvas untouched. Cite: `briefs/2026-09-20-main-art-three-ux/preview-solo-19/SCORE-solo-19.md`. Tip→main STOP.

## P0 dual-path.3 FAIL → .4

Viz FAIL ~58% (`SCORE-dual-path-3.md`): CDN stamp painted `.2`; queryless `/` stuck on New UX after `?ux=three`. `.4` forces module stamp SoT + fail-closed Classic on no `ux` query.

## Discord turn ping (Classic + New UX)

Webhook `DISCORD_TURN_WEBHOOK_URL` on shared sync. Once per new human seat; skip AI; dedupe `(gameId, turnIndex, seatId)`. Lobby field: Classic `.mp-discord-input`, New UX `[data-lobby-discord]`. Unlinked → one untagged fallback. Soft-fail. See `DISCORD-TURN-PING.md`.

## Known stubs (from tip .18)

Retreat tiles, bombard tiles, sub-vs-air / first-strike split. Naval fights still auto-resolve in the Three adapter.
