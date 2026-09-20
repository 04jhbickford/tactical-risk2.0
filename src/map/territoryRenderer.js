// Renders territory overlays: ownership colors, outlines, continent borders, hover/selection, labels

import {
  isMobileShell,
  phoneLegalOutlineWidth,
  phoneCountryOutlineWidth,
  phoneSeaOutlineWidth,
  PHONE_COUNTRY_HAIRLINE_COLOR,
  PHONE_SEA_HAIRLINE_COLOR,
  shouldDrawPhoneOwnershipFlags,
  phoneOwnershipFlagSize,
  phoneOwnershipSeamWidth,
  phoneMapStackOffsets,
  shouldHidePhoneMapLabel,
  shouldDrawPhoneCapitalStar,
  shouldDrawPhoneCapitalGlow,
  PHONE_LEGAL_FILL_ALPHA,
  PHONE_LEGAL_FILL_RGB,
  isPhoneSetupPhase,
  shouldStrokePhoneSeaDashes,
  shouldStrokePhoneLegalHairline,
  phoneLegalDashColor,
  PHONE_LEGAL_EDGE_COLOR,
} from '../ui/mobileShell.js';

// Cross-water connections that should be drawn as visual lines on the map
// These are land-to-land connections that cross water (like Alaska-Kamchatka in Risk)
// Land bridges - allow land movement between these territories (no naval required)
const LAND_BRIDGES = [
  // Pacific wrap-around
  ['Alaska', 'Soviet Far East'],
  // Atlantic crossings
  ['East Canada', 'Eire'],
  ['Brazil', 'French West Africa'],
  ['East US', 'Cuba'],
  // UK connections
  ['Eire', 'United Kingdom'],
  ['United Kingdom', 'Finland Norway'],
  ['United Kingdom', 'West Europe'],
  // Mediterranean
  ['Spain', 'Algeria'],
  ['South Europe', 'Anglo Sudan Egypt'],
  ['Syria Jordan', 'Anglo Sudan Egypt'],  // Suez crossing
  // Red Sea
  ['Italian East Africa', 'Saudi Arabia'],  // Red Sea crossing
  // Pacific / Asian connections
  ['French Indo China', 'East Indies'],  // Note: "French Indo China" (no hyphen) matches territory name
  ['East Indies', 'Australia'],
  ['Australia', 'New Zealand'],
  // African
  ['Kenya-Rhodesia', 'Madagascar'],
  // Asian
  ['Japan', 'Manchuria'],  // Korea Strait crossing
];

function pointInPolygonRing(px, py, ring) {
  let inside = false;
  const n = ring?.length || 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function pointToSegmentDist(point, p1, p2) {
  const [px, py] = point;
  const [x1, y1] = p1;
  const [x2, y2] = p2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** James merged rings on purpose. An old shared China/Sinkiang (or
 *  ASE/Libya) border is the same country — drop it from the outline. */
export function isMergedInternalSeam(edge, siblingRings, {
  probePx = 6,
  coverTol = 12,
} = {}) {
  if (!edge?.p1 || !edge?.p2 || !Array.isArray(siblingRings) || !siblingRings.length) {
    return false;
  }
  const samples = 5;
  let coverHits = 0;
  for (let s = 0; s <= samples; s++) {
    const t = s / samples;
    const px = edge.p1[0] + t * (edge.p2[0] - edge.p1[0]);
    const py = edge.p1[1] + t * (edge.p2[1] - edge.p1[1]);
    let covered = false;
    for (const ring of siblingRings) {
      if (!ring || ring.length < 2) continue;
      for (let i = 0; i < ring.length; i++) {
        if (pointToSegmentDist([px, py], ring[i], ring[(i + 1) % ring.length]) <= coverTol) {
          covered = true;
          break;
        }
      }
      if (covered) break;
    }
    if (covered) coverHits += 1;
  }
  if (coverHits >= samples * 0.7) return true;

  const mx = (edge.p1[0] + edge.p2[0]) / 2;
  const my = (edge.p1[1] + edge.p2[1]) / 2;
  const dx = edge.p2[0] - edge.p1[0];
  const dy = edge.p2[1] - edge.p1[1];
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * probePx;
  const ny = (dx / len) * probePx;
  const left = [mx + nx, my + ny];
  const right = [mx - nx, my - ny];
  for (const ring of siblingRings) {
    if (!ring || ring.length < 3) continue;
    if (pointInPolygonRing(left[0], left[1], ring)
      || pointInPolygonRing(right[0], right[1], ring)) {
      return true;
    }
  }
  return false;
}

export function mergedTerritoryOutlineEdges(polygons) {
  const rings = (polygons || []).filter((p) => Array.isArray(p) && p.length >= 3);
  if (rings.length <= 1) {
    const ring = rings[0];
    if (!ring) return [];
    const edges = [];
    for (let i = 0; i < ring.length; i++) {
      const p1 = ring[i];
      const p2 = ring[(i + 1) % ring.length];
      if (p1[0] === p2[0] && p1[1] === p2[1]) continue;
      edges.push([p1, p2]);
    }
    return edges;
  }
  const out = [];
  for (let i = 0; i < rings.length; i++) {
    const siblings = rings.filter((_, j) => j !== i);
    const ring = rings[i];
    for (let k = 0; k < ring.length; k++) {
      const p1 = ring[k];
      const p2 = ring[(k + 1) % ring.length];
      if (p1[0] === p2[0] && p1[1] === p2[1]) continue;
      if (isMergedInternalSeam({ p1, p2 }, siblings)) continue;
      out.push([p1, p2]);
    }
  }
  return out;
}

export class TerritoryRenderer {
  // Per-territory offsets for flags/labels/units (shared across render functions)
  static TERRITORY_OFFSETS = {
    'Finland Norway': { x: 0, y: -60 },
  };

  // Sampled directly from map/baseTiles/*.png (the dominant flat open-ocean
  // shade, away from the near-coast glow and the deep-water gradient). Used
  // to mask the baked-in rectangular sea-zone blocks in the tile art so the
  // painted-over water reads as a continuation of the same ocean, not a seam.
  static OCEAN_BASE_COLOR = '#44C5BD';

  constructor(territories, continents) {
    this.territories = territories;
    this.continents = continents;
    this.gameState = null;

    // Build lookups
    this.territoryByName = {};
    for (const t of territories) {
      this.territoryByName[t.name] = t;
    }

    this.continentByName = {};
    this.continentByTerritory = {};
    for (const c of continents) {
      this.continentByName[c.name] = c;
      for (const tName of c.territories) {
        this.continentByTerritory[tName] = c;
      }
    }

    // Flag images cache
    this.flagImages = {};

    // Territories highlighted from action log
    this.highlightedTerritories = [];

    // Phone setup: current player's legal (owned) land. Desktop unused.
    this.phoneLegalNames = new Set();
    this.peekedLabelName = null;
    this.phoneTilePulse = null;

    // Movement arrow for action log hover
    this.movementArrowFrom = null;
    this.movementArrowTo = null;

    // Air movement path visualization (multi-hop)
    this.airMovementPath = null; // Array of territory names forming the flight path
    this.airMovementReachable = null; // Set of reachable territory names

    // Cache for external edges (computed once since polygons never change)
    this._externalEdgesCache = {};
    this._territoryCenterCache = {};
    this._precomputeCaches();
  }

  setPhoneLegalTerritories(names, edgeColor = null) {
    this.phoneLegalNames = new Set(Array.isArray(names) ? names : []);
    this.phoneLegalEdgeColor = edgeColor || null;
  }

  setPhoneTilePulse(name, kind, ms) {
    if (!name) {
      this.phoneTilePulse = null;
      return;
    }
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    this.phoneTilePulse = {
      name,
      kind: kind === 'confirm' ? 'confirm' : 'select',
      start: now,
      until: now + Math.max(1, Number(ms) || 0),
    };
  }

  phoneTilePulseActive(now = (typeof performance !== 'undefined' && performance.now)
    ? performance.now()
    : Date.now()) {
    const pulse = this.phoneTilePulse;
    if (!pulse) return false;
    if (now >= pulse.until) {
      this.phoneTilePulse = null;
      return false;
    }
    return true;
  }

  renderPhoneLegalHighlights(ctx, zoom = 1) {
    if (!this.phoneLegalNames.size) return;

    // First paint of Place Capital / Initial Deploy — do not wait for peek.
    // Per-owned-tile edge (not a continent hull). Cream/ivory is map chrome.
    const outline = phoneLegalOutlineWidth(zoom);

    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (PHONE_LEGAL_FILL_ALPHA > 0) {
      ctx.fillStyle = `rgba(${PHONE_LEGAL_FILL_RGB}, ${PHONE_LEGAL_FILL_ALPHA})`;
      for (const t of this.territories) {
        if (!this.phoneLegalNames.has(t.name) || t.isWater) continue;
        for (const poly of t.polygons || []) {
          if (!poly || poly.length < 3) continue;
          this._fillPoly(ctx, poly);
        }
      }
    }

    // Do not stroke. A gold/faction hairline on every owned tile (often
    // ~31 worldwide in a 2p deal) reads as a country grid on unowned
    // neighbors (James V2.81.30). Fill-lite is the owned mark. Peek
    // paints the white tile outline.
    if (shouldStrokePhoneLegalHairline(zoom, { mobile: isMobileShell() })) {
      const color = phoneLegalDashColor(this.phoneLegalEdgeColor) || PHONE_LEGAL_EDGE_COLOR;
      ctx.strokeStyle = color;
      ctx.lineWidth = outline;
      ctx.setLineDash([]);
      for (const t of this.territories) {
        if (!this.phoneLegalNames.has(t.name) || t.isWater) continue;
        for (const poly of t.polygons || []) {
          if (!poly || poly.length < 3) continue;
          this._strokePoly(ctx, poly);
        }
      }
    }

    ctx.restore();
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.phoneLegal = String(this.phoneLegalNames.size);
    }
  }

  renderPhoneTilePulse(ctx, zoom = 1) {
    if (!this.phoneTilePulseActive()) return;
    const pulse = this.phoneTilePulse;
    const t = this.territoryByName[pulse.name];
    if (!t) return;
    const now = (typeof performance !== 'undefined' && performance.now)
      ? performance.now()
      : Date.now();
    const span = Math.max(1, pulse.until - pulse.start);
    const u = Math.max(0, Math.min(1, (now - pulse.start) / span));
    const fade = 1 - u;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    const width = Math.max(2, 4 / Math.max(Number(zoom) || 1, 0.15));
    if (pulse.kind === 'confirm') {
      ctx.strokeStyle = `rgba(74, 222, 128, ${0.85 * fade})`;
      ctx.fillStyle = `rgba(74, 222, 128, ${0.18 * fade})`;
    } else {
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 * fade})`;
      ctx.fillStyle = `rgba(255, 255, 255, ${0.08 * fade})`;
    }
    ctx.lineWidth = width;
    ctx.setLineDash([]);
    for (const poly of t.polygons || []) {
      if (!poly || poly.length < 3) continue;
      this._fillPoly(ctx, poly);
      this._strokePoly(ctx, poly);
    }
    if (pulse.kind === 'confirm') {
      const [cx, cy] = this._getTerritoryCenter(t);
      if (cx != null) {
        const s = Math.max(10, 16 / Math.max(Number(zoom) || 1, 0.2));
        ctx.strokeStyle = `rgba(255, 255, 255, ${fade})`;
        ctx.lineWidth = Math.max(2, s * 0.18);
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.45, cy);
        ctx.lineTo(cx - s * 0.1, cy + s * 0.4);
        ctx.lineTo(cx + s * 0.5, cy - s * 0.4);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  /** Set territories to highlight from action log hover */
  setHighlightedTerritories(territories) {
    this.highlightedTerritories = territories || [];
  }

  /** Clear highlighted territories */
  clearHighlightedTerritories() {
    this.highlightedTerritories = [];
  }

  /** Set movement arrow to display (from -> to) */
  setMovementArrow(from, to, isCombat = false) {
    this.movementArrowFrom = from;
    this.movementArrowTo = to;
    this.movementArrowIsCombat = isCombat;
  }

  /** Clear movement arrow */
  clearMovementArrow() {
    this.movementArrowFrom = null;
    this.movementArrowTo = null;
    this.movementArrowIsCombat = false;
  }

  /** Set air movement visualization - shows flight path and reachable territories */
  setAirMovementVisualization(sourceName, reachableTerritories, flightPath = null) {
    this.airMovementSource = sourceName;
    this.airMovementReachable = reachableTerritories; // Map or Set of territory names
    this.airMovementPath = flightPath; // Array of territory names for specific path
  }

  /** Clear air movement visualization */
  clearAirMovementVisualization() {
    this.airMovementSource = null;
    this.airMovementReachable = null;
    this.airMovementPath = null;
  }

  /** Pre-compute expensive calculations that don't change during gameplay */
  _precomputeCaches() {
    for (const t of this.territories) {
      // Cache territory centers
      this._territoryCenterCache[t.name] = this._computeTerritoryCenter(t);

      // Cache external edges for multi-polygon territories
      if (t.polygons && t.polygons.length > 1) {
        this._externalEdgesCache[t.name] = this._computeExternalEdges(t.polygons);
      }
    }
  }

  setGameState(gameState) {
    this.gameState = gameState;
    // Load flag images for all players
    if (gameState && gameState.players) {
      this._loadFlagImages(gameState.players);
    }
  }

  _loadFlagImages(players) {
    for (const player of players) {
      if (player.flag && !this.flagImages[player.flag]) {
        const img = new Image();
        img.src = `assets/flags/${player.flag}`;
        this.flagImages[player.flag] = img;
      }
    }
  }

  /**
   * Mask the baked-in rectangular sea-zone blocks in the base map tiles by
   * painting the accurate water polygons (the same geometry used for click
   * hit-testing) in the map art's base ocean color. Visual only — hit-test
   * geometry in TerritoryMap is untouched, so sea zones stay clickable.
   */
  renderWaterMask(ctx) {
    ctx.save();

    // Solid fill covers the baked rectangle with the correct irregular shape.
    ctx.fillStyle = TerritoryRenderer.OCEAN_BASE_COLOR;
    for (const t of this.territories) {
      if (!t.isWater) continue;
      for (const poly of t.polygons) {
        if (!poly || poly.length < 3) continue;
        this._fillPoly(ctx, poly);
      }
    }

    // Soft feather along the polygon edge so the mask blends into the PNG's
    // anti-aliased coastline instead of leaving a second hard seam.
    ctx.strokeStyle = TerritoryRenderer.OCEAN_BASE_COLOR;
    ctx.shadowColor = TerritoryRenderer.OCEAN_BASE_COLOR;
    ctx.shadowBlur = 4;
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.6;
    for (const t of this.territories) {
      if (!t.isWater) continue;
      for (const poly of t.polygons) {
        if (!poly || poly.length < 3) continue;
        this._strokePoly(ctx, poly);
      }
    }

    ctx.restore();
  }

  /** Fill land territory polygons with continent color (Risk style) */
  renderOwnershipOverlays(ctx, zoom = 1) {
    const mobile = isMobileShell();
    const setup = isPhoneSetupPhase(this.gameState?.phase);
    const seam = phoneOwnershipSeamWidth(zoom, { mobile, setup });

    for (const t of this.territories) {
      if (t.isWater) continue;

      const continent = this.continentByTerritory[t.name];
      const color = continent?.color || '#888888';

      ctx.save();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.lineWidth = seam;
      ctx.globalAlpha = 1.0;

      for (const polygon of t.polygons) {
        if (!polygon || polygon.length < 3) continue;
        ctx.beginPath();
        ctx.moveTo(polygon[0][0], polygon[0][1]);
        for (let i = 1; i < polygon.length; i++) {
          ctx.lineTo(polygon[i][0], polygon[i][1]);
        }
        ctx.closePath();
        ctx.fill();
        if (seam > 0) ctx.stroke();
      }

      ctx.restore();
    }

    ctx.globalAlpha = 1.0;
    ctx.lineWidth = 1;
  }

  /** Add subtle terrain texture (rivers, mountains) to territories */
  renderTerrainTexture(ctx, zoom) {
    if (zoom < 0.5) return; // Only show when zoomed in enough

    ctx.save();
    ctx.globalAlpha = 0.15;

    for (const t of this.territories) {
      if (t.isWater) continue;

      const center = this._getTerritoryCenter(t);
      if (center[0] === null) continue;

      const [cx, cy] = center;
      // Use territory name hash for consistent random placement
      const hash = this._hashString(t.name);

      // Draw mountains for territories with certain hash values
      if (hash % 3 === 0) {
        this._drawMountains(ctx, cx, cy, hash);
      }

      // Draw rivers for other territories
      if (hash % 3 === 1) {
        this._drawRiver(ctx, cx, cy, hash);
      }
    }

    ctx.restore();
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  _drawMountains(ctx, cx, cy, seed) {
    ctx.strokeStyle = 'rgba(60, 40, 20, 0.5)';
    ctx.fillStyle = 'rgba(80, 60, 40, 0.3)';
    ctx.lineWidth = 1;

    const count = 2 + (seed % 3);
    for (let i = 0; i < count; i++) {
      const x = cx + ((seed * (i + 1)) % 60) - 30;
      const y = cy + ((seed * (i + 2)) % 40) - 20;
      const size = 8 + (seed % 6);

      ctx.beginPath();
      ctx.moveTo(x - size, y + size / 2);
      ctx.lineTo(x, y - size / 2);
      ctx.lineTo(x + size, y + size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }

  _drawRiver(ctx, cx, cy, seed) {
    ctx.strokeStyle = 'rgba(70, 130, 180, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';

    const startX = cx - 25 + (seed % 20);
    const startY = cy - 20 + (seed % 15);

    ctx.beginPath();
    ctx.moveTo(startX, startY);

    // Wavy river line
    let x = startX, y = startY;
    for (let i = 0; i < 4; i++) {
      const dx = 10 + (seed % 8);
      const dy = 8 + ((seed * i) % 10);
      const cpx = x + dx / 2 + ((seed * i) % 6) - 3;
      const cpy = y + dy / 2;
      x += dx;
      y += dy;
      ctx.quadraticCurveTo(cpx, cpy, x, y);
    }
    ctx.stroke();
  }

  /** Draw small flag markers on each territory to show ownership */
  renderOwnershipFlags(ctx, zoom) {
    const mobile = isMobileShell();
    if (!this.gameState || !shouldDrawPhoneOwnershipFlags(zoom, { mobile })) return;

    const flagWidth = phoneOwnershipFlagSize(zoom, { mobile });
    const flagHeight = flagWidth * 0.67;

    for (const t of this.territories) {
      if (t.isWater) continue;

      const owner = this.gameState.getOwner(t.name);
      if (!owner) continue;

      const player = this.gameState.getPlayer(owner);
      if (!player || !player.flag) continue;

      // Skip capitals - they get the big flag treatment
      if (this.gameState.isCapital(t.name)) continue;

      // Calculate center from all polygons for proper placement on merged territories
      let [cx, cy] = this._getTerritoryCenter(t);
      if (cx === null) continue;

      // Apply per-territory offset if defined
      const offset = TerritoryRenderer.TERRITORY_OFFSETS[t.name];
      if (offset) {
        cx += offset.x;
        cy += offset.y;
      }

      // Position centered above units (units are drawn at cy + 25)
      const x = cx;
      const y = cy - 5;

      this._drawOwnershipFlag(ctx, x, y, flagWidth, flagHeight, player.flag, player.color);
    }
  }

  _drawOwnershipFlag(ctx, x, y, width, height, flag, color) {
    const img = this.flagImages[flag];
    if (!img || !img.complete || img.naturalWidth === 0) return;

    ctx.save();

    // Draw small colored border/background
    const padding = 2;
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;

    // Draw rounded rect background
    ctx.beginPath();
    this._roundRect(ctx, x - width / 2 - padding, y - height / 2 - padding, width + padding * 2, height + padding * 2, 3);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Draw flag image
    ctx.drawImage(img, x - width / 2, y - height / 2, width, height);

    // Subtle border around flag
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 0.5;
    ctx.strokeRect(x - width / 2, y - height / 2, width, height);

    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /** Draw continent bonus indicators - now just a subtle background tint */
  renderContinentIndicators(ctx) {
    // Removed confusing per-territory borders
    // Continent groupings are now shown via:
    // 1. Continent labels when zoomed out (renderContinentLabels)
    // 2. Continent bonus table in UI
    // No additional rendering needed here
  }

  /** Draw continent name labels when zoomed out enough */
  renderContinentLabels(ctx, zoom) {
    if (zoom > 0.6) return; // Only show when zoomed out

    const fontSize = Math.max(18, Math.min(28, 24 / zoom * 0.4));
    ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Manual position overrides for continents that span map edges or need adjustment
    const LABEL_OVERRIDES = {
      'North America': { x: 550, y: 450 },  // Centered on US, away from Alaska
    };

    for (const continent of this.continents) {
      // Use override if available, otherwise calculate center
      let cx, cy;
      if (LABEL_OVERRIDES[continent.name]) {
        cx = LABEL_OVERRIDES[continent.name].x;
        cy = LABEL_OVERRIDES[continent.name].y;
      } else {
        const center = this._getContinentCenter(continent);
        if (!center) continue;
        [cx, cy] = center;
      }

      // Draw label with continent color
      ctx.save();
      ctx.globalAlpha = 0.7;

      // Text shadow for readability
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeText(continent.name, cx, cy);

      ctx.fillStyle = continent.color;
      ctx.fillText(continent.name, cx, cy);

      // Bonus indicator below name
      const smallSize = fontSize * 0.6;
      ctx.font = `${smallSize}px 'Segoe UI', sans-serif`;
      ctx.strokeText(`+${continent.bonus}`, cx, cy + fontSize * 0.8);
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`+${continent.bonus}`, cx, cy + fontSize * 0.8);

      ctx.restore();
    }
  }

  _getContinentCenter(continent) {
    const MAP_WIDTH = 3500; // Must match camera.js MAP_WIDTH
    const centers = [];

    for (const tName of continent.territories) {
      const t = this.territoryByName[tName];
      if (!t || t.isWater) continue;
      const center = this._getTerritoryCenter(t);
      if (center[0] !== null) {
        centers.push(center);
      }
    }

    if (centers.length === 0) return null;

    // Check if continent spans the map wrap (some territories on left, some on right)
    const leftSide = centers.filter(c => c[0] < MAP_WIDTH / 3);
    const rightSide = centers.filter(c => c[0] > MAP_WIDTH * 2 / 3);

    let sumX = 0, sumY = 0;

    if (leftSide.length > 0 && rightSide.length > 0) {
      // Continent spans the wrap - shift right-side territories to negative x for averaging
      for (const [x, y] of centers) {
        const adjustedX = x > MAP_WIDTH / 2 ? x - MAP_WIDTH : x;
        sumX += adjustedX;
        sumY += y;
      }
      let avgX = sumX / centers.length;
      // Wrap back to positive if needed
      if (avgX < 0) avgX += MAP_WIDTH;
      return [avgX, sumY / centers.length];
    } else {
      // Normal averaging
      for (const [x, y] of centers) {
        sumX += x;
        sumY += y;
      }
      return [sumX / centers.length, sumY / centers.length];
    }
  }

  /** Draw territory outlines */
  renderTerritoryOutlines(ctx, zoom = 1) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    // Land territory borders — stable CSS-px at world Fit, 1 world-px zoomed in.
    const countryW = phoneCountryOutlineWidth(zoom, {
      mobile: isMobileShell(),
      setup: isPhoneSetupPhase(this.gameState?.phase),
    });
    if (countryW > 0) {
      ctx.strokeStyle = PHONE_COUNTRY_HAIRLINE_COLOR;
      ctx.lineWidth = countryW;
      for (const t of this.territories) {
        if (t.isWater) continue;
        const rings = t.polygons || [];
        if (rings.length <= 1) {
          const poly = rings[0];
          if (!poly || poly.length < 3) continue;
          this._strokePoly(ctx, poly);
          continue;
        }
        this._strokeEdges(ctx, this._getExternalEdgesWithTolerance(rings, t.name));
      }
    }

    // Sea-zone hairline — same CSS-px family as land. Water-mask
    // stroke+shadow stays off (jagged dark coasts). Dashes stay off
    // in phone setup. Yellow land-bridge lanes are a later pass.
    const seaW = phoneSeaOutlineWidth(zoom, {
      mobile: isMobileShell(),
      setup: isPhoneSetupPhase(this.gameState?.phase),
    });
    if (seaW > 0) {
      ctx.strokeStyle = PHONE_SEA_HAIRLINE_COLOR;
      ctx.lineWidth = seaW;
      ctx.setLineDash([]);
      for (const t of this.territories) {
        if (!t.isWater) continue;
        for (const poly of t.polygons || []) {
          if (!poly || poly.length < 3) continue;
          this._strokePoly(ctx, poly);
        }
      }
    }

    // Sea zone dashes alias at world Fit. Skip them when zoomed out
    // and during phone setup (fills only — keep yellow land-bridge lanes).
    if (shouldStrokePhoneSeaDashes(zoom, {
      mobile: isMobileShell(),
      setup: isPhoneSetupPhase(this.gameState?.phase),
    })) {
      ctx.strokeStyle = 'rgba(80, 140, 200, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      for (const t of this.territories) {
        if (!t.isWater) continue;
        for (const poly of t.polygons) {
          this._strokePoly(ctx, poly);
        }
      }
      ctx.setLineDash([]);
    }
    ctx.restore();
  }

  /**
   * Get external edges for a multi-polygon territory (edges not shared between polygons).
   * Returns null if polygons don't share any edges (disconnected) - caller should skip drawing.
   */
  _getExternalEdgesForTerritory(polygons) {
    const edgeCount = new Map();
    const allEdges = [];

    // Count how many times each edge appears across all polygons
    for (const poly of polygons) {
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        // Skip zero-length edges
        if (p1[0] === p2[0] && p1[1] === p2[1]) continue;
        const key = this._edgeKey(p1, p2);
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        allEdges.push({ p1, p2, key });
      }
    }

    // Check if any edges are shared (appear more than once)
    let hasSharedEdges = false;
    for (const count of edgeCount.values()) {
      if (count > 1) {
        hasSharedEdges = true;
        break;
      }
    }

    // If no shared edges, polygons are disconnected - return null to skip drawing
    if (!hasSharedEdges) {
      return null;
    }

    // External edges appear only once (not shared between polygons)
    const externalEdges = [];
    for (const edge of allEdges) {
      if (edgeCount.get(edge.key) === 1) {
        externalEdges.push([edge.p1, edge.p2]);
      }
    }

    return externalEdges;
  }

  /**
   * Get unified polygons for a territory, handling both connected and disconnected pieces.
   * For connected polygons (sharing edges), merges them into a single boundary.
   * For disconnected polygons (islands, separate land masses), keeps them separate.
   * Returns an array of polygons to render.
   */
  _getUnifiedPolygons(polygons) {
    if (polygons.length === 1) return polygons;

    const vertexKey = (p) => `${p[0]},${p[1]}`;

    // First, group polygons by connectivity using shared edges
    const edgeToPolygons = new Map();
    for (let i = 0; i < polygons.length; i++) {
      const poly = polygons[i];
      for (let j = 0; j < poly.length; j++) {
        const p1 = poly[j];
        const p2 = poly[(j + 1) % poly.length];
        // Skip zero-length edges
        if (p1[0] === p2[0] && p1[1] === p2[1]) continue;
        const key = this._edgeKey(p1, p2);
        if (!edgeToPolygons.has(key)) edgeToPolygons.set(key, []);
        edgeToPolygons.get(key).push(i);
      }
    }

    // Build connectivity graph between polygons
    const polyGroups = new Array(polygons.length).fill(-1);
    let groupId = 0;

    for (let i = 0; i < polygons.length; i++) {
      if (polyGroups[i] !== -1) continue;

      // BFS to find all connected polygons
      const queue = [i];
      polyGroups[i] = groupId;

      while (queue.length > 0) {
        const current = queue.shift();
        const poly = polygons[current];

        for (let j = 0; j < poly.length; j++) {
          const p1 = poly[j];
          const p2 = poly[(j + 1) % poly.length];
          // Skip zero-length edges
          if (p1[0] === p2[0] && p1[1] === p2[1]) continue;
          const key = this._edgeKey(p1, p2);
          const connected = edgeToPolygons.get(key) || [];
          for (const other of connected) {
            if (polyGroups[other] === -1) {
              polyGroups[other] = groupId;
              queue.push(other);
            }
          }
        }
      }
      groupId++;
    }

    // Group polygons by their group ID
    const groups = [];
    for (let g = 0; g < groupId; g++) {
      const group = polygons.filter((_, i) => polyGroups[i] === g);
      groups.push(group);
    }

    // For each group, either return as-is (single polygon) or compute unified boundary
    const result = [];
    for (const group of groups) {
      if (group.length === 1) {
        result.push(group[0]);
      } else {
        // Compute unified polygon for this connected group
        const unified = this._traceUnifiedBoundary(group);
        if (unified && unified.length >= 3) {
          result.push(unified);
        } else {
          // Fallback: include all polygons in the group individually
          for (const poly of group) {
            if (poly && poly.length >= 3) {
              result.push(poly);
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Trace the external boundary of connected polygons into a single unified polygon.
   */
  _traceUnifiedBoundary(polygons) {
    const vertexKey = (p) => `${p[0]},${p[1]}`;
    const edgeCount = new Map();
    const edges = [];

    // Count edge occurrences, filtering out zero-length edges
    for (const poly of polygons) {
      for (let i = 0; i < poly.length; i++) {
        const p1 = poly[i];
        const p2 = poly[(i + 1) % poly.length];
        // Skip zero-length edges (degenerate edges where p1 equals p2)
        if (p1[0] === p2[0] && p1[1] === p2[1]) continue;
        const key = this._edgeKey(p1, p2);
        edgeCount.set(key, (edgeCount.get(key) || 0) + 1);
        edges.push({ p1, p2, key });
      }
    }

    // Get only external edges (appear once)
    const externalEdges = edges.filter(e => edgeCount.get(e.key) === 1);
    if (externalEdges.length === 0) return null;

    // Build adjacency map
    const adjacency = new Map();
    for (const edge of externalEdges) {
      const k1 = vertexKey(edge.p1);
      const k2 = vertexKey(edge.p2);

      if (!adjacency.has(k1)) adjacency.set(k1, []);
      if (!adjacency.has(k2)) adjacency.set(k2, []);

      adjacency.get(k1).push({ edge, next: edge.p2 });
      adjacency.get(k2).push({ edge, next: edge.p1 });
    }

    // Trace the boundary
    const usedEdges = new Set();
    const unified = [];
    let current = externalEdges[0].p1;
    const startKey = vertexKey(current);

    unified.push(current);

    let safety = externalEdges.length + 10;
    while (safety-- > 0) {
      const currentKey = vertexKey(current);
      const connections = adjacency.get(currentKey) || [];

      let foundNext = null;
      for (const conn of connections) {
        if (!usedEdges.has(conn.edge.key)) {
          usedEdges.add(conn.edge.key);
          foundNext = conn.next;
          break;
        }
      }

      if (!foundNext) break;

      current = foundNext;
      if (vertexKey(current) === startKey) break;

      unified.push(current);
    }

    return unified.length >= 3 ? unified : null;
  }

  /** Create a canonical key for an edge that's the same regardless of direction */
  _edgeKey(p1, p2) {
    const [x1, y1] = p1;
    const [x2, y2] = p2;
    if (x1 < x2 || (x1 === x2 && y1 < y2)) {
      return `${x1},${y1}-${x2},${y2}`;
    } else {
      return `${x2},${y2}-${x1},${y1}`;
    }
  }

  /** Draw a list of edges */
  _strokeEdges(ctx, edges) {
    ctx.beginPath();
    for (const [p1, p2] of edges) {
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
    }
    ctx.stroke();
  }

  /**
   * Get external edges for multi-polygon territory (uses cache for performance).
   */
  _getExternalEdgesWithTolerance(polygons, territoryName) {
    // Use cached result if available
    if (territoryName && this._externalEdgesCache[territoryName]) {
      return this._externalEdgesCache[territoryName];
    }
    // Fallback to computation (shouldn't happen often)
    return this._computeExternalEdges(polygons);
  }

  /**
   * Compute external edges for multi-polygon territory using tolerance-based matching.
   * Edges that approximately match or overlap between polygons are considered internal and excluded.
   */
  _computeExternalEdges(polygons) {
    return mergedTerritoryOutlineEdges(polygons);
  }

  /** Draw capital markers with faction flags */
  renderCapitals(ctx, zoom) {
    if (!this.gameState) return;

    // Scale parameters based on zoom - capitals should ALWAYS be very visible
    const isZoomedOut = zoom < 0.5;

    // Much larger markers when zoomed out
    const baseSize = isZoomedOut ? 60 / Math.max(zoom, 0.15) : 48;
    const flagWidth = Math.max(40, baseSize);
    const flagHeight = flagWidth * 0.75;
    const starSize = Math.max(20, baseSize * 0.5);

    for (const t of this.territories) {
      if (t.isWater) continue;
      if (!shouldDrawPhoneCapitalStar(t.name, this.gameState)) continue;

      // Calculate center from all polygons for proper placement on merged territories
      let [cx, cy] = this._getTerritoryCenter(t);
      if (cx === null) continue;

      // Apply per-territory offset if defined
      const offset = TerritoryRenderer.TERRITORY_OFFSETS[t.name];
      if (offset) {
        cx += offset.x;
        cy += offset.y;
      }

      const owner = this.gameState.getOwner(t.name);
      const player = this.gameState.getPlayer(owner);
      const color = this.gameState.getPlayerColor(owner);

      const { capitalDy } = phoneMapStackOffsets(zoom, { mobile: isMobileShell() });
      const y = cy + (isMobileShell() ? capitalDy : (isZoomedOut ? -20 : -35));

      if (shouldDrawPhoneCapitalGlow(this.gameState)) {
        this._drawCapitalGlow(ctx, cx, y, color, zoom);
      }

      // Draw "CAPITAL" label when zoomed out for extra visibility
      if (isZoomedOut && zoom < 0.3) {
        this._drawCapitalLabel(ctx, cx, y + flagHeight / 2 + 20, color);
      }

      // Draw flag if available
      if (player && player.flag && zoom >= 0.15) {
        this._drawCapitalFlag(ctx, cx, y, flagWidth, flagHeight, player.flag, color, isZoomedOut);
      } else {
        // Fallback: draw star marker for capital - always visible
        this._drawCapitalStar(ctx, cx, y, starSize * 1.5, color, isZoomedOut);
      }
    }
  }

  _drawCapitalGlow(ctx, x, y, color, zoom) {
    ctx.save();

    // Subtle glow effect for capital visibility
    const glowSize = Math.max(30, 40 / Math.max(zoom, 0.2));

    // Draw two layers for subtle glow
    for (let i = 1; i >= 0; i--) {
      const size = glowSize * (1 + i * 0.2);
      const alpha = Math.floor(120 - i * 40).toString(16).padStart(2, '0');

      const gradient = ctx.createRadialGradient(x, y, 0, x, y, size);
      gradient.addColorStop(0, color + alpha);
      gradient.addColorStop(0.6, color + Math.floor(parseInt(alpha, 16) / 3).toString(16).padStart(2, '0'));
      gradient.addColorStop(1, 'transparent');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  _drawCapitalLabel(ctx, x, y, color) {
    ctx.save();
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // White outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeText('★ CAPITAL ★', x, y);

    // Colored fill
    ctx.fillStyle = color;
    ctx.fillText('★ CAPITAL ★', x, y);

    ctx.restore();
  }

  _drawCapitalFlag(ctx, x, y, width, height, flag, color, isZoomedOut = false) {
    const img = this.flagImages[flag];

    ctx.save();

    // Draw a BIG 5-pointed star in the PLAYER'S COLOR as the capital marker
    const starSize = isZoomedOut ? 90 : 70;
    this._drawCapitalStar(ctx, x, y, starSize, color, isZoomedOut);

    // Draw smaller circular flag in the center of the star
    const circleRadius = isZoomedOut ? 16 : 13;

    // Draw circle border/background
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(x, y, circleRadius + 2, 0, Math.PI * 2);
    ctx.fillStyle = '#222';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Clip to circle and draw flag
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
      ctx.clip();

      // Draw flag image centered and covering the circle
      const imgSize = circleRadius * 2.4;
      ctx.drawImage(img, x - imgSize / 2, y - imgSize / 2, imgSize, imgSize);
      ctx.restore();
    }

    // Draw circle border on top
    ctx.beginPath();
    ctx.arc(x, y, circleRadius, 0, Math.PI * 2);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();
  }

  _drawCapitalStar(ctx, x, y, size, color, isZoomedOut = false) {
    const r = size / 2;
    const innerR = r * 0.4;
    const points = 5;

    ctx.save();
    ctx.translate(x, y);

    // Strong glow effect for visibility at all zoom levels
    ctx.shadowColor = color;
    ctx.shadowBlur = isZoomedOut ? 20 : 12;

    // Always add white outline for visibility (not just when zoomed out)
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = isZoomedOut ? 4 : 3;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? r : innerR;
      const angle = (Math.PI / points) * i - Math.PI / 2;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = isZoomedOut ? 2 : 1.5;

    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const radius = i % 2 === 0 ? r : innerR;
      const angle = (Math.PI / points) * i - Math.PI / 2;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.restore();
  }

  /** Draw hover highlight */
  renderHover(ctx, territory) {
    if (!territory) return;

    ctx.save();

    if (territory.isWater) {
      // Sea zones: brighter semi-transparent fill + dashed glow outline so
      // hover is unambiguous even though the zone has no land mass to fill.
      ctx.shadowColor = '#40c4ff';
      ctx.shadowBlur = 12;
      ctx.fillStyle = 'rgba(100, 210, 255, 0.28)';
      for (const poly of territory.polygons) {
        if (!poly || poly.length < 3) continue;
        this._fillPoly(ctx, poly);
      }
      ctx.strokeStyle = 'rgba(64, 196, 255, 0.7)';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 4]);
      for (const poly of territory.polygons) {
        if (!poly || poly.length < 3) continue;
        this._strokePoly(ctx, poly);
      }
      ctx.setLineDash([]);
    } else {
      // Land territories: softer yellow highlight
      ctx.shadowColor = '#ffcc00';
      ctx.shadowBlur = 15;

      // Fill with subtle highlight
      ctx.fillStyle = 'rgba(255, 230, 100, 0.25)';
      for (const poly of territory.polygons) {
        if (!poly || poly.length < 3) continue;
        this._fillPoly(ctx, poly);
      }

      // Stroke outline - use external edges only to hide internal borders
      ctx.strokeStyle = 'rgba(255, 220, 100, 0.8)';
      ctx.lineWidth = 3;
      if (territory.polygons.length === 1) {
        this._strokePoly(ctx, territory.polygons[0]);
      } else {
        const externalEdges = this._getExternalEdgesWithTolerance(territory.polygons, territory.name);
        this._strokeEdges(ctx, externalEdges);
      }
    }

    ctx.restore();
  }

  /** Draw selection highlight */
  renderSelected(ctx, territory) {
    if (!territory) return;

    if (territory.isWater) {
      // Sea zones: brighter fill + thicker solid outline than hover, so
      // selected-vs-hovered is never ambiguous for a zone with no land fill.
      ctx.shadowColor = '#40c4ff';
      ctx.shadowBlur = 16;
      ctx.fillStyle = 'rgba(120, 220, 255, 0.4)';
      for (const poly of territory.polygons) {
        if (!poly || poly.length < 3) continue;
        this._fillPoly(ctx, poly);
      }
      ctx.strokeStyle = 'rgba(140, 225, 255, 0.95)';
      ctx.lineWidth = 4;
      for (const poly of territory.polygons) {
        if (!poly || poly.length < 3) continue;
        this._strokePoly(ctx, poly);
      }
      ctx.shadowBlur = 0;
      return;
    }

    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 12;

    // Fill with subtle highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    for (const poly of territory.polygons) {
      if (!poly || poly.length < 3) continue;
      this._fillPoly(ctx, poly);
    }

    // Stroke outline - use external edges only to hide internal borders
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    if (territory.polygons.length === 1) {
      this._strokePoly(ctx, territory.polygons[0]);
    } else {
      const externalEdges = this._getExternalEdgesWithTolerance(territory.polygons, territory.name);
      this._strokeEdges(ctx, externalEdges);
    }

    ctx.shadowBlur = 0;
  }

  /** Highlight valid move destinations */
  renderValidMoveDestinations(ctx, destinations, isEnemy) {
    if (!destinations || destinations.length === 0) return;

    for (const destName of destinations) {
      const t = this.territoryByName[destName];
      if (!t) continue;

      // Green for friendly, red for enemy
      const color = isEnemy?.[destName] ? 'rgba(244, 67, 54, 0.3)' : 'rgba(76, 175, 80, 0.3)';
      const borderColor = isEnemy?.[destName] ? 'rgba(244, 67, 54, 0.8)' : 'rgba(76, 175, 80, 0.8)';

      // Fill
      ctx.fillStyle = color;
      for (const poly of t.polygons) {
        if (!poly || poly.length < 3) continue;
        this._fillPoly(ctx, poly);
      }

      // Stroke outline - use external edges only to hide internal borders
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      if (t.polygons.length === 1) {
        this._strokePoly(ctx, t.polygons[0]);
      } else {
        const externalEdges = this._getExternalEdgesWithTolerance(t.polygons, t.name);
        this._strokeEdges(ctx, externalEdges);
      }
      ctx.setLineDash([]);
    }
  }

  /** Highlight territories from action log hover */
  renderActionLogHighlights(ctx) {
    if (!this.highlightedTerritories || this.highlightedTerritories.length === 0) return;

    for (const territoryName of this.highlightedTerritories) {
      const t = this.territoryByName[territoryName];
      if (!t) continue;

      // Bright cyan highlight for action log
      ctx.save();
      ctx.shadowColor = '#00ffff';
      ctx.shadowBlur = 15;

      // Fill
      ctx.fillStyle = 'rgba(0, 255, 255, 0.3)';
      for (const poly of t.polygons) {
        if (!poly || poly.length < 3) continue;
        this._fillPoly(ctx, poly);
      }

      // Stroke outline with glow
      ctx.strokeStyle = '#00ffff';
      ctx.lineWidth = 3;
      if (t.polygons.length === 1) {
        this._strokePoly(ctx, t.polygons[0]);
      } else {
        const externalEdges = this._getExternalEdgesWithTolerance(t.polygons, t.name);
        this._strokeEdges(ctx, externalEdges);
      }

      ctx.restore();
    }
  }

  /** Render movement arrow between two territories */
  renderMovementArrow(ctx) {
    if (!this.movementArrowFrom || !this.movementArrowTo) return;

    const t1 = this.territoryByName[this.movementArrowFrom];
    const t2 = this.territoryByName[this.movementArrowTo];
    if (!t1 || !t2) return;

    const [x1, y1] = this._getTerritoryCenter(t1);
    let [x2, y2] = this._getTerritoryCenter(t2);
    if (x1 === null || x2 === null) return;

    ctx.save();

    // Handle map wrap-around: if the direct distance is > half the map width,
    // the shorter path is across the wrap boundary
    const MAP_WIDTH = 3500; // Must match camera.js MAP_WIDTH
    let dx = x2 - x1;
    if (Math.abs(dx) > MAP_WIDTH / 2) {
      // Shorter path is across the wrap - adjust x2
      if (dx > 0) {
        x2 -= MAP_WIDTH; // Target is on right, wrap to left
      } else {
        x2 += MAP_WIDTH; // Target is on left, wrap to right
      }
      dx = x2 - x1;
    }

    const dy = y2 - y1;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);

    // Shorten the arrow to not overlap territory centers
    const shortenBy = 30;
    const startX = x1 + Math.cos(angle) * shortenBy;
    const startY = y1 + Math.sin(angle) * shortenBy;
    const endX = x2 - Math.cos(angle) * shortenBy;
    const endY = y2 - Math.sin(angle) * shortenBy;

    // Use neon yellow for combat, cyan for regular movement
    const arrowColor = this.movementArrowIsCombat ? '#ffff00' : '#00ffff';

    // Draw glow
    ctx.shadowColor = arrowColor;
    ctx.shadowBlur = this.movementArrowIsCombat ? 15 : 10;

    // Draw arrow line
    ctx.strokeStyle = arrowColor;
    ctx.lineWidth = this.movementArrowIsCombat ? 5 : 4;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw arrowhead
    const headLength = this.movementArrowIsCombat ? 18 : 15;
    const headAngle = Math.PI / 6;

    ctx.fillStyle = arrowColor;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - headLength * Math.cos(angle - headAngle),
      endY - headLength * Math.sin(angle - headAngle)
    );
    ctx.lineTo(
      endX - headLength * Math.cos(angle + headAngle),
      endY - headLength * Math.sin(angle + headAngle)
    );
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  /** Render air movement visualization - shows flight range circle and path arrows */
  renderAirMovementVisualization(ctx) {
    // Render reachable territories highlight
    if (this.airMovementReachable && this.airMovementReachable.size > 0) {
      ctx.save();

      // Draw faint highlight on all reachable territories
      const reachableArray = this.airMovementReachable instanceof Map
        ? Array.from(this.airMovementReachable.keys())
        : Array.from(this.airMovementReachable);

      for (const territoryName of reachableArray) {
        const t = this.territoryByName[territoryName];
        if (!t) continue;

        // Light blue highlight for reachable
        ctx.fillStyle = 'rgba(100, 200, 255, 0.15)';
        for (const poly of t.polygons) {
          if (!poly || poly.length < 3) continue;
          this._fillPoly(ctx, poly);
        }

        // Dashed border
        ctx.strokeStyle = 'rgba(100, 200, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        if (t.polygons.length === 1) {
          this._strokePoly(ctx, t.polygons[0]);
        } else {
          const externalEdges = this._getExternalEdgesWithTolerance(t.polygons, t.name);
          this._strokeEdges(ctx, externalEdges);
        }
        ctx.setLineDash([]);
      }

      ctx.restore();
    }

    // Render flight path arrows
    if (this.airMovementPath && this.airMovementPath.length > 1) {
      ctx.save();

      // Draw arrows between each territory in the path
      for (let i = 0; i < this.airMovementPath.length - 1; i++) {
        const fromName = this.airMovementPath[i];
        const toName = this.airMovementPath[i + 1];

        const t1 = this.territoryByName[fromName];
        const t2 = this.territoryByName[toName];
        if (!t1 || !t2) continue;

        const [x1, y1] = this._getTerritoryCenter(t1);
        const [x2, y2] = this._getTerritoryCenter(t2);
        if (x1 === null || x2 === null) continue;

        // Calculate arrow properties
        const dx = x2 - x1;
        const dy = y2 - y1;
        const angle = Math.atan2(dy, dx);

        // Shorten arrows
        const shortenBy = 25;
        const startX = x1 + Math.cos(angle) * shortenBy;
        const startY = y1 + Math.sin(angle) * shortenBy;
        const endX = x2 - Math.cos(angle) * shortenBy;
        const endY = y2 - Math.sin(angle) * shortenBy;

        // Cyan color for air movement
        const arrowColor = '#00ccff';

        ctx.shadowColor = arrowColor;
        ctx.shadowBlur = 8;

        // Draw dashed arrow line
        ctx.strokeStyle = arrowColor;
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Draw arrowhead
        const headLength = 12;
        const headAngle = Math.PI / 6;

        ctx.fillStyle = arrowColor;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - headLength * Math.cos(angle - headAngle),
          endY - headLength * Math.sin(angle - headAngle)
        );
        ctx.lineTo(
          endX - headLength * Math.cos(angle + headAngle),
          endY - headLength * Math.sin(angle + headAngle)
        );
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }
  }

  /** Draw territory labels */
  renderLabels(ctx, zoom) {
    if (zoom < 0.4) return;

    const fontSize = Math.max(8, Math.min(13, 11 / zoom * 0.7));
    ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Per-territory label offsets to avoid unit overlap
    // Additional label-specific offsets (on top of TERRITORY_OFFSETS)
    const LABEL_EXTRA_OFFSETS = {
      'Eire': { x: 0, y: -15 },
      'United Kingdom': { x: 0, y: -15 },
    };

    for (const t of this.territories) {
      if (t.isWater) continue;
      if (shouldHidePhoneMapLabel({
        mobile: isMobileShell(),
        name: t.name,
        peekedName: this.peekedLabelName,
        zoom,
      })) continue;

      // Calculate center from all polygons for proper centering of merged territories
      let [cx, cy] = this._getTerritoryCenter(t);
      if (cx === null) continue;

      // Apply shared territory offset first
      const territoryOffset = TerritoryRenderer.TERRITORY_OFFSETS[t.name];
      if (territoryOffset) {
        cx += territoryOffset.x;
        cy += territoryOffset.y;
      }

      // Apply additional label-specific offset
      const labelOffset = LABEL_EXTRA_OFFSETS[t.name];
      if (labelOffset) {
        cx += labelOffset.x;
        cy += labelOffset.y;
      }

      // Background for readability
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      const { nameDy } = phoneMapStackOffsets(zoom, { mobile: isMobileShell() });
      const nameY = cy + nameDy;
      ctx.strokeText(t.name, cx, nameY);

      ctx.fillStyle = '#fff';
      ctx.fillText(t.name, cx, nameY);

      // Show IPC value below name when zoomed in
      if (zoom > 0.6 && t.production > 0) {
        const smallSize = fontSize * 0.75;
        ctx.font = `${smallSize}px 'Segoe UI', sans-serif`;
        ctx.strokeText(`${t.production} IPC`, cx, nameY + fontSize + 2);
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`${t.production} IPC`, cx, nameY + fontSize + 2);
        ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
      }
    }
  }

  /** Get the centroid of all polygons in a territory (uses cache for performance) */
  _getTerritoryCenter(territory) {
    // Use cached result if available
    if (this._territoryCenterCache[territory.name]) {
      return this._territoryCenterCache[territory.name];
    }
    // Fallback to computation
    return this._computeTerritoryCenter(territory);
  }

  /** Calculate the centroid of all polygons in a territory */
  _computeTerritoryCenter(territory) {
    if (!territory.polygons || territory.polygons.length === 0) {
      return territory.center || [null, null];
    }

    // Calculate weighted centroid based on polygon areas
    let totalArea = 0;
    let sumX = 0;
    let sumY = 0;

    for (const poly of territory.polygons) {
      if (poly.length < 3) continue;

      // Calculate polygon centroid and area
      const { cx, cy, area } = this._getPolygonCentroid(poly);
      if (area > 0) {
        sumX += cx * area;
        sumY += cy * area;
        totalArea += area;
      }
    }

    if (totalArea === 0) {
      return territory.center || [null, null];
    }

    return [sumX / totalArea, sumY / totalArea];
  }

  /** Calculate the centroid and area of a single polygon */
  _getPolygonCentroid(poly) {
    let area = 0;
    let cx = 0;
    let cy = 0;

    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      const cross = x1 * y2 - x2 * y1;
      area += cross;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
    }

    area = Math.abs(area) / 2;
    if (area === 0) return { cx: 0, cy: 0, area: 0 };

    const factor = 1 / (6 * (area > 0 ? area : 1));
    return {
      cx: Math.abs(cx * factor),
      cy: Math.abs(cy * factor),
      area
    };
  }

  _fillPoly(ctx, points) {
    if (points.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
  }

  _strokePoly(ctx, points) {
    if (points.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.stroke();
  }

  /** Draw lines showing cross-water connections between territories */
  renderCrossWaterConnections(ctx, zoom) {
    // Show land bridges - smaller, less intrusive
    const lineWidth = Math.max(2, 3 / Math.max(zoom, 0.3));
    const circleSize = Math.max(3, 4 / Math.max(zoom, 0.3));

    ctx.save();

    for (const [t1Name, t2Name] of LAND_BRIDGES) {
      const t1 = this.territoryByName[t1Name];
      const t2 = this.territoryByName[t2Name];

      if (!t1 || !t2) continue;

      // Find closest edge points between territories
      const [x1, y1, x2, y2] = this._findClosestEdgePoints(t1, t2);
      if (x1 === null) continue;

      // Draw subtle glow effect
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
      ctx.lineWidth = lineWidth + 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Draw main line
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Draw small anchor circles at endpoints
      ctx.setLineDash([]);
      ctx.fillStyle = '#ffd700';
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.arc(x1, y1, circleSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x2, y2, circleSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.restore();
  }

  // Find the closest points between two territories' edges
  _findClosestEdgePoints(t1, t2) {
    const points1 = this._getEdgePoints(t1);
    const points2 = this._getEdgePoints(t2);

    if (points1.length === 0 || points2.length === 0) {
      // Fallback to centers
      const c1 = this._getTerritoryCenter(t1);
      const c2 = this._getTerritoryCenter(t2);
      return [...c1, ...c2];
    }

    let minDist = Infinity;
    let closest = [null, null, null, null];

    // Sample points to find closest pair
    for (const p1 of points1) {
      for (const p2 of points2) {
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const dist = dx * dx + dy * dy;
        if (dist < minDist) {
          minDist = dist;
          closest = [p1[0], p1[1], p2[0], p2[1]];
        }
      }
    }

    return closest;
  }

  // Get sampled edge points from territory polygons
  _getEdgePoints(territory) {
    const points = [];
    if (!territory.polygons) return points;

    for (const poly of territory.polygons) {
      if (!poly || poly.length < 3) continue;

      // Sample every few points along the polygon
      const step = Math.max(1, Math.floor(poly.length / 20));
      for (let i = 0; i < poly.length; i += step) {
        points.push(poly[i]);
      }
    }
    return points;
  }

  // Get land bridges for movement validation
  static getLandBridges() {
    return LAND_BRIDGES;
  }

  // Air landing destinations - show valid territories where air units can land
  airLandingDestinations = [];

  setAirLandingDestinations(destinations) {
    this.airLandingDestinations = destinations || [];
  }

  clearAirLandingDestinations() {
    this.airLandingDestinations = [];
  }

  /** Render air landing destination highlights */
  renderAirLandingDestinations(ctx) {
    if (!this.airLandingDestinations || this.airLandingDestinations.length === 0) return;

    ctx.save();

    for (const destName of this.airLandingDestinations) {
      const t = this.territoryByName[destName];
      if (!t) continue;

      // Blue/cyan for air landing destinations
      ctx.fillStyle = 'rgba(64, 196, 255, 0.25)';
      for (const poly of t.polygons) {
        if (!poly || poly.length < 3) continue;
        this._fillPoly(ctx, poly);
      }

      // Solid blue border with glow
      ctx.shadowColor = '#40c4ff';
      ctx.shadowBlur = 8;
      ctx.strokeStyle = 'rgba(64, 196, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 4]);
      if (t.polygons.length === 1) {
        this._strokePoly(ctx, t.polygons[0]);
      } else {
        const externalEdges = this._getExternalEdgesWithTolerance(t.polygons, t.name);
        this._strokeEdges(ctx, externalEdges);
      }
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  // Manual hover highlight (from dropdown hover)
  manualHoverTerritory = null;

  setHoverHighlight(territoryName, highlight) {
    this.manualHoverTerritory = highlight ? territoryName : null;
  }

  /** Render programmatic hover highlight */
  renderHoverHighlight(ctx) {
    if (!this.manualHoverTerritory) return;

    const t = this.territoryByName[this.manualHoverTerritory];
    if (!t) return;

    ctx.save();

    // Bright yellow highlight for hover
    ctx.shadowColor = '#ffeb3b';
    ctx.shadowBlur = 15;

    ctx.fillStyle = 'rgba(255, 235, 59, 0.35)';
    for (const poly of t.polygons) {
      if (!poly || poly.length < 3) continue;
      this._fillPoly(ctx, poly);
    }

    ctx.strokeStyle = '#ffeb3b';
    ctx.lineWidth = 3;
    if (t.polygons.length === 1) {
      this._strokePoly(ctx, t.polygons[0]);
    } else {
      const externalEdges = this._getExternalEdgesWithTolerance(t.polygons, t.name);
      this._strokeEdges(ctx, externalEdges);
    }

    ctx.restore();
  }

  // Drag-and-drop destination highlight
  dragDestTerritory = null;
  dragDestIsValid = false;
  dragDestIsEnemy = false;

  setDragDestination(territoryName, isValid, isEnemy) {
    this.dragDestTerritory = territoryName;
    this.dragDestIsValid = isValid;
    this.dragDestIsEnemy = isEnemy;
  }

  /** Render drag destination highlight */
  renderDragDestination(ctx) {
    if (!this.dragDestTerritory) return;

    const t = this.territoryByName[this.dragDestTerritory];
    if (!t) return;

    ctx.save();

    if (this.dragDestIsValid) {
      // Valid destination - green or red for enemy
      const color = this.dragDestIsEnemy ? '#e74c3c' : '#4caf50';
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;
      ctx.fillStyle = this.dragDestIsEnemy ? 'rgba(231, 76, 60, 0.4)' : 'rgba(76, 175, 80, 0.4)';
      ctx.strokeStyle = color;
    } else {
      // Invalid destination - gray
      ctx.shadowColor = '#888';
      ctx.shadowBlur = 10;
      ctx.fillStyle = 'rgba(128, 128, 128, 0.3)';
      ctx.strokeStyle = '#888';
    }

    for (const poly of t.polygons) {
      if (!poly || poly.length < 3) continue;
      this._fillPoly(ctx, poly);
    }

    ctx.lineWidth = 3;
    if (t.polygons.length === 1) {
      this._strokePoly(ctx, t.polygons[0]);
    } else {
      const externalEdges = this._getExternalEdgesWithTolerance(t.polygons, t.name);
      this._strokeEdges(ctx, externalEdges);
    }

    ctx.restore();
  }
}
