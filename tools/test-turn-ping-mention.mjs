// Server turn-ping mentions: alias digits, locked allowed_mentions, optional guild search.
// Run: node tools/test-turn-ping-mention.mjs

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const ROB = '600101834727620620';
const BASTION = '261711980526567428';
const NEWGUY = '123456789012345678';
const BOT_TOKEN = 'fake-bot-token-do-not-leak';
const GUILD_ID = '424242424242424242';
const WEBHOOK = 'https://example.test/hook';

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra));
  } else {
    console.log('ok  :', label);
  }
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const prevWebhook = process.env.DISCORD_TURN_WEBHOOK_URL;
const prevToken = process.env.DISCORD_BOT_TOKEN;
const prevGuild = process.env.DISCORD_GUILD_ID;
const prevFetch = globalThis.fetch;

process.env.DISCORD_TURN_WEBHOOK_URL = WEBHOOK;
delete process.env.DISCORD_BOT_TOKEN;
delete process.env.DISCORD_GUILD_ID;

const handler = require('../api/discord-turn-ping.js');

const posts = [];
const searches = [];
let memberRows = () => [];
let memberMode = 'json';

globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.includes('/members/search')) {
    searches.push({ href, auth: init?.headers?.Authorization || '' });
    if (memberMode === 'throw') throw new Error('member search down');
    if (memberMode === 'http') return { ok: false, status: 500, json: async () => ({}) };
    const query = new URL(href).searchParams.get('query');
    return { ok: true, json: async () => memberRows(query) };
  }
  const body = JSON.parse(String(init?.body || '{}'));
  posts.push({ url: href, body, init });
  return { ok: true };
};

function mockRes() {
  const res = { statusCode: 0, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.end = (b) => { res.body = b == null ? '' : String(b); };
  return res;
}

let seq = 0;
async function post(fields) {
  seq += 1;
  const before = posts.length;
  const res = mockRes();
  await handler({
    method: 'POST',
    body: {
      gameId: `MENTION${seq}`,
      seatId: 'Germans',
      turnIndex: seq,
      faction: 'Germany',
      phase: 'Develop Tech',
      ...fields,
    },
  }, res);
  const posted = posts.length > before ? posts[posts.length - 1] : null;
  return { res, posted, api: JSON.parse(res.body || '{}') };
}

function locked(id) {
  return { parse: [], users: [id] };
}

try {
  const robert = await post({ displayName: 'Robert007' });
  const robertLines = robert.posted.body.content.split('\n');
  check('Robert007 mention is the first line', robertLines[0] === `<@${ROB}>`, robertLines);
  check('Robert007 allowed_mentions locks that user',
    same(robert.posted.body.allowed_mentions, locked(ROB)), robert.posted.body.allowed_mentions);
  check('header is unchanged', robertLines[1] === 'Robert007 - Germany Develop Tech Phase', robertLines);
  check('Robert007 did not search Discord', searches.length === 0);

  const fox = await post({ discordName: 'robfox007' });
  check('discordName robfox007 tags Rob',
    fox.posted.body.content.split('\n')[0] === `<@${ROB}>`
    && same(fox.posted.body.allowed_mentions, locked(ROB)));

  const explicit = await post({ discordUserId: ROB, displayName: 'Zed99' });
  check('explicit discordUserId tags Rob',
    explicit.posted.body.content.split('\n')[0] === `<@${ROB}>`
    && same(explicit.posted.body.allowed_mentions, locked(ROB)));

  const bastion = await post({ displayName: 'Bastion' });
  check('Bastion is tagged',
    bastion.posted.body.content.split('\n')[0] === `<@${BASTION}>`
    && same(bastion.posted.body.allowed_mentions, locked(BASTION)),
    bastion.posted.body);

  for (const name of ['Robert Watts', 'rwts', '@robfox007', 'robfox', 'bastion2']) {
    const row = await post({ displayName: name });
    const id = name === 'bastion2' ? BASTION : ROB;
    check(`alias ${name}`,
      row.posted.body.content.split('\n')[0] === `<@${id}>`
      && same(row.posted.body.allowed_mentions, locked(id)),
      row.posted?.body);
  }

  const bare = await post({ displayName: 'Rob' });
  check('bare Rob stays unmatched',
    !bare.posted.body.content.includes('<@')
    && same(bare.posted.body.allowed_mentions, { parse: [] })
    && bare.posted.body.content.split('\n')[0] === 'Rob - Germany Develop Tech Phase',
    bare.posted.body);

  const roberts = await post({ displayName: 'Roberts' });
  check('Roberts is not a substring match',
    !roberts.posted.body.content.includes('<@')
    && same(roberts.posted.body.allowed_mentions, { parse: [] }));

  const crusader = await post({ displayName: 'crusader' });
  check('crusader alone is not Bastion',
    !crusader.posted.body.content.includes('<@')
    && same(crusader.posted.body.allowed_mentions, { parse: [] }));

  const zed = await post({ displayName: 'Zed99' });
  check('Zed99 has no mention and no fake @',
    !zed.posted.body.content.includes('<@')
    && !zed.posted.body.content.includes('@Zed99')
    && zed.posted.body.content.split('\n')[0] === 'Zed99 - Germany Develop Tech Phase'
    && same(zed.posted.body.allowed_mentions, { parse: [] }),
    zed.posted.body);

  const everyone = await post({ displayName: '@everyone' });
  check('@everyone does not parse and has no users',
    Array.isArray(everyone.posted.body.allowed_mentions.parse)
    && everyone.posted.body.allowed_mentions.parse.length === 0
    && everyone.posted.body.allowed_mentions.users == null,
    everyone.posted.body.allowed_mentions);

  const injected = await post({
    displayName: 'Pat @here <@&55> <@999888777666555444>',
  });
  check('injected @here, role, and foreign id are not mentionable',
    injected.posted.body.allowed_mentions.parse.length === 0
    && injected.posted.body.allowed_mentions.users == null
    && !injected.posted.body.content.startsWith('<@'),
    injected.posted.body);

  check('alias posts never called the member search', searches.length === 0);
  check('alias posts went to the webhook', posts.every((row) => row.url === WEBHOOK));

  process.env.DISCORD_BOT_TOKEN = BOT_TOKEN;
  process.env.DISCORD_GUILD_ID = GUILD_ID;
  memberRows = (query) => {
    if (query === 'newguy') {
      return [
        { user: { id: NEWGUY, username: 'NewGuy', global_name: 'Newbie' }, nick: null },
        { user: { id: '888888888888888888', username: 'newguy2', global_name: 'Other' }, nick: 'pal' },
      ];
    }
    if (query === 'twohit') {
      return [
        { user: { id: '111111111111111111', username: 'twohit' }, nick: null },
        { user: { id: '222222222222222222', username: 'other', global_name: 'TwoHit' }, nick: null },
      ];
    }
    if (query === 'nickonly') {
      return [
        { user: { id: '333333333333333333', username: 'zzz_other', global_name: 'Nope' }, nick: 'NickOnly' },
      ];
    }
    if (query === 'secondhit') {
      return [
        { user: { id: '444444444444444444', username: 'secondhit' }, nick: null },
      ];
    }
    return [];
  };

  const searchesBeforeNew = searches.length;
  const newbie = await post({ displayName: 'newguy' });
  const newbieLines = newbie.posted.body.content.split('\n');
  check('guild search tags the single exact newguy',
    newbieLines[0] === `<@${NEWGUY}>`
    && same(newbie.posted.body.allowed_mentions, locked(NEWGUY))
    && newbieLines[1] === 'newguy - Germany Develop Tech Phase',
    newbie.posted.body);
  check('newguy search is the guild members endpoint',
    searches.length === searchesBeforeNew + 1
    && searches[searchesBeforeNew].href === `https://discord.com/api/v10/guilds/${GUILD_ID}/members/search?query=newguy&limit=5`
    && searches[searchesBeforeNew].auth === `Bot ${BOT_TOKEN}`);
  check('bot token is not in the posted body',
    !JSON.stringify(newbie.posted.body).includes(BOT_TOKEN)
    && !(newbie.posted.init.headers?.Authorization || '').includes(BOT_TOKEN));

  const searchesAfterHit = searches.length;
  const cached = await post({ displayName: 'newguy' });
  check('member id is cached and not searched again',
    searches.length === searchesAfterHit
    && cached.posted.body.content.split('\n')[0] === `<@${NEWGUY}>`);

  const two = await post({ displayName: 'twohit' });
  check('two exact matches do not mention',
    !two.posted.body.content.includes('<@')
    && same(two.posted.body.allowed_mentions, { parse: [] }),
    two.posted.body);

  memberMode = 'throw';
  const errored = await post({ displayName: 'errguy' });
  check('member search error does not mention',
    !errored.posted.body.content.includes('<@')
    && same(errored.posted.body.allowed_mentions, { parse: [] }));

  memberMode = 'http';
  const httpErr = await post({ displayName: 'badstatus' });
  check('member search HTTP error does not mention',
    !httpErr.posted.body.content.includes('<@')
    && same(httpErr.posted.body.allowed_mentions, { parse: [] }));

  memberMode = 'json';
  const nick = await post({ displayName: 'nickonly' });
  check('nick exact match tags that member',
    nick.posted.body.content.split('\n')[0] === '<@333333333333333333>');

  const ordered = await post({ discordName: 'firstmiss', displayName: 'secondhit' });
  const orderUrls = searches.slice(-2).map((row) => new URL(row.href).searchParams.get('query'));
  check('discordName is searched before displayName',
    orderUrls[0] === 'firstmiss'
    && orderUrls[1] === 'secondhit'
    && ordered.posted.body.content.split('\n')[0] === '<@444444444444444444>',
    orderUrls);

  const searchesBeforeAlias = searches.length;
  const stillAlias = await post({ displayName: 'Robert007' });
  check('alias still wins without a member search',
    searches.length === searchesBeforeAlias
    && stillAlias.posted.body.content.split('\n')[0] === `<@${ROB}>`);

  delete process.env.DISCORD_GUILD_ID;
  const searchesBeforeOff = searches.length;
  const off = await post({ displayName: 'secondhit' });
  check('member search stays off unless both env vars are set',
    searches.length === searchesBeforeOff
    && !off.posted.body.content.includes('<@')
    && same(off.posted.body.allowed_mentions, { parse: [] }));

  check('no posted body contains the bot token',
    posts.every((row) => !JSON.stringify(row.body).includes(BOT_TOKEN)));
} finally {
  if (prevWebhook === undefined) delete process.env.DISCORD_TURN_WEBHOOK_URL;
  else process.env.DISCORD_TURN_WEBHOOK_URL = prevWebhook;
  if (prevToken === undefined) delete process.env.DISCORD_BOT_TOKEN;
  else process.env.DISCORD_BOT_TOKEN = prevToken;
  if (prevGuild === undefined) delete process.env.DISCORD_GUILD_ID;
  else process.env.DISCORD_GUILD_ID = prevGuild;
  globalThis.fetch = prevFetch;
}

console.log(failures === 0 ? '\nALL TURN-PING MENTION CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
