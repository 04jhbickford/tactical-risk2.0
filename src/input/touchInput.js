// Touch input for Tactical Risk (Phase 2 — tablet/mobile support).
//
// Strategy: translate touch gestures into the SAME synthetic mouse/wheel
// events the existing desktop handlers already consume, dispatched on the
// same canvas. Desktop mouse handling stays byte-identical — this module is
// purely additive and does nothing until a touch actually happens.
//
//   1 finger drag  -> mousedown / mousemove / mouseup   (pan; tap = click)
//   1 finger tap   -> mousedown + mouseup with <3px movement (existing
//                     wasDrag logic in camera.js treats it as a click, so
//                     territory selection / unit drag flows work unchanged)
//   2 finger pinch -> synthetic wheel events at the pinch midpoint
//                     (camera.onWheel handles zoom-toward-point)
//
// e.preventDefault() on all touch events suppresses the browser's own
// compatibility mouse events, so nothing fires twice.

function synthMouse(target, type, x, y) {
  const ev = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: 0,
    bubbles: true,
    cancelable: true,
    view: window
  });
  // Marker so handlers can offer touch-specific behaviour (e.g. tap-to-peek
  // tooltips) without affecting real mouse events
  ev.fromTouch = true;
  target.dispatchEvent(ev);
}

function pinchStateOf(e) {
  const [a, b] = [e.touches[0], e.touches[1]];
  return {
    dist: Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY),
    cx: (a.clientX + b.clientX) / 2,
    cy: (a.clientY + b.clientY) / 2
  };
}

// Wire touch → synthetic mouse on a canvas. `enablePinch` adds two-finger
// zoom (main map only; the minimap just gets tap/drag).
export function initTouchInput(canvas, { enablePinch = false } = {}) {
  if (!canvas) return;

  let panning = false; // we have an open synthetic mousedown
  let pinch = null;

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      panning = true;
      synthMouse(canvas, 'mousedown', t.clientX, t.clientY);
    } else if (e.touches.length === 2 && enablePinch) {
      // Second finger down: cancel the in-flight pan WITHOUT producing a tap.
      // Moving >3px before mouseup makes camera.onMouseUp() report a drag,
      // so the click path in main.js is skipped.
      if (panning) {
        const t = e.touches[0];
        synthMouse(canvas, 'mousemove', t.clientX + 24, t.clientY + 24);
        synthMouse(canvas, 'mouseup', t.clientX + 24, t.clientY + 24);
        panning = false;
      }
      pinch = pinchStateOf(e);
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const t = e.touches[0];
      if (panning) {
        synthMouse(canvas, 'mousemove', t.clientX, t.clientY);
      } else {
        // Finger left over from a pinch started moving: begin a pan from here
        // (deliberately NOT started on pinch-release, so lifting a pinch never
        // registers as a tap/selection)
        panning = true;
        synthMouse(canvas, 'mousedown', t.clientX, t.clientY);
      }
    } else if (e.touches.length === 2 && pinch && enablePinch) {
      const now = pinchStateOf(e);
      if (pinch.dist > 0 && now.dist > 0) {
        // camera.onWheel applies factor = 0.999^deltaY, so invert that:
        // deltaY = ln(ratio) / ln(0.999). Spread (ratio>1) => negative delta
        // => zoom in, matching wheel-up behaviour.
        const deltaY = Math.log(now.dist / pinch.dist) / Math.log(0.999);
        canvas.dispatchEvent(new WheelEvent('wheel', {
          deltaY,
          deltaMode: 0,
          clientX: now.cx,
          clientY: now.cy,
          bubbles: true,
          cancelable: true
        }));
      }
      pinch = now;
    }
  }, { passive: false });

  const onTouchEnd = (e) => {
    e.preventDefault();
    if (e.touches.length === 0) {
      if (panning) {
        const t = e.changedTouches[0];
        synthMouse(canvas, 'mouseup', t.clientX, t.clientY);
        panning = false;
      }
      pinch = null;
    } else if (e.touches.length === 1) {
      // Pinch ended with one finger still down. Do NOT start a pan (or a
      // potential tap) yet — if the finger moves, touchmove starts the pan.
      // This prevents pinch-release from selecting whatever was under the
      // last finger.
      pinch = null;
    }
  };
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });
}

// On-screen zoom buttons (bottom-right). Useful for touch (no wheel) and for
// desktop trackpads. Purely additive UI; drives the existing wheel handler.
export function initZoomControls(canvas, { onFit, onZoom, onZoomStep } = {}) {
  if (!canvas || document.getElementById('zoom-controls')) return;

  const wrap = document.createElement('div');
  wrap.id = 'zoom-controls';
  wrap.innerHTML = `
    <button class="zoom-btn" data-zoom="in" title="Zoom in" aria-label="Zoom in">+</button>
    <button class="zoom-btn" data-zoom="out" title="Zoom out" aria-label="Zoom out">−</button>
    <button class="zoom-btn zoom-btn-fit" data-zoom="fit" title="Fit map" aria-label="Fit map">Fit</button>
  `;
  document.body.appendChild(wrap);

  const zoomStep = (dir) => {
    const r = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new WheelEvent('wheel', {
      deltaY: dir === 'in' ? -350 : 350,
      deltaMode: 0,
      clientX: r.left + r.width / 2,
      clientY: r.top + r.height / 2,
      bubbles: true,
      cancelable: true
    }));
  };

  wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
  wrap.addEventListener('click', (e) => e.stopPropagation());

  wrap.querySelectorAll('.zoom-btn').forEach(btn => {
    btn.addEventListener('pointerdown', (e) => e.stopPropagation());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.dataset.zoom === 'fit') {
        if (typeof onFit === 'function') onFit();
        if (typeof onZoom === 'function') onZoom();
        return;
      }
      if (typeof onZoomStep === 'function') onZoomStep(btn.dataset.zoom);
      else zoomStep(btn.dataset.zoom);
      if (typeof onZoom === 'function') onZoom();
    });
  });
}
