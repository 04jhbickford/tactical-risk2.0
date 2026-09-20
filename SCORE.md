# SCORE — V2.81.56 persist combat capture

Draft PR on **main**. Do not merge. Arc gates James yes.
Hybrid PR76 hold. Tesla off.

## James want

Live Canvas stall (Robert + Sean): combat “wins” but territories do not
flip; hiccup toast; fighters vanish after buy; leftover NCM into West
Canada blocked. Game cannot progress.

## Delivered

| Ask | Score | Notes |
|---|---|---|
| Diagnostics pull | **blocked** | Path is `tools/query-game-events.mjs` (no `pull-game-events.mjs`). No `FIREBASE_ID_TOKEN` / Admin / service account. Query plan printed. Keys not invented |
| Root-cause territory flip | **yes** | Flip is written locally in `_finalizeCombat`. `logCombat` then puts `undefined` losses on `turnEvents` → Firestore reject → hiccup → exhaust reload restores previous owner |
| Fighters after buy | **yes** | Same failed push / rollback. Also `purchaseForMobilization` now stamps `owner` |
| Hiccup after combat | **yes** | `push_failed` toast. Same poison payload |
| Multi-dest NCM leftover | **yes** | Engine already allows it when dest is friendly. Block is “West Canada still German” |
| Shared-engine fix on main | **yes** | `omitUndefinedDeep` in `toJSON` + `_pushOnce`; clean `logCombat`; `persistableUnit` on overlay write-back. SCHEMA 11 |
| Hybrid | **hold** | Same files as PR76 tip. Cherry-pick after main is accepted. Do not merge hybrid |
| Version + this scorecard | **yes** | `V2.81.56` |

## Out of scope (held)

- Merge to main / deploy (James / Arc)
- Hybrid PR76 merge
- Inventing Firebase admin keys
- Live event dump for this table (no lobby code + no admin token)

## Gaps

- Live Robert/Sean events not pulled (token + lobby hint).
- In-flight V2.81.55 table must refresh to 2.81.56 and re-resolve the fight (server never stored the capture).
