// unified.67 — turn-ping DM, drag path, red factory damage, global RISK ladder.
// Run: node tools/test-unified-67-reports.mjs

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function makeEl() {
  return {
    id: '',
    className: '',
    innerHTML: '',
    style: {},
    children: [],
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() { return false; } },
    appendChild(child) { this.children.push(child); return child; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
  };
}

globalThis.document ??= {
  getElementById() { return makeEl(); },
  createElement() { return makeEl(); },
  documentElement: { classList: { add() {}, remove() {} } },
  body: makeEl(),
};

const { GameState, GAME_PHASES, TURN_PHASES, deriveRiskTradeCount, resolveRiskTradeCount } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { dragMovementRoute, strokeDragPath, DRAG_PATH_YELLOW, DRAG_PATH_OUTLINE } = await import(pathToFileURL(join(root, 'src/map/dragPath.js')));
const { UnitRenderer, FACTORY_DAMAGE_COLOR } = await import(pathToFileURL(join(root, 'src/map/unitRenderer.js')));
const { PlayerPanel } = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const {
  RulesPanel,
  TRANSPORT_RULES_LINE,
  UNLOAD_RULES_LINE,
  CLASSIC_TECH_RULES,
  EXPANDED_TECH_RULES,
} = await import(pathToFileURL(join(root, 'src/ui/rulesPanel.js')));

const require = createRequire(import.meta.url);
const handler = require(join(root, 'api/discord-turn-ping.js'));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : JSON.stringify(extra));
  } else console.log('ok  :', label);
};

function board(territories) {
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [
    { id: 'italians', name: 'Italy', isAI: false },
    { id: 'british', name: 'UK', isAI: false },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.playerState = {
    italians: { ipcs: 40, capitalTerritory: 'Italy', hasPlacedCapital: true },
    british: { ipcs: 30, capitalTerritory: 'Britain', hasPlacedCapital: true },
  };
  gs.playerTechs = {
    italians: { techTokens: 0, unlockedTechs: [] },
    british: { techTokens: 0, unlockedTechs: [] },
  };
  gs.riskCards = { italians: [], british: [] };
  gs.cardTradeCount = { italians: 0, british: 0 };
  gs.territoryState = {};
  gs.units = {};
  for (const territory of territories) {
    gs.territoryState[territory.name] = { owner: territory.isWater ? null : 'italians' };
    gs.units[territory.name] = [];
  }
  gs._notify = () => {};
  return gs;
}

const unitDefs = {
  infantry: { movement: 1, isLand: true },
  armour: { movement: 2, isLand: true },
  fighter: { movement: 4, isAir: true },
  destroyer: { movement: 2, isSea: true },
  transport: { movement: 2, isSea: true, canCarry: ['infantry', 'armour'] },
};

console.log('=== 1. turn ping DM or channel ===');
{
  const snow = '123456789012345678';
  check('gate off stays on the channel',
    handler.selectTurnPingDelivery({ dmEnabled: false, userId: snow, botToken: 'bot' }) === 'channel');
  check('no snowflake stays on the channel',
    handler.selectTurnPingDelivery({ dmEnabled: true, userId: 'bastion', botToken: 'bot' }) === 'channel');
  check('no bot token stays on the channel',
    handler.selectTurnPingDelivery({ dmEnabled: true, userId: snow, botToken: '' }) === 'channel');
  check('gate, snowflake, and token choose a DM',
    handler.selectTurnPingDelivery({ dmEnabled: true, userId: snow, botToken: 'bot' }) === 'dm');
  check('DISCORD_TURN_DM unset is off', handler.turnPingDmEnabled({}) === false);
  check('DISCORD_TURN_DM=1 is on', handler.turnPingDmEnabled({ DISCORD_TURN_DM: '1' }) === true);
  check('DISCORD_TURN_DM=off is off', handler.turnPingDmEnabled({ DISCORD_TURN_DM: 'off' }) === false);

  const prevWebhook = process.env.DISCORD_TURN_WEBHOOK_URL;
  const prevDm = process.env.DISCORD_TURN_DM;
  const prevToken = process.env.DISCORD_BOT_TOKEN;
  const prevFetch = globalThis.fetch;
  const calls = [];
  process.env.DISCORD_TURN_WEBHOOK_URL = 'https://discord.com/api/webhooks/1/example';
  process.env.DISCORD_BOT_TOKEN = 'bot-token-not-a-secret';
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: init?.body || '' });
    const href = String(url);
    if (href.includes('/users/@me/channels') && href.indexOf('/messages') < 0) {
      if (globalThis.__dmOpenFail) return { ok: false, status: 403, json: async () => ({}) };
      return { ok: true, json: async () => ({ id: '999888777666555444' }) };
    }
    if (href.includes('/channels/') && href.endsWith('/messages')) {
      if (globalThis.__dmPostFail) return { ok: false, status: 403, json: async () => ({}) };
      return { ok: true, json: async () => ({}) };
    }
    return { ok: true, json: async () => ({}) };
  };
  function mockRes() {
    return {
      statusCode: 0,
      body: '',
      setHeader() {},
      end(payload) { this.body = payload; },
    };
  }
  async function post(extra) {
    const res = mockRes();
    await handler({
      method: 'POST',
      body: {
        gameId: extra.gameId,
        seatId: 'italians',
        turnIndex: 3,
        discordUserId: extra.discordUserId ?? snow,
        faction: 'Italy',
        phase: 'Purchase',
        summary: '-No units lost\n-No territories lost',
        deepLink: 'https://tactical-risk20.vercel.app/?code=HENV42',
        displayName: 'Rob',
      },
    }, res);
    return JSON.parse(res.body);
  }
  try {
    delete process.env.DISCORD_TURN_DM;
    calls.length = 0;
    const channelOnly = await post({ gameId: 'dm-off-1' });
    check('unset gate posts the channel webhook',
      channelOnly.ok === true
      && channelOnly.reason === 'sent'
      && channelOnly.delivery === 'channel'
      && calls.length === 1
      && calls[0].url === process.env.DISCORD_TURN_WEBHOOK_URL);

    process.env.DISCORD_TURN_DM = '1';
    calls.length = 0;
    const dm = await post({ gameId: 'dm-on-1' });
    const dmUrls = calls.map((row) => row.url);
    check('DM success does not also post the channel',
      dm.ok === true
      && dm.reason === 'dm'
      && dm.delivery === 'dm'
      && dmUrls.some((url) => url.includes('/users/@me/channels'))
      && dmUrls.some((url) => url.endsWith('/messages'))
      && !dmUrls.includes(process.env.DISCORD_TURN_WEBHOOK_URL)
      && !JSON.stringify(dm).includes('bot-token-not-a-secret'),
      dm);

    calls.length = 0;
    globalThis.__dmOpenFail = true;
    const fallback = await post({ gameId: 'dm-fail-1' });
    const fallbackUrls = calls.map((row) => row.url);
    check('a failed DM falls back to the channel',
      fallback.ok === true
      && fallback.reason === 'sent'
      && fallback.delivery === 'channel-fallback'
      && fallbackUrls.some((url) => url.includes('/users/@me/channels'))
      && fallbackUrls.includes(process.env.DISCORD_TURN_WEBHOOK_URL));

    calls.length = 0;
    const noId = await post({ gameId: 'dm-noid-1', discordUserId: '' });
    check('no linked user posts the channel and does not open a DM',
      noId.ok === true
      && noId.delivery === 'channel'
      && calls.length === 1
      && calls[0].url === process.env.DISCORD_TURN_WEBHOOK_URL);

    delete process.env.DISCORD_TURN_WEBHOOK_URL;
    calls.length = 0;
    const nowhere = await post({ gameId: 'dm-nowhere-1' });
    check('failed DM with no webhook is unconfigured',
      nowhere.ok === false && nowhere.reason === 'unconfigured');
    check('responses do not echo the bot token',
      !JSON.stringify([dm, fallback, noId, nowhere]).includes('bot-token-not-a-secret'));
  } finally {
    if (prevWebhook === undefined) delete process.env.DISCORD_TURN_WEBHOOK_URL;
    else process.env.DISCORD_TURN_WEBHOOK_URL = prevWebhook;
    if (prevDm === undefined) delete process.env.DISCORD_TURN_DM;
    else process.env.DISCORD_TURN_DM = prevDm;
    if (prevToken === undefined) delete process.env.DISCORD_BOT_TOKEN;
    else process.env.DISCORD_BOT_TOKEN = prevToken;
    globalThis.fetch = prevFetch;
    delete globalThis.__dmOpenFail;
    delete globalThis.__dmPostFail;
  }
}

console.log('=== 2. drag path matches the movement route ===');
{
  const land = board([
    { name: 'Home', isWater: false, connections: ['Mid', 'Side'] },
    { name: 'Mid', isWater: false, connections: ['Home', 'Far'] },
    { name: 'Far', isWater: false, connections: ['Mid'] },
    { name: 'Side', isWater: false, connections: ['Home'] },
  ]);
  land.territoryState.Far.owner = 'british';
  const tankPath = land.getLandUnitPath('Home', 'Far', 2, 'italians', true);
  const dragged = dragMovementRoute(land, {
    from: 'Home',
    to: 'Far',
    playerId: 'italians',
    isCombatMove: true,
    selection: { armour: 1 },
    unitDefs,
  });
  check('a tank path is the land movement route, through Mid',
    dragged?.names.join('>') === tankPath?.path.join('>')
    && dragged.names.join('>') === 'Home>Mid>Far'
    && !dragged.names.includes('Side'));
  const foot = dragMovementRoute(land, {
    from: 'Home',
    to: 'Far',
    playerId: 'italians',
    isCombatMove: true,
    selection: { infantry: 1 },
    unitDefs,
  });
  check('infantry cannot take the two-step route',
    foot == null && land.getLandUnitPath('Home', 'Far', 1, 'italians', true) == null);
  const step = dragMovementRoute(land, {
    from: 'Home',
    to: 'Mid',
    playerId: 'italians',
    isCombatMove: true,
    selection: { infantry: 1 },
    unitDefs,
  });
  check('infantry to the next territory is that one step',
    step?.names.join('>') === 'Home>Mid');

  const sea = board([
    { name: 'S1', isWater: true, connections: ['S2'] },
    { name: 'S2', isWater: true, connections: ['S1', 'S3'] },
    { name: 'S3', isWater: true, connections: ['S2'] },
  ]);
  const seaReach = sea.getReachableTerritoriesForSea('S1', 2, 'italians', true);
  const sailed = dragMovementRoute(sea, {
    from: 'S1',
    to: 'S3',
    playerId: 'italians',
    isCombatMove: true,
    selection: { destroyer: 1 },
    unitDefs,
  });
  check('a destroyer path is the sea movement route',
    sailed?.names.join('>') === seaReach.get('S3')?.path.join('>')
    && sailed.names.join('>') === 'S1>S2>S3');

  const air = board([
    { name: 'A', isWater: false, connections: ['W'] },
    { name: 'W', isWater: true, connections: ['A', 'B'] },
    { name: 'B', isWater: false, connections: ['W'] },
  ]);
  const flown = dragMovementRoute(air, {
    from: 'A',
    to: 'B',
    playerId: 'italians',
    isCombatMove: false,
    selection: { fighter: 1 },
    unitDefs,
  });
  check('a fighter path is the air movement route, through the sea zone',
    flown?.names.join('>') === air.getAirFlightPath('A', 'B', 4)?.join('>')
    && flown.names.join('>') === 'A>W>B');

  const strokes = [];
  const ctx = {
    save() {},
    restore() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    stroke() {
      strokes.push({
        style: this.strokeStyle,
        width: this.lineWidth,
        blur: this.shadowBlur,
      });
    },
    setLineDash(dash) { this.dash = dash; },
  };
  const xy = [0, 0, 40, 0, 80, 10];
  check('the stroke draws', strokeDragPath(ctx, xy, xy.length, 1) === true);
  check('the path is a yellow dash with a wider black outline and no glow',
    strokes.length === 2
    && strokes[0].style === DRAG_PATH_OUTLINE
    && strokes[1].style === DRAG_PATH_YELLOW
    && strokes[0].width > strokes[1].width
    && strokes[0].blur === 0
    && strokes[1].blur === 0
    && ctx.dash.length === 2);
}

console.log('=== 3. factory damage is red ===');
{
  const calls = [];
  const ctx = {
    save() {},
    restore() {},
    strokeText() { calls.push({ op: 'stroke', strokeStyle: this.strokeStyle }); },
    fillText() { calls.push({ op: 'fill', fillStyle: this.fillStyle }); },
  };
  UnitRenderer.prototype._drawFactoryDamageOnIcon.call({}, ctx, 100, 200, 24, 4, 1);
  const fill = calls.find((row) => row.op === 'fill');
  const stroke = calls.find((row) => row.op === 'stroke');
  check('the damage digits are the existing enemy red, with the black outline',
    FACTORY_DAMAGE_COLOR === '#e74c3c'
    && fill?.fillStyle === FACTORY_DAMAGE_COLOR
    && stroke?.strokeStyle === 'rgba(0,0,0,0.92)');
}

console.log('=== 4. global RISK ladder ===');
{
  check('schema stays 11', SCHEMA_VERSION === 11);
  const gs = board([
    { name: 'Italy', isWater: false, connections: [], production: 2 },
    { name: 'Britain', isWater: false, connections: [], production: 2 },
  ]);
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.riskCards.italians = ['infantry', 'infantry', 'infantry'];
  gs.riskCards.british = ['cavalry', 'cavalry', 'cavalry'];
  const first = gs.tradeRiskCards('italians');
  const second = gs.tradeRiskCards('british');
  check('the first set is 12 and the next player cashes 18',
    first.ipcs === 12 && second.ipcs === 18 && gs.riskTradeCount === 2);
  check('the next set for either player is 24',
    gs.getNextRiskCardValue('italians') === 24
    && gs.getNextRiskCardValue('british') === 24);
  const saved = gs.toJSON();
  check('the save keeps schema 11 and the shared count',
    saved.version === 11 && saved.riskTradeCount === 2);

  const old = {
    version: 11,
    cardTradeCount: { italians: 1, british: 1 },
    players: gs.players,
    currentPlayerIndex: 0,
    phase: GAME_PHASES.PLAYING,
    turnPhase: TURN_PHASES.PURCHASE,
    territoryState: gs.territoryState,
    units: gs.units,
    playerState: gs.playerState,
    riskCards: { italians: [], british: [] },
  };
  check('an old save sums the per-player history',
    resolveRiskTradeCount(old) === 2
    && !Object.prototype.hasOwnProperty.call(old, 'riskTradeCount'));
  const loaded = board([
    { name: 'Italy', isWater: false, connections: [], production: 2 },
    { name: 'Britain', isWater: false, connections: [], production: 2 },
  ]);
  loaded._loadFromJSONBody(old);
  check('loading that save does not throw and the next set is 24',
    loaded.riskTradeCount === 2 && loaded.getNextRiskCardValue('british') === 24);
  check('a junk explicit count falls back to the history',
    resolveRiskTradeCount({ riskTradeCount: 'nope', cardTradeCount: { italians: 2 } }) === 2);
  check('an explicit zero stays zero',
    resolveRiskTradeCount({ riskTradeCount: 0, cardTradeCount: { italians: 4 } }) === 0);
  check('a missing save does not throw',
    resolveRiskTradeCount(null) === 0 && deriveRiskTradeCount(undefined) === 0);

  loaded._riskLadderExplicit = true;
  loaded.riskTradeCount = 1;
  const sidebar = makeEl();
  const previousGet = document.getElementById;
  document.getElementById = (id) => (id === 'sidebar' ? sidebar : null);
  const panel = new PlayerPanel();
  document.getElementById = previousGet;
  panel.gameState = loaded;
  panel.unitDefs = unitDefs;
  const stats = panel._renderStatsTab(loaded.currentPlayer);
  const tracks = stats.match(/pp-risk-track/g) || [];
  check('the Players pane labels one shared RISK Tracker',
    tracks.length === 2
    && stats.includes('RISK Tracker:')
    && stats.includes('pp-risk-last">12')
    && stats.includes('pp-risk-next">18')
    && stats.includes('pp-risk-next">24')
    && stats.includes('pp-risk-next">30')
    && stats.indexOf('RISK Tracker:') < stats.indexOf('pp-risk-last'));
}

console.log('=== 5. rules copy ===');
{
  check('the transport line is Rob\'s sentence',
    TRANSPORT_RULES_LINE === 'Transports: Can carry 2 infantry OR 1 infantry + 1 other land unit. Transports can not be taken as casualties. Undefended transports are destroyed when an enemy unit can hit them.');
  check('the unloading line is Rob\'s sentence',
    UNLOAD_RULES_LINE === 'Unloading: Units can unload during combat movement for amphibious assault. Loaded units can also unload during the noncombat phase. Unloading a unit uses up all of that unit\'s movement for the round.');
  const html = RulesPanel.prototype._getContent.call({});
  check('the rules menu can open both tech trees',
    html.includes('value="tech-classic"')
    && html.includes('value="tech-expanded"')
    && html.includes('id="rules-tech-classic"')
    && html.includes('id="rules-tech-expanded"'));
  check('the transport and unloading lines are in the rules',
    html.includes('Can carry 2 infantry OR 1 infantry + 1 other land unit')
    && html.includes('can not be taken as casualties')
    && html.includes('Unloading a unit uses up all of that unit\'s movement for the round'));
  const missing = [...CLASSIC_TECH_RULES, ...EXPANDED_TECH_RULES]
    .filter((row) => !html.includes(row.name) || !html.includes(row.text));
  check('every technology is in its tree section', missing.length === 0, missing.map((row) => row.id));
}

console.log(failures === 0 ? '\nunified.67 checks passed' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
