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

// Host "List in Open Games" is a single publish. Show it until the
// local lobby is already published (first click must be enough).
export function shouldShowListInOpenGames({
  isHost = false,
  isPublished = false,
} = {}) {
  return !!isHost && !isPublished;
}

export const LOBBY_UNLIST_LABEL = 'Unlist Game';
export const LOBBY_MAIN_MENU_LABEL = 'Main Menu';
export const LOBBY_LIST_LABEL = 'List in Open Games';

// 9.21.26.13 — room chrome on both forks.
// Unlist is a host write: isPublished false, so Open Games drops the row.
// Main Menu is view-only for host and guest. The listed flag is not written.
export function resolveLobbyRoomChrome({
  isHost = false,
  isPublished = false,
} = {}) {
  const host = !!isHost;
  const published = !!isPublished;
  return {
    unlist: {
      action: 'unlist',
      label: LOBBY_UNLIST_LABEL,
      visible: host,
    },
    mainMenu: {
      action: 'main-menu',
      label: LOBBY_MAIN_MENU_LABEL,
      visible: true,
    },
    list: {
      action: 'publish',
      label: LOBBY_LIST_LABEL,
      visible: host && !published,
    },
  };
}

// Pure status result. Callers must not navigate on unlist, and must not
// write isPublished on main-menu.
export function lobbyChromeStatusAfter({
  action = '',
  isPublished = false,
  isHost = false,
} = {}) {
  const published = !!isPublished;
  const host = !!isHost;
  if (action === 'unlist' || action === 'mp-unlist') {
    if (!host) {
      return {
        isPublished: published,
        changed: false,
        navigate: null,
        allowed: false,
      };
    }
    return {
      isPublished: false,
      changed: published !== false,
      navigate: null,
      allowed: true,
    };
  }
  if (action === 'main-menu' || action === 'mp-main-menu') {
    return {
      isPublished: published,
      changed: false,
      navigate: 'main',
      allowed: true,
    };
  }
  return {
    isPublished: published,
    changed: false,
    navigate: null,
    allowed: false,
  };
}

// Open Games row. Unpublished lobbies are hidden, including the host's own.
export function lobbyAppearsInOpenGames({
  isPublished = false,
  password = null,
  playerCount = 0,
  maxPlayers = 0,
  isOwnLobby = false,
} = {}) {
  if (!isPublished) return false;
  if (isOwnLobby) return true;
  if (password) return false;
  return playerCount < maxPlayers;
}
