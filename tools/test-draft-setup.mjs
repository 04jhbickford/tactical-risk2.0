// V2.81.57-unified.16 — territory draft deals every land once, then capitals.
// Run: node tools/test-draft-setup.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map();
  globalThis.localStorage = {
    getItem(key) { return mem.has(key) ? mem.get(key) : null; },
    setItem(key, value) { mem.set(key, String(value)); },
    removeItem(key) { mem.delete(key); },
  };
}

const { GAME_VERSION, SCHEMA_VERSION } = await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  buildSnakeDraftOrder,
  draftOpenRefusal,
  DRAFT_MIN_CLIENT,
} = await import(pathToFileURL(join(root, 'src/state/territoryDraft.js')));
const { clampMaxPlayers, maxPlayerChoices, draftModeSource } = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { renderGameOptionsPanel } = await import(pathToFileURL(join(root, 'src/ui/gameOptionsPanel.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const setup = JSON.parse(readFileSync(join(root, 'data/setup.json'), 'utf8'));
const territories = JSON.parse(readFileSync(join(root, 'data/territories.json'), 'utf8'));
const continents = JSON.parse(readFileSync(join(root, 'data/continents.json'), 'utf8'));

function seats() {
  return setup.risk.factions.slice(0, 5).map((faction, index) => ({
    ...faction,
    isAI: index >= 2,
    aiDifficulty: 'medium',
  }));
}

function boot(gameOptions) {
  const gs = new GameState(setup, territories, continents);
  gs.isMultiplayer = false;
  gs.initGame('risk', seats(), {
    startingIPCs: 80,
    teamsEnabled: false,
    gameOptions,
  });
  return gs;
}

function stepDraft(gs) {
  const player = gs.currentPlayer;
  let choice = null;
  if (player?.isAI) choice = gs.chooseAiDraftTerritory(player.id);
  else {
    choice = gs.landTerritories
      .map((t) => t.name)
      .filter((name) => !gs.getOwner(name))
      .sort()[0];
  }
  return choice ? gs.pickDraftTerritory(choice) === true : false;
}

console.log('=== V2.81.57-unified.16 territory draft ===');
check('GAME_VERSION is V2.81.57-unified.16', GAME_VERSION === 'V2.81.57-unified.16');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

const enabled = (setup.gameModes || []).filter((mode) => mode.enabled).map((mode) => mode.id);
const draftStub = (setup.gameModes || []).find((mode) => mode.id === 'draft');
check('enabled modes stay classic and risk', JSON.stringify(enabled) === JSON.stringify(['classic', 'risk']));
check('draft stub stays disabled', draftStub?.enabled === false);
const draftRow = draftModeSource(setup);
check('option label comes from the draft stub', draftRow.name === 'Territory Draft');
const panel = renderGameOptionsPanel(null, { editable: true, draftMode: draftRow, seatedCount: 3 });
check('panel offers Random deal and the draft stub', panel.includes('Random deal') && panel.includes('Territory Draft'));
check('waiting room hides a max below the seats', !panel.includes('value="2"') && panel.includes('value="3"'));
check('max choices clamp to seated players', JSON.stringify(maxPlayerChoices(3)) === JSON.stringify([3, 4, 5]));
check('stored 2 with 3 seated becomes 3', clampMaxPlayers(2, 3) === 3);
check('stored 5 with 3 seated stays 5', clampMaxPlayers(5, 3) === 5);
check('empty room still allows 2', clampMaxPlayers(2, 0) === 2);

const prev = Math.random;
Math.random = mulberry32(0x150f);
let drafted;
let mid;
try {
  const gs = boot({ territorySetup: 'draft' });
  check('draft phase starts before capitals', gs.phase === GAME_PHASES.TERRITORY_DRAFT);
  check('two humans and three AI', gs.players.filter((p) => !p.isAI).length === 2
    && gs.players.filter((p) => p.isAI).length === 3);
  const expectedOrder = buildSnakeDraftOrder(
    gs.players.map((p) => p.id),
    gs.landTerritories.length,
  );
  check('snake order matches the seat order', JSON.stringify(gs.draft.order) === JSON.stringify(expectedOrder));
  check('snake turns the last seat around', expectedOrder[0] === gs.players[0].id
    && expectedOrder[gs.players.length] === gs.players[gs.players.length - 1].id);

  let guard = 0;
  while (gs.phase === GAME_PHASES.TERRITORY_DRAFT && guard < 3) {
    if (!stepDraft(gs)) break;
    guard += 1;
  }
  mid = gs.toJSON();
  const reloaded = new GameState(setup, territories, continents);
  reloaded.loadFromJSON(JSON.parse(JSON.stringify(mid)));
  check('mid-draft phase round-trips', reloaded.phase === GAME_PHASES.TERRITORY_DRAFT);
  check('mid-draft order round-trips', JSON.stringify(reloaded.draft) === JSON.stringify(mid.draft));
  check('mid-draft owners round-trip', JSON.stringify(reloaded.territoryState) === JSON.stringify(mid.territoryState));
  check('mid-draft seat round-trips', reloaded.currentPlayerIndex === mid.currentPlayerIndex);
  check('schema stays 11 in the draft save', mid.version === 11);
  check('draft save names the minimum client', mid.minClientVersion === DRAFT_MIN_CLIENT);
  check('older client refuses a draft-phase game',
    draftOpenRefusal(mid, 'V2.81.57-unified.14.1')?.reason === 'draft-client-too-old');
  check('this client may open the draft', draftOpenRefusal(mid, GAME_VERSION) == null);

  const stripped = JSON.parse(JSON.stringify(mid));
  delete stripped.draft;
  delete stripped.minClientVersion;
  const healed = new GameState(setup, territories, continents);
  healed.loadFromJSON(stripped);
  const ownedLand = healed.landTerritories.filter((t) => healed.getOwner(t.name)).length;
  check('F3 rebuilt pick index is the owned land count', healed.draft?.pickIndex === ownedLand && ownedLand > 0);
  check('F3 rebuilt picker exists', !!healed.draftPickerId());
  check('F3 rebuilt picker is the snake seat', healed.draftPickerId() === healed.draft.order[ownedLand]);
  let healGuard = 0;
  while (healed.phase === GAME_PHASES.TERRITORY_DRAFT && healGuard < 200) {
    if (!stepDraft(healed)) break;
    healGuard += 1;
  }
  check('F3 rebuilt draft reaches capital placement', healed.phase === GAME_PHASES.CAPITAL_PLACEMENT);

  guard = 0;
  while (gs.phase === GAME_PHASES.TERRITORY_DRAFT && guard < 200) {
    if (!stepDraft(gs)) break;
    guard += 1;
  }
  drafted = gs;
} finally {
  Math.random = prev;
}

const lands = drafted.landTerritories.map((t) => t.name);
const owners = lands.map((name) => drafted.getOwner(name));
check('capital placement starts after the draft', drafted.phase === GAME_PHASES.CAPITAL_PLACEMENT);
check('every land is owned', owners.every(Boolean));
check('every land is owned once', new Set(lands).size === lands.length && owners.length === lands.length);
const seas = (territories || []).filter((t) => t.isWater).map((t) => t.name);
check('sea zones stay unowned', seas.every((name) => !drafted.getOwner(name)));
const counts = {};
for (const id of owners) counts[id] = (counts[id] || 0) + 1;
check('all five seats received land', drafted.players.every((p) => counts[p.id] > 0));
check('drafted land has its starting infantry', lands.every((name) => {
  const stack = drafted.units[name] || [];
  return stack.some((unit) => unit.type === 'infantry' && unit.quantity === 1 && unit.owner === drafted.getOwner(name));
}));
const firstLand = drafted.getPlayerTerritories(drafted.currentPlayer.id)
  .find((name) => !drafted.territoryByName[name]?.isWater);
check('capital placement still accepts an owned land', drafted.placeCapital(firstLand) === true);

{
  const random = mulberry32(0x0a11);
  Math.random = random;
  let loaded;
  try {
    const gs = boot(null);
    const old = gs.toJSON();
    delete old.gameOptions;
    delete old.draft;
    delete old.minClientVersion;
    check('a random deal save has no draft field', old.draft == null && old.phase === GAME_PHASES.CAPITAL_PLACEMENT);
    loaded = new GameState(setup, territories, continents);
    loaded.loadFromJSON(old);
  } finally {
    Math.random = prev;
  }
  check('old save loads without a draft', !loaded.draft);
  check('old save keeps random deal and dice tokens',
    loaded.gameOptions.territorySetup === 'random' && loaded.gameOptions.techAcquisition === 'dice');
  check('old save is still in capital placement', loaded.phase === GAME_PHASES.CAPITAL_PLACEMENT);
  const land = loaded.getPlayerTerritories(loaded.currentPlayer.id)
    .find((name) => !loaded.territoryByName[name]?.isWater);
  check('old save can place a capital', loaded.placeCapital(land) === true);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll territory draft checks passed');
