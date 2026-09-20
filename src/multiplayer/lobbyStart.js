// Host lobby primary CTA. A 2/2 waiting room labeled "Create Game" looks
// like the match never started (B40). Start is the verb; publish is not.

export function resolveHostLobbyPrimaryCta({
  isHost = false,
  playerCount = 0,
  allHaveFactions = false,
  hostHasFaction = false,
} = {}) {
  if (!isHost) return null;
  const canStart = playerCount >= 2 && allHaveFactions && hostHasFaction;
  let hint = '';
  if (!hostHasFaction) hint = 'Select a faction and color above to continue';
  else if (playerCount < 2) hint = 'Waiting for another player';
  else if (!allHaveFactions) hint = 'Every player must pick a faction';
  return {
    action: 'start',
    label: 'Start Game',
    disabled: !canStart,
    hint,
  };
}

// CEVX6F hold: Start on an already-started lobby must reopen that
// gameId. A second setDoc is a new match.
export function resolveStartGameTarget({
  existingGameId = null,
  lobbyStatus = null,
} = {}) {
  const id = existingGameId || null;
  const started = lobbyStatus === 'starting'
    || lobbyStatus === 'in_progress'
    || lobbyStatus === 'active';
  if (id && started) return { reuse: true, gameId: id };
  return { reuse: false, gameId: null };
}

export function shouldCreateNewGameOnResume() {
  return false;
}
