// Renders unit icons at territory centers using sprite images

export class UnitRenderer {
  constructor(gameState, territories, unitDefs) {
    this.gameState = gameState;
    this.unitDefs = unitDefs;

    this.territoryByName = {};
    for (const t of territories) {
      this.territoryByName[t.name] = t;
    }

    // Load unit images
    this.unitImages = {};
    this.imagesLoaded = false;
    this._loadImages();
  }

  async _loadImages() {
    const imagePromises = [];

    for (const [unitType, def] of Object.entries(this.unitDefs)) {
      if (def.image) {
        const img = new Image();
        const promise = new Promise((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve(); // Continue even if image fails
        });
        img.src = `assets/units/${def.image}`;
        this.unitImages[unitType] = img;
        imagePromises.push(promise);
      }
    }

    await Promise.all(imagePromises);
    this.imagesLoaded = true;
  }

  render(ctx, zoom) {
    if (zoom < 0.35) return;

    const iconSize = Math.max(14, Math.min(24, 20 * zoom));
    const spacingX = iconSize + 4;
    const spacingY = iconSize + 8;
    const maxPerRow = 5;

    for (const [territory, placements] of Object.entries(this.gameState.units)) {
      const t = this.territoryByName[territory];
      if (!t || !t.center) continue;

      const [cx, cy] = t.center;

      // Group by type - show ALL types
      const grouped = this._groupUnits(placements);
      const types = Object.keys(grouped);
      if (types.length === 0) continue;

      // Calculate rows needed
      const numRows = Math.ceil(types.length / maxPerRow);
      const baseY = cy + 25;

      let typeIndex = 0;
      for (let row = 0; row < numRows; row++) {
        const typesInRow = Math.min(maxPerRow, types.length - row * maxPerRow);
        const rowY = baseY + row * spacingY;
        const startX = cx - ((typesInRow - 1) * spacingX) / 2;

        for (let col = 0; col < typesInRow && typeIndex < types.length; col++) {
          const unitType = types[typeIndex];
          const { total, owner } = grouped[unitType];
          const x = startX + col * spacingX;
          const color = this.gameState.getPlayerColor(owner);

          this._drawUnitIcon(ctx, x, rowY, iconSize, unitType, color);

          if (total > 1) {
            this._drawBadge(ctx, x + iconSize / 2 - 2, rowY - iconSize / 2 + 2, total, zoom);
          }
          typeIndex++;
        }
      }
    }
  }

  _groupUnits(placements) {
    const grouped = {};
    for (const p of placements) {
      if (!grouped[p.type]) {
        grouped[p.type] = { total: 0, owner: p.owner };
      }
      grouped[p.type].total += p.quantity;
    }
    return grouped;
  }

  _drawUnitIcon(ctx, x, y, size, unitType, color) {
    const img = this.unitImages[unitType];

    ctx.save();

    // Draw colored background circle/square
    const bgSize = size + 4;
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.roundRect(x - bgSize / 2, y - bgSize / 2, bgSize, bgSize, 4);
    ctx.fill();
    ctx.stroke();

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
}
