// V2.81.57-unified.15 — mixed-version refresh banner.
// F1: unified.14.1's own compareGameVersions, loaded from 6d0796f1, sees a
// .15-written game doc as newer and fires version_outdated.
// F2: this build orders the full unified release, and a draft refusal
// uses the same Refresh banner.
// Run: node tools/test-compat-version.mjs

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const MAIN = '6d0796f1b5c6500157cbffcdc25ba1c7aa5970bc';

const {
  GAME_VERSION,
  compatClientVersion,
  compareGameVersions,
  versionRefreshReason,
} = await import(pathToFileURL(join(root, 'src/version.js')));
const { DRAFT_MIN_CLIENT } = await import(pathToFileURL(join(root, 'src/state/territoryDraft.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

function gitShow(spec) {
  return execFileSync('git', ['show', spec], { cwd: root, encoding: 'utf8' });
}

const oldVersionSrc = gitShow(`${MAIN}:src/version.js`);
const oldSyncSrc = gitShow(`${MAIN}:src/multiplayer/syncManager.js`);
const dir = mkdtempSync(join(tmpdir(), 'tr-unified-14-1-'));
writeFileSync(join(dir, 'version.js'), oldVersionSrc);
const oldVersion = await import(pathToFileURL(join(dir, 'version.js')));

const methodStart = oldSyncSrc.indexOf('  _checkRemoteVersion(newData) {');
const methodEnd = oldSyncSrc.indexOf('  // Set whether this client is the host', methodStart);
const method = oldSyncSrc.slice(methodStart, methodEnd).trim();
const Probe = new Function('compareGameVersions', 'GAME_VERSION', `
  return class Probe {
    constructor() {
      this._versionOutdatedNotified = false;
      this.events = [];
    }
    _notifyListeners(event, data) { this.events.push({ event, data }); }
    ${method}
  };
`)(oldVersion.compareGameVersions, oldVersion.GAME_VERSION);

console.log('=== V2.81.57-unified.15 compat version ===');
check('display stamp stays V2.81.57-unified.15', GAME_VERSION === 'V2.81.57-unified.15');
check('F1 loaded .14.1 GAME_VERSION', oldVersion.GAME_VERSION === 'V2.81.57-unified.14.1');
check('F1 .14.1 comparator is the major.minor parser',
  oldVersionSrc.includes('/^V?(\\d+)\\.(\\d+)/')
  && !oldVersionSrc.includes('unifiedReleaseParts'));
check('F1 .14.1 banner reads clientVersion', method.includes('newData?.clientVersion')
  && method.includes("'version_outdated'"));

const written = {
  clientVersion: compatClientVersion(GAME_VERSION),
  state: {
    phase: 'territory_draft',
    gameOptions: { techAcquisition: 'keep', territorySetup: 'draft' },
  },
  protectedGameOptions: { techAcquisition: 'keep', territorySetup: 'draft' },
};
check('F1 compat stamp is V2.82-unified.15', written.clientVersion === 'V2.82-unified.15');
check('F1 display stamp does not look newer to .14.1',
  oldVersion.compareGameVersions(GAME_VERSION, oldVersion.GAME_VERSION) === 0);
check('F1 compat stamp looks newer to .14.1',
  oldVersion.compareGameVersions(written.clientVersion, oldVersion.GAME_VERSION) > 0);

const probe = new Probe();
probe._checkRemoteVersion(written);
check('F1 .14.1 refresh banner fires on a .15 doc',
  probe.events.length === 1
  && probe.events[0].event === 'version_outdated'
  && probe.events[0].data.remoteVersion === 'V2.82-unified.15'
  && probe.events[0].data.localVersion === oldVersion.GAME_VERSION);

const quiet = new Probe();
quiet._checkRemoteVersion({ clientVersion: GAME_VERSION, state: written.state });
check('F1 display stamp alone does not fire the .14.1 banner', quiet.events.length === 0);

check('F2 unified.16 prompts a unified.15 tab',
  compareGameVersions(compatClientVersion('V2.81.57-unified.16'), GAME_VERSION) > 0);
check('F2 unified.15.1 prompts a unified.15 tab',
  compareGameVersions('V2.82-unified.15.1', GAME_VERSION) > 0);
check('F2 our own compat write does not prompt',
  compareGameVersions(written.clientVersion, GAME_VERSION) === 0);
check('F2 numeric versions still order by major.minor',
  compareGameVersions('V2.54', 'V2.55') < 0
  && compareGameVersions('V2.9', 'V2.10') < 0
  && compareGameVersions('banana', GAME_VERSION) < 0);
check('F2 draft refusal shows the refresh banner',
  versionRefreshReason('draft_client_blocked', { minClientVersion: DRAFT_MIN_CLIENT }) === DRAFT_MIN_CLIENT);
check('F2 version_outdated still shows the refresh banner',
  versionRefreshReason('version_outdated', { remoteVersion: 'V2.82-unified.16' }) === 'V2.82-unified.16');
check('F2 other events do not show the banner', versionRefreshReason('state_updated', {}) === '');

const syncNow = readFileSync(join(root, 'src/multiplayer/syncManager.js'), 'utf8');
const mainNow = readFileSync(join(root, 'src/main.js'), 'utf8');
check('F1 writer stores the compat clientVersion',
  syncNow.includes('clientVersion: compatClientVersion(GAME_VERSION)'));
check('F2 main.js shows the banner for a draft refusal',
  mainNow.includes('versionRefreshReason(event, data)')
  && mainNow.includes('showVersionBanner(refreshReason)'));

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll compat version checks passed');
