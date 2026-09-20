// Renders unit icons at territory centers using sprite images

import { getUnitIconPath } from '../utils/unitIcons.js';
import { isMobileShell, phoneUnitIconSize, phoneMapStackOffsets, shouldHideUnitsAtZoom } from '../ui/mobileShell.js';

export class UnitRenderer {
  constructor(gameState, territories, unitDefs) {
    this.gameState = gameState;
    this.unitDefs = unitDefs;

    this.territoryByName = {};
    for (const t of territories) {
      this.territoryByName[t.name] = t;
    }

    // Phone tray selection — gold halo on matching stacks. Desktop unused.
    this.highlightUnitType = null;

    // Load unit images per faction
    this.factionUnitImages = {}; // factionId -> { unitType -> Image }
    this.imagesLoaded = false;
    this._loadImages();
  }

  async _loadImages() {
    const imagePromises = [];
    const factions = this.gameState.players?.map(p => p.id) || ['Americans', 'Germans', 'British', 'Japanese', 'Russians'];
    const unitTypes = Object.keys(this.unitDefs);

    for (const factionId of factions) {
      this.factionUnitImages[factionId] = {};

      for (const unitType of unitTypes) {
        const iconPath = getUnitIconPath(unitType, factionId);
        if (iconPath) {
          const img = new Image();
          const promise = new Promise((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve(); // Continue even if image fails
          });
          img.src = iconPath;
          this.factionUnitImages[factionId][unitType] = img;
          imagePromises.push(promise);
        }
      }
    }

    await Promise.all(imagePromises);
    this.imagesLoaded = true;
  }

  _getUnitImage(unitType, factionId) {
    return this.factionUnitImages[factionId]?.[unitType] || null;
  }

  render(ctx, zoom) {
    const mobile = isMobileShell();
    if (shouldHideUnitsAtZoom(zoom, { mobile })) return;

    const iconSize = phoneUnitIconSize(zoom, { mobile });
    const spacingX = iconSize + 4;
    const spacingY = iconSize + 8;

    for (const [territory, placements] of Object.entries(this.gameState.units)) {
      const t = this.territoryByName[territory];
      if (!t) continue;

      // For sea zones with islands, offset the center to be over water
      let [cx, cy] = this._getTerritoryCenter(t);
      if (cx === null) continue;

      // Apply manual offsets for land territories that need adjustment
      const landOffset = UnitRenderer.TERRITORY_CENTER_OFFSETS[territory];
      if (landOffset && !t.isWater) {
        cx += landOffset.x;
        cy += landOffset.y;
      }

      // If this is a sea zone, adjust center to avoid land overlap
      if (t.isWater) {
        const adjusted = this._adjustSeaZoneCenter(t, cx, cy);
        cx = adjusted.x;
        cy = adjusted.y;
      }

      // Group by type - show ALL types including cargo
      const grouped = this._groupUnits(placements, true);
      const types = Object.keys(grouped);
      if (types.length === 0) continue;

      // Use smaller maxPerRow for sea zones to prevent bleeding into land
      // Sea zones use 3 across, land uses 5
      const maxPerRow = t.isWater ? 3 : 5;

      // For sea zones, separate into three categories
      if (t.isWater) {
        this._renderSeaZoneUnits(ctx, cx, cy, grouped, iconSize, spacingX, spacingY, zoom);
      } else {
        // Land territory: render all units in flat grid
        this._renderUnitGrid(ctx, cx, cy, types, grouped, maxPerRow, iconSize, spacingX, spacingY, zoom);
      }
    }
  }

  // Render units in a sea zone with three visual sections:
  // 1. Naval units (ships)
  // 2. Cargo units (on transports/carriers)
  // 3. Air units (not landed)
  _renderSeaZoneUnits(ctx, cx, cy, grouped, iconSize, spacingX, spacingY, zoom) {
    const maxPerRow = 3;
    const sectionGap = 6; // Extra gap between sections

    // Categorize units into three groups
    const navalTypes = ['transport', 'submarine', 'destroyer', 'cruiser', 'battleship', 'carrier'];

    const navalUnits = [];
    const cargoUnits = [];
    const airUnits = [];

    for (const [key, unitInfo] of Object.entries(grouped)) {
      if (unitInfo.isOnCarrier || unitInfo.isOnTransport) {
        cargoUnits.push({ key, ...unitInfo });
      } else if (navalTypes.includes(unitInfo.type)) {
        navalUnits.push({ key, ...unitInfo });
      } else if (unitInfo.type === 'fighter' || unitInfo.type === 'bomber') {
        // Air unit NOT on a carrier (flying over sea zone)
        airUnits.push({ key, ...unitInfo });
      } else {
        // Other units (shouldn't normally be in sea zone, but handle gracefully)
        navalUnits.push({ key, ...unitInfo });
      }
    }

    let currentY = cy + 25;

    // Draw naval units (ships) - Section 1
    if (navalUnits.length > 0) {
      currentY = this._renderUnitSection(ctx, cx, currentY, navalUnits, maxPerRow, iconSize, spacingX, spacingY, zoom, 'naval');
      if (cargoUnits.length > 0 || airUnits.length > 0) {
        currentY += sectionGap;
      }
    }

    // Draw cargo units (on boats) - Section 2
    if (cargoUnits.length > 0) {
      currentY = this._renderUnitSection(ctx, cx, currentY, cargoUnits, maxPerRow, iconSize, spacingX, spacingY, zoom, 'cargo');
      if (airUnits.length > 0) {
        currentY += sectionGap;
      }
    }

    // Draw air units (not landed) - Section 3
    if (airUnits.length > 0) {
      this._renderUnitSection(ctx, cx, currentY, airUnits, maxPerRow, iconSize, spacingX, spacingY, zoom, 'air');
    }
  }

  // Render a section of units and return the Y position for the next section
  _renderUnitSection(ctx, cx, startY, units, maxPerRow, iconSize, spacingX, spacingY, zoom, sectionType) {
    const numRows = Math.ceil(units.length / maxPerRow);
    let unitIndex = 0;

    for (let row = 0; row < numRows; row++) {
      const unitsInRow = Math.min(maxPerRow, units.length - row * maxPerRow);
      const rowY = startY + row * spacingY;
      const startX = cx - ((unitsInRow - 1) * spacingX) / 2;

      for (let col = 0; col < unitsInRow && unitIndex < units.length; col++) {
        const unitInfo = units[unitIndex];
        const x = startX + col * spacingX;
        const color = this.gameState.getPlayerColor(unitInfo.owner);

        // Determine visual flags based on section type
        const isOnCarrier = unitInfo.isOnCarrier || false;
        const isOnTransport = unitInfo.isOnTransport || false;
        const isFlying = sectionType === 'air';

        this._drawUnitIcon(ctx, x, rowY, iconSize, unitInfo.type, color, unitInfo.owner,
                          isOnCarrier, isOnTransport, unitInfo.damaged || 0, isFlying,
                          this.highlightUnitType === unitInfo.type);

        if (unitInfo.total > 1) {
          this._drawBadge(ctx, x + iconSize / 2 - 2, rowY - iconSize / 2 + 2, unitInfo.total, zoom);
        }
        unitIndex++;
      }
    }

    // Return the Y position after this section
    return startY + numRows * spacingY;
  }

  // Render units in a flat grid (for land territories)
  _renderUnitGrid(ctx, cx, cy, types, grouped, maxPerRow, iconSize, spacingX, spacingY, zoom) {
    const numRows = Math.ceil(types.length / maxPerRow);
    const { unitDy } = phoneMapStackOffsets(zoom, { mobile: isMobileShell() });
    const baseY = cy + unitDy;

    let typeIndex = 0;
    for (let row = 0; row < numRows; row++) {
      const typesInRow = Math.min(maxPerRow, types.length - row * maxPerRow);
      const rowY = baseY + row * spacingY;
      const startX = cx - ((typesInRow - 1) * spacingX) / 2;

      for (let col = 0; col < typesInRow && typeIndex < types.length; col++) {
        const key = types[typeIndex];
        const { total, owner, type: unitType, isOnCarrier, isOnTransport, damaged } = grouped[key];
        const x = startX + col * spacingX;
        const color = this.gameState.getPlayerColor(owner);

        this._drawUnitIcon(ctx, x, rowY, iconSize, unitType, color, owner, isOnCarrier, isOnTransport, damaged, false,
                          this.highlightUnitType === unitType);

        if (total > 1) {
          this._drawBadge(ctx, x + iconSize / 2 - 2, rowY - iconSize / 2 + 2, total, zoom);
        }
        typeIndex++;
      }
    }
  }

  // Custom offsets for specific sea zones that need manual adjustment
  // Sea zone absolute centers - click position becomes unit center
  // Generated from debug click tool at zoom 0.5 - exact world coordinates
  static SEA_ZONE_CENTERS = {
    'West US Sea Zone': { x: 3078, y: 800 },
    'West Canada Sea Zone': { x: 2992, y: 462 },
    'Alaska Sea Zone': { x: 2870, y: 458 },
    'Soviet Far East Sea Zone': { x: 2558, y: 408 },
    'Midway Sea Zone': { x: 2918, y: 630 },
    'Hawaii Sea Zone': { x: 3062, y: 960 },
    'Wake Island Sea Zone': { x: 2764, y: 1003 },
    'Okinawa Sea Zone': { x: 2569, y: 943 },
    'New Zealand Sea Zone': { x: 2964, y: 1658 },
    'South Pacific Sea Zone': { x: 2992, y: 1314 },
    'Solomon Islands Sea Zone': { x: 2778, y: 1288 },
    'Caroline Islands Sea Zone': { x: 2500, y: 1080 },
    'New Guinea Sea Zone': { x: 2566, y: 1306 },
    'North Australia Sea Zone': { x: 2574, y: 1516 },
    'Kwangtung Sea Zone': { x: 2342, y: 862 },
    'French Indo China Sea Zone': { x: 2163, y: 1201 },
    'Borneo Sea Zone': { x: 2318, y: 1364 },
    'East Indies Sea Zone': { x: 1998, y: 1426 },
    'West Australia Sea Zone': { x: 2094, y: 1520 },
    'Indian Ocean Sea Zone': { x: 1688, y: 1186 },
    'Red Sea Zone': { x: 1568, y: 1292 },
    'Mozambique Sea Zone': { x: 1440, y: 1464 },
    'Congo Sea Zone': { x: 784, y: 1474 },
    'Black Sea Zone': { x: 1348, y: 648 },
    'Caspian Sea Zone': { x: 1512, y: 626 },
    'East Mediteranean Sea Zone': { x: 1264, y: 832 },
    'Central Mediteranean Sea Zone': { x: 1132, y: 834 },
    'West Mediteranean Sea Zone': { x: 912, y: 760 },
    'North Sea Zone': { x: 668, y: 232 },
    'Baltic Sea Zone': { x: 1106, y: 342 },
    'West Spain Sea Zone': { x: 638, y: 614 },
    'North Atlantic Sea Zone': { x: 472, y: 890 },
    'West Africa Sea Zone': { x: 624, y: 1236 },
    'North Brazil Sea Zone': { x: 464, y: 1148 },
    'Gulf of Mexico Sea Zone': { x: 3452, y: 924 },
    'Carribean Sea Zone': { x: 266, y: 1086 },
    'West Panama Sea Zone': { x: 54, y: 1200 },
  };

  // Custom offsets for land territories where units appear in wrong location
  static TERRITORY_CENTER_OFFSETS = {
    'Finland Norway': { x: 0, y: -60 },  // Move units north into Finland area
    'East Canada': { x: 60, y: 0 },      // Right, over land mass
  };

  // Adjust sea zone center to avoid island/land overlap
  _adjustSeaZoneCenter(territory, cx, cy) {
    // First check for manual absolute coordinates
    const manualCenter = UnitRenderer.SEA_ZONE_CENTERS[territory.name];
    if (manualCenter) {
      return {
        x: manualCenter.x,
        y: manualCenter.y
      };
    }

    // Fall back to automatic positioning
    const bestPos = this._findBestSeaZonePosition(territory, cx, cy);
    return bestPos || { x: cx, y: cy };
  }

  // Find the best position within a sea zone (furthest from land)
  _findBestSeaZonePosition(seaZone, defaultX, defaultY) {
    const polygons = seaZone.polygons;
    if (!polygons || polygons.length === 0) return null;

    // Get bounding box of the sea zone
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const poly of polygons) {
      for (const [x, y] of poly) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }

    // Collect all nearby land polygons (including islands within sea zone)
    const landPolygons = [];
    for (const [name, t] of Object.entries(this.territoryByName)) {
      if (t.isWater) continue;
      // Check if land territory is near this sea zone
      const [landCx, landCy] = this._getTerritoryCenter(t);
      if (landCx === null) continue;

      // Include if within reasonable distance of sea zone bounds
      const margin = 200;
      if (landCx >= minX - margin && landCx <= maxX + margin &&
          landCy >= minY - margin && landCy <= maxY + margin) {
        for (const poly of t.polygons || []) {
          landPolygons.push(poly);
        }
      }
    }

    // Also collect adjacent sea zone polygons to avoid bleeding over
    const adjacentSeaPolygons = [];
    for (const conn of seaZone.connections || []) {
      const neighbor = this.territoryByName[conn];
      if (neighbor && neighbor.isWater && neighbor.name !== seaZone.name) {
        // We want to stay away from the boundary with other sea zones
        for (const poly of neighbor.polygons || []) {
          adjacentSeaPolygons.push(poly);
        }
      }
    }

    // Sample points within the sea zone and find the best one
    const gridSize = 20; // Sample every 20 pixels
    let bestPoint = { x: defaultX, y: defaultY };
    let bestScore = -Infinity;

    for (let x = minX + gridSize; x < maxX - gridSize; x += gridSize) {
      for (let y = minY + gridSize; y < maxY - gridSize; y += gridSize) {
        // Check if point is inside the sea zone
        if (!this._pointInPolygons(x, y, polygons)) continue;

        // Calculate minimum distance to any land polygon
        let minLandDist = Infinity;
        for (const poly of landPolygons) {
          const dist = this._distanceToPolygon(x, y, poly);
          minLandDist = Math.min(minLandDist, dist);
        }

        // Calculate minimum distance to sea zone boundary (stay inside)
        let minBoundaryDist = Infinity;
        for (const poly of polygons) {
          const dist = this._distanceToPolygonEdge(x, y, poly);
          minBoundaryDist = Math.min(minBoundaryDist, dist);
        }

        // Calculate minimum distance to adjacent sea zones (avoid bleeding)
        let minAdjacentDist = Infinity;
        for (const poly of adjacentSeaPolygons) {
          const dist = this._distanceToPolygon(x, y, poly);
          minAdjacentDist = Math.min(minAdjacentDist, dist);
        }

        // Score: prefer points far from land, but also reasonably centered
        // Weight land distance heavily, boundary distance moderately
        const distFromCenter = Math.sqrt((x - defaultX) ** 2 + (y - defaultY) ** 2);
        const centerPenalty = distFromCenter * 0.3; // Slight preference for center

        const score = Math.min(minLandDist, minBoundaryDist * 0.8, minAdjacentDist * 0.5) - centerPenalty;

        if (score > bestScore) {
          bestScore = score;
          bestPoint = { x, y };
        }
      }
    }

    // Require minimum distance from land (40 pixels) to use the computed position
    if (bestScore < 40) {
      // Fall back to moving away from land centers
      return this._fallbackSeaZonePosition(seaZone, defaultX, defaultY);
    }

    return bestPoint;
  }

  // Fallback method using the old approach
  _fallbackSeaZonePosition(territory, cx, cy) {
    const connections = territory.connections || [];
    const landNeighbors = [];

    for (const conn of connections) {
      const neighbor = this.territoryByName[conn];
      if (neighbor && !neighbor.isWater) {
        const [nx, ny] = this._getTerritoryCenter(neighbor);
        if (nx !== null && ny !== null) {
          landNeighbors.push({ x: nx, y: ny });
        }
      }
    }

    if (landNeighbors.length === 0) return { x: cx, y: cy };

    let avgDx = 0, avgDy = 0;
    for (const land of landNeighbors) {
      avgDx += land.x - cx;
      avgDy += land.y - cy;
    }
    avgDx /= landNeighbors.length;
    avgDy /= landNeighbors.length;

    const dist = Math.sqrt(avgDx * avgDx + avgDy * avgDy);
    if (dist < 1) return { x: cx, y: cy };

    const offsetDist = 80;
    return {
      x: cx - (avgDx / dist) * offsetDist,
      y: cy - (avgDy / dist) * offsetDist
    };
  }

  // Check if point is inside any of the polygons
  _pointInPolygons(x, y, polygons) {
    for (const poly of polygons) {
      if (this._pointInPolygon(x, y, poly)) return true;
    }
    return false;
  }

  // Point-in-polygon test using ray casting
  _pointInPolygon(x, y, polygon) {
    if (!polygon || polygon.length < 3) return false;

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  // Distance from point to nearest point on polygon
  _distanceToPolygon(x, y, polygon) {
    if (!polygon || polygon.length < 2) return Infinity;

    let minDist = Infinity;
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];
      const dist = this._distanceToLineSegment(x, y, p1[0], p1[1], p2[0], p2[1]);
      minDist = Math.min(minDist, dist);
    }
    return minDist;
  }

  // Distance from point to polygon edge (same as distanceToPolygon for boundary)
  _distanceToPolygonEdge(x, y, polygon) {
    return this._distanceToPolygon(x, y, polygon);
  }

  // Distance from point to line segment
  _distanceToLineSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq === 0) {
      // Segment is a point
      return Math.sqrt((px - x1) ** 2 + (py - y1) ** 2);
    }

    // Project point onto line, clamped to segment
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const nearestX = x1 + t * dx;
    const nearestY = y1 + t * dy;

    return Math.sqrt((px - nearestX) ** 2 + (py - nearestY) ** 2);
  }

  _groupUnits(placements, includeCargo = false) {
    // Group by BOTH type AND owner to show units from different players separately
    const grouped = {};
    for (const p of placements) {
      const key = `${p.type}_${p.owner}`;
      if (!grouped[key]) {
        grouped[key] = { total: 0, owner: p.owner, type: p.type, damaged: 0 };
      }
      grouped[key].total += p.quantity;
      // Track damaged battleships for visual indicator
      if (p.type === 'battleship' && p.damaged) {
        grouped[key].damaged = p.damagedCount || 1;
      }

      // Include cargo from carriers (aircraft)
      if (includeCargo && p.type === 'carrier' && p.aircraft && p.aircraft.length > 0) {
        for (const aircraft of p.aircraft) {
          // Skip invalid aircraft entries (no type or owner)
          if (!aircraft || !aircraft.type || !aircraft.owner) continue;
          const cargoKey = `${aircraft.type}_${aircraft.owner}_carrier`;
          if (!grouped[cargoKey]) {
            grouped[cargoKey] = { total: 0, owner: aircraft.owner, type: aircraft.type, isOnCarrier: true };
          }
          grouped[cargoKey].total += 1;
        }
      }

      // Include cargo from transports
      if (includeCargo && p.type === 'transport' && p.cargo && p.cargo.length > 0) {
        for (const cargo of p.cargo) {
          // Skip invalid cargo entries (no type or owner)
          if (!cargo || !cargo.type || !cargo.owner) continue;
          const cargoKey = `${cargo.type}_${cargo.owner}_transport`;
          if (!grouped[cargoKey]) {
            grouped[cargoKey] = { total: 0, owner: cargo.owner, type: cargo.type, isOnTransport: true };
          }
          grouped[cargoKey].total += 1;
        }
      }
    }
    return grouped;
  }

  _drawUnitIcon(ctx, x, y, size, unitType, color, factionId, isOnCarrier = false, isOnTransport = false, damaged = 0, isFlying = false, highlight = false) {
    const img = this._getUnitImage(unitType, factionId);

    ctx.save();

    // Draw colored background circle/square
    const bgSize = size + 4;
    ctx.fillStyle = color;

    // Add indicator for units on carriers/transports
    if (isOnCarrier || isOnTransport) {
      // Draw a small boat/carrier symbol underneath
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Draw a small underline to indicate "on board"
      ctx.moveTo(x - bgSize / 2, y + bgSize / 2 + 2);
      ctx.lineTo(x + bgSize / 2, y + bgSize / 2 + 2);
      ctx.stroke();

      // Slightly different border color for cargo units
      ctx.strokeStyle = isOnCarrier ? 'rgba(100,150,255,0.8)' : 'rgba(150,100,50,0.8)';
    } else if (isFlying) {
      // Flying air unit indicator - draw small wing marks above
      ctx.strokeStyle = 'rgba(135,206,250,0.9)'; // Light sky blue
      ctx.lineWidth = 2;
      ctx.beginPath();
      // Draw small chevron/wing marks above the icon
      const wingY = y - bgSize / 2 - 4;
      ctx.moveTo(x - bgSize / 3, wingY + 2);
      ctx.lineTo(x, wingY - 2);
      ctx.lineTo(x + bgSize / 3, wingY + 2);
      ctx.stroke();

      // Sky blue border to indicate airborne
      ctx.strokeStyle = 'rgba(135,206,250,0.8)';
    } else if (damaged > 0) {
      // Damaged battleship indicator - orange/red border and cross
      ctx.strokeStyle = 'rgba(255,100,0,0.9)';
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    }
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.roundRect(x - bgSize / 2, y - bgSize / 2, bgSize, bgSize, 4);
    ctx.fill();
    ctx.stroke();

    if (highlight) {
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x - bgSize / 2 - 3, y - bgSize / 2 - 3, bgSize + 6, bgSize + 6, 6);
      ctx.stroke();
    }

    // Draw damage indicator for battleships
    if (damaged > 0 && unitType === 'battleship') {
      ctx.strokeStyle = 'rgba(255,50,0,0.8)';
      ctx.lineWidth = 2;
      // Draw diagonal line through icon to indicate damage
      ctx.beginPath();
      ctx.moveTo(x - bgSize / 3, y - bgSize / 3);
      ctx.lineTo(x + bgSize / 3, y + bgSize / 3);
      ctx.stroke();
    }

    // Draw unit image
    if (img && img.complete && img.naturalWidth > 0) {
      // Tint the image with the player color slightly
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    } else {
      // Fallback: draw simple shape
      this._drawFallbackIcon(ctx, x, y, size * 0.4, unitType);
    }

    ctx.restore();
  }

  _drawFallbackIcon(ctx, x, y, r, unitType) {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;

    ctx.beginPath();
    switch (unitType) {
      case 'infantry':
        ctx.arc(x, y, r, 0, Math.PI * 2);
        break;
      case 'armour':
        ctx.rect(x - r, y - r * 0.6, r * 2, r * 1.2);
        break;
      case 'artillery':
        ctx.moveTo(x - r, y + r);
        ctx.lineTo(x, y - r);
        ctx.lineTo(x + r, y + r);
        ctx.closePath();
        break;
      case 'fighter':
      case 'bomber':
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y + r);
        ctx.lineTo(x - r, y + r);
        ctx.closePath();
        break;
      default:
        ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }

  _drawBadge(ctx, x, y, count, zoom) {
    const fontSize = Math.max(9, Math.min(12, 11 * zoom));
    const text = count.toString();

    ctx.font = `bold ${fontSize}px sans-serif`;
    const metrics = ctx.measureText(text);
    const width = Math.max(metrics.width + 6, fontSize + 2);
    const height = fontSize + 4;

    // Badge background
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - height / 2, width, height, 4);
    ctx.fill();

    // Badge border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Badge text
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  /** Calculate the centroid of all polygons in a territory */
  _getTerritoryCenter(territory) {
    if (!territory.polygons || territory.polygons.length === 0) {
      return territory.center || [null, null];
    }

    // For sea zones, find the LARGEST polygon (most open water area)
    // This avoids placing units on small islands
    if (territory.isWater) {
      let largestArea = 0;
      let largestCx = null;
      let largestCy = null;

      for (const poly of territory.polygons) {
        if (poly.length < 3) continue;
        const { cx, cy, area } = this._getPolygonCentroid(poly);
        if (area > largestArea) {
          largestArea = area;
          largestCx = cx;
          largestCy = cy;
        }
      }

      if (largestCx !== null) {
        return [largestCx, largestCy];
      }
      return territory.center || [null, null];
    }

    // For land territories, calculate weighted centroid based on polygon areas
    let totalArea = 0;
    let sumX = 0;
    let sumY = 0;

    for (const poly of territory.polygons) {
      if (poly.length < 3) continue;

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

  /**
   * Hit test for unit icons at the given world coordinates.
   * Returns { territory, unitType, owner, quantity, unitDef } if hit, null otherwise.
   */
  hitTestUnit(worldX, worldY, zoom) {
    const mobile = isMobileShell();
    if (shouldHideUnitsAtZoom(zoom, { mobile })) return null;

    const iconSize = phoneUnitIconSize(zoom, { mobile });
    const spacingX = iconSize + 4;
    const spacingY = iconSize + 8;
    const hitRadius = (iconSize + 4) / 2;

    for (const [territory, placements] of Object.entries(this.gameState.units)) {
      const t = this.territoryByName[territory];
      if (!t) continue;

      let [cx, cy] = this._getTerritoryCenter(t);
      if (cx === null) continue;

      // Apply manual offsets for land territories that need adjustment
      const landOffset = UnitRenderer.TERRITORY_CENTER_OFFSETS[territory];
      if (landOffset && !t.isWater) {
        cx += landOffset.x;
        cy += landOffset.y;
      }

      if (t.isWater) {
        const adjusted = this._adjustSeaZoneCenter(t, cx, cy);
        cx = adjusted.x;
        cy = adjusted.y;
      }

      const grouped = this._groupUnits(placements, true);
      const types = Object.keys(grouped);
      if (types.length === 0) continue;

      // For sea zones, use three-section hit testing
      if (t.isWater) {
        const result = this._hitTestSeaZoneUnits(worldX, worldY, territory, cx, cy, grouped, iconSize, spacingX, spacingY, hitRadius);
        if (result) return result;
      } else {
        // Land territory: flat grid hit testing
        const maxPerRow = 5;
        const result = this._hitTestUnitGrid(worldX, worldY, territory, cx, cy, types, grouped, maxPerRow, iconSize, spacingX, spacingY, hitRadius, zoom);
        if (result) return result;
      }
    }

    return null;
  }

  // Hit test for sea zone units with three-section layout
  _hitTestSeaZoneUnits(worldX, worldY, territory, cx, cy, grouped, iconSize, spacingX, spacingY, hitRadius) {
    const maxPerRow = 3;
    const sectionGap = 6;
    const navalTypes = ['transport', 'submarine', 'destroyer', 'cruiser', 'battleship', 'carrier'];

    const navalUnits = [];
    const cargoUnits = [];
    const airUnits = [];

    for (const [key, unitInfo] of Object.entries(grouped)) {
      if (unitInfo.isOnCarrier || unitInfo.isOnTransport) {
        cargoUnits.push({ key, ...unitInfo });
      } else if (navalTypes.includes(unitInfo.type)) {
        navalUnits.push({ key, ...unitInfo });
      } else if (unitInfo.type === 'fighter' || unitInfo.type === 'bomber') {
        airUnits.push({ key, ...unitInfo });
      } else {
        navalUnits.push({ key, ...unitInfo });
      }
    }

    let currentY = cy + 25;

    // Test naval units section
    if (navalUnits.length > 0) {
      const result = this._hitTestSection(worldX, worldY, territory, cx, currentY, navalUnits, maxPerRow, iconSize, spacingX, spacingY, hitRadius, 'naval');
      if (result) return result;
      const numRows = Math.ceil(navalUnits.length / maxPerRow);
      currentY += numRows * spacingY;
      if (cargoUnits.length > 0 || airUnits.length > 0) currentY += sectionGap;
    }

    // Test cargo units section
    if (cargoUnits.length > 0) {
      const result = this._hitTestSection(worldX, worldY, territory, cx, currentY, cargoUnits, maxPerRow, iconSize, spacingX, spacingY, hitRadius, 'cargo');
      if (result) return result;
      const numRows = Math.ceil(cargoUnits.length / maxPerRow);
      currentY += numRows * spacingY;
      if (airUnits.length > 0) currentY += sectionGap;
    }

    // Test air units section
    if (airUnits.length > 0) {
      const result = this._hitTestSection(worldX, worldY, territory, cx, currentY, airUnits, maxPerRow, iconSize, spacingX, spacingY, hitRadius, 'air');
      if (result) return result;
    }

    return null;
  }

  // Hit test a section of units
  _hitTestSection(worldX, worldY, territory, cx, startY, units, maxPerRow, iconSize, spacingX, spacingY, hitRadius, sectionType) {
    const numRows = Math.ceil(units.length / maxPerRow);
    let unitIndex = 0;

    for (let row = 0; row < numRows; row++) {
      const unitsInRow = Math.min(maxPerRow, units.length - row * maxPerRow);
      const rowY = startY + row * spacingY;
      const startX = cx - ((unitsInRow - 1) * spacingX) / 2;

      for (let col = 0; col < unitsInRow && unitIndex < units.length; col++) {
        const unitInfo = units[unitIndex];
        const x = startX + col * spacingX;

        const dx = worldX - x;
        const dy = worldY - rowY;
        if (Math.abs(dx) <= hitRadius && Math.abs(dy) <= hitRadius) {
          return {
            territory: territory,
            unitType: unitInfo.type,
            owner: unitInfo.owner,
            quantity: unitInfo.total,
            isOnCarrier: unitInfo.isOnCarrier || false,
            isOnTransport: unitInfo.isOnTransport || false,
            isFlying: sectionType === 'air',
            damaged: unitInfo.damaged || 0,
            unitDef: this.unitDefs[unitInfo.type]
          };
        }
        unitIndex++;
      }
    }
    return null;
  }

  // Hit test for flat grid layout (land territories)
  _hitTestUnitGrid(worldX, worldY, territory, cx, cy, types, grouped, maxPerRow, iconSize, spacingX, spacingY, hitRadius, zoom) {
    const numRows = Math.ceil(types.length / maxPerRow);
    const { unitDy } = phoneMapStackOffsets(zoom, { mobile: isMobileShell() });
    const baseY = cy + unitDy;

    let typeIndex = 0;
    for (let row = 0; row < numRows; row++) {
      const typesInRow = Math.min(maxPerRow, types.length - row * maxPerRow);
      const rowY = baseY + row * spacingY;
      const startX = cx - ((typesInRow - 1) * spacingX) / 2;

      for (let col = 0; col < typesInRow && typeIndex < types.length; col++) {
        const key = types[typeIndex];
        const unitInfo = grouped[key];
        const x = startX + col * spacingX;

        const dx = worldX - x;
        const dy = worldY - rowY;
        if (Math.abs(dx) <= hitRadius && Math.abs(dy) <= hitRadius) {
          return {
            territory: territory,
            unitType: unitInfo.type,
            owner: unitInfo.owner,
            quantity: unitInfo.total,
            isOnCarrier: unitInfo.isOnCarrier || false,
            isOnTransport: unitInfo.isOnTransport || false,
            damaged: unitInfo.damaged || 0,
            unitDef: this.unitDefs[unitInfo.type]
          };
        }
        typeIndex++;
      }
    }
    return null;
  }
}
