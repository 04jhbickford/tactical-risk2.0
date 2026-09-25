// Sync Manager for Tactical Risk multiplayer
// Handles real-time game state synchronization via Firestore

import {
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getFirebaseDb } from './firebase.js';
import { getAuthManager } from './auth.js';
import { GAME_VERSION, compareGameVersions } from '../version.js';
import { DRAFT_MIN_CLIENT, draftOpenRefusal } from '../state/territoryDraft.js';
import { createPushQueue } from './pushCoalesce.js';
import { deferredSnapshotShouldApply, shouldApplyRemoteGameState } from '../state/placementPass.js';
import {
  shouldReplaceSnapshotListener,
  shouldResumeSnapshots,
} from './presencePolicy.js';
import { applyLiveHostHandoff } from './hostHandoff.js';
import { omitUndefinedDeep } from '../state/persistState.js';

export class SyncManager {
  constructor(gameId, gameState) {
    this.db = getFirebaseDb();
    this.authManager = getAuthManager();
    this.gameId = gameId;
    this.gameState = gameState;
    this.localVersion = 0;
    this.isActivePlayer = false;
    this.isHost = false; // Whether this client is the game host (follows lobbyData)
    this.hostOderId = null;
    this.isPushing = false;
    this._deferredRemote = null;
    this.isLoadingRemoteState = false; // Flag to prevent push during remote state load
    this.unsubscribe = null;
    this._listeners = [];
    this._pendingPush = null;
    // Serialize + coalesce pushes. A Done/pass waiter must wait for the
    // coalesced follow-up write, not the in-flight pre-Done place write
    // (V2.71 kill-after-Done left the pass unpersisted).
    this._pushQueue = createPushQueue(async () => {
      this.isPushing = true;
      try {
        return await this._runPushWithRetry();
      } finally {
        this.isPushing = false;
        this._flushDeferredRemote();
      }
    });
    this._versionOutdatedNotified = false; // fire the refresh banner at most once
    this._lifecycleBound = false;
    this._snapshotLive = false;
    this._onLifecycleHide = () => this._flushOnHide();
    this._onLifecycleResume = (event) => this._resumeSnapshots(event);
  }

  // Dimension C (version-upgrade robustness): every game doc records the
  // clientVersion that last wrote it. If we ever load a doc written by a
  // strictly-newer app version, a redeploy happened while this tab stayed open —
  // surface a one-shot 'version_outdated' event so the UI can prompt a refresh.
  // Older clients simply ignore the extra doc-level field, and a missing/garbled
  // stamp never triggers the banner (compareGameVersions fails safe).
  _loadRemoteState(state) {
    if (!state || !this.gameState) return false;
    const refusal = draftOpenRefusal(state, GAME_VERSION);
    if (refusal) {
      console.warn(`[Sync] Refusing territory draft (need ${refusal.minClientVersion}, we are ${GAME_VERSION})`);
      this._notifyListeners('draft_client_blocked', refusal);
      return false;
    }
    this.gameState.loadFromJSON(state);
    return true;
  }

  _draftDocFields(state) {
    if (state?.phase !== 'territory_draft') return {};
    return { minClientVersion: state.minClientVersion || DRAFT_MIN_CLIENT };
  }

  _checkRemoteVersion(newData) {
    if (this._versionOutdatedNotified) return;
    const remote = newData?.clientVersion;
    if (remote && compareGameVersions(remote, GAME_VERSION) > 0) {
      this._versionOutdatedNotified = true;
      console.warn(`[Sync] Doc written by newer client ${remote} (we are ${GAME_VERSION}) — prompting refresh`);
      this._notifyListeners('version_outdated', { remoteVersion: remote, localVersion: GAME_VERSION });
    }
  }

  // Set whether this client is the host (controls AI players).
  // Live Resign rewrites lobbyData; applyHostFromDoc overrides this
  // from snapshots so AI authority does not stay frozen at join.
  setIsHost(isHost) {
    this.isHost = isHost;
  }

  setHostOderId(hostOderId) {
    this.hostOderId = hostOderId || null;
  }

  applyHostFromDoc(docData) {
    const next = applyLiveHostHandoff({
      currentHostOderId: this.hostOderId,
      currentIsHost: this.isHost,
      userId: this.userId,
      lobbyData: docData?.lobbyData,
      players: docData?.lobbyData?.players || docData?.players,
      hostId: docData?.lobbyData?.hostId || docData?.hostId || null,
    });
    if (!next.changed && this.hostOderId) return next;
    this.hostOderId = next.hostOderId;
    this.isHost = next.isHost;
    if (next.changed) {
      this._notifyListeners('host_changed', {
        hostOderId: next.hostOderId,
        isHost: next.isHost,
      });
    }
    return next;
  }

  // Optional extra authority check (host-failover: when the host is offline,
  // one designated fallback client may run AI turns and push their state)
  setAuthorityCheck(fn) {
    this.authorityCheck = fn;
  }

  // True if this client may act for AI players (host, or failover authority)
  hasAIAuthority() {
    if (this.isHost) return true;
    try {
      return this.authorityCheck ? this.authorityCheck() === true : false;
    } catch {
      return false;
    }
  }

  // Get current user ID
  get userId() {
    return this.authManager.getUserId();
  }

  // Check if currently loading remote state (to prevent push during load)
  isLoading() {
    return this.isLoadingRemoteState;
  }

  // Subscribe to state changes
  subscribe(callback) {
    this._listeners.push(callback);
    return () => {
      this._listeners = this._listeners.filter(cb => cb !== callback);
    };
  }

  _notifyListeners(event, data) {
    for (const cb of this._listeners) {
      cb(event, data);
    }
  }

  // Start listening to game updates
  async startSync() {
    if (!this.db || !this.gameId) {
      console.error('SyncManager: Missing db or gameId');
      return false;
    }

    this._bindLifecycleFlush();
    const gameRef = doc(this.db, 'games', this.gameId);

    // Get initial state
    const snapshot = await getDoc(gameRef);
    if (!snapshot.exists()) {
      console.error('SyncManager: Game not found');
      return false;
    }

    const data = snapshot.data();
    this.localVersion = data.stateVersion || 0;

    // If state exists, load it
    if (data.state) {
      this._loadRemoteState(data.state);
    }

    // Determine if we're the active player
    this._updateActivePlayer(data.currentPlayerId);
    this.applyHostFromDoc(data);

    this._ensureGameSnapshot();
    return true;
  }

  // Start sync and wait for state to be available (for non-host clients)
  async startSyncAndWaitForState(maxWaitMs = 10000) {
    if (!this.db || !this.gameId) {
      console.error('SyncManager: Missing db or gameId');
      return false;
    }

    this._bindLifecycleFlush();
    const gameRef = doc(this.db, 'games', this.gameId);
    const startTime = Date.now();

    // Poll for state to be available
    while (Date.now() - startTime < maxWaitMs) {
      const snapshot = await getDoc(gameRef);
      if (!snapshot.exists()) {
        console.error('SyncManager: Game not found');
        return false;
      }

      const data = snapshot.data();
      if (data.state && data.stateVersion > 0) {
        // State is available, load it
        console.log('[Sync] State received from Firebase:');
        console.log(`  stateVersion: ${data.stateVersion}`);
        console.log(`  currentPlayerId: ${data.currentPlayerId}`);
        console.log(`  currentPlayerIndex in state: ${data.state.currentPlayerIndex}`);
        console.log(`  players in state:`, data.state.players?.map((p, i) => `[${i}] ${p.name} (oderId: ${p.oderId})`));

        this.localVersion = data.stateVersion;
        this.isLoadingRemoteState = true;
        this._loadRemoteState(data.state);
        this.isLoadingRemoteState = false;
        this._updateActivePlayer(data.currentPlayerId);
        this.applyHostFromDoc(data);

        console.log(`[Sync] After load - currentPlayer: ${this.gameState.currentPlayer?.name} (oderId: ${this.gameState.currentPlayer?.oderId})`);

        this._ensureGameSnapshot();
        return true;
      }

      // Wait a bit before polling again
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.error('SyncManager: Timeout waiting for game state');
    return false;
  }

  // Stop listening
  stopSync() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this._snapshotLive = false;
    this._unbindLifecycleFlush();
  }

  _ensureGameSnapshot({ persistedPageShow = false } = {}) {
    if (!this.db || !this.gameId) return;
    if (!shouldReplaceSnapshotListener({
      hasUnsubscribe: typeof this.unsubscribe === 'function',
      listenerErrored: !this._snapshotLive && !this.unsubscribe,
      persistedPageShow,
    })) {
      return;
    }
    this._attachGameSnapshot();
  }

  _attachGameSnapshot() {
    const gameRef = doc(this.db, 'games', this.gameId);
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this._snapshotLive = false;
    this.unsubscribe = onSnapshot(gameRef, (snapshot) => {
      this._snapshotLive = true;
      if (!snapshot.exists()) {
        this._notifyListeners('game_deleted', null);
        return;
      }

      const newData = snapshot.data();
      console.log(`[Sync] onSnapshot: version=${newData.stateVersion}, localVersion=${this.localVersion}, isPushing=${this.isPushing}, currentPlayerId=${newData.currentPlayerId}`);
      this._checkRemoteVersion(newData);
      this.applyHostFromDoc(newData);

      if (this.isPushing) {
        // Keep the newest doc. Applying it here would fight the in-flight
        // write; flushing after isPushing clears is what unsticks an open
        // host whose turn-end snapshot was swallowed (9.21.26.06).
        this._noteDeferredSnapshot(newData);
        if (newData.currentPlayerId !== this._lastCurrentPlayerId) {
          this._updateActivePlayer(newData.currentPlayerId);
        }
        return;
      }

      if (this._shouldApplyRemote(newData)) {
        console.log(`[Sync] Loading remote state: ${this.localVersion} -> ${newData.stateVersion}, seat ${this._lastCurrentPlayerId} -> ${newData.currentPlayerId}`);
        this.localVersion = Math.max(this.localVersion, newData.stateVersion || 0);
        if (newData.state) {
          this.isLoadingRemoteState = true;
          this._loadRemoteState(newData.state);
          this.isLoadingRemoteState = false;
        }
        this._updateActivePlayer(newData.currentPlayerId);
        this._notifyListeners('state_updated', this._turnSnapshotPayload(newData.currentPlayerId));
      } else if (newData.currentPlayerId !== this._lastCurrentPlayerId) {
        console.log(`[Sync] Turn changed without version bump: ${this._lastCurrentPlayerId} -> ${newData.currentPlayerId}`);
        this._updateActivePlayer(newData.currentPlayerId);
        this._notifyListeners('turn_changed', this._turnSnapshotPayload(newData.currentPlayerId));
      }
    }, async (error) => {
      console.error('SyncManager: Subscription error — will re-attach on resume', error);
      this._snapshotLive = false;
      this.unsubscribe = null;
      const authResult = await this.authManager.handleFirebaseError(error);
      if (authResult.needsReauth) {
        this._notifyListeners('auth_error', { needsReauth: true });
        return;
      }
      this._notifyListeners('error', error);
    });
  }

  _resumeSnapshots(event) {
    const persisted = !!(event && event.persisted);
    const visible = typeof document === 'undefined'
      || document.visibilityState === 'visible'
      || event?.type === 'pageshow';
    if (!visible) return;
    if (!shouldResumeSnapshots({
      event: event?.type === 'pageshow' ? 'pageshow' : 'visibility-visible',
    })) {
      return;
    }
    this._ensureGameSnapshot({ persistedPageShow: persisted });
  }

  _bindLifecycleFlush() {
    if (this._lifecycleBound || typeof window === 'undefined') return;
    this._lifecycleBound = true;
    window.addEventListener('pagehide', this._onLifecycleHide);
    document.addEventListener('visibilitychange', this._onLifecycleHide);
    window.addEventListener('pageshow', this._onLifecycleResume);
    document.addEventListener('visibilitychange', this._onLifecycleResume);
  }

  _unbindLifecycleFlush() {
    if (!this._lifecycleBound || typeof window === 'undefined') return;
    window.removeEventListener('pagehide', this._onLifecycleHide);
    document.removeEventListener('visibilitychange', this._onLifecycleHide);
    window.removeEventListener('pageshow', this._onLifecycleResume);
    document.removeEventListener('visibilitychange', this._onLifecycleResume);
    this._lifecycleBound = false;
  }

  // Best-effort: if Done/place is only in the debounce timer, fire it before
  // the tab dies. An already-queued pass write keeps running; we do not invent
  // a second Firebase client.
  _flushOnHide() {
    if (typeof document !== 'undefined' && document.visibilityState && document.visibilityState !== 'hidden') {
      return;
    }
    if (!this.canPushLocalChange()) return;
    if (this._pendingPush) {
      clearTimeout(this._pendingPush);
      this._pendingPush = null;
      this.pushStateNow();
      return;
    }
    if (this._pushQueue?.hasPendingWork()) {
      this.pushStateNow();
    }
  }

  // Payload for state_updated / turn_changed. Always include the live
  // isActivePlayer flag so UI can drop the optimistic waiting lock when a
  // remote snapshot makes THIS client current (V2.72 omitted it on
  // state_updated — debug dump: isActivePlayer=undefined on every line).
  _turnSnapshotPayload(currentPlayerId) {
    return {
      version: this.localVersion,
      currentPlayerId,
      isActivePlayer: this.checkIsActivePlayer(),
    };
  }

  _shouldApplyRemote(newData) {
    return shouldApplyRemoteGameState({
      remoteVersion: newData?.stateVersion || 0,
      localVersion: this.localVersion,
      remoteCurrentPlayerId: newData?.currentPlayerId || null,
      localCurrentPlayerId: this._lastCurrentPlayerId || null,
      remoteActionSeq: newData?.state?.actionSeq || 0,
      localActionSeq: this.gameState?.actionSeq || 0,
      localGestureActive: !!this.gameState?.uiGestureActive,
    });
  }

  // Update active player status
  _updateActivePlayer(currentPlayerId) {
    const wasActive = this.isActivePlayer;
    this._lastCurrentPlayerId = currentPlayerId;
    this.isActivePlayer = currentPlayerId === this.userId;

    console.log(`[Sync] Active player update: currentPlayerId=${currentPlayerId}, myUserId=${this.userId}, isActive=${this.isActivePlayer}`);

    if (wasActive !== this.isActivePlayer) {
      console.log(`[Sync] Turn changed: ${wasActive ? 'was my turn' : 'was waiting'} -> ${this.isActivePlayer ? 'now my turn' : 'now waiting'}`);
    }
  }

  // Push state to Firestore (called after local state changes)
  async pushState() {
    // Allow push if: 1) We're the active player, OR 2) We may act for AI
    // (host, or failover authority when the host is offline)
    const canPush = this.isActivePlayer || this.hasAIAuthority();
    if (!canPush) {
      console.warn('SyncManager: Non-active non-host player attempted to push state');
      return false;
    }

    // Debounce rapid updates (fine-grained actions like unit placement/movement)
    if (this._pendingPush) {
      clearTimeout(this._pendingPush);
    }

    return new Promise((resolve) => {
      this._pendingPush = setTimeout(async () => {
        this._pendingPush = null;
        const result = await this._doPush();
        resolve(result);
      }, 100); // 100ms debounce
    });
  }

  // Push immediately without debounce — used for phase and turn transitions so that
  // a hard refresh mid-turn restores the correct phase rather than a stale earlier one.
  async pushStateNow() {
    const canPush = this.isActivePlayer || this.hasAIAuthority();
    if (!canPush) return false;

    // Cancel any pending debounced push — this one supersedes it
    if (this._pendingPush) {
      clearTimeout(this._pendingPush);
      this._pendingPush = null;
    }

    return this._doPush();
  }

  // Serialize + coalesce entry point. A Done waiter shares the queue tail,
  // which includes the follow-up write of the post-Done state — not just the
  // in-flight pre-Done place write.
  async _doPush() {
    if (!this.db || !this.gameId) return false;
    return this._pushQueue.enqueue();
  }

  // Retry transient transaction failures with small backoff. On exhaustion we
  // reload the authoritative doc so this client never proceeds on (or hands the
  // turn off from) un-persisted local state — the root cause of the V2.55
  // "playing ahead / playing another player's turn" bug: local state advanced
  // optimistically, the push silently failed, and the game marched on.
  async _runPushWithRetry() {
    const MAX_ATTEMPTS = 3;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const outcome = await this._pushOnce();

        if (outcome.status === 'gone') return false; // doc deleted
        if (outcome.status === 'stale') {
          this._notifyListeners('push_stale', { localVersion: this.localVersion });
          // The winning update's snapshot may have been skipped while isPushing
          // was set — reload explicitly so we don't sit on stale state.
          await this._reloadRemoteState();
          return false;
        }

        // status === 'ok'
        this.localVersion = outcome.version;
        if (outcome.currentPlayerId !== this._lastCurrentPlayerId) {
          this._updateActivePlayer(outcome.currentPlayerId);
        }
        return true;
      } catch (error) {
        lastError = error;
        // Capture the attempted PAYLOAD, not just the raw error — blind
        // "push_failed: <error>" logging is what stalled the V2.55 diagnosis.
        const currentPlayer = this.gameState?.currentPlayer;
        this._notifyListeners('push_failed', {
          attemptedVersion: this.localVersion + 1,
          currentPlayerId: currentPlayer?.oderId ?? null,
          phase: this.gameState?.turnPhase ?? null,
          attempt,
          willRetry: attempt < MAX_ATTEMPTS,
          error: error?.message || String(error)
        });
        console.error(`SyncManager: Push failed (attempt ${attempt}/${MAX_ATTEMPTS})`, error);
        if (attempt < MAX_ATTEMPTS) {
          await this._delay(this._backoffMs(attempt));
        }
      }
    }

    // Retries exhausted. Snap local state back to the last confirmed truth so a
    // never-committed local advance can't diverge the game. Reload FIRST so
    // listeners see the restored doc (force=true: versions are usually equal
    // after a failed write, and the un-forced path would no-op).
    await this._reloadRemoteState({ force: true });
    this._notifyListeners('push_exhausted', {
      attemptedVersion: this.localVersion + 1,
      error: lastError?.message || String(lastError)
    });
    return false;
  }

  // A single transaction-guarded write attempt. Never clobbers a state newer
  // than the one this client is based on: two clients pushing concurrently
  // (stale tab, or a host/active-player race) would otherwise overwrite each
  // other since both stamp localVersion + 1. Returns a status object; a thrown
  // transaction error propagates to the retry loop.
  async _pushOnce() {
    const gameRef = doc(this.db, 'games', this.gameId);
    // Belt-and-suspenders: Firestore throws on undefined. A failed combat
    // push rolls the capture back (hiccup → exhaust).
    const state = omitUndefinedDeep(this.gameState.toJSON());
    const currentPlayer = this.gameState.currentPlayer;
    const currentPlayerId = currentPlayer?.oderId || null;

    const pushedVersion = await runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(gameRef);
      if (!snapshot.exists()) return null;

      const remoteDoc = snapshot.data();
      const remoteVersion = remoteDoc.stateVersion || 0;
      const remoteSeq = Number(remoteDoc.state?.actionSeq) || 0;
      const localSeq = Number(this.gameState?.actionSeq) || 0;
      // A higher version with an older board revision is a stale clobber
      // (host AI-authority push, or an in-flight pre-confirm write). The
      // active client's newer actionSeq must win or Confirm Attack / Undo
      // snap back to the previous cloud doc.
      if (remoteVersion > this.localVersion && remoteSeq >= localSeq) {
        console.warn(`[Sync] Push aborted: remote v${remoteVersion} > local v${this.localVersion}`);
        return -1;
      }

      transaction.update(gameRef, {
        state,
        stateVersion: remoteVersion + 1,
        currentPlayerId,
        clientVersion: GAME_VERSION,
        schemaVersion: state.version ?? null,
        updatedAt: serverTimestamp(),
        ...this._draftDocFields(state),
      });
      return remoteVersion + 1;
    });

    if (pushedVersion === null) return { status: 'gone' };
    if (pushedVersion === -1) return { status: 'stale' };
    return { status: 'ok', version: pushedVersion, currentPlayerId };
  }

  // Exponential backoff with jitter (~150ms, ~300ms) between push retries.
  _backoffMs(attempt) {
    return 150 * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 100);
  }

  _delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Re-fetch the game doc and apply it. Default: only if remote is newer
  // (stale-push case). force=true also applies when versions are equal, which
  // is the exhausted-retry case: local gameState has uncommitted mutations
  // sitting on the same version the server still holds.
  async _reloadRemoteState({ force = false } = {}) {
    if (!this.db || !this.gameId) return;
    try {
      const snapshot = await getDoc(doc(this.db, 'games', this.gameId));
      if (!snapshot.exists()) {
        this._notifyListeners('game_deleted', null);
        return;
      }

      const data = snapshot.data();
      this.applyHostFromDoc(data);
      const remoteVersion = data.stateVersion || 0;
      const apply = shouldApplyRemoteGameState({
        remoteVersion,
        localVersion: this.localVersion,
        remoteCurrentPlayerId: data.currentPlayerId || null,
        localCurrentPlayerId: this._lastCurrentPlayerId || null,
        remoteActionSeq: data.state?.actionSeq || 0,
        localActionSeq: this.gameState?.actionSeq || 0,
        localGestureActive: !!this.gameState?.uiGestureActive,
        force,
      });
      if (apply && (force || remoteVersion > this.localVersion)) {
        console.log(`[Sync] Reloading remote state: local v${this.localVersion} -> remote v${remoteVersion}${force ? ' (force)' : ''}`);
        this.localVersion = remoteVersion;
        if (data.state) {
          this.isLoadingRemoteState = true;
          this._loadRemoteState(data.state);
          this.isLoadingRemoteState = false;
        }
        this._updateActivePlayer(data.currentPlayerId);
        if (!force) {
          this._notifyListeners('state_updated', this._turnSnapshotPayload(data.currentPlayerId));
        }
      }
    } catch (error) {
      console.error('[Sync] Reload after stale push failed', error);
    }
  }

  // Force push (for game initialization by host)
  async forcePush(isHost = false) {
    if (!this.db || !this.gameId) return false;

    this.isPushing = true;

    try {
      const gameRef = doc(this.db, 'games', this.gameId);
      const state = this.gameState.toJSON();

      // Get current player's userId for turn tracking
      const currentPlayer = this.gameState.currentPlayer;
      const currentPlayerId = currentPlayer?.oderId || null;

      await updateDoc(gameRef, {
        state,
        stateVersion: 1,
        currentPlayerId,
        clientVersion: GAME_VERSION,
        schemaVersion: state.version ?? null,
        status: 'active',
        updatedAt: serverTimestamp(),
        ...this._draftDocFields(state),
      });

      this.localVersion = 1;
      this._updateActivePlayer(currentPlayerId);

      return true;
    } catch (error) {
      console.error('SyncManager: Force push failed', error);
      return false;
    } finally {
      this.isPushing = false;
      this._flushDeferredRemote();
    }
  }

  _noteDeferredSnapshot(newData) {
    if (!newData) return;
    const prev = this._deferredRemote;
    if (!prev || (Number(newData.stateVersion) || 0) >= (Number(prev.stateVersion) || 0)) {
      this._deferredRemote = newData;
    }
  }

  _flushDeferredRemote() {
    const deferred = this._deferredRemote;
    this._deferredRemote = null;
    if (!deferred?.state || !this.gameState) return;
    const remoteSeat = deferred.currentPlayerId || null;
    const localSeat = this.gameState.currentPlayer?.oderId || null;
    if (!deferredSnapshotShouldApply({
      remoteVersion: deferred.stateVersion || 0,
      localVersion: this.localVersion,
      remotePlayerId: remoteSeat,
      localPlayerId: localSeat,
      remoteActionSeq: deferred.state?.actionSeq || 0,
      localActionSeq: this.gameState?.actionSeq || 0,
    })) return;
    console.log(`[Sync] Applying snapshot deferred while pushing: v${this.localVersion} -> v${deferred.stateVersion}, seat ${localSeat} -> ${remoteSeat}`);
    this.localVersion = Math.max(this.localVersion, deferred.stateVersion || 0);
    this.isLoadingRemoteState = true;
    this._loadRemoteState(deferred.state);
    this.isLoadingRemoteState = false;
    this._updateActivePlayer(remoteSeat);
    this._notifyListeners('state_updated', this._turnSnapshotPayload(remoteSeat));
  }

  // Single source of truth for "is it my turn" — DERIVED FROM LIVE STATE, not
  // the cached isActivePlayer flag (which lags a push debounce + network
  // round-trip and goes stale exactly when a push fails). Guard, sidebar,
  // title, and debug panel all read this so they can never disagree about whose
  // turn it is (Bugs 1 & 3). Falls back to the cached flag only before any state
  // has loaded (currentPlayer not yet available).
  checkIsActivePlayer() {
    const cp = this.gameState?.currentPlayer;
    if (cp && cp.oderId != null) return cp.oderId === this.userId;
    return this.isActivePlayer;
  }

  // Push AUTHORIZATION — deliberately uses the cached flag, NOT live state.
  // Rationale: your own turn-ENDING action advances the live currentPlayer to
  // the next player before the notify fires, so a live check would refuse to
  // push the very transition that ends your turn (leaving it stranded locally —
  // the exact V2.55 failure). The cached flag stays true across that final push
  // because it only updates once the push confirms. AI authority may always push.
  canPushLocalChange() {
    return this.isActivePlayer || this.hasAIAuthority();
  }

  // Get the current player ID from Firestore
  async getCurrentPlayerId() {
    if (!this.db || !this.gameId) return null;

    const gameRef = doc(this.db, 'games', this.gameId);
    const snapshot = await getDoc(gameRef);
    if (!snapshot.exists()) return null;

    return snapshot.data().currentPlayerId;
  }
}

// Factory function
export function createSyncManager(gameId, gameState) {
  return new SyncManager(gameId, gameState);
}
