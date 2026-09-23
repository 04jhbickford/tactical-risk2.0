// Discord turn ping for Classic + New UX. Soft-fail only — never blocks play.
// Production path: POST /api/discord-turn-ping with the seat payload.
// The webhook lives in Vercel env DISCORD_TURN_WEBHOOK_URL — never on the client.
// Dedupe key: (gameId, turnIndex, seatId). Skip AI. Mention the next human
// by snowflake (explicit id, else the alias map). Summarize the prior seat
// from turnEvents: who took which territory from whom, and units lost by
// power. Untagged fallback when no snowflake matches. Probe and test
// payloads never post.

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

export const DISCORD_TURN_CONTENT_MAX = 1800;

// Board Game Central. Explicit discordUserId wins; this map is the fallback
// when the lobby only stored a display name, username, seat label, or handle.
export const DISCORD_ALIAS_MAP = Object.freeze([
  {
    snowflake: '261711980526567428',
    aliases: ['bastion', 'crusader_bastion', 'sean', 'benson'],
  },
  {
    snowflake: '600101834727620620',
    aliases: ['rwts', 'robert', 'watts', 'robfox007'],
  },
]);

const UNIT_LOSS_LABELS = {
  infantry: 'inf',
  armour: 'tank',
  tank: 'tank',
  artillery: 'art',
  fighter: 'ftr',
  bomber: 'bmr',
  tacticalBomber: 'tac',
  transport: 'trn',
  transportPlane: 'tpt',
  submarine: 'sub',
  destroyer: 'dd',
  cruiser: 'ca',
  battleship: 'bb',
  carrier: 'cv',
  aaGun: 'aa',
  factory: 'fac',
};

function normAlias(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[_\-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function aliasTokens(raw) {
  return normAlias(raw).split(' ').filter(Boolean);
}

export function lookupDiscordAlias(raw) {
  const tokens = new Set(aliasTokens(raw));
  if (!tokens.size) return '';
  for (const row of DISCORD_ALIAS_MAP) {
    for (const alias of row.aliases) {
      const need = aliasTokens(alias);
      if (need.length && need.every((token) => tokens.has(token))) return row.snowflake;
    }
  }
  return '';
}

function identityCandidates(source) {
  if (source == null) return [];
  if (typeof source === 'string') return [source];
  return [
    source.discordUserId,
    source.discordName,
    source.discordHandle,
    source.displayName,
    source.name,
    source.username,
    source.seatLabel,
    source.label,
    source.id,
  ];
}

export function resolveDiscordSnowflake(source) {
  const fields = identityCandidates(source);
  const explicit = normalizeDiscordSnowflake(
    source && typeof source === 'object' ? source.discordUserId : '',
  );
  if (explicit) return explicit;
  for (const raw of fields) {
    const id = normalizeDiscordSnowflake(raw);
    if (id) return id;
  }
  for (const raw of fields) {
    const hit = lookupDiscordAlias(raw);
    if (hit) return hit;
  }
  return '';
}

function parseLossMap(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw <= 0) return null;
    return { bare: raw, types: null };
  }
  if (typeof raw === 'string') {
    if (!/^\d+$/.test(raw.trim())) return null;
    const n = Number(raw);
    return n > 0 ? { bare: n, types: null } : null;
  }
  if (Array.isArray(raw)) {
    const types = {};
    for (const row of raw) {
      const type = row?.type;
      const n = Number(row?.quantity ?? row?.count);
      if (!type || !Number.isFinite(n) || n <= 0) continue;
      types[type] = (types[type] || 0) + n;
    }
    return Object.keys(types).length ? { bare: 0, types } : null;
  }
  if (typeof raw === 'object') {
    const types = {};
    for (const [type, value] of Object.entries(raw)) {
      const n = Number(value);
      if (!type || !Number.isFinite(n) || n <= 0) continue;
      types[type] = (types[type] || 0) + n;
    }
    return Object.keys(types).length ? { bare: 0, types } : null;
  }
  return null;
}

function addLosses(bucket, raw) {
  const parsed = parseLossMap(raw);
  if (!parsed) return;
  if (parsed.types) {
    bucket.types = bucket.types || {};
    for (const [type, n] of Object.entries(parsed.types)) {
      bucket.types[type] = (bucket.types[type] || 0) + n;
    }
  }
  if (parsed.bare > 0) bucket.bare += parsed.bare;
}

const UNNAMED_POWER = new Set(['unknown', 'defender', 'attacker']);

function uniqueNames(list) {
  const out = [];
  const seen = new Set();
  for (const name of list) {
    const text = String(name || '').trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function powerLabel(raw) {
  const text = cleanBit(raw);
  if (!text || UNNAMED_POWER.has(text.toLowerCase())) return '';
  return text;
}

function emptyLossBucket() {
  return { bare: 0, types: null };
}

function formatUnitCounts(bucket) {
  if (!bucket) return '';
  const parts = [];
  if (bucket.types) {
    const rows = Object.entries(bucket.types)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    for (const [type, n] of rows) {
      parts.push(`${n} ${UNIT_LOSS_LABELS[type] || type}`);
    }
  }
  if (bucket.bare > 0) parts.push(String(bucket.bare));
  return parts.join(', ');
}

function eventInvolves(ev, actor) {
  if (!actor) return true;
  return [
    ev.playerId,
    ev.toPlayer,
    ev.fromPlayer,
    ev.attackerId,
    ev.defenderId,
    ev.attacker,
    ev.defender,
  ].some((value) => cleanBit(value) === actor);
}

function formatCapturePhrase(group) {
  const names = uniqueNames(group.territories);
  if (!names.length) return '';
  const shown = names.slice(0, 6);
  const extra = names.length - shown.length;
  const list = extra > 0 ? `${shown.join(', ')} +${extra}` : shown.join(', ');
  const taker = group.to ? `${group.to} took` : 'Took';
  const from = group.from ? ` from ${group.from}` : '';
  return `${taker} ${list}${from}`;
}

function formatCaptures(captures) {
  const groups = [];
  const index = new Map();
  for (const row of captures) {
    const key = `${row.to}\n${row.from}`;
    let group = index.get(key);
    if (!group) {
      group = { to: row.to, from: row.from, territories: [] };
      index.set(key, group);
      groups.push(group);
    }
    group.territories.push(row.territory);
  }
  return groups.map(formatCapturePhrase).filter(Boolean).join(', ');
}

function formatLossLine(losses) {
  const parts = [];
  for (const [power, bucket] of losses) {
    const counts = formatUnitCounts(bucket);
    if (!counts) continue;
    parts.push(`${power} ${counts}`);
  }
  if (!parts.length) return '';
  return `Lost: ${parts.join(', ')}`;
}

export function formatTurnPingSummary(events, { actorId = '' } = {}) {
  if (!Array.isArray(events) || events.length === 0) return '';
  const actor = cleanBit(actorId);
  const rows = events.filter((ev) => ev && typeof ev === 'object' && eventInvolves(ev, actor));
  const captureByTerritory = new Map();
  for (const ev of rows) {
    if (ev.type !== 'territory_captured') continue;
    const territory = cleanBit(ev.territory);
    if (!territory) continue;
    captureByTerritory.set(territory, {
      territory,
      to: powerLabel(ev.toPlayer) || powerLabel(ev.playerId),
      from: powerLabel(ev.fromPlayer),
    });
  }

  const losses = new Map();
  const bucketFor = (name) => {
    const power = powerLabel(name);
    if (!power) return null;
    if (!losses.has(power)) losses.set(power, emptyLossBucket());
    return losses.get(power);
  };

  for (const ev of rows) {
    if (ev.type !== 'combat') continue;
    const capture = captureByTerritory.get(cleanBit(ev.territory));
    const attacker = powerLabel(ev.attackerId)
      || powerLabel(ev.playerId)
      || capture?.to
      || powerLabel(ev.attacker);
    const defender = powerLabel(ev.defenderId)
      || capture?.from
      || powerLabel(ev.defender);
    const attackerBucket = bucketFor(attacker);
    const defenderBucket = bucketFor(defender);
    if (attackerBucket) addLosses(attackerBucket, ev.attackerLosses);
    if (defenderBucket) addLosses(defenderBucket, ev.defenderLosses);
  }

  return [
    formatCaptures([...captureByTerritory.values()]),
    formatLossLine(losses),
  ].filter(Boolean).join(' · ');
}

const PROBE_GAME_ID = /^(probe|test|testing|health|healthcheck|health-check|daily-review|dailyreview|ping)([\s._-].*)?$/i;
const PROBE_TEXT = /\bprobe\b|daily\s*review|health[-\s]?check/i;

export function isDiscordTurnProbe({
  gameId = '',
  faction = '',
  phase = '',
  summary = '',
  content = '',
  seatId = '',
  displayName = '',
  message = '',
} = {}) {
  const id = cleanBit(gameId);
  if (id && (PROBE_GAME_ID.test(id) || PROBE_TEXT.test(id))) return true;
  const blob = [faction, phase, summary, content, seatId, displayName, message]
    .map((value) => cleanBit(value))
    .filter(Boolean)
    .join('\n');
  return PROBE_TEXT.test(blob);
}

export function turnEventCount(gameState) {
  if (!gameState) return 0;
  if (typeof gameState.getTurnEventsLastIndex === 'function') {
    const n = Number(gameState.getTurnEventsLastIndex());
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return Array.isArray(gameState.turnEvents) ? gameState.turnEvents.length : 0;
}

export function turnEventsSince(gameState, index) {
  if (!gameState) return [];
  const start = Math.max(0, Number(index) || 0);
  if (typeof gameState.getTurnEventsSince === 'function') {
    const rows = gameState.getTurnEventsSince(start);
    return Array.isArray(rows) ? rows : [];
  }
  const all = Array.isArray(gameState.turnEvents) ? gameState.turnEvents : [];
  return all.slice(Math.min(start, all.length));
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
  // Unified shell strips ?ux= on load. The notice link is the game code only.
  void uxMode;
  if (gameCode) url.searchParams.set('code', String(gameCode).toUpperCase());
  return url.toString();
}

function cleanBit(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

export function buildDiscordTurnContent({
  discordUserId = '',
  faction = '',
  phase = '',
  deepLink = '',
  summary = '',
  displayName = '',
  username = '',
  discordName = '',
  seatLabel = '',
} = {}) {
  const snowflake = resolveDiscordSnowflake({
    discordUserId,
    displayName,
    name: displayName,
    username,
    discordName,
    seatLabel,
  });
  const bits = [cleanBit(faction) || 'seat'];
  const phaseBit = cleanBit(phase);
  if (phaseBit) bits.push(phaseBit);
  const headText = bits.join(' · ');
  const link = cleanBit(deepLink);
  let sum = cleanBit(summary);
  const prefix = snowflake ? `<@${snowflake}> ` : '';
  const linkPart = link ? ` · ${link}` : '';
  let line = sum ? `${prefix}${headText} · ${sum}${linkPart}` : `${prefix}${headText}${linkPart}`;
  if (line.length > DISCORD_TURN_CONTENT_MAX && sum) {
    const budget = DISCORD_TURN_CONTENT_MAX - prefix.length - headText.length - linkPart.length - 3;
    if (budget > 8) {
      sum = `${sum.slice(0, budget - 1).trimEnd()}…`;
      line = `${prefix}${headText} · ${sum}${linkPart}`;
    } else {
      line = `${prefix}${headText}${linkPart}`;
    }
  }
  if (line.length > DISCORD_TURN_CONTENT_MAX) {
    line = `${line.slice(0, DISCORD_TURN_CONTENT_MAX - 1)}…`;
  }
  return line;
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
  summary = '',
} = {}) {
  return {
    gameId: String(gameId || ''),
    turnIndex: Number(turnIndex) || 0,
    seatId: String(seatId || player?.id || player?.oderId || ''),
    discordUserId: resolveDiscordSnowflake(player),
    displayName: player?.displayName || player?.name || '',
    username: player?.username || '',
    discordName: player?.discordName || player?.discordHandle || '',
    seatLabel: player?.seatLabel || player?.label || player?.id || '',
    faction: factionLabelOf(player),
    phase: String(phase || ''),
    summary: String(summary || ''),
    deepLink: String(deepLink || ''),
    uxMode: String(uxMode || ''),
    isAI: !!player?.isAI,
  };
}

export async function postDiscordTurnPingViaProxy(apiUrl, payload, fetchImpl) {
  if (isDiscordTurnProbe(payload || {})) return { ok: false, reason: 'skip-probe' };
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
  summary = '',
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
    if (isDiscordTurnProbe({
      gameId,
      seatId: seatId || player?.id || player?.oderId || '',
      faction: factionLabelOf(player),
      phase,
      summary,
      displayName: player?.displayName || player?.name || '',
    })) {
      return { ok: false, reason: 'skip-probe' };
    }
    const discordUserId = resolveDiscordSnowflake(player);
    const content = buildDiscordTurnContent({
      discordUserId,
      faction: factionLabelOf(player),
      phase,
      summary,
      deepLink,
      displayName: player?.displayName || player?.name || '',
      username: player?.username || '',
      discordName: player?.discordName || player?.discordHandle || '',
      seatLabel: player?.seatLabel || player?.label || player?.id || '',
    });
    const payload = discordPingPayload({
      player, gameId, turnIndex, seatId, phase, deepLink, uxMode, summary,
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
  let eventCursor = turnEventCount(gameState);
  return gameState.subscribe(() => {
    try {
      const nextSeat = seatKeyOf(gameState);
      if (!nextSeat || nextSeat === lastSeat) return;
      const prevSeat = lastSeat;
      const hadPrev = !!prevSeat;
      lastSeat = nextSeat;
      const priorEvents = turnEventsSince(gameState, eventCursor);
      eventCursor = turnEventCount(gameState);
      if (!hadPrev) return;
      if (isApplyingRemote()) return;
      const player = gameState.currentPlayer;
      const uxMode = getUxMode();
      const summary = formatTurnPingSummary(priorEvents, { actorId: prevSeat });
      const result = maybePostDiscordTurnPing({
        player,
        gameId: getGameId() || '',
        turnIndex: turnIndexOf({
          round: gameState.round,
          currentPlayerIndex: gameState.currentPlayerIndex,
        }),
        seatId: nextSeat,
        phase: phaseLabelOf(gameState),
        summary,
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
