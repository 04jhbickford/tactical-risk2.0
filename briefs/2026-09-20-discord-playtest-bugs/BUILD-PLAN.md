# BUILD-PLAN B–D — dual-path.9 / .10

Merge to main. Quiet James.

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

### 9.20.26.07 — cannot place new fighters onto a carrier in a sea zone

Robfox007: 2 FTR + 1 CV bought; mobilize blocked air into the SZ.
Shared `carrierPlacement.js`. `mobilizeUnit` loads air onto a friendly
carrier in a factory-adjacent sea zone. Classic water dests + Experimental
`legalPlaceDests` / sea-first Confirm.

## Proof

`node tools/test-dual-path-9-combat.mjs` plus
`node tools/test-dual-path-9-mobilize-carrier.mjs` plus existing combat /
air / discord / placement / dual-path tests.
