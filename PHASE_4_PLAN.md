# Phase 4 — Commercial Polish Roadmap (PLAN ONLY — nothing here is implemented)

Scoped 7.14.26 after the V2.52 mode audit; revised same day per James:
- **Turn timers: cut.** Async games intentionally wait indefinitely.
- **Hotseat/pass-and-play: no further investment.** The V2.51/V2.52 hotseat
  code (handoff overlay, local autosave/resume) stays — it self-disables in
  online games — but hotseat surrender, mixed-mode (hotseat pair + remote),
  and any further same-device polish are out of scope. The tablet is treated
  as a **multiplayer client**, not a shared device.

Each area: priority, effort (S/M/L), dependencies, and why it matters
commercially. Ordering within a tier is the suggested build order.

---

## P0 — directly protects play sessions

### 1. Turn notifications (push/email)
Tab-title flag shipped in V2.52; real re-engagement needs Web Push
(Firebase Cloud Messaging) with an opt-in prompt, and/or email via a Cloud
Function on `currentPlayerId` change. Start with Web Push only.
- Effort: **M** (FCM service worker + opt-in UX + a Cloud Function) ·
  Depends on: adopting Cloud Functions (first server-side code in the
  project) · Commercial: async games die without a "your turn" ping — and
  with turn timers cut, notifications are the ONLY re-engagement lever.

### 2. AI stalemate detection + endgame heuristics
AIs with no favorable attacks hold position forever; two passive AIs can
loop indefinitely. Add: round-count-based aggression ramp, stalemate
detector (N rounds with no territory change → force best-available attack),
and endgame push toward capitals when income leader.
- Effort: **M** · Depends on: nothing · Commercial: "the game never ended"
  is a refund-review magnet.

## P1 — first-session experience

### 3. Tutorial / onboarding
Recommendation: light contextual overlay, not a separate mode — a
first-launch "coach" layer (dismissible banners per phase: what this phase
is, what to click) driven by a `seenHints` localStorage set, plus a
"Learn the basics" replay of those hints from the menu. A full scripted
mini-game walkthrough is a **L** follow-on; the coach layer is **S/M** and
captures most of the value. The existing per-phase sidebar hints are a
strong base.
- Effort: **S/M** (coach layer) / **L** (scripted tutorial game) ·
  Depends on: nothing · Commercial: first 10 minutes decide whether a
  stranger stays; this is the single highest-leverage new-player item.

### 4. Sound design
SFX for: dice roll, combat resolved, territory captured, unit placed,
phase change, your-turn chime (huge for async play), victory sting.
Options: (a) none; (b) free/CC0 library (Kenney audio packs) — **S/M**,
ship-quality is achievable; (c) commissioned — **L**, defer. Implementation:
tiny `sound.js` (Web Audio, preloaded, mute toggle persisted in
localStorage, default ON with first-visit hint). Haptics: `navigator.vibrate`
on capture/your-turn for coarse-pointer devices, **S** add-on.
- Effort: **M** overall · Depends on: nothing · Commercial: silence reads
  as "unfinished demo"; a your-turn chime doubles as a soft notification.

### 5. Animation & juice
Tiers: (a) **S** — CSS/canvas easing for territory-capture flash, phase-
banner transition, dice-roll shake in combat popup (diceAnimation.js exists
— audit and extend); (b) **M** — unit-movement tweening on the canvas
instead of snap (needs a small render-interpolation layer keyed off
moveUnits events); (c) **L** — full combat cinematics. Ship (a), then (b).
- Effort: **S→M** · Depends on: none for (a); render-loop refactor for (b) ·
  Commercial: perceived quality; juice is what screenshots/videos sell.

## P2 — depth and fairness

### 6. AI difficulty & personalities
Easy/medium/hard currently differ mostly in thresholds/randomness. Make the
difference legible: easy never attacks capitals early, hard plans 2-turn
capital pushes; add personality tags (Aggressive / Defensive / Opportunist)
selectable when adding an AI, mapped to the existing priority weights.
- Effort: **M** · Depends on: #2 (shares heuristics) · Commercial:
  replayability for solo players — the largest silent audience.

## P3 — instrumentation and reach

### 7. Analytics & telemetry
Firebase Analytics (already in the Firebase stack, zero extra vendors):
game_started (mode, players, AI count), phase_duration, game_ended (victory
type, rounds, duration), surrender/abandon events, tutorial funnel. No PII
beyond Firebase defaults; add a privacy note to the README/site footer.
GA4-style dashboards answer: where do players quit?
- Effort: **S/M** · Depends on: nothing · Commercial: every later balance
  and retention decision is guesswork without it.

### 8. Accessibility
Priority slice first: (a) color contrast audit of HUD/sidebar text on dark
panels; (b) colorblind-safe player palette option (the red/green faction
colors are a real problem) + patterned territory overlays; (c) complete
keyboard navigation (tab order through sidebar controls; arrows to pan,
+/- to zoom); (d) ARIA landmarks/labels on HUD, sidebar tabs, modals.
Full WCAG 2.1 AA sweep as a later **L** pass.
- Effort: **M** (priority slice) / **L** (full AA) · Depends on: nothing ·
  Commercial: storefront requirements increasingly expect it; colorblind
  support in a map-painting game is table stakes.

### 9. Deferred / hygiene
- Physical-device tablet verification pass (MOBILE_PLAN.md remainder) —
  emulated verification done in V2.52/V2.53; real-device gesture feel and
  Safari quirks still need a human with an iPad.
- Live 2-account multiplayer regression script for playtest rounds.
- Replace `confirm()`/`alert()` dialogs with in-app modals (consistency).
- Repo hygiene: `nul` / `Tactical Risk` junk files.

---

## AI-when-unattended policy (Bug 2 — decided V2.56)

From Robert's V2.55 playtest: a game with AI players kept advancing AI turns
even when no human was present to watch, so an abandoned game never truly
paused. Three options, with the mechanism to switch between them already wired
(doc-level flag `aiRunsWhenUnattended`, evaluated by `src/multiplayer/aiPolicy.js`
`mayRunAI()`; presence via `presenceManager.getPlayerPresence`):

1. **Anyone-can-take-over (legacy V2.54 behavior).** AI runs whenever *some*
   client with authority is open — host, or a failover client after the 90s
   grace. Set `aiRunsWhenUnattended = true`.
   - *Pro:* AI never stalls; an all-AI stretch fast-forwards while any tab is open.
   - *Con:* a game nobody is watching keeps churning AI turns; combined with
     async play, a player can return to find the AI has run many rounds unattended.

2. **Wait-for-human-present (DEFAULT, implemented V2.56).** AI turns only run
   while at least one non-AI, non-surrendered player is connected
   (`anyHumanPresent`). When the last human disconnects, AI pauses; it resumes
   the moment a human reconnects. `aiRunsWhenUnattended = false` (default).
   - *Pro:* an unattended game truly pauses; a returning player sees the game
     where they left it, not N AI rounds later.
   - *Con:* presence is heartbeat-based — a human with a backgrounded-but-open
     tab still counts as "present," so this pauses only on genuine disconnect,
     not on an idle open tab. Acceptable: the intent is to stop *abandoned*
     games, and a live tab is cheap to keep the AI flowing.

3. **Host-only, no failover (not chosen).** Only the host ever runs AI; if the
   host is gone, the game waits regardless of who else is present.
   - *Pro:* simplest authority model, zero concurrent-runner risk.
   - *Con:* one host disconnect freezes the game for everyone until they return —
     the exact fragility the 90s failover grace was added to avoid.

Revisit trigger: if playtesters report AI stalling when they *want* it to keep
going (option 1's use case), expose `aiRunsWhenUnattended` as a lobby toggle
rather than a Firestore-console-only flag.

---

## Suggested sequencing

1. **V2.54**: #2 AI stalemate + #4 sound (library tier)
2. **V2.55**: #3 coach-layer onboarding + #7 analytics
3. **V2.56**: #1 push notifications
4. **V2.57**: #5 animation tier (b) + #6 AI personalities
5. **V2.58+**: #8 accessibility slice

(V2.53 is reserved for the tablet-as-multiplayer-client verification pass.)

## Cut from scope (per James, 7.14.26)

- Turn timers / stall-recovery votes — not wanted.
- Local-hotseat surrender — hotseat is not a supported focus.
- Mixed-mode (hotseat pair + remote players) — same reason.
