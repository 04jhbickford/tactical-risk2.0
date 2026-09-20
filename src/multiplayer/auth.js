// Authentication Manager for Tactical Risk multiplayer
// Handles email/password and phone OTP authentication

import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signOut,
  onAuthStateChanged,
  updateProfile,
  RecaptchaVerifier
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFirebaseAuth, getFirebaseDb } from './firebase.js';
import {
  isRealAuthIdentity,
  resolveSessionIdentity,
  shouldClearUserOnSignOut,
  shouldHydrateIdentityFromUserDoc,
} from './authSession.js';

export class AuthManager {
  constructor() {
    this.auth = null;
    this.db = null;
    this.currentUser = null;
    this.confirmationResult = null;
    this.recaptchaVerifier = null;
    this._listeners = [];
    this._ready = false;
    this._readyPromise = null;
  }

  initialize() {
    this.auth = getFirebaseAuth();
    this.db = getFirebaseDb();

    if (!this.auth) {
      console.warn('Firebase Auth not available - multiplayer disabled');
      this._ready = true;
      return;
    }

    this._readyPromise = this._waitForAuthReady();

    // Apply the Firebase user immediately. A Firestore lastLogin write must
    // never block or wipe the restored session (V2.77 reload → Sign In).
    onAuthStateChanged(this.auth, (user) => {
      if (user) {
        this._applyFirebaseUser(user);
        this._hydrateIdentity(user).catch((err) => {
          console.warn('[Auth] identity hydrate failed — session kept', err);
        });
      } else if (this._ready) {
        this.currentUser = null;
      }
      this._notifyListeners();
    });
  }

  _applyFirebaseUser(user) {
    if (!user) {
      this.currentUser = null;
      return null;
    }
    const prev = this.currentUser?.id === user.uid ? this.currentUser : null;
    this.currentUser = resolveSessionIdentity({
      id: user.uid,
      email: user.email || prev?.email,
      displayName: user.displayName,
      phoneNumber: user.phoneNumber || prev?.phoneNumber,
      storedDisplayName: prev?.displayName,
    });
    return this.currentUser;
  }

  // Firestore users/{uid} often has the real displayName when the Auth
  // profile was never written (signup race). Never invent "Player".
  async _hydrateIdentity(user) {
    if (!shouldHydrateIdentityFromUserDoc() || !this.db || !user?.uid) {
      await this._updateUserDocument(user);
      return this.getUser();
    }
    try {
      const userRef = doc(this.db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      if (userDoc.exists()) {
        const data = userDoc.data() || {};
        this.currentUser = resolveSessionIdentity({
          id: user.uid,
          email: user.email || data.email,
          displayName: user.displayName,
          phoneNumber: user.phoneNumber || data.phoneNumber,
          storedDisplayName: data.displayName,
        });
        this._notifyListeners();
        if (
          data.displayName
          && !user.displayName
          && this.auth?.currentUser
        ) {
          updateProfile(this.auth.currentUser, { displayName: data.displayName }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[Auth] user doc read failed — session kept', err);
    }
    await this._updateUserDocument(user).catch((err) => {
      console.warn('[Auth] user doc update failed — session kept', err);
    });
    return this.getUser();
  }

  async _waitForAuthReady() {
    try {
      if (typeof this.auth.authStateReady === 'function') {
        await this.auth.authStateReady();
      }
    } catch (err) {
      console.warn('[Auth] authStateReady failed — using currentUser fallback', err);
    }
    if (this.auth.currentUser && !this.currentUser) {
      this._applyFirebaseUser(this.auth.currentUser);
    }
    this._ready = true;
    return this.getUser();
  }

  // Reload / version refresh must wait for IndexedDB restore before Sign In.
  async whenReady() {
    if (this._ready) return this.getUser();
    if (this._readyPromise) await this._readyPromise;
    this._ready = true;
    return this.getUser();
  }

  isAuthReady() {
    return this._ready === true;
  }

  // Subscribe to auth state changes
  subscribe(callback) {
    this._listeners.push(callback);
    // Immediately call with current state
    callback(this.getUser());
    return () => {
      this._listeners = this._listeners.filter(cb => cb !== callback);
    };
  }

  _notifyListeners() {
    const user = this.getUser();
    for (const cb of this._listeners) {
      cb(user);
    }
  }

  // Create or update user document in Firestore
  async _updateUserDocument(user) {
    if (!this.db) return;

    const userRef = doc(this.db, 'users', user.uid);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      // Update last login
      await setDoc(userRef, {
        lastLogin: serverTimestamp()
      }, { merge: true });
    } else {
      // Create new user document
      await setDoc(userRef, {
        email: user.email,
        displayName: resolveSessionIdentity({
          id: user.uid,
          email: user.email,
          displayName: user.displayName,
          phoneNumber: user.phoneNumber,
        }).displayName,
        phoneNumber: user.phoneNumber || null,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp()
      });
    }
  }

  // Email/Password Sign Up
  async signUpWithEmail(email, password, displayName) {
    if (!this.auth) {
      return { success: false, error: 'Authentication not available' };
    }

    try {
      const result = await createUserWithEmailAndPassword(this.auth, email, password);

      // Set display name
      if (displayName) {
        await updateProfile(result.user, { displayName });
      }

      this.currentUser = resolveSessionIdentity({
        id: result.user.uid,
        email: result.user.email,
        displayName: displayName || result.user.displayName,
        phoneNumber: result.user.phoneNumber,
        storedDisplayName: displayName,
      });
      this._notifyListeners();
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: this._getErrorMessage(error) };
    }
  }

  // Email/Password Sign In
  async signInWithEmail(email, password) {
    if (!this.auth) {
      return { success: false, error: 'Authentication not available' };
    }

    try {
      const result = await signInWithEmailAndPassword(this.auth, email, password);
      // Set currentUser eagerly so isLoggedIn() is true immediately — onAuthStateChanged
      // fires asynchronously (after a Firestore write) so getUser() would be null otherwise
      this.currentUser = resolveSessionIdentity({
        id: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        phoneNumber: result.user.phoneNumber,
      });
      this._notifyListeners();
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: this._getErrorMessage(error) };
    }
  }

  // Phone OTP - Step 1: Send verification code
  async sendPhoneVerification(phoneNumber, buttonId) {
    if (!this.auth) {
      return { success: false, error: 'Authentication not available' };
    }

    try {
      // Set up recaptcha verifier
      if (!this.recaptchaVerifier) {
        this.recaptchaVerifier = new RecaptchaVerifier(this.auth, buttonId, {
          size: 'invisible',
          callback: () => {
            // reCAPTCHA solved
          }
        });
      }

      this.confirmationResult = await signInWithPhoneNumber(
        this.auth,
        phoneNumber,
        this.recaptchaVerifier
      );

      return { success: true };
    } catch (error) {
      // Reset recaptcha on error
      if (this.recaptchaVerifier) {
        this.recaptchaVerifier.clear();
        this.recaptchaVerifier = null;
      }
      return { success: false, error: this._getErrorMessage(error) };
    }
  }

  // Phone OTP - Step 2: Verify code
  async verifyPhoneCode(code) {
    if (!this.confirmationResult) {
      return { success: false, error: 'No verification in progress' };
    }

    try {
      const result = await this.confirmationResult.confirm(code);
      this.confirmationResult = null;
      // Eagerly set currentUser (same race condition as signInWithEmail)
      this.currentUser = resolveSessionIdentity({
        id: result.user.uid,
        email: result.user.email,
        displayName: result.user.displayName,
        phoneNumber: result.user.phoneNumber,
      });
      this._notifyListeners();
      return { success: true, user: result.user };
    } catch (error) {
      return { success: false, error: this._getErrorMessage(error) };
    }
  }

  // Sign Out — only the Sign Out button. Background / visibilitychange /
  // pagehide / pageshow must never call this (E1 / B25).
  async signOut({ confirmed = true } = {}) {
    if (!this.auth) return { success: false, error: 'Authentication not available' };
    if (!confirmed) return { success: false, error: 'Sign-out not confirmed' };

    try {
      if (shouldClearUserOnSignOut()) {
        this.currentUser = null;
        this._notifyListeners();
      }
      await signOut(this.auth);
      this.currentUser = null;
      this._notifyListeners();
      return { success: true };
    } catch (error) {
      return { success: false, error: this._getErrorMessage(error) };
    }
  }

  // Tab return / reload / bfcache / network-back: refresh the token.
  // Never sign out. Re-hydrate displayName from Firestore so a generic
  // Auth profile does not paint a zombie after resume.
  async refreshSessionQuietly() {
    const fb = this.auth?.currentUser;
    if (!fb) return { ok: isRealAuthIdentity(this.getUser()), refreshed: false };
    try {
      await fb.getIdToken();
      try { await fb.reload(); } catch { /* offline — keep cached user */ }
      const live = this.auth.currentUser || fb;
      this._applyFirebaseUser(live);
      this._notifyListeners();
      this._hydrateIdentity(live).catch(() => {});
      return { ok: true, refreshed: true };
    } catch (error) {
      console.warn('[Auth] quiet refresh failed — session kept', error?.code || error);
      return { ok: isRealAuthIdentity(this.getUser()), refreshed: false };
    }
  }

  // Update display name
  async updateDisplayName(displayName) {
    if (!this.auth?.currentUser) {
      return { success: false, error: 'Not signed in' };
    }

    try {
      await updateProfile(this.auth.currentUser, { displayName });

      // Update in Firestore
      if (this.db) {
        const userRef = doc(this.db, 'users', this.auth.currentUser.uid);
        await setDoc(userRef, { displayName }, { merge: true });
      }

      this.currentUser = resolveSessionIdentity({
        id: this.auth.currentUser.uid,
        email: this.auth.currentUser.email || this.currentUser?.email,
        displayName,
        phoneNumber: this.auth.currentUser.phoneNumber || this.currentUser?.phoneNumber,
        storedDisplayName: displayName,
      });
      this._notifyListeners();

      return { success: true };
    } catch (error) {
      return { success: false, error: this._getErrorMessage(error) };
    }
  }

  // Verify the current session still has a usable auth token.
  // getIdToken() returns the cached token and transparently refreshes an
  // expired one; it only throws if the refresh itself fails (revoked session,
  // disabled account, no network).
  async validateToken() {
    if (!this.auth?.currentUser) return false;
    try {
      await this.auth.currentUser.getIdToken();
      return true;
    } catch (error) {
      console.warn('[Auth] Token validation failed:', error?.code || error);
      return false;
    }
  }

  // Inspect a Firestore/Firebase error and decide whether the user needs to
  // sign in again. Returns { needsReauth: boolean }.
  async handleFirebaseError(error) {
    const code = error?.code || '';

    if (code === 'unauthenticated' || code.startsWith('auth/')) {
      return { needsReauth: true };
    }

    if (code === 'permission-denied') {
      // Could be an expired session OR a genuine rules denial — check the token
      const tokenValid = await this.validateToken();
      return { needsReauth: !tokenValid };
    }

    return { needsReauth: false };
  }

  // Check if user is logged in. Prefer the restored Firebase user so a
  // reload does not look signed-out while onAuthStateChanged is in flight.
  // A "Player" / no-email half-session is not signed in (9.20.26.01).
  isLoggedIn() {
    return isRealAuthIdentity(this.getUser());
  }

  // Get current user. Never return a zombie "Player" identity as the session.
  getUser() {
    const fb = this.auth?.currentUser;
    if (fb) {
      const applied = this._applyFirebaseUser(fb);
      if (isRealAuthIdentity(applied)) return applied;
      if (isRealAuthIdentity(this.currentUser) && this.currentUser.id === fb.uid) {
        return this.currentUser;
      }
      return isRealAuthIdentity(applied) ? applied : null;
    }
    if (this._ready) {
      if (this.currentUser && !isRealAuthIdentity(this.currentUser)) {
        this.currentUser = null;
      }
      return isRealAuthIdentity(this.currentUser) ? this.currentUser : null;
    }
    return isRealAuthIdentity(this.currentUser) ? this.currentUser : null;
  }

  // Get user ID
  getUserId() {
    return this.getUser()?.id || null;
  }

  // Convert Firebase error codes to user-friendly messages
  _getErrorMessage(error) {
    const errorMessages = {
      'auth/email-already-in-use': 'An account with this email already exists.',
      'auth/invalid-email': 'Please enter a valid email address.',
      'auth/operation-not-allowed': 'This sign-in method is not enabled.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/user-disabled': 'This account has been disabled.',
      'auth/user-not-found': 'No account found with this email.',
      'auth/wrong-password': 'Incorrect password.',
      'auth/invalid-credential': 'Invalid email or password.',
      'auth/invalid-phone-number': 'Please enter a valid phone number.',
      'auth/invalid-verification-code': 'Invalid verification code.',
      'auth/too-many-requests': 'Too many attempts. Please try again later.',
      'auth/network-request-failed': 'Network error. Check your connection.'
    };

    return errorMessages[error.code] || error.message || 'An error occurred.';
  }
}

// Singleton instance
let authManagerInstance = null;

export function getAuthManager() {
  if (!authManagerInstance) {
    authManagerInstance = new AuthManager();
  }
  return authManagerInstance;
}
