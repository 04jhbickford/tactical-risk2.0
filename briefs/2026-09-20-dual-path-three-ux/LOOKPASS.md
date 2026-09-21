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

## dual-path.7 — auth + server Discord (hold merge)

Issue 9.20.26.01: return-to-login zombie (`Player` / non-player) is gone — clean Sign In **or** real restored identity. Persistence stays local (no sign-out on tab return). Discord production path is `POST /api/discord-turn-ping` (Vercel env). Stamp **V2.81.57-dual-path.7**. Compact Experimental seats from .6 stay. See `AUTH-DISCORD.md`.

## dual-path.9 / .10 — combat / air / deploy / mobilize carrier

Playtest B–D plus 9.20.26.07 (FTR onto CV in SZ). Shared combat finalize
(35RB85 owner flip), empty-origin combat move, independent fighter
landings + Undo, one green Done, factory-adjacent carrier load. Stamp
**V2.81.57-dual-path.10**. `.8` auth/Discord untouched. See
`briefs/2026-09-20-discord-playtest-bugs/DUAL-PATH-9.md`.

## dual-path.11 — Experimental desktop chrome (hold merge)

TWO layouts, one product. Chrome-only. Dual-fork rules from `.02`–`.10`
unchanged. Classic `/` untouched. Phone @390 keeps the bottom-sheet /
compact-seat tree (MAIN 14,66,362×657). Desktop ≥1024 grow-frame:
map 760×749 + left 220 + right 300 + top 52. Label **Experimental UX**.

See `briefs/2026-09-20-dual-path-three-ux/DESKTOP.md`. Stamp
**V2.81.57-dual-path.11**. READY stills. HOLD MERGE. Parent wakes Viz.

## dual-path.8 — durable Discord env + max persistence (hold merge)

Webhook is Vercel sensitive env `DISCORD_TURN_WEBHOOK_URL` on Production + Preview. Client POSTs `/api/discord-turn-ping` payload only. Server soft-fails 200 if unconfigured. Quiet token refresh also on `online`; hydrate identity on resume. Stamp **V2.81.57-dual-path.8**.

## Known stubs (from tip .18)

Retreat tiles, bombard tiles, sub-vs-air / first-strike split. Naval fights still auto-resolve in the Three adapter.
