// In-game Dice stats panel. Reads diceStats/* for signed-in viewers.
// Guests and permission-denied reads show the empty/enabled line.
// No public page and no Discord post.

import { getDiceSession } from '../stats/diceTracker.js';
import {
  SKEW_DETECT_ROLLS,
  chiSquareFaces,
  formatHitRate,
  formatInt,
  formatP,
  safeDisplayName,
  skewProgressLabel,
  totalsFromFlat,
} from '../stats/diceMath.js';

const CAVEAT = 'With many breakdowns, about 1 in 20 look \'worth watching\' by chance; the all-time verdict counts.';
export const DICE_STATS_EMPTY = 'Stats will appear once enabled';

let tab = 'all';
let view = {
  status: 'idle',
  global: null,
  game: null,
};
let loadToken = 0;

export function getDiceStatsTab() {
  return tab;
}

export function setDiceStatsTab(next) {
  if (next === 'all' || next === 'game' || next === 'players') tab = next;
}

export function getDiceStatsView() {
  return view;
}

export function setDiceStatsViewForTest(next) {
  view = { status: 'idle', global: null, game: null, ...(next || {}) };
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

export function renderDiceStatsFromModel({
  status = 'idle',
  signedIn = false,
  tab: active = 'all',
  globalDoc = null,
  gameDoc = null,
  placement = 'sheet',
} = {}) {
  const useTab = active === 'players' && !signedIn ? 'all' : active;
  const tabs = [
    ['all', 'All-time'],
    ['game', 'This game'],
    ...(signedIn ? [['players', 'Players']] : []),
  ];
  const tabHtml = tabs.map(([id, label]) => {
    const on = id === useTab ? ' is-on' : '';
    const pressed = id === useTab ? 'true' : 'false';
    return `<button type="button" class="dice-stats-tab${on}" data-dice-tab="${id}" aria-pressed="${pressed}">${label}</button>`;
  }).join('');

  let body = '';
  if (useTab === 'players') body = renderPlayers(gameDoc, signedIn);
  else if (useTab === 'game') body = renderFaces(gameDoc, { verdict: false });
  else body = renderFaces(globalDoc, { verdict: true });

  if (status === 'disabled' || status === 'idle' || status === 'loading') {
    const doc = useTab === 'game' ? gameDoc : useTab === 'players' ? gameDoc : globalDoc;
    const empty = !doc || !(Number(doc.n) || totalsFromFlat(doc).n);
    if (empty && useTab !== 'players') {
      body = `<p class="dice-stats-empty">${DICE_STATS_EMPTY}</p>`;
    }
    if (useTab === 'players' && (!signedIn || empty)) {
      body = `<p class="dice-stats-empty">${DICE_STATS_EMPTY}</p>`;
    }
  }

  const rootClass = placement === 'popover' ? 'dice-stats-popover' : 'dice-stats-sheet';
  return `
    <div class="dice-stats ${rootClass}" tabindex="0" role="region" aria-label="Dice stats">
      <div class="dice-stats-head">Dice stats</div>
      <div class="dice-stats-tabs" role="tablist">${tabHtml}</div>
      <div class="dice-stats-body">${body}</div>
      <p class="dice-stats-caveat">${esc(CAVEAT)}</p>
    </div>`;
}

function renderFaces(doc, { verdict }) {
  const totals = totalsFromFlat(doc);
  if (!totals.n) return `<p class="dice-stats-empty">${DICE_STATS_EMPTY}</p>`;
  const stats = chiSquareFaces(totals.faces, totals.n);
  const rows = totals.faces.map((count, i) => {
    const pct = totals.n ? (count / totals.n) * 100 : 0;
    return `
      <div class="dice-face-row">
        <span class="dice-face-num">${i + 1}</span>
        <span class="dice-bar-track">
          <span class="dice-bar-fill" style="width:${Math.max(0, Math.min(100, pct)).toFixed(2)}%"></span>
          <span class="dice-bar-fair" style="left:16.666%"></span>
        </span>
        <span class="dice-face-pct">${pct.toFixed(1)}%</span>
      </div>`;
  }).join('');
  const meter = Math.max(0, Math.min(100, (totals.n / SKEW_DETECT_ROLLS) * 100));
  const verdictHtml = verdict && stats.verdict
    ? `<p class="dice-stats-verdict" data-verdict="${esc(stats.verdict)}">${esc(stats.verdict)} <span class="dice-stats-p">p=${esc(formatP(stats.p))}</span></p>`
    : '';
  return `
    ${verdictHtml}
    <div class="dice-face-list">${rows}</div>
    <div class="dice-progress" role="meter" aria-valuemin="0" aria-valuemax="${SKEW_DETECT_ROLLS}" aria-valuenow="${totals.n}">
      <span class="dice-progress-fill" style="width:${meter.toFixed(2)}%"></span>
    </div>
    <p class="dice-progress-label">${esc(skewProgressLabel(totals.n))}</p>
    <p class="dice-stats-meta">${formatInt(totals.n)} rolls · longest same-face streak ${formatInt(totals.longestStreak)}</p>`;
}

function renderPlayers(doc, signedIn) {
  if (!signedIn) return `<p class="dice-stats-empty">${DICE_STATS_EMPTY}</p>`;
  const totals = totalsFromFlat(doc);
  const seats = Object.values(totals.seats || {}).filter((seat) => seat.atk.dice || seat.def.dice);
  if (!seats.length) return `<p class="dice-stats-empty">${DICE_STATS_EMPTY}</p>`;
  return seats.map((seat) => {
    const name = safeDisplayName(seat.name) || 'Player';
    const ai = seat.isAI ? ' <span class="dice-stats-ai">AI</span>' : '';
    return `
      <div class="dice-player-row">
        <div class="dice-player-name">${esc(name)}${ai}</div>
        <div class="dice-player-rate">Attack ${esc(formatHitRate(seat.atk))}</div>
        <div class="dice-player-rate">Defense ${esc(formatHitRate(seat.def))}</div>
      </div>`;
  }).join('');
}

export function renderDiceStatsMarkup({ placement = 'sheet' } = {}) {
  const session = getDiceSession();
  return renderDiceStatsFromModel({
    status: view.status,
    signedIn: !!session.signedIn,
    tab,
    globalDoc: view.global,
    gameDoc: view.game,
    placement,
  });
}

export function ensureDiceStatsLoaded(onDone) {
  const token = ++loadToken;
  const session = getDiceSession();
  if (!session.signedIn) {
    view = { status: 'disabled', global: null, game: null };
    if (typeof onDone === 'function') onDone();
    return;
  }
  view = { ...view, status: view.status === 'ready' ? 'ready' : 'loading' };
  loadDiceStats(session).then((next) => {
    if (token !== loadToken) return;
    view = next;
    if (typeof onDone === 'function') onDone();
  }).catch((err) => {
    if (token !== loadToken) return;
    view = { status: 'disabled', global: null, game: null };
    try { console.debug('[dice] read skipped', err?.code || err?.message || err); } catch { /* ignore */ }
    if (typeof onDone === 'function') onDone();
  });
}

async function loadDiceStats(session) {
  try {
    const { getFirebaseDb } = await import('../multiplayer/firebase.js');
    const db = getFirebaseDb();
    if (!db) return { status: 'disabled', global: null, game: null };
    const { doc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const globalSnap = await getDoc(doc(db, 'diceStats', 'global'));
    let gameDoc = null;
    if (session.gameId) {
      const gameSnap = await getDoc(doc(db, 'diceStats', `game_${session.gameId}`));
      gameDoc = gameSnap.exists() ? gameSnap.data() : null;
    }
    return {
      status: 'ready',
      global: globalSnap.exists() ? globalSnap.data() : null,
      game: gameDoc,
    };
  } catch (err) {
    try { console.debug('[dice] read skipped', err?.code || err?.message || err); } catch { /* ignore */ }
    return { status: 'disabled', global: null, game: null };
  }
}
