// End Turn must confirm the Firestore push before the seat is handed off.
// A rejected push restores the snapshot and asks for Retry. A successful
// push sends the next player's notice and does not roll back.
// Run: node tools/test-turn-handoff.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const {
  commitTurnHandoff,
  TURN_SAVE_FAILED_WARNING,
  turnNoticeCountsAsSent,
} = await import(new URL('../src/multiplayer/syncAuthority.js', import.meta.url));
const { bindDiscordTurnPing } = await import(new URL('../src/multiplayer/discordTurnPing.js', import.meta.url));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra));
  } else console.log('ok  :', label);
};

console.log('=== rejected push ===');
{
  let advanced = 0;
  let restored = 0;
  let notices = 0;
  const rejected = await commitTurnHandoff({
    advance() { advanced += 1; },
    async push() { return false; },
    async sendNotice() { notices += 1; return true; },
    restore() { restored += 1; },
  });
  check('a rejected push restores and does not send the notice',
    rejected.ok === false
    && rejected.advanced === false
    && rejected.noticeSent === false
    && rejected.retry === true
    && rejected.warning === TURN_SAVE_FAILED_WARNING
    && advanced === 1
    && restored === 1
    && notices === 0);

  let thrownRestored = 0;
  let thrownNotices = 0;
  const thrown = await commitTurnHandoff({
    advance() {},
    async push() { throw new Error('firestore rejected the write'); },
    async sendNotice() { thrownNotices += 1; return { ok: true }; },
    restore() { thrownRestored += 1; },
  });
  check('a push that throws restores and does not send the notice',
    thrown.ok === false
    && thrown.retry === true
    && thrown.warning.length > 0
    && thrownNotices === 0
    && thrownRestored === 1);
}

console.log('=== succeeding push ===');
{
  let restored = 0;
  let notices = 0;
  const saved = await commitTurnHandoff({
    advance() {},
    async push() { return true; },
    async sendNotice() { notices += 1; return { ok: true }; },
    restore() { restored += 1; },
  });
  check('a successful push sends the notice and does not restore',
    saved.ok === true
    && saved.advanced === true
    && saved.noticeSent === true
    && saved.retry === false
    && notices === 1
    && restored === 0);

  let noticeFailedRestore = 0;
  const noticeFailed = await commitTurnHandoff({
    advance() {},
    async push() { return true; },
    async sendNotice() { return { ok: false, reason: 'network' }; },
    restore() { noticeFailedRestore += 1; },
  });
  check('a notice failure after a saved turn does not roll back',
    noticeFailed.ok === true
    && noticeFailed.noticeSent === false
    && noticeFailedRestore === 0);

  check('an unconfigured or skipped notice still counts as sent',
    turnNoticeCountsAsSent({ ok: false, reason: 'unconfigured' })
    && turnNoticeCountsAsSent({ ok: false, reason: 'skip-ai' })
    && turnNoticeCountsAsSent({ ok: false, reason: 'no-pending' })
    && turnNoticeCountsAsSent({ ok: false, reason: 'soft-fail' })
    && turnNoticeCountsAsSent({ ok: false, reason: 'network' }) === false);
}

console.log('=== restoring a seat does not ping it ===');
{
  const listeners = [];
  let posts = 0;
  const gs = {
    currentPlayer: { id: 'a', name: 'Ann', isAI: false },
    players: [
      { id: 'a', name: 'Ann', isAI: false },
      { id: 'b', name: 'Bob', isAI: false },
    ],
    round: 1,
    currentPlayerIndex: 0,
    phase: 'playing',
    turnPhase: 'purchase',
    turnEvents: [],
    getTurnPhaseName() { return 'Purchase'; },
    subscribe(fn) {
      listeners.push(fn);
      return () => {};
    },
  };
  const unbind = bindDiscordTurnPing(gs, {
    deferUntilPushConfirmed: true,
    getGameId: () => 'ABC123',
    post: async () => {
      posts += 1;
      return { ok: true };
    },
  });
  gs.currentPlayer = { id: 'b', name: 'Bob', isAI: false };
  gs.currentPlayerIndex = 1;
  for (const fn of listeners) fn();
  unbind.holdSeat('a');
  const pending = unbind.confirmPushedSeat('b');
  const resolved = pending && typeof pending.then === 'function' ? await pending : pending;
  check('holdSeat drops the notice queued by the failed handoff',
    resolved?.reason === 'no-pending' && posts === 0);
}

console.log('=== visible retry ===');
{
  const main = readFileSync(join(root, 'src/main.js'), 'utf8');
  const warning = readFileSync(join(root, 'src/ui/turnSaveWarning.js'), 'utf8');
  check('End Turn uses the handoff and shows Retry',
    main.includes('commitTurnHandoff(')
    && main.includes('showTurnSaveWarning')
    && warning.includes("retry.textContent = 'Retry'")
    && warning.includes("banner.id = 'turn-save-warning'")
    && main.includes('holdSeat'));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall passed');
