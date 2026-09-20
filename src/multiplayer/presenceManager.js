// Presence Manager for Tactical Risk multiplayer
// Tracks online/active status of players in a game

import {
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  collection
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFirebaseDb } from './firebase.js';
import { getAuthManager } from './auth.js';
import {
  PRESENCE_HEARTBEAT_MS,
  presenceStateForVisibility,
  resolvePresenceState,
  shouldDeletePresenceDoc,
  shouldHeartbeatNow,
  shouldReplaceSnapshotListener,
  shouldResumeSnapshots,
} from './presencePolicy.js';

// Presence states
export const PRESENCE_STATES = {
  ONLINE: 'online',    // Active in past 60 seconds (green)
  IDLE: 'idle',        // Logged in but no activity in 60+ seconds (yellow)
  OFFLINE: 'offline'   // Not connected (red)
};

const ACTIVITY_TIMEOUT = 60000; // 60 seconds
const HEARTBEAT_INTERVAL = 30000; // Update every 30 seconds

export class PresenceManager {
  constructor() {
    // Lazy load db and authManager to avoid initialization order issues
    this._db = null;
    this._authManager = null;
    this.gameId = null;
    this.presenceRef = null;
    this.unsubscribe = null;
    this._snapshotLive = false;
    this.heartbeatInterval = null;
    this.lastActivity = Date.now();
    this.playerPresence = {}; // { oderId: { state, lastSeen, displayName } }
    this._listeners = [];
    this._boundActivityHandler = this._onActivity.bind(this);
    this._boundVisibilityHandler = this._onVisibility.bind(this);
    this._boundPageShowHandler = this._onPageShow.bind(this);
    this._boundPageHideHandler = this._onPageHide.bind(this);
  }

  get db() {
    if (!this._db) {
      this._db = getFirebaseDb();
    }
    return this._db;
  }

  get authManager() {
    if (!this._authManager) {
      this._authManager = getAuthManager();
    }
    return this._authManager;
  }

  // Start tracking presence for a game
  async start(gameId) {
    if (!this.db || !gameId) return false;

    this.gameId = gameId;
    const user = this.authManager.getUser();
    if (!user) return false;

    // Set up presence document
    this.presenceRef = doc(this.db, 'games', gameId, 'presence', user.id);

    // Update presence immediately
    await this._updatePresence(PRESENCE_STATES.ONLINE);

    // Start heartbeat
    this.heartbeatInterval = setInterval(() => {
      if (!shouldHeartbeatNow({ event: 'interval' })) return;
      const state = this._isActive() ? PRESENCE_STATES.ONLINE : PRESENCE_STATES.IDLE;
      this._updatePresence(state);
    }, PRESENCE_HEARTBEAT_MS);

    // Listen for activity
    document.addEventListener('mousemove', this._boundActivityHandler);
    document.addEventListener('keydown', this._boundActivityHandler);
    document.addEventListener('click', this._boundActivityHandler);
    document.addEventListener('touchstart', this._boundActivityHandler);
    document.addEventListener('visibilitychange', this._boundVisibilityHandler);
    window.addEventListener('pageshow', this._boundPageShowHandler);
    window.addEventListener('pagehide', this._boundPageHideHandler);

    // Subscribe to all presence documents (one listener)
    this._ensurePresenceSnapshot();

    // Do NOT delete the presence doc on beforeunload — mobile browsers
    // fire that when backgrounding. Explicit Exit is the only delete.

    console.log(`[Presence] Started tracking for user ${user.id} in game ${gameId}`);
    return true;
  }

  // Stop tracking presence. Exit / Leave deletes the doc. Session loss
  // (Sign In after a backgrounded tab) must not — that is B25.
  stop({ reason = 'explicit-leave' } = {}) {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    document.removeEventListener('mousemove', this._boundActivityHandler);
    document.removeEventListener('keydown', this._boundActivityHandler);
    document.removeEventListener('click', this._boundActivityHandler);
    document.removeEventListener('touchstart', this._boundActivityHandler);
    document.removeEventListener('visibilitychange', this._boundVisibilityHandler);
    window.removeEventListener('pageshow', this._boundPageShowHandler);
    window.removeEventListener('pagehide', this._boundPageHideHandler);

    this._goOffline({ reason });
    this.gameId = null;
    this.playerPresence = {};
  }

  // Subscribe to presence changes
  subscribe(callback) {
    this._listeners.push(callback);
    // Immediately send current state
    callback(this.playerPresence);
    return () => {
      this._listeners = this._listeners.filter(cb => cb !== callback);
    };
  }

  // Get presence state for a player
  getPlayerPresence(oderId) {
    const presence = this.playerPresence[oderId];
    return resolvePresenceState({
      hasDoc: !!presence,
      lastSeen: presence?.lastSeen,
      state: presence?.state,
    });
  }

  // Get all player presence
  getAllPresence() {
    return this.playerPresence;
  }

  _onActivity() {
    this.lastActivity = Date.now();
  }

  _onVisibility() {
    const visible = typeof document !== 'undefined' && document.visibilityState === 'visible';
    const event = visible ? 'visibility-visible' : 'visibility-hidden';
    // Required: heartbeat on every visibilitychange (hidden → idle, visible → online).
    if (shouldHeartbeatNow({ event })) {
      if (visible) this.lastActivity = Date.now();
      this._updatePresence(visible ? PRESENCE_STATES.ONLINE : PRESENCE_STATES.IDLE);
    }
    if (visible && shouldResumeSnapshots({ event: 'visibility-visible' })) {
      this._ensurePresenceSnapshot();
    }
  }

  _onPageShow(event) {
    const persisted = !!(event && event.persisted);
    if (!shouldResumeSnapshots({ event: 'pageshow' })) return;
    this.lastActivity = Date.now();
    if (shouldHeartbeatNow({
      event: persisted ? 'pageshow-persisted' : 'pageshow',
      persisted,
    })) {
      this._updatePresence(PRESENCE_STATES.ONLINE);
    }
    this._ensurePresenceSnapshot({ persistedPageShow: persisted });
  }

  _onPageHide() {
    // Keep the doc. A delete here is what made a backgrounded host look gone.
    this._updatePresence(presenceStateForVisibility('hidden'));
  }

  _isActive() {
    return (Date.now() - this.lastActivity) < ACTIVITY_TIMEOUT;
  }

  async _updatePresence(state) {
    if (!this.presenceRef) return;

    const user = this.authManager.getUser();
    if (!user) return;

    try {
      await setDoc(this.presenceRef, {
        oderId: user.id,
        displayName: user.displayName,
        state,
        lastSeen: Date.now(),
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('[Presence] Error updating presence:', error);
    }
  }

  async _goOffline({ reason } = {}) {
    if (!this.presenceRef) return;
    if (!shouldDeletePresenceDoc({ reason })) {
      await this._updatePresence(PRESENCE_STATES.IDLE);
      return;
    }
    try {
      await deleteDoc(this.presenceRef);
    } catch (error) {
      console.error('[Presence] Error going offline:', error);
    }
  }

  _ensurePresenceSnapshot({ persistedPageShow = false } = {}) {
    if (!shouldReplaceSnapshotListener({
      hasUnsubscribe: typeof this.unsubscribe === 'function',
      listenerErrored: !this._snapshotLive && !this.unsubscribe,
      persistedPageShow,
    })) {
      return;
    }
    this._subscribeToPresence();
  }

  _subscribeToPresence() {
    if (!this.gameId || !this.db) return;

    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this._snapshotLive = false;

    const presenceCollection = collection(this.db, 'games', this.gameId, 'presence');

    this.unsubscribe = onSnapshot(presenceCollection, (snapshot) => {
      this._snapshotLive = true;
      const presence = {};

      snapshot.forEach(doc => {
        const data = doc.data();
        const state = resolvePresenceState({
          hasDoc: true,
          lastSeen: data.lastSeen,
          state: data.state,
        });

        presence[data.oderId] = {
          ...data,
          state
        };
      });

      this.playerPresence = presence;
      this._notifyListeners();
    }, (error) => {
      console.error('[Presence] Snapshot error — will re-attach on resume', error);
      this._snapshotLive = false;
      this.unsubscribe = null;
    });
  }

  _notifyListeners() {
    for (const cb of this._listeners) {
      cb(this.playerPresence);
    }
  }
}

// Singleton instance
let presenceManagerInstance = null;

export function getPresenceManager() {
  if (!presenceManagerInstance) {
    presenceManagerInstance = new PresenceManager();
  }
  return presenceManagerInstance;
}
