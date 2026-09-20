// Discord turn ping: human-only, dedupe, untagged fallback, soft-fail.
// Run: node tools/test-discord-turn-ping.mjs

import { readFileSync } from 'node:fs';
import { GAME_VERSION } from '../src/version.js';
import {
  DISCORD_TURN_CHANNEL_ID,
  normalizeDiscordSnowflake,
  parseDiscordSeatInput,
  turnIndexOf,
  pingDedupeKey,
  buildDeepLink,
  buildDiscordTurnContent,
  shouldPingHumanSeat,
  maybePostDiscordTurnPing,
  bindDiscordTurnPing,
} from '../src/multiplayer/discordTurnPing.js';

const classicLobby = readFileSync(new URL('../src/ui/multiplayerLobby.js', import.meta.url), 'utf8');
const threeChrome = readFileSync(new URL('../src/map/threeMapChrome.js', import.meta.url), 'utf8');
const threeBoot = readFileSync(new URL('../src/map/threeSoloBoot.js', import.meta.url), 'utf8');
const classicMain = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

check('stamp is dual-path.5', GAME_VERSION === 'V2.81.57-dual-path.5');
check('channel id documented', DISCORD_TURN_CHANNEL_ID === '1551283474303025292');
check('Classic lobby field', classicLobby.includes('mp-discord-input') && classicLobby.includes('data-action="discord-id"'));
check('New UX lobby field', threeChrome.includes('data-lobby-discord') && threeChrome.includes('three-lobby-discord'));
check('Classic bind on sync', classicMain.includes('bindDiscordTurnPing'));
check('New UX bind on sync', threeBoot.includes('bindDiscordTurnPing') && threeBoot.includes('attachDiscordTurnPing'));
check('snowflake from mention', normalizeDiscordSnowflake('<@123456789012345678>') === '123456789012345678');
check('username is not a snowflake', normalizeDiscordSnowflake('james') === '');
check('parse id', parseDiscordSeatInput('123456789012345678').discordUserId === '123456789012345678');
check('parse name', parseDiscordSeatInput('james').discordName === 'james');

const human = { id: 'Russians', oderId: 'u1', isAI: false, discordUserId: '123456789012345678' };
const ai = { id: 'Germans', oderId: 'bot', isAI: true };
check('skip AI', shouldPingHumanSeat({
  player: ai, gameId: 'ABC123', turnIndex: 1, seatId: 'Germans', seen: new Set(),
}).reason === 'skip-ai');
check('human allowed', shouldPingHumanSeat({
  player: human, gameId: 'ABC123', turnIndex: 1, seatId: 'Russians', seen: new Set(),
}).ok === true);
check('dedupe key', pingDedupeKey({ gameId: 'ABC123', turnIndex: 65, seatId: 'Russians' }) === 'ABC123|65|Russians');
check('turn index', turnIndexOf({ round: 1, currentPlayerIndex: 1 }) === 65);

const sample = buildDiscordTurnContent({
  discordUserId: '123456789012345678',
  faction: 'Russians',
  phase: 'Combat Move',
  deepLink: buildDeepLink({
    origin: 'https://tactical-risk20.vercel.app/',
    uxMode: 'three',
    gameCode: 'ABC123',
  }),
});
check('sample mention + deep link',
  sample === '<@123456789012345678> your turn — Russians · Combat Move\nhttps://tactical-risk20.vercel.app/?ux=three&code=ABC123');
console.log('SAMPLE_PING:\n' + sample);

const fallback = buildDiscordTurnContent({
  discordUserId: '',
  faction: 'British',
  phase: 'Purchase',
  deepLink: 'https://tactical-risk20.vercel.app/?ux=classic&code=ZZZZZZ',
});
check('untagged fallback', fallback.startsWith('your turn — British · Purchase'));

const store = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
};
const posts = [];
const first = await maybePostDiscordTurnPing({
  player: human,
  gameId: 'ABC123',
  turnIndex: 1,
  seatId: 'Russians',
  phase: 'Combat Move',
  deepLink: 'https://example.test/?ux=three&code=ABC123',
  config: { envUrl: 'https://discord.com/api/webhooks/test/hook' },
  storage: store,
  post: async (url, content) => { posts.push({ url, content }); return { ok: true }; },
});
check('first human ping posts', first.ok === true && posts.length === 1 && posts[0].content.includes('<@123456789012345678>'));
const again = await maybePostDiscordTurnPing({
  player: human,
  gameId: 'ABC123',
  turnIndex: 1,
  seatId: 'Russians',
  phase: 'Combat Move',
  config: { envUrl: 'https://discord.com/api/webhooks/test/hook' },
  storage: store,
  post: async () => { posts.push({ twice: true }); return { ok: true }; },
});
check('same key does not spam', again.reason === 'deduped' && posts.length === 1);

const unlinked = { id: 'British', oderId: 'u2', isAI: false };
const fb = await maybePostDiscordTurnPing({
  player: unlinked,
  gameId: 'ABC123',
  turnIndex: 2,
  seatId: 'British',
  phase: 'Purchase',
  deepLink: 'https://example.test/?code=ABC123',
  config: { envUrl: 'https://discord.com/api/webhooks/test/hook' },
  storage: store,
  post: async (url, content) => { posts.push({ url, content }); return { ok: true }; },
});
check('unlinked fallback once', fb.ok === true && posts[1].content.startsWith('your turn — British'));

const noUrl = await maybePostDiscordTurnPing({
  player: { id: 'Americans', isAI: false },
  gameId: 'ABC123',
  turnIndex: 3,
  seatId: 'Americans',
  config: { envUrl: '' },
  storage: store,
  post: async () => { throw new Error('should not post'); },
});
check('no webhook is unused', noUrl.reason === 'unconfigured');

const listeners = [];
const gs = {
  currentPlayer: { id: 'Russians', isAI: false, discordUserId: '9' },
  currentPlayerIndex: 0,
  round: 1,
  phase: 'playing',
  getTurnPhaseName: () => 'Combat Move',
  subscribe(fn) { listeners.push(fn); return () => {}; },
};
const pingPosts = [];
bindDiscordTurnPing(gs, {
  getGameId: () => 'ABC123',
  getUxMode: () => 'classic',
  getOrigin: () => 'https://tactical-risk20.vercel.app/',
  isApplyingRemote: () => false,
  config: { envUrl: 'https://discord.com/api/webhooks/test/hook' },
  storage: { _d: {}, getItem() { return null; }, setItem() {} },
  post: (url, content) => { pingPosts.push(content); return { ok: true }; },
});
gs.currentPlayer = { id: 'Germans', isAI: true };
gs.currentPlayerIndex = 1;
listeners[0]();
check('bind skips AI seat', pingPosts.length === 0);
gs.currentPlayer = { id: 'British', isAI: false, discordUserId: '555555555555555555' };
gs.currentPlayerIndex = 2;
listeners[0]();
check('bind pings next human', pingPosts.length === 1 && pingPosts[0].includes('<@555555555555555555>'));

gs.currentPlayer = { id: 'Americans', isAI: false, discordUserId: '777' };
bindDiscordTurnPing(gs, {
  getGameId: () => 'ABC123',
  isApplyingRemote: () => true,
  storage: { getItem() { return null; }, setItem() {} },
  post: () => { pingPosts.push('remote'); return { ok: true }; },
});
gs.currentPlayer = { id: 'Russians', isAI: false, discordUserId: '1' };
listeners[listeners.length - 1]();
check('remote apply does not ping', !pingPosts.includes('remote'));

console.log(failures === 0 ? '\nALL DISCORD TURN-PING CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
