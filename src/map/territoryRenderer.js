// Renders territory overlays: ownership colors, outlines, continent borders, hover/selection, labels

// Cross-water connections that should be drawn as visual lines on the map
// These are land-to-land connections that cross water (like Alaska-Kamchatka in Risk)
const CROSS_WATER_CONNECTIONS = [
  // Pacific wrap-around connections
  ['Alaska', 'Soviet Far East'],
  // Other notable cross-water connections
  ['United Kingdom', 'Finland Norway'],
  ['Gibraltar', 'Rio del Oro'],
  ['Spain', 'Rio del Oro'],
  ['Spain', 'Algeria'],
  ['South Europe', 'Algeria'],
  ['South Europe', 'Libya'],
];

export class TerritoryRenderer {
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

  /** Fill land territory polygons with continent color (Risk style) */
  renderOwnershipOverlays(ctx) {
    for (const t of this.territories) {
      if (t.isWater) continue;

      // Use continent color for territory shading
      const continent = this.continentByTerritory[t.name];
      const color = continent?.color || '#888888';

      // Use higher alpha for merged territories to cover internal borders from base tiles
      const isMerged = t.polygons.length > 1;
      ctx.globalAlpha = isMerged ? 0.6 : 0.45;

      // Fill all polygons with continent color
      ctx.fillStyle = color;
      for (const poly of t.polygons) {
        this._fillPoly(ctx, poly);
      }

      // For merged territories, also stroke along internal edges to further obscure base tile borders
      if (isMerged) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 0.65;
        for (const poly of t.polygons) {
          this._strokePoly(ctx, poly);
        }
      }
    }

    ctx.globalAlpha = 1.0;
    ctx.lineWidth = 1;
  }

  /** Draw small flag markers on each territory to show ownership */
  renderOwnershipFlags(ctx, zoom) {
    if (!this.gameState || zoom < 0.35) return;

    const flagWidth = Math.max(16, Math.min(28, 22 * zoom));
    const flagHeight = flagWidth * 0.67;

    for (const t of this.territories) {
      if (t.isWater || !t.center) continue;

      const owner = this.gameState.getOwner(t.name);
      if (!owner) continue;

      const player = this.gameState.getPlayer(owner);
      if (!player || !player.flag) continue;

      // Skip capitals - they get the big flag treatment
      if (this.gameState.isCapital(t.name)) continue;

      const [cx, cy] = t.center;
      // Position to upper-right of center
      const x = cx + 15;
      const y = cy - 20;

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

    for (const continent of this.continents) {
      // Calculate center of continent
      const center = this._getContinentCenter(continent);
      if (!center) continue;

      const [cx, cy] = center;

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
    let sumX = 0, sumY = 0, count = 0;

    for (const tName of continent.territories) {
      const t = this.territoryByName[tName];
      if (!t || t.isWater || !t.center) continue;
      sumX += t.center[0];
      sumY += t.center[1];
      count++;
    }

    if (count === 0) return null;
    return [sumX / count, sumY / count];
  }

  /** Draw territory outlines */
  renderTerritoryOutlines(ctx) {
    // Land territory borders
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.lineWidth = 1;

    for (const t of this.territories) {
      if (t.isWater) continue;
      for (const poly of t.polygons) {
        this._strokePoly(ctx, poly);
      }
    }

    // Sea zone borders - lighter, dashed
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

  /** Draw capital markers with faction flags */
  renderCapitals(ctx, zoom) {
    if (!this.gameState || zoom < 0.3) return;

    const flagWidth = Math.max(28, Math.min(48, 38 * zoom));
    const flagHeight = flagWidth * 0.75;
    const starSize = Math.max(12, Math.min(20, 16 * zoom));

    for (const t of this.territories) {
      if (t.isWater || !t.center) continue;
      if (!this.gameState.isCapital(t.name)) continue;

      const [cx, cy] = t.center;
      const owner = this.gameState.getOwner(t.name);
      const player = this.gameState.getPlayer(owner);
      const color = this.gameState.getPlayerColor(owner);

      // Position above the territory center/label
      const y = cy - 35;

      // Draw flag if available
      if (player && player.flag) {
        this._drawCapitalFlag(ctx, cx, y, flagWidth, flagHeight, player.flag, color);
      } else {
        // Fallback: draw star marker for capital
        this._drawCapitalStar(ctx, cx, y, starSize * 1.5, color);
      }
    }
  }

  _drawCapitalFlag(ctx, x, y, width, height, flag, color) {
    const img = this.flagImages[flag];

    ctx.save();

    // Draw colored background/border
    const padding = 3;
    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 2;

    ctx.beginPath();
    ctx.roundRect(x - width / 2 - padding, y - height / 2 - padding, width + padding * 2, height + padding * 2, 4);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Draw flag image
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, x - width / 2, y - height / 2, width, height);
    }

    // Draw border around flag
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x - width / 2, y - height / 2, width, height);

    // Draw small star below flag to indicate capital
    this._drawCapitalStar(ctx, x, y + height / 2 + 10, 14, '#ffd700');

    ctx.restore();
  }

  _drawCapitalStar(ctx, x, y, size, color) {
    const r = size / 2;
    const innerR = r * 0.4;
    const points = 5;

    ctx.save();
    ctx.translate(x, y);

    // Glow effect
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;

    ctx.fillStyle = color;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;

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
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for (const poly of territory.polygons) {
      this._fillPoly(ctx, poly);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    for (const poly of territory.polygons) {
      this._strokePoly(ctx, poly);
    }
  }

  /** Draw selection highlight */
  renderSelected(ctx, territory) {
    if (!territory) return;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    for (const poly of territory.polygons) {
      this._strokePoly(ctx, poly);
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

      ctx.fillStyle = color;
      for (const poly of t.polygons) {
        this._fillPoly(ctx, poly);
      }

      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      for (const poly of t.polygons) {
        this._strokePoly(ctx, poly);
      }
      ctx.setLineDash([]);
    }
  }

  /** Draw territory labels */
  renderLabels(ctx, zoom) {
    if (zoom < 0.4) return;

    const fontSize = Math.max(8, Math.min(13, 11 / zoom * 0.7));
    ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const t of this.territories) {
      if (t.isWater) continue;
      if (!t.center) continue;

      const [cx, cy] = t.center;

      // Background for readability
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(t.name, cx, cy);

      ctx.fillStyle = '#fff';
      ctx.fillText(t.name, cx, cy);

      // Show IPC value below name when zoomed in
      if (zoom > 0.6 && t.production > 0) {
        const smallSize = fontSize * 0.75;
        ctx.font = `${smallSize}px 'Segoe UI', sans-serif`;
        ctx.strokeText(`${t.production} IPC`, cx, cy + fontSize + 2);
        ctx.fillStyle = '#ffd700';
        ctx.fillText(`${t.production} IPC`, cx, cy + fontSize + 2);
        ctx.font = `bold ${fontSize}px 'Segoe UI', sans-serif`;
      }
    }
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
    if (zoom < 0.3) return; // Don't show when too zoomed out

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);

    for (const [t1Name, t2Name] of CROSS_WATER_CONNECTIONS) {
      const t1 = this.territoryByName[t1Name];
      const t2 = this.territoryByName[t2Name];

      if (!t1 || !t2 || !t1.center || !t2.center) continue;

      const [x1, y1] = t1.center;
      const [x2, y2] = t2.center;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      // Draw small circles at endpoints
      ctx.fillStyle = 'rgba(255, 215, 0, 0.9)';
      ctx.beginPath();
      ctx.arc(x1, y1, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x2, y2, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.setLineDash([]);
    ctx.restore();
  }
}
