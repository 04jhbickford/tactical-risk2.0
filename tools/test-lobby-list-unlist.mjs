// V2.81.57-unified.20.2 — L1: a lobby shows List or Unlist, never both.
// Host unlisted, host listed, joiner, and a snapshot flip from another client.
// Run: node tools/test-lobby-list-unlist.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const {
  lobbyListingButtons,
  lobbyChromeStatusAfter,
  resolveLobbyRoomChrome,
  shouldShowListInOpenGames,
  LOBBY_LIST_LABEL,
  LOBBY_UNLIST_LABEL,
  LOBBY_MAIN_MENU_LABEL,
} = await import(pathToFileURL(join(root, 'src/multiplayer/lobbyStart.js')));

const lobbySrc = readFileSync(join(root, 'src/ui/multiplayerLobby.js'), 'utf8');

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

check('stamp is unified.21', GAME_VERSION === 'V2.81.57-unified.30');

function names(snapshot, isHost) {
  return lobbyListingButtons({
    isHost,
    isPublished: !!snapshot?.isPublished,
  }).buttons.map((b) => b.label);
}

function exclusive(labels) {
  const list = labels.includes(LOBBY_LIST_LABEL);
  const unlist = labels.includes(LOBBY_UNLIST_LABEL);
  return !(list && unlist) && labels.length <= 1;
}

{
  const hostUnlisted = names({ isPublished: false }, true);
  check('host unlisted sees only List in Open Games',
    hostUnlisted.length === 1 && hostUnlisted[0] === LOBBY_LIST_LABEL, hostUnlisted);
  check('host unlisted chrome matches that single button',
    resolveLobbyRoomChrome({ isHost: true, isPublished: false }).list.visible === true
    && resolveLobbyRoomChrome({ isHost: true, isPublished: false }).unlist.visible === false
    && shouldShowListInOpenGames({ isHost: true, isPublished: false }) === true);
}

{
  const hostListed = names({ isPublished: true }, true);
  check('host listed sees only Unlist Game',
    hostListed.length === 1 && hostListed[0] === LOBBY_UNLIST_LABEL, hostListed);
  check('host listed chrome hides List',
    resolveLobbyRoomChrome({ isHost: true, isPublished: true }).unlist.visible === true
    && resolveLobbyRoomChrome({ isHost: true, isPublished: true }).list.visible === false
    && shouldShowListInOpenGames({ isHost: true, isPublished: true }) === false);
}

{
  const joinerUnlisted = names({ isPublished: false }, false);
  const joinerListed = names({ isPublished: true }, false);
  check('joiner sees neither button when the room is unlisted',
    joinerUnlisted.length === 0, joinerUnlisted);
  check('joiner sees neither button when the room is listed',
    joinerListed.length === 0, joinerListed);
}

{
  const snap = { isPublished: false, id: 'lobby-other-tab' };
  check('snapshot starts unlisted for the host', names(snap, true)[0] === LOBBY_LIST_LABEL);
  snap.isPublished = true;
  check('another client listing the room flips the host to Unlist Game',
    names(snap, true).length === 1 && names(snap, true)[0] === LOBBY_UNLIST_LABEL);
  snap.isPublished = false;
  check('another client unlisting the room flips the host back to List',
    names(snap, true).length === 1 && names(snap, true)[0] === LOBBY_LIST_LABEL);
  check('the same flip does not give the joiner a button',
    names(snap, false).length === 0 && names({ isPublished: true }, false).length === 0);
}

{
  const samples = [
    { isHost: true, isPublished: false },
    { isHost: true, isPublished: true },
    { isHost: false, isPublished: false },
    { isHost: false, isPublished: true },
  ];
  check('every sample is exclusive', samples.every((s) => exclusive(names(s, s.isHost))));
  check('Main Menu stays on every sample and does not write the flag', samples.every((s) => {
    const row = lobbyListingButtons(s);
    const home = lobbyChromeStatusAfter({
      action: 'main-menu',
      isPublished: s.isPublished,
      isHost: s.isHost,
    });
    return row.mainMenuVisible
      && row.mainMenuLabel === LOBBY_MAIN_MENU_LABEL
      && home.navigate === 'main'
      && home.changed === false
      && home.isPublished === s.isPublished;
  }));
}

check('room paint reads one snapshot for both buttons',
  lobbySrc.includes('lobbyListingButtons')
  && lobbySrc.includes('shouldShowListInOpenGames')
  && lobbySrc.includes('roomChrome.unlist.label')
  && lobbySrc.includes('roomChrome.list.label')
  && lobbySrc.includes('roomChrome.mainMenu.label')
  && lobbySrc.includes('publishedNow'));
check('List and Unlist repaint from the live lobby after the click',
  lobbySrc.includes("btn.textContent = 'Listing…'")
  && lobbySrc.includes("btn.textContent = 'Unlisting…'")
  && lobbySrc.includes('publishLobby()')
  && lobbySrc.includes('unlistLobby()'));

const unlistUi = lobbySrc.slice(
  lobbySrc.indexOf('[data-action="unlist"]'),
  lobbySrc.indexOf('[data-action="main-menu"]'),
);
check('Unlist still stays in the room',
  unlistUi.includes('unlistLobby()') && unlistUi.includes("this.mode = 'lobby'"));
const menuUi = lobbySrc.slice(
  lobbySrc.indexOf('[data-action="main-menu"]'),
  lobbySrc.indexOf('[data-action="back-to-browse"]'),
);
check('Main Menu still leaves the view and does not unlist',
  menuUi.includes('disconnectFromLobby({ notify: false })')
  && !menuUi.includes('unlistLobby('));

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nlobby list/unlist checks passed');
