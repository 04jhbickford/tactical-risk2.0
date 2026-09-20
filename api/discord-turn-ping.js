// Vercel serverless Discord turn ping.
// Reads DISCORD_TURN_WEBHOOK_URL from server env — never ships to the client.
// Soft-fail only. POST { gameId, turnIndex, seatId, discordUserId, faction, phase, deepLink }.

const seen = new Set();

function normalizeDiscordSnowflake(raw) {
  const s = String(raw ?? '').trim();
  if (/^\d{5,22}$/.test(s)) return s;
  const mention = s.match(/^<@!?(\d{5,22})>$/);
  return mention ? mention[1] : '';
}

function pingDedupeKey({ gameId = '', turnIndex = 0, seatId = '' } = {}) {
  return `${gameId || ''}|${turnIndex ?? ''}|${seatId || ''}`;
}

function buildDiscordTurnContent({
  discordUserId = '',
  faction = '',
  phase = '',
  deepLink = '',
} = {}) {
  const snowflake = normalizeDiscordSnowflake(discordUserId);
  const head = snowflake
    ? `<@${snowflake}> your turn — ${faction} · ${phase}`
    : `your turn — ${faction} · ${phase}`;
  return [head, deepLink].filter(Boolean).join('\n');
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
    deepLink: body.deepLink || '',
  });

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
