// Camera system for pan/zoom on the map canvas.
// Maintains world-space center (x,y), zoom level, and a dirty flag for rendering.

export const MAP_WIDTH = 3500;
export const MAP_HEIGHT = 2000;

const BASE_MIN_ZOOM = 0.4;
const MAX_ZOOM = 3.0;
const LERP_SPEED = 0.15;

export class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    // World-space center of the viewport
    this.x = MAP_WIDTH / 2;
    this.y = MAP_HEIGHT / 2;
    this.zoom = 0.5;
    this.dirty = true;

    // Animation target
    this._targetX = null;
    this._targetY = null;

    // Phone-only: allow zooming out far enough to see the board.
    // Desktop / tablet keep BASE_MIN_ZOOM. Set from the phone chrome path.
    this.usePhoneMinZoom = false;

    // Drag state
    this._dragging = false;
    this._dragStartX = 0;
    this._dragStartY = 0;
    this._dragCamStartX = 0;
    this._dragCamStartY = 0;
    this._dragMoved = false;
  }

  get viewportWidth() {
    return this.canvas.width / (this.zoom * devicePixelRatio);
  }

  get viewportHeight() {
    return this.canvas.height / (this.zoom * devicePixelRatio);
  }

  /** Calculate minimum zoom to ensure map fills viewport */
  get minZoom() {
    const dpr = devicePixelRatio || 1;
    // Calculate zoom needed to fit map height in viewport
    const zoomForHeight = this.canvas.height / (MAP_HEIGHT * dpr);
    // Phone: allow zoom-out to fit world width (~0.11 at 390px). Desktop
    // and tablet keep the 0.4 floor so their default view is unchanged.
    if (this.usePhoneMinZoom) {
      const zoomForWidth = this.canvas.width / (MAP_WIDTH * dpr);
      return Math.max(0.10, Math.min(zoomForWidth, zoomForHeight));
    }
    // Use the larger of base minimum or calculated minimum
    return Math.max(BASE_MIN_ZOOM, zoomForHeight);
  }

  /** Fit a world-space box into the canvas. Phone chrome calls this; desktop does not. */
  fitBounds(bounds, {
    padding = 16,
    padTop = 0,
    padBottom = 0,
    padLeft = 0,
    padRight = 0,
    fillFrame = false,
  } = {}) {
    if (!bounds || !this.canvas) return;
    const dpr = devicePixelRatio || 1;
    const canvasH = this.canvas.height / dpr;
    const cssW = Math.max(1, this.canvas.width / dpr - padding * 2 - padLeft - padRight);
    const cssH = Math.max(1, canvasH - padding * 2 - padTop - padBottom);
    const bw = Math.max(1, bounds.maxX - bounds.minX);
    const bh = Math.max(1, bounds.maxY - bounds.minY);
    let zoom = Math.min(cssW / bw, cssH / bh, MAX_ZOOM);
    // fillFrame: never letterbox the map on the teal canvas. Phone Fit only.
    if (fillFrame) {
      zoom = Math.min(MAX_ZOOM, Math.max(zoom, canvasH / MAP_HEIGHT));
    }
    this.zoom = Math.max(this.minZoom, zoom);
    this.x = (bounds.minX + bounds.maxX) / 2;
    this.y = (bounds.minY + bounds.maxY) / 2;
    this._targetX = null;
    this._targetY = null;
    this._clamp();
    this.dirty = true;
  }

  fitWorld(insets = {}) {
    this.fitBounds({ minX: 0, minY: 0, maxX: MAP_WIDTH, maxY: MAP_HEIGHT }, insets);
  }

  /** Convert screen pixel coords to world coords */
  screenToWorld(sx, sy) {
    const dpr = devicePixelRatio;
    const vw = this.canvas.width / (this.zoom * dpr);
    const vh = this.canvas.height / (this.zoom * dpr);
    const wx = this.x - vw / 2 + sx / this.zoom;
    const wy = this.y - vh / 2 + sy / this.zoom;
    return { x: wx, y: wy };
  }

  /** Convert world coords to screen pixel coords */
  worldToScreen(wx, wy) {
    const dpr = devicePixelRatio;
    const vw = this.canvas.width / (this.zoom * dpr);
    const vh = this.canvas.height / (this.zoom * dpr);
    const sx = (wx - this.x + vw / 2) * this.zoom;
    const sy = (wy - this.y + vh / 2) * this.zoom;
    return { x: sx, y: sy };
  }

  /** Get the visible world rectangle */
  getViewport() {
    const vw = this.viewportWidth;
    const vh = this.viewportHeight;
    return {
      x: this.x - vw / 2,
      y: this.y - vh / 2,
      width: vw,
      height: vh,
    };
  }

  /** Apply camera transform to a canvas context */
  applyTransform(ctx) {
    const dpr = devicePixelRatio;
    const vw = this.canvas.width / (this.zoom * dpr);
    const vh = this.canvas.height / (this.zoom * dpr);
    const offsetX = this.x - vw / 2;
    const offsetY = this.y - vh / 2;
    ctx.setTransform(this.zoom * dpr, 0, 0, this.zoom * dpr, -offsetX * this.zoom * dpr, -offsetY * this.zoom * dpr);
  }

  /** Start a smooth pan to (wx, wy). Wraps horizontally to the nearest copy. */
  panTo(wx, wy) {
    // Wrap target to [0, MAP_WIDTH), then pick the copy closest to current position
    let targetX = ((wx % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
    const copies = [targetX - MAP_WIDTH, targetX, targetX + MAP_WIDTH];
    this._targetX = copies.reduce((best, x) =>
      Math.abs(x - this.x) < Math.abs(best - this.x) ? x : best
    );
    this._targetY = Math.max(0, Math.min(MAP_HEIGHT, wy));
    this.dirty = true;
  }

  /** Update animation state. Call each frame. Returns true if still animating. */
  update() {
    if (this._targetX !== null) {
      const dx = this._targetX - this.x;
      const dy = this._targetY - this.y;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
        this.x = this._targetX;
        this.y = this._targetY;
        this._targetX = null;
        this._targetY = null;
      } else {
        this.x += dx * LERP_SPEED;
        this.y += dy * LERP_SPEED;
      }
      this._clamp();
      this.dirty = true;
      return true;
    }
    return false;
  }

  // --- Input handlers (call from main.js) ---

  onMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    this._dragging = true;
    this._dragMoved = false;
    this._dragStartX = e.clientX;
    this._dragStartY = e.clientY;
    this._dragCamStartX = this.x;
    this._dragCamStartY = this.y;
    // Cancel any pan animation
    this._targetX = null;
    this._targetY = null;
  }

  onMouseMove(e) {
    if (!this._dragging) return false;
    const dx = (e.clientX - this._dragStartX) / this.zoom;
    const dy = (e.clientY - this._dragStartY) / this.zoom;
    // Require at least 3px of movement to start panning (distinguish from click)
    const screenDist = Math.abs(e.clientX - this._dragStartX) + Math.abs(e.clientY - this._dragStartY);
    if (!this._dragMoved && screenDist < 3) return false;
    this._dragMoved = true;
    this.x = this._dragCamStartX - dx;
    this.y = this._dragCamStartY - dy;
    this._clamp();
    this.dirty = true;
    return true;
  }

  onMouseUp() {
    const wasDrag = this._dragging && this._dragMoved;
    this._dragging = false;
    this._dragMoved = false;
    return wasDrag;
  }

  get isDragging() {
    return this._dragging;
  }

  get hasDragged() {
    return this._dragMoved;
  }

  onWheel(e) {
    e.preventDefault();
    // Normalize deltaY across browsers and input devices
    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 40;   // DOM_DELTA_LINE
    if (e.deltaMode === 2) delta *= 800;  // DOM_DELTA_PAGE

    // Zoom toward cursor
    const worldBefore = this.screenToWorld(e.clientX, e.clientY);
    const factor = Math.pow(0.999, delta);
    this.zoom = Math.max(this.minZoom, Math.min(MAX_ZOOM, this.zoom * factor));
    const worldAfter = this.screenToWorld(e.clientX, e.clientY);
    // Adjust position to keep cursor world point stable
    this.x += worldBefore.x - worldAfter.x;
    this.y += worldBefore.y - worldAfter.y;
    this._clamp();
    this.dirty = true;
  }

  // Button zoom — do not wait for a synthetic wheel or the next pointer.
  zoomBy(dir, { sx, sy } = {}) {
    const toward = Number.isFinite(sx) && Number.isFinite(sy);
    const worldBefore = toward ? this.screenToWorld(sx, sy) : null;
    const factor = dir === 'in' ? 1.2 : 1 / 1.2;
    this.zoom = Math.max(this.minZoom, Math.min(MAX_ZOOM, this.zoom * factor));
    if (worldBefore) {
      const worldAfter = this.screenToWorld(sx, sy);
      this.x += worldBefore.x - worldAfter.x;
      this.y += worldBefore.y - worldAfter.y;
    }
    this._clamp();
    this.dirty = true;
  }

  /** Ensure zoom stays valid after canvas resize */
  onResize() {
    this.zoom = Math.max(this.minZoom, Math.min(MAX_ZOOM, this.zoom));
    this._clamp();
    this.dirty = true;
  }

  _clamp() {
    const vh = this.viewportHeight;
    const halfH = vh / 2;

    // No horizontal clamp — map wraps horizontally
    // Periodically normalize x to avoid float precision drift
    if (this.x < -MAP_WIDTH || this.x > MAP_WIDTH * 2) {
      this.x = ((this.x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;
    }

    // Hard vertical clamp — viewport stays within map bounds
    if (vh >= MAP_HEIGHT) {
      // Viewport is taller than map - center vertically
      this.y = MAP_HEIGHT / 2;
    } else {
      // Clamp so top edge >= 0 and bottom edge <= MAP_HEIGHT
      const minY = halfH;
      const maxY = MAP_HEIGHT - halfH;
      this.y = Math.max(minY, Math.min(maxY, this.y));
    }
  }
}
