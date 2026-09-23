// 9.20.26.08 / .09 — host Back from a listed waiting lobby, and refresh
// must not snap back into the room or auto-open a started map.
// Shared lastMatch helpers + Classic / Experimental wiring.
// Run: node tools/test-lobby-nav.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const {
  shouldAutoResumeLastMatch,
  shouldLeaveLobbyView,
  shouldNavigateToHome,
  shouldHonorLobbyBack,
  resolveLobbyBackTarget,
  shouldForceLobbyRoomOnSnapshot,
  shouldRestoreLobbyAfterDisconnect,
  resolveLobbyViewAfterLoss,
  resolveResumeFailureView,
} = await import(pathToFileURL(join(root, 'src/multiplayer/lastMatch.js')));
const { shouldShowListInOpenGames } =
  await import(pathToFileURL(join(root, 'src/multiplayer/lobbyStart.js')));
const {
  createSoloLobby,
  applyLobbyAction,
  setLobbyScreen,
} = await import(pathToFileURL(join(root, 'src/map/threeSoloLobby.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

console.log('=== V2.81.57-unified.7 lobby nav ===');
check('GAME_VERSION is V2.81.57-unified.7', GAME_VERSION === 'V2.81.57-unified.7');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== 9.20.26.08 explicit Back ===');
check('Back is honor-able', shouldHonorLobbyBack({ explicitBack: true }) === true);
check('flicker is not Back', shouldHonorLobbyBack({}) === false);
check('published Classic Back → Open Games',
  resolveLobbyBackTarget({ published: true, hasBrowse: true }) === 'browse');
check('Experimental / unpublished Back → Play Online',
  resolveLobbyBackTarget({ published: false, hasBrowse: false }) === 'online');
check('explicit Back leaves the VIEW',
  shouldLeaveLobbyView({ explicitBack: true }) === true
  && shouldLeaveLobbyView({ explicitBrowse: true }) === true
  && shouldLeaveLobbyView({ snapshotMissing: true }) === false);
check('disconnect after Back does not restore',
  shouldRestoreLobbyAfterDisconnect({ explicitBrowse: true }) === false
  && shouldRestoreLobbyAfterDisconnect({ explicitBack: true }) === false
  && shouldRestoreLobbyAfterDisconnect({}) === true);
check('snapshot does not force room while browsing away',
  shouldForceLobbyRoomOnSnapshot({ browsingAway: true, lobbyPresent: true }) === false);
check('snapshot still forces room when not browsing',
  shouldForceLobbyRoomOnSnapshot({ browsingAway: false, lobbyPresent: true }) === true);
check('game starting still forces room even if browsing',
  shouldForceLobbyRoomOnSnapshot({
    browsingAway: true,
    lobbyPresent: true,
    gameStarting: true,
  }) === true);
check('explicit Back goes home even with remembered lobby',
  shouldNavigateToHome({
    explicitExit: true,
    lastMatch: { lobbyCode: '6V9ZXK' },
  }) === true);
check('flicker still does not dump home',
  shouldNavigateToHome({ lastMatch: { lobbyCode: '6V9ZXK' } }) === false);
check('view-after-loss honors Back / Browse',
  resolveLobbyViewAfterLoss({
    explicitBrowse: true,
    lastMatch: { lobbyCode: '6V9ZXK' },
  }) === 'browse'
  && resolveLobbyViewAfterLoss({
    explicitBack: true,
    lastMatch: { lobbyCode: '6V9ZXK' },
  }) === 'home'
  && resolveLobbyViewAfterLoss({
    lastMatch: { lobbyCode: '6V9ZXK' },
  }) === 'lobby');

console.log('=== 9.20.26.09 refresh / reopen ===');
check('waiting lobbyCode does not auto-resume a map',
  shouldAutoResumeLastMatch({
    signedIn: true,
    lastMatch: { lobbyCode: '6V9ZXK' },
  }) === false);
check('started gameId still auto-resumes (B38)',
  shouldAutoResumeLastMatch({
    signedIn: true,
    lastMatch: { gameId: 'game_live', lobbyCode: 'CEVX6F' },
  }) === true);
check('signed-out / Exit still do not auto-resume',
  shouldAutoResumeLastMatch({
    signedIn: false,
    lastMatch: { gameId: 'game_live' },
  }) === false
  && shouldAutoResumeLastMatch({
    signedIn: true,
    lastMatch: { gameId: 'game_live' },
    explicitExit: true,
  }) === false);
check('Play Online can still restore a waiting room',
  resolveResumeFailureView({
    resumed: false,
    lastMatch: { lobbyCode: '6V9ZXK' },
  }) === 'lobby');

console.log('=== Bastion list-in-open-games first click ===');
check('host unpublished sees List',
  shouldShowListInOpenGames({ isHost: true, isPublished: false }) === true);
check('first successful publish hides List',
  shouldShowListInOpenGames({ isHost: true, isPublished: true }) === false);
check('guest never sees List',
  shouldShowListInOpenGames({ isHost: false, isPublished: false }) === false);

console.log('=== Experimental three chrome lobby ===');
{
  const lobby = createSoloLobby({ risk: { factions: [{ id: 'Russians', name: 'Russians' }] } });
  lobby.screen = 'room';
  applyLobbyAction(lobby, 'screen', 'online');
  check('room → online marks browsingAway',
    lobby.screen === 'online' && lobby.browsingAway === true);
  applyLobbyAction(lobby, 'screen', 'main');
  check('online → main keeps browsingAway',
    lobby.screen === 'main' && lobby.browsingAway === true);
  setLobbyScreen(lobby, 'room');
  check('re-entering room clears browsingAway',
    lobby.screen === 'room' && lobby.browsingAway === false);
}

console.log('=== dual-fork wiring ===');
{
  const classic = readFileSync(join(root, 'src/ui/multiplayerLobby.js'), 'utf8');
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  const threeBoot = readFileSync(join(root, 'src/map/threeSoloBoot.js'), 'utf8');
  const threeMp = readFileSync(join(root, 'src/map/threeMpSession.js'), 'utf8');
  const lobbyMgr = readFileSync(join(root, 'src/multiplayer/lobbyManager.js'), 'utf8');
  check('Classic Back disconnects silently and stays on browse',
    classic.includes('_browsingAway = true')
    && classic.includes("disconnectFromLobby({ notify: false })")
    && classic.includes('resolveLobbyBackTarget')
    && classic.includes('shouldHonorLobbyBack'));
  check('Classic snapshot restore is gated by browsingAway',
    classic.includes('explicitBrowse: !!this._browsingAway')
    && classic.includes('shouldForceLobbyRoomOnSnapshot'));
  check('boot auto-resume is gameId-only',
    mainSrc.includes('const bootResume = shouldAutoResumeLastMatch')
    && mainSrc.includes('if (isFirebaseConfigured() && bootResume)'));
  check('Experimental Back detaches without snap-to-room',
    threeBoot.includes('shouldForceLobbyRoomOnSnapshot')
    && threeBoot.includes('mp.detachLobby()')
    && threeBoot.includes('leavingRoom')
    && threeMp.includes('disconnectFromLobby({ notify: false })'));
  check('lobbyManager disconnect can stay silent',
    lobbyMgr.includes('disconnectFromLobby({ notify = true }'));
  const chrome = readFileSync(join(root, 'src/map/threeMapChrome.js'), 'utf8');
  check('first List click patches locally on both forks',
    lobbyMgr.includes('_patchCurrentLobby(lobbyId, { isPublished: true })')
    && classic.includes('shouldShowListInOpenGames')
    && chrome.includes('data-lobby="mp-publish"')
    && threeMp.includes('publishRoom')
    && threeBoot.includes("kind === 'mp-publish'"));
}

if (failures) {
  console.error(`\n${failures} FAIL`);
  process.exit(1);
}
console.log('\nPASS');
