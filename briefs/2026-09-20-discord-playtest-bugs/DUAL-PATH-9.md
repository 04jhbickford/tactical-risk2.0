# dual-path.9 / .10 — combat + mobilize carrier

Stamp: **V2.81.57-dual-path.10**. MERGE to main → LIVE. Quiet James.
Rebased onto `main` after PR4 / dual-path.8. `.02`–`.06` stay in ship; `.07` added.

Path map (use; do not re-litigate):

| Issue | Classic | Experimental | Shared? |
|---|---|---|---|
| .02 political control | combatUI + `gameState.resolveCombat` → `captureIfAttackerHolds` | threeSoloPlay `applyHits` hasLand gate + `applyTerritoryCapture` | Yes — land leftover only |
| .03 move all eligible | movementUI `mp-all` / `canMoveTo` + playerPanel Select All | threeSoloPlay `movableStacks` / `eligibleStacks` + All stepper | `maxMoveSelection` + `combatMoveReachableDests` |
| .04 dual Done | playerPanel green only; sidebar finish-placement dropped | three `finishPlacementRound` chrome (single Confirm) | — |
| .05 air land both FTR | combatUI / airLandingUI unique unitKey | startAirLand / applyLanding per-plane ids | airLanding.js |
| .06 air Undo | undoPolicy `undo-air-landing` during COMBAT | `undoLast` handles `play.landing` | `clearAirLandingSelections` |
| .07 FTR onto CV in SZ | playerPanel mobilize / placementUI / mobilizeUI | threeSoloPlay `legalPlaceDests` + sea-first `placePending` | `carrierPlacement.js` + `mobilizeUnit` |
| ping blank phase | — | — | discordTurnPing `phaseLabelOf` |

## What fixed

| Issue | Fix | Dual-fork |
|---|---|---|
| **9.20.26.02** | Shared `dequeueResolvedCombatHeads` captures when land leftovers hold a hex with no enemy combat units. `_finalizeCombat` / Experimental `applyHits` use `applyTerritoryCapture` (`capturedThisTurn`, factory/AA, card, capital). | Classic `combatUI` + Experimental `threeSoloPlay` |
| **9.20.26.03** | Select All = every eligible stack. Combat move may empty the origin. Experimental dests use shared land/air/sea reachability (friendly transit + attack). All stepper on New UX. | Classic movement UI + Experimental combat stages |
| **9.20.26.05** | Landing resolve/merge/commit never write a type-wide key when units have ids. Each fighter lands on its own dest. | Classic `airLandingUI` / player-panel sheet + Experimental air-land |
| **9.20.26.06** | Undo clears `pendingAirLandings` dests (`clearAirLandingSelections`). Experimental landing undo enabled. | Both |
| **9.20.26.04** | Removed blue inline / placementUI Done. Green thumb or phone-place-done remains. Experimental Confirm unchanged (single gold). | Classic placement + Experimental deploy chrome (already one CTA) |
| **9.20.26.07** | Air may mobilize onto a friendly carrier in a factory-adjacent sea zone (capacity 2). Classic water dests accept pending air once a CV is there. Experimental dests add that SZ; Confirm places sea first so CV+FTR in one tap works. Undo unloads `onCarrier`. | Classic placement/mobilize UI + Experimental deploy/mobilize chrome |

Telemetry now passes `survivors` so `forcesAfter.attack` is not always `[]`.
Discord `phaseLabelOf` labels setup; content omits a dangling `·` when phase is empty.

## Dual-fork proof notes

Not path-specific. Soft-lock dequeue lived in both Classic overlay and
Experimental `enterCombat` / `resolveNavalQueue`. Same skip-without-flip class.
Mobilize air→SZ was blocked in shared `mobilizeUnit` (factory-only) plus both
chrome filters.

## Regression 35RB85

Mexico→West US attack stays `captured:false` while defenders live. After the
last defender is gone (or a hiccup dismisses the overlay), dequeue must flip
West US to the attacker if a land unit remains. Attacker wipe must **not** flip.

Destroyer→Mexico Sea Zone stays legal. Fighter→same SZ is now legal after a
friendly carrier with an open slot is present (new or already on the board).

## READY checklist

- [x] Hard reload — stamp `V2.81.57-dual-path.10` on Classic `/` and Experimental `?ux=three`
- [x] **.02–.06** still in ship (combat finalize, empty origin, unique land, undo, one Done)
- [x] **.07 Classic:** water mobilize shows FTR + after CV; phone staged Confirm is sea-first
- [x] **.07 Experimental:** `legalPlaceDests` adds SZ with capacity; Confirm CV+FTR loads both
- [x] Auth return + Discord `POST /api/discord-turn-ping` still work (.8)
