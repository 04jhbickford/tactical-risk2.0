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
  sideLabel,
  isDiscordTurnProbe,
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

check('stamp is unified.2', GAME_VERSION === 'V2.81.57-unified.16');
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
  sample === [
    '<@123456789012345678>',
    'Russia Combat Move Phase',
    '-No units lost',
    '-No territories lost',
    'https://tactical-risk20.vercel.app/?code=ABC123',
  ].join('\n'));
check('unified deep link has no ux query', !sample.includes('ux='));
console.log('SAMPLE_PING:\n' + sample);

const fallback = buildDiscordTurnContent({
  discordUserId: '',
  faction: 'British',
  phase: 'Purchase',
  deepLink: 'https://tactical-risk20.vercel.app/?code=ZZZZZZ',
});
check('untagged fallback', fallback === [
  'UK Purchase Phase',
  '-No units lost',
  '-No territories lost',
  'https://tactical-risk20.vercel.app/?code=ZZZZZZ',
].join('\n'));

check('blank phase does not leave a dangling dash',
  buildDiscordTurnContent({ faction: 'Russians', phase: '' }) === [
    'Russia',
    '-No units lost',
    '-No territories lost',
  ].join('\n'));

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
check('alias Robert007', resolveDiscordSnowflake({ displayName: 'Robert007' }) === '600101834727620620');
check('alias robfox', resolveDiscordSnowflake({ name: 'robfox' }) === '600101834727620620');
check('alias bastion2', resolveDiscordSnowflake({ name: 'bastion2' }) === '261711980526567428');
check('bare Rob stays untagged', resolveDiscordSnowflake({ name: 'Rob' }) === '');
check('explicit snowflake beats alias',
  resolveDiscordSnowflake({ discordUserId: '123456789012345678', name: 'Bastion' }) === '123456789012345678');
check('unknown name stays untagged', resolveDiscordSnowflake({ name: 'James' }) === '');
check('token prefix is not an alias', resolveDiscordSnowflake({ name: 'Roberts' }) === '');
check('crusader alone is not Bastion', resolveDiscordSnowflake({ name: 'crusader' }) === '');

const robPlayers = [
  { id: 'Germans', name: 'Robfox007', isAI: false },
  { id: 'Russians', name: 'Easy Bot', isAI: true, aiDifficulty: 'easy' },
  { id: 'British', name: 'Bastion', isAI: false },
  { id: 'Americans', name: 'Sean', isAI: false },
];
const quiet = formatTurnPingSummary([], { actorId: 'Germans', players: robPlayers });
check('quiet turn uses both empty lines',
  quiet === '-No units lost\n-No territories lost');
const seaLosses = formatTurnPingSummary([
  {
    type: 'combat',
    playerId: 'Germans',
    attackerId: 'Germans',
    defenderId: 'Russians',
    territory: 'Baltic Sea',
    attackerLosses: { destroyer: 1 },
    defenderLosses: {},
  },
  {
    type: 'combat',
    playerId: 'Germans',
    attackerId: 'Germans',
    defenderId: 'British',
    territory: 'North Atlantic',
    attackerLosses: { carrier: 1, fighter: 2, battleship: 1 },
    defenderLosses: {},
  },
], { actorId: 'Germans', players: robPlayers });
check('sea losses list every battle and the empty territory line',
  seaLosses === [
    '-1x Destroyer lost Baltic Sea - Russian Easy AI',
    '-1x Carrier, 2x Fighters, 1x Battleship lost North Atlantic - Bastion UK',
    '-No territories lost',
  ].join('\n'));
const southAfrica = formatTurnPingSummary([
  {
    type: 'combat',
    playerId: 'British',
    attackerId: 'British',
    defenderId: 'Germans',
    territory: 'South Africa',
    attacker: 'Bastion',
    defender: 'Robfox007',
    attackerLosses: {},
    defenderLosses: { infantry: 8, armour: 5 },
  },
  {
    type: 'territory_captured',
    playerId: 'British',
    territory: 'South Africa',
    fromPlayer: 'Germans',
    toPlayer: 'British',
  },
], { actorId: 'British', players: robPlayers });
check('capture lists defender losses and who took the territory',
  southAfrica === [
    '-8x Infantry, 5x Tanks lost South Africa - Bastion UK',
    '-South Africa Lost - Bastion UK',
  ].join('\n'));
check('a name that contains "us" still gets the power',
  sideLabel('Americans', 'Susan', [{ id: 'Americans', name: 'Susan', isAI: false }]) === 'Susan US');
check('numeric losses do not invent a unit type',
  formatTurnPingSummary([
    { type: 'combat', playerId: 'Germans', attackerLosses: 4, defenderLosses: null },
  ], { actorId: 'Germans', players: robPlayers }) === '-4 lost\n-No territories lost');
check('territory the actor lost names who took it',
  formatTurnPingSummary([
    {
      type: 'territory_captured',
      playerId: 'Americans',
      territory: 'France',
      fromPlayer: 'Germans',
      toPlayer: 'Americans',
    },
  ], { actorId: 'Germans', players: robPlayers }) === '-No units lost\n-France Lost - Sean US');
check('another seat is not this turn',
  formatTurnPingSummary([
    {
      type: 'territory_captured',
      playerId: 'Americans',
      territory: 'France',
      fromPlayer: 'British',
      toPlayer: 'Americans',
    },
  ], { actorId: 'Germans' }) === '-No units lost\n-No territories lost');
check('both sides and every territory stay on their own lines',
  formatTurnPingSummary([
    {
      type: 'combat',
      playerId: 'Germans',
      attackerId: 'Germans',
      defenderId: 'Russians',
      territory: 'Ukraine',
      attackerLosses: { infantry: 2 },
      defenderLosses: { infantry: 3 },
    },
    {
      type: 'territory_captured',
      territory: 'Ukraine',
      fromPlayer: 'Russians',
      toPlayer: 'Germans',
      playerId: 'Germans',
    },
    {
      type: 'territory_captured',
      territory: 'Caucasus',
      fromPlayer: 'Russians',
      toPlayer: 'Germans',
      playerId: 'Germans',
    },
  ], { actorId: 'Germans', players: robPlayers }) === [
    '-2x Infantry lost Ukraine - Russian Easy AI',
    '-3x Infantry lost Ukraine - Robfox007 Germany',
    '-Ukraine Lost - Robfox007 Germany',
    '-Caucasus Lost - Robfox007 Germany',
  ].join('\n'));
check('omitted defender id uses the capture previous owner',
  formatTurnPingSummary([
    {
      type: 'territory_captured',
      territory: 'Ukraine',
      fromPlayer: 'Russians',
      toPlayer: 'Germans',
      playerId: 'Germans',
    },
    {
      type: 'combat',
      territory: 'Ukraine',
      playerId: 'Germans',
      attacker: 'Robfox007',
      defender: 'Unknown',
      attackerLosses: { infantry: 2 },
      defenderLosses: { infantry: 3 },
    },
  ], { actorId: 'Germans', players: robPlayers }) === [
    '-2x Infantry lost Ukraine - Russian Easy AI',
    '-3x Infantry lost Ukraine - Robfox007 Germany',
    '-Ukraine Lost - Robfox007 Germany',
  ].join('\n'));
check('probe detector rejects probe and test ids and probe copy',
  isDiscordTurnProbe({ gameId: 'probe' })
  && isDiscordTurnProbe({ gameId: 'TEST' })
  && isDiscordTurnProbe({ gameId: 'health-check' })
  && isDiscordTurnProbe({ faction: 'Probe. daily review' })
  && isDiscordTurnProbe({ summary: 'daily review' })
  && !isDiscordTurnProbe({ gameId: 'HENV42', faction: 'Germans', summary: '-1x Destroyer lost Baltic Sea - Russian Easy AI' }));

const enriched = buildDiscordTurnContent({
  displayName: 'Bastion',
  discordUserId: '',
  faction: 'British',
  actorName: 'Robfox007',
  actorFaction: 'Germany',
  phase: 'Develop Tech',
  summary: seaLosses,
  deepLink: 'https://tactical-risk20.vercel.app/?code=HENV42',
});
check('mention + recipient header + loss lines + resume link',
  enriched === [
    '<@261711980526567428>',
    'Bastion - UK Develop Tech Phase',
    '-1x Destroyer lost Baltic Sea - Russian Easy AI',
    '-1x Carrier, 2x Fighters, 1x Battleship lost North Atlantic - Bastion UK',
    '-No territories lost',
    'https://tactical-risk20.vercel.app/?code=HENV42',
  ].join('\n'));
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
check('unlinked fallback once', fb.ok === true && posts[1].content.startsWith('UK Purchase Phase'));

const probePosts = [];
const probePing = await maybePostDiscordTurnPing({
  player: human,
  gameId: 'probe',
  turnIndex: 4,
  seatId: 'Russians',
  phase: 'Combat Move',
  summary: 'Probe. daily review',
  storage: store,
  post: async () => { probePosts.push('posted'); return { ok: true }; },
});
check('client probe game does not post',
  probePing.reason === 'skip-probe' && probePosts.length === 0);
const testIdPing = await maybePostDiscordTurnPing({
  player: human,
  gameId: 'test',
  turnIndex: 5,
  seatId: 'Russians',
  storage: store,
  proxyPost: async () => { probePosts.push('proxy'); return { ok: true }; },
});
check('client test gameId does not call the proxy',
  testIdPing.reason === 'skip-probe' && probePosts.length === 0);
const reviewCopy = await postDiscordTurnPingViaProxy('/api/discord-turn-ping', {
  gameId: 'HENV42',
  seatId: 'Russians',
  faction: 'Probe. daily review',
}, async () => { probePosts.push('fetch'); return { ok: true, json: async () => ({ ok: true }) }; });
check('probe copy does not call fetch from the proxy helper',
  reviewCopy.reason === 'skip-probe' && probePosts.length === 0);

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
  players: [
    { id: 'Russians', name: 'rwts', isAI: false },
    { id: 'Germans', name: 'Bastion', isAI: false },
  ],
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
check('bind mentions next player and summarizes what that seat lost',
  summaryPosts.length === 1
  && summaryPosts[0] === [
    '<@261711980526567428>',
    'Bastion - Germany Combat Move Phase',
    '-No units lost',
    '-Ukraine Lost - rwts Russia',
    'https://tactical-risk20.vercel.app/?code=HENV42',
  ].join('\n'));

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
  summary: seaLosses,
  actorName: 'Robfox007',
  actorFaction: 'Germany',
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
  && aliasProxy[0].summary === seaLosses
  && aliasProxy[0].actorName === 'Robfox007'
  && aliasProxy[0].actorFaction === 'Germany'
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
let fetchCalls = 0;
globalThis.fetch = async (_url, init) => {
  fetchCalls += 1;
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
check('configured body is mention, header, empty lines, link',
  postedBody.includes([
    '<@123456789012345678>',
    'Russia Combat Move Phase',
    '-No units lost',
    '-No territories lost',
    'https://tactical-risk20.vercel.app/?code=G9',
  ].join('\\n'))
  && !postedBody.includes('your turn'));
const aliased = mockRes();
await handler({
  method: 'POST',
  body: {
    gameId: 'HENV42',
    seatId: 'Germans',
    turnIndex: 8,
    faction: 'British',
    phase: 'Develop Tech',
    displayName: 'Bastion',
    actorName: 'Robfox007',
    actorFaction: 'Germany',
    summary: [
      '-8x Infantry, 5x Tanks lost South Africa - Bastion UK',
      '-South Africa Lost - Bastion UK',
    ].join('\n'),
    deepLink: 'https://tactical-risk20.vercel.app/?code=HENV42',
  },
}, aliased);
const aliasedBody = JSON.parse(aliased.body);
check('api aliases the next player and includes summary + link',
  aliased.statusCode === 200
  && aliasedBody.ok === true
  && postedBody.includes([
    '<@261711980526567428>',
    'Bastion - UK Develop Tech Phase',
    '-8x Infantry, 5x Tanks lost South Africa - Bastion UK',
    '-South Africa Lost - Bastion UK',
    'https://tactical-risk20.vercel.app/?code=HENV42',
  ].join('\\n')));
check('api alias response has no webhook',
  !JSON.stringify(aliasedBody).includes('http')
  && !JSON.stringify(aliasedBody).toLowerCase().includes('webhook'));
check('sent response never includes webhook',
  !JSON.stringify(sentBody).toLowerCase().includes('webhook')
  && !JSON.stringify(sentBody).includes('example.test'));
const fetchesBeforeProbe = fetchCalls;
const probeBodies = [
  { gameId: 'probe', seatId: 'Russians', turnIndex: 1, faction: 'Probe. daily review' },
  { gameId: 'TEST', seatId: 'Russians', turnIndex: 2, faction: 'Russians', phase: 'Combat Move' },
  { gameId: 'health-check', seatId: 'seat', turnIndex: 3 },
  { gameId: 'HENV42', seatId: 'Russians', turnIndex: 9, summary: 'Probe. daily review', faction: 'Germans' },
];
const probeReasons = [];
for (const body of probeBodies) {
  const probeRes = mockRes();
  await handler({ method: 'POST', body }, probeRes);
  probeReasons.push(JSON.parse(probeRes.body));
}
check('probe and test posts do not hit the Discord webhook',
  fetchCalls === fetchesBeforeProbe
  && probeReasons.every((row) => row.ok === false && row.reason === 'skip-probe'));
if (prevWebhookEnv === undefined) delete process.env.DISCORD_TURN_WEBHOOK_URL;
else process.env.DISCORD_TURN_WEBHOOK_URL = prevWebhookEnv;
globalThis.fetch = prevFetch;

console.log(failures === 0 ? '\nALL DISCORD TURN-PING CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
