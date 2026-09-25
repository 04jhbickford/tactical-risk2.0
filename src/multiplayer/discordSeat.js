// Waiting-lobby Discord seat. Classic only.
// The box used to save on `change` and the lobby rebuilt innerHTML on every
// snapshot, so a host's keystrokes were wiped before they stuck. These helpers
// are the save / prefill / focus-preserve path. Turn-ping payload shape stays
// in discordTurnPing.js.

import {
  parseDiscordSeatInput,
  readRememberedDiscordSeat,
} from './discordTurnPing.js';

export const DISCORD_SEAT_INPUT_DEBOUNCE_MS = 300;

export function escapeDiscordAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export function sameDiscordSeat(a, b) {
  return (a?.discordUserId || '') === (b?.discordUserId || '')
    && (a?.discordName || '') === (b?.discordName || '');
}

// Seat value wins. Remembered local value fills an empty seat for display.
// An optimistic write (including a cleared empty string) wins over both so a
// snapshot cannot paint the stale seat while the write is in flight.
export function discordFieldDisplayValue(player, remembered = null, optimistic = null) {
  if (optimistic) return optimistic.discordUserId || optimistic.discordName || '';
  const onSeat = player?.discordUserId || player?.discordName || '';
  if (onSeat) return onSeat;
  return remembered?.discordUserId || remembered?.discordName || '';
}

export function ownDiscordFieldHtml(value = '') {
  const safe = escapeDiscordAttr(value);
  return `<label class="mp-discord-field">Discord<input type="text" class="mp-discord-input" data-action="discord-id" maxlength="48" placeholder="ID or username (optional)" value="${safe}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done"></label>`;
}

// Host and every other human see the editor on their own card. isHost is not
// a reason to hide it. Other humans only get a linked mark.
export function lobbyPlayerDiscordHtml({
  player = null,
  userId = null,
  remembered = null,
  optimistic = null,
} = {}) {
  const isAI = !!player?.isAI;
  const isMe = !!(player && userId && player.oderId === userId);
  if (isMe && !isAI) {
    return ownDiscordFieldHtml(discordFieldDisplayValue(player, remembered, optimistic));
  }
  if (!isAI && (player?.discordName || player?.discordUserId)) {
    return '<span class="mp-discord-linked">Discord linked</span>';
  }
  return '';
}

export function buildHumanLobbySeat({
  user = null,
  isHost = false,
  remembered = null,
  joinedAt = Date.now(),
} = {}) {
  const discord = remembered || { discordUserId: '', discordName: '' };
  return {
    oderId: user?.id || null,
    displayName: user?.displayName || '',
    factionId: null,
    color: null,
    isReady: false,
    isHost: !!isHost,
    joinedAt,
    discordUserId: discord.discordUserId || '',
    discordName: discord.discordName || '',
  };
}

// One automatic write when my waiting-lobby seat has no discord fields.
// Editing (focused box) and an empty memory both skip. A cleared memory
// stays cleared.
export function planDiscordSeatOnEntry({
  seat = null,
  remembered = null,
  editing = false,
} = {}) {
  if (editing) return null;
  if (!seat || seat.isAI) return null;
  if (seat.discordUserId || seat.discordName) return null;
  if (!remembered?.discordUserId && !remembered?.discordName) return null;
  return {
    discordUserId: remembered.discordUserId || '',
    discordName: remembered.discordName || '',
  };
}

export function nextDiscordPrefill({
  inFlight = false,
  seat = null,
  remembered = null,
  editing = false,
} = {}) {
  if (inFlight) return { inFlight: true, patch: null };
  const patch = planDiscordSeatOnEntry({ seat, remembered, editing });
  if (!patch) return { inFlight: false, patch: null };
  return { inFlight: true, patch };
}

// A user edit bumps the revision. An in-flight prefill must not commit after
// that, and a prefill must not replace discord fields that are already set.
export function shouldApplyDiscordWrite({
  startedRev = 0,
  currentRev = 0,
  onlyIfEmpty = false,
  seat = null,
} = {}) {
  if (startedRev !== currentRev) return false;
  if (onlyIfEmpty && (seat?.discordUserId || seat?.discordName)) return false;
  return true;
}

export function captureFocusedDiscordDraft(input, activeElement) {
  if (!input || !activeElement || activeElement !== input) return null;
  const value = String(input.value ?? '');
  const start = Number.isInteger(input.selectionStart) ? input.selectionStart : value.length;
  const end = Number.isInteger(input.selectionEnd) ? input.selectionEnd : start;
  return { value, start, end };
}

export function restoreFocusedDiscordDraft(input, draft) {
  if (!input || !draft) return false;
  input.value = draft.value ?? '';
  if (typeof input.focus === 'function') {
    try {
      input.focus({ preventScroll: true });
    } catch {
      input.focus();
    }
  }
  if (typeof input.setSelectionRange === 'function') {
    const len = String(input.value ?? '').length;
    const start = clampIndex(draft.start, len);
    const end = clampIndex(draft.end, len);
    try {
      input.setSelectionRange(start, end);
    } catch {
      /* number/email inputs reject a range */
    }
  }
  if (typeof document !== 'undefined' && document.activeElement === input) return true;
  return input.focused === true;
}

function clampIndex(value, len) {
  const n = Number.isInteger(value) ? value : len;
  if (n < 0) return 0;
  if (n > len) return len;
  return n;
}

// input is debounced. blur and Enter flush immediately and cancel the timer
// so a snapshot cannot commit a stale prefix over a newer blur.
export function createDiscordSeatSaver({
  commit,
  debounceMs = DISCORD_SEAT_INPUT_DEBOUNCE_MS,
  schedule = (fn, ms) => setTimeout(fn, ms),
  cancel = (id) => clearTimeout(id),
} = {}) {
  let timer = null;
  let lastRaw = '';
  const flush = (raw) => {
    if (timer != null) {
      cancel(timer);
      timer = null;
    }
    lastRaw = raw;
    return commit?.(raw);
  };
  return {
    onInput(raw) {
      lastRaw = raw;
      if (timer != null) cancel(timer);
      timer = schedule(() => {
        timer = null;
        commit?.(lastRaw);
      }, debounceMs);
    },
    onBlur(raw) {
      return flush(raw);
    },
    onEnter(raw) {
      return flush(raw);
    },
    pending() {
      return timer != null;
    },
  };
}

export function rememberedDiscordFields(storage = null) {
  return readRememberedDiscordSeat(storage);
}

export function discordFieldsFromInput(raw) {
  return parseDiscordSeatInput(raw);
}
