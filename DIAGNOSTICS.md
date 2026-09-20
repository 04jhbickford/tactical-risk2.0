# Tactical Risk — Cloud diagnostics

James sends a bug screenshot. Arc pulls `games/{id}/events` for that
game and moment, verifies where in play it happened, then diagnoses.

`combatTelemetry` (SCHEMA 11, last ~40 AA/combat snapshots on the game
doc) stays. Events are the fuller append-only timeline.

## Schema (`EVENT_SCHEMA` 1)

Path: `games/{gameId}/events/{autoId}`

| Field | Type | Notes |
|---|---|---|
| `ts` | number | Client `Date.now()` |
| `turn` | number | `gameState.round` |
| `phase` | string | `lobby` / setup / `playing` |
| `turnPhase` | string | `combat_move`, `combat`, … |
| `playerId` | string | Seat that acted |
| `playerName` | string | Display name |
| `kind` | string | `phase` `move` `attack` `aa` `combat` `purchase` `retreat` `error` `ui` |
| `territory` | string\|null | Named hex when relevant |
| `payload` | map | rolls[], hits, forces before/after, ipcDelta, error, `softLockEscape` |
| `writerUid` | string | Auth uid that appended |
| `clientVersion` | string | e.g. `V2.81.55` |
| `eventSchema` | number | `1` |
| `lobbyCode` | string\|null | 6-char code when known |

Writes are fire-and-forget. A failed append never blocks gameplay.

## Rules

- **Create:** signed-in seated player (`playerUserIds`), game `startedBy`, or admin. `writerUid` must match `request.auth.uid`. Append-only (`update`/`delete` denied).
- **Read:** **admin only** (`bickford.james@gmail.com`). Bulk pull is not a player API.
- Deploy rules with `firebase deploy --only firestore:rules` from clean `main` (not this draft). Hosting-only deploys will not install the `events` match.
- Players cannot list another table’s events from the client.

## How Arc pulls

1. Read the screenshot / Slack note for **lobby name or code**, **time** (PT), and **territory**.
2. Resolve `gameId`:

```
lobbies where name == "<hint>"
lobbies where code == "<HINT>"
games   where lobbyCode == "<HINT>"
games   where code == "<HINT>"
```

A started lobby stores `gameId`. Use that, or the matching game doc id.

3. Pull events (equality only — no composite index):

```
games/{gameId}/events
  optional: kind == "aa" | "combat" | …
  optional: territory == "Western United States"
  optional: turn == 3
```

4. Apply the time window **client-side** (`ts` between since/until).
   Do not add a `territory + ts` range query (`firestore.indexes.json` is empty on purpose).

### CLI

```
node tools/query-game-events.mjs --print-query --lobby boysenberry --territory "Western United States" --around "10:34 PT 19 Sep"
```

`--print-query` always works (no keys). Live pull needs
`FIREBASE_ID_TOKEN` (James signed-in admin token). This repo does not
ship a service account.

In a running admin tab: `window.__TR_DIAG__.recent()`, `.filter({ territory, kind })`, `.parseScreenshot(text)`.

## Screenshot → query

Example: *Sean, boysenberry, ~10:34 PT 19 Sep, AA over Western US*

1. `parseScreenshotHint("boysenberry ~10:34 PT 19 Sep")` → lobby hint + ±20 min window (PT as UTC−7 in Sep).
2. Resolve lobby/game as above.
3. Filter events: `kind` in `aa|combat|ui`, `territory` if named, `payload.softLockEscape` for fail-closes / dequeues / End Battle.
4. Cross-check `state.combatTelemetry` on the game doc (last 40 AA/combat dice). Events are the rest of the turn (phase, move, purchase, retreat, client errors).

## Instrumented

| Path | kind | Where |
|---|---|---|
| Phase / turn advance | `phase` | `gameState.nextPhase` / `nextTurn` |
| Unit move | `move` / `attack` | `gameState.moveUnits` |
| Purchase / undo cost | `purchase` | `addToPendingPurchases`, `purchaseForMobilization` |
| Income | `ui` (`collectIncome`) | `_collectIncome` |
| Combat / AA dice | `combat` / `aa` | `recordCombatTelemetry` (UI + AI `resolveCombat`) |
| Retreat | `retreat` | `retreatToTerritory` |
| Queue dequeue / AA wipe / End Battle | `ui` + `softLockEscape` | `combatUI` |
| Cards / tech / capital / mobilize | `ui` | ActionLog fan-out |
| Uncaught `error` / `unhandledrejection` | `error` | `installClientErrorHooks` |
| MP session start | `ui` (`sessionStart`) | `main.js` |

Dice faces come from shared `_rollDie`. They land in `aa`/`combat` payloads and in `combatTelemetry`. `_rollLog` stays in-memory only.

## Retention

- Events are **not** pruned by the client.
- Deleting a game doc does **not** cascade-delete `events` (Firestore). Orphans stay until an admin recursive delete.
- Suggested keep: 90 days, then purge finished games’ `events` by hand or a future Cloud Function. No function ships in this PR.
- `combatTelemetry` remains capped at 40 on the game doc so the main state blob stays small.

## Local / solo

No `gameId` → no cloud write. The in-memory buffer exists only while a multiplayer log is bound.
