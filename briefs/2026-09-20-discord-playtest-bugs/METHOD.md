# METHOD — dual-path.9 / .10 combat / air / deploy / mobilize

Quiet James. Tesla off. Dual-fork HARD LOCK.

## Hard lock

Any bug on Classic **or** Experimental → fix **both** unless proven path-specific
(document why). Shared engine first (`gameState`, combat finalize, air landing
plan, move eligibility, carrier placement). Chrome second.

Before READY:

1. Hard-reload stamp match `V2.81.57-dual-path.10`
2. Classic queryless `/`
3. Experimental `?ux=three`

## Stack

`.10` is the merge tip (`.02`–`.07`) on main after PR4 / dual-path.8.

## Scope this tip (B–D + .07)

| Issue | Class | Shared path |
|---|---|---|
| 9.20.26.02 | P0 | `dequeueResolvedCombatHeads` + `applyTerritoryCapture` |
| 9.20.26.03 | P0 | `maxMoveSelection` + combat-move dests |
| 9.20.26.05 | P0/P1 | `resolveLandingDestination` unique keys only |
| 9.20.26.06 | P0/P1 | `clearAirLandingSelections` / landing undo |
| 9.20.26.04 | P1 | one green Done — drop blue duplicate |
| 9.20.26.07 | P0 | `carrierPlacement` + `mobilizeUnit` sea-zone air |

Do not regress `.8` auth persistence or `POST /api/discord-turn-ping`.
