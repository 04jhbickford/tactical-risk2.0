// STACK-LOD SoT — preview only. No Three import.
// Used by the Canvas UX preview (main art + Three HUD). Far/mid = ONE pip+N.
// Near = ≤3–4 silhouettes + +K. Never dual systems.

export const LOD_FAR = 215;
export const LOD_NEAR = 92;
export const NEAR_MAX = 4;
export const NEAR_TYPED = 3;
export const GAP_PX = 5;
export const PIP_PX = 64;
export const PIECE_PX = 96;
export const PIP_MIN_PX = 58;
export const PIP_MAX_PX = 72;
export const PIECE_MIN_PX = 84;
export const PIECE_MAX_PX = 118;

/** Near camera OR a selected land — molded minis. Mid/far idle stays pip+N. */
export function showMinis(band, selected) {
  return band === 'near' || !!selected;
}

const TYPE_PRIORITY = [
  'infantry', 'armour', 'fighter', 'bomber', 'artillery',
  'battleship', 'carrier', 'destroyer', 'cruiser',
  'submarine', 'transport', 'aaGun', 'factory', 'tacticalBomber',
];

export function lodBand(dist) {
  if (dist > LOD_FAR) return 'far';
  if (dist > LOD_NEAR) return 'mid';
  return 'near';
}

export function isSupportType(type) {
  return type === 'factory' || type === 'aaGun';
}

export function isDenseBand(band) {
  return band === 'far' || band === 'mid';
}

export function worldSizeFromScreen(px, dist, fovDeg, viewH, {
  minPx = 30,
  maxPx = 48,
  maxWorld = 10,
  minWorld = 2.4,
} = {}) {
  const p = Math.max(minPx, Math.min(maxPx, px));
  const h = Math.max(1, viewH);
  const fov = (fovDeg * Math.PI) / 180;
  const world = (p / h) * 2 * dist * Math.tan(fov / 2);
  return Math.min(maxWorld, Math.max(minWorld, world));
}

export function tokenSizeFor(band, selected) {
  if (band === 'near' || selected) return PIECE_PX;
  return PIP_PX;
}

export function sortStacks(stacks) {
  return [...(stacks || [])].sort((a, b) => {
    const pa = TYPE_PRIORITY.indexOf(a.type);
    const pb = TYPE_PRIORITY.indexOf(b.type);
    return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
  });
}

/** Near roster only. Mid/far must never use this to pick a soldier/ship pip. */
export function primaryType(stacks) {
  const sorted = sortStacks(stacks);
  return sorted[0]?.type || 'infantry';
}

// Near: ≤3 typed + overflow when more types exist; else up to 4 typed.
// Never a type parade at mid. Never pip+types together.
export function nearLayout(stacks) {
  const sorted = sortStacks(stacks);
  if (sorted.length <= NEAR_MAX) {
    return { shown: sorted, overflowQty: 0, collapse: false };
  }
  const shown = sorted.slice(0, NEAR_TYPED);
  const hidden = sorted.slice(NEAR_TYPED);
  const overflowQty = hidden.reduce((n, s) => n + (s.quantity || 0), 0);
  return { shown, overflowQty, collapse: false };
}

export function shouldCollapse(tokenCount, pitch, maxDrift) {
  if (tokenCount <= 1) return false;
  const outer = pitch * Math.sqrt(Math.max(0, tokenCount - 1));
  return outer > maxDrift;
}

export function spiralPack(n, pitch) {
  if (n <= 0) return [];
  const out = [{ x: 0, z: 0 }];
  if (n === 1) return out;
  let angle = 0;
  for (let i = 1; i < n; i++) {
    const radius = pitch * Math.sqrt(i);
    angle += 2.399963;
    out.push({
      x: Math.cos(angle) * radius,
      z: Math.sin(angle) * radius,
    });
  }
  return out;
}

export function hexPack(n, pitch) {
  return spiralPack(n, pitch);
}

// P31 HARD: Japan / island / multi-type — pack to the land footprint so
// minis never spill into soup. Mid idle still pip+N only.
export const DENSE_LANDS = new Set([
  'Japan', 'Okinawa', 'Philippines', 'United Kingdom', 'Eire',
  'Switzerland', 'Cuba', 'Wake Island', 'Midway', 'Hawaiian Islands',
  'Solomon Islands', 'Caroline Islands', 'New Zealand', 'Kwangtung',
  'Manchuria', 'Borneo Celebes', 'East Indies',
]);

// Printed A&A Japan home-island pin (not the bbox centroid, not Japan Sea Zone).
// Bbox min=286 is the long island chain; the visual mass sits nearer Honshu.
export const JAPAN_HOME_CENTER = { x: 2594, y: 736 };

export function isDenseLand(name, footprint) {
  return DENSE_LANDS.has(name) || isSmallLand(name, footprint);
}

export function denseFootprint(name, footprint) {
  const min = footprint?.min || 200;
  if (name === 'Japan') return { ...footprint, min: Math.min(min, 92) };
  if (DENSE_LANDS.has(name)) return { ...footprint, min: Math.min(min, 118) };
  return footprint || { min };
}

export function territoryFootprint(territory) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const poly of territory?.polygons || []) {
    for (const [x, y] of poly) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return { w: 200, h: 200, min: 200 };
  const w = Math.max(1, maxX - minX);
  const h = Math.max(1, maxY - minY);
  return { w, h, min: Math.min(w, h) };
}

export function isSmallLand(name, footprint) {
  if (DENSE_LANDS.has(name)) return true;
  return (footprint?.min || 999) < 140;
}

export function footprintPiecePx(footprint, band, selected, typeCount = 1, name = '') {
  const min = denseFootprint(name, footprint)?.min || footprint?.min || 200;
  const japan = name === 'Japan';
  if (band === 'near' || selected) {
    if (japan) return typeCount >= 3 ? 52 : 58;
    if (min < 80) return 52;
    if (min < 140) return 62;
    if (typeCount >= 4 && min < 320) return 70;
    if (min < 200) return 78;
    return PIECE_PX;
  }
  if (min < 80) return 44;
  if (min < 140) return 50;
  return PIP_PX;
}

export function pieceWorldCap(baseWorld, footprint, n, name = '') {
  const min = denseFootprint(name, footprint)?.min || footprint?.min || 200;
  const japan = name === 'Japan';
  const minWorld = Math.max(japan ? 5.2 : 8, min * (japan ? 0.072 : 0.1));
  const cap = (minWorld * (japan ? 0.40 : 0.55)) / Math.max(1, Math.sqrt(Math.max(1, n)));
  return Math.max(japan ? 3.05 : 3.6, Math.min(baseWorld, cap));
}

export function clusterPack(n, pitch) {
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0, z: 0 }];
  if (n === 2) {
    return [
      { x: -pitch * 0.34, z: 0 },
      { x: pitch * 0.34, z: 0 },
    ];
  }
  if (n === 3) {
    return [
      { x: 0, z: -pitch * 0.30 },
      { x: -pitch * 0.33, z: pitch * 0.24 },
      { x: pitch * 0.33, z: pitch * 0.24 },
    ];
  }
  if (n === 4) {
    return [
      { x: -pitch * 0.30, z: -pitch * 0.24 },
      { x: pitch * 0.30, z: -pitch * 0.24 },
      { x: -pitch * 0.30, z: pitch * 0.24 },
      { x: pitch * 0.30, z: pitch * 0.24 },
    ];
  }
  return spiralPack(n, pitch * 0.78);
}

export function packPitchFor(n, pieceWorld, footprint, name = '') {
  const japan = name === 'Japan';
  const min = denseFootprint(name, footprint)?.min || footprint?.min || 200;
  const minWorld = Math.max(japan ? 5.2 : 8, min * (japan ? 0.072 : 0.1));
  const budget = Math.max(minWorld * (japan ? 0.26 : 0.36), pieceWorld * (japan ? 0.40 : 0.50));
  return Math.min(pieceWorld * (japan ? 0.46 : 0.58), budget / Math.max(1, Math.sqrt(n)));
}

export function separatePoints(items, minDist, iterations = 22) {
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        let dx = items[j].x - items[i].x;
        let dz = items[j].z - items[i].z;
        let d = Math.hypot(dx, dz);
        if (d < 1e-4) {
          dx = 0.18;
          dz = 0.11;
          d = Math.hypot(dx, dz);
        }
        if (d >= minDist) continue;
        const push = (minDist - d) * 0.62;
        const nx = dx / d;
        const nz = dz / d;
        items[i].x -= nx * push;
        items[i].z -= nz * push;
        items[j].x += nx * push;
        items[j].z += nz * push;
      }
    }
    for (const it of items) {
      const dx = it.x - it.homeX;
      const dz = it.z - it.homeZ;
      const drift = Math.hypot(dx, dz);
      const maxD = it.maxDrift ?? 9;
      if (iter >= iterations - 6) continue;
      if (drift > maxD && drift > 0) {
        it.x = it.homeX + (dx / drift) * maxD;
        it.z = it.homeZ + (dz / drift) * maxD;
      } else {
        it.x += (it.homeX - it.x) * 0.01;
        it.z += (it.homeZ - it.z) * 0.01;
      }
    }
  }
  return items;
}
