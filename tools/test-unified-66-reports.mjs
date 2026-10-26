// unified.66 — sea units stay at sea, submarine surprise strike, RISK cash-in.
// Run: node tools/test-unified-66-reports.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function makeEl() {
  const classSet = new Set();
  const el = {
    id: '',
    className: '',
    innerHTML: '',
    style: {},
    children: [],
    classList: {
      add(...names) {
        names.forEach((name) => classSet.add(name));
        el.className = [...classSet].join(' ');
      },
      remove(...names) {
        names.forEach((name) => classSet.delete(name));
        el.className = [...classSet].join(' ');
      },
      contains(name) { return classSet.has(name); },
      toggle(name, force) {
        if (force === undefined) {
          if (classSet.has(name)) this.remove(name);
          else this.add(name);
        } else if (force) this.add(name);
        else this.remove(name);
        return classSet.has(name);
      },
    },
    appendChild(child) { this.children.push(child); return child; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
  };
  return el;
}

globalThis.localStorage ??= {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};
globalThis.document ??= {
  documentElement: makeEl(),
  body: makeEl(),
  createElement: makeEl,
  getElementById() { return null; },
};
globalThis.Image ??= class Image {
  set src(_) {}
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES, riskMilestoneTrack } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { GAME_VERSION, SCHEMA_VERSION, compatClientVersion } = await import(pathToFileURL(join(root, 'src/version.js')));
const { sideCanFirstStrike } = await import(pathToFileURL(join(root, 'src/state/combatUnits.js')));
const { legalMoveForDestination } = await import(pathToFileURL(join(root, 'src/state/combatMoveEligibility.js')));
const { applyTerritoryCapture } = await import(pathToFileURL(join(root, 'src/state/combatFinalize.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const { PlayerPanel } = await import(pathToFileURL(join(root, 'src/ui/playerPanel.js')));
const { AIController } = await import(pathToFileURL(join(root, 'src/ai/aiController.js')));
const { AIPlayer } = await import(pathToFileURL(join(root, 'src/ai/aiPlayer.js')));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

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
    { id: 'british', name: 'UK', isAI: true, aiDifficulty: 'easy' },
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
    gs.territoryState[territory.name] = { owner: territory.isWater ? null : 'british' };
    gs.units[territory.name] = [];
  }
  gs._notify = () => {};
  gs._unitDefs = unitDefs;
  gs.unitDefs = unitDefs;
  return gs;
}

function qty(gs, territory, type, owner) {
  return (gs.units[territory] || [])
    .filter((unit) => unit.type === type && (!owner || unit.owner === owner))
    .reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
}

const sea = 'Japan Sea Zone';
const land = 'Japan';
const west = 'West Spain Sea Zone';
const spain = 'Spain';
const atlantic = 'Atlantic';

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const stamp = 'V2.81.57-unified.68';
  check('display stamp is V2.81.57-unified.68', GAME_VERSION === stamp);
  check('schema stays 11', SCHEMA_VERSION === 11);
  check('game docs write V2.82-unified.68', compatClientVersion() === 'V2.82-unified.68');
  check('index.html carries the display stamp',
    html.includes(`name="tr-game-version" content="${stamp}"`)
    && html.includes(`window.__TR_GAME_VERSION = '${stamp}'`)
    && html.includes(`var LOCKED = '${stamp}'`)
    && html.includes(`style.css?v=${stamp}`)
    && html.includes(`src/main.js?v=${stamp}`));
}

console.log('=== 1. sea units cannot be written onto land ===');
{
  const gs = board([
    { name: sea, isWater: true, connections: [land, atlantic] },
    { name: land, isWater: false, connections: [sea, spain], production: 2 },
    { name: spain, isWater: false, connections: [land, west], production: 1 },
    { name: atlantic, isWater: true, connections: [sea, west], production: 0 },
    { name: west, isWater: true, connections: [atlantic, spain] },
    { name: 'Italy', isWater: false, connections: [], production: 2 },
    { name: 'Britain', isWater: false, connections: [], production: 2 },
  ]);
  gs.territoryState[land].owner = 'british';
  gs.territoryState[spain].owner = 'italians';
  gs.territoryState.Italy.owner = 'italians';
  gs.units[sea] = [
    { type: 'battleship', quantity: 1, owner: 'italians' },
    { type: 'battleship', id: 'battleship_uk', quantity: 1, owner: 'italians' },
  ];
  const byQuantity = gs.moveUnits(sea, land, [{ type: 'battleship', quantity: 1 }], unitDefs);
  check('a sea stack cannot move onto land', byQuantity.success === false && qty(gs, land, 'battleship') === 0 && qty(gs, sea, 'battleship') === 2, byQuantity);
  const byId = gs.moveUnits(sea, land, [], unitDefs, { shipIds: ['battleship_uk'] });
  check('a ship id cannot move onto land', byId.success === false && qty(gs, land, 'battleship') === 0, byId);
  check('the hull is still in the sea zone', (gs.units[sea] || []).some((unit) => unit.id === 'battleship_uk'));

  const legal = legalMoveForDestination(gs, sea, land, { 'ship:battleship_uk': 1 }, unitDefs);
  check('a land drop keeps the hull off the move', legal.shipIds.length === 0 && legal.units.length === 0);
  const water = legalMoveForDestination(gs, sea, atlantic, { 'ship:battleship_uk': 1 }, unitDefs);
  check('the same hull can still enter a sea zone', water.shipIds.includes('battleship_uk'));
  const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
  check('the map drop uses the sea-legal ship ids', mainSrc.includes('{ shipIds: legal.shipIds }') && !mainSrc.includes('picked.shipIds'));

  gs.phase = GAME_PHASES.UNIT_PLACEMENT;
  gs.unitsPlacedThisRound = 0;
  gs.unitsToPlace = { italians: [{ type: 'battleship', quantity: 1 }] };
  const placed = gs.placeInitialUnit(land, 'battleship', unitDefs);
  check('setup cannot place a ship on land', placed.success === false && qty(gs, land, 'battleship') === 0, placed);

  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.MOBILIZE;
  gs.pendingPurchases = [{ type: 'battleship', quantity: 1, owner: 'italians', cost: 20 }];
  const mobilized = gs.mobilizeUnit('battleship', land, unitDefs);
  check('mobilize cannot put a ship on land', mobilized.success === false && qty(gs, land, 'battleship') === 0, mobilized);

  gs.pendingPurchases = [{ type: 'battleship', quantity: 1, owner: 'italians', territory: land }];
  gs._mobilizePurchases();
  check('purchase mobilization refuses a ship tagged for a capital', qty(gs, land, 'battleship') === 0);

  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.units[sea] = [{
    type: 'transport',
    id: 'transport_1',
    quantity: 1,
    owner: 'italians',
    cargo: [{ type: 'infantry', owner: 'italians' }],
  }];
  const unloaded = gs.unloadTransport(sea, 0, land);
  check('unloading does not put the transport on the coast',
    unloaded.success === true
    && qty(gs, land, 'infantry', 'italians') === 1
    && qty(gs, sea, 'transport', 'italians') === 1
    && qty(gs, land, 'transport') === 0,
    unloaded);

  gs.units[sea] = [{ type: 'battleship', quantity: 1, owner: 'italians' }];
  gs.units[land] = [{ type: 'factory', quantity: 1, owner: 'british' }];
  const captured = applyTerritoryCapture(gs, land, { playerId: 'italians', previousOwner: 'british', unitDefs });
  check('capturing the coast leaves the fleet in the sea',
    captured.captured === true
    && qty(gs, sea, 'battleship', 'italians') === 1
    && qty(gs, land, 'battleship') === 0);

  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.units[west] = [{ type: 'battleship', quantity: 1, owner: 'italians', id: 'battleship_retreat' }];
  gs.units[atlantic] = [];
  gs.territoryState[west] = { owner: null };
  gs.moveHistory = [
    { from: atlantic, to: west, player: 'italians', units: [{ type: 'battleship', quantity: 1 }] },
    { from: spain, to: west, player: 'italians', units: [{ type: 'infantry', quantity: 1 }] },
  ];
  const offered = gs.getRetreatDestinations(west);
  check('a sea battle does not offer the land origin', offered.includes(atlantic) && !offered.includes(spain), offered);
  const illegalRetreat = gs.retreatToTerritory(west, spain);
  check('retreating the fleet onto land is refused',
    illegalRetreat.success === false && qty(gs, west, 'battleship', 'italians') === 1 && qty(gs, spain, 'battleship') === 0,
    illegalRetreat);
  const seaRetreat = gs.retreatToTerritory(west, atlantic);
  check('the fleet can retreat to the sea it came from',
    seaRetreat.success === true && qty(gs, atlantic, 'battleship', 'italians') === 1 && qty(gs, west, 'battleship') === 0,
    seaRetreat);

  gs.units[west] = [{ type: 'destroyer', quantity: 1, owner: 'italians' }];
  gs.units[spain] = [];
  gs.moveHistory = [
    { from: spain, to: west, player: 'italians', units: [{ type: 'destroyer', quantity: 1 }] },
  ];
  const back = gs.retreatFromCombat(west);
  check('a per-origin retreat does not put the destroyer on land',
    back.success === true && qty(gs, west, 'destroyer', 'italians') === 1 && qty(gs, spain, 'destroyer') === 0,
    back);

  const inland = board([
    { name: 'Italy', isWater: false, connections: ['France'], production: 2 },
    { name: 'France', isWater: false, connections: ['Italy'], production: 1 },
  ]);
  inland.territoryState.Italy.owner = 'italians';
  inland.territoryState.France.owner = 'italians';
  const ai = new AIPlayer(inland, 'italians', 'easy');
  check('AI setup does not place a ship on land when no sea zone exists', ai._findBestPlacementLocation('battleship') === null);
}

console.log('=== 1b. load repairs a ship already on land ===');
{
  const territories = [
    { name: land, isWater: false, connections: [sea], production: 2 },
    { name: sea, isWater: true, connections: [land] },
    { name: 'Italy', isWater: false, connections: [], production: 2 },
  ];
  const gs = board(territories);
  gs.units[land] = [
    { type: 'infantry', quantity: 2, owner: 'british' },
    { type: 'battleship', quantity: 1, owner: 'british', id: 'battleship_on_japan' },
  ];
  gs.units[sea] = [];
  const saved = gs.toJSON();
  const restored = board(territories);
  const warnings = [];
  const orig = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  try {
    restored.loadFromJSON(saved);
  } finally {
    console.warn = orig;
  }
  check('the ship moves to the adjacent friendly sea zone',
    qty(restored, sea, 'battleship', 'british') === 1 && qty(restored, land, 'battleship') === 0);
  check('the infantry stays on the land', qty(restored, land, 'infantry', 'british') === 2);
  check('the repair is logged', warnings.some((line) => line.includes('Sea unit on land') && line.includes(sea)));
  check('schema is still 11', restored.toJSON().version === 11);

  const blocked = board(territories);
  blocked.units[land] = [{ type: 'cruiser', quantity: 1, owner: 'british' }];
  blocked.units[sea] = [{ type: 'battleship', quantity: 1, owner: 'italians' }];
  const snap = blocked.toJSON();
  const removed = board(territories);
  const notes = [];
  console.warn = (...args) => notes.push(args.join(' '));
  try {
    removed.loadFromJSON(snap);
  } finally {
    console.warn = orig;
  }
  check('an enemy sea zone removes the ship instead of moving it',
    qty(removed, land, 'cruiser') === 0 && qty(removed, sea, 'cruiser') === 0);
  check('the removal is logged', notes.some((line) => line.includes('Sea unit on land') && line.includes('removed')));
}

console.log('=== 2. own destroyer does not cancel a surprise strike ===');
{
  const sub = (owner) => ({ type: 'submarine', quantity: 1, owner });
  const dd = (owner) => ({ type: 'destroyer', quantity: 1, owner });
  const cruiser = (owner) => ({ type: 'cruiser', quantity: 1, owner });
  check('attacker sub plus own destroyer strikes a cruiser',
    sideCanFirstStrike([sub('italians'), dd('italians')], [cruiser('british')], false, unitDefs) === true);
  check('an enemy destroyer cancels the attacker strike',
    sideCanFirstStrike([sub('italians')], [dd('british')], true, unitDefs) === false);
  check('defender sub plus own destroyer strikes a cruiser',
    sideCanFirstStrike([sub('british'), dd('british')], [cruiser('italians')], false, unitDefs) === true);
  check('an attacker destroyer cancels the defender strike',
    sideCanFirstStrike([sub('british')], [dd('italians')], true, unitDefs) === false);

  function battle(attackers, defenders) {
    const gs = board([
      { name: west, isWater: true, connections: [] },
    ]);
    gs.turnPhase = TURN_PHASES.COMBAT;
    gs.units[west] = [...attackers, ...defenders];
    gs.combatQueue = [west];
    gs._rollDie = (ctx) => (ctx?.context === 'sub' ? 1 : 6);
    return gs;
  }

  const attackStrike = battle([sub('italians'), dd('italians')], [cruiser('british')]);
  attackStrike.resolveCombat(west, unitDefs);
  check('resolveCombat fires the attacker surprise strike beside its own destroyer',
    qty(attackStrike, west, 'cruiser', 'british') === 0
    && (attackStrike.combatTelemetry || []).some((entry) => entry.step === 'surprise'));

  const attackBlocked = battle([sub('italians')], [dd('british')]);
  attackBlocked.resolveCombat(west, unitDefs);
  check('resolveCombat skips the attacker strike against an enemy destroyer',
    qty(attackBlocked, west, 'destroyer', 'british') === 1
    && !(attackBlocked.combatTelemetry || []).some((entry) => entry.step === 'surprise'));

  const defenseStrike = battle([cruiser('italians')], [sub('british'), dd('british')]);
  defenseStrike.resolveCombat(west, unitDefs);
  check('resolveCombat fires the defender surprise strike beside its own destroyer',
    qty(defenseStrike, west, 'cruiser', 'italians') === 0
    && (defenseStrike.combatTelemetry || []).some((entry) => entry.step === 'surprise'));

  const defenseBlocked = battle([dd('italians')], [sub('british')]);
  defenseBlocked.resolveCombat(west, unitDefs);
  check('resolveCombat skips the defender strike against an attacker destroyer',
    qty(defenseBlocked, west, 'submarine', 'british') === 1
    && !(defenseBlocked.combatTelemetry || []).some((entry) => entry.step === 'surprise'));

  function openBattle(attackers, defenders) {
    const gs = battle(attackers, defenders);
    const ui = new CombatUI();
    ui.setGameState(gs);
    ui.setUnitDefs(unitDefs);
    ui.actionLog = { log() {}, entries: [] };
    ui.showNextCombat();
    return ui;
  }
  const shown = openBattle([sub('italians'), dd('italians')], [cruiser('british')]);
  check('the combat screen opens on the surprise strike',
    shown.combatState?.phase === 'submarineFirstStrike'
    && shown.el.innerHTML.includes('Fire First Strike'));
  const hidden = openBattle([sub('italians')], [dd('british')]);
  check('an enemy destroyer skips the surprise-strike step',
    hidden.combatState?.phase !== 'submarineFirstStrike'
    && !hidden.el.innerHTML.includes('Fire First Strike'));
}

console.log('=== 3. six RISK cards must be cashed, and the set is a choice ===');
{
  const gs = board([
    { name: 'Italy', isWater: false, connections: [], production: 2 },
    { name: 'Britain', isWater: false, connections: [], production: 2 },
  ]);
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.territoryState.Italy.owner = 'italians';
  gs.territoryState.Britain.owner = 'british';
  const twoSets = ['infantry', 'infantry', 'infantry', 'cavalry', 'cavalry', 'cavalry'];
  gs.riskCards.italians = twoSets.slice();
  check('no cash yet, then 12, 18, 24',
    JSON.stringify(riskMilestoneTrack(0)) === JSON.stringify({ last: null, next: [12, 18, 24] }));
  check('after one cash the track is 12 then 18, 24, 30',
    JSON.stringify(riskMilestoneTrack(1)) === JSON.stringify({ last: 12, next: [18, 24, 30] }));
  check('the track uses the table cap',
    JSON.stringify(riskMilestoneTrack(8)) === JSON.stringify({ last: 75, next: [75, 75, 75] }));

  gs.nextPhase();
  check('six cards hold the purchase phase', gs.turnPhase === TURN_PHASES.PURCHASE && gs.mustCashRiskCards());
  const chosen = gs.tradeSpecificCards('italians', ['cavalry', 'cavalry', 'cavalry']);
  check('the chosen set is the one removed',
    chosen.success === true
    && chosen.ipcs === 12
    && gs.riskCards.italians.filter((card) => card === 'cavalry').length === 0
    && gs.riskCards.italians.filter((card) => card === 'infantry').length === 3,
    { cards: gs.riskCards.italians, chosen });
  const wrong = gs.tradeSpecificCards('italians', ['infantry', 'cavalry', 'artillery']);
  check('a set that is not in hand is refused', wrong.success === false && gs.riskCards.italians.length === 3);
  gs.nextPhase();
  check('three cards can leave purchase', gs.turnPhase !== TURN_PHASES.PURCHASE);

  const five = board([
    { name: 'Italy', isWater: false, connections: [], production: 2 },
  ]);
  five.turnPhase = TURN_PHASES.PURCHASE;
  five.riskCards.italians = ['infantry', 'infantry', 'infantry', 'cavalry', 'cavalry'];
  five.nextPhase();
  check('five cards do not force a cash-in', five.turnPhase !== TURN_PHASES.PURCHASE);

  const wedged = board([
    { name: 'Italy', isWater: false, connections: [], production: 2 },
  ]);
  wedged.turnPhase = TURN_PHASES.PURCHASE;
  wedged.riskCards.italians = ['infantry', 'infantry', 'infantry', 'infantry', 'cavalry', 'cavalry'];
  wedged._findAllValidCardSets = () => [];
  wedged.nextPhase();
  check('six cards with no legal set do not wedge the phase', wedged.turnPhase !== TURN_PHASES.PURCHASE);

  const bot = board([
    { name: 'Britain', isWater: false, connections: [], production: 2 },
    { name: 'Italy', isWater: false, connections: [], production: 2 },
  ]);
  bot.currentPlayerIndex = 1;
  bot.players[1].isAI = true;
  bot.turnPhase = TURN_PHASES.PURCHASE;
  bot.territoryState.Britain.owner = 'british';
  bot.riskCards.british = twoSets.slice();
  bot.playerState.british.ipcs = 0;
  const ai = new AIController();
  ai.gameState = bot;
  ai.unitDefs = unitDefs;
  ai.skipMode = true;
  ai._delay = async () => {};
  ai._updateStatus = () => {};
  ai._notifyAction = () => {};
  ai._logAction = () => {};
  await ai._handlePurchase(null, bot.currentPlayer);
  check('the AI cashes six cards before it leaves purchase',
    (bot.riskCards.british || []).length < 6
    && (bot.cardTradeCount.british || 0) >= 1
    && bot.turnPhase !== TURN_PHASES.PURCHASE,
    { cards: bot.riskCards.british, phase: bot.turnPhase, trades: bot.cardTradeCount.british });

  const panelGame = board([
    { name: 'Italy', isWater: false, connections: [], production: 2 },
    { name: 'Britain', isWater: false, connections: [], production: 2 },
  ]);
  panelGame.turnPhase = TURN_PHASES.PURCHASE;
  panelGame.territoryState.Italy.owner = 'italians';
  panelGame.territoryState.Britain.owner = 'british';
  panelGame.riskCards.italians = twoSets.slice();
  panelGame.cardTradeCount.italians = 1;
  panelGame.cardTradeCount.british = 0;
  panelGame.playerTechs.british.unlockedTechs = ['heavyBombers'];
  const sidebar = makeEl();
  const previousGet = document.getElementById;
  document.getElementById = (id) => (id === 'sidebar' ? sidebar : null);
  const panel = new PlayerPanel();
  document.getElementById = previousGet;
  panel.gameState = panelGame;
  panel.unitDefs = unitDefs;
  const purchaseHtml = panel._renderInlinePurchase(panelGame.currentPlayer);
  const bottomHtml = panel._renderBottomActions(
    GAME_PHASES.PLAYING,
    TURN_PHASES.PURCHASE,
    panelGame.currentPlayer,
    true,
    true,
  );
  check('two valid sets are two choices',
    purchaseHtml.includes('>3 Infantry<')
    && purchaseHtml.includes('>3 Cavalry<')
    && purchaseHtml.includes('data-action="trade-set"')
    && !purchaseHtml.includes('data-action="trade-risk-cards"'));
  check('end phase is held until the cash-in',
    /data-action="next-phase"[^>]*disabled/.test(bottomHtml)
    && bottomHtml.includes('Cash in required'));
  const statsHtml = panel._renderStatsTab(panelGame.currentPlayer);
  check('each player has the RISK track under the cards',
    (statsHtml.match(/pp-risk-track/g) || []).length === 2
    && statsHtml.includes('pp-risk-last">12')
    && statsHtml.includes('pp-risk-next">18')
    && statsHtml.includes('pp-risk-next">24')
    && statsHtml.includes('pp-risk-next">30'));
  check('the opponent technology is on that player card',
    statsHtml.includes('Heavy Bombers')
    && statsHtml.includes('pp-tech-name'));

  document.documentElement.classList.add('mobile-shell');
  panelGame.turnPhase = TURN_PHASES.COMBAT;
  panelGame.combatQueue = ['West Spain Sea Zone'];
  const phoneCombat = panel._renderBottomActions(
    GAME_PHASES.PLAYING,
    TURN_PHASES.COMBAT,
    panelGame.currentPlayer,
    true,
    true,
  );
  check('phone combat offers Resolve for the one battle',
    phoneCombat.includes('data-action="open-combat"')
    && phoneCombat.includes('Resolve'),
    phoneCombat.slice(0, 400));
  panelGame.combatQueue = ['West Spain Sea Zone', 'Spain'];
  const phoneSeveral = panel._renderBottomActions(
    GAME_PHASES.PLAYING,
    TURN_PHASES.COMBAT,
    panelGame.currentPlayer,
    true,
    true,
  );
  check('phone combat with several battles does not auto-open the first',
    !phoneSeveral.includes('data-action="open-combat"'));
  document.documentElement.classList.remove('mobile-shell');
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nunified.66 checks passed');
