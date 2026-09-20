# BUILD-PLAN B–D — dual-path.9

Hold merge. Quiet James.

## B — P0

### 9.20.26.02 — taking a territory does not grant political control

Cloud: Game **35RB85** / `game_1789941856991_tsdneoz54`.
Mexico→West US `captured:false` (defenders present — expected). Combat
telemetry `forcesAfter.attack:[]` was a **logging hole** (`survivors` never
passed; not proof the attacker wiped). Then `softLockEscape`
`dequeue_resolved_combat_heads` skipped West US **without** flipping owner.

Shared fix: `src/state/combatFinalize.js`. When a queue head is already
resolved on the board (no enemy combat units, land leftovers), dequeue
**captures**. Attacker wipe / air-only do not flip. Classic `combatUI` and
Experimental `threeSoloPlay` both call the same helper.

### 9.20.26.03 — cannot move all eligible units (Mexico)

Combat move may empty a territory. Classic Select All was tab-scoped (land
left air behind). Experimental dests were adjacent-enemy only (no friendly
transit / land reachability). Shared `maxMoveSelection` +
`combatMoveReachableDests`. Experimental steppers gain All.

## C — P0/P1

### 9.20.26.05 — one fighter landing forced both

Type-wide landing keys (`fighter: dest`) and `mergeLandingSelections` writing
`unit.type` assigned every same-type aircraft. Unique id / `type_index` only.
Experimental pending air now expands one row per plane.

### 9.20.26.06 — air-land Undo

Undo cleared local UI only. `_mergedAirLandingSelections` re-applied
`pendingAirLandings` dests. Shared `clearAirLandingSelections`. Experimental
landing undo now clears pick + dest + pending.

## D — P1

### 9.20.26.04 — two Done buttons

Blue = `.pp-action-btn.primary` in inline placement + leftover
`placementUI` copy. Green = `.pp-confirm-btn` / `.phone-place-done`.
Keep green. Experimental already has a single Confirm (`passLabel`).

## Polish

`phaseLabelOf` + `buildDiscordTurnContent` so
`your turn — Russians ·` is not blank-tailed.

## Proof

`node tools/test-dual-path-9-combat.mjs` plus existing combat / air / discord /
placement / dual-path tests.
