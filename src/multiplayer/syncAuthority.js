// Push authorization and the stale-write guard. No Firebase.
// actionSeq is a per-browser counter. Comparing it across tabs is what let
// a backgrounded host overwrite a newer online game.

export function newSyncSessionId() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') return cryptoObj.randomUUID();
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

// Last seat this tab successfully pushed or applied. Not the live seat:
// a turn-ending action advances currentPlayer before the notify, and that
// final push must still go out.
export function confirmedSeatFromPlayer(player, index = null) {
  if (!player) return null;
  return {
    index: index == null ? null : index,
    userId: player.oderId ?? null,
    isAI: !!player.isAI,
  };
}

export function canPushFromConfirmedSeat({
  confirmedSeat = null,
  userId = null,
  hasAIAuthority = false,
} = {}) {
  if (!confirmedSeat) return false;
  if (confirmedSeat.userId != null && confirmedSeat.userId === userId) return true;
  if (confirmedSeat.isAI && hasAIAuthority) return true;
  return false;
}

// True when this write must not land.
// A newer doc aborts unless it is our own in-flight save (same session)
// and this tab's seq is newer — Confirm Attack / Undo. A doc with no
// lastWriterSession is never that save.
// A different remote seat than the one we last confirmed is a seat change
// we have not seen, whatever the seqs. Our own in-flight save is one we
// have seen, even if that save already moved the seat.
export function pushIsStale({
  remoteVersion = 0,
  localVersion = 0,
  remoteSeq = 0,
  localSeq = 0,
  remoteLastWriterSession = null,
  sessionId = null,
  remoteCurrentPlayerId = null,
  confirmedSeatId = null,
} = {}) {
  const remoteV = Number(remoteVersion) || 0;
  const localV = Number(localVersion) || 0;
  const rSeq = Number(remoteSeq) || 0;
  const lSeq = Number(localSeq) || 0;
  const ownInFlight = remoteLastWriterSession != null
    && remoteLastWriterSession !== ''
    && sessionId != null
    && remoteLastWriterSession === sessionId
    && lSeq > rSeq;
  if (remoteV > localV && !ownInFlight) return true;
  const remoteSeat = remoteCurrentPlayerId ?? null;
  const confirmed = confirmedSeatId ?? null;
  if (remoteSeat !== confirmed && !ownInFlight) return true;
  return false;
}

// A blocked turn-ending push retries when the server still has our seat.
// A seat we do not hold is reloaded, and the player is told the turn was not saved.
export function staleTurnRecovery({
  confirmedSeatId = null,
  remoteSeatId = null,
} = {}) {
  if ((remoteSeatId ?? null) === (confirmedSeatId ?? null)) {
    return { action: 'retry', notice: '' };
  }
  return {
    action: 'reload',
    notice: 'Could not save your turn — the match has moved on.',
  };
}

export function recoverStalePush({
  confirmedSeatId = null,
  remoteSeatId = null,
  remoteVersion = 0,
  localVersion = 0,
} = {}) {
  const recovery = staleTurnRecovery({ confirmedSeatId, remoteSeatId });
  if (recovery.action === 'retry') {
    return {
      action: 'retry',
      localVersion: Math.max(Number(localVersion) || 0, Number(remoteVersion) || 0),
      notice: '',
    };
  }
  return {
    action: 'reload',
    localVersion: Number(localVersion) || 0,
    notice: recovery.notice,
  };
}

// Local nextPhase already handed the seat off, and the server still shows
// our seat. Keep that turn and rebase the version. A forced reload is the
// give-up path and must apply the doc.
export function shouldPreserveLocalTurn({
  confirmedSeatId = null,
  liveSeatId = null,
  remoteSeatId = null,
  force = false,
} = {}) {
  if (force) return false;
  const ended = liveSeatId != null
    && confirmedSeatId != null
    && liveSeatId !== confirmedSeatId;
  return ended && (remoteSeatId ?? null) === (confirmedSeatId ?? null);
}

export function evaluateAuthoritativePush({
  remoteDoc = null,
  localVersion = 0,
  localSeq = 0,
  sessionId = null,
  confirmedSeat = null,
  nextState = null,
  nextCurrentPlayerId = null,
} = {}) {
  const remoteVersion = remoteDoc?.stateVersion || 0;
  const remoteSeq = Number(remoteDoc?.state?.actionSeq) || 0;
  const confirmedSeatId = confirmedSeat ? (confirmedSeat.userId ?? null) : null;
  if (pushIsStale({
    remoteVersion,
    localVersion,
    remoteSeq,
    localSeq,
    remoteLastWriterSession: remoteDoc?.lastWriterSession ?? null,
    sessionId,
    remoteCurrentPlayerId: remoteDoc?.currentPlayerId ?? null,
    confirmedSeatId,
  })) {
    return {
      status: 'stale',
      details: {
        localVersion,
        remoteVersion,
        localSeq,
        remoteSeq,
        confirmedSeat: confirmedSeat ? { ...confirmedSeat } : null,
        remoteSeat: remoteDoc?.currentPlayerId ?? null,
      },
    };
  }
  const version = remoteVersion + 1;
  return {
    status: 'ok',
    version,
    currentPlayerId: nextCurrentPlayerId,
    patch: {
      state: nextState,
      stateVersion: version,
      currentPlayerId: nextCurrentPlayerId,
      lastWriterSession: sessionId,
    },
  };
}
