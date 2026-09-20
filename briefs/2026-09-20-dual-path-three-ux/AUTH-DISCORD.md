# Dual-path.7 — auth return + Discord server ping

Stamp: **V2.81.57-dual-path.7**. Hold merge. Same ship as PR4 density (.6 seats stay).

Classic Canvas rules/HUD are unchanged except shared `authManager` / `presencePolicy` and shared Discord ping plumbing.

## A / B — Issue 9.20.26.01 + stay signed in

Rob: return to login showed a **non-player / "Player"** half-session. Sign Out → Sign In fixed it.

**Rule:** on return to auth/lobby, either a **clean Sign In form** or a **real restored identity** (displayName from Auth or Firestore, else email local-part / phone). Never invent `"Player"`.

| Surface | Behavior |
|---|---|
| Restore in flight | “Restoring your session…” — not the password form |
| Real session | Skip Sign In. Classic welcome + Experimental `data-auth-surface="session"` show the real name/email |
| Zombie (`Player` / no email) after restore | Treat as signed out. Clean form. Drop the leftover user |
| Tab return / reload / bfcache | `getAuth()` local persistence + quiet `getIdToken` refresh. Never sign out (presencePolicy) |

Shared: `src/multiplayer/authSession.js` + `AuthManager` / `AuthScreen` / Classic lobby / Experimental `threeMpSession.ensureAuth` (waits `whenReady`).

## C — Discord turn ping (server path)

Bare ES modules: Vercel env vars do **not** reach the browser. Production path is:

`POST /api/discord-turn-ping` → serverless reads `DISCORD_TURN_WEBHOOK_URL` → Discord webhook.

- Soft-fail. Never blocks play.
- Dedupe `(gameId, turnIndex, seatId)`. Skip AI.
- `@mention` when `discordUserId` snowflake present; untagged fallback otherwise.
- Deep link `?ux=classic|three&code=`.
- Optional game event `kind: 'ui'` `{ action: 'discordTurnPing', reason }`.
- Client does **not** need localStorage for the production path.
- `window.DISCORD_TURN_WEBHOOK_URL` remains a local/dev fallback only. **Do not commit a real secret.**

Classic: `main.js` `attachDiscordTurnPing`. Experimental MP: `threeSoloBoot.startMpMatch`.

## Ops (James / Arc)

1. Vercel project → Settings → Environment Variables.
2. Add `DISCORD_TURN_WEBHOOK_URL` = Discord channel webhook (Preview + Production).
3. Redeploy the preview/production that should ping. No HTML inject.
4. Confirm `POST /api/discord-turn-ping` on that deploy returns `{ ok, reason }` (unconfigured until the env is set).

Do not merge over live **V2.81.57-dual-path.4**.

## Smoke

**Classic** (`/` queryless)

1. Hard reload — L0 / lobby badge is `V2.81.57-dual-path.7`.
2. Play Online while signed in → Welcome shows **real name/email**, never `Player` / unknown.
3. Back to home → Play Online again → same identity (no Sign In).
4. Reload / switch tabs → still signed in.
5. Sign Out → clean Sign In form (no leftover welcome).
6. After webhook env is set: human seat change pings Discord once; AI seats do not.

**Experimental** (`?ux=three`)

1. Hard reload — stamp `.7`. Compact seats from .6 still there.
2. Play Online → identity strip: restoring / signed-in name / “sign in when you create or join”.
3. Create/Join restores the session (no zombie Player seat name).
4. Sign Out on that screen → clean unsigned strip.
5. Same Discord ping once webhook is set.
