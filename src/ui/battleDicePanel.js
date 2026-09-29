// Read-only past-battle dice. Territory, round, attacker and defender
// dice with the needed value and whether the face hit.

import { getGameEventLog } from '../multiplayer/gameEventLog.js';
import { battlesFromDiceSources, hitCount } from '../stats/battleDice.js';
import { getDiceSession } from '../stats/diceTracker.js';

let view = { status: 'idle', battles: [] };
let loadToken = 0;

export function getBattleDiceView() {
  return view;
}

export function setBattleDiceViewForTest(next) {
  view = { status: 'idle', battles: [], ...(next || {}) };
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

function dieText(die) {
  const face = Number(die?.face) || 0;
  const need = die?.need == null ? '—' : String(die.need);
  const hit = die?.hit == null ? '' : (die.hit ? ' hit' : ' miss');
  const unit = die?.unit ? `${die.unit} ` : '';
  return `${unit}${face} need ${need}${hit}`;
}

function sideLine(label, dice) {
  const list = dice || [];
  const known = list.filter((die) => die?.hit != null);
  const hits = hitCount(list);
  const faces = list.length
    ? list.map((die) => dieText(die)).join(' · ')
    : 'No dice';
  const verdict = !list.length
    ? 'No dice'
    : known.length
      ? `${hits} hit${hits === 1 ? '' : 's'}`
      : 'Faces only';
  return `
    <p class="battle-dice-side"><span class="battle-dice-who">${label}</span> ${esc(verdict)}</p>
    <p class="battle-dice-faces">${esc(faces)}</p>`;
}

export function renderBattleDiceFromModel({
  status = 'idle',
  battles = [],
  placement = 'popover',
  signedIn = false,
} = {}) {
  const rows = (battles || []).map((battle, index) => `
    <li class="battle-dice-item">
      <button type="button" class="battle-dice-row" data-battle="${index}" aria-expanded="true">
        <span class="battle-dice-place">${esc(battle.territory)}</span>
        <span class="battle-dice-round">Round ${esc(battle.battleRound)} · turn ${esc(battle.round)}</span>
      </button>
      <div class="battle-dice-detail">
        ${sideLine('Attack', battle.attacker)}
        ${sideLine('Defense', battle.defender)}
      </div>
    </li>`).join('');
  let body = '';
  if (status === 'denied') {
    body = '<p class="battle-dice-empty">Past battles stay hidden until the database rules are published.</p>';
  } else if (!battles?.length && status === 'ready') {
    body = '<p class="battle-dice-empty">No battles yet.</p>';
  } else if (!battles?.length) {
    body = signedIn
      ? '<p class="battle-dice-empty">No battles yet.</p>'
      : '<p class="battle-dice-empty">Battles from this screen show here. Sign in to load earlier ones.</p>';
  } else {
    body = `<ul class="battle-dice-list">${rows}</ul>`;
  }
  const rootClass = placement === 'sheet' ? 'battle-dice-sheet' : 'battle-dice-popover';
  return `
    <div class="battle-dice ${rootClass}" tabindex="0" role="region" aria-label="Past battles">
      <div class="battle-dice-head">
        <span>Past battles</span>
        <button type="button" class="battle-dice-close" data-action="close-battle-dice" aria-label="Close">Close</button>
      </div>
      <div class="battle-dice-body">${body}</div>
    </div>`;
}

export function renderBattleDiceMarkup({ placement = 'popover' } = {}) {
  const session = getDiceSession();
  return renderBattleDiceFromModel({
    status: view.status,
    battles: view.battles,
    placement,
    signedIn: !!session.signedIn,
  });
}

export async function loadBattleDice({ gameId = null, readBatches = null } = {}) {
  const token = ++loadToken;
  const session = getDiceSession();
  const id = gameId || session.gameId || null;
  const localEvents = getGameEventLog()?.recent?.(250) || [];
  let batches = [];
  let status = 'ready';
  if (id && session.uid && typeof readBatches === 'function') {
    try {
      batches = await readBatches(id);
    } catch (err) {
      const code = String(err?.code || err?.message || '');
      status = code.includes('permission-denied') ? 'denied' : 'ready';
    }
  } else if (id && session.uid && typeof readBatches !== 'function') {
    try {
      batches = await readDiceBatches(id);
    } catch (err) {
      const code = String(err?.code || err?.message || '');
      status = code.includes('permission-denied') ? 'denied' : 'ready';
    }
  }
  if (token !== loadToken) return view;
  view = {
    status,
    battles: battlesFromDiceSources({ batches, events: localEvents }),
  };
  return view;
}

async function readDiceBatches(gameId) {
  const { getFirebaseDb } = await import('../multiplayer/firebase.js');
  const db = getFirebaseDb();
  if (!db) return [];
  const fs = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
  const q = fs.query(fs.collection(db, 'diceBatches'), fs.where('gameId', '==', gameId));
  const snap = await fs.getDocs(q);
  return snap.docs.map((doc) => doc.data());
}

export function bindBattleDiceControls(root, rerender) {
  root?.querySelector('[data-action="close-battle-dice"]')?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  return rerender;
}
