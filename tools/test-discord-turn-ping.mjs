// Discord turn ping: human-only, dedupe, untagged fallback, soft-fail.
// Run: node tools/test-discord-turn-ping.mjs

import { GAME_VERSION } from '../src/version.js';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  DISCORD_TURN_CHANNEL_ID,
  DISCORD_TURN_PING_API,
  normalizeDiscordSnowflake,
  parseDiscordSeatInput,
  turnIndexOf,
  pingDedupeKey,
  phaseLabelOf,
  buildDeepLink,
  buildDiscordTurnContent,
  shouldPingHumanSeat,
  maybePostDiscordTurnPing,
  bindDiscordTurnPing,
  postDiscordTurnPingViaProxy,
  discordPingPayload,
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

check('stamp is dual-path.16', GAME_VERSION === 'V2.81.57-dual-path.16');
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

check('blank phase does not leave a dangling dot',
  buildDiscordTurnContent({ faction: 'Russians', phase: '' }) === 'your turn — Russians');
check('setup turnPhase labels Initial Deployment',
  phaseLabelOf({ phase: 'unit_placement', turnPhase: 'setup' }) === 'Initial Deployment');
check('playing uses getTurnPhaseName',
  phaseLabelOf({
    phase: 'playing',
    turnPhase: 'combat_move',
    getTurnPhaseName: () => 'Combat Movement',
  }) === 'Combat Movement');
check('playing with missing turnPhase is not blank if named',
  phaseLabelOf({
    phase: 'playing',
    getTurnPhaseName: () => 'Purchase Units',
  }) === 'Purchase Units');

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
  storage: store,
  post: async (url, content) => { posts.push({ url, content }); return { ok: true }; },
});
check('unlinked fallback once', fb.ok === true && posts[1].content.startsWith('your turn — British'));

const noProxy = await maybePostDiscordTurnPing({
  player: { id: 'Americans', isAI: false },
  gameId: 'ABC123',
  turnIndex: 3,
  seatId: 'Americans',
  storage: store,
  proxyPost: async () => ({ ok: false, reason: 'unconfigured' }),
});
check('missing api/env is unused', noProxy.reason === 'unconfigured');

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

const apiPath = new URL('../api/discord-turn-ping.js', import.meta.url);
check('serverless api file exists', existsSync(apiPath));
const apiSrc = readFileSync(apiPath, 'utf8');
check('api reads server env only', apiSrc.includes('process.env.DISCORD_TURN_WEBHOOK_URL') && apiSrc.includes('skip-ai'));
check('api never logs or echoes webhook',
  !/console\.(log|info|warn|error|debug)/.test(apiSrc)
  && !apiSrc.includes('res.end(webhook')
  && !apiSrc.includes('reason: webhook'));
check('client default proxy path', DISCORD_TURN_PING_API === '/api/discord-turn-ping');
check('Classic + Experimental still bind', classicMain.includes('bindDiscordTurnPing') && threeBoot.includes('attachDiscordTurnPing'));
const clientSrc = readFileSync(new URL('../src/multiplayer/discordTurnPing.js', import.meta.url), 'utf8');
const maybeFn = clientSrc.slice(clientSrc.indexOf('export function maybePostDiscordTurnPing'));
check('production maybePost never reads client webhook',
  !maybeFn.includes('readDiscordWebhookConfig')
  && !maybeFn.includes('readDiscordWebhookUrl')
  && !maybeFn.includes('postDiscordWebhook'));
const htmlSrc = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
check('index.html does not bake a webhook secret',
  !/https:\/\/discord\.com\/api\/webhooks\//.test(htmlSrc)
  && !/DISCORD_TURN_WEBHOOK_URL\s*=/.test(htmlSrc));

const proxyPosts = [];
const proxied = await maybePostDiscordTurnPing({
  player: human,
  gameId: 'ABC123',
  turnIndex: 9,
  seatId: 'Russians',
  phase: 'Combat Move',
  deepLink: 'https://example.test/?ux=three&code=ABC123',
  storage: { _d: {}, getItem() { return null; }, setItem() {} },
  proxyPost: async (url, payload) => {
    proxyPosts.push({ url, payload });
    return { ok: true, reason: 'sent' };
  },
});
check('production path uses /api proxy',
  proxied.ok === true
  && proxyPosts[0].url === '/api/discord-turn-ping'
  && proxyPosts[0].payload.gameId === 'ABC123'
  && proxyPosts[0].payload.seatId === 'Russians'
  && proxyPosts[0].payload.turnIndex === 9
  && proxyPosts[0].payload.faction === 'Russians'
  && proxyPosts[0].payload.phase === 'Combat Move'
  && proxyPosts[0].payload.deepLink.includes('code=ABC123')
  && proxyPosts[0].payload.discordUserId === '123456789012345678');

const via = await postDiscordTurnPingViaProxy('/api/discord-turn-ping', discordPingPayload({
  player: human, gameId: 'Z', turnIndex: 1, seatId: 'Russians',
}), async () => ({ ok: true, json: async () => ({ ok: true, reason: 'sent' }) }));
check('proxy helper accepts json {ok:true}', via.ok === true);

const require = createRequire(import.meta.url);
const prevWebhookEnv = process.env.DISCORD_TURN_WEBHOOK_URL;
delete process.env.DISCORD_TURN_WEBHOOK_URL;
const handler = require('../api/discord-turn-ping.js');
function mockRes() {
  const r = { statusCode: 0, headers: {}, body: '' };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = (b) => { r.body = b == null ? '' : String(b); };
  return r;
}
const unconf = mockRes();
await handler({ method: 'POST', body: { gameId: 'G1', seatId: 'Russians', turnIndex: 1 } }, unconf);
const unconfBody = JSON.parse(unconf.body);
check('unconfigured soft-fails 200',
  unconf.statusCode === 200 && unconfBody.ok === false && unconfBody.reason === 'unconfigured');
check('unconfigured response has no url', !JSON.stringify(unconfBody).includes('http'));
const skip = mockRes();
await handler({ method: 'POST', body: { isAI: true, gameId: 'G1', seatId: 'Germans' } }, skip);
check('api skip-ai is 200', skip.statusCode === 200 && JSON.parse(skip.body).reason === 'skip-ai');
const incomplete = mockRes();
await handler({ method: 'POST', body: {} }, incomplete);
check('api incomplete is 200', incomplete.statusCode === 200 && JSON.parse(incomplete.body).reason === 'incomplete');

process.env.DISCORD_TURN_WEBHOOK_URL = 'https://example.test/discord-hook';
const prevFetch = globalThis.fetch;
let postedContent = false;
globalThis.fetch = async (_url, init) => {
  postedContent = /"content"/.test(String(init?.body || ''));
  return { ok: true };
};
const sent = mockRes();
await handler({
  method: 'POST',
  body: {
    gameId: 'G9',
    seatId: 'Russians',
    turnIndex: 4,
    faction: 'Russians',
    phase: 'Combat Move',
    deepLink: 'https://tactical-risk20.vercel.app/?ux=classic&code=G9',
    discordUserId: '123456789012345678',
  },
}, sent);
const sentBody = JSON.parse(sent.body);
check('configured posts {content} and reports sent',
  sent.statusCode === 200 && sentBody.ok === true && sentBody.reason === 'sent' && postedContent);
check('sent response never includes webhook',
  !JSON.stringify(sentBody).toLowerCase().includes('webhook')
  && !JSON.stringify(sentBody).includes('example.test'));
if (prevWebhookEnv === undefined) delete process.env.DISCORD_TURN_WEBHOOK_URL;
else process.env.DISCORD_TURN_WEBHOOK_URL = prevWebhookEnv;
globalThis.fetch = prevFetch;

console.log(failures === 0 ? '\nALL DISCORD TURN-PING CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
