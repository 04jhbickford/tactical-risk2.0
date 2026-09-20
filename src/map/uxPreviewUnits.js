// Main-branch unit chits + STACK-LOD for the UX preview. Preview only.
// Square chits pack at full pitch (piece + gap). No mid/far continent blobs.

import { getUnitIconPath } from '../utils/unitIcons.js';
import { UnitRenderer } from './unitRenderer.js';
import {
  showMinis,
  sortStacks,
  territoryFootprint,
  isDenseLand,
  isSmallLand,
  denseFootprint,
  JAPAN_HOME_CENTER,
} from './threeMapDensity.js';

const FACTION_FALLBACK = {
  Russians: '#B22222',
  Germans: '#4A4A4A',
  British: '#B8860B',
  Japanese: '#FF8C00',
  Americans: '#556B2F',
};

export const PREVIEW_CHIT_GAP = 4;
export const PREVIEW_WORLD_CAP_FAR = 26;
export const PREVIEW_WORLD_CAP_MID = 28;
export const PREVIEW_WORLD_CAP_NEAR = 36;

export const STRESS_LAND_TYPES = [
  'infantry', 'armour', 'artillery', 'fighter', 'bomber',
  'tacticalBomber', 'aaGun', 'factory',
];

export function lodBandFromZoom(zoom) {
  const z = Number(zoom) || 0;
  if (z < 0.38) return 'far';
  if (z < 0.90) return 'mid';
  return 'near';
}

export function stackTotal(stacks) {
  return (stacks || []).reduce((n, s) => n + (Number(s.quantity) || 0), 0);
}

export function stackOwner(stacks, territory) {
  return stacks?.[0]?.owner || territory?.originalOwner || 'Russians';
}

export function preloadUnitImages(unitDefs, factionIds) {
  const images = {};
  const types = Object.keys(unitDefs || {});
  const factions = factionIds?.length
    ? factionIds
    : ['Americans', 'Germans', 'British', 'Japanese', 'Russians'];
  const pending = [];
  for (const factionId of factions) {
    images[factionId] = {};
    for (const unitType of types) {
      const path = getUnitIconPath(unitType, factionId);
      if (!path) continue;
      const img = new Image();
      pending.push(new Promise((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => resolve();
      }));
      img.src = path;
      images[factionId][unitType] = img;
    }
  }
  return { images, ready: Promise.all(pending) };
}

function polygonCentroid(poly) {
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
  const factor = 1 / (6 * area);
  return { cx: Math.abs(cx * factor), cy: Math.abs(cy * factor), area };
}

export function territoryCenter(territory) {
  if (territory?.name === 'Japan' && !territory.isWater) {
    return { x: JAPAN_HOME_CENTER.x, y: JAPAN_HOME_CENTER.y };
  }
  const polygons = territory?.polygons || [];
  if (!polygons.length) {
    const c = territory?.center;
    return c ? { x: c[0], y: c[1] } : null;
  }
  if (territory.isWater) {
    const manual = UnitRenderer.SEA_ZONE_CENTERS?.[territory.name];
    if (manual) return { x: manual.x, y: manual.y };
    let best = null;
    for (const poly of polygons) {
      if (!poly || poly.length < 3) continue;
      const next = polygonCentroid(poly);
      if (!best || next.area > best.area) best = next;
    }
    return best ? { x: best.cx, y: best.cy } : null;
  }
  let total = 0;
  let sx = 0;
  let sy = 0;
  for (const poly of polygons) {
    if (!poly || poly.length < 3) continue;
    const { cx, cy, area } = polygonCentroid(poly);
    if (area > 0) {
      sx += cx * area;
      sy += cy * area;
      total += area;
    }
  }
  if (!total) return null;
  let x = sx / total;
  let y = sy / total;
  const off = UnitRenderer.TERRITORY_CENTER_OFFSETS?.[territory.name];
  if (off) {
    x += off.x;
    y += off.y;
  }
  return { x, y };
}

export function stressStacks(owner = 'Japanese', types = STRESS_LAND_TYPES) {
  return types.map((type, i) => ({
    type,
    quantity: i + 1,
    owner,
  }));
}

/** Far stays pip+N. Mid expand is selected-only. Near shows typed stacks. */
export function shouldExpandPreview(band, selected, stacksExpanded) {
  if (showMinis(band, selected)) return true;
  return !!stacksExpanded && band !== 'far';
}

export function previewMaxTyped(name, footprint) {
  if (name === 'Japan' || isSmallLand(name, footprint)) return 2;
  if (isDenseLand(name, footprint) || (footprint?.min || 999) < 180) return 3;
  return 4;
}

export function previewTypeLayout(stacks, { name = '', footprint = null, expand = false } = {}) {
  const sorted = sortStacks(stacks);
  if (!sorted.length) return { shown: [], overflowQty: 0, collapse: true };
  if (!expand) {
    return { shown: [sorted[0]], overflowQty: 0, collapse: true };
  }
  const cap = previewMaxTyped(name, footprint);
  if (sorted.length <= cap) {
    return { shown: sorted, overflowQty: 0, collapse: false };
  }
  const shownCount = Math.max(1, cap - 1);
  const shown = sorted.slice(0, shownCount);
  const hidden = sorted.slice(shownCount);
  const overflowQty = hidden.reduce((n, s) => n + (Number(s.quantity) || 0), 0);
  return { shown, overflowQty, collapse: false };
}

export function previewChitWorldSize({
  zoom,
  footprint,
  name = '',
  tokenCount = 1,
  expand = false,
} = {}) {
  const z = Math.max(0.12, Number(zoom) || 0.4);
  const band = lodBandFromZoom(z);
  let css = 12;
  if (band === 'far') css = expand ? 12 : 10;
  else if (band === 'mid') css = expand ? 14 : 12;
  else css = expand ? 30 : 24;
  if (name === 'Japan' || isSmallLand(name, footprint)) css *= 0.82;

  let world = css / z;
  const worldCap = band === 'near'
    ? PREVIEW_WORLD_CAP_NEAR
    : band === 'mid'
      ? PREVIEW_WORLD_CAP_MID
      : PREVIEW_WORLD_CAP_FAR;
  world = Math.min(world, worldCap);

  const n = Math.max(1, tokenCount);
  const min = denseFootprint(name, footprint)?.min || footprint?.min || 200;
  const inset = name === 'Japan' ? 0.56 : isDenseLand(name, footprint) ? 0.66 : 0.80;
  const cols = n <= 1 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const gap = PREVIEW_CHIT_GAP;
  const maxFit = Math.min(
    (min * inset - gap * Math.max(0, cols - 1)) / cols,
    (min * inset - gap * Math.max(0, rows - 1)) / rows,
  );
  world = Math.min(world, Math.max(8, maxFit));
  return Math.max(name === 'Japan' ? 9 : 11, world);
}

/** Axis-aligned square pack. Center distance is always `pitch` on-grid. */
export function chitGridPack(n, pitch) {
  const p = Math.max(0, Number(pitch) || 0);
  if (n <= 0) return [];
  if (n === 1) return [{ x: 0, y: 0 }];
  if (n === 2) {
    return [
      { x: -p / 2, y: 0 },
      { x: p / 2, y: 0 },
    ];
  }
  if (n === 3) {
    const h = p * Math.sqrt(3) / 2;
    return [
      { x: 0, y: -h / 2 },
      { x: -p / 2, y: h / 2 },
      { x: p / 2, y: h / 2 },
    ];
  }
  const cols = n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const inRow = Math.min(cols, n - r * cols);
    const x0 = -((inRow - 1) * p) / 2;
    const y0 = -((rows - 1) * p) / 2;
    out.push({ x: x0 + c * p, y: y0 + r * p });
  }
  return out;
}

export function tokenSeparation(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function tokensNeededGap(a, b, gap = PREVIEW_CHIT_GAP) {
  return (Number(a.size) + Number(b.size)) / 2 + gap;
}

export function maxTokenOverlap(tokens, gap = PREVIEW_CHIT_GAP) {
  let worst = 0;
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const need = tokensNeededGap(tokens[i], tokens[j], gap);
      const d = tokenSeparation(tokens[i], tokens[j]);
      worst = Math.max(worst, need - d);
    }
  }
  return worst;
}

function shrinkForeignOverlaps(layouts, gap = PREVIEW_CHIT_GAP) {
  for (let iter = 0; iter < 8; iter++) {
    let hit = false;
    for (let i = 0; i < layouts.length; i++) {
      for (let j = i + 1; j < layouts.length; j++) {
        const aToks = layouts[i].tokens;
        const bToks = layouts[j].tokens;
        for (const a of aToks) {
          for (const b of bToks) {
            const need = tokensNeededGap(a, b, gap);
            const d = tokenSeparation(a, b);
            if (d + 0.05 >= need) continue;
            hit = true;
            const floorA = layouts[i].name === 'Japan' ? 9 : 11;
            const floorB = layouts[j].name === 'Japan' ? 9 : 11;
            a.size = Math.max(floorA, a.size * 0.88);
            b.size = Math.max(floorB, b.size * 0.88);
          }
        }
      }
    }
    if (!hit) break;
  }
  return layouts;
}

export function layoutPreviewTerritory({
  territory,
  stacks,
  zoom,
  selected = false,
  stacksExpanded = false,
} = {}) {
  const name = territory?.name || '';
  const center = territoryCenter(territory);
  const footprint = territoryFootprint(territory);
  const band = lodBandFromZoom(zoom);
  const expand = shouldExpandPreview(band, selected, stacksExpanded);
  const owner = stackOwner(stacks, territory);
  const total = stackTotal(stacks);
  const typeLayout = previewTypeLayout(stacks, { name, footprint, expand });
  const n = typeLayout.shown.length + (typeLayout.overflowQty > 0 ? 1 : 0);
  const size = previewChitWorldSize({
    zoom,
    footprint,
    name,
    tokenCount: Math.max(1, n),
    expand,
  });
  const pitch = size + PREVIEW_CHIT_GAP;
  const pts = chitGridPack(Math.max(1, n), pitch);
  const tokens = typeLayout.shown.map((stack, i) => {
    const pt = pts[i] || { x: 0, y: 0 };
    return {
      kind: 'chit',
      type: stack.type,
      quantity: stack.quantity,
      owner: stack.owner || owner,
      x: (center?.x || 0) + pt.x,
      y: (center?.y || 0) + pt.y,
      size,
    };
  });
  if (typeLayout.overflowQty > 0) {
    const pt = pts[typeLayout.shown.length] || { x: pitch, y: 0 };
    tokens.push({
      kind: 'overflow',
      type: 'overflow',
      quantity: typeLayout.overflowQty,
      owner,
      x: (center?.x || 0) + pt.x,
      y: (center?.y || 0) + pt.y,
      size: Math.max(10, size * 0.72),
    });
  }
  return {
    name,
    territory,
    center,
    footprint,
    band,
    expand,
    owner,
    total,
    size,
    tokens,
    overlap: maxTokenOverlap(tokens),
  };
}

export function layoutAllPreviewStacks({
  territories,
  placements,
  zoom,
  selectedName = null,
  stacksExpanded = false,
} = {}) {
  const layouts = [];
  for (const t of territories || []) {
    const stacks = placements?.[t.name];
    if (!stacks?.length) continue;
    layouts.push(layoutPreviewTerritory({
      territory: t,
      stacks,
      zoom,
      selected: t.name === selectedName,
      stacksExpanded,
    }));
  }
  shrinkForeignOverlaps(layouts);
  return layouts;
}

export function overlapReport(layouts) {
  let inner = 0;
  let foreign = 0;
  for (const layout of layouts || []) {
    inner = Math.max(inner, maxTokenOverlap(layout.tokens));
  }
  for (let i = 0; i < (layouts || []).length; i++) {
    for (let j = i + 1; j < layouts.length; j++) {
      for (const a of layouts[i].tokens) {
        for (const b of layouts[j].tokens) {
          const need = tokensNeededGap(a, b);
          const d = tokenSeparation(a, b);
          foreign = Math.max(foreign, need - d);
        }
      }
    }
  }
  return {
    inner: Number(inner.toFixed(3)),
    foreign: Number(foreign.toFixed(3)),
    clean: inner <= 0.05 && foreign <= 0.05,
  };
}

function drawCountBadge(ctx, x, y, text, piece) {
  const fontSize = Math.max(7, Math.min(12, piece * 0.34));
  ctx.font = `700 ${fontSize}px -apple-system, "SF Pro Text", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const padX = Math.max(2.5, piece * 0.08);
  const h = fontSize + Math.max(2, piece * 0.08);
  const w = Math.max(h, ctx.measureText(text).width + padX * 2);
  const bx = x + piece * 0.28;
  const by = y + piece * 0.28;
  ctx.fillStyle = '#1A1610';
  ctx.beginPath();
  ctx.roundRect(bx - w / 2, by - h / 2, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = '#F4EFE4';
  ctx.fillText(text, bx, by);
}

function drawChit(ctx, img, x, y, size, ownerColor) {
  const pad = size * 0.08;
  const lw = Math.max(1.1, size * 0.06);
  const inset = lw / 2;
  ctx.save();
  ctx.fillStyle = ownerColor || '#4A4A4A';
  ctx.strokeStyle = 'rgba(20,16,10,0.88)';
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(
    x - size / 2 + inset,
    y - size / 2 + inset,
    size - inset * 2,
    size - inset * 2,
    Math.max(0, size * 0.16 - inset),
  );
  ctx.fill();
  ctx.stroke();
  if (img?.complete && img.naturalWidth > 0) {
    ctx.drawImage(img, x - size / 2 + pad, y - size / 2 + pad, size - pad * 2, size - pad * 2);
  }
  ctx.restore();
}

function drawOverflowChip(ctx, x, y, size, text) {
  const lw = Math.max(1, size * 0.06);
  const inset = lw / 2;
  ctx.save();
  ctx.fillStyle = '#1A1610';
  ctx.strokeStyle = 'rgba(244,239,228,0.28)';
  ctx.lineWidth = lw;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.roundRect(
    x - size / 2 + inset,
    y - size / 2 + inset,
    size - inset * 2,
    size - inset * 2,
    Math.max(0, size * 0.5 - inset),
  );
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#F4EFE4';
  ctx.font = `700 ${Math.max(8, size * 0.36)}px -apple-system, "SF Pro Text", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawPulseHalo(ctx, tokens, wave, color = '#C4A35A') {
  if (!tokens?.length) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxSize = 0;
  for (const tok of tokens) {
    minX = Math.min(minX, tok.x);
    minY = Math.min(minY, tok.y);
    maxX = Math.max(maxX, tok.x);
    maxY = Math.max(maxY, tok.y);
    maxSize = Math.max(maxSize, tok.size || 0);
  }
  const pad = maxSize * (0.72 + 0.22 * wave);
  const x = (minX + maxX) / 2;
  const y = (minY + maxY) / 2;
  const w = (maxX - minX) + pad * 2;
  const h = (maxY - minY) + pad * 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2.2, maxSize * 0.12);
  ctx.globalAlpha = 0.35 + 0.55 * wave;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14 + 10 * wave;
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, Math.max(8, maxSize * 0.28));
  ctx.stroke();
  ctx.restore();
}

export function renderPreviewStacks(ctx, {
  territories,
  placements,
  images,
  zoom,
  selectedName,
  stacksExpanded,
  factionColors,
  pulseNames = [],
  pulseWave = 1,
}) {
  const layouts = layoutAllPreviewStacks({
    territories,
    placements,
    zoom,
    selectedName,
    stacksExpanded,
  });
  const pulse = new Set(pulseNames || []);
  for (const layout of layouts) {
    if (pulse.has(layout.name)) {
      drawPulseHalo(ctx, layout.tokens, pulseWave);
    }
    const color = factionColors?.get(layout.owner) || FACTION_FALLBACK[layout.owner] || '#4A4A4A';
    for (const tok of layout.tokens) {
      if (tok.kind === 'overflow') {
        drawOverflowChip(ctx, tok.x, tok.y, tok.size, `+${tok.quantity}`);
        continue;
      }
      const img = images?.[tok.owner]?.[tok.type];
      const tokColor = factionColors?.get(tok.owner) || color;
      drawChit(ctx, img, tok.x, tok.y, tok.size, tokColor);
      const label = layout.expand ? String(tok.quantity) : String(layout.total);
      drawCountBadge(ctx, tok.x, tok.y, label, tok.size);
    }
  }
}

export function hitTestPreviewStack(worldX, worldY, {
  territories,
  placements,
  zoom,
  selectedName,
  stacksExpanded,
}) {
  const layouts = layoutAllPreviewStacks({
    territories,
    placements,
    zoom,
    selectedName,
    stacksExpanded,
  });
  let best = null;
  let bestD = Infinity;
  for (const layout of layouts) {
    for (const tok of layout.tokens) {
      const d = Math.hypot(worldX - tok.x, worldY - tok.y);
      const reach = tok.size * 0.58;
      if (d <= reach && d <= bestD) {
        bestD = d;
        best = layout.territory;
      }
    }
  }
  return best;
}
