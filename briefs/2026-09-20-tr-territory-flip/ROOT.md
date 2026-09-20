# Territory flip after combat — 20 Sep 2026

P0 live Canvas (`https://tactical-risk20.vercel.app/`, **V2.81.55**).
Players: Robert Watts + Sean Benson (iMessage). Not the Three solo tip.

## Symptoms (as reported)

1. Sean: fighters missing / “lost my fighters” after buy
2. Robert: “hiccup notification” right after combat
3. Territories do **not** flip to the conqueror after combat succeeds
4. NCM: 2 INF West US → East US works; leftover 1 INF cannot go West US → West Canada. Robert suspects West Canada is still German. Map colors inconsistent (West US green, East US orange)
5. Game stalled — cannot take territories

## Diagnostics pull

There is no `tools/pull-game-events.mjs`. The live path is:

```
node tools/query-game-events.mjs --print-query --lobby "<hint>" --around "<time>"
```

See `DIAGNOSTICS.md`. Live list of `games/{id}/events` needs
`FIREBASE_ID_TOKEN` (James signed-in admin). This environment has:

- no `FIREBASE_ID_TOKEN`
- no `FIREBASE_TOKEN`
- no `GOOGLE_APPLICATION_CREDENTIALS`
- no service account in the repo

`--print-query` ran. Live pull was **not** invented. Blocker: admin ID token.

Query plan used (US theater / Robert+Sean, purchase→combat→NCM):

```
node tools/query-game-events.mjs --print-query --lobby "US" --around "21:30 PT 19 Sep"
```

Without a lobby code/name from the table, gameId cannot be resolved.

## Root cause (shared engine, Canvas + hybrid)

`CombatUI._finalizeCombat` **does** set `territoryState[hex].owner = player.id`
when the attacker wins with a land unit. The flip is local and correct.

It then calls `gameState.logCombat({ ..., winner, survivors })` **without**
`attackerLosses` / `defenderLosses`. `logCombat` writes those keys as
`undefined` onto `turnEvents`, which `toJSON()` ships on the game doc.

Firebase JS **10.7.1** (`getFirestore`, no `ignoreUndefinedProperties`)
throws `Unsupported field value: undefined` inside the transaction.

`syncManager._runPushWithRetry` treats that as `push_failed` → toast
**“Connection hiccup — retrying to save your last action…”**. After 3
attempts, `push_exhausted` reloads the last confirmed server doc. The
capture, the purchase, and any other un-persisted mutations vanish.

That is the stall:

| Report | Why |
|---|---|
| Hiccup right after combat | Finalize → `_notify` → poisoned `turnEvents` → Firestore reject |
| Territory does not flip | Owner updated locally, then exhaust reload restores the previous owner |
| West Canada still German | Authoritative state never stored the capture |
| Map colors disagree | Local optimistic paint vs server snapshot (or the other client) |
| Leftover NCM “blocked” | Engine allows a second dest from the same origin **if the dest is friendly**. Enemy West Canada is a legal NCM reject |
| Fighters vanish after buy | Buy after a poisoned combat (or any later push) fails the same way; exhaust reloads and the pending fighters disappear |

Historical rhyme: `BUGS.md` V2.75 Anglo-Sudan — `push_failed ×3` then
`push_exhausted` after combat, yellow toast, fight reappears.

## Not the cause

- Canvas-only renderer. Ownership fill reads `gameState.getOwner`.
- Hybrid / Three tip (PR76). Same `gameState` / `combatUI` / `syncManager`.
- V2.81.54 AA fail-close (that path sets winner=defender; no capture).
- NCM leftover-stack lock. 3 INF → move 2, remaining 1 is still unmoved.

## Fix (main first)

`V2.81.56` on main. SCHEMA 11 unchanged.

1. `logCombat` writes `0` (or provided losses), never `undefined`. Outcome
   uses `winner === 'attacker'`, not `winner === attackerName`.
2. `toJSON()` and `_pushOnce` run `omitUndefinedDeep`.
3. Combat overlay writes `persistableUnit` (no UI-only / undefined fields).
4. `purchaseForMobilization` stamps `owner` so fighters stay in
   `getPendingPurchases()`.

Draft PR (do **not** merge): https://github.com/04jhbickford/Tactical-Risk/pull/82

Hold hybrid PR76 — cherry-pick this commit onto the tip after main is accepted.

## Tip impact

PR76 (`V2.81.55-ux-solo.3`) shares these files. Solo `?three=1` does not
hit Firestore, so the live stall is Canvas MP only. After a main merge,
cherry-pick so the tip does not reintroduce the poison.
