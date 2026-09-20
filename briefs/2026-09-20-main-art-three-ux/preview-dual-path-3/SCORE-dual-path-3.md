# SCORE-dual-path-3 — Viz FAIL ~58%

**Hold merge.** Tip→main still **STOP**. Dual-path is the ship.

## Verdict

Viz **FAIL ~58%** on preview of `V2.81.57-dual-path.3`.

Labels **Classic** vs **New UX (Three.js)** already PASS.

## P0-1 — stamp

CDN / L0 painted **`V2.81.57-dual-path.2`** after hard reload. Required: `GAME_VERSION` and L0 / lobby badge **`V2.81.57-dual-path.4`**.

Fix on this PR as `.4`: module `GAME_VERSION` is stamp SoT; `index.html` + `main.js?v=` + `style.css?v=` bump; `no-store` on `/` and `src/version.js`; stamp loop writes `.three-l0-ver`, `.three-lobby-ver`, `.lobby-version-badge`.

## P0-2 — Classic default

After `?ux=three`, `sessionStorage.tacticalRisk_uxMode=three` made **queryless `/` open New UX**. James: Classic is the true default. Cold / no `ux` query must be Classic Canvas.

Fail-closed: queryless **clears** three mode. `sessionStorage` three is set only when the user clicks **New UX**. `?ux=three` / `?three=1` still open New UX for that URL.

## Keep

- Tip `.19` reserved Confirm Attack footer (New UX only)
- Discord turn ping (Classic + New UX)
- Dual-path lobby labels

## Ship

`V2.81.57-dual-path.4` on `cursor/dual-path-lobby-e95f`. Do not merge.
