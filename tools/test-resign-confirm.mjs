// V2.81.57-unified.12 — Resign and Save & Exit use an in-app confirm.
// window.confirm is blocked in Discord and some iOS web views.
// Run: node tools/test-resign-confirm.mjs

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const VOID = new Set(['area', 'br', 'hr', 'img', 'input', 'link', 'meta', 'source', 'wbr']);

class El {
  constructor(tag) {
    this.tag = String(tag || 'div').toLowerCase();
    this.attrs = {};
    this.children = [];
    this.parentNode = null;
    this._text = '';
    this._listeners = {};
    this.id = '';
    this.style = {};
    this.hidden = false;
    this.type = '';
    const classSet = new Set();
    this._classSet = classSet;
    this.classList = {
      add: (...names) => {
        names.forEach((name) => name && classSet.add(name));
        this.attrs.class = [...classSet].join(' ');
      },
      remove: (...names) => {
        names.forEach((name) => classSet.delete(name));
        this.attrs.class = [...classSet].join(' ');
      },
      contains: (name) => classSet.has(name),
      toggle: (name, force) => {
        const on = force === undefined ? !classSet.has(name) : !!force;
        if (on) classSet.add(name);
        else classSet.delete(name);
        this.attrs.class = [...classSet].join(' ');
        return on;
      },
    };
  }

  get className() { return this.attrs.class || ''; }

  set className(value) {
    this._classSet.clear();
    String(value || '').split(/\s+/).filter(Boolean).forEach((name) => this._classSet.add(name));
    this.attrs.class = [...this._classSet].join(' ');
  }

  setAttribute(name, value) {
    const key = String(name);
    const text = String(value);
    this.attrs[key] = text;
    if (key === 'class') this.className = text;
    if (key === 'id') this.id = text;
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this.attrs, name) ? this.attrs[name] : null;
  }

  get dataset() {
    const out = {};
    for (const [key, value] of Object.entries(this.attrs)) {
      if (!key.startsWith('data-')) continue;
      const prop = key.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      out[prop] = value;
    }
    return out;
  }

  get textContent() {
    if (this.children.length) return this.children.map((child) => child.textContent || '').join('');
    return this._text;
  }

  set textContent(value) {
    this._text = String(value ?? '');
    this.children = [];
  }

  set innerHTML(html) {
    this.children = [];
    for (const child of parseChildren(String(html ?? ''))) this.appendChild(child);
  }

  get innerHTML() { return ''; }

  appendChild(child) {
    if (child?.parentNode) {
      child.parentNode.children = child.parentNode.children.filter((node) => node !== child);
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  after(node) {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (node.parentNode) {
      node.parentNode.children = node.parentNode.children.filter((child) => child !== node);
    }
    node.parentNode = this.parentNode;
    this.parentNode.children.splice(index + 1, 0, node);
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
    this.parentNode = null;
  }

  addEventListener(type, fn) {
    if (typeof fn !== 'function') return;
    (this._listeners[type] ||= []).push(fn);
  }

  removeEventListener(type, fn) {
    const list = this._listeners[type] || [];
    this._listeners[type] = list.filter((item) => item !== fn);
  }

  focus() {
    document.activeElement = this;
  }

  click() {
    const event = {
      type: 'click',
      target: this,
      currentTarget: this,
      stopPropagation() {},
      preventDefault() {},
    };
    for (const fn of (this._listeners.click || []).slice()) fn(event);
  }

  querySelector(sel) {
    return this.querySelectorAll(sel)[0] || null;
  }

  querySelectorAll(sel) {
    const out = [];
    const walk = (node) => {
      for (const child of node.children) {
        if (matches(child, sel)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

function matches(el, sel) {
  const selector = String(sel || '').trim();
  if (selector.startsWith('[')) {
    const found = selector.match(/^\[([^\]]+)="([^"]*)"\]$/);
    if (!found) return false;
    return el.getAttribute(found[1]) === found[2];
  }
  if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  return el.tag === selector.toLowerCase();
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([:@a-zA-Z_][\w:.-]*)(?:\s*=\s*"([^"]*)"|\s*=\s*'([^']*)')?/g;
  let match;
  while ((match = re.exec(raw || ''))) {
    attrs[match[1]] = match[2] ?? match[3] ?? '';
  }
  return attrs;
}

function parseChildren(html) {
  const root = new El('fragment');
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)([^>]*)>/g;
  let match;
  while ((match = re.exec(html))) {
    if (match[0].startsWith('<!--')) continue;
    if (match[1]) {
      const tag = match[1].toLowerCase();
      while (stack.length > 1 && stack[stack.length - 1].tag !== tag) stack.pop();
      if (stack.length > 1 && stack[stack.length - 1].tag === tag) stack.pop();
      continue;
    }
    const el = new El(match[2]);
    for (const [key, value] of Object.entries(parseAttrs(match[3] || ''))) el.setAttribute(key, value);
    stack[stack.length - 1].appendChild(el);
    const selfClose = /\/\s*$/.test(match[3] || '') || VOID.has(el.tag);
    if (!selfClose) stack.push(el);
  }
  return root.children.slice();
}

const documentElement = new El('html');
const body = new El('body');
documentElement.appendChild(body);
const hudEl = new El('div');
hudEl.id = 'hud';
body.appendChild(hudEl);

const documentListeners = {};
globalThis.document = {
  documentElement,
  body,
  activeElement: body,
  createElement(tag) { return new El(tag); },
  getElementById(id) {
    const walk = (node) => {
      if (node.id === id) return node;
      for (const child of node.children) {
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(documentElement);
  },
  querySelector(sel) { return documentElement.querySelector(sel); },
  querySelectorAll(sel) { return documentElement.querySelectorAll(sel); },
  addEventListener(type, fn) { (documentListeners[type] ||= []).push(fn); },
  removeEventListener(type, fn) {
    documentListeners[type] = (documentListeners[type] || []).filter((item) => item !== fn);
  },
};

function keydown(key, extra = {}) {
  let defaultPrevented = false;
  const event = {
    key,
    ...extra,
    preventDefault() { defaultPrevented = true; },
  };
  for (const fn of (documentListeners.keydown || []).slice()) fn(event);
  const active = document.activeElement;
  if ((key === 'Enter' || key === ' ') && !defaultPrevented && active?.tag === 'button') {
    active.click();
  }
}

let confirmCalls = 0;
globalThis.window = globalThis;
globalThis.confirm = () => { confirmCalls += 1; return false; };
globalThis.window.confirm = globalThis.confirm;

const { GAME_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { HUD } = await import(pathToFileURL(join(root, 'src/ui/hud.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

check('stamp is unified.12', GAME_VERSION === 'V2.81.57-unified.12');

const hudSrc = readFileSync(join(root, 'src/ui/hud.js'), 'utf8');
const paths = hudSrc.slice(hudSrc.indexOf('const exitItem'));
check('Resign / Save & Exit do not call window.confirm',
  !/\bconfirm\s*\(/.test(paths) && paths.includes('confirmChoice('));
check('phase tips binds every match',
  hudSrc.includes('querySelectorAll(\'[data-action="phase-tips"]\')'));

const css = readFileSync(join(root, 'style.css'), 'utf8');
check('phone sheet uses 44px buttons above the home indicator',
  css.includes('.tr-confirm--sheet .tr-confirm-btn')
  && css.includes('min-height: 44px')
  && css.includes('env(safe-area-inset-bottom, 0px)'));
check('desktop dialog is compact at 1024',
  /@media \(min-width: 1024px\) \{[\s\S]*\.tr-confirm--dialog \.tr-confirm-btn \{[\s\S]*min-height: 32px/.test(css));
check('phone menu sheet accepts taps under the HUD',
  /html\.mobile-shell \.phone-menu-sheet\.open \{[^}]*pointer-events:\s*auto/.test(css));

const gs = {
  phase: 'playing',
  turnPhase: 'develop_tech',
  round: 1,
  isMultiplayer: true,
  currentPlayerIndex: 0,
  currentPlayer: { id: 'Germans', name: 'Robfox007', isAI: false, color: '#ccc' },
  players: [{ id: 'Germans', name: 'Robfox007', isAI: false, color: '#ccc' }],
  subscribe() { return () => {}; },
};

const hud = new HUD();
hud.setGameState(gs);
let resigns = 0;
let exits = 0;
hud.setOnResign(() => { resigns += 1; });
hud.setOnExitToLobby(() => { exits += 1; });

const resignBtn = hud.el.querySelector('[data-action="resign"]');
const exitBtn = hud.el.querySelector('[data-action="exit-lobby"]');
check('desktop menu has Resign and Save & Exit', !!resignBtn && !!exitBtn);

const flush = () => Promise.resolve();

resignBtn.click();
const dialog = document.querySelector('.tr-confirm');
check('Resign opens a centered dialog',
  !!dialog && dialog.classList.contains('tr-confirm--dialog') && confirmCalls === 0);
check('Resign copy is the multiplayer warning',
  (dialog.querySelector('.tr-confirm-message')?.textContent || '').includes('Resign from this game'));
const openedCancel = document.querySelector('[data-confirm="cancel"]');
check('Resign dialog starts focused on Cancel', document.activeElement === openedCancel);
keydown('Enter');
await flush();
check('Enter with Cancel focused does not resign', resigns === 0 && exits === 0 && !document.querySelector('.tr-confirm'));

resignBtn.click();
document.querySelector('[data-confirm="ok"]').focus();
check('Resign button can take focus', document.activeElement === document.querySelector('[data-confirm="ok"]'));
keydown('Enter');
await flush();
check('Enter with Resign focused resigns once', resigns === 1 && exits === 0 && !document.querySelector('.tr-confirm'));

resignBtn.click();
keydown('Escape');
await flush();
check('Escape cancels Resign', resigns === 1 && !document.querySelector('.tr-confirm'));

resignBtn.click();
document.querySelector('[data-confirm="cancel"]').click();
await flush();
check('Cancel button does not resign', resigns === 1 && confirmCalls === 0);

exitBtn.click();
const exitDialog = document.querySelector('.tr-confirm');
check('Save & Exit opens the dialog',
  !!exitDialog && (exitDialog.querySelector('[data-confirm="ok"]')?.textContent || '') === 'Save & Exit');
exitDialog.querySelector('[data-confirm="cancel"]').click();
await flush();
check('cancelling Save & Exit does nothing', exits === 0 && resigns === 1);
exitBtn.click();
document.querySelector('[data-confirm="ok"]').click();
await flush();
check('confirming Save & Exit runs once', exits === 1 && resigns === 1 && confirmCalls === 0);

resignBtn.click();
const trapCancel = document.querySelector('[data-confirm="cancel"]');
const trapOk = document.querySelector('[data-confirm="ok"]');
check('focus trap starts on Cancel', document.activeElement === trapCancel);
keydown('Tab');
check('Tab moves to Resign and stays in the dialog', document.activeElement === trapOk);
keydown('Tab', { shiftKey: true });
check('Shift+Tab returns to Cancel', document.activeElement === trapCancel);
keydown('Escape');
await flush();
check('Escape from the focused dialog does not resign again', resigns === 1 && !document.querySelector('.tr-confirm'));

document.documentElement.classList.add('mobile-shell');
hud.menuOpen = true;
hud._render();
const tips = hud.el.querySelectorAll('[data-action="phase-tips"]');
check('phone renders the ? button and the Phase tips row', tips.length >= 2);
let tipsHits = 0;
hud.setOnPhaseTips(() => { tipsHits += 1; });
tips[tips.length - 1].click();
check('phone Phase tips row calls the handler', tipsHits === 1);
const phoneResign = hud.el.querySelector('[data-action="resign"]');
phoneResign.click();
const sheet = document.querySelector('.tr-confirm');
check('phone Resign is a bottom sheet',
  !!sheet && sheet.classList.contains('tr-confirm--sheet') && confirmCalls === 0);
sheet.querySelector('[data-confirm="cancel"]').click();
await flush();
check('cancelling the phone sheet does not resign again', resigns === 1);

console.log(failures === 0 ? '\nALL RESIGN CONFIRM CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
