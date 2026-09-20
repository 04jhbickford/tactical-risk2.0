// Discord turn ping for Classic + New UX. Soft-fail only — never blocks play.
// Production path: POST /api/discord-turn-ping with the seat payload.
// The webhook lives in Vercel env DISCORD_TURN_WEBHOOK_URL — never on the client.
// Dedupe key: (gameId, turnIndex, seatId). Skip AI. One untagged fallback
// when the seat has no snowflake.

export const DISCORD_TURN_CHANNEL_ID = '1551283474303025292';
export const DISCORD_SEEN_KEY = 'tacticalRisk_discordTurnPingSeen';
export const DISCORD_SEAT_KEY = 'tacticalRisk_discordSeat';
export const DISCORD_TURN_PING_API = '/api/discord-turn-ping';

export function normalizeDiscordSnowflake(raw) {
  const s = String(raw ?? '').trim();
  if (/^\d{5,22}$/.test(s)) return s;
  const mention = s.match(/^<@!?(\d{5,22})>$/);
  return mention ? mention[1] : '';
}

export function parseDiscordSeatInput(raw) {
  const text = String(raw ?? '').trim().slice(0, 48);
  const id = normalizeDiscordSnowflake(text);
  if (id) return { discordUserId: id, discordName: '' };
  return { discordUserId: '', discordName: text };
}

export function turnIndexOf({ round = 0, currentPlayerIndex = 0 } = {}) {
  return (Number(round) || 0) * 64 + (Number(currentPlayerIndex) || 0);
}

export function pingDedupeKey({ gameId = '', turnIndex = 0, seatId = '' } = {}) {
  return `${gameId || ''}|${turnIndex ?? ''}|${seatId || ''}`;
}

const SETUP_PHASE_LABELS = {
  setup: 'Initial Deployment',
  unit_placement: 'Initial Deployment',
  capital_placement: 'Place Capital',
  lobby: 'Lobby',
};

export function phaseLabelOf(gameState) {
  if (!gameState) return '';
  if (typeof gameState.getTurnPhaseName === 'function' && gameState.phase === 'playing') {
    const named = gameState.getTurnPhaseName();
    if (named && named !== gameState.turnPhase) return named;
    if (named) return named;
  }
  const raw = String(gameState.turnPhase || gameState.phase || '').trim();
  if (SETUP_PHASE_LABELS[raw]) return SETUP_PHASE_LABELS[raw];
  return raw.replace(/_/g, ' ');
}

export function factionLabelOf(player) {
  return player?.id || player?.factionId || player?.name || 'seat';
}

export function buildDeepLink({
  origin = 'https://tactical-risk20.vercel.app/',
  uxMode = 'classic',
  gameCode = '',
} = {}) {
  let url;
  try {
    url = new URL(origin, 'https://tactical-risk20.vercel.app/');
  } catch {
    url = new URL('https://tactical-risk20.vercel.app/');
  }
  if (uxMode === 'three') url.searchParams.set('ux', 'three');
  else url.searchParams.set('ux', 'classic');
  if (gameCode) url.searchParams.set('code', String(gameCode).toUpperCase());
  return url.toString();
}

export function buildDiscordTurnContent({
  discordUserId = '',
  faction = '',
  phase = '',
  deepLink = '',
} = {}) {
  const snowflake = normalizeDiscordSnowflake(discordUserId);
  const who = faction || 'seat';
  const tail = phase ? ` · ${phase}` : '';
  const head = snowflake
    ? `<@${snowflake}> your turn — ${who}${tail}`
    : `your turn — ${who}${tail}`;
  return [head, deepLink].filter(Boolean).join('\n');
}

export function shouldPingHumanSeat({
  player = null,
  gameId = '',
  turnIndex = 0,
  seatId = '',
  seen = null,
} = {}) {
  if (!player || player.isAI) return { ok: false, reason: 'skip-ai' };
  const id = seatId || player.id || player.oderId || '';
  if (!gameId || !id) return { ok: false, reason: 'incomplete' };
  const key = pingDedupeKey({ gameId, turnIndex, seatId: id });
  if (seen?.has?.(key)) return { ok: false, reason: 'deduped' };
  return { ok: true, key };
}

export function readDiscordWebhookUrl({
  envUrl = '',
  windowUrl = '',
} = {}) {
  const url = String(envUrl || windowUrl || '').trim();
  if (!url) return null;
  if (!/^https:\/\/(discord\.com|discordapp\.com)\//i.test(url) && !/^https?:\/\//i.test(url)) {
    return null;
  }
  return url;
}

export function readDiscordWebhookConfig() {
  let windowUrl = '';
  if (typeof globalThis !== 'undefined') {
    windowUrl = globalThis.DISCORD_TURN_WEBHOOK_URL || '';
    try {
      if (!windowUrl && globalThis.localStorage) {
        windowUrl = globalThis.localStorage.getItem('DISCORD_TURN_WEBHOOK_URL') || '';
      }
    } catch {
      /* private mode */
    }
  }
  const envUrl = (typeof process !== 'undefined' && process.env
    && process.env.DISCORD_TURN_WEBHOOK_URL) || '';
  return { envUrl, windowUrl };
}

export function loadSeenPingKeys(storage = null) {
  const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  try {
    const raw = store?.getItem?.(DISCORD_SEEN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

export function rememberPingKey(key, storage = null) {
  const store = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
  const seen = loadSeenPingKeys(store);
  seen.add(key);
  try {
    store?.setItem?.(DISCORD_SEEN_KEY, JSON.stringify([...seen].slice(-80)));
  } catch {
    /* quota / private */
  }
  return seen;
}

export function rememberDiscordSeat(fields, storage = null) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  try {
    store?.setItem?.(DISCORD_SEAT_KEY, JSON.stringify({
      discordUserId: fields?.discordUserId || '',
      discordName: fields?.discordName || '',
    }));
  } catch {
    /* ignore */
  }
}

export function readRememberedDiscordSeat(storage = null) {
  const store = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  try {
    const raw = store?.getItem?.(DISCORD_SEAT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return { discordUserId: '', discordName: '' };
    return parseDiscordSeatInput(parsed.discordUserId || parsed.discordName || '');
  } catch {
    return { discordUserId: '', discordName: '' };
  }
}

export async function postDiscordWebhook(url, content, fetchImpl) {
  const resolved = readDiscordWebhookUrl({ windowUrl: url, envUrl: url });
  if (!resolved) return { ok: false, reason: 'unconfigured' };
  const fetchFn = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!fetchFn) return { ok: false, reason: 'no-fetch' };
  try {
    await fetchFn(resolved, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export function discordPingPayload({
  player = null,
  gameId = '',
  turnIndex = 0,
  seatId = '',
  phase = '',
  deepLink = '',
  uxMode = '',
} = {}) {
  return {
    gameId: String(gameId || ''),
    turnIndex: Number(turnIndex) || 0,
    seatId: String(seatId || player?.id || player?.oderId || ''),
    discordUserId: player?.discordUserId || '',
    faction: factionLabelOf(player),
    phase: String(phase || ''),
    deepLink: String(deepLink || ''),
    uxMode: String(uxMode || ''),
    isAI: !!player?.isAI,
  };
}

export async function postDiscordTurnPingViaProxy(apiUrl, payload, fetchImpl) {
  const fetchFn = fetchImpl || (typeof fetch === 'function' ? fetch : null);
  if (!fetchFn) return { ok: false, reason: 'no-fetch' };
  const path = String(apiUrl || DISCORD_TURN_PING_API);
  try {
    const res = await fetchFn(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    if (!res) return { ok: false, reason: 'soft-fail' };
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (body && typeof body.ok === 'boolean') return body;
    if (res.status === 404) return { ok: false, reason: 'unconfigured' };
    if (!res.ok) return { ok: false, reason: 'soft-fail' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export function maybePostDiscordTurnPing({
  player = null,
  gameId = '',
  turnIndex = 0,
  seatId = '',
  phase = '',
  deepLink = '',
  uxMode = '',
  seen = null,
  storage = null,
  post = null,
  viaProxy = true,
  proxyUrl = DISCORD_TURN_PING_API,
  proxyPost = postDiscordTurnPingViaProxy,
} = {}) {
  try {
    const store = storage;
    const seenKeys = seen || loadSeenPingKeys(store);
    const gate = shouldPingHumanSeat({
      player, gameId, turnIndex, seatId, seen: seenKeys,
    });
    if (!gate.ok) return { ok: false, reason: gate.reason };
    const content = buildDiscordTurnContent({
      discordUserId: player?.discordUserId,
      faction: factionLabelOf(player),
      phase,
      deepLink,
    });
    const payload = discordPingPayload({
      player, gameId, turnIndex, seatId, phase, deepLink, uxMode,
    });

    const finish = (posted) => {
      rememberPingKey(gate.key, store);
      if (posted && typeof posted.then === 'function') {
        return posted.catch(() => ({ ok: false, reason: 'soft-fail' }));
      }
      return posted;
    };

    // Harness only. Production never reads a webhook URL in the browser.
    if (typeof post === 'function') {
      return finish(post(null, content));
    }

    if (viaProxy !== false) {
      const posted = proxyPost(proxyUrl, payload);
      if (posted && typeof posted.then === 'function') {
        return posted.then((result) => {
          if (result?.ok) {
            rememberPingKey(gate.key, store);
            return result;
          }
          return result || { ok: false, reason: 'unconfigured' };
        }).catch(() => ({ ok: false, reason: 'soft-fail' }));
      }
      if (posted?.ok) {
        rememberPingKey(gate.key, store);
        return posted;
      }
      if (posted) return posted;
    }

    return { ok: false, reason: 'unconfigured' };
  } catch {
    return { ok: false, reason: 'soft-fail' };
  }
}

export function seatKeyOf(gameState) {
  const p = gameState?.currentPlayer;
  return p?.id || p?.oderId || '';
}

export function bindDiscordTurnPing(gameState, {
  getGameId = () => '',
  getUxMode = () => 'classic',
  getOrigin = () => 'https://tactical-risk20.vercel.app/',
  isApplyingRemote = () => false,
  post = null,
  storage = null,
  onResult = null,
} = {}) {
  if (!gameState || typeof gameState.subscribe !== 'function') {
    return () => {};
  }
  let lastSeat = seatKeyOf(gameState);
  return gameState.subscribe(() => {
    try {
      const nextSeat = seatKeyOf(gameState);
      if (!nextSeat || nextSeat === lastSeat) return;
      const hadPrev = !!lastSeat;
      lastSeat = nextSeat;
      if (!hadPrev) return;
      if (isApplyingRemote()) return;
      const player = gameState.currentPlayer;
      const uxMode = getUxMode();
      const result = maybePostDiscordTurnPing({
        player,
        gameId: getGameId() || '',
        turnIndex: turnIndexOf({
          round: gameState.round,
          currentPlayerIndex: gameState.currentPlayerIndex,
        }),
        seatId: nextSeat,
        phase: phaseLabelOf(gameState),
        deepLink: buildDeepLink({
          origin: getOrigin(),
          uxMode,
          gameCode: getGameId(),
        }),
        uxMode,
        storage,
        post,
      });
      const report = (value) => {
        try { onResult?.(value); } catch { /* diagnostics only */ }
        return value;
      };
      if (result && typeof result.then === 'function') {
        result.then(report).catch(() => report({ ok: false, reason: 'soft-fail' }));
      } else {
        report(result);
      }
    } catch {
      /* never block the game */
    }
  });
}
