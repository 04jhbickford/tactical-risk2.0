# Discord turn ping — Classic + New UX

Shared sync path. Soft-fail only. Never blocks play. Hold merge.

## Trigger

- Once per **new human** `activeSeat` (skip AI).
- Dedupe key: `(gameId, turnIndex, seatId)` in `sessionStorage`.
- Writer-only: skip while `syncManager.isLoading()` (remote apply).
- Opening seat of a bind is not pinged (they already have the turn).

## Channel / webhook

| Field | Value |
|---|---|
| Channel | `#tactical-risk` `1551283474303025292` |
| Env | `DISCORD_TURN_WEBHOOK_URL` (`window` / `localStorage` / build env) |
| Post | `{ content }` to the webhook. Missing URL → unused, no throw. |

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

## Lobby field

Optional Discord username or snowflake on the **local human** seat.

| Path | Control |
|---|---|
| Classic | `.mp-discord-input` (`data-action="discord-id"`) |
| New UX | `[data-lobby-discord]` (`.three-lobby-discord`) |

Remembered in `localStorage` (`tacticalRisk_discordSeat`) and written onto the lobby seat / start roster as `discordUserId` / `discordName`. Other seats show “Discord linked” when present.

## Confirm Attack (unchanged)

Tip `.19` reserved Confirm footer stays New UX only. Classic untouched.
