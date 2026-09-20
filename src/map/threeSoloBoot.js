// Classic 1942 solo vs AI under Three chrome.
// S2–S6: phase shell, combat-move, combat/casualties, air land, NCM.
// Preview only. Do not merge to main. Do not grow uxPreviewScenario.js.

import { Camera, MAP_WIDTH } from './camera.js';
import { MapRenderer } from './mapRenderer.js';
import { TerritoryRenderer } from './territoryRenderer.js';
import { TerritoryMap } from './territoryMap.js';
import { injectThreeChrome, applyLiveStamp, liveGameVersion } from './threeMapChrome.js';
import {
  preloadUnitImages,
  renderPreviewStacks,
  hitTestPreviewStack,
  territoryCenter,
} from './uxPreviewUnits.js';
import {
  dismissStartupLoader,
  reportStartupError,
  reportStartupStatus,
} from '../ui/startupLoader.js';
import { GAME_VERSION } from '../version.js';
import { createThreeMpSession } from './threeMpSession.js';
import { UX_CLASSIC, UX_THREE, navigateUxMode } from './presentationMode.js';
import { bindDiscordTurnPing } from '../multiplayer/discordTurnPing.js';
import {
  bindSealedActivate,
  clientPointOf,
  eventElement,
  shouldIgnoreMapHit,
} from './threeChromeEvents.js';
import { AIController } from '../ai/aiController.js';
import { GAME_PHASES, TURN_PHASE_NAMES } from '../state/gameState.js';
import {
  startClassicSolo,
  startSoloMatch,
  placementsFromState,
  inspectSolo,
  DEFAULT_HUMAN_SEAT,
} from './threeSoloMatch.js';
import {
  createSoloLobby,
  applyLobbyAction,
  lobbyCanStart,
  lobbyStartOptions,
  lobbyInspect,
} from './threeSoloLobby.js';
import {
  shouldShowSetupTutorial,
  dismissTutorial,
} from './threeSetupTutorial.js';
import {
  createSoloPlay,
  tapLand,
  adjustUnit,
  adjustLanding,
  adjustLoss,
  confirm as confirmPlay,
  chromeModel,
  inspectPlay,
  highlights,
  undoLast,
  pickShip,
  applyCargoSeed,
  LAND_TEAL,
} from './threeSoloPlay.js';

const SELECT_GOLD = '#C4A35A';
const EUROPE_FIT = { minX: 620, minY: 180, maxX: 1680, maxY: 980 };

function applyLiveContinents(list, bonusGroups) {
  const of = new Map();
  for (const c of bonusGroups || []) {
    for (const n of c.territories || []) of.set(n, c.name);
  }
  for (const t of list || []) {
    if (of.has(t.name)) t.continent = of.get(t.name);
  }
}

function strokeSelectOutline(ctx, territory, territoryRenderer, zoom, {
  color = SELECT_GOLD,
  dashed = false,
  width = 3.4,
} = {}) {
  if (!territory) return;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2.2, width / Math.max(0.18, zoom));
  ctx.shadowColor = 'rgba(30, 36, 32, 0.72)';
  ctx.shadowBlur = dashed ? 0 : 10 / Math.max(0.18, zoom);
  if (dashed) ctx.setLineDash([10 / Math.max(0.18, zoom), 7 / Math.max(0.18, zoom)]);
  if (territory.polygons.length === 1) {
    territoryRenderer._strokePoly(ctx, territory.polygons[0]);
  } else {
    const edges = territoryRenderer._getExternalEdgesWithTolerance(
      territory.polygons,
      territory.name,
    );
    territoryRenderer._strokeEdges(ctx, edges);
  }
  ctx.restore();
}

export async function bootThreeSolo() {
  reportStartupStatus('Solo vs AI — loading 1942 board…', 28);

  let territories;
  let continents;
  let setup;
  let unitDefs;
  try {
    const [tRes, cRes, sRes, uRes] = await Promise.all([
      fetch('data/territories.json'),
      fetch('data/continents.json'),
      fetch('data/setup.json'),
      fetch('data/units.json'),
    ]);
    if (!tRes.ok || !cRes.ok || !sRes.ok || !uRes.ok) throw new Error('map data fetch failed');
    territories = await tRes.json();
    continents = await cRes.json();
    setup = await sRes.json();
    unitDefs = await uRes.json();
    applyLiveContinents(territories, continents);
  } catch (err) {
    console.error(err);
    reportStartupError('Solo vs AI could not load territory data.');
    return;
  }

  const canvas = document.getElementById('mapCanvas');
  if (!canvas) {
    reportStartupError('Solo vs AI missing #mapCanvas.');
    return;
  }

  const ctx = canvas.getContext('2d');
  const camera = new Camera(canvas);
  camera.usePhoneMinZoom = true;

  const mapRenderer = new MapRenderer();
  const territoryRenderer = new TerritoryRenderer(territories, continents);
  const territoryMap = new TerritoryMap(territories);
  const factions = setup.classic?.factions || setup.factions || [];
  const factionColors = new Map(factions.map((f) => [f.id, f.color]));

  const lobby = createSoloLobby(setup, typeof location !== 'undefined' ? location.search : '');
  lobby.mp = { error: '', lobby: null, isHost: false, localUserId: '' };
  const mp = createThreeMpSession({ setup, territories, continents });
  let unbindDiscordTurnPing = null;
  let mpGameCode = '';
  let gameState = startClassicSolo(setup, territories, continents);
  gameState.unitDefs = unitDefs;
  territoryRenderer.setGameState(gameState);

  const openingHuman = gameState.players.find((p) => !p.isAI) || gameState.players[0];
  const human = openingHuman;
  const chrome = injectThreeChrome({
    seat: human?.name || DEFAULT_HUMAN_SEAT,
    ipc: gameState.getIPCs(human?.id) || 0,
    phase: TURN_PHASE_NAMES[gameState.turnPhase] || 'Develop Tech',
  });
  chrome.setSeat(human?.name || DEFAULT_HUMAN_SEAT, human?.color || '#B22222');
  applyLiveStamp();

  let play = createSoloPlay(gameState, unitDefs);
  let aiController = null;
  function wireAI() {
    if (aiController) return aiController;
    aiController = new AIController();
    aiController.setUnitDefs(unitDefs);
    aiController.setCanAct(() => true);
    aiController.setOnStatusUpdate((message) => {
      play.aiStatus = message;
      paintChrome();
      camera.dirty = true;
    });
    aiController.setGameState(gameState);
    return aiController;
  }
  if (!lobby.open) wireAI();

  reportStartupStatus('Loading main tiles and unit chits…', 52);
  const { images, ready: imagesReady } = preloadUnitImages(
    unitDefs,
    factions.map((f) => f.id),
  );
  await Promise.all([mapRenderer.load(), imagesReady]);

  function resizeCanvas() {
    const dpr = devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    camera.onResize();
  }
  resizeCanvas();
  window.addEventListener('resize', () => {
    resizeCanvas();
    fitEurope();
  });

  let selected = null;
  let stacksExpanded = false;
  let hover = null;
  let unsubscribe = null;

  function bindState(next) {
    if (unsubscribe) unsubscribe();
    gameState = next;
    gameState.unitDefs = unitDefs;
    territoryRenderer.setGameState(gameState);
    unsubscribe = gameState.subscribe(() => {
      paintChrome();
      camera.dirty = true;
    });
  }

  function landByName(name) {
    return territories.find((t) => t.name === name) || null;
  }

  function currentPlacements() {
    return placementsFromState(gameState);
  }

  function setStamp() {
    applyLiveStamp();
  }

  function paintChrome() {
    setStamp();
    const current = gameState.currentPlayer;
    const you = gameState.players.find((p) => !p.isAI) || current;
    chrome.setPhase(gameState.gameOver
      ? (gameState.winner === 'Allies' ? 'Allied Victory' : gameState.winner === 'Axis' ? 'Axis Victory' : (gameState.winner || 'Victory'))
      : gameState.phase === GAME_PHASES.CAPITAL_PLACEMENT
        ? 'Place Capital'
        : gameState.phase === GAME_PHASES.UNIT_PLACEMENT
          ? 'Deploy'
          : (TURN_PHASE_NAMES[gameState.turnPhase] || gameState.turnPhase || 'PLAY'));
    chrome.setSeat(current?.name || you?.name || '—', current?.color || you?.color);
    chrome.setIpc(gameState.getIPCs(current?.id || you?.id) || 0);
    const model = chromeModel(play, territories);
    selected = landByName(play.selected) || selected;
    chrome.paintPlay({
      land: model.land,
      stacks: model.stacks,
      steppers: model.steppers,
      airLand: model.airLand,
      label: model.label,
      gold: model.gold,
      enabled: model.enabled,
      battle: model.battle,
      route: model.route,
      phaseStrip: model.phaseStrip,
      phaseStripCurrent: model.phaseStripCurrent,
      canUndo: model.canUndo,
      cargo: model.cargo,
      targetShipId: model.targetShipId,
      researchHint: model.researchHint,
      stage: model.stage,
    });
    maybeRefitForChrome();
  }

  chrome.onStackToggle = (on) => {
    stacksExpanded = on;
    camera.dirty = true;
  };
  chrome.onUnitStep = (type, delta) => {
    if (play.landing) adjustLanding(play, type, delta);
    else adjustUnit(play, type, delta);
    paintChrome();
    camera.dirty = true;
  };
  chrome.onLossStep = (side, type, delta) => {
    if (play.tech?.breakthrough) adjustUnit(play, type, delta);
    else adjustLoss(play, side, type, delta);
    paintChrome();
    camera.dirty = true;
  };
  chrome.onLossPick = (side, type) => {
    if (play.tech?.breakthrough) adjustUnit(play, type, 1);
    else adjustLoss(play, side, type, 1);
    paintChrome();
    camera.dirty = true;
  };
  chrome.onUndo = () => {
    undoLast(play);
    selected = landByName(play.selected);
    paintChrome();
    camera.dirty = true;
  };
  chrome.onShipPick = (shipId) => {
    pickShip(play, shipId);
    paintChrome();
    camera.dirty = true;
  };
  chrome.onTechPick = (id) => {
    adjustUnit(play, id, 1);
    paintChrome();
    camera.dirty = true;
  };
  chrome.onNewGameVsAI = () => {
    openLobby();
  };
  function paintLobbyNow() {
    lobby.mp.localUserId = mp.localUserId?.() || '';
    chrome.paintLobby(lobby);
    applyLiveStamp();
  }

  function attachDiscordTurnPing() {
    if (typeof unbindDiscordTurnPing === 'function') unbindDiscordTurnPing();
    unbindDiscordTurnPing = bindDiscordTurnPing(gameState, {
      getGameId: () => mpGameCode || lobby.mp.lobby?.code || '',
      getUxMode: () => UX_THREE,
      getOrigin: () => (typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : ''),
      isApplyingRemote: () => !!mp.syncManager?.isLoading?.(),
    });
  }

  mp.subscribe((kind, payload) => {
    if (kind === 'lobby') {
      lobby.mp.lobby = payload.lobby || mp.currentLobby();
      lobby.mp.isHost = mp.isHostUser();
      lobby.mp.error = '';
      if (lobby.mp.lobby) lobby.screen = 'room';
      if (lobby.open) paintLobbyNow();
    }
    if (kind === 'starting' && payload?.gameId) {
      startMpMatch(payload.gameId, payload.lobby);
    }
  });

  chrome.onLobbyChange = (kind, value) => {
    if (kind === 'ux' && value === 'classic') {
      navigateUxMode(UX_CLASSIC);
      return;
    }
    if (kind === 'mp-faction') {
      mp.pickFaction(value).then((res) => {
        if (res && res.success === false) lobby.mp.error = res.error || 'Could not sit';
        lobby.mp.lobby = mp.currentLobby();
        paintLobbyNow();
      });
      return;
    }
    if (kind === 'mp-ai') {
      const [factionId, difficulty] = String(value || '').split(':');
      mp.addAi(difficulty || 'medium', factionId).then((res) => {
        if (res && res.success === false) lobby.mp.error = res.error || 'Could not add AI';
        lobby.mp.lobby = mp.currentLobby();
        paintLobbyNow();
      });
      return;
    }
    if (kind === 'discord') {
      mp.setDiscord(value).then((res) => {
        if (res && res.success === false) lobby.mp.error = res.error || '';
        lobby.mp.lobby = mp.currentLobby();
        paintLobbyNow();
      }).catch(() => {});
      return;
    }
    applyLobbyAction(lobby, kind, value);
    paintLobbyNow();
  };
  chrome.onLobbyForm = async (kind, form) => {
    const data = new FormData(form);
    lobby.mp.error = '';
    if (kind === 'create') {
      const result = await mp.createGame({
        name: String(data.get('name') || ''),
        maxPlayers: Number(data.get('maxPlayers') || 5),
        startingIPCs: Number(data.get('startingIPCs') || 80),
      });
      if (!result.ok) {
        lobby.mp.error = result.error || 'Create failed';
        paintLobbyNow();
        return;
      }
      lobby.screen = 'room';
      lobby.mp.lobby = result.lobby || mp.currentLobby();
      lobby.mp.isHost = true;
      paintLobbyNow();
      return;
    }
    if (kind === 'join') {
      const result = await mp.joinGame({
        code: String(data.get('code') || ''),
        password: String(data.get('password') || '') || null,
      });
      if (!result.ok) {
        lobby.mp.error = result.error || 'Join failed';
        paintLobbyNow();
        return;
      }
      if (result.started) return;
      lobby.screen = 'room';
      lobby.mp.lobby = result.lobby || mp.currentLobby();
      lobby.mp.isHost = mp.isHostUser();
      paintLobbyNow();
    }
  };
  chrome.onLobbyStart = () => {
    if (lobby.screen === 'room') {
      mp.startRoom().then((result) => {
        if (!result.ok) {
          lobby.mp.error = result.error || 'Start failed';
          paintLobbyNow();
        }
      });
      return;
    }
    if (!lobbyCanStart(lobby)) {
      paintLobbyNow();
      return;
    }
    lobby.open = false;
    chrome.setLobbyOpen(false);
    startMatch(lobbyStartOptions(lobby));
  };
  chrome.onTutorialDismiss = () => {
    dismissTutorial();
    chrome.setTutorialOpen(false);
  };
  chrome.onHowTo = () => {
    if (lobby.open) {
      applyLobbyAction(lobby, 'howto', '1');
      chrome.paintLobby(lobby);
      return;
    }
    chrome.setTutorialOpen(true);
  };

  function openLobby() {
    lobby.open = true;
    lobby.screen = 'main';
    lobby.showHowTo = false;
    chrome.setTutorialOpen(false);
    chrome.paintLobby(lobby);
    applyLiveStamp();
  }

  function maybeShowTutorial() {
    if (shouldShowSetupTutorial(gameState)) {
      chrome.setTutorialOpen(true);
    }
  }

  function startMatch(options = lobbyStartOptions(lobby)) {
    bindState(startSoloMatch(setup, territories, continents, options));
    if (aiController) aiController.setGameState(gameState);
    else wireAI();
    play = createSoloPlay(gameState, unitDefs);
    play.aiStatus = null;
    selected = null;
    lobby.open = false;
    chrome.setLobbyOpen(false);
    gameState.autoSave();
    paintChrome();
    fitEurope();
    camera.dirty = true;
    maybeShowTutorial();
  }

  async function startMpMatch(gameId, incoming) {
    const result = await mp.startMatch(gameId, incoming);
    if (!result.ok) {
      lobby.mp.error = result.error || 'Could not start multiplayer';
      lobby.open = true;
      lobby.screen = 'online';
      chrome.setLobbyOpen(true);
      paintLobbyNow();
      return;
    }
    bindState(result.gameState);
    gameState.localUserId = result.localUserId;
    mpGameCode = incoming?.code || incoming?.lobbyCode || incoming?.lobbyData?.code
      || lobby.mp.lobby?.code || gameId || '';
    attachDiscordTurnPing();
    play = createSoloPlay(gameState, unitDefs);
    play.localUserId = result.localUserId;
    play.aiStatus = null;
    selected = null;
    lobby.open = false;
    chrome.setLobbyOpen(false);
    if (result.isHost) {
      if (aiController) aiController.setGameState(gameState);
      else wireAI();
      aiController.setCanAct(() => {
        const cur = gameState.currentPlayer;
        return !!(cur?.isAI && result.syncManager?.hasAIAuthority?.());
      });
    } else if (aiController) {
      aiController.setCanAct(() => false);
    }
    result.syncManager.subscribe((event) => {
      if (event === 'state_updated' || event === 'turn_changed') {
        paintChrome();
        camera.dirty = true;
      }
    });
    paintChrome();
    fitEurope();
    camera.dirty = true;
  }

  let lastFitPad = 0;
  function chromePadBottom() {
    if (chrome.isLobbyOpen() || chrome.isTutorialOpen()) return 96;
    const h = chrome.bottom?.getBoundingClientRect?.()?.height || 0;
    return Math.max(120, Math.min(280, Math.round(h + 16)));
  }
  function fitEurope() {
    const padBottom = chromePadBottom();
    lastFitPad = padBottom;
    camera.fitBounds(EUROPE_FIT, {
      padding: 12,
      padTop: 56,
      padBottom,
      fillFrame: true,
    });
  }
  function maybeRefitForChrome() {
    const phase = gameState.phase;
    if (phase !== GAME_PHASES.CAPITAL_PLACEMENT && phase !== GAME_PHASES.UNIT_PLACEMENT) return;
    const pad = chromePadBottom();
    if (Math.abs(pad - lastFitPad) < 20) return;
    fitEurope();
  }

  bindState(gameState);

  function eventFromChrome(e) {
    const node = eventElement(e);
    if (!node || typeof node.closest !== 'function') return false;
    return !!node.closest('#three-bottom, #three-l0, #three-zoom, #three-sheet, #three-lobby, #three-tutorial, #three-phase-strip, #three-battle, #three-peek');
  }

  function ignoreMapHit(e) {
    const pt = clientPointOf(e);
    return shouldIgnoreMapHit({
      sheetOpen: chrome.isSheetOpen(),
      lobbyOpen: chrome.isLobbyOpen(),
      tutorialOpen: chrome.isTutorialOpen(),
      battleOpen: !!play?.battle || chrome.battleEl?.classList?.contains('is-on'),
      targetInChrome: eventFromChrome(e),
      clientX: pt?.x,
      clientY: pt?.y,
      rects: chrome.hitRects(),
    });
  }

  function pickAt(sx, sy) {
    const world = camera.screenToWorld(sx, sy);
    world.x = ((world.x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
    const fromStack = hitTestPreviewStack(world.x, world.y, {
      territories,
      placements: currentPlacements(),
      zoom: camera.zoom,
      selectedName: selected?.name,
      stacksExpanded,
    });
    return fromStack || territoryMap.hitTest(world.x, world.y);
  }

  function selectLand(next) {
    tapLand(play, next?.name);
    selected = landByName(play.selected) || next || null;
    paintChrome();
    camera.dirty = true;
  }

  canvas.addEventListener('mousedown', (e) => {
    if (ignoreMapHit(e)) return;
    camera.onMouseDown(e);
  });
  canvas.addEventListener('mousemove', (e) => {
    if (camera.onMouseMove(e)) {
      canvas.classList.add('is-panning');
      return;
    }
    if (ignoreMapHit(e)) {
      hover = null;
      canvas.classList.remove('is-hovering');
      return;
    }
    const hit = pickAt(e.clientX, e.clientY);
    hover = hit;
    canvas.classList.toggle('is-hovering', !!hit);
    camera.dirty = true;
  });
  window.addEventListener('mouseup', (e) => {
    const wasDrag = camera.onMouseUp();
    canvas.classList.remove('is-panning');
    if (wasDrag) return;
    if (ignoreMapHit(e)) return;
    selectLand(pickAt(e.clientX, e.clientY));
  });
  canvas.addEventListener('wheel', (e) => camera.onWheel(e), { passive: false });

  let pinch = null;
  canvas.addEventListener('touchstart', (e) => {
    // Lobby / tutorial own the finger. Never preventDefault here — that
    // steals MAIN pan even when the event later ignores the map hit.
    if (chrome.isLobbyOpen() || chrome.isTutorialOpen() || ignoreMapHit(e)) {
      return;
    }
    if (e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      pinch = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        zoom: camera.zoom,
      };
      camera._dragging = false;
      return;
    }
    if (e.touches.length === 1) {
      const t = e.touches[0];
      camera.onMouseDown({
        button: 0,
        clientX: t.clientX,
        clientY: t.clientY,
        preventDefault() { e.preventDefault(); },
      });
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (chrome.isLobbyOpen() || chrome.isTutorialOpen() || ignoreMapHit(e)) {
      return;
    }
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      const [a, b] = e.touches;
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const factor = dist / Math.max(1, pinch.dist);
      camera.zoom = Math.max(camera.minZoom, Math.min(3, pinch.zoom * factor));
      camera.onResize();
      return;
    }
    if (e.touches.length === 1) {
      const t = e.touches[0];
      camera.onMouseMove({ clientX: t.clientX, clientY: t.clientY });
    }
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    if (chrome.isLobbyOpen() || chrome.isTutorialOpen()) return;
    if (e.touches.length < 2) pinch = null;
    if (e.touches.length === 0) {
      const wasDrag = camera.onMouseUp();
      canvas.classList.remove('is-panning');
      if (wasDrag || ignoreMapHit(e)) return;
      const t = e.changedTouches[0];
      if (t) selectLand(pickAt(t.clientX, t.clientY));
    }
  });

  bindSealedActivate(chrome.zoom, '[data-zoom]', (e, btn) => {
    if (btn.dataset.zoom === 'fit') fitEurope();
    else camera.zoomBy(btn.dataset.zoom);
  });
  bindSealedActivate(chrome.confirm, null, () => {
    if (chrome.confirm.disabled) return;
    confirmPlay(play);
    if (play._newGame) {
      play._newGame = false;
      openLobby();
      return;
    }
    selected = landByName(play.selected);
    paintChrome();
    camera.dirty = true;
  });

  function paint() {
    camera.update();
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#3CC0BF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    camera.applyTransform(ctx);

    const viewport = camera.getViewport();
    const startCopy = Math.floor(viewport.x / MAP_WIDTH);
    const endCopy = Math.floor((viewport.x + viewport.width) / MAP_WIDTH);
    const placements = currentPlacements();
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
      mapRenderer.render(ctx, localViewport, { flatOcean: false });
      territoryRenderer.renderWaterMask(ctx);
      territoryRenderer.renderOwnershipOverlays(ctx, camera.zoom);
      territoryRenderer.renderTerrainTexture(ctx, camera.zoom);
      territoryRenderer.renderTerritoryOutlines(ctx, camera.zoom);
      const marks = highlights(play);
      const byName = (name) => territories.find((t) => t.name === name);
      const wave = 0.5 + 0.5 * Math.sin(performance.now() / 280);
      const pulsing = new Set(marks.pulse || []);
      for (const name of marks.legal || []) {
        ctx.save();
        if (pulsing.has(name)) ctx.globalAlpha = 0.42 + 0.58 * wave;
        strokeSelectOutline(ctx, byName(name), territoryRenderer, camera.zoom, {
          color: SELECT_GOLD,
          dashed: true,
          width: pulsing.has(name) ? 3.4 + 1.2 * wave : 2.6,
        });
        ctx.restore();
      }
      for (const name of marks.landable || []) {
        strokeSelectOutline(ctx, byName(name), territoryRenderer, camera.zoom, {
          color: LAND_TEAL,
          dashed: true,
          width: 2.8,
        });
      }
      if (marks.origin) {
        strokeSelectOutline(ctx, byName(marks.origin), territoryRenderer, camera.zoom, {
          color: SELECT_GOLD,
          width: 3.2,
        });
      }
      if (marks.dest) {
        strokeSelectOutline(ctx, byName(marks.dest), territoryRenderer, camera.zoom, {
          color: SELECT_GOLD,
          width: 3.6,
        });
      }
      if (selected && selected.name !== marks.origin && selected.name !== marks.dest) {
        const landColor = (marks.landable || []).includes(selected.name) ? LAND_TEAL : SELECT_GOLD;
        strokeSelectOutline(ctx, selected, territoryRenderer, camera.zoom, {
          color: landColor,
          width: 3.2,
        });
      }
      renderPreviewStacks(ctx, {
        territories,
        placements,
        images,
        zoom: camera.zoom,
        selectedName: selected?.name || null,
        stacksExpanded,
        factionColors,
      });
      ctx.restore();
    }
  }

  function loop() {
    const pulsing = highlights(play).pulse?.length > 0;
    if (camera.dirty || camera._targetX !== null || pulsing) {
      camera.dirty = false;
      paint();
    }
    requestAnimationFrame(loop);
  }

  fitEurope();
  paintChrome();
  if (lobby.open) openLobby();
  else {
    startMatch(lobbyStartOptions(lobby));
    if (lobby.cargo) {
      applyCargoSeed(play);
      paintChrome();
    }
    gameState.autoSave();
  }
  paint();
  requestAnimationFrame(loop);
  dismissStartupLoader();

  window.__threeSolo = {
    version: liveGameVersion() || GAME_VERSION,
    inspect: () => ({ ...inspectSolo(gameState), play: inspectPlay(play), lobby: lobbyInspect(lobby) }),
    playInspect: () => inspectPlay(play),
    selectLand: (name) => {
      const t = landByName(name);
      if (t) selectLand(t);
      return inspectPlay(play);
    },
    adjustUnit: (type, delta = 1) => {
      if (play.landing) adjustLanding(play, type, delta);
      else adjustUnit(play, type, delta);
      paintChrome();
      camera.dirty = true;
      return inspectPlay(play);
    },
    adjustLanding: (type, delta = 1) => {
      adjustLanding(play, type, delta);
      paintChrome();
      camera.dirty = true;
      return inspectPlay(play);
    },
    adjustLoss: (side, type, delta = 1) => {
      adjustLoss(play, side, type, delta);
      paintChrome();
      camera.dirty = true;
      return inspectPlay(play);
    },
    confirm: () => {
      confirmPlay(play);
      if (play._newGame) {
        play._newGame = false;
        openLobby();
        return inspectPlay(play);
      }
      selected = landByName(play.selected);
      paintChrome();
      camera.dirty = true;
      return inspectPlay(play);
    },
    newGame: () => {
      openLobby();
      return lobbyInspect(lobby);
    },
    startFromLobby: (options) => {
      startMatch(options || lobbyStartOptions(lobby));
      return inspectSolo(gameState);
    },
    applyCargoSeed: () => {
      applyCargoSeed(play);
      paintChrome();
      camera.dirty = true;
      return inspectPlay(play);
    },
    openLobby,
    chrome,
    lobby,
    get gameState() { return gameState; },
    get play() { return play; },
  };

  return window.__threeSolo;
}
