# dual-path.12 — lobby Back / refresh / list

Playtest 21 Sep (Robfox007 + Bastion). Stamp `V2.81.57-dual-path.12`.
Classic `/` and Experimental `?ux=three`. No rule changes.

## 9.20.26.08 — Back stuck in host lobby

**Repro:** Host creates a game, lists it in Open Games, stays in Game Lobby.
Tap **← Back**. Open Games flashes, then the room snaps back. No exit.

**Cause:** `disconnectFromLobby()` notified `currentLobby = null`. The
subscription treated that as B41 flicker and `_restoreLiveLobby()` via
`lastMatch.lobbyCode`. Experimental `mp.subscribe` forced `screen = 'room'`
whenever a lobby doc existed.

**Fix:** Explicit Back / Browse leave the view. Silent disconnect. Snapshot
does not force the room while `browsingAway`. Firestore lobby stays listed.

**Expect:** Classic Back → Open Games (stays). Back again → Main Menu.
Experimental room Back → Play Online → Main. No snap-back.

## 9.20.26.09 — refresh opens a map

**Repro:** From the .08 stuck lobby, refresh / restart / reopen. Lands on
an open map as if the match had started.

**Cause:** Boot treated `lobbyCode`-only lastMatch like a started game
(`shouldAutoResumeLastMatch`). Hid Main Menu and hydrated. A miss left the
empty map up.

**Fix:** Cold boot / refresh auto-resumes only a started `gameId` (B38).
Waiting `lobbyCode` returns Main Menu. Play Online can still re-enter.

**Expect:** Refresh from a waiting lobby → Main Menu on both forks. Started
games still resume.

Local + LIVE smoke (lobbyCode-only lastMatch `6V9ZXK` on
`https://tactical-risk20.vercel.app/` stamp `.12`):
- Classic `/` → Main Menu (Local Play). See `classic-main-after-lobbycode-refresh.png`
- Classic Play Online (auth) → Back to Menu stays home. See
  `classic-back-to-main.png`. Host-room Back **NOT-REACHED** (no Firebase creds).
- Experimental `?ux=three` → Main overlay (Local Play / Play Online). See
  `experimental-main-after-refresh.png`. Play Online Back stays on Main
  (`experimental-back-to-main.png`). Host-room Back **NOT-REACHED**.

## Bastion — List in Open Games needs a second click

**Repro:** Host in an unpublished waiting room taps **List in Open Games**.
First click looks like a no-op. Second click lists.

**Cause:** `publishLobby()` wrote Firestore but did not patch
`currentLobby.isPublished` or notify. First-click `_render()` still painted
the unpublished CTA. Experimental had no list control.

**Fix:** Patch + notify on first success. In-flight "Listing…". Shared
`shouldShowListInOpenGames`. Experimental room gets the same CTA
(`mp-publish` → `publishRoom`).

**Expect:** One intentional click lists. Button gone; Classic Back to Open
Games appears. Experimental list button gone after success.
