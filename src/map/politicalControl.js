// Political control notation for owned land. Unit stacks do not decide who
// owns a territory. Sea zones are not marked — they have no control pattern.

const NEUTRAL_OWNER = 'Neutral';

/** Readable faction chip at Experimental zoom, including fit below 0.35. */
export function experimentalControlFlagSize(zoom) {
  const z = Math.max(0.12, Number(zoom) || 0.4);
  return Math.max(12, Math.min(26, 16 / z));
}

/**
 * Seated owner of a land territory, or null.
 * Uncontrolled, Neutral, and sea stay unmarked.
 */
export function politicalControlMark(territory, game) {
  if (!territory || territory.isWater) return null;
  const ownerId = game?.getOwner?.(territory.name) || null;
  if (!ownerId || ownerId === NEUTRAL_OWNER) return null;
  const player = game?.getPlayer?.(ownerId);
  if (!player?.id) return null;
  return {
    name: territory.name,
    ownerId: player.id,
    label: player.name || player.id,
    color: player.color || '#4A4A4A',
    flag: player.flag || null,
    isCapital: game?.isCapital?.(territory.name) === true,
  };
}

export function politicalControlMarks(territories, game) {
  const marks = [];
  for (const territory of territories || []) {
    const mark = politicalControlMark(territory, game);
    if (mark) marks.push(mark);
  }
  return marks;
}

/**
 * Peek / sheet owner line.
 * Land: political owner when the caller stamped it (including empty land).
 * Sea: occupying stack only — no invented sea-control label.
 */
export function peekControlLabel(land, stacks) {
  if (!land) return '';
  if (land.isWater) return stacks?.[0]?.owner || '';
  if (typeof land.politicalOwner === 'string') return land.politicalOwner;
  return stacks?.[0]?.owner || '';
}

/** Slim land payload so the sheet can name the political owner. */
export function annotatePoliticalOwner(land, game) {
  if (!land || land.isWater) return land;
  const mark = politicalControlMark(land, game);
  return {
    name: land.name,
    isWater: false,
    production: land.production,
    ipc: land.ipc,
    politicalOwner: mark ? mark.label : '',
  };
}
