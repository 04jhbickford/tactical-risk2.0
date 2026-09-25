// V2.81.57-unified.12 — lobby Discord name for hosts, remembered and prefilled.
// Run: node tools/test-lobby-discord-seat.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } = await import('../src/version.js');
const {
  rememberDiscordSeat,
  readRememberedDiscordSeat,
  parseDiscordSeatInput,
} = await import('../src/multiplayer/discordTurnPing.js');
const {
  DISCORD_SEAT_INPUT_DEBOUNCE_MS,
  buildHumanLobbySeat,
  captureFocusedDiscordDraft,
  createDiscordSeatSaver,
  discordFieldDisplayValue,
  lobbyPlayerDiscordHtml,
  nextDiscordPrefill,
  planDiscordSeatOnEntry,
  restoreFocusedDiscordDraft,
  shouldApplyDiscordWrite,
} = await import('../src/multiplayer/discordSeat.js');

let failures = 0;
const check = (label, cond) => {
  if (!cond) {
    failures++;
    console.error('FAIL:', label);
  } else {
    console.log('ok  :', label);
  }
};

function memoryStorage(initial = null) {
  const mem = new Map();
  if (initial != null) mem.set('tacticalRisk_discordSeat', initial);
  return {
    getItem: (key) => (mem.has(key) ? mem.get(key) : null),
    setItem: (key, value) => { mem.set(key, value); },
  };
}

function fakeInput(value, { start = null, end = null } = {}) {
  const input = {
    value,
    selectionStart: start == null ? String(value).length : start,
    selectionEnd: end == null ? String(value).length : end,
    focused: false,
    focus() { this.focused = true; },
    setSelectionRange(s, e) {
      this.selectionStart = s;
      this.selectionEnd = e;
    },
  };
  return input;
}

const hostUser = { id: 'rob', displayName: 'Robert007' };
const guestUser = { id: 'bastion', displayName: 'Bastion' };

console.log('=== V2.81.57-unified.12 stamp ===');
check('GAME_VERSION is V2.81.57-unified.12', GAME_VERSION === 'V2.81.57-unified.12');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  check('index.html meta stamp', html.includes('content="V2.81.57-unified.12"'));
  check('index.html lock stamp', html.includes("var LOCKED = 'V2.81.57-unified.12'"));
}

console.log('=== Host seat renders the Discord field ===');
{
  const host = buildHumanLobbySeat({
    user: hostUser,
    isHost: true,
    remembered: { discordUserId: '', discordName: '' },
    joinedAt: 1,
  });
  check('host seat is the host', host.isHost === true && host.oderId === 'rob');
  const html = lobbyPlayerDiscordHtml({ player: host, userId: 'rob' });
  check('host card has an editable Discord box',
    html.includes('data-action="discord-id"')
    && html.includes('>Discord<input'));
  check('another human does not get the editor',
    !lobbyPlayerDiscordHtml({
      player: { ...host, oderId: 'bastion', isHost: false },
      userId: 'rob',
    }).includes('data-action="discord-id"'));
  const ai = lobbyPlayerDiscordHtml({
    player: { oderId: 'ai_1', isAI: true, isHost: false, displayName: 'Easy Bot' },
    userId: 'ai_1',
  });
  check('AI seat has no Discord box', !ai.includes('data-action="discord-id"') && ai === '');
  const linked = lobbyPlayerDiscordHtml({
    player: { oderId: 'bastion', isHost: false, discordName: 'crusader_bastion' },
    userId: 'rob',
  });
  check('someone else\'s saved name is a linked mark',
    linked.includes('Discord linked') && !linked.includes('<input'));
}

console.log('=== Remembered value prefills create, join, and empty re-entry ===');
{
  const storage = memoryStorage();
  rememberDiscordSeat(parseDiscordSeatInput('robfox007'), storage);
  const remembered = readRememberedDiscordSeat(storage);
  check('memory keeps the screen name', remembered.discordName === 'robfox007' && remembered.discordUserId === '');

  const created = buildHumanLobbySeat({
    user: hostUser,
    isHost: true,
    remembered,
    joinedAt: 2,
  });
  check('create prefills the host seat',
    created.isHost === true && created.discordName === 'robfox007' && created.discordUserId === '');

  const joined = buildHumanLobbySeat({
    user: guestUser,
    isHost: false,
    remembered,
    joinedAt: 3,
  });
  check('join prefills the new seat',
    joined.isHost === false && joined.discordName === 'robfox007');

  const emptySeat = {
    oderId: 'rob',
    isHost: true,
    isAI: false,
    discordUserId: '',
    discordName: '',
  };
  const patch = planDiscordSeatOnEntry({ seat: emptySeat, remembered, editing: false });
  check('re-entry onto an empty seat is one update',
    patch && patch.discordName === 'robfox007' && patch.discordUserId === '');
  const first = nextDiscordPrefill({
    inFlight: false,
    seat: emptySeat,
    remembered,
    editing: false,
  });
  const second = nextDiscordPrefill({
    inFlight: first.inFlight,
    seat: emptySeat,
    remembered,
    editing: false,
  });
  check('re-entry does not queue a second update while the first is in flight',
    first.patch && second.patch === null && second.inFlight === true);
  check('a newer edit cancels an in-flight prefill',
    shouldApplyDiscordWrite({
      startedRev: 1,
      currentRev: 2,
      onlyIfEmpty: true,
      seat: { discordUserId: '', discordName: '' },
    }) === false);
  check('prefill still writes when the seat is empty and nothing newer was typed',
    shouldApplyDiscordWrite({
      startedRev: 1,
      currentRev: 1,
      onlyIfEmpty: true,
      seat: { discordUserId: '', discordName: '' },
    }) === true);
  check('prefill does not replace a Discord name already on the seat',
    shouldApplyDiscordWrite({
      startedRev: 1,
      currentRev: 1,
      onlyIfEmpty: true,
      seat: { discordName: 'kept' },
    }) === false);
  check('a seat that already has a name is left alone',
    planDiscordSeatOnEntry({
      seat: { ...emptySeat, discordName: 'already' },
      remembered,
    }) === null);
  check('typing in the box blocks the automatic write',
    planDiscordSeatOnEntry({ seat: emptySeat, remembered, editing: true }) === null);

  const shown = discordFieldDisplayValue(emptySeat, remembered);
  const shownHtml = lobbyPlayerDiscordHtml({
    player: emptySeat,
    userId: 'rob',
    remembered,
  });
  check('empty seat still shows the remembered name',
    shown === 'robfox007' && shownHtml.includes('value="robfox007"'));

  rememberDiscordSeat(parseDiscordSeatInput('261711980526567428'), storage);
  const asId = readRememberedDiscordSeat(storage);
  const idSeat = buildHumanLobbySeat({ user: hostUser, isHost: true, remembered: asId, joinedAt: 4 });
  check('a snowflake is stored as discordUserId',
    idSeat.discordUserId === '261711980526567428' && idSeat.discordName === '');
}

console.log('=== Typing survives a snapshot re-render ===');
{
  const live = fakeInput('robfox007', { start: 3, end: 3 });
  const draft = captureFocusedDiscordDraft(live, live);
  check('draft keeps the caret', draft && draft.value === 'robfox007' && draft.start === 3 && draft.end === 3);
  const painted = fakeInput('');
  const restored = restoreFocusedDiscordDraft(painted, draft);
  check('snapshot paint keeps value, caret, and focus',
    restored
    && painted.value === 'robfox007'
    && painted.selectionStart === 3
    && painted.selectionEnd === 3
    && painted.focused === true);
  check('an unfocused box is not treated as a draft',
    captureFocusedDiscordDraft(live, null) === null);

  let committed = [];
  let scheduled = null;
  const saver = createDiscordSeatSaver({
    commit: (raw) => { committed.push(raw); },
    debounceMs: DISCORD_SEAT_INPUT_DEBOUNCE_MS,
    schedule: (fn) => { scheduled = fn; return 1; },
    cancel: () => { scheduled = null; },
  });
  saver.onInput('rob');
  check('input does not save before the debounce', committed.length === 0 && saver.pending());
  scheduled();
  scheduled = null;
  check('debounce then saves the typed name', committed[0] === 'rob' && !saver.pending());
  saver.onInput('robfox');
  saver.onBlur('robfox007');
  check('blur flushes and drops the pending input timer',
    committed[committed.length - 1] === 'robfox007' && scheduled === null);
  saver.onEnter('');
  check('Enter can clear the name', committed[committed.length - 1] === '');
}

console.log('=== Clearing persists as empty ===');
{
  const storage = memoryStorage();
  rememberDiscordSeat(parseDiscordSeatInput('robfox007'), storage);
  rememberDiscordSeat(parseDiscordSeatInput(''), storage);
  const cleared = readRememberedDiscordSeat(storage);
  check('empty input is remembered as empty',
    cleared.discordUserId === '' && cleared.discordName === '');
  const seat = buildHumanLobbySeat({
    user: hostUser,
    isHost: true,
    remembered: cleared,
    joinedAt: 5,
  });
  check('create after a clear does not resurrect the old name',
    seat.discordUserId === '' && seat.discordName === '');
  check('re-entry does not write a cleared memory back',
    planDiscordSeatOnEntry({
      seat: { oderId: 'rob', isHost: true, discordUserId: '', discordName: '' },
      remembered: cleared,
    }) === null);
  const quoted = lobbyPlayerDiscordHtml({
    player: { oderId: 'rob', discordName: 'rob"fox' },
    userId: 'rob',
  });
  check('a quote in the name cannot break the attribute',
    quoted.includes('value="rob&quot;fox"') && !quoted.includes('value="rob"fox"'));
}

console.log('=== Classic lobby wiring ===');
{
  const lobbySrc = readFileSync(join(root, 'src/ui/multiplayerLobby.js'), 'utf8');
  const managerSrc = readFileSync(join(root, 'src/multiplayer/lobbyManager.js'), 'utf8');
  const css = readFileSync(join(root, 'style.css'), 'utf8');
  check('render preserves the focused Discord draft',
    lobbySrc.includes('captureFocusedDiscordDraft')
    && lobbySrc.includes('restoreFocusedDiscordDraft'));
  check('saves on input, blur, and Enter',
    lobbySrc.includes('onInput') && lobbySrc.includes('onBlur') && lobbySrc.includes('onEnter'));
  check('Discord box is not saved only on change',
    !/\[data-action="discord-id"\]'\)\?\.addEventListener\('change'/.test(lobbySrc));
  check('empty-seat re-entry uses one prefill',
    lobbySrc.includes('nextDiscordPrefill'));
  check('create and join build the seat with the remembered name',
    managerSrc.includes('buildHumanLobbySeat'));
  check('discord writes go through the stale-prefill guard',
    managerSrc.includes('updateDiscordSeat')
    && managerSrc.includes('shouldApplyDiscordWrite')
    && lobbySrc.includes('updateDiscordSeat'));
  check('desktop field stays a compact control',
    /@media \(min-width: 1024px\)[\s\S]*\.mp-discord-input/.test(css));
  check('phone field stays a 44px touch target',
    /@media \(max-width: 640px\)[\s\S]*\.mp-discord-input[\s\S]*min-height: 44px/.test(css));
  check('Discord input does not set touch-action:none',
    !/\.mp-discord-input\s*\{[^}]*touch-action:\s*none/.test(css));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nlobby discord seat checks passed');
