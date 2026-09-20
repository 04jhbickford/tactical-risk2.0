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
| Client | Payload only (`gameId`, `seatId`, `turnIndex`, `faction`, `phase`, `deepLink`, `discordUserId`). No webhook on the client. |
| Post | Server posts `{ content }` to Discord. Missing API/env → `{ ok: false, reason }` HTTP 200, no throw. |

Bare ES modules: browser code cannot read Vercel env. The secret stays on the Vercel project (Production + Preview). Do not put the URL in git, PRs, briefs, comments, or client JS. Never echo or log it.

## Sample ping

```
<@123456789012345678> your turn — Russians · Combat Move
https://tactical-risk20.vercel.app/?ux=three&code=ABC123
```

Unlinked seat (no snowflake): one untagged fallback, then deduped.

```
your turn — British · Purchase
https://tactical-risk20.vercel.app/?ux=classic&code=ZZZZZZ
```

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
