// Dice stats panel. Reads diceStats/* for signed-in viewers.
// Guests see the sign-in line. A permission-denied read says the rules
// are unpublished. An allowed read with no docs says no rolls are logged.
// No public page and no Discord post.
// The tracker stays observe-only: this module only reads.

import { getDiceSession } from '../stats/diceTracker.js';
import {
  FACE_COUNT,
  aggregateAiCards,
  cardsFromGameSeats,
  chiSquareFaces,
  faceVerdictSentence,
  formatHitRate,
  formatInt,
  formatP,
  humanCardFromPlayerDoc,
  safeDisplayName,
  totalsFromFlat,
} from '../stats/diceMath.js';

export const DICE_STATS_EMPTY = 'Stats will appear once enabled';
export const DICE_STATS_SIGN_IN = 'Sign in to see dice stats';
export const DICE_STATS_RULES = "Dice logging is switched off until the game's database rules are published.";
export const DICE_STATS_NONE = 'No rolls logged yet.';
export const DICE_STATS_BACKFILL_CAVEAT = 'Dice logged from older battles have no unit or to-hit number, so attack and defense rates are not available for those rolls.';

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

export function isDicePermissionDenied(err) {
  const code = String(err?.code || '');
  const message = String(err?.message || err || '');
  return code === 'permission-denied' || message.includes('permission-denied');
}

// One debug line. The second argument is the reason.
export function noteDiceReadFailure(err) {
  const denied = isDicePermissionDenied(err);
  const reason = denied ? 'permission-denied' : String(err?.code || err?.message || 'unknown');
  try { console.debug('[dice] read skipped', reason); } catch { /* ignore */ }
  return denied ? 'denied' : 'disabled';
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
    body = renderFaces(gameDoc);
  } else {
    body = renderFaces(globalDoc);
  }

  const hasRolls = (doc) => !!(doc && (Number(doc.n) || totalsFromFlat(doc).n));
  const playersEmpty = useScope === 'all'
    ? !(playerDocs || []).length && !aggregateAiCards(gameDocs).length
    : !hasRolls(gameDoc);
  const empty = useTab === 'players'
    ? playersEmpty
    : useTab === 'game'
      ? !hasRolls(gameDoc)
      : !hasRolls(globalDoc);
  if (!signedIn) {
    body = `<p class="dice-stats-empty">${DICE_STATS_SIGN_IN}</p>`;
  } else if (status === 'denied') {
    body = `<p class="dice-stats-empty">${esc(DICE_STATS_RULES)}</p>`;
  } else if (empty && status === 'ready') {
    body = `<p class="dice-stats-empty">${DICE_STATS_NONE}</p>`;
  } else if (empty) {
    body = '';
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
  const fair = expected / scale;
  const sentence = faceVerdictSentence(stats.p, faceN);
  const rolls = Number(totals?.n) || faceN;
  const rows = faces.map((count, i) => {
    const obsW = Math.max(0, Math.min(100, (count / scale) * 100));
    const pct = ((Number(count) || 0) / faceN) * 100;
    return `
      <div class="dice-face-row">
        <span class="dice-face-num">${i + 1}</span>
        <span class="dice-bar">
          <span class="dice-bar-fill" style="width:${obsW.toFixed(2)}%"></span>
        </span>
        <span class="dice-face-pct">${pct.toFixed(1)}%</span>
      </div>`;
  }).join('');
  return `
    ${sentence ? `<p class="dice-stats-verdict" data-verdict="${esc(stats.verdict || '')}">${esc(sentence)} <span class="dice-stats-p">p=${esc(formatP(stats.p))}</span></p>` : ''}
    <div class="dice-face-list">
      <span class="dice-fair-line" style="--dice-fair:${fair.toFixed(4)}"></span>
      ${rows}
    </div>
    <p class="dice-stats-meta">${formatInt(rolls)} rolls</p>`;
}

function renderFaces(doc) {
  return renderFaceChart(totalsFromFlat(doc));
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
  if (!humans.length && !ais.length) return '';
  const group = (label, cards) => {
    const rows = cards.length
      ? cards.map(renderPlayerCard).join('')
      : `<p class="dice-stats-empty">None yet</p>`;
    return `<h3 class="dice-stats-group">${label}</h3>${rows}`;
  };
  return `${group('Players', humans)}${group('AI', ais)}`;
}

function renderPlayers({ signedIn, scope, gameDoc, playerDocs, gameDocs, lobby }) {
  if (!signedIn) return '';
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

// Every open calls the loader. A ready view is not reused.
export function ensureDiceStatsLoaded(onDone, load = loadDiceStats) {
  const token = ++loadToken;
  const session = getDiceSession();
  if (!session.signedIn) {
    view = { status: 'disabled', global: null, game: null, playerDocs: [], gameDocs: [] };
    if (typeof onDone === 'function') onDone();
    return;
  }
  view = { ...view, status: view.status === 'ready' ? 'ready' : 'loading' };
  Promise.resolve(load(session)).then((next) => {
    if (token !== loadToken) return;
    view = next;
    if (typeof onDone === 'function') onDone();
  }).catch(() => {
    if (token !== loadToken) return;
    view = { status: 'disabled', global: null, game: null, playerDocs: [], gameDocs: [] };
    if (typeof onDone === 'function') onDone();
  });
}

// All-time is the doc whose id is `global`. Other ids never fill that slot.
export function diceStatsViewFromRows(rows, gameId) {
  let globalDoc = null;
  let gameDoc = null;
  const playerDocs = [];
  const gameDocs = [];
  for (const row of rows || []) {
    const data = row?.data || {};
    if (row?.id === 'global') globalDoc = data;
    else if (String(row?.id || '').startsWith('player_')) playerDocs.push(data);
    else if (String(row?.id || '').startsWith('game_')) {
      gameDocs.push(data);
      if (gameId && row.id === gameId) gameDoc = data;
    }
  }
  return {
    status: 'ready',
    global: globalDoc,
    game: gameDoc,
    playerDocs,
    gameDocs,
  };
}

async function loadDiceStats(session) {
  try {
    const { getFirebaseDb } = await import('../multiplayer/firebase.js');
    const db = getFirebaseDb();
    if (!db) return { status: 'disabled', global: null, game: null, playerDocs: [], gameDocs: [] };
    const { collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    const snap = await getDocs(collection(db, 'diceStats'));
    const gameId = session.gameId ? `game_${session.gameId}` : null;
    const rows = [];
    snap.forEach((row) => {
      rows.push({ id: row.id, data: row.data() || {} });
    });
    return diceStatsViewFromRows(rows, gameId);
  } catch (err) {
    return {
      status: noteDiceReadFailure(err),
      global: null,
      game: null,
      playerDocs: [],
      gameDocs: [],
    };
  }
}
