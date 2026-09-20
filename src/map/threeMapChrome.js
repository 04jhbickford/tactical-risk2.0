// Three / side-project HUD. Preview only.
// Frosted L0/L1/L2 + exclusive Confirm gold. Board stays main Canvas art.

import { GAME_VERSION, SCHEMA_VERSION } from '../version.js';
import { formatUnitName } from '../utils/unitNames.js';
import { getUnitIconPath } from '../utils/unitIcons.js';
import { UX_LABEL_EXPERIMENTAL } from './presentationMode.js';
import { formatWelcomeEmail, formatWelcomeName, isRealAuthIdentity } from '../multiplayer/authSession.js';
import { stripPreviewParams, soloHref } from './uxPreviewFlag.js';
import {
  AI_DIFFICULTIES,
  FACTION_COLORS,
  STARTING_IPC_OPTIONS,
  lobbyCanStart,
  lobbyStartLabel,
  seatOccupantView,
} from './threeSoloLobby.js';
import {
  SETUP_TUTORIAL_STEPS,
  SETUP_TUTORIAL_TITLE,
} from './threeSetupTutorial.js';
import {
  bindSealedActivate,
  chromeHitRectsFrom,
  isPointInAnyRect,
  sealChromeControl,
} from './threeChromeEvents.js';

const TYPE_SHORT = {
  infantry: 'INF',
  armour: 'TNK',
  artillery: 'ART',
  fighter: 'FTR',
  bomber: 'BMB',
  tacticalBomber: 'TAC',
  transport: 'TRN',
  submarine: 'SUB',
  destroyer: 'DD',
  cruiser: 'CA',
  battleship: 'BB',
  carrier: 'CV',
  factory: 'FAC',
  aaGun: 'AA',
  techDie: 'DIE',
  riskCards: 'SET',
};

export function shortType(type) {
  return TYPE_SHORT[type] || String(type || '?').slice(0, 3).toUpperCase();
}

export function isDieType(type, short = '') {
  const raw = String(type ?? '').trim();
  const label = String(short || '').trim();
  const key = raw.toLowerCase().replace(/[\s_-]+/g, '');
  if (['techdie', 'die', 'dice', 'techdice', 'researchdie'].includes(key)) return true;
  if (raw && shortType(raw) === 'DIE') return true;
  if (label.toUpperCase().split(/[\s/]/)[0] === 'DIE') return true;
  return false;
}

export function stackSummary(stacks) {
  if (!stacks?.length) return '';
  return stacks
    .map((s) => `${shortType(s.type)}×${s.quantity}`)
    .join(' ');
}

const FALLBACK_TECHS = [
  { id: 'jets', name: 'Jets', info: 'Fighters +1 attack/defense' },
  { id: 'rockets', name: 'Rockets', info: 'AA guns can bombard adjacent territories' },
  { id: 'superSubs', name: 'Super Submarines', info: 'Submarines +1 attack' },
  { id: 'longRangeAircraft', name: 'Long Range Aircraft', info: 'Aircraft +2 movement' },
  { id: 'heavyBombers', name: 'Heavy Bombers', info: 'Bombers roll 2 dice in combat' },
  { id: 'industrialTech', name: 'Industrial Technology', info: 'Units cost -1 IPC (min 1)' },
];

const DIE_PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[28, 28], [50, 50], [72, 72]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
  6: [[30, 24], [30, 50], [30, 76], [70, 24], [70, 50], [70, 76]],
};

export function cubeDieHtml(face, { hit = false, side = '', size = '' } = {}) {
  const n = Math.max(1, Math.min(6, Number(face) || 1));
  const px = size === 'lg' ? 44 : size === 'sm' ? 22 : 36;
  const faceFill = hit
    ? (side === 'def' ? '#5B8CA8' : '#C4A35A')
    : '#F4EFE4';
  const faceHi = hit
    ? (side === 'def' ? '#8EB8C8' : '#E6C57A')
    : '#FFF8EE';
  const pip = hit && side === 'def' ? '#F4EFE4' : '#1A1610';
  const cls = [
    'three-cube',
    hit ? 'is-hit' : '',
    side === 'def' ? 'is-def' : '',
    size === 'lg' ? 'is-lg' : '',
    size === 'sm' ? 'is-sm' : '',
  ].filter(Boolean).join(' ');
  const pips = (DIE_PIPS[n] || DIE_PIPS[1]).map(([x, y]) => (
    `<circle cx="${x}" cy="${y}" r="8" fill="${pip}"/>`
  )).join('');
  return `<svg class="${cls}" data-pips="${n}" data-die-art="svg" viewBox="0 0 100 100" width="${px}" height="${px}" aria-label="Die ${n}" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="5" width="90" height="90" rx="18" fill="${faceHi}" stroke="rgba(20,16,10,0.4)" stroke-width="3"/><rect x="10" y="12" width="80" height="76" rx="14" fill="${faceFill}"/><g>${pips}</g></svg>`;
}

export function unitArtHtml(type, owner, short, { dieSize = '' } = {}) {
  if (isDieType(type, short)) return cubeDieHtml(5, { size: dieSize });
  const src = getUnitIconPath(type, owner);
  if (!src) return `<span class="three-tile-fallback" aria-hidden="true">${String(short || '?').slice(0, 2)}</span>`;
  return `<img src="${src}" alt="${short}" width="36" height="36">`;
}

function iconRowHtml(stacks) {
  if (!stacks?.length) return '';
  return `<div class="three-peek-row">${stacks.map((s) => {
    const short = shortType(s.type);
    return `<button type="button" class="three-peek-unit" data-unit-type="${s.type}" title="${formatUnitName(s.type)}">
      ${unitArtHtml(s.type, s.owner, short)}
      <em>${short}</em>
      <b>${s.quantity}</b>
    </button>`;
  }).join('')}</div>`;
}

const LOBBY_MARK_LOCAL = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>';
const LOBBY_MARK_ONLINE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>';
const LOBBY_MARK_HOWTO = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/></svg>';
const LOBBY_BACK_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>';
// Steal Classic MP color check + lobby flag path (`assets/flags/${faction.flag}`).
const COLOR_CHECK_SVG = '<svg viewBox="0 0 24 24" fill="white" width="14" height="14" aria-hidden="true"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';

function hexEq(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase();
}

function factionFlagHtml(faction, color) {
  const name = faction?.name || faction?.id || 'Faction';
  const flag = faction?.flag;
  const border = color || faction?.color || '#888';
  if (!flag) {
    return `<span class="three-lobby-seat-flag is-empty" style="border-color:${border}" aria-hidden="true"></span>`;
  }
  return `<span class="three-lobby-seat-flag" style="border-color:${border}"><img src="assets/flags/${flag}" alt="${name}"></span>`;
}

function occupantValue(view) {
  if (!view?.on || view.kind === 'empty') return 'empty';
  if (view.kind === 'ai') return view.tier || 'medium';
  return 'human';
}

function occupantSelectHtml(faction, view, { action = 'occupant', includeEmpty = true } = {}) {
  const name = faction?.name || faction?.id || 'Faction';
  const current = occupantValue(view);
  const options = includeEmpty ? [{ id: 'empty', name: 'Empty' }, ...AI_DIFFICULTIES] : [...AI_DIFFICULTIES];
  return `<select class="three-lobby-select" data-lobby-select="${action}" data-seat="${faction.id}" aria-label="${name} occupant">
    ${options.map((d) => `<option value="${d.id}" ${current === d.id ? 'selected' : ''}>${d.name}</option>`).join('')}
  </select>`;
}

function colorDropdownHtml(faction, currentHex) {
  const name = faction?.name || faction?.id || 'Faction';
  const selected = FACTION_COLORS.find((c) => hexEq(c.color, currentHex)) || FACTION_COLORS[0];
  return `
    <div class="three-lobby-color-picker">
      <button type="button" class="three-lobby-pip is-on" data-color-toggle="1" style="background:${selected.color}" title="${name} · ${selected.name}" aria-label="${name} color ${selected.name} selected" aria-haspopup="true" aria-expanded="false"></button>
      <div class="three-lobby-color-drop" role="group" aria-label="${name} color">
        ${FACTION_COLORS.map((c) => {
          const on = hexEq(c.color, currentHex);
          return `<button type="button" class="three-lobby-swatch${on ? ' is-on' : ''}" data-lobby="color" data-value="${faction.id}:${c.id}" title="${name} · ${c.name}" aria-label="${name} · ${c.name}${on ? ' selected' : ''}" aria-pressed="${on ? 'true' : 'false'}" style="background:${c.color}">${on ? COLOR_CHECK_SVG : ''}</button>`;
        }).join('')}
      </div>
    </div>
  `;
}

function compactLocalSeatHtml(faction, model) {
  const view = seatOccupantView(model, faction.id);
  const on = view.on;
  const color = model.playerColors?.[faction.id]?.color || faction.color || '#888';
  const team = model.playerTeams?.[faction.id];
  return `
    <div class="three-lobby-seat-wrap${on ? ' is-on' : ''}" data-seat="${faction.id}" data-occupant-kind="${view.kind}">
      <button type="button" class="three-lobby-seat${on ? ' is-on' : ''}" data-lobby="seat" data-value="${faction.id}">
        ${factionFlagHtml(faction, color)}
        <span class="three-lobby-seat-name">${faction.name || faction.id}</span>
      </button>
      ${occupantSelectHtml(faction, view)}
      ${on && model.teamsEnabled ? `
        <select class="three-lobby-select three-lobby-team-select" data-lobby-select="team" data-seat="${faction.id}" aria-label="${faction.name || faction.id} team">
          <option value="0" ${!team ? 'selected' : ''}>—</option>
          <option value="1" ${team === 1 ? 'selected' : ''}>1</option>
          <option value="2" ${team === 2 ? 'selected' : ''}>2</option>
        </select>
      ` : ''}
      ${on ? colorDropdownHtml(faction, color) : ''}
    </div>
  `;
}

function lobbyCardHtml({ action, value, kicker, title, desc, mark, off = false }) {
  const data = off
    ? 'disabled'
    : `data-lobby="${action}" data-value="${value}"`;
  return `<button type="button" class="three-lobby-card${off ? ' is-off' : ''}" ${data}>
    <span class="three-lobby-card-mark">${mark}</span>
    <span class="three-lobby-card-copy">
      <span class="three-lobby-kicker">${kicker}</span>
      <span class="three-lobby-card-title">${title}</span>
      <span class="three-lobby-card-desc">${desc}</span>
    </span>
  </button>`;
}

function tileRowHtml(tiles, { loss = false, readOnly = false, side = '', dieSize = '' } = {}) {
  if (!tiles?.length) return '';
  const wave = tiles.length >= 8;
  return `<div class="three-tile-row${readOnly ? ' is-ro' : ''}${wave ? ' is-wave' : ''}">${tiles.map((s) => {
    const short = s.short || shortType(s.type);
    const have = Number(s.have ?? s.quantity) || 0;
    const picked = Number(s.picked) || 0;
    const name = formatUnitName(s.type);
    const plusOff = readOnly || picked >= have || !!s.plusOff;
    const minusOff = readOnly || picked <= 0;
    const minus = loss
      ? `data-loss-step="-1" data-loss-side="${side || s.side || ''}" data-loss-type="${s.type}"`
      : `data-step="-1" data-unit-type="${s.type}"`;
    const plus = loss
      ? `data-loss-step="1" data-loss-side="${side || s.side || ''}" data-loss-type="${s.type}"`
      : `data-step="1" data-unit-type="${s.type}"`;
    const dieTile = isDieType(s.type, short);
    const art = unitArtHtml(s.type, s.owner, short, {
      dieSize: dieSize || (dieTile && !wave ? 'lg' : ''),
    });
    const pick = loss && !readOnly
      ? ` data-loss-pick="1" data-loss-side="${side || s.side || ''}" data-loss-type="${s.type}"`
      : '';
    return `<div class="three-tile${picked > 0 ? ' is-on' : ''}${dieTile ? ' is-die' : ''}" data-unit-type="${s.type}"${pick}>
      ${art}
      <em>${short}</em>
      <div class="three-tile-steps">
        <button type="button" class="three-step" ${minus} ${minusOff ? 'disabled' : ''} aria-label="Fewer ${name}">−</button>
        <b>${picked}/${have}</b>
        <button type="button" class="three-step" ${plus} ${plusOff ? 'disabled' : ''} aria-label="More ${name}">+</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

function stepperRowHtml(steppers, opts = {}) {
  return tileRowHtml(steppers, opts);
}

function cargoRowHtml(ships = [], targetShipId = null) {
  if (!ships.length) return '';
  return `<div class="three-cargo">${ships.map((ship, i) => {
    const key = ship.id || ship.key || `${ship.type}-${i}`;
    const load = ship.load || [...(ship.cargo || []), ...(ship.aircraft || [])];
    const chips = load.length
      ? load.map((c) => `<span>${shortType(c.type)}×${c.quantity || 1}</span>`).join('')
      : '<span>empty</span>';
    const on = targetShipId && (ship.id === targetShipId || ship.key === targetShipId || key === targetShipId);
    return `<button type="button" class="three-ship${on ? ' is-on' : ''}" data-ship="${key}">
      <b>${shortType(ship.type)}${ship.id ? '' : ` ${i + 1}`}</b>
      <span class="three-cargo-chips">${chips}</span>
    </button>`;
  }).join('')}</div>`;
}

function assignedOf(taken) {
  return Object.values(taken || {}).reduce((n, q) => n + (Number(q) || 0), 0);
}

function lossStepperHtml(picker) {
  if (!picker) return '';
  const owner = picker.side === 'def' ? 'Germans' : 'Russians';
  const need = Number(picker.need) || 0;
  const used = assignedOf(picker.taken);
  let units = [...(picker.units || [])];
  if (picker.readOnly) {
    const assigned = units.filter((u) => (Number(picker.taken?.[u.type]) || 0) > 0);
    units = assigned.length ? assigned : Object.entries(picker.taken || {})
      .filter(([, n]) => Number(n) > 0)
      .map(([type, quantity]) => ({ type, quantity: Number(quantity) || 0 }));
  }
  if (!units.length) return '';
  return tileRowHtml(units.map((u) => ({
    type: u.type,
    owner,
    have: Number(u.quantity) || 0,
    picked: Number(picker.taken?.[u.type]) || 0,
    plusOff: !picker.readOnly && used >= need,
    side: picker.side,
  })), { loss: true, readOnly: !!picker.readOnly, side: picker.side });
}

function printIpc(land) {
  const n = Number(land?.production ?? land?.ipc ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function liveGameVersion() {
  // Module GAME_VERSION is SoT. Stale CDN HTML must not keep an older L0 stamp.
  return GAME_VERSION || (typeof window !== 'undefined'
    ? String(window.__TR_GAME_VERSION || '')
    : '');
}

export function applyLiveStamp() {
  const v = liveGameVersion();
  if (typeof window !== 'undefined') window.__TR_GAME_VERSION = v;
  if (typeof document === 'undefined') return v;
  document.documentElement.dataset.gameVersion = v;
  document.documentElement.setAttribute('data-game-version', v);
  document.querySelectorAll('.three-l0-ver, .three-lobby-ver, .lobby-version-badge').forEach((el) => {
    el.textContent = v;
  });
  return v;
}

function occupantKindLabel(kind) {
  if (kind === 'human') return 'Human';
  if (kind === 'ai') return 'AI';
  if (kind === 'empty') return 'Empty';
  return kind || 'Empty';
}

function occupantChipLabel(diff) {
  if (diff === 'human' || diff?.id === 'human') return 'Human';
  if (diff === 'easy' || diff?.id === 'easy') return 'Easy';
  if (diff === 'medium' || diff?.id === 'medium') return 'Med';
  if (diff === 'hard' || diff?.id === 'hard') return 'Hard';
  if (diff === 'ai' || diff?.id === 'ai') return 'AI';
  if (diff === 'empty' || diff?.id === 'empty') return 'Empty';
  return diff?.name || 'Human';
}

export function injectThreeChrome({ seat = 'Russians', ipc = 24, phase = 'PLACE' } = {}) {
  document.documentElement.classList.add('three-spike', 'ux-preview');
  document.documentElement.dataset.gameVersion = liveGameVersion();
  const style = document.createElement('style');
  style.textContent = `
    html.three-spike, html.three-spike body {
      background:#3D5A66; overflow:hidden;
      font-family:-apple-system,"SF Pro Text","SF Pro Display","Segoe UI",sans-serif;
      -webkit-font-smoothing:antialiased;
    }
    html.three-spike #minimap,
    html.three-spike #sidebar,
    html.three-spike #hud,
    html.three-spike #hud-clarity,
    html.three-spike #three-spike-hint { display:none !important; }
    html.three-spike #mapCanvas {
      position:absolute; inset:0; width:100%; height:100%; z-index:0;
      display:block; touch-action:none; cursor:grab;
      -webkit-user-select:none; user-select:none;
    }
    html.three-spike.has-lobby #mapCanvas,
    html.three-spike.has-tutorial #mapCanvas {
      pointer-events:none !important;
    }
    html.three-spike #mapCanvas.is-panning { cursor:grabbing; }
    html.three-spike #mapCanvas.is-hovering { cursor:pointer; }
    #three-l0 {
      position:absolute; left:0; right:0; top:0; z-index:30;
      height:calc(48px + env(safe-area-inset-top, 0px));
      padding:env(safe-area-inset-top, 0px) 10px 0;
      padding-left:max(10px, env(safe-area-inset-left));
      padding-right:max(10px, env(safe-area-inset-right));
      display:flex; align-items:center; gap:8px;
      background:linear-gradient(180deg, rgba(30,36,32,0.12) 0%, rgba(30,36,32,0.00) 100%);
      -webkit-backdrop-filter:saturate(1.35) blur(22px);
      backdrop-filter:saturate(1.35) blur(22px);
      border-bottom:1px solid rgba(255,255,255,0.08);
      box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);
      color:#E8E2D4;
      pointer-events:none;
    }
    #three-l0 button, #three-l0 .three-l0-chip { pointer-events:auto; }
    #three-menu-btn {
      width:44px; height:44px; border-radius:12px;
      border:1px solid rgba(255,255,255,0.12);
      background:rgba(30,36,32,0.42); color:#E8E2D4;
      -webkit-backdrop-filter:saturate(1.35) blur(16px);
      backdrop-filter:saturate(1.35) blur(16px);
      font-size:18px; cursor:pointer;
      -webkit-tap-highlight-color:transparent;
    }
    #three-l0 .three-l0-chip {
      min-height:44px; padding:0 12px; border-radius:999px;
      display:inline-flex; align-items:center; gap:6px;
      background:rgba(30,36,32,0.42);
      border:1px solid rgba(255,255,255,0.12);
      color:#E8E2D4;
      -webkit-backdrop-filter:saturate(1.35) blur(16px);
      backdrop-filter:saturate(1.35) blur(16px);
      font:600 13px/1 -apple-system,"SF Pro Text",sans-serif;
      letter-spacing:0.02em;
    }
    #three-phase { background:rgba(30,36,32,0.48); }
    #three-l0 .three-l0-seat { margin-left:auto; font-weight:500; letter-spacing:0; }
    #three-l0 .three-l0-ipc {
      font-variant-numeric:tabular-nums lining-nums;
      font-weight:500; letter-spacing:0;
    }
    #three-l0 .three-l0-pip {
      width:10px; height:10px; border-radius:50%;
      background:#3F6E38; box-shadow:0 0 0 1px rgba(0,0,0,0.35);
    }
    #three-l0 .three-l0-ver {
      position:absolute; top:calc(100% + 4px);
      right:max(8px, env(safe-area-inset-right, 0px));
      z-index:70; pointer-events:none;
      font-size:10px; font-weight:600; opacity:0.95; letter-spacing:0;
      white-space:nowrap; flex-shrink:0;
      padding:3px 7px; border-radius:8px;
      background:rgba(30,36,32,0.78);
      border:1px solid rgba(196,163,90,0.45); color:#F4E8C4;
    }
    #three-bottom {
      position:absolute; left:0; right:0; bottom:0; z-index:32;
      padding:0 10px max(12px, calc(10px + env(safe-area-inset-bottom, 0px)));
      padding-left:max(10px, env(safe-area-inset-left));
      padding-right:max(10px, env(safe-area-inset-right));
      display:flex; flex-direction:column; gap:8px;
      pointer-events:none;
      background:linear-gradient(0deg, rgba(30,36,32,0.42) 0%, transparent 70%);
      max-height:calc(100svh - 52px - env(safe-area-inset-top, 0px));
      overflow:hidden;
    }
    /* Children take hits. The dock itself stays pointer-events:none so
       dest taps on the map above peek/confirm are not swallowed. */
    #three-sheet-stack {
      display:flex; flex-direction:column; gap:8px;
      flex:1 1 auto; min-height:0;
      max-height:calc(100svh - 52px - env(safe-area-inset-top, 0px) - 72px - env(safe-area-inset-bottom, 0px));
      overflow-x:hidden; overflow-y:auto;
      -webkit-overflow-scrolling:touch;
      pointer-events:none;
    }
    #three-peek {
      display:none; pointer-events:none;
      min-height:0; padding:6px 8px; border-radius:12px;
      max-height:none; overflow:visible;
      background:rgba(30,36,32,0.36);
      -webkit-backdrop-filter:saturate(1.35) blur(18px);
      backdrop-filter:saturate(1.35) blur(18px);
      color:#E8E2D4;
      border:1px solid rgba(255,255,255,0.16);
      box-shadow:0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10);
    }
    #three-peek.is-on { display:block; pointer-events:auto; }
    #three-peek .three-peek-head {
      display:flex; align-items:baseline; gap:8px; min-height:0;
    }
    #three-peek strong {
      display:block;
      font:600 14px/1.15 -apple-system,"SF Pro Text",sans-serif;
      letter-spacing:-0.01em;
    }
    #three-peek .three-peek-meta {
      margin-top:0;
      font:400 11px/1.2 -apple-system,"SF Pro Text",sans-serif;
      color:#c8c0b0;
    }
    #three-peek .three-peek-row {
      display:flex; flex-wrap:nowrap; gap:6px; margin-top:8px;
      overflow-x:auto; -webkit-overflow-scrolling:touch;
      scrollbar-width:none;
    }
    #three-peek .three-peek-row::-webkit-scrollbar { display:none; }
    #three-peek .three-peek-unit { flex:0 0 auto; }
    #three-peek .three-peek-unit {
      position:relative; width:64px; height:72px;
      display:inline-flex; flex-direction:column; align-items:center; justify-content:center;
      background:rgba(240,230,210,0.20);
      border:1.5px solid rgba(255,255,255,0.22);
      border-radius:14px;
      color:inherit; padding:0; cursor:pointer;
      -webkit-tap-highlight-color:transparent;
    }
    #three-peek .three-peek-unit.is-picked {
      box-shadow:0 0 0 2px #C4A35A;
      border-color:#C4A35A;
    }
    #three-peek .three-peek-unit img { width:44px; height:44px; display:block; }
    #three-peek .three-peek-unit em {
      display:block; margin-top:1px;
      font:700 10px/1 -apple-system,"SF Pro Text",sans-serif;
      letter-spacing:0.04em; color:#F4E8C4; font-style:normal;
    }
    #three-peek .three-peek-unit b {
      position:absolute; right:-2px; bottom:-2px;
      min-width:16px; height:16px; padding:0 4px;
      border-radius:999px; background:#1A1610; color:#F4EFE4;
      font:700 11px/16px -apple-system,"SF Pro Text",sans-serif;
      font-variant-numeric:tabular-nums; text-align:center;
    }
    #three-peek .three-tile-row,
    #three-battle .three-tile-row {
      display:flex; flex-wrap:wrap; gap:4px; margin-top:6px;
      overflow:visible;
    }
    #three-peek .three-tile-row.is-wave,
    #three-battle .three-tile-row.is-wave {
      display:grid;
      grid-template-columns:repeat(6, minmax(0, 1fr));
      gap:3px;
      width:100%;
    }
    #three-peek .three-tile,
    #three-battle .three-tile {
      flex:0 0 auto; width:64px;
      box-sizing:border-box; overflow:visible;
      display:inline-flex; flex-direction:column; align-items:center;
      padding:4px 2px 3px; border-radius:12px;
      background:rgba(240,230,210,0.20);
      border:1.5px solid rgba(255,255,255,0.22);
    }
    #three-peek .three-tile-row.is-wave .three-tile,
    #three-battle .three-tile-row.is-wave .three-tile {
      width:auto; min-width:0; max-width:100%;
    }
    #three-peek .three-tile.is-on,
    #three-battle .three-tile.is-on {
      border-color:#C4A35A; box-shadow:0 0 0 2px rgba(196,163,90,0.35);
    }
    #three-peek .three-tile img,
    #three-battle .three-tile img { width:32px; height:32px; display:block; }
    #three-peek .three-tile-row.is-wave .three-tile img,
    #three-battle .three-tile-row.is-wave .three-tile img { width:26px; height:26px; }
    #three-peek .three-tile em,
    #three-battle .three-tile em {
      display:block; margin-top:1px;
      font:700 9px/1 -apple-system,"SF Pro Text",sans-serif;
      letter-spacing:0.03em; color:#F4E8C4; font-style:normal;
    }
    #three-peek .three-tile-steps,
    #three-battle .three-tile-steps {
      display:flex; align-items:center; justify-content:center;
      gap:0; margin-top:2px; width:100%; min-width:0;
    }
    #three-peek .three-tile-steps b,
    #three-battle .three-tile-steps b {
      min-width:16px; text-align:center; flex:1 1 auto;
      font:700 8px/1 -apple-system,"SF Pro Text",sans-serif;
      font-variant-numeric:tabular-nums; color:#F4EFE4;
    }
    #three-peek .three-step,
    #three-battle .three-step {
      width:16px; height:16px; flex:0 0 16px; border-radius:6px;
      border:1px solid rgba(255,255,255,0.16);
      background:rgba(30,36,32,0.55); color:#F4E8C4;
      font:700 12px/1 -apple-system,"SF Pro Text",sans-serif;
      cursor:pointer; -webkit-tap-highlight-color:transparent;
      touch-action:manipulation; padding:0;
    }
    #three-peek .three-step:disabled,
    #three-battle .three-step:disabled { opacity:0.35; cursor:default; }
    #three-stack-toggle {
      pointer-events:auto;
      align-self:flex-end;
      min-height:44px; padding:0 14px; border-radius:12px;
      border:1px solid rgba(255,255,255,0.12);
      background:rgba(30,36,32,0.62); color:#E8E2D4;
      -webkit-backdrop-filter:saturate(1.35) blur(16px);
      backdrop-filter:saturate(1.35) blur(16px);
      font:600 13px/1 -apple-system,"SF Pro Text",sans-serif;
      cursor:pointer;
      display:none;
    }
    html.three-spike.has-l1 #three-stack-toggle,
    html.three-spike.has-stacks #three-stack-toggle { display:none; }
    #three-confirm,
    #three-confirm.is-idle,
    #three-confirm:disabled {
      pointer-events:auto;
      min-height:56px; height:auto; max-height:72px; width:100%;
      padding:0 14px;
      border:1px solid rgba(255,255,255,0.10); border-radius:16px;
      background:rgba(30,36,32,0.88); color:rgba(232,226,212,0.55);
      -webkit-backdrop-filter:blur(24px) saturate(1.15);
      backdrop-filter:blur(24px) saturate(1.15);
      box-shadow:inset 0 1px 0 rgba(255,255,255,0.06);
      font:600 17px/1.2 -apple-system,"SF Pro Text",sans-serif;
      letter-spacing:-0.01em;
      cursor:default;
      overflow:hidden;
      -webkit-tap-highlight-color:transparent;
    }
    #three-confirm.is-ready:not(:disabled):not(.is-idle) {
      background:#C4A35A; color:#1E2420; cursor:pointer;
      border-color:transparent;
      -webkit-backdrop-filter:none;
      backdrop-filter:none;
      box-shadow:inset 0 1px 0 rgba(255,248,230,0.28), 0 0 0 3px rgba(196,163,90,0.28);
    }
    #three-zoom {
      position:absolute; right:max(10px, env(safe-area-inset-right));
      bottom:calc(88px + env(safe-area-inset-bottom, 0px));
      z-index:28; display:flex; flex-direction:column; gap:8px;
      pointer-events:auto;
    }
    html.three-spike.has-l1 #three-zoom,
    html.three-spike.has-battle #three-zoom,
    html.three-spike.has-l2 #three-zoom {
      display:none !important;
    }
    #three-zoom button {
      width:44px; height:44px; border-radius:12px;
      border:1px solid rgba(255,255,255,0.12);
      background:rgba(30,36,32,0.62);
      -webkit-backdrop-filter:saturate(1.35) blur(18px);
      backdrop-filter:saturate(1.35) blur(18px);
      color:#E8E2D4;
      font:600 18px/1 -apple-system,"SF Pro Text",sans-serif;
      cursor:pointer;
      box-shadow:inset 0 1px 0 rgba(255,255,255,0.08);
      -webkit-tap-highlight-color:transparent;
    }
    #three-zoom button[data-zoom="fit"] { font-size:12px; letter-spacing:0.02em; }
    #three-phase-guide { display:none !important; }
    #three-phase-strip { display:none !important; }
    #three-phase-strip .three-steps {
      display:flex; align-items:center; flex-wrap:nowrap; gap:0;
      min-height:36px; padding:7px 10px; border-radius:12px;
      overflow-x:auto; -webkit-overflow-scrolling:touch; scrollbar-width:none;
      background:rgba(30,36,32,0.58);
      -webkit-backdrop-filter:saturate(1.35) blur(16px);
      backdrop-filter:saturate(1.35) blur(16px);
      border:1px solid rgba(255,255,255,0.12);
      color:#E8E2D4;
    }
    #three-phase-strip .three-steps::-webkit-scrollbar { display:none; }
    #three-phase-strip .three-step {
      flex:0 0 auto;
      display:inline; font:500 12px/1.35 -apple-system,"SF Pro Text",sans-serif;
      color:rgba(232,226,212,0.55);
      white-space:nowrap;
    }
    #three-phase-strip .three-step i {
      font-style:normal; font-weight:700; color:rgba(232,226,212,0.42);
    }
    #three-phase-strip .three-step.is-now {
      color:#F4E8C4; font-weight:700;
    }
    #three-phase-strip .three-step.is-now i { color:#C4A35A; }
    #three-phase-strip .three-step.is-done { color:rgba(232,226,212,0.78); }
    #three-phase-strip .three-step.is-done i { color:#C4A35A; }
    #three-phase-strip .three-dot {
      margin:0 5px; color:rgba(232,226,212,0.28); font-weight:700;
    }
    #three-guide {
      display:none !important;
    }
    #three-battle {
      display:none; pointer-events:none;
      padding:8px 10px; border-radius:12px;
      overflow:visible;
      min-height:0; flex:0 0 auto;
      background:rgba(30,36,32,0.55);
      -webkit-backdrop-filter:saturate(1.35) blur(18px);
      backdrop-filter:saturate(1.35) blur(18px);
      color:#E8E2D4;
      border:1px solid rgba(255,255,255,0.14);
      box-shadow:0 8px 24px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.10);
    }
    #three-battle.is-on { display:flex; flex-direction:column; pointer-events:auto; }
    #three-battle .three-battle-scroll {
      flex:1 1 auto; min-height:0; overflow-y:auto;
      -webkit-overflow-scrolling:touch;
    }
    #three-battle .three-battle-kicker {
      margin:0; font:600 10px/1 -apple-system,sans-serif;
      letter-spacing:0.08em; text-transform:uppercase; color:#C4A35A;
    }
    #three-battle strong {
      display:block; margin-top:3px;
      font:600 14px/1.2 -apple-system,"SF Pro Text",sans-serif;
    }
    #three-battle .three-battle-body {
      margin-top:3px; font:400 12px/1.3 -apple-system,"SF Pro Text",sans-serif;
      color:#c8c0b0;
    }
    #three-battle .three-lanes {
      display:flex; flex-direction:column; gap:6px; margin-top:6px;
    }
    #three-battle .three-lane {
      padding:5px 6px; border-radius:10px;
      border:1px solid rgba(255,255,255,0.10);
    }
    #three-battle .three-lane.is-atk {
      background:rgba(196,163,90,0.10);
      border-color:rgba(196,163,90,0.35);
    }
    #three-battle .three-lane.is-def {
      background:rgba(91,140,168,0.12);
      border-color:rgba(91,140,168,0.38);
    }
    #three-battle .three-lane-head {
      display:flex; align-items:baseline; justify-content:space-between; gap:8px;
      font:700 11px/1.2 -apple-system,"SF Pro Text",sans-serif;
      letter-spacing:0.02em; text-transform:uppercase;
    }
    #three-battle .three-lane.is-atk .three-lane-head { color:#E6C57A; }
    #three-battle .three-lane.is-def .three-lane-head { color:#8EB8C8; }
    #three-battle .three-lane-head b { font-variant-numeric:tabular-nums; }
    #three-battle .three-dice {
      display:flex; flex-wrap:wrap; gap:3px; margin-top:4px;
    }
    #three-battle .three-die {
      width:18px; height:18px; border-radius:5px;
      display:inline-flex; align-items:center; justify-content:center;
      background:rgba(240,230,210,0.14);
      border:1px solid rgba(255,255,255,0.12);
      font:700 10px/1 -apple-system,sans-serif;
      font-variant-numeric:tabular-nums;
    }
    #three-battle .three-lane.is-atk .three-die.is-hit,
    #three-battle .three-die.is-hit {
      background:#C4A35A; color:#1E2420; border-color:transparent;
    }
    #three-battle .three-lane.is-def .three-die.is-hit {
      background:#5B8CA8; color:#F4EFE4; border-color:transparent;
    }
    #three-battle .three-die.is-def { opacity:0.92; }
    #three-battle .three-die-miss {
      display:inline-flex; align-items:center; min-height:18px; padding:0 6px;
      font:600 10px/1 -apple-system,"SF Pro Text",sans-serif;
      color:rgba(232,226,212,0.62); letter-spacing:0.02em;
    }
    svg.three-cube { display:block; overflow:visible; }
    .three-cube {
      --s:36px; --pip:calc(var(--s) * 0.16);
      position:relative; display:inline-block;
      width:var(--s); height:var(--s); flex:0 0 var(--s);
      border-radius:calc(var(--s) * 0.2);
      background:linear-gradient(145deg, #fff8ee, #d4ccc0);
      box-shadow:2px 2px 5px rgba(0,0,0,0.38), inset 1px 1px 2px rgba(255,255,255,0.9);
      box-sizing:border-box;
    }
    .three-cube.is-sm { --s:22px; }
    .three-cube.is-lg { --s:44px; }
    .three-cube.is-hit {
      background:linear-gradient(145deg, #E6C57A, #C4A35A);
      box-shadow:0 0 10px rgba(196,163,90,0.55), 2px 2px 4px rgba(0,0,0,0.3);
    }
    .three-cube.is-def.is-hit {
      background:linear-gradient(145deg, #8EB8C8, #5B8CA8);
    }
    .three-cube i {
      position:absolute; width:var(--pip); height:var(--pip); margin:0;
      border-radius:50%; background:#1A1610;
      transform:translate(-50%,-50%);
    }
    .three-cube.is-hit i { background:#1E2420; }
    .three-cube.is-def.is-hit i { background:#F4EFE4; }
    .three-cube[data-pips="1"] i:nth-child(1) { top:50%; left:50%; }
    .three-cube[data-pips="2"] i:nth-child(1) { top:28%; left:28%; }
    .three-cube[data-pips="2"] i:nth-child(2) { top:72%; left:72%; }
    .three-cube[data-pips="3"] i:nth-child(1) { top:28%; left:28%; }
    .three-cube[data-pips="3"] i:nth-child(2) { top:50%; left:50%; }
    .three-cube[data-pips="3"] i:nth-child(3) { top:72%; left:72%; }
    .three-cube[data-pips="4"] i:nth-child(1) { top:28%; left:28%; }
    .three-cube[data-pips="4"] i:nth-child(2) { top:28%; left:72%; }
    .three-cube[data-pips="4"] i:nth-child(3) { top:72%; left:28%; }
    .three-cube[data-pips="4"] i:nth-child(4) { top:72%; left:72%; }
    .three-cube[data-pips="5"] i:nth-child(1) { top:28%; left:28%; }
    .three-cube[data-pips="5"] i:nth-child(2) { top:28%; left:72%; }
    .three-cube[data-pips="5"] i:nth-child(3) { top:50%; left:50%; }
    .three-cube[data-pips="5"] i:nth-child(4) { top:72%; left:28%; }
    .three-cube[data-pips="5"] i:nth-child(5) { top:72%; left:72%; }
    .three-cube[data-pips="6"] i:nth-child(1) { top:24%; left:30%; }
    .three-cube[data-pips="6"] i:nth-child(2) { top:50%; left:30%; }
    .three-cube[data-pips="6"] i:nth-child(3) { top:76%; left:30%; }
    .three-cube[data-pips="6"] i:nth-child(4) { top:24%; left:70%; }
    .three-cube[data-pips="6"] i:nth-child(5) { top:50%; left:70%; }
    .three-cube[data-pips="6"] i:nth-child(6) { top:76%; left:70%; }
    #three-peek .three-tile-row.is-wave .three-cube { --s:26px; }
    #three-peek .three-tile.is-die .three-cube { --s:40px; }
    .three-tile-fallback {
      display:inline-flex; align-items:center; justify-content:center;
      width:32px; height:32px; border-radius:8px;
      background:rgba(240,230,210,0.16); color:#F4E8C4;
      font:700 11px/1 -apple-system,sans-serif;
    }
    .three-research-info {
      margin:4px 0 6px; font:400 12px/1.35 -apple-system,sans-serif; color:#c8c0b0;
    }
    .three-research-row {
      display:flex; align-items:center; gap:10px; margin-top:2px;
    }
    .three-research-row .three-cube { --s:28px; width:28px; height:28px; }
    .three-research-row .three-tile-row { margin:0; flex:1; }
    .three-research-row .three-tile .three-cube,
    .three-research-row .three-tile img,
    .three-research-row .three-tile-fallback { display:none; }
    .three-research-row .three-tile { min-height:44px; padding:4px 6px; }
    .three-tech-grid {
      display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px;
    }
    .three-tech-tile {
      display:flex; align-items:center; gap:6px; min-height:44px;
      padding:6px 8px; border-radius:10px; text-align:left;
      border:1px solid rgba(255,255,255,0.12);
      background:rgba(255,255,255,0.05); color:#F4EFE4;
      font:700 12px/1.15 -apple-system,sans-serif;
    }
    .three-tech-tile.is-on { border-color:#C4A35A; background:rgba(196,163,90,0.18); }
    .three-tech-pick {
      flex:1; min-height:32px; padding:0; border:0; background:transparent;
      color:inherit; font:inherit; text-align:left; cursor:pointer;
    }
    .three-tech-info {
      flex:0 0 28px; width:28px; height:28px; border-radius:8px;
      border:1px solid rgba(255,255,255,0.16); background:rgba(30,36,32,0.55);
      color:#C4A35A; font:700 13px/1 -apple-system,sans-serif; cursor:pointer;
    }
    .three-tech-pop {
      display:none; margin-top:8px; padding:8px 10px; border-radius:10px;
      background:rgba(20,24,22,0.88); color:#E8E2D4;
      font:400 13px/1.35 -apple-system,sans-serif;
    }
    .three-tech-pop.is-on { display:block; }
    .three-cargo {
      display:flex; flex-direction:column; gap:6px; margin-top:8px;
    }
    .three-ship {
      display:flex; align-items:center; justify-content:space-between; gap:8px;
      min-height:40px; padding:6px 8px; border-radius:10px;
      border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.04);
      color:#E8E2D4; font:600 12px/1 -apple-system,sans-serif; cursor:pointer;
    }
    .three-ship.is-on { border-color:#C4A35A; background:rgba(196,163,90,0.16); }
    .three-cargo-chips { display:flex; flex-wrap:wrap; gap:4px; }
    .three-cargo-chips span {
      padding:2px 6px; border-radius:999px; background:rgba(196,163,90,0.2);
      font:700 10px/1 -apple-system,sans-serif; color:#F4E8C4;
    }
    #three-actions {
      display:flex; gap:8px; flex:0 0 auto;
      position:relative; z-index:8;
      pointer-events:auto;
    }
    #three-undo {
      display:none !important; min-height:56px; min-width:88px; padding:0 14px; border-radius:16px;
      border:1px solid rgba(255,255,255,0.22); background:rgba(30,36,32,0.88);
      color:#F4E8C4; font:700 15px/1 -apple-system,sans-serif; cursor:pointer;
    }
    #three-undo.is-on {
      display:inline-flex !important; align-items:center; justify-content:center;
      visibility:visible !important;
    }
    #three-actions #three-confirm { flex:1; }
    #three-battle .three-dice.is-hero {
      justify-content:center; gap:8px; margin:10px 0 6px;
    }
    #three-battle .three-pickers {
      flex:0 0 auto; margin-top:6px; display:flex; flex-direction:column; gap:6px;
      overflow:visible; pointer-events:auto;
    }
    #three-battle .three-picker[data-readonly="1"] { pointer-events:none; }
    #three-battle .three-tile[data-loss-pick] { cursor:pointer; min-height:44px; }
    #three-battle .three-picker:not([data-readonly="1"]) .three-step {
      width:28px; height:28px; flex-basis:28px; font-size:16px;
    }
    #three-battle .three-picker-label {
      font:600 10px/1.2 -apple-system,sans-serif; letter-spacing:0.03em;
      text-transform:uppercase; color:#C4A35A; margin-bottom:3px;
    }
    #three-battle .three-picker[data-loss-side="def"] .three-picker-label { color:#8EB8C8; }
    #three-battle .three-tile-row { margin-top:4px; }
    #three-confirm { flex:0 0 auto; position:relative; z-index:8; }
    html.three-spike.has-battle #three-stack-toggle { display:none; }
    #three-sheet {
      display:none; position:absolute; left:0; right:0; bottom:0; z-index:40;
      max-height:min(52dvh, 420px);
      padding:16px 16px calc(16px + env(safe-area-inset-bottom, 0px));
      background:rgba(30,36,32,0.94);
      -webkit-backdrop-filter:blur(28px);
      backdrop-filter:blur(28px);
      color:#E8E2D4;
      border-top:1px solid rgba(255,255,255,0.12);
      border-radius:24px 24px 0 0;
      pointer-events:auto;
    }
    #three-sheet.is-open { display:block; }
    #three-sheet h2 { margin:0 0 10px; font:600 13px/1 -apple-system,sans-serif; letter-spacing:0.08em; text-transform:uppercase; opacity:0.72; }
    #three-sheet button.three-sheet-row {
      display:block; width:100%; text-align:left;
      min-height:44px; margin:0 0 8px; padding:0 12px;
      border-radius:12px; border:1px solid rgba(255,255,255,0.12);
      background:rgba(255,255,255,0.04); color:#f4ead4;
      font:600 15px/1 -apple-system,"SF Pro Text",sans-serif; cursor:pointer;
    }
    #three-sheet .three-sheet-note { margin:8px 0 0; font-size:13px; color:#9aa3b5; }
    /* Canonical shell — map exactly:
     * .app-shell  → #three-lobby.is-open { height:100dvh; display:flex; flex-direction:column; overflow:hidden }
     * .shell-scroll → .three-lobby-main { flex:1; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch }
     * .shell-footer → .three-lobby-footer { flex:none }  Teams+Start NOT inside scroll
     * header .three-lobby-setup-head { flex:none }
     */
    #three-lobby {
      display:none; position:absolute; inset:0; z-index:80;
      height:100dvh; height:100svh; max-height:100dvh; max-height:100svh;
      padding:max(12px, env(safe-area-inset-top)) 14px 0;
      background:rgba(22,26,28,0.94);
      -webkit-backdrop-filter:blur(22px); backdrop-filter:blur(22px);
      color:#E8E2D4; overflow:hidden; pointer-events:auto; touch-action:pan-y;
    }
    #three-lobby.is-open {
      display:flex; flex-direction:column; overflow:hidden;
      height:100dvh; height:100svh; min-height:0;
    }
    #three-lobby .three-lobby-home,
    #three-lobby .three-lobby-howto {
      display:flex; flex-direction:column; gap:10px; flex:1; min-height:0;
      padding-bottom:max(12px, env(safe-area-inset-bottom));
      overflow-y:auto; -webkit-overflow-scrolling:touch; touch-action:pan-y;
    }
    #three-lobby .three-lobby-setup {
      display:flex; flex-direction:column; flex:1; min-height:0;
      overflow:hidden; gap:0;
    }
    #three-lobby .three-lobby-setup-head { flex:none; }
    #three-lobby .three-lobby-main {
      flex:1; min-height:0; overflow-y:auto;
      -webkit-overflow-scrolling:touch; touch-action:pan-y;
      overscroll-behavior:contain;
      display:flex; flex-direction:column; gap:10px;
      padding-bottom:12px;
    }
    #three-lobby .three-lobby-footer {
      flex:none;
      padding:8px 0 calc(8px + env(safe-area-inset-bottom, 0px));
      background:rgba(22,26,28,0.96);
      border-top:1px solid rgba(255,255,255,0.08);
    }
    #three-lobby button,
    #three-lobby .three-lobby-tile,
    #three-lobby .three-lobby-seat-wrap,
    #three-lobby .three-lobby-seat,
    #three-lobby .three-lobby-color-picker,
    #three-lobby .three-lobby-pip,
    #three-lobby .three-lobby-swatch,
    #three-lobby select.three-lobby-select { touch-action:pan-y; }
    #three-lobby .three-lobby-brand { text-align:center; padding:18px 8px 4px; }
    #three-lobby .three-lobby-logo {
      margin:0; font:700 32px/1.05 -apple-system,"SF Pro Display",sans-serif;
      letter-spacing:0.4px; color:#F4EFE4;
    }
    #three-lobby .three-lobby-tag {
      margin:6px 0 0; font:400 14px/1.3 -apple-system,sans-serif; color:#94a3b8;
    }
    #three-lobby .three-lobby-ver {
      display:inline-block; margin-top:8px; padding:3px 8px; border-radius:999px;
      border:1px solid rgba(196,163,90,0.35); color:#C4A35A;
      font:600 11px/1 -apple-system,sans-serif; letter-spacing:0.06em;
    }
    #three-lobby .three-lobby-path {
      margin:0; font:700 11px/1 -apple-system,sans-serif;
      letter-spacing:0.08em; text-transform:uppercase; color:#93c5fd;
    }
    #three-lobby .three-lobby-actions { display:flex; flex-direction:column; gap:8px; }
    #three-lobby .three-lobby-identity {
      display:flex; align-items:center; justify-content:space-between; gap:10px;
      padding:8px 10px; border-radius:10px;
      background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08);
    }
    #three-lobby .three-lobby-identity p { margin:0; font:400 13px/1.3 -apple-system,sans-serif; color:#E8E2D4; }
    #three-lobby .three-lobby-identity strong { color:#F4EFE4; }
    #three-lobby .three-lobby-identity-email { color:#94a3b8; font-size:12px; }
    #three-lobby .three-lobby-signout {
      flex:none; min-height:36px; padding:0 10px; border-radius:8px;
      border:1px solid rgba(196,163,90,0.35); background:transparent; color:#C4A35A;
      font:600 12px/1 -apple-system,sans-serif; cursor:pointer;
    }
    #three-lobby h2 {
      margin:0 0 8px; font:600 12px/1 -apple-system,sans-serif;
      letter-spacing:0.10em; text-transform:uppercase; color:#C4A35A;
    }
    #three-lobby .three-lobby-title {
      margin:0; font:700 22px/1.1 -apple-system,"SF Pro Display",sans-serif;
    }
    #three-lobby .three-lobby-sub { margin:4px 0 0; font:400 13px/1.3 -apple-system,sans-serif; color:#94a3b8; }
    #three-lobby .three-lobby-row,
    #three-lobby .three-lobby-seg {
      display:flex; flex-wrap:wrap; gap:8px; margin:0;
    }
    #three-lobby .three-lobby-seg { padding:4px; border-radius:12px; background:rgba(255,255,255,0.04); }
    #three-lobby .three-lobby-sec { margin:0; }
    #three-lobby button.three-lobby-tile {
      min-height:40px; padding:0 12px; border-radius:10px;
      border:1px solid rgba(255,255,255,0.12);
      background:rgba(255,255,255,0.05); color:#e2e8f0;
      font:600 13px/1 -apple-system,"SF Pro Text",sans-serif; cursor:pointer;
    }
    #three-lobby button.three-lobby-tile.is-on {
      border-color:#C4A35A; background:rgba(196,163,90,0.20); color:#F4E8C4;
    }
    #three-lobby .three-lobby-start {
      display:block; width:100%; min-height:56px; margin-top:4px;
      border:0; border-radius:12px; background:#C4A35A; color:#1E2420;
      font:700 15px/1 -apple-system,"SF Pro Text",sans-serif;
      letter-spacing:0.04em; text-transform:uppercase; cursor:pointer;
    }
    #three-lobby .three-lobby-start:disabled {
      background:#334155; color:#64748b; cursor:default;
    }
    #three-lobby .three-lobby-form {
      display:flex; flex-direction:column; gap:12px; padding:8px 4px 16px;
    }
    #three-lobby .three-lobby-form label {
      display:flex; flex-direction:column; gap:6px;
      font:600 12px/1.2 -apple-system,"SF Pro Text",sans-serif;
      letter-spacing:0.06em; text-transform:uppercase; color:#C9B896;
    }
    #three-lobby .three-lobby-form input,
    #three-lobby .three-lobby-form select {
      min-height:44px; padding:0 12px; border-radius:12px;
      border:1px solid rgba(255,255,255,0.14);
      background:rgba(30,36,32,0.55); color:#E8E2D4; font-size:16px;
    }
    #three-lobby .three-lobby-error { color:#F4A3A3; font-size:13px; margin:8px 4px 0; }
    #three-lobby button.three-lobby-card {
      display:flex; flex-direction:row; align-items:center; gap:12px;
      width:100%; text-align:left; min-height:88px;
      margin:0; padding:16px; border-radius:14px;
      border:1px solid rgba(255,255,255,0.14);
      background:rgba(255,255,255,0.05); color:#f1f5f9; cursor:pointer;
    }
    #three-lobby button.three-lobby-card.is-off {
      opacity:0.42; cursor:default; border-color:rgba(255,255,255,0.08);
    }
    #three-lobby .three-lobby-card-mark {
      flex:0 0 44px; width:44px; height:44px;
      display:flex; align-items:center; justify-content:center; color:#93c5fd;
    }
    #three-lobby .three-lobby-card-mark svg { width:28px; height:28px; }
    #three-lobby .three-lobby-card-copy {
      display:flex; flex-direction:column; align-items:flex-start; gap:2px; min-width:0;
    }
    #three-lobby .three-lobby-kicker {
      font:700 11px/1 -apple-system,sans-serif;
      letter-spacing:0.08em; text-transform:uppercase; color:#93c5fd;
    }
    #three-lobby .three-lobby-card-title {
      font:700 22px/1.1 -apple-system,"SF Pro Display",sans-serif; color:#F4EFE4;
    }
    #three-lobby .three-lobby-card-desc {
      font:400 13px/1.3 -apple-system,sans-serif; color:#cbd5e1;
    }
    #three-lobby .three-lobby-setup-head {
      display:flex; align-items:center; gap:10px; flex:none;
      padding-bottom:10px;
    }
    #three-lobby .three-lobby-back {
      width:44px; height:44px; min-width:44px; margin:0; padding:0;
      border:0; border-radius:12px; background:rgba(255,255,255,0.06);
      color:#C4A35A; display:inline-flex; align-items:center; justify-content:center;
      cursor:pointer;
    }
    #three-lobby .three-lobby-back svg { width:22px; height:22px; }
    #three-lobby .three-lobby-sec,
    #three-lobby .three-lobby-seats-sec,
    #three-lobby .three-lobby-ipc-opts,
    #three-lobby .three-lobby-foot {
      flex:0 0 auto;
    }
    #three-lobby .three-lobby-seats-sec { display:block; min-height:0; }
    #three-lobby .three-lobby-seats {
      display:flex; flex-direction:column; gap:8px; overflow:visible;
      flex:0 0 auto;
    }
    #three-lobby .three-lobby-seat,
    #three-lobby .three-lobby-seat-wrap,
    #three-lobby .three-lobby-color-picker,
    #three-lobby .three-lobby-pip { touch-action:pan-y; }
    #three-lobby .three-lobby-opts,
    #three-lobby .three-lobby-foot,
    #three-lobby .three-lobby-start { flex:none; }
    #three-lobby .three-lobby-toolbar {
      display:flex; flex-wrap:wrap; align-items:center; gap:8px;
    }
    #three-lobby .three-lobby-toolbar label {
      display:flex; align-items:center; gap:6px; min-height:40px;
      font:600 11px/1 -apple-system,sans-serif;
      letter-spacing:0.06em; text-transform:uppercase; color:#C4A35A;
    }
    #three-lobby .three-lobby-toolbar select.three-lobby-select {
      flex-basis:132px; width:132px; max-width:48%;
    }
    #three-lobby .three-lobby-seats { gap:6px; }
    #three-lobby .three-lobby-seat-wrap {
      display:flex; align-items:center; flex-wrap:nowrap; gap:8px;
      flex:0 0 auto; min-height:48px; height:auto; overflow:visible;
      padding:4px 8px; border-radius:12px;
      border:1px solid rgba(255,255,255,0.12);
      background:rgba(255,255,255,0.04);
    }
    #three-lobby .three-lobby-seat-wrap.is-on {
      border-color:#C4A35A; background:rgba(196,163,90,0.10);
    }
    #three-lobby .three-lobby-seat {
      display:flex; align-items:center; gap:8px;
      flex:1 1 auto; min-width:0; width:auto; text-align:left;
      min-height:44px; padding:0;
      border:0; border-radius:0; background:transparent; color:#f1f5f9; cursor:pointer;
    }
    #three-lobby .three-lobby-seat-flag {
      flex:0 0 32px; width:32px; height:32px;
      border-radius:50%; border:2px solid; overflow:hidden;
      background:rgba(15,23,42,0.8); box-sizing:border-box;
    }
    #three-lobby .three-lobby-seat-flag img {
      display:block; width:100%; height:100%; object-fit:cover;
    }
    #three-lobby .three-lobby-seat-flag.is-empty { background:rgba(148,163,184,0.18); }
    #three-lobby .three-lobby-seat-name {
      font:700 15px/1.2 -apple-system,sans-serif;
      overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    }
    #three-lobby .three-lobby-seat-meta { display:none; }
    #three-lobby .three-lobby-seat-meta.is-show {
      display:block; flex:0 0 auto;
      font:400 12px/1.2 -apple-system,sans-serif; color:#94a3b8;
    }
    #three-lobby select.three-lobby-select {
      flex:0 0 108px; width:108px; min-height:40px; max-width:36%;
      padding:0 6px; border-radius:10px;
      border:1px solid rgba(255,255,255,0.16);
      background:rgba(15,23,42,0.8); color:#e2e8f0;
      font:600 12px/1.2 -apple-system,sans-serif;
    }
    #three-lobby select.three-lobby-team-select { flex-basis:56px; width:56px; max-width:22%; }
    #three-lobby .three-lobby-color-picker { position:relative; flex:0 0 auto; }
    #three-lobby .three-lobby-pip {
      width:22px; min-width:22px; height:22px; min-height:22px; padding:0;
      border-radius:50%; border:2px solid #fff;
      box-shadow:0 0 0 2px #C4A35A, 0 0 10px rgba(255,255,255,0.28);
      cursor:pointer;
    }
    #three-lobby .three-lobby-color-drop {
      display:none; position:absolute; right:0; top:calc(100% + 6px); z-index:20;
      grid-template-columns:repeat(5, 1fr); gap:6px; padding:8px;
      border-radius:10px; border:1px solid rgba(255,255,255,0.2);
      background:rgba(20,20,40,0.98);
      box-shadow:0 8px 24px rgba(0,0,0,0.4);
    }
    #three-lobby .three-lobby-color-drop.is-open { display:grid; }
    #three-lobby .three-lobby-discord {
      display:flex; flex-direction:column; gap:4px;
      flex:1 1 100%; padding:0 0 4px;
      font:600 11px/1.2 -apple-system,sans-serif; color:#C4A35A;
      letter-spacing:.04em; text-transform:uppercase;
    }
    #three-lobby .three-lobby-discord input {
      width:100%; min-height:36px; padding:6px 10px;
      border-radius:8px; border:1px solid rgba(255,255,255,0.16);
      background:rgba(0,0,0,0.28); color:#f1f5f9;
      font:400 13px/1.2 -apple-system,sans-serif; text-transform:none; letter-spacing:0;
    }
    #three-lobby .three-lobby-discord-linked {
      display:block; padding:0 14px 10px;
      font:400 11px/1.2 -apple-system,sans-serif; color:#94a3b8;
    }
    #three-lobby .three-lobby-swatch {
      width:28px; min-width:28px; height:28px; min-height:28px;
      padding:0; border-radius:8px;
      border:3px solid transparent;
      cursor:pointer;
      display:inline-flex; align-items:center; justify-content:center;
    }
    #three-lobby .three-lobby-swatch.is-on {
      border-color:#fff;
      box-shadow:0 0 0 2px #C4A35A, 0 0 12px rgba(255,255,255,0.35);
    }
    #three-lobby .three-lobby-teams {
      display:flex; flex-wrap:wrap; gap:6px;
    }
    #three-lobby .three-lobby-opts {
      display:flex; flex-direction:column; gap:10px;
      padding:12px; border-radius:12px; background:rgba(255,255,255,0.03);
    }
    #three-lobby .three-lobby-opt {
      display:flex; align-items:center; justify-content:space-between; gap:10px;
    }
    #three-lobby .three-lobby-opt > span {
      font:600 13px/1 -apple-system,sans-serif; color:#cbd5e1;
    }
    #three-lobby .three-lobby-foot {
      margin:0; font:400 12px/1.3 -apple-system,sans-serif; color:#94a3b8;
    }
    #three-tutorial {
      display:none; position:absolute; inset:0; z-index:55;
      padding:max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom));
      background:rgba(20,24,22,0.92);
      -webkit-backdrop-filter:blur(22px); backdrop-filter:blur(22px);
      color:#E8E2D4; overflow-y:auto; pointer-events:auto;
    }
    #three-tutorial.is-open { display:block; }
    #three-tutorial h2 {
      margin:12px 0 8px; font:700 22px/1.1 -apple-system,"SF Pro Display",sans-serif;
    }
    #three-tutorial .three-tut-step { margin:0 0 14px; }
    #three-tutorial .three-tut-step b {
      display:block; color:#C4A35A; font:600 12px/1 -apple-system,sans-serif;
      letter-spacing:0.08em; text-transform:uppercase; margin-bottom:4px;
    }
    #three-tutorial .three-tut-step p { margin:0; font:400 15px/1.35 -apple-system,sans-serif; }
    #three-tutorial .three-tut-go {
      display:block; width:100%; min-height:56px; margin-top:16px;
      border:0; border-radius:16px; background:#C4A35A; color:#1E2420;
      font:700 16px/1 -apple-system,sans-serif; cursor:pointer;
    }
    #three-l0 .three-l0-help {
      width:36px; height:36px; border-radius:10px; border:0;
      background:rgba(30,36,32,0.55); color:#F4E8C4;
      font:700 16px/1 -apple-system,sans-serif; cursor:pointer;
    }
    @media (max-width:430px) {
      #three-l0 .three-l0-ver { display:inline-block; font-size:10px; opacity:0.95; max-width:none; }
      #three-peek .three-peek-unit { width:60px; height:70px; }
      #three-peek .three-peek-unit img { width:40px; height:40px; }
      #three-peek { padding:6px 6px; }
      #three-peek .three-tile-row.is-wave { gap:3px; }
      #three-peek .three-tile-row.is-wave .three-tile { padding:3px 1px 2px; border-radius:10px; }
      #three-peek .three-tile-row.is-wave .three-tile img { width:24px; height:24px; }
      #three-peek .three-tile-row.is-wave .three-cube { --s:24px; }
      #three-peek .three-tile-row.is-wave .three-tile em { font-size:8px; }
      #three-peek .three-tile-row.is-wave .three-step { width:15px; height:15px; flex-basis:15px; font-size:11px; }
      #three-peek .three-tile-row.is-wave .three-tile-steps b { min-width:14px; font-size:8px; }
      #three-phase-strip .three-step { font-size:11px; }
      #three-confirm, #three-confirm.is-idle, #three-confirm:disabled {
        min-height:56px; height:auto; max-height:72px; font-size:15px;
      }
      #three-battle strong { font-size:14px; }
      #three-battle .three-die { width:18px; height:18px; }
      #three-lobby .three-lobby-logo { font-size:28px; }
      #three-lobby button.three-lobby-card { min-height:80px; padding:14px; }
      #three-lobby .three-lobby-card-title { font-size:20px; }
      #three-lobby .three-lobby-main { gap:8px; }
      #three-lobby .three-lobby-title { font-size:18px; }
      #three-lobby .three-lobby-sub { font-size:12px; }
      #three-lobby h2 { margin:0 0 4px; }
      #three-lobby .three-lobby-seats { gap:6px; }
      #three-lobby .three-lobby-seat-wrap { min-height:46px; padding:3px 8px; gap:6px; }
      #three-lobby .three-lobby-seat { min-height:44px; padding:0; }
      #three-lobby .three-lobby-seat-flag { width:32px; height:32px; flex-basis:32px; }
      #three-lobby select.three-lobby-select { font-size:16px; }
      #three-lobby .three-lobby-opts { padding:6px 8px; gap:6px; }
      #three-lobby .three-lobby-foot { display:none; }
      #three-lobby .three-lobby-start { min-height:48px; }
      .three-tech-grid { gap:4px; }
      .three-tech-tile { min-height:40px; padding:4px 6px; font-size:11px; }
    }
  `;
  document.head.appendChild(style);

  const l0 = document.createElement('div');
  l0.id = 'three-l0';
  l0.innerHTML = `
    <button type="button" id="three-menu-btn" aria-label="Menu">☰</button>
    <span class="three-l0-chip" id="three-phase">${phase}</span>
    <span class="three-l0-chip three-l0-seat">
      <span class="three-l0-pip" id="three-seat-pip"></span>
      <span id="three-seat">${seat}</span>
    </span>
    <span class="three-l0-chip three-l0-ipc" id="three-ipc">IPC ${ipc}</span>
    <button type="button" class="three-l0-help" id="three-help-btn" aria-label="How to start">?</button>
    <span class="three-l0-ver"></span>
  `;
  document.body.appendChild(l0);
  applyLiveStamp();

  const strip = document.createElement('div');
  strip.id = 'three-phase-strip';
  strip.setAttribute('aria-live', 'polite');
  document.body.appendChild(strip);

  const zoom = document.createElement('div');
  zoom.id = 'three-zoom';
  zoom.innerHTML = `
    <button type="button" data-zoom="in" aria-label="Zoom in">+</button>
    <button type="button" data-zoom="out" aria-label="Zoom out">−</button>
    <button type="button" data-zoom="fit" aria-label="Fit pocket">Fit</button>
  `;
  document.body.appendChild(zoom);

  const bottom = document.createElement('div');
  bottom.id = 'three-bottom';
  bottom.innerHTML = `
    <button type="button" id="three-stack-toggle" aria-pressed="false">Expand stacks</button>
    <div id="three-guide" aria-live="polite"></div>
    <div id="three-sheet-stack">
      <div id="three-battle"></div>
      <div id="three-peek"></div>
    </div>
    <div id="three-actions">
      <button type="button" id="three-undo">Undo</button>
      <button type="button" id="three-confirm" class="is-idle" disabled>Select units</button>
    </div>
  `;
  document.body.appendChild(bottom);

  const sheet = document.createElement('div');
  sheet.id = 'three-sheet';
  sheet.innerHTML = `
    <h2>Match</h2>
    <button type="button" class="three-sheet-row" data-sheet="close">Back to board</button>
    <button type="button" class="three-sheet-row" data-sheet="solo">New Game vs AI</button>
    <button type="button" class="three-sheet-row" data-sheet="canvas">Open live Canvas (no preview)</button>
    <p class="three-sheet-note">Preview only · main art · ${UX_LABEL_EXPERIMENTAL} · SCHEMA ${SCHEMA_VERSION} · do not merge.</p>
  `;
  document.body.appendChild(sheet);

  const lobby = document.createElement('div');
  lobby.id = 'three-lobby';
  lobby.innerHTML = '<h1 class="three-lobby-title">Tactical Risk</h1>';
  document.body.appendChild(lobby);

  const tutorial = document.createElement('div');
  tutorial.id = 'three-tutorial';
  document.body.appendChild(tutorial);

  const stackToggle = bottom.querySelector('#three-stack-toggle');

  const api = {
    l0,
    zoom,
    bottom,
    sheet,
    lobby,
    tutorial,
    helpBtn: l0.querySelector('#three-help-btn'),
    peek: bottom.querySelector('#three-peek'),
    guideEl: bottom.querySelector('#three-guide'),
    stripEl: strip,
    battleEl: bottom.querySelector('#three-battle'),
    confirm: bottom.querySelector('#three-confirm'),
    undoBtn: bottom.querySelector('#three-undo'),
    phaseEl: l0.querySelector('#three-phase'),
    seatEl: l0.querySelector('#three-seat'),
    ipcEl: l0.querySelector('#three-ipc'),
    pipEl: l0.querySelector('#three-seat-pip'),
    menuBtn: l0.querySelector('#three-menu-btn'),
    guide: null,
    guideOn: false,
    stackToggle,
    stacksExpanded: false,
    onStackToggle: null,
    onUnitPick: null,
    onUnitStep: null,
    onLossPick: null,
    onLossStep: null,
    onUndo: null,
    onTechPick: null,
    onShipPick: null,
    onGuideDismiss: null,
    onNewGameVsAI: null,
    onLobbyChange: null,
    onLobbyStart: null,
    onTutorialDismiss: null,
    onHowTo: null,
    applyLiveStamp,
    hitRects() {
      return chromeHitRectsFrom(api);
    },
    blocksMapAt(clientX, clientY) {
      if (api.isSheetOpen()) return true;
      return isPointInAnyRect(clientX, clientY, api.hitRects());
    },
    setSeat(name, color) {
      api.seatEl.textContent = name;
      if (color) api.pipEl.style.background = color;
    },
    setPhase(word) {
      api.phaseEl.textContent = word;
    },
    setIpc(n) {
      api.ipcEl.textContent = `IPC ${n}`;
    },
    syncLayers() {
      const l2 = sheet.classList.contains('is-open');
      const battleOn = api.battleEl.classList.contains('is-on');
      const l1 = !l2 && !battleOn && api.peek.classList.contains('is-on');
      document.documentElement.classList.toggle('has-l1', l1);
      document.documentElement.classList.toggle('has-l2', l2);
      document.documentElement.classList.toggle('has-battle', battleOn);
      document.documentElement.classList.toggle('has-stacks', api.stacksExpanded);
      const hideZoom = l1 || l2 || battleOn || api.isLobbyOpen() || api.isTutorialOpen();
      api.zoom.hidden = hideZoom;
      api.zoom.setAttribute('aria-hidden', hideZoom ? 'true' : 'false');
    },
    setSheetOpen(open) {
      sheet.classList.toggle('is-open', !!open);
      if (open) api.peek.classList.remove('is-on');
      else if (api.peek.textContent) api.peek.classList.add('is-on');
      api.syncLayers();
    },
    isSheetOpen() {
      return sheet.classList.contains('is-open');
    },
    isLobbyOpen() {
      return lobby.classList.contains('is-open');
    },
    isTutorialOpen() {
      return tutorial.classList.contains('is-open');
    },
    setLobbyOpen(open) {
      lobby.classList.toggle('is-open', !!open);
      document.documentElement.classList.toggle('has-lobby', !!open);
      if (open) {
        api.setSheetOpen(false);
        api.setTutorialOpen(false);
        api.zoom.hidden = true;
        api.syncLobbyFooterPad();
      }
      api.syncLayers();
    },
    syncLobbyFooterPad() {
      const setup = lobby.querySelector('.three-lobby-setup');
      const footer = lobby.querySelector('.three-lobby-footer');
      if (!setup || !footer) return 0;
      const h = Math.max(56, Math.round(footer.getBoundingClientRect().height));
      setup.style.setProperty('--three-lobby-footer-h', `${h}px`);
      return h;
    },
    setTutorialOpen(open) {
      tutorial.classList.toggle('is-open', !!open);
      document.documentElement.classList.toggle('has-tutorial', !!open);
      if (open) {
        api.setSheetOpen(false);
        api.zoom.hidden = true;
        api.paintTutorial();
      }
      api.syncLayers();
    },
    paintTutorial() {
      tutorial.innerHTML = `
        <p class="three-lobby-path">How to Play</p>
        <p class="three-lobby-title">${SETUP_TUTORIAL_TITLE}</p>
        <p class="three-lobby-sub">No sign-in · SCHEMA ${SCHEMA_VERSION}</p>
        ${SETUP_TUTORIAL_STEPS.map((step) => `
          <div class="three-tut-step"><b>${step.kicker}</b><p>${step.body}</p></div>
        `).join('')}
        <button type="button" class="three-tut-go" data-tutorial="dismiss">Got it</button>
      `;
    },
    paintLobby(model = {}) {
      const screen = model.screen || 'main';
      const mp = model.mp || {};
      const mpError = mp.error || '';
      const room = mp.lobby || null;
      const roomPlayers = room?.players || [];
      const roomFactions = model.factions || [];
      const taken = new Set(roomPlayers.map((p) => p.factionId).filter(Boolean));
      const host = !!mp.isHost;
      const localUserId = typeof mp.localUserId === 'function'
        ? (mp.localUserId() || '')
        : (mp.localUserId || '');
      const localUser = mp.user || null;
      const welcomeName = formatWelcomeName(localUser);
      const welcomeEmail = formatWelcomeEmail(localUser);
      const identityHtml = isRealAuthIdentity(localUser) && welcomeName
        ? `<div class="three-lobby-identity" data-auth-surface="session">
            <p>Signed in as <strong>${welcomeName}</strong>${welcomeEmail && welcomeEmail !== welcomeName ? ` <span class="three-lobby-identity-email">${welcomeEmail}</span>` : ''}</p>
            <button type="button" class="three-lobby-signout" data-lobby="mp-signout">Sign Out</button>
          </div>`
        : (mp.authSurface === 'restoring'
          ? `<div class="three-lobby-identity" data-auth-surface="restoring"><p>Restoring your session…</p></div>`
          : `<div class="three-lobby-identity" data-auth-surface="signin"><p>Sign in when you create or join. Session stays until Sign Out.</p></div>`);
      const code = room?.code || '------';

      if (screen === 'online' || screen === 'create' || screen === 'join' || screen === 'room') {
        if (screen === 'online') {
          lobby.innerHTML = `
            <div class="three-lobby-home">
              <div class="three-lobby-setup-head">
                <button type="button" class="three-lobby-back" data-lobby="screen" data-value="main" aria-label="Back">${LOBBY_BACK_ICON}</button>
                <div>
                  <p class="three-lobby-title">Play Online</p>
                  <p class="three-lobby-sub">Same Firebase as Classic · ${UX_LABEL_EXPERIMENTAL}</p>
                </div>
              </div>
              ${identityHtml}
              <div class="three-lobby-actions">
                ${lobbyCardHtml({
                  action: 'screen', value: 'create', mark: LOBBY_MARK_LOCAL,
                  kicker: 'Host', title: 'Create Game',
                  desc: 'Open a lobby · share the code',
                })}
                ${lobbyCardHtml({
                  action: 'screen', value: 'join', mark: LOBBY_MARK_ONLINE,
                  kicker: 'Join', title: 'Join by Code',
                  desc: 'Enter a 6-character code',
                })}
              </div>
              ${mpError ? `<p class="three-lobby-error">${mpError}</p>` : ''}
            </div>
          `;
        } else if (screen === 'create') {
          lobby.innerHTML = `
            <div class="three-lobby-howto">
              <div class="three-lobby-setup-head">
                <button type="button" class="three-lobby-back" data-lobby="screen" data-value="online" aria-label="Back">${LOBBY_BACK_ICON}</button>
                <div>
                  <p class="three-lobby-title">Create Game</p>
                  <p class="three-lobby-sub">Host · ${UX_LABEL_EXPERIMENTAL}</p>
                </div>
              </div>
              ${identityHtml}
              <form class="three-lobby-form" data-lobby-form="create" autocomplete="off">
                <label>Game name<input name="name" maxlength="30" placeholder="Game"></label>
                <label>Max players
                  <select name="maxPlayers">
                    <option value="2">2</option><option value="3">3</option>
                    <option value="4">4</option><option value="5" selected>5</option>
                  </select>
                </label>
                <label>Starting IPCs
                  <select name="startingIPCs">
                    ${STARTING_IPC_OPTIONS.map((n) => `<option value="${n}" ${n === 80 ? 'selected' : ''}>${n}</option>`).join('')}
                  </select>
                </label>
                ${mpError ? `<p class="three-lobby-error">${mpError}</p>` : ''}
                <button type="submit" class="three-lobby-start">Create lobby</button>
              </form>
            </div>
          `;
        } else if (screen === 'join') {
          lobby.innerHTML = `
            <div class="three-lobby-howto">
              <div class="three-lobby-setup-head">
                <button type="button" class="three-lobby-back" data-lobby="screen" data-value="online" aria-label="Back">${LOBBY_BACK_ICON}</button>
                <div>
                  <p class="three-lobby-title">Join by Code</p>
                  <p class="three-lobby-sub">Same games as Classic</p>
                </div>
              </div>
              ${identityHtml}
              <form class="three-lobby-form" data-lobby-form="join" autocomplete="off">
                <label>Code<input name="code" maxlength="6" placeholder="ABC123" class="code-input"></label>
                <label>Password<input name="password" type="password" placeholder="If required"></label>
                ${mpError ? `<p class="three-lobby-error">${mpError}</p>` : ''}
                <button type="submit" class="three-lobby-start">Join lobby</button>
              </form>
            </div>
          `;
        } else {
          lobby.innerHTML = `
            <div class="three-lobby-setup">
              <div class="three-lobby-setup-head">
                <button type="button" class="three-lobby-back" data-lobby="screen" data-value="online" aria-label="Back">${LOBBY_BACK_ICON}</button>
                <div>
                  <p class="three-lobby-title">Lobby ${code}</p>
                  <p class="three-lobby-sub">${host ? 'Host' : 'Guest'} · Human / AI / Empty</p>
                </div>
              </div>
              <div class="three-lobby-main">
                <div class="three-lobby-sec three-lobby-seats-sec">
                  <h2>Seats</h2>
                  <div class="three-lobby-seats">
                    ${roomFactions.map((f) => {
                      const seated = roomPlayers.find((p) => p.factionId === f.id);
                      const kind = seated ? (seated.isAI ? 'ai' : 'human') : 'empty';
                      const tier = seated?.aiDifficulty || 'medium';
                      const isMe = !!(seated && !seated.isAI && localUserId && seated.oderId === localUserId);
                      const meta = seated
                        ? (seated.isAI ? `${occupantChipLabel(tier)} AI` : (seated.displayName || 'Human'))
                        : 'Empty';
                      return `
                        <div class="three-lobby-seat-wrap${seated ? ' is-on' : ''}" data-seat="${f.id}">
                          <button type="button" class="three-lobby-seat${seated ? ' is-on' : ''}" data-lobby="mp-faction" data-value="${f.id}">
                            ${factionFlagHtml(f, seated?.color || f.color)}
                            <span class="three-lobby-seat-name">${f.name || f.id}</span>
                          </button>
                          ${host ? occupantSelectHtml(f, { on: !!seated, kind, tier }, { action: 'mp-occupant' }) : `<span class="three-lobby-seat-meta is-show">${meta}</span>`}
                          ${isMe ? `
                            <label class="three-lobby-discord">Discord
                              <input type="text" data-lobby-discord="1" maxlength="48" placeholder="ID or username (optional)" value="${seated.discordUserId || seated.discordName || ''}" autocomplete="off">
                            </label>
                          ` : (!seated?.isAI && (seated?.discordUserId || seated?.discordName)
                            ? `<span class="three-lobby-discord-linked">Discord linked</span>`
                            : '')}
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
                ${mpError ? `<p class="three-lobby-error">${mpError}</p>` : ''}
              </div>
              <div class="three-lobby-footer">
                <button type="button" class="three-lobby-start" data-lobby="mp-start" ${host && roomPlayers.length >= 2 && roomPlayers.every((p) => p.factionId) ? '' : 'disabled'}>
                  ${host ? `Start Game (${roomPlayers.length})` : 'Waiting for host'}
                </button>
              </div>
            </div>
          `;
        }
        api.setLobbyOpen(true);
        applyLiveStamp();
        return;
      }

      if (screen === 'main' || model.showHowTo) {
        if (model.showHowTo && screen !== 'setup') {
          lobby.innerHTML = `
            <div class="three-lobby-howto">
              <div class="three-lobby-setup-head">
                <button type="button" class="three-lobby-back" data-lobby="screen" data-value="main" aria-label="Back">${LOBBY_BACK_ICON}</button>
                <div>
                  <p class="three-lobby-title">How to Play</p>
                  <p class="three-lobby-sub">Guest · Rules — no sign-in</p>
                </div>
              </div>
              ${SETUP_TUTORIAL_STEPS.map((step) => `
                <div class="three-tut-step"><b>${step.kicker}</b><p>${step.body}</p></div>
              `).join('')}
              <button type="button" class="three-lobby-start" data-lobby="screen" data-value="setup">New Local Game</button>
            </div>
          `;
          api.setLobbyOpen(true);
          applyLiveStamp();
          return;
        }
        lobby.innerHTML = `
          <div class="three-lobby-home">
            <div class="three-lobby-brand">
              <h1 class="three-lobby-logo">Tactical Risk</h1>
              <p class="three-lobby-tag">World War II Grand Strategy</p>
              <span class="three-lobby-ver"></span>
            </div>
            <div class="lobby-ux-picker three-lobby-ux">
              <p class="lobby-ux-kicker">Interface</p>
              <div class="lobby-ux-row">
                <button type="button" class="lobby-ux-btn" data-lobby="ux" data-value="classic">
                  <span class="lobby-ux-title">Classic</span>
                  <span class="lobby-ux-desc">Canvas · default</span>
                </button>
                <button type="button" class="lobby-ux-btn lobby-ux-btn-new is-on" data-lobby="ux" data-value="three" aria-pressed="true">
                  <span class="lobby-ux-title">${UX_LABEL_EXPERIMENTAL}</span>
                  <span class="lobby-ux-desc">Optional</span>
                </button>
              </div>
            </div>
            <p class="three-lobby-path">Start here</p>
            <div class="three-lobby-actions">
              ${lobbyCardHtml({
                action: 'screen', value: 'setup', mark: LOBBY_MARK_LOCAL,
                kicker: 'This device', title: 'Local Play',
                desc: 'Friends or AI on this screen',
              })}
              ${lobbyCardHtml({
                action: 'screen', value: 'online', mark: LOBBY_MARK_ONLINE,
                kicker: 'Multiplayer', title: 'Play Online',
                desc: 'Create or join · full MP',
              })}
              ${lobbyCardHtml({
                action: 'howto', value: '1', mark: LOBBY_MARK_HOWTO,
                kicker: 'Guest', title: 'How to Play',
                desc: 'Rules · no sign-in',
              })}
            </div>
          </div>
        `;
        api.setLobbyOpen(true);
        applyLiveStamp();
        return;
      }
      const factions = model.factions || [];
      const mode = model.mode || 'risk';
      const classic = mode === 'classic';
      const canStart = lobbyCanStart(model);
      lobby.innerHTML = `
        <div class="three-lobby-setup">
          <div class="three-lobby-setup-head">
            <button type="button" class="three-lobby-back" data-lobby="screen" data-value="main" aria-label="Back">${LOBBY_BACK_ICON}</button>
            <div>
              <p class="three-lobby-title">New Local Game</p>
              <p class="three-lobby-sub">Tap 2–5 factions · one Human</p>
            </div>
          </div>
          <div class="three-lobby-main">
            <div class="three-lobby-toolbar">
              <label>Mode
                <select class="three-lobby-select" data-lobby-select="mode" aria-label="Mode">
                  <option value="classic" ${classic ? 'selected' : ''}>Classic 1942</option>
                  <option value="risk" ${!classic ? 'selected' : ''}>Risk</option>
                </select>
              </label>
              ${classic ? '' : `
                <label>IPCs
                  <select class="three-lobby-select" data-lobby-select="ipc" aria-label="Starting IPCs">
                    ${STARTING_IPC_OPTIONS.map((n) => `
                      <option value="${n}" ${Number(model.startingIPCs) === n ? 'selected' : ''}>${n}</option>
                    `).join('')}
                  </select>
                </label>
              `}
            </div>
            <div class="three-lobby-sec three-lobby-seats-sec">
              <h2>Players</h2>
              <div class="three-lobby-seats">
                ${factions.map((f) => compactLocalSeatHtml(f, model)).join('')}
              </div>
            </div>
            <p class="three-lobby-foot">${classic
              ? 'Historical 1942 stacks · skip capital / deploy'
              : 'Random Territories • Capital Conquest Victory'}</p>
          </div>
          <div class="three-lobby-footer">
            <div class="three-lobby-opts">
              <div class="three-lobby-opt">
                <span>Teams</span>
                <button type="button" class="three-lobby-tile${model.teamsEnabled ? ' is-on' : ''}" data-lobby="teams" data-value="${model.teamsEnabled ? '0' : '1'}">${model.teamsEnabled ? 'On' : 'Off'}</button>
              </div>
            </div>
            <button type="button" class="three-lobby-start" data-lobby="start" ${canStart ? '' : 'disabled'}>${lobbyStartLabel(model)}</button>
          </div>
        </div>
      `;
      api.setLobbyOpen(true);
      api.syncLobbyFooterPad();
      applyLiveStamp();
    },
    setConfirmIdle(label = 'Tap units') {
      api.confirm.disabled = true;
      api.confirm.setAttribute('disabled', '');
      api.confirm.setAttribute('aria-disabled', 'true');
      api.confirm.dataset.youReady = '0';
      api.confirm.dataset.cta = '';
      api.confirm.classList.remove('is-ready');
      api.confirm.classList.add('is-idle');
      api.confirm.textContent = label;
      api.confirm.style.removeProperty('background');
      api.confirm.style.removeProperty('color');
    },
    setConfirmReady(label) {
      api.confirm.disabled = false;
      api.confirm.removeAttribute('disabled');
      api.confirm.setAttribute('aria-disabled', 'false');
      api.confirm.dataset.youReady = '1';
      api.confirm.classList.remove('is-idle');
      api.confirm.classList.add('is-ready');
      api.confirm.textContent = label;
      if (/confirm attack/i.test(label || '')) api.confirm.dataset.cta = 'confirm-attack';
      try { api.confirm.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ }
    },
    setUndo(on = false) {
      if (!api.undoBtn) return;
      api.undoBtn.classList.toggle('is-on', !!on);
      api.undoBtn.removeAttribute('hidden');
      api.undoBtn.setAttribute('aria-hidden', on ? 'false' : 'true');
      document.documentElement.classList.toggle('has-undo', !!on);
      applyLiveStamp();
    },
    setConfirmReplay(label) {
      api.confirm.disabled = false;
      api.confirm.classList.remove('is-ready');
      api.confirm.classList.add('is-idle');
      api.confirm.textContent = label;
      api.confirm.style.removeProperty('background');
      api.confirm.style.removeProperty('color');
    },
    setGuide(text, on = true) {
      api.guideOn = !!on && !!text;
      return api.guideOn;
    },
    setPhaseStrip(steps, current = 1) {
      const list = Array.isArray(steps) ? steps.filter(Boolean) : (steps ? [String(steps)] : []);
      if (!list.length) {
        api.stripEl.innerHTML = '';
        return false;
      }
      if (list.length === 1) {
        api.stripEl.innerHTML = `<div class="three-steps"><span class="three-step is-now">${list[0]}</span></div>`;
        return true;
      }
      api.stripEl.innerHTML = `<div class="three-steps">${list.map((label, i) => {
        const n = i + 1;
        const cls = n === current ? ' is-now' : (n < current ? ' is-done' : '');
        const dot = i ? '<span class="three-dot">·</span>' : '';
        return `${dot}<span class="three-step${cls}"><i>${n}</i> ${label}</span>`;
      }).join('')}</div>`;
      return true;
    },
    setBattle(card) {
      if (!card) {
        api.battleEl.classList.remove('is-on');
        api.battleEl.innerHTML = '';
        api.syncLayers();
        return;
      }
      const research = card.kicker === 'Research' || card.kicker === 'Breakthrough';
      const dieHtml = (d) => cubeDieHtml(d.face, {
        hit: !!d.hit,
        side: d.side,
        size: 'sm',
      });
      const compactDice = (dice = [], { all = false } = {}) => {
        if (all) return dice.map(dieHtml).join('');
        const hits = dice.filter((d) => d.hit);
        const miss = dice.length - hits.length;
        const shown = (hits.length ? hits : dice.slice(0, 8)).map(dieHtml).join('');
        const missEl = miss > 0 && hits.length
          ? `<span class="three-die-miss">${miss} miss</span>`
          : '';
        return `${shown}${missEl}`;
      };
      const lanes = Array.isArray(card.lanes) && card.lanes.length
        ? `<div class="three-lanes">${card.lanes.map((lane) => {
          const hits = Number(lane.hits) || 0;
          const dice = compactDice(lane.dice || []);
          return `<div class="three-lane is-${lane.side || 'atk'}">
            <div class="three-lane-head"><span>${lane.label || ''}</span><b>${hits} hit${hits === 1 ? '' : 's'}</b></div>
            ${dice ? `<div class="three-dice">${dice}</div>` : ''}
          </div>`;
        }).join('')}</div>`
        : ((card.dice || []).length
          ? `<div class="three-dice${research ? ' is-hero' : ''}">${compactDice(card.dice, { all: research })}</div>`
          : '');
      const breakthrough = card.kicker === 'Breakthrough';
      const pickers = breakthrough ? [] : (card.pickers || []).map((p) => `
        <div class="three-picker" data-loss-side="${p.side}" data-readonly="${p.readOnly ? '1' : '0'}">
          <div class="three-picker-label">${p.label}</div>
          ${lossStepperHtml(p)}
        </div>`).join('');
      const techList = breakthrough
        ? ((card.techs || []).length ? card.techs : FALLBACK_TECHS)
        : (card.techs || []);
      const techs = techList.map((t) => `
        <div class="three-tech-tile${t.on ? ' is-on' : ''}" data-tech="${t.id}">
          <button type="button" class="three-tech-pick" data-tech-pick="${t.id}">${t.name}</button>
          <button type="button" class="three-tech-info" data-tech-info="${t.id}" aria-label="About ${t.name}">i</button>
        </div>`).join('');
      const pop = techList.map((t) => `
        <div class="three-tech-pop" data-tech-pop="${t.id}"><b>${t.name}</b> — ${t.info}</div>`).join('');
      api.battleEl.innerHTML = `
        <div class="three-battle-scroll">
          <p class="three-battle-kicker">${card.kicker || 'Battle'}</p>
          <strong>${card.title || ''}</strong>
          <div class="three-battle-body">${card.kicker === 'Breakthrough' ? 'Tap a tech, then Confirm' : (card.body || '')}</div>
          ${lanes}
          ${techs ? `${pop}<div class="three-tech-grid">${techs}</div>` : ''}
        </div>
        ${pickers ? `<div class="three-pickers">${pickers}</div>` : ''}`;
      api.battleEl.classList.add('is-on');
      api.wirePeekButtons();
      api.syncLayers();
    },
    setStacksExpanded(on) {
      api.stacksExpanded = !!on;
      stackToggle.setAttribute('aria-pressed', api.stacksExpanded ? 'true' : 'false');
      stackToggle.textContent = api.stacksExpanded ? 'Collapse stacks' : 'Expand stacks';
      api.syncLayers();
    },
    showGuide(on = false, text = '') {
      return api.setGuide(text, on);
    },
    wirePeekButtons() {
      const stamp = (el) => {
        if (!el || el.dataset.wired === '1') return;
        el.dataset.wired = '1';
      };
      // Never preventDefault on touchstart/touchmove. That steals vertical
      // finger-pan if the gesture starts on a chip/button. pointerdown/click
      // still seal the map hit. Do not bind activate on touch-start.
      const sealActivate = (e) => {
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
        if (e.type === 'touchstart' || e.type === 'touchmove') return;
        if (e.cancelable && typeof e.preventDefault === 'function') e.preventDefault();
      };
      api.peek.querySelectorAll('[data-step]').forEach((btn) => {
        stamp(btn);
        let last = 0;
        const activate = (e) => {
          sealActivate(e);
          if (e.type === 'touchstart' || e.type === 'touchmove') return;
          if (btn.disabled) return;
          const now = Date.now();
          if (now - last < 280) return;
          last = now;
          if (typeof api.onUnitStep === 'function') {
            api.onUnitStep(btn.dataset.unitType, Number(btn.dataset.step));
          }
        };
        btn.onpointerdown = activate;
        btn.onclick = activate;
      });
      api.peek.querySelectorAll('button.three-peek-unit[data-unit-type]').forEach((chip) => {
        stamp(chip);
        let last = 0;
        const activate = (e) => {
          sealActivate(e);
          if (e.type === 'touchstart' || e.type === 'touchmove') return;
          if (api.peek.dataset.airLand === '1') return;
          const now = Date.now();
          if (now - last < 280) return;
          last = now;
          if (typeof api.onUnitPick === 'function') api.onUnitPick(chip.dataset.unitType);
        };
        chip.onpointerdown = activate;
        chip.onclick = activate;
      });
      api.battleEl.querySelectorAll('[data-loss-step]').forEach((btn) => {
        stamp(btn);
        let last = 0;
        const activate = (e) => {
          sealActivate(e);
          if (e.type === 'touchstart' || e.type === 'touchmove') return;
          if (btn.disabled) return;
          const now = Date.now();
          if (now - last < 280) return;
          last = now;
          if (typeof api.onLossStep === 'function') {
            api.onLossStep(btn.dataset.lossSide, btn.dataset.lossType, Number(btn.dataset.lossStep));
          }
        };
        btn.onpointerdown = activate;
        btn.onclick = activate;
      });
      // YOU tiles are the assign control (P0: THEY must not steal taps).
      api.battleEl.querySelectorAll('[data-loss-pick]').forEach((tile) => {
        stamp(tile);
        let last = 0;
        const activate = (e) => {
          if (e.target?.closest?.('[data-loss-step]')) return;
          const picker = tile.closest?.('.three-picker');
          if (picker?.dataset?.readonly === '1') return;
          sealActivate(e);
          if (e.type === 'touchstart' || e.type === 'touchmove') return;
          const now = Date.now();
          if (now - last < 280) return;
          last = now;
          const side = tile.dataset.lossSide || picker?.dataset?.lossSide || 'att';
          if (side === 'def') return;
          if (typeof api.onLossPick === 'function') {
            api.onLossPick(side, tile.dataset.lossType || tile.dataset.unitType);
          } else if (typeof api.onLossStep === 'function') {
            api.onLossStep(side, tile.dataset.lossType || tile.dataset.unitType, 1);
          }
        };
        tile.onpointerdown = activate;
        tile.onclick = activate;
      });
      api.peek.querySelectorAll('[data-ship]').forEach((btn) => {
        stamp(btn);
        const activate = (e) => {
          sealActivate(e);
          if (e.type === 'touchstart' || e.type === 'touchmove') return;
          if (typeof api.onShipPick === 'function') api.onShipPick(btn.dataset.ship);
        };
        btn.onpointerdown = activate;
        btn.onclick = activate;
      });
    },
    paintPlay({
      land = null,
      stacks = [],
      unitType = null,
      unitTypes = null,
      steppers = null,
      airLand = false,
      label = null,
      gold = false,
      enabled = false,
      guide = '',
      guideOn = false,
      guideSteps = null,
      battle = null,
      replay = false,
      route = '',
      phaseStrip = undefined,
      phaseStripCurrent = 1,
      canUndo = false,
      cargo = null,
      targetShipId = null,
      researchHint = false,
      stage = '',
    } = {}) {
      api.setGuide('', false);
      if (api.confirm) {
        api.confirm.dataset.stage = stage || '';
        api.confirm.dataset.cta = (stage === 'confirm' && /attack/i.test(label || ''))
          ? 'confirm-attack' : '';
      }
      if (phaseStrip !== undefined) api.setPhaseStrip(phaseStrip, phaseStripCurrent);
      api.setBattle(battle);
      if (battle) {
        api.peek.classList.remove('is-on');
        api.peek.textContent = '';
      } else if (airLand) {
        const title = land?.name || 'Land aircraft';
        const rosterTotal = (steppers || stacks).reduce((n, s) => n + (Number(s.have ?? s.quantity) || 0), 0);
        api.peek.innerHTML = `<div class="three-peek-head"><strong>${title}</strong>
          <div class="three-peek-meta">${route || 'Selected aircraft'}</div></div>
          ${steppers?.length ? stepperRowHtml(steppers) : iconRowHtml(stacks)}`;
        api.peek.dataset.rosterTotal = String(rosterTotal);
        api.peek.dataset.airLand = '1';
        if (!api.isSheetOpen()) api.peek.classList.add('is-on');
      } else if (!land) {
        api.peek.classList.remove('is-on');
        api.peek.textContent = '';
        delete api.peek.dataset.airLand;
      } else {
        const owner = stacks[0]?.owner || (!land.isWater ? land.originalOwner : '');
        const ipcLine = !land.isWater ? `${printIpc(land)} IPC` : '';
        const rosterTotal = stacks.reduce((n, s) => n + (s.quantity || 0), 0);
        const research = researchHint || land.name === 'Research';
        const researchInfo = research
          ? '<p class="three-research-info">5 IPC per die. A 6 unlocks a breakthrough.</p>'
          : '';
        const body = research && steppers?.length
          ? `<div class="three-research-row">${cubeDieHtml(5, { size: 'sm' })}${stepperRowHtml(steppers, { dieSize: 'sm' })}</div>`
          : (steppers?.length ? stepperRowHtml(steppers) : iconRowHtml(stacks));
        api.peek.innerHTML = `<div class="three-peek-head"><strong>${land.name}</strong>
          <div class="three-peek-meta">${[owner, ipcLine, route].filter(Boolean).join(' · ')}</div></div>
          ${researchInfo}
          ${body}
          ${cargoRowHtml(cargo || [], targetShipId)}`;
        api.peek.dataset.rosterTotal = String(rosterTotal);
        delete api.peek.dataset.airLand;
        const pickedTypes = [
          ...(Array.isArray(unitTypes) ? unitTypes : []),
          ...(unitType ? [unitType] : []),
        ];
        for (const type of pickedTypes) {
          const picked = api.peek.querySelector(`[data-unit-type="${type}"]`);
          if (picked) picked.classList.add('is-picked');
        }
        if (!api.isSheetOpen()) api.peek.classList.add('is-on');
      }
      if (replay) api.setConfirmReplay(label || 'Replay scenario');
      else if (enabled || gold) api.setConfirmReady(label || 'Confirm: Take hits');
      else api.setConfirmIdle(label || 'Tap units');
      api.setUndo(!!canUndo);
      api.wirePeekButtons();
      api.syncLayers();
      applyLiveStamp();
    },
    paintSelection({ land = null, stacks = [], unitType = null, confirmed = false } = {}) {
      if (api.isSheetOpen()) {
        api.peek.classList.remove('is-on');
      }
      if (!land) {
        api.peek.classList.remove('is-on');
        api.peek.textContent = '';
        api.setConfirmIdle();
        api.syncLayers();
        return;
      }
      const owner = stacks[0]?.owner || (!land.isWater ? land.originalOwner : '');
      const unitLine = unitType ? `${formatUnitName(unitType)}` : '';
      const ipcLine = !land.isWater ? `${printIpc(land)} IPC` : '';
      const rosterTotal = stacks.reduce((n, s) => n + (s.quantity || 0), 0);
      api.peek.innerHTML = `<strong>${land.name}</strong>
        <div class="three-peek-meta">${[owner, ipcLine, unitLine].filter(Boolean).join(' · ')}</div>
        ${iconRowHtml(stacks)}`;
      api.peek.dataset.rosterTotal = String(rosterTotal);
      if (unitType) {
        const picked = api.peek.querySelector(`[data-unit-type="${unitType}"]`);
        if (picked) picked.classList.add('is-picked');
      }
      if (!api.isSheetOpen()) api.peek.classList.add('is-on');
      api.syncLayers();
      if (unitType) {
        const qty = stacks.find((s) => s.type === unitType)?.quantity || 1;
        api.setConfirmReady(`Confirm: ${shortType(unitType)} ×${qty} · ${land.name}`);
      } else {
        api.setConfirmReady(confirmed
          ? `Confirm inspect · ${land.name}`
          : `Confirm: ${land.name}`);
      }
      applyLiveStamp();
    },
  };

  for (const el of [api.l0, api.bottom, api.sheet, api.zoom, api.peek, api.battleEl, api.confirm, api.undoBtn, api.menuBtn, api.helpBtn, stackToggle]) {
    sealChromeControl(el);
  }
  bindSealedActivate(api.menuBtn, null, () => {
    api.setSheetOpen(!api.isSheetOpen());
  });
  bindSealedActivate(sheet, '[data-sheet]', (e, row) => {
    if (row.dataset.sheet === 'canvas') {
      location.href = stripPreviewParams(location.href);
      return;
    }
    if (row.dataset.sheet === 'solo') {
      api.setSheetOpen(false);
      if (typeof api.onNewGameVsAI === 'function') {
        api.onNewGameVsAI();
        return;
      }
      location.href = soloHref(location.href);
      return;
    }
    api.setSheetOpen(false);
  });
  bindSealedActivate(stackToggle, null, () => {
    api.setStacksExpanded(!api.stacksExpanded);
    if (typeof api.onStackToggle === 'function') api.onStackToggle(api.stacksExpanded);
  });
  bindSealedActivate(api.bottom, '[data-step]', (e, btn) => {
    if (typeof api.onUnitStep === 'function') {
      api.onUnitStep(btn.dataset.unitType, Number(btn.dataset.step));
    }
  });
  bindSealedActivate(api.bottom, 'button.three-peek-unit[data-unit-type]', (e, chip) => {
    if (api.peek?.dataset?.airLand === '1') return;
    if (typeof api.onUnitPick === 'function') api.onUnitPick(chip.dataset.unitType);
  });
  bindSealedActivate(api.undoBtn, null, () => {
    if (typeof api.onUndo === 'function') api.onUndo();
  });
  bindSealedActivate(api.bottom, '[data-ship]', (e, btn) => {
    if (typeof api.onShipPick === 'function') api.onShipPick(btn.dataset.ship);
  });
  bindSealedActivate(api.battleEl, '[data-tech-pick]', (e, btn) => {
    if (typeof api.onTechPick === 'function') api.onTechPick(btn.dataset.techPick);
    else if (typeof api.onLossStep === 'function') api.onLossStep('att', btn.dataset.techPick, 1);
  });
  bindSealedActivate(api.battleEl, '[data-tech-info]', (e, btn) => {
    const id = btn.dataset.techInfo;
    const open = api.battleEl.querySelector(`[data-tech-pop="${id}"]`);
    const was = open?.classList.contains('is-on');
    api.battleEl.querySelectorAll('[data-tech-pop]').forEach((pop) => pop.classList.remove('is-on'));
    if (open && !was) open.classList.add('is-on');
  });
  bindSealedActivate(lobby, '[data-lobby]', (e, btn) => {
    if (e.target?.closest?.('select, [data-color-toggle]')) return;
    const kind = btn.dataset.lobby;
    if (kind === 'start' || kind === 'mp-start') {
      if (typeof api.onLobbyStart === 'function') api.onLobbyStart();
      return;
    }
    if (typeof api.onLobbyChange === 'function') {
      api.onLobbyChange(kind, btn.dataset.value);
    }
  }, { prevent: false });
  lobby.addEventListener('click', (e) => {
    const pip = e.target?.closest?.('[data-color-toggle]');
    if (pip && lobby.contains(pip)) {
      const picker = pip.closest('.three-lobby-color-picker');
      const drop = picker?.querySelector('.three-lobby-color-drop');
      const open = !drop?.classList.contains('is-open');
      lobby.querySelectorAll('.three-lobby-color-drop').forEach((el) => el.classList.remove('is-open'));
      lobby.querySelectorAll('[data-color-toggle]').forEach((el) => el.setAttribute('aria-expanded', 'false'));
      if (open && drop) {
        drop.classList.add('is-open');
        pip.setAttribute('aria-expanded', 'true');
      }
      return;
    }
    if (!e.target?.closest?.('.three-lobby-color-drop')) {
      lobby.querySelectorAll('.three-lobby-color-drop').forEach((el) => el.classList.remove('is-open'));
      lobby.querySelectorAll('[data-color-toggle]').forEach((el) => el.setAttribute('aria-expanded', 'false'));
    }
  });
  lobby.addEventListener('change', (e) => {
    const input = e.target?.closest?.('[data-lobby-discord]');
    if (input && lobby.contains(input)) {
      if (typeof api.onLobbyChange === 'function') api.onLobbyChange('discord', input.value);
      return;
    }
    const sel = e.target?.closest?.('[data-lobby-select]');
    if (!sel || !lobby.contains(sel) || typeof api.onLobbyChange !== 'function') return;
    const kind = sel.dataset.lobbySelect;
    const seat = sel.dataset.seat;
    const value = sel.value;
    if (kind === 'occupant') api.onLobbyChange('occupant', `${seat}:${value}`);
    else if (kind === 'team') api.onLobbyChange('team', `${seat}:${value}`);
    else if (kind === 'mp-occupant') {
      if (value === 'empty' || value === 'human') api.onLobbyChange('mp-faction', seat);
      else api.onLobbyChange('mp-ai', `${seat}:${value}`);
    } else api.onLobbyChange(kind, value);
  });
  lobby.addEventListener('submit', (e) => {
    const form = e.target?.closest?.('[data-lobby-form]');
    if (!form || !lobby.contains(form)) return;
    e.preventDefault();
    if (typeof api.onLobbyForm === 'function') api.onLobbyForm(form.dataset.lobbyForm, form);
  });
  bindSealedActivate(tutorial, '[data-tutorial]', () => {
    api.setTutorialOpen(false);
    if (typeof api.onTutorialDismiss === 'function') api.onTutorialDismiss();
  }, { prevent: false });
  bindSealedActivate(api.helpBtn, null, () => {
    if (typeof api.onHowTo === 'function') api.onHowTo();
    else api.setTutorialOpen(true);
  });
  bindSealedActivate(api.guideEl, '[data-guide="dismiss"]', () => {
    api.setGuide('', false);
    if (typeof api.onGuideDismiss === 'function') api.onGuideDismiss();
  });
  api.setStacksExpanded(false);
  api.showGuide(false);
  applyLiveStamp();
  window.addEventListener('resize', () => api.syncLobbyFooterPad());
  return api;
}
