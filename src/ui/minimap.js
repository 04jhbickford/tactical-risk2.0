// Minimap: shows smallMap.jpeg with a red viewport rectangle.
// Click/drag on minimap pans the main camera.
// Handles horizontal wraparound for the viewport indicator.

import { MAP_WIDTH, MAP_HEIGHT } from '../map/camera.js';

export class Minimap {
  constructor(camera) {
    this.camera = camera;
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.bgImage = null;
    this._dragging = false;

    // Set canvas internal size (CSS size is 233x133)
    this.canvas.width = 233;
    this.canvas.height = 133;

    this.scaleX = this.canvas.width / MAP_WIDTH;
    this.scaleY = this.canvas.height / MAP_HEIGHT;

    this._loadBackground();
    this._bindEvents();
  }

  _loadBackground() {
    this.bgImage = new Image();
    this.bgImage.onload = () => {
      console.log('Minimap background loaded');
      this.render();
    };
    this.bgImage.onerror = () => {
      console.warn('Minimap background failed to load. Make sure to serve from the project root directory.');
    };
    this.bgImage.src = '../map/smallMap.jpeg';
  }

  _bindEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._dragging = true;
      this._panFromEvent(e);
    });

    this.canvas.addEventListener('mousemove', (e) => {
      if (this._dragging) {
        e.preventDefault();
        e.stopPropagation();
        this._panFromEvent(e);
      }
    });

    this.canvas.addEventListener('mouseup', (e) => {
      e.stopPropagation();
      this._dragging = false;
    });

    window.addEventListener('mouseup', () => {
      this._dragging = false;
    });
  }

  _panFromEvent(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const worldX = mx / this.scaleX;
    const worldY = my / this.scaleY;
    this.camera.panTo(worldX, worldY);
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw background
    if (this.bgImage && this.bgImage.complete && this.bgImage.naturalWidth > 0) {
      ctx.drawImage(this.bgImage, 0, 0, this.canvas.width, this.canvas.height);
    } else {
      ctx.fillStyle = '#1a3a5c';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Draw viewport rectangle (with horizontal wrap handling)
    const vp = this.camera.getViewport();

    // Wrap viewport x into [0, MAP_WIDTH)
    let vpX = ((vp.x % MAP_WIDTH) + MAP_WIDTH) % MAP_WIDTH;

    const rx = vpX * this.scaleX;
    const ry = Math.max(0, vp.y * this.scaleY);
    const rw = Math.min(vp.width * this.scaleX, this.canvas.width);
    const rh = Math.min(this.canvas.height - ry, vp.height * this.scaleY);

    ctx.strokeStyle = '#ff3333';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255, 50, 50, 0.1)';

    if (rx + rw > this.canvas.width) {
      // Viewport wraps around — draw two rectangles
      const rw1 = this.canvas.width - rx;
      ctx.strokeRect(rx, ry, rw1, rh);
      ctx.fillRect(rx, ry, rw1, rh);
      const rw2 = rw - rw1;
      ctx.strokeRect(0, ry, rw2, rh);
      ctx.fillRect(0, ry, rw2, rh);
    } else {
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillRect(rx, ry, rw, rh);
    }
  }
}
