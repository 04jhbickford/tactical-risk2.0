# Catalog lookpass — V2.81.56-ux-solo.18

Catalog folder was not in the PR76 checkout (same as `.16`). This note logs **steal vs invent** for the playthrough tip against the patterns James named (SANDBOX-RECS §A + GAPS P1 #7 phase gates).

## Steal

- `bgio-moves-phases-stages` (GAPS P1 #7) — Collect Income is an explicit Confirm gate before `nextPhase` / `_collectIncome`.
- `aa-combat-dice-calc-pattern` — combat dice use CombatUI tech + artillery, not raw `unitDefs`.
- `aa-1942-seat-combatants` — each nation is a seat card; occupant is **Human / AI / Empty**; Start stays dead until the config is legal (local: ≥2 seats and at least one Human).
- `bgio-lobby-seat-picker` / `bgio-local-pass-and-play` — explicit seat list (all 5 factions always listed); Empty clears; two Humans is legal local pass-and-play.
- `root-digital-lobby-hud` — faction card is seat identity (name + color pip); home already has Local / Online (Online stays off this tip).

Easy / Med / Hard are **AI tiers under the AI occupant**, not a fourth occupant kind. Empty is the clear.

## Invent

None of the grammar. Tip glue is `seatOccupantView()` / `setLobbyOccupant(..., 'empty'|'ai'|tier)` over existing `selectedPlayers` + `playerAI`.

## Keep

- `.15` touch-pan shell (MAIN `pan-y`, footer sibling, click-only lobby activate). Viz SCORE `.16` hold was **PARTIAL** (`overflow:visible` only) — `.17` re-proves CDP T1–T5 (`MAIN.scrollTop` moves, `body.scrollY` 0) after seat CSS. Do not READY on CSS inspection.
- `.16` combat nested stages (`playStage` ORIGIN→UNITS→DEST→CONFIRM). P1 casualty YOU steppers **REACHED** `.18` — YOU tiles tap-assign; THEY `pointer-events:none`; Confirm gold Take hits.
- `.17` seat cards. Lobby CSS unchanged this tip (no CDP re-prove).
- Stamp SoT (`__TR_GAME_VERSION`, `no-store` `/`, grow-to-fit `overflow:visible`)

Full SCORE: `briefs/2026-09-19-hybrid-solo-ai/SCORE-solo-18.md`.  
Playthrough: `briefs/2026-09-19-hybrid-solo-ai/PLAYTHROUGH.md`.
