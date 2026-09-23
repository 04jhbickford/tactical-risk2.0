# Discord turn ping — Classic + New UX

Shared sync path. Soft-fail only. Never blocks play. Hold merge.

## Trigger

- Once per **new human** `activeSeat` (skip AI).
- Dedupe key: `(gameId, turnIndex, seatId)` — client `sessionStorage` + serverless memory.
- Writer-only: skip while `syncManager.isLoading()` (remote apply).
- Opening seat of a bind is not pinged (they already have the turn).

## Channel / webhook (server path)

| Field | Value |
|---|---|
| Channel | `#tactical-risk` `1551283474303025292` |
| Production | `POST /api/discord-turn-ping` — serverless reads `DISCORD_TURN_WEBHOOK_URL` |
| Client | Payload only (`gameId`, `seatId`, `turnIndex`, `faction`, `phase`, `summary`, `deepLink`, `discordUserId`, `actorName`, `actorFaction`). No webhook on the client. |
| Post | Server posts `{ content }` to Discord. Missing API/env → `{ ok: false, reason }` HTTP 200, no throw. |

Bare ES modules: browser code cannot read Vercel env. The secret stays on the Vercel project (Production + Preview). Do not put the URL in git, PRs, briefs, comments, or client JS. Never echo or log it.

## Sample ping

One notice per finished turn. First line is the next human's mention. Header is the player who just finished. Then every unit loss and every territory taken. A quiet turn still includes both empty lines. Deep link is `?code=` only, on the last line (unified shell strips `?ux=`). No "your turn" prose.

Unit lines use the combat log: `{count}x {unit}` when the log stored types, a bare count when it stored only a number. Opponent is who inflicted the loss. Territory lines name who took the land. Probe and test payloads never reach the webhook.

```
<@261711980526567428>
Robfox007 - Germany Develop Tech Phase
-1x Destroyer lost Baltic Sea - Russian Easy AI
-1x Carrier, 2x Fighters, 1x Battleship lost North Atlantic - Bastion UK
-No territories lost
https://tactical-risk20.vercel.app/?code=ABC123
```

Unlinked seat (no snowflake): the mention line is left off.

```
UK Purchase Phase
-No units lost
-No territories lost
https://tactical-risk20.vercel.app/?code=ZZZZZZ
```

Turn pings stay off until a human sets `DISCORD_TURN_WEBHOOK_URL` on Production and Preview and redeploys. Missing env returns `{ ok: false, reason: 'unconfigured' }` HTTP 200. Do not commit a webhook URL.

Diagnostics: game event `kind: 'ui'` `{ action: 'discordTurnPing', reason }`.

## Lobby field

Optional Discord username or snowflake on the **local human** seat.

| Path | Control |
|---|---|
| Classic | `.mp-discord-input` (`data-action="discord-id"`) |
| New UX | `[data-lobby-discord]` (`.three-lobby-discord`) |

Remembered in `localStorage` (`tacticalRisk_discordSeat`) and written onto the lobby seat / start roster as `discordUserId` / `discordName`. Other seats show “Discord linked” when present.

## Confirm Attack (unchanged)

Tip `.19` reserved Confirm footer stays New UX only. Classic untouched.
