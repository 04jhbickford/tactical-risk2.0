// Vercel serverless Discord turn ping.
// Reads DISCORD_TURN_WEBHOOK_URL from server env (Preview + Production).
// Never ships the URL to the client. Never logs or echoes it.
// Soft-fail only (always 200 for POST). Body: gameId, turnIndex, seatId,
// discordUserId, faction, phase, summary, deepLink, actorName, actorFaction.
// Name fields are a fallback when discordUserId is empty. The header is the
// recipient (displayName + faction + phase). actorName is the legacy
// finisher field and does not override that header. It is not the mention.

const seen = new Set();
const CONTENT_MAX = 1800;
const MEMBER_CACHE_MS = 10 * 60 * 1000;
const memberIdCache = new Map();

const DISCORD_ALIAS_MAP = Object.freeze([
  {
    snowflake: '261711980526567428',
    aliases: ['bastion', 'crusader_bastion', 'sean', 'benson'],
  },
  {
    snowflake: '600101834727620620',
    aliases: ['rwts', 'robert', 'watts', 'robfox007', 'robert007', 'robfox'],
  },
]);

function normalizeDiscordSnowflake(raw) {
  const s = String(raw ?? '').trim();
  if (/^\d{5,22}$/.test(s)) return s;
  const mention = s.match(/^<@!?(\d{5,22})>$/);
  return mention ? mention[1] : '';
}

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

// Whole tokens only. Trailing digits fold (robert007 → robert, bastion2 → bastion).
// A leftover single letter is not a token, and nothing matches by substring.
function aliasMatchTokens(raw) {
  const tokens = new Set();
  for (const token of aliasTokens(raw)) {
    if (token.length < 2) continue;
    tokens.add(token);
    const stripped = token.replace(/\d+$/, '');
    if (stripped.length >= 2 && stripped !== token) tokens.add(stripped);
  }
  return tokens;
}

function lookupDiscordAlias(raw) {
  const tokens = aliasMatchTokens(raw);
  if (!tokens.size) return '';
  for (const row of DISCORD_ALIAS_MAP) {
    for (const alias of row.aliases) {
      const need = aliasTokens(alias).filter((token) => token.length >= 2);
      if (!need.length) continue;
      const matched = need.every((token) => {
        if (tokens.has(token)) return true;
        const stripped = token.replace(/\d+$/, '');
        return stripped.length >= 2 && tokens.has(stripped);
      });
      if (matched) return row.snowflake;
    }
  }
  return '';
}

function resolveDiscordSnowflake(body) {
  const explicit = normalizeDiscordSnowflake(body?.discordUserId);
  if (explicit) return explicit;
  const fields = [
    body?.discordUserId,
    body?.discordName,
    body?.displayName,
    body?.username,
    body?.seatLabel,
    body?.name,
  ];
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

function exactMemberIds(rows, query) {
  if (!Array.isArray(rows)) return [];
  const want = String(query || '').trim().toLowerCase();
  if (!want) return [];
  const ids = [];
  for (const row of rows) {
    const user = row?.user;
    const fields = [user?.username, user?.global_name, row?.nick];
    const exact = fields.some((value) => String(value ?? '').trim().toLowerCase() === want);
    if (!exact) continue;
    const id = normalizeDiscordSnowflake(user?.id);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function readBotEnv() {
  const token = String(process.env.DISCORD_BOT_TOKEN || '').trim();
  const guildId = String(process.env.DISCORD_GUILD_ID || '').trim();
  if (!token || !/^\d{5,22}$/.test(guildId)) return null;
  return { token, guildId };
}

async function lookupGuildMemberId(name) {
  const env = readBotEnv();
  const query = String(name ?? '').trim().replace(/^@+/, '');
  if (!env || !query) return '';
  const key = `${env.guildId}\n${query.toLowerCase()}`;
  const cached = memberIdCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.id;
  if (cached) memberIdCache.delete(key);

  const url = new URL(`https://discord.com/api/v10/guilds/${env.guildId}/members/search`);
  url.searchParams.set('query', query);
  url.searchParams.set('limit', '5');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1500);
  if (typeof timer.unref === 'function') timer.unref();
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bot ${env.token}` },
      signal: ctrl.signal,
    });
    if (!res?.ok) return '';
    const rows = await res.json();
    const ids = exactMemberIds(rows, query);
    if (ids.length !== 1) return '';
    memberIdCache.set(key, { id: ids[0], expires: Date.now() + MEMBER_CACHE_MS });
    return ids[0];
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function lookupDiscordMemberMention(body) {
  if (!readBotEnv()) return '';
  const tried = new Set();
  for (const raw of [body?.discordName, body?.displayName]) {
    const name = String(raw ?? '').trim();
    if (!name) continue;
    const dedupe = name.toLowerCase();
    if (tried.has(dedupe)) continue;
    tried.add(dedupe);
    const id = await lookupGuildMemberId(name);
    if (id) return id;
  }
  return '';
}

function allowedMentionsFor(snowflake) {
  if (snowflake) return { parse: [], users: [snowflake] };
  return { parse: [] };
}

function cleanBit(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

function pingDedupeKey({ gameId = '', turnIndex = 0, seatId = '' } = {}) {
  return `${gameId || ''}|${turnIndex ?? ''}|${seatId || ''}`;
}

const PROBE_GAME_ID = /^(probe|test|testing|health|healthcheck|health-check|daily-review|dailyreview|ping)([\s._-].*)?$/i;
const PROBE_TEXT = /\bprobe\b|daily\s*review|health[-\s]?check/i;

const POWER_WORDS = {
  germans: 'Germany',
  germany: 'Germany',
  german: 'Germany',
  british: 'UK',
  uk: 'UK',
  russians: 'Russia',
  russia: 'Russia',
  russian: 'Russia',
  japanese: 'Japan',
  japan: 'Japan',
  americans: 'US',
  american: 'US',
  us: 'US',
  usa: 'US',
};

const NO_UNITS_LINE = '-No units lost';
const NO_TERRITORIES_LINE = '-No territories lost';

function powerWord(raw) {
  const text = cleanBit(raw);
  if (!text) return '';
  return POWER_WORDS[text.toLowerCase()] || text;
}

function phaseWithSuffix(phase) {
  const ph = cleanBit(phase);
  if (!ph) return '';
  if (/phase$/i.test(ph)) return ph;
  return `${ph} Phase`;
}

function formatPingHeader({ displayName = '', power = '', phase = '' } = {}) {
  const pow = powerWord(power);
  let name = cleanBit(displayName);
  if (!name || (pow && name.toLowerCase() === pow.toLowerCase())) name = '';
  else if (POWER_WORDS[name.toLowerCase()] && powerWord(name) === pow) name = '';
  const tail = [pow, phaseWithSuffix(phase)].filter(Boolean).join(' ');
  if (name && tail) return `${name} - ${tail}`;
  return name || tail || 'seat';
}

function clampDiscordContent(lines, max) {
  const kept = lines.filter((line) => line != null && String(line).length);
  const join = (rows) => rows.join('\n');
  if (join(kept).length <= max) return join(kept);
  const hasLink = /^https?:\/\//i.test(kept[kept.length - 1] || '');
  const link = hasLink ? kept[kept.length - 1] : '';
  const body = hasLink ? kept.slice(0, -1) : kept.slice();
  const originalBodyLen = body.length;
  while (body.length > 1 && join([...body, link].filter(Boolean)).length > max) {
    body.pop();
  }
  if (body.length < originalBodyLen) {
    const marked = [...body, '…', link].filter(Boolean);
    if (join(marked).length <= max) return join(marked);
  }
  const rows = [...body, link].filter(Boolean);
  if (join(rows).length <= max) return join(rows);
  const tail = link ? `\n${link}` : '';
  const budget = max - tail.length;
  const cut = `${body.join('\n').slice(0, Math.max(0, budget - 1)).trimEnd()}…`;
  const text = `${cut}${tail}`;
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function isDiscordTurnProbe(body) {
  const id = cleanBit(body?.gameId);
  if (id && (PROBE_GAME_ID.test(id) || PROBE_TEXT.test(id))) return true;
  const blob = [
    body?.faction,
    body?.phase,
    body?.summary,
    body?.content,
    body?.seatId,
    body?.displayName,
    body?.message,
    body?.discordName,
    body?.username,
    body?.actorName,
    body?.actorFaction,
  ].map((value) => cleanBit(value)).filter(Boolean).join('\n');
  return PROBE_TEXT.test(blob);
}

function buildDiscordTurnContent({
  discordUserId = '',
  faction = '',
  phase = '',
  deepLink = '',
  summary = '',
  displayName = '',
  username = '',
  discordName = '',
  seatLabel = '',
  actorName = '',
  actorFaction = '',
} = {}) {
  const snowflake = resolveDiscordSnowflake({
    discordUserId,
    displayName,
    username,
    discordName,
    seatLabel,
    name: displayName,
  });
  // Header is the recipient. actorName must not override displayName.
  const header = formatPingHeader({
    displayName: displayName || actorName,
    power: faction || actorFaction,
    phase,
  });
  const sum = String(summary ?? '').replace(/\r\n/g, '\n').trim()
    || `${NO_UNITS_LINE}\n${NO_TERRITORIES_LINE}`;
  const link = cleanBit(deepLink);
  return clampDiscordContent([
    snowflake ? `<@${snowflake}>` : '',
    header,
    ...sum.split('\n'),
    link,
  ], CONTENT_MAX);
}

function readWebhookUrl() {
  const url = String(process.env.DISCORD_TURN_WEBHOOK_URL || '').trim();
  if (!url) return null;
  if (!/^https:\/\//i.test(url)) return null;
  return url;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, { ok: false, reason: 'method' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!body || typeof body !== 'object') body = {};

  if (body.isAI) {
    json(res, 200, { ok: false, reason: 'skip-ai' });
    return;
  }

  const gameId = String(body.gameId || '').trim();
  const seatId = String(body.seatId || '').trim();
  const turnIndex = Number(body.turnIndex) || 0;
  if (!gameId || !seatId) {
    json(res, 200, { ok: false, reason: 'incomplete' });
    return;
  }

  if (isDiscordTurnProbe(body)) {
    json(res, 200, { ok: false, reason: 'skip-probe' });
    return;
  }

  const key = pingDedupeKey({ gameId, turnIndex, seatId });
  if (seen.has(key)) {
    json(res, 200, { ok: false, reason: 'deduped' });
    return;
  }

  const webhook = readWebhookUrl();
  if (!webhook) {
    json(res, 200, { ok: false, reason: 'unconfigured' });
    return;
  }

  const identity = {
    discordUserId: body.discordUserId,
    displayName: body.displayName || '',
    username: body.username || '',
    discordName: body.discordName || '',
    seatLabel: body.seatLabel || '',
    name: body.displayName || '',
  };
  let mentionId = resolveDiscordSnowflake(identity);
  const contentFields = {
    discordUserId: mentionId || body.discordUserId,
    faction: body.faction || seatId,
    phase: body.phase || '',
    summary: body.summary || '',
    deepLink: body.deepLink || '',
    displayName: body.displayName || '',
    username: body.username || '',
    discordName: body.discordName || '',
    seatLabel: body.seatLabel || '',
    actorName: body.actorName || '',
    actorFaction: body.actorFaction || '',
  };
  let content = buildDiscordTurnContent(contentFields);

  if (isDiscordTurnProbe({ ...body, content })) {
    json(res, 200, { ok: false, reason: 'skip-probe' });
    return;
  }

  if (!mentionId) {
    mentionId = await lookupDiscordMemberMention(body);
    if (mentionId) {
      content = buildDiscordTurnContent({ ...contentFields, discordUserId: mentionId });
    }
  }

  const allowed_mentions = allowedMentionsFor(mentionId);

  try {
    const posted = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, allowed_mentions }),
    });
    if (!posted.ok) {
      json(res, 200, { ok: false, reason: 'soft-fail' });
      return;
    }
    seen.add(key);
    if (seen.size > 200) {
      const first = seen.values().next().value;
      seen.delete(first);
    }
    json(res, 200, { ok: true, reason: 'sent' });
  } catch {
    json(res, 200, { ok: false, reason: 'network' });
  }
};
