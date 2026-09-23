// Vercel serverless Discord turn ping.
// Reads DISCORD_TURN_WEBHOOK_URL from server env (Preview + Production).
// Never ships the URL to the client. Never logs or echoes it.
// Soft-fail only (always 200 for POST). Body: gameId, turnIndex, seatId,
// discordUserId, faction, phase, summary, deepLink. Name fields are a
// fallback when discordUserId is empty.

const seen = new Set();
const CONTENT_MAX = 1800;

const DISCORD_ALIAS_MAP = Object.freeze([
  {
    snowflake: '261711980526567428',
    aliases: ['bastion', 'crusader_bastion', 'sean', 'benson'],
  },
  {
    snowflake: '600101834727620620',
    aliases: ['rwts', 'robert', 'watts', 'robfox007'],
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

function lookupDiscordAlias(raw) {
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

function cleanBit(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

function pingDedupeKey({ gameId = '', turnIndex = 0, seatId = '' } = {}) {
  return `${gameId || ''}|${turnIndex ?? ''}|${seatId || ''}`;
}

const PROBE_GAME_ID = /^(probe|test|testing|health|healthcheck|health-check|daily-review|dailyreview|ping)([\s._-].*)?$/i;
const PROBE_TEXT = /\bprobe\b|daily\s*review|health[-\s]?check/i;

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
} = {}) {
  const snowflake = resolveDiscordSnowflake({
    discordUserId,
    displayName,
    username,
    discordName,
    seatLabel,
    name: displayName,
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
  if (line.length > CONTENT_MAX && sum) {
    const budget = CONTENT_MAX - prefix.length - headText.length - linkPart.length - 3;
    if (budget > 8) {
      sum = `${sum.slice(0, budget - 1).trimEnd()}…`;
      line = `${prefix}${headText} · ${sum}${linkPart}`;
    } else {
      line = `${prefix}${headText}${linkPart}`;
    }
  }
  if (line.length > CONTENT_MAX) {
    line = `${line.slice(0, CONTENT_MAX - 1)}…`;
  }
  return line;
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

  const content = buildDiscordTurnContent({
    discordUserId: body.discordUserId,
    faction: body.faction || seatId,
    phase: body.phase || '',
    summary: body.summary || '',
    deepLink: body.deepLink || '',
    displayName: body.displayName || '',
    username: body.username || '',
    discordName: body.discordName || '',
    seatLabel: body.seatLabel || '',
  });

  if (isDiscordTurnProbe({ ...body, content })) {
    json(res, 200, { ok: false, reason: 'skip-probe' });
    return;
  }

  try {
    const posted = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
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
