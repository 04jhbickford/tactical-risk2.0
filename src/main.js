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
import { PlayerPanel } from './ui/playerPanel.js';
import { TerritoryTooltip } from './ui/territoryTooltip.js';
import { PurchasePopup } from './ui/purchasePopup.js';
import { MovementUI } from './ui/movementUI.js';
import { CombatUI } from './ui/combatUI.js';
import { TechUI } from './ui/techUI.js';
import { PlacementUI } from './ui/placementUI.js';
import { HUD } from './ui/hud.js';
import { Minimap } from './ui/minimap.js';
import { Lobby } from './ui/lobby.js';
import { ContinentPanel } from './ui/continentPanel.js';
import { GameState, GAME_PHASES, TURN_PHASES } from './state/gameState.js';
import { VictoryScreen } from './ui/victoryScreen.js';
import { CombatLogPanel } from './ui/combatLogPanel.js';

function wrapX(x) {
  return ((x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
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
  const mapRenderer = new MapRenderer();
  const territoryRenderer = new TerritoryRenderer(territories, continents);
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

  // Territory tooltip (shows on hover)
  const tooltip = new TerritoryTooltip(continents);
  tooltip.setUnitDefs(unitDefs);

  // Player panel (replaces territory-focused sidebar)
  const playerPanel = new PlayerPanel();
  playerPanel.setUnitDefs(unitDefs);

  // Purchase popup overlay
  const purchasePopup = new PurchasePopup();
  purchasePopup.setUnitDefs(unitDefs);

  // Movement UI
  const movementUI = new MovementUI();
  movementUI.setUnitDefs(unitDefs);
  movementUI.setTerritories(territories);

  // Combat UI
  const combatUI = new CombatUI();
  combatUI.setUnitDefs(unitDefs);

  // Tech UI
  const techUI = new TechUI();

  // Placement UI (for Risk initial setup)
  const placementUI = new PlacementUI();
  placementUI.setUnitDefs(unitDefs);
  placementUI.setTerritories(territories);

  // Victory Screen
  const victoryScreen = new VictoryScreen();

  // Combat Log Panel
  const combatLogPanel = new CombatLogPanel();

  // Action handler for player panel buttons
  playerPanel.setActionCallback((action, data) => {
    if (!gameState) return;

    switch (action) {
      case 'place-capital':
        if (gameState.placeCapital(data.territory)) {
          camera.dirty = true;
          selectedTerritory = null;
          playerPanel.setSelectedTerritory(null);

          // If we just entered unit placement phase, pan to current player's capital
          if (gameState.phase === GAME_PHASES.UNIT_PLACEMENT) {
            const player = gameState.currentPlayer;
            const capital = gameState.playerState[player.id]?.capitalTerritory;
            if (capital) {
              const t = territoryRenderer.territoryByName[capital];
              if (t && t.center) {
                camera.panTo(t.center[0], t.center[1]);
              }
            }
          }
        }
        break;

      case 'open-purchase':
        purchasePopup.show();
        break;

      case 'open-tech':
        techUI.show();
        break;

      case 'trade-cards':
        if (gameState.canTradeRiskCards(gameState.currentPlayer.id)) {
          const result = gameState.tradeRiskCards(gameState.currentPlayer.id);
          if (result.success) {
            camera.dirty = true;
          }
        }
        break;

      case 'undo-move':
        const undoResult = gameState.undoLastMove();
        if (undoResult.success) {
          camera.dirty = true;
        }
        break;

      case 'undo-placement':
        if (gameState.undoPlacement()) {
          camera.dirty = true;
        }
        break;

      case 'open-combat':
        if (combatUI.hasCombats()) {
          combatUI.showNextCombat();
        }
        break;

      case 'finish-placement':
        gameState.finishPlacement();
        camera.dirty = true;
        // Move to next player's capital if in placement phase
        const nextPlayer = gameState.currentPlayer;
        if (nextPlayer && gameState.phase === GAME_PHASES.UNIT_PLACEMENT) {
          const capital = gameState.playerState[nextPlayer.id]?.capitalTerritory;
          if (capital) {
            const t = territoryRenderer.territoryByName[capital];
            if (t && t.center) {
              camera.panTo(t.center[0], t.center[1]);
            }
          }
        }
        break;

      case 'next-phase':
        gameState.nextPhase();
        camera.dirty = true;
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

  // Lobby
  const lobby = new Lobby(setup, (gameMode, selectedPlayers, options = {}) => {
    // Initialize game state
    gameState = new GameState(setup, territories, continents);
    gameState.initGame(gameMode, selectedPlayers, options);

    // Wire up components
    hud.setGameState(gameState);
    hud.setNextPhaseCallback(() => {
      gameState.nextPhase();
      camera.dirty = true;
    });
    playerPanel.setGameState(gameState);
    tooltip.setGameState(gameState);
    territoryRenderer.setGameState(gameState);
    continentPanel.setGameState(gameState);
    unitRenderer = new UnitRenderer(gameState, territories, unitDefs);

    // Purchase popup
    purchasePopup.setGameState(gameState);
    purchasePopup.setOnComplete(() => {
      camera.dirty = true;
    });

    // Movement UI
    movementUI.setGameState(gameState);
    movementUI.setOnMoveComplete(() => {
      camera.dirty = true;
    });

    // Combat UI
    combatUI.setGameState(gameState);
    combatUI.setOnComplete(() => {
      camera.dirty = true;
    });

    // Tech UI
    techUI.setGameState(gameState);
    techUI.setOnComplete(() => {
      camera.dirty = true;
      // Auto-advance from tech phase when done
      if (gameState.turnPhase === TURN_PHASES.DEVELOP_TECH) {
        gameState.nextPhase();
      }
    });

    // Placement UI
    placementUI.setGameState(gameState);
    placementUI.setOnComplete(() => {
      camera.dirty = true;
    });

    // Victory Screen
    victoryScreen.setGameState(gameState);

    // Combat Log Panel
    combatLogPanel.setGameState(gameState);
    combatLogPanel.show();

    // Show panels
    continentPanel.show();
    playerPanel.show();

    // Start with map overview - no auto-pan
    camera.dirty = true;
  });

  // Load map tiles
  await mapRenderer.load();

  // Canvas sizing
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  // Mouse events
  canvas.addEventListener('mousedown', (e) => {
    e.preventDefault();
    camera.onMouseDown(e);
    canvas.classList.add('panning');
    tooltip.hide(); // Hide tooltip when starting to drag
  });

  canvas.addEventListener('mousemove', (e) => {
    const moved = camera.onMouseMove(e);
    if (moved) {
      canvas.classList.add('panning');
      canvas.classList.remove('hovering');
      tooltip.hide();
      return;
    }

    if (!camera.isDragging) {
      const world = camera.screenToWorld(e.clientX, e.clientY);
      const hit = territoryMap.hitTest(wrapX(world.x), world.y);
      if (hit !== hoverTerritory) {
        hoverTerritory = hit;
        camera.dirty = true;
        canvas.classList.toggle('hovering', !!hit);
      }
      // Show tooltip for hovered territory
      if (hit && gameState) {
        tooltip.show(hit, e.clientX, e.clientY);
      } else {
        tooltip.hide();
      }
    }
  });

  canvas.addEventListener('mouseup', (e) => {
    const wasDrag = camera.onMouseUp();
    canvas.classList.remove('panning');

    if (!wasDrag) {
      const world = camera.screenToWorld(e.clientX, e.clientY);
      const hit = territoryMap.hitTest(wrapX(world.x), world.y);

      // Check if we're in initial placement phase
      if (hit && gameState && placementUI.isActive()) {
        const handled = placementUI.handleTerritoryClick(hit);
        if (handled) {
          camera.dirty = true;
          return;
        }
      }

      // Check if we're in a movement phase
      if (hit && gameState && movementUI.isMovementPhase()) {
        const handled = movementUI.selectTerritory(hit);
        if (handled) {
          camera.dirty = true;
          return;
        }
      }

      if (hit) {
        selectedTerritory = hit;
        playerPanel.setSelectedTerritory(hit);
      } else {
        selectedTerritory = null;
        playerPanel.setSelectedTerritory(null);
        movementUI.cancel();
      }
      camera.dirty = true;
    }
  });

  canvas.addEventListener('wheel', (e) => camera.onWheel(e), { passive: false });

  canvas.addEventListener('mouseleave', () => {
    tooltip.hide();
    hoverTerritory = null;
    camera.dirty = true;
  });

  window.addEventListener('mouseup', () => {
    if (camera.isDragging) {
      camera.onMouseUp();
      canvas.classList.remove('panning');
    }
  });

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      selectedTerritory = null;
      playerPanel.setSelectedTerritory(null);
      camera.dirty = true;
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
  function render() {
    camera.update();

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
        mapRenderer.render(ctx, localViewport);

        // Continent indicators FIRST (underneath ownership)
        territoryRenderer.renderContinentIndicators(ctx);

        // Territory overlays (colored by continent - Risk style)
        territoryRenderer.renderOwnershipOverlays(ctx);

        // Continent labels (when zoomed out)
        territoryRenderer.renderContinentLabels(ctx, camera.zoom);

        // Territory outlines
        territoryRenderer.renderTerritoryOutlines(ctx);

        // Cross-water connection lines
        territoryRenderer.renderCrossWaterConnections(ctx, camera.zoom);

        // Valid move destinations (highlight during movement phase)
        if (movementUI.isMovementPhase() && movementUI.hasUnitsSelected()) {
          const { destinations, isEnemy } = movementUI.getDestinationsWithEnemyFlags();
          territoryRenderer.renderValidMoveDestinations(ctx, destinations, isEnemy);
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

        // Labels
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
}

init().catch(err => console.error('Failed to initialize:', err));
