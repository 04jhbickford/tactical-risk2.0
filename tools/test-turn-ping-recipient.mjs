// V2.81.57-unified.15 — turn ping header is the human being pinged.
// TXVKJB-like: Rob = Germans, Bastion = Russians, AIs = UK / Japan / USA.
// Run: node tools/test-turn-ping-recipient.mjs

import { createRequire } from 'node:module';
import { GAME_VERSION } from '../src/version.js';
import {
  bindDiscordTurnPing,
  formatRecipientLossSummary,
} from '../src/multiplayer/discordTurnPing.js';

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

check('stamp is unified.14', GAME_VERSION === 'V2.81.57-unified.15');

const players = [
  { id: 'Germans', name: 'Robfox007', isAI: false, discordUserId: '600101834727620620' },
  { id: 'British', name: 'Easy Bot', isAI: true, aiDifficulty: 'easy' },
  { id: 'Japanese', name: 'Easy Bot', isAI: true, aiDifficulty: 'easy' },
  { id: 'Americans', name: 'Easy Bot', isAI: true, aiDifficulty: 'easy' },
  { id: 'Russians', name: 'Bastion', isAI: false, discordUserId: '261711980526567428' },
];

const listeners = [];
const gs = {
  players,
  currentPlayer: players[0],
  currentPlayerIndex: 0,
  round: 1,
  phase: 'unit_placement',
  turnPhase: 'setup',
  turnEvents: [],
  getTurnPhaseName() { return 'Develop Tech'; },
  getTurnEventsSince(i) { return this.turnEvents.slice(i); },
  getTurnEventsLastIndex() { return this.turnEvents.length; },
  subscribe(fn) { listeners.push(fn); return () => {}; },
};

const posts = [];
const fetchCalls = [];
const prevFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  fetchCalls.push(String(url));
  return { ok: true };
};

const storage = {
  _d: {},
  getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
  setItem(k, v) { this._d[k] = String(v); },
};

bindDiscordTurnPing(gs, {
  getGameId: () => 'TXVKJB',
  getUxMode: () => 'classic',
  getOrigin: () => 'https://tactical-risk20.vercel.app/',
  isApplyingRemote: () => false,
  storage,
  post: (_url, content) => {
    posts.push(content);
    return { ok: true };
  },
});

function seat(player, index, round = gs.round) {
  gs.currentPlayer = player;
  gs.currentPlayerIndex = index;
  gs.round = round;
  listeners[0]();
}

// Leave Germany before the AI turns. Events belong to the seat that is current
// when they are logged, and the cursor advances when that seat ends.
seat(players[1], 1);
check('UK AI is not pinged at the start of its turn', posts.length === 0);

// UK turn: Germany loses France (defender id omitted; capture supplies it)
// and Russia loses Caucasus. Attacker's own losses must not be charged to Germany.
gs.turnEvents.push(
  {
    type: 'territory_captured',
    territory: 'France',
    fromPlayer: 'Germans',
    toPlayer: 'British',
    playerId: 'British',
  },
  {
    type: 'combat',
    territory: 'France',
    playerId: 'British',
    attackerId: 'British',
    attackerLosses: { infantry: 1 },
    defenderLosses: { infantry: 2 },
  },
  {
    type: 'combat',
    territory: 'Caucasus',
    playerId: 'British',
    attackerId: 'British',
    defenderId: 'Russians',
    attackerLosses: { infantry: 4 },
    defenderLosses: { infantry: 1 },
  },
  {
    type: 'territory_captured',
    territory: 'Caucasus',
    fromPlayer: 'Russians',
    toPlayer: 'British',
    playerId: 'British',
  },
);
seat(players[2], 2);
check('Japan AI is not pinged', posts.length === 0);

// Japan takes Poland from Germany.
gs.turnEvents.push(
  {
    type: 'combat',
    territory: 'Poland',
    playerId: 'Japanese',
    attackerId: 'Japanese',
    defenderId: 'Germans',
    attackerLosses: {},
    defenderLosses: { tank: 1 },
  },
  {
    type: 'territory_captured',
    territory: 'Poland',
    fromPlayer: 'Germans',
    toPlayer: 'Japanese',
    playerId: 'Japanese',
  },
);
seat(players[3], 3);
check('USA AI is not pinged', posts.length === 0);

// USA takes Ukraine from Russia. Quiet for Germany.
gs.turnEvents.push(
  {
    type: 'combat',
    territory: 'Ukraine',
    playerId: 'Americans',
    attackerId: 'Americans',
    defenderId: 'Russians',
    attackerLosses: {},
    defenderLosses: { infantry: 3 },
  },
  {
    type: 'territory_captured',
    territory: 'Ukraine',
    fromPlayer: 'Russians',
    toPlayer: 'Americans',
    playerId: 'Americans',
  },
);

gs.phase = 'unit_placement';
seat(players[4], 4);
const bastion = posts[0] || '';
const bastionLines = bastion.split('\n');
check('Bastion is mentioned', bastionLines[0] === '<@261711980526567428>');
check('Bastion header is his name and Russia',
  bastionLines[1] === 'Bastion - Russia Initial Deployment Phase');
check('Bastion losses accumulate across UK and USA turns', bastion === [
  '<@261711980526567428>',
  'Bastion - Russia Initial Deployment Phase',
  '-1x Infantry lost Caucasus - British Easy AI',
  '-3x Infantry lost Ukraine - American Easy AI',
  '-Caucasus Lost - British Easy AI',
  '-Ukraine Lost - American Easy AI',
  'https://tactical-risk20.vercel.app/?code=TXVKJB',
].join('\n'));
check('Bastion summary omits German losses and British casualties',
  !bastion.includes('France') && !bastion.includes('Poland') && !bastion.includes('4x'));

gs.phase = 'playing';
seat(players[0], 0, 2);
const rob = posts[1] || '';
const robLines = rob.split('\n');
check('Rob is mentioned', robLines[0] === '<@600101834727620620>');
check('Rob header names Germany, not the AI who just moved',
  robLines[1] === 'Robfox007 - Germany Develop Tech Phase');
check('Rob losses accumulate across UK and Japan', rob === [
  '<@600101834727620620>',
  'Robfox007 - Germany Develop Tech Phase',
  '-2x Infantry lost France - British Easy AI',
  '-1x Tank lost Poland - Japanese Easy AI',
  '-France Lost - British Easy AI',
  '-Poland Lost - Japanese Easy AI',
  'https://tactical-risk20.vercel.app/?code=TXVKJB',
].join('\n'));
check('Rob summary omits Russian losses', !rob.includes('Ukraine') && !rob.includes('Caucasus'));
check('no ping header is an AI seat',
  posts.every((content) => !(content.split('\n')[1] || '').includes('Easy AI')));

// Quiet return: nothing new taken from Germany.
seat(players[1], 1, 2);
seat(players[2], 2, 2);
seat(players[3], 3, 2);
seat(players[4], 4, 2);
gs.phase = 'playing';
seat(players[0], 0, 3);
const quiet = posts[posts.length - 1] || '';
check('quiet turn still uses both empty lines',
  quiet.includes('-No units lost') && quiet.includes('-No territories lost'));
check('quiet header is still Rob - Germany',
  quiet.split('\n')[1] === 'Robfox007 - Germany Develop Tech Phase');
check('client replay never called fetch', fetchCalls.length === 0);

check('direct quiet summary',
  formatRecipientLossSummary([], { recipientId: 'Germans', players })
  === '-No units lost\n-No territories lost');

const require = createRequire(import.meta.url);
const prevWebhook = process.env.DISCORD_TURN_WEBHOOK_URL;
process.env.DISCORD_TURN_WEBHOOK_URL = 'https://example.test/discord-hook';
const handler = require('../api/discord-turn-ping.js');
let postedUrl = '';
let postedBody = '';
globalThis.fetch = async (url, init) => {
  postedUrl = String(url);
  postedBody = String(init?.body || '');
  fetchCalls.push(postedUrl);
  return { ok: true };
};
function mockRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (b) => { res.body = b == null ? '' : String(b); };
  return res;
}
const apiRes = mockRes();
await handler({
  method: 'POST',
  body: {
    gameId: 'TXVKJB',
    seatId: 'Germans',
    turnIndex: 128,
    displayName: 'Robfox007',
    faction: 'Germans',
    actorName: 'British Easy AI',
    actorFaction: 'UK',
    phase: 'Develop Tech',
    discordUserId: '600101834727620620',
    summary: [
      '-2x Infantry lost France - British Easy AI',
      '-1x Tank lost Poland - Japanese Easy AI',
      '-France Lost - British Easy AI',
      '-Poland Lost - Japanese Easy AI',
    ].join('\n'),
    deepLink: 'https://tactical-risk20.vercel.app/?code=TXVKJB',
  },
}, apiRes);
const apiBody = JSON.parse(apiRes.body);
const apiContent = JSON.parse(postedBody).content;
check('api header is the recipient even when actorName is the AI',
  apiBody.ok === true
  && postedUrl === 'https://example.test/discord-hook'
  && !postedUrl.includes('discord.com')
  && apiContent.split('\n')[0] === '<@600101834727620620>'
  && apiContent.split('\n')[1] === 'Robfox007 - Germany Develop Tech Phase'
  && apiContent.includes('-2x Infantry lost France - British Easy AI')
  && apiContent.includes('-Poland Lost - Japanese Easy AI')
  && apiContent.endsWith('https://tactical-risk20.vercel.app/?code=TXVKJB')
  && !apiContent.includes('British Easy AI - UK'));

if (prevWebhook === undefined) delete process.env.DISCORD_TURN_WEBHOOK_URL;
else process.env.DISCORD_TURN_WEBHOOK_URL = prevWebhook;
globalThis.fetch = prevFetch;

console.log(failures === 0 ? '\nALL TURN-PING RECIPIENT CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
