# METHOD — Settlecoast UX steals for SCHEMA 11 (2D only)

Tactical Risk display version **V2.81.45**. `SCHEMA_VERSION` stays **11** (no state-shape change).
This document is the in-repo METHOD for the V2.81.43–V2.81.45 polish pass. Theme, copy, and
mechanics stay Tactical Risk. Settlecoast is a UX pattern source only.

## 1. Production smoke checklist

Run on a cold load (hard refresh) against the PR preview or a local static server.
Do **not** treat a single screenshot as a pass.

1. **Cold load branded** — First paint is the Tactical Risk `#startup-loader`
   (navy briefing chrome, gold accents). Never a blank white / Vercel shell.
   Title + tagline + staged progress + status line are visible before `src/main.js`
   finishes. No Catan / Settlecoast / Sunmere copy or teal-island palette.
2. **First input** — Home / Local setup accepts a click or tap without a white
   flash after the loader dismisses.
3. **One core Confirm action** — Place Capital or Deploy: land → (unit) → named
   Confirm. Max fills a count only; Confirm still commits.
4. **390 + 500 viewports** — Phone shell at ~390 CSS-px and ~500 CSS-px. Primary
   Resign / Confirm / Max / phase CTAs stay ≥44pt, do not overlap, and clear
   `safe-area-inset-*` (home indicator / notch). Cancel / Undo / Reset stay reachable.
   Combat / attack is a full sheet with Odds → Select → Resolve chips and a
   sticky safe-area CTA — not a packed modal that clips Roll / Confirm on
   ~390-tall landscape.
5. **Console clean** — No uncaught errors on cold start, home, or the Confirm path.
6. **Orientation no state reset** — Rotate portrait ↔ landscape mid-setup or mid-turn.
   `GameState` must not re-init; capitals, queues, and the current phase stay.
7. **Reduced motion** — `prefers-reduced-motion: reduce` or `data-motion="reduced"`
   on the loader: no looping shimmer; hide/show is instant. Confirm still usable.

## 2. Playtest fixture matrix

Preferred debug fixtures: Local Play, 2 factions, Place Capital → Initial Deploy,
then skip to Combat Movement (Attack) and Non-Combat Movement (Fortify).
Do not un-split China / polygon merges.

| Journey | Desktop | Touch portrait 390 | Touch portrait 500 | Landscape phone | Reduced motion |
| --- | --- | --- | --- | --- | --- |
| Cold load → home | branded loader → Local / How to Play | same | same | same | no shimmer, instant dismiss |
| How to Play (guest) | Rules open, no sign-in | same | same | same | Rules readable |
| Place Capital | peek land → Confirm | same + 44pt Confirm | same | state kept on rotate | Confirm chrome visible |
| Initial Deploy | land → unit → Confirm; Max still needs Confirm | same | same | state kept | queued / held / unavailable |
| Combat Move | stack → units → highlighted land → Confirm | same | same | state kept | phase tip once (round 1) |
| Fortify | stack → units → own land → Confirm | same | same | state kept | phase tip once (round 1) |
| Re-open tips | Menu → Phase tips | ⋯ → Phase tips | ⋯ → Phase tips | same | card, no motion; blocked if Never |

Phase-tip storage key: `tacticalRisk_phaseGuides`. Auto-show during setup and
PLAYING while `gameState.round === 1`. After the first PLAYING round
(`round > 1`) tips never auto-open. **Got it** dismisses that page. **Never
show this again** sets `store.never` and blocks auto-show **and** menu reopen.
Menu → Phase tips still works unless Never is set. Manual paging only.

## 3. Explicit kills

Do **not** ship any of the following in this SCHEMA 11 2D pass:

- **Catan / Settlecoast / Sunmere theme or mechanics** — no island palette, no
  settler copy, no resource/hex rules. TR WWII grand-strategy language only.
- **Three.js board** — keep the existing 2D canvas map. Do not add a WebGL scene.
- **`@designcodeio/threeui` vendor** — do not install the package. Menu rail /
  seating may copy the *pattern* (static large hits on touch; hover-magnify only
  when `(hover: hover) and (pointer: fine)`).
- **Voice blocker** — lobby create/join + chat + voice stay PARKED. Do not build
  voice. Do not expand lobby chat unless a leftover is already trivial.

Confirm grammar SILO is held. Tesla corporate branding stays off this product surface.

## 4. Guest-path visual refs (pattern only)

Settlecoast screenshots from the **sign-in wall** (never reached their in-game
board). Use structure only. Do **not** clone parchment texture, cream paper,
teal island palette, Sunmere / Catan naming, crests, hex tiles, or 3D art.

| Shot | Steal | Do not ship |
| --- | --- | --- |
| `01-lobby-home` | Equal-weight icon tiles: Local / Online (Create or join) / How to Play (guest) | Island hero, “Settle. Trade. Conquer.”, Game lobby as a third play mode |
| `02-field-guide-narration` | Contents + page index + Previous / Got it on phase tips; Rules contents jump | Auto-advance, narration audio, pause/speed transport, hex illustrations |
| `03-game-lobby` | PARK — do not expand lobby create/join/chat/voice | Voice, chat, parchment seat lobby |
| `04-mobile-width-menu` | Single-column phone tiles; Confirm / Resign / Max stay ≥44pt and above the home indicator even if other chrome scrolls | Parchment rail, primaries trapped below the fold |

## 5. V2.81.45 — tutorial lifecycle, one bottom surface, Combat Move honesty

**Auto-show gate.** There is no persisted `turnNumber` (SCHEMA 11). We use
`gameState.round`, which starts at 1 and increments in `nextTurn()` after every
seat has gone. Auto-show = setup phases **or** PLAYING while `round === 1`.
Once `round > 1`, `shouldAutoShowPhaseGuide` is false. Menu reopen still works
unless `store.never === true`.

**Never.** `tacticalRisk_phaseGuides.never`. `shouldShowPhaseGuide` honors it.

**One bottom surface.** When the phase-guide, combat/purchase/tech sheet, or ⋯
menu is open, sibling peek / leftover sidebar / unit-tray chrome collapses.
Confirm / Resign / Max stay on the CTA rail (≥44pt, `safe-area-inset-bottom`)
except when a sheet owns its own buttons (combat / purchase / tech).

**Z-index ladder (phone / `html.mobile-shell`):**

| z | Surface |
| --- | --- |
| 40 | territory / unit tooltips |
| 50 | leftover desktop sidebar (`.player-panel`, unscoped) |
| 60 | peek tray / `#sidebar` |
| 65 | CTA rail (Confirm / Resign / Max) — never covered by the guide |
| 70 | `#hud` |
| 75 | phase-guide card (inset above `--mobile-cta`) |
| 150 | leftover purchase / tech side sheets (desktop) |
| 200 | combat sheet + phone ⋯ menu; purchase/tech dock to bottom on phone |
| 2000 | critical banners |

**Combat Move vs Attack.** The HUD chip is **Combat Move**, not Attack. Dice
are the **Combat** phase. One-job: tap stack → tap each unit → tap highlighted
land → named Confirm (`Move to X` / `Attack X`). Same purchase-class grammar
as Buy / Deploy. Fortify is Non-Combat Move on your lands. Place / Deploy keep
land → unit → Confirm (SILO).

**Phone combat sheet.** Attack/combat is not one packed `42dvh` modal. On
`html.mobile-shell` the popup is a full sheet from `--mobile-top-bar` to the
home indicator: step chips (Odds → Select → Resolve), a scrolling body, and a
sticky CTA band (`padding-bottom: safe-area-inset-bottom`). Roll / Confirm /
Continue / Next stay painted in that band on ~390-tall landscape. Battle-odds
hero stays 40px on tall phones and compact (28px) at `max-height: 500px`.
Confirm grammar and SCHEMA 11 are unchanged. Pattern only — no parchment.

Phase-guide card sits at z-index **75**, above the peek tray (60) but inset
above `--mobile-cta` so thumb Confirm is never covered. When the guide is
open, peek chips / leftover sidebar body demote.
