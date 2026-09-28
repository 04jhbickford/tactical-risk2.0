# AGENTS.md — standing rules

Read this before changing Tactical Risk. Also read `CLAUDE.md` (deploy and multiplayer authority) and append every playtest round to `BUGS.md`.

Browser WWII grand strategy. Vanilla ES modules, no bundler. Entry: `index.html` → `src/main.js`. Rules and state: `src/state/gameState.js`. Multiplayer: `src/multiplayer/`.

## 1. Polish standard

Every change is judged as a premium game. Cheap chrome, clipped controls, and stretched layouts fail even when the rules are correct.

1. Diagnose what feels cheap. Name the screen, the viewport, and the moment.
2. Pick concrete polish targets (one control, one layout, one motion). Do not restyle the product in passing.
3. Use only free tools and CC0 or permissively licensed assets. Record each new asset's licence and source in the PR (and next to the file if it ships in-repo). Paid, scraped, or unclear-licence art and audio stay out. `PHASE_4_PLAN.md` allows a free/CC0 pack such as Kenney for audio; that plan is not implemented, and it is not permission to add anything else.
4. Gate visual work on an approved still before building. Show the intended frame (desktop and the phone width below). Do not implement the visual until that still is approved.
5. QA after the build. Exercise the path. A single screenshot is not a pass.

There is no QA bar in `README.md`. Use these instead:

- `doc/METHOD-SETTLECOAST.md` — production smoke (cold branded load, first input, one Confirm, 390 and 500, console clean, rotate without resetting state, reduced motion) and the journey matrix.
- `briefs/2026-09-20-main-art-three-ux/DESKTOP-EXPERIMENTAL-CHROME-BRIEF.md` — layout north star only. The Experimental fork in that brief is retired; do not rebuild it.
- `briefs/2026-09-20-main-art-three-ux/ADAPTIVE-LOBBY-CHECKLIST.md` — D1 at 390, D2 at ≥1024.
- `briefs/2026-09-20-dual-path-three-ux/DESKTOP.md` — measured QC gates.
- `docs/GAP-classic-mobile-parity.md` — Classic phone chrome notes. Historical. Do not reopen Experimental.
- `MOBILE_PLAN.md` — coarse-pointer targets and breakpoint discipline so desktop mouse play stays intact.
- `briefs/2026-09-20-dual-path-three-ux/LOOKPASS.md` — look-pass notes tied to a stamp. Read the stamp; do not treat an old pass as current.

## 2. One LIVE path

Unified Classic is the only live game. `src/map/presentationMode.js` always resolves Classic. `isThreeUx` is false. `?ux=`, `?three=`, and `?solo=` are stripped and the browser is sent to the clean URL. The lobby picker returns `{ classic: null, experimental: null }`.

`threeSolo*` modules remain in the tree for history. `src/main.js` does not boot them (since `V2.81.57-unified.1`). Do not resurrect Experimental, New UX, Three.js play, or a second player-facing shell.

Current save schema is **11**:

- `SCHEMA_VERSION` in `src/version.js` is `11`.
- `GameState.toJSON().version` in `src/state/gameState.js` is `11`.

Bump the schema only when the persisted shape changes. Display version and schema version are different stamps.

Current display stamp is `GAME_VERSION` in `src/version.js`: `V2.81.57-unified.17`. Read the file. After a later bump, the file wins over this sentence.

## 3. Layout bars

Desktop at **1024px and wider** must feel desktop-native. Map-dominant layout, side chrome, compact controls. Do not ship a phone sheet stretched to 1280. `style.css` already switches at `@media (min-width: 1024px)`. The desktop brief and D2 are the picture: side rails and a map that is the largest region, not a scaled phone UI.

Mobile at **390px wide** must be solid: no overlap, no horizontal scroll, compact controls. Primary Confirm / Max / Resign stay fully on screen and clear the home indicator (METHOD: ≥44pt at 390 and 500). Check portrait 390 and a short landscape height. 500px is the second phone width in `doc/METHOD-SETTLECOAST.md`.

## 4. Turn notices to Discord

Do not change these formats unless the task explicitly says to. Contracts live in `src/multiplayer/discordTurnPing.js` and `api/discord-turn-ping.js`. Tests: `tools/test-discord-turn-ping.mjs`, `tools/test-turn-ping-recipient.mjs`, `tools/test-turn-ping-naval-cargo.mjs`.

Production path: the client POSTs `/api/discord-turn-ping` with the seat payload only. The serverless function reads `DISCORD_TURN_WEBHOOK_URL` and posts `{ content, allowed_mentions }`. Soft-fail (HTTP 200, `ok: false`) when unconfigured, probing, skipping AI, or on network error. Never block play. Probe and test payloads never reach Discord.

Trigger: once per new human seat (`bindDiscordTurnPing`). Skip AI (`isAI` → `skip-ai`). Dedupe key `(gameId, turnIndex, seatId)`. Skip while a remote snapshot is applying. The opening seat of a bind is not pinged. Channel id constant: `DISCORD_TURN_CHANNEL_ID` `1551283474303025292` (`#tactical-risk`).

### Multiline summary

`formatTurnPingSummary` builds the body. Counts and places come from `turnEvents` only. Each fact is its own line:

- Units: `-{counts} lost {place} - {who inflicted the loss}`
- Counts are `{n}x {Unit}` in catalog order (`UNIT_LINE_ORDER`), joined with commas. A bare number is used when the log stored only a count (`-4 lost`).
- Territories: `-{Territory} Lost - {who took it}`
- Quiet turn, always both lines: `-No units lost` then `-No territories lost`

Example (sea losses, no land change):

```
-1x Destroyer lost Baltic Sea - Russian Easy AI
-1x Carrier, 2x Fighters, 1x Battleship lost North Atlantic - Bastion UK
-No territories lost
```

Example (land battle and capture):

```
-8x Infantry, 5x Tanks lost South Africa - Bastion UK
-South Africa Lost - Bastion UK
```

The live ping does not post that raw summary. `bindDiscordTurnPing` calls `formatRecipientLossSummary` for the **next human** since their previous turn ended. That keeps units they lost (place + who hit them) and territories taken from them. It drops opponent casualties and territories they themselves captured. A quiet stretch still sends both "no losses" lines.

### Recipient header

First body line after the mention. `formatPingHeader`: `{displayName} - {Power} {Phase}`.

The header is the recipient (the human whose turn is starting), not the seat that just finished. `actorName` / `actorFaction` are legacy and must not override a recipient display name or faction. A name that is only the power word is omitted (`UK Purchase Phase`, `Russia Combat Move Phase`). Phase gets a `Phase` suffix when it does not already end in "phase".

### Alias tagging and `allowed_mentions`

Mention line, only when a snowflake resolves: `<@snowflake>`. No snowflake: omit the mention line. Do not write an untagged `@name`.

Resolve order: explicit `discordUserId` snowflake, then a snowflake in the identity fields, then `DISCORD_ALIAS_MAP` (whole tokens only; trailing digits fold so `bastion2` matches `bastion`; no substring match), then an exact guild-member lookup when `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` are set (exactly one hit). Keep the client map and the copy in `api/discord-turn-ping.js` in sync.

`allowedMentionsFor` is what the webhook posts:

- resolved user: `{ "parse": [], "users": ["<snowflake>"] }`
- no user: `{ "parse": [] }`

`parse` stays empty so Discord cannot mention anyone from the prose.

Full notice, linked seat:

```
<@261711980526567428>
Bastion - UK Develop Tech Phase
-1x Destroyer lost Baltic Sea - Russian Easy AI
-1x Carrier, 2x Fighters, 1x Battleship lost North Atlantic - Bastion UK
-No territories lost
https://tactical-risk20.vercel.app/?code=HENV42
```

Unlinked seat (no mention line):

```
UK Purchase Phase
-No units lost
-No territories lost
https://tactical-risk20.vercel.app/?code=ZZZZZZ
```

Deep link is the last line, `?code=` only. The unified shell strips `?ux=`. Content cap is 1800 characters; keep the link.

### AI-battle and naval-cargo lines

AI battles go through `GameState.resolveCombat`. A sunk transport or carrier (`quantity` hits 0) notes its manifest in `_noteSunkCargo`: transport `cargo`, carrier `aircraft`. Those rows join that owner's loss ledger and flush as combat events. Human combat does the same in `CombatUI._recordHullCargo`. The Discord line is the same shape either way: carried units sit on the hull's line, catalog order, one sea zone, one opponent.

```
-2x Infantry, 1x Carrier, 1x Fighter, 1x Transport lost Red Sea - British Easy AI
```

No cargo: hull only (`-1x Destroyer lost Red Sea - British Easy AI`). An allied fighter on a sunk carrier is a line for that ally, not for the carrier owner. AI opponents use `{Adjective} {Difficulty} AI` (`British Easy AI`) unless the seat has a real custom name. A damaged battleship is not a loss until its quantity drops.

## 5. LIVE stamp proof

Every release bumps the display version and proves the same string everywhere it shows. Today that string is `V2.81.57-unified.17`. Set all of these together; do not leave one behind:

| Place | What |
|---|---|
| `src/version.js` | `GAME_VERSION` (source of truth `main.js` imports) |
| `index.html` | `<meta name="tr-game-version" content="…">` |
| `index.html` | `window.__TR_GAME_VERSION = '…'` |
| `index.html` | `lockStamp`'s `var LOCKED = '…'` |
| `index.html` | `style.css?v=` and `src/main.js?v=` |

`paintGameStamp` in `src/main.js` writes `__TR_GAME_VERSION`, `data-game-version`, and `.lobby-version-badge` / `.three-l0-ver` / `.three-lobby-ver` from `GAME_VERSION`. `lockStamp` repaints on a timer. It prefers `LOCKED` over a different family (unified beats a leftover `dual-path` or `ux-solo` stamp) and over an older same-family patch. If `LOCKED` and `GAME_VERSION` differ, the live badge lies. Tests that lock the stamp include `tools/test-unified-1.mjs`.

`vercel.json` sends `Cache-Control: no-store` for `/`, `/index.html`, `/src/version.js`, `/src/*`, and `/style.css`.

After deploy, prove the live site:

1. Run `node tools/verify-deployed.mjs` from the repo root. It fetches live `src/version.js` (default `https://tactical-risk.web.app`, or pass the origin) and exits non-zero unless live `GAME_VERSION` equals the local file.
2. Fetch live `/` with no cache. Confirm `tr-game-version`, `__TR_GAME_VERSION`, `LOCKED`, and both `?v=` values equal that stamp.
3. Hard-reload the game. Confirm `document.querySelector('meta[name="tr-game-version"]').content`, `window.__TR_GAME_VERSION`, `document.documentElement.getAttribute('data-game-version')`, and the lobby badge text are the same string.

Deploy only as `CLAUDE.md` says: `firebase deploy` from a clean `main`. `tools/predeploy-check.mjs` blocks detached HEAD, non-main, dirty tracked files, and stranded `.claude/worktrees/*` diffs. Do not set `ALLOW_DIRTY_DEPLOY=1`.

## 6. Release announce

One announcement per release, to `#tactical-risk` (channel `1551283474303025292`). Plain and factual: the stamp and what changed. No sass, no jokes, no hype.

Post it once, after the live stamp matches. If that stamp was already announced, do not post again. Do not format the announcement as a turn ping, and do not send it through the turn-notice path. Never put a webhook URL, token, or key in the message or the repo.

## 7. Secrets

Never commit webhook URLs, tokens, or keys. They live in the hosting environment.

- `DISCORD_TURN_WEBHOOK_URL` — Vercel Production and Preview. Server only.
- `DISCORD_BOT_TOKEN` and `DISCORD_GUILD_ID` — server only, for exact member lookup.

`api/discord-turn-ping.js` must not log or echo the webhook. The client must not read it, store it, or fall back to a URL in git, a brief, a PR, or a comment. A missing env returns `{ ok: false, reason: 'unconfigured' }` and stays that way until a human sets the env.

## Cursor Cloud specific instructions

- Install with `npm ci` from the repo root. Node 20 or newer. The browser loads Firebase from the gstatic CDN; `npm ci` still installs the locked `firebase` package.
- There is no bundler and no `npm start` or `npm test`. Serve the repo root over HTTP so ES modules load. The environment start command listens on port 8080 (`python3 -m http.server 8080 --bind 0.0.0.0`). Open `http://127.0.0.1:8080/`.
- Rule tests are individual scripts: `node tools/test-<name>.mjs`. `tools/rules-dice.emulator.mjs` needs the Firestore emulator and is not part of that loop.
- Local Play (two factions, Start Game, Confirm a capital) does not need Firebase or Discord secrets. Online play and turn pings use hosting env vars that must not be committed.
