// Pacific victory cities. Checked at the end of a full round only.
// Axis need 6 of the 8, and one of them must be Japan.
// The Allies win when they control Japan.

export const PACIFIC_VICTORY_CITIES = Object.freeze([
  'Japan',
  'Kiangsu',
  'Kwangtung',
  'Philippines',
  'India',
  'New South Wales',
  'Hawaiian Islands',
  'Western United States',
]);

export const PACIFIC_AXIS_VC_REQUIRED = 6;

function ownerPlayer(gameState, territoryName) {
  const ownerId = gameState?.getOwner?.(territoryName);
  if (!ownerId) return null;
  return gameState.getPlayer?.(ownerId) || null;
}

function isAxis(player) {
  if (!player) return false;
  return player.alliance === 'Axis' || player.id === 'Japanese';
}

function isAllies(player) {
  if (!player) return false;
  return player.alliance === 'Allies';
}

export function pacificVictorySnapshot(gameState) {
  let japanHolds = 0;
  let holdsJapan = false;
  let alliesHoldJapan = false;
  for (const name of PACIFIC_VICTORY_CITIES) {
    const player = ownerPlayer(gameState, name);
    const axis = isAxis(player);
    if (axis) japanHolds += 1;
    if (name === 'Japan') {
      holdsJapan = axis;
      alliesHoldJapan = isAllies(player);
    }
  }
  return {
    japanHolds,
    total: PACIFIC_VICTORY_CITIES.length,
    holdsJapan,
    alliesHoldJapan,
  };
}

// Returns true when this call declared a winner.
export function applyPacificRoundVictory(gameState) {
  if (!gameState || gameState.gameOver) return false;
  const snap = pacificVictorySnapshot(gameState);
  if (snap.alliesHoldJapan) {
    gameState.gameOver = true;
    gameState.winner = 'Allies';
    gameState.winCondition = 'Allies control Japan';
    return true;
  }
  if (snap.japanHolds >= PACIFIC_AXIS_VC_REQUIRED && snap.holdsJapan) {
    gameState.gameOver = true;
    gameState.winner = 'Axis';
    gameState.winCondition = 'Japan controls 6 victory cities, including Japan';
    return true;
  }
  return false;
}

export function pacificVictoryChip(gameState) {
  const snap = pacificVictorySnapshot(gameState);
  return `VC ${snap.japanHolds}/${snap.total}`;
}

export function pacificVictoryLine(gameState) {
  const snap = pacificVictorySnapshot(gameState);
  const hold = snap.holdsJapan ? 'including Japan' : 'not including Japan';
  return `Japan holds ${snap.japanHolds} of ${snap.total} victory cities, ${hold}`;
}
