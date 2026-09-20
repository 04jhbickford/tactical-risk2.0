// Turn-swap notice hook. POSTs { gameCode, currentPlayerName, phase } to an
// env-configured URL when currentPlayer changes. Unused when no URL is set.
// Does not send WhatsApp from the client. Does not hardcode phone numbers.

export function readTurnNoticeConfig() {
  let windowUrl = '';
  if (typeof globalThis !== 'undefined') {
    windowUrl = globalThis.TACTICAL_RISK_TURN_NOTICE_URL || '';
    try {
      if (!windowUrl && globalThis.localStorage) {
        windowUrl = globalThis.localStorage.getItem('TACTICAL_RISK_TURN_NOTICE_URL') || '';
      }
    } catch {
      // private mode / missing storage
    }
  }
  const envUrl = (typeof process !== 'undefined' && process.env
    && process.env.TACTICAL_RISK_TURN_NOTICE_URL) || '';
  return { envUrl, windowUrl };
}

export function resolveTurnNoticeUrl({ envUrl = '', windowUrl = '' } = {}) {
  const url = String(envUrl || windowUrl || '').trim();
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url;
}

export function shouldPostTurnNotice({
  prevPlayerId = null,
  nextPlayerId = null,
  url = null,
} = {}) {
  if (!url) return false;
  if (!prevPlayerId || !nextPlayerId) return false;
  return prevPlayerId !== nextPlayerId;
}

export function buildTurnNoticePayload({
  gameCode = null,
  currentPlayerName = null,
  phase = null,
} = {}) {
  return {
    gameCode: gameCode || null,
    currentPlayerName: currentPlayerName || null,
    phase: phase || null,
  };
}

export async function postTurnNotice(url, payload) {
  const resolved = resolveTurnNoticeUrl({ windowUrl: url, envUrl: url });
  if (!resolved) return { ok: false, reason: 'unconfigured' };
  const body = buildTurnNoticePayload(payload || {});
  try {
    if (typeof fetch !== 'function') return { ok: false, reason: 'no-fetch' };
    await fetch(resolved, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export function maybePostTurnNotice({
  prevPlayerId = null,
  nextPlayerId = null,
  nextPlayerName = null,
  gameCode = null,
  phase = null,
  config = null,
  post = postTurnNotice,
} = {}) {
  const url = resolveTurnNoticeUrl(config || readTurnNoticeConfig());
  if (!shouldPostTurnNotice({ prevPlayerId, nextPlayerId, url })) {
    return { ok: false, reason: 'skipped' };
  }
  return post(url, {
    gameCode,
    currentPlayerName: nextPlayerName,
    phase,
  });
}
