// Discord turn ping for Classic + New UX. Soft-fail only — never blocks play.
// Production path: POST /api/discord-turn-ping with the seat payload.
// The webhook lives in Vercel env DISCORD_TURN_WEBHOOK_URL — never on the client.
// Dedupe key: (gameId, turnIndex, seatId). Skip AI. Mention the next human
// by snowflake (explicit id, else the alias map). The header is that human
// (display name - power - phase), not the seat that just finished. The body
// is Rob's multiline shape for what that human lost since their previous
// turn ended: units lost (place + who inflicted), territories lost (who
// took them), or the two quiet lines. Counts and places come from
// turnEvents only. Untagged fallback when no snowflake matches.
// Probe and test payloads never post.

import { formatUnitName } from '../utils/unitNames.js';

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

// Rob's sea line is "1x Carrier, 2x fighters, 1x battleship" and the land
// line is "8x Infantry, 5x tanks". Catalog order keeps that sequence.
const UNIT_LINE_ORDER = [
  'infantry',
  'artillery',
  'armour',
  'tank',
  'carrier',
  'fighter',
  'tacticalBomber',
  'bomber',
  'battleship',
  'cruiser',
  'destroyer',
  'submarine',
  'transport',
  'transportPlane',
  'aaGun',
  'factory',
];

const POWER_WORDS = {
  germans: { name: 'Germany', adj: 'German' },
  germany: { name: 'Germany', adj: 'German' },
  german: { name: 'Germany', adj: 'German' },
  british: { name: 'UK', adj: 'British' },
  uk: { name: 'UK', adj: 'British' },
  russians: { name: 'Russia', adj: 'Russian' },
  russia: { name: 'Russia', adj: 'Russian' },
  russian: { name: 'Russia', adj: 'Russian' },
  japanese: { name: 'Japan', adj: 'Japanese' },
  japan: { name: 'Japan', adj: 'Japanese' },
  americans: { name: 'US', adj: 'American' },
  american: { name: 'US', adj: 'American' },
  us: { name: 'US', adj: 'American' },
  usa: { name: 'US', adj: 'American' },
};

const NO_UNITS_LINE = '-No units lost';
const NO_TERRITORIES_LINE = '-No territories lost';

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

function emptyLossBucket() {
  return { bare: 0, types: null };
}

function unitOrder(type) {
  const idx = UNIT_LINE_ORDER.indexOf(type);
  return idx === -1 ? UNIT_LINE_ORDER.length : idx;
}

function pluralUnit(name, n) {
  if (!name) return '';
  if (n === 1) return name;
  if (name === 'Infantry' || name === 'Artillery') return name;
  if (/s$/i.test(name)) return name;
  return `${name}s`;
}

function formatUnitCounts(bucket) {
  if (!bucket) return '';
  const parts = [];
  if (bucket.types) {
    const rows = Object.entries(bucket.types)
      .filter(([, n]) => n > 0)
      .sort((a, b) => unitOrder(a[0]) - unitOrder(b[0]) || a[0].localeCompare(b[0]));
    for (const [type, n] of rows) {
      const word = pluralUnit(formatUnitName(type), n);
      if (word) parts.push(`${n}x ${word}`);
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

export function powerWord(raw) {
  const text = cleanBit(raw);
  if (!text) return '';
  const hit = POWER_WORDS[text.toLowerCase()];
  return hit ? hit.name : text;
}

function powerAdj(factionId) {
  const text = cleanBit(factionId);
  if (!text) return '';
  return POWER_WORDS[text.toLowerCase()]?.adj || '';
}

function difficultyWord(raw) {
  const key = cleanBit(raw).toLowerCase();
  if (key === 'easy') return 'Easy';
  if (key === 'medium') return 'Medium';
  if (key === 'hard') return 'Hard';
  return '';
}

function isStockAiName(raw) {
  return /^(easy|medium|hard|ai)\s+bot$/i.test(cleanBit(raw));
}

function isBlankSideName(name, factionId) {
  const text = cleanBit(name);
  if (!text || UNNAMED_POWER.has(text.toLowerCase())) return true;
  if (factionId && text === cleanBit(factionId)) return true;
  const named = POWER_WORDS[text.toLowerCase()];
  const faction = POWER_WORDS[cleanBit(factionId).toLowerCase()];
  if (named && faction && named.name === faction.name) return true;
  return false;
}

function findPlayer(players, id) {
  const key = cleanBit(id);
  if (!key || !Array.isArray(players)) return null;
  return players.find((p) => p && (
    cleanBit(p.id) === key
    || cleanBit(p.oderId) === key
    || cleanBit(p.factionId) === key
  )) || null;
}

function composeAiLabel(factionId, difficulty) {
  const adj = powerAdj(factionId);
  const diff = difficultyWord(difficulty);
  if (adj && diff) return `${adj} ${diff} AI`;
  if (adj) return `${adj} AI`;
  if (diff) return `${diff} AI`;
  return '';
}

function joinNamePower(name, factionId) {
  const power = powerWord(factionId);
  const text = cleanBit(name);
  if (!text) return power || '';
  if (!power) return text;
  const parts = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (parts.includes(power.toLowerCase())) return text;
  return `${text} ${power}`;
}

export function sideLabel(id, fallbackName, players) {
  const rec = findPlayer(players, id);
  const factionId = rec?.id || rec?.factionId || id;
  if (rec?.isAI) {
    const custom = cleanBit(rec.displayName || rec.name);
    if (custom && !isStockAiName(custom) && !isBlankSideName(custom, factionId)) {
      return joinNamePower(custom, factionId);
    }
    const composed = composeAiLabel(factionId, rec.aiDifficulty);
    if (composed) return composed;
  }
  const fromRecord = cleanBit(rec?.displayName || rec?.name);
  const fallback = cleanBit(fallbackName);
  const name = !isBlankSideName(fromRecord, factionId)
    ? fromRecord
    : (isBlankSideName(fallback, factionId) ? '' : fallback);
  return joinNamePower(name, factionId);
}

export function turnPingHeaderIdentity(player, actorId = '') {
  const id = player?.id || player?.factionId || actorId || '';
  const power = powerWord(id);
  if (player?.isAI) {
    const custom = cleanBit(player.displayName || player.name);
    const displayName = (custom && !isStockAiName(custom) && !isBlankSideName(custom, id))
      ? custom
      : (composeAiLabel(id, player.aiDifficulty) || power);
    return { displayName, power };
  }
  const name = cleanBit(player?.displayName || player?.name);
  return {
    displayName: isBlankSideName(name, id) ? '' : name,
    power,
  };
}

function phaseWithSuffix(phase) {
  const ph = cleanBit(phase);
  if (!ph) return '';
  if (/phase$/i.test(ph)) return ph;
  return `${ph} Phase`;
}

export function formatPingHeader({ displayName = '', power = '', phase = '' } = {}) {
  const pow = powerWord(power);
  let name = cleanBit(displayName);
  if (!name || (pow && name.toLowerCase() === pow.toLowerCase())) name = '';
  else if (POWER_WORDS[name.toLowerCase()] && powerWord(name) === pow) name = '';
  const tail = [pow, phaseWithSuffix(phase)].filter(Boolean).join(' ');
  if (name && tail) return `${name} - ${tail}`;
  return name || tail || 'seat';
}

function formatUnitLossLine(bucket, place, opponent) {
  const counts = formatUnitCounts(bucket);
  if (!counts) return '';
  const where = cleanBit(place);
  const who = cleanBit(opponent);
  let line = `-${counts} lost`;
  if (where) line += ` ${where}`;
  if (who) line += ` - ${who}`;
  return line;
}

function formatTerritoryLine(territory, taker) {
  const name = cleanBit(territory);
  if (!name) return '';
  const who = cleanBit(taker);
  return who ? `-${name} Lost - ${who}` : `-${name} Lost`;
}

// Losses the ping recipient actually suffered. Opponent casualties and
// territories the recipient took are left out. Quiet input still yields
// the two Rob lines via formatTurnPingSummary.
export function formatRecipientLossSummary(events, { recipientId = '', players = [] } = {}) {
  const id = cleanBit(recipientId);
  const rows = Array.isArray(events)
    ? events.filter((ev) => ev && typeof ev === 'object')
    : [];
  const captureByTerritory = new Map();
  for (const ev of rows) {
    if (ev.type !== 'territory_captured') continue;
    const territory = cleanBit(ev.territory);
    if (!territory) continue;
    captureByTerritory.set(territory, {
      takerId: cleanBit(ev.toPlayer) || cleanBit(ev.playerId),
      fromId: cleanBit(ev.fromPlayer),
    });
  }
  const filtered = [];
  for (const ev of rows) {
    if (ev.type === 'territory_captured') {
      if (id && cleanBit(ev.fromPlayer) === id) filtered.push(ev);
      continue;
    }
    if (ev.type !== 'combat') continue;
    const place = cleanBit(ev.territory);
    const capture = place ? captureByTerritory.get(place) : null;
    const attackerId = cleanBit(ev.attackerId) || cleanBit(ev.playerId) || capture?.takerId || '';
    const defenderId = cleanBit(ev.defenderId) || capture?.fromId || '';
    if (id && attackerId === id) {
      filtered.push({ ...ev, attackerId, defenderId, defenderLosses: {} });
    } else if (id && defenderId === id) {
      filtered.push({ ...ev, attackerId, defenderId, attackerLosses: {} });
    }
  }
  return formatTurnPingSummary(filtered, { actorId: id, players });
}

export function formatTurnPingSummary(events, { actorId = '', players = [] } = {}) {
  const actor = cleanBit(actorId);
  const rows = Array.isArray(events)
    ? events.filter((ev) => ev && typeof ev === 'object' && eventInvolves(ev, actor))
    : [];

  const captureByTerritory = new Map();
  for (const ev of rows) {
    if (ev.type !== 'territory_captured') continue;
    const territory = cleanBit(ev.territory);
    if (!territory) continue;
    const takerId = cleanBit(ev.toPlayer) || cleanBit(ev.playerId);
    captureByTerritory.set(territory, {
      territory,
      takerId,
      fromId: cleanBit(ev.fromPlayer),
    });
  }

  const lossGroups = [];
  const lossIndex = new Map();
  const pushLoss = (raw, place, opponentId, opponentName) => {
    const probe = emptyLossBucket();
    addLosses(probe, raw);
    if (!formatUnitCounts(probe)) return;
    const where = cleanBit(place);
    const who = sideLabel(opponentId, opponentName, players);
    const key = `${where}\n${who}`;
    let group = lossIndex.get(key);
    if (!group) {
      group = { place: where, opponent: who, bucket: emptyLossBucket() };
      lossIndex.set(key, group);
      lossGroups.push(group);
    }
    addLosses(group.bucket, raw);
  };

  for (const ev of rows) {
    if (ev.type !== 'combat') continue;
    const place = cleanBit(ev.territory);
    const capture = captureByTerritory.get(place);
    const attackerId = cleanBit(ev.attackerId) || cleanBit(ev.playerId) || capture?.takerId || '';
    const defenderId = cleanBit(ev.defenderId) || capture?.fromId || '';
    const actorIsDefender = !!actor && defenderId === actor;
    const own = actorIsDefender
      ? { raw: ev.defenderLosses, opponentId: attackerId, opponentName: ev.attacker }
      : { raw: ev.attackerLosses, opponentId: defenderId, opponentName: ev.defender };
    const other = actorIsDefender
      ? { raw: ev.attackerLosses, opponentId: defenderId, opponentName: ev.defender }
      : { raw: ev.defenderLosses, opponentId: attackerId, opponentName: ev.attacker };
    pushLoss(own.raw, place, own.opponentId, own.opponentName);
    pushLoss(other.raw, place, other.opponentId, other.opponentName);
  }

  const unitLines = lossGroups
    .map((group) => formatUnitLossLine(group.bucket, group.place, group.opponent))
    .filter(Boolean);
  const territoryLines = [...captureByTerritory.values()]
    .map((row) => formatTerritoryLine(row.territory, sideLabel(row.takerId, '', players)))
    .filter(Boolean);

  return [
    ...(unitLines.length ? unitLines : [NO_UNITS_LINE]),
    ...(territoryLines.length ? territoryLines : [NO_TERRITORIES_LINE]),
  ].join('\n');
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
  actorName = '',
  actorFaction = '',
} = {}) {
  const id = cleanBit(gameId);
  if (id && (PROBE_GAME_ID.test(id) || PROBE_TEXT.test(id))) return true;
  const blob = [
    faction, phase, summary, content, seatId, displayName, message, actorName, actorFaction,
  ].map((value) => cleanBit(value)).filter(Boolean).join('\n');
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
  actorName = '',
  actorFaction = '',
} = {}) {
  const snowflake = resolveDiscordSnowflake({
    discordUserId,
    displayName,
    name: displayName,
    username,
    discordName,
    seatLabel,
  });
  // Header is the recipient. actorName is the legacy finisher field and
  // must not override a recipient display name / faction.
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
  ], DISCORD_TURN_CONTENT_MAX);
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
  actorName = '',
  actorFaction = '',
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
    actorName: String(actorName || ''),
    actorFaction: String(actorFaction || ''),
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
  actorName = '',
  actorFaction = '',
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
      actorName,
      actorFaction,
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
      actorName,
      actorFaction,
    });
    const payload = discordPingPayload({
      player, gameId, turnIndex, seatId, phase, deepLink, uxMode, summary,
      actorName, actorFaction,
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
  // Per-seat cursor: event index when that seat's previous turn ended.
  // Seeded at bind so a mid-game join does not replay earlier history.
  const bindCursor = turnEventCount(gameState);
  const seatCursors = new Map();
  const rememberSeat = (player, index) => {
    const id = player?.id || player?.oderId || '';
    if (id && !seatCursors.has(id)) seatCursors.set(id, index);
  };
  const playersAtBind = Array.isArray(gameState.players) ? gameState.players : [];
  for (const player of playersAtBind) rememberSeat(player, bindCursor);
  rememberSeat(gameState.currentPlayer, bindCursor);
  return gameState.subscribe(() => {
    try {
      const nextSeat = seatKeyOf(gameState);
      if (!nextSeat || nextSeat === lastSeat) return;
      const prevSeat = lastSeat;
      const hadPrev = !!prevSeat;
      lastSeat = nextSeat;
      if (prevSeat) seatCursors.set(prevSeat, turnEventCount(gameState));
      if (!seatCursors.has(nextSeat)) seatCursors.set(nextSeat, bindCursor);
      const priorEvents = turnEventsSince(gameState, seatCursors.get(nextSeat));
      if (!hadPrev) return;
      if (isApplyingRemote()) return;
      const player = gameState.currentPlayer;
      const uxMode = getUxMode();
      const players = Array.isArray(gameState.players) ? gameState.players : [];
      const recipient = turnPingHeaderIdentity(player, nextSeat);
      const summary = formatRecipientLossSummary(priorEvents, {
        recipientId: nextSeat,
        players,
      });
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
        actorName: recipient.displayName,
        actorFaction: recipient.power,
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
