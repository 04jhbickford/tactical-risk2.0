# Multiplayer Robustness Matrix (V2.55 audit)

Systematic audit of player compositions × play modes × version upgrades.
Cells marked ≡ are equivalence classes — testing the canonical cell covers them.
Executable coverage lives in `tools/robustness-harness.mjs` (the deliverable:
run `node tools/robustness-harness.mjs` after any multiplayer change).

## Dimension A — composition (canonical cells)

| Cell | Canonical? | Why / equivalence |
|---|---|---|
| 1H+1AI | ✅ A1 | Minimal host+AI. Covers 1H+2AI, 1H+3AI (≡ more AI turns in sequence — same code path, no second writer exists) |
| 2H+0AI | ✅ A2 | Minimal human-only sync: turn ping-pong, no AI authority at all |
| 2H+2AI | ✅ A3 | THE playtest shape. Host-authority + failover + human/AI interleave. Covers 2H+1AI |
| 3H+1AI | ✅ A4 | >2 writers; failover ordering among several humans. Covers 3H+0AI, 4H+N (≡ more of the same actors; nothing new structurally) |

## Dimension B — play mode

Async vs live is INVISIBLE to the state machine: Firestore persists the doc
between actions regardless of elapsed time; a returning player is exactly the
"rejoin" path. So mode cells reduce to:

| Mode | Reduces to |
|---|---|
| Live | baseline turn cycling (harness: sequential actions, no client teardown) |
| Take-a-turn-and-pass (30s) | rejoin path with fresh client (harness: destroy client, recreate from doc) |
| Async (hours/days) | identical to above — only presence staleness differs (2-min timeout marks them offline; harness: presence=offline for the absent player) |
| Mixed live+async | 2 live clients + 1 recreate-from-doc client |
| Mid-game shift | sequence of the above — no distinct machinery |

Distinct things that DO vary with time and are tested explicitly:
- presence-based failover grace (90s continuous-offline)
- turn-title/notification on rejoin
- no-show forever: game must not softlock — escape hatches are surrender
  (any phase) and, for AI turns, host/failover authority. A no-show HUMAN's
  turn intentionally waits forever (turn timers cut by James) — documented,
  not a defect.

## Dimension C — version upgrades

| Scenario | Handling (V2.55) |
|---|---|
| All same version | baseline |
| Old client + new client mid-game | Every state push now stamps `clientVersion` + `schemaVersion` on the game doc. A client that sees a NEWER writer version shows a persistent "new version available — refresh" banner (action stays allowed; state schema governs actual compatibility) |
| New version between turns / rejoin after redeploy | Rejoin loads fresh code (hosting serves new build on reload) — banner only matters for never-refreshed tabs |
| Join game started on older version | `state.version` (schema, currently 11) is independent of app version; loadFromJSON accepts ≥3 and normalizes known-invalid shapes |
| V2.54 client reads V2.53 doc | ✅ same schema (11); self-heal normalizes the V2.53 corruption |
| V2.53 client reads self-healed doc | ✅ healed docs are strictly valid old-shape (no new state fields added by healing) |
| V2.53/54 client reads V2.55 doc | ✅ `clientVersion`/`schemaVersion` are doc-level fields old clients ignore; state schema unchanged (11) |
| Newer schema than client supports | loadFromJSON warns loudly; banner prompts refresh. Contract: schema bumps must keep loadFromJSON-with-defaults working one version back, or bump the major and block with the banner |
| Force-upgrade | Soft prompt only (banner). Hard blocking rejected for now: an async player mid-turn must never be locked out of finishing |

## Scenario checklist per canonical cell (harness assertions)

- [x] Deployment cycle completes; turn order never rewinds
- [x] Host refresh mid-AI-turn (V2.54 grace — no takeover, no dual writer)
- [x] Non-host refresh mid-turn (recreate from doc; state converges)
- [x] Simultaneous actions by two humans (transactions serialize; loser
      reloads; exactly one write per version)
- [x] Simultaneous refresh by all humans (doc untouched; all converge)
- [x] Surrender during setup / deployment / playing (turn advances, victory
      fires when one left)
- [x] Permanent no-show on an AI turn (host or 90s-failover runs it)
- [x] Permanent no-show on a human turn (game waits by design; other players
      retain Leave/surrender escape)
- [x] Network flake ≡ delayed snapshot + stale push → transaction abort +
      reload (B-series in harness)

## Implementation status (V2.55)

Dimension C is now code-backed, not just documented:
- `src/version.js` — `GAME_VERSION` / `SCHEMA_VERSION` / `compareGameVersions`.
- `syncManager` stamps `clientVersion` + `schemaVersion` on every push and
  fires a one-shot `version_outdated` event on a strictly-newer writer.
- `main.js` renders the persistent refresh banner.
- Harness `C`-series covers version ordering, the banner predicate, the
  fail-safe (missing/garbled stamp → no banner), and emitted-schema parity.

All 33 harness checks (A1–A4, S, N, C) pass: `node tools/robustness-harness.mjs`.

## Known intentional behaviors (not defects)

- A human's turn waits indefinitely (turn timers cut by James, 7.14.26).
- Failover to a second human requires 90s continuous host-offline.
- Mixed hotseat+remote unsupported (one account = one player).
