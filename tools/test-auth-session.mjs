// Issue 9.20.26.01: return-to-auth is a real session or a clean Sign In.
// Never "Player" / non-player zombie. Persistence must not sign out on resume.
// Run: node tools/test-auth-session.mjs

import { readFileSync } from 'node:fs';
import { GAME_VERSION } from '../src/version.js';
import {
  emailLocalPart,
  formatWelcomeEmail,
  formatWelcomeName,
  isGenericDisplayName,
  isRealAuthIdentity,
  isZombieAuthIdentity,
  resolveAuthSurface,
  resolveSessionIdentity,
  shouldForceReauthOnResume,
  shouldKeepSessionOnTabReturn,
  shouldRefreshTokenOnResume,
  shouldShowSignInFormForIdentity,
} from '../src/multiplayer/authSession.js';
import { shouldShowSignInForm, shouldSignOutOnBackground } from '../src/multiplayer/presencePolicy.js';

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

check('stamp is dual-path.15', GAME_VERSION === 'V2.81.57-dual-path.15');
check('email local-part', emailLocalPart('rob@example.com') === 'rob');
check('generic Player', isGenericDisplayName('Player') && isGenericDisplayName('non-player'));
check('real name is not generic', isGenericDisplayName('Robert007') === false);

const zombie = resolveSessionIdentity({
  id: 'uid1',
  displayName: 'Player',
});
check('zombie has no invented Player name', zombie.displayName === null);
check('uid+Player is not a real session', isRealAuthIdentity(zombie) === false);
check('uid+Player is a zombie', isZombieAuthIdentity({ id: 'uid1', displayName: 'Player' }) === true);

const restored = resolveSessionIdentity({
  id: 'uid2',
  email: 'rob@example.com',
  displayName: 'Player',
});
check('email beats Player fallback', restored.displayName === 'rob');
check('email session is real', isRealAuthIdentity(restored) === true);
check('welcome is rob not Player', formatWelcomeName(restored) === 'rob');
check('welcome email shown', formatWelcomeEmail(restored) === 'rob@example.com');

const named = resolveSessionIdentity({
  id: 'uid3',
  email: 'rob@example.com',
  displayName: '',
  storedDisplayName: 'Robert007',
});
check('Firestore name wins over email prefix', named.displayName === 'Robert007');

check('not ready → restoring', resolveAuthSurface({ authReady: false, user: null }) === 'restoring');
check('ready + zombie → signin', resolveAuthSurface({
  authReady: true, user: { id: 'x', displayName: 'Player' },
}) === 'signin');
check('ready + real → session', resolveAuthSurface({
  authReady: true, user: restored,
}) === 'session');
check('ready + empty → signin', resolveAuthSurface({ authReady: true, user: null }) === 'signin');

check('Sign In waits for restore', shouldShowSignInForm({ authReady: false, userPresent: false }) === false);
check('Sign In hidden for real user', shouldShowSignInForm({
  authReady: true, userPresent: true, user: restored,
}) === false);
check('Sign In shown for zombie after ready', shouldShowSignInForm({
  authReady: true, userPresent: true, user: { id: 'x', displayName: 'Player' },
}) === true);
check('identity helper matches policy', shouldShowSignInFormForIdentity({
  authReady: true, user: { id: 'x', displayName: 'Player' }, userPresent: true,
}) === true);

check('background never signs out', shouldSignOutOnBackground({ event: 'pageshow' }) === false);
check('resume does not force re-auth', shouldForceReauthOnResume() === false);
check('tab return keeps session', shouldKeepSessionOnTabReturn() === true);
check('quiet refresh on pageshow / visible / online',
  shouldRefreshTokenOnResume({ event: 'pageshow' })
  && shouldRefreshTokenOnResume({ event: 'visibility-visible' })
  && shouldRefreshTokenOnResume({ event: 'online' }));

const authSrc = readFileSync(new URL('../src/multiplayer/auth.js', import.meta.url), 'utf8');
const lobbySrc = readFileSync(new URL('../src/ui/multiplayerLobby.js', import.meta.url), 'utf8');
const screenSrc = readFileSync(new URL('../src/ui/authScreen.js', import.meta.url), 'utf8');
const threeSrc = readFileSync(new URL('../src/map/threeMpSession.js', import.meta.url), 'utf8');
const chromeSrc = readFileSync(new URL('../src/map/threeMapChrome.js', import.meta.url), 'utf8');

check('AuthManager never invents Player literal', !authSrc.includes("|| 'Player'"));
check('Classic welcome uses formatWelcomeName', lobbySrc.includes('formatWelcomeName'));
check('Classic welcome dropped Player fallback', !lobbySrc.includes("|| 'Player'"));
check('AuthScreen uses resolveAuthSurface', screenSrc.includes('resolveAuthSurface'));
check('Experimental waits whenReady', threeSrc.includes('whenReady') && threeSrc.includes('restoreSession'));
check('Experimental identity strip', chromeSrc.includes('data-auth-surface') && chromeSrc.includes('mp-signout'));
check('welcome never returns Player for empty', formatWelcomeName(null) === null);
const mainSrc = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
check('Classic resumes on network back', mainSrc.includes("addEventListener('online'"));
check('Experimental resumes on network back', threeSrc.includes("addEventListener('online'"));
check('quiet refresh rehydrates identity', authSrc.includes('this._hydrateIdentity(live)'));

console.log(failures === 0 ? '\nALL AUTH SESSION CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
