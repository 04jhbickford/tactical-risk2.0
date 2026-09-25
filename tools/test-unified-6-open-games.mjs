// V2.81.57-unified.13 — 9.23.26.01 Open Games list after Main Menu.
// Create + list, Main Menu, Open Games must be bars only.
// A bar click opens a waiting lobby. The map must not auto-enter.
// Run: node tools/test-unified-6-open-games.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const {
  resolveOpenGamesEntry,
  resolveOpenGamesRowEntry,
  shouldStayOnOpenGamesList,
  resolvePlayOnlineDestination,
  shouldAutoResumeLastMatch,
  resolveResumeFailureView,
} = await import(pathToFileURL(join(root, 'src/multiplayer/lastMatch.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

console.log('=== V2.81.57-unified.13 Open Games list (9.23.26.01) ===');
check('GAME_VERSION is V2.81.57-unified.13', GAME_VERSION === 'V2.81.57-unified.13');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

const html = readFileSync(join(root, 'index.html'), 'utf8');
check('index.html meta stamp is unified.8', html.includes('content="V2.81.57-unified.13"'));
check('index.html lockStamp is unified.8', html.includes("var LOCKED = 'V2.81.57-unified.13'"));
check('index.html __TR_GAME_VERSION is unified.8', html.includes("window.__TR_GAME_VERSION = 'V2.81.57-unified.13'"));
check('main.js module cache-bust is unified.8', html.includes('src/main.js?v=V2.81.57-unified.13'));

console.log('=== Open Games entry never auto-enters ===');
const contexts = [
  {},
  { inGameSession: true },
  { liveLobbyWaiting: true, lastMatch: { lobbyCode: 'TXVKJB' } },
  { inGameSession: true, lastMatch: { gameId: 'game_live', lobbyCode: 'TXVKJB' } },
  {
    inGameSession: true,
    liveLobbyWaiting: true,
    lastMatch: { gameId: 'game_live', lobbyCode: 'TXVKJB' },
  },
];
for (const ctx of contexts) {
  const entry = resolveOpenGamesEntry(ctx);
  check(`list only (${JSON.stringify(ctx)})`,
    entry.screen === 'browse'
    && entry.autoEnterMap === false
    && entry.autoEnterLobby === false
    && entry.clearInGameView === true
    && entry.disconnectLobbyView === true);
}

check('open-games lock holds', shouldStayOnOpenGamesList({ openGamesList: true }) === true);
check('lock is off when not on the list', shouldStayOnOpenGamesList({}) === false);
check('lock is off when the flag is false', shouldStayOnOpenGamesList({ openGamesList: false }) === false);

console.log('=== bar click ===');
check('listed waiting bar → lobby chrome',
  resolveOpenGamesRowEntry({ kind: 'lobby', status: 'waiting' }).screen === 'lobby'
  && resolveOpenGamesRowEntry({ kind: 'lobby', status: 'waiting' }).action === 'open-lobby');
check('in-progress bar → map only as that click',
  resolveOpenGamesRowEntry({
    kind: 'game', status: 'active', stateVersion: 4, hasState: true,
  }).screen === 'map');
check('waiting game doc on the list is still a lobby',
  resolveOpenGamesRowEntry({ kind: 'game', status: 'waiting' }).screen === 'lobby');

console.log('=== Main Menu then Play Online ===');
check('explicit Main Menu does not resume map or room',
  resolvePlayOnlineDestination({
    explicitMainMenu: true,
    signedIn: true,
    lastMatch: { gameId: 'game_live', lobbyCode: 'TXVKJB' },
  }).screen === 'menu'
  && resolvePlayOnlineDestination({
    explicitMainMenu: true,
    signedIn: true,
    lastMatch: { gameId: 'game_live', lobbyCode: 'TXVKJB' },
  }).autoEnterMap === false
  && resolvePlayOnlineDestination({
    explicitMainMenu: true,
    signedIn: true,
    lastMatch: { lobbyCode: 'TXVKJB' },
  }).autoEnterLobby === false);
check('cold Play Online still resumes a started match',
  resolvePlayOnlineDestination({
    explicitMainMenu: false,
    signedIn: true,
    lastMatch: { gameId: 'game_live', lobbyCode: 'CEVX6F' },
  }).screen === 'resume-map'
  && shouldAutoResumeLastMatch({
    signedIn: true,
    lastMatch: { gameId: 'game_live' },
  }) === true);
check('cold Play Online can still restore a waiting room',
  resolvePlayOnlineDestination({
    explicitMainMenu: false,
    signedIn: true,
    lastMatch: { lobbyCode: 'TXVKJB' },
  }).screen === 'lobby'
  && resolveResumeFailureView({
    resumed: false,
    lastMatch: { lobbyCode: 'TXVKJB' },
  }) === 'lobby');

console.log('=== wiring ===');
{
  const lobby = readFileSync(join(root, 'src/ui/multiplayerLobby.js'), 'utf8');
  const main = readFileSync(join(root, 'src/main.js'), 'utf8');
  const local = readFileSync(join(root, 'src/ui/lobby.js'), 'utf8');
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  const stayAt = lobby.indexOf('shouldStayOnOpenGamesList');
  const startAt = lobby.indexOf("lobby?.status === 'starting'");
  check('snapshot lock is before starting-game map entry', stayAt !== -1 && startAt !== -1 && stayAt < startAt);
  check('Open Games card calls the list helper', lobby.includes('_showOpenGamesList'));
  check('listed bar uses lobby row entry', lobby.includes("resolveOpenGamesRowEntry({ kind: 'lobby', status: 'waiting' })"));
  check('Main Menu reports main-menu and does not unlist',
    lobby.includes("this.onBack('main-menu')")
    && lobby.includes('disconnectFromLobby({ notify: false })'));
  check('main treats main-menu as the local home flag',
    main.includes("action === 'main-menu'")
    && main.includes('explicitMainMenu = true')
    && main.includes('resolvePlayOnlineDestination'));
  check('Play Online does not hide the home overlay before the callback',
    !/data-action="online-play"[\s\S]{0,220}this\.hide\(\)/.test(local));
  check('restore does not hide the menu before hydrate',
    !/const restoreLiveLobbyOrGame[\s\S]{0,280}lobby\.hide\(\)/.test(main));
  check('open games chrome hides the canvas',
    css.includes('html.tr-open-games #mapCanvas')
    && css.includes('tr-open-games'));
}

if (failures) {
  console.error(`\n${failures} FAIL`);
  process.exit(1);
}
console.log('\nPASS');
