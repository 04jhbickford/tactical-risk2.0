// Auth return / persistence policy. No Firebase here — AuthManager, AuthScreen,
// Classic lobby, Experimental MP, and harnesses share one identity rule:
// either a real restored session or a clean Sign In form. Never "Player".

export const GENERIC_PLAYER_LABEL = 'Player';

const GENERIC_NAME = /^(player|unknown|non[-\s]?player|anonymous|guest)$/i;

export function emailLocalPart(email) {
  const e = String(email || '').trim();
  const at = e.indexOf('@');
  if (at <= 0) return '';
  return e.slice(0, at);
}

export function isGenericDisplayName(name) {
  const n = String(name || '').trim();
  if (!n) return true;
  return GENERIC_NAME.test(n);
}

export function resolveSessionIdentity(raw = {}) {
  const id = raw.id || raw.uid || null;
  const email = raw.email ? String(raw.email).trim() : '';
  const phoneNumber = raw.phoneNumber ? String(raw.phoneNumber).trim() : '';
  const fromAuth = String(raw.displayName || '').trim();
  const fromStore = String(raw.storedDisplayName || '').trim();
  const fromEmail = emailLocalPart(email);

  let displayName = '';
  if (fromAuth && !isGenericDisplayName(fromAuth)) displayName = fromAuth;
  else if (fromStore && !isGenericDisplayName(fromStore)) displayName = fromStore;
  else if (fromEmail) displayName = fromEmail;
  else if (phoneNumber) displayName = phoneNumber;
  else if (fromAuth && !isGenericDisplayName(fromAuth)) displayName = fromAuth;

  return {
    id: id || null,
    email: email || null,
    phoneNumber: phoneNumber || null,
    displayName: displayName || null,
  };
}

export function isRealAuthIdentity(user) {
  if (!user?.id) return false;
  if (user.email) return true;
  if (user.phoneNumber) return true;
  if (user.displayName && !isGenericDisplayName(user.displayName)) return true;
  return false;
}

export function isZombieAuthIdentity(user) {
  if (!user) return false;
  if (!user.id && !user.email && !user.displayName && !user.phoneNumber) return false;
  return !isRealAuthIdentity(user);
}

// Return-to-auth/lobby: restoring | session | signin.
// session = real displayName/email/phone. signin = clean form (no leftover Player).
export function resolveAuthSurface({
  authReady = false,
  user = null,
} = {}) {
  if (!authReady) return 'restoring';
  if (isRealAuthIdentity(user)) return 'session';
  return 'signin';
}

export function formatWelcomeName(user) {
  if (!isRealAuthIdentity(user)) return null;
  const ident = resolveSessionIdentity(user);
  return ident.displayName || ident.email || ident.phoneNumber || null;
}

export function formatWelcomeEmail(user) {
  if (!isRealAuthIdentity(user)) return null;
  return user.email || user.phoneNumber || null;
}

export function shouldShowSignInFormForIdentity({
  authReady = false,
  user = null,
  userPresent = false,
} = {}) {
  if (!authReady) return false;
  if (isRealAuthIdentity(user)) return false;
  if (isZombieAuthIdentity(user)) return true;
  return !userPresent;
}

export function shouldRefreshTokenOnResume({ event } = {}) {
  return event === 'visibility-visible'
    || event === 'pageshow'
    || event === 'pageshow-persisted'
    || event === 'resume'
    || event === 'visibilitychange'
    || event === 'online'
    || event === 'focus';
}

export function shouldForceReauthOnResume() {
  return false;
}

export function shouldClearUserOnSignOut() {
  return true;
}

export function shouldHydrateIdentityFromUserDoc() {
  return true;
}

export function shouldKeepSessionOnTabReturn() {
  return true;
}

export function resumeAuthEvent(visibilityState, { persisted = false } = {}) {
  if (persisted) return 'pageshow-persisted';
  if (visibilityState === 'online') return 'online';
  if (visibilityState === 'focus') return 'focus';
  if (visibilityState === 'visible') return 'visibility-visible';
  if (visibilityState === 'hidden') return 'visibility-hidden';
  return 'pageshow';
}
