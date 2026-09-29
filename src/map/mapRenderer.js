// Loads and renders the base map tiles and relief overlay tiles.
// Uses smallMap.jpeg as a base layer so missing tile gaps show correct ocean color.
// Tile grid, paths, and format come from the active map. Classic stays eager PNG.

import { MAP_WIDTH, MAP_HEIGHT } from './camera.js';
import { getActiveMap, reliefEnabledForClient, clientLooksLikePhone } from './mapRegistry.js';
import { STARTUP_TILE_TIMEOUT_MS } from '../ui/startupLoader.js';

export class MapRenderer {
  constructor() {
    this.baseTiles = {};  // "col_row" -> Image
    this.reliefTiles = {};
    this.smallMap = null;
    this.loaded = false;
    this.baseCount = 0;
    this.reliefCount = 0;
    this._pending = new Set();
    this.onTilesReady = null;
    this._applyConfig(getActiveMap());
  }

  _applyConfig(map) {
    const tiles = map?.tiles || {};
    this.mapConfig = map;
    this.cols = tiles.cols;
    this.rows = tiles.rows;
    this.tileSize = tiles.tileSize;
    this.format = tiles.format || 'png';
    this.baseDir = tiles.baseDir;
    this.reliefDir = tiles.reliefDir;
    this.smallMapSrc = tiles.smallMap;
    this.lazy = !!tiles.lazy;
  }

  /** Load tiles for the active map. Classic loads the full PNG grid up front. */
  async load(map = getActiveMap()) {
    this._applyConfig(map);
    this.baseTiles = {};
    this.reliefTiles = {};
    this.baseCount = 0;
    this.reliefCount = 0;
    this.smallMap = null;
    const promises = [];

    // Load the small map as a base layer for filling gaps
    promises.push(this._loadSmallMap());

    if (!this.lazy) {
      for (let col = 0; col < this.cols; col++) {
        for (let row = 0; row < this.rows; row++) {
          const key = `${col}_${row}`;
          promises.push(this._loadTile(this.baseDir, key, this.baseTiles, 'base'));
          promises.push(this._loadTile(this.reliefDir, key, this.reliefTiles, 'relief'));
        }
      }
    }

    await Promise.allSettled(promises);
    this.loaded = true;
    console.log(`MapRenderer: loaded ${this.baseCount} base tiles, ${this.reliefCount} relief tiles, smallMap: ${!!this.smallMap}`);
  }

  _loadSmallMap() {
    return this._loadImage(this.smallMapSrc, (img) => {
      this.smallMap = img;
    });
  }

  _tileUrl(dir, key, ext) {
    return `${dir}/${key}.${ext}`;
  }

  // WebP maps try webp first and fall back to png. Classic format is png.
  _loadTile(dir, key, store, type) {
    const primary = this.format === 'webp' ? 'webp' : 'png';
    const remember = (img) => {
      if (store[key]) return;
      store[key] = img;
      if (type === 'base') this.baseCount++;
      else this.reliefCount++;
    };
    return this._loadImage(this._tileUrl(dir, key, primary), remember).then((ok) => {
      if (ok || primary !== 'webp') return ok;
      return this._loadImage(this._tileUrl(dir, key, 'png'), remember);
    });
  }

  _ensureViewportTiles(viewport) {
    if (!this.lazy || !viewport) return;
    const size = this.tileSize;
    const startCol = Math.max(0, Math.floor(viewport.x / size) - 1);
    const endCol = Math.min(this.cols - 1, Math.floor((viewport.x + viewport.width) / size) + 1);
    const startRow = Math.max(0, Math.floor(viewport.y / size) - 1);
    const endRow = Math.min(this.rows - 1, Math.floor((viewport.y + viewport.height) / size) + 1);
    for (let col = startCol; col <= endCol; col++) {
      for (let row = startRow; row <= endRow; row++) {
        const key = `${col}_${row}`;
        if (!this.baseTiles[key]) this._kickLazy(this.baseDir, key, this.baseTiles, 'base');
        if (this._drawRelief() && !this.reliefTiles[key]) {
          this._kickLazy(this.reliefDir, key, this.reliefTiles, 'relief');
        }
      }
    }
  }

  _kickLazy(dir, key, store, type) {
    const token = `${type}:${key}`;
    if (this._pending.has(token) || store[key]) return;
    this._pending.add(token);
    this._loadTile(dir, key, store, type).then(() => {
      this._pending.delete(token);
      if (typeof this.onTilesReady === 'function') this.onTilesReady();
    });
  }

  _drawRelief() {
    return reliefEnabledForClient(this.mapConfig, clientLooksLikePhone());
  }

  // A stalled Image() never fires onload/onerror — that pinned the
  // branded loader when lastMatch held dismiss until map load finished.
  _loadImage(src, onSuccess, timeoutMs = STARTUP_TILE_TIMEOUT_MS) {
    return new Promise((resolve) => {
      const img = new Image();
      let settled = false;
      const finish = (ok) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(!!ok);
      };
      const timer = setTimeout(() => finish(false), timeoutMs);
      img.onload = () => {
        if (typeof onSuccess === 'function') onSuccess(img);
        finish(true);
      };
      img.onerror = () => finish(false);
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

    if (this.lazy) this._ensureViewportTiles(viewport);

    // Determine visible tile range
    const tileSize = this.tileSize;
    const startCol = Math.max(0, Math.floor(viewport.x / tileSize));
    const endCol = Math.min(this.cols - 1, Math.floor((viewport.x + viewport.width) / tileSize));
    const startRow = Math.max(0, Math.floor(viewport.y / tileSize));
    const endRow = Math.min(this.rows - 1, Math.floor((viewport.y + viewport.height) / tileSize));

    // Draw base tiles on top (opaque — covers the small map where tiles exist)
    for (let col = startCol; col <= endCol; col++) {
      for (let row = startRow; row <= endRow; row++) {
        const key = `${col}_${row}`;
        const img = this.baseTiles[key];
        if (img) {
          ctx.drawImage(img, col * tileSize, row * tileSize, tileSize, tileSize);
        }
      }
    }

    // Draw relief tiles (smallMap base layer ensures no visible rectangles at gaps).
    // Classic keeps relief on. A map with reliefPhone false skips it on phones.
    if (this._drawRelief()) {
      ctx.globalAlpha = 0.5;
      for (let col = startCol; col <= endCol; col++) {
        for (let row = startRow; row <= endRow; row++) {
          const key = `${col}_${row}`;
          const img = this.reliefTiles[key];
          if (img) {
            ctx.drawImage(img, col * tileSize, row * tileSize, tileSize, tileSize);
          }
        }
      }
      ctx.globalAlpha = 1.0;
    }
  }
}
