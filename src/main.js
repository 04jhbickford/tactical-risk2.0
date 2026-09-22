// Entry point: loads data, initializes all systems, runs the render loop.

// Polyfill for roundRect (not supported in older Chrome versions)
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
    const r = typeof radii === 'number' ? radii : (radii?.[0] ?? 0);
    this.moveTo(x + r, y);
    this.lineTo(x + w - r, y);
    this.quadraticCurveTo(x + w, y, x + w, y + r);
    this.lineTo(x + w, y + h - r);
    this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.lineTo(x + r, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - r);
    this.lineTo(x, y + r);
    this.quadraticCurveTo(x, y, x + r, y);
    this.closePath();
  };
}

import { Camera, MAP_WIDTH } from './map/camera.js';
import { MapRenderer } from './map/mapRenderer.js';
import { TerritoryRenderer } from './map/territoryRenderer.js';
import { TerritoryMap } from './map/territoryMap.js';
import { UnitRenderer } from './map/unitRenderer.js';
import {
  PlayerPanel,
  resolveWaitingForSyncAfterRemoteSnapshot,
  resolveTurnChrome,
  emitYourTurnEvent,
  resolvePhoneCapitalCommitLand,
  isCapitalPlacementCommitted,
} from './ui/playerPanel.js';
import { TerritoryTooltip } from './ui/territoryTooltip.js';
import { PurchasePopup } from './ui/purchasePopup.js';
import { MovementUI } from './ui/movementUI.js';
import { CombatUI } from './ui/combatUI.js';
import { TechUI } from './ui/techUI.js';
import { PlacementUI } from './ui/placementUI.js';
import { MobilizeUI } from './ui/mobilizeUI.js';
import { RulesPanel } from './ui/rulesPanel.js';
import {
  PhaseGuide,
  shouldBlockMapForPhaseGuide,
  pointHitsPhaseGuideChrome,
} from './ui/phaseGuide.js';
import {
  dismissStartupLoader,
  reportStartupError,
  reportStartupStatus,
  STARTUP_AUTH_TIMEOUT_MS,
  STARTUP_MAP_LOAD_TIMEOUT_MS,
  STARTUP_RESUME_TIMEOUT_MS,
  resolveStartupAfterHang,
} from './ui/startupLoader.js';
import { withTimeout } from './utils/timeout.js';
import { HUD } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { Lobby } from './ui/lobby.js';
import { isPocketPreviewRequested, resolveUxMode, UX_THREE } from './map/presentationMode.js';
import { GAME_VERSION } from './version.js';

function paintGameStamp() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return GAME_VERSION;
  window.__TR_GAME_VERSION = GAME_VERSION;
  document.documentElement.setAttribute('data-game-version', GAME_VERSION);
  document.querySelectorAll('.three-l0-ver, .three-lobby-ver, .lobby-version-badge').forEach((el) => {
    el.textContent = GAME_VERSION;
  });
  return GAME_VERSION;
}
paintGameStamp();
import { ContinentPanel } from './ui/continentPanel.js';
import { GameState, GAME_PHASES, TURN_PHASES, shouldShowPurchase } from './state/gameState.js';
import { syncPushPhaseLabel } from './state/placementPass.js';
import { VictoryScreen } from './ui/victoryScreen.js';
import { AIController } from './ai/aiController.js';
import { ActionLog } from './ui/actionLog.js';
import { BugTracker } from './ui/bugTracker.js';
import { AirLandingUI } from './ui/airLandingUI.js';
import { RocketUI } from './ui/rocketUI.js';
import { UnitTooltip } from './ui/unitTooltip.js';
import { TurnSummaryModal, shouldShowTurnSummary } from './ui/turnSummaryModal.js';
import { initTouchInput, initZoomControls } from './input/touchInput.js';
import { HandoffScreen } from './ui/handoffScreen.js';
import {
  initMobileShell,
  onMobileShellChange,
  isMobileShell,
  applyPhoneCameraFit,
  collectPhoneLegalTerritoryNames,
  isPhoneLegalSetupSeaDest,
  shouldSkipPhoneMapArt,
  shouldSkipPhoneWaterMask,
  PHONE_SELECT_PULSE_MS,
  PHONE_CONFIRM_PULSE_MS,
} from './ui/mobileShell.js';
import {
  shouldHidePhoneTooltipOn,
  shouldToggleOffPhoneTooltip,
  shouldShowPhoneTooltipOnTap,
  shouldShowPhoneTooltipOnHover,
  shouldInspectPhoneHold,
  shouldCommitPhoneSetupTap,
  shouldApplyPhoneSetupLandTap,
  applyCapitalPlacementPeek,
  shouldCommitPhoneSetupPeekAfterGesture,
  isPhoneSetupPlacementPhase,
  shouldRefitPhoneSetupHit,
  isPhoneCapitalCtaTarget,
  isPhoneHudChromeTarget,
  isPhoneHandoffChromeTarget,
  pointHitsPhoneHandoffChrome,
  pointHitsPhoneMapToolsChrome,
  isPhoneTrayChromeTarget,
  shouldIgnorePanelBoxForPhoneCapitalPeek,
  PHONE_INSPECT_HOLD_MS,
  PHONE_INSPECT_MOVE_PX,
} from './ui/territoryTooltip.js';

initMobileShell();
installClientErrorHooks();

// Multiplayer imports
import { initializeFirebase, isFirebaseConfigured, getFirebaseDb } from './multiplayer/firebase.js';
import { getAuthManager } from './multiplayer/auth.js';
import { getLobbyManager } from './multiplayer/lobbyManager.js';
import { createSyncManager } from './multiplayer/syncManager.js';
import { leaveGame, isAllResignDeleteFailure, retryDeleteFinishedGame } from './multiplayer/surrender.js';
import {
  applySurrenderToState,
  resolveResignPlayerId,
} from './multiplayer/surrenderCore.js';
import {
  resolveHostOderId,
  resolveIsHost,
  applyLiveHostHandoff,
} from './multiplayer/hostHandoff.js';
import {
  shouldShowPushExhaustedNotice,
  resolveWaitingLockAfterExhaust,
} from './multiplayer/rematchRecovery.js';
import { createMultiplayerGuard } from './multiplayer/multiplayerGuard.js';
import { getPresenceManager } from './multiplayer/presenceManager.js';
import { computeHumanPresent, mayRunAI } from './multiplayer/aiPolicy.js';
import {
  shouldEjectFromMatch,
  shouldAccumulateHostOfflineMs,
  shouldStartHostFailover,
  presenceStopReason,
  shouldShowSignInForm,
  shouldReconnectToGame,
} from './multiplayer/presencePolicy.js';
import { maybePostTurnNotice } from './multiplayer/turnNotice.js';
import { bindDiscordTurnPing } from './multiplayer/discordTurnPing.js';
import {
  resumeAuthEvent,
  shouldRefreshTokenOnResume,
} from './multiplayer/authSession.js';
import {
  forgetLastMatch,
  rememberLastMatch,
  readLastMatch,
  resolveLobbyCodeFromGameDoc,
  shouldLeaveGameView,
  shouldAutoResumeLastMatch,
  shouldHoldLoaderForLastMatchResume,
  resolveResumeFailureView,
  shouldNavigateToHome,
  hasHydratePayload,
  shouldFetchGameDocBeforeStart,
  shouldShowReconnectAfterResumeAttempt,
  shouldForgetLastMatchOnHydrateFailure,
  shouldReuseInFlightMultiplayerStart,
} from './multiplayer/lastMatch.js';
import { AuthScreen } from './ui/authScreen.js';
import { MultiplayerLobby } from './ui/multiplayerLobby.js';
import { GameList } from './ui/gameList.js';
import {
  attachDiagnosticsConsole,
  bindGameEventLog,
  createFirestoreEventWriter,
  createGameEventLog,
  emitGameEvent,
  installClientErrorHooks,
  unbindGameEventLog,
} from './multiplayer/gameEventLog.js';

// DEBUG: Set to true to log sea zone click coordinates for positioning
const DEBUG_SEA_ZONE_CLICKS = false;
const DEBUG_SEA_ZONE_OFFSETS = []; // Accumulates all clicked offsets

function wrapX(x) {
  return ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
}

// Simple notification display for game events
function showNotification(message, duration = 3000) {
  let container = document.getElementById('notification-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    container.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:1000;pointer-events:none;';
    document.body.appendChild(container);
  }

  const notif = document.createElement('div');
  notif.className = 'game-notification';
  notif.textContent = message;
  notif.style.cssText = 'background:rgba(0,0,0,0.85);color:#fff;padding:12px 24px;border-radius:8px;margin-bottom:8px;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);animation:notifFadeIn 0.3s ease;';
  container.appendChild(notif);

  setTimeout(() => {
    notif.style.opacity = '0';
    notif.style.transition = 'opacity 0.3s';
    setTimeout(() => notif.remove(), 300);
  }, duration);
}

// Persistent "a newer version is live" banner (Dimension C). Shown when the
// game doc was written by a strictly-newer app version — a redeploy happened
// while this tab stayed open. Non-blocking on purpose: an async player mid-turn
// must still be able to finish; the schema is what governs actual compatibility.
// Stays until the user reloads (or dismisses).
function showVersionBanner(remoteVersion) {
  if (document.getElementById('version-banner')) return; // one banner only
  const banner = document.createElement('div');
  banner.id = 'version-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2000;background:#b45309;color:#fff;padding:10px 16px;font-size:14px;display:flex;align-items:center;justify-content:center;gap:16px;box-shadow:0 2px 8px rgba(0,0,0,0.4);';
  const label = document.createElement('span');
  label.textContent = `A newer version (${remoteVersion}) is live. Refresh to update.`;
  const refreshBtn = document.createElement('button');
  refreshBtn.textContent = 'Refresh';
  refreshBtn.style.cssText = 'background:#fff;color:#b45309;border:none;padding:6px 14px;border-radius:6px;font-weight:600;cursor:pointer;';
  refreshBtn.onclick = () => window.location.reload();
  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = '✕';
  dismissBtn.setAttribute('aria-label', 'Dismiss');
  dismissBtn.style.cssText = 'background:transparent;color:#fff;border:none;font-size:16px;cursor:pointer;line-height:1;';
  dismissBtn.onclick = () => banner.remove();
  banner.append(label, refreshBtn, dismissBtn);
  document.body.appendChild(banner);
}

async function init() {
  // Load data
  const [territoriesRes, continentsRes, setupRes, unitsRes] = await Promise.all([
    fetch('data/territories.json'),
    fetch('data/continents.json'),
    fetch('data/setup.json'),
    fetch('data/units.json'),
  ]);
  const territories = await territoriesRes.json();
  const continents = await continentsRes.json();
  const setup = await setupRes.json();
  const unitDefs = await unitsRes.json();

  // Canvas setup
  const canvas = document.getElementById('mapCanvas');
  const ctx = canvas.getContext('2d');

  // Initialize systems
  const camera = new Camera(canvas);
  const kickPaint = () => {
    camera.dirty = true;
    requestAnimationFrame(() => { camera.dirty = true; });
  };
  let phoneSetupPeekThisGesture = false;
  let phoneSetupGestureStart = null;
  const mapRenderer = new MapRenderer();
  const territoryRenderer = new TerritoryRenderer(territories, continents);
  territoryRenderer.onFlagsReady = kickPaint;
  const territoryMap = new TerritoryMap(territories);

  function resizeCanvas() {
    const dpr = devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    camera.onResize();
  }

  // UI
  const hud = new HUD();
  const minimap = new Minimap(camera);

  // State
  let hoverTerritory = null;
  let selectedTerritory = null;
  let gameState = null;
  let unitRenderer = null;

  // Hover tooltip delay state
  let hoverTooltipTimeout = null;
  let lastHoverPos = { x: 0, y: 0 };
  const TOOLTIP_DELAY = 400; // ms before showing tooltip
  let phoneHoldTimer = null;
  let phoneHoldStart = null;
  let phoneInspected = false;

  const clearPhoneHold = () => {
    if (phoneHoldTimer) {
      clearTimeout(phoneHoldTimer);
      phoneHoldTimer = null;
    }
  };

  // Drag-and-drop state for unit movement
  let isDraggingUnits = false;
  let dragSourceTerritory = null;
  let dragStartPos = { x: 0, y: 0 };
  let dragCurrentPos = { x: 0, y: 0 };
  let dragValidDestinations = [];
  const DRAG_THRESHOLD = 5; // pixels before drag starts

  // Territory tooltip (shows on hover)
  const tooltip = new TerritoryTooltip(continents);
  tooltip.setUnitDefs(unitDefs);

  // Unit tooltip (shows on hover over unit icons)
  const unitTooltip = new UnitTooltip();
  unitTooltip.setUnitDefs(unitDefs);

  // Player panel (replaces territory-focused sidebar)
  const playerPanel = new PlayerPanel();
  playerPanel.setUnitDefs(unitDefs);
  const hidePhoneTooltips = (reason) => {
    if (!shouldHidePhoneTooltipOn({ mobile: isMobileShell(), reason })) return;
    tooltip.hide();
    unitTooltip.hide();
  };

  let getPhoneFitFocus = () => ({
    selectedName: playerPanel.selectedTerritory?.name || selectedTerritory?.name || null,
    destinationNames: playerPanel.movePendingDest ? [playerPanel.movePendingDest] : [],
  });

  const fitPhoneCamera = ({ userTapped = false } = {}) => {
    if (!isMobileShell() || !camera) return;
    hidePhoneTooltips('fit');
    camera.usePhoneMinZoom = true;
    applyPhoneCameraFit(camera, {
      gameState, territories, ...getPhoneFitFocus(), userTapped,
    });
  };

  onMobileShellChange((active) => {
    camera.usePhoneMinZoom = !!active;
    hud._render();
    playerPanel._render();
    if (active) fitPhoneCamera();
    else {
      hidePhoneTooltips('resize-leave-phone');
      tooltip.hide();
      unitTooltip.hide();
      territoryRenderer.setPhoneLegalTerritories([]);
      camera.onResize();
    }
  });

  hud.setMenuTabProvider((tab) => playerPanel.renderMenuTabHTML(tab));
  hud.setOnMenuOpen(() => hidePhoneTooltips('menu-open'));
  hud.el?.addEventListener('pointerdown', () => {
    tooltip.hide();
    unitTooltip.hide();
  }, true);

  document.addEventListener('pointerdown', (e) => {
    if (!isMobileShell() || !tooltip.isVisible) return;
    if (e.target === canvas || canvas.contains(e.target)) return;
    hidePhoneTooltips('tap-away');
  }, true);

  // Purchase popup overlay
  const purchasePopup = new PurchasePopup();
  purchasePopup.setUnitDefs(unitDefs);
  purchasePopup.setTerritories(territories);

  // Movement UI
  const movementUI = new MovementUI();
  movementUI.setUnitDefs(unitDefs);
  movementUI.setTerritories(territories);
  getPhoneFitFocus = () => {
    const dests = [];
    if (playerPanel.movePendingDest) dests.push(playerPanel.movePendingDest);
    if (playerPanel._phoneDeployLandName) dests.push(playerPanel._phoneDeployLandName);
    const capital = gameState?.getCapital?.(gameState.currentPlayer?.id) || null;
    if (capital) dests.push(capital);
    if (movementUI.hasUnitsSelected()) {
      dests.push(...(movementUI.getValidDestinations() || []));
    }
    const src = movementUI.getSelectedSource?.();
    const rawSelected = src?.name
      || playerPanel._phoneDeployLandName
      || playerPanel._phoneCapitalLandName
      || selectedTerritory?.name
      || capital
      || null;
    const owner = rawSelected ? gameState?.getOwner?.(rawSelected) : null;
    const selectedName = (gameState?.phase === GAME_PHASES.CAPITAL_PLACEMENT
      && rawSelected
      && owner
      && owner !== gameState.currentPlayer?.id)
      ? (playerPanel._phoneCapitalLandName || capital || null)
      : rawSelected;
    return {
      selectedName,
      destinationNames: dests,
      capitalName: capital,
    };
  };

  // Combat UI
  const combatUI = new CombatUI();
  combatUI.setUnitDefs(unitDefs);

  // Tech UI
  const techUI = new TechUI();

  // Placement UI (for Risk initial setup)
  const placementUI = new PlacementUI();
  placementUI.setUnitDefs(unitDefs);
  placementUI.setTerritories(territories);

  // Mobilize UI (for placing purchased units)
  const mobilizeUI = new MobilizeUI();
  mobilizeUI.setUnitDefs(unitDefs);
  mobilizeUI.setTerritories(territories);

  // Victory Screen
  const victoryScreen = new VictoryScreen();

  // Action Log (game event log)
  const actionLog = new ActionLog();

  // Rules Panel
  const rulesPanel = new RulesPanel();
  const phaseGuide = new PhaseGuide();
  reportStartupStatus('Loading map data…', 48);

  // Bug Tracker
  const bugTracker = new BugTracker();

  // Air Landing UI (for placing air units after combat)
  const airLandingUI = new AirLandingUI();
  airLandingUI.setUnitDefs(unitDefs);
  airLandingUI.setTerritories(territories);

  // Rocket Attack UI (for rockets technology)
  const rocketUI = new RocketUI();
  rocketUI.setUnitDefs(unitDefs);

  // Rules button is now in the HUD (top bar)

  // Action handler for player panel buttons
  playerPanel.setActionCallback(async (action, data) => {
    if (!gameState) return;

    switch (action) {
      case 'place-capital':
        // Capture player BEFORE placeCapital (which advances the turn)
        const placingPlayer = gameState.currentPlayer;
        const capitalLand = resolvePhoneCapitalCommitLand({
          dataTerritory: data?.territory,
          peekedLandName: playerPanel._phoneCapitalLandName,
          selectedName: (playerPanel.selectedTerritory && !playerPanel.selectedTerritory.isWater)
            ? playerPanel.selectedTerritory.name
            : selectedTerritory?.name,
          currentPlayerId: placingPlayer?.id,
          getOwner: (name) => gameState.getOwner(name),
        });
        if (!capitalLand) {
          // Owner guard must not leave a dead Confirm on screen.
          selectedTerritory = null;
          playerPanel._phoneCapitalLandName = null;
          playerPanel.selectedTerritory = null;
          playerPanel.flushRender();
          hud._render();
          kickPaint();
          break;
        }
        if (isCapitalPlacementCommitted(gameState.placeCapital(capitalLand))) {
          actionLog.logCapitalPlacement(capitalLand, placingPlayer);
          tooltip.hide();
          unitTooltip.hide();
          hidePhoneTooltips('commit');
          if (isMobileShell()) {
            territoryRenderer.setPhoneTilePulse(
              capitalLand, 'confirm', PHONE_CONFIRM_PULSE_MS,
            );
          }
          selectedTerritory = null;
          playerPanel._phoneCapitalLandName = null;
          playerPanel.selectedTerritory = null;
          playerPanel.flushRender();
          hud._render();
          kickPaint();
          notifyTurnSwap(placingPlayer, gameState.currentPlayer);
          if (syncManager) await syncManager.pushStateNow();
          // Kick the other seat now so 1-human + AI reaches DEPLOY on
          // this load. Human Confirm itself must not auto-Fit.
          checkAI();
        }
        break;

      case 'open-purchase':
        // Close other modals first. Purchase is PLAYING-only — leftover
        // setup turnPhase (constructor purchase) must not open the shop.
        if (!shouldShowPurchase(gameState.phase, gameState.turnPhase)) {
          break;
        }
        techUI.hide();
        combatUI.hide();
        purchasePopup.show();
        break;

      case 'open-tech':
        // Close other modals first. Tech is PLAYING-only — leftover
        // setup turnPhase (develop_tech dummy) must not open Research.
        if (gameState.phase !== GAME_PHASES.PLAYING ||
            gameState.turnPhase !== TURN_PHASES.DEVELOP_TECH) {
          break;
        }
        purchasePopup.hide();
        combatUI.hide();
        techUI.show();
        break;

      case 'trade-cards':
        // Risk cards can only be traded during PLAYING + PURCHASE
        if (!shouldShowPurchase(gameState.phase, gameState.turnPhase)) {
          console.log('Risk cards can only be traded during the Purchase phase');
          break;
        }
        if (gameState.canTradeRiskCards(gameState.currentPlayer.id)) {
          const result = gameState.tradeRiskCards(gameState.currentPlayer.id);
          if (result.success) {
            actionLog.logCardTrade(gameState.currentPlayer, result.ipcs);
            camera.dirty = true;
          }
        }
        break;

      case 'trade-set':
        // Trade a specific card set (when multiple options exist)
        if (!shouldShowPurchase(gameState.phase, gameState.turnPhase)) {
          console.log('Risk cards can only be traded during the Purchase phase');
          break;
        }
        if (data.cardSet) {
          const result = gameState.tradeSpecificCards(gameState.currentPlayer.id, data.cardSet);
          if (result.success) {
            actionLog.logCardTrade(gameState.currentPlayer, result.ipcs);
            camera.dirty = true;
          }
        }
        break;

      case 'undo-move':
        const undoResult = data?.moveId
          ? gameState.undoMoveById(data.moveId)
          : gameState.undoLastMove();
        if (undoResult.success) {
          camera.dirty = true;
        }
        break;

      case 'undo-all-moves':
        if (gameState.undoAllMoves().success) {
          camera.dirty = true;
        }
        break;

      case 'undo-purchase':
        if (!shouldShowPurchase(gameState.phase, gameState.turnPhase)) break;
        {
          const undoPurchaseResult = data.unitType
            ? gameState.removeFromPendingPurchases(data.unitType, unitDefs)
            : gameState.undoLastPurchase(unitDefs);
          if (undoPurchaseResult.success) {
            camera.dirty = true;
          }
        }
        break;

      case 'clear-purchases':
        if (!shouldShowPurchase(gameState.phase, gameState.turnPhase)) break;
        gameState.clearPendingPurchases(unitDefs);
        camera.dirty = true;
        break;

      case 'trade-risk-cards':
        // Trade Risk cards for IPCs during PLAYING + purchase phase
        if (shouldShowPurchase(gameState.phase, gameState.turnPhase)) {
          const result = gameState.tradeRiskCards(gameState.currentPlayer.id);
          if (result.success) {
            actionLog.logCardTrade(gameState.currentPlayer, result.ipcs);
            camera.dirty = true;
          }
        }
        break;

      case 'buy-unit':
        // Inline purchase - add or remove unit from pending purchases
        if (!shouldShowPurchase(gameState.phase, gameState.turnPhase)) break;
        if (data.unitType && data.delta) {
          const def = unitDefs[data.unitType];
          if (!def) break;

          if (data.delta > 0) {
            // Add unit - function signature is addToPendingPurchases(unitType, unitDefs, territory)
            gameState.addToPendingPurchases(data.unitType, unitDefs, null);
          } else {
            // Remove unit
            gameState.removeFromPendingPurchases(data.unitType, unitDefs);
          }
          camera.dirty = true;
        }
        break;

      case 'buy-max':
        // Buy maximum affordable units of this type
        if (!shouldShowPurchase(gameState.phase, gameState.turnPhase)) break;
        if (data.unitType) {
          const def = unitDefs[data.unitType];
          if (!def) break;

          // Apply industrial tech discount for max calculation
          let unitCost = def.cost;
          if (gameState.hasTech(gameState.currentPlayer.id, 'industrialTech')) {
            unitCost = Math.max(1, unitCost - 1);
          }

          const ipcs = gameState.getIPCs(gameState.currentPlayer.id);
          const maxQty = Math.floor(ipcs / unitCost);
          for (let i = 0; i < maxQty; i++) {
            const result = gameState.addToPendingPurchases(data.unitType, unitDefs, null);
            if (!result.success) break;
          }
          camera.dirty = true;
        }
        break;

      case 'roll-tech':
        // Inline tech roll - PLAYING + DEVELOP_TECH only
        if (gameState.phase === GAME_PHASES.PLAYING &&
            gameState.turnPhase === TURN_PHASES.DEVELOP_TECH &&
            data.diceCount > 0) {
          techUI.performInlineRoll(data.diceCount);
          camera.dirty = true;
        }
        break;

      case 'launch-rocket':
        // Rocket attack using rockets technology - show modal
        if (data.from && data.target) {
          rocketUI.launchRocket(data.from, data.target);
        } else {
          // Show selection modal
          rocketUI.show();
        }
        camera.dirty = true;
        break;

      case 'place-unit':
        // Queue + is staging only. A single place-unit is leftover UI —
        // still one unit, never a pass.
        if (data.unitType && data.territory) {
          const result = gameState.placeInitialUnit(data.territory, data.unitType, unitDefs);
          if (result.success) {
            actionLog.logInitialPlacement(gameState.currentPlayer, data.unitType, data.territory);
            camera.dirty = true;
          }
        }
        break;

      case 'place-units-batch': {
        const types = Array.isArray(data.unitTypes) ? data.unitTypes : [];
        if (data.territory && types.length > 0) {
          const keep = selectedTerritory;
          const result = gameState.placeInitialUnitsBatch(data.territory, types, unitDefs);
          for (const unitType of result.placedTypes || []) {
            actionLog.logInitialPlacement(gameState.currentPlayer, unitType, data.territory);
          }
          selectedTerritory = keep;
          playerPanel.setSelectedTerritory(keep || playerPanel.selectedTerritory);
          tooltip.hide();
          unitTooltip.hide();
          hidePhoneTooltips('commit');
          playerPanel.flushRender();
          hud._render();
          camera.dirty = true;
          return result;
        }
        return { placed: 0, placedTypes: [], requested: types.length, failed: types.map((unitType) => ({ unitType, error: 'no-territory' })) };
      }

      case 'undo-placement':
        if (gameState.undoPlacement()) {
          camera.dirty = true;
        }
        break;

      case 'undo-capital':
        if (gameState.undoLastCapital()) {
          camera.dirty = true;
        }
        break;

      case 'open-combat':
        if (combatUI.hasCombats()) {
          // Close other modals first
          purchasePopup.hide();
          techUI.hide();
          combatUI.showNextCombat();
        }
        break;

      case 'finish-placement': {
        // Lock the UI before the local pass so a double-tap cannot skip the
        // next seat, and so kill-after-tap cannot look like "still my turn".
        if (gameState.isMultiplayer) {
          playerPanel.setWaitingForSync(true);
        }
        const prevSeat = gameState.currentPlayer;
        const pass = gameState.finishPlacementRound(unitDefs, {
          allowNavalSkip: !!data?.allowNavalSkip,
        });
        if (!pass?.ok) {
          playerPanel.setWaitingForSync(false);
          break;
        }
        notifyTurnSwap(prevSeat, gameState.currentPlayer);
        if (syncManager) {
          const pushed = await syncManager.pushStateNow();
          if (!pushed) playerPanel.setWaitingForSync(false);
        } else {
          playerPanel.setWaitingForSync(false);
        }
        camera.dirty = true;
        break;
      }

      case 'execute-move':
        // Execute a move from inline movement UI
        if (data.from && data.to && (data.units?.length > 0 || data.shipIds?.length > 0 || data.cargoUnloads?.length > 0)) {
          // Handle amphibious unload (from sea zone to coastal territory)
          if (data.isAmphibiousUnload && (data.shipIds?.length > 0 || data.cargoUnloads?.length > 0)) {
            const seaUnits = gameState.getUnitsAt(data.from) || [];
            const transports = seaUnits.filter(u => u.type === 'transport' && u.owner === gameState.currentPlayer.id);
            let anySuccess = false;
            const unloadedUnits = [];

            // Handle cargo unloads (specific units selected for amphibious assault)
            if (data.cargoUnloads?.length > 0) {
              // Check if destination is non-friendly territory (for amphibious assault marking)
              // This includes enemy territories AND undefended/neutral territories
              const destOwner = gameState.getOwner(data.to);
              const isNonFriendlyTerritory = !destOwner ||
                (destOwner !== gameState.currentPlayer.id && !gameState.areAllies(gameState.currentPlayer.id, destOwner));

              for (const cargoUnload of data.cargoUnloads) {
                const transport = transports.find(t => t.id === cargoUnload.transportId);
                if (transport && transport.cargo) {
                  // Find and unload the specific units from this transport
                  // IMPORTANT: Cargo items are stored individually (no quantity field)
                  // So we need to remove multiple items if unloading multiple units
                  let remaining = cargoUnload.quantity;
                  let unloadedCount = 0;

                  while (remaining > 0) {
                    const cargoIdx = transport.cargo.findIndex(c => c.type === cargoUnload.unitType);
                    if (cargoIdx < 0) break; // No more of this unit type

                    const cargoItem = transport.cargo[cargoIdx];
                    const itemQty = cargoItem.quantity || 1;
                    const toUnload = Math.min(remaining, itemQty);

                    // Remove from transport
                    if (toUnload >= itemQty) {
                      transport.cargo.splice(cargoIdx, 1);
                    } else {
                      cargoItem.quantity = itemQty - toUnload;
                    }

                    remaining -= toUnload;
                    unloadedCount += toUnload;
                  }

                  if (unloadedCount > 0) {
                    // Mark transport as moved (can't move again this turn)
                    transport.moved = true;

                    // Add to destination (mark units as moved)
                    const destUnits = gameState.units[data.to] || [];
                    const existingUnit = destUnits.find(u => u.type === cargoUnload.unitType && u.owner === gameState.currentPlayer.id && u.moved);
                    if (existingUnit) {
                      existingUnit.quantity = (existingUnit.quantity || 1) + unloadedCount;
                    } else {
                      destUnits.push({
                        type: cargoUnload.unitType,
                        owner: gameState.currentPlayer.id,
                        quantity: unloadedCount,
                        moved: true
                      });
                    }
                    gameState.units[data.to] = destUnits;

                    // Mark as amphibious assault if unloading to non-friendly territory during combat move
                    if (isNonFriendlyTerritory && gameState.turnPhase === TURN_PHASES.COMBAT_MOVE) {
                      if (!gameState.amphibiousTerritories) gameState.amphibiousTerritories = new Set();
                      gameState.amphibiousTerritories.add(data.to);
                    }

                    // Track for move history (for undo)
                    if (!gameState.moveHistory) gameState.moveHistory = [];
                    gameState.moveHistory.push({
                      from: data.from,
                      to: data.to,
                      units: [{ type: cargoUnload.unitType, quantity: unloadedCount }],
                      transportId: cargoUnload.transportId,
                      isAmphibious: true
                    });

                    unloadedUnits.push({ type: cargoUnload.unitType, quantity: unloadedCount });
                    anySuccess = true;
                  }
                }
              }
            }

            // Handle ship-based unloads (whole transport cargo)
            for (const shipId of data.shipIds || []) {
              // Find transport index by ID
              const transportIdx = transports.findIndex(t => t.id === shipId);
              if (transportIdx >= 0) {
                const result = gameState.unloadTransport(data.from, transportIdx, data.to);
                if (result.success) {
                  anySuccess = true;
                }
              }
            }

            if (anySuccess) {
              const logUnits = unloadedUnits.length > 0 ? unloadedUnits : [{ type: 'amphibious', quantity: 1 }];
              actionLog.logMove(data.from, data.to, logUnits, gameState.currentPlayer);
              camera.dirty = true;
              if (!data.keepPhonePair) {
                selectedTerritory = null;
                playerPanel.setSelectedTerritory(null);
              }
            }
          } else {
            // Regular move
            const moveOptions = {};
            if (data.shipIds && data.shipIds.length > 0) {
              moveOptions.shipIds = data.shipIds;
            }
            const unitsToMove = data.units || [];
            const result = gameState.moveUnits(data.from, data.to, unitsToMove, unitDefs, moveOptions);
            if (result.success) {
              actionLog.logMove(data.from, data.to, unitsToMove, gameState.currentPlayer);
              camera.dirty = true;
              if (!data.keepPhonePair) {
                selectedTerritory = null;
                playerPanel.setSelectedTerritory(null);
              }
            } else {
              console.warn('Move failed:', result.error);
            }
          }
        }
        break;

      case 'mobilize-unit':
        // Mobilize a purchased unit to a territory
        if (data.unitType && data.territory) {
          const result = gameState.mobilizeUnit(data.unitType, data.territory, unitDefs, {
            sourceFactory: data.sourceFactory || null,
          });
          if (result.success) {
            actionLog.logMobilize(gameState.currentPlayer, [{ type: data.unitType, quantity: 1 }], data.territory);
            camera.dirty = true;
          }
        }
        break;

      case 'mobilize-all':
        // Mobilize all units of a type to a territory
        if (data.unitType && data.territory) {
          const pending = gameState.getPendingPurchases?.() || [];
          const unit = pending.find(p => p.type === data.unitType);
          if (unit) {
            let placed = 0;
            const toPlace = unit.quantity;
            for (let i = 0; i < toPlace; i++) {
              const result = gameState.mobilizeUnit(data.unitType, data.territory, unitDefs, {
                sourceFactory: data.sourceFactory || null,
              });
              if (!result.success) break;
              placed++;
            }
            if (placed > 0) {
              actionLog.logMobilize(gameState.currentPlayer, [{ type: data.unitType, quantity: placed }], data.territory);
              camera.dirty = true;
            }
          }
        }
        break;

      case 'undo-mobilize':
        // Undo the last mobilization placement
        {
          const result = gameState.undoMobilization(unitDefs);
          if (result.success) {
            camera.dirty = true;
          }
        }
        break;

      case 'next-phase':
        playerPanel.commitAirLandingsIfReady?.();
        if (gameState.turnPhase === TURN_PHASES.COMBAT
          && (gameState.combatQueue?.length || 0) > 0) {
          camera.dirty = true;
          break;
        }
        const prevPlayer = gameState.currentPlayer;
        const prevRound = gameState.round;

        // In multiplayer, set optimistic waiting state BEFORE nextPhase
        // This prevents brief interaction window when turn passes to another player
        if (gameState.isMultiplayer && gameState.turnPhase === TURN_PHASES.COLLECT_INCOME) {
          // COLLECT_INCOME phase will pass turn to next player
          playerPanel.setWaitingForSync(true);
        }

        gameState.nextPhase();
        notifyTurnSwap(prevPlayer, gameState.currentPlayer);
        if (syncManager) {
          const pushed = await syncManager.pushStateNow();
          if (!pushed) playerPanel.setWaitingForSync(false);
        }
        camera.dirty = true;

        // Log phase change or turn start
        if (gameState.round !== prevRound || gameState.currentPlayer !== prevPlayer) {
          actionLog.logTurnStart(gameState.currentPlayer, gameState.round);
        } else {
          actionLog.logPhaseChange(gameState.getTurnPhaseName(), gameState.currentPlayer);
        }

        // Close all modals on phase change
        purchasePopup.hide();
        techUI.hide();

        // If entering combat phase, show combat UI
        if (gameState.turnPhase === TURN_PHASES.COMBAT && combatUI.hasCombats()) {
          combatUI.showNextCombat();
        }
        // Cancel any movement selection when phase changes
        movementUI.cancel();
        break;
    }
  });

  // Continent panel
  const continentPanel = new ContinentPanel(continents);

  // AI Controller
  let aiController = null;

  // Function to check and process AI turns - now just triggers the controller
  const checkAI = () => {
    if (aiController && gameState) {
      aiController.checkAndProcessAI().then(wasAI => {
        if (wasAI) {
          camera.dirty = true;
        }
      });
    }
  };

  // Kick the AI whenever the tab becomes visible/hidden again — background-tab
  // timer throttling can leave an AI turn parked until the next trigger
  document.addEventListener('visibilitychange', () => checkAI());

  // Multiplayer state
  let syncManager = null;
  let multiplayerGuard = null;
  let presenceManager = null;
  let authScreen = null;
  let multiplayerLobby = null;
  let gameListUI = null;
  let currentGameCode = null;
  let lastTurnNoticeSeatId = null;
  let mpStartGameId = null;
  let unbindDiscordTurnPing = null;

  const notifyTurnSwap = (prevPlayer, nextPlayer) => {
    const nextId = nextPlayer?.oderId || nextPlayer?.id || null;
    const prevId = prevPlayer?.oderId || prevPlayer?.id || lastTurnNoticeSeatId;
    maybePostTurnNotice({
      prevPlayerId: prevId,
      nextPlayerId: nextId,
      nextPlayerName: nextPlayer?.name || null,
      gameCode: currentGameCode,
      phase: gameState?.phase || null,
    });
    if (nextId) lastTurnNoticeSeatId = nextId;
  };

  // Pass-and-play handoff overlay (hotseat games only)
  const handoffScreen = new HandoffScreen();
  handoffScreen.el.addEventListener('tacticalrisk:handoff-hidden', () => {
    hidePhoneTooltips('handoff');
    phoneSetupGestureStart = null;
    phoneSetupPeekThisGesture = false;
    selectedTerritory = null;
    playerPanel.selectedTerritory = null;
    playerPanel._phoneCapitalLandName = null;
    playerPanel.flushRender();
    resizeCanvas();
    fitPhoneCamera();
    kickPaint();
  });

  // Turn summary modal for showing what happened during other players' turns
  const turnSummaryModal = new TurnSummaryModal();
  turnSummaryModal.setUnitDefs(unitDefs);
  let lastTurnEventIndex = 0; // Track where we left off in turn events

  // Initialize Firebase (if configured)
  initializeFirebase();
  const authManager = getAuthManager();
  const lobbyManager = getLobbyManager();
  presenceManager = getPresenceManager();

  if (isFirebaseConfigured()) {
    authManager.initialize();
    lobbyManager.initialize();
    const quietResume = (event, extra = {}) => {
      if (!shouldRefreshTokenOnResume({ event: resumeAuthEvent(event, extra) })) return;
      authManager.refreshSessionQuietly?.();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') quietResume('visible');
    });
    window.addEventListener('pageshow', (ev) => quietResume('visible', { persisted: !!ev.persisted }));
    window.addEventListener('online', () => quietResume('online'));
  }

  // Function to start a multiplayer game
  const startMultiplayerGame = async (gameId, incomingLobbyData) => {
    if (shouldReuseInFlightMultiplayerStart({
      startingGameId: mpStartGameId,
      requestedGameId: gameId,
      alreadyInGame: !!(gameState?.isMultiplayer && gameState?.players?.length),
      seatedGameId: syncManager?.gameId || null,
    })) {
      if (multiplayerLobby) multiplayerLobby.hide();
      if (gameListUI) gameListUI.hide();
      return;
    }

    mpStartGameId = gameId;
    try {
      let lobbyData = incomingLobbyData;
      if (shouldFetchGameDocBeforeStart({ game: lobbyData, gameId })) {
        const code = resolveLobbyCodeFromGameDoc(lobbyData) || resolveLobbyCodeFromGameDoc({
          lobbyCode: lobbyData?.lobbyCode,
          code: lobbyData?.code,
        });
        const fetched = await lobbyManager.getGameById(gameId)
          || (code ? await lobbyManager.findGameByCode(code) : null);
        if (fetched) lobbyData = fetched;
      }
      console.log('[MP] startMultiplayerGame called with:', { gameId, lobbyData });
      currentGameCode = resolveLobbyCodeFromGameDoc(lobbyData) || resolveLobbyCodeFromGameDoc({
        lobbyCode: lobbyData?.lobbyCode,
        code: lobbyData?.code,
      });
      rememberLastMatch({
        gameId,
        lobbyCode: currentGameCode,
        hostName: (lobbyData?.lobbyData?.players || lobbyData?.players || [])
          .find((p) => p.isHost)?.displayName || null,
      });
      hud.setClarityContext({
        localUserId: authManager.getUser()?.id || null,
        gameCode: currentGameCode,
        justResumed: true,
        hostName: (lobbyData?.lobbyData?.players || lobbyData?.players || [])
          .find((p) => p.isHost)?.displayName || null,
      });

      // CRITICAL: Hide all multiplayer overlays immediately
      if (multiplayerLobby) {
        multiplayerLobby.hide();
      }
      if (gameListUI) {
        gameListUI.hide();
      }
      // Also hide the main lobby just in case
      lobby.hide();

      // Initialize game state
      gameState = new GameState(setup, territories, continents);
      gameState.isMultiplayer = true;

    // Create sync manager
    syncManager = createSyncManager(gameId, gameState);
    unbindGameEventLog();
    const gameEventLog = createGameEventLog({
      gameId,
      gameState,
      lobbyCode: currentGameCode,
      getWriterUid: () => authManager.getUserId?.() || authManager.getUser?.()?.id || null,
      writer: createFirestoreEventWriter({ getDb: getFirebaseDb }),
    });
    bindGameEventLog(gameEventLog);
    attachDiagnosticsConsole(gameEventLog);
    gameEventLog.log('ui', {
      payload: { action: 'sessionStart', gameId, lobbyCode: currentGameCode },
    });

    const user = authManager.getUser();

    // Get players and settings - handle both lobby document and game document structures
    // Lobby document: { hostId, players: [...], settings: {...} }
    // Game document: { lobbyData: { players: [...], settings: {...} }, stateVersion, state, startedBy }
    const playersData = lobbyData?.lobbyData?.players || lobbyData?.players;
    const settingsData = lobbyData?.lobbyData?.settings || lobbyData?.settings;

    // Determine if we're the host (for AI control purposes).
    // Live Resign rewrites lobbyData — do not freeze this for the session.
    let isHost = resolveIsHost({
      userId: user?.id,
      lobbyData: lobbyData?.lobbyData || lobbyData,
      players: playersData,
      hostId: lobbyData?.hostId || lobbyData?.lobbyData?.hostId || null,
    });

    // Determine if we should initialize the game:
    // - If startedBy exists (game doc), check if we're the starter
    // - Otherwise fall back to isHost check (lobby doc)
    const shouldInitialize = lobbyData?.startedBy
      ? lobbyData.startedBy === user?.id
      : isHost;

    // Check if game already has state (rejoining an active game)
    const hasExistingState = lobbyData?.stateVersion > 0 && lobbyData?.state;
    if (lobbyData?.status && !shouldReconnectToGame({ exists: true, status: lobbyData.status })) {
      forgetLastMatch();
      alert('That game is no longer active.');
      return;
    }

    // Set host flag on syncManager. Snapshots may rewrite this after Resign.
    syncManager.setIsHost(isHost);
    hud.setClarityContext({ isHost, localUserId: user?.id || null });

    // Host-failover authority: if the *current* host goes offline, the first
    // online non-surrendered human (in turn order) takes over running AI turns
    // so the game doesn't stall forever on an AI's turn. Concurrent takeovers
    // are safe: pushes are transaction-guarded, the loser aborts and reloads.
    let hostOderId = resolveHostOderId({
      lobbyData: lobbyData?.lobbyData || lobbyData,
      players: playersData,
      hostId: lobbyData?.hostId || lobbyData?.lobbyData?.hostId || null,
    });
    syncManager.setHostOderId(hostOderId);
    // The host must be CONTINUOUSLY offline this long before anyone takes over
    // AI duty. Presence docs are NOT deleted on beforeunload / background —
    // only explicit Exit / Leave deletes presence (B25). A host refresh keeps
    // the doc (idle, not gone), so failover waits for a missing/gone host.
    // The V2.53 "deployment stuck" bug was two clients running AI at once.
    const FAILOVER_GRACE_MS = 90000;
    let hostOfflineSince = null;
    let wasFailoverAuthority = false;
    syncManager.setAuthorityCheck(() => {
      if (!gameState || !presenceManager || !hostOderId) return false;
      let isAuthority = false;
      const hostPresence = presenceManager.getPlayerPresence(hostOderId);
      // Idle / backgrounded host must not start the 90s failover clock.
      if (shouldAccumulateHostOfflineMs({ hostPresence })) {
        if (hostOfflineSince === null) hostOfflineSince = Date.now();
        if (shouldStartHostFailover({
          hostPresence,
          offlineForMs: Date.now() - hostOfflineSince,
          graceMs: FAILOVER_GRACE_MS,
        })) {
          const me = authManager.getUser();
          const fallback = gameState.players?.find(p =>
            !p.isAI && !p.surrendered &&
            presenceManager.getPlayerPresence(p.oderId) !== 'offline'
          );
          isAuthority = !!fallback && fallback.oderId === me?.id;
        }
      } else {
        hostOfflineSince = null;
      }
      if (isAuthority && !wasFailoverAuthority) {
        console.warn('[MP] Host offline for 90s+ — this client is taking over AI turns');
        showNotification('Host is still reconnecting — you are running AI so the game can continue. Stay in the match.');
      } else if (!isAuthority && wasFailoverAuthority) {
        console.warn('[MP] Host is back — returning AI control');
        showNotification('Host is back — they are running the AI players again.');
      }
      wasFailoverAuthority = isAuthority;
      return isAuthority;
    });

    console.log('[MP] Starting game:', {
      gameId,
      hasExistingState,
      shouldInitialize,
      isHost,
      startedBy: lobbyData?.startedBy,
      userId: user?.id
    });

    // Log initial game start to debug panel
    playerPanel.logSyncEvent('game_start', {
      gameId: gameId.slice(-6),
      isHost,
      shouldInitialize
    });

    if (hasExistingState) {
      // Rejoining a game that already has state - just load it
      console.log('[MP] Rejoining existing game...');
      const stateLoaded = await syncManager.startSync();
      if (!stateLoaded) {
        console.error('[MP] Failed to load existing game state');
        ensureMultiplayerLobby();
        multiplayerLobby.showReconnectOnly();
        alert('Error 1: Failed to rejoin game. Could not load game state.');
        return;
      }
    } else if (shouldInitialize && playersData) {
      // Initialize the game (person who clicked Start)
      const players = playersData.map(p => {
        const factionDef = setup.risk.factions.find(f => f.id === p.factionId) || {};
        return {
          ...factionDef,
          id: p.factionId,
          name: p.displayName,
          color: p.color || factionDef?.color,
          lightColor: p.color || factionDef?.lightColor,
          isAI: p.isAI || false,
          aiDifficulty: p.aiDifficulty || null,
          oderId: p.oderId, // Link to Firebase user ID
          discordUserId: p.discordUserId || '',
          discordName: p.discordName || '',
        };
      });

      const options = {
        alliancesEnabled: false,
        teamsEnabled: settingsData?.teamsEnabled || false,
        startingIPCs: settingsData?.startingIPCs || 80,
        isMultiplayer: true
      };

      gameState.initGame('risk', players, options);

      // Log player mapping for debugging
      console.log('[MP] Player mapping:');
      players.forEach((p, i) => {
        console.log(`  [${i}] ${p.name} (oderId: ${p.oderId}, isAI: ${p.isAI})`);
      });
      console.log(`[MP] First player (index 0): ${gameState.currentPlayer?.name} (oderId: ${gameState.currentPlayer?.oderId})`);
      console.log(`[MP] My userId: ${user?.id}`);

      // Push initial state to Firestore
      console.log('[MP] Initializing game and pushing state...');
      const pushSuccess = await syncManager.forcePush(true);
      if (!pushSuccess) {
        console.error('[MP] Failed to push initial game state');
        alert('Error 2: Failed to initialize game. Could not save game state.');
        return;
      }

      // Start listening for updates
      await syncManager.startSync();
      console.log('[MP] Game initialized successfully. isActivePlayer:', syncManager.checkIsActivePlayer());
    } else if (!playersData) {
      // Stub / fetch miss — keep lastMatch so Rejoin can retry.
      console.error('[MP] No player data available');
      if (!hasHydratePayload(lobbyData)) {
        ensureMultiplayerLobby();
        multiplayerLobby.showReconnectOnly();
      }
      alert('Error 3: Failed to start game. No player data found.');
      return;
    } else {
      // Waiting for another client to initialize
      console.log('[MP] Waiting for game state from initializer...');
      console.log(`[MP] My userId: ${user?.id}`);
      const stateLoaded = await syncManager.startSyncAndWaitForState();
      if (!stateLoaded) {
        console.error('[MP] Timeout waiting for game state');
        alert('Error 4: Failed to join game. Timed out waiting for game to initialize. The host may have disconnected.');
        return;
      }
      console.log('[MP] Game state received');
    }

    // Create multiplayer guard after state is ready
    multiplayerGuard = createMultiplayerGuard(syncManager);
    multiplayerGuard.wrapGameState(gameState);

    // Set up sync manager reference in gameState
    gameState.syncManager = syncManager;

    // Initialize turn event index for turn summary modal
    lastTurnEventIndex = gameState.getTurnEventsLastIndex();

    let lastPushExhaustedToastAt = 0;

    // Subscribe to sync events
    syncManager.subscribe(async (event, data) => {
      // Log all sync events to debug tab
      playerPanel.logSyncEvent(event, {
        version: data?.version,
        currentPlayerId: data?.currentPlayerId,
        isActivePlayer: data?.isActivePlayer
      });

      if (event === 'host_changed') {
        const next = applyLiveHostHandoff({
          currentHostOderId: hostOderId,
          currentIsHost: isHost,
          userId: authManager.getUser()?.id,
          lobbyData: { hostId: data?.hostOderId, players: [{ oderId: data?.hostOderId, isHost: true }] },
          hostId: data?.hostOderId,
        });
        hostOderId = data?.hostOderId || next.hostOderId;
        isHost = !!data?.isHost;
        hostOfflineSince = null;
        syncManager.setIsHost(isHost);
        syncManager.setHostOderId(hostOderId);
        hud.setClarityContext({ isHost, localUserId: authManager.getUser()?.id || null });
      }

      if (event === 'game_deleted') {
        forgetLastMatch();
        showNotification('This game was deleted.');
        if (typeof leaveToLobby === 'function') leaveToLobby();
        return;
      }

      if (event === 'state_updated' || event === 'turn_changed') {
        camera.dirty = true;
        const flushed = playerPanel.flushPeekForPhaseOrSeat({
          phase: gameState.phase,
          turnPhase: gameState.turnPhase,
          seatId: gameState.currentPlayer?.id,
          capitalPeekStillLegal: false,
        });
        if (flushed) {
          selectedTerritory = null;
          playerPanel.selectedTerritory = null;
        }

        // Async-play awareness: flag the browser tab while it's your turn so a
        // backgrounded player can see it at a glance
        const turnChrome = resolveTurnChrome({
          isMultiplayer: true,
          localUserId: playerPanel.localUserId || syncManager.userId,
          currentPlayerOderId: gameState.currentPlayer?.oderId,
          currentPlayerName: gameState.currentPlayer?.name,
        });
        document.title = turnChrome.tabTitle;
        emitYourTurnEvent({
          yourTurn: turnChrome.ownSeat,
          playerName: gameState.currentPlayer?.name,
          gameId,
        });

        // A remote snapshot that makes THIS client current must drop the
        // optimistic waiting lock. state_updated used to omit isActivePlayer,
        // so `if (data.isActivePlayer)` never cleared — V2.72 playtest stuck
        // Robert on his own unit_placement seat with WAITING + "you are playing".
        const isActivePlayer = !!(data?.isActivePlayer || syncManager.checkIsActivePlayer());
        playerPanel.setWaitingForSync(resolveWaitingForSyncAfterRemoteSnapshot({
          isWaitingForSync: playerPanel.isWaitingForSync,
          isActivePlayer,
          localUserId: playerPanel.localUserId || syncManager.userId,
          currentPlayerOderId: gameState.currentPlayer?.oderId,
        }));

        // Update player panel to reflect turn change
        playerPanel._render();

        if (event === 'turn_changed' && data.isActivePlayer) {
          showNotification("It's your turn!");

          // Multiplayer playing only. A leftover overlay eats Place Capital
          // map taps (inspect≠commit cannot fire if peek never reaches canvas).
          const events = gameState.getTurnEventsSince(lastTurnEventIndex);
          lastTurnEventIndex = gameState.getTurnEventsLastIndex();
          turnSummaryModal.setGameState(gameState);
          if (shouldShowTurnSummary({
            events,
            phase: gameState.phase,
            isMultiplayer: !!gameState.isMultiplayer,
          })) {
            turnSummaryModal.show(events);
          } else {
            turnSummaryModal.hide();
          }
        }
      }

      // Surface sync failures — a silently dropped push looks like "the game ate
      // my move" to the player
      if (event === 'push_failed') {
        // Transient failure; _doPush retries with backoff. One toast per cycle
        // (not one per attempt) — auto-battle used to spam "connecting error".
        if (data?.attempt === 1) {
          showNotification('Connection hiccup — retrying to save your last action…');
        }
      }
      // Retries exhausted: local state has been snapped back to the server's
      // last confirmed truth, so the client can't proceed on un-persisted state.
      if (event === 'push_exhausted') {
        playerPanel.setWaitingForSync(resolveWaitingLockAfterExhaust());
        const now = Date.now();
        if (shouldShowPushExhaustedNotice({ lastShownAt: lastPushExhaustedToastAt, now })) {
          lastPushExhaustedToastAt = now;
          showNotification('Could not save — game re-synced to the last confirmed state. Please retry your move.');
        }
        camera.dirty = true;
        combatUI.syncFromAuthoritativeState();
        playerPanel.revealActionsAfterResync();
        const flushed = playerPanel.flushPeekForPhaseOrSeat({
          phase: gameState.phase,
          turnPhase: gameState.turnPhase,
          seatId: gameState.currentPlayer?.id,
          capitalPeekStillLegal: false,
        });
        if (flushed) {
          selectedTerritory = null;
          playerPanel.selectedTerritory = null;
        }
      }
      // push_stale is handled automatically (state reloads); no user action needed

      // A newer app version wrote the game doc (redeploy while this tab stayed
      // open) — show the persistent refresh banner (Dimension C)
      if (event === 'version_outdated') {
        showVersionBanner(data?.remoteVersion);
      }

      // Handle auth errors. Session-lost must not dump to home / Create Game (B27).
      if (event === 'auth_error' && data?.needsReauth) {
        const tokenValid = await authManager.validateToken();
        const eject = shouldEjectFromMatch({
          authUserPresent: !!authManager.getUser(),
          tokenValid,
          // A null user after background is not Sign Out. Only the Sign Out
          // button sets confirmedSignOut. Treating !getUser() as confirmed
          // is what dumped the host to Sign In and killed ZUJMNP.
          confirmedSignOut: false,
        });
        if (!eject) {
          console.warn('[Main] Auth hiccup — staying in the match');
          showNotification('Connection hiccup — still in the match.');
          return;
        }
        const resumeGameId = syncManager?.gameId || null;
        const resumeCode = currentGameCode;
        rememberLastMatch({
          gameId: resumeGameId,
          lobbyCode: resumeCode,
        });
        showNotification(resumeCode
          ? `Session expired. Sign in and rejoin ${resumeCode} — you are still in the match.`
          : 'Session expired. Sign in and rejoin — the match is still there.');

        const leaveView = shouldLeaveGameView({ sessionLost: true });
        const keepGameView = !leaveView && !!gameState;

        if (syncManager) {
          syncManager.stopSync();
          syncManager = null;
        }
        if (presenceManager) {
          presenceManager.stop({ reason: presenceStopReason({ explicitLeave: false }) });
        }

        if (keepGameView) {
          const reconnectAfterAuth = (user) => {
            if (!user) return;
            if (resumeGameId) {
              startMultiplayerGame(resumeGameId, { id: resumeGameId, lobbyCode: resumeCode });
            }
          };
          if (!authManager.isLoggedIn()) {
            if (!authScreen) authScreen = new AuthScreen(reconnectAfterAuth);
            else authScreen.onComplete = reconnectAfterAuth;
            authScreen.show();
          }
          return;
        }

        gameState = null;
        const showReconnect = () => {
          ensureMultiplayerLobby();
          multiplayerLobby.showReconnectOnly();
        };
        if (!authManager.isLoggedIn()) {
          if (!authScreen) {
            authScreen = new AuthScreen((user) => {
              if (user) showReconnect();
            });
          } else {
            authScreen.onComplete = (user) => {
              if (user) showReconnect();
            };
          }
          authScreen.show();
        } else {
          showReconnect();
        }
      }
    });

    // Set up gameState observer to push changes
    // Host pushes all state changes (including AI turns), others only push their own turns
    // IMPORTANT: Don't push if we're loading remote state (prevents feedback loop)
    gameState.subscribe(() => {
      // Push gate uses canPushLocalChange() (cached-flag authorization), NOT the
      // live checkIsActivePlayer() — a turn-ENDING action has already advanced
      // the live currentPlayer, so a live check would drop that final push.
      if (syncManager && !syncManager.isLoading() && syncManager.canPushLocalChange()) {
        playerPanel.logSyncEvent('state_push', {
          version: syncManager.localVersion + 1,
          currentPlayer: gameState.currentPlayer?.name,
          phase: syncPushPhaseLabel(gameState.phase, gameState.turnPhase)
        });
        syncManager.pushState();
      }
    });

    // Start presence tracking
    presenceManager.start(gameId);

    // Subscribe to presence updates for player panel.
    // Also re-check AI on every presence tick: if the host went offline during
    // an AI turn, this is what wakes the failover client up to take over.
    // And surface connect/disconnect transitions as toasts so live players
    // know who's actually at the table.
    let lastPresenceStates = null;
    presenceManager.subscribe((presence) => {
      playerPanel.setPresenceData(presence);
      const hostPlayer = gameState?.players?.find(p => p.isHost)
        || gameState?.players?.find(p => p.oderId && !p.isAI);
      if (hostPlayer) {
        hud.setClarityContext({
          hostPresence: presenceManager.getPlayerPresence(hostPlayer.oderId),
          hostName: hostPlayer.name,
        });
      }

      const myId = authManager.getUser()?.id;
      if (lastPresenceStates) {
        for (const [oderId, info] of Object.entries(presence || {})) {
          if (oderId === myId) continue;
          const prev = lastPresenceStates[oderId];
          const wasOffline = !prev || prev === 'offline';
          const isOffline = info.state === 'offline';
          if (wasOffline && !isOffline) {
            showNotification(`${info.displayName || 'A player'} is back — still in ${currentGameCode || 'the match'}`);
          } else if (!wasOffline && isOffline) {
            const hostGone = hostPlayer && oderId === hostPlayer.oderId;
            showNotification(hostGone
              ? `${info.displayName || 'Host'} is reconnecting — you are still in ${currentGameCode || 'the match'}. Do not leave.`
              : `${info.displayName || 'A player'} went offline`);
          }
        }
      }
      lastPresenceStates = Object.fromEntries(
        Object.entries(presence || {}).map(([id, info]) => [id, info.state])
      );

      checkAI();
    });

    // Wire up all the UI components (same as local game)
    wireUpGameComponents();

    // CEVX6F hold: a healed first-wave pool must reach the other client.
    // Do not open a new game — push the same doc.
    if (gameState._deployPoolRestored && syncManager && !syncManager.isLoading?.()) {
      if (typeof syncManager.pushStateNow === 'function') {
        await syncManager.pushStateNow();
      } else if (typeof syncManager.forcePush === 'function') {
        await syncManager.forcePush();
      }
      gameState._deployPoolRestored = false;
    }

    // Start with map overview
    camera.dirty = true;
    if (isMobileShell()) {
      camera.usePhoneMinZoom = true;
      requestAnimationFrame(fitPhoneCamera);
    }
    console.log('[MP] Game started successfully');

    } catch (error) {
      console.error('[MP] Error starting multiplayer game:', error);
      alert('Error starting game: ' + error.message);
    } finally {
      if (mpStartGameId === gameId) mpStartGameId = null;
    }
  };

  // Function to wire up all game components (shared between local and multiplayer)
  const attachDiscordTurnPing = () => {
    if (typeof unbindDiscordTurnPing === 'function') unbindDiscordTurnPing();
    unbindDiscordTurnPing = bindDiscordTurnPing(gameState, {
      getGameId: () => currentGameCode || '',
      getUxMode: () => resolveUxMode(),
      getOrigin: () => (typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : ''),
      isApplyingRemote: () => !!syncManager?.isLoading?.(),
      onResult: (result) => {
        emitGameEvent('ui', {
          payload: {
            action: 'discordTurnPing',
            reason: result?.reason || (result?.ok ? 'sent' : 'soft-fail'),
          },
        });
      },
    });
  };

  const wireUpGameComponents = () => {
    lastTurnNoticeSeatId = gameState.currentPlayer?.oderId || gameState.currentPlayer?.id || null;
    attachDiscordTurnPing();
    // Check if there are AI players
    const hasAIPlayers = gameState.players?.some(p => p.isAI);

    // Initialize AI controller whenever the game has AI players. In multiplayer
    // the setCanAct gate below decides who actually RUNS the AI: normally only
    // the host — if every client ran it, they would all play the AI's turn and
    // push conflicting states (the V2.46 "deployment turn keeps reverting" bug).
    // Non-host clients keep an idle controller so they can take over via the
    // host-failover authority if the host goes offline.
    if (hasAIPlayers) {
      aiController = new AIController();
      aiController.setUnitDefs(unitDefs);
      aiController.setActionLog(actionLog);
      aiController.setGameState(gameState);
      aiController.setOnAction((action) => {
        camera.dirty = true;
        if (action === 'finishPlacement' || action === 'placeCapital' || action === 'nextPhase') {
          notifyTurnSwap(null, gameState.currentPlayer);
          syncManager?.pushStateNow();
        }
        // AI leftover camera/phase chrome must not greet the human
        // (Skeptic: Germans CAPITAL / NW Pacific / missing Undo).
        if (action === 'placeCapital' && isMobileShell()) {
          selectedTerritory = null;
          playerPanel.selectedTerritory = null;
          playerPanel._phoneCapitalLandName = null;
          playerPanel.flushRender();
          hud._render();
          resizeCanvas();
          fitPhoneCamera();
          kickPaint();
        }
      });
      aiController.setOnStatusUpdate((message) => {
        hud.setAIStatus(message);
        camera.dirty = true;
      });
      // Authority gate: in multiplayer only the host (or the offline-host
      // failover client) runs AI turns. Bug 2: additionally, unless the game is
      // configured to run AI unattended, AI turns pause when no human is present
      // so an abandoned game truly stops rather than churning AI turns.
      aiController.setCanAct(() => {
        if (!gameState.isMultiplayer) return true;
        const aiHasAuthority = syncManager?.hasAIAuthority() === true;
        const humanPresent = computeHumanPresent({
          players: gameState.players || [],
          presenceOf: (oderId) => presenceManager?.getPlayerPresence(oderId) ?? 'offline',
          localUserId: syncManager?.userId,
        });
        return mayRunAI({
          aiHasAuthority,
          runsWhenUnattended: gameState.aiRunsWhenUnattended === true,
          humanPresent
        });
      });
    }

    // Wire up components
    hud.setGameState(gameState);
    hud.setActionLog(actionLog);
    // Pass-and-play handoff overlay (self-disables for multiplayer/AI-only)
    handoffScreen.setGameState(gameState);
    hud.setNextPhaseCallback(async () => {
      const prevPlayer = gameState.currentPlayer;
      const prevRound = gameState.round;
      gameState.nextPhase();
      notifyTurnSwap(prevPlayer, gameState.currentPlayer);
      if (syncManager) await syncManager.pushStateNow();
      camera.dirty = true;

      // Log phase change or turn start
      if (gameState.round !== prevRound || gameState.currentPlayer !== prevPlayer) {
        actionLog.logTurnStart(gameState.currentPlayer, gameState.round);
      } else {
        actionLog.logPhaseChange(gameState.getTurnPhaseName(), gameState.currentPlayer);
      }

      // Close all modals on phase change
      purchasePopup.hide();
      techUI.hide();

      // If entering combat phase, show combat UI
      if (gameState.turnPhase === TURN_PHASES.COMBAT && combatUI.hasCombats()) {
        combatUI.showNextCombat();
      }
      // Cancel any movement selection when phase changes
      movementUI.cancel();
    });
    hud.setOnRulesToggle(() => {
      rulesPanel.toggle();
    });
    hud.setOnPhaseTips(() => {
      phaseGuide.reopen();
    });
    phaseGuide.setGameState(gameState);
    reportStartupStatus('Board ready…', 92);
    dismissStartupLoader();

    const leaveToLobby = () => {
      document.title = 'Tactical Risk';
      forgetLastMatch();
      if (presenceManager) {
        presenceManager.stop();
      }
      if (syncManager) {
        syncManager.stopSync();
        syncManager = null;
      }
      unbindGameEventLog();
      if (multiplayerLobby) {
        multiplayerLobby.hide();
      }
      if (gameListUI) {
        gameListUI.hide();
      }
      gameState = null;
      lobby.show();
    };

    hud.setOnExitToLobby(() => {
      leaveToLobby();
    });

    hud.setOnResign(async () => {
      const authUserId = authManager.getUserId?.() || authManager.getUser?.()?.id || null;
      const resignId = resolveResignPlayerId({
        players: gameState?.players || [],
        authUserId,
        currentPlayerId: gameState?.currentPlayer?.oderId || gameState?.currentPlayer?.id || null,
      });
      if (gameState?.isMultiplayer && syncManager?.gameId && authUserId) {
        let result = await leaveGame(syncManager.gameId, authUserId);
        if (!result?.success) {
          alert('Failed to resign: ' + (result?.error || 'unknown error'));
          return;
        }
        if (isAllResignDeleteFailure(result)) {
          const retry = confirm('Could not remove the finished game. Retry delete?');
          if (retry) {
            result = await retryDeleteFinishedGame(syncManager.gameId);
          }
          if (isAllResignDeleteFailure(result) || result?.deleted === false) {
            alert('Game is finished but could not be removed. Refresh My Games — it is not playable.');
          }
        }
        forgetLastMatch();
        leaveToLobby();
        return;
      }
      if (gameState && resignId) {
        const json = gameState.toJSON();
        const result = applySurrenderToState(json, resignId);
        if (result.changed) {
          gameState.loadFromJSON(json);
          if (!result.humansRemain || result.gameOver) {
            leaveToLobby();
            return;
          }
          camera.dirty = true;
          return;
        }
      }
      leaveToLobby();
    });

    // Bug tracker
    bugTracker.setGameState(gameState);
    bugTracker.setActionLog(actionLog);
    playerPanel.setGameState(gameState);
    playerPanel.setContinents(continents);
    playerPanel.setTerritories(territories);
    playerPanel.setActionLog(actionLog);

    // Set multiplayer state for player panel
    if (gameState.isMultiplayer) {
      const localUserId = authManager.getUserId();
      const localPlayer = gameState.players?.find(p => p.oderId === localUserId);
      const firstPlayer = gameState.players?.[0];

      console.log('[MP] Identity check:');
      console.log(`  Local user ID: ${localUserId}`);
      console.log(`  Local player: ${localPlayer?.name || 'NOT FOUND'} (oderId: ${localPlayer?.oderId})`);
      console.log(`  First turn player: ${firstPlayer?.name} (oderId: ${firstPlayer?.oderId})`);
      console.log(`  Current player: ${gameState.currentPlayer?.name} (oderId: ${gameState.currentPlayer?.oderId})`);
      console.log(`  Is active player: ${syncManager.checkIsActivePlayer()}`);

      // Log a sync event for debugging
      playerPanel.logSyncEvent('identity_check', {
        localUserId: localUserId?.slice(-6) || 'none',
        localPlayer: localPlayer?.name || 'NOT_FOUND',
        currentPlayer: gameState.currentPlayer?.name,
        isActive: syncManager.checkIsActivePlayer()
      });

      playerPanel.setMultiplayerState(syncManager, localUserId, currentGameCode);
    }

    tooltip.setGameState(gameState);
    unitTooltip.setGameState(gameState);
    gameState.subscribe(() => { camera.dirty = true; });
    territoryRenderer.setGameState(gameState);
    continentPanel.setGameState(gameState);
    unitRenderer = new UnitRenderer(gameState, territories, unitDefs);

    // Purchase popup
    purchasePopup.setGameState(gameState);
    purchasePopup.setOnComplete(() => {
      camera.dirty = true;
    });
    purchasePopup.setOnHighlightTerritory((territory, highlight) => {
      territoryRenderer.setHoverHighlight(territory, highlight);
      camera.dirty = true;
    });

    // Movement UI
    movementUI.setGameState(gameState);
    movementUI.setOnHighlightTerritory((territory, highlight) => {
      territoryRenderer.setHoverHighlight(territory, highlight);
      camera.dirty = true;
    });
    movementUI.setOnMoveComplete((moveInfo) => {
      camera.dirty = true;
      // Log the movement/attack
      if (moveInfo) {
        const player = gameState.currentPlayer;
        if (moveInfo.isAttack) {
          actionLog.logAttack(moveInfo.from, moveInfo.to, player, null);
        } else if (moveInfo.captured) {
          actionLog.logCapture(moveInfo.to, player);
          // Log Risk card earned (one per turn for conquering)
          if (moveInfo.cardAwarded) {
            actionLog.logCardEarned(player, moveInfo.cardAwarded);
          }
        } else if (gameState.turnPhase === TURN_PHASES.NON_COMBAT_MOVE) {
          actionLog.logNonCombatMove(moveInfo.from, moveInfo.to, moveInfo.units, player);
        } else {
          actionLog.logMove(moveInfo.from, moveInfo.to, moveInfo.units, player);
        }
      }
    });
    movementUI.onCancel = () => {
      selectedTerritory = null;
      playerPanel.setSelectedTerritory(null);
      camera.dirty = true;
    };

    // Air Landing UI - consolidated landing after ALL combats
    airLandingUI.setGameState(gameState);
    airLandingUI.setOnTerritoryComplete((result) => {
      // Apply landings for this territory immediately
      combatUI.handleAirLandingComplete(result);
      camera.dirty = true;
    });
    airLandingUI.setOnComplete((result) => {
      // All territories done - clear destinations and proceed
      territoryRenderer.clearAirLandingDestinations();
      camera.dirty = true;
    });
    airLandingUI.setOnHighlightTerritory((territory, highlight) => {
      territoryRenderer.setHoverHighlight(territory, highlight);
      camera.dirty = true;
    });
    airLandingUI.setOnCenterCamera((territory) => {
      // Center camera on the territory
      if (territory && territory.center) {
        camera.panTo(territory.center[0], territory.center[1]);
      }
    });

    // Rocket Attack UI
    rocketUI.setGameState(gameState);
    rocketUI.setOnComplete(() => {
      camera.dirty = true;
    });

    // Combat UI
    combatUI.setGameState(gameState);
    combatUI.setActionLog(actionLog);
    combatUI.setOnComplete(() => {
      camera.dirty = true;
    });
    combatUI.setOnCombatStart((territory) => {
      // Center camera on the combat territory
      const t = territoryRenderer.territoryByName[territory];
      if (t && t.center) {
        camera.panTo(t.center[0], t.center[1]);
      }
    });
    // Air landing happens after each combat via player panel inline UI
    combatUI.setOnAirLandingRequired((data) => {
      // Use inline air landing UI in player panel
      playerPanel.setAirLanding(
        data.airUnitsToLand,
        data.combatTerritory,
        data.isRetreating,
        (result) => {
          // Air landing complete - pass result back to combat UI
          combatUI.handleAirLandingComplete(result);
          territoryRenderer.clearAirLandingDestinations();
          camera.dirty = true;
          syncManager?.pushStateNow?.();
        }
      );
      // Highlight valid destinations on map
      territoryRenderer.setAirLandingDestinations(playerPanel.getAirLandingDestinations());
      camera.dirty = true;
    });

    // Tech UI
    techUI.setGameState(gameState);
    techUI.setOnComplete(() => {
      camera.dirty = true;
      // Auto-advance from tech phase when done. Require PLAYING —
      // leftover setup turnPhase must not drive nextPhase / tech UI.
      if (gameState.phase === GAME_PHASES.PLAYING &&
          gameState.turnPhase === TURN_PHASES.DEVELOP_TECH) {
        gameState.nextPhase();
        syncManager?.pushStateNow(); // immediate push — no debounce
      }
    });

    // Placement UI
    placementUI.setGameState(gameState);
    placementUI.setOnComplete(() => {
      camera.dirty = true;
    });
    placementUI.setOnUnitPlaced((unitType, territory, player) => {
      actionLog.logInitialPlacement(player, unitType, territory);
    });

    // Mobilize UI
    mobilizeUI.setGameState(gameState);
    mobilizeUI.setOnComplete(() => {
      camera.dirty = true;
    });
    mobilizeUI.setOnUnitsMobilized((player, units, territory) => {
      actionLog.logMobilize(player, units, territory);
    });

    // Victory Screen
    victoryScreen.setGameState(gameState);

    // Action Log
    actionLog.setGameState(gameState);
    actionLog.setHighlightCallback((territories, highlight) => {
      if (highlight) {
        territoryRenderer.setHighlightedTerritories(territories);
      } else {
        territoryRenderer.clearHighlightedTerritories();
      }
      camera.dirty = true;
    });
    actionLog.setMovementHighlightCallback((from, to, highlight, isCombat) => {
      if (highlight) {
        territoryRenderer.setMovementArrow(from, to, isCombat);
      } else {
        territoryRenderer.clearMovementArrow();
      }
      camera.dirty = true;
    });
    actionLog.show();
    actionLog.logTurnStart(gameState.currentPlayer, gameState.round);

    // Continent Panel (includes Risk cards)
    continentPanel.setUnitDefs(unitDefs);
    continentPanel.setOnTradeCards(() => {
      if (shouldShowPurchase(gameState.phase, gameState.turnPhase)) {
        const result = gameState.tradeRiskCards(gameState.currentPlayer.id);
        if (result.success) {
          actionLog.logCardTrade(gameState.currentPlayer, result.ipcs);
          camera.dirty = true;
        }
      }
    });

    // Show panels (continentPanel hidden - info now in Players/Territory tabs)
    continentPanel.hide();
    playerPanel.show();
    turnSummaryModal.hide();
  };

  const ensureMultiplayerLobby = () => {
    if (multiplayerLobby) return multiplayerLobby;
    multiplayerLobby = new MultiplayerLobby(
      setup,
      (gameId, lobbyData) => {
        startMultiplayerGame(gameId, lobbyData);
      },
      async (action) => {
        if (action === 'rejoin') {
          if (!gameListUI) {
            gameListUI = new GameList(
              (gameId, game) => {
                console.log('[Main] onSelectGame called, hiding overlays');
                multiplayerLobby.hide();
                gameListUI.hide();
                startMultiplayerGame(gameId, game);
              },
              () => {
                multiplayerLobby.show();
              }
            );
            gameListUI.onOpenLobby = () => {
              ensureMultiplayerLobby();
              multiplayerLobby._browsingAway = false;
              const live = lobbyManager.getLobby();
              multiplayerLobby.mode = live && (!live.status || live.status === 'waiting')
                ? 'lobby'
                : 'menu';
              multiplayerLobby.show();
            };
          }
          multiplayerLobby.hide();
          gameListUI.show();
        } else if (action === 'rejoin-auth') {
          showRejoinAuth();
        } else if (action === 'signout' || shouldNavigateToHome({
          explicitExit: true,
          confirmedSignOut: action === 'signout',
          lastMatch: readLastMatch(),
        })) {
          lobby.show();
        } else {
          await restoreLiveLobbyOrGame();
        }
      }
    );
    multiplayerLobby.onCoverHome = () => lobby.hide();
    return multiplayerLobby;
  };

  const showRejoinAuth = () => {
    const afterAuth = (user) => {
      if (user) void resumeLastMatch({ interactive: true });
    };
    if (!authScreen) authScreen = new AuthScreen(afterAuth);
    else authScreen.onComplete = afterAuth;
    authScreen.show();
  };

  const resumeLastMatch = async ({ interactive = false } = {}) => {
    if (gameState?.isMultiplayer && gameState?.players?.length && syncManager?.gameId) {
      if (multiplayerLobby) multiplayerLobby.hide();
      if (gameListUI) gameListUI.hide();
      lobby.hide();
      return true;
    }
    if (multiplayerLobby) multiplayerLobby._resumeInFlight = true;
    try {
      if (!authManager.isAuthReady()) {
        try {
          await withTimeout(authManager.whenReady(), STARTUP_AUTH_TIMEOUT_MS, 'auth-ready');
        } catch (err) {
          console.warn('[Main] Auth restore timed out — using current session if any', err);
        }
      }
      const user = authManager.getUser();
      const last = readLastMatch();
      if (!user) {
        if (interactive) showRejoinAuth();
        return false;
      }
      if (!shouldAutoResumeLastMatch({ signedIn: true, lastMatch: last }) && !last) {
        return false;
      }
      if (!last?.gameId && !last?.lobbyCode) return false;

      const hydrated = await withTimeout(
        lobbyManager.hydrateLastMatch(last),
        STARTUP_RESUME_TIMEOUT_MS,
        'hydrate-last-match'
      );
      if (hydrated.kind === 'wait-auth' || hydrated.kind === 'show-auth') {
        if (interactive) showRejoinAuth();
        return false;
      }
      if (hydrated.kind === 'game' && hydrated.game) {
        const status = hydrated.game.status;
        if (status === 'waiting') return false;
        if (status && !shouldReconnectToGame({ exists: true, status })) return false;
        await startMultiplayerGame(hydrated.gameId || hydrated.game.id, hydrated.game);
        return !!(gameState?.players?.length);
      }
      if (hydrated.kind === 'lobby') {
        ensureMultiplayerLobby();
        multiplayerLobby.mode = 'lobby';
        multiplayerLobby.show();
        return true;
      }
      if (
        (hydrated.kind === 'finished' || hydrated.kind === 'missing')
        && shouldForgetLastMatchOnHydrateFailure({
          gameMissing: hydrated.kind === 'missing',
          gameFinished: hydrated.kind === 'finished',
        })
      ) {
        forgetLastMatch();
      }
      return false;
    } finally {
      if (multiplayerLobby) multiplayerLobby._resumeInFlight = false;
    }
  };

  const restoreLiveLobbyOrGame = async () => {
    const last = readLastMatch();
    ensureMultiplayerLobby();
    lobby.hide();
    const restored = await resumeLastMatch({ interactive: false });
    if (restored) return true;
    if (last?.gameId || last?.lobbyCode) {
      multiplayerLobby.showReconnectOnly();
      return true;
    }
    return false;
  };

  // Handle Play Online button click
  const handlePlayOnline = async () => {
    if (!isFirebaseConfigured()) {
      alert('Multiplayer is not configured. Please set up Firebase in src/multiplayer/firebase.js');
      lobby.show();
      return;
    }

    // Reload / version refresh: a restored Firebase user is still signed in
    // even before authReady. Only show Sign In after restore finishes empty.
    if (authManager.isLoggedIn()) {
      if (authScreen) authScreen.hide();
      const last = readLastMatch();
      if (shouldAutoResumeLastMatch({ signedIn: true, lastMatch: last })) {
        const restored = await resumeLastMatch({ interactive: true });
        if (restored) return;
      }
      ensureMultiplayerLobby();
      const resumeView = resolveResumeFailureView({ resumed: false, lastMatch: last });
      if (resumeView === 'reconnect') {
        multiplayerLobby.showReconnectOnly();
      } else if (resumeView === 'lobby') {
        await restoreLiveLobbyOrGame();
      } else {
        multiplayerLobby.show();
      }
      return;
    }

    if (!authManager.isAuthReady()
      || shouldShowSignInForm({
        authReady: authManager.isAuthReady(),
        userPresent: authManager.isLoggedIn(),
        user: authManager.getUser(),
      })) {
      if (!authScreen) {
        authScreen = new AuthScreen((user) => {
          if (user) handlePlayOnline();
          else if (shouldNavigateToHome({ explicitExit: true, lastMatch: readLastMatch() })) {
            lobby.show();
          } else {
            restoreLiveLobbyOrGame();
          }
        });
      } else {
        authScreen.onComplete = (user) => {
          if (user) handlePlayOnline();
          else if (shouldNavigateToHome({ explicitExit: true, lastMatch: readLastMatch() })) {
            lobby.show();
          } else {
            restoreLiveLobbyOrGame();
          }
        };
      }
      authScreen.show();
      return;
    }

    if (authScreen) authScreen.hide();
    ensureMultiplayerLobby();
    multiplayerLobby.show();
  };

  // Lobby (local games)
  const lobby = new Lobby(setup, (gameMode, selectedPlayers, options = {}) => {
    // Initialize game state for local game
    gameState = new GameState(setup, territories, continents);
    gameState.isMultiplayer = false;

    // Check if loading from save
    if (options.loadFromSave) {
      gameState.loadFromJSON(options.loadFromSave);
    } else {
      gameState.initGame(gameMode, selectedPlayers, options);
    }

    // Wire up all game components
    wireUpGameComponents();

    // Start with map overview - no auto-pan
    camera.dirty = true;
    if (isMobileShell()) {
      camera.usePhoneMinZoom = true;
      requestAnimationFrame(fitPhoneCamera);
    }
  }, handlePlayOnline);
  lobby.setOnRulesToggle(() => {
    rulesPanel.show();
  });

  onMobileShellChange(() => {
    if (lobby && !lobby.el?.classList.contains('hidden')) lobby._render();
  });

  // B38: a signed-in reload should reopen a STARTED match. A waiting
  // lobby (lobbyCode only) is not a started map — stay on Main Menu
  // (9.20.26.09). Do not pin the branded loader across tile fetches.
  const lastAtBoot = readLastMatch();
  const bootResume = shouldAutoResumeLastMatch({
    signedIn: true,
    lastMatch: lastAtBoot,
  });
  if (bootResume) {
    lobby.hide();
    reportStartupStatus('Rejoining match…', 70);
    if (!shouldHoldLoaderForLastMatchResume()) {
      ensureMultiplayerLobby();
      multiplayerLobby.showReconnectOnly();
      reportStartupStatus('Ready', 92);
      dismissStartupLoader();
    }
  } else {
    reportStartupStatus('Home ready', 100);
    dismissStartupLoader();
  }

  try {
    await withTimeout(mapRenderer.load(), STARTUP_MAP_LOAD_TIMEOUT_MS, 'map-tiles');
  } catch (err) {
    console.warn('[Main] Map tile load timed out — continuing without every tile', err);
  }

  let resumedLastMatch = false;
  if (isFirebaseConfigured() && bootResume) {
    try {
      resumedLastMatch = await resumeLastMatch({ interactive: false });
    } catch (err) {
      console.warn('[Main] Auto-resume last match failed — not dumping to home', err);
    }
    if (shouldShowReconnectAfterResumeAttempt({
      resumed: resumedLastMatch,
      resumeInFlight: !!mpStartGameId,
      alreadyInGame: !!(gameState?.players?.length),
      lastMatch: lastAtBoot,
    })) {
      const view = resolveStartupAfterHang({
        lastMatch: lastAtBoot,
        resumed: false,
      }) || resolveResumeFailureView({
        resumed: false,
        lastMatch: lastAtBoot,
      });
      if (view === 'lobby') {
        await restoreLiveLobbyOrGame();
      } else if (view === 'reconnect' || !shouldNavigateToHome({ lastMatch: lastAtBoot })) {
        ensureMultiplayerLobby();
        multiplayerLobby.showReconnectOnly();
      } else {
        lobby.show();
      }
    } else if (resumedLastMatch && multiplayerLobby) {
      multiplayerLobby.hide();
    }
    dismissStartupLoader();
  }

  // Canvas sizing
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  const beginPhoneSetupGesture = (e) => {
    if (phoneSetupGestureStart) return;
    if (!gameState || !isMobileShell() || !isPhoneSetupPlacementPhase(gameState.phase)) return;
    if (isPhoneHudChromeTarget(e.target)
      || isPhoneHandoffChromeTarget(e.target)
      || isPhoneTrayChromeTarget(e.target)
      || isPhoneCapitalCtaTarget(e.target)
      || pointHitsPhoneMapToolsChrome(e.clientX, e.clientY)
      || pointHitsPhoneHandoffChrome(e.clientX, e.clientY)
      || pointHitsPhaseGuideChrome(e.clientX, e.clientY)
      || shouldBlockMapForPhaseGuide()) return;
    phoneSetupGestureStart = { x: e.clientX, y: e.clientY };
    phoneSetupPeekThisGesture = false;
  };

  const finishPhoneSetupGesture = (e) => {
    const start = phoneSetupGestureStart;
    phoneSetupGestureStart = null;
    if (!start || !e) return false;
    const movedPx = Math.hypot(e.clientX - start.x, e.clientY - start.y);
    if (!shouldCommitPhoneSetupPeekAfterGesture({
      mobile: isMobileShell(),
      phase: gameState?.phase,
      movedPx,
    })) return false;
    if (applyPhoneSetupPeekFromPointer(e)) {
      phoneSetupPeekThisGesture = true;
      kickPaint();
      return true;
    }
    return false;
  };

  const applyPhoneSetupPeekFromPointer = (e) => {
    if (!gameState || !isMobileShell() || !isPhoneSetupPlacementPhase(gameState.phase)) return false;
    if (isPhoneHudChromeTarget(e.target)
      || isPhoneHandoffChromeTarget(e.target)
      || isPhoneTrayChromeTarget(e.target)
      || isPhoneCapitalCtaTarget(e.target)
      || pointHitsPhoneMapToolsChrome(e.clientX, e.clientY)
      || pointHitsPhoneHandoffChrome(e.clientX, e.clientY)
      || pointHitsPhaseGuideChrome(e.clientX, e.clientY)
      || shouldBlockMapForPhaseGuide()) return false;
    // Chip / hint / CTA row are chrome even when the event target is the
    // canvas (iPhone fat-finger / pointer-events gap). Point-in-chrome
    // must win before the map peek can overwrite a named land.
    if (playerPanel.containsPoint(e.clientX, e.clientY)) return false;
    if (playerPanel._phonePairFrozenAt
      && Date.now() - playerPanel._phonePairFrozenAt < 500) {
      return false;
    }
    // Peek ignores the leftover-tall sidebar box so a named land still
    // assigns. The visible tray chrome (Deploy / chips) is still a hit.
    if (playerPanel.shouldBlockMapSelect(Date.now(), { x: e.clientX, y: e.clientY })) {
      return false;
    }
    let world = camera.screenToWorld(e.clientX, e.clientY);
    let hit = territoryMap.hitTest(wrapX(world.x), world.y);
    if (!hit && shouldRefitPhoneSetupHit({
      mobile: true,
      phase: gameState.phase,
      hasHit: false,
    })) {
      resizeCanvas();
      fitPhoneCamera();
      world = camera.screenToWorld(e.clientX, e.clientY);
      hit = territoryMap.hitTest(wrapX(world.x), world.y);
    }
    if (!hit) return false;
    if (!shouldCommitPhoneSetupTap({
      mobile: true,
      phase: gameState.phase,
      inspected: phoneInspected,
    })) return false;
    if (!applyPhoneSetupPeekHit(hit)) return false;
    return true;
  };

  const applyPhoneSetupPeekHit = (hit) => {
    if (!hit || !gameState) return false;
    const tappedIsOwnedLand = !!(
      !hit.isWater
      && gameState.getOwner(hit.name) === gameState.currentPlayer?.id
    );
    const tappedIsLegalSea = isPhoneLegalSetupSeaDest({
      seaName: hit.name,
      playerId: gameState.currentPlayer?.id,
      territories,
      getOwner: (name) => gameState.getOwner(name),
      getUnits: (name) => gameState.getUnitsAt?.(name) || [],
    });
    const tappedIsLand = !hit.isWater;
    const tappedIsWater = !!hit.isWater;
    if (!shouldApplyPhoneSetupLandTap({
      mobile: true,
      phase: gameState.phase,
      inspected: phoneInspected,
      selectedUnitType: playerPanel.selectedUnitType,
      tappedIsOwnedLand,
      tappedIsLegalSea,
      tappedIsLand,
      tappedIsWater,
      hasHit: true,
      landName: hit.name,
      currentPlayerId: gameState.currentPlayer?.id,
    })) return false;

    if (gameState.phase === GAME_PHASES.CAPITAL_PLACEMENT) {
      const { capitalLandName } = applyCapitalPlacementPeek({
        phase: gameState.phase,
        hit,
        currentPlayerId: gameState.currentPlayer?.id,
        getOwner: (name) => gameState.getOwner(name),
      });
      selectedTerritory = hit;
      playerPanel._phoneCapitalLandName = capitalLandName;
      // Inspect cue is the tile outline only. A toast here stacked
      // when canvas mouseup re-applied the same peek (V2.81.32).
    } else {
      selectedTerritory = hit;
      if (gameState.phase === GAME_PHASES.UNIT_PLACEMENT) {
        playerPanel._phoneDeployLandName = hit.name;
      }
    }
    if (isMobileShell()) {
      territoryRenderer.setPhoneTilePulse(hit.name, 'select', PHONE_SELECT_PULSE_MS);
    }
    playerPanel.setSelectedTerritory(hit);
    hud.setLastClick({ landed: true, label: hit.name });
    hud._render();
    kickPaint();
    return true;
  };

  // Mouse events
  canvas.addEventListener('mousedown', (e) => {
    // B31: Max hover can sit over the map / LOG. A click whose coordinates
    // are inside the deploy panel must never select a territory.
    // Place Capital: a leftover-tall peek box must not swallow the land tap.
    const blockMapAsPanel = playerPanel.shouldBlockMapSelect(Date.now(), { x: e.clientX, y: e.clientY })
      && !shouldIgnorePanelBoxForPhoneCapitalPeek({
        mobile: isMobileShell(),
        phase: gameState?.phase,
      });
    if (blockMapAsPanel || shouldBlockMapForPhaseGuide() || pointHitsPhaseGuideChrome(e.clientX, e.clientY)) {
      e.preventDefault();
      if (blockMapAsPanel) playerPanel._onPanelPointerDown(e);
      return;
    }
    e.preventDefault();
    // Phone tap-to-toggle: keep the card up through mousedown so mouseup
    // can close the same territory instead of immediately re-showing it.
    // DevTools device mode has no fromTouch — still treat it as a phone tap.
    if (!isMobileShell()) {
      tooltip.hide();
    }
    unitTooltip.hide();
    clearPhoneHold();
    phoneInspected = false;
    phoneHoldStart = { x: e.clientX, y: e.clientY };
    if (isMobileShell() && gameState && !shouldShowPhoneTooltipOnTap({
      mobile: true, phase: gameState.phase,
    })) {
      phoneHoldTimer = setTimeout(() => {
        phoneHoldTimer = null;
        if (!isMobileShell() || !gameState) return;
        const world = camera.screenToWorld(phoneHoldStart.x, phoneHoldStart.y);
        const hit = territoryMap.hitTest(wrapX(world.x), world.y);
        if (!hit) return;
        if (!shouldInspectPhoneHold({
          mobile: true,
          phase: gameState.phase,
          heldMs: PHONE_INSPECT_HOLD_MS,
          movedPx: 0,
        })) return;
        phoneInspected = true;
        tooltip.show(hit, phoneHoldStart.x, phoneHoldStart.y, { inspect: true });
      }, PHONE_INSPECT_HOLD_MS);
    }

    // Check if we should start a unit drag (during movement phases)
    if (gameState && e.button === 0) {
      const turnPhase = gameState.turnPhase;
      const isMovementPhase =
        turnPhase === TURN_PHASES.COMBAT_MOVE ||
        turnPhase === TURN_PHASES.NON_COMBAT_MOVE ||
        turnPhase === TURN_PHASES.CONDUCT_COMBAT; // For retreat

      if (isMovementPhase && !gameState.currentPlayer?.isAI) {
        const world = camera.screenToWorld(e.clientX, e.clientY);
        const wrappedX = wrapX(world.x);
        const hit = territoryMap.hitTest(wrappedX, world.y);

        if (hit) {
          const units = gameState.getUnitsAt(hit.name);
          const playerUnits = units?.filter(u => u.owner === gameState.currentPlayer.id) || [];

          if (playerUnits.length > 0) {
            // Store potential drag start
            dragStartPos = { x: e.clientX, y: e.clientY };
            dragSourceTerritory = hit;
            dragCurrentPos = { x: e.clientX, y: e.clientY };
          }
        }
      }
    }

    beginPhoneSetupGesture(e);
    camera.onMouseDown(e);
    canvas.classList.add('panning');
  });

  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    beginPhoneSetupGesture(e);
  });

  // Capture on document so a leftover-tall peek sidebar over a named land
  // still records the gesture. Peek commits on pointerup if it was a tap.
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    beginPhoneSetupGesture(e);
  }, true);

  document.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    finishPhoneSetupGesture(e);
  }, true);

  document.addEventListener('pointercancel', () => {
    phoneSetupGestureStart = null;
    phoneSetupPeekThisGesture = false;
  }, true);

  canvas.addEventListener('mousemove', (e) => {
    // Check for unit drag-and-drop
    if (dragSourceTerritory && !isDraggingUnits) {
      const dx = e.clientX - dragStartPos.x;
      const dy = e.clientY - dragStartPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > DRAG_THRESHOLD) {
        // Start dragging
        isDraggingUnits = true;
        canvas.classList.add('dragging-units');

        // Select the stack BEFORE asking for dests. An empty selection used
        // to preview every adjacent sea zone as a combat-move attack.
        const units = gameState.getUnitsAt(dragSourceTerritory.name) || [];
        const playerUnits = units.filter(u => u.owner === gameState.currentPlayer.id);
        playerPanel.setSelectedTerritory(dragSourceTerritory);
        playerPanel.moveSelectedUnits = {};
        for (const unit of playerUnits) {
          const def = unitDefs[unit.type];
          if (def && (def.movement || 0) > 0 && !unit.moved) {
            playerPanel.moveSelectedUnits[unit.type] = unit.quantity || 1;
          }
        }
        const isCombatMove = gameState.turnPhase === TURN_PHASES.COMBAT_MOVE;
        dragValidDestinations = playerPanel._getValidDestinations(dragSourceTerritory, gameState.currentPlayer, isCombatMove);

        camera.dirty = true;
      }
    }

    if (isDraggingUnits) {
      // Update drag position
      dragCurrentPos = { x: e.clientX, y: e.clientY };

      // Get territory under cursor
      const world = camera.screenToWorld(e.clientX, e.clientY);
      const wrappedX = wrapX(world.x);
      const hit = territoryMap.hitTest(wrappedX, world.y);

      hoverTerritory = hit;
      camera.dirty = true;

      // Update highlighting based on valid destinations
      if (hit) {
        const isValid = dragValidDestinations.some(d => d.name === hit.name);
        const isEnemy = dragValidDestinations.find(d => d.name === hit.name)?.isEnemy;
        territoryRenderer.setDragDestination(hit.name, isValid, isEnemy);
      } else {
        territoryRenderer.setDragDestination(null, false, false);
      }

      return;
    }

    if (phoneHoldStart) {
      const dx = e.clientX - phoneHoldStart.x;
      const dy = e.clientY - phoneHoldStart.y;
      if (Math.hypot(dx, dy) >= PHONE_INSPECT_MOVE_PX) {
        clearPhoneHold();
        phoneHoldStart = null;
      }
    }

    // Handle camera panning (only when mouse button is held down and dragging)
    const moved = camera.onMouseMove(e);
    if (moved) {
      // Camera is being panned - cancel drag and hide tooltips
      dragSourceTerritory = null;
      isDraggingUnits = false;
      canvas.classList.remove('dragging-units');
      canvas.classList.add('panning');
      canvas.classList.remove('hovering');
      hoverTerritory = null;
      tooltip.hide();
      unitTooltip.hide();
      clearPhoneHold();
      phoneHoldStart = null;
      if (hoverTooltipTimeout) {
        clearTimeout(hoverTooltipTimeout);
        hoverTooltipTimeout = null;
      }
      camera.dirty = true;
      return;
    }

    // Remove panning class when not panning
    canvas.classList.remove('panning');

    // HOVER DETECTION - Always runs when not panning
    // This should work in ALL phases including initial deployment
    const world = camera.screenToWorld(e.clientX, e.clientY);
    const wrappedX = wrapX(world.x);

    // Debug: log to console to verify hover detection is running
    // console.log('Hover check at:', wrappedX, world.y);

    // First check for unit icon hover (higher priority than territory)
    let unitHit = null;
    if (unitRenderer && gameState) {
      unitHit = unitRenderer.hitTestUnit(wrappedX, world.y, camera.zoom);
    }

    if (unitHit) {
      // Hovering over a unit icon - show unit tooltip
      unitTooltip.show(unitHit, e.clientX, e.clientY);
      tooltip.hide();
      if (hoverTooltipTimeout) {
        clearTimeout(hoverTooltipTimeout);
        hoverTooltipTimeout = null;
      }
      canvas.classList.add('hovering');
      if (hoverTerritory !== null) {
        hoverTerritory = null;
        camera.dirty = true;
      }
    } else {
      // Not over a unit - check for territory hover
      unitTooltip.hide();
      const hit = territoryMap.hitTest(wrappedX, world.y);

      // Update hover territory if changed
      if (hit !== hoverTerritory) {
        const previousTerritory = hoverTerritory;
        hoverTerritory = hit;
        camera.dirty = true;

        // Territory changed - reset tooltip timer
        if (hoverTooltipTimeout) {
          clearTimeout(hoverTooltipTimeout);
          hoverTooltipTimeout = null;
        }
        tooltip.hide();

        // Start new tooltip timer if hovering over a territory
        if (hit && gameState && shouldShowPhoneTooltipOnHover({ mobile: isMobileShell() })) {
          lastHoverPos = { x: e.clientX, y: e.clientY };
          hoverTooltipTimeout = setTimeout(() => {
            // Only show if still hovering over the same territory
            if (hoverTerritory === hit) {
              tooltip.show(hit, lastHoverPos.x, lastHoverPos.y);
            }
            hoverTooltipTimeout = null;
          }, TOOLTIP_DELAY);
        }
      } else if (hit && gameState) {
        // Same territory - update mouse position for tooltip
        lastHoverPos = { x: e.clientX, y: e.clientY };
        if (tooltip.isVisible) {
          tooltip.show(hit, e.clientX, e.clientY);
        }
      }

      canvas.classList.toggle('hovering', !!hit);
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    const wasDrag = camera.onMouseUp();
    canvas.classList.remove('panning');
    canvas.classList.remove('dragging-units');
    clearPhoneHold();
    phoneHoldStart = null;

    // Handle drag-and-drop unit movement completion
    if (isDraggingUnits && dragSourceTerritory) {
      const world = camera.screenToWorld(e.clientX, e.clientY);
      const hit = territoryMap.hitTest(wrapX(world.x), world.y);

      // Check if dropped on a valid destination
      const validDest = hit && dragValidDestinations.find(d => d.name === hit.name);

      if (validDest) {
        // Execute the move
        playerPanel.movePendingDest = hit.name;

        // Confirm the move
        const unitsToMove = Object.entries(playerPanel.moveSelectedUnits || {})
          .filter(([type, qty]) => Number(qty) > 0 && unitDefs[type])
          .map(([type, quantity]) => ({ type, quantity: Number(quantity) }));
        const result = gameState.moveUnits(
          dragSourceTerritory.name,
          hit.name,
          unitsToMove,
          unitDefs,
        );

        if (result.success) {
          actionLog.logMove(
            gameState.currentPlayer,
            dragSourceTerritory.name,
            hit.name,
            Object.entries(playerPanel.moveSelectedUnits)
              .filter(([_, qty]) => qty > 0)
              .map(([type, qty]) => ({ type, quantity: qty })),
            result.isAttack
          );
        }

        // Reset movement state
        playerPanel.moveSelectedUnits = {};
        playerPanel.movePendingDest = null;
      }

      // Clear drag state
      isDraggingUnits = false;
      dragSourceTerritory = null;
      dragValidDestinations = [];
      territoryRenderer.setDragDestination(null, false, false);
      camera.dirty = true;
      return;
    }

    // Clear potential drag state
    dragSourceTerritory = null;

    console.log('[MouseUp] wasDrag:', wasDrag, 'Phase:', gameState?.phase);

    const alreadyPeeked = phoneSetupPeekThisGesture;
    phoneSetupPeekThisGesture = false;
    // Document-capture pointerup is the only Place Capital / Deploy peek.
    // Canvas mouseup must not re-apply (toast stack / leftover Confirm).
    if (alreadyPeeked
      || (isMobileShell() && gameState && isPhoneSetupPlacementPhase(gameState.phase))) {
      if (selectedTerritory) playerPanel.setSelectedTerritory(selectedTerritory);
      kickPaint();
      return;
    }

    if (!wasDrag) {
      // A panel + / Max / Deploy tap must not select the territory under
      // the finger (B22 / B31 East US) even when the canvas is the target.
      // Place Capital: leftover tray chrome must not block the named-land tap.
      const blockMapAsPanel = playerPanel.shouldBlockMapSelect(Date.now(), { x: e.clientX, y: e.clientY })
        && !shouldIgnorePanelBoxForPhoneCapitalPeek({
          mobile: isMobileShell(),
          phase: gameState?.phase,
        });
      if (blockMapAsPanel || shouldBlockMapForPhaseGuide() || pointHitsPhaseGuideChrome(e.clientX, e.clientY)) {
        if (blockMapAsPanel) playerPanel.commitLockedPanelGesture(e);
        camera.dirty = true;
        return;
      }
      const world = camera.screenToWorld(e.clientX, e.clientY);
      const wrappedWorldX = wrapX(world.x);
      const hit = territoryMap.hitTest(wrappedWorldX, world.y);
      console.log('[MouseUp] Hit test result:', hit?.name || 'null');

      // DEBUG: Log sea zone click coordinates for positioning naval units
      if (DEBUG_SEA_ZONE_CLICKS && hit && hit.isWater) {
        // Store absolute coordinates where user clicked
        const clickX = Math.round(wrappedWorldX);
        const clickY = Math.round(world.y);

        // Add to accumulated list (replace if same zone clicked again)
        const existingIdx = DEBUG_SEA_ZONE_OFFSETS.findIndex(o => o.name === hit.name);
        if (existingIdx >= 0) {
          DEBUG_SEA_ZONE_OFFSETS[existingIdx] = { name: hit.name, x: clickX, y: clickY };
        } else {
          DEBUG_SEA_ZONE_OFFSETS.push({ name: hit.name, x: clickX, y: clickY });
        }

        // Build complete output string
        const allCoords = DEBUG_SEA_ZONE_OFFSETS
          .map(o => `    '${o.name}': { x: ${o.x}, y: ${o.y} },`)
          .join('\n');

        // Create or update a copyable text box on screen
        let debugBox = document.getElementById('debug-sea-zone-box');
        if (!debugBox) {
          debugBox = document.createElement('div');
          debugBox.id = 'debug-sea-zone-box';
          debugBox.style.cssText = 'position:fixed;top:10px;right:10px;width:400px;max-height:80vh;background:#222;border:2px solid #4CAF50;border-radius:8px;z-index:9999;font-family:monospace;font-size:12px;';
          debugBox.innerHTML = `
            <div style="background:#4CAF50;color:white;padding:8px;font-weight:bold;">
              Sea Zone Centers - Zoom: <span id="debug-zoom">1.0</span>
              <button id="debug-copy-btn" style="float:right;background:#fff;color:#222;border:none;padding:4px 12px;cursor:pointer;border-radius:4px;">Copy All</button>
            </div>
            <textarea id="debug-offsets-text" style="width:100%;height:300px;background:#111;color:#0f0;border:none;padding:10px;box-sizing:border-box;resize:vertical;" readonly></textarea>
            <div style="padding:8px;color:#aaa;">Total: <span id="debug-count">0</span> zones</div>
          `;
          document.body.appendChild(debugBox);

          document.getElementById('debug-copy-btn').addEventListener('click', () => {
            const textarea = document.getElementById('debug-offsets-text');
            textarea.select();
            document.execCommand('copy');
            showNotification('Copied to clipboard!', 2000);
          });
        }

        document.getElementById('debug-offsets-text').value = allCoords;
        document.getElementById('debug-count').textContent = DEBUG_SEA_ZONE_OFFSETS.length;
        document.getElementById('debug-zoom').textContent = camera.zoom.toFixed(2);

        // Show on screen
        showNotification(`${hit.name}: [${clickX}, ${clickY}]`, 2000);
      }

      // Initial placement now uses inline UI in player panel - don't intercept clicks
      // Just let the territory selection flow through to setSelectedTerritory

      // Check if we're in mobilize phase
      if (hit && gameState && mobilizeUI.isActive()) {
        const handled = mobilizeUI.handleTerritoryClick(hit);
        if (handled) {
          camera.dirty = true;
          return;
        }
      }

      // Check if we're in purchase phase
      if (hit && gameState && purchasePopup.isPurchasePhase()) {
        const handled = purchasePopup.handleTerritoryClick(hit);
        if (handled) {
          camera.dirty = true;
          return;
        }
      }

      // Check if consolidated air landing UI is active (after all combats)
      if (hit && gameState && airLandingUI.isActive()) {
        const handled = airLandingUI.handleTerritoryClick(hit);
        if (handled) {
          // Update map highlighting for valid destinations
          territoryRenderer.setAirLandingDestinations(airLandingUI.getAllValidDestinations());
          camera.dirty = true;
          return;
        }
      }

      // Check if we're in air landing phase (inline UI in player panel - legacy)
      if (hit && gameState && playerPanel.isAirLandingActive()) {
        const handled = playerPanel.handleAirLandingTerritoryClick(hit);
        if (handled) {
          // Update map highlighting for valid destinations
          territoryRenderer.setAirLandingDestinations(playerPanel.getAirLandingDestinations());
          camera.dirty = true;
          return;
        }
      }

      // Check if clicking a destination during movement (inline UI)
      if (hit && gameState && (gameState.turnPhase === TURN_PHASES.COMBAT_MOVE || gameState.turnPhase === TURN_PHASES.NON_COMBAT_MOVE)) {
        // Try to set as destination first (if units are selected)
        const handled = playerPanel.handleMapDestinationClick(hit);
        if (handled) {
          camera.dirty = true;
          return;
        }
      }

      // Check if clicking during mobilize phase - set selected territory for inline mobilize UI
      if (hit && gameState && gameState.turnPhase === TURN_PHASES.MOBILIZE) {
        // Always update selected territory during mobilize, playerPanel will validate
        selectedTerritory = hit;
        playerPanel.setSelectedTerritory(hit);
        camera.dirty = true;
        return;
      }

      if (hit) {
        console.log('[Click] Territory selected:', hit.name, 'Phase:', gameState?.phase);
        if (isMobileShell() && gameState && !shouldCommitPhoneSetupTap({
          mobile: true,
          phase: gameState.phase,
          inspected: phoneInspected,
        })) {
          phoneInspected = false;
          camera.dirty = true;
          return;
        }
        if (isMobileShell() && gameState && isPhoneSetupPlacementPhase(gameState.phase)) {
          if (!applyPhoneSetupPeekHit(hit)) {
            camera.dirty = true;
          }
          return;
        }
        if (gameState.phase === GAME_PHASES.CAPITAL_PLACEMENT) {
          const { capitalLandName } = applyCapitalPlacementPeek({
            phase: gameState.phase,
            hit,
            currentPlayerId: gameState.currentPlayer?.id,
            getOwner: (name) => gameState.getOwner(name),
          });
          playerPanel._phoneCapitalLandName = capitalLandName;
        }
        selectedTerritory = hit;
        playerPanel.setSelectedTerritory(hit);
        hud.setLastClick({ landed: true, label: hit.name });
        hud._render();
        // Phone setup: tap places / selects — do not open the inspect sheet.
        // Playing still tap-to-toggles. Long-press inspect is a small edge card.
        // Tablet (fromTouch, not mobile-shell) keeps the V2.64 peek.
        // Desktop mouse hover is unchanged — no fromTouch, not mobile-shell.
        if (isMobileShell() && gameState && shouldShowPhoneTooltipOnTap({
          mobile: true, phase: gameState.phase,
        })) {
          if (shouldToggleOffPhoneTooltip({
            mobile: true,
            visibleName: tooltip.currentTerritory?.name,
            tappedName: hit.name,
          })) {
            tooltip.hide();
          } else {
            tooltip.show(hit, e.clientX, e.clientY);
          }
        } else if (!isMobileShell() && e.fromTouch && gameState) {
          tooltip.show(hit, e.clientX, e.clientY);
        }
      } else {
        if (isMobileShell()) hidePhoneTooltips('tap-away');
        if (isMobileShell() && gameState && !shouldApplyPhoneSetupLandTap({
          mobile: true,
          phase: gameState.phase,
          inspected: phoneInspected,
          selectedUnitType: playerPanel.selectedUnitType,
          tappedIsOwnedLand: false,
          hasHit: false,
        })) {
          camera.dirty = true;
          return;
        }
        selectedTerritory = null;
        playerPanel.setSelectedTerritory(null);
        hud.setLastClick({ landed: false, label: 'map' });
        movementUI.cancel();
      }
      kickPaint();
    }
  });

  canvas.addEventListener('wheel', (e) => camera.onWheel(e), { passive: false });

  // Touch support (tablet/mobile): translates touch gestures into the same
  // synthetic mouse/wheel events handled above. Additive — desktop mouse
  // handling is untouched. Pinch-zoom enabled on the main map only.
  initTouchInput(canvas, { enablePinch: true });
  initTouchInput(document.getElementById('minimap'));

  initZoomControls(canvas, {
    onFit: () => {
      fitPhoneCamera({ userTapped: true });
      kickPaint();
    },
    onZoomStep: (dir) => {
      const dpr = devicePixelRatio || 1;
      camera.zoomBy(dir, {
        sx: canvas.width / dpr / 2,
        sy: canvas.height / dpr / 2,
      });
      kickPaint();
    },
    onZoom: kickPaint,
  });

  canvas.addEventListener('mouseleave', () => {
    tooltip.hide();
    unitTooltip.hide();
    hoverTerritory = null;
    camera.dirty = true;
    // Clear hover tooltip timeout
    if (hoverTooltipTimeout) {
      clearTimeout(hoverTooltipTimeout);
      hoverTooltipTimeout = null;
    }
  });

  window.addEventListener('mouseup', () => {
    if (camera.isDragging) {
      camera.onMouseUp();
      canvas.classList.remove('panning');
    }
  });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    // Never intercept keys while the user is typing in a form field
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'Escape') {
      selectedTerritory = null;
      playerPanel.setSelectedTerritory(null);
      camera.dirty = true;
    }

    // Space / Enter: press the primary advance button (End Phase / Done /
    // Deploy / Confirm Move) — whatever the sidebar currently shows. Clicking
    // the visible button inherits every context guard the mouse path has.
    if ((e.key === ' ' || e.key === 'Enter') && gameState) {
      // Handoff overlay open: confirm it instead of acting through it
      const handoffBtn = document.querySelector('.handoff-overlay:not(.hidden) .handoff-start-btn');
      if (handoffBtn) {
        e.preventDefault();
        handoffBtn.click();
        return;
      }
      const sidebar = document.getElementById('sidebar');
      const advanceBtn =
        sidebar?.querySelector('[data-action="confirm-placement"]:not([disabled])') ||
        sidebar?.querySelector('[data-action="finish-placement"]:not([disabled])') ||
        sidebar?.querySelector('[data-action="next-phase"]:not([disabled])');
      if (advanceBtn) {
        e.preventDefault();
        advanceBtn.click();
      }
    }

    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      if (gameState) gameState.saveToFile();
    }

    if (e.ctrlKey && e.key === 'l') {
      e.preventDefault();
      if (gameState) {
        gameState.loadFromFile().then(() => {
          camera.dirty = true;
        }).catch(console.error);
      }
    }
  });

  // Render loop
  let lastPhoneSetupPhase = null;
  function render() {
    camera.update();
    const setupPhase = gameState?.phase || null;
    if (setupPhase !== lastPhoneSetupPhase) {
      if (setupPhase === GAME_PHASES.UNIT_PLACEMENT) {
        hidePhoneTooltips('deploy-open');
        tooltip.hide();
        unitTooltip.hide();
        playerPanel._phoneCapitalLandName = null;
      }
      lastPhoneSetupPhase = setupPhase;
    }

    if (unitRenderer) {
      const nextHighlight = isMobileShell() ? playerPanel.selectedUnitType : null;
      if (unitRenderer.highlightUnitType !== nextHighlight) {
        unitRenderer.highlightUnitType = nextHighlight;
        camera.dirty = true;
      }
    }

    if (camera.dirty) {
      camera.dirty = false;

      const dpr = devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#3CC0BF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      camera.applyTransform(ctx);

      const viewport = camera.getViewport();
      const startCopy = Math.floor(viewport.x / MAP_WIDTH);
      const endCopy = Math.floor((viewport.x + viewport.width) / MAP_WIDTH);

      for (let copy = startCopy; copy <= endCopy; copy++) {
        const offsetX = copy * MAP_WIDTH;

        ctx.save();
        ctx.translate(offsetX, 0);

        const localViewport = {
          x: viewport.x - offsetX,
          y: viewport.y,
          width: viewport.width,
          height: viewport.height,
        };

        // Render layers
        mapRenderer.render(ctx, localViewport, {
          flatOcean: shouldSkipPhoneMapArt(camera.zoom, {
            mobile: isMobileShell(),
            setup: isPhoneSetupPlacementPhase(gameState?.phase),
          }),
        });

        // Mask baked-in rectangular sea-zone artwork with accurate water
        // polygon fills (visual only — click hit-testing is unaffected).
        // Phone setup uses flat ocean — the mask stroke aliases as jagged
        // dark coasts (Skeptic V2.81.33 Fit+world).
        if (!shouldSkipPhoneWaterMask({
          mobile: isMobileShell(),
          setup: isPhoneSetupPlacementPhase(gameState?.phase),
        })) {
          territoryRenderer.renderWaterMask(ctx);
        }

        // Continent indicators FIRST (underneath ownership)
        territoryRenderer.renderContinentIndicators(ctx);

        // Territory overlays (colored by continent - Risk style)
        territoryRenderer.renderOwnershipOverlays(ctx, camera.zoom);

        // Subtle terrain texture (rivers, mountains)
        territoryRenderer.renderTerrainTexture(ctx, camera.zoom);

        // Continent labels (when zoomed out)
        territoryRenderer.renderContinentLabels(ctx, camera.zoom);

        // Territory outlines
        territoryRenderer.renderTerritoryOutlines(ctx, camera.zoom);

        // Cross-water connection lines
        territoryRenderer.renderCrossWaterConnections(ctx, camera.zoom);

        // Valid move destinations (highlight during movement phase or drag-and-drop)
        if (isDraggingUnits && dragValidDestinations.length > 0) {
          // During drag-and-drop, show valid destinations
          const destinations = dragValidDestinations.map(d => d.name);
          const isEnemy = dragValidDestinations.reduce((acc, d) => {
            acc[d.name] = d.isEnemy;
            return acc;
          }, {});
          territoryRenderer.renderValidMoveDestinations(ctx, destinations, isEnemy);

          // Also highlight source territory
          if (dragSourceTerritory) {
            territoryRenderer.renderSelected(ctx, dragSourceTerritory);
          }
        } else if (movementUI.isMovementPhase() && movementUI.hasUnitsSelected()) {
          const { destinations, isEnemy } = movementUI.getDestinationsWithEnemyFlags();
          territoryRenderer.renderValidMoveDestinations(ctx, destinations, isEnemy);

          // Air movement visualization (flight paths and reachable territories)
          const airViz = movementUI.getAirMovementVisualization();
          if (airViz) {
            territoryRenderer.setAirMovementVisualization(airViz.source, airViz.reachable);
          } else {
            territoryRenderer.clearAirMovementVisualization();
          }
        } else {
          territoryRenderer.clearAirMovementVisualization();
        }

        // Opening Place Capital / Initial Deploy: owned/legal edge on this
        // paint, before any land tap. Peek is not a prerequisite.
        if (isMobileShell() && gameState) {
          territoryRenderer.setPhoneLegalTerritories(collectPhoneLegalTerritoryNames({
            mobile: true,
            phase: gameState.phase,
            playerId: gameState.currentPlayer?.id,
            territories,
            getOwner: (name) => gameState.getOwner(name),
            getUnits: (name) => gameState.getUnitsAt?.(name) || [],
          }), gameState.currentPlayer?.color);
          territoryRenderer.renderPhoneLegalHighlights(ctx, camera.zoom);
          territoryRenderer.renderPhoneTilePulse(ctx, camera.zoom);
          if (territoryRenderer.phoneTilePulseActive()) camera.dirty = true;
        } else {
          territoryRenderer.setPhoneLegalTerritories([]);
        }

        // Hover + selection
        if (hoverTerritory && hoverTerritory !== selectedTerritory) {
          territoryRenderer.renderHover(ctx, hoverTerritory);
        }
        if (selectedTerritory) {
          territoryRenderer.renderSelected(ctx, selectedTerritory);
        }

        // Highlight source territory during movement
        if (movementUI.getSelectedSource()) {
          territoryRenderer.renderSelected(ctx, movementUI.getSelectedSource());
        }

        // Action log hover highlights
        territoryRenderer.renderActionLogHighlights(ctx);

        // Movement arrow for action log
        territoryRenderer.renderMovementArrow(ctx);

        // Air movement visualization (flight paths)
        territoryRenderer.renderAirMovementVisualization(ctx);

        // Air landing destination highlights
        territoryRenderer.renderAirLandingDestinations(ctx);

        // Programmatic hover highlight (from dropdown)
        territoryRenderer.renderHoverHighlight(ctx);

        // Drag-and-drop destination highlight
        if (isDraggingUnits) {
          territoryRenderer.renderDragDestination(ctx);
        }

        // Labels — hide the peeked/owned stack tile so the flag is the read.
        territoryRenderer.peekedLabelName = isMobileShell()
          ? (playerPanel?._phoneDeployLandName
            || playerPanel?._phoneCapitalLandName
            || selectedTerritory?.name
            || null)
          : null;
        territoryRenderer.renderLabels(ctx, camera.zoom);

        // Ownership flags (small flags on each territory)
        territoryRenderer.renderOwnershipFlags(ctx, camera.zoom);

        // Capital markers (big flags)
        territoryRenderer.renderCapitals(ctx, camera.zoom);

        // Units
        if (unitRenderer) {
          unitRenderer.render(ctx, camera.zoom);
        }

        ctx.restore();
      }

      minimap.render();
    }

    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);

  if (!lastAtBoot?.gameId && !lastAtBoot?.lobbyCode) {
    reportStartupStatus('Home ready', 100);
  } else if (!resumedLastMatch) {
    reportStartupStatus('Ready', 100);
  }
  dismissStartupLoader();
}

if (resolveUxMode() === UX_THREE) {
  const boot = isPocketPreviewRequested()
    ? import('./map/uxPreview.js').then((mod) => mod.bootUxPreview())
    : import('./map/threeSoloBoot.js').then((mod) => mod.bootThreeSolo());
  boot.catch((err) => {
    console.error('Failed to start Experimental UX:', err);
    reportStartupError('Could not start Experimental UX. Classic Canvas is unchanged at / or ?ux=classic.');
  });
} else {
  init().catch((err) => {
    console.error('Failed to initialize:', err);
    reportStartupError('Could not start Tactical Risk. Local saves and in-progress games stay on this device.');
  });
}
