// Expanded tech adds Radio Deception Networks. Classic stays today's list.
// Run: node tools/test-radio-deception.mjs

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
const { GameState, TECHNOLOGIES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const {
  describe,
  isStandardRules,
  normalizeGameOptions,
  restoreProtectedGameOptions,
} = await import(pathToFileURL(join(root, 'src/gameOptions.js')));
const { renderGameOptionsPanel } = await import(pathToFileURL(join(root, 'src/ui/gameOptionsPanel.js')));
const {
  presentTerritoryUnits,
  sweepRadioDeception,
} = await import(pathToFileURL(join(root, 'src/state/radioDeception.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

function qty(view, type, tone = null) {
  return (view?.units || [])
    .filter((unit) => unit.type === type && (unit.deceptionTone || null) === tone)
    .reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
}

function board() {
  const gs = new GameState(
    { risk: { factions: [] } },
    [
      { name: 'France', isWater: false },
      { name: 'Germany', isWater: false },
      { name: 'North Sea', isWater: true },
    ],
    [],
  );
  gs.players = [
    { id: 'Germans', name: 'Germany', alliance: 'Axis' },
    { id: 'British', name: 'UK', alliance: 'Allies' },
    { id: 'Russians', name: 'Russia', alliance: 'Allies' },
    { id: 'Italians', name: 'Italy', alliance: 'Axis' },
  ];
  gs.alliancesEnabled = true;
  gs.currentPlayerIndex = 0;
  gs.phase = 'playing';
  gs.turnPhase = 'purchase';
  gs.territoryState = {
    France: { owner: 'Germans' },
    Germany: { owner: 'Germans' },
    'North Sea': { owner: null },
  };
  gs.units = {
    France: [
      { type: 'infantry', quantity: 4, owner: 'Germans' },
      { type: 'armour', quantity: 1, owner: 'Germans' },
    ],
  };
  gs.playerState = { Germans: { ipcs: 40 } };
  gs.playerTechs = { Germans: { techTokens: 0, unlockedTechs: [] } };
  gs.gameOptions = normalizeGameOptions({ techSet: 'expanded' });
  return gs;
}

console.log('=== stamp ===');
{
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  check('display stamp is V2.81.57-unified.53', GAME_VERSION === 'V2.81.57-unified.53');
  check('schema stays 11', SCHEMA_VERSION === 11);
  check('index.html carries the display stamp',
    html.includes('content="V2.81.57-unified.53"')
    && html.includes("window.__TR_GAME_VERSION = 'V2.81.57-unified.53'")
    && html.includes("var LOCKED = 'V2.81.57-unified.53'")
    && html.includes('style.css?v=V2.81.57-unified.53')
    && html.includes('src/main.js?v=V2.81.57-unified.53'));
}

console.log('=== lobby ===');
{
  check('default tech is classic', normalizeGameOptions(null).techSet === 'classic');
  check('a missing field stays classic', normalizeGameOptions({ garrisons: true }).techSet === 'classic');
  check('expanded is kept', normalizeGameOptions({ techSet: 'expanded' }).techSet === 'expanded');
  check('an unknown value stays classic', normalizeGameOptions({ techSet: 'future' }).techSet === 'classic');
  check('classic is still standard rules', isStandardRules(null) === true && describe(null) === 'Standard rules');
  check('expanded is named and not standard',
    isStandardRules({ techSet: 'expanded' }) === false
    && describe({ techSet: 'expanded' }) === 'Custom: expanded tech');
  const html = renderGameOptionsPanel(null);
  check('lobby offers classic and expanded',
    html.includes('data-go="techSet"')
    && html.includes('value="classic"')
    && html.includes('>Classic tech<')
    && html.includes('>Expanded tech<')
    && html.includes('selected'));
  const expanded = renderGameOptionsPanel({ techSet: 'expanded' });
  check('expanded is the selected lobby value',
    /data-go="techSet"[\s\S]*value="expanded"[^>]*selected/.test(expanded)
    || /value="expanded" selected/.test(expanded));
  const restored = restoreProtectedGameOptions(
    { gameOptions: { startingIPCs: 80 } },
    { techSet: 'expanded' },
  );
  check('a dropped tech tree is restored from the protected copy',
    restored.gameOptions.techSet === 'expanded');
}

console.log('=== research gating ===');
{
  const classicIds = Object.keys(TECHNOLOGIES);
  check('classic catalog has no radio deception', !classicIds.includes('radioDeception'));
  const classic = board();
  classic.gameOptions = normalizeGameOptions(null);
  check('classic research list is unchanged',
    JSON.stringify(classic.getAvailableTechs('Germans')) === JSON.stringify(classicIds));
  check('classic cannot unlock radio deception', classic.unlockTech('Germans', 'radioDeception') === false);
  classic.gameOptions = normalizeGameOptions({ techSet: 'expanded', techAcquisition: 'buy' });
  classic.phase = 'playing';
  classic.turnPhase = 'purchase';
  const expandedIds = classic.getAvailableTechs('Germans');
  check('expanded adds radio deception and keeps the classic list',
    expandedIds.includes('radioDeception')
    && classicIds.every((id) => expandedIds.includes(id))
    && expandedIds.length === classicIds.length + 1);
  check('expanded can research it', classic.unlockTech('Germans', 'radioDeception') === true);
  check('it is not offered twice', !classic.getAvailableTechs('Germans').includes('radioDeception'));
  const buyer = board();
  buyer.gameOptions = normalizeGameOptions({ techSet: 'classic', techAcquisition: 'buy' });
  check('buy mode on classic refuses it', buyer.buyTech('Germans', 'radioDeception') === false);
  buyer.gameOptions = normalizeGameOptions({ techSet: 'expanded', techAcquisition: 'buy' });
  check('buy mode on expanded sells it', buyer.buyTech('Germans', 'radioDeception') === true);
}

console.log('=== place, toggle, loss, visibility ===');
{
  const gs = board();
  gs.playerTechs.Germans.unlockedTechs = ['radioDeception'];
  const before = JSON.stringify(gs.units.France);

  check('unresearched classic placement is refused', (() => {
    const quiet = board();
    quiet.gameOptions = normalizeGameOptions(null);
    quiet.playerTechs.Germans.unlockedTechs = ['radioDeception'];
    return quiet.placeRadioDeception('France', 'obfuscate', [
      { type: 'infantry', owner: 'Germans', quantity: 2 },
    ]).success === false;
  })());

  check('more than two units is refused',
    gs.placeRadioDeception('France', 'obfuscate', [
      { type: 'infantry', owner: 'Germans', quantity: 3 },
    ]).success === false);
  check('another power\'s land is refused', (() => {
    gs.territoryState.Germany.owner = 'British';
    const refused = gs.placeRadioDeception('Germany', 'illusion', [
      { type: 'infantry', quantity: 1 },
    ]).success === false;
    gs.territoryState.Germany.owner = 'Germans';
    return refused;
  })());
  check('sea zones are refused',
    gs.placeRadioDeception('North Sea', 'illusion', [{ type: 'infantry', quantity: 1 }]).success === false);

  const hidden = gs.placeRadioDeception('France', 'obfuscate', [
    { type: 'infantry', owner: 'Germans', quantity: 2 },
  ]);
  check('obfuscate places on the controlled land', hidden.success === true);
  check('obfuscate does not remove the real units', JSON.stringify(gs.units.France) === before);

  const ownerView = presentTerritoryUnits(gs, 'France', gs.units.France, 'Germans');
  const allyView = presentTerritoryUnits(gs, 'France', gs.units.France, 'Italians');
  const enemyView = presentTerritoryUnits(gs, 'France', gs.units.France, 'Russians');
  check('owner sees the hidden infantry in grey, apart from the rest',
    qty(ownerView, 'infantry', null) === 2
    && qty(ownerView, 'infantry', 'hidden') === 2
    && ownerView.showMark === true);
  check('an ally sees the same grey split',
    qty(allyView, 'infantry', null) === 2
    && qty(allyView, 'infantry', 'hidden') === 2
    && allyView.showMark === true);
  check('an enemy does not see the hidden infantry or the mark',
    qty(enemyView, 'infantry', null) === 2
    && qty(enemyView, 'infantry', 'hidden') === 0
    && enemyView.showMark === false
    && qty(enemyView, 'armour', null) === 1);

  gs.isMultiplayer = true;
  gs.localSeatId = 'Russians';
  const seated = presentTerritoryUnits(gs, 'France', gs.units.France);
  check('a multiplayer enemy seat keeps the fog while Germany is the current player',
    qty(seated, 'infantry', null) === 2 && seated.showMark === false);
  gs.localSeatId = 'Germans';
  const seatedOwner = presentTerritoryUnits(gs, 'France', gs.units.France);
  check('the owning seat still sees the grey split',
    qty(seatedOwner, 'infantry', 'hidden') === 2 && seatedOwner.showMark === true);
  gs.isMultiplayer = false;
  gs.localSeatId = null;

  const moved = gs.placeRadioDeception('Germany', 'illusion', [
    { type: 'armour', quantity: 1 },
    { type: 'artillery', quantity: 1 },
  ]);
  check('a new placement replaces the old one', moved.success === true);
  const franceAfter = presentTerritoryUnits(gs, 'France', gs.units.France, 'Russians');
  check('the first territory is no longer deceived',
    qty(franceAfter, 'infantry', null) === 4 && franceAfter.showMark === false);
  check('illusions are not added to the real unit list',
    !gs.units.Germany && JSON.stringify(gs.units.France) === before);

  const ownerIllusion = presentTerritoryUnits(gs, 'Germany', [], 'Germans');
  const enemyIllusion = presentTerritoryUnits(gs, 'Germany', [], 'Russians');
  check('owner sees illusions in grey and apart from real units',
    qty(ownerIllusion, 'armour', 'illusion') === 1
    && qty(ownerIllusion, 'artillery', 'illusion') === 1
    && qty(ownerIllusion, 'armour', null) === 0
    && ownerIllusion.showMark === true);
  check('enemies see illusions as ordinary units',
    qty(enemyIllusion, 'armour', null) === 1
    && qty(enemyIllusion, 'artillery', null) === 1
    && qty(enemyIllusion, 'armour', 'illusion') === 0
    && enemyIllusion.showMark === false);

  const stacked = board();
  stacked.playerTechs.Germans.unlockedTechs = ['radioDeception'];
  stacked.placeRadioDeception('France', 'illusion', [{ type: 'armour', quantity: 2 }]);
  const enemyStack = presentTerritoryUnits(stacked, 'France', stacked.units.France, 'Russians');
  const ownerStack = presentTerritoryUnits(stacked, 'France', stacked.units.France, 'Germans');
  check('enemies add illusions onto the real stack',
    qty(enemyStack, 'armour', null) === 3 && qty(enemyStack, 'armour', 'illusion') === 0);
  check('the owner does not stack illusions with the real tanks',
    qty(ownerStack, 'armour', null) === 1 && qty(ownerStack, 'armour', 'illusion') === 2);

  const cleared = gs.clearRadioDeception('Germans');
  check('turn off removes the placement', cleared.success === true && !gs.radioDeception.Germans);
  const quiet = presentTerritoryUnits(gs, 'Germany', [], 'Russians');
  check('enemies no longer see the illusions', qty(quiet, 'armour', null) === 0 && quiet.showMark === false);

  gs.placeRadioDeception('France', 'obfuscate', [
    { type: 'infantry', owner: 'Germans', quantity: 1 },
  ]);
  gs.territoryState.France.owner = 'British';
  sweepRadioDeception(gs);
  check('losing the territory clears the placement', !gs.radioDeception.Germans);
  gs.territoryState.France.owner = 'Germans';
  const returned = presentTerritoryUnits(gs, 'France', gs.units.France, 'Russians');
  check('taking the territory back does not restore the deception',
    qty(returned, 'infantry', null) === 4 && returned.showMark === false);

  const saved = board();
  saved.playerTechs.Germans.unlockedTechs = ['radioDeception'];
  saved.placeRadioDeception('France', 'illusion', [{ type: 'infantry', quantity: 2 }]);
  const json = saved.toJSON();
  check('the save stays schema 11 and keeps the placement',
    json.version === 11 && json.radioDeception.Germans.territory === 'France');
  const copy = board();
  copy.loadFromJSON(json);
  const peer = presentTerritoryUnits(copy, 'France', copy.units.France, 'Russians');
  const peerOwner = presentTerritoryUnits(copy, 'France', copy.units.France, 'Germans');
  check('a loaded client agrees on enemy and owner views',
    qty(peer, 'infantry', null) === 6
    && qty(peerOwner, 'infantry', 'illusion') === 2
    && qty(peerOwner, 'infantry', null) === 4);
  const bare = board();
  const bareJson = bare.toJSON();
  check('an empty placement is omitted', bareJson.radioDeception === undefined && bareJson.version === 11);
  delete json.radioDeception;
  json.gameOptions = { ...json.gameOptions };
  delete json.gameOptions.techSet;
  const old = board();
  old.loadFromJSON(json);
  check('an old save without the fields loads classic and empty',
    old.gameOptions.techSet === 'classic' && Object.keys(old.radioDeception).length === 0);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nRadio deception checks passed');
