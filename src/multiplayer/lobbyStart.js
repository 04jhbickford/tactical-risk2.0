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

// Room chrome. The host sees exactly one listing control, from the live
// isPublished flag: unlisted → List in Open Games, listed → Unlist Game.
// A guest sees neither. Main Menu stays for everyone and does not write
// the listed flag. Unlist never left the room; it only clears isPublished.
export function resolveLobbyRoomChrome({
  isHost = false,
  isPublished = false,
} = {}) {
  const host = !!isHost;
  const published = !!isPublished;
  const listVisible = shouldShowListInOpenGames({ isHost: host, isPublished: published });
  return {
    unlist: {
      action: 'unlist',
      label: LOBBY_UNLIST_LABEL,
      visible: host && published && !listVisible,
    },
    mainMenu: {
      action: 'main-menu',
      label: LOBBY_MAIN_MENU_LABEL,
      visible: true,
    },
    list: {
      action: 'publish',
      label: LOBBY_LIST_LABEL,
      visible: listVisible,
    },
  };
}

// One listing button, or none. Callers pass the snapshot's isPublished
// (not a click-local flag) so another tab's list/unlist wins on the next paint.
export function lobbyListingButtons({
  isHost = false,
  isPublished = false,
} = {}) {
  const chrome = resolveLobbyRoomChrome({ isHost, isPublished });
  const buttons = [];
  if (chrome.list.visible) {
    buttons.push({ action: chrome.list.action, label: chrome.list.label });
  } else if (chrome.unlist.visible) {
    buttons.push({ action: chrome.unlist.action, label: chrome.unlist.label });
  }
  return {
    buttons,
    mainMenuLabel: chrome.mainMenu.label,
    mainMenuVisible: chrome.mainMenu.visible,
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
