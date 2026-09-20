// Loads and renders the base map tiles and relief overlay tiles.
// Uses smallMap.jpeg as a base layer so missing tile gaps show correct ocean color.

import { MAP_WIDTH, MAP_HEIGHT } from './camera.js';
import { STARTUP_TILE_TIMEOUT_MS } from '../ui/startupLoader.js';

const TILE_SIZE = 256;
const COLS = 14; // 0..13
const ROWS = 8;  // 0..7

export class MapRenderer {
  constructor() {
    this.baseTiles = {};  // "col_row" -> Image
    this.reliefTiles = {};
    this.smallMap = null;
    this.loaded = false;
    this.baseCount = 0;
    this.reliefCount = 0;
  }

  /** Load all tiles. Returns a promise that resolves when loading is complete. */
  async load() {
    const promises = [];

    // Load the small map as a base layer for filling gaps
    promises.push(this._loadSmallMap());

    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const key = `${col}_${row}`;
        promises.push(this._loadTile(`../map/baseTiles/${key}.png`, key, this.baseTiles, 'base'));
        promises.push(this._loadTile(`../map/reliefTiles/${key}.png`, key, this.reliefTiles, 'relief'));
      }
    }

    await Promise.allSettled(promises);
    this.loaded = true;
    console.log(`MapRenderer: loaded ${this.baseCount} base tiles, ${this.reliefCount} relief tiles, smallMap: ${!!this.smallMap}`);
  }

  _loadSmallMap() {
    return this._loadImage('../map/smallMap.jpeg', (img) => {
      this.smallMap = img;
    });
  }

  _loadTile(src, key, store, type) {
    return this._loadImage(src, (img) => {
      store[key] = img;
      if (type === 'base') this.baseCount++;
      else this.reliefCount++;
    });
  }

  // A stalled Image() never fires onload/onerror — that pinned the
  // branded loader when lastMatch held dismiss until map load finished.
  _loadImage(src, onSuccess, timeoutMs = STARTUP_TILE_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(finish, timeoutMs);
      img.onload = () => {
        if (typeof onSuccess === 'function') onSuccess(img);
        finish();
      };
      img.onerror = () => finish();
      img.src = src;
    });
  }

  /** Render visible tiles onto the canvas context (camera transform must be applied). */
  render(ctx, viewport, { flatOcean = false } = {}) {
    if (flatOcean) {
      // Phone Fit / opening: baked tiles carry dark-red country ink.
      // Land identity is continent fill on top of this ocean, not map art.
      ctx.fillStyle = '#44C5BD';
      ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);
      return;
    }

    if (!this.loaded) return;

    // Draw the small map as a base layer so any missing tile gaps show correct ocean
    if (this.smallMap) {
      ctx.drawImage(this.smallMap, 0, 0, MAP_WIDTH, MAP_HEIGHT);
    }

    // Determine visible tile range
    const startCol = Math.max(0, Math.floor(viewport.x / TILE_SIZE));
    const endCol = Math.min(COLS - 1, Math.floor((viewport.x + viewport.width) / TILE_SIZE));
    const startRow = Math.max(0, Math.floor(viewport.y / TILE_SIZE));
    const endRow = Math.min(ROWS - 1, Math.floor((viewport.y + viewport.height) / TILE_SIZE));

    // Draw base tiles on top (opaque — covers the small map where tiles exist)
    for (let col = startCol; col <= endCol; col++) {
      for (let row = startRow; row <= endRow; row++) {
        const key = `${col}_${row}`;
        const img = this.baseTiles[key];
        if (img) {
          ctx.drawImage(img, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Draw relief tiles (smallMap base layer ensures no visible rectangles at gaps)
    ctx.globalAlpha = 0.5;
    for (let col = startCol; col <= endCol; col++) {
      for (let row = startRow; row <= endRow; row++) {
        const key = `${col}_${row}`;
        const img = this.reliefTiles[key];
        if (img) {
          ctx.drawImage(img, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    ctx.globalAlpha = 1.0;
  }
}
