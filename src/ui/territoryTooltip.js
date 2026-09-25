// Territory tooltip that appears on hover over the map

import { getUnitIconPath } from '../utils/unitIcons.js';
import { isMobileShell, readableFactionTextColor, isPhoneCapitalInspectOnlyLand } from './mobileShell.js';
import { GAME_PHASES } from '../state/gameState.js';
import { isPhaseGuideChromeTarget } from './phaseGuide.js';

// Phone tooltip sits under #hud (70) so the full-screen menu sheet covers it.
// Desktop / tablet keep the unscoped z-index: 100.
export const PHONE_TOOLTIP_Z_INDEX = 40;
export const PHONE_TOOLTIP_AUTO_DISMISS_MS = 2000;

const PHONE_TOOLTIP_HIDE_REASONS = new Set([
  'tap-away',
  'menu-open',
  'phase-change',
  'turn-change',
  'fit',
  'resize-leave-phone',
  'auto',
  'commit',
  'deploy-open',
  'handoff',
]);

export function shouldHidePhoneTooltipOn({ mobile, reason } = {}) {
  return !!mobile && PHONE_TOOLTIP_HIDE_REASONS.has(reason);
}

// Second tap on the same territory closes the card (tap-to-toggle).
// DevTools device mode sends real mouse events (no fromTouch) — still toggle.
export function shouldToggleOffPhoneTooltip({ mobile, visibleName, tappedName } = {}) {
  return !!mobile && !!visibleName && visibleName === tappedName;
}

export function isPhoneSetupPlacementPhase(phase) {
  return phase === GAME_PHASES.TERRITORY_DRAFT
    || phase === GAME_PHASES.CAPITAL_PLACEMENT
    || phase === GAME_PHASES.UNIT_PLACEMENT;
}

// Place Capital / Initial Deployment: a tap commits (select / place).
// It must not open the half-screen inspect card. Playing keeps tap-to-toggle.
export function shouldShowPhoneTooltipOnTap({ mobile, phase } = {}) {
  if (!mobile) return false;
  return !isPhoneSetupPlacementPhase(phase);
}

// Phone has no hover inspect — the 400ms hover timer would pop the sheet
// during a press and block the land under the finger.
export function shouldShowPhoneTooltipOnHover({ mobile } = {}) {
  return !mobile;
}

export const PHONE_INSPECT_HOLD_MS = 500;
export const PHONE_INSPECT_MOVE_PX = 12;

// Long-press on setup land = inspect, not place.
export function shouldInspectPhoneHold({ mobile, phase, heldMs, movedPx } = {}) {
  if (!mobile || !isPhoneSetupPlacementPhase(phase)) return false;
  return Number(heldMs) >= PHONE_INSPECT_HOLD_MS
    && Number(movedPx) < PHONE_INSPECT_MOVE_PX;
}

export function shouldCommitPhoneSetupTap({ mobile, phase, inspected } = {}) {
  if (!mobile || !isPhoneSetupPlacementPhase(phase)) return true;
  return !inspected;
}

// V2.81.24: peek is a tap (pointerup, no drag). Pointerdown used to
// select the land, so a pan that started on Ukraine peeked Ukraine.
export function shouldApplyPhoneSetupTapOnPointerDown({ mobile, phase } = {}) {
  return false;
}

export const PHONE_SETUP_PAN_SLOP_PX = 12;

// Inspect ≠ pan. A drag pans without committing a peek. A tap peeks.
export function shouldCommitPhoneSetupPeekAfterGesture({ mobile, phase, movedPx } = {}) {
  if (!mobile || !isPhoneSetupPlacementPhase(phase)) return false;
  return Number(movedPx) < PHONE_SETUP_PAN_SLOP_PX;
}

const PHONE_CAPITAL_CTA_ACTIONS = new Set(['place-capital', 'undo-capital', 'pick-territory']);
const PHONE_TRAY_CHROME_ACTIONS = new Set([
  'place-capital',
  'pick-territory',
  'undo-capital',
  'buy-tech',
  'confirm-placement',
  'confirm-mobilize',
  'confirm-move',
  'finish-placement',
  'place-queue',
  'place-queue-max',
  'phone-pair-max',
  'phone-select-unit',
  'buy-unit',
  'next-phase',
  'undo-placement',
  'undo',
]);

export function isPhoneCapitalCtaTarget(target) {
  const el = target?.closest?.('[data-action]');
  return !!(el && PHONE_CAPITAL_CTA_ACTIONS.has(el.dataset?.action));
}

// Peek-tray verbs (Deploy / chips / stepper) are never a land tap.
// Document-capture setup peek used to hit-test the map under Deploy
// and retarget the staged pair (China → East Indies).
export function isPhoneTrayChromeTarget(target) {
  const el = target?.closest?.('[data-action]');
  if (!el) {
    return !!(target?.closest?.('.pp-bottom-actions')
      || target?.closest?.('.phone-peek-row')
      || target?.closest?.('.phone-peek-pair-hint')
      || target?.closest?.('.phone-peek-tools')
      || target?.closest?.('.pp-peek-cta-row'));
  }
  if (PHONE_TRAY_CHROME_ACTIONS.has(el.dataset?.action)) return true;
  return !!(el.closest('#sidebar')
    || el.closest('.player-panel')
    || el.closest('.pp-bottom-actions'));
}

// Header ⋯ / Map / the short menu sheet are chrome, not a land tap.
// Setup peek on document-capture pointerdown must not steal those hits
// (a HUD _render() before click left ⋯ looking dead).
export function isPhoneMapToolsChromeTarget(target) {
  return !!(target?.closest?.('#zoom-controls') || target?.closest?.('#minimap'));
}

export function isPhoneHandoffChromeTarget(target) {
  return !!(target?.closest?.('#handoffScreen')
    || target?.closest?.('.handoff-overlay')
    || target?.closest?.('.handoff-content')
    || target?.closest?.('.handoff-start-btn'));
}

export function pointHitsPhoneHandoffChrome(clientX, clientY) {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById('handoffScreen');
  if (!el || el.classList.contains('hidden')) return false;
  const x = Number(clientX);
  const y = Number(clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const r = el.getBoundingClientRect?.();
  if (!r || r.width <= 0 || r.height <= 0) return false;
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

export function isPhoneHudChromeTarget(target) {
  return !!(target?.closest?.('#hud')
    || target?.closest?.('.phone-menu-sheet')
    || target?.closest?.('.hud-menu-btn')
    || target?.closest?.('.hud-menu-container')
    || isPhaseGuideChromeTarget(target)
    || isPhoneHandoffChromeTarget(target)
    || isPhoneMapToolsChromeTarget(target));
}

export function pointHitsPhoneMapToolsChrome(clientX, clientY) {
  if (typeof document === 'undefined') return false;
  const x = Number(clientX);
  const y = Number(clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  for (const id of ['zoom-controls', 'minimap']) {
    const el = document.getElementById(id);
    if (!el) continue;
    const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden')) continue;
    const r = el.getBoundingClientRect?.();
    if (!r || r.width <= 0 || r.height <= 0) continue;
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  }
  return false;
}

// Place Capital map taps must assign even when a leftover-tall peek
// sidebar covers the land. Only Confirm / Undo are panel hits.
export function shouldIgnorePanelBoxForPhoneCapitalPeek({ mobile, phase } = {}) {
  // Place Capital: leftover-tall peek box must not swallow a named-land tap.
  // Initial Deployment: Deploy / Confirm is a hit — do not ignore that box.
  return !!mobile && phase === GAME_PHASES.CAPITAL_PLACEMENT;
}

// First tap after Start / handoff / a chrome reflow often misses because
// the camera still has the previous frame's size. Refit and retry once.
export function shouldRefitPhoneSetupHit({ mobile, phase, hasHit } = {}) {
  return !!mobile && isPhoneSetupPlacementPhase(phase) && !hasHit;
}

// Place Capital peek kinds. Confirm is legal ONLY on owned land.
// Enemy / unowned / sea = inspect (clear stale Confirm). Miss ignores.
export const PHONE_CAPITAL_PEEK_CONFIRM = 'confirm';
export const PHONE_CAPITAL_PEEK_INSPECT = 'inspect';
export const PHONE_CAPITAL_PEEK_IGNORE = 'ignore';

export function resolvePhoneCapitalPeekAction({
  phase,
  tappedIsOwnedLand = false,
  tappedIsLand = false,
  tappedIsWater = false,
  hasHit = false,
  landName = null,
  currentPlayerId = null,
  inspectOnly = false,
} = {}) {
  if (phase !== GAME_PHASES.CAPITAL_PLACEMENT) return null;
  if (!hasHit) return PHONE_CAPITAL_PEEK_IGNORE;
  const probe = inspectOnly
    || isPhoneCapitalInspectOnlyLand(landName, currentPlayerId);
  if (tappedIsOwnedLand && !probe) return PHONE_CAPITAL_PEEK_CONFIRM;
  if (tappedIsLand || tappedIsWater) return PHONE_CAPITAL_PEEK_INSPECT;
  return PHONE_CAPITAL_PEEK_IGNORE;
}

/** Desktop and phone Place Capital share this: owned home land names
 *  Confirm; inspect-only / enemy / water clears the peek so Confirm
 *  cannot stick to "just any territory". */
export function applyCapitalPlacementPeek({
  phase,
  hit = null,
  currentPlayerId = null,
  getOwner = null,
} = {}) {
  if (phase !== GAME_PHASES.CAPITAL_PLACEMENT || !hit?.name) {
    return { peek: null, capitalLandName: null };
  }
  const owner = typeof getOwner === 'function' ? getOwner(hit.name) : null;
  const tappedIsOwnedLand = !!(!hit.isWater && owner && owner === currentPlayerId);
  const peek = resolvePhoneCapitalPeekAction({
    phase,
    tappedIsOwnedLand,
    tappedIsLand: !hit.isWater,
    tappedIsWater: !!hit.isWater,
    hasHit: true,
    landName: hit.name,
    currentPlayerId,
  });
  return {
    peek,
    capitalLandName: peek === PHONE_CAPITAL_PEEK_CONFIRM ? hit.name : null,
  };
}

// Noun first on phone setup. Same handlers; this only decides whether a
// tap may change selection / dest. Place Capital: a hit (owned, enemy,
// or sea) applies so inspect can clear a stale Confirm. A miss does not.
export function shouldApplyPhoneSetupLandTap({
  mobile,
  phase,
  inspected,
  selectedUnitType,
  tappedIsOwnedLand,
  tappedIsLegalSea,
  tappedIsLand,
  tappedIsWater,
  hasHit,
  landName = null,
  currentPlayerId = null,
} = {}) {
  if (!mobile) return true;
  if (inspected) return false;
  if (phase === GAME_PHASES.UNIT_PLACEMENT) {
    void selectedUnitType;
    void hasHit;
    return !!tappedIsOwnedLand || !!tappedIsLegalSea;
  }
  if (phase === GAME_PHASES.CAPITAL_PLACEMENT) {
    const peek = resolvePhoneCapitalPeekAction({
      phase,
      tappedIsOwnedLand,
      tappedIsLand,
      tappedIsWater,
      hasHit,
      landName,
      currentPlayerId,
    });
    return peek === PHONE_CAPITAL_PEEK_CONFIRM || peek === PHONE_CAPITAL_PEEK_INSPECT;
  }
  return true;
}

// Park the inspect chip under the HUD, not on the tapped land.
export function clampTooltipToPhoneEdge({
  width,
  viewportWidth,
  padTop = 56,
  padding = 8,
} = {}) {
  const maxW = Math.max(1, viewportWidth - padding * 2);
  const w = Math.min(width || 180, maxW);
  const left = Math.max(padding, (viewportWidth - w) / 2);
  return { left, top: padTop + padding };
}

/**
 * Map-right edge used to keep the tooltip out of the Actions panel.
 * Hidden / zero-width / off-screen sidebars leave the full viewport.
 * Phone has no right rail (bottom tray is full-width) — never shrink mapRight
 * or a leftover 280px layout rect will make clampTooltipToMapArea return null
 * and _position will re-add `hidden` after show() fills the card.
 */
export function resolveMapRightEdge(sidebarRect, viewportWidth, { mobile } = {}) {
  if (mobile) return viewportWidth;
  if (!sidebarRect || !(sidebarRect.width > 0)) return viewportWidth;
  if (sidebarRect.left >= viewportWidth || sidebarRect.left <= 0) return viewportWidth;
  return sidebarRect.left;
}

/** Phone fallback: always returns a box. Never hide the card. */
export function clampTooltipToViewport({
  cursorX,
  cursorY,
  width,
  height,
  viewportWidth,
  viewportHeight,
  padding = 12,
} = {}) {
  const maxW = Math.max(1, viewportWidth - padding * 2);
  const maxH = Math.max(1, viewportHeight - padding * 2);
  const w = Math.min(width || 0, maxW);
  const h = Math.min(height || 0, maxH);
  let left = cursorX + padding;
  let top = cursorY + padding;
  if (left + w > viewportWidth - padding) left = cursorX - w - padding;
  if (top + h > viewportHeight - padding) top = cursorY - h - padding;
  left = Math.max(padding, Math.min(left, viewportWidth - padding - w));
  top = Math.max(padding, Math.min(top, viewportHeight - padding - h));
  return { left, top };
}

/**
 * Clamp a tooltip box to the map rectangle (left of the sidebar).
 * Returns {left, top}, or null when the box cannot fit without covering the panel.
 */
export function clampTooltipToMapArea({
  cursorX,
  cursorY,
  width,
  height,
  viewportWidth,
  viewportHeight,
  mapRight,
  padding = 15,
}) {
  const maxRight = mapRight - padding;
  const maxBottom = viewportHeight - padding;
  const availW = maxRight - padding;
  const availH = maxBottom - padding;

  if (width > availW || height > availH) return null;

  let left = cursorX + padding;
  let top = cursorY + padding;

  if (left + width > maxRight) {
    left = cursorX - width - padding;
  }
  if (top + height > maxBottom) {
    top = cursorY - height - padding;
  }

  left = Math.max(padding, Math.min(left, maxRight - width));
  top = Math.max(padding, Math.min(top, maxBottom - height));

  if (left + width > maxRight) return null;
  return { left, top };
}

export class TerritoryTooltip {
  constructor(continents) {
    this.continents = continents;
    this.gameState = null;
    this.unitDefs = null;

    // Build continent lookup
    this.continentByTerritory = {};
    for (const c of continents) {
      for (const t of c.territories) {
        this.continentByTerritory[t] = c;
      }
    }

    // Create tooltip element
    this.el = document.createElement('div');
    this.el.id = 'territoryTooltip';
    this.el.className = 'territory-tooltip hidden';
    document.body.appendChild(this.el);

    this.currentTerritory = null;
    this._phoneDismissTimer = null;
    this._phaseKey = null;
  }

  setGameState(gameState) {
    this.gameState = gameState;
    gameState?.subscribe?.(() => {
      if (!isMobileShell()) {
        this._phaseKey = null;
        return;
      }
      const key = `${gameState.phase}:${gameState.turnPhase}:${gameState.currentPlayerIndex}`;
      if (this._phaseKey && this._phaseKey !== key && shouldHidePhoneTooltipOn({
        mobile: true,
        reason: gameState.phase !== this._phaseKey.split(':')[0] ? 'phase-change' : 'turn-change',
      })) {
        this.hide();
      }
      this._phaseKey = key;
    });
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  show(territory, screenX, screenY, { inspect = false } = {}) {
    if (!territory) {
      this.hide();
      return;
    }

    this.currentTerritory = territory;
    const t = territory;
    const isLand = !t.isWater;
    const continent = isLand ? this.continentByTerritory[t.name] : null;
    const edgeInspect = !!(inspect && isMobileShell());
    this.el.classList.toggle('territory-tooltip--edge', edgeInspect);

    if (edgeInspect) {
      let html = `<div class="tt-header">${t.name}</div>`;
      if (this.gameState && isLand) {
        const owner = this.gameState.getOwner(t.name);
        const player = owner ? this.gameState.getPlayer(owner) : null;
        const ownerColor = readableFactionTextColor(player?.color || '#888');
        const ipc = this.gameState.getEffectiveIpc?.(t.name) ?? (t.production || 0);
        html += `<div class="tt-owner"><span style="color:${ownerColor}">${player?.name || owner || ''}</span></div>`;
        html += `<div class="tt-stats"><span class="tt-ipc">💰 ${ipc} IPC</span></div>`;
      } else {
        html += `<div class="tt-type">🌊 Sea Zone</div>`;
      }
      this.el.innerHTML = html;
      this.el.classList.remove('hidden');
      this._position(screenX, screenY);
      this._armPhoneAutoDismiss();
      return;
    }

    let html = `<div class="tt-header">${t.name}</div>`;

    // Owner info for land territories
    if (this.gameState && isLand) {
      const owner = this.gameState.getOwner(t.name);
      if (owner) {
        const player = this.gameState.getPlayer(owner);
        const flag = player?.flag;
        html += `<div class="tt-owner">`;
        if (flag) {
          html += `<img src="assets/flags/${flag}" class="tt-flag" alt="">`;
        }
        const ownerColor = isMobileShell()
          ? readableFactionTextColor(player?.color || '#888')
          : (player?.color || '#888');
        html += `<span style="color:${ownerColor}">${player?.name || owner}</span>`;
        html += `</div>`;
      }

      // Special indicators row
      const indicators = [];
      if (this.gameState.isCapital(t.name)) {
        indicators.push(`<span class="tt-indicator capital">★ Capital</span>`);
      }
      const units = this.gameState.getUnitsAt(t.name);
      const hasFactory = units.some(u => u.type === 'factory');
      if (hasFactory) {
        const capacity = this.gameState.getFactoryCapacity(t.name);
        indicators.push(`<span class="tt-indicator factory">🏭 Factory (${capacity} units/turn)</span>`);
      }
      const hasAA = units.some(u => u.type === 'aaGun');
      if (hasAA) {
        indicators.push(`<span class="tt-indicator aa">⚙ AA Gun</span>`);
      }
      if (indicators.length > 0) {
        html += `<div class="tt-indicators">${indicators.join('')}</div>`;
      }
    }

    // Production & Continent for land, "Sea Zone" label for water
    if (isLand) {
      const effectiveIpc = this.gameState?.getEffectiveIpc(t.name) ?? (t.production || 0);
      html += `<div class="tt-stats">`;
      html += `<span class="tt-ipc">💰 ${effectiveIpc} IPC</span>`;
      if (continent) {
        html += `<span class="tt-continent" style="border-color:${continent.color}">${continent.name} (+${continent.bonus})</span>`;
      }
      html += `</div>`;
    } else {
      html += `<div class="tt-type">🌊 Sea Zone</div>`;
    }

    // Units section - grouped by owner
    if (this.gameState) {
      const units = this.gameState.getUnitsAt(t.name);
      if (units && units.length > 0) {
        // Group units by owner, and collect cargo/aircraft for sea zones
        const unitsByOwner = {};
        const cargoByOwner = {};     // cargo on transports
        const aircraftByOwner = {};  // aircraft on carriers

        for (const u of units) {
          if (!unitsByOwner[u.owner]) unitsByOwner[u.owner] = [];
          unitsByOwner[u.owner].push(u);

          // For sea zones, collect cargo from transports
          if (t.isWater && u.cargo && u.cargo.length > 0) {
            if (!cargoByOwner[u.owner]) cargoByOwner[u.owner] = {};
            for (const c of u.cargo) {
              const cargoOwner = c.owner || u.owner;
              if (!cargoByOwner[cargoOwner]) cargoByOwner[cargoOwner] = {};
              cargoByOwner[cargoOwner][c.type] = (cargoByOwner[cargoOwner][c.type] || 0) + (c.quantity || 1);
            }
          }

          // For sea zones, collect aircraft from carriers
          if (t.isWater && u.aircraft && u.aircraft.length > 0) {
            if (!aircraftByOwner[u.owner]) aircraftByOwner[u.owner] = {};
            for (const a of u.aircraft) {
              const airOwner = a.owner || u.owner;
              if (!aircraftByOwner[airOwner]) aircraftByOwner[airOwner] = {};
              aircraftByOwner[airOwner][a.type] = (aircraftByOwner[airOwner][a.type] || 0) + (a.quantity || 1);
            }
          }
        }

        html += `<div class="tt-units-section">`;

        for (const [ownerId, ownerUnits] of Object.entries(unitsByOwner)) {
          const player = this.gameState.getPlayer(ownerId);
          const color = player?.color || '#888';
          const playerName = player?.name || ownerId;

          // Calculate power totals for this player
          let totalAttack = 0;
          let totalDefense = 0;

          html += `<div class="tt-player-units">`;
          html += `<div class="tt-player-header" style="border-color:${color}">`;
          if (player?.flag) {
            html += `<img src="assets/flags/${player.flag}" class="tt-player-flag" alt="">`;
          }
          html += `<span class="tt-player-name" style="color:${color}">${playerName}</span>`;
          html += `</div>`;

          html += `<div class="tt-units-grid">`;
          for (const u of ownerUnits) {
            const def = this.unitDefs?.[u.type];
            const iconPath = getUnitIconPath(u.type, u.owner);

            // Accumulate power totals
            if (def) {
              totalAttack += (def.attack || 0) * u.quantity;
              totalDefense += (def.defense || 0) * u.quantity;
            }

            // Build hover tooltip for this unit
            let unitTooltip = `${u.type.charAt(0).toUpperCase() + u.type.slice(1)}`;
            if (def) {
              unitTooltip += `\nAttack: ${def.attack || 0}`;
              unitTooltip += `\nDefense: ${def.defense || 0}`;
              unitTooltip += `\nMovement: ${def.movement || 0}`;
              if (def.cost) unitTooltip += `\nCost: ${def.cost} IPCs`;
            }

            // Capitalize unit type name
            const unitTypeName = u.type.charAt(0).toUpperCase() + u.type.slice(1);

            html += `<div class="tt-unit-icon-row" title="${unitTooltip}">`;
            if (iconPath) {
              html += `<img src="${iconPath}" class="tt-unit-icon" style="border-color:${color}" alt="${u.type}">`;
            } else {
              html += `<span class="tt-unit-badge" style="background:${color}"></span>`;
            }
            html += `<span class="tt-unit-name">${unitTypeName}</span>`;
            html += `<span class="tt-unit-qty">×${u.quantity}</span>`;
            html += `</div>`;
          }
          html += `</div>`;

          // Show cargo on transports for this player (sea zones only)
          if (t.isWater && cargoByOwner[ownerId] && Object.keys(cargoByOwner[ownerId]).length > 0) {
            html += `<div class="tt-cargo-section">`;
            html += `<div class="tt-cargo-label">📦 On Transports:</div>`;
            html += `<div class="tt-cargo-grid">`;
            for (const [cargoType, qty] of Object.entries(cargoByOwner[ownerId])) {
              const cargoIcon = getUnitIconPath(cargoType, ownerId);
              const cargoName = cargoType.charAt(0).toUpperCase() + cargoType.slice(1);
              html += `<div class="tt-unit-icon-row">`;
              if (cargoIcon) {
                html += `<img src="${cargoIcon}" class="tt-unit-icon" style="border-color:${color}" alt="${cargoType}">`;
              }
              html += `<span class="tt-unit-name">${cargoName}</span>`;
              html += `<span class="tt-unit-qty">×${qty}</span>`;
              html += `</div>`;
            }
            html += `</div></div>`;
          }

          // Show aircraft on carriers for this player (sea zones only)
          if (t.isWater && aircraftByOwner[ownerId] && Object.keys(aircraftByOwner[ownerId]).length > 0) {
            html += `<div class="tt-aircraft-section">`;
            html += `<div class="tt-aircraft-label">✈️ On Carriers:</div>`;
            html += `<div class="tt-aircraft-grid">`;
            for (const [airType, qty] of Object.entries(aircraftByOwner[ownerId])) {
              const airIcon = getUnitIconPath(airType, ownerId);
              const airName = airType.charAt(0).toUpperCase() + airType.slice(1);
              html += `<div class="tt-unit-icon-row">`;
              if (airIcon) {
                html += `<img src="${airIcon}" class="tt-unit-icon" style="border-color:${color}" alt="${airType}">`;
              }
              html += `<span class="tt-unit-name">${airName}</span>`;
              html += `<span class="tt-unit-qty">×${qty}</span>`;
              html += `</div>`;
            }
            html += `</div></div>`;
          }

          // Power totals row for this player
          if (totalAttack > 0 || totalDefense > 0) {
            html += `<div class="tt-power-totals">`;
            html += `<span class="tt-power-attack">⚔ ${totalAttack}</span>`;
            html += `<span class="tt-power-defense">🛡 ${totalDefense}</span>`;
            html += `</div>`;
          }

          html += `</div>`;
        }

        html += `</div>`;
      }
    }

    // Continent progress - show all players with presence
    if (this.gameState && continent && isLand) {
      const ownership = this._getContinentOwnership(continent);
      if (ownership.length > 0) {
        html += `<div class="tt-continent-section">`;
        html += `<div class="tt-continent-title" style="color:${continent.color}">${continent.name} Control</div>`;

        for (const { player, count, total, hasBonus } of ownership) {
          const pct = Math.round((count / total) * 100);
          html += `<div class="tt-continent-row ${hasBonus ? 'has-bonus' : ''}">`;
          html += `<div class="tt-continent-player">`;
          if (player.flag) {
            html += `<img src="assets/flags/${player.flag}" class="tt-micro-flag" alt="">`;
          }
          const rowColor = isMobileShell()
            ? readableFactionTextColor(player.color)
            : player.color;
          html += `<span style="color:${rowColor}">${player.name}</span>`;
          html += `<span class="tt-continent-count">${count}/${total}</span>`;
          if (hasBonus) html += `<span class="tt-continent-bonus-badge">+${continent.bonus}</span>`;
          html += `</div>`;
          html += `<div class="tt-progress-bar"><div class="tt-progress-fill" style="width:${pct}%;background:${player.color}"></div></div>`;
          html += `</div>`;
        }

        html += `</div>`;
      }
    }

    // Adjacent territories hint
    if (t.connections && t.connections.length > 0) {
      const landConns = t.connections.filter(c => {
        const ct = this.gameState?.territoryByName?.[c];
        return ct && !ct.isWater;
      });
      const seaConns = t.connections.filter(c => {
        const ct = this.gameState?.territoryByName?.[c];
        return ct && ct.isWater;
      });

      if (landConns.length > 0 || seaConns.length > 0) {
        html += `<div class="tt-adjacent">`;
        html += `<span class="tt-adjacent-label">Adjacent:</span>`;
        if (landConns.length > 0) {
          html += `<span class="tt-adjacent-count">🏔 ${landConns.length} land</span>`;
        }
        if (seaConns.length > 0) {
          html += `<span class="tt-adjacent-count">🌊 ${seaConns.length} sea</span>`;
        }
        html += `</div>`;
      }
    }

    this.el.innerHTML = html;
    this.el.classList.remove('hidden');

    // Position tooltip near cursor but within viewport
    this._position(screenX, screenY);
    this._armPhoneAutoDismiss();
  }

  _clearPhoneDismiss() {
    if (this._phoneDismissTimer) {
      clearTimeout(this._phoneDismissTimer);
      this._phoneDismissTimer = null;
    }
  }

  _armPhoneAutoDismiss() {
    this._clearPhoneDismiss();
    if (!isMobileShell()) return;
    this._phoneDismissTimer = setTimeout(() => {
      this._phoneDismissTimer = null;
      if (shouldHidePhoneTooltipOn({ mobile: true, reason: 'auto' })) this.hide();
    }, PHONE_TOOLTIP_AUTO_DISMISS_MS);
  }

  _getContinentOwnership(continent) {
    const ownership = {};
    const total = continent.territories.length;

    for (const terrName of continent.territories) {
      const owner = this.gameState.getOwner(terrName);
      if (owner) {
        ownership[owner] = (ownership[owner] || 0) + 1;
      }
    }

    return Object.entries(ownership)
      .map(([playerId, count]) => {
        const player = this.gameState.getPlayer(playerId);
        return {
          player: player || { id: playerId, name: playerId, color: '#888' },
          count,
          total,
          hasBonus: count === total
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  _position(x, y) {
    const padding = 15;
    const rect = this.el.getBoundingClientRect();
    const mobile = isMobileShell();
    const sidebar = document.getElementById('sidebar');
    const sidebarRect = sidebar && !sidebar.classList.contains('hidden')
      ? sidebar.getBoundingClientRect()
      : null;
    const mapRight = resolveMapRightEdge(sidebarRect, window.innerWidth, { mobile });
    const args = {
      cursorX: x,
      cursorY: y,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      mapRight,
      padding,
    };
    // Phone: never re-hide after show(). A leftover sidebar rail rect must
    // not eat the card. Desktop / tablet keep clamp-to-sidebar (may dismiss).
    const edge = this.el.classList.contains('territory-tooltip--edge');
    const pos = mobile
      ? (edge ? clampTooltipToPhoneEdge(args) : clampTooltipToViewport(args))
      : clampTooltipToMapArea(args);

    if (!pos) {
      this.el.classList.add('hidden');
      return;
    }

    this.el.style.left = `${pos.left}px`;
    this.el.style.top = `${pos.top}px`;
  }

  hide() {
    this._clearPhoneDismiss();
    this.el.classList.add('hidden');
    this.el.classList.remove('territory-tooltip--edge');
    this.currentTerritory = null;
  }

  get isVisible() {
    return !this.el.classList.contains('hidden');
  }
}
