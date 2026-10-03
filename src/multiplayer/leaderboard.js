// Leaderboard totals. Wins, losses, and games played, by the map and
// session labels the lobby already uses (Classic / Pacific, Local / Online).
// No Firebase and no DOM writes. Persistence lives in leaderboardStore.js.
// Scores are not part of the game-state save.

export const SEEN_CAP = 80;

export const LEADERBOARD_TYPES = Object.freeze([
  Object.freeze({ id: 'classic-local', label: 'Classic · Local' }),
  Object.freeze({ id: 'classic-online', label: 'Classic · Online' }),
  Object.freeze({ id: 'pacific-local', label: 'Pacific · Local' }),
  Object.freeze({ id: 'pacific-online', label: 'Pacific · Online' }),
]);

const TYPE_IDS = new Set(LEADERBOARD_TYPES.map((type) => type.id));

export function emptyScores() {
  const scores = {};
  for (const type of LEADERBOARD_TYPES) scores[type.id] = { wins: 0, losses: 0 };
  return scores;
}

export function emptyRecord(id = 'local') {
  return {
    id,
    displayName: id === 'local' ? 'This device' : 'You',
    optOut: false,
    scores: emptyScores(),
    seen: [],
    updatedAt: 0,
  };
}

export function publicName(name, fallback) {
  const text = String(name ?? '').trim().slice(0, 40);
  if (!text || text.includes('@')) return fallback;
  return text;
}

export function recordDisplayName(user, seat) {
  const fromUser = publicName(user?.displayName, '');
  if (fromUser) return fromUser;
  if (user?.id) return publicName(seat?.name, 'You');
  return 'This device';
}

function clampCount(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 100000);
}

function normalizeSeen(seen) {
  const out = [];
  const list = Array.isArray(seen) ? seen : [];
  for (const item of list) {
    const text = String(item ?? '').trim().slice(0, 96);
    if (!text || out.includes(text)) continue;
    out.push(text);
  }
  return out.slice(-SEEN_CAP);
}

export function normalizeRecord(raw, id = null) {
  const recordId = id || raw?.id || 'local';
  const scores = emptyScores();
  const incoming = raw?.scores && typeof raw.scores === 'object' ? raw.scores : {};
  for (const typeId of TYPE_IDS) {
    scores[typeId] = {
      wins: clampCount(incoming[typeId]?.wins),
      losses: clampCount(incoming[typeId]?.losses),
    };
  }
  const updatedAt = Math.floor(Number(raw?.updatedAt));
  return {
    id: recordId,
    displayName: publicName(raw?.displayName, recordId === 'local' ? 'This device' : 'You'),
    optOut: raw?.optOut === true,
    scores,
    seen: normalizeSeen(raw?.seen),
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0,
  };
}

export function serializeRecord(record) {
  const normalized = normalizeRecord(record, record?.id);
  return {
    displayName: normalized.displayName,
    optOut: normalized.optOut,
    scores: normalized.scores,
    seen: normalized.seen,
    updatedAt: normalized.updatedAt || 0,
  };
}

export function localStorageKey(userId) {
  return userId ? `tacticalRisk_leaderboard_${userId}` : 'tacticalRisk_leaderboard_local';
}

export function readStoredRecord(storage, userId) {
  const id = userId || 'local';
  try {
    const raw = storage?.getItem?.(localStorageKey(userId));
    if (!raw) return emptyRecord(id);
    return normalizeRecord(JSON.parse(raw), id);
  } catch {
    return emptyRecord(id);
  }
}

export function writeStoredRecord(storage, userId, record) {
  const id = userId || 'local';
  const normalized = normalizeRecord(record, id);
  storage.setItem(localStorageKey(userId), JSON.stringify(serializeRecord(normalized)));
  return normalized;
}

export function gameTypeId(gameState) {
  const map = gameState?.mapId === 'pacific' ? 'pacific' : 'classic';
  const where = gameState?.isMultiplayer ? 'online' : 'local';
  return `${map}-${where}`;
}

export function scoreTotals(record) {
  const normalized = normalizeRecord(record, record?.id);
  let wins = 0;
  let losses = 0;
  const types = [];
  for (const type of LEADERBOARD_TYPES) {
    const cell = normalized.scores[type.id];
    wins += cell.wins;
    losses += cell.losses;
    const played = cell.wins + cell.losses;
    if (played > 0) {
      types.push({
        id: type.id,
        label: type.label,
        wins: cell.wins,
        losses: cell.losses,
        played,
      });
    }
  }
  return { wins, losses, played: wins + losses, types };
}

// The human seat this client may record. Online: the signed-in seat only.
// Local signed-in: that seat, or the only human when the account is not
// stamped on a seat (solo vs AI). Unsigned: the only human. Hotseat with
// no account is skipped — there is no user to attach.
export function seatToRecord(gameState, userId) {
  const humans = (gameState?.players || []).filter((player) => player && !player.isAI);
  if (!humans.length) return null;
  if (gameState.isMultiplayer) {
    if (!userId) return null;
    return humans.find((player) => player.oderId === userId) || null;
  }
  if (userId) {
    const mine = humans.find((player) => player.oderId === userId);
    if (mine) return mine;
    if (humans.length === 1) return humans[0];
    return null;
  }
  if (humans.length === 1) return humans[0];
  return null;
}

export function seatOutcome(gameState, player) {
  if (!gameState?.gameOver || !gameState.winner || !player || player.isAI) return null;
  const winner = String(gameState.winner);
  const named = player.name === winner || player.id === winner;
  if (player.surrendered && !named) return 'loss';
  if (winner === 'Allies' || winner === 'Axis') {
    if (player.alliance === winner) return 'win';
    if (winner === 'Axis' && player.id === 'Japanese') return 'win';
    return 'loss';
  }
  if (gameState.teamsEnabled && /^Team \d+$/.test(winner)) {
    return String(player.teamId) === winner.slice(5) ? 'win' : 'loss';
  }
  return named ? 'win' : 'loss';
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  const value = String(text);
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// Online games dedupe on the Firestore game id. Anything else dedupes on
// the finished position so reopening the same save does not score twice.
export function resultKey(gameState, onlineId) {
  if (gameState?.isMultiplayer && onlineId) {
    const id = String(onlineId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
    if (id) return `online:${id}`;
  }
  const players = (gameState?.players || []).map((player) => [
    player?.id || '',
    player?.name || '',
    player?.isAI ? 1 : 0,
    player?.oderId || '',
    player?.surrendered ? 1 : 0,
    player?.alliance || '',
    player?.teamId || '',
  ].join(':')).join('|');
  const body = [
    gameState?.mapId || '',
    gameState?.isMultiplayer ? 1 : 0,
    gameState?.winner || '',
    gameState?.round || 0,
    gameState?.winCondition || '',
    players,
  ].join('\n');
  return `fp:${fnv1a(body)}`;
}

export function planRecord(record, gameState, { userId = null, gameId = null } = {}) {
  const base = normalizeRecord(record, userId || record?.id || 'local');
  if (!gameState?.gameOver || !gameState.winner) {
    return { record: base, skipped: 'not-over', changed: false };
  }
  const seat = seatToRecord(gameState, userId);
  if (!seat) return { record: base, skipped: 'no-seat', changed: false };
  const outcome = seatOutcome(gameState, seat);
  if (!outcome) return { record: base, skipped: 'no-outcome', changed: false };
  const typeId = gameTypeId(gameState);
  const key = resultKey(gameState, gameId);
  if (base.seen.includes(key)) return { record: base, skipped: 'seen', changed: false };
  const seen = [...base.seen, key].slice(-SEEN_CAP);
  if (base.optOut) {
    return {
      record: { ...base, seen },
      skipped: 'opt-out',
      changed: true,
      key,
    };
  }
  const scores = emptyScores();
  for (const type of LEADERBOARD_TYPES) scores[type.id] = { ...base.scores[type.id] };
  if (outcome === 'win') scores[typeId].wins += 1;
  else scores[typeId].losses += 1;
  return {
    record: { ...base, scores, seen },
    skipped: null,
    changed: true,
    outcome,
    typeId,
    key,
  };
}

export function withOptOut(record, optOut) {
  const base = normalizeRecord(record, record?.id);
  return { ...base, optOut: !!optOut };
}

export function resetScores(record) {
  const base = normalizeRecord(record, record?.id);
  return { ...base, scores: emptyScores(), seen: [...base.seen] };
}

export function leaderboardRows(records) {
  const rows = [];
  for (const raw of records || []) {
    const record = normalizeRecord(raw, raw?.id);
    const totals = scoreTotals(record);
    if (record.optOut || totals.played <= 0) continue;
    rows.push({
      id: record.id,
      displayName: record.displayName,
      wins: totals.wins,
      losses: totals.losses,
      played: totals.played,
      types: totals.types,
    });
  }
  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.played !== a.played) return b.played - a.played;
    return a.displayName.localeCompare(b.displayName);
  });
  return rows;
}

export function leaderboardVerdict(view) {
  if (!view || view.status === 'loading') return 'Loading...';
  const count = view.rows?.length || 0;
  const players = count === 1 ? '1 player' : `${count} players`;
  if (!view.signedIn) {
    if (view.self?.optOut && !count) return 'You are not listed. Sign in to see other players.';
    return count
      ? `${players} on this device. Sign in to see other players.`
      : 'Sign in to see other players.';
  }
  if (view.status === 'rules') {
    return count
      ? `${players} on this device. Other players appear once leaderboard rules are published.`
      : 'Other players appear once leaderboard rules are published.';
  }
  if (view.status === 'error') {
    return count ? `${players} saved on this device.` : 'Scores could not be loaded.';
  }
  if (view.self?.optOut) {
    return count ? `You are not listed. ${players}.` : 'You are not listed.';
  }
  if (!count) return 'No scores yet.';
  return players;
}

function tally(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function backButton() {
  return `<button type="button" class="back-btn" data-action="back" aria-label="Back"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg></button>`;
}

export function renderLeaderboardPage(view) {
  const verdict = leaderboardVerdict(view);
  const selfId = view?.self?.id || null;
  const items = (view?.rows || []).map((row) => {
    const you = selfId && row.id === selfId && selfId !== 'local' ? ' · You' : '';
    const types = (row.types || []).map((type) => (
      `<div class="lb-type"><span>${esc(type.label)}</span><span class="lb-type-score">${type.wins}–${type.losses} · ${tally(type.played, 'game', 'games')}</span></div>`
    )).join('');
    return `<li class="lb-person"><div class="lb-name">${esc(row.displayName)}${you}</div><div class="lb-totals">${tally(row.wins, 'win', 'wins')} · ${tally(row.losses, 'loss', 'losses')} · ${tally(row.played, 'game', 'games')}</div>${types}</li>`;
  }).join('');
  return `
    <div class="lobby-board">
      <div class="lb-head">
        ${backButton()}
        <h2>Leaderboards</h2>
        <button type="button" class="lb-text-btn" data-action="lb-prefs">Preferences</button>
      </div>
      <p class="lb-verdict">${esc(verdict)}</p>
      ${items ? `<ul class="lb-list">${items}</ul>` : ''}
    </div>`;
}

export function renderLeaderboardPrefs(self, { resetArmed = false, note = '' } = {}) {
  const record = normalizeRecord(self, self?.id);
  const verdict = note || (record.optOut ? 'You are not on the board.' : 'You are on the board.');
  const action = resetArmed ? 'lb-reset-confirm' : 'lb-reset';
  const label = resetArmed ? 'Confirm reset' : 'Reset my scores';
  return `
    <div class="lobby-board">
      <div class="lb-head">
        ${backButton()}
        <h2>Preferences</h2>
      </div>
      <p class="lb-verdict">${esc(verdict)}</p>
      <label class="lb-opt">
        <input type="checkbox" data-action="lb-opt-out"${record.optOut ? ' checked' : ''}>
        <span>Don't participate</span>
      </label>
      <button type="button" class="lb-reset" data-action="${action}">${label}</button>
    </div>`;
}
