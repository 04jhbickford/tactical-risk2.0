// AI specialization, the second seat axis beside difficulty.
// Run: node tools/test-ai-specialization.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem(key) { return mem.has(key) ? mem.get(key) : null; },
    setItem(key, value) { mem.set(key, String(value)); },
    removeItem(key) { mem.delete(key); },
  };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const {
  AI_SPECIALIZATIONS,
  DEFAULT_AI_SPECIALIZATION,
  attackPriorityBonus,
  capitalBiasScore,
  layeredKnobs,
  normalizeAiSpecialization,
  preferredTechId,
  specializationChoices,
  techBias,
  tiltPurchasePriorities,
} = await import(pathToFileURL(join(root, 'src/ai/specialization.js')));
const { pickCapitalFromPool } = await import(pathToFileURL(join(root, 'src/ai/capitalSpacing.js')));
const {
  allowsLosingTrade,
  difficultyKnobs,
  normalizeAiDifficulty,
} = await import(pathToFileURL(join(root, 'src/ai/difficulty.js')));
const gameOptions = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { renderGameOptionsPanel } = await import(pathToFileURL(join(root, 'src/ui/gameOptionsPanel.js')));
const { AIController } = await import(pathToFileURL(join(root, 'src/ai/aiController.js')));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra == null ? '' : extra);
  } else {
    console.log('ok  :', label);
  }
};

const html = readFileSync(join(root, 'index.html'), 'utf8');
const lobbySrc = readFileSync(join(root, 'src/ui/lobby.js'), 'utf8');
const mpSrc = readFileSync(join(root, 'src/ui/multiplayerLobby.js'), 'utf8');
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));

console.log('=== stamp ===');
check('stamp is V2.81.57-unified.59', GAME_VERSION === 'V2.81.57-unified.59');
check('schema stays 11', SCHEMA_VERSION === 11);
check('index.html carries the display stamp',
  html.includes('content="V2.81.57-unified.59"')
  && html.includes("window.__TR_GAME_VERSION = 'V2.81.57-unified.59'")
  && html.includes("var LOCKED = 'V2.81.57-unified.59'")
  && html.includes('style.css?v=V2.81.57-unified.59')
  && html.includes('src/main.js?v=V2.81.57-unified.59'));

console.log('=== normalize ===');
check('default is general', DEFAULT_AI_SPECIALIZATION === 'general'
  && normalizeAiSpecialization(undefined) === 'general'
  && normalizeAiSpecialization(null) === 'general'
  && normalizeAiSpecialization('') === 'general');
check('unknown becomes general', normalizeAiSpecialization('blittzkrieg') === 'general'
  && normalizeAiSpecialization('egyptians') === 'general');
check('known ids stay', ['general', 'admiral', 'infantry_man', 'blitzkrieg', 'logistics_officer', 'bombadere']
  .every((id) => normalizeAiSpecialization(id) === id));
check('labels are the lobby names',
  AI_SPECIALIZATIONS.map((row) => row.name).join(',')
  === 'General,Admiral,Infantry Man,Blitzkrieg,Logistics Officer,Bombadere,Rico');

console.log('=== rico and nukes ===');
const off = specializationChoices({ nukes: false }).map((row) => row.id);
const on = specializationChoices({ nukes: true }).map((row) => row.id);
check('Rico is hidden when nukes are off', !off.includes('rico') && off.includes('general'));
check('Rico is listed when nukes are on', on.includes('rico') && on.includes('admiral'));
check('Rico without nukes becomes general', normalizeAiSpecialization('rico', {}) === 'general'
  && normalizeAiSpecialization('rico', { nukes: false }) === 'general');
check('Rico with nukes stays Rico', normalizeAiSpecialization('rico', { nukes: true }) === 'rico');
check('nukes default off', gameOptions.normalizeGameOptions(null).nukes === false
  && gameOptions.normalizeGameOptions({}).nukes === false
  && gameOptions.normalizeGameOptions({ garrisons: true }).nukes === false);
check('explicit nukes true is kept', gameOptions.normalizeGameOptions({ nukes: true }).nukes === true);
check('off is still standard rules', gameOptions.isStandardRules(null) === true
  && gameOptions.describe(null) === 'Standard rules');
check('on is named and not standard', gameOptions.describe({ nukes: true }).includes('nukes')
  && gameOptions.isStandardRules({ nukes: true }) === false);
const panel = renderGameOptionsPanel(null);
const nukesFlag = panel.match(/data-go="nukes"[^>]*aria-checked="(true|false)"/);
check('lobby Nukes switch starts off', panel.includes('>Nukes<') && nukesFlag?.[1] === 'false');

console.log('=== difficulty stays independent ===');
const easyAdmiral = layeredKnobs('easy', 'admiral', { nukes: true });
const easyGeneral = layeredKnobs('easy', 'general');
const hardestBlitz = layeredKnobs('hardest', 'blitzkrieg');
check('specialization does not change the difficulty ratios',
  easyAdmiral.attackRatio === easyGeneral.attackRatio
  && easyAdmiral.attackCap === difficultyKnobs('easy').attackCap
  && easyAdmiral.losingTradeForWin === false
  && hardestBlitz.attackRatio === difficultyKnobs('hardest').attackRatio
  && hardestBlitz.losingTradeForWin === true
  && hardestBlitz.specialization === 'blitzkrieg');
check('Hardest may still take a bad trade, Easier may not',
  allowsLosingTrade('hardest', true) === true
  && allowsLosingTrade('easy', true) === false
  && normalizeAiDifficulty('hard') === 'hard');
check('Rico forced to general does not keep nuke knobs',
  layeredKnobs('hard', 'rico', { nukes: false }).attackBias === 'none'
  && layeredKnobs('hard', 'rico', { nukes: false }).specialization === 'general'
  && layeredKnobs('hard', 'rico', { nukes: true }).attackBias === 'nuke');

console.log('=== tech and purchase tilt ===');
check('logistics prefers industrial technology',
  preferredTechId('logistics_officer', ['jets', 'industrialTech']) === 'industrialTech'
  && techBias('logistics_officer', ['jets', 'industrialTech']).eager === true);
check('bombadere prefers heavy bombers, then other air',
  preferredTechId('bombadere', ['jets', 'heavyBombers', 'industrialTech']) === 'heavyBombers'
  && preferredTechId('bombadere', ['jets', 'longRangeAircraft']) === 'longRangeAircraft');
check('a missing named tech is skipped',
  techBias('logistics_officer', ['jets', 'rockets']).pick == null
  && preferredTechId('logistics_officer', ['jets', 'rockets']) === 'jets'
  && techBias('rico', ['jets', 'heavyBombers'], { nukes: true }).eager === false
  && preferredTechId('rico', ['jets', 'heavyBombers'], { nukes: true }) === 'jets');
check('Rico takes a nuke id when the tree has one',
  techBias('rico', ['jets', 'nukes'], { nukes: true }).pick === 'nukes'
  && techBias('rico', ['atomicBomb'], { nukes: true }).eager === true);
check('general purchase list is unchanged',
  tiltPurchasePriorities(
    [{ unitType: 'infantry', maxCount: 4 }, { unitType: 'armour', maxCount: 1 }],
    'general',
  ).map((row) => `${row.unitType}:${row.maxCount}`).join(',') === 'infantry:4,armour:1');
const tilted = tiltPurchasePriorities(
  [{ unitType: 'infantry', maxCount: 4 }, { unitType: 'armour', maxCount: 2 }, { unitType: 'fighter', maxCount: 1 }],
  'infantry_man',
);
const blitz = tiltPurchasePriorities(
  [{ unitType: 'infantry', maxCount: 4 }, { unitType: 'armour', maxCount: 2 }],
  'blitzkrieg',
  { mechanized: true },
);
check('infantry man keeps other units possible',
  tilted[0].unitType === 'infantry'
  && tilted.some((row) => row.unitType === 'armour' && row.maxCount >= 1)
  && tilted.some((row) => row.unitType === 'fighter' && row.maxCount >= 1));
check('blitzkrieg leads with tanks and still lists infantry',
  blitz[0].unitType === 'armour'
  && blitz[0].maxCount >= 6
  && blitz.some((row) => row.unitType === 'mechanizedInfantry')
  && blitz.some((row) => row.unitType === 'infantry' && row.maxCount >= 1));

console.log('=== capital bias inside the shared pool ===');
const facts = {
  Isle: { landNeighborCount: 0, seaNeighborCount: 2, isIsland: true, landMassSize: 1, airReachLand: 3 },
  Hub: { landNeighborCount: 4, seaNeighborCount: 0, isIsland: false, landMassSize: 8, airReachLand: 6 },
  Edge: { landNeighborCount: 1, seaNeighborCount: 1, isIsland: false, landMassSize: 8, airReachLand: 6 },
  Coast: { landNeighborCount: 1, seaNeighborCount: 2, isIsland: false, landMassSize: 7, airReachLand: 10 },
};
const score = (bias, name) => capitalBiasScore(bias, facts[name]);
check('admiral prefers the island', score('island', 'Isle') > score('island', 'Hub'));
check('infantry man prefers the land center', score('landCenter', 'Hub') > score('landCenter', 'Edge'));
check('blitzkrieg prefers the land border', score('landBorder', 'Edge') > score('landBorder', 'Hub'));
check('bombadere prefers the coastal capital in air reach',
  score('coastalAir', 'Coast') > score('coastalAir', 'Hub')
  && score('coastalAir', 'Hub') === 0);
check('general adds no capital score', score('none', 'Isle') === 0 && score('none', 'Hub') === 0);
check('hard still places by connections when the bias is flat',
  pickCapitalFromPool(['Hub', 'Isle'], 'hard', {
    connectionCount: (name) => (name === 'Hub' ? 6 : 1),
  }) === 'Hub');
check('admiral bias beats a higher connection count',
  pickCapitalFromPool(['Hub', 'Isle'], 'hard', {
    connectionCount: (name) => (name === 'Hub' ? 6 : 1),
    biasScore: (name) => score('island', name),
  }) === 'Isle');
check('attack nudge is zero for general', attackPriorityBonus('general', { coastal: true, defensePower: 1 }) === 0);

console.log('=== lobby wiring ===');
check('local setup has a specialization select',
  lobbySrc.includes('spec-select') && lobbySrc.includes('aria-label="Specialization"')
  && lobbySrc.includes('aiSpecialization: isAI ? normalizeAiSpecialization'));
check('online Add AI has the same select',
  mpSrc.includes('id="ai-specialization"') && mpSrc.includes('specializationChoices'));

AIController.prototype._delay = async function silent() {};
AIController.prototype._getActionDelay = function noDelay() { return 0; };

function link(pairs) {
  const map = new Map();
  const add = (a, b) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a).add(b);
  };
  for (const [a, b] of pairs) {
    add(a, b);
    add(b, a);
  }
  return [...map.entries()].map(([name, links]) => ({
    name,
    isWater: name.startsWith('Sea'),
    connections: [...links],
  }));
}

function board({ territories, territoryState, units, specialization, difficulty = 'medium', ipc = 40 }) {
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.mapId = 'classic';
  gs.players = [
    { id: 'usa', name: 'USA', isAI: true, aiDifficulty: difficulty, aiSpecialization: specialization || null, capital: 'Home' },
    { id: 'ger', name: 'Germany', isAI: false, aiDifficulty: null },
    { id: 'uk', name: 'UK', isAI: false, aiDifficulty: null },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.territoryState = territoryState;
  gs.playerState = {
    usa: { ipcs: ipc, hasPlacedCapital: true, capitalTerritory: 'Home' },
    ger: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'Far' },
    uk: { ipcs: 20, hasPlacedCapital: true, capitalTerritory: 'Other' },
  };
  gs.units = units;
  gs.unitDefs = unitDefs;
  gs.gameOptions = gameOptions.normalizeGameOptions({
    landBridges: true,
    techAcquisition: 'dice',
    tacticalBombers: false,
    mechanizedInfantry: true,
    nukes: specialization === 'rico',
  });
  gs.friendlyTerritoriesAtTurnStart = new Set(
    Object.entries(territoryState).filter(([, state]) => state.owner === 'usa').map(([name]) => name),
  );
  return gs;
}

async function runPurchase(gs) {
  const bought = [];
  const orig = gs.purchaseUnit.bind(gs);
  gs.purchaseUnit = (type, where, defs) => {
    const ok = orig(type, where, defs);
    if (ok) bought.push(type);
    return ok;
  };
  const ai = new AIController();
  ai.skipMode = true;
  ai.unitDefs = unitDefs;
  ai.gameState = gs;
  ai._updateStatus = () => {};
  ai._logAction = () => {};
  ai._notifyAction = () => {};
  await ai._handlePurchase({ difficulty: gs.players[0].aiDifficulty }, gs.players[0]);
  return bought;
}

function landBoard(specialization) {
  const territories = link([['Home', 'Plain']]);
  territories.push({ name: 'Far', isWater: false, connections: [] });
  territories.push({ name: 'Other', isWater: false, connections: [] });
  return board({
    specialization,
    territories,
    territoryState: {
      Home: { owner: 'usa', isCapital: true },
      Plain: { owner: 'usa', isCapital: false },
      Far: { owner: 'ger', isCapital: true },
      Other: { owner: 'uk', isCapital: true },
    },
    units: { Home: [{ type: 'factory', quantity: 1, owner: 'usa' }] },
  });
}

const foot = await runPurchase(landBoard('infantry_man'));
const tanks = await runPurchase(landBoard('blitzkrieg'));
const count = (rows, type) => rows.filter((item) => item === type).length;
check('infantry man buys more infantry than blitzkrieg',
  count(foot, 'infantry') > count(tanks, 'infantry'),
  `foot ${foot.join(',')} tanks ${tanks.join(',')}`);
check('blitzkrieg buys more tanks',
  count(tanks, 'armour') > count(foot, 'armour'),
  `tanks ${tanks.join(',')}`);
check('neither buy is a single unit type',
  new Set(foot).size > 1 && new Set(tanks).size > 1,
  `foot ${foot.join(',')} tanks ${tanks.join(',')}`);

function coastBoard(specialization, difficulty) {
  const territories = link([['Home', 'Sea'], ['Sea', 'Far'], ['Plain', 'Coast']]);
  territories.push({ name: 'Other', isWater: false, connections: [] });
  return board({
    specialization,
    difficulty,
    ipc: 50,
    territories,
    territoryState: {
      Home: { owner: 'usa', isCapital: true },
      Sea: { owner: null, isCapital: false },
      Far: { owner: 'ger', isCapital: false },
      Plain: { owner: 'usa', isCapital: false },
      Coast: { owner: 'ger', isCapital: false },
      Other: { owner: 'uk', isCapital: true },
    },
    units: { Home: [{ type: 'factory', quantity: 1, owner: 'usa' }] },
  });
}

const hardWalk = await runPurchase(coastBoard(null, 'hard'));
const hardAdmiral = await runPurchase(coastBoard('admiral', 'hard'));
check('Harder without a sea focus skips boats when a land path exists',
  !hardWalk.includes('transport'), hardWalk.join(','));
check('Admiral still buys a transport', hardAdmiral.includes('transport'), hardAdmiral.join(','));

async function runAttacks(gs) {
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  const moved = [];
  const orig = gs.moveUnits.bind(gs);
  gs.moveUnits = (from, to, units, defs, options) => {
    const result = orig(from, to, units, defs, options);
    moved.push({ from, to, units, options: options || null, ok: !!(result && result.success !== false), error: result?.error || '' });
    return result;
  };
  const ai = new AIController();
  ai.skipMode = true;
  ai.unitDefs = unitDefs;
  ai.gameState = gs;
  ai._updateStatus = () => {};
  ai._logAction = () => {};
  ai._notifyAction = () => {};
  await ai._handleCombatMove({ difficulty: gs.players[0].aiDifficulty }, gs.players[0]);
  return moved;
}

function raidBoard(specialization) {
  const territories = link([['Home', 'Plant']]);
  territories.push({ name: 'Other', isWater: false, connections: [] });
  return board({
    specialization,
    territories,
    territoryState: {
      Home: { owner: 'usa', isCapital: true },
      Plant: { owner: 'ger', isCapital: false },
      Other: { owner: 'uk', isCapital: true },
    },
    units: {
      Home: [
        { type: 'bomber', quantity: 1, owner: 'usa' },
        { type: 'infantry', quantity: 4, owner: 'usa' },
      ],
      Plant: [
        { type: 'factory', quantity: 1, owner: 'ger' },
        { type: 'infantry', quantity: 1, owner: 'ger' },
      ],
    },
  });
}

const generalMoves = await runAttacks(raidBoard(null));
const bomberMoves = await runAttacks(raidBoard('bombadere'));
const raided = (rows) => rows.some((row) => row.ok && row.options?.raid === true);
check('general does not raid the factory', !raided(generalMoves), JSON.stringify(generalMoves));
check('bombadere raids the factory', raided(bomberMoves), JSON.stringify(bomberMoves));

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall AI specialization checks passed');
