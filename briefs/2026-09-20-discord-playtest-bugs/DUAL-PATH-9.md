# dual-path.9 — combat capture, combat-move, air land, deploy Done

Stamp: **V2.81.57-dual-path.9**. HOLD MERGE. Quiet James.
Rebased onto `main` after PR4 / dual-path.8 landed (`3a460b6`). Do not merge this tip.

Preview (commit `2d16696`+):
- Classic: https://tactical-risk20-8t5wg7kw2-james-projects-20d8de40.vercel.app/
- Experimental: https://tactical-risk20-8t5wg7kw2-james-projects-20d8de40.vercel.app/?ux=three
- Alias: https://tactical-risk20-git-cursor-dual-4601e7-james-projects-20d8de40.vercel.app/

Path map (use; do not re-litigate):

| Issue | Classic | Experimental | Shared? |
|---|---|---|---|
| .02 political control | combatUI + `gameState.resolveCombat` → `captureIfAttackerHolds` | threeSoloPlay `applyHits` hasLand gate + `applyTerritoryCapture` | Yes — land leftover only |
| .03 move all eligible | movementUI `mp-all` / `canMoveTo` + playerPanel Select All | threeSoloPlay `movableStacks` / `eligibleStacks` + All stepper | `maxMoveSelection` + `combatMoveReachableDests` |
| .04 dual Done | playerPanel green only; sidebar finish-placement dropped | three `finishPlacementRound` chrome (single Confirm) | — |
| .05 air land both FTR | combatUI / airLandingUI unique unitKey | startAirLand / applyLanding per-plane ids | airLanding.js |
| .06 air Undo | undoPolicy `undo-air-landing` during COMBAT | `undoLast` handles `play.landing` | `clearAirLandingSelections` |
| ping blank phase | — | — | discordTurnPing `phaseLabelOf` |

## What fixed

| Issue | Fix | Dual-fork |
|---|---|---|
| **9.20.26.02** | Shared `dequeueResolvedCombatHeads` captures when land leftovers hold a hex with no enemy combat units. `_finalizeCombat` / Experimental `applyHits` use `applyTerritoryCapture` (`capturedThisTurn`, factory/AA, card, capital). | Classic `combatUI` + Experimental `threeSoloPlay` |
| **9.20.26.03** | Select All = every eligible stack. Combat move may empty the origin. Experimental dests use shared land/air/sea reachability (friendly transit + attack). All stepper on New UX. | Classic movement UI + Experimental combat stages |
| **9.20.26.05** | Landing resolve/merge/commit never write a type-wide key when units have ids. Each fighter lands on its own dest. | Classic `airLandingUI` / player-panel sheet + Experimental air-land |
| **9.20.26.06** | Undo clears `pendingAirLandings` dests (`clearAirLandingSelections`). Experimental landing undo enabled. | Both |
| **9.20.26.04** | Removed blue inline / placementUI Done. Green thumb or phone-place-done remains. Experimental Confirm unchanged (single gold). | Classic placement + Experimental deploy chrome (already one CTA) |

Telemetry now passes `survivors` so `forcesAfter.attack` is not always `[]`.
Discord `phaseLabelOf` labels setup; content omits a dangling `·` when phase is empty.

## Dual-fork proof notes

Not path-specific. Soft-lock dequeue lived in both Classic overlay and
Experimental `enterCombat` / `resolveNavalQueue`. Same skip-without-flip class.

## Regression 35RB85

Mexico→West US attack stays `captured:false` while defenders live. After the
last defender is gone (or a hiccup dismisses the overlay), dequeue must flip
West US to the attacker if a land unit remains. Attacker wipe must **not** flip.

## READY checklist

- [ ] Hard reload — stamp `V2.81.57-dual-path.9` on Classic `/` and Experimental `?ux=three`
- [ ] **.02 Classic:** land combat win → owner + color flip; survives refresh. Factory-only leftover after a dismissed overlay also flips.
- [ ] **.02 Experimental:** same capture after Confirm: Take hits / Confirm: Take {hex}
- [ ] **.03 Classic:** Mexico — Select All takes every stack; Confirm can empty the origin into a legal dest
- [ ] **.03 Experimental:** All / + to have, then Confirm Attack; leftover stacks remain movable
- [ ] **.05 Classic + Experimental:** two fighters, two dests
- [ ] **.06 Classic + Experimental:** Undo clears both picks; Confirm disabled until reassigned
- [ ] **.04 Classic:** one green Done on Initial Deployment (no blue twin)
- [ ] **.04 Experimental:** single Confirm / Pass
- [ ] Auth return + Discord `POST /api/discord-turn-ping` still work (.8)

HOLD MERGE.
