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
  resolveDiscordSnowflake,
  formatTurnPingSummary,
  DISCORD_TURN_CONTENT_MAX,
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

check('stamp is unified.2', GAME_VERSION === 'V2.81.57-unified.6');
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
    uxMode: 'classic',
    gameCode: 'ABC123',
  }),
});
check('sample mention + deep link',
  sample === '<@123456789012345678> Russians · Combat Move · https://tactical-risk20.vercel.app/?code=ABC123');
check('unified deep link has no ux query', !sample.includes('ux='));
console.log('SAMPLE_PING:\n' + sample);

const fallback = buildDiscordTurnContent({
  discordUserId: '',
  faction: 'British',
  phase: 'Purchase',
  deepLink: 'https://tactical-risk20.vercel.app/?code=ZZZZZZ',
});
check('untagged fallback', fallback === 'British · Purchase · https://tactical-risk20.vercel.app/?code=ZZZZZZ');

check('blank phase does not leave a dangling dot',
  buildDiscordTurnContent({ faction: 'Russians', phase: '' }) === 'Russians');

check('alias Bastion', resolveDiscordSnowflake({ name: 'Bastion' }) === '261711980526567428');
check('alias crusader_bastion', resolveDiscordSnowflake({ discordName: '@crusader_bastion' }) === '261711980526567428');
check('alias sean', resolveDiscordSnowflake({ displayName: 'Sean' }) === '261711980526567428');
check('alias benson', resolveDiscordSnowflake({ name: 'Benson' }) === '261711980526567428');
check('alias Sean Benson', resolveDiscordSnowflake({ displayName: 'sean benson' }) === '261711980526567428');
check('alias rwts', resolveDiscordSnowflake({ username: 'RWTS' }) === '600101834727620620');
check('alias robert', resolveDiscordSnowflake({ name: 'Robert' }) === '600101834727620620');
check('alias watts', resolveDiscordSnowflake({ displayName: 'Watts' }) === '600101834727620620');
check('alias Robert Watts', resolveDiscordSnowflake({ displayName: 'Robert Watts' }) === '600101834727620620');
check('alias Robfox007', resolveDiscordSnowflake({ seatLabel: 'Robfox007' }) === '600101834727620620');
check('alias robfox007', resolveDiscordSnowflake({ name: 'robfox007' }) === '600101834727620620');
check('explicit snowflake beats alias',
  resolveDiscordSnowflake({ discordUserId: '123456789012345678', name: 'Bastion' }) === '123456789012345678');
check('unknown name stays untagged', resolveDiscordSnowflake({ name: 'James' }) === '');
check('token prefix is not an alias', resolveDiscordSnowflake({ name: 'Roberts' }) === '');
check('crusader alone is not Bastion', resolveDiscordSnowflake({ name: 'crusader' }) === '');

const summary = formatTurnPingSummary([
  {
    type: 'territory_captured',
    playerId: 'Germans',
    territory: 'Ukraine',
    fromPlayer: 'Russians',
    toPlayer: 'Germans',
  },
  {
    type: 'combat',
    playerId: 'Germans',
    attackerLosses: { infantry: 3 },
    defenderLosses: { artillery: 2 },
  },
], { actorId: 'Germans' });
check('summary took + own losses + opponent losses',
  summary === 'Took Ukraine, lost 3 inf, opponent lost 2 art');
check('summary omits empty losses',
  formatTurnPingSummary([
    {
      type: 'territory_captured',
      playerId: 'Germans',
      territory: 'Ukraine',
      toPlayer: 'Germans',
      fromPlayer: 'Russians',
    },
    { type: 'combat', playerId: 'Germans', attackerLosses: { infantry: 0 }, defenderLosses: {} },
  ], { actorId: 'Germans' }) === 'Took Ukraine');
check('summary numeric losses do not invent a unit type',
  formatTurnPingSummary([
    { type: 'combat', playerId: 'Germans', attackerLosses: 4, defenderLosses: null },
  ], { actorId: 'Germans' }) === 'lost 4');
check('summary territory given up',
  formatTurnPingSummary([
    {
      type: 'territory_captured',
      playerId: 'Americans',
      territory: 'France',
      fromPlayer: 'Germans',
      toPlayer: 'Americans',
    },
  ], { actorId: 'Germans' }) === 'gave up France');
check('summary ignores another seat',
  formatTurnPingSummary([
    {
      type: 'territory_captured',
      playerId: 'Americans',
      territory: 'France',
      fromPlayer: 'British',
      toPlayer: 'Americans',
    },
  ], { actorId: 'Germans' }) === '');
check('empty turn omits summary', formatTurnPingSummary([], { actorId: 'Germans' }) === '');

const enriched = buildDiscordTurnContent({
  displayName: 'Bastion',
  faction: 'Germans',
  phase: 'Combat Move',
  summary: 'Took Ukraine, lost 3 inf',
  deepLink: 'https://tactical-risk20.vercel.app/?code=HENV42',
});
check('mention + phase + summary + resume link',
  enriched === '<@261711980526567428> Germans · Combat Move · Took Ukraine, lost 3 inf · https://tactical-risk20.vercel.app/?code=HENV42');
const huge = buildDiscordTurnContent({
  discordUserId: '261711980526567428',
  faction: 'Germans',
  phase: 'Combat Move',
  summary: `Took ${'Ukraine '.repeat(400)}`,
  deepLink: 'https://tactical-risk20.vercel.app/?code=HENV42',
});
check('content stays under 1800 and keeps the resume link',
  huge.length <= DISCORD_TURN_CONTENT_MAX && huge.includes('code=HENV42') && huge.startsWith('<@261711980526567428>'));
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
check('unlinked fallback once', fb.ok === true && posts[1].content.startsWith('British · Purchase'));

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

const summaryPosts = [];
const summaryListeners = [];
const summaryGs = {
  currentPlayer: { id: 'Russians', name: 'rwts', isAI: false },
  currentPlayerIndex: 0,
  round: 2,
  phase: 'playing',
  turnEvents: [],
  getTurnPhaseName: () => 'Combat Move',
  getTurnEventsSince(i) { return this.turnEvents.slice(i); },
  getTurnEventsLastIndex() { return this.turnEvents.length; },
  subscribe(fn) { summaryListeners.push(fn); return () => {}; },
};
bindDiscordTurnPing(summaryGs, {
  getGameId: () => 'HENV42',
  getUxMode: () => 'classic',
  getOrigin: () => 'https://tactical-risk20.vercel.app/',
  isApplyingRemote: () => false,
  storage: { _d: {}, getItem() { return null; }, setItem() {} },
  post: (_url, content) => { summaryPosts.push(content); return { ok: true }; },
});
summaryGs.turnEvents.push(
  {
    type: 'territory_captured',
    playerId: 'Russians',
    territory: 'Ukraine',
    fromPlayer: 'Germans',
    toPlayer: 'Russians',
  },
  {
    type: 'combat',
    playerId: 'Russians',
    attackerLosses: { infantry: 3 },
    defenderLosses: {},
  },
);
summaryGs.currentPlayer = { id: 'Germans', name: 'Bastion', isAI: false };
summaryGs.currentPlayerIndex = 1;
summaryListeners[0]();
check('bind mentions next player from alias and summarizes prior turn',
  summaryPosts.length === 1
  && summaryPosts[0] === '<@261711980526567428> Germans · Combat Move · Took Ukraine, lost 3 inf · https://tactical-risk20.vercel.app/?code=HENV42');

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

const aliasProxy = [];
const aliasPing = await maybePostDiscordTurnPing({
  player: { id: 'Germans', name: 'Bastion', isAI: false },
  gameId: 'HENV42',
  turnIndex: 11,
  seatId: 'Germans',
  phase: 'Combat Move',
  summary: 'Took Ukraine, lost 3 inf',
  deepLink: 'https://tactical-risk20.vercel.app/?code=HENV42',
  storage: { _d: {}, getItem() { return null; }, setItem() {} },
  proxyPost: async (_url, payload) => {
    aliasProxy.push(payload);
    return { ok: true, reason: 'sent' };
  },
});
check('proxy payload resolves alias, summary, and resume link',
  aliasPing.ok === true
  && aliasProxy[0].discordUserId === '261711980526567428'
  && aliasProxy[0].summary === 'Took Ukraine, lost 3 inf'
  && aliasProxy[0].deepLink.includes('code=HENV42')
  && aliasProxy[0].displayName === 'Bastion'
  && aliasProxy[0].isAI === false);

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
let postedBody = '';
globalThis.fetch = async (_url, init) => {
  postedBody = String(init?.body || '');
  postedContent = /"content"/.test(postedBody);
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
    deepLink: 'https://tactical-risk20.vercel.app/?code=G9',
    discordUserId: '123456789012345678',
  },
}, sent);
const sentBody = JSON.parse(sent.body);
check('configured posts {content} and reports sent',
  sent.statusCode === 200 && sentBody.ok === true && sentBody.reason === 'sent' && postedContent);
check('configured body is mention · faction · phase · link',
  postedBody.includes('<@123456789012345678> Russians · Combat Move · https://tactical-risk20.vercel.app/?code=G9')
  && !postedBody.includes('your turn'));
const aliased = mockRes();
await handler({
  method: 'POST',
  body: {
    gameId: 'HENV42',
    seatId: 'Germans',
    turnIndex: 8,
    faction: 'Germans',
    phase: 'Combat Move',
    displayName: 'Sean',
    summary: 'Took Ukraine, lost 3 inf',
    deepLink: 'https://tactical-risk20.vercel.app/?code=HENV42',
  },
}, aliased);
const aliasedBody = JSON.parse(aliased.body);
check('api aliases the next player and includes summary + link',
  aliased.statusCode === 200
  && aliasedBody.ok === true
  && postedBody.includes('<@261711980526567428> Germans · Combat Move · Took Ukraine, lost 3 inf · https://tactical-risk20.vercel.app/?code=HENV42'));
check('api alias response has no webhook',
  !JSON.stringify(aliasedBody).includes('http')
  && !JSON.stringify(aliasedBody).toLowerCase().includes('webhook'));
check('sent response never includes webhook',
  !JSON.stringify(sentBody).toLowerCase().includes('webhook')
  && !JSON.stringify(sentBody).includes('example.test'));
if (prevWebhookEnv === undefined) delete process.env.DISCORD_TURN_WEBHOOK_URL;
else process.env.DISCORD_TURN_WEBHOOK_URL = prevWebhookEnv;
globalThis.fetch = prevFetch;

console.log(failures === 0 ? '\nALL DISCORD TURN-PING CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
