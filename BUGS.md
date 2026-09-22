# Tactical Risk — Bug & Debug Log

---

## 9.21.26.13 — dual-path.17 lobby chrome

Stamp `V2.81.57-dual-path.17`. Turn-change Discord pings stay paused.

- [x] **9.21.26.13 Rob** Game lobby chrome, both forks. **Unlist Game** (host) writes `isPublished: false` and stays in the room, so the lobby drops out of Open Games. **Main Menu** (host and player) returns to Main Menu and does not write the listed flag. Classic `?ux=classic` and Experimental `/` share `lobbyChromeStatusAfter`.
- [x] Classic | Experimental is an explicit lobby choice again on both home screens (`lobbyInterfaceChoices`). Queryless `/` stays Experimental. Choosing Classic sets `?ux=classic`.
- [x] dual-path.16 still holds: per-row combat Undo, My Games waiting → Resume lobby.

Receipt: `node tools/test-dual-path-17-playtest.mjs`.

---

## 9.21.26.12 + 9.21.26.05 — dual-path.16

Stamp `V2.81.57-dual-path.16`. Turn-change Discord pings stay paused.

- [x] **9.21.26.12** Per-row combat-move Undo. History entries are addressable (`mvN`). Undoing a row reverts that move and any later continuation of the same units, newest first. Independent rows stay. **Undo all** clears the unlocked suffix. Classic recent-move list and Experimental combat-move list both call the shared engine. Locked prefix (after leaving combat move) and combat-resolve stay refused. Retreat still reads the full history.
- [x] **9.21.26.05 Rob** A waiting lobby in My Games opens the room (`Resume lobby` / `open-lobby`). A started match (`active` / `starting`, or saved state) still rejoins the map. Classic Game List and Experimental My Games (`screen=games`) share `resolveMyGamesEntryAction`. Remembered last-match no longer keeps a stale started `gameId` while the lobby is still waiting.
- [x] Lobby chrome no longer offers Classic as a path. Queryless `/` is Experimental (`three`). `?ux=classic` remains the deep link. Classic 1942 is still a local game-mode option.

Residual: `moveHistory` is not in `toJSON()` (`SCHEMA_VERSION` stays 11). A reload or snapshot clears the undo list. That was already true for the stack.

Receipt: `node tools/test-dual-path-16-playtest.mjs`.

---

## 9.21.26.06–.11 — dual-path.15 playtest cluster

Stamp `V2.81.57-dual-path.15`. Classic `/` and Experimental `?ux=three` share the engine. Turn-change Discord pings stay paused.

- [x] **9.21.26.10** Carrier fighters are a selectable combat move. `moveUnits` launches the shortfall off `carrier.aircraft`. Classic keys `aircraft:` rows; Experimental `movableStacks` includes them. Sea-zone Attack uses enemy ships, not a land owner.
- [x] **9.21.26.11** Combat-move air dests require a legal landing inside movement left (start-of-turn friendly land or a carrier). West Mediterranean → West US is distance 4 on the real map, so range alone used to offer it with 0 left. Moved aircraft with no origin no longer get a fresh full move from the battle hex.
- [x] **9.21.26.08** Choosing the battle sea zone loads onto the carrier and is not a crash. Classic `_finalizeCombat` merges the live `carrier.aircraft` back onto the overlay rebuild.
- [x] **9.21.26.09 / 09b** Sea mobilize spends a factory cap and individualizes the carrier. Two factories on one sea zone return `ambiguous` until `sourceFactory` is chosen (Classic picker, Experimental tap).
- [x] **9.21.26.06** Snapshots swallowed while `isPushing` are flushed after the push when the remote doc is newer or the seat changed.
- [x] **9.21.26.07** Air cannot NCM onto land captured this turn. Leaving combat or NCM relocates or crashes that air. `capturedThisTurn` clears on `nextTurn`.
- [x] Captured factory cap verified: not the player's `capitalTerritory`, so the limit is 5.
- [x] **9.21.26.12** Out-of-order / per-row undo of combat moves. Shipped in dual-path.16 (`undoMoveById` / Undo all).
- [ ] Naval battle report defender dice. Experimental `battleCard` already shows atk/def lanes. Classic defender dice stay in the expanded casualty view. Deferred.
- [x] **9.21.26.05 Rob** My Games must not act as Rejoin on a waiting lobby. Shipped in dual-path.16 (`open-lobby`). Distinct from the dual-path.14 ownership chrome that shared the .05 label.

Receipt: `node tools/test-dual-path-15-playtest.mjs`.

---

## 9.21.26.05 — unoccupied land loses political control notation (dual-path.14)

Playtest (Bastion / crusader_bastion) on `V2.81.57-dual-path.13`. Discord turn
pings stay paused.

1942 setup owns 15 land territories with zero units (Mexico, Brazil, Spain,
…). Experimental `?ux=three` only painted a faction chit when a stack
existed (`layoutAllPreviewStacks` skips empty lists), and the peek fell
back to `originalOwner`. Classic already drew ownership flags from
`getOwner` with no unit check, but a flag image that had not decoded yet
drew nothing — so an empty tile could sit blank until the next dirty paint.

Shared `politicalControlMarks`: seated land owner, including zero units.
Neutral / uncontrolled stay unmarked. Sea zones are not marked. Classic
keeps the flag pass (color plate if the flag file is not ready). Experimental
boot and preview call that same pass (`always`, lifted off the chit).
Peek names the political owner. Stamp `V2.81.57-dual-path.14`.

### Smoke (this PR)

- [x] Experimental `?ux=three&mode=classic&go=1`: empty Spain peek reads `British · 1 IPC`; map shows owner flags on empty land (Spain, Persia, and others in the Europe fit)
- [x] Classic `/` local map: Mexico with its infantry removed still shows the German control flag. Stamp `V2.81.57-dual-path.14`. No three chrome
- [x] Neutrals and sea zones are excluded by `politicalControlMark` (no new sea chip)
- [x] `.13` regression: `node tools/test-dual-path-13-playtest.mjs`
- [x] Discord turn ping stays soft-fail: `node tools/test-discord-turn-ping.mjs`
- [x] `node tools/test-political-control.mjs`

---

## 9.21.26.01–.04 — combat-move sea attack, air land, prior-turn air, save (dual-path.13)

Playtest (Robfox007 + Bastion) on `V2.81.57-dual-path.12`. Discord turn pings stay paused.

Shared rules, both forks:

- **.01** Land-only combat move never lists or accepts a sea zone as an attack
  dest. Air can still attack an enemy sea zone. Transport load stays a
  non-combat load, not an Attack.
- **.02** After combat and after NCM, loose fighters/bombers land on the
  nearest friendly territory or a friendly carrier. No legal landing crashes
  them. They cannot end the phase over open water. Experimental landing
  includes carriers.
- **.03** Turn start clears `moved` on carrier aircraft and cargo. A refresh
  into Research/Purchase clears a stuck prior-turn flag. Failed sea landings
  put the aircraft back instead of deleting them.
- **.04** Every board notify bumps `actionSeq` and autosaves. A cloud snapshot
  does not apply while a move/air gesture is in progress unless the remote
  seq is strictly newer.

Stamp `V2.81.57-dual-path.13`.

### Smoke (this PR)

- [ ] Classic `/` and Experimental `?ux=three`: land-only combat move does not offer East US Sea Zone as Attack; fighters still can
- [ ] After combat, a fighter left in a sea zone is on land or a carrier before NCM; same after NCM
- [ ] Next turn, that fighter can be selected and can attack
- [ ] Refresh after a combat move restores the move; mid-selection is not replaced by an older snapshot
- [x] `node tools/test-dual-path-13-playtest.mjs` passes (full `tools/test-*.mjs` suite too)
- [x] Browser: Classic `/` and `?ux=three` both show `V2.81.57-dual-path.13`. Loaded modules: land-only combat dests are East Canada only; fighter dests still include East US Sea Zone. Full East-US click-path on a started 1942 match was not played through in the browser.

---

## 9.20.26.08 / .09 — lobby Back + refresh (dual-path.12)

Playtest (Robfox007 + Bastion): Host in a listed waiting Game Lobby tapped Back —
Open Games flashed then the room snapped back. No exit. Refresh from that
path landed on an open map as if the game had started. List in Open Games
needed a second click.

Shared `lastMatch` lobby-nav: explicit Back / Browse leave the VIEW (Firestore
lobby stays listed). Snapshot flicker still restores (B41). Cold boot /
refresh auto-resumes only a started `gameId` (B38), not lobbyCode-only.
Classic `multiplayerLobby` silent-disconnects to Open Games. Experimental
three chrome detaches room → Play Online → Main. Stamp
V2.81.57-dual-path.12.

### Smoke (this PR)

- [ ] Classic `/` host listed lobby: Back stays on Open Games; Back again → Main
- [ ] Classic refresh / reopen from that path → Main Menu (not a started map)
- [ ] Experimental `?ux=three` room Back → Play Online → Main; no snap-back
- [ ] Experimental refresh / reopen → Main Menu
- [ ] `.02`–`.07` + combat soft-lock still PASS (no rule rewrite)
- [ ] Classic `/` + Experimental `?ux=three`: one **List in Open Games** click lists
- [ ] `node tools/test-lobby-nav.mjs` passes

---

## 9.21.26.11 — Experimental desktop chrome (dual-path.11)

Wide chrome is grow-frame dual rails (not phone UI scaled to 1280).
Phone @390 stays on the `.6`/`.10` bottom-sheet tree. Classic `/`
untouched. Rules dual-fork from `.02`–`.10` not edited. Stamp
V2.81.57-dual-path.11. READY stills. HOLD MERGE. Parent wakes Viz.
See `briefs/2026-09-20-dual-path-three-ux/DESKTOP.md`.

### Smoke (this PR)

- [x] Classic `/` stamp `.11` — no `three-spike`; map 1280×801
- [x] Experimental `?ux=three` @390 — MAIN 14,66,362×657; Confirm 56px; bottom 0,738,390×106
- [x] Experimental @1280 — map 220,52,760×749; left 220; right 300; top 52; 3-col home
- [x] `node tools/test-experimental-desktop-chrome.mjs` passes

---

## 9.20.26.07 — mobilize fighters onto carrier in sea zone (dual-path.10)

Playtest (Robfox007): bought 2 FTR + 1 CV; mobilize could not place new
fighters onto the carrier in a sea zone. Air place into SZ was blocked
before write (35RB85: destroyer→Mexico Sea Zone OK, no fighter→SZ events).

`mobilizeUnit` only accepted factory land for air. Classic water dests
were naval-only; Experimental `legalPlaceDests` was factory-only for air.
Shared `src/state/carrierPlacement.js`: factory-adjacent SZ + friendly
carrier capacity. Sea-first Confirm so CV lands before FTR. Stamp
V2.81.57-dual-path.10. See
`briefs/2026-09-20-discord-playtest-bugs/DUAL-PATH-9.md`.

### Smoke (this PR)

- [ ] Classic `/` + Experimental `?ux=three` stamp `.10` after hard reload
- [ ] Mobilize: place CV in factory-adjacent SZ, then 2 FTR onto that CV
- [ ] Same Confirm (Experimental) with CV+FTR selected loads both
- [ ] Undo unloads the last fighter back to pending
- [ ] `node tools/test-dual-path-9-mobilize-carrier.mjs` passes

---

## 9.20.26.02–.06 — combat capture, combat-move, air land, deploy Done (dual-path.9)

Playtest (35RB85 / Mexico→West US): taking a territory did not grant
political control. Soft-lock dequeue skipped the hex without finalize.
Also: could not empty Mexico on a legal combat move; one fighter landing
forced both; air-land Undo no-op; two Initial Deployment Done buttons
(blue + green).

Shared finalize + unique air-landing keys + Select All all stacks + one
green Done. Still in ship on dual-path.10. See
`briefs/2026-09-20-discord-playtest-bugs/DUAL-PATH-9.md`.

### Smoke (this PR)

- [x] Land combat win flips owner on both forks; 35RB85 dequeue leftover also flips
- [x] Mexico combat move can send every eligible unit
- [x] Two fighters land in two dests; Undo clears both
- [x] One green Done on Initial Deployment
- [x] `node tools/test-dual-path-9-combat.mjs` passes

---

## 9.20.26.01 — auth return zombie + Discord server ping (dual-path.8)

Playtester Rob: return to login showed a non-player / `Player` half-session.
Must Sign Out then Sign In. Welcome used `user?.displayName || 'Player'` and
Experimental `ensureAuth` did not wait for `authReady`.

Fix: `authSession` — real identity or clean Sign In, never invent `Player`.
Hydrate displayName from Firestore. Quiet token refresh on tab return and
network-back (no sign-out). Discord production path is Vercel
`POST /api/discord-turn-ping` (`DISCORD_TURN_WEBHOOK_URL` server env on
Production + Preview). Client never holds the webhook. Stamp
V2.81.57-dual-path.8. Hold merge. See
`briefs/2026-09-20-dual-path-three-ux/AUTH-DISCORD.md`.

---

## 9.20.26 — V2.81.56 persist combat capture (SCHEMA 11)

P0 live Canvas, Robert Watts + Sean Benson. Combat “wins” but
territories do not flip; hiccup toast; fighters vanish after buy;
leftover NCM West US → West Canada blocked; game stalled.

Cause: `logCombat` wrote `undefined` `attackerLosses`/`defenderLosses`
into `turnEvents`. Firestore 10.7.1 rejects undefined on the game doc.
`push_failed` → “Connection hiccup” → exhaust reload restores the last
confirmed owner. Capture, purchases, and later NCM never persist.
NCM leftover stack is fine; dest was still enemy.

Fix: `logCombat` writes 0 / provided losses; `toJSON` + `_pushOnce`
`omitUndefinedDeep`; combat overlay writes `persistableUnit`;
`purchaseForMobilization` stamps `owner`. GAME_VERSION V2.81.56.
Draft only — do not merge without James. Hybrid PR76 hold (cherry-pick).

Live events: not pulled. CLI is `tools/query-game-events.mjs`. No
`FIREBASE_ID_TOKEN` / admin / service account in this environment.

### Smoke (this PR)

- [ ] Human land combat win on Canvas MP: territory color + owner flip
      and stay flipped after a refresh. No hiccup toast.
- [ ] Buy fighters during purchase: they remain in the queue through
      the next phase / a refresh.
- [ ] NCM: move 2 of 3 INF off an origin, then the leftover 1 into a
      **friendly** second dest.
- [ ] `node tools/test-territory-flip-persist.mjs` passes.

---

## 9.19.26 — V2.81.55 cloud game-log + diagnostics (SCHEMA 11)

James want: screenshot → Arc pulls cloud events for that game/moment →
verify where in play it happened → diagnose/fix.

Delivered: append-only `games/{id}/events` (fail-closed). Kinds
phase/move/attack/aa/combat/purchase/retreat/error/ui. Dice faces via
shared `_rollDie` land in aa/combat payloads. Existing
`combatTelemetry` (last 40 on the game doc) kept; AI `resolveCombat`
now records it too. Lookup: `tools/query-game-events.mjs` +
`DIAGNOSTICS.md` + `window.__TR_DIAG__`. Rules: seated/startedBy
append; admin-only read; no update/delete. SCORE.md. GAME_VERSION
V2.81.55. Draft only — not production. No admin keys invented.

### Smoke (this PR)

- [ ] Multiplayer fight: `games/{id}/events` grows after phase, move,
      AA/combat, purchase. A thrown write does not freeze the board.
- [ ] Admin can list events; a seated non-admin cannot.
- [ ] `node tools/query-game-events.mjs --print-query --lobby boysenberry --around "10:34 PT 19 Sep"`
      prints lobby → gameId → client-side window.
- [ ] `state.combatTelemetry` still present after a fight (SCHEMA 11).

---

## 9.19.26 — V2.81.54 AA wipe soft-lock (SCHEMA 11)

Sean Benson, game code/name `boysenberry`, ~10:34 PT 19 Sep. After AA
shot down all of Sean's aircraft: combat continued with 0 attackers,
stuck on the dice/rolling overlay (no Retreat, no progress). Reload
did not clear it (queue + board still looked like a live fight). Sean
resigned. Also reported 94 IPC lost to Rob's 12.

Cause: AA casualties lived only in the overlay (`combatState`). They
were not written to `gameState.units` until Next → `_finalizeCombat`.
`combatQueue` stayed populated. Reload / resync called `showNextCombat`,
which only skipped 0-*defender* leftovers, so a 0-*attacker* leftover
reopened as `ready` / Roll Dice. Phone `rolling` has no CTA, so a 0-unit
roll could not exit. Same-type air stacks could under-apply AA hits
(`selected[type] = take` overwrote). Dice never reached Firestore:
`actionLog` / `_rollLog` / `combatLog` are in-memory; combat UI rolled
`Math.random()` directly and skipped `_rollDie`.

Fix: sync AA losses immediately; Continue after an attacker wipe
finalizes (idempotent). Dequeue 0-attacker queue heads. Never open or
roll combat with 0 attackers — fail-close to defender holds + End
Battle. Persist last 40 AA/combat snapshots on the game doc
(`combatTelemetry`, additive SCHEMA 11). Route combat dice through
`_rollDie`. GAME_VERSION V2.81.54. Do not merge without James.

Boysenberry dice dump: not recoverable from this environment (Firestore
reads require auth; no service account; no persisted roll history on
the live schema). 94-vs-12 luck vs bug cannot be proven from logs. AA
hits only on 1; wiping a ~94 IPC air force in one volley is not
plausible luck if N is more than a couple of aircraft.

### Smoke (this PR)

- [ ] Air-only attack into AA: every aircraft dies to AA → Continue
      shows defender holds / End Combat Phase. No Roll Dice.
- [ ] Reload on that screen (or after Continue) does not reopen the
      fight. Combat phase can end.
- [ ] If the overlay is already on Rolling with 0 attackers, End Battle
      dismisses it.
- [ ] After the next live fight, `gameState.getCombatTelemetry()` (or
      the game doc `state.combatTelemetry`) has AA/combat rolls + unit
      counts.

---

## 9.19.26 — V2.81.53 NCM Done at 0 air remaining (SCHEMA 11)

Follow-up to V2.81.52 (same Robert Watts + Benson thread, desktop
screenshot). Sidebar showed TripleA-class "Move Air Units To Landing
Zone" and green "0 / 2 UNITS REMAINING"; fighters sat on Eastern US;
transport was in Inland Sea; Done still would not click.

Cause: End Phase hid for the entire air-landing overlay
(`airLandingActive` → no Done), and Confirm used a single unit-key
shape so a complete-looking remaining counter could still leave Confirm
disabled. Combat-queue also greyed End Phase after landings were named.
`applyPendingAirLandings` ran only on COMBAT→NCM, so a leftover NCM
overlay never committed on Done.

Fix: remaining count uses id / type_index / type / pending dests.
End Phase / Done is offered and enabled at 0 remaining (combat queue
does not grey it). Next Phase commits named landings, then advances
once the current battle is finalized. Any phase advance applies leftover
pending dests. SCHEMA 11. GAME_VERSION V2.81.53.
No Three.js. Do not merge without James.

### Smoke (this PR)

- [ ] After combat, pick Eastern US for each AF. Units land there.
      Confirm / Done is enabled at 0 / N remaining.
- [ ] NCM leftover overlay at 0 remaining: Done is clickable (not grey),
      completes NCM even after a transport moved to Inland Sea / SZ1.
- [ ] Leftover dest with 0 staged units still does not steal Done.
- [ ] Combat / Fortify Confirm (dest + units) still hides End Phase
      until the move commits.

---

## 9.19.26 — V2.81.52 post-combat air landing + NCM Done (SCHEMA 11)

Robert Watts + Sean Benson (iMessage 19 Sep ~9:44am PT), live main
multiplayer: after combat the UI asked where to land Air Force; Robert
selected Eastern US for each aircraft. Non-combat opened and those air
units had not moved there. Then NONCOMBAT MOVE — transport had moved to
Inland Sea (Sea Zone 1) — Done / End Phase was not clickable.

Cause (generic, not one hex): post-combat landing dests lived only in the
combat overlay / player-panel map. `applyAirLandings` was listed on the
multiplayer guard but did not exist. `pendingAirLandings` was never
written and was wiped on every `loadFromJSON`. Confirm used a single
unit-key shape, so a selected Eastern US could fail to apply; `_finalizeCombat`
then left the aircraft on the battle hex (`moved: true`), so NCM could
not fly them home. Separately, End Phase hid behind a named dest even
when no units were still staged — a leftover Inland Sea dest after the
transport moved painted a disabled Confirm and stole Done.

Fix: record each landing on `gameState` as it is picked; persist
`pendingAirLandings` in toJSON; `applyAirLandings` moves them on the
board (id / type_index / type keys). Confirm, overlay-gone, NCM entry,
and resync all apply leftover dests. End Phase stays up unless a legal
move is staged (dest + count). SCHEMA 11. GAME_VERSION V2.81.52.
No Three.js. Do not merge without James.

### Smoke (this PR)

- [ ] After a land battle with surviving fighters, pick Eastern US (or
      another friendly-at-start land) for each aircraft → Confirm.
      Those aircraft are on that land when NCM starts, not on the battle hex.
- [ ] Same flow in multiplayer: partner sees the landed aircraft without
      a refresh. Reload mid-landing still applies the named dests.
- [ ] NCM: move a transport into a sea zone (Inland Sea / SZ1). End
      Non-Combat Movement is clickable. A leftover dest with 0 units
      staged must not hide / disable it.
- [ ] Combat / Fortify Confirm (dest + units) still hides End Phase
      until the move commits.
- [ ] No-option aircraft still crash. Staying on a friendly-at-start
      battle hex still works.

---

## 9.17.26 — V2.81.51 mobile combat-move Confirm (SCHEMA 11)

Sean Benson + Robert Watts (iMessage 17 Sep ~1:11pm PT): Sean was not sure
how to do combat movement on mobile. Robert wanted two steps like purchase:
tap territory, tap each unit, then an explicit Deploy / named Confirm.
He figured it out, but the flow was not purchase-class.

Cause (generic, not one stack / one dest): phone pair grammar hid Confirm
(`shouldHidePhonePairConfirm`) and `_commitPhoneIconMove` executed on the
unit-icon tap once a dest was named. Copy / tips still said “then Confirm”.
Purchase and Place Capital stage then name the thumb; combat / fortify did
not. Dest-first + silent commit, or unit taps that staged nothing until a
dest existed, made the phase look broken.

Fix: Combat Move / Fortify (same path) stage on unit tap / Max, then a
≥44pt named Confirm (`Move to X` / `Attack X`). Deploy / mobilize still
icon-commit. One bottom surface. No rule / map / schema change.
SCHEMA 11. GAME_VERSION V2.81.51. Draft only — not production.

Discarded: restoring Confirm on deploy (V2.81.38 icon-commit stays);
auto-move on dest tap; a second body Confirm; changing dest legality.

### Smoke (this PR)

- [ ] Phone Combat Move: tap stack → tap units (they stage) → tap
      highlighted dest → Confirm reads Move to / Attack that land.
- [ ] Mixed stack: tap infantry then tank, one Confirm moves both.
- [ ] Max fills that type only; Confirm still required.
- [ ] Fortify / non-combat move uses the same named Confirm.
- [ ] Deploy / Place Capital / purchase Confirm grammar unchanged.
- [ ] 390 + 500: one bottom surface; Confirm ≥44pt above the home indicator.

---

## 9.17.26 — V2.81.50 MP seat-loss / Easy Bot replace (SCHEMA 11)

Live Canvas multiplayer (~V2.81.49): Sean Benson appeared skipped in turn
order; Robert got YOUR TURN twice. Open Games card seats were Robert007,
Easy Bot, Easy Bot, Bastion — Benson missing. Seat-loss / bot-replace, not
a pure turn-index skip.

Cause: lobby join used `arrayUnion`, but host Add AI / faction patch /
Start wrote the full `players` array from stale `this.currentLobby`. A
join that landed after the host's last snapshot was overwritten. Host
thought the table was 3/4, added Easy Bot, and the game doc was stamped
with `lobbyData.players` + `playerUserIds` that never included Benson.
Host then auto-played that Easy Bot seat, so Benson never got a turn and
the next human (Robert) looked like YOUR TURN twice.

Fix: join / patch / addAI / removeAI / leave / start apply seat transforms
to the latest lobby doc inside a Firestore transaction. Start copies that
fresh roster onto the game doc. Open Games / My Games titles prefer live
`state.players` names when present. SCHEMA 11. GAME_VERSION V2.81.50.
No Three.js.

### Smoke (this PR)

- [ ] 4-max lobby: human joins the last seat while host Add AI is in
      flight — joiner stays; Add AI returns "Lobby is full" (no extra Easy Bot).
- [ ] Host picks a faction after a guest joins — guest remains on the card.
- [ ] Start after a late join — Open Games / My Games lists the joiner, not
      a replacement bot. `playerUserIds` includes the joiner.
- [ ] Two humans + 2 Easy Bots: each human gets a seat in turn order; host
      AI does not consume a human seat.
- [ ] Existing 2-human / rejoin / Resign / all-resign delete unchanged.

---

## 9.16.26 — V2.81.49 deploy locks after one unit type (SCHEMA 11)

Robert Watts + Sean Benson on live V2.81.48 (16 Sep ~3:37pm PT): during
Initial Deploy / purchase-deploy, after placing **one unit type** they
could not deploy another type until a full browser refresh. Sometimes they
could not place anything at all until refresh. Blocked finishing the round.

Cause (generic, not one type / one seat): `shouldIgnoreQueueRetarget` used
`_lastQueueUnitType` (the previous row) as the lock. Confirm clears the
queue but left that leftover type. The next + / Max on type B stamped
`_lastQueueGestureAt = now` and then looked like a B30 mid-render retarget
(elapsed ≈ 0), so the increment was discarded and the lock window refreshed.
Type A could still stage (same-type is not a retarget). Exhaust type A
(or Max it) and every remaining tap is type B → empty place. Refresh was
the only client reset. Same path for Local and Online; MP sync overwrite
of the pending queue was checked and is not required for the lock.

Fix: retarget lock is **this pointer** (`_queueLockType`) only. After
Confirm / a consumed pair, `resetPlaceQueueGestureState` drops leftover
last-row lock so type B (or the same land) can stage and Confirm again.
B30 Destroyer→Transport mid-gesture retarget still ignored. Confirm + Max
grammar unchanged. SCHEMA 11. GAME_VERSION V2.81.49.

---

## 9.15.26 — V2.81.48 stuck Rejoin / Sign-in-dropped loop (SCHEMA 11)

Robert (via James): every return to the site while still in an online match
shows ONLINE MULTIPLAYER → “Still in the match” → “Sign-in dropped” → gold
“You were away — still in 3RVNJU” → Rejoin → Leave this match. Workaround
was Leave → sign out → sign in. Desired: return / Rejoin restores the live
match. Any player, any live code.

Cause (generic, not 3RVNJU-only):
1. V2.81.47 paints reconnect immediately on lastMatch so the branded loader
   cannot hang — but `_renderReconnect` always said “Sign-in dropped” even
   when Firebase still had a user. lastMatch itself is correct sticky state.
2. Rejoin / restore / Play Online called `startMultiplayerGame(id, { id,
   lobbyCode })` — a stub with no `state` / players. That is Error 3 or a
   silent bounce back to reconnect. Auth flicker makes `joinLobby` fail
   with “Not logged in” and the handler then started from that stub.
3. Boot wrapped resume in a 14s outer timeout shorter than auth + getDoc +
   start (6+8+8). The timeout set `resumedLastMatch = false` and called
   `showReconnectOnly()` on top of an in-flight or finished hydrate.
4. “Leave this match” only set `_rejoinDismissed`; it did not
   `forgetLastMatch()`, so the next visit showed the same screen.

Discarded: a one-off for 3RVNJU; lastMatch being “too sticky” as the
primary bug (it is the resume hint); requiring a full auth cycle to
hydrate. Auth drop is real when IndexedDB restore is late — Rejoin now
waits for `whenReady` and opens Sign In only then.

Fix: one hydrate plan (auth ready → fetch live game doc by id or code →
start only with state/players). Rejoin / boot / Play Online share
`hydrateLastMatch`. Stub payloads fetch before start. Leave on the
reconnect screen clears lastMatch. Reconnect copy is “Sign-in dropped”
only when signed out. Boot does not repaint reconnect over an in-flight
or seated resume. SCHEMA 11. GAME_VERSION V2.81.48.

### Smoke (this PR)

- [ ] Return-to-site while in a live match auto-resumes into the board, or
      Rejoin does, without Leave → sign out → sign in.
- [ ] Rejoin with a late/restored session still hydrates (no Error 3 stub).
- [ ] Leave this match clears the sticky banner; next visit is the normal
      menu, not reconnect.
- [ ] Finished / deleted lastMatch is forgotten, not stubbed as Join.
- [ ] Cold load still reaches home/setup without the branded loader hang.

---

## 9.14.26 — V2.81.47 boot hang + My Games Leave (SCHEMA 11)

Robert Chrome Mac: live cold/return load stuck on the branded loader — gold
bar ~full, “Still loading…”, then “Taking a little longer…” + Reload only.
Same session as the dead My Games Leave control.

Cause (boot): lastMatch from the live games held `dismissStartupLoader` until
`mapRenderer.load()` (Image() never times out) + `auth.whenReady()` +
`startMultiplayerGame({ id, lobbyCode })` (no players/state → Error 3 or a
hung getDoc). The 16s recovery still required Reload. Leave-dead kept
lastMatch set, so every return-to-site took this path.

Fix: never pin the loader on lastMatch — paint reconnect and dismiss, then
resume in a timeout budget. Tile / auth / getGame / resume use `withTimeout`.
Recovery has Continue (dismiss) plus Reload. Leave fix from V2.81.46 stays.
SCHEMA 11. GAME_VERSION V2.81.47.

### Smoke (this PR)

- [ ] Cold load reaches home/setup without Reload.
- [ ] Return-to-site with a last match shows reconnect or the game, not a stuck bar.
- [ ] Continue dismisses the loader; Reload still works.
- [ ] My Games Leave still confirms and removes the row.

---

## 9.14.26 — V2.81.46 My Games Leave was a dead control (SCHEMA 11)

James / Robert: My Active Games rows showed RESUME + red-outline Leave. Leave
did nothing — no confirm, no remove, no error.

Cause: B23 gated the Leave handler on `shouldOpenLeaveConfirm({ eventTarget:
e.target })`. Tapping the word “Leave” can target a Text node with no
`.closest`, so the handler returned silently after stopPropagation. A second
trap: `mergeMyActiveGames` re-listed a game via `startedBy` after the seater
was removed from `playerUserIds`, so a successful leave could still keep the
row.

Fix: resolve Text nodes to their parent; treat `[data-role="leave-game"]` /
`[data-leave-game]` / `[data-leave-lobby]` as Leave; one delegated click on
the My Games overlay calls `leaveGame` / `leaveListedLobby` (same resign /
lobby-leave path as in-game). Confirm, then refresh the list. Starter-only
rows drop after Leave. SCHEMA 11. GAME_VERSION V2.81.46.

### Smoke (this PR)

- [ ] My Games Leave opens “Leave this game?” then the row disappears (or an error).
- [ ] RESUME still opens the match.
- [ ] Waiting-to-start rows also Leave (removed from lobby, not a wipe of all games).
- [ ] In-game Resign / host handoff / all-resign delete unchanged.

---

## 9.13.26 — V2.81.45 tutorial lifecycle + HUD stack + Combat Move (SCHEMA 11)

James he-corrects after rejoin PR 34. Shipped with V2.81.44 in the same window.
SCHEMA 11. Tips stay; they stop auto-showing after PLAYING `round > 1`. Never
show this again persists on `tacticalRisk_phaseGuides`. One phone bottom surface
when a guide/sheet/menu is open. Combat Move naming honesty; land→unit→Confirm
SILO held for Place/Deploy. Phone combat is a full sheet (odds / select /
resolve + sticky safe-area CTA), not a 42dvh clip. Tesla branding off. No lobby/voice.

### Smoke (this PR)

- [ ] Place Capital / Deploy tips still auto-show on a new local match.
- [ ] After the first PLAYING round (`round > 1`) tips do not auto-pop.
- [ ] Never show this again blocks auto-show and Menu → Phase tips.
- [ ] Menu → Phase tips still works after Got it (unless Never).
- [ ] 390 + 500: guide/sheet/menu never stacks on peek chips; Confirm/Resign/Max stay ≥44pt above the home indicator.
- [ ] Combat Move HUD/tip says Combat Move (not Attack); stack → highlighted land → Confirm.
- [ ] 390 portrait + ~844×390 landscape: combat sheet shows Odds / Select / Resolve; Roll / Confirm / Continue / Retreat stay fully on screen above the home indicator.

---

## 9.13.26 — V2.81.44 hide Join form on rejoin recovery (SCHEMA 11)

James screenshot: Online Join Game while sign-in-dropped / still-in-match recovery is active showed “Still in the match” + gold Rejoin CTA **and** the full Join Game form (code, password, Join Game). Copy says do not start a new one; the form invites exactly that.

Cause: `_renderReconnect` always appended `_renderJoin`. Generic rule now: when rejoin recovery is the active path, competing Create / Join / Browse stay hidden until an explicit “Leave this match / find another game” dismiss. Not a 2LPT76 one-off. SCHEMA 11. GAME_VERSION V2.81.44. Shipped with V2.81.45.

HOLDs kept: Confirm grammar; China / Sinkiang merge; SCHEMA 11.

### Smoke (this PR)

- [ ] Reconnect / still-in-match screen: Rejoin is the only primary join action.
- [ ] GAME CODE / PASSWORD / Join Game are not visible or submittable in that state.
- [ ] Create Game / Open Games do not appear on the same screen.
- [ ] Rejoin {code} still joins the remembered live match.
- [ ] “Leave this match / find another game” reveals the normal menu; Rejoin banner remains there.

---

## 9.13.26 — V2.81.43 Settlecoast UX polish (2D, SCHEMA 11, DRAFT)

Paint-first branded `#startup-loader`, phone Confirm chrome (held / unavailable / queued), 44pt + safe-area on primary CTAs, dismissible Place Capital / Deploy / Attack / Fortify tips, How to Play on Local home without sign-in. METHOD in `doc/METHOD-SETTLECOAST.md`. No Three.js, no `@designcodeio/threeui`, no voice. Confirm grammar SILO held. Draft only — not production.

### Smoke (this PR)

- [ ] Cold load never whitescreens; TR loader then home.
- [ ] 390 + 500: Confirm / Max / Resign clear the home indicator; Max still needs Confirm.
- [ ] Rotate mid-turn: phase and queues stay.
- [ ] How to Play from home without signing in; Phase tips reopen from ⋯.
- [ ] Got it / Next / tip chips advance or dismiss without peeking or placing the land under the finger.

---

## 9.5.26 — V2.81.42 polish + multiplayer robustness (DRAFT)

James / FREE TOKEN DAY: live host handoff after Resign, all-resign delete retry, My Games hygiene, presence/sync resume, systemic peek flush, thumb CTA safe-area, push_exhausted rematch polish. SCHEMA 11. GAME_VERSION V2.81.42. Draft only — not production.

HOLDs kept: China merge; capital named Confirm + unit-icon auto-place; type leftover cap; all-resign deletes when no humans; phone shell ≤640 short side; sea hairlines + yellow lanes; desktop+phone capital peek parity.

### P0-8 physical iPhone checklist (cannot run here)

On a real iPhone (Safari) and iPhone-narrow Chrome at 390 and 500:

- [ ] After host Resign with ≥1 human left, remaining human runs AI without a full rejoin; old host cannot.
- [ ] All-resign: game gone from My Games after one refresh; delete fail shows error + retry (not a Join-able finished orphan).
- [ ] Finished / deleted ids never Join or auto-resume.
- [ ] Background / lock / idle ≠ offline for failover; Exit still deletes presence.
- [ ] Phase or seat change clears peek / illegal Confirm; looks-broken bar if Confirm would have stuck.
- [ ] Confirm / Done fully clear of the home indicator; Undo ghost beside. Landscape short-side ≤640 stays phone tray.
- [ ] After a save-failed toast: board matches server, no WAITING lock, no empty rematch / toast loop.
- [ ] ⋯ sheet: Resign is first-viewport (Leave this game), no hunting. Deploy count stays +/−/Max.

---

## 8.30.26 — V2.81.41 Place Capital Confirm; hide merge seams

Robert + Sean on live V2.81.40 desktop: Place Capital never committed (click selected the land, HUD stayed "CLICK YOUR TERRITORY"). Live-build bug — `_phoneCapitalLandName` was phone-only so Confirm never mounted. Sean’s “two Chinas” is the intended Sinkiang merge, not a missing country.

Fix: desktop and phone share `applyCapitalPlacementPeek` (owned land → named Confirm; China/Wake/Germany/Japan stay inspect). `placeCapital` only counts as committed when it returns `true`. Land hairlines stroke merged-territory *external* edges so the old China/ASE internal seam does not draw. No Sinkiang/Libya restore. Sea hairlines + yellow land-bridge lanes stay. SCHEMA 11. GAME_VERSION V2.81.41.

---

## 8.30.26 — V2.81.40 phone battle odds hero

James he-correct on live V2.81.39: mobile battle screen hid the probability (compact bar is display:none on the phone summary), so he could not tell the chance to take the land.

Fix: same expected-hits % as the desktop bar, painted first on the phone summary as a large hero number (`68%` / to take this territory). Summary-first + tap-for-detail stays. No new combat model. SCHEMA 11. GAME_VERSION V2.81.40.

---

## 8.30.26 — V2.81.39 restore all-resign deleteDoc

James 8:09am lock: Resign in Games menu; if ALL players resign, delete the game. PR 28 / live V2.81.38 never-delete was the wrong path (Auto-review / skipped-widget decline is not the product).

Fix: `shouldDeleteGameAfterResign({ humansRemain: false })` is true. `leaveGame` marks finished then `deleteDoc` when no seated humans remain. Rules: admin OR (auth seated player + status finished + uid in playerUserIds). HUD copy says the game is deleted. SCHEMA 11 `surrendered`. Auto-place / type-cap / 36–38 holds stay. No bulk wipe of existing `/games`. GAME_VERSION V2.81.39.

---

## 8.30.26 — V2.81.38 auto-place icon; type-cap leftover; Resign in Games menu

James he-correct on live V2.81.37: after naming an eligible dest, each unit-icon tap should deploy/move/attack THAT type immediately (same as landing planes). Confirm on that path is gone. One eligible bomber still let him keep clicking ("deploy 6 bombers") then placed infantry/tanks. Games menu needed Resign. James declined the one-time wipe — do not delete game documents.

Fix: named dest + icon tap commits one of that type now (Max dumps remaining of THAT type). Exhausted type leftover taps no-op and clear — never convert onto another type. Capital still Confirm. Games ⋯ Resign sets `surrendered` (SCHEMA 11) and finishes the match when no seated humans remain. Game docs are never deleted. GAME_VERSION V2.81.38.

---

## 8.30.26 — V2.81.37 land then unit icon; repeat icon adds +1

James he-correct on live V2.81.36: deploy / move / attack were not "click eligible land, then keep clicking the unit icon" like landing planes. First icon tap staged 1 and further taps no-op'd; land tap could also auto-stage.

Fix: named eligible land first. Each unit-icon tap stages +1 of that type (mixed stacks: repeat each type). Max still dumps remaining of that type. Confirm commits. Illegal dest / sea-vs-land / exhausted type does not add. SCHEMA 11. GAME_VERSION V2.81.37.

---

## 8.30.26 — V2.81.36 sea hairlines; no start tac bomber; tech + mixed attack + phone combat

James he-correct on live V2.81.35: ocean was flat teal (no sea-zone edges); starting tray had a tactical bomber; tech roll count was unclear; mixed-stack attack was unit-by-unit; battle sheet did not fit iPhone.

Fix: phone strokes a capped ~1 CSS-px sea hairline on every water polygon (`rgba(6,36,42,0.55)` on `#44C5BD`). Water-mask stroke+shadow and fat sea dashes stay off in setup. `RISK_STARTING_UNITS` drops tacticalBomber (defs, not a hide). Tech uses named count + Max + Confirm (tap does not spend). Move/attack chips show selected/available per type and a mixed-stack summary before Confirm. Phone combat is a short who-vs-who + types/counts + next-step card; tap a row for details; Confirm stays the thumb. Land hairlines / yellow lanes / China peek / owned Confirm→star+DEPLOY kept. SCHEMA 11. GAME_VERSION V2.81.36.

---

## 8.30.26 — V2.81.35 CSS-px territory hairline; Fit ownership readable

James lookpass of V2.81.34 (`fvll56cmt` / 59833dd): he would replace live V2.80 except borders — Fit/world were continent blobs with no tile edges, ownership unreadable. ROOT: `phoneCountryOutlineWidth` returned 0 in mobile setup and below zoom 0.85; seam was same-color bleed; legal hairline off; map art skipped.

Fix: phone draws a stable ~1 CSS-px `rgba(0,0,0,0.35)` hairline on every land tile, world-px capped at 5 so it cannot stair-step. Water-mask / sea dashes / baked PNG / gold legal grid stay off. Phone Fit keeps unit stacks and ownership flags. SCHEMA 11. GAME_VERSION V2.81.35. No production deploy.

---

## 8.29.26 — V2.81.34 Fit fills-only; China inspect even if dealt

Skeptic remaining after V2.81.33 (`4nqw8gbfh` / 25dbd6c): owned Confirm → star + DEPLOY HOLD. FAIL: Fit + world still read as jagged dark country strokes (water-mask stroke + fat/zero seam AA). China peek still minted `Place Capital: China` when the 2p deal assigned China.

Fix: phone setup skips the water-mask stroke (flat ocean) and sea-zone dashes; land-bridge gold lanes stay. Ownership seam is a 3 world-px same-color seal (not a fat aliased rim). China / Wake / Germany / Japan are inspect-only unless that land is this seat's home. SCHEMA 11. GAME_VERSION V2.81.34. No production deploy.

---

## 8.29.26 — V2.81.33 inspect-only enemy; Confirm commits to DEPLOY; Fit no minimap

Skeptic unique play of V2.81.32 at 500 (`8nm0s2b3u` / 26191e4): gold hairline / sea-clear / setup spine HOLD. FAIL on one load: (1) enemy China peek minted `Place Capital: China` and stacked `Not yours` toasts; (2) Confirm was painted but not clicked — owner guard could silent-no-op; (3) sea KEEP; (4) opening was Germans CAPITAL / empty footer / grey Pacific star while the human was Russians; (5) Fit+world still showed minimap 120×68 and choppy dark strokes.

Fix: document-capture is the only setup peek (no canvas re-apply, no hover leftover, no toast). Named Confirm mounts only from `_phoneCapitalLandName` after an owned peek. Confirm click resolves the owned land (dataset / peek / selected), calls `placeCapital`, then `checkAI()` so 1-human+AI reaches DEPLOY with a star — owner mismatch clears the CTA. Local 1-human+AI seats the human first. Setup Fit shows +/−/Fit only (minimap parked). Ownership seam is 0 during setup. SCHEMA 11. GAME_VERSION V2.81.33. No production deploy.

---

## 8.29.26 — V2.81.32 illegal peek is inspect; Confirm places star; opening camera

Skeptic unique play of V2.81.31 at 500 (`38x3aj75p`): worldwide gold HOLD. FAIL: Place Capital Confirm minted on German Wake / Japan / Manchuria; Confirm on that land left CAPITAL with no star; sea tap kept stale enemy Confirm; opening was Germans CAPITAL / NW Pacific / no Undo after AI Turkey; Fit missed dest and world zoom still read choppy.

Fix: named Confirm is owned-land only (enemy/unowned/sea = inspect, Confirm absent). Confirm on owned land writes capitalTerritory and draws that star. Sea tap during Place Capital clears the CTA. Opening Undo is always on for the current human; camera/Fit seed the home/owned cluster (not Pacific wrap). SCHEMA 11. GAME_VERSION V2.81.32. No production deploy.

---

## 8.29.26 — V2.81.31 owned-only fill-lite; no worldwide gold hairline

James unique play of V2.81.30 at 500 (`m0atf2x5u`): Place Capital peek/Confirm and dark-red HOLD. FAIL: gold/amber hairline on every continent at opening (and on unowned neighbors at Fit). A 2p deal owns ~31 lands worldwide; stroking those gold outlines every neighbor.

Fix: legal marks are gold fill-lite on this player's owned land only. No gold/amber/red hairline grid at opening or world Fit. Peek still supplies the white tile outline. Sea dest bind untouched. SCHEMA 11. GAME_VERSION V2.81.31. No production deploy.

---

## 8.29.26 — V2.81.30 restore Place Capital peek; no dark-red at dest zoom

James unique play of V2.81.29 at 500 (`qojiw5987`): Fit gold-edge and sea dest HOLD. FAIL: opening already had `Place Capital: United Kingdom` (Start Turn punch-through); peeking Karelia left the UK Confirm stale; dest-cluster zoom ≥ 0.85 brought back baked map-art plus `#3d2800`/faction dashes on Eire/Sweden/Germany.

Fix: handoff overlay is chrome; Start Turn clears any leaked peek. Any land tap names Place Capital Confirm. Phone setup skips map art and dark country strokes at every zoom. Owned/legal is gold fill-lite; gold hairline only at Fit (`< 0.85`). SCHEMA 11. GAME_VERSION V2.81.30. No production deploy.

---

## 8.29.26 — V2.81.29 skip baked map-art borders; owned fill-lite only

James unique play of V2.81.28 at 500 (`ax9g4l281`): interaction HOLDs (sea dest, land hides ships, Fit moves, no Map punch-through, no opening star). FAIL: every land still had dark-red country strokes at opening and after Fit. V2.81.28 hid the same-color continent seam (and left baked `smallMap`/baseTiles on screen), so the PNG’s dark-red country ink showed through. Legal fill-lite did not read.

Fix: phone Fit/opening skips baked map art (flat ocean + continent fill). Same-color fill bleed covers polygon gaps — not a dark outline. Dark country strokes stay hidden below zoom 0.85. Owned/legal is gold fill-lite + gold hairline only (no `#3d2800` underlayer, no faction-red `#B22222` hairline at Fit — that read as worldwide country strokes). Sea dest bind untouched. SCHEMA 11. GAME_VERSION V2.81.29. No production deploy.

---

## 8.29.26 — V2.81.28 worldwide outline kill; sea dest bind; Fit + map-tool chrome

James unique play of V2.81.27 at 500: spine / named Confirm / land-hides-ships / no opening star HOLD. FAIL: every land still had a thin dark-red country stroke (dest-cluster zoom sat above the 0.4 hide); Indian Ocean hit-test did not rename dest (capital lock + adjacency gate); user Fit was a no-op on the Eurasia cluster; Map − punched through to Soviet Far East.

Fix: phone hides country strokes and ownership-seam ink below zoom 0.85. Legal ink stays owned land only. Any empty/friendly existing sea zone binds dest + sea/air chips. User Fit that does not move the camera widens to world. +/−/Fit / minimap are chrome, not canvas peeks. SCHEMA 11. GAME_VERSION V2.81.28. No production deploy.

---

## 8.29.26 — V2.81.27 world-Fit hairline; owned-only legal; sea chips gate

James unique play of V2.81.26 at 500: setup / named Confirm / chip wrap / Europe Fit HOLD. FAIL: world Fit painted thick aliased dark-red country strokes on UK/Spain/Italy (not owned-only ink); Deploy land dest still offered ships; Place Capital opening still showed a Middle East capital star.

Fix: hide country outlines below zoom 0.4. Continent fill seals seams with a same-color hairline (no dark stair-step strokes). Legal marks are fill-lite + one faction hairline on owned land only — no ink underlayer, no sea-zone strokes at Fit, no UK/Spain/Italy unless owned. Place Capital draws no capital stars. Land dest hides sea chips; sea dest hides land-only chips. SCHEMA 11. GAME_VERSION V2.81.27. No production deploy.

---

## 8.29.26 — V2.81.26 capital star kill; per-tile legal ink; sea-on-ocean; Fit dest; 4/8 setup

James unique play of V2.81.25 at 500×632: setup spine PASS. FAIL Place Capital opening star+glow on SE Asia; continent-scale dashed red hull (`data-phone-legal=31` collected, not drawn as per-tile ink); Fit framed empty Pacific / world+ocean; Deploy chips overflowed past 500; leftover inspect card into Deploy; setup row gutter 26 and Teams as a 44×44 bare checkbox; sea units could not sit on ocean.

Fix: Place Capital opening paints no capital star/glow until Confirm (`capitalTerritory` only). Owned/legal lands get per-tile faction-color edge + fill-lite (solid at world Fit, not a continent hull). Country borders scale to ~1.25 CSS px at min zoom. User Fit / Deploy-open frames dest/capital cluster (unwrap, not Pacific). Capital Confirm still does not auto-Fit. Sea units use the same named-Confirm/Max pair on legal sea zones. Setup row gutter is 8; mark-to-name 4px; Teams is a 114×44 On/Off control. Deploy chips wrap inside 500. Tile select 150ms / confirm 250ms pulse on the land. SCHEMA 11. GAME_VERSION V2.81.26. No production deploy.

---

## 8.29.26 — V2.81.25 faction-color dashed legal edge

V2.81.24 painted dashed gold + gold fill-lite on owned land before tap, and a drag no longer peeked. Gold still sat next to the ivory map chrome and could read as the same band. Opening Place Capital / Initial Deploy now strokes a Poly dashed faction-color edge (Russians #B22222) plus gold fill-lite on owned land only. Unowned keeps the cream chrome. Pan ≠ peek. SCHEMA 11. GAME_VERSION V2.81.25. No production deploy.

---

## 8.29.26 — V2.81.24 gold legal marks; pan ≠ peek

James unique play of V2.81.23 at 500×632: setup spine / named Confirm HOLD. FAIL Rule 5: Place Capital opening painted a solid cream hex-edge that matched the baked map chrome on India and East Indies. Owned Russian land stayed continent green 136,163,70 until peek. A drag that started on a land also peeked that land on pointerup.

Fix: first paint of Place Capital / Initial Deploy draws a dashed Civ gold-hex edge (#f5c518) plus gold fill-lite on owned land only — not cream chrome, not peek-only. Peek commits on pointerup when the gesture moved < 12px; a drag pans without selecting. Confirm row and setup spine unchanged. SCHEMA 11. GAME_VERSION V2.81.24. No production deploy.

---

## 8.29.26 — V2.81.23 legal marks on opening paint

James unique play of V2.81.21 at 500×632: setup spine / 4/8 / named Confirm / camera / land-then-unit HOLD. FAIL Rule 5: Place Capital opening (and Initial Deploy opening) had no owned-land edge. Marks only appeared after tap (white outline + pale fill = peek select). The paint loop already collected owned names; the stroke was a 2 CSS-px dark hairline on the default brown borders, so the opening looked unmarked V2.80.

Fix: first paint of Place Capital and Initial Deploy draws a 5 CSS-px dashed gold Poly edge plus 0.22 fill-lite on owned land only — not a world wash, not peek-only. Unowned peek stays inspect-only. Setup spine and Confirm row unchanged. SCHEMA 11. GAME_VERSION V2.81.23. No production deploy.

---

## 8.29.26 — V2.81.21 eight P0 visual rules

Living brief: setup spine (mark → name → occupant/meta, one column at 500), 4/8 rhythm, every data row, type, legal marks before tap, named Confirm only primary, three motion beats, labels vs stacks. Occupant is on the same 44pt row; color is a 10pt pip. HUD is flag → power → one phase word. Deploy copy is "to <land>". Peeked tile hides its map name. No bounce. SCHEMA 11. GAME_VERSION V2.81.21. No production deploy.

---

## 8.29.26 — V2.81.20 phone alignment system (not a logo patch)

James HE-CORRECT / LOCK: HOLD so far was interaction grammar. Setup logos independently center-aligned was the instance of a missing row system. Desktop `.player-card.modern` (column + optically centered roundel) was still the phone seat class.

Fix: phone seats drop `player-card modern`. One row grammar across setup, lobby home, HUD identity, ⋯ sheet, player roster, and unit/place rows — mark left, copy on the same baseline, shared gutter. Seated vs unseated does not re-center. Short press/select motion only; camera is not animated. Occupant/Teams/Start, Max/Confirm, and land-then-unit HOLDs unchanged. SCHEMA 11. GAME_VERSION V2.81.20. No production deploy.

---

## 8.29.26 — V2.81.19 setup logos share one left gutter

James play of V2.81.18 at ~500: seated Russians/Germans put the roundel optically centered above the name. Unseated British sat left of "Tap to add". Logos did not share a vertical axis.

Fix: every phone faction card is one row — logo left (42px gutter), name + Selected/Tap to add on the same baseline, check at the end. Seated vs unseated does not re-center the roundel. Occupant Human/AI, Teams, Start Game, and in-game HOLDs (camera / land-then-unit / Max / Confirm) unchanged. SCHEMA 11. GAME_VERSION V2.81.19. No production deploy.

---

## 8.29.26 — V2.81.18 Max must not eat Confirm

James unique-deploy play of 7ba5026 / V2.81.17 at 500×632: camera PASS, land-then-unit PASS, Max does not auto-commit PASS. FAIL: Max inherited `pp-confirm-btn` `width:100%` and painted 396×128. Confirm hung off the right edge (~4px, label unreadable).

Fix: Max is a compact 44pt secondary (not the green primary). Confirm stays the wide thumb verb and stays fully on screen at 390 and 500. Place Capital stays Undo + Confirm only. Camera / land-then-unit / Max-does-not-commit unchanged. SCHEMA 11. GAME_VERSION V2.81.18. No production deploy.

---

## 8.29.26 — V2.81.17 James lock: one land+unit grammar

James unique-deploy play of e398ee6 / V2.81.16: (1) Place Capital Confirm yanked the camera (auto-Fit). (2) Land-then-unit still failed on iPhone touch — mouse kept the named land, his device did not. (3) No Max. Sweep: reinforce / attack / fortify still used first-tap-commits or a type-count shop.

Fix: capital Confirm no longer auto-Fits. Peek chrome is the chip row / hint / CTA (pointer-events auto); leftover-tall footer stays none. Unit chip selects on pointerdown and freezes the named land. Peek skips when the point is in that chrome even if the target is the canvas. Max sits in the thumb with Confirm and does not commit. Mobilize stages then Confirm. Combat / fortify stay peeked with the same land→unit→Max→Confirm grammar; attack Confirm stays the irreversible exception. Purchase is unit+Max+End Phase (no land pair). SCHEMA 11. GAME_VERSION V2.81.17. No production deploy.

---

## 8.29.26 — V2.81.16 P0 deploy pair; chrome off the board

James unique-deploy play of c27a303 / V2.81.15 at 500×632: land tap outlined Ukraine but the footer stayed "Tap a unit and a territory". Infantry chip then read "Tap land to stage here". Confirm never appeared.

Cause: V2.81.15 treated leftover-tall `.pp-bottom-actions` as a map-block, so a Ukraine tap never wrote `_phoneDeployLandName`. Hint and Confirm both read `selectedTerritory` (empty). Unit chip staged against a null dest.

Fix (P0-1–P0-5): staged land name is the dest. Land-then-unit names the land before the chip; the chip keeps that land and mounts `Deploy 1 infantry · <land>`. Peek hit-test is tray verbs only. Confirm pointerdown still does not retarget the map. One phase chip; labels off the stack; human unit words; 500 keeps the bottom tray; Place Capital Confirm beside Undo; Fit frames the player's owned-land region (capital cluster if worldwide). SCHEMA 11. GAME_VERSION V2.81.16. No production deploy.

---

## 8.29.26 — V2.81.15 Deploy is Deploy; no footer punch-through

James unique-deploy play of 34d4429 / V2.81.14 at 500×632: (a) setup overlap PASS. ⋯ PASS. (b) land-then-unit FAIL. China + infantry staged "To China" + Deploy 1. First thumb Deploy punched through the peek tray, re-selected East Indies, footer became "To East Indies". Second tap deployed to East Indies.

Cause: document-capture setup peek hit-tested the map under Deploy (`shouldIgnorePanelBox` skipped the tray box for UNIT_PLACEMENT). pointerdown retargeted selectedTerritory and flush-rendered before click.

Fix: Deploy / tray chrome is not a land peek. Peek always honors the visible tray box. UNIT_PLACEMENT does not ignore that box. Pointerdown on Deploy commits the staged land (`_phoneDeployLandName`). Click of that gesture does not place twice. China stays China. (a) and ⋯ kept. No chip-on-name work. SCHEMA 11. GAME_VERSION V2.81.15. No production deploy.

---

## 8.29.26 — V2.81.14 no overlapping labels; land-then-unit dest

James unique-deploy play of 704fe2a / V2.81.12 at ~500×640: seated green check sat on Russians / Germans. Teams sat tight on its label. Land-then-unit was not obvious. ⋯ was a no-op (fixed in 1c2064c, kept here).

Fix: phone seat check is a flex sibling, not the desktop absolute badge. Teams label and checkbox stay on one row with a gap. Inspect / combat / ⋯ titles ellipsize. Deploy pair hint names the land (`Tap a unit for <land>` / `To <land>`) so land-then-unit and unit-then-land both read. ⋯ still opens the short 5-item sheet on this pointer. SCHEMA 11. GAME_VERSION V2.81.14. No production deploy.

---

## 8.29.26 — V2.81.13 header ⋯ opens the short sheet

James unique-deploy play of 704fe2a / V2.81.12 at ~500×632: (a) setup in-box / Teams / puck HOLD. (b) unit+land either order then Deploy HOLD. Leftover: header ⋯ did not open the sheet.

Cause: document-capture Place Capital / deploy peek hit-tested the map under the ⋯ and `hud._render()`'d before click, so the toggle never arrived.

Fix: HUD chrome (⋯ / Map / sheet) is not a land peek. Phone ⋯ opens the short 5-item sheet on this pointer (Players, Territory, Log, Game Rules, Save & Exit). Not a second lobby. Not a 4-tab bar. Peek hides while open. No circular puck. (a)(b) unchanged. SCHEMA 11. GAME_VERSION V2.81.13. No production deploy.

---

## 8.29.26 — V2.81.12 setup controls in-box; pair then Deploy

James unique-deploy play of 106284b / V2.81.11 at ~500×640 (01-setup.png, 06-deploy-peek.png): Teams was a huge native white square hanging beside Starting IPCs. Occupant/select still felt tight. Circular list puck sat on the German card, the map, and the ⋯ sheet. Deploy was still type → count → Deploy (tank preselected, stepper always up).

Fix: seat is the card — swatch, Human/AI, Teams, IPCs stay inside at 44–48px. Teams is a styled 44×44 box (`appearance: none`), not a native checkbox. Preview comment/list puck opted out (meta + header + CSS). Deploy is unit+territory (either order): first pair peeks/stages 1, stepper appears after, thumb Deploy commits. No covering Units list. Place Capital peek then Confirm, short ⋯, one-finger pan, Zoom/Fit behind Map stay. Holds 1–4 unchanged. SCHEMA 11. GAME_VERSION V2.81.12. No production deploy.

---

## 8.29.26 — V2.81.11 Polytopia-thin deploy; short ⋯ sheet

Addendum on the same HE-CORRECT: after V2.81.10 peek, the tray still stacked meta + hint + chips + qty + Deploy, and ⋯ was a full-screen second lobby with a player roster. Map/⋯ read as chrome on the art.

Steal (comparison only): stage on the chip + one thumb Deploy. MENU is a short sheet under the HUD (max 52dvh), no roster reprint, no 4-tab bar. Peek hides while ⋯ is open. HUD is opaque. Same-finger pan after capital stays. Holds 1–4 unchanged. SCHEMA 11. GAME_VERSION V2.81.11. No production deploy.

---

## 8.29.26 — V2.81.10 Initial Deployment peeks like Place Capital

James unique-deploy play of 3761692 / V2.81.9 at ~500×640: holds 1–4. After Confirm on Mongolia the board was gone — opaque 4-tab Units/Players/Territory/Log sheet, grey Select units, Map/⋯ and a list puck on the art. He could not pan. Menus stacked.

Cause: `shouldPeekPhoneTray` forced UNIT_PLACEMENT open (`trayExpanded = true`). Peek hid +/−/MAX/Deploy in `.phone-tray-body`, so deploy stayed a covering sheet. Setup pointerdown peeked and returned without starting the camera, so a land press could not pan.

Fix: Initial Deployment peeks (chips that scroll + pinned +/−/MAX + one thumb Deploy). Players/Territory/Log stay in the ⋯ sheet. No detent tabs or ▾ list. Owned-land tap peeks; Deploy commits. Same finger can pan after peek. Zoom/Fit/minimap stay off the art until Map. Holds 1–4 unchanged. SCHEMA 11. GAME_VERSION V2.81.10. No production deploy.

---

## 8.29.26 — V2.81.9 Place Capital peek assigns on a 500×640 named-land tap

James unique-deploy play of 6894df7 / V2.81.8 at ~500×640 (not 844): hold 1 PASS. Hold 4 FAIL. One tap on Ukrainian S.S.R. (named land): yellow outline, no star, phase stayed PLACE CAPITAL. Thumb tray empty — hint only, no Confirm, no Undo. Scrolling the tray cleared the highlight.

Cause: at 500×640 the leftover-tall peek `#sidebar` still ate the map tap (`shouldBlockMapSelect` / canvas mousedown routed to the panel). Hover painted the gold outline; `_phoneCapitalLandName` never set. Playwright’s 844 / y=90 click missed that overlap.

Fix: Place Capital ignores the panel box for peek. Document-capture pointerdown assigns owned land even when the sidebar is on top. Confirm / Undo stay the only panel hits. Peek sidebar `overflow: hidden`. No leftover-click / 450ms / next-frame gates. Holds 1–3 unchanged. SCHEMA 11. GAME_VERSION V2.81.9. No production deploy.

---

## 8.29.26 — V2.81.8 peek tray chrome is the only map-block; Confirm mounts from peeked land

James unique-deploy play of e4bbd2e / V2.81.5 at ~500 CSS px on a fresh table: hold 1 PASS. Hold 4 peek holds, Confirm FAIL worse than V2.81.4. First Novosibirsk tap: yellow outline, no star, phase stayed PLACE CAPITAL. Thumb tray was an empty ~85px panel — hint “Tap your land, then Confirm”, no Confirm, no Undo. Re-tap still empty. Buttons were not in the UI.

Cause: leftover-click / delay / flush swings (30ba311 commit; f028a45 Undo-only; e4bbd2e empty tray). Peek `#sidebar` still computed a tall leftover box, so `containsPoint` treated map taps as in-panel and never assigned the land. Owner-gated Confirm then dropped the button. Last working tray after a peek was sha 22d4b13 (second tap).

Fix: peek hit-test is only `.pp-bottom-actions` / `.pp-seat-chip`. After a valid peek, mount `Place Capital: <land>` Confirm with Undo ghost on one row from selected land or `_phoneCapitalLandName`. No leftover-click arming, no 450ms ignore. Thumb Confirm is the only commit. Holds 1–3 unchanged. SCHEMA 11. GAME_VERSION V2.81.8. No production deploy.

---

## 8.29.26 — V2.81.7 Place Capital Confirm from peeked land name

James unique-deploy play of e4bbd2e and the a65cae0 V2.81.6 unique URL still had no Confirm after a valid peek. Unique-URL replay (jh73v1z7q) showed outline + “Click landed” but an empty tray — mouseup of a peeked gesture did not paint Confirm, and owner-gated render dropped the button.

Fix: peek stores `_phoneCapitalLandName` and flush-renders `Place Capital: <land>` from that name (22d4b13 row, Undo ghost beside it). Confirm commits only if the pointer started on that button. SCHEMA 11. GAME_VERSION V2.81.7. No production deploy.

---

## 8.29.26 — V2.81.6 restore 22d4b13 Place Capital Confirm tray

James play of sha e4bbd2e / V2.81.5 at ~500 CSS px: hold 1 PASS. Hold 4 peek holds, Confirm FAIL worse than V2.81.4: first Novosibirsk tap peeked (yellow outline, no star) but the tray was an empty ~85px panel — hint only, no Confirm, no Undo. Re-tap still empty.

Cause: three swings around leftover-click (30ba311 flush-on-pointerdown committed; f028a45 next-frame omitted Confirm; e4bbd2e flush + 450ms ignore still left an empty tray). mouseup of a peeked gesture returned without painting the 22d4b13 Confirm row.

Fix: pointerdown on owned land peeks only (outline, no Confirm in the DOM). mouseup of that gesture paints `Place Capital: <land>` and the Undo ghost on one row — the last tray that actually existed after a peek (22d4b13). No delay, no leftover-click ignore, no extra flush gate. Thumb Confirm is the only commit. Holds 1–3 unchanged. SCHEMA 11. GAME_VERSION V2.81.6. No production deploy.

---

## 8.29.26 — V2.81.5 Confirm mounts after Place Capital peek

James play of sha f028a45 / V2.81.4 at ~500 CSS px: hold 1 PASS (sibling occupant band). Hold 4 peek PARTIAL, Confirm FAIL: first owned-land tap peeked (yellow outline, no star, phase stayed PLACE CAPITAL) but the tray never mounted Confirm — hint + lone Undo only; DOM had no Place Capital button. Re-tap / scroll still stuck.

Cause: V2.81.4 scheduled Confirm on the next frame so a leftover click could not hit it. That rAF never painted the button (or a later flush cancelled it). Leftover-click ignore is a dispatch guard, not a reason to omit Confirm.

Fix: pointerdown on owned land peeks and flush-renders Confirm immediately. `_phoneSetupPeekTerritory` keeps the CTA if `selectedTerritory` drops. place-capital is still ignored for 450ms after that peek. Thumb Confirm is the only commit. Undo stays the 62px ghost beside Confirm. Holds 1–3 unchanged. SCHEMA 11. GAME_VERSION V2.81.5. No production deploy.

---

## 8.29.26 — V2.81.4 peek ≠ commit; seat check on this pointer

James play of sha 30ba311 / V2.81.3 at ~500 CSS px: hold 1 PASS (two seated 48px occupant rows). Hold 4 FAIL: first owned-land tap instantly committed the capital (no Confirm); German AI placed in the same beat. Seat checks painted late (Germans then British appeared together). DEPLOYED THIS ROUND 0/6 was clipped by the Units hint.

Cause: peek flushRendered Confirm under the same pointer, so the leftover click hit Place Capital. Full lobby `_render()` in pointerdown deferred the check paint and shifted the next card under the finger.

Fix: own-land pointerdown peeks only (outline + scheduled Confirm). place-capital is ignored for 450ms after that peek. Confirm is the only commit. Seat check paints on this pointer; occupant tools stay a sibling band. Deployed chip sits in the peek chrome, not under the sticky hint. Holds 1–3 and the Confirm row unchanged. SCHEMA 11. GAME_VERSION V2.81.4. No production deploy.

---

## 8.29.26 — V2.81.3 unclip two seats + first tap after Start peeks

James correction on sha 22d4b13: hold 4 is not totally dead. First tap after a phase/screen change is swallowed; the next tap peeks; thumb Confirm works. Hold 1 still P0 (two seated cards clip the 48px occupant row).

Cause: leftover-click guard after seating Russians also swallowed Germans' pointerdown (second seat never appeared, so the next card still covered the occupant row). First map tap after Start / handoff used a stale camera and/or started a pan (`wasDrag`) so mouseup never painted.

Fix: ignore leftover clicks only for the same faction; a different card seats on this pointer. Occupant tools stay a sibling band with `overflow: visible`. Place Capital peeks on pointerdown, refits the camera once on a miss, and does not start a pan on that gesture. Holds 2–3 and the Confirm row unchanged. SCHEMA 11. GAME_VERSION V2.81.3. No production deploy.

---

## 8.29.26 — V2.81.2 occupant band + first-tap peek (22d4b13 correction)

James second play of sha 22d4b13: hold 4 is not totally dead. First tap after a phase/screen change is swallowed; the next tap peeks; thumb Confirm works (Undo 62×48 beside Place Capital 396×48). inspect≠commit holds. Hold 1 still P0: two seated cards clip the 48px occupant row.

Cause: `.player-card { overflow:hidden }` plus flex-shrink hid the occupant row under the next card. First map tap after Start / Place Capital / a tray re-render landed on mouseup as wasDrag or a leftover click after `_render()` unseated the same faction card.

Fix: occupant Human/AI + swatch live in a sibling `.lobby-phone-faction-tools` band outside the card. Phone seats on pointerdown (leftover click ignored). Place Capital / Initial Deployment peek on this pointerdown and paint immediately. Holds 2–3 and the Confirm row unchanged. SCHEMA 11. GAME_VERSION V2.81.2. No production deploy.

---

## 8.29.26 — V2.81.1 seated occupant clip + dead Place Capital taps (500 play of 22d4b13)

James live play of sha 22d4b13 / V2.81 at ~500 CSS px: holds 2 (IPC 44, Teams 44×44) and 3 (one chip, no ticker, Tap, bottom tray) PASS. Hold 1 FAIL: two seated cards clipped the 48px occupant row under the next card (~10px sliver). Hold 4 FAIL: Ukraine / Russia / Karelia taps were dead (no outline, no Confirm); leftover Turn Summary (Germans / ✕ / OK) still in the DOM.

Cause: `.lobby-phone-factions` is a flex column and `.player-card` has `overflow: hidden`, so seated cards shrink and the swatch + Human/AI sit under the next card. Turn Summary used class `turn-summary-overlay` while hide CSS targeted `.turn-summary-modal`, so `hidden` never took it out of the hit stack.

Fix: seated cards `flex-shrink: 0` / `overflow: visible` with a 130px min-height occupant band (still 48px controls). Overlay hide is `display:none` + `pointer-events:none`; local / setup never shows the sheet; hide on game start. Peek tray box is pointer-events none except the CTA chrome. inspect≠commit kept. SCHEMA 11. GAME_VERSION V2.81.1. No production deploy.

---

## 8.29.26 — V2.81 iPhone polish (390 play of V2.80 + 500px addendum)

James + CoS FACT from live 390 of production V2.80: seated occupant/color chips and Teams / Starting IPCs were below 44pt; Place Capital HUD triple-repeated the phase plus a stale “Last action: Germans' turn begins” and “Click:” on a phone; +/−/Fit sat on the art; Undo was the blue primary and Confirm stacked under it in the home-indicator zone; first-expand Units tabs / body Deploy sat off an 844 viewport.

Phone-only CSS/IA: enlarge the existing Human/AI + color chip and Teams/IPCs to 44–48px; collapse `#hud-clarity` to the one HUD phase chip; Tap copy; hide stale turn-begins last-action; Confirm is the thumb primary, Undo ghost in one row; Map tools on-demand off the board; hide empty capital Units tabs and the body Deploy duplicate.

8.29 addendum (live V2.80 at ~500 CSS px): the 280px side rail came back because the phone floor was 480. Phone bottom-tray / no-rail is now ≤640 (JS + CSS) so 390 and the 500 Chrome floor both keep a usable map; tablet split is 641–900. Same pass: hide ticker at 500; Tap copy; Deploy at 0 is ghost “Select units”; one Deploy CTA; hide tooltip on commit / HUD pointerdown; ignore faction-card toggle after native `<select>`; one AI beat (“Germans placing capital…”, never YOUR TURN on an AI seat); flush HUD/panel/canvas on capital tap and zoom (not the next pointer); Undo undoes a staged queue. inspect≠commit kept. SCHEMA 11. GAME_VERSION V2.81. No rules / map / combat / MP / production deploy.

---

## 8.26.26 — V2.80 A3/A4 turn-order rewind on refresh

`ensureInitialDeployPools` used the current seat's wave-1 / 0-placed flags to restock every empty pool. After the first human Done, a host refresh restocked finished seats, extra placement waves ran, and `finishPlacementRound` skipped a finished index (2→0). Restore the starting kit only for the current seat. SCHEMA 11. GAME_VERSION V2.80.

---

## 8.17.26 — V2.79 B41 host lobby dumped home (6V9ZXK)

Same family as B38. Production V2.78, lobby **6V9ZXK** (Bastion's Game), host Bastion / abramlockheed. Host created a 2-player no-AI lobby, stayed at 1/2 (Start not clicked). View dumped to Local Play / Play Online with no Leave, no Start, no Delete Lobby, no surrender. Still signed in. Guest (James) was still joining. Do not treat as surrendered. Rejoin **6V9ZXK** only — no new game.

Cause: a waiting lobby never wrote `lastMatch` (only `startMultiplayerGame` did). Snapshot error / missing-doc flicker nulled `currentLobby` and the UI left the room. `onBack` / resume-miss then called `lobby.show()` (home). A discarded tab restart with no remembered code shows the landing page while Firebase still has the host signed in.

Fix: remember `{ lobbyCode }` on create/join. Snapshot error keeps the last known lobby and does not navigate home. Lost lobby view restores from the live lobby/game doc (or Rejoin 6V9ZXK), never Local Play. Start stays gated until both seated. SCHEMA 11. GAME_VERSION V2.79. No map/rule change.

---

## 8.17.26 — V2.78 ship (CEVX6F B38–B40)

CoS-approved squash to main. SCHEMA 11. No map/rule change. No Vercel billing from this ship.

B38: panel paints at default zoom; signed-in reload resumes the match (or Rejoin), not home / Create Game.
B39: first-wave land kit is real (not “Russians have no land IPC”); + / Max / Undo / Deploy; place 6 and Done.
B40: 2/2 host CTA is Start Game; an already-started lobby reopens that gameId.

---

## 8.17.26 — V2.77 host background killed ZUJMNP; deploy/undo looked broken

Live V2.76 two-human (Bastion host Russians, James guest Americans), game ZUJMNP. Host tab backgrounded ~3 min → host signed out → lobby gone → guest join “ZUJMNP not found” → guest WAITING on a ghost. Client also self-ejected to title / MY ACTIVE GAMES with no click. Same table: Undo passed the turn; own-capital tap ended the turn / opened surrender; game-row click opened “Leave this game?”; Infantry + jumped 1→4 or also added Armour; next YOUR TURN arrived 6/6; Deploy N clipped at y≈733; unit list truncated to tacticalBomber; selection jumped after deploy.

Cause:
- `presenceManager` deleted the presence doc on `beforeunload` (mobile fires that on background). Missing doc + 2 min stale = host offline. `auth_error` + `needsReauth` immediately `stopSync`, deleted presence again, nulled `gameState`, and `lobby.show()`. `leaveLobby` deleted a started lobby when the host seat looked empty. Join-by-code only returned `waiting` lobbies, so a live `starting` match was “not found”.
- Background timers freeze, so even a kept doc went “offline” at 2 min and failover / UI treated the host as gone.
- Guest `startSyncAndWaitForState` flipped the active-player flag on seat change without `loadFromJSON`, so James inherited host `unitsPlacedThisRound=6` and a stale 25 pool. Constructor leftover `turnPhase=purchase` was advertised on every setup push.
- `querySelectorAll('[data-action]')` rebound every render; `+` / Undo `_render()` mid-click retargeted onto Done or another row. Phone one-tap capital / place committed on map tap. Leave sat on the game-row hit target. DEPLOYED counted queued units. Deploy lived in the clipped tray body.

Fix (SCHEMA 11, no map/rules/combat math change):
- Presence doc is deleted only on explicit leave. `visibilitychange` / `pageshow` / `pagehide` write idle/online and heartbeat. Existing idle doc stays idle for 15 min (3 min background ≠ offline). Auth hiccup stays in the match unless the session is actually gone. Started lobbies are never deleted on host leave. Join-by-code finds the live game.
- Persist `turnPhase=setup` during capital/unit placement (never leftover `purchase`). Deep-clone `unitsToPlace`. Guest applies remote state when the version is newer **or** the seat changes. `nextTurn` / Done reset `unitsPlacedThisRound` to 0.
- One delegated panel click + rAF render. `+`/`−`/`Max` are pure one-row queue math; Deploy commits; panel count is units actually placed. Undo never passes. Own land/capital tap selects (Confirm / Deploy are the verbs). Leave is a separate control, not the row. Deploy N sits on the phone peek CTA. `tacticalrisk:your-turn` + `window.__tacticalRiskTurn` for WhatsApp. Tab title uses the same “is it my turn?” predicate as the banner.

Follow-up (same ZUJMNP V2.76 James client, still V2.77 / SCHEMA 11):
- B13 Deploy N placed N−1 (remaining −5 on Deploy 6): each `placeInitialUnit` `_notify()` re-rendered mid-batch and put Undo under the Deploy tap.
- B14 `+` at the 6-cap stole from another staged type: `canAdd` used this-row queued only, so + stayed live at cap; a mid-render retarget hit another row’s −.
- B15 Undo vs DEPLOYED desync / + vanished the restored unit: undo did not always decrement `unitsPlacedThisRound`; `setSelectedTerritory` wiped the queue.
- B16/B17 selection jump + fighter auto-commit: `_scheduleRender` called itself and never painted (shipped V2.77). Stale panel vs live selection. `+` is queue-only; Deploy is the commit.
- B18/B8/B10: Undo and Deploy now have separate peek slots; unit-list scroll is restored; Deploy batch notifies once (no 0-flash, B12).
- B19: ships-only remainder on inland land showed a sea hint, no unit rows, and hid Done until 6/6. Place leftover ships in a legal sea, or Done/skip (does not bounce the seat back).
- B19-James (ZUJMNP V2.76): 1/6, remaining 6 naval-only, only Undo. Same leftover-ship deadlock on a legal sea — Done was sea-gated and lived only on the clipped bottom bar. Done/skip is now on any tile (including valid sea) and in the inline placement actions next to Undo.
- B20: Deploy 1 placed 3 armour (remaining 13→10, round 1→3). Mid-gesture re-render retargeted Deploy onto other + rows. Pointerdown locks the action; Deploy commits that lock only.
- B21: Artillery + auto-committed and ended the turn at 3/6 (no Done click). Same retarget onto Done after leftover-ship Done appeared. + lock cannot become finish-placement; a ghost Done within 400ms of + is ignored.
- B22: Artillery + switched the panel to Log and jumped East US → East Canada. + lock cannot become a tab; a panel gesture blocks the map hit now under the finger.
- B23 P0: Game tab self-navigated to the lobby (auth eject — already on main). Clicking the game *row title* opened surrender. Leave is a compact sibling; title/join never opens the confirm. Do not enlarge Leave.
- B24: Max bumped DEPLOYED before deploy; Deploy 1 placed 0 twice, then a bomber. DEPLOYED is placed-this-round only. Failed Deploy restores the queue.
- Undo lock: place / deploy / purchase / move are undoable by default. Undo is hidden after combat resolve and after Done / next-player pass. Combat math and retreat history are unchanged.
- Turn notice hook: when currentPlayer changes, POST `{ gameCode, currentPlayerName, phase }` to `TACTICAL_RISK_TURN_NOTICE_URL` (window / env / localStorage). Unused if unset. No WhatsApp from the client. No phone numbers.
- E1 presence resume: `visibilitychange` (visible) and `pageshow` (including bfcache) heartbeat now and re-attach Firestore snapshots only if the listener died. Idle/background does not start the 90s host failover. `deleteDoc` stays on explicit leave / real close (`stop()`), not on background. No RTDB `onDisconnect`.
- B25 (E1 FAIL, game vanished): Host tab backgrounded ~3 min → Firebase Sign In (session lost). Rejoin ZUJMNP = "Lobby not found". My Games = "No active games found". Bastion still signed in on other tabs. No surrender. Auth eject called `presenceManager.stop()` which deleted the presence doc (`explicit-leave`). Join-by-code treated empty `playerUserIds` `[]` as not seated. My Games used `array-contains` + `status in` (needs a composite index; `firestore.indexes.json` is empty) and wiped the list on a token hiccup. Session-lost stop keeps the presence doc. Empty `playerUserIds` still seats via `startedBy` / lobby players. Join fetches `games/{lobby.gameId}` when the `lobbyCode` query misses. My Games is two single-field queries (seat + `startedBy`) with client-side status filter.
- James lock (if it can look broken, it is broken): Tab title followed the waiting lock / a stale sync callback while the panel badge followed the loaded seat — "● Your turn" over WAITING. Title, badge, phone seat chip, and the your-turn ping now share `resolveTurnChrome` (seat only). 6/6 this round + 1 still in the pool no longer says "Remaining to deploy: 1"; it is "Still in your pool: 1 next round". Leftover ships keep Done on the peek CTA, inline actions, and the phone tray. My Games row title is Resume; only Leave opens surrender. Join-by-code never says only "Lobby not found" when the match may already be in My Games.
- B25 CONFIRMED (guest still in ZUJMNP): James stayed in Bastion's Turn / INITIAL DEPLOYMENT / WAITING. Host Sign In after E1 background → My Games empty, Join ZUJMNP = lobby not found. Other Bastion tabs still signed in, same miss. No surrender. The game doc was alive (guest snapshot). V2.76 join searched waiting lobbies only; My Games used a compound query; session-lost deleted presence and the started lobby. Product fix: remember `{ gameId, lobbyCode }` locally; join-by-code / My Games `getDoc` that id; a started game with that code is never "not found"; guest sees "Host is reconnecting — stay in ZUJMNP. Do not leave." Idle host is away, not gone. Failover still does not run on idle. SCHEMA 11.
- James lock HUD clarity: the bar under the HUD always answers whose turn (YOUR TURN vs WAITING · name — never stale Your turn over WAITING), the real phase (Initial Deployment, never leftover purchase), 6/6 + leftover as next-round pool copy, last action from the log, and whether the map click landed. After host away: “Still in ZUJMNP — you were away” / “You were away — still in ZUJMNP. The other player is still there. Rejoin.” Silent empty My Games is a fail.
- B26 (ZUJMNP V2.76 James): Join by Code opened My Games, not a 6-char field. Cards were `join` / `rejoin` on a tight 2×2; a phone tap hit the wrong card and `onBack('rejoin')`. Exclusive `join-by-code` vs `my-games`, one delegated switch, Join by Code full-width on phone. Join by Code never opens My Games.
- B27: Game view dumped to home with no click. V2.76 `auth_error` called `lobby.show()`; V2.77 called `handlePlayOnline()` (full menu + Create Game). Session-lost does not leave the game view. If there is no canvas, reconnect-only (last match + code field) — not home, not Create Game.
- B28: After Deploy 1/6, selecting another territory showed 0/6. `loadFromJSON` used `unitsPlacedThisRound || 0`, and `shouldResetDeployedThisRound` treated remote 0 as a reset. Reset only on seat / wave change; same seat keeps max(local, remote). Select never zeros DEPLOYED.
- B29: Max did nothing on TacticalBomber. + / Max required a legal tile (`isValidPlacement`) and exact-type pool lookup. Staging does not need a tile; Deploy still does. `quantityAvailableForType` accepts `TacticalBomber` / `tacticalBomber`.
- B30: Destroyer + also incremented Transport (4→6). Same family as B14 row-offset / steal. Pointerdown locks `data-unit`; a retarget onto another type within 400ms is ignored. One gesture changes one unitType.
- B31: Max hover still selected East US and opened LOG (B22 family). Canvas under the panel and the LOG tab won the hit stack. Queue controls win `elementsFromPoint`; a click whose coordinates sit in the panel never selects a territory; Max lock cannot become a tab. If the canvas ate mouseup, the locked Max still commits.
- B32: + incremented by 2 (Armour 1→3, then every later + added 2). B31 canvas mouseup committed the lock, then the real click applied again. One pointerdown = one ±1; `shouldApplyQueueGesture` is one-shot until the next pointerdown.
- B33: Undo ended the turn (banner → Bastion WAITING). Undo lock was retargeted onto Done. Undo cannot become finish-placement; overlay commit never Done.
- B34: Clicking own capital (East US) to select it ended the turn at 0 deployed. Map / overlay click must not Done. Own-land tap still only selects.
- B35: Next YOUR TURN arrived DEPLOYED 6/6. Spectated host 6 was kept by the B28 max() after the seat flag flipped. Reset when `unitsPlacedThisRoundOwnerId` is not the new seat. Same-actor stale 0 still keeps local 1 (B28).
- B36: One Infantry + jumped 1→4 and added Armour. Compatibility mouse after the pointer click reset the one-shot and stole a row. Do not begin a new queue gesture within 400ms of an apply. Overlay commit is + / Max only.
- E1 / B25 P0 (ZUJMNP died): Host backgrounded → Sign In on that tab → Join ZUJMNP = “Lobby not found”, My Games empty, while the guest was still in the match. Then the game died. `auth_error` treated `!getUser()` as `confirmedSignOut` and self-ejected. A null user after background is not Sign Out. Heartbeat on every `visibilitychange` (hidden → idle) and `pageshow` (including `persisted`). No self-eject. No sign-out on background. Last-match stub keeps My Games listed when seat/`startedBy` queries miss. Remembered `gameId` alone is a join — never “Lobby not found” for the live match. Guest stays; host reconnects to the same game. SCHEMA 11.
- E1 / B25 (V2.77 live reload): Signed-in Bastion tab reloaded to pick up V2.77 → Sign In form. `setPersistence(browserLocalPersistence)` on every init raced IndexedDB restore and dropped the session. `onAuthStateChanged` also awaited a Firestore lastLogin write before setting `currentUser`, so Play Online saw a null user. Removed `setPersistence` (`getAuth` already persists). Apply the Firebase user immediately; lastLogin is best-effort. Play Online / AuthScreen wait for `authStateReady` and show “Restoring your session…” — not the password form — until restore finishes. Reload is not a sign-out. SCHEMA 11. GAME_VERSION stays V2.77.
- B37: Join Game GAME CODE autofilled leftover text (BICKFO); optional password autofilled a leftover value. Browser autocomplete treated the 6-char code as a name and the lobby password as a saved login. `autocomplete="off"` + unique names (`tr-join-lobby-code` / `tr-join-lobby-secret`). Join does not prefill last-match into the code field (Rejoin button still exists). Do not log or store the lobby password. SCHEMA 11. GAME_VERSION stays V2.77.
- B38 (CEVX6F): Host player panel `innerText` empty at default zoom; Ctrl+minus painted it; reload dumped a signed-in host to home. `#sidebar` z-index 20 lost to `#zoom-controls` (50). Phone peek hid `.phone-tray-body` (the + / Max / Undo / Deploy sheet). First paint with no `currentPlayer` wiped the DOM and waited for resize. Boot never auto-resumed `lastMatch`. Sidebar is z-index 60. Initial deployment does not peek. `show()` paints immediately; empty state says “Loading match…”. Signed-in reload with a remembered `gameId` reopens that match.
- B39 (CEVX6F): Russians initial deploy showed DEPLOYED 0/6, Remaining 1, LAND (0), only NAVAL Transport ×1 — no Infantry, no +, no Max, no Undo, no Deploy/Done. Not “Russians have no land IPC.” `RISK_STARTING_UNITS` still has 9 infantry. Verified causes: peek hid the sheet; Firestore/JSON can coerce the pool to `{transport:1}` / numeric maps; a missed player-id key reads as empty. Coerce + key alias + restore the starting kit on wave-1 / 0-deployed / no-land-or-air. Undo and Deploy always paint. First seat can place 6 and Done.
- B40 (CEVX6F): 2/2 host button still said “Create Game” (`isPublished === false` is the publish CTA, and publish kicked the host to Browse). Host primary is always **Start Game**. Start publishes if needed and stays in the lobby. “List in Open Games” is optional and does not leave the room.
- CEVX6F hold (same PR, do not start a new game): Start on a lobby that already has `gameId` / status `starting` reopens that doc — it does not `setDoc` a second match. Failed signed-in resume of the last code is reconnect-only (Rejoin CEVX6F), never the Create Game menu. A healed first-wave pool is pushed on the same game doc. SCHEMA 11. GAME_VERSION stays V2.77.

Harness: `node tools/test-presence-and-deploy.mjs`, `node tools/test-setup-phase-guard.mjs`, `node tools/test-placement-ux.mjs`, `node tools/test-tablet-chrome.mjs`, `node tools/test-mp-turn-sync.mjs`, `node tools/test-undo-and-turn-notice.mjs`.

---

## 8.16.26 — V2.76 AA fire silent; phone rotate swaps chrome; empty rematch after push_exhausted

Live V2.75 playtest. Unit placement PASSED. Guest Robert007 dump 2026-08-16T23:49:45Z: playing / combat, local v89, isActivePlayer true, not host. Sync: v85 purchase; v86–87 combat_move; v88–89 combat; v90 combat ×3; push_failed ×3 (version undefined); push_exhausted. James + Robert: AA unclear; phone rotate horizontal→vertical weirdly changes UI; yellow toast then the same Anglo-Sudan Egypt combat again with no enemy units.

This game may still be playable — new build is V2.76; do not abandon the table.

Cause:
- `_rollAAFire()` applied casualties and `_proceedAfterAAFire()` immediately. The readable block (dice + “AA Fire Results: N hit(s)”) only rendered on `selectAACasualties`, which the manual path never stayed on. Auto-battle blipped through AA in 150ms.
- `shouldUseMobileShell` / `initMobileShell` were width-only (`≤480` / `max-width: 480px`). iPhone landscape is 667–932 × ~390, so rotate dropped `html.mobile-shell` into the 481–900 tablet tree; rotate back restored phone chrome.
- `push_exhausted` → `syncFromAuthoritativeState` → `showNextCombat` rebuilt attackers/defenders from current units on `combatQueue[0]`. If the commit landed (defenders gone) but the territory stayed in the queue, it reopened a 0-enemy rematch. Exact toast: “Could not save — game re-synced to the last confirmed state. Please retry your move.”

Fix (UI / chrome / queue skip — SCHEMA 11, no rule/map/odds change):
- After AA rolls, stay on `aaResults`: who shot (defending AA), dice, hits, which aircraft died (cheapest first, no attacker choice). Continue proceeds. Auto-battle paints then pauses 600ms. One-line action-log entry.
- Phone if width ≤480 (height omitted), or min(width,height) ≤480 AND max <1024 (below iPad). Plus / Pro Max landscape (926–956 × 428–440) stay phone. `initMobileShell` uses innerWidth + innerHeight and re-applies on resize / orientationchange. Desktop windows (1280×400 / 1280×800) and iPad 768×1024 / 1024×768 stay frozen; 481/772/900 with no height stay tablet.
- Never show a combat against zero enemy combat units (factory excluded; AA-only still a fight). Empty queue heads dequeue as already resolved. If both sides remain, reopen the real fight. `_reloadRemoteState({force:true})` still restores pre-combat armies when the commit did not land.

Harness: `node tools/test-combat-ui.mjs`, `node tools/test-tablet-chrome.mjs`, `node tools/test-mp-turn-sync.mjs`.

---

## 8.16.26 — V2.75 host stuck on own unit_placement seat; AI paused until a guest is online

Live V2.74 playtest. Guest Robert007 dump 2026-08-16T23:22:14Z: phase=`unit_placement`, leftover constructor `turnPhase=purchase`, round 1, local v40. Current = James (host). Guest `isActivePlayer=false` (correct). Sync: Robert v23, then Hard Bots v24–33 in ~2s, then James current v34–40 for ~80s. Two table reports: (1) stuck on James's turn; (2) AIs only run after another human joins. This game is dead — new game after Vercel is V2.75.

Cause:
- V2.72/V2.73 waiting lock: human `finish-placement` sets `isWaitingForSync`. Host AI `finishPlacementRound` then `pushStateNow()`; while `isPushing`, `onSnapshot` updates `_updateActivePlayer` but does not fire `state_updated` / `turn_changed`, so the V2.73 clearer never runs when AI hands the seat back to the host.
- `mayRunAI` required presence-doc `anyHumanPresent`. iPhone host often looks `offline` (background/lock/heartbeat), so AI paused until a guest came online.

Fix (UI/sync safety — SCHEMA 11, no rule/map change, leftover purchase still not healed):
- After a local or remote state apply, `isWaitingForSync` drops when `currentPlayer.oderId === localUserId`. Done's optimistic lock still covers the next seat (double-tap skip stays illegal). Spectator overlay stays seat-based.
- A seated local human client counts as present even if the presence doc is stale. Unattended (no local seated human, no online humans) still pauses. `DEFAULT_AI_RUNS_WHEN_UNATTENDED` stays false. Host-only AI writer unchanged.
- Purchase / trade / buy actions require `phase === PLAYING` (leftover setup `purchase` stays inert).

Harness: `node tools/test-mp-turn-sync.mjs` (host lock after local AI handoff; local-human present), `node tools/test-setup-phase-guard.mjs`, `node tools/test-placement-ux.mjs`, robustness B2.

---

## 8.16.26 — V2.74 guest stuck on 2nd initial deployment (illegal phase combo)

Live V2.73 playtest. Guest Robert007 (not host), dump 2026-08-16T22:33:53Z: phase=`unit_placement`, turnPhase=`develop_tech`, round 1, local v24, isActivePlayer true. Players: Robert007, Easy Bot, James, Hard Bot. Sync log: Robert `state_push` with `phase: develop_tech` (`gameState.turnPhase` in main.js); Easy Bot also pushed develop_tech. He had not left. Game is dead.

Cause:
- `loadFromJSON` self-heal treated `develop_tech` as the only valid setup turnPhase, so leftover constructor `unit_placement + purchase` was rewritten to the dump combo, and the dump was then considered already valid (no heal).
- `nextTurn()` was not PLAYING-guarded (unlike `nextPhase()`). A call during unit_placement leaves phase as unit_placement and sets turnPhase to develop_tech — exact dump.
- V2.73 waiting-overlay fix does not cover this: guest was already isActivePlayer.

Fix (UI/sync safety — SCHEMA 11, no rule/map change):
- `nextTurn()` refuses unless `phase === PLAYING`. Setup stays on `finishPlacementRound` / `placeCapital`.
- Load/apply no longer rewrite leftover `purchase` into `develop_tech`. Setup ignores turnPhase; playing UI / techUI / AI `_handlePlayingPhase` / `nextPhase` / `nextTurn` require PLAYING.
- Guest on own 2nd deployment seat sees place-units + Done. Spectator overlay stays off when `oderId === localUserId`.
- Happy path: everyone done → PLAYING + DEVELOP_TECH.

Harness: `node tools/test-setup-phase-guard.mjs` plus existing `test-mp-turn-sync`, `test-placement-ux`, `robustness-harness`.

---

## 8.16.26 — V2.73 waiting overlay stuck on the active player's own seat

Live V2.72 playtest. James (iPhone, host) created a 4-seat game: Robert007 (desktop Chrome, not host), Easy Bot, James, Hard Bot. Capitals placed (Robert → James; host ran the AI seats). Robert's client then showed HIS unit_placement turn — tab title "Your turn", "Robert007's Turn", INITIAL DEPLOYMENT / CLICK TO PLACE UNITS — but a yellow WAITING badge and the spectator overlay "Robert007 is playing" / "You can view the map while waiting." He could not place.

Debug dump (2026-08-16T22:33:53Z): isActivePlayer true, not host, phase unit_placement, current = Robert007. Every `state_updated` line had `isActivePlayer=undefined`. State had actually advanced (v24 current=Robert after the AI seats).

Cause: V2.72 set `isWaitingForSync` on finish-placement (and next-phase handoff). `computeIsLocalPlayerTurn` treats that lock as "not your turn," which paints the spectator overlay even when the loaded seat is you. `state_updated` omitted `isActivePlayer`, so `if (data.isActivePlayer) setWaitingForSync(false)` never ran when a later remote snapshot made this client current.

Fix (shared turn/waiting state — desktop/tablet CSS frozen):
- Remote snapshot that makes you current clears waiting-for-sync (live `checkIsActivePlayer()`, and `state_updated` now carries the flag).
- Spectator overlay / WAITING badge are seat-based: never "You are playing" / "view the map while waiting" on your own seat. Own seat shows place-units UI.
- Done/End still uses the waiting lock so a double-tap cannot skip the next seat.

Harness: `node tools/test-mp-turn-sync.mjs` (active human + overlay illegal; isActivePlayer ⇒ place UI; host vs non-host after AI seats).

---

## 8.16.26 — V2.72 multiplayer Done/pass must persist; leftover bomber cannot lock Done

James on live V2.71: third deployment wave, placed, tapped Done / next player, exited the app. The game did not advance. Rejoin could not finish or pass — stuck between turns. An extra tactical bomber sat in the place tray and could not be placed.

Verified in-repo (not a chrome/CSS bug):
- `RISK_STARTING_UNITS` included `tacticalBomber`, but `data/units.json` had no def. `placeInitialUnit` / `hasPlaceableUnits` skip unknown types; the tray still listed quantity > 0. V2.71 sticky default-selected that leftover, so land taps failed while other real units remained and Done stayed hidden.
- `finish-placement` mutated local state then fired `pushStateNow()` without awaiting. If a place write was in flight, the Done waiter received the pre-Done result; the follow-up write died with the tab. `unitsPlacedThisRound` was not in `toJSON`, so rejoin reset the 6-cap and hid Done.

Fix (shared turn/pass state — desktop/tablet CSS frozen):
- `tacticalBomber` is a real air unit (owned land). Unknown leftovers are stripped from tray/sticky/counts and cannot block Done.
- `unitsPlacedThisRound` serializes (SCHEMA 11, additive). Mid-place rejoin restores the cap; uncommitted Done can be tapped again; committed Done already belongs to the next seat.
- Push queue: a Done waiter waits for the coalesced post-Done write, not the in-flight place write. `pagehide` / hidden flushes a pending debounce. Double-tap Done is `not-ready`.

Harness: `node tools/test-mp-turn-sync.mjs` (pass/rejoin/async/AI/double-tap/remote-wins/coalesce) and `node tools/test-placement-ux.mjs` (ghost leftover + real bomber).

---

## 8.16.26 — V2.71 phone tap-tap-tap place; one-tap capital; undo

James on live V2.70 (390): placement still felt like tray → map → tray → map. The commute is the bug (peek tray at the bottom, land in the middle). Confirm on Place Capital was an extra tap. Drag-from-chip was rejected (more travel; tiny DnD already failed).

Verified in-repo:
- `selectedUnitType` starts null (no default-first). After a place it stays unless the type is exhausted (`_renderPhonePlacementTray` cleared it to null). V2.69 then ignores land taps with no unit — first tap and post-exhaust taps require a tray trip.
- Place Capital still pushed a Confirm CTA on phone. Undo lived only in the expanded placement body, hidden by the peek tray.

Fix (phone setup only — same `place-unit` / `place-capital` / `undo-placement` handlers; no drag):
- Default-peek the first remaining placeable unit on Initial Deployment, and again when the selected type is exhausted. First land tap places.
- Sticky type after a place. He only opens the tray to change type.
- Place Capital: tap owned land commits. No Confirm. Miss / water / unowned still do not apply.
- Peek CTA exposes existing Undo for the current place, and in-memory undo for the last capital (not serialized; SCHEMA 11).
- V2.69 inspect split stays (place-tap does not open the card; long-press edge chip). V2.67 peek / V2.68 ink / V2.70 Fit stay.

Desktop ≥901 and tablet 481–900 frozen. No minimap-hide, combat toast, or tech/purchase work.

Harness: `node tools/test-tablet-chrome.mjs` (sticky / default-first / one-tap capital / undo predicates; existing peek + gold + Fit + inspect).

---

## 8.16.26 — V2.70 phone Fit is a regional window (never one chip, never poster)

V2.68 fillFrame killed the teal letterbox, but Fit still framed a single selected tile (Place Capital / first deploy tap) or, for worldwide empires, a world-span set that collapsed to a poster/centroid.

Fix (phone Fit only — same `applyPhoneCameraFit` / `fillFrame` path):
- Window is **owned land + neighbors / legal dests**. Adjacent sea is included so a coastal region still shows coastline.
- Never a single tile: owned ≤ 1 expands to neighbors; a tiny bbox is padded to a min region.
- Never the whole poster: worldwide owned uses the capital cluster (or the selected stack’s cluster), then neighbors.
- fillFrame still fills the map pane height (no teal letterbox).

V2.67 peek tray and V2.68 ink-edge stay. Desktop ≥901 and tablet 481–900 frozen. V2.69 peek-place / inspect predicates stay. SCHEMA_VERSION stays 11.

Harness: `node tools/test-tablet-chrome.mjs` (region vs chip vs poster, coastline neighbor, fillFrame, existing peek + gold + V2.69 tap/inspect).

---

## 8.16.26 — V2.69 phone setup tap places; inspect is a long-press edge card

James on live V2.68 (390, Place Capital / Initial Deployment): tap land opened the half-screen territory card. Then he had to tap a unit in the tray and tap the same land again to place. The inspect sheet covered the tile (inspect-blocking-commit).

Verified in-repo: `setSelectedTerritory` already places when a peek chip is selected. `mouseup` then always called `tooltip.show()` on phone, and the 400ms hover timer could also pop the full card.

Fix (phone setup only — same `place-unit` / Place Capital handlers):
- Noun first: peek a unit chip, then one tap on legal land places it. No second tap. No tooltip.
- No unit peeked: tap does not inspect and does not select. Peek hint is “Tap a unit, then the map.”
- Place Capital: tap owned land selects it; one Confirm CTA is the verb (no second hint line). Miss / water / unowned taps do not clear a pending confirm. No tooltip on that tap.
- Long-press (≥500ms, <12px move) opens a small edge chip (name / owner / IPC) under the HUD. Inspect does not place. V2.66 dismiss rules stay when a card is shown.

V2.67 peek tray and V2.68 ink-edge gold stay. Desktop ≥901 and tablet 481–900 frozen. SCHEMA_VERSION stays 11.

Harness: `node tools/test-tablet-chrome.mjs` (noun-first tap, capital confirm kept, peek hint vs Confirm, edge clamp, existing peek + gold + tooltip dismiss).

---

## 8.16.26 — V2.68 phone Fit fills the frame; gold is an owned edge

James on live V2.66 (390): (1) teal/blue bands above and below the map wasted the frame; (2) the gold owned-land wash shouted.

Verified in-repo:
- Canvas clear is `#3CC0BF`. `fitBounds` uses contain (`min(cssW/bw, cssH/bh)`). Fitting the 3500×2000 world (or a wide bbox) on 390×844 yields zoom ~0.11, viewport taller than `MAP_HEIGHT`, `_clamp` centers Y, and the extra vertical is empty teal — a world poster, not Fit-to-problem. `boundsFromPoints` also returns null for worldwide span and falls through to `fitWorld`.
- V2.66 gold was `rgba(255,214,32,0.55)` fill + `8/zoom` stroke + matching `shadowBlur` (the 20% / 2.5 world-px pass was invisible at Fit). Same `renderPhoneLegalHighlights` path.

Fix (phone-only; same highlight + Fit helpers):
- Owned land is a 2 CSS px **ink edge** (dark `#2a1f08` + muted gold `#c9a227`), no fill flood, no glow. Faction fill is never the only owned cue. Still screen-space so it reads at Fit.
- Fit frames **owned / selected stack / dests** with `fillFrame`: contain the problem, but never zoom out past `canvasH / MAP_HEIGHT`. No all-capitals world poster. Worldwide span uses a regional centroid window instead of letterboxed teal.

Desktop ≥901 and tablet 481–900 stay frozen. V2.66 tooltip show/dismiss unchanged. SCHEMA_VERSION stays 11. V2.67 peek tray stays. No legal-marks, inspect-gesture, combat-preview, minimap/zoom hide, CSS-zoom, or Firebase.

Harness: `node tools/test-tablet-chrome.mjs` (edge-only gold, 390 Fit does not letterbox, V2.67 peek predicates + tooltip predicates still pass).

---

## 8.16.26 — V2.67 phone peek tray (map-first; no persistent 42/50dvh sheet)

On `html.mobile-shell` / max-width 480, Purchase / Mobilize / Initial Deployment / movement rendered the full Actions or placement list. CSS capped `#sidebar` at 42dvh and `.player-panel--place-tray` at 50dvh, so the unit sheet covered about half the 390×844 frame and the map was a sliver.

Fix (phone-only — same DOM, same Actions / End Phase / `phone-select-unit` / `buy-unit` / `mobilize-unit` handlers):
- Default is a peek detent: phase hint on its own row, one horizontal row of 44px unit/action chips, one primary CTA (≥44×44) above the home indicator, plus a 44px expand handle.
- Expand is one detent (36dvh) for Units / Players / Territory / Log — not a 280px column and not a persistent 42/50dvh cover.
- Purchase / Mobilize / Deploy stay completable from the peek chips; expand still has +/− / Max / the full list.

V2.66 tooltip-visible + gold owned-land are untouched. Desktop ≥901 and tablet 481–900 stay frozen. SCHEMA_VERSION stays 11. No CSS-zoom, second JS client, Firebase, legal-mark, Fit, inspect-gesture, or combat-preview work.

Harness: `node tools/test-tablet-chrome.mjs` (peek default, 36dvh expand, 44px chips, hint stacked above CTA, desktop/tablet CSS unchanged). Existing harnesses still pass.

---

## 8.16.26 — V2.66 phone tooltip actually shows + gold reads at Fit (V2.65 390 playtest)

Live V2.65 at 390×720 (DevTools device mode, `html.mobile-shell` on) failed both V2.65 fixes.

1. **Tooltip never appeared.** `#territoryTooltip` got the right innerHTML (e.g. Baltic Sea Zone) and the V2.65 phone CSS, then stayed `territory-tooltip hidden` / opacity 0. Cause: `_position` → `clampTooltipToMapArea`. On phone `#sidebar` is a full-width bottom tray (or a leftover 280px rail rect from the 900px tree). `mapRight` shrinks, the ~280px card cannot fit, clamp returns null, `hidden` is put back. DevTools clicks also have no `fromTouch`, so the show path was skipped and mousedown hid the card.
2. **Owned-land gold invisible** in Place Capital and Initial Deployment. `phoneLegalNames` was the current player's land, but `renderPhoneLegalHighlights` used a 20% gold wash on opaque continent fill and a 2.5 **world-px** stroke. At Fit (~0.11) that stroke is ~0.3 CSS px.

Fix (phone-only):
- Phone ignores the sidebar rect when resolving map-right. Viewport clamp never returns null — do not re-hide after `show()`. Phone clicks show/toggle the card even without `fromTouch` (DevTools). V2.65 dismiss rules stay (tap-away, second tap, 2s, menu, Fit, phase/turn, leave-phone). Desktop hover + clamp-to-sidebar unchanged.
- Gold fill 55% and a screen-space outline (~8 CSS px = `8 / zoom` world units) so owned land is obvious at Fit on a 390-wide phone.

Desktop ≥901 and tablet 481–900 stay frozen. SCHEMA_VERSION stays 11.

Harness: leftover 280px rail must not hide the phone card; legal names still current-player land only; outline width at 0.11 is >40 world units. Existing harnesses still pass.

---

## 8.16.26 — V2.65 phone tooltip + owned-land highlight (V2.64 390 playtest)

Live V2.64 at 390×844 passed as a separate phone UX (landing cards, setup cards, Fit shows the world, full-screen menu, unit tray + gold halo). Desktop 1280 unchanged.

Blockers / nits on phone:
1. Territory info card stayed pinned mid-screen after a tap. It survived turn changes, sat on top of the ⋯ menu and Territory panel (tooltip is `position:fixed` on `body` at z-index 100; the menu sheet lives inside `#hud` at z-index 70), and persisted after resize to desktop. Cause: every canvas tap re-showed the card; chrome taps never hid it.
2. Place Capital / Initial Deployment: owned land was invisible until he probed — continent fill only, no legal-territory cue.
3. Tooltip text read dark-on-dark through the 75% glass card.

Fix (phone-only — `html.mobile-shell` / `@media (max-width: 480px)`):
- Tap-to-toggle + 2s auto-dismiss. Hide on tap-away (HUD / tray / Fit), menu open, phase/turn change, Fit, and leaving the phone shell. z-index 40 so the card sits under the menu sheet. Desktop hover tooltip unchanged (z-index 100).
- Soft gold fill + outline on the current player's owned land during Place Capital and Initial Deployment. Fit-to-owned uses that player's land in both setup phases.
- Opaque card + `#f8fafc` text; faction names use `readableFactionTextColor`.

Desktop ≥901 and tablet 481–900 stay frozen. SCHEMA_VERSION stays 11. Rules / combat / Firebase / turn email / CSS-zoom / second JS client unchanged.

Harness: `node tools/test-tablet-chrome.mjs` (tooltip hide-on-menu / z-index 40 / legal-land names). Existing `test-possessive.mjs`, `test-recent-move-display.mjs`, `test-placement-ux.mjs`, `test-mp-turn-sync.mjs`, `robustness-harness.mjs` still pass.

---

## 8.16.26 — V2.64 separate phone chrome tree (James V2.63 playtest)

James on V2.63 (phone): better than the desktop squeeze, but still hard. Menu lived in a cramped ⋯ dropdown over the HUD. Default zoom could not show the board (min zoom 0.4 ≈ a couple of territories). Setup pieces were 8px tokens on a zoomed-in map — he could not see remaining units.

Fix (phone-only — `html.mobile-shell` / `@media (max-width: 480px)`). Same game code, different chrome templates. Desktop ≥901 and tablet 481–900 stay on their existing trees.

- **Setup:** full-screen Local / Online cards; faction pick as tappable cards; START GAME sticky. Initial placement is a bottom tray of remaining units (name + count + icon, ≥44px rows). Tap a unit type, then tap the map. Desktop keeps the queue / +/− / confirm sheet.
- **Map / zoom:** phone min-zoom can fit the world (~0.11 at 390px). Enter + visible **Fit** (≥44px) frame all capitals / owned land / world. Pinch still works. Desktop min-zoom stays 0.4; Fit is `display: none` outside the phone block.
- **Menu:** full-screen sheet (Players, Territory, Log, Rules, Save & Exit) with 44pt rows. Not a ⋯ dropdown overlapping the HUD.
- **In-game chrome:** map-first. Idle peek is one hint + one CTA. No permanent 4-tab bar. Phase identity stays on the top bar. Purchase / tech / movement still open a tray body when those phases need it.
- **Pieces:** phone unit markers stay visible at world-fit zoom (≥20px) and get a gold halo for the selected tray type.

Also keeps the V2.63/early-V2.64 phone fixes: one Place Capital hint, readable faction text color, 44px targets.

SCHEMA_VERSION stays 11. Rules / combat math / Firebase / turn email / WhatsApp / territory-label collision / CSS-zoom of the desktop HUD / second JS client unchanged.

Harness: `node tools/test-tablet-chrome.mjs` (phone tray / Fit / menu-sheet / unit-size predicates + existing 480/tablet/desktop split). Existing `test-possessive.mjs`, `test-recent-move-display.mjs`, `test-placement-ux.mjs`, `test-mp-turn-sync.mjs`, `robustness-harness.mjs` still pass.

---

## 8.16.26 — V2.63 desktop-safe iPhone chrome (James V2.62 playtest)

Live V2.62 on iPhone (~390×844) was the desktop HUD stuffed into a phone: map was a ~110px postage stamp beside a 280px sidebar; title + five player chips overlapped; End Turn and Done could stack; Max sat next to zoom +/−; touch targets were 18px; “Pass the device” painted over live chrome; nothing used the Dynamic Island or home-indicator safe areas.

Fix (chrome only — iPhone shell via `html.mobile-shell` + `@media (max-width: 480px)` so the V2.61 tablet band 481–900 and desktop ≥901 stay on their existing trees):
- `viewport-fit=cover` (already on) + `100dvh` + `env(safe-area-inset-*)` on the top bar and bottom CTA
- Compact 44–52pt top bar: `{color} {faction} · {3/7 Combat Movement}` at ≥11pt. Do not copy the tablet hide-dots / 9px phase-name path. Wordmark / player list / settings behind ⋯
- Hide the persistent 280px right rail. Actions + `End ${phase}` move to a bottom tray (`max-height: 42dvh`). Map is full-bleed and the majority of the screen at idle
- Tray peek: PHASE_HINTS one-liner next to the one primary `End ${phase}` CTA (min-height 48px) above the home indicator. End Turn and Done never coexist; illegal/disabled actions stay hidden
- Max stays on the unit-count row; zoom +/− parks top-left (≥44px, away from the CTA; pinch is primary)
- Handoff is an opaque full-screen modal that hides HUD / panel / zoom / chips (one dismiss control)
- Combat / auto-battle hides End Turn, Done, and Max
- Every phone control ≥44 CSS px with ≥8px gap
- Hover-only facts get a tap equivalent: Surrendered is a visible OUT; IPC is visible on the ⋯ player list (not `title=` only)
- 390px Place Capital: hide the 280px rail (map-first); phase chip stays visible; one bottom CTA
- 390px setup: START GAME is sticky above the fold (no scroll to reach it)
- Phone tap targets: ☰ / ⋯, Turn Summary ✕, and menu rows are ≥44 CSS px
- Players tab is a 2-column stat grid, not a 5-column desktop table crammed into ~250px

QA: 390×844 (iPhone shell) and 1280×800 (desktop). 772×635 stays on the V2.61 tablet chrome path. SCHEMA_VERSION stays 11. Rules / map / combat math / economy / victory / multiplayerGuard / Firebase / touchInput zoom math / territory-label collision / bottom-sheet detents / turn emails unchanged.

Harness: `node tools/test-tablet-chrome.mjs` (480px shell predicates, 3/7 phase label, PHASE_HINTS peek, existing 772px tooltip checks). Existing `test-possessive.mjs`, `test-recent-move-display.mjs`, `test-placement-ux.mjs`, `test-mp-turn-sync.mjs`, `robustness-harness.mjs` still pass.

---

## 8.16.26 — V2.62 turn-badge possessive (V2.61 playtest)

Live V2.61 HUD turn badge read **"Germans's Turn"** (double possessive). Cause: HUD / player-panel / action-log copy concatenated `name + "'s Turn"`.

Fix (UI/copy only): shared `possessiveName` / `possessivePhrase` in `src/utils/possessive.js`.
- Plural / sibilant names (Germans, Russians, Americans, James, Max): `Germans' Turn`
- Adjectival demonyms (British, Japanese): `British Turn` (no `'s`)
- Other names: `Alice's Turn`

Same helper on the sidebar turn header, action-log "turn begins" line, and lobby default "… Game" name. Combat headers already used the bare faction name.

SCHEMA_VERSION stays 11. Combat math / economy / victory / setup-rules / map / multiplayerGuard / touchInput.js / zoom math unchanged.

Harness: `node tools/test-possessive.mjs`. Existing `test-tablet-chrome.mjs`, `test-recent-move-display.mjs`, `test-placement-ux.mjs`, `test-mp-turn-sync.mjs`, `robustness-harness.mjs` still pass.

---

## 8.16.26 — V2.61 tablet chrome (V2.59 narrow-window playtest, ~772×635)

Playtest on a ~770px window (sidebar ~280px, map ~490px):

### 1 — Territory tooltip covered the Actions panel

A ~280px hover/click card (`z-index: 100`) painted over the phase header, tabs, and +/Max. `_position` only flipped at the viewport edge.

Fix (display-only): `clampTooltipToMapArea` / `resolveMapRightEdge` keep the card in the map gutter (left of `#sidebar`). If it cannot fit, the tooltip is dismissed. CSS `max-width: min(280px, 100vw − sidebar − pad)` as a backup.

### 2 — Minimap ate the lower-left map

233×133 (coarse-pointer 300×171) covered Southern Africa / South Atlantic on a ~490px map.

Fix: shrink `#minimap` to 140×80 on narrow/short viewports (156×89 when coarse). Do not remove it. `_panFromEvent` now uses the displayed CSS box so clicks stay mapped after the shrink.

### 3 — Header wrap / flag-strip clip

“TACTICAL RISK” wrapped onto two lines; the turn-order flags were cut by the turn badge. Cause: default flex-shrink on the title plus the duplicate `.hud-legend` name strip.

Fix: nowrap + smaller title, compact turn badge, hide `.hud-legend` / phase-dots below 900px. Title, turn badge, and flag strip stay on the 48px row.

### 4 — Local setup dead space + unreadable faction names

`.lobby-overlay.modern::before` is more specific than the tablet hide, so the splash half still reserved space. `.lobby-container.modern` max-width 600px left ~180px empty. Unselected names are a disabled placeholder at opacity 0.4 / `#475569`.

Fix: hide the modern splash at ≤900px, let the setup column use the width, raise disabled/placeholder name color to `#cbd5e1`.

SCHEMA_VERSION stays 11. Combat math / economy / victory / setup-rules / map / multiplayerGuard / touchInput.js / zoom math unchanged.

Harness: `node tools/test-tablet-chrome.mjs`. Existing `test-recent-move-display.mjs`, `test-placement-ux.mjs`, `test-mp-turn-sync.mjs`, `robustness-harness.mjs` still pass.

---

## 8.16.26 — V2.60 zoom-vs-Max overlap + empty Recent Moves (V2.59 playtest)

Playtest on live V2.59 (tablet-relevant):

### Bug 1 — map zoom +/− sat on INITIAL DEPLOYMENT Max buttons

`#zoom-controls` is `position: absolute; right: 12px; z-index: 50` on `document.body`. The player panel is 320px at the right edge with z-index 20, so the circular +/− landed on the unit-row Max column. Clicking Max zoomed the map.

Fix (CSS only — `touchInput.js` / zoom math unchanged):
- Park zoom in the visible map gutter: `right: calc(320px + 12px)`.
- Raise `.player-panel` to z-index 55 so Max/steppers keep the hit target if they ever overlap.

### Bug 2 — RECENT MOVES row after Confirm Attack was icon-only

A later global `.pp-undo-btn { width: 100% }` (mobilize-era) overrode the compact history-row undo. In the flex row, the full-width button ate `.pp-move-desc` (`overflow: hidden`), so a real Novosibirsk → Evenki National Okrug attack rendered as an empty bar with only ↩.

Fix (display-only):
- Scope a compact `.pp-move-item .pp-undo-btn` so the description stays visible.
- Exported `formatRecentMove` — skip rows with no unit/from/to string; do not change undo or `moveHistory` writes.

SCHEMA_VERSION stays 11. Combat math / economy / victory / setup / map / multiplayerGuard / touchInput.js unchanged.

Harness: `node tools/test-recent-move-display.mjs`. Existing `test-placement-ux.mjs`, `test-mp-turn-sync.mjs`, `robustness-harness.mjs` still pass.

---

## 8.16.26 — V2.59 initial-deploy naval remainder near-lock (V2.58 playtest)

After 18 land/air units, Remaining = 6 (all naval). Selecting a land tile (e.g. Novosibirsk) showed “No land/air units to place”, DEPLOYED 0/6, and **no Done / Next Player button**. A random sea zone greys the naval list and still hides Done. Only a sea zone adjacent to the player’s own coast unlocks +/Max; Done appears after the 6 ships are placed.

Root cause (UI gating, not a placement-rule bug): `hasPlaceableUnits` stays true while leftover ships have a legal coastal sea zone, so `showDone` is false. The selected land tile offers no +/Max, and the panel had no hint pointing at a legal sea zone. Landlocked / enemy-occupied-only coasts already make `hasPlaceableUnits` false (Done was allowed) but that path had no copy.

Fix (UI only — `src/ui/playerPanel.js`):
- Exported `computeInitialPlacementUX`. When only naval remain and a legal drop exists, show a sticky hint to click a sea zone adjacent to an owned coast; **do not** offer Done (ships still cannot skip onto land).
- When only naval remain and there is **no** legal sea zone, show Done plus a “no legal sea zone” message so the player is not hard-locked. `finishPlacementRound` already skips unplaceable leftovers via `hasPlaceableUnits`.
- `_isValidPlacementTerritory` now treats enemy-occupied seas as invalid for the +/Max controls, matching `hasPlaceableUnits` / `placeInitialUnit`.

SCHEMA_VERSION stays 11. Combat math / economy / victory / setup / map / multiplayerGuard / touchInput.js unchanged.

Left for later (V2.57 nits, not a clean small fix here): confirm-bar click deselect / one dump to main menu mid-placement; post-Deploy selection jump (Russia→Kwangtung); remaining-count once staying 24 after a 6-unit deploy.

Harness: `node tools/test-placement-ux.mjs` (Done/hint predicates + `hasPlaceableUnits` landlocked / coastal / enemy-sea). Existing `test-mp-turn-sync.mjs` + `robustness-harness.mjs` still pass.

---

## 8.16.26 — V2.58 multiplayer turn-bar + auto-battle soft-lock (Robert Watts playtest)

Playtest on live V2.57: Robert (non-active) saw Sean's green **End Combat Movement →** button. After naval deployment, Sean auto-battled Eire, got "connecting error" toasts, ended the turn, then stuck on a greyscale **End Mobilize Units →**.

### Bug A — spectator saw the active player's End-phase bar (display-only)

`_render()` already computed `isLocalPlayerTurn` (live `oderId === localUserId`, including `isWaitingForSync`) and `_renderActionsTab` hid on waiting. `_renderBottomActions` never used that flag: it skipped AI, then always drew the green `End ${TURN_PHASE_NAMES[turnPhase]} →` during PLAYING. `multiplayerGuard` still blocked `nextPhase` on live oderId, so Robert could see the button but not advance Sean's turn.

Fix (`src/ui/playerPanel.js`): pass `isLocalPlayerTurn` into `_renderBottomActions` and return empty when multiplayer && !local turn (same predicate as the Actions tab). Exported `computeIsLocalPlayerTurn` / `shouldShowBottomTurnActions` for the harness. Did **not** change multiplayerGuard oderId logic, hasAIAuthority, schema 11, or touchInput.js.

### Bug B — auto-battle push storm + failed reload left a grey mobilize button

No literal "connecting error" string. Closest: `push_failed` / `push_exhausted` toasts in `main.js`. `_autoBattle` called `_syncCombatStateToGame()` → `_notify()` → `syncManager.pushState()` (100ms debounce) every combat round, so one Eire auto-battle hammered Firestore. Each retry cycle toasted "Connection hiccup"; exhaustion toasted "re-synced to the last confirmed state."

Two follow-on bugs made that a soft-lock:

1. **`_reloadRemoteState` no-op'd on equal versions.** After a failed write, remote version === local version, but local `gameState` still held uncommitted combat/mobilize mutations. The exhaust path claimed to snap back and never did. Combat UI local state could stay ahead of the doc.
2. **Exhaust handler only re-rendered the player panel.** It did not reset combat UI or put the Actions/place UI in front. The bottom bar's grey **End Mobilize Units →** is `disabled` when `getPendingPurchases()` qty > 0 — correct rule — but after a fake re-sync the place UI and the combat overlay could disagree with that bar.

Fixes:
- `GameState.pauseNotifications()` / `resumeNotifications({ flush })` — auto-battle suppresses per-round notify, then one flush + `pushStateNow()`.
- `_reloadRemoteState({ force: true })` on exhaust applies the remote doc even when versions are equal; emit `push_exhausted` *after* the reload.
- Exhaust handler calls `combatUI.syncFromAuthoritativeState()` and `playerPanel.revealActionsAfterResync()` so the player can retry the move (or place purchased units) instead of staring at a dead bar.
- `push_failed` toasts only on attempt 1 (not every retry). Disabled mobilize bar now says *why* (place purchased units on a factory / sea zone via the Actions tab).

No turn timers. SCHEMA_VERSION stays 11. Combat math / unit stats / economy / victory / setup / map unchanged.

Harness: P6 added (notify pause + equal-version exhaust reload). `node tools/test-mp-turn-sync.mjs` covers the bottom-bar predicate and pause/resume.

---

## 7.27.26 — V2.56 push-persistence fix (Robert's V2.55 playtest, 4 bugs)

Harness now at **59 checks, all green** (`tools/robustness-harness.mjs`).

### Bug 1 (GAME-BREAKING) — push-persistence failure, not turn-authority

Root cause: Robert's client advanced its *local* state through
combat → mobilize → the next player's turn, but **none of it committed to
Firestore** — the doc stayed frozen at v132, phase=combat. Every downstream
symptom (lost combat, "playing ahead," being able to act on the next player's
turn after refresh) fell out of that one fact: after refresh, Firestore
authoritatively said it was still Robert's turn, so he legitimately re-controlled
his own un-ended turn.

Decisive evidence: Robert and Bastion both reported Local Version 132 — they
*agreed*, so the doc genuinely never moved. The `state_push: version=133` log
lines were NOT commit confirmations; they were logged in `gameState.subscribe`
(main.js) as `localVersion + 1` on every notify, *before* the debounced push ran.
15 notifies at v132 → 15 "133" lines, zero commits. `push_failed` events were
real transaction throws that `_doPush` swallowed with no retry and no rollback.

Fixes (all in `src/multiplayer/syncManager.js`):
1. **Serialize + coalesce `_doPush`** — one in-flight transaction; a change
   during flight sets `_pushDirty` and re-pushes once on completion. Kills the
   contention storm from racing debounced/`pushStateNow` transactions.
2. **Retry transient failures** (3× exp backoff + jitter). On exhaustion,
   **reload the authoritative doc** so a client can never proceed on (or hand
   the turn off from) un-persisted state. New `push_exhausted` event → user sees
   "re-synced to last confirmed state."
3. **`checkIsActivePlayer()` now derives from live `gameState.currentPlayer`** —
   single source of truth for title/guard/debug. New `canPushLocalChange()`
   keeps the cached-flag *push authorization* (so a turn-ending push, which has
   already advanced the live currentPlayer, still fires).
4. **`push_failed` now logs the payload** `{attemptedVersion, currentPlayerId,
   phase, attempt, error}` instead of the bare error — no more blind debugging.

Harness reproduces the exact Robert/Bastion sequence with old semantics (local
diverges, doc frozen), then proves the fix (client reloads to truth, the waiting
human never sees a phantom handoff, recovery commits cleanly).

### Bug 2 — AI ran even when no human was present (see PHASE_4_PLAN.md)

Default is now **wait-for-human-present**: AI pauses when no non-AI,
non-surrendered player is connected, resumes on reconnect. Configurable via
doc-level `aiRunsWhenUnattended` (additive field, no schema bump). Policy logic
in `src/multiplayer/aiPolicy.js`; three options + trade-offs documented in
PHASE_4_PLAN.md.

### Bug 3 — turn indicator flipped back and forth — RESOLVED by Bug 1 fix #3

The cached-flag divergence was the cause; live-derived `checkIsActivePlayer()`
means guard, sidebar, title, and debug panel now share one source. Verified in
the harness (B3): a stale cached flag can no longer make a client think it's
still their turn.

### Bug 4 — "dice rolls seem predetermined" — INVESTIGATION ONLY, no gameplay change

Rolls are unseeded `Math.floor(Math.random()*6)+1` — there is no seeding
anywhere in the code. The "predetermined" impression was almost certainly a
byproduct of Bug 1: Robert re-resolved the *identical* combat repeatedly across
refreshes (same un-persisted state each time → similar outcomes). Added a central
`gameState._rollDie(context)` that all three d6 sites route through, logging each
roll (value + context + timestamp) to a bounded in-memory ring buffer
(`getRollLog()`, 500 entries, never serialized to Firestore) so future fairness
claims can be checked empirically. Distribution is unchanged.

---

## 7.21.26 — V2.55 robustness audit (compositions × play modes × version upgrades)

Systematic audit against `ROBUSTNESS_MATRIX.md`, backed by an executable
N-client harness (`tools/robustness-harness.mjs`, 33 checks, all green).

### Dimension C (version upgrade) — NEW capability, not a bug fix

Mid-game redeploys previously had no signal: a tab left open across a deploy
kept running old code with no prompt to refresh. Added:

- `src/version.js` — dependency-free `GAME_VERSION` / `SCHEMA_VERSION` /
  `compareGameVersions` (fail-safe: a missing or malformed stamp never prompts).
- Every game-doc push now stamps `clientVersion` + `schemaVersion`. Old clients
  ignore the extra doc-level fields; state schema (v11) is unchanged.
- On loading a doc written by a strictly-newer client, syncManager fires a
  one-shot `version_outdated` event → main.js shows a persistent, dismissible
  "refresh to update" banner. Non-blocking on purpose: an async player mid-turn
  must still be able to finish.

### Bug (surfaced during the audit) — lobby init crash

Extracting the version constant into `src/version.js` and re-exporting it from
`lobby.js` via a bare `export { GAME_VERSION } from '../version.js'` left the
name undefined *inside* lobby.js, so `_renderMainMenu` threw
`GAME_VERSION is not defined` and init aborted. Fixed by importing locally and
re-exporting. Caught by in-browser verification (would have broken every load).

### Refactor

Pure surrender transform extracted to `src/multiplayer/surrenderCore.js` (no
Firebase imports) so the harness exercises the exact live-session logic.

---

## 7.20.26 — V2.53 playtest (2 humans + 2 easy AI) → fixed in V2.54

### Bug 2 (deployment turn-stuck) — ROOT CAUSE

Robert (host) refreshed his tab mid-game. `presenceManager` DELETES the
presence doc on unload, and `getPlayerPresence` treats a missing doc as
instantly OFFLINE — so Bastion's client saw "host offline" for the few
seconds of the refresh, seized AI authority via the V2.52 host-failover,
and BOTH clients ran the AI deployment turns concurrently. The V2.49
transactions prevented same-version clobber but the two runners
interleaved semantically divergent states: the turn rewound
(doc currentPlayerId=British-AI vs state currentPlayerIndex=0/Bastion in
the debug dump), and a racing client that transiently computed
phase=PLAYING ran tech→purchase AI logic, pushing the impossible
`phase=unit_placement + turnPhase=purchase` combination that wedged the
game. (Presence rules only started working in V2.51's deploy — this
failover path had never fired in a real game before this playtest.)

Fixes (V2.54):
1. Failover requires the host to be CONTINUOUSLY offline for 90s before
   takeover (refresh windows no longer trigger it), with clear toasts on
   takeover and on returning control.
2. AIController re-checks authority BETWEEN actions and aborts a
   mid-run AI turn the moment authority is lost.
3. `nextPhase()` refuses to run outside the PLAYING phase (turnPhase
   corruption structurally impossible).
4. `loadFromJSON` normalizes invalid phase/turnPhase combinations —
   the currently wedged live game self-heals on next load+push.
5. Same-version snapshots with a different currentPlayerId now load the
   doc state (doc is authoritative) instead of only flipping the cached
   flag.
- Verified by a 2-client race harness (real GameState+AIController vs a
  mock transactional doc, 11/11 assertions): host-refresh no longer
  hands over authority; under forced instant-takeover contention the
  second writer lands ZERO writes (7 transaction aborts); corrupted docs
  normalize on load.

### Bug 1 — game missing from My Games before start

A pre-start game exists only as a `waiting` LOBBY doc; My Games queried
only the `games` collection. Fixed: My Games now shows a "Waiting to
start" section with lobbies you're a member of; tapping one returns you
to that lobby.

### Bug 3 — sidebar said one player, state said another

Two contributors: (a) the sidebar trusted the cached `isActivePlayer`
flag OR'd with the state check, so it could disagree with what the guard
actually allowed; now both use the identical live state check.
(b) The same-version/different-player snapshot case updated the flag
without loading state (see fix 5 above). ("Sean" vs "Bastion" is the
same person — account display name vs table name; the debug dump's
state was authoritative and consistent with the HUD.)

---

---

## 7.14.26 — V2.52 pass-and-play / save-state / multiplayer-mode audit

Systematic audit of all play modes and their combinations. Findings:

### Mode support matrix (verified against code)

| Mode | Supported? | Notes |
|---|---|---|
| Pure pass-and-play (1 device, 2+ humans, optional AI) | ✅ | Handoff overlay on every human→human transition (V2.51); localStorage autosave + lobby "My Games → Continue" resume |
| Pure online, live | ✅ | Firestore sync, presence indicators, host runs AI, host-failover if host offline |
| Pure online, async | ✅ | State persists in Firestore indefinitely; rejoin via My Games / Open Games; NEW: tab title flags "● Your turn" for backgrounded tabs |
| Mixed (hotseat pair + remote players) | ❌ by design | One signed-in account = one player; the multiplayer lobby has no "add local player" option, so the scenario cannot be constructed — it fails safely by being unofferable, not silently. Roadmapped in PHASE_4_PLAN.md |
| Reconnect / resume online | ✅ | Rejoin loads latest Firestore state; presence shows the player again; NEW: "X is back online / went offline" toasts |

### Real gaps found and FIXED in V2.52

1. **Online games clobbered the hotseat autosave.** `gameState.autoSave()`
   had no multiplayer guard, so every online turn overwrote the local
   autosave slot — and "My Games → Continue" would then load a broken
   half-multiplayer state with no sync manager. Fixed: autosave is now
   local-games-only (online persistence is Firestore's job).
2. **Setup phases never autosaved.** Autosave only ran on nextTurn/nextPhase
   (playing phase), so a hotseat game closed during capital placement or
   deployment was silently lost despite the resume UI existing. Fixed:
   `placeCapital` and `finishPlacementRound` now autosave.
3. **No async-turn awareness.** A backgrounded/async player had no signal
   it was their turn without switching to the tab. Fixed: browser tab title
   becomes "● Your turn — Tactical Risk" while it's your turn (reset on
   turn end / exit / auth error). Push/email notifications roadmapped.
4. **No connect/disconnect visibility.** Presence dots existed (and only
   work as of the V2.51 rules deploy) but transitions were silent. Fixed:
   "X is back online" / "X went offline" toasts for other players.

### Audit answers with no code change needed

- **Handoff overlay context**: fires only when `!isMultiplayer` and ≥2
  human players — verified in V2.51 (fires per human→human transition in
  hotseat incl. setup phases; never in online or vs-AI games). The
  mixed-device ordering question is moot while mixed mode is unsupported.
- **Mid-turn refresh (online)**: phase/turn transitions push immediately
  (`pushStateNow`); fine-grained actions debounce 100ms, so at most the
  final click before a hard-close is lost. Rejoin restores the latest
  pushed state and correct turn.
- **Write races**: `_doPush` runs in a Firestore transaction — a stale
  client's push aborts and triggers a state reload (V2.49, re-verified).
  Two clients cannot both win the same version number.
- **Stall behavior — documented, not changed**: async games have no turn
  timer (hang forever by design until someone acts; Leave/surrender and
  admin delete are the escape hatches). Live human disconnect mid-turn
  blocks the game until they return (host-failover only covers AI turns).
  Turn timers / skip-votes are roadmapped in PHASE_4_PLAN.md. Hotseat
  idle: no timeout, intentionally.

---

Running list of playtest debug rounds. Newest first. Status values:
**OPEN** / **FIXED (pending live verification)** / **VERIFIED**.

---

## 7.11.26 — V2.46 playtest (2x human, 2x easy AI)

Short round — did not get past deployment.

### Bugs

1. **Open Games is not showing the current game** (though it shows under
   'Your Games'). — reported by Robert
   - Status: **FIXED (pending live verification)**
   - Root cause: the Open Games browser only queries lobbies with
     `status == 'waiting'`. Once a game starts, the lobby flips to
     `'starting'` and disappears from the list entirely. Games in progress
     were only reachable via the separate "My Games" screen.
   - Fix: Open Games now shows a "Your games in progress" section listing
     the player's own active/starting games with a Resume action
     (`multiplayerLobby.js` + `lobbyManager.getMyActiveGames()`).

2. **Unable to get past deployment: game state keeps reverting to a single
   player's turn repeating.** Sequence: Sean capital → Robert capital →
   Sean deployment 1 → Robert deployment 1 → Benson (AI) skipped, back to
   Robert. — reported by Robert/Sean
   - Status: **FIXED (pending live verification)**
   - Root causes (several compounding):
     a. `main.js` created an **AIController on every client**, not just the
        host (`shouldInitAI || hasAIPlayers`). Both human clients tried to
        play Benson's turn.
     b. `multiplayerGuard` used a **cached** `isActivePlayer` flag that lags
        the real turn by the push debounce + network round-trip, so the
        non-host client's AI run was NOT blocked during that window. Two
        clients pushed conflicting states, each stamped `localVersion + 1`,
        clobbering each other → turn reverts/loops.
     c. `syncManager._doPush` blind-wrote with `updateDoc`, so a stale
        client could overwrite a newer remote state.
     d. The prior V2.46 worktree fixes (live-oderId guard, deployment
        skip-loop, `pushStateNow`) were **never merged to main**, so the
        deployed build still had the old bugs.
     e. Committed `main.js` called `playerPanel.setWaitingForSync()`, which
        only existed in an uncommitted diff → TypeError when ending the
        income phase in multiplayer on the deployed build.
   - Fixes: host-only AIController; live oderId turn check in the guard;
     transaction-guarded pushes that refuse to clobber newer state;
     immediate (non-debounced) push on phase/turn transitions; deployment
     round skip-loop; `setWaitingForSync` + missing auth methods
     implemented and committed together.

### Additional defects found during the V2.49 end-to-end audit

4. **Presence (online indicators) never worked.** Presence docs are written
   to the `games/{id}/presence/{userId}` subcollection but firestore.rules
   only covered a top-level `/presence` collection — every write was
   silently denied. Fixed with a subcollection rule. Also: game-doc delete
   rule referenced a nonexistent `hostId` field (admin delete always
   failed) — now admin-email based.
   - Status: **FIXED (pending live verification)**

5. **AI turns crawl/stall when the host's tab is hidden.** Browsers clamp
   chained timers in hidden tabs to ≥1s (eventually 1/minute), so an AI
   turn could take minutes if the host alt-tabbed — reads as "the AI's
   turn is stuck". Fixed: AI skips cosmetic delays and uses microtask
   scheduling while `document.hidden`; a `visibilitychange` listener kicks
   the AI when the tab returns. Verified in-browser: hidden-tab AI turns
   now complete in under a second.
   - Status: **FIXED (verified locally)**

6. **Game stalls forever if the host disconnects during an AI turn.**
   No other client was allowed to run AI. Fixed: host-failover — when
   presence marks the host offline, the first online non-surrendered human
   in turn order takes over AI duty (safe under the new transaction-guarded
   pushes). Eliminated players (no territories, no units) are also now
   skipped by turn advance so an absent wiped-out player can't block the
   game, and last-player-standing ends the game.
   - Status: **FIXED (needs live 2-client verification)**

### V2.49 end-to-end verification (local, 1 human + 1 easy AI)

Full game loop driven in-browser with zero console errors: lobby setup →
random turn order → AI capital auto-placement → human capital → 5
interleaved deployment rounds (AI ↔ human, skip-loop verified) →
transition to playing phase → human full turn → AI full turn (all 7
phases) → round wrap → Round 2. Multiplayer-specific paths (Firestore
sync, surrender, Open Games) still need a live 2-account session.

### Notes / feature requests

3. **'Your Games' needs a way to exit (or surrender) a game in progress.**
   — requested by Robert
   - Status: **IMPLEMENTED (pending live verification)**
   - Each game row in "My Games" now has a Leave button: confirms, marks
     the player surrendered, neutralizes their territories/units, advances
     the turn if it was theirs, removes the game from their list, and ends
     the game if fewer than 2 players (or no humans) remain.

---

## Earlier rounds

Screenshots from earlier rounds are in `Bugs V2.45/` and
`Naval Placement bugs/`. (Pre-dates this log; not itemized.)
