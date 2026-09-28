// Dice stats panel. Reads diceStats/* for signed-in viewers.
// Guests and permission-denied reads show the empty line.
// Lobby guests see the sign-in line. No public page and no Discord post.
// The tracker stays observe-only: this module only reads.

import { getDiceSession } from '../stats/diceTracker.js';
import {
  FACE_COUNT,
  SKEW_DETECT_ROLLS,
  aggregateAiCards,
  cardsFromGameSeats,
  chiSquareFaces,
  faceVerdictSentence,
  formatChi,
  formatHitRate,
  formatInt,
  formatP,
  humanCardFromPlayerDoc,
  safeDisplayName,
  skewProgressLabel,
  totalsFromFlat,
} from '../stats/diceMath.js';

const CAVEAT = 'With many breakdowns, about 1 in 20 look \'worth watching\' by chance; the all-time verdict counts.';
export const DICE_STATS_EMPTY = 'Stats will appear once enabled';
export const DICE_STATS_SIGN_IN = 'Sign in to see dice stats';

let tab = 'all';
let playerScope = 'game';
let view = {
  status: 'idle',
  global: null,
  game: null,
  playerDocs: [],
  gameDocs: [],
};
let loadToken = 0;

export function getDiceStatsTab() {
  return tab;
}

export function setDiceStatsTab(next) {
  if (next === 'all' || next === 'game' || next === 'players') tab = next;
}

export function getDicePlayerScope() {
  return playerScope;
}

export function setDicePlayerScope(next) {
  if (next === 'game' || next === 'all') playerScope = next;
}

export function getDiceStatsView() {
  return view;
}

export function setDiceStatsViewForTest(next) {
  view = {
    status: 'idle',
    global: null,
    game: null,
    playerDocs: [],
    gameDocs: [],
    ...(next || {}),
  };
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

function expectedLabel(value) {
  const n = Number(value) || 0;
  if (Math.abs(n - Math.round(n)) < 0.05) return formatInt(Math.round(n));
  return n.toFixed(1);
}

export function lobbyDiceEntryMarkup({ phone = false } = {}) {
  const cls = phone
    ? 'lobby-phone-saved lobby-dice-entry'
    : 'lobby-saved-games-btn lobby-dice-entry';
  return `<button type="button" class="${cls}" data-action="dice-stats">Dice stats</button>`;
}

export function renderDiceStatsFromModel({
  status = 'idle',
  signedIn = false,
  tab: active = 'all',
  playerScope: scope = 'game',
  globalDoc = null,
  gameDoc = null,
  playerDocs = null,
  gameDocs = null,
  placement = 'sheet',
} = {}) {
  const lobby = placement === 'lobby';
  let useTab = active === 'players' && !signedIn ? 'all' : active;
  if (lobby && useTab === 'game') useTab = 'all';
  const useScope = lobby ? 'all' : (scope === 'all' ? 'all' : 'game');
  const tabs = lobby
    ? [['all', 'All-time'], ...(signedIn ? [['players', 'Players']] : [])]
    : [
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
  if (useTab === 'players') {
    body = renderPlayers({
      signedIn,
      scope: useScope,
      gameDoc,
      playerDocs,
      gameDocs,
      lobby,
    });
  } else if (useTab === 'game') {
    body = renderFaces(gameDoc, { meter: true });
  } else {
    body = renderFaces(globalDoc, { meter: true });
  }

  if (!signedIn && lobby) {
    body = `<p class="dice-stats-empty">${DICE_STATS_SIGN_IN}</p>`;
  } else if (status === 'disabled' || status === 'idle' || status === 'loading') {
    const doc = useTab === 'game' ? gameDoc : useTab === 'players' ? gameDoc : globalDoc;
    const empty = !doc || !(Number(doc.n) || totalsFromFlat(doc).n);
    const playersEmpty = useScope === 'all'
      ? !(playerDocs || []).length && !aggregateAiCards(gameDocs).length
      : empty;
    if (useTab !== 'players' && empty) {
      body = `<p class="dice-stats-empty">${DICE_STATS_EMPTY}</p>`;
    }
    if (useTab === 'players' && (!signedIn || playersEmpty)) {
      body = `<p class="dice-stats-empty">${DICE_STATS_EMPTY}</p>`;
    }
  }

  const rootClass = placement === 'popover'
    ? 'dice-stats-popover'
    : placement === 'lobby'
      ? 'dice-stats-lobby'
      : 'dice-stats-sheet';
  const close = placement === 'popover' || placement === 'lobby'
    ? '<button type="button" class="dice-stats-close" data-action="close-dice-stats" aria-label="Close">×</button>'
    : '';
  return `
    <div class="dice-stats ${rootClass}" tabindex="0" role="region" aria-label="Dice stats">
      <div class="dice-stats-head"><span>Dice stats</span>${close}</div>
      <div class="dice-stats-tabs" role="tablist">${tabHtml}</div>
      <div class="dice-stats-body">${body}</div>
      <p class="dice-stats-caveat">${esc(CAVEAT)}</p>
    </div>`;
}

function renderFaceChart(totals) {
  const faces = (totals?.faces || []).slice(0, FACE_COUNT);
  while (faces.length < FACE_COUNT) faces.push(0);
  const faceN = faces.reduce((sum, value) => sum + (Number(value) || 0), 0);
  if (!faceN) return '';
  const stats = chiSquareFaces(faces, faceN);
  const expected = faceN / FACE_COUNT;
  const scale = Math.max(expected, ...faces, 1);
  const sentence = faceVerdictSentence(stats.p, faceN);
  const rows = faces.map((count, i) => {
    const obsW = Math.max(0, Math.min(100, (count / scale) * 100));
    const expW = Math.max(0, Math.min(100, (expected / scale) * 100));
    return `
      <div class="dice-face-row">
        <span class="dice-face-num">${i + 1}</span>
        <span class="dice-bar-pair">
          <span class="dice-bar-track">
            <span class="dice-bar-fill" style="width:${obsW.toFixed(2)}%"></span>
          </span>
          <span class="dice-bar-track">
            <span class="dice-bar-expected" style="width:${expW.toFixed(2)}%"></span>
          </span>
        </span>
        <span class="dice-face-count">${formatInt(count)}<span class="dice-face-exp">/${expectedLabel(expected)}</span></span>
      </div>`;
  }).join('');
  return `
    ${sentence ? `<p class="dice-stats-verdict" data-verdict="${esc(stats.verdict || '')}">${esc(sentence)} <span class="dice-stats-p">p=${esc(formatP(stats.p))}</span></p>` : ''}
    <p class="dice-bar-legend"><span class="dice-swatch dice-swatch-obs"></span>Rolled <span class="dice-swatch dice-swatch-exp"></span>Fair share, 1 in 6</p>
    <div class="dice-face-list">${rows}</div>
    <p class="dice-stats-fit">Chi-square ${esc(formatChi(stats.chi2))} · p=${esc(formatP(stats.p))} · ${formatInt(faceN)} rolls</p>`;
}

function renderFaces(doc, { meter }) {
  const totals = totalsFromFlat(doc);
  const chart = renderFaceChart(totals);
  if (!chart) return `<p class="dice-stats-empty">${DICE_STATS_EMPTY}</p>`;
  const meterPct = Math.max(0, Math.min(100, (totals.n / SKEW_DETECT_ROLLS) * 100));
  const meterHtml = meter ? `
    <div class="dice-progress" role="meter" aria-valuemin="0" aria-valuemax="${SKEW_DETECT_ROLLS}" aria-valuenow="${totals.n}">
      <span class="dice-progress-fill" style="width:${meterPct.toFixed(2)}%"></span>
    </div>
    <p class="dice-progress-label">${esc(skewProgressLabel(totals.n))}</p>
    <p class="dice-stats-meta">${formatInt(totals.n)} rolls · longest same-face streak ${formatInt(totals.longestStreak)}</p>` : '';
  return `${chart}${meterHtml}`;
}

function renderPlayerCard(card) {
  const name = safeDisplayName(card?.name) || (card?.isAI ? 'AI' : 'Player');
  const ai = card?.isAI ? ' <span class="dice-stats-ai">AI</span>' : '';
  const chart = renderFaceChart(card?.totals);
  return `
    <div class="dice-player-row">
      <div class="dice-player-name">${esc(name)}${ai}</div>
      ${chart}
      <div class="dice-player-rate">Attack ${esc(formatHitRate(card?.atk))}</div>
      <div class="dice-player-rate">Defense ${esc(formatHitRate(card?.def))}</div>
    </div>`;
}

function renderPlayerGroups(humans, ais) {
  if (!humans.length && !ais.length) {
    return `<p class="dice-stats-empty">${DICE_STATS_EMPTY}</p>`;
  }
  const group = (label, cards) => {
    const rows = cards.length
      ? cards.map(renderPlayerCard).join('')
      : `<p class="dice-stats-empty">None yet</p>`;
    return `<h3 class="dice-stats-group">${label}</h3>${rows}`;
  };
  return `${group('Players', humans)}${group('AI', ais)}`;
}

function renderPlayers({ signedIn, scope, gameDoc, playerDocs, gameDocs, lobby }) {
  if (!signedIn) return `<p class="dice-stats-empty">${DICE_STATS_EMPTY}</p>`;
  const switchHtml = lobby ? '' : `
    <div class="dice-stats-scope" role="group" aria-label="Player scope">
      <button type="button" class="dice-stats-tab${scope === 'game' ? ' is-on' : ''}" data-dice-scope="game" aria-pressed="${scope === 'game' ? 'true' : 'false'}">This game</button>
      <button type="button" class="dice-stats-tab${scope === 'all' ? ' is-on' : ''}" data-dice-scope="all" aria-pressed="${scope === 'all' ? 'true' : 'false'}">All games</button>
    </div>`;
  let groups = '';
  if (scope === 'all') {
    const humans = (playerDocs || [])
      .map(humanCardFromPlayerDoc)
      .filter((card) => card.totals.n || card.atk.dice || card.def.dice)
      .sort((a, b) => a.name.localeCompare(b.name));
    groups = renderPlayerGroups(humans, aggregateAiCards(gameDocs));
  } else {
    const cards = cardsFromGameSeats(gameDoc);
    groups = renderPlayerGroups(
      cards.filter((card) => !card.isAI),
      cards.filter((card) => card.isAI),
    );
  }
  return `${switchHtml}${groups}`;
}

export function renderDiceStatsMarkup({ placement = 'sheet' } = {}) {
  const session = getDiceSession();
  return renderDiceStatsFromModel({
    status: view.status,
    signedIn: !!session.signedIn,
    tab,
    playerScope,
    globalDoc: view.global,
    gameDoc: view.game,
    playerDocs: view.playerDocs,
    gameDocs: view.gameDocs,
    placement,
  });
}

export function bindLobbyDice(root, { isOpen, setOpen, render } = {}) {
  if (!root || typeof render !== 'function') return;
  root.querySelector('[data-action="dice-stats"]')?.addEventListener('click', () => {
    const next = typeof isOpen === 'function' ? !isOpen() : true;
    if (typeof setOpen === 'function') setOpen(next);
    if (next) {
      if (getDiceStatsTab() === 'game') setDiceStatsTab('all');
      setDicePlayerScope('all');
      ensureDiceStatsLoaded(() => {
        if (typeof isOpen !== 'function' || isOpen()) render();
      });
    }
    render();
  });
  root.querySelector('[data-action="close-dice-stats"]')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof setOpen === 'function') setOpen(false);
    render();
  });
  bindDiceStatsControls(root, render);
}

export function bindDiceStatsControls(root, onChange) {
  if (!root) return;
  root.querySelectorAll('[data-dice-tab]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setDiceStatsTab(btn.dataset.diceTab);
      if (typeof onChange === 'function') onChange();
    });
  });
  root.querySelectorAll('[data-dice-scope]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setDicePlayerScope(btn.dataset.diceScope);
      if (typeof onChange === 'function') onChange();
    });
  });
}

export function ensureDiceStatsLoaded(onDone) {
  const token = ++loadToken;
  const session = getDiceSession();
  if (!session.signedIn) {
    view = { status: 'disabled', global: null, game: null, playerDocs: [], gameDocs: [] };
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
    view = { status: 'disabled', global: null, game: null, playerDocs: [], gameDocs: [] };
    try { console.debug('[dice] read skipped', err?.code || err?.message || err); } catch { /* ignore */ }
    if (typeof onDone === 'function') onDone();
  });
}

async function loadDiceStats(session) {
  try {
    const { getFirebaseDb } = await import('../multiplayer/firebase.js');
    const db = getFirebaseDb();
    if (!db) return { status: 'disabled', global: null, game: null, playerDocs: [], gameDocs: [] };
    const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const snap = await getDocs(collection(db, 'diceStats'));
    const gameId = session.gameId ? `game_${session.gameId}` : null;
    let globalDoc = null;
    let gameDoc = null;
    const playerDocs = [];
    const gameDocs = [];
    snap.forEach((row) => {
      const data = row.data() || {};
      if (row.id === 'global') globalDoc = data;
      else if (row.id.startsWith('player_')) playerDocs.push(data);
      else if (row.id.startsWith('game_')) {
        gameDocs.push(data);
        if (gameId && row.id === gameId) gameDoc = data;
      }
    });
    return {
      status: 'ready',
      global: globalDoc,
      game: gameDoc,
      playerDocs,
      gameDocs,
    };
  } catch (err) {
    try { console.debug('[dice] read skipped', err?.code || err?.message || err); } catch { /* ignore */ }
    return { status: 'disabled', global: null, game: null, playerDocs: [], gameDocs: [] };
  }
}
