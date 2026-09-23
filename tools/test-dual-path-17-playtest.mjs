// V2.81.57-unified.6 — Unlist Game vs Main Menu (9.21.26.13).
// Unlist writes isPublished false (drops Open Games). Main Menu navigates
// and leaves the listed flag alone. Both forks share the helper.
// Run: node tools/test-dual-path-17-playtest.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const {
  lobbyChromeStatusAfter,
  lobbyAppearsInOpenGames,
  resolveLobbyRoomChrome,
  LOBBY_UNLIST_LABEL,
  LOBBY_MAIN_MENU_LABEL,
  shouldShowListInOpenGames,
} = await import(pathToFileURL(join(root, 'src/multiplayer/lobbyStart.js')));
const { resolveMyGamesEntryAction } = await import(pathToFileURL(join(root, 'src/multiplayer/lastMatch.js')));
const { UX_CLASSIC, UX_THREE, resolveUxMode, lobbyInterfaceChoices, applyUxQuery } =
  await import(pathToFileURL(join(root, 'src/map/presentationMode.js')));

const html = readFileSync(join(root, 'index.html'), 'utf8');
const classic = readFileSync(join(root, 'src/ui/multiplayerLobby.js'), 'utf8');
const chrome = readFileSync(join(root, 'src/map/threeMapChrome.js'), 'utf8');
const boot = readFileSync(join(root, 'src/map/threeSoloBoot.js'), 'utf8');
const mp = readFileSync(join(root, 'src/map/threeMpSession.js'), 'utf8');
const mgr = readFileSync(join(root, 'src/multiplayer/lobbyManager.js'), 'utf8');
const lobbySrc = readFileSync(join(root, 'src/ui/lobby.js'), 'utf8');
const ping = readFileSync(join(root, 'src/multiplayer/discordTurnPing.js'), 'utf8');

assert.equal(GAME_VERSION, 'V2.81.57-unified.6');
assert.equal(SCHEMA_VERSION, 11);
assert.match(html, /content="V2\.81\.57-unified\.6"/);
assert.match(html, /__TR_GAME_VERSION = 'V2\.81\.57-unified\.6'/);

function listedRow() {
  return {
    isPublished: true,
    password: null,
    playerCount: 1,
    maxPlayers: 5,
    isOwnLobby: true,
  };
}

{
  const hostListed = resolveLobbyRoomChrome({ isHost: true, isPublished: true });
  assert.equal(hostListed.unlist.visible, true);
  assert.equal(hostListed.unlist.label, LOBBY_UNLIST_LABEL);
  assert.equal(hostListed.unlist.label, 'Unlist Game');
  assert.equal(hostListed.mainMenu.visible, true);
  assert.equal(hostListed.mainMenu.label, 'Main Menu');
  assert.equal(hostListed.list.visible, false);

  const hostHidden = resolveLobbyRoomChrome({ isHost: true, isPublished: false });
  assert.equal(hostHidden.unlist.visible, true);
  assert.equal(hostHidden.list.visible, true);
  assert.equal(shouldShowListInOpenGames({ isHost: true, isPublished: false }), true);

  const guest = resolveLobbyRoomChrome({ isHost: false, isPublished: true });
  assert.equal(guest.unlist.visible, false);
  assert.equal(guest.mainMenu.visible, true);
  assert.equal(guest.mainMenu.label, LOBBY_MAIN_MENU_LABEL);
  assert.equal(guest.list.visible, false);
}

{
  const unlisted = lobbyChromeStatusAfter({
    action: 'unlist',
    isPublished: true,
    isHost: true,
  });
  assert.equal(unlisted.allowed, true);
  assert.equal(unlisted.isPublished, false);
  assert.equal(unlisted.changed, true);
  assert.equal(unlisted.navigate, null, 'unlist does not leave the room UI');

  const already = lobbyChromeStatusAfter({
    action: 'mp-unlist',
    isPublished: false,
    isHost: true,
  });
  assert.equal(already.isPublished, false);
  assert.equal(already.changed, false);
  assert.equal(already.navigate, null);

  const guestUnlist = lobbyChromeStatusAfter({
    action: 'unlist',
    isPublished: true,
    isHost: false,
  });
  assert.equal(guestUnlist.allowed, false);
  assert.equal(guestUnlist.isPublished, true, 'guest unlist does not change listing');
  assert.equal(guestUnlist.navigate, null);
}

{
  const homeFromListed = lobbyChromeStatusAfter({
    action: 'main-menu',
    isPublished: true,
    isHost: true,
  });
  assert.equal(homeFromListed.navigate, 'main');
  assert.equal(homeFromListed.changed, false);
  assert.equal(homeFromListed.isPublished, true, 'Main Menu keeps a listed game listed');

  const homeFromHidden = lobbyChromeStatusAfter({
    action: 'mp-main-menu',
    isPublished: false,
    isHost: false,
  });
  assert.equal(homeFromHidden.navigate, 'main');
  assert.equal(homeFromHidden.changed, false);
  assert.equal(homeFromHidden.isPublished, false, 'Main Menu keeps an unlisted game unlisted');
}

{
  const open = listedRow();
  assert.equal(lobbyAppearsInOpenGames(open), true);
  const afterUnlist = lobbyChromeStatusAfter({
    action: 'unlist',
    isPublished: open.isPublished,
    isHost: true,
  });
  assert.equal(lobbyAppearsInOpenGames({ ...open, isPublished: afterUnlist.isPublished }), false);

  const afterMenu = lobbyChromeStatusAfter({
    action: 'main-menu',
    isPublished: true,
    isHost: true,
  });
  assert.equal(lobbyAppearsInOpenGames({ ...open, isPublished: afterMenu.isPublished }), true);
  const hiddenMenu = lobbyChromeStatusAfter({
    action: 'main-menu',
    isPublished: false,
    isHost: true,
  });
  assert.equal(lobbyAppearsInOpenGames({ ...open, isPublished: hiddenMenu.isPublished }), false);
}

assert.match(mgr, /async unlistLobby\(/);
assert.match(mgr, /isPublished:\s*false/);
assert.match(mgr, /lobbyAppearsInOpenGames/);
const unlistFn = mgr.slice(mgr.indexOf('async unlistLobby'), mgr.indexOf('async startGame'));
assert.match(unlistFn, /isPublished:\s*false/);
assert.doesNotMatch(unlistFn, /deleteDoc|leaveLobby/);

assert.match(classic, /data-action="unlist"/);
assert.match(classic, /data-action="main-menu"/);
assert.match(classic, /roomChrome\.unlist\.label/);
assert.match(classic, /roomChrome\.mainMenu\.label/);
assert.match(classic, /unlistLobby\(/);
assert.match(classic, /disconnectFromLobby\(\{ notify: false \}\)/);
assert.doesNotMatch(classic, /Leave Lobby/);
assert.doesNotMatch(classic, /data-action="leave"/);
const classicMain = classic.slice(
  classic.indexOf('[data-action="main-menu"]'),
  classic.indexOf('[data-action="back-to-browse"]'),
);
assert.match(classicMain, /disconnectFromLobby\(\{ notify: false \}\)/);
assert.doesNotMatch(classicMain, /unlistLobby\(/);

assert.match(chrome, /data-lobby="mp-unlist"/);
assert.match(chrome, /data-lobby="mp-main-menu"/);
assert.match(chrome, /roomChrome\.unlist\.label/);
assert.match(chrome, /roomChrome\.mainMenu\.label/);
assert.match(chrome, /data-lobby="mp-publish"/);
assert.match(boot, /kind === 'mp-unlist'/);
assert.match(boot, /kind === 'mp-main-menu'/);
assert.match(boot, /unlistRoom\(/);
assert.match(boot, /detachLobby\(\)/);
assert.match(mp, /async function unlistRoom/);
assert.match(mp, /unlistLobby\(/);

const bootMain = boot.slice(boot.indexOf("kind === 'mp-main-menu'"));
assert.doesNotMatch(bootMain.slice(0, 700), /unlistRoom\(/);
const bootUnlist = boot.slice(boot.indexOf("kind === 'mp-unlist'"), boot.indexOf("kind === 'mp-main-menu'"));
assert.doesNotMatch(bootUnlist, /detachLobby\(/);

assert.equal(resolveMyGamesEntryAction({ kind: 'lobby', status: 'waiting' }).action, 'open-lobby');
assert.equal(resolveMyGamesEntryAction({ kind: 'lobby', status: 'waiting' }).label, 'Resume lobby');
assert.doesNotMatch(lobbySrc, /data-action="ux-classic"/);
assert.doesNotMatch(lobbySrc, /data-action="ux-three"/);
assert.match(lobbySrc, /Interface Classic\|Experimental picker removed/);
assert.match(chrome, /lobbyInterfaceChoices\(UX_THREE\)/); // dead path ok
assert.match(boot, /navigateUxMode|bootThreeSolo/); // modules remain, not booted
assert.equal(resolveUxMode(''), UX_CLASSIC);
assert.equal(resolveUxMode('?ux=classic'), UX_CLASSIC);
assert.equal(resolveUxMode('?ux=three'), UX_CLASSIC);
const classicPick = lobbyInterfaceChoices(UX_CLASSIC);
const experimentalPick = lobbyInterfaceChoices(UX_THREE);
assert.equal(classicPick.classic, null);
assert.equal(classicPick.experimental, null);
assert.equal(experimentalPick.classic, null);
assert.equal(experimentalPick.experimental, null);
assert.doesNotMatch(applyUxQuery(UX_CLASSIC, 'https://tactical-risk20.vercel.app/?ux=classic'), /ux=classic|ux=three/);
assert.doesNotMatch(applyUxQuery(UX_THREE, 'https://tactical-risk20.vercel.app/?ux=classic'), /ux=three/);

assert.match(ping, /export function bindDiscordTurnPing/);
assert.doesNotMatch(ping, /DISCORD_TURN_PINGS_ENABLED\s*=\s*true/);

console.log('test-dual-path-17-playtest: PASS');
