// Player-focused panel with tabbed navigation
// Tabs: Actions, Stats, Territory, Log

import { GAME_PHASES, TURN_PHASES, TURN_PHASE_NAMES, TECHNOLOGIES, shouldShowTechResearch, shouldShowPurchase } from '../state/gameState.js';
import { DIRECT_TECH_IPC_COST } from '../gameOptions.js';
import { getUnitIconPath } from '../utils/unitIcons.js';
import { formatUnitName } from '../utils/unitNames.js';
import { possessivePhrase } from '../utils/possessive.js';
import {
  isMobileShell,
  pickMobilePrimaryButtons,
  shouldPeekPhoneTray,
  shouldShowPhoneChromeTabs,
  shouldShowPhonePanelBody,
  shouldShowPhonePeekUnitRow,
  shouldUsePhonePlacementTray,
  shouldShowPhoneDetentTabs,
  shouldShowPhoneTrayToggle,
  shouldShowPhonePlaceMeta,
  shouldAutoStagePhoneDeployPair,
  shouldUsePhonePairGrammar,
  shouldShowPhonePeekMax,
  shouldShowPhoneDeployChip,
  phonePointerHint,
  isPhoneCapitalInspectOnlyLand,
  remainingEligibleOfType,
  shouldCommitPhoneIconTap,
  shouldClearPhoneIconAfterExhausted,
  shouldHidePhonePairConfirm,
  phoneIconCommitCount,
  canNamePhoneMoveDest,
  shouldStagePhoneMoveIcon,
  remainingUnstagedOfType,
  nextStagedCount,
} from './mobileShell.js';
import { renderDiceStatsMarkup } from './diceStatsPanel.js';
import { knownUnitsToPlace } from '../state/placementPass.js';
import {
  applyPlaceQueueDelta,
  applyPlaceQueueMax,
  canAddToPlaceQueue,
  canStagePlaceQueue,
  quantityAvailableForType,
  expandPlaceQueue,
  queuedCount,
  deployedThisRoundDisplay,
  placementBudgetCopy,
  queueAfterDeployAttempt,
} from '../state/placeQueue.js';
import {
  resolveConfirmChrome,
  isQueuedConfirmAction,
  confirmChromeClass,
} from './confirmChrome.js';
import { resolvePresenceState } from '../multiplayer/presencePolicy.js';
import { resolveHostReconnectCopy } from '../multiplayer/lastMatch.js';
import {
  shouldFlushPeekOnPhaseOrSeatChange,
  flushPeekState,
  looksBrokenBarHtml,
} from './peekFlush.js';
import {
  resolveUndoAction,
  canUndoLastMove,
  shouldPassPlacementTurn,
  shouldApplyUndoAction,
  listAddressableMoveRows,
  formatRecentMove,
  resolveMovementUndoBar,
  formatUndoBarLabel,
} from '../state/undoPolicy.js';

export { formatRecentMove };
import {
  shouldOfferEndPhaseDuringMove,
  shouldDisableEndPhaseForCombat,
  selectedMoveCount,
  remainingAirLandingsToAssign,
  mergeLandingSelections,
  resolveLandingDestination,
} from '../state/airLanding.js';
import {
  airCombatMoveMayOccupy,
  airSelectionType,
  maxMoveSelection,
  moveSelectionProfile,
  moveUnitKey,
  seaZoneHasEnemyForAirAttack,
} from '../state/combatMoveEligibility.js';
import { hasLegalAirLandingFrom, wasFriendlyAtTurnStart } from '../state/airLanding.js';
import {
  factoriesAdjacentToSeaZone,
  factoryProductionLimit,
  factoryProductionUsed,
} from '../state/mobilizeSource.js';
import {
  canPlaceAirOnCarrierInSeaZone,
  pendingAirCanLoadInSeaZone,
  seaFirstUnitTypes,
} from '../state/carrierPlacement.js';

export {
  shouldOfferEndPhaseDuringMove,
  shouldDisableEndPhaseForCombat,
  selectedMoveCount,
  remainingAirLandingsToAssign,
};
import {
  capturePanelPointerLock,
  resolveLockedPanelClick,
  shouldBlockMapSelectAfterPanel,
  isQueueGestureAction,
  shouldIgnoreQueueRetarget,
  shouldApplyQueueGesture,
  shouldBeginNewQueueGesture,
  shouldCommitOverlayGesture,
  shouldAllowPlaceQueueTypeSwitch,
  resetPlaceQueueGestureState,
  resolveQueueUnitType,
  pickPanelHitFromStack,
  pointHitsPlayerPanel,
  PANEL_QUEUE_GUARD_MS,
} from './panelClickLock.js';

// Compact phase hints — phone tray peek reads these next to End ${phase}.
export const PHASE_HINTS = {
  [GAME_PHASES.TERRITORY_DRAFT]: 'Click an open territory',
  [GAME_PHASES.CAPITAL_PLACEMENT]: 'Click your territory',
  [GAME_PHASES.UNIT_PLACEMENT]: 'Click to place units',
  [TURN_PHASES.DEVELOP_TECH]: '',
  [TURN_PHASES.PURCHASE]: '',
  [TURN_PHASES.COMBAT_MOVE]: 'Click stack → units → highlighted land → Confirm',
  [TURN_PHASES.COMBAT]: '',
  [TURN_PHASES.NON_COMBAT_MOVE]: 'Click stack → units → your land → Confirm',
  [TURN_PHASES.MOBILIZE]: '',
  [TURN_PHASES.COLLECT_INCOME]: '',
};

const TABS = [
  { id: 'actions', label: 'Actions', icon: '⚔' },
  { id: 'stats', label: 'Players', icon: '📊' },
  { id: 'territory', label: 'Territory', icon: '🗺' },
  { id: 'log', label: 'Log', icon: '📜' },
  { id: 'debug', label: 'Debug', icon: '🔧', multiplayerOnly: true },
];

// Live "is it my turn?" check — same predicate the Actions tab and the
// multiplayer guard use. Exported so the bottom-bar visibility rule can be
// unit-tested without constructing a DOM-backed PlayerPanel.
export function computeIsLocalPlayerTurn({ isMultiplayer, isWaitingForSync, localUserId, currentPlayerOderId }) {
  return !isMultiplayer ||
    (!isWaitingForSync && !!localUserId && currentPlayerOderId === localUserId);
}

// James lock: tab title, YOUR TURN / WAITING badge, and the your-turn
// ping share the loaded seat. The waiting lock must never make the tab
// say "Your turn" while the panel says WAITING.
export function resolveTurnChrome({
  isMultiplayer = false,
  localUserId = null,
  currentPlayerOderId = null,
  currentPlayerName = null,
} = {}) {
  const ownSeat = !isMultiplayer || isCurrentPlayerLocal({ localUserId, currentPlayerOderId });
  const badge = isMultiplayer ? (ownSeat ? 'YOUR TURN' : 'WAITING') : null;
  const waitingName = currentPlayerName || 'the other player';
  const tabTitle = ownSeat
    ? '● Your turn — Tactical Risk'
    : (isMultiplayer ? `Waiting: ${waitingName} — Tactical Risk` : 'Tactical Risk');
  const seatLabel = ownSeat ? 'YOUR TURN' : `WAITING · ${waitingName}`;
  return { ownSeat, badge, tabTitle, seatLabel, currentPlayerName: waitingName };
}

export function resolveTabTitle({
  isLocalPlayerTurn,
  isMultiplayer,
  localUserId,
  currentPlayerOderId,
  currentPlayerName,
} = {}) {
  if (isMultiplayer || currentPlayerOderId != null || localUserId != null) {
    return resolveTurnChrome({
      isMultiplayer: isMultiplayer !== false,
      localUserId,
      currentPlayerOderId,
      currentPlayerName,
    }).tabTitle;
  }
  return isLocalPlayerTurn ? '● Your turn — Tactical Risk' : 'Tactical Risk';
}

export function emitYourTurnEvent({ yourTurn, playerName, gameId } = {}) {
  const detail = {
    yourTurn: !!yourTurn,
    playerName: playerName || null,
    gameId: gameId || null,
    at: Date.now(),
  };
  if (typeof window !== 'undefined') {
    window.__tacticalRiskTurn = detail;
    window.dispatchEvent(new CustomEvent('tacticalrisk:your-turn', { detail }));
  }
  return detail;
}

// Loaded-state seat check — ignores the optimistic waiting lock.
// WAITING / "X is playing" / "view the map while waiting" are spectator copy
// and must never paint on the local human's own seat (V2.72 Robert playtest).
export function isCurrentPlayerLocal({ localUserId, currentPlayerOderId }) {
  return !!localUserId && currentPlayerOderId === localUserId;
}

// Spectator overlay is only for someone else's seat. Active human + waiting
// overlay is illegal even if isWaitingForSync is still stuck true.
export function shouldShowSpectatorWaiting({ isMultiplayer, localUserId, currentPlayerOderId }) {
  if (!isMultiplayer) return false;
  if (!localUserId) return true;
  return !isCurrentPlayerLocal({ localUserId, currentPlayerOderId });
}

// A remote snapshot that makes THIS client the current human must drop the
// optimistic waiting lock. state_updated used to omit isActivePlayer, so
// `if (data.isActivePlayer)` never cleared and the overlay stuck on own seat.
// Own seat also drops the lock: host AI finishPlacement can hand the seat
// back locally while isPushing swallows state_updated / turn_changed.
export function resolveWaitingForSyncAfterRemoteSnapshot({
  isWaitingForSync,
  isActivePlayer,
  localUserId,
  currentPlayerOderId,
}) {
  if (isActivePlayer) return false;
  if (isCurrentPlayerLocal({ localUserId, currentPlayerOderId })) return false;
  return !!isWaitingForSync;
}

// After a local apply (AI / finishPlacement) the loaded seat is truth.
// You cannot stay waiting-locked on your own seat. Done's optimistic lock
// is set BEFORE this apply, so double-tap skip of the next seat still holds.
export function resolveWaitingForSyncAfterStateApply({
  isWaitingForSync,
  localUserId,
  currentPlayerOderId,
}) {
  if (isCurrentPlayerLocal({ localUserId, currentPlayerOderId })) return false;
  return !!isWaitingForSync;
}

// After applying a remote snapshot: isActivePlayer true ⇒ place-units UI.
// Local AI handoff may leave isActivePlayer stale; own seat still shows place.
export function shouldShowPlaceUnitsUI({
  isMultiplayer,
  isWaitingForSync,
  localUserId,
  currentPlayerOderId,
  isActivePlayer,
}) {
  const waiting = resolveWaitingForSyncAfterRemoteSnapshot({
    isWaitingForSync,
    isActivePlayer,
    localUserId,
    currentPlayerOderId,
  });
  return computeIsLocalPlayerTurn({
    isMultiplayer,
    isWaitingForSync: waiting,
    localUserId,
    currentPlayerOderId,
  });
}

// Primary End-phase / confirm bar is only for the local human whose turn it is.
export function shouldShowBottomTurnActions({ isMultiplayer, isLocalPlayerTurn, isAI }) {
  if (isAI) return false;
  if (isMultiplayer && !isLocalPlayerTurn) return false;
  return true;
}

// Initial-deployment Actions-panel UX. Display-only: ships still cannot be
// placed on land. selectedKind is 'owned-land' | 'valid-sea' | 'other'.
export function computeInitialPlacementUX({
  placedThisRound = 0,
  limit = 6,
  totalRemaining = 0,
  landAirRemaining = 0,
  navalRemaining = 0,
  hasPlaceable = false,
  totalQueued = 0,
  selectedKind = 'other',
} = {}) {
  const canFinish = placedThisRound >= limit || totalRemaining === 0 || !hasPlaceable;
  const onlyNavalRemain = landAirRemaining === 0 && navalRemaining > 0;
  // Leftover ships: Done/skip from ANY tile, including a legal sea (James
  // B19-class: 1/6, 6 naval-only, Undo-only because Done was sea-gated).
  // Gating Done on 6/6 or on valid-sea is the inland/sea deadlock.
  const canSkipNaval = onlyNavalRemain
    && totalQueued === 0
    && placedThisRound < limit;
  const showDone = (canFinish || canSkipNaval) && totalQueued === 0;
  const needSeaHint = onlyNavalRemain
    && hasPlaceable
    && selectedKind !== 'valid-sea'
    && placedThisRound < limit;
  const stuckWithNaval = onlyNavalRemain && !hasPlaceable;

  let hint = null;
  if (needSeaHint && canSkipNaval) {
    hint = 'Click a sea zone adjacent to a coastal territory you own to place leftover ships, or Done to skip them.';
  } else if (needSeaHint) {
    hint = 'Click a sea zone adjacent to a coastal territory you own to place ships.';
  } else if (canSkipNaval && selectedKind === 'valid-sea') {
    hint = 'Place leftover ships here, or Done to skip them.';
  } else if (stuckWithNaval && showDone) {
    hint = 'No legal sea zone to place remaining ships. Continue to the next player.';
  }

  return { showDone, needSeaHint, stuckWithNaval, onlyNavalRemain, canSkipNaval, hint };
}

// One-line "what now" for the phone tray peek (and the desktop phase row).
export function resolvePhaseHint(phase, turnPhase) {
  if (phase === GAME_PHASES.TERRITORY_DRAFT) return PHASE_HINTS[GAME_PHASES.TERRITORY_DRAFT] || '';
  if (phase === GAME_PHASES.CAPITAL_PLACEMENT) return PHASE_HINTS[GAME_PHASES.CAPITAL_PLACEMENT] || '';
  if (phase === GAME_PHASES.UNIT_PLACEMENT) return PHASE_HINTS[GAME_PHASES.UNIT_PLACEMENT] || '';
  if (phase === GAME_PHASES.PLAYING) return PHASE_HINTS[turnPhase] || '';
  return '';
}

// Phone peek only. Desktop still reads PHASE_HINTS via resolvePhaseHint
// (purchase / mobilize / tech stay empty there).
export function resolvePhonePeekHint(phase, turnPhase, selectedUnitType, opts = {}) {
  const land = opts.territoryName || '';
  const dest = opts.destName || '';
  if (phase === GAME_PHASES.TERRITORY_DRAFT) return 'Tap an open territory, then Pick';
  if (phase === GAME_PHASES.CAPITAL_PLACEMENT) return 'Tap your land, then Confirm';
  if (phase === GAME_PHASES.UNIT_PLACEMENT
    || (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.MOBILIZE)) {
    if (land && selectedUnitType) return `To ${land}`;
    if (land) return `Tap a unit · ${land}`;
    if (selectedUnitType) return 'Tap land, then unit';
    return 'Tap land, then unit';
  }
  if (phase === GAME_PHASES.PLAYING
    && (turnPhase === TURN_PHASES.COMBAT_MOVE || turnPhase === TURN_PHASES.NON_COMBAT_MOVE)) {
    const mix = opts.selectedSummary || '';
    const combat = turnPhase === TURN_PHASES.COMBAT_MOVE;
    if (land && dest && mix) return `${land} → ${dest} · ${mix}`;
    if (land && dest) return `Tap each unit to move · ${dest}`;
    if (land && mix) return `Tap a highlighted land · ${mix}`;
    if (land) return 'Tap each unit, then a highlighted land';
    return combat
      ? 'Tap your stack, then each unit to move'
      : 'Tap your stack, then each unit to fortify';
  }
  const base = resolvePhaseHint(phase, turnPhase);
  if (base) return base;
  if (phase === GAME_PHASES.PLAYING) {
    if (turnPhase === TURN_PHASES.PURCHASE) {
      return selectedUnitType
        ? `Tap Max or End Phase · ${formatUnitName(selectedUnitType)}`
        : 'Tap a unit to buy';
    }
    if (turnPhase === TURN_PHASES.DEVELOP_TECH) {
      const n = Number(opts.techDiceCount) || 0;
      if (n > 0) return n === 1 ? 'Research 1 die' : `Research ${n} dice`;
      return 'Tap + or Max, then Confirm';
    }
  }
  return '';
}

export function formatPhoneMoveSelectionSummary(selected, { formatName = formatUnitName } = {}) {
  const parts = [];
  for (const [key, qty] of Object.entries(selected || {})) {
    const n = Number(qty) || 0;
    if (n <= 0) continue;
    let type = key;
    if (key.startsWith('ship:')) type = 'ship';
    else if (key.startsWith('cargo:')) type = key.split(':')[2] || 'cargo';
    else if (key.startsWith('aircraft:')) type = key.split(':').pop();
    const name = String(formatName(type) || type).toLowerCase();
    parts.push(`${n} ${name}`);
  }
  return parts.join(' · ');
}

export function resolvePhoneTechCta({ diceCount } = {}) {
  const n = Number(diceCount) || 0;
  if (n <= 0) return null;
  return {
    action: 'roll-tech',
    // Match Experimental Confirm: Roll N tech dice vocabulary (.19).
    label: n === 1 ? 'Confirm: Roll 1 tech die' : `Confirm: Roll ${n} tech dice`,
    disabled: false,
    primary: true,
  };
}

export function resolvePhoneMoveCta({ destName, isAttack = false, selectedSummary = '' } = {}) {
  if (!destName) return null;
  const ready = !!selectedSummary;
  return {
    action: 'confirm-move',
    // Experimental: ready attack is "Confirm Attack"; move is "Confirm: Move to X".
    label: isAttack ? 'Confirm Attack' : `Confirm: Move to ${destName}`,
    disabled: !ready,
    selectUnits: !ready,
    primary: true,
    isAttack: !!isAttack,
    undoable: ready && !isAttack,
  };
}

// Place Capital Confirm is the verb. Do not also show a hint line.
export function shouldShowPhoneSetupPeekHint({ phase, turnPhase, hasPrimaryCta } = {}) {
  if (phase === GAME_PHASES.CAPITAL_PLACEMENT && hasPrimaryCta) return false;
  // Pair peek: hint until unit+land stages Confirm. Then the thumb is the verb.
  if (phase === GAME_PHASES.UNIT_PLACEMENT) return !hasPrimaryCta;
  if (phase === GAME_PHASES.PLAYING
    && (turnPhase === TURN_PHASES.MOBILIZE
      || turnPhase === TURN_PHASES.COMBAT_MOVE
      || turnPhase === TURN_PHASES.NON_COMBAT_MOVE)) {
    return !hasPrimaryCta;
  }
  return true;
}

// Deploy at 0 units is a ghost "Select units" — not a live blue no-op.
export function shouldShowSelectUnitsCta({
  mobile = false,
  phase = null,
  totalQueued = 0,
  showDone = false,
} = {}) {
  void mobile;
  void phase;
  void totalQueued;
  void showDone;
  // Peek verb is Deploy. Do not mount a grey "Select units" no-op.
  return false;
}

// Keep the type only while it remains. Exhausted / unset must not
// sticky-pick infantry (leftover bomber taps must not become a mixed stack).
export function resolvePhoneStickyUnitType(selectedUnitType, unitsToPlace, unitDefs = null) {
  const remaining = knownUnitsToPlace(unitsToPlace, unitDefs);
  if (selectedUnitType && remaining.some(u => u.type === selectedUnitType)) {
    return selectedUnitType;
  }
  return null;
}

export function shouldAutoCommitPhoneCapital({ mobile, phase, tappedIsOwnedLand } = {}) {
  void mobile;
  void phase;
  void tappedIsOwnedLand;
  // Own-land tap selects. Confirm is the only verb that places a capital
  // (a tap must never pass the seat).
  return false;
}

// Named Place Capital Confirm is legal ONLY on the current placer's
// owned land. Enemy / unowned / sea never mint the green CTA.
export function phonePairAllowWater({ phase, turnPhase } = {}) {
  if (phase === GAME_PHASES.UNIT_PLACEMENT) return true;
  return turnPhase === TURN_PHASES.MOBILIZE
    || turnPhase === TURN_PHASES.COMBAT_MOVE
    || turnPhase === TURN_PHASES.NON_COMBAT_MOVE;
}

export function resolvePhoneDeployLandName({ stagedLandName, selectedTerritory, allowWater = false } = {}) {
  if (stagedLandName) return stagedLandName;
  if (selectedTerritory && (allowWater || !selectedTerritory.isWater)) return selectedTerritory.name;
  return '';
}

// A unit-chip tap must never discard a named land. Clearing selection
// also leaves the staged name so a ghost click / null set is not a wipe.
export function shouldKeepPhonePairLand({ incomingTerritory, stagedLandName } = {}) {
  if (!stagedLandName) return false;
  if (!incomingTerritory) return true;
  return incomingTerritory.name === stagedLandName;
}

export function resolvePhoneDeployCtaLabel({ count, unitType, landName } = {}) {
  const n = Number(count) || 0;
  if (n <= 0) return '';
  // Experimental Confirm: Deploy in X — land name is the thumb verb; count
  // stays on the peek tiles.
  if (landName) return `Confirm: Deploy in ${landName}`;
  return `Confirm: Deploy ${n}`;
}

export function resolvePhoneCapitalCta({
  phase,
  territory = null,
  landName = null,
  isOwnedLand = false,
  currentPlayerId = null,
} = {}) {
  if (phase !== GAME_PHASES.CAPITAL_PLACEMENT) return null;
  if (isOwnedLand !== true) return null;
  // Named Confirm mounts only from the owned peek name. An inspect
  // selection (China / Wake / Germany / Japan) must not win.
  const name = landName
    || ((territory && !territory.isWater) ? territory.name : null);
  if (!name) return null;
  if (isPhoneCapitalInspectOnlyLand(name, currentPlayerId)) return null;
  return {
    action: 'place-capital',
    label: `Confirm: Capital in ${name}`,
    disabled: false,
    primary: true,
    territory: name,
  };
}

/** placeCapital returns true. The MP guard must not count as a commit
 *  if it returns a truthy { success: false } object. */
export function isCapitalPlacementCommitted(result) {
  return result === true;
}

/** Confirm click resolves an owned land and commits. Owner mismatch
 *  returns null so the handler can clear the CTA instead of no-op. */
export function resolvePhoneCapitalCommitLand({
  dataTerritory = null,
  peekedLandName = null,
  selectedName = null,
  currentPlayerId = null,
  getOwner = null,
} = {}) {
  if (!currentPlayerId || typeof getOwner !== 'function') return null;
  const names = [dataTerritory, peekedLandName, selectedName]
    .filter((n) => typeof n === 'string' && n);
  const seen = new Set();
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    if (isPhoneCapitalInspectOnlyLand(name, currentPlayerId)) continue;
    if (getOwner(name) === currentPlayerId) return name;
  }
  return null;
}

export function shouldShowPhoneSetupUndo({
  mobile, phase, canUndoPlacement, canUndoCapital,
} = {}) {
  if (!mobile) return false;
  // Opening Place Capital is Undo-only until a legal owned peek.
  if (phase === GAME_PHASES.CAPITAL_PLACEMENT) return true;
  const resolved = resolveUndoAction({
    phase,
    canUndoPlacement,
    canUndoCapital,
  });
  return resolved.show && (resolved.action === 'undo-placement' || resolved.action === 'undo-capital');
}

export class PlayerPanel {
  constructor() {
    this.gameState = null;
    this.unitDefs = null;
    this.continents = null;
    this.territories = null;
    this.onAction = null;
    this.actionLog = null;
    this.selectedTerritory = null;
    this.selectedUnitType = null;
    this.activeTab = 'actions';
    this.trayExpanded = false;
    this.phoneDetentTab = 'actions';
    this._peekPhase = null;
    this._peekTurnPhase = null;
    this.cardsCollapsed = false;
    this.validCardSets = [];

    // Inline purchase state
    this.purchaseCart = {};
    this.purchaseCartCost = 0;

    // Inline tech state
    this.techDiceCount = 0;

    // Inline movement state
    this.moveSelectedUnits = {};  // { unitType: quantity }
    this.movePendingDest = null;

    // Multiplayer debug log
    this.syncLog = [];
    this.maxSyncLogEntries = 20;

    // Player presence data (green/yellow/red indicators)
    this.presenceData = {};

    // Inline air landing state
    this.airLandingData = null;  // { airUnitsToLand, combatTerritory, isRetreating }
    this.airLandingIndex = 0;
    this.airLandingSelections = {};
    this.onAirLandingComplete = null;

    // Optimistic waiting state for multiplayer (prevents brief interaction after End Phase)
    this.isWaitingForSync = false;

    // Create panel element
    this.el = document.getElementById('sidebar');
    this.el.innerHTML = '';
    this.el.className = 'player-panel hidden';

    // Create content wrapper
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'pp-content';
    this.el.appendChild(this.contentEl);

    this._renderRaf = 0;
    this._lastRenderedPlayerId = null;
    this._ignoreUndoUntil = 0;
    this._unitListScrollTop = 0;
    this._pointerLock = null;
    this._panelPointerAt = 0;
    this._lastQueueGestureAt = 0;
    this._lastQueueUnitType = null;
    this._queueLockType = null;
    this._queueGestureApplied = false;
    this._phoneSetupPeekAt = 0;
    this._phoneCapitalLandName = null;
    this._phoneDeployLandName = null;
    this._looksBrokenReason = null;
    this._heldChromeEl = null;
    this._phoneDeployCommittedAt = 0;
    this._phonePairFrozenAt = 0;
    this._phonePairMaxAt = 0;
    this._phoneMobilizeCommittedAt = 0;
    this.el.addEventListener('pointerdown', (e) => this._onPanelPointerDown(e), { capture: true, passive: true });
    this.contentEl.addEventListener('pointercancel', () => {
      this._pointerLock = capturePanelPointerLock({ action: 'ignore-cancel', disabled: true });
      this._queueLockType = null;
    });
    this.contentEl.addEventListener('pointerup', () => this._clearHeldChrome());
    this.contentEl.addEventListener('pointerleave', () => this._clearHeldChrome());
    this.contentEl.addEventListener('click', (e) => this._onPanelClick(e));
    this.contentEl.addEventListener('change', (e) => this._onPanelChange(e));
  }

  _readPointerLock(e) {
    const target = e?.target;
    const stack = (typeof document !== 'undefined' && typeof document.elementsFromPoint === 'function'
      && e && Number.isFinite(e.clientX) && Number.isFinite(e.clientY))
      ? document.elementsFromPoint(e.clientX, e.clientY)
      : [target];
    const fromStack = pickPanelHitFromStack(stack, { panelEl: this.el });
    if (fromStack?.kind && fromStack.kind !== 'none') return fromStack;

    const btn = target?.closest?.('[data-action]');
    if (btn && this.el.contains(btn) && isQueueGestureAction(btn.dataset.action)) {
      return capturePanelPointerLock({
        action: btn.dataset.action,
        disabled: !!btn.disabled,
        dataset: { ...btn.dataset },
      });
    }
    const tab = target?.closest?.('.pp-tab');
    if (tab && this.el.contains(tab)) {
      return capturePanelPointerLock({ tabId: tab.dataset.tab });
    }
    if (btn && this.el.contains(btn)) {
      return capturePanelPointerLock({
        action: btn.dataset.action,
        disabled: !!btn.disabled,
        dataset: { ...btn.dataset },
      });
    }
    return capturePanelPointerLock({});
  }

  _onPanelPointerDown(e) {
    if (shouldBeginNewQueueGesture({
      alreadyApplied: this._queueGestureApplied,
      elapsedMs: Date.now() - (this._lastQueueGestureAt || 0),
    })) {
      this._queueGestureApplied = false;
      // Leftover last-row lock is not this pointer. A new + / Max on
      // type B must not resolve back onto type A (Confirm leftover).
      this._queueLockType = null;
    }
    this._panelPointerAt = Date.now();
    this._markHeldChrome(e.target);
    this._pointerLock = this._readPointerLock(e);
    const unit = e.target?.closest?.('[data-unit]')?.dataset?.unit
      || this._pointerLock?.dataset?.unit
      || null;
    if (isQueueGestureAction(this._pointerLock?.action) && unit) {
      this._queueLockType = unit;
    }
    if (!isMobileShell() || !this.el.classList.contains('player-panel--peek')) return;

    // In-tile steppers own the gesture — never treat them as unit-select
    // (that would also stage via pair commit and leak map clicks).
    if (e.target?.closest?.('.phone-peek-step, .phone-peek-tile-steps')) {
      e.stopPropagation();
      return;
    }

    const unitBtn = e.target?.closest?.('[data-action="phone-select-unit"]');
    if (unitBtn && !unitBtn.disabled && !e.target?.closest?.('.phone-peek-step')) {
      this._selectPhonePairUnit(unitBtn.dataset.unit);
      return;
    }

    const maxBtn = e.target?.closest?.('[data-action="phone-pair-max"], [data-action="place-queue-max"]');
    if (maxBtn && !maxBtn.disabled) {
      this._applyPhonePairMax(maxBtn.dataset.unit);
      this._phonePairMaxAt = Date.now();
      return;
    }

    // Document-capture peek used to retarget the land under Deploy before
    // click. Commit on this pointer so a thumb Deploy is Deploy only.
    const deployBtn = e.target?.closest?.('[data-action="confirm-placement"]');
    if (deployBtn && !deployBtn.disabled) {
      if (this._commitStagedPlacement()) {
        this._phoneDeployCommittedAt = Date.now();
      }
      return;
    }

    const mobilizeBtn = e.target?.closest?.('[data-action="confirm-mobilize"]');
    if (mobilizeBtn && !mobilizeBtn.disabled) {
      if (this._commitStagedMobilize()) {
        this._phoneMobilizeCommittedAt = Date.now();
      }
    }
  }

  containsPoint(clientX, clientY) {
    if (!this.el || this.el.classList?.contains('hidden')) return false;
    const peek = this.el.classList.contains('player-panel--peek');
    const capitalPeek = peek && this.gameState?.phase === GAME_PHASES.CAPITAL_PLACEMENT;
    const chromeRects = peek
      ? [...this.el.querySelectorAll(capitalPeek
        ? '[data-action="place-capital"], [data-action="undo-capital"]'
        : [
          '[data-action="confirm-placement"]',
          '[data-action="confirm-mobilize"]',
          '[data-action="confirm-move"]',
          '[data-action="phone-select-unit"]',
          '[data-action="phone-pair-max"]',
          '[data-action="place-queue"]',
          '[data-action="place-queue-max"]',
          '[data-action="buy-unit"]',
          '[data-action="move-unit"]',
          '[data-action="tech-dice-delta"]',
          '[data-action="undo-placement"]',
          '[data-action="undo"]',
          '[data-action="finish-placement"]',
          '[data-action="next-phase"]',
          '.phone-peek-tile',
          '.phone-peek-step',
          '.phone-peek-pair-hint',
          '.pp-peek-cta-row',
          '.pp-seat-chip',
        ].join(', '))]
        .map((node) => node.getBoundingClientRect())
      : [];
    return pointHitsPlayerPanel({
      peek,
      clientX,
      clientY,
      panelRect: this.el.getBoundingClientRect?.(),
      chromeRects,
    });
  }

  _markHeldChrome(target) {
    this._clearHeldChrome();
    const btn = target?.closest?.('.pp-confirm-btn, .pp-peek-max, .pp-action-btn.primary, .pp-qty-btn.max-btn');
    if (!btn || btn.disabled || btn.classList.contains('disabled')) return;
    btn.classList.add('is-held');
    const queued = isQueuedConfirmAction(btn.dataset.action);
    const chrome = resolveConfirmChrome({
      held: true,
      queued,
      selectUnits: btn.classList.contains('pp-select-units'),
    });
    btn.dataset.chrome = chrome;
    btn.classList.remove('pp-chrome-ready', 'pp-chrome-queued', 'pp-chrome-unavailable');
    btn.classList.add(confirmChromeClass(chrome));
    this._heldChromeEl = btn;
  }

  _clearHeldChrome() {
    const btn = this._heldChromeEl;
    this._heldChromeEl = null;
    if (!btn) return;
    btn.classList.remove('is-held');
    const chrome = resolveConfirmChrome({
      disabled: !!btn.disabled || btn.classList.contains('disabled'),
      queued: isQueuedConfirmAction(btn.dataset.action),
      selectUnits: btn.classList.contains('pp-select-units'),
    });
    btn.dataset.chrome = chrome;
    btn.classList.remove('pp-chrome-held', 'pp-chrome-ready', 'pp-chrome-queued', 'pp-chrome-unavailable');
    btn.classList.add(confirmChromeClass(chrome));
  }

  shouldBlockMapSelect(now = Date.now(), point = null) {
    const pointInPanel = !!(point && this.containsPoint(point.x, point.y));
    return shouldBlockMapSelectAfterPanel({
      panelPointerAt: this._panelPointerAt || 0,
      now,
      pointInPanel,
    });
  }

  // Canvas received the mouseup but the point is the panel (B31).
  // Apply the locked Max / + so the gesture is not a no-op.
  // Never Done / Undo from an overlay commit (B33 / B34).
  // Do not apply again on the real click (B32 +2).
  commitLockedPanelGesture(e) {
    if (!shouldCommitOverlayGesture(this._pointerLock?.action)) return;
    if (!shouldApplyQueueGesture({ alreadyApplied: this._queueGestureApplied })) return;
    this._onPanelClick({
      target: this.el,
      preventDefault() {},
      stopPropagation() {},
    });
  }

  _scheduleRender() {
    if (this._renderRaf) return;
    this._renderRaf = requestAnimationFrame(() => {
      this._renderRaf = 0;
      this._render();
    });
  }

  flushRender() {
    if (this._renderRaf) {
      cancelAnimationFrame(this._renderRaf);
      this._renderRaf = 0;
    }
    this._render();
  }

  _onPanelClick(e) {
    e.preventDefault();
    e.stopPropagation();
    const clickTab = e.target.closest?.('.pp-tab');
    const clickBtn = e.target.closest?.('[data-action]');
    const lockAction = this._pointerLock?.action || null;
    const resolved = resolveLockedPanelClick({
      lock: this._pointerLock,
      clickTabId: clickTab && this.contentEl.contains(clickTab) ? clickTab.dataset.tab : null,
      clickAction: clickBtn && this.contentEl.contains(clickBtn) && !clickBtn.disabled
        ? clickBtn.dataset.action
        : null,
      clickDataset: clickBtn ? { ...clickBtn.dataset } : {},
      now: Date.now(),
      lastQueueGestureAt: this._lastQueueGestureAt || 0,
    });
    this._pointerLock = null;
    if (!resolved) return;
    if (resolved.kind === 'tab') {
      this.activeTab = resolved.tab;
      this._scheduleRender();
      return;
    }
    if (resolved.kind === 'action') {
      if (isQueueGestureAction(resolved.action)) {
        if (!shouldApplyQueueGesture({ alreadyApplied: this._queueGestureApplied })) return;
        this._queueGestureApplied = true;
        this._lastQueueGestureAt = Date.now();
      }
      this._dispatchAction({
        dataset: resolved.dataset || { action: resolved.action },
        lockAction,
      });
    }
  }

  _onPanelChange(e) {
    if (e.target.matches('.pp-dest-dropdown')) {
      this.movePendingDest = e.target.value || null;
      this._scheduleRender();
      return;
    }
    if (e.target.matches('.pp-air-landing-dropdown') && e.target.value && this.isAirLandingActive()) {
      const currentUnit = this.airLandingData.airUnitsToLand[this.airLandingIndex];
      if (currentUnit) {
        const unitKey = currentUnit.id || `${currentUnit.type}_${this.airLandingIndex}`;
        this.airLandingSelections[unitKey] = e.target.value;
        this.gameState?.recordAirLandingSelection?.({
          originTerritory: this.airLandingData.combatTerritory,
          id: unitKey,
          type: currentUnit.type,
          quantity: currentUnit.quantity || 1,
          destination: e.target.value,
        });
        if (this.airLandingIndex < this.airLandingData.airUnitsToLand.length - 1) {
          this.airLandingIndex++;
        }
        this._maybeApplyReadyAirLandings();
        this._scheduleRender();
      }
    }
  }

  setGameState(gameState) {
    this.gameState = gameState;
    gameState.subscribe(() => {
      this._unlockWaitingOnOwnSeat();
            this._scheduleRender();
    });
            this._scheduleRender();
  }

  // State apply (local AI / finishPlacement or remote load) is the moment
  // the loaded seat is truth. Drop the Done lock only then — setWaitingForSync
  // calls _render directly, so the optimistic lock still covers the next seat.
  _unlockWaitingOnOwnSeat() {
    if (!this.isWaitingForSync) return;
    const localUserId = this.localUserId || this.syncManager?.userId;
    this.isWaitingForSync = resolveWaitingForSyncAfterStateApply({
      isWaitingForSync: this.isWaitingForSync,
      localUserId,
      currentPlayerOderId: this.gameState?.currentPlayer?.oderId,
    });
  }

  setUnitDefs(unitDefs) {
    this.unitDefs = unitDefs;
  }

  setContinents(continents) {
    this.continents = continents;
  }

  setTerritories(territories) {
    this.territories = {};
    for (const t of territories) {
      this.territories[t.name] = t;
    }
  }

  setActionLog(actionLog) {
    this.actionLog = actionLog;
  }

  // Multiplayer state
  setMultiplayerState(syncManager, localUserId, gameCode = null) {
    this.syncManager = syncManager;
    this.localUserId = localUserId;
    if (gameCode) this.gameCode = gameCode;
  }

  // Set optimistic waiting state (called before nextPhase to lock UI immediately)
  setWaitingForSync(waiting) {
    this.isWaitingForSync = waiting;
            this._scheduleRender();
  }

  // Set presence data for online indicators
  setPresenceData(presenceData) {
    this.presenceData = presenceData || {};
            this._scheduleRender();
  }

  // Get presence state for a player (returns 'online', 'idle', or 'offline')
  _getPlayerPresence(oderId) {
    return resolvePresenceState({
      hasDoc: !!this.presenceData[oderId],
      lastSeen: this.presenceData[oderId]?.lastSeen,
      state: this.presenceData[oderId]?.state,
    });
  }

  setActionCallback(callback) {
    this.onAction = callback;
  }

  clearPendingPlacementOverlay() {
    this.placementQueue = {};
    this._lastQueueUnitType = null;
    this._queueLockType = null;
    // Undo releases a desktop/tablet pin. Phone keeps the tapped land;
    // the next land tap already re-targets.
    if (!isMobileShell()) this._phoneDeployLandName = null;
  }

  setSelectedTerritory(territory, { immediate = true } = {}) {
    // Reset movement state when territory changes. Do NOT clear the
    // placement queue — a spurious retarget (B16) was wiping staged units
    // so the next + looked like it vanished them (B15).
    // Do NOT zero DEPLOYED — selecting another tile after Deploy 1/6
    // must stay 1/6 (B28).
    const keepPlaced = this.gameState?.unitsPlacedThisRound;
    const sameNamedLand = !!(territory?.name && territory.name === this._phoneDeployLandName);
    if (territory && this.selectedTerritory?.name !== territory.name && !sameNamedLand) {
      this.moveSelectedUnits = {};
      this.movePendingDest = null;
      this.moveUnitTab = 'land';
    }
    if (territory) this.selectedTerritory = territory;
    if (this.gameState && keepPlaced != null) {
      this.gameState.unitsPlacedThisRound = keepPlaced;
    }
    // Phone pair grammar owns the name on the mobile shell. Everywhere
    // else, Deploy / Mobilize follow the territory just selected.
    if (!isMobileShell()) {
      this._phoneDeployLandName = territory?.name || null;
    }
    if (this._shouldStagePhonePairLand(territory)) {
      this._phoneDeployLandName = territory.name;
    }
    // Land tap names the eligible tile only. Deploy / mobilize icon taps
    // still commit. Combat / Fortify icon taps stage; Confirm moves.
    if (immediate) this.flushRender();
    else this._scheduleRender();
  }

  _shouldStagePhonePairLand(territory) {
    if (!territory?.name) return false;
    if (!shouldUsePhonePairGrammar({
      mobile: isMobileShell(),
      phase: this.gameState?.phase,
      turnPhase: this.gameState?.turnPhase,
    })) return false;
    if (this.gameState?.phase === GAME_PHASES.UNIT_PLACEMENT) return true;
    return true;
  }

  _selectPhonePairUnit(unitType) {
    this._phonePairFrozenAt = Date.now();
    this.selectedUnitType = unitType || null;
    const dest = this._phoneDeployDest();
    if (dest) this.selectedTerritory = dest;
    this._commitPhoneIconPair();
    this._scheduleRender();
  }

  _clearPhoneIconType() {
    this.selectedUnitType = null;
    this.placementQueue = {};
    this.moveSelectedUnits = {};
  }

  _commitPhoneIconPair({ dumpRemaining = false } = {}) {
    const phase = this.gameState?.phase;
    const turnPhase = this.gameState?.turnPhase;
    if (phase === GAME_PHASES.UNIT_PLACEMENT) {
      this._commitPhoneIconDeploy({ dumpRemaining });
      return;
    }
    if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.MOBILIZE) {
      this._commitPhoneIconMobilize({ dumpRemaining });
      return;
    }
    if (phase === GAME_PHASES.PLAYING
      && (turnPhase === TURN_PHASES.COMBAT_MOVE || turnPhase === TURN_PHASES.NON_COMBAT_MOVE)) {
      this._commitPhoneIconMove({ dumpRemaining });
    }
  }

  _phoneDeployRemainingOfType(unitType) {
    const unitsToPlace = this.gameState?.getUnitsToPlace?.(this.gameState.currentPlayer?.id) || [];
    return remainingEligibleOfType({
      available: quantityAvailableForType(unitsToPlace, unitType),
    });
  }

  _phoneIconRemaining(unitType, player, phase, turnPhase) {
    if (!unitType) return 0;
    if (phase === GAME_PHASES.UNIT_PLACEMENT) {
      return this._phoneDeployRemainingOfType(unitType);
    }
    if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.MOBILIZE) {
      return remainingEligibleOfType({
        available: quantityAvailableForType(this.gameState?.getPendingPurchases?.() || [], unitType),
      });
    }
    if (phase === GAME_PHASES.PLAYING
      && (turnPhase === TURN_PHASES.COMBAT_MOVE || turnPhase === TURN_PHASES.NON_COMBAT_MOVE)) {
      const unit = this._phoneMoveUnitMatch(unitType, this._phoneDeployDest(), player);
      const unitKey = unit
        ? (moveUnitKey(unit))
        : unitType;
      const staged = Number(this.moveSelectedUnits?.[unitKey]) || 0;
      return remainingUnstagedOfType({ available: unit?.quantity || 0, staged });
    }
    return 1;
  }

  _commitPhoneIconDeploy({ dumpRemaining = false } = {}) {
    const unitType = this.selectedUnitType;
    const dest = this._phoneDeployDest();
    const remaining = this._phoneDeployRemainingOfType(unitType);
    if (shouldClearPhoneIconAfterExhausted({ unitType, remainingOfType: remaining })) {
      this._clearPhoneIconType();
      return;
    }
    if (!shouldCommitPhoneIconTap({
      hasNamedDest: !!dest,
      unitType,
      remainingOfType: remaining,
    })) return;
    if (!this._phoneUnitFitsTerritory(unitType, dest)) return;
    if (!shouldAutoStagePhoneDeployPair({
      mobile: isMobileShell(),
      phase: this.gameState?.phase,
      unitType,
      territory: dest,
      canAdd: remaining > 0,
    })) return;
    const limit = this.gameState.getUnitsPerRoundLimit?.() || 6;
    const placedThisRound = this.gameState.unitsPlacedThisRound || 0;
    const count = phoneIconCommitCount({
      remainingOfType: remaining,
      dumpRemaining,
      slotsRemaining: limit - placedThisRound,
    });
    if (count <= 0 || !this.onAction) {
      if (count <= 0) this._clearPhoneIconType();
      return;
    }
    this._ignoreUndoUntil = Date.now() + 400;
    this.placementQueue = {};
    this.selectedTerritory = dest;
    this._phoneDeployLandName = dest.name;
    const unitTypes = Array.from({ length: count }, () => unitType);
    this.onAction('place-units-batch', {
      territory: dest.name,
      unitTypes,
    });
    this._resetPlaceQueueGestureAfterConfirm();
    const left = this._phoneDeployRemainingOfType(unitType);
    if (shouldClearPhoneIconAfterExhausted({ unitType, remainingOfType: left })) {
      this._clearPhoneIconType();
    }
  }

  _commitPhoneIconMobilize({ dumpRemaining = false } = {}) {
    if (!isMobileShell() || !this.selectedUnitType) return;
    const dest = this._phoneDeployDest();
    const player = this.gameState?.currentPlayer;
    const unitType = this.selectedUnitType;
    const pending = this.gameState.getPendingPurchases?.() || [];
    const remaining = remainingEligibleOfType({
      available: quantityAvailableForType(pending, unitType),
    });
    if (shouldClearPhoneIconAfterExhausted({ unitType, remainingOfType: remaining })) {
      this._clearPhoneIconType();
      return;
    }
    if (!shouldCommitPhoneIconTap({
      hasNamedDest: !!dest,
      unitType,
      remainingOfType: remaining,
    })) return;
    if (!dest || !this._isValidMobilizeLocation(dest, player)) return;
    if (!this._phoneMobilizeFitsDest(unitType, dest, player)) return;
    const count = phoneIconCommitCount({
      remainingOfType: remaining,
      dumpRemaining,
      slotsRemaining: this._mobilizeSlotsRemaining(dest, player),
    });
    if (count <= 0 || !this.onAction) {
      if (count <= 0) this._clearPhoneIconType();
      return;
    }
    this._ignoreUndoUntil = Date.now() + 400;
    this.placementQueue = {};
    this.selectedTerritory = dest;
    this._phoneDeployLandName = dest.name;
    for (let i = 0; i < count; i++) {
      this.onAction('mobilize-unit', {
        unitType,
        territory: dest.name,
        sourceFactory: this._mobilizeSourceFactory(dest, player),
      });
    }
    const left = remainingEligibleOfType({
      available: quantityAvailableForType(this.gameState.getPendingPurchases?.() || [], unitType),
    });
    if (shouldClearPhoneIconAfterExhausted({ unitType, remainingOfType: left })) {
      this._clearPhoneIconType();
    }
    this._resetPlaceQueueGestureAfterConfirm();
  }

  _phoneMoveDests(from, player, isCombatMove) {
    const saved = this.moveSelectedUnits;
    const hasQty = Object.values(saved || {}).some((q) => Number(q) > 0);
    if (!hasQty && this.selectedUnitType) {
      const unit = this._phoneMoveUnitMatch(this.selectedUnitType, from, player);
      if (unit) {
        const key = moveUnitKey(unit);
        this.moveSelectedUnits = { [key]: 1 };
      }
    }
    const dests = this._getValidDestinations(from, player, isCombatMove);
    this.moveSelectedUnits = saved;
    return dests;
  }

  _phoneMoveUnitMatch(unitType, from, player) {
    const movable = from ? this._getMovableUnits(from, player) : [];
    return movable.find((u) => {
      const key = moveUnitKey(u);
      return key === unitType || u.type === unitType;
    }) || null;
  }

  _commitPhoneIconMove({ dumpRemaining = false } = {}) {
    if (!isMobileShell() || !this.selectedUnitType) return;
    const from = this._phoneDeployDest();
    const player = this.gameState?.currentPlayer;
    const unit = this._phoneMoveUnitMatch(this.selectedUnitType, from, player);
    if (!from || !player || !unit) return;
    const unitKey = moveUnitKey(unit);
    const available = remainingEligibleOfType({ available: unit.quantity || 0 });
    const current = Number(this.moveSelectedUnits?.[unitKey]) || 0;
    const leftover = remainingUnstagedOfType({ available, staged: current });
    if (shouldClearPhoneIconAfterExhausted({
      unitType: this.selectedUnitType,
      remainingOfType: leftover,
    })) {
      this._clearPhoneIconType();
      return;
    }
    if (!shouldStagePhoneMoveIcon({
      hasSource: !!from,
      unitType: this.selectedUnitType,
      remainingOfType: leftover,
    })) return;
    const next = dumpRemaining
      ? available
      : nextStagedCount({ current, available });
    if (next <= current) {
      this._clearPhoneIconType();
      return;
    }
    this.moveSelectedUnits = { ...this.moveSelectedUnits, [unitKey]: next };
    this.selectedTerritory = from;
    this._phoneDeployLandName = from.name;
    this.selectedUnitType = unitKey;
  }

  _executePhoneIconMove(from, destName, unitKey, count, unit) {
    if (!this.onAction || !from || !destName || count <= 0) return;
    const units = [];
    const shipIds = [];
    const cargoUnloads = [];
    if (unitKey.startsWith('ship:')) {
      shipIds.push(unitKey.replace('ship:', ''));
    } else if (unitKey.startsWith('cargo:')) {
      const parts = unitKey.split(':');
      if (parts.length >= 3) {
        cargoUnloads.push({
          transportId: parts[1],
          unitType: parts[2],
          quantity: count,
        });
      }
    } else if (String(unitKey).startsWith('aircraft:')) {
      units.push({ type: airSelectionType(unitKey), quantity: count });
    } else {
      units.push({ type: unit.type || unitKey, quantity: count });
    }
    if (units.length === 0 && shipIds.length === 0 && cargoUnloads.length === 0) return;
    const fromTerritory = this.territories?.[from.name];
    const toTerritory = this.territories?.[destName];
    const isAmphibiousUnload = fromTerritory?.isWater && !toTerritory?.isWater
      && (shipIds.length > 0 || cargoUnloads.length > 0);
    this._ignoreUndoUntil = Date.now() + 400;
    this.onAction('execute-move', {
      from: from.name,
      to: destName,
      units,
      shipIds,
      cargoUnloads,
      isAmphibiousUnload,
      keepPhonePair: true,
    });
  }

  _phoneDeployDest() {
    // Desktop and tablet: the selected territory wins, even if a previous
    // Deploy left _phoneDeployLandName on the first land of the turn.
    if (!isMobileShell()) {
      const selectedName = this.selectedTerritory?.name;
      return (selectedName && this.territories?.[selectedName]) || this.selectedTerritory || null;
    }
    const landName = this._phoneDeployLandName || this.selectedTerritory?.name;
    return (landName && this.territories?.[landName]) || this.selectedTerritory || null;
  }

  _phoneMobilizeFitsDest(unitType, dest, player) {
    if (!dest || !unitType || !this._isValidMobilizeLocation(dest, player)) return false;
    const def = this.unitDefs?.[unitType];
    if (!def) return false;
    if (dest.isWater) {
      if (def.isSea) return true;
      if (def.isAir) {
        return canPlaceAirOnCarrierInSeaZone(
          this.gameState,
          dest.name,
          unitType,
          player.id,
          this.unitDefs,
          { requireFactoryAdjacent: true },
        );
      }
      return false;
    }
    const factories = this._getFactoryTerritories(player.id);
    const isFactory = factories.includes(dest.name);
    if (def.isBuilding) return !isFactory;
    return isFactory && !!(def.isLand || def.isAir);
  }

  _seaMobilizeFactories(dest, player) {
    if (!dest?.isWater || !player) return [];
    return factoriesAdjacentToSeaZone(this.gameState, dest.name, player.id);
  }

  _mobilizeSourceFactory(dest, player) {
    if (!dest?.isWater) return null;
    const factories = this._seaMobilizeFactories(dest, player);
    if (factories.length === 1) return factories[0];
    if (this.mobilizeSourceFactory && factories.includes(this.mobilizeSourceFactory)) {
      return this.mobilizeSourceFactory;
    }
    return null;
  }

  _mobilizeNeedsFactoryPick(dest, player) {
    return !!dest?.isWater
      && this._seaMobilizeFactories(dest, player).length > 1
      && !this._mobilizeSourceFactory(dest, player);
  }

  _mobilizeSlotsRemaining(dest, player) {
    if (!dest || !player) return 0;
    const capital = this.gameState?.playerState?.[player.id]?.capitalTerritory;
    let factoryName = dest.name;
    if (dest.isWater) {
      factoryName = this._mobilizeSourceFactory(dest, player);
      if (!factoryName) return 0;
    }
    const productionLimit = factoryProductionLimit(factoryName, capital);
    const placedHere = factoryProductionUsed(
      this.gameState?.mobilizationHistory,
      factoryName,
      player.id,
    );
    return Math.max(0, productionLimit - placedHere);
  }

  _applyPhonePairMax(unitTypeHint = null) {
    const phase = this.gameState?.phase;
    const turnPhase = this.gameState?.turnPhase;
    const dest = this._phoneDeployDest();
    const player = this.gameState?.currentPlayer;

    if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.DEVELOP_TECH) {
      const ipcs = this.gameState.getIPCs(player?.id);
      this.techDiceCount = Math.max(0, Math.floor(Number(ipcs) / 5) || 0);
      this._scheduleRender();
      return true;
    }

    const unitType = unitTypeHint || this.selectedUnitType;
    if (!unitType) return false;

    if (phase === GAME_PHASES.UNIT_PLACEMENT
      || (phase === GAME_PHASES.PLAYING && (
        turnPhase === TURN_PHASES.MOBILIZE
        || turnPhase === TURN_PHASES.COMBAT_MOVE
        || turnPhase === TURN_PHASES.NON_COMBAT_MOVE
      ))) {
      this.selectedUnitType = unitType;
      if (dest) {
        this.selectedTerritory = dest;
        this._phoneDeployLandName = dest.name;
      }
      this._commitPhoneIconPair({ dumpRemaining: true });
      this._scheduleRender();
      return true;
    }

    if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.PURCHASE) {
      this.selectedUnitType = unitType;
      if (this.onAction) this.onAction('buy-max', { unitType });
      this._scheduleRender();
      return true;
    }

    return false;
  }

  _resetPlaceQueueGestureAfterConfirm() {
    const cleared = resetPlaceQueueGestureState();
    this._lastQueueUnitType = cleared.lastQueueUnitType;
    this._queueLockType = cleared.queueLockType;
    this._queueGestureApplied = cleared.queueGestureApplied;
    this._lastQueueGestureAt = cleared.lastQueueGestureAt;
    this._pointerLock = null;
  }

  _commitStagedMobilize() {
    if (!this.onAction) return false;
    const dest = this._phoneDeployDest();
    if (!dest) return false;
    const queue = { ...this.placementQueue };
    const unitTypes = seaFirstUnitTypes(expandPlaceQueue(queue), this.unitDefs);
    if (unitTypes.length === 0) return false;
    this._ignoreUndoUntil = Date.now() + 400;
    const player = this.gameState?.currentPlayer;
    for (const unitType of unitTypes) {
      this.onAction('mobilize-unit', {
        unitType,
        territory: dest.name,
        sourceFactory: this._mobilizeSourceFactory(dest, player),
      });
    }
    this.placementQueue = {};
    this.selectedTerritory = dest;
    this._phoneDeployLandName = dest.name;
    this._resetPlaceQueueGestureAfterConfirm();
    this._scheduleRender();
    return true;
  }

  _commitStagedPlacement() {
    if (!this.onAction || !this.placementQueue) return false;
    const keepTerritory = this._phoneDeployDest();
    if (!keepTerritory) return false;
    const queue = { ...this.placementQueue };
    const unitTypes = expandPlaceQueue(queue);
    if (unitTypes.length === 0) return false;
    this._ignoreUndoUntil = Date.now() + 400;
    const placedBefore = this.gameState?.unitsPlacedThisRound || 0;
    const finish = (result) => {
      const placed = result?.placed
        ?? Math.max(0, (this.gameState?.unitsPlacedThisRound || 0) - placedBefore);
      this.placementQueue = queueAfterDeployAttempt({ queueBefore: queue, placed });
      this.selectedTerritory = keepTerritory;
      this._phoneDeployLandName = keepTerritory.name;
      // Queue empty after a real place — leftover type lock must not
      // pin the next Confirm (same land or type B). Failed Deploy keeps
      // the queue (B24) and therefore the current-gesture lock.
      if (queuedCount(this.placementQueue) === 0) {
        this._resetPlaceQueueGestureAfterConfirm();
      }
      this._scheduleRender();
    };
    const ret = this.onAction('place-units-batch', {
      territory: keepTerritory.name,
      unitTypes,
    });
    if (ret && typeof ret.then === 'function') ret.then(finish);
    else finish(ret);
    return true;
  }

  _phoneUnitFitsTerritory(unitType, territory) {
    const def = this.unitDefs?.[unitType];
    if (!def || !territory) return false;
    if (territory.isWater) return !!(def.isSea || def.isAir);
    return !!(def.isLand || def.isAir || def.isBuilding);
  }

  renderMenuTabHTML(tab) {
    if (!this.gameState?.currentPlayer) return '<div class="phone-menu-empty">No game loaded</div>';
    const player = this.gameState.currentPlayer;
    if (tab === 'stats') return this._renderStatsTab(player);
    if (tab === 'territory') return this._renderTerritoryTab(player);
    if (tab === 'log') return this._renderLogTab();
    if (tab === 'dice') return renderDiceStatsMarkup({ placement: 'sheet' });
    return '';
  }

  // Air landing methods
  setAirLanding(airUnitsToLand, combatTerritory, isRetreating, onComplete) {
    this.airLandingData = { airUnitsToLand, combatTerritory, isRetreating };
    this.airLandingIndex = 0;
    this.airLandingSelections = {};
    this.onAirLandingComplete = onComplete;
    this.activeTab = 'actions'; // Switch to actions tab
    if (this.gameState?.addPendingAirLandings && combatTerritory) {
      this.gameState.addPendingAirLandings(combatTerritory, airUnitsToLand || []);
    }
            this._scheduleRender();
  }

  clearAirLanding() {
    this.airLandingData = null;
    this.airLandingIndex = 0;
    this.airLandingSelections = {};
    this.onAirLandingComplete = null;
            this._scheduleRender();
  }

  // After a failed push reloads authoritative state, drop optimistic waiting
  // and put the Actions tab in front so mobilize/combat placement is visible
  // (the grey End-phase bar alone is not enough to unstick the player).
  revealActionsAfterResync() {
    this.isWaitingForSync = false;
    this.activeTab = 'actions';
    if (this.gameState?.applyPendingAirLandings) {
      this.gameState.applyPendingAirLandings({ unitDefs: this.unitDefs || {} });
    }
    this.clearAirLanding();
  }

  // One path for phase / seat change: wipe peek names, inspect dest,
  // and an illegal Confirm so leftover tray verbs cannot stick.
  flushPeekForPhaseOrSeat({
    phase = null,
    turnPhase = null,
    seatId = null,
    capitalPeekStillLegal = false,
  } = {}) {
    const should = shouldFlushPeekOnPhaseOrSeatChange({
      prevPhase: this._peekPhase,
      nextPhase: phase,
      prevTurnPhase: this._peekTurnPhase,
      nextTurnPhase: turnPhase,
      prevSeatId: this._lastRenderedPlayerId,
      nextSeatId: seatId,
    });
    if (!should) return null;
    const flushed = flushPeekState({
      hadCapitalPeekName: !!this._phoneCapitalLandName,
      capitalPeekStillLegal,
      hadDeployPeekName: !!this._phoneDeployLandName,
      hadSelectedTerritory: !!this.selectedTerritory,
    });
    this.selectedTerritory = flushed.selectedTerritory;
    this._phoneCapitalLandName = flushed.phoneCapitalLandName;
    this._phoneDeployLandName = flushed.phoneDeployLandName;
    this._looksBrokenReason = flushed.looksBrokenReason;
    this.trayExpanded = false;
    this.phoneDetentTab = 'actions';
    return flushed;
  }

  isAirLandingActive() {
    return this.airLandingData && this.airLandingData.airUnitsToLand?.length > 0;
  }

  _mergedAirLandingSelections() {
    if (!this.isAirLandingActive()) return { ...(this.airLandingSelections || {}) };
    const origin = this.airLandingData.combatTerritory;
    const pending = this.gameState?.getPendingAirLandings?.()
      ?.find((entry) => entry.originTerritory === origin);
    return mergeLandingSelections(this.airLandingSelections || {}, pending?.units || []);
  }

  _airLandingsRemaining() {
    if (!this.isAirLandingActive()) return 0;
    return remainingAirLandingsToAssign(
      this.airLandingData.airUnitsToLand,
      this._mergedAirLandingSelections()
    );
  }

  _maybeApplyReadyAirLandings() {
    if (!this.isAirLandingActive()) return;
    if (this._airLandingsRemaining() !== 0) return;
    // Mid-combat apply can be overwritten by _finalizeCombat. NCM leftover
    // overlay must move named aircraft as soon as remaining hits 0.
    if (this.gameState?.turnPhase === TURN_PHASES.NON_COMBAT_MOVE) {
      this.gameState.applyPendingAirLandings?.({ unitDefs: this.unitDefs || {} });
    }
  }

  commitAirLandingsIfReady() {
    if (!this.isAirLandingActive()) return false;
    if (this._airLandingsRemaining() > 0) return false;
    return this._commitNamedAirLandings();
  }

  _commitNamedAirLandings() {
    if (!this.isAirLandingActive()) return false;
    const landings = {};
    const crashes = [];
    const merged = this._mergedAirLandingSelections();
    this.airLandingData.airUnitsToLand.forEach((unit, idx) => {
      const unitKey = unit.id || `${unit.type}_${idx}`;
      const dest = resolveLandingDestination(unit, idx, merged);
      if (dest) {
        landings[unitKey] = dest;
        if (unit.id && unit.id !== unitKey) landings[unit.id] = dest;
      } else if (!unit.landingOptions || unit.landingOptions.length === 0) {
        crashes.push({ id: unit.id, type: unit.type, quantity: unit.quantity });
      }
    });
    const payload = {
      landings,
      crashes,
      isRetreating: this.airLandingData.isRetreating,
      airUnitsToLand: this.airLandingData.airUnitsToLand,
      combatTerritory: this.airLandingData.combatTerritory,
    };
    if (this.onAirLandingComplete) {
      this.onAirLandingComplete(payload);
    } else if (this.gameState?.applyAirLandings) {
      this.gameState.applyAirLandings(this.airLandingData.combatTerritory, {
        landings,
        airUnitsToLand: this.airLandingData.airUnitsToLand,
        unitDefs: this.unitDefs || {},
      });
    }
    this.clearAirLanding();
    return true;
  }

  getAirLandingDestinations() {
    if (!this.isAirLandingActive()) return [];
    const allDests = new Set();
    for (const unit of this.airLandingData.airUnitsToLand) {
      for (const opt of unit.landingOptions || []) {
        allDests.add(opt.territory);
      }
    }
    return Array.from(allDests);
  }

  handleAirLandingTerritoryClick(territory) {
    if (!this.isAirLandingActive()) return false;

    const currentUnit = this.airLandingData.airUnitsToLand[this.airLandingIndex];
    if (!currentUnit) return false;

    const validDest = currentUnit.landingOptions?.find(opt => opt.territory === territory.name);
    if (validDest) {
      const unitKey = currentUnit.id || `${currentUnit.type}_${this.airLandingIndex}`;
      this.airLandingSelections[unitKey] = territory.name;
      this.gameState?.recordAirLandingSelection?.({
        originTerritory: this.airLandingData.combatTerritory,
        id: unitKey,
        type: currentUnit.type,
        quantity: currentUnit.quantity || 1,
        destination: territory.name,
      });

      // Move to next unit if available
      if (this.airLandingIndex < this.airLandingData.airUnitsToLand.length - 1) {
        this.airLandingIndex++;
      }

      this._maybeApplyReadyAirLandings();
            this._scheduleRender();
      return true;
    }
    return false;
  }

  show() {
    this.el.classList.remove('hidden');
    this._render();
  }

  hide() {
    this.el.classList.add('hidden');
  }

  _publishMoveGesture() {
    const gs = this.gameState;
    if (!gs) return;
    if (!this._gestureRestored && gs.uiGesture?.fork === 'classic'
      && gs.uiGesture.turnPhase === gs.turnPhase
      && gs.uiGesture.playerId === gs.currentPlayer?.id) {
      this._gestureRestored = true;
      const saved = gs.uiGesture.selectedUnits || {};
      if (!Object.values(this.moveSelectedUnits || {}).some((qty) => Number(qty) > 0)) {
        this.moveSelectedUnits = { ...saved };
        this.movePendingDest = gs.uiGesture.dest || null;
        const from = gs.uiGesture.from;
        if (from && this.territories?.[from]) this.selectedTerritory = this.territories[from];
      }
    }
    const selectedUnits = {};
    for (const [key, qty] of Object.entries(this.moveSelectedUnits || {})) {
      if (Number(qty) > 0) selectedUnits[key] = Number(qty);
    }
    const landing = this.isAirLandingActive?.() ? {
      origin: this.airLandingData?.combatTerritory || null,
      index: this.airLandingIndex || 0,
      selections: { ...(this.airLandingSelections || {}) },
    } : null;
    const active = Object.keys(selectedUnits).length > 0 || !!landing || !!this.movePendingDest;
    gs.uiGestureActive = active;
    const gesture = active ? {
      active: true,
      fork: 'classic',
      from: this.selectedTerritory?.name || null,
      selectedUnits,
      dest: this.movePendingDest || null,
      landing,
      turnPhase: gs.turnPhase,
      playerId: gs.currentPlayer?.id || null,
    } : null;
    const prev = JSON.stringify(gs.uiGesture || null);
    const next = JSON.stringify(gesture);
    if (prev === next) return;
    gs.uiGesture = gesture;
    if (!gs._suppressPersist && typeof gs.autoSave === 'function') gs.autoSave();
  }

  _render() {
    try {
      this._renderUnsafe();
    } catch (err) {
      console.error('[PlayerPanel] render failed', err);
      if (this.contentEl) {
        this.contentEl.innerHTML = '<div class="pp-loading">Loading match…</div>';
      }
    }
  }

  _renderUnsafe() {
    if (!this.gameState) {
      this.el.classList.remove('player-panel--peek', 'player-panel--expanded', 'player-panel--place-tray');
      this.contentEl.innerHTML = '<div class="pp-loading">Loading match…</div>';
      return;
    }
    this._publishMoveGesture();

    const player = this.gameState.currentPlayer;
    if (!player) {
      this.el.classList.remove('player-panel--peek', 'player-panel--expanded', 'player-panel--place-tray');
      this.contentEl.innerHTML = '<div class="pp-loading">Loading match…</div>';
      return;
    }
    const phase = this.gameState.phase;
    const turnPhase = this.gameState.turnPhase;
    const flushedPeek = this.flushPeekForPhaseOrSeat({
      phase,
      turnPhase,
      seatId: player.id,
      capitalPeekStillLegal: false,
    });
    if (this._lastRenderedPlayerId && this._lastRenderedPlayerId !== player.id) {
      this.placementQueue = {};
    }
    this._lastRenderedPlayerId = player.id;
    this._peekPhase = phase;
    this._peekTurnPhase = turnPhase;
    if (flushedPeek) {
      this.selectedTerritory = null;
    }
    if (isMobileShell() && phase === GAME_PHASES.UNIT_PLACEMENT) {
      const remaining = knownUnitsToPlace(
        this.gameState.getUnitsToPlace?.(player.id) || [],
        this.unitDefs,
      );
      if (this.selectedUnitType && !remaining.some(u => u.type === this.selectedUnitType)) {
        this.selectedUnitType = null;
      }
    }

    // Check if it's the local player's turn in multiplayer
    const isMultiplayer = this.gameState.isMultiplayer;
    const localUserId = this.localUserId || this.syncManager?.userId;
    const currentPlayerOderId = player?.oderId;

    // It's our turn only if the LOADED STATE says the current player is us —
    // the same live check the multiplayer guard enforces. (The cached
    // isActivePlayer flag can lag or diverge from state; trusting it here let
    // the sidebar disagree with what actions were actually allowed.)
    const chrome = resolveTurnChrome({
      isMultiplayer,
      localUserId,
      currentPlayerOderId,
      currentPlayerName: player?.name,
    });
    const isOwnSeat = chrome.ownSeat;
    // Actions still honor the Done lock. Title / badge never do.
    const isLocalPlayerTurn = computeIsLocalPlayerTurn({
      isMultiplayer,
      isWaitingForSync: this.isWaitingForSync,
      localUserId,
      currentPlayerOderId
    });
    if (typeof document !== 'undefined' && isMultiplayer) {
      document.title = chrome.tabTitle;
    }

    let html = '';

    // Phone: same Actions / placement / tab HTML, different regions.
    // Default is a peek detent (hint + icon row + one CTA). Expand
    // reveals one detent of Players / Territory / Log / the full list.
    // Desktop keeps the full sheet + tabs.
    const mobile = isMobileShell();
    const airLanding = this.isAirLandingActive();
    const movePending = !!this.movePendingDest;
    const peek = shouldPeekPhoneTray({
      mobile,
      expanded: this.trayExpanded,
      airLanding,
      movePending,
      phase,
    });
    const phoneTray = shouldUsePhonePlacementTray({ mobile, phase });
    this.el.classList.toggle('player-panel--peek', peek);
    this.el.classList.toggle('player-panel--expanded', mobile && !peek);
    this.el.classList.toggle('player-panel--place-tray', phoneTray && !peek);

    if (mobile) {
      html += peek ? '' : this._renderSeatChip(chrome);
      html += this._renderHostReconnectHint();
      html += this._renderPhoneDetentTabs();
      html += `<div class="phone-tray-body">`;
      if (this.phoneDetentTab === 'stats') {
        html += this._renderStatsTab(player);
      } else if (this.phoneDetentTab === 'territory') {
        html += this._renderTerritoryTab(player);
      } else if (this.phoneDetentTab === 'log') {
        html += this._renderLogTab();
      } else if (phoneTray && !peek) {
        html += this._renderInlinePlacement(player);
      } else if (shouldShowPhonePanelBody({ mobile, phase, turnPhase, airLanding, movePending })) {
        html += `<div class="pp-tab-content">`;
        html += this._renderActionsTab(phase, turnPhase, player);
        html += `</div>`;
      }
      html += `</div>`;
    } else {
      // Player header (compact, always visible)
      html += this._renderHeader(player, isMultiplayer, isLocalPlayerTurn, isOwnSeat);

      // Phase indicator
      html += this._renderPhaseIndicator(phase, turnPhase);

      // Note: Waiting state is now shown inline in Actions tab, not as overlay
      // This allows Players, Territory, Log tabs to remain fully functional while waiting

      if (shouldShowPhoneChromeTabs({ mobile: false })) {
        html += this._renderTabs();
      }

      // Tab content
      html += `<div class="pp-tab-content">`;
      html += this._renderTabContent(phase, turnPhase, player);
      html += `</div>`;
    }

    // Fixed bottom actions bar — hidden for spectators / waiting clients
    const bottomActions = this._renderBottomActions(phase, turnPhase, player, isLocalPlayerTurn, isOwnSeat);
    if (bottomActions) {
      html += bottomActions;
    }

    const list = this.contentEl.querySelector('.pp-unit-list');
    if (list) this._unitListScrollTop = list.scrollTop;

    this.contentEl.innerHTML = html;
    this._bindEvents();

    const restored = this.contentEl.querySelector('.pp-unit-list');
    if (restored) restored.scrollTop = this._unitListScrollTop || 0;
  }

  _renderBottomActions(phase, turnPhase, player, isLocalPlayerTurn = true, isOwnSeat = isLocalPlayerTurn) {
    // Don't show for AI, or for a multiplayer client that is not the active player.
    // The Actions tab already hides on this predicate; the bottom bar used to
    // ignore it and drew the current player's green End-phase button for everyone.
    // Placement Done follows the loaded seat so a stuck waiting lock cannot
    // hide the only way out of leftover ships (James lock).
    const showBar = phase === GAME_PHASES.UNIT_PLACEMENT ? isOwnSeat : isLocalPlayerTurn;
    if (!shouldShowBottomTurnActions({
      isMultiplayer: !!this.gameState?.isMultiplayer,
      isLocalPlayerTurn: showBar,
      isAI: player.isAI
    })) {
      return '';
    }

    let buttons = [];
    let warningHtml = '';

    // Air landing confirm — stays up while dests are unnamed. At 0 remaining
    // End Phase / Done is the commit+advance path (Robert 19 Sep NCM stuck).
    const airLandingsRemaining = this._airLandingsRemaining();
    const airLandingReady = this.isAirLandingActive() && airLandingsRemaining === 0;
    if (this.isAirLandingActive() && !airLandingReady) {
      buttons.push({
        action: 'confirm-air-landing',
        label: 'Confirm: All Landings',
        disabled: true,
        primary: true
      });
    } else if (airLandingReady) {
      // Named dests are done — End Phase / Done below commits them.
    }
    // Movement confirm — desktop always. Phone Combat / Fortify use the
    // same named Confirm (Move to X / Attack X). Deploy still icon-commits.
    else if (this.movePendingDest && (this.activeTab === 'actions' || isMobileShell())
      && !shouldHidePhonePairConfirm({
        mobile: isMobileShell(),
        pairGrammar: shouldUsePhonePairGrammar({
          mobile: isMobileShell(),
          phase,
          turnPhase,
        }),
        phase,
        turnPhase,
      })) {
      const destOwner = this.gameState.getOwner(this.movePendingDest);
      const destWater = !!this.territories?.[this.movePendingDest]?.isWater;
      const seaAttack = destWater && seaZoneHasEnemyForAirAttack(
        this.gameState, this.movePendingDest, player.id,
      );
      const isAttack = seaAttack || (
        destOwner && destOwner !== player.id && !this.gameState.areAllies(player.id, destOwner)
      );
      const selectedSummary = formatPhoneMoveSelectionSummary(this.moveSelectedUnits);
      const named = resolvePhoneMoveCta({
        destName: this.movePendingDest,
        isAttack,
        selectedSummary,
      });
      if (named) buttons.push(named);
    }
    // Capital placement — 22d4b13 tray. Own-land tap peeks; Confirm is
    // the only commit. Mount from selected land or the peeked name.
    else if (phase === GAME_PHASES.TERRITORY_DRAFT && isMobileShell()) {
      const name = this.selectedTerritory && !this.selectedTerritory.isWater
        ? this.selectedTerritory.name
        : '';
      const open = !!(name && !this.gameState.getOwner?.(name));
      warningHtml = `<div class="pp-bottom-warning draft-turn-banner">${possessivePhrase(player.name, 'pick')}</div>`;
      if (open) {
        buttons.push({
          action: 'pick-territory',
          label: 'Pick',
          disabled: false,
          primary: true,
        });
      }
    }
    else if (phase === GAME_PHASES.CAPITAL_PLACEMENT) {
      const peekName = this._phoneCapitalLandName;
      const isOwnedLand = !!(peekName && this.gameState.getOwner?.(peekName) === player.id);
      const capitalCta = resolvePhoneCapitalCta({
        phase,
        landName: peekName,
        isOwnedLand,
        currentPlayerId: player.id,
      });
      if (capitalCta) buttons.push(capitalCta);
    }
    // Initial unit placement — Deploy stays on the peek CTA (not clipped
    // in the tray body). Done only after the queue is empty.
    else if (phase === GAME_PHASES.UNIT_PLACEMENT) {
      const { ux, totalQueued, isValidPlacement } = this._getInitialPlacementUX(player);
      const hidePairConfirm = shouldHidePhonePairConfirm({
        mobile: isMobileShell(),
        pairGrammar: shouldUsePhonePairGrammar({
          mobile: isMobileShell(),
          phase,
          turnPhase,
        }),
        phase,
        turnPhase,
      });

      if (totalQueued > 0 && isValidPlacement && !hidePairConfirm) {
        const dest = this._phoneDeployDest();
        const unitType = Object.entries(this.placementQueue || {}).find(([, n]) => Number(n) > 0)?.[0];
        buttons.push({
          action: 'confirm-placement',
          label: resolvePhoneDeployCtaLabel({
            count: totalQueued,
            unitType,
            landName: dest?.name || this._phoneDeployLandName,
          }),
          disabled: false,
          primary: true
        });
      } else if (ux.showDone && !shouldUsePhonePlacementTray({ mobile: isMobileShell(), phase })) {
        buttons.push({
          action: 'finish-placement',
          label: ux.canSkipNaval ? 'Done — skip leftover ships →' : 'Done - Next Player →',
          disabled: false,
          primary: true
        });
        if (ux.needSeaHint && ux.hint) {
          warningHtml = `<div class="pp-bottom-warning">${ux.hint}</div>`;
        }
      } else if (ux.needSeaHint && ux.hint) {
        warningHtml = `<div class="pp-bottom-warning">${ux.hint}</div>`;
      }
    } else if (phase === GAME_PHASES.PLAYING && shouldShowTechResearch(phase, turnPhase)
      && this._techAcquisition() !== 'buy'
      && (this.techDiceCount > 0 || this._carriedTechTokens(player) > 0)) {
      const carried = this._carriedTechTokens(player);
      const techCta = resolvePhoneTechCta({
        diceCount: this.techDiceCount > 0 ? this.techDiceCount : carried,
      });
      if (techCta && this.techDiceCount <= 0 && carried > 0) {
        techCta.label = `Roll ${carried} carried`;
      }
      if (techCta) buttons.push(techCta);
    } else if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.MOBILIZE
      && isMobileShell()
      && !shouldHidePhonePairConfirm({
        mobile: true,
        pairGrammar: shouldUsePhonePairGrammar({
          mobile: true, phase, turnPhase,
        }),
        phase,
        turnPhase,
      })) {
      const dest = this._phoneDeployDest();
      const unitType = this.selectedUnitType
        || Object.entries(this.placementQueue || {}).find(([, n]) => Number(n) > 0)?.[0];
      const totalQueued = queuedCount(this.placementQueue || {});
      if (totalQueued > 0 && dest && this._isValidMobilizeLocation(dest, player)) {
        buttons.push({
          action: 'confirm-mobilize',
          label: resolvePhoneDeployCtaLabel({
            count: totalQueued,
            unitType,
            landName: dest.name,
          }),
          disabled: false,
          primary: true,
        });
      }
    }

    // End Phase stays up unless Combat / Fortify already named a dest
    // (ghost Select-units or ready Move to X owns the thumb).
    const phonePairHidesMoveConfirm = shouldHidePhonePairConfirm({
      mobile: isMobileShell(),
      pairGrammar: shouldUsePhonePairGrammar({
        mobile: isMobileShell(), phase, turnPhase,
      }),
      phase,
      turnPhase,
    });
    const offerEndPhase = shouldOfferEndPhaseDuringMove({
      airLandingActive: this.isAirLandingActive(),
      airLandingsRemaining,
      movePendingDest: this.movePendingDest,
      selectedMoveCount: selectedMoveCount(this.moveSelectedUnits),
      hideMoveConfirm: phonePairHidesMoveConfirm,
    });
    if (phase === GAME_PHASES.PLAYING && offerEndPhase) {
      const hasUnresolvedCombats = shouldDisableEndPhaseForCombat({
        hasCombatQueue: turnPhase === TURN_PHASES.COMBAT
          && !!(this.gameState.combatQueue && this.gameState.combatQueue.length > 0),
        airLandingReady,
      });

      const pendingPurchases = this.gameState.getPendingPurchases?.() || [];
      const unplacedUnits = pendingPurchases.reduce((sum, p) => sum + p.quantity, 0);
      const hasUnplacedUnits = turnPhase === TURN_PHASES.MOBILIZE && unplacedUnits > 0;

      if (hasUnresolvedCombats) {
        warningHtml = `<div class="pp-bottom-warning">⚠️ Resolve all battles before advancing</div>`;
      } else if (hasUnplacedUnits) {
        const unitWord = unplacedUnits > 1 ? 'units' : 'unit';
        warningHtml = `<div class="pp-bottom-warning">⚠️ Place all ${unplacedUnits} purchased ${unitWord} first — click a factory (or adjacent sea zone) on the map, then use + / All in the Actions tab</div>`;
      }

      buttons.push({
        action: 'next-phase',
        label: airLandingReady
          ? 'Done →'
          : `End Phase · ${TURN_PHASE_NAMES[turnPhase] || 'Phase'}`,
        disabled: hasUnresolvedCombats || hasUnplacedUnits,
        primary: true
      });
    }

    // Phone: one enabled primary CTA. End Turn and Done never coexist;
    // illegal/disabled actions stay hidden (not greyed over another green).
    // Peek stack: phase hint (own row) + unit/action chips + thumb-zone CTA.
    const mobile = isMobileShell();
    let peekHint = '';
    let peekRow = '';
    if (mobile) {
      const pendingGhost = buttons.find(b => b.selectUnits
        || (b.action === 'confirm-placement' && b.disabled));
      buttons = pickMobilePrimaryButtons(buttons.filter(b => !b.selectUnits
        && !(b.action === 'confirm-placement' && b.disabled)));
      if (pendingGhost && buttons.length === 0) buttons = [pendingGhost];
      const warningText = warningHtml ? warningHtml.replace(/<[^>]+>/g, '').trim() : '';
      const trayOwnsHint = shouldUsePhonePlacementTray({ mobile: true, phase })
        && !buttons.some(b => b && !b.disabled);
      peekHint = shouldShowPhoneSetupPeekHint({
        phase,
        turnPhase,
        hasPrimaryCta: buttons.some(b => b && !b.disabled),
      })
        ? (trayOwnsHint
          ? resolvePhonePeekHint(phase, turnPhase, this.selectedUnitType, {
            territoryName: resolvePhoneDeployLandName({
              stagedLandName: this._phoneDeployLandName,
              selectedTerritory: this.selectedTerritory,
              allowWater: phonePairAllowWater({ phase, turnPhase }),
            }),
            destName: this.movePendingDest || '',
            techDiceCount: this.techDiceCount,
            selectedSummary: formatPhoneMoveSelectionSummary(this.moveSelectedUnits),
          })
          : (warningText || resolvePhonePeekHint(phase, turnPhase, this.selectedUnitType, {
            territoryName: resolvePhoneDeployLandName({
              stagedLandName: this._phoneDeployLandName,
              selectedTerritory: this.selectedTerritory,
              allowWater: phonePairAllowWater({ phase, turnPhase }),
            }),
            destName: this.movePendingDest || '',
            techDiceCount: this.techDiceCount,
            selectedSummary: formatPhoneMoveSelectionSummary(this.moveSelectedUnits),
          }) || ''))
        : '';
      warningHtml = '';
      peekRow = this._renderPhonePeekRow(player, phase, turnPhase);
    }

    const airLandingCount = Object.keys(this.airLandingSelections || {}).length;
    const undoBar = resolveMovementUndoBar({
      phase,
      turnPhase,
      moveHistory: this.gameState?.moveHistory,
      undoLockMoveCount: this.gameState?.undoLockMoveCount || 0,
      airLandingCount,
    });
    const showUndoBar = undoBar.show && Date.now() >= (this._ignoreUndoUntil || 0);

    // No buttons to show (a warning-only bar is still useful — e.g. naval hint).
    // A movement / air-landing Undo (n) is enough to keep the bar.
    if (buttons.length === 0 && !warningHtml && !peekHint && !this._looksBrokenReason && !mobile && !showUndoBar) return '';

    let html = `<div class="pp-bottom-actions${mobile ? ' pp-tray-peek' : ''}">`;
    if (shouldShowPhonePlaceMeta({ mobile, phase, peek: mobile && this.el.classList.contains('player-panel--peek') })) {
      const placeUX = this._getInitialPlacementUX(player);
      const budget = placementBudgetCopy({
        deployedThisRound: placeUX.placedThisRound,
        limit: placeUX.limit,
        poolRemaining: placeUX.landAirRemaining + (placeUX.navalRemaining || 0),
      });
      html += `<div class="phone-place-meta">${budget.deployedLabel}: ${budget.deployedText}</div>`;
    }
    if (peekHint) {
      html += `<span class="pp-tray-hint">${peekHint}</span>`;
    }
    html += looksBrokenBarHtml(this._looksBrokenReason);
    html += peekRow;
    html += warningHtml;
    if (mobile) html += `<div class="pp-peek-cta-row">`;
    if (mobile && shouldShowPhoneTrayToggle({ mobile: true, phase })) {
      const expanded = !!this.trayExpanded;
      html += `<button type="button" class="phone-tray-toggle" data-action="phone-toggle-tray" aria-expanded="${expanded ? 'true' : 'false'}" aria-label="${expanded ? 'Show map' : 'Show list'}">${expanded ? '▾' : '▴'}</button>`;
    }
    html += `<div class="pp-bottom-buttons">`;

    if (mobile) {
      const canUndoPlacement = queuedCount(this.placementQueue || {}) > 0
        || !!(this.gameState.placementHistory || []).some(p => p.owner === player.id);
      const canUndoCapital = !!this.gameState.canUndoLastCapital?.();
      const pendingPurchases = this.gameState.getPendingPurchases?.() || [];
      const undo = resolveUndoAction({
        phase,
        turnPhase,
        canUndoPlacement,
        canUndoCapital,
        canUndoMove: canUndoLastMove({
          turnPhase,
          moveHistoryLength: (this.gameState.moveHistory || []).length,
          undoLockMoveCount: this.gameState.undoLockMoveCount || 0,
        }),
        canUndoPurchase: pendingPurchases.some(p => p.quantity > 0),
        canUndoMobilize: (this.gameState.mobilizationHistory || []).length > 0,
        canUndoAirLanding: Object.keys(this.airLandingSelections || {}).length > 0,
      });
      const showCapitalUndoGhost = phase === GAME_PHASES.CAPITAL_PLACEMENT;
      const showUndo = (undo.show && Date.now() >= (this._ignoreUndoUntil || 0))
        || showCapitalUndoGhost;
      html += `<div class="pp-peek-undo-slot">`;
      if (showUndo) {
        const barUndo = showUndoBar
          && (undo.action === 'undo-move' || undo.action === 'undo-air-landing');
        const undoLabel = barUndo ? formatUndoBarLabel(undoBar.count) : 'Undo';
        const barAttr = barUndo ? ' data-undo-bar="1"' : '';
        html += `
        <button class="pp-confirm-btn pp-undo-ghost${barUndo ? ' pp-undo-bar' : ''}" data-action="${undo.action || 'undo-capital'}"${barAttr}>
          ${undoLabel}
        </button>`;
      }
      html += `</div>`;
      html += `<div class="pp-peek-primary-slot">`;
      const pairLand = resolvePhoneDeployLandName({
        stagedLandName: this._phoneDeployLandName,
        selectedTerritory: this.selectedTerritory,
        allowWater: phonePairAllowWater({ phase, turnPhase }),
      });
      if (shouldShowPhonePeekMax({
        mobile: true,
        phase,
        turnPhase,
        hasNamedLand: !!pairLand,
        hasNamedDest: !!this.movePendingDest || phase === GAME_PHASES.UNIT_PLACEMENT
          || turnPhase === TURN_PHASES.MOBILIZE,
        hasUnitType: !!this.selectedUnitType,
        remainingOfType: this._phoneIconRemaining(this.selectedUnitType, player, phase, turnPhase),
      })) {
        html += `
        <button type="button" class="pp-peek-max" data-action="phone-pair-max" data-unit="${this.selectedUnitType}" data-chrome="ready">
          Max
        </button>`;
      }
    }

    if (!mobile && showUndoBar) {
      html += `
        <button type="button" class="pp-confirm-btn pp-undo-bar" data-action="${undoBar.action}" data-undo-bar="1">
          ${formatUndoBarLabel(undoBar.count)}
        </button>`;
    }

    for (const btn of buttons) {
      const disabledClass = btn.disabled ? 'disabled' : '';
      const attackClass = btn.isAttack ? 'attack' : '';
      const undoableClass = btn.undoable ? 'undoable' : '';
      const selectUnitsClass = btn.selectUnits ? 'pp-select-units' : '';
      const dataAttrs = btn.territory ? `data-territory="${btn.territory}"` : '';
      const chrome = resolveConfirmChrome({
        disabled: !!btn.disabled,
        queued: !btn.disabled && isQueuedConfirmAction(btn.action),
        selectUnits: !!btn.selectUnits,
      });

      html += `
        <button class="pp-confirm-btn ${disabledClass} ${attackClass} ${undoableClass} ${selectUnitsClass} ${confirmChromeClass(chrome)}"
                data-action="${btn.action}" data-chrome="${chrome}" ${dataAttrs} ${btn.disabled ? 'disabled' : ''}>
          ${btn.label}
        </button>`;
    }

    if (mobile) html += `</div>`;
    html += `</div>`;
    if (mobile) html += `</div>`;
    html += `</div>`;
    return html;
  }

  _renderSeatChip(chrome) {
    if (!chrome?.badge) return '';
    const cls = chrome.ownSeat ? 'your-turn' : 'waiting';
    return `<div class="pp-seat-chip ${cls}" data-seat="${cls}">${chrome.seatLabel}</div>`;
  }

  _renderHeader(player, isMultiplayer = false, isLocalPlayerTurn = true, isOwnSeat = isLocalPlayerTurn) {
    const ipcs = this.gameState.getIPCs(player.id);
    const territories = this.gameState.getPlayerTerritories(player.id).length;
    const aiLabel = player.isAI ? `<span class="pp-ai-badge">${player.aiDifficulty?.toUpperCase() || 'AI'}</span>` : '';
    const textColor = this._getContrastColor(player.color);

    // Identity bar + WAITING badge follow the loaded seat, not the optimistic
    // waiting lock. Own-seat + WAITING / "You: …" is the V2.72 stuck state.
    let identityBar = '';
    if (isMultiplayer && !isOwnSeat && this.localUserId) {
      // Find local player info
      const localPlayer = this.gameState.players?.find(p => p.oderId === this.localUserId);
      if (localPlayer) {
        const localTextColor = this._getContrastColor(localPlayer.color);
        identityBar = `
          <div class="pp-identity-bar" style="background: ${localPlayer.color};">
            ${localPlayer.flag ? `<img src="assets/flags/${localPlayer.flag}" class="pp-flag-small" alt="${localPlayer.name}">` : ''}
            <span style="color: ${localTextColor};">You: <strong>${localPlayer.name}</strong></span>
          </div>`;
      }
    }

    // Multiplayer turn indicator
    let turnIndicator = '';
    let headerLabel = player.name;
    if (isMultiplayer) {
      if (isOwnSeat) {
        turnIndicator = `<span class="pp-turn-badge your-turn" style="color: ${textColor};">YOUR TURN</span>`;
      } else {
        // Show "Current Turn:" label to make it clear this isn't the local player
        headerLabel = possessivePhrase(player.name, 'Turn');
        turnIndicator = `<span class="pp-turn-badge waiting">WAITING</span>`;
      }
    }

    return `
      ${identityBar}
      <div class="pp-header compact ${!isOwnSeat ? 'not-your-turn' : ''}" style="background: ${player.color};">
        ${player.flag ? `<img src="assets/flags/${player.flag}" class="pp-flag" alt="${player.name}">` : ''}
        <span class="pp-player-name" style="color: ${textColor};">${headerLabel}</span>
        ${aiLabel}
        ${turnIndicator}
        <span class="pp-resources-inline" style="color: ${textColor};">${ipcs}$ · ${territories}T</span>
      </div>`;
  }

  _renderHostReconnectHint() {
    const hostPlayer = this.gameState?.players?.find(p => p.isHost)
      || this.gameState?.players?.find(p => p.oderId && !p.isAI);
    if (!hostPlayer || hostPlayer.oderId === this.localUserId) return '';
    const copy = resolveHostReconnectCopy({
      hostPresence: this._getPlayerPresence(hostPlayer.oderId),
      hostName: hostPlayer.name,
      gameCode: this.gameCode,
    });
    if (!copy) return '';
    return `<div class="pp-host-reconnect" data-host-reconnect="1">${copy}</div>`;
  }

  _renderWaitingIndicator(player) {
    // Get local player name for clarity
    const localPlayer = this.gameState.players?.find(p => p.oderId === this.localUserId);
    const localName = localPlayer?.name || 'your';

    return `
      <div class="pp-waiting-overlay">
        <div class="pp-waiting-content">
          <div class="pp-waiting-spinner"></div>
          <p>Waiting for <strong>${player.name}</strong> to finish their turn...</p>
          <p class="pp-waiting-hint">You are playing as <strong>${localName}</strong>. You can view the map while waiting.</p>
          ${this._renderHostReconnectHint()}
        </div>
      </div>`;
  }

  _renderPhaseIndicator(phase, turnPhase) {
    const phaseName = this._getPhaseName(phase, turnPhase);
    const phaseHint = this._getPhaseHint(phase, turnPhase);

    return `
      <div class="pp-phase compact">
        <span class="pp-phase-name">${phaseName}</span>
        ${phaseHint ? `<span class="pp-phase-hint">${phaseHint}</span>` : ''}
      </div>`;
  }

  _renderTabs() {
    const isMultiplayer = this.gameState?.isMultiplayer;
    const visibleTabs = TABS.filter(tab => !tab.multiplayerOnly || isMultiplayer);

    return `
      <div class="pp-tabs">
        ${visibleTabs.map(tab => `
          <button class="pp-tab ${this.activeTab === tab.id ? 'active' : ''}"
                  data-tab="${tab.id}" title="${tab.label}">
            <span class="pp-tab-icon">${tab.icon}</span>
            <span class="pp-tab-label">${tab.label}</span>
          </button>
        `).join('')}
      </div>`;
  }

  _renderTabContent(phase, turnPhase, player) {
    switch (this.activeTab) {
      case 'actions':
        return this._renderActionsTab(phase, turnPhase, player);
      case 'stats':
        return this._renderStatsTab(player);
      case 'territory':
        return this._renderTerritoryTab(player);
      case 'log':
        return this._renderLogTab();
      case 'debug':
        return this._renderDebugTab();
      default:
        return '';
    }
  }

  _renderActionsTab(phase, turnPhase, player) {
    let html = '<div class="pp-actions-tab">';

    // Spectator overlay is seat-based, not waiting-lock-based. A stuck
    // isWaitingForSync on your own seat used to paint "You are playing" /
    // "view the map while waiting" and block place-units (V2.72 playtest).
    const isMultiplayer = this.gameState.isMultiplayer && this.localUserId;
    if (isMultiplayer && shouldShowSpectatorWaiting({
      isMultiplayer,
      localUserId: this.localUserId,
      currentPlayerOderId: player?.oderId,
    })) {
      const flagSrc = player?.flag ? `assets/flags/${player.flag}` : null;
      html += `
        <div class="pp-waiting-turn">
          <div class="pp-waiting-spinner-inline"></div>
          <div class="pp-waiting-header">
            ${flagSrc ? `<img src="${flagSrc}" class="pp-waiting-flag" alt="${player.name}">` : ''}
            <span style="color: ${player.color}">${player.name}</span> is playing
          </div>
          <div class="pp-waiting-phase">${this._getPhaseDisplayName(phase, turnPhase)}</div>
          <div class="pp-waiting-hint">You can view the map while waiting</div>
          ${this._renderHostReconnectHint()}
        </div>`;
      html += '</div>';
      return html;
    }

    // AI status
    if (player.isAI) {
      html += `<div class="pp-ai-thinking"><span class="pp-ai-spinner"></span> AI is thinking...</div>`;
      html += '</div>';
      return html;
    }

    // Air landing takes priority when active
    if (this.isAirLandingActive()) {
      html += this._renderInlineAirLanding(player);
      html += '</div>';
      return html;
    }

    // Phase-specific actions
    html += this._renderPhaseActions(phase, turnPhase, player);

    // End Phase button is now in the fixed bottom actions bar

    html += '</div>';
    return html;
  }

  _getPhaseDisplayName(phase, turnPhase) {
    if (phase === GAME_PHASES.CAPITAL_PLACEMENT) return 'Placing Capital';
    if (phase === GAME_PHASES.UNIT_PLACEMENT) return 'Initial Deployment';
    if (phase === GAME_PHASES.PLAYING) {
      const phaseNames = {
        [TURN_PHASES.DEVELOP_TECH]: 'Researching Technology',
        [TURN_PHASES.PURCHASE]: 'Purchasing Units',
        [TURN_PHASES.COMBAT_MOVE]: 'Combat Move',
        [TURN_PHASES.COMBAT]: 'Resolving Combat',
        [TURN_PHASES.NON_COMBAT_MOVE]: 'Non-Combat Move (Fortify)',
        [TURN_PHASES.MOBILIZE]: 'Mobilizing Units',
        [TURN_PHASES.COLLECT_INCOME]: 'Collecting Income'
      };
      return phaseNames[turnPhase] || 'Playing';
    }
    return 'Playing';
  }

  _renderPhaseActions(phase, turnPhase, player) {
    let html = '';

    // Capital placement - hint only, button is in bottom actions bar.
    // Phone peek already owns this line — do not repeat it in the body.
    if (phase === GAME_PHASES.CAPITAL_PLACEMENT) {
      if (!isMobileShell() && (!this.selectedTerritory || this.selectedTerritory.isWater)) {
        html += `<div class="pp-hint">${phonePointerHint('Click one of your territories to place your capital', { mobile: isMobileShell() })}</div>`;
      }
    }

    // Unit placement
    if (phase === GAME_PHASES.UNIT_PLACEMENT) {
      html += this._renderInlinePlacement(player);
    }

    // Playing phase actions
    if (phase === GAME_PHASES.PLAYING) {
      // Tech phase - inline research (PLAYING only; leftover setup turnPhase is inert)
      if (shouldShowTechResearch(phase, turnPhase)) {
        html += this._renderInlineTech(player);
      }

      // Purchase phase - inline unit purchasing (PLAYING only)
      if (shouldShowPurchase(phase, turnPhase)) {
        html += this._renderInlinePurchase(player);
      }

      if (turnPhase === TURN_PHASES.COMBAT_MOVE || turnPhase === TURN_PHASES.NON_COMBAT_MOVE) {
        // Check if we have a territory selected with movable units
        const hasMovableTerritory = this.selectedTerritory && this._hasMovableUnits(this.selectedTerritory, player);

        if (hasMovableTerritory) {
          html += this._renderInlineMovement(player, turnPhase);
        } else {
          html += `<div class="pp-hint">${turnPhase === TURN_PHASES.COMBAT_MOVE
            ? 'Combat Move: click your stack, click each unit, then a highlighted land, then Confirm. Dice are the next phase.'
            : 'Fortify: click your stack, click each unit, then a highlighted friendly land, then Confirm. No attacks this step.'}</div>`;
        }

        // Show rockets option during combat move phase (if player has tech)
        if (turnPhase === TURN_PHASES.COMBAT_MOVE) {
          html += this._renderRocketsUI(player);
        }

        // Combat / non-combat moves are addressable. Each unlocked row undoes
        // only that move. Undo all clears the unlocked suffix.
        this.gameState._ensureMoveIds?.();
        const moveRows = listAddressableMoveRows(this.gameState.moveHistory, {
          turnPhase,
          undoLockMoveCount: this.gameState.undoLockMoveCount || 0,
        }).map((row) => ({ ...row, desc: formatRecentMove(row.move) })).filter((row) => row.desc);
        const undoableCount = moveRows.filter((row) => row.canUndo).length;
        if (moveRows.length > 0) {
          html += `
            <div class="pp-move-history">
              <div class="pp-move-header">
                <span>Combat moves</span>
                ${undoableCount > 0 ? `<button class="pp-undo-btn pp-undo-all" data-action="undo-all-moves">Undo all</button>` : ''}
              </div>`;
          for (const row of moveRows) {
            html += `
              <div class="pp-move-item ${row.canUndo ? 'last' : ''}">
                <span class="pp-move-desc">${row.desc}</span>
                ${row.canUndo ? `<button class="pp-undo-btn" data-action="undo-move" data-move-id="${row.id}">Undo</button>` : ''}
              </div>`;
          }
          html += `</div>`;
        }
      }

      if (turnPhase === TURN_PHASES.COMBAT) {
        const combatCount = this.gameState.combatQueue?.length || 0;
        if (combatCount > 0) {
          html += `
            <button class="pp-action-btn combat" data-action="open-combat">
              ⚔️ Resolve ${combatCount} Battle${combatCount > 1 ? 's' : ''}
            </button>`;
        } else {
          html += `<div class="pp-hint">No battles to resolve</div>`;
        }
      }

      if (turnPhase === TURN_PHASES.MOBILIZE) {
        html += this._renderInlineMobilize(player);
      }

      if (turnPhase === TURN_PHASES.COLLECT_INCOME) {
        html += `<div class="pp-hint">Income will be collected automatically</div>`;
      }
    }

    return html;
  }

  _renderStatsTab(currentPlayer) {
    let html = '<div class="pp-stats-tab">';

    // All players comparison table
    html += `<div class="pp-all-players">`;

    // Gather stats for all players
    const playerStats = this.gameState.players.map(p => {
      const territories = this.gameState.getPlayerTerritories(p.id);
      const income = this._calculateIncome(p.id);
      const units = this._countUnits(p.id);
      const totalUnits = Object.values(units).reduce((a, b) => a + b, 0);
      const techs = this.gameState.playerTechs?.[p.id]?.unlockedTechs || [];
      const ipcs = this.gameState.getIPCs(p.id);
      // Capital is stored in playerState, not a separate capitals object
      const capital = this.gameState.playerState?.[p.id]?.capitalTerritory;
      const capitalOwner = capital ? this.gameState.getOwner(capital) : null;
      const hasCapital = capitalOwner === p.id;
      const riskCards = this.gameState.riskCards?.[p.id] || [];

      return {
        player: p,
        territories: territories.length,
        income,
        totalUnits,
        units,
        techs: techs.length,
        ipcs,
        hasCapital,
        isCurrentTurn: p.id === currentPlayer.id,
        cardCount: riskCards.length,
        cards: riskCards // Full card list for current player display
      };
    });

    // Sort by territories (most to least)
    playerStats.sort((a, b) => b.territories - a.territories);

    // Player cards
    const isMultiplayer = this.gameState.isMultiplayer;

    for (const stats of playerStats) {
      const p = stats.player;
      const flagSrc = p.flag ? `assets/flags/${p.flag}` : null;
      const isActive = stats.isCurrentTurn;
      const isEliminated = !stats.hasCapital && stats.territories === 0;
      const isMe = isMultiplayer && p.oderId === this.localUserId;

      // Presence indicator for multiplayer (not for AI)
      let presenceHtml = '';
      if (isMultiplayer && !p.isAI) {
        const presence = this._getPlayerPresence(p.oderId);
        const presenceClass = presence === 'online' ? 'presence-online' :
                              presence === 'idle' ? 'presence-idle' : 'presence-offline';
        const presenceTitle = presence === 'online' ? 'Online (active)' :
                              presence === 'idle' ? 'Online (idle)' : 'Offline';
        presenceHtml = `<span class="pp-presence-dot ${presenceClass}" title="${presenceTitle}"></span>`;
      }

      html += `
        <div class="pp-player-card ${isActive ? 'active' : ''} ${isEliminated ? 'eliminated' : ''} ${isMe ? 'is-me' : ''}"
             style="--player-color: ${p.color}">
          <div class="pp-player-header">
            ${presenceHtml}
            ${flagSrc ? `<img src="${flagSrc}" class="pp-player-flag" alt="${p.name}">` : ''}
            <span class="pp-player-name" style="color: ${p.color}">${p.name}${isMe ? ' (You)' : ''}</span>
            ${isActive ? '<span class="pp-turn-indicator">◀ Turn</span>' : ''}
            ${!stats.hasCapital ? '<span class="pp-capital-lost">⚠ Capital Lost</span>' : ''}
          </div>
          <div class="pp-player-stats">
            <div class="pp-pstat">
              <span class="pp-pstat-value">${stats.ipcs}</span>
              <span class="pp-pstat-label">IPCs</span>
            </div>
            <div class="pp-pstat">
              <span class="pp-pstat-value">${stats.income}</span>
              <span class="pp-pstat-label">Income</span>
            </div>
            <div class="pp-pstat">
              <span class="pp-pstat-value">${stats.territories}</span>
              <span class="pp-pstat-label">Terr.</span>
            </div>
            <div class="pp-pstat">
              <span class="pp-pstat-value">${stats.totalUnits}</span>
              <span class="pp-pstat-label">Units</span>
            </div>
            <div class="pp-pstat">
              <span class="pp-pstat-value">${stats.cardCount}</span>
              <span class="pp-pstat-label">Cards</span>
            </div>
          </div>
        </div>`;
    }

    html += `</div>`;

    // In multiplayer, find the LOCAL player's stats (not the current turn player)
    // In single player, show current turn player's stats
    const hasLocalUser = isMultiplayer && this.localUserId;
    let localPlayerStats = null;

    if (hasLocalUser) {
      // Find player whose oderId matches the local user
      localPlayerStats = playerStats.find(s => s.player.oderId === this.localUserId);
    } else {
      // Single player mode - show current turn player
      localPlayerStats = playerStats.find(s => s.player.id === currentPlayer.id);
    }

    if (localPlayerStats) {
      const localPlayer = localPlayerStats.player;

      html += `
        <div class="pp-stat-section pp-current-detail">
          <div class="pp-stat-header">Your Forces${isMultiplayer ? ` (${localPlayer.name})` : ''}</div>
          <div class="pp-unit-breakdown">`;

      const unitCategories = {
        'Land': ['infantry', 'artillery', 'tank', 'aaGun'],
        'Naval': ['transport', 'submarine', 'destroyer', 'cruiser', 'battleship', 'carrier'],
        'Air': ['fighter', 'bomber']
      };

      for (const [category, types] of Object.entries(unitCategories)) {
        const categoryUnits = types.filter(t => localPlayerStats.units[t] > 0);
        if (categoryUnits.length > 0) {
          html += `<div class="pp-unit-category">
            <span class="pp-unit-cat-label">${category}:</span>
            ${categoryUnits.map(t => `<span class="pp-unit-count">${localPlayerStats.units[t]} ${t}</span>`).join(', ')}
          </div>`;
        }
      }

      html += `</div></div>`;

      // Risk Cards for LOCAL player only
      if (localPlayerStats.cards.length > 0) {
        const cardCounts = { infantry: 0, cavalry: 0, artillery: 0, wild: 0 };
        for (const card of localPlayerStats.cards) {
          cardCounts[card] = (cardCounts[card] || 0) + 1;
        }

        html += `
          <div class="pp-stat-section">
            <div class="pp-stat-header">🃏 Your Risk Cards (${localPlayerStats.cards.length})</div>
            <div class="pp-card-list">`;

        const cardTypes = ['infantry', 'cavalry', 'artillery', 'wild'];
        const cardIcons = { infantry: '🚶', cavalry: '🐎', artillery: '💣', wild: '⭐' };
        for (const type of cardTypes) {
          if (cardCounts[type] > 0) {
            html += `<span class="pp-card-item">${cardIcons[type]} ${cardCounts[type]}× ${type}</span>`;
          }
        }
        html += `</div></div>`;
      }

      // Technologies for LOCAL player only
      const techs = this.gameState.playerTechs?.[localPlayer.id]?.unlockedTechs || [];
      if (techs.length > 0) {
        html += `
          <div class="pp-stat-section">
            <div class="pp-stat-header">🔬 Your Technologies</div>
            <div class="pp-tech-list">`;
        for (const techId of techs) {
          const tech = TECHNOLOGIES[techId];
          if (tech) {
            html += `<div class="pp-tech-item"><span class="pp-tech-name">${tech.name}</span></div>`;
          }
        }
        html += `</div></div>`;
      }
    }

    html += `</div>`;
    return html;
  }

  _renderTerritoryTab(player) {
    // In multiplayer, show LOCAL player's territories (not current turn player)
    const isMultiplayer = this.gameState.isMultiplayer && this.localUserId;
    let displayPlayer = player;

    if (isMultiplayer) {
      // Find local player by oderId
      const localPlayer = this.gameState.players?.find(p => p.oderId === this.localUserId);
      if (localPlayer) {
        displayPlayer = localPlayer;
      }
    }

    const territories = this.gameState.getPlayerTerritories(displayPlayer.id);
    let html = '<div class="pp-territory-tab">';

    // Territory count
    html += `
      <div class="pp-stat-section">
        <div class="pp-stat-header">🏴 ${isMultiplayer ? 'Your ' : ''}Territories</div>
        <div class="pp-territory-count">${territories.length} territories controlled</div>
      </div>`;

    // Continent control - show all players' progress
    html += `
      <div class="pp-stat-section">
        <div class="pp-stat-header">🌍 Continent Control</div>
        <div class="pp-continent-table-all">`;

    if (this.continents && this.continents.length > 0) {
      const players = this.gameState.getPlayers?.() || [];

      for (const continent of this.continents) {
        const total = continent.territories.length;

        // Get ownership breakdown for all players
        const ownership = {};
        for (const terrName of continent.territories) {
          const owner = this.gameState.getOwner(terrName);
          if (owner) {
            ownership[owner] = (ownership[owner] || 0) + 1;
          }
        }

        // Sort players by count (highest first)
        const sortedPlayers = Object.entries(ownership)
          .map(([playerId, count]) => ({
            player: this.gameState.getPlayer(playerId),
            count,
            hasBonus: count === total
          }))
          .sort((a, b) => b.count - a.count);

        // Find who has the bonus
        const bonusHolder = sortedPlayers.find(p => p.hasBonus);

        html += `
          <div class="pp-continent-block">
            <div class="pp-continent-header">
              <span class="pp-continent-name">${continent.name}</span>
              <span class="pp-continent-bonus ${bonusHolder ? 'active' : ''}">+${continent.bonus} IPCs</span>
            </div>
            <div class="pp-continent-players">`;

        for (const { player: p, count, hasBonus } of sortedPlayers) {
          if (!p) continue;
          const pct = Math.round((count / total) * 100);
          html += `
              <div class="pp-continent-player-row ${hasBonus ? 'has-bonus' : ''}">
                <div class="pp-continent-player-info">
                  ${p.flag ? `<img src="assets/flags/${p.flag}" class="pp-continent-flag" alt="">` : ''}
                  <span class="pp-continent-player-name" style="color: ${p.color}">${p.name}</span>
                </div>
                <div class="pp-continent-player-progress">
                  <div class="pp-continent-player-bar">
                    <div class="pp-continent-player-fill" style="width: ${pct}%; background: ${p.color}"></div>
                  </div>
                  <span class="pp-continent-player-count">${count}/${total}</span>
                </div>
              </div>`;
        }

        html += `
            </div>
          </div>`;
      }
    } else {
      html += `<div class="pp-no-continents">No continent data</div>`;
    }

    html += `</div></div></div>`;
    return html;
  }

  _renderLogTab() {
    let html = '<div class="pp-log-tab">';

    if (this.actionLog && this.actionLog.entries) {
      const entries = this.actionLog.entries.slice(-50); // Last 50 entries

      // Collapse consecutive placement entries into summaries
      const collapsedEntries = this._collapseLogEntries(entries);

      // Reverse so newest entries appear at top
      collapsedEntries.reverse();

      if (collapsedEntries.length === 0) {
        html += `<div class="pp-log-empty">No actions yet</div>`;
      } else {
        html += `<div class="pp-log-entries">`;
        for (const entry of collapsedEntries) {
          const time = entry.timestamp.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
          });
          const colorStyle = entry.data.color ? `border-left-color: ${entry.data.color}` : '';

          // Extract territory and movement data for hover highlighting
          const territoryData = this._getLogTerritoryData(entry);
          const dataAttrs = this._buildLogDataAttrs(territoryData);

          html += `
            <div class="pp-log-entry" style="${colorStyle}" ${dataAttrs}>
              <span class="pp-log-time">${time}</span>
              <span class="pp-log-msg">${this._getLogSummary(entry)}</span>
            </div>`;
        }
        html += `</div>`;
      }
    } else {
      html += `<div class="pp-log-empty">Game log not available</div>`;
    }

    html += '</div>';
    return html;
  }

  // Collapse consecutive placement entries into summaries
  _collapseLogEntries(entries) {
    const result = [];
    let placementGroup = null;

    for (const entry of entries) {
      if (entry.type === 'placement' || entry.type === 'mobilize') {
        const territory = entry.data.territory;

        // Get units to add - mobilize has units array, placement has single unitType
        let unitsToAdd = [];
        if (entry.data.units && Array.isArray(entry.data.units)) {
          unitsToAdd = entry.data.units.map(u => ({
            type: u.type,
            quantity: u.quantity || 1
          }));
        } else if (entry.data.unitType) {
          unitsToAdd = [{ type: entry.data.unitType, quantity: 1 }];
        }

        // Start new group or add to existing
        if (placementGroup && placementGroup.territory === territory &&
            placementGroup.data.color === entry.data.color) {
          // Add to existing group
          for (const unit of unitsToAdd) {
            const existing = placementGroup.units.find(u => u.type === unit.type);
            if (existing) {
              existing.quantity += unit.quantity;
            } else {
              placementGroup.units.push({ type: unit.type, quantity: unit.quantity });
            }
          }
          placementGroup.timestamp = entry.timestamp; // Update to latest timestamp
        } else {
          // Flush previous group if exists
          if (placementGroup) {
            result.push(this._createPlacementSummary(placementGroup));
          }
          // Start new group
          placementGroup = {
            territory,
            units: unitsToAdd,
            timestamp: entry.timestamp,
            data: { color: entry.data.color },
            type: entry.type
          };
        }
      } else {
        // Flush placement group if exists
        if (placementGroup) {
          result.push(this._createPlacementSummary(placementGroup));
          placementGroup = null;
        }
        result.push(entry);
      }
    }

    // Flush final placement group
    if (placementGroup) {
      result.push(this._createPlacementSummary(placementGroup));
    }

    return result;
  }

  // Create a summary entry from a placement group
  _createPlacementSummary(group) {
    const unitStr = group.units.map(u => `${u.quantity} ${u.type}`).join(', ');
    const action = group.type === 'mobilize' ? 'deployed' : 'placed';
    return {
      type: 'placement-summary',
      timestamp: group.timestamp,
      data: {
        message: `${unitStr} ${action} on ${group.territory}`,
        territory: group.territory,
        units: group.units,
        color: group.data.color
      }
    };
  }

  // Extract territory/movement data from log entry for hover highlighting
  _getLogTerritoryData(entry) {
    const data = entry.data;
    const result = { territories: [], from: null, to: null, isCombat: false };

    switch (entry.type) {
      case 'move':
      case 'ncm':
        result.from = data.from;
        result.to = data.to;
        result.territories = [data.from, data.to].filter(Boolean);
        break;
      case 'attack':
        result.from = data.from;
        result.to = data.to;
        result.territories = [data.from, data.to].filter(Boolean);
        result.isCombat = true;
        break;
      case 'combat-summary':
      case 'combat':
      case 'aa-fire':
      case 'capture':
        result.territories = [data.territory].filter(Boolean);
        result.isCombat = true;
        break;
      case 'placement':
      case 'placement-summary':
      case 'mobilize':
      case 'capital':
        result.territories = [data.territory].filter(Boolean);
        break;
      default:
        break;
    }

    return result;
  }

  // Build data attributes string for log entry hover
  _buildLogDataAttrs(territoryData) {
    const attrs = [];
    if (territoryData.territories.length > 0) {
      attrs.push(`data-territories="${territoryData.territories.join(',')}"`);
    }
    if (territoryData.from && territoryData.to) {
      attrs.push(`data-from="${territoryData.from}"`);
      attrs.push(`data-to="${territoryData.to}"`);
      attrs.push(`data-combat="${territoryData.isCombat}"`);
    }
    return attrs.join(' ');
  }

  _getLogSummary(entry) {
    const data = entry.data;
    switch (entry.type) {
      case 'move': return `Moved to ${data.to}`;
      case 'attack': return `⚔️ Attacking ${data.to}`;
      case 'combat-summary': return `⚔️ ${data.territory}: ${data.winner} wins`;
      case 'capture': return `🏴 Captured ${data.territory}`;
      case 'purchase': return `🛒 Purchased units`;
      case 'capital': return `🏛️ Capital: ${data.territory}`;
      case 'income': return `💰 +${data.amount} IPCs`;
      case 'tech': return data.tech ? `🔬 ${data.tech}` : 'Research failed';
      case 'turn': return `📍 ${data.message}`;
      case 'phase': return data.message;
      case 'cards': return `🃏 +${data.value} IPCs`;
      case 'placement': return `Placed ${data.unitType}`;
      case 'placement-summary': return data.message;
      case 'ncm': return `Moved to ${data.to}`;
      case 'mobilize': return `Deployed to ${data.territory}`;
      default: return data.message || entry.type;
    }
  }

  _calculateIncome(playerId) {
    let income = 0;
    const territories = this.gameState.getPlayerTerritories(playerId);

    for (const tName of territories) {
      const t = this.gameState.territoryByName[tName];
      if (t && !t.isWater) {
        income += t.ipc || 0;
      }
    }

    // Add continent bonuses
    if (this.continents) {
      for (const continent of this.continents) {
        const controlsAll = continent.territories.every(t =>
          this.gameState.getOwner(t) === playerId
        );
        if (controlsAll) {
          income += continent.bonus || 0;
        }
      }
    }

    return income;
  }

  _countUnits(playerId) {
    const counts = {};

    for (const [territory, units] of Object.entries(this.gameState.units || {})) {
      for (const unit of units) {
        if (unit.owner === playerId) {
          counts[unit.type] = (counts[unit.type] || 0) + (unit.quantity || 1);
        }
      }
    }

    return counts;
  }

  _techAcquisition() {
    const mode = this.gameState?.gameOptions?.techAcquisition;
    return mode === 'keep' || mode === 'buy' ? mode : 'dice';
  }

  _carriedTechTokens(player) {
    if (this._techAcquisition() !== 'keep' || !player) return 0;
    return Number(this.gameState?.playerTechs?.[player.id]?.techTokens) || 0;
  }

  _getPhaseHint(phase, turnPhase) {
    if (phase === GAME_PHASES.TERRITORY_DRAFT) {
      const name = this.gameState?.currentPlayer?.name;
      const who = name ? possessivePhrase(name, 'pick') : 'Your pick';
      const how = isMobileShell()
        ? 'Tap an open territory, then Pick'
        : 'Click an open territory';
      return `${who} · ${how}`;
    }
    return phonePointerHint(resolvePhaseHint(phase, turnPhase), { mobile: isMobileShell() });
  }

  _getPhaseName(phase, turnPhase) {
    if (phase === GAME_PHASES.TERRITORY_DRAFT) return 'Territory Draft';
    if (phase === GAME_PHASES.CAPITAL_PLACEMENT) return 'Place Capital';
    if (phase === GAME_PHASES.UNIT_PLACEMENT) return 'Initial Deployment';
    if (phase === GAME_PHASES.PLAYING) return TURN_PHASE_NAMES[turnPhase] || turnPhase;
    return 'Setup';
  }

  _getContrastColor(hexColor) {
    const raw = String(hexColor || '#888888');
    const hex = raw.replace('#', '');
    if (hex.length < 6) return '#ffffff';
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    if ([r, g, b].some((n) => Number.isNaN(n))) return '#ffffff';
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#000000' : '#ffffff';
  }

  // Inline Purchase UI
  _renderInlinePurchase(player) {
    // getIPCs returns remaining IPCs (already has pending costs subtracted)
    const remaining = this.gameState.getIPCs(player.id);
    const pending = this.gameState.getPendingPurchases?.() || [];
    const pendingCost = pending.reduce((sum, p) => sum + (p.cost || 0) * p.quantity, 0);
    // Calculate original budget by adding back pending costs
    const totalBudget = remaining + pendingCost;

    // Get available units to purchase
    const factoryTerritories = this._getFactoryTerritories(player.id);
    const adjacentSeaZones = this._getAdjacentSeaZones(factoryTerritories);
    const hasFactories = factoryTerritories.length > 0;
    const hasSeaZones = adjacentSeaZones.length > 0;

    const purchasableUnits = Object.entries(this.unitDefs || {})
      .filter(([type, def]) => {
        // AA guns can now be purchased
        if ((def.isLand || def.isAir || def.isBuilding) && hasFactories) return true;
        if (def.isSea && hasSeaZones) return true;
        return false;
      })
      .sort((a, b) => (a[1].cost || 0) - (b[1].cost || 0));

    // Risk cards section
    const riskCards = this.gameState.riskCards?.[player.id] || [];
    const canTradeCards = this.gameState.canTradeRiskCards?.(player.id);
    const nextCardValue = this.gameState.getNextRiskCardValue?.(player.id) || 12;

    let html = `
      <div class="pp-inline-purchase">
        <div class="pp-budget-bar">
          <span class="pp-budget-label">Budget:</span>
          <span class="pp-budget-value ${remaining < 5 ? 'low' : ''}">${remaining}</span>
          <span class="pp-budget-sep">/</span>
          <span class="pp-budget-total">${totalBudget} IPCs</span>
        </div>`;

    // Show Risk cards trade option if available
    if (riskCards.length > 0) {
      const cardIcons = { infantry: '🚶', cavalry: '🐎', artillery: '💣', wild: '⭐' };
      const cardCounts = {};
      riskCards.forEach(c => cardCounts[c] = (cardCounts[c] || 0) + 1);

      html += `
        <div class="pp-risk-cards-section">
          <div class="pp-risk-cards-header">
            <span class="pp-risk-cards-label">🃏 Risk Cards (${riskCards.length})</span>
            <span class="pp-risk-cards-summary">
              ${Object.entries(cardCounts).map(([type, count]) => `${cardIcons[type]}${count}`).join(' ')}
            </span>
          </div>`;

      if (canTradeCards) {
        html += `
          <div class="pp-risk-cards-trade">
            <span class="pp-trade-value">Trade for +${nextCardValue} IPCs</span>
            <button class="pp-action-btn trade-cards" data-action="trade-risk-cards">Cash In</button>
          </div>`;
      } else if (riskCards.length >= 5) {
        html += `<div class="pp-risk-cards-warning">⚠️ You must trade cards (5+ cards)</div>`;
      }

      html += `</div>`;
    }

    html += `<div class="pp-unit-list">`;

    // Group units by category (factory goes in Land)
    const landUnits = purchasableUnits.filter(([_, def]) => def.isLand || def.isBuilding);
    const airUnits = purchasableUnits.filter(([_, def]) => def.isAir);
    const navalUnits = purchasableUnits.filter(([_, def]) => def.isSea);

    // Check for industrial tech discount
    const hasIndustrialTech = this.gameState.hasTech?.(player.id, 'industrialTech') || false;

    const renderUnitRow = ([unitType, def]) => {
      const pendingUnit = pending.find(p => p.type === unitType);
      const qty = pendingUnit?.quantity || 0;
      // Apply industrial tech discount (-1 IPC, min 1)
      const actualCost = hasIndustrialTech ? Math.max(1, def.cost - 1) : def.cost;
      const canAfford = remaining >= actualCost;
      const imageSrc = getUnitIconPath(unitType, player.id);
      const costDisplay = hasIndustrialTech && def.cost > 1
        ? `<span class="pp-cost-discounted">$${actualCost}</span> <span class="pp-cost-original">$${def.cost}</span>`
        : `$${actualCost}`;

      return `
        <div class="pp-buy-row ${qty > 0 ? 'has-qty' : ''}">
          <div class="pp-buy-info">
            ${imageSrc ? `<img src="${imageSrc}" class="pp-buy-icon" alt="${unitType}">` : ''}
            <span class="pp-buy-name">${unitType}</span>
            <span class="pp-buy-cost">${costDisplay}</span>
          </div>
          <div class="pp-buy-controls">
            <button class="pp-qty-btn" data-action="buy-unit" data-unit="${unitType}" data-delta="-1" ${qty <= 0 ? 'disabled' : ''}>−</button>
            <span class="pp-buy-qty">${qty}</span>
            <button class="pp-qty-btn" data-action="buy-unit" data-unit="${unitType}" data-delta="1" ${!canAfford ? 'disabled' : ''}>+</button>
            <button class="pp-qty-btn max-btn" data-action="buy-max" data-unit="${unitType}" ${!canAfford ? 'disabled' : ''}>Max</button>
          </div>
        </div>`;
    };

    if (landUnits.length > 0) {
      html += `<div class="pp-unit-category-label">Land</div>`;
      html += landUnits.map(renderUnitRow).join('');
    }
    if (airUnits.length > 0) {
      html += `<div class="pp-unit-category-label">Air</div>`;
      html += airUnits.map(renderUnitRow).join('');
    }
    if (navalUnits.length > 0) {
      html += `<div class="pp-unit-category-label">Naval</div>`;
      html += navalUnits.map(renderUnitRow).join('');
    }

    html += `</div>`;

    // Cart summary and Buy button
    const totalUnits = pending.reduce((sum, p) => sum + p.quantity, 0);
    if (totalUnits > 0) {
      const cartItems = pending.map(p => `${p.quantity}× ${p.type}`).join(', ');
      html += `
        <div class="pp-cart-summary">
          <div class="pp-cart-items">${cartItems}</div>
          <div class="pp-cart-total">Total: ${pendingCost} IPCs</div>
        </div>
        <div class="pp-purchase-actions">
          <button class="pp-action-btn secondary" data-action="undo-purchase">↩ Undo</button>
          <button class="pp-action-btn secondary" data-action="clear-purchases">Clear All</button>
          <button class="pp-action-btn primary" data-action="confirm-purchase">Buy ${totalUnits} Unit${totalUnits > 1 ? 's' : ''}</button>
        </div>`;
    }

    if (this._techAcquisition() === 'buy') {
      const available = this.gameState.getAvailableTechs?.(player.id) || [];
      html += `<div class="pp-tech-list"><div class="pp-tech-list-header">Technologies · ${DIRECT_TECH_IPC_COST} IPCs</div>`;
      if (!available.length) {
        html += `<div class="pp-tech-item-desc">All technologies owned.</div>`;
      }
      for (const techId of available) {
        const tech = TECHNOLOGIES[techId];
        const afford = this.gameState.getIPCs(player.id) >= DIRECT_TECH_IPC_COST;
        html += `
          <button class="pp-action-btn secondary" data-action="buy-tech" data-tech="${techId}" ${afford ? '' : 'disabled'}>
            Buy ${tech?.name || techId} · ${DIRECT_TECH_IPC_COST}
          </button>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
    return html;
  }

  // Inline Tech Research UI
  _renderInlineTech(player) {
    const ipcs = this.gameState.getIPCs(player.id);
    const maxDice = Math.floor(ipcs / 5);
    const techState = this.gameState.playerTechs?.[player.id] || { techTokens: 0, unlockedTechs: [] };
    const unlockedTechs = techState.unlockedTechs || [];
    const availableTechs = Object.entries(TECHNOLOGIES)
      .filter(([id, _]) => !unlockedTechs.includes(id));

    const mode = this._techAcquisition();
    const multi = this.gameState.gameOptions?.multipleTech === true;
    const carried = this._carriedTechTokens(player);
    let note = multi
      ? '(5 per die, each 6 is a breakthrough)'
      : '(5 per die, roll 6 = breakthrough)';
    if (mode === 'keep') {
      note = multi
        ? '(5 per die, each 6 is a breakthrough, a miss keeps the dice)'
        : '(5 per die, roll 6 = breakthrough, a miss keeps the dice)';
    } else if (mode === 'buy') {
      note = `(Buy a technology for ${DIRECT_TECH_IPC_COST} IPCs during Purchase. No dice.)`;
    }
    let html = `
      <div class="pp-inline-tech">
        <div class="pp-tech-budget">
          <span>IPCs: ${ipcs}</span>
          <span class="pp-tech-cost-note">${note}</span>
        </div>`;

    if (mode === 'buy') {
      html += `<p class="pp-tech-item-desc">Technologies are bought during Purchase for ${DIRECT_TECH_IPC_COST} IPCs each.</p>`;
    } else {
      html += `
        <div class="pp-tech-dice-row">
          <span class="pp-tech-dice-label">Research Dice:</span>
          <div class="pp-tech-dice-controls">
            <button class="pp-qty-btn" data-action="tech-dice-delta" data-delta="-1" ${this.techDiceCount <= 0 ? 'disabled' : ''}>−</button>
            <span class="pp-tech-dice-count">${this.techDiceCount}</span>
            <button class="pp-qty-btn" data-action="tech-dice-delta" data-delta="1" ${this.techDiceCount >= maxDice ? 'disabled' : ''}>+</button>
            <button class="pp-qty-btn max-btn" data-action="tech-dice-max" ${maxDice <= 0 ? 'disabled' : ''}>Max</button>
          </div>
          <span class="pp-tech-cost">Cost: ${this.techDiceCount * 5} IPCs${carried > 0 ? ` · ${carried} carried` : ''}</span>
        </div>`;
      const rolling = this.techDiceCount > 0 ? this.techDiceCount : carried;
      if (rolling > 0) {
        const techCta = resolvePhoneTechCta({ diceCount: rolling });
        const label = this.techDiceCount <= 0 && carried > 0
          ? `Roll ${carried} carried`
          : techCta.label;
        html += `
        <button class="pp-action-btn primary" data-action="roll-tech">
          ${label}
        </button>`;
      }
    }

    // Show all technologies with descriptions and owned status
    html += `<div class="pp-tech-list">`;
    html += `<div class="pp-tech-list-header">Technologies</div>`;

    for (const [id, tech] of Object.entries(TECHNOLOGIES)) {
      const isOwned = unlockedTechs.includes(id);
      html += `
        <div class="pp-tech-item ${isOwned ? 'owned' : ''}">
          <div class="pp-tech-item-name">${isOwned ? '✓ ' : ''}${tech.name}</div>
          <div class="pp-tech-item-desc">${tech.description}</div>
        </div>`;
    }
    html += `</div>`;

    html += `</div>`;
    return html;
  }

  // Rockets UI for launching rocket attacks during combat move
  _renderRocketsUI(player) {
    // Check if player has rockets tech
    if (!this.gameState.hasTech(player.id, 'rockets')) return '';

    const availableAA = this.gameState.getAvailableRocketAAguns(player.id);
    if (availableAA.length === 0) return '';

    // Check if any AA guns have valid targets
    const aaWithTargets = [];
    for (const aa of availableAA) {
      const targets = this.gameState.getRocketTargets(aa.territory);
      if (targets.length > 0) {
        aaWithTargets.push({ ...aa, targets });
      }
    }

    if (aaWithTargets.length === 0) return '';

    let html = `
      <div class="pp-rockets-section">
        <div class="pp-rockets-header">
          <span class="pp-rockets-icon">🚀</span>
          <span>Rocket Attacks</span>
        </div>
        <div class="pp-rockets-hint">AA guns can bombard enemy factories</div>
        <div class="pp-rockets-list">`;

    for (const aa of aaWithTargets) {
      html += `
        <div class="pp-rocket-aa">
          <div class="pp-rocket-source">${aa.territory} (${aa.availableCount} AA available)</div>
          <div class="pp-rocket-targets">`;

      for (const target of aa.targets) {
        html += `
          <button class="pp-rocket-btn" data-action="launch-rocket" data-from="${aa.territory}" data-target="${target.territory}">
            🎯 ${target.territory} (${target.ownerName}: ${target.ownerIPCs} IPCs)
          </button>`;
      }
      html += `</div></div>`;
    }

    html += `</div></div>`;
    return html;
  }

  // Shared inputs for the initial-deploy Done button and naval-remainder hint.
  _getInitialPlacementUX(player) {
    this.gameState.ensureInitialDeployPools?.();
    const placedThisRound = this.gameState.unitsPlacedThisRound || 0;
    const totalRemaining = this.gameState.getTotalUnitsToPlace(player.id, this.unitDefs);
    const limit = this.gameState.getUnitsPerRoundLimit?.() || 6;
    const unitsToPlace = this.gameState.getKnownUnitsToPlace?.(player.id, this.unitDefs)
      || knownUnitsToPlace(this.gameState.getUnitsToPlace?.(player.id) || [], this.unitDefs);
    const hasPlaceable = this.gameState.hasPlaceableUnits?.(player.id, this.unitDefs) ?? (totalRemaining > 0);
    const totalQueued = queuedCount(this.placementQueue || {});

    const landAirRemaining = unitsToPlace.filter(u => {
      const def = this.unitDefs?.[u.type];
      return def && (def.isLand || def.isAir || def.isBuilding) && u.quantity > 0;
    }).reduce((sum, u) => sum + u.quantity, 0);
    const navalRemaining = unitsToPlace.filter(u => {
      const def = this.unitDefs?.[u.type];
      return def?.isSea && u.quantity > 0;
    }).reduce((sum, u) => sum + u.quantity, 0);

    const dest = this._phoneDeployDest();
    const isValidPlacement = !!(dest && this._isValidPlacementTerritory(dest, player));
    const selectedKind = isValidPlacement && dest.isWater
      ? 'valid-sea'
      : isValidPlacement ? 'owned-land' : 'other';

    return {
      placedThisRound,
      totalRemaining,
      limit,
      unitsToPlace,
      hasPlaceable,
      totalQueued,
      landAirRemaining,
      navalRemaining,
      isValidPlacement,
      isWater: !!this.selectedTerritory?.isWater,
      ux: computeInitialPlacementUX({
        placedThisRound,
        limit,
        totalRemaining,
        landAirRemaining,
        navalRemaining,
        hasPlaceable,
        totalQueued,
        selectedKind,
      }),
    };
  }

  _renderPhoneDetentTabs() {
    if (!shouldShowPhoneDetentTabs({
      mobile: isMobileShell(),
      expanded: this.trayExpanded,
      phase: this.gameState?.phase,
    })) return '';
    const tabs = [
      { id: 'actions', label: 'Units' },
      { id: 'stats', label: 'Players' },
      { id: 'territory', label: 'Territory' },
      { id: 'log', label: 'Log' },
    ];
    let html = `<div class="phone-detent-tabs">`;
    for (const tab of tabs) {
      const active = this.phoneDetentTab === tab.id ? ' active' : '';
      html += `<button type="button" class="phone-detent-tab${active}" data-action="phone-detent-tab" data-tab="${tab.id}">${tab.label}</button>`;
    }
    html += `</div>`;
    return html;
  }

  _phonePeekShort(type) {
    const map = {
      infantry: 'INF', armour: 'TNK', artillery: 'ART', fighter: 'FTR',
      bomber: 'BMB', tacticalBomber: 'TAC', transport: 'TRN', submarine: 'SUB',
      destroyer: 'DD', cruiser: 'CA', battleship: 'BB', carrier: 'CV',
      factory: 'FAC', aaGun: 'AA',
    };
    return map[type] || String(type || '?').slice(0, 3).toUpperCase();
  }

  // Experimental-style tile: icon + short label + in-tile −/count/+.
  // Mobile peek only — desktop unit rows stay unchanged.
  _phonePeekTileHtml({
    unitType,
    unitKey = unitType,
    imageSrc = '',
    picked = 0,
    have = 0,
    selected = false,
    selectAction = '',
    stepAction = '',
    minusOff = false,
    plusOff = false,
    countLabel = null,
  } = {}) {
    const name = formatUnitName(unitType);
    const short = this._phonePeekShort(unitType);
    const on = selected || picked > 0 ? ' is-on' : '';
    const label = countLabel != null ? countLabel : `${picked}/${have}`;
    const selectAttr = selectAction
      ? `data-action="${selectAction}" data-unit="${unitKey}"`
      : `data-unit="${unitKey}"`;
    const steps = stepAction
      ? `<div class="phone-peek-tile-steps">
          <button type="button" class="phone-peek-step" data-action="${stepAction}" data-unit="${unitKey}" data-delta="-1" ${minusOff ? 'disabled' : ''} aria-label="Fewer ${name}">−</button>
          <b>${label}</b>
          <button type="button" class="phone-peek-step" data-action="${stepAction}" data-unit="${unitKey}" data-delta="1" ${plusOff ? 'disabled' : ''} aria-label="More ${name}">+</button>
        </div>`
      : `<div class="phone-peek-tile-steps"><b>${label}</b></div>`;
    return `<div class="phone-peek-tile${on}" ${selectAttr} role="group" aria-label="${name}">
      ${imageSrc ? `<img src="${imageSrc}" alt="" class="phone-peek-icon">` : ''}
      <em>${short}</em>
      ${steps}
    </div>`;
  }

  _renderPhonePeekRow(player, phase, turnPhase) {
    if (!shouldShowPhonePeekUnitRow({ mobile: true, phase, turnPhase })) return '';
    let chips = '';
    let pairHint = '';

    const pairLand = resolvePhoneDeployLandName({
      stagedLandName: this._phoneDeployLandName,
      selectedTerritory: this.selectedTerritory,
      allowWater: phonePairAllowWater({ phase, turnPhase }),
    });

    if (phase === GAME_PHASES.UNIT_PLACEMENT) {
      pairHint = resolvePhonePeekHint(phase, turnPhase, this.selectedUnitType, {
        territoryName: pairLand,
      });
      const dest = this._phoneDeployDest();
      const units = knownUnitsToPlace(this.gameState.getUnitsToPlace?.(player.id) || [], this.unitDefs)
        .filter((unit) => shouldShowPhoneDeployChip({
          destName: dest?.name || pairLand || '',
          destIsWater: !!(dest?.isWater),
          unitDef: this.unitDefs?.[unit.type],
        }));
      if (this.selectedUnitType && !units.some((u) => u.type === this.selectedUnitType)) {
        this.selectedUnitType = null;
        this.placementQueue = {};
      }
      for (const unit of units) {
        const imageSrc = getUnitIconPath(unit.type, player.id);
        chips += this._phonePeekTileHtml({
          unitType: unit.type,
          imageSrc,
          picked: this.selectedUnitType === unit.type ? 1 : 0,
          have: unit.quantity,
          selected: this.selectedUnitType === unit.type,
          selectAction: 'phone-select-unit',
          countLabel: String(unit.quantity),
        });
      }
    } else if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.PURCHASE) {
      pairHint = resolvePhonePeekHint(phase, turnPhase, this.selectedUnitType, {
        territoryName: pairLand,
      });
      const pending = this.gameState.getPendingPurchases?.() || [];
      const factoryTerritories = this._getFactoryTerritories(player.id);
      const adjacentSeaZones = this._getAdjacentSeaZones(factoryTerritories);
      const hasFactories = factoryTerritories.length > 0;
      const hasSeaZones = adjacentSeaZones.length > 0;
      const units = Object.entries(this.unitDefs || {}).filter(([, def]) => {
        if ((def.isLand || def.isAir || def.isBuilding) && hasFactories) return true;
        if (def.isSea && hasSeaZones) return true;
        return false;
      });
      const ipcs = this.gameState.getIPCs(player.id);
      for (const [unitType, def] of units) {
        const imageSrc = getUnitIconPath(unitType, player.id);
        const qty = pending.find(p => p.type === unitType)?.quantity || 0;
        const cost = Number(def?.cost) || 0;
        const canAfford = cost <= 0 || ipcs >= cost;
        chips += this._phonePeekTileHtml({
          unitType,
          imageSrc,
          picked: qty,
          have: qty,
          selected: this.selectedUnitType === unitType || qty > 0,
          stepAction: 'buy-unit',
          minusOff: qty <= 0,
          plusOff: !canAfford,
          countLabel: String(qty),
        });
      }
    } else if (phase === GAME_PHASES.PLAYING && turnPhase === TURN_PHASES.MOBILIZE) {
      pairHint = resolvePhonePeekHint(phase, turnPhase, this.selectedUnitType, {
        territoryName: pairLand,
      });
      const pending = this.gameState.getPendingPurchases?.() || [];
      for (const unit of pending) {
        if (!unit.quantity) continue;
        const imageSrc = getUnitIconPath(unit.type, player.id);
        chips += this._phonePeekTileHtml({
          unitType: unit.type,
          imageSrc,
          picked: 0,
          have: unit.quantity,
          selected: this.selectedUnitType === unit.type,
          selectAction: 'phone-select-unit',
          countLabel: String(unit.quantity),
        });
      }
    } else if (phase === GAME_PHASES.PLAYING
      && (turnPhase === TURN_PHASES.COMBAT_MOVE || turnPhase === TURN_PHASES.NON_COMBAT_MOVE)) {
      const selectedSummary = formatPhoneMoveSelectionSummary(this.moveSelectedUnits);
      pairHint = resolvePhonePeekHint(phase, turnPhase, this.selectedUnitType, {
        territoryName: pairLand,
        destName: this.movePendingDest || '',
        selectedSummary,
      });
      const from = this._phoneDeployDest();
      const movable = from ? this._getMovableUnits(from, player) : [];
      const seen = new Set();
      for (const unit of movable) {
        const unitKey = moveUnitKey(unit);
        if (seen.has(unitKey)) continue;
        seen.add(unitKey);
        const imageSrc = getUnitIconPath(unit.type, player.id);
        const staged = Number(this.moveSelectedUnits?.[unitKey]) || 0;
        const have = remainingEligibleOfType({ available: unit.quantity });
        chips += this._phonePeekTileHtml({
          unitType: unit.type,
          unitKey,
          imageSrc,
          picked: staged,
          have,
          selected: staged > 0
            || this.selectedUnitType === unitKey
            || this.selectedUnitType === unit.type,
          selectAction: 'phone-select-unit',
          stepAction: 'move-unit',
          minusOff: staged <= 0,
          plusOff: staged >= have,
        });
      }
    } else if (shouldShowTechResearch(phase, turnPhase)) {
      const n = this.techDiceCount || 0;
      const ipcs = this.gameState.getIPCs(player.id);
      const maxDice = Math.floor(ipcs / 5);
      pairHint = resolvePhonePeekHint(phase, turnPhase, null, { techDiceCount: n });
      chips += `<div class="phone-peek-tile phone-peek-tile--tech is-on" role="group" aria-label="Research dice">
        <em>DIE</em>
        <div class="phone-peek-tile-steps">
          <button type="button" class="phone-peek-step" data-action="tech-dice-delta" data-delta="-1" aria-label="Fewer research dice" ${n <= 0 ? 'disabled' : ''}>−</button>
          <b class="phone-peek-tech-count" aria-live="polite">${n}</b>
          <button type="button" class="phone-peek-step" data-action="tech-dice-delta" data-delta="1" aria-label="Add research die" ${n >= maxDice ? 'disabled' : ''}>+</button>
        </div>
      </div>`;
    }

    if (!chips && !pairHint) return '';
    const hint = pairHint ? `<div class="phone-peek-pair-hint">${pairHint}</div>` : '';
    const row = chips ? `<div class="phone-peek-row phone-peek-row--tiles">${chips}</div>` : '';
    return `${hint}${row}`;
  }

  _renderPhonePlacementTray(player) {
    const { unitsToPlace, ux, placedThisRound, limit } = this._getInitialPlacementUX(player);
    const dest = this._phoneDeployDest();
    const remaining = knownUnitsToPlace(unitsToPlace, this.unitDefs)
      .filter((unit) => shouldShowPhoneDeployChip({
        destName: dest?.name || this._phoneDeployLandName || '',
        destIsWater: !!(dest?.isWater),
        unitDef: this.unitDefs?.[unit.type],
      }));
    if (this.selectedUnitType && !remaining.some(u => u.type === this.selectedUnitType)) {
      this.selectedUnitType = null;
    }

    const selectedName = formatUnitName(this.selectedUnitType);
    let hint = 'Tap a territory to select, then Deploy';
    if (this.selectedUnitType) hint = `Select a territory, then Deploy ${selectedName}`;
    if (ux.needSeaHint && ux.hint) hint = ux.hint;
    if (ux.stuckWithNaval && ux.hint) hint = ux.hint;

    let html = `<div class="phone-place-tray">`;
    const budget = placementBudgetCopy({
      deployedThisRound: placedThisRound,
      limit,
      poolRemaining: remaining.reduce((sum, u) => sum + (Number(u.quantity) || 0), 0),
    });
    html += `<div class="phone-place-meta">${budget.deployedLabel}: ${budget.deployedText}</div>`;
    html += `<div class="phone-place-pool">${budget.remainingLabel}: ${budget.remainingText}</div>`;
    if (budget.remainingHint) {
      html += `<div class="phone-place-hint">${budget.remainingHint}</div>`;
    }
    html += `<div class="phone-place-hint">${hint}</div>`;
    html += `<div class="phone-place-list">`;
    for (const unit of remaining) {
      const imageSrc = getUnitIconPath(unit.type, player.id);
      const name = unit.type.charAt(0).toUpperCase() + unit.type.slice(1);
      const selected = this.selectedUnitType === unit.type ? ' selected' : '';
      html += `
        <button type="button" class="phone-place-row${selected}" data-action="phone-select-unit" data-unit="${unit.type}">
          ${imageSrc ? `<img src="${imageSrc}" alt="" class="phone-place-icon">` : ''}
          <span class="phone-place-name">${name}</span>
          <span class="phone-place-count">×${unit.quantity}</span>
        </button>`;
    }
    if (remaining.length === 0) {
      html += `<div class="phone-place-empty">All units placed</div>`;
    }
    html += `</div>`;
    if (ux.showDone) {
      html += `<button type="button" class="phone-place-done" data-action="finish-placement">${
        ux.canSkipNaval ? 'Done — skip leftover ships →' : 'Done — next player →'
      }</button>`;
    }
    html += `</div>`;
    return html;
  }

  // Inline Placement UI - mimics buy phase style
  _renderInlinePlacement(player) {
    const {
      placedThisRound,
      unitsToPlace,
      totalQueued,
      landAirRemaining,
      isValidPlacement,
      isWater,
      ux,
    } = this._getInitialPlacementUX(player);
    const limit = this.gameState.getUnitsPerRoundLimit?.() || 6;
    const canUndo = this.gameState.placementHistory && this.gameState.placementHistory.length > 0;
    const slotsRemaining = limit - placedThisRound;
    const showDoneButton = ux.showDone;

    // Separate units by category
    const landUnits = unitsToPlace.filter(u => {
      const def = this.unitDefs?.[u.type];
      return def && def.isLand && u.quantity > 0;
    });
    const airUnits = unitsToPlace.filter(u => {
      const def = this.unitDefs?.[u.type];
      return def && def.isAir && u.quantity > 0;
    });
    const navalUnits = unitsToPlace.filter(u => {
      const def = this.unitDefs?.[u.type];
      return def?.isSea && u.quantity > 0;
    });

    // Pool remaining (including leftover ships). Stuck naval is still counted so
    // the player sees why Done is offered — they are not skipped onto land.
    const actualRemaining = landAirRemaining + navalUnits.reduce((sum, u) => sum + u.quantity, 0);

    // Initialize placement queue if not exists
    if (!this.placementQueue) this.placementQueue = {};

    // Panel count is units actually on the map this round. Queue is not
    // committed until Deploy — Max / + must not bump this (B24).
    const deployedThisRound = deployedThisRoundDisplay(placedThisRound);
    const budget = placementBudgetCopy({
      deployedThisRound,
      limit,
      poolRemaining: actualRemaining,
    });

    let html = `
      <div class="pp-inline-placement">
        <div class="pp-budget-bar">
          <span class="pp-budget-label">${budget.deployedLabel}:</span>
          <span class="pp-budget-value ${deployedThisRound >= limit ? 'full' : ''}">${budget.deployedText}</span>
        </div>
        <div class="pp-placement-remaining">
          <span class="pp-remaining-label">${budget.remainingLabel}:</span>
          <span class="pp-remaining-value">${budget.remainingText}</span>
        </div>`;
    if (budget.remainingHint) {
      html += `<div class="pp-hint">${budget.remainingHint}</div>`;
    }

    // Selected tile + skip hint stay visible when Done/skip is offered
    // (James B19-class: 1/6 naval-only still needs a Done next to Undo).
    if (isValidPlacement) {
      html += `
          <div class="pp-placement-selected">
            <span class="pp-selected-icon">${isWater ? '🌊' : '🏔'}</span>
            <span class="pp-selected-name">${this.selectedTerritory.name}</span>
          </div>`;
      if (ux.hint) {
        html += `<div class="pp-hint">${phonePointerHint(ux.hint, { mobile: isMobileShell() })}</div>`;
      }
    } else if (ux.hint) {
      html += `<div class="pp-hint">${phonePointerHint(ux.hint, { mobile: isMobileShell() })}</div>`;
    } else if (!showDoneButton) {
      html += `<div class="pp-hint">${phonePointerHint('Click a territory you own to place units', { mobile: isMobileShell() })}</div>`;
    }

    // Unit list with +/- controls (like buy phase)
    html += `<div class="pp-unit-list">`;

    const renderPlacementRow = (unit) => {
      const def = this.unitDefs?.[unit.type];
      const imageSrc = getUnitIconPath(unit.type, player.id);
      const queued = this.placementQueue[unit.type] || 0;
      const available = quantityAvailableForType(unitsToPlace, unit.type) || unit.quantity;
      // + / Max stage without a legal tile. Deploy still needs one (B29).
      const canAdd = canStagePlaceQueue({
        queue: this.placementQueue,
        unitType: unit.type,
        available,
        slotsRemaining,
      });
      const canRemove = queued > 0;

      // Build tooltip
      let tooltip = `${unit.type.charAt(0).toUpperCase() + unit.type.slice(1)}`;
      if (def) {
        tooltip += `\nAttack: ${def.attack || 0} | Defense: ${def.defense || 0}`;
        tooltip += `\nMovement: ${def.movement || 0}`;
      }

      return `
        <div class="pp-buy-row ${queued > 0 ? 'has-qty' : ''}" data-unit="${unit.type}" title="${tooltip}">
          <div class="pp-buy-info">
            ${imageSrc ? `<img src="${imageSrc}" class="pp-buy-icon" alt="${unit.type}">` : ''}
            <span class="pp-buy-name">${formatUnitName(unit.type)}</span>
            <span class="pp-buy-cost">${available} left</span>
          </div>
          <div class="pp-buy-controls">
            <button class="pp-qty-btn" data-action="place-queue" data-unit="${unit.type}" data-delta="-1" ${!canRemove ? 'disabled' : ''}>−</button>
            <span class="pp-buy-qty">${queued}</span>
            <button class="pp-qty-btn" data-action="place-queue" data-unit="${unit.type}" data-delta="1" ${!canAdd ? 'disabled' : ''}>+</button>
            <button class="pp-qty-btn max-btn" data-action="place-queue-max" data-unit="${unit.type}" ${!canAdd ? 'disabled' : ''}>Max</button>
          </div>
        </div>`;
    };

    // Show units appropriate for selected territory type
    if (isValidPlacement) {
      if (!isWater) {
        // Land territory - show land and air units
        if (landUnits.length > 0) {
          html += `<div class="pp-unit-category-label">Land</div>`;
          html += landUnits.map(renderPlacementRow).join('');
        }
        if (airUnits.length > 0) {
          html += `<div class="pp-unit-category-label">Air</div>`;
          html += airUnits.map(renderPlacementRow).join('');
        }
        if (landUnits.length === 0 && airUnits.length === 0) {
          if (ux.needSeaHint && ux.hint) {
            html += `<div class="pp-placement-sea-hint">${ux.hint}</div>`;
          } else if (ux.stuckWithNaval && ux.hint) {
            html += `<div class="pp-placement-sea-hint">${ux.hint}</div>`;
          } else {
            html += `<div class="pp-placement-done-msg">No land/air units to place</div>`;
          }
        }
      } else {
        // Sea zone - show naval units and air units if carrier with space exists
        let hasUnitsToShow = false;

        if (navalUnits.length > 0) {
          html += `<div class="pp-unit-category-label">Naval</div>`;
          html += navalUnits.map(renderPlacementRow).join('');
          hasUnitsToShow = true;
        }

        // Check if there's a carrier with space for aircraft in this sea zone
        const seaUnits = this.gameState.getUnitsAt?.(this.selectedTerritory.name) || [];
        const playerCarriers = seaUnits.filter(u => u.type === 'carrier' && u.owner === player.id);
        const hasCarrierWithSpace = playerCarriers.some(carrier => {
          const aircraft = carrier.aircraft || [];
          const carrierDef = this.unitDefs?.carrier;
          const capacity = carrierDef?.aircraftCapacity || 2;
          return aircraft.length < capacity;
        });

        // Air can stage here even without a carrier. Deploy still needs
        // land or a carrier with space (B29 TacticalBomber Max).
        if (airUnits.length > 0) {
          const carrierDef = this.unitDefs?.carrier;
          const carriableAir = airUnits.filter(u => carrierDef?.canCarry?.includes(u.type));
          const airToShow = hasCarrierWithSpace && carriableAir.length > 0
            ? carriableAir
            : airUnits;
          html += `<div class="pp-unit-category-label">${
            hasCarrierWithSpace ? 'Air (on Carrier)' : 'Air (stage — deploy on land or a carrier)'
          }</div>`;
          html += airToShow.map(renderPlacementRow).join('');
          hasUnitsToShow = true;
          if (!hasCarrierWithSpace) {
            html += `<div class="pp-placement-hint">💡 Place a carrier here first to deploy aircraft at sea</div>`;
          }
        }

        if (!hasUnitsToShow) {
          html += `<div class="pp-placement-done-msg">No units to place here</div>`;
        }
      }
    } else {
      // Stage from any remaining row. Deploy still needs a legal tile (B29).
      if (ux.needSeaHint && ux.hint) {
        html += `<div class="pp-placement-sea-hint">${phonePointerHint(ux.hint, { mobile: isMobileShell() })}</div>`;
      } else if (ux.stuckWithNaval && ux.hint) {
        html += `<div class="pp-placement-sea-hint">${phonePointerHint(ux.hint, { mobile: isMobileShell() })}</div>`;
      } else {
        html += `<div class="pp-hint">${phonePointerHint('Stage units, then click a territory you own to Deploy', { mobile: isMobileShell() })}</div>`;
      }
      if (landUnits.length > 0) {
        html += `<div class="pp-unit-category-label">Land</div>`;
        html += landUnits.map(renderPlacementRow).join('');
      }
      if (airUnits.length > 0) {
        html += `<div class="pp-unit-category-label">Air</div>`;
        html += airUnits.map(renderPlacementRow).join('');
      }
      if (navalUnits.length > 0) {
        html += `<div class="pp-unit-category-label">Naval</div>`;
        html += navalUnits.map(renderPlacementRow).join('');
      }
    }

    html += `</div>`;

    // Action buttons — always painted. Missing Undo/Deploy looks like a
    // dead first turn (B39) even when they are disabled.
    html += `<div class="pp-placement-actions">`;
    html += `<button class="pp-action-btn secondary small" data-action="undo-placement"${canUndo ? '' : ' disabled'}>↩ Undo</button>`;
    // Green thumb / bottom confirm is the only Done (9.20.26.04).
    // Do not paint a second blue primary here.
    const canDeploy = totalQueued > 0 && isValidPlacement;
    html += `<button class="pp-action-btn primary" data-action="confirm-placement"${canDeploy ? '' : ' disabled'}>Deploy${totalQueued > 0 ? ` ${totalQueued}` : ''}</button>`;
    html += `</div>`;

    html += `</div>`;
    return html;
  }

  // Check if territory is valid for initial unit placement
  _isValidPlacementTerritory(territory, player) {
    if (!territory || !player) return false;

    // Land territories: must be owned by player
    if (!territory.isWater) {
      return this.gameState.getOwner(territory.name) === player.id;
    }

    // Sea zones: must be adjacent to player-owned coastal territory
    if (!this.territories) return false;
    const seaZone = this.territories[territory.name];
    if (!seaZone) return false;

    // Same setup rule as hasPlaceableUnits / placeInitialUnit: enemy-occupied
    // seas are not legal naval drops (does not change combat or movement).
    const existingUnits = this.gameState.units?.[territory.name] || [];
    if (existingUnits.some(u => u.owner !== player.id)) return false;

    for (const connName of seaZone.connections || []) {
      const conn = this.territories[connName];
      if (conn && !conn.isWater && this.gameState.getOwner(connName) === player.id) {
        return true;
      }
    }
    return false;
  }

  _getFactoryTerritories(playerId) {
    const factories = [];
    for (const [name, state] of Object.entries(this.gameState.territoryState || {})) {
      if (state.owner !== playerId) continue;
      const units = this.gameState.units[name] || [];
      if (units.some(u => u.type === 'factory' && u.owner === playerId)) {
        factories.push(name);
      }
    }
    return factories;
  }

  _getAdjacentSeaZones(factoryTerritories) {
    if (!this.territories) return [];
    const seaZones = new Set();
    for (const terrName of factoryTerritories) {
      const territory = this.territories[terrName];
      if (!territory) continue;
      for (const conn of territory.connections || []) {
        const connT = this.territories[conn];
        if (connT?.isWater) {
          seaZones.add(conn);
        }
      }
    }
    return Array.from(seaZones);
  }

  // Check if territory has movable units owned by player
  _hasMovableUnits(territory, player) {
    if (!territory || !player) return false;
    const units = this.gameState.getUnitsAt(territory.name);
    return units.some(u => {
      if (u.owner !== player.id) return false;
      const def = this.unitDefs?.[u.type];
      if (!def || def.movement <= 0 || def.isBuilding) return false;
      // Check if unit hasn't moved yet
      return !u.moved;
    });
  }

  // Get movable units at a territory for current player
  _getMovableUnits(territory, player) {
    if (!territory || !player) return [];
    const units = this.gameState.getUnitsAt(territory.name);
    const movable = {};
    const individualShips = []; // Track transports/carriers with cargo separately
    const cargoUnits = []; // Track cargo units for amphibious assault
    const carrierAircraft = []; // Track aircraft on carriers

    for (const u of units) {
      if (u.owner !== player.id) continue;
      const def = this.unitDefs?.[u.type];
      if (!def || def.movement <= 0 || def.isBuilding) continue;

      // Aircraft on carriers can move independently - check them even if carrier has moved
      // This allows aircraft to fly off during non-combat even if carrier moved during combat
      if (u.id && u.type === 'carrier') {
        const aircraft = u.aircraft || [];
        // Always add carrier aircraft as selectable (they have their own movement)
        if (territory.isWater && aircraft.length > 0) {
          for (const airUnit of aircraft) {
            // Aircraft can move if they haven't moved yet (tracked per aircraft, not per carrier)
            if (airUnit.moved) continue;
            const airKey = `aircraft:${u.id}:${airUnit.type}`;
            const existing = carrierAircraft.find(c => c.cargoKey === airKey);
            if (existing) {
              existing.quantity += airUnit.quantity || 1;
            } else {
              carrierAircraft.push({
                type: airUnit.type,
                quantity: airUnit.quantity || 1,
                carrierId: u.id,
                isCarrierAircraft: true,
                cargoKey: airKey,
                displayName: `${airUnit.type} (on carrier)`
              });
            }
          }
        }
      }

      // Skip units that have already moved (for non-aircraft handling)
      if (u.moved) continue;

      // Individual ships (transports/carriers with cargo) are tracked separately
      if (u.id) {
        const cargo = u.cargo || [];
        const aircraft = u.aircraft || [];
        const allCargo = [...cargo, ...aircraft];
        const cargoDesc = allCargo.length > 0
          ? ` (${allCargo.map(c => c.type).join(', ')})`
          : ' (empty)';
        individualShips.push({
          type: u.type,
          id: u.id,
          quantity: 1,
          cargo: cargo,
          aircraft: aircraft,
          displayName: `${u.type}${cargoDesc}`,
          isIndividual: true
        });

        // Add cargo units as separately selectable for amphibious assault
        if (territory.isWater && u.type === 'transport' && cargo.length > 0) {
          for (const cargoUnit of cargo) {
            const cargoKey = `cargo:${u.id}:${cargoUnit.type}`;
            const existing = cargoUnits.find(c => c.cargoKey === cargoKey);
            if (existing) {
              existing.quantity += cargoUnit.quantity || 1;
            } else {
              cargoUnits.push({
                type: cargoUnit.type,
                quantity: cargoUnit.quantity || 1,
                transportId: u.id,
                isCargo: true,
                cargoKey: cargoKey,
                displayName: `${cargoUnit.type} (on transport)`
              });
            }
          }
        }

        // Skip the duplicate aircraft handling below since we already handled it above
        if (u.type === 'carrier') continue;

        // Add aircraft on carriers as separately selectable (for non-carriers with aircraft, if any)
        if (territory.isWater && aircraft.length > 0) {
          for (const airUnit of aircraft) {
            const airKey = `aircraft:${u.id}:${airUnit.type}`;
            const existing = carrierAircraft.find(c => c.cargoKey === airKey);
            if (existing) {
              existing.quantity += airUnit.quantity || 1;
            } else {
              carrierAircraft.push({
                type: airUnit.type,
                quantity: airUnit.quantity || 1,
                carrierId: u.id,
                isCarrierAircraft: true,
                cargoKey: airKey,
                displayName: `${airUnit.type} (on carrier)`
              });
            }
          }
        }
        continue;
      }

      if (!movable[u.type]) {
        movable[u.type] = { type: u.type, quantity: 0 };
      }
      movable[u.type].quantity += u.quantity || 1;
    }

    // Combine: aggregated units first, then individual ships, then cargo/aircraft
    return [...Object.values(movable), ...individualShips, ...cargoUnits, ...carrierAircraft];
  }

  // Get valid destinations for selected units based on their movement range
  _getValidDestinations(fromTerritory, player, isCombatMove) {
    if (!fromTerritory || !this.territories || !this.gameState) return [];
    const from = this.territories[fromTerritory.name];
    if (!from) return [];

    const destinations = new Map(); // name -> { name, isEnemy, isWater, distance }

    // Get selected units and their movement ranges
    // Handle both regular unit types and individual ships (ship:ID format)
    const selectedUnits = [];
    const selectedShipIds = [];
    const selectedCargoUnits = []; // Track cargo units selected for amphibious assault

    for (const [key, qty] of Object.entries(this.moveSelectedUnits)) {
      if (qty <= 0) continue;
      if (key.startsWith('ship:')) {
        selectedShipIds.push(key.replace('ship:', ''));
      } else if (key.startsWith('cargo:')) {
        // Format: cargo:transportId:unitType
        const parts = key.split(':');
        if (parts.length >= 3) {
          selectedCargoUnits.push({
            transportId: parts[1],
            unitType: parts[2],
            quantity: qty
          });
        }
      } else if (key.startsWith('aircraft:')) {
        const type = airSelectionType(key);
        const def = this.unitDefs?.[type];
        if (def) selectedUnits.push({ type, quantity: qty, def });
      } else {
        const def = this.unitDefs?.[key];
        if (def) {
          selectedUnits.push({ type: key, quantity: qty, def });
        }
      }
    }

    // Check if we have transports with cargo selected (for amphibious assault)
    const selectedShipsWithCargo = [];
    if (selectedShipIds.length > 0 && from.isWater) {
      const seaUnits = this.gameState.getUnitsAt(fromTerritory.name) || [];
      for (const shipId of selectedShipIds) {
        const ship = seaUnits.find(u => u.id === shipId);
        if (ship && ship.cargo && ship.cargo.length > 0) {
          selectedShipsWithCargo.push(ship);
        }
      }
    }

    // If no units selected, show adjacent territories as preview.
    // A land-only stack must not preview a sea zone as a combat-move attack.
    if (selectedUnits.length === 0 && selectedShipIds.length === 0 && selectedCargoUnits.length === 0) {
      const movable = this._getMovableUnits(fromTerritory, player);
      const previewPick = {};
      for (const unit of movable) {
        const key = moveUnitKey(unit);
        if (!key) continue;
        previewPick[key] = (previewPick[key] || 0) + (Number(unit.quantity) || 0);
      }
      const preview = moveSelectionProfile(previewPick, this.unitDefs || {});
      for (const connName of from.connections || []) {
        const conn = this.territories[connName];
        if (!conn) continue;
        if (isCombatMove && conn.isWater && preview.landOnly) continue;
        if (isCombatMove && conn.isWater && !preview.airInclusive && !preview.sea) continue;
        // For sea zones, check for enemy units; for land, check ownership
        let isEnemy = false;
        if (conn.isWater) {
          isEnemy = seaZoneHasEnemyForAirAttack(this.gameState, connName, player.id);
          if (isCombatMove && !isEnemy && !preview.sea) continue;
        } else {
          const owner = this.gameState.getOwner(connName);
          isEnemy = owner && owner !== player.id && !this.gameState.areAllies(player.id, owner);
        }
        if (isCombatMove || !isEnemy) {
          destinations.set(connName, { name: connName, isEnemy, isWater: conn.isWater, distance: 1 });
        }
      }
      return Array.from(destinations.values());
    }

    // Calculate reachable destinations based on unit types
    const landUnits = selectedUnits.filter(u => u.def.isLand);
    const airUnits = selectedUnits.filter(u => u.def.isAir);
    const seaUnits = selectedUnits.filter(u => u.def.isSea);

    // Land units - use land reachability + adjacent sea zones with transports
    if (landUnits.length > 0 && !from.isWater) {
      // Use minimum movement of all land units (they move together)
      const minMovement = Math.min(...landUnits.map(u => u.def.movement || 1));
      const reachable = this.gameState.getReachableTerritoriesForLand(
        fromTerritory.name, minMovement, player.id, isCombatMove
      );
      for (const [terrName, info] of reachable) {
        const conn = this.territories[terrName];
        if (!conn) continue;
        const owner = this.gameState.getOwner(terrName);
        const isEnemy = owner && owner !== player.id && !this.gameState.areAllies(player.id, owner);
        // Only allow enemy territories during combat move
        if (isCombatMove || !isEnemy) {
          destinations.set(terrName, { name: terrName, isEnemy, isWater: false, distance: info.distance });
        }
      }

      // Also add adjacent sea zones with friendly transports (for loading)
      // For units with movement > 1 (like armor), check sea zones adjacent to:
      // 1. Starting territory
      // 2. Any territory reachable within (movement - 1) steps
      const territoriesForTransportCheck = new Set([fromTerritory.name]);

      // Add territories reachable within (minMovement - 1) steps for multi-movement units
      if (minMovement > 1) {
        const intermediateReachable = this.gameState.getReachableTerritoriesForLand(
          fromTerritory.name, minMovement - 1, player.id, false // non-combat to allow passing through friendly
        );
        for (const [terrName] of intermediateReachable) {
          territoriesForTransportCheck.add(terrName);
        }
      }

      // Check sea zones adjacent to all these territories
      for (const terrName of territoriesForTransportCheck) {
        const terr = this.territories[terrName];
        if (!terr) continue;

        for (const connName of terr.connections || []) {
          const conn = this.territories[connName];
          if (!conn?.isWater) continue;
          // Check if there's a friendly transport in this sea zone
          const seaUnits = this.gameState.getUnitsAt(connName) || [];
          const hasTransport = seaUnits.some(u => u.type === 'transport' && u.owner === player.id);
          if (hasTransport && !destinations.has(connName)) {
            // A hostile sea is not a land-unit attack (9.21.26.01). A friendly
            // transport with room is a load, including during combat move.
            const hostileSea = seaUnits.some(u => (
              u.owner !== player.id
              && !this.gameState.areAllies(player.id, u.owner)
              && (u.quantity || 0) > 0
            ));
            if (hostileSea) continue;
            // Calculate distance: steps to reach terrName + 1 for loading
            const distToTerr = reachable.get(terrName)?.distance || 0;
            const totalDist = terrName === fromTerritory.name ? 1 : distToTerr + 1;
            destinations.set(connName, { name: connName, isEnemy: false, isWater: true, distance: totalDist, isTransportLoad: true });
          }
        }
      }
    }

    // Air units - use air reachability
    if (airUnits.length > 0) {
      // Use minimum movement of all air units
      // Long Range Aircraft tech: +2 movement for fighters and bombers
      const hasLongRange = this.gameState.hasTech(player.id, 'longRangeAircraft');
      const minMovement = Math.min(...airUnits.map(u => {
        const baseMove = u.def.movement || 4;
        return hasLongRange ? baseMove + 2 : baseMove;
      }));
      const reachable = this.gameState.getReachableTerritoriesForAir(
        fromTerritory.name, minMovement, player.id, isCombatMove
      );
      for (const [terrName, info] of reachable) {
        const conn = this.territories[terrName];
        if (!conn) continue;
        // For sea zones, check for enemy units; for land, check ownership
        let isEnemy = false;
        if (conn.isWater) {
          // Sea zone attack only when air is in the selection and enemies are there.
          if (!airUnits.length) continue;
          isEnemy = seaZoneHasEnemyForAirAttack(this.gameState, terrName, player.id);
          if (isCombatMove && !isEnemy) continue;
        } else {
          const owner = this.gameState.getOwner(terrName);
          isEnemy = owner && owner !== player.id && !this.gameState.areAllies(player.id, owner);
        }
        if (isCombatMove) {
          const remaining = minMovement - (info.distance || 0);
          if (!conn.isWater && !airCombatMoveMayOccupy(this.gameState, terrName, player.id)) continue;
          if (!hasLegalAirLandingFrom(
            this.gameState, terrName, remaining, airUnits[0].type, this.unitDefs, player.id,
          )) continue;
        } else if (!conn.isWater && !wasFriendlyAtTurnStart(this.gameState, terrName, player.id)) {
          continue;
        }
        // Only allow enemy territories during combat move
        if (!destinations.has(terrName) && (isCombatMove || !isEnemy)) {
          destinations.set(terrName, { name: terrName, isEnemy, isWater: conn.isWater, distance: info.distance });
        }
      }
    }

    // Sea units - use sea reachability
    if (seaUnits.length > 0 && from.isWater) {
      // Use minimum movement of all sea units
      const minMovement = Math.min(...seaUnits.map(u => u.def.movement || 2));
      const reachable = this.gameState.getReachableTerritoriesForSea(
        fromTerritory.name, minMovement, player.id, isCombatMove
      );
      for (const [terrName, info] of reachable) {
        const conn = this.territories[terrName];
        if (!conn) continue;
        // Sea zones: check for enemy naval units (sea zones don't have ownership)
        const seaUnits = this.gameState.getUnitsAt(terrName) || [];
        const isEnemy = seaUnits.some(u => u.owner !== player.id && !this.gameState.areAllies(player.id, u.owner));
        // Only allow enemy sea zones during combat move
        if (!destinations.has(terrName) && (isCombatMove || !isEnemy)) {
          destinations.set(terrName, { name: terrName, isEnemy, isWater: true, distance: info.distance });
        }
      }
    }

    // Ships selected by ID (transports, carriers, etc.) - calculate sea zone destinations
    if (selectedShipIds.length > 0 && from.isWater) {
      const allSeaUnits = this.gameState.getUnitsAt(fromTerritory.name) || [];
      const selectedShips = selectedShipIds
        .map(id => allSeaUnits.find(u => u.id === id))
        .filter(Boolean);

      if (selectedShips.length > 0) {
        // Get minimum movement of all selected ships
        const minMovement = Math.min(...selectedShips.map(ship => {
          const def = this.unitDefs?.[ship.type];
          return def?.movement || 2;
        }));

        const reachable = this.gameState.getReachableTerritoriesForSea(
          fromTerritory.name, minMovement, player.id, isCombatMove
        );

        for (const [terrName, info] of reachable) {
          const conn = this.territories[terrName];
          if (!conn) continue;
          // Sea zones: check for enemy naval units
          const zoneUnits = this.gameState.getUnitsAt(terrName) || [];
          const isEnemy = zoneUnits.some(u => u.owner !== player.id && !this.gameState.areAllies(player.id, u.owner));
          // Only allow enemy sea zones during combat move
          if (!destinations.has(terrName) && (isCombatMove || !isEnemy)) {
            destinations.set(terrName, { name: terrName, isEnemy, isWater: true, distance: info.distance });
          }
        }
      }
    }

    // Transports with cargo - add adjacent coastal territories for amphibious assault/unloading
    if (selectedShipsWithCargo.length > 0 && from.isWater) {
      for (const connName of from.connections || []) {
        const conn = this.territories[connName];
        if (!conn || conn.isWater) continue; // Only coastal (land) territories
        const owner = this.gameState.getOwner(connName);
        const isEnemy = owner && owner !== player.id && !this.gameState.areAllies(player.id, owner);
        // During combat move, can unload to attack enemy; during non-combat, only friendly
        if (isCombatMove || !isEnemy) {
          destinations.set(connName, {
            name: connName,
            isEnemy,
            isWater: false,
            distance: 1,
            isAmphibious: true
          });
        }
      }
    }

    // Cargo units selected directly for amphibious assault - add adjacent coastal territories
    if (selectedCargoUnits.length > 0 && from.isWater) {
      for (const connName of from.connections || []) {
        const conn = this.territories[connName];
        if (!conn || conn.isWater) continue; // Only coastal (land) territories
        const owner = this.gameState.getOwner(connName);
        const isEnemy = owner && owner !== player.id && !this.gameState.areAllies(player.id, owner);
        // During combat move, can unload to attack enemy; during non-combat, only friendly
        if (isCombatMove || !isEnemy) {
          destinations.set(connName, {
            name: connName,
            isEnemy,
            isWater: false,
            distance: 1,
            isAmphibious: true
          });
        }
      }
    }

    // Sort by distance, then by name
    return Array.from(destinations.values())
      .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));
  }

  _renderInlineMovement(player, turnPhase) {
    const isCombatMove = turnPhase === TURN_PHASES.COMBAT_MOVE;
    const movableUnits = this._getMovableUnits(this.selectedTerritory, player);
    const totalSelected = Object.values(this.moveSelectedUnits).reduce((sum, q) => sum + q, 0);
    const destinations = this._phoneMoveDests(this.selectedTerritory, player, isCombatMove);

    // Separate units into categories
    const regularUnits = movableUnits.filter(u => !u.isCargo && !u.isCarrierAircraft);
    const cargoUnitsForAssault = movableUnits.filter(u => u.isCargo);
    const carrierAircraftUnits = movableUnits.filter(u => u.isCarrierAircraft);

    // Categorize regular units
    const landUnits = regularUnits.filter(u => {
      const def = this.unitDefs?.[u.type];
      return def?.isLand;
    });
    const navalUnits = regularUnits.filter(u => {
      const def = this.unitDefs?.[u.type];
      return def?.isSea || u.isIndividual; // Individual ships (transports/carriers with cargo)
    });
    // Air units include both standalone air units AND aircraft on carriers
    const airUnits = [
      ...regularUnits.filter(u => {
        const def = this.unitDefs?.[u.type];
        return def?.isAir;
      }),
      ...carrierAircraftUnits
    ];

    // Initialize move tab if not set
    if (!this.moveUnitTab) this.moveUnitTab = 'land';

    // Determine which tabs have units
    const hasLand = landUnits.length > 0;
    const hasNaval = navalUnits.length > 0;
    const hasAir = airUnits.length > 0;
    const hasCargo = cargoUnitsForAssault.length > 0;

    // Auto-select first available tab if current is empty
    if (this.moveUnitTab === 'land' && !hasLand) {
      this.moveUnitTab = hasNaval ? 'naval' : (hasAir ? 'air' : 'cargo');
    }

    const selectedSummary = formatPhoneMoveSelectionSummary(this.moveSelectedUnits);
    let html = `
      <div class="pp-inline-movement">
        <div class="pp-move-from">
          <span class="pp-move-label">From:</span>
          <span class="pp-move-territory">${this.selectedTerritory.name}</span>
        </div>
        <div class="pp-move-selected-summary" aria-live="polite">
          ${selectedSummary
            ? `Selected: ${selectedSummary}`
            : 'Selected: none — tap a type, then Max'}
        </div>

        <div class="pp-move-category-tabs">
          ${hasLand ? `<button class="pp-move-cat-tab ${this.moveUnitTab === 'land' ? 'active' : ''}" data-action="move-tab" data-tab="land">🏃 Land (${landUnits.reduce((s, u) => s + u.quantity, 0)})</button>` : ''}
          ${hasNaval ? `<button class="pp-move-cat-tab ${this.moveUnitTab === 'naval' ? 'active' : ''}" data-action="move-tab" data-tab="naval">⚓ Naval (${navalUnits.reduce((s, u) => s + u.quantity, 0)})</button>` : ''}
          ${hasAir ? `<button class="pp-move-cat-tab ${this.moveUnitTab === 'air' ? 'active' : ''}" data-action="move-tab" data-tab="air">✈ Air (${airUnits.reduce((s, u) => s + u.quantity, 0)})</button>` : ''}
          ${hasCargo ? `<button class="pp-move-cat-tab ${this.moveUnitTab === 'cargo' ? 'active' : ''}" data-action="move-tab" data-tab="cargo">🚶 Land (${cargoUnitsForAssault.reduce((s, u) => s + u.quantity, 0)})</button>` : ''}
        </div>

        <div class="pp-move-units">`;

    // Get units for current tab
    let currentUnits = [];
    if (this.moveUnitTab === 'land') currentUnits = landUnits;
    else if (this.moveUnitTab === 'naval') currentUnits = navalUnits;
    else if (this.moveUnitTab === 'air') currentUnits = airUnits;
    else if (this.moveUnitTab === 'cargo') currentUnits = cargoUnitsForAssault;

    // Show units for selected category
    for (const unit of currentUnits) {
      const unitKey = moveUnitKey(unit);
      const selected = this.moveSelectedUnits[unitKey] || 0;
      const imageSrc = getUnitIconPath(unit.type, player.id);
      const displayName = unit.displayName || unit.type;

      // Get unit stats for hover tooltip (not inline display)
      const unitDef = this.unitDefs?.[unit.type];
      let statsTooltip = '';
      if (unitDef) {
        const hasLongRange = unitDef.isAir && this.gameState?.hasTech(player.id, 'longRangeAircraft');
        const hasJets = unit.type === 'fighter' && this.gameState?.hasTech(player.id, 'jets');
        const hasSuperSubs = unit.type === 'submarine' && this.gameState?.hasTech(player.id, 'superSubs');
        const attack = (unitDef.attack || 0) + (hasJets ? 1 : 0) + (hasSuperSubs ? 1 : 0);
        const defense = (unitDef.defense || 0) + (hasJets ? 1 : 0);
        const movement = (unitDef.movement || 1) + (hasLongRange ? 2 : 0);
        const cost = unitDef.cost || 0;
        statsTooltip = `${unit.type.charAt(0).toUpperCase() + unit.type.slice(1)}\nAttack: ${attack} | Defense: ${defense}\nMovement: ${movement} | Cost: ${cost} IPCs`;
      }

      const rowClass = unit.isCargo ? 'cargo-unit' : (unit.isIndividual ? 'individual-ship' : '');

      html += `
        <div class="pp-move-unit-row ${rowClass}" title="${statsTooltip}">
          <div class="pp-move-unit-info">
            ${imageSrc ? `<img src="${imageSrc}" class="pp-move-icon" alt="${unit.type}">` : ''}
            <span class="pp-move-name">${displayName}</span>
            ${!unit.isIndividual ? `<span class="pp-move-avail">(${unit.quantity})</span>` : ''}
          </div>
          <div class="pp-move-controls">
            <button class="pp-qty-btn" data-action="move-unit" data-unit="${unitKey}" data-delta="-1" ${selected <= 0 ? 'disabled' : ''}>−</button>
            <span class="pp-move-qty">${selected}</span>
            <button class="pp-qty-btn" data-action="move-unit" data-unit="${unitKey}" data-delta="1" ${selected >= unit.quantity ? 'disabled' : ''}>+</button>
            <button class="pp-qty-btn max-btn" data-action="move-all" data-unit="${unitKey}" data-qty="${unit.quantity}" ${selected >= unit.quantity ? 'disabled' : ''}>All</button>
          </div>
        </div>`;
    }

    html += `</div>`;

    // Select All / Clear buttons
    const totalMovable = movableUnits.reduce((sum, u) => sum + u.quantity, 0);
    html += `
      <div class="pp-move-select-all">
        <button class="pp-move-btn secondary" data-action="move-select-all" ${totalSelected >= totalMovable ? 'disabled' : ''}>Select All</button>
        ${totalSelected > 0 ? `<button class="pp-move-btn secondary" data-action="move-clear">Clear</button>` : ''}
      </div>`;

    // Destination selection - use dropdown
    if (totalSelected > 0) {
      html += `
        <div class="pp-move-destinations">
          <span class="pp-move-label">Move to:</span>
          <select class="pp-dest-dropdown" data-action="select-dest-dropdown">
            <option value="">-- Select destination or click map --</option>`;

      for (const dest of destinations) {
        const isSelected = this.movePendingDest === dest.name;
        const distLabel = dest.distance > 1 ? ` (${dest.distance} spaces)` : '';
        html += `<option value="${dest.name}" ${isSelected ? 'selected' : ''}>${dest.name}${dest.isEnemy ? ' ⚔ Attack' : ''}${distLabel}</option>`;
      }

      html += `</select>
        </div>`;

      // Show selected destination and confirm button
      if (this.movePendingDest) {
        const destInfo = destinations.find(d => d.name === this.movePendingDest);
        const isAttack = destInfo?.isEnemy;

        // Check for air unit landing warning during combat move
        let airLandingWarning = '';
        if (isCombatMove && isAttack) {
          // Check if any selected air units would have no landing options
          const selectedAirUnits = [];
          for (const [unitKey, qty] of Object.entries(this.moveSelectedUnits)) {
            if (qty <= 0) continue;
            const unit = regularUnits.find(u => (u.isIndividual ? `ship:${u.id}` : u.type) === unitKey);
            if (unit && this.unitDefs[unit.type]?.isAir) {
              selectedAirUnits.push(unit);
            }
          }

          if (selectedAirUnits.length > 0 && this.gameState) {
            // Calculate distance to destination
            const distanceToTarget = destInfo?.distance || 1;
            const hasLongRange = this.gameState.hasTech(player.id, 'longRangeAircraft');

            for (const airUnit of selectedAirUnits) {
              const unitDef = this.unitDefs[airUnit.type];
              if (!unitDef) continue;

              // Calculate remaining movement after reaching destination
              const baseMovement = unitDef.movement || 4;
              const totalMovement = hasLongRange ? baseMovement + 2 : baseMovement;
              const remainingMovement = totalMovement - distanceToTarget;

              if (remainingMovement <= 0) {
                // No movement left - can only stay if destination was friendly at turn start
                const friendlyAtStart = this.gameState.friendlyTerritoriesAtTurnStart || new Set();
                if (!friendlyAtStart.has(this.movePendingDest)) {
                  airLandingWarning = `⚠️ Warning: ${airUnit.type} at max range - no valid landing, will crash!`;
                  break;
                }
              } else {
                // Check if there are any friendly territories within remaining movement
                const reachable = this.gameState.getReachableTerritoriesForAir(
                  this.movePendingDest, remainingMovement, player.id, false
                );
                const friendlyAtStart = this.gameState.friendlyTerritoriesAtTurnStart || new Set();
                let hasValidLanding = false;

                for (const [terrName] of reachable) {
                  if (friendlyAtStart.has(terrName)) {
                    hasValidLanding = true;
                    break;
                  }
                }

                if (!hasValidLanding) {
                  airLandingWarning = `⚠️ Warning: ${airUnit.type} may not have valid landing options!`;
                  break;
                }
              }
            }
          }
        }

        // Show destination info and warning - button is in bottom actions bar
        html += `
          <div class="pp-move-confirm-area">
            <div class="pp-move-dest-info ${isAttack ? 'attack' : ''}">
              ${isAttack ? '⚔ Attack: ' : 'Moving to: '}${this.movePendingDest}
            </div>
            ${airLandingWarning ? `<div class="pp-air-warning">${airLandingWarning}</div>` : ''}
          </div>`;
      } else {
        html += `<div class="pp-hint">Select destination above or click on the map</div>`;
      }
    }

    // Cancel button
    html += `
      <button class="pp-move-btn cancel" data-action="cancel-move">Cancel</button>
    </div>`;

    return html;
  }

  // Inline Air Landing UI - styled like buy/movement UI
  _renderInlineAirLanding(player) {
    const { airUnitsToLand, combatTerritory, isRetreating } = this.airLandingData;
    const currentUnit = airUnitsToLand[this.airLandingIndex];

    const merged = this._mergedAirLandingSelections();
    const remaining = remainingAirLandingsToAssign(airUnitsToLand, merged);
    const needAssign = airUnitsToLand.filter((u) => !Array.isArray(u.landingOptions) || u.landingOptions.length > 0).length;

    let html = `
      <div class="pp-inline-air-landing">
        <div class="pp-air-landing-header" style="border-left: 4px solid ${player.color}">
          <span class="pp-air-landing-icon">✈️</span>
          <span class="pp-air-landing-title">${isRetreating ? 'Retreat - ' : ''}Move Air Units To Landing Zone</span>
          <span class="pp-air-landing-counter${remaining === 0 ? ' remaining-done' : ''}">${remaining} / ${needAssign} UNITS REMAINING</span>
        </div>
        <div class="pp-air-landing-from">From: <strong>${combatTerritory}</strong></div>
        <div class="pp-air-landing-hint">Click unit to select, then click map to assign landing</div>

        <div class="pp-air-landing-grid">`;

    // Show all air units as cards (similar to buy UI)
    for (let i = 0; i < airUnitsToLand.length; i++) {
      const unit = airUnitsToLand[i];
      const unitKey = unit.id || `${unit.type}_${i}`;
      const selectedLanding = resolveLandingDestination(unit, i, merged);
      const isCurrent = i === this.airLandingIndex && !selectedLanding;
      const hasNoOptions = !unit.landingOptions || unit.landingOptions.length === 0;
      const imageSrc = getUnitIconPath(unit.type, player.id);
      const def = this.unitDefs?.[unit.type];

      html += `
        <div class="pp-air-landing-card ${isCurrent ? 'current' : ''} ${selectedLanding ? 'landed' : ''} ${hasNoOptions ? 'crashed' : ''}"
             data-action="select-air-unit" data-index="${i}">
          <div class="pp-air-card-icon">
            ${imageSrc ? `<img src="${imageSrc}" alt="${unit.type}">` : ''}
          </div>
          <div class="pp-air-card-name">${formatUnitName(unit.type)}</div>
          <div class="pp-air-card-stats">M${def?.movement || 0}</div>
          <div class="pp-air-card-status">
            ${hasNoOptions
              ? '<span class="status-crashed">CRASH</span>'
              : selectedLanding
                ? `<span class="status-landed">${selectedLanding}</span>`
                : isCurrent
                  ? '<span class="status-selecting">SELECT</span>'
                  : '<span class="status-pending">...</span>'}
          </div>
        </div>`;
    }

    html += `</div>`;

    // Current unit landing options (dropdown as backup)
    if (currentUnit && currentUnit.landingOptions?.length > 0 && !resolveLandingDestination(currentUnit, this.airLandingIndex, merged)) {
      html += `
        <div class="pp-air-landing-dest">
          <span class="pp-air-landing-label">Land at:</span>
          <select class="pp-air-landing-dropdown" data-action="select-air-landing">
            <option value="">-- Click map or select --</option>
            ${currentUnit.landingOptions.map(opt => `
              <option value="${opt.territory}">${opt.territory} (${opt.distance} moves)</option>
            `).join('')}
          </select>
        </div>`;
    }

    // Check if any selections have been made (for undo button)
    const hasSelections = remaining < needAssign || Object.keys(this.airLandingSelections).length > 0;

    // Action buttons - Confirm button is in bottom actions bar
    if (hasSelections) {
      html += `
        <div class="pp-air-landing-actions">
          <button class="pp-action-btn secondary" data-action="undo-air-landing">
            ↩ Undo Selections
          </button>
        </div>`;
    }
    html += `</div>`;

    return html;
  }

  // Inline Mobilize UI - place purchased units (like buy phase with +/- controls)
  _renderInlineMobilize(player) {
    const pending = this.gameState.getPendingPurchases?.() || [];
    const totalPending = pending.reduce((sum, p) => sum + p.quantity, 0);

    // Get valid placement locations
    const factoriesAtStart = this.gameState.factoriesAtTurnStart || new Set();
    const currentFactories = this._getFactoryTerritories(player.id);
    const validFactories = factoriesAtStart.size > 0
      ? Array.from(factoriesAtStart)
      : currentFactories;
    const validSeaZones = this._getValidNavalPlacementZones(player.id);

    // Categorize pending units
    const landUnits = pending.filter(p => {
      const def = this.unitDefs?.[p.type];
      return def && (def.isLand || def.isAir) && p.quantity > 0;
    });
    const airUnits = pending.filter((p) => {
      const def = this.unitDefs?.[p.type];
      return def?.isAir && p.quantity > 0;
    });
    const navalUnits = pending.filter(p => {
      const def = this.unitDefs?.[p.type];
      return def?.isSea && p.quantity > 0;
    });
    const buildingUnits = pending.filter(p => {
      const def = this.unitDefs?.[p.type];
      return def?.isBuilding && p.quantity > 0;
    });

    let html = `<div class="pp-inline-mobilize">`;

    if (totalPending === 0) {
      html += `
        <div class="pp-mobilize-done">
          <div class="pp-mobilize-msg">✓ All units deployed!</div>
        </div>
      </div>`;
      return html;
    }

    // Check if a valid territory is selected
    const isValidPlacement = this._isValidMobilizeLocation(this.selectedTerritory, player);
    const isWater = this.selectedTerritory?.isWater;
    const isFactoryTerritory = !isWater && this.selectedTerritory && validFactories.includes(this.selectedTerritory.name);
    const isOwnedLand = !isWater && this.selectedTerritory && this.gameState.getOwner(this.selectedTerritory.name) === player.id;

    // Show selected territory or hint to select
    if (isValidPlacement && this.selectedTerritory) {
      html += `
        <div class="pp-mobilize-selected">
          <span class="pp-mob-sel-label">Deploying to:</span>
          <span class="pp-mob-sel-name">${this.selectedTerritory.name}</span>
        </div>`;

      // Show factory production limit for factory territories
      if (isFactoryTerritory) {
        const capital = this.gameState.playerState?.[player.id]?.capitalTerritory;
        const isCapitalFactory = this.selectedTerritory.name === capital;
        const productionLimit = factoryProductionLimit(this.selectedTerritory.name, capital);
        const unitsPlacedHere = factoryProductionUsed(
          this.gameState.mobilizationHistory,
          this.selectedTerritory.name,
          player.id,
        );
        const remaining = productionLimit - unitsPlacedHere;

        html += `
          <div class="pp-factory-limit">
            <span class="pp-factory-type">${isCapitalFactory ? '★ Capital Factory' : 'Factory'}</span>
            <span class="pp-factory-capacity ${remaining <= 0 ? 'full' : ''}">${unitsPlacedHere}/${productionLimit} units</span>
          </div>`;
      }
    } else {
      html += `<div class="pp-hint">Click a factory or a factory-adjacent sea zone to deploy units</div>`;
    }

    const seaFactories = (isWater && isValidPlacement)
      ? this._seaMobilizeFactories(this.selectedTerritory, player)
      : [];
    const needsFactoryPick = this._mobilizeNeedsFactoryPick(this.selectedTerritory, player);
    if (seaFactories.length > 1) {
      html += `<div class="pp-factory-pick"><span class="pp-mob-sel-label">Which factory produces into ${this.selectedTerritory.name}?</span>`;
      for (const factoryName of seaFactories) {
        const on = this.mobilizeSourceFactory === factoryName ? ' active' : '';
        html += `<button type="button" class="pp-qty-btn${on}" data-action="pick-mobilize-factory" data-factory="${factoryName}">${factoryName}</button>`;
      }
      html += `</div>`;
    }

    // Get units that can be placed at the current location
    let placeableUnits = [];
    if (isValidPlacement && this.selectedTerritory) {
      if (isWater) {
        const airOnCarrier = airUnits.filter((p) => canPlaceAirOnCarrierInSeaZone(
          this.gameState,
          this.selectedTerritory.name,
          p.type,
          player.id,
          this.unitDefs,
          { requireFactoryAdjacent: true },
        ));
        placeableUnits = [...navalUnits, ...airOnCarrier];
      } else if (isOwnedLand && !isFactoryTerritory) {
        placeableUnits = buildingUnits;
      } else if (isFactoryTerritory) {
        placeableUnits = landUnits;
      }
    }

    // Show unit list with +/- controls (like buy phase)
    html += `<div class="pp-unit-list">`;

    // Land units section
    if (landUnits.length > 0) {
      html += `<div class="pp-unit-category-label">Land/Air</div>`;
      for (const unit of landUnits) {
        const imageSrc = getUnitIconPath(unit.type, player.id);
        const def = this.unitDefs?.[unit.type];
        const onFactory = isFactoryTerritory && isValidPlacement;
        const onCarrier = isWater && isValidPlacement && def?.isAir
          && canPlaceAirOnCarrierInSeaZone(
            this.gameState,
            this.selectedTerritory.name,
            unit.type,
            player.id,
            this.unitDefs,
            { requireFactoryAdjacent: true },
          );
        const canPlace = (onFactory || onCarrier) && !needsFactoryPick;
        html += `
          <div class="pp-buy-row ${canPlace ? 'can-place' : ''}">
            <div class="pp-buy-info">
              ${imageSrc ? `<img src="${imageSrc}" class="pp-buy-icon" alt="${unit.type}">` : ''}
              <span class="pp-buy-name">${formatUnitName(unit.type)}</span>
              <span class="pp-buy-qty-label">×${unit.quantity}</span>
            </div>
            <div class="pp-buy-controls">
              <button class="pp-qty-btn" data-action="mobilize-unit" data-unit="${unit.type}" ${!canPlace ? 'disabled' : ''}>+</button>
              <button class="pp-qty-btn max-btn" data-action="mobilize-all" data-unit="${unit.type}" ${!canPlace ? 'disabled' : ''}>All</button>
            </div>
          </div>`;
      }
    }

    // Naval units section
    if (navalUnits.length > 0) {
      html += `<div class="pp-unit-category-label">Naval</div>`;
      for (const unit of navalUnits) {
        const imageSrc = getUnitIconPath(unit.type, player.id);
        const canPlace = isWater && isValidPlacement && !needsFactoryPick;
        html += `
          <div class="pp-buy-row ${canPlace ? 'can-place' : ''}">
            <div class="pp-buy-info">
              ${imageSrc ? `<img src="${imageSrc}" class="pp-buy-icon" alt="${unit.type}">` : ''}
              <span class="pp-buy-name">${formatUnitName(unit.type)}</span>
              <span class="pp-buy-qty-label">×${unit.quantity}</span>
            </div>
            <div class="pp-buy-controls">
              <button class="pp-qty-btn" data-action="mobilize-unit" data-unit="${unit.type}" ${!canPlace ? 'disabled' : ''}>+</button>
              <button class="pp-qty-btn max-btn" data-action="mobilize-all" data-unit="${unit.type}" ${!canPlace ? 'disabled' : ''}>All</button>
            </div>
          </div>`;
      }
    }

    // Building units section
    if (buildingUnits.length > 0) {
      html += `<div class="pp-unit-category-label">Buildings</div>`;
      for (const unit of buildingUnits) {
        const imageSrc = getUnitIconPath(unit.type, player.id);
        const canPlace = isOwnedLand && !isFactoryTerritory && isValidPlacement;
        html += `
          <div class="pp-buy-row ${canPlace ? 'can-place' : ''}">
            <div class="pp-buy-info">
              ${imageSrc ? `<img src="${imageSrc}" class="pp-buy-icon" alt="${unit.type}">` : ''}
              <span class="pp-buy-name">${formatUnitName(unit.type)}</span>
              <span class="pp-buy-qty-label">×${unit.quantity}</span>
            </div>
            <div class="pp-buy-controls">
              <button class="pp-qty-btn" data-action="mobilize-unit" data-unit="${unit.type}" ${!canPlace ? 'disabled' : ''}>+</button>
              <button class="pp-qty-btn max-btn" data-action="mobilize-all" data-unit="${unit.type}" ${!canPlace ? 'disabled' : ''}>All</button>
            </div>
          </div>`;
      }
    }

    html += `</div>`;

    // Remaining units indicator
    html += `<div class="pp-mobilize-remaining">${totalPending} unit${totalPending !== 1 ? 's' : ''} remaining</div>`;

    // Undo button (if there are any placements to undo)
    const canUndo = this.gameState.mobilizationHistory && this.gameState.mobilizationHistory.length > 0;
    if (canUndo) {
      html += `
        <div class="pp-mobilize-undo">
          <button class="pp-undo-btn" data-action="undo-mobilize">
            <span class="undo-icon">↩</span>
            <span class="undo-text">Undo Last</span>
          </button>
        </div>`;
    }

    // Territory type hint
    if (this.selectedTerritory && !isValidPlacement) {
      html += `<div class="pp-hint">Click a territory above or on the map to place units</div>`;
    }

    html += `</div>`;
    return html;
  }

  // Get valid sea zones for naval placement (adjacent to factory territories)
  _getValidNavalPlacementZones(playerId) {
    const validZones = [];
    const factoryTerritories = this._getFactoryTerritories(playerId);

    for (const terrName of factoryTerritories) {
      const t = this.territories?.[terrName];
      if (!t) continue;

      for (const conn of t.connections || []) {
        const ct = this.territories?.[conn];
        if (ct?.isWater && !validZones.includes(conn)) {
          validZones.push(conn);
        }
      }
    }

    return validZones;
  }

  // Check if territory is valid for mobilization placement
  _isValidMobilizeLocation(territory, player) {
    if (!territory || !player) return false;

    const pending = this.gameState.getPendingPurchases?.() || [];
    if (pending.length === 0) return false;

    // Sea zones: factory-adjacent, with pending ships or air that can load
    if (territory.isWater) {
      const validSeaZones = this._getValidNavalPlacementZones(player.id);
      if (!validSeaZones.includes(territory.name)) return false;
      const hasNaval = pending.some((p) => {
        const def = this.unitDefs?.[p.type];
        return def?.isSea && p.quantity > 0;
      });
      if (hasNaval) return true;
      return pendingAirCanLoadInSeaZone(
        this.gameState,
        territory.name,
        pending,
        player.id,
        this.unitDefs,
      );
    }

    // Land territories: check if owned by player
    const owner = this.gameState.getOwner(territory.name);
    if (owner !== player.id) return false;

    // Check if it's a factory territory (for land/air units)
    const factoriesAtStart = this.gameState.factoriesAtTurnStart || new Set();
    const currentFactories = this._getFactoryTerritories(player.id);
    const validFactories = factoriesAtStart.size > 0
      ? Array.from(factoriesAtStart)
      : currentFactories;

    if (validFactories.includes(territory.name)) {
      return true; // Can place land/air units
    }

    // Non-factory territory: can only place factories (buildings)
    const buildingUnits = pending.filter(p => {
      const def = this.unitDefs?.[p.type];
      return def?.isBuilding && p.quantity > 0;
    });
    if (buildingUnits.length > 0) {
      // Check if territory doesn't already have a factory
      const units = this.gameState.getUnitsAt(territory.name);
      const hasFactory = units.some(u => u.type === 'factory');
      return !hasFactory;
    }

    return false;
  }

  _dispatchAction(btn) {
        const action = btn.dataset.action;
        const lockAction = btn.lockAction || null;
        const territory = btn.dataset.territory;
        const setIndex = btn.dataset.set;
        if ((action === 'undo-placement' || action === 'undo-capital')
          && Date.now() < (this._ignoreUndoUntil || 0)) {
          return;
        }
        if ((action === 'undo-placement' || action === 'undo-capital')
          && !shouldApplyUndoAction({ action, lockAction })) {
          return;
        }
        if (action === 'undo-placement' && queuedCount(this.placementQueue || {}) > 0) {
          const lastType = this._lastQueueUnitType
            || Object.keys(this.placementQueue).find(k => Number(this.placementQueue[k]) > 0);
          if (lastType) {
            this.placementQueue = applyPlaceQueueDelta({
              queue: this.placementQueue || {},
              unitType: lastType,
              delta: -1,
              available: 999,
              slotsRemaining: 999,
            });
            this._scheduleRender();
            return;
          }
        }

        if (action === 'finish-placement') {
          if (Date.now() < (this._lastQueueGestureAt || 0) + PANEL_QUEUE_GUARD_MS) {
            return;
          }
          if (!shouldPassPlacementTurn({ action, lockAction })) {
            return;
          }
          const { ux } = this._getInitialPlacementUX(this.gameState.currentPlayer);
          if (this.onAction) {
            this.onAction('finish-placement', { allowNavalSkip: !!ux.canSkipNaval });
          }
          return;
        }

        if (action === 'toggle-cards') {
          this.cardsCollapsed = !this.cardsCollapsed;
          this._scheduleRender();
          return;
        }

        if (action === 'copy-debug') {
          const debugInfo = this.getDebugInfo();
          navigator.clipboard.writeText(debugInfo).then(() => {
            btn.textContent = '✓ Copied!';
            setTimeout(() => {
              btn.textContent = '📋 Copy Debug Info';
            }, 2000);
          }).catch(err => {
            console.error('Failed to copy:', err);
            btn.textContent = '❌ Failed';
          });
          return;
        }

        if (action === 'trade-set' && setIndex !== undefined) {
          const cardSet = this.validCardSets[parseInt(setIndex)];
          if (this.onAction && cardSet) {
            this.onAction('trade-set', { cardSet });
          }
          return;
        }

        // Handle trade-risk-cards action (trade cards for IPCs during purchase phase)
        if (action === 'trade-risk-cards') {
          if (this.onAction) {
            this.onAction('trade-risk-cards', {});
          }
          return;
        }

        // Handle buy-unit action
        if (action === 'buy-unit') {
          this.selectedUnitType = btn.dataset.unit || this.selectedUnitType;
          const unitType = btn.dataset.unit;
          const delta = parseInt(btn.dataset.delta, 10);
          if (this.onAction && unitType) {
            this.onAction('buy-unit', { unitType, delta });
          }
          return;
        }

        // Handle buy-max action
        if (action === 'buy-max') {
          const unitType = btn.dataset.unit;
          if (this.onAction && unitType) {
            this.onAction('buy-max', { unitType });
          }
          return;
        }

        if (action === 'phone-toggle-tray') {
          this.trayExpanded = !this.trayExpanded;
          if (!this.trayExpanded) this.phoneDetentTab = 'actions';
          this._scheduleRender();
          return;
        }

        if (action === 'phone-detent-tab') {
          if (Date.now() < (this._lastQueueGestureAt || 0) + PANEL_QUEUE_GUARD_MS) {
            return;
          }
          const tab = btn.dataset.tab || 'actions';
          this.phoneDetentTab = tab;
          this.trayExpanded = true;
          this._scheduleRender();
          return;
        }

        if (action === 'phone-select-unit') {
          if (this._phonePairFrozenAt && Date.now() - this._phonePairFrozenAt < 400) {
            return;
          }
          this._selectPhonePairUnit(btn.dataset.unit);
          return;
        }

        if (action === 'phone-pair-max') {
          if (this._phonePairMaxAt && Date.now() - this._phonePairMaxAt < 400) {
            this._phonePairMaxAt = 0;
            return;
          }
          this._applyPhonePairMax(btn.dataset.unit);
          return;
        }

        if (action === 'confirm-mobilize') {
          if (this._phoneMobilizeCommittedAt && Date.now() - this._phoneMobilizeCommittedAt < 400) {
            this._phoneMobilizeCommittedAt = 0;
            return;
          }
          this._commitStagedMobilize();
          return;
        }

        // Handle place-unit action (legacy - single unit placement)
        if (action === 'place-unit') {
          const unitType = btn.dataset.unit;
          if (this.onAction && unitType && this.selectedTerritory) {
            this.onAction('place-unit', { unitType, territory: this.selectedTerritory.name });
          }
          return;
        }

        // Handle placement queue +/- delta — one row, ±1. Render after the
        // click so the same tap cannot retarget onto Done or another +.
        if (action === 'place-queue') {
          const incoming = btn.dataset.unit;
          const unitType = resolveQueueUnitType({
            lockedType: this._queueLockType,
            incomingType: incoming,
          });
          const queueEmpty = queuedCount(this.placementQueue || {}) === 0;
          if (!shouldAllowPlaceQueueTypeSwitch({
            incomingType: incoming,
            lastQueueUnitType: this._lastQueueUnitType,
            queueEmpty,
            committed: queueEmpty,
            currentGestureLockType: this._queueLockType,
          })) {
            return;
          }
          if (shouldIgnoreQueueRetarget({
            lockedType: this._queueLockType,
            incomingType: incoming,
            elapsedMs: Date.now() - (this._lastQueueGestureAt || 0),
            committed: queueEmpty,
            newGesture: !this._queueLockType,
          })) {
            return;
          }
          const delta = parseInt(btn.dataset.delta, 10);
          const unitsToPlace = this.gameState.getUnitsToPlace?.(this.gameState.currentPlayer?.id) || [];
          const available = quantityAvailableForType(unitsToPlace, unitType);
          const limit = this.gameState.getUnitsPerRoundLimit?.() || 6;
          const placedThisRound = this.gameState.unitsPlacedThisRound || 0;
          this.placementQueue = applyPlaceQueueDelta({
            queue: this.placementQueue || {},
            unitType,
            delta,
            available,
            slotsRemaining: limit - placedThisRound,
          });
          this._lastQueueUnitType = unitType;
          this._lastQueueGestureAt = Date.now();
          this._queueLockType = null;
          this._scheduleRender();
          return;
        }

        // Max fills THIS row only, up to remaining slots this round.
        if (action === 'place-queue-max') {
          const incoming = btn.dataset.unit;
          const unitType = resolveQueueUnitType({
            lockedType: this._queueLockType,
            incomingType: incoming,
          });
          const queueEmpty = queuedCount(this.placementQueue || {}) === 0;
          if (!shouldAllowPlaceQueueTypeSwitch({
            incomingType: incoming,
            lastQueueUnitType: this._lastQueueUnitType,
            queueEmpty,
            committed: queueEmpty,
            currentGestureLockType: this._queueLockType,
          })) {
            return;
          }
          if (shouldIgnoreQueueRetarget({
            lockedType: this._queueLockType,
            incomingType: incoming,
            elapsedMs: Date.now() - (this._lastQueueGestureAt || 0),
            committed: queueEmpty,
            newGesture: !this._queueLockType,
          })) {
            return;
          }
          const unitsToPlace = this.gameState.getUnitsToPlace?.(this.gameState.currentPlayer?.id) || [];
          const available = quantityAvailableForType(unitsToPlace, unitType);
          const limit = this.gameState.getUnitsPerRoundLimit?.() || 6;
          const placedThisRound = this.gameState.unitsPlacedThisRound || 0;
          this.placementQueue = applyPlaceQueueMax({
            queue: this.placementQueue || {},
            unitType,
            available,
            slotsRemaining: limit - placedThisRound,
          });
          this._lastQueueUnitType = unitType;
          this._lastQueueGestureAt = Date.now();
          this._queueLockType = null;
          this._scheduleRender();
          return;
        }

        // Deploy commits the queue onto the selected territory. Do not
        // clear selection or pass the turn. Batch so Deploy N places N
        // (a mid-loop re-render used to put Undo under the same tap).
        if (action === 'confirm-placement') {
          if (this._phoneDeployCommittedAt && Date.now() - this._phoneDeployCommittedAt < 400) {
            this._phoneDeployCommittedAt = 0;
            return;
          }
          this._commitStagedPlacement();
          return;
        }

        // Handle tech dice +/- delta
        if (action === 'tech-dice-delta') {
          const delta = parseInt(btn.dataset.delta, 10);
          const ipcs = this.gameState.getIPCs(this.gameState.currentPlayer.id);
          const maxDice = Math.floor(ipcs / 5);
          this.techDiceCount = Math.max(0, Math.min(maxDice, this.techDiceCount + delta));
          this._scheduleRender();
          return;
        }

        // Handle tech dice max
        if (action === 'tech-dice-max') {
          const ipcs = this.gameState.getIPCs(this.gameState.currentPlayer.id);
          this.techDiceCount = Math.floor(ipcs / 5);
          this._scheduleRender();
          return;
        }

        // Handle tech roll
        if (action === 'roll-tech') {
          const carried = this._carriedTechTokens(this.gameState?.currentPlayer);
          if (this.onAction && this._techAcquisition() !== 'buy'
            && (this.techDiceCount > 0 || carried > 0)) {
            this.onAction('roll-tech', { diceCount: this.techDiceCount, carried });
            this.techDiceCount = 0; // Reset after rolling
          }
          return;
        }

        // Handle rocket launch
        if (action === 'launch-rocket') {
          const from = btn.dataset.from;
          const target = btn.dataset.target;
          if (this.onAction && from && target) {
            this.onAction('launch-rocket', { from, target });
          }
          return;
        }

        // Handle confirm purchase
        if (action === 'confirm-purchase') {
          if (this.onAction) {
            this.onAction('next-phase', {});
          }
          return;
        }

        // Handle movement unit selection (+/-)
        if (action === 'move-unit') {
          const unitKey = btn.dataset.unit; // Can be "infantry", "ship:12345", or "cargo:12345:infantry"
          const delta = parseInt(btn.dataset.delta, 10);
          const current = this.moveSelectedUnits[unitKey] || 0;
          // Peek tiles stage from the phone-pair land; desktop rows use selectedTerritory.
          const from = (isMobileShell() && this._phoneDeployDest?.())
            || this.selectedTerritory;
          if (from && from !== this.selectedTerritory) this.selectedTerritory = from;
          const movable = this._getMovableUnits(from, this.gameState.currentPlayer);
          // Find max qty - match by key (type for regular, "ship:id" for individual, "cargoKey" for cargo)
          const unitEntry = movable.find(u => moveUnitKey(u) === unitKey);
          const maxQty = unitEntry?.quantity || 0;
          const newQty = Math.max(0, Math.min(maxQty, current + delta));
          this.moveSelectedUnits[unitKey] = newQty;
          if (newQty > 0) this.selectedUnitType = unitKey;
          this._scheduleRender();
          return;
        }

        // Handle move-all for a unit type
        if (action === 'move-all') {
          const unitKey = btn.dataset.unit;
          const qty = parseInt(btn.dataset.qty, 10);
          this.moveSelectedUnits[unitKey] = qty;
          this._scheduleRender();
          return;
        }

        // Handle move category tab switch
        if (action === 'move-tab') {
          const tab = btn.dataset.tab;
          if (tab) {
            this.moveUnitTab = tab;
            this._scheduleRender();
          }
          return;
        }

        // Handle select-all units for movement — every eligible stack, not
        // just the open tab. Combat move may empty the origin (A&A / Mexico).
        if (action === 'move-select-all') {
          const movable = this._getMovableUnits(this.selectedTerritory, this.gameState.currentPlayer);
          this.moveSelectedUnits = {
            ...this.moveSelectedUnits,
            ...maxMoveSelection(movable),
          };
          this._scheduleRender();
          return;
        }

        // Handle clear movement selection
        if (action === 'move-clear') {
          this.moveSelectedUnits = {};
          this.movePendingDest = null;
          this._scheduleRender();
          return;
        }

        // Handle destination selection
        if (action === 'select-dest') {
          const dest = btn.dataset.dest;
          this.movePendingDest = dest;
          this._scheduleRender();
          return;
        }

        // Handle confirm move
        if (action === 'confirm-move') {
          if (this.onAction && this.movePendingDest && this.selectedTerritory) {
            const units = [];
            const shipIds = [];
            const cargoUnloads = []; // Track cargo units to unload for amphibious assault

            // Separate regular units from individual ships and cargo units
            for (const [key, qty] of Object.entries(this.moveSelectedUnits)) {
              if (qty <= 0) continue;

              if (key.startsWith('ship:')) {
                // Individual ship with cargo - extract ID
                const shipId = key.replace('ship:', '');
                shipIds.push(shipId);
              } else if (key.startsWith('cargo:')) {
                // Cargo unit for amphibious assault - format: cargo:transportId:unitType
                const parts = key.split(':');
                if (parts.length >= 3) {
                  cargoUnloads.push({
                    transportId: parts[1],
                    unitType: parts[2],
                    quantity: qty
                  });
                }
              } else if (key.startsWith('aircraft:')) {
                units.push({ type: airSelectionType(key), quantity: qty });
              } else {
                // Regular unit type
                units.push({ type: key, quantity: qty });
              }
            }

            if (units.length > 0 || shipIds.length > 0 || cargoUnloads.length > 0) {
              // Check if this is an amphibious unload (from sea zone to land)
              const fromTerritory = this.territories?.[this.selectedTerritory.name];
              const toTerritory = this.territories?.[this.movePendingDest];
              const isAmphibiousUnload = fromTerritory?.isWater && !toTerritory?.isWater &&
                (shipIds.length > 0 || cargoUnloads.length > 0);

              this.onAction('execute-move', {
                from: this.selectedTerritory.name,
                to: this.movePendingDest,
                units,
                shipIds,
                cargoUnloads,
                isAmphibiousUnload
              });
              // Reset staged units and dest. Keep the from stack named
              // so the next wave can tap units → dest → Confirm again.
              this.moveSelectedUnits = {};
              this.movePendingDest = null;
              if (this.selectedTerritory?.name) {
                this._phoneDeployLandName = this.selectedTerritory.name;
              }
            }
          }
          return;
        }

        // Handle cancel move
        if (action === 'cancel-move') {
          this.moveSelectedUnits = {};
          this.movePendingDest = null;
          this._scheduleRender();
          return;
        }

        // Handle mobilize location selection
        if (action === 'select-mob-location') {
          const terrName = btn.dataset.territory;
          if (terrName && this.territories) {
            const terr = this.territories[terrName];
            if (terr) {
              this.selectedTerritory = terr;
              if (!isMobileShell()) this._phoneDeployLandName = terr.name;
              this._scheduleRender();
            }
          }
          return;
        }

        // Handle air landing unit selection
        if (action === 'select-air-unit') {
          const index = parseInt(btn.dataset.index, 10);
          if (!isNaN(index) && this.isAirLandingActive()) {
            this.airLandingIndex = index;
            this._scheduleRender();
          }
          return;
        }

        // Handle confirm air landing
        if (action === 'confirm-air-landing') {
          if (this.isAirLandingActive() && this._airLandingsRemaining() === 0) {
            this._commitNamedAirLandings();
          }
          return;
        }

        if (action === 'next-phase') {
          this.commitAirLandingsIfReady();
          const stillCombat = this.gameState?.turnPhase === TURN_PHASES.COMBAT
            && (this.gameState?.combatQueue?.length || 0) > 0;
          if (stillCombat) {
            this._scheduleRender();
            return;
          }
          if (this.onAction) this.onAction('next-phase', {});
          return;
        }

        // Handle undo air landing selections
        if (action === 'undo-air-landing') {
          if (this.isAirLandingActive()) {
            this.airLandingSelections = {};
            this.airLandingIndex = 0;
            this.gameState?.clearAirLandingSelections?.(
              this.airLandingData.combatTerritory,
            );
            this._scheduleRender();
          }
          return;
        }

        // Handle mobilize unit
        if (action === 'pick-mobilize-factory') {
          const factoryName = btn.dataset.factory;
          if (factoryName) {
            this.mobilizeSourceFactory = factoryName;
            this._scheduleRender();
          }
          return;
        }

        if (action === 'mobilize-unit') {
          const unitType = btn.dataset.unit;
          const player = this.gameState?.currentPlayer;
          if (this.onAction && unitType && this.selectedTerritory) {
            if (this._mobilizeNeedsFactoryPick(this.selectedTerritory, player)) return;
            this.onAction('mobilize-unit', {
              unitType,
              territory: this.selectedTerritory.name,
              sourceFactory: this._mobilizeSourceFactory(this.selectedTerritory, player),
            });
          }
          return;
        }

        // Handle mobilize all of a unit type
        if (action === 'mobilize-all') {
          const unitType = btn.dataset.unit;
          const player = this.gameState?.currentPlayer;
          if (this.onAction && unitType && this.selectedTerritory) {
            if (this._mobilizeNeedsFactoryPick(this.selectedTerritory, player)) return;
            this.onAction('mobilize-all', {
              unitType,
              territory: this.selectedTerritory.name,
              sourceFactory: this._mobilizeSourceFactory(this.selectedTerritory, player),
            });
          }
          return;
        }

        // Handle undo mobilize
        if (action === 'undo-mobilize') {
          if (this.onAction) {
            this.onAction('undo-mobilize', {});
          }
          return;
        }

        if (action === 'undo-purchase') {
          if (this.onAction) {
            this.onAction('undo-purchase', { unitType: btn.dataset.unit || null });
          }
          return;
        }

        if (action === 'undo-move') {
          if (this.onAction) {
            this.onAction('undo-move', { moveId: btn.dataset.moveId || null });
          }
          return;
        }

        if (action === 'undo-all-moves') {
          if (this.onAction) {
            this.onAction('undo-all-moves', {});
          }
          return;
        }

        if (action === 'pick-territory') {
          const name = (this.selectedTerritory && !this.selectedTerritory.isWater)
            ? this.selectedTerritory.name
            : (territory || '');
          if (this.onAction && name) this.onAction('pick-territory', { territory: name });
          return;
        }

        if (action === 'buy-tech') {
          const techId = btn.dataset.tech;
          if (this.onAction && techId) this.onAction('buy-tech', { techId });
          return;
        }

        if (action === 'place-capital') {
          const land = resolvePhoneCapitalCommitLand({
            dataTerritory: territory,
            peekedLandName: this._phoneCapitalLandName,
            selectedName: (this.selectedTerritory && !this.selectedTerritory.isWater)
              ? this.selectedTerritory.name
              : null,
            currentPlayerId: this.gameState?.currentPlayer?.id,
            getOwner: (name) => this.gameState?.getOwner?.(name),
          });
          if (this.onAction) this.onAction('place-capital', { territory: land });
          return;
        }

        if (this.onAction) {
          const unitType = btn.dataset.type;
          this.onAction(action, { territory, unitType });
        }
  }

  _bindEvents() {
    // Scroll log to bottom
    const logTab = this.contentEl.querySelector('.pp-log-entries');
    if (logTab) {
      logTab.scrollTop = logTab.scrollHeight;
    }

    // Log entry hover handlers for territory/movement highlighting
    this.contentEl.querySelectorAll('.pp-log-entry').forEach(entry => {
      const territories = entry.dataset.territories?.split(',').filter(Boolean) || [];
      const from = entry.dataset.from;
      const to = entry.dataset.to;
      const isCombat = entry.dataset.combat === 'true';

      if (territories.length > 0 || (from && to)) {
        entry.classList.add('hoverable');

        entry.addEventListener('mouseenter', () => {
          // Highlight territories
          if (territories.length > 0 && this.actionLog?.onHighlightTerritory) {
            this.actionLog.onHighlightTerritory(territories, true);
          }
          // Show movement arrow if we have from/to
          if (from && to && this.actionLog?.onHighlightMovement) {
            this.actionLog.onHighlightMovement(from, to, true, isCombat);
          }
        });

        entry.addEventListener('mouseleave', () => {
          // Clear highlights
          if (this.actionLog?.onHighlightTerritory) {
            this.actionLog.onHighlightTerritory(null, false);
          }
          if (this.actionLog?.onHighlightMovement) {
            this.actionLog.onHighlightMovement(null, null, false, false);
          }
        });
      }
    });
  }

  // Called when map is clicked during movement - allows selecting destination from map
  handleMapDestinationClick(territory) {
    if (!this.selectedTerritory || !this.gameState) return false;

    const player = this.gameState.currentPlayer;
    const turnPhase = this.gameState.turnPhase;
    const isCombatMove = turnPhase === TURN_PHASES.COMBAT_MOVE;
    const isNonCombatMove = turnPhase === TURN_PHASES.NON_COMBAT_MOVE;

    if (!isCombatMove && !isNonCombatMove) return false;

    // Phone pair: dest can be named before any icon tap (icons commit now).
    const totalSelected = Object.values(this.moveSelectedUnits).reduce((sum, q) => sum + q, 0);
    const destinations = this._phoneMoveDests(this.selectedTerritory, player, isCombatMove);
    const isValidDest = destinations.some(d => d.name === territory.name);
    const phonePair = isMobileShell() && shouldUsePhonePairGrammar({
      mobile: true,
      phase: this.gameState.phase,
      turnPhase,
    });
    if (totalSelected === 0 && !canNamePhoneMoveDest({
      hasSource: !!this.selectedTerritory,
      destIsLegal: !!(phonePair && isValidDest),
    })) return false;

    if (isValidDest) {
      this.movePendingDest = territory.name;
            this._scheduleRender();
      return true;
    }

    return false;
  }

  // Add a sync event to the debug log
  logSyncEvent(event, details = {}) {
    const entry = {
      time: new Date().toLocaleTimeString('en-US', { hour12: false }),
      event,
      ...details
    };
    this.syncLog.push(entry);
    if (this.syncLog.length > this.maxSyncLogEntries) {
      this.syncLog.shift();
    }
  }

  // Get debug info as copyable text
  getDebugInfo() {
    const gs = this.gameState;
    const sm = this.syncManager;

    if (!gs) return 'No game state';

    const lines = [];
    lines.push('=== TACTICAL RISK DEBUG INFO ===');
    lines.push(`Time: ${new Date().toISOString()}`);
    lines.push('');

    // Connection info
    lines.push('--- CONNECTION ---');
    lines.push(`My User ID: ${this.localUserId || 'not set'}`);
    lines.push(`Is Multiplayer: ${gs.isMultiplayer}`);
    if (sm) {
      lines.push(`Is Active Player: ${sm.checkIsActivePlayer()}`);
      lines.push(`Is Host: ${sm.isHost}`);
      lines.push(`Local Version: ${sm.localVersion}`);
      lines.push(`Last Current Player ID: ${sm._lastCurrentPlayerId || 'none'}`);
    }
    lines.push('');

    // Game state
    lines.push('--- GAME STATE ---');
    lines.push(`Phase: ${gs.phase}`);
    lines.push(`Turn Phase: ${gs.turnPhase}`);
    lines.push(`Round: ${gs.round}`);
    lines.push(`Current Player Index: ${gs.currentPlayerIndex}`);
    const cp = gs.currentPlayer;
    if (cp) {
      lines.push(`Current Player: ${cp.name} (oderId: ${cp.oderId}, isAI: ${cp.isAI})`);
    }
    lines.push('');

    // Player mapping
    lines.push('--- PLAYERS ---');
    if (gs.players) {
      gs.players.forEach((p, i) => {
        const isMe = p.oderId === this.localUserId ? ' <-- ME' : '';
        const isCurrent = i === gs.currentPlayerIndex ? ' <-- CURRENT' : '';
        lines.push(`[${i}] ${p.name} (oderId: ${p.oderId}, isAI: ${p.isAI})${isMe}${isCurrent}`);
      });
    }
    lines.push('');

    // Recent sync events
    lines.push('--- SYNC LOG (newest first) ---');
    if (this.syncLog.length === 0) {
      lines.push('No sync events yet');
    } else {
      [...this.syncLog].reverse().forEach(entry => {
        const details = Object.entries(entry)
          .filter(([k]) => k !== 'time' && k !== 'event')
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        lines.push(`${entry.time} | ${entry.event}${details ? ': ' + details : ''}`);
      });
    }

    lines.push('');
    lines.push('=== END DEBUG INFO ===');

    return lines.join('\n');
  }

  _renderDebugTab() {
    const gs = this.gameState;
    const sm = this.syncManager;

    let html = '<div class="pp-debug-tab">';

    // Copy button at top
    html += `
      <div class="pp-debug-actions">
        <button class="pp-debug-copy-btn" data-action="copy-debug">
          📋 Copy Debug Info
        </button>
      </div>
    `;

    // Connection status
    html += '<div class="pp-debug-section">';
    html += '<div class="pp-debug-header">Connection</div>';
    html += '<div class="pp-debug-grid">';
    html += `<div class="pp-debug-label">My User ID:</div><div class="pp-debug-value">${this.localUserId || 'not set'}</div>`;
    if (sm) {
      html += `<div class="pp-debug-label">Active Player:</div><div class="pp-debug-value ${sm.checkIsActivePlayer() ? 'pp-debug-yes' : 'pp-debug-no'}">${sm.checkIsActivePlayer() ? 'YES (my turn)' : 'NO (waiting)'}</div>`;
      html += `<div class="pp-debug-label">Is Host:</div><div class="pp-debug-value">${sm.isHost ? 'YES' : 'NO'}</div>`;
      html += `<div class="pp-debug-label">State Version:</div><div class="pp-debug-value">${sm.localVersion}</div>`;
    }
    html += '</div></div>';

    // Current turn
    html += '<div class="pp-debug-section">';
    html += '<div class="pp-debug-header">Current Turn</div>';
    html += '<div class="pp-debug-grid">';
    const cp = gs?.currentPlayer;
    if (cp) {
      const isMe = cp.oderId === this.localUserId;
      html += `<div class="pp-debug-label">Player:</div><div class="pp-debug-value" style="color: ${cp.color}">${cp.name}${isMe ? ' (ME)' : ''}</div>`;
      html += `<div class="pp-debug-label">Player oderId:</div><div class="pp-debug-value">${cp.oderId}</div>`;
      html += `<div class="pp-debug-label">Player Index:</div><div class="pp-debug-value">${gs.currentPlayerIndex}</div>`;
    }
    html += `<div class="pp-debug-label">Phase:</div><div class="pp-debug-value">${gs?.phase || 'N/A'}</div>`;
    html += `<div class="pp-debug-label">Turn Phase:</div><div class="pp-debug-value">${gs?.turnPhase || 'N/A'}</div>`;
    html += `<div class="pp-debug-label">Round:</div><div class="pp-debug-value">${gs?.round || 'N/A'}</div>`;
    html += '</div></div>';

    // Player list
    html += '<div class="pp-debug-section">';
    html += '<div class="pp-debug-header">Players</div>';
    html += '<div class="pp-debug-players">';
    if (gs?.players) {
      gs.players.forEach((p, i) => {
        const isMe = p.oderId === this.localUserId;
        const isCurrent = i === gs.currentPlayerIndex;
        html += `
          <div class="pp-debug-player ${isMe ? 'pp-debug-me' : ''} ${isCurrent ? 'pp-debug-current' : ''}">
            <span class="pp-debug-player-idx">[${i}]</span>
            <span class="pp-debug-player-name" style="color: ${p.color}">${p.name}</span>
            <span class="pp-debug-player-info">${p.isAI ? 'AI' : 'Human'}</span>
            ${isMe ? '<span class="pp-debug-badge">ME</span>' : ''}
            ${isCurrent ? '<span class="pp-debug-badge current">TURN</span>' : ''}
          </div>
        `;
      });
    }
    html += '</div></div>';

    // Sync log
    html += '<div class="pp-debug-section">';
    html += '<div class="pp-debug-header">Sync Log</div>';
    html += '<div class="pp-debug-log">';
    if (this.syncLog.length === 0) {
      html += '<div class="pp-debug-log-empty">No sync events yet</div>';
    } else {
      [...this.syncLog].reverse().forEach(entry => {
        const details = Object.entries(entry)
          .filter(([k]) => k !== 'time' && k !== 'event')
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        html += `
          <div class="pp-debug-log-entry">
            <span class="pp-debug-log-time">${entry.time}</span>
            <span class="pp-debug-log-event">${entry.event}</span>
            ${details ? `<span class="pp-debug-log-details">${details}</span>` : ''}
          </div>
        `;
      });
    }
    html += '</div></div>';

    html += '</div>';
    return html;
  }
}
