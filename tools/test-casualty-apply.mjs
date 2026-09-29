// unified.21 — East Canada casualty picks match the next round and the save.
// A transport is not a legal pick while another unit is in the battle.
// Run: node tools/test-casualty-apply.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.localStorage ??= {
  getItem() { return null; },
  setItem() {},
  removeItem() {},
};

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
        names.forEach((n) => classSet.add(n));
        el.className = [...classSet].join(' ');
      },
      remove(...names) {
        names.forEach((n) => classSet.delete(n));
        el.className = [...classSet].join(' ');
      },
      contains(name) { return classSet.has(name); },
      toggle(name, force) {
        if (force === undefined) {
          if (classSet.has(name)) this.remove(name);
          else this.add(name);
        } else if (force) this.add(name);
        else this.remove(name);
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

globalThis.document = {
  documentElement: makeEl(),
  body: makeEl(),
  createElement() { return makeEl(); },
  getElementById() { return null; },
};

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')));
const { livingForcePicture } = await import(pathToFileURL(join(root, 'src/state/combatUnits.js')));
const { bindGameEventLog, unbindGameEventLog } = await import(pathToFileURL(join(root, 'src/multiplayer/gameEventLog.js')));

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures++;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else {
    console.log('ok  :', label);
  }
};

function picture(units, owner) {
  const rows = (units || []).filter((unit) => !owner || unit.owner === owner);
  return JSON.stringify(livingForcePicture(rows));
}

function makeSeaGame() {
  const T = (name, isWater, connections) => ({ name, isWater, connections, ipc: isWater ? 0 : 3 });
  const east = 'East Canada Sea Zone';
  const west = 'West Spain Sea Zone';
  const gs = new GameState({ risk: { factions: [] } }, [
    T(east, true, [west, 'East Canada']),
    T(west, true, [east]),
    T('East Canada', false, [east]),
    T('Russia', false, []),
  ], []);
  gs.players = [
    { id: 'Americans', name: 'Bastion', color: '#1a4' },
    { id: 'Japanese', name: 'Robert007', color: '#c33', isAI: false },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.territoryState = {
    'East Canada': { owner: 'Americans' },
  };
  gs.playerState = {
    Americans: { ipcs: 30, capitalTerritory: 'East Canada' },
    Japanese: { ipcs: 30, capitalTerritory: 'Japan' },
  };
  gs.playerTechs = {
    Americans: { techTokens: 0, unlockedTechs: [] },
    Japanese: { techTokens: 0, unlockedTechs: [] },
  };
  gs.unitDefs = unitDefs;
  gs._unitDefs = unitDefs;
  gs._notify = () => {};
  gs.autoSave = () => {};
  return gs;
}

function makeUI(gs) {
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  return ui;
}

console.log('=== East Canada: report, next round, and save match ===');
{
  const zone = 'East Canada Sea Zone';
  const gs = makeSeaGame();
  const americans = [
    { type: 'carrier', id: 'carrier_us', quantity: 1, owner: 'Americans', aircraft: [] },
    { type: 'transport', id: 'transport_us', quantity: 1, owner: 'Americans', cargo: [], aircraft: [] },
    { type: 'cruiser', quantity: 1, owner: 'Americans' },
    { type: 'submarine', quantity: 1, owner: 'Americans' },
    { type: 'destroyer', quantity: 1, owner: 'Americans' },
    { type: 'battleship', quantity: 1, owner: 'Americans' },
    { type: 'bomber', quantity: 1, owner: 'Americans' },
    { type: 'fighter', quantity: 2, owner: 'Americans' },
  ];
  const japanese = [
    { type: 'carrier', id: 'carrier_2', quantity: 1, owner: 'Japanese', aircraft: [] },
    { type: 'carrier', id: 'carrier_3', quantity: 1, owner: 'Japanese', aircraft: [] },
    { type: 'transport', id: 'transport_1', quantity: 1, owner: 'Japanese', cargo: [], aircraft: [] },
    { type: 'battleship', quantity: 1, owner: 'Japanese' },
    { type: 'cruiser', quantity: 1, owner: 'Japanese' },
    { type: 'destroyer', quantity: 2, owner: 'Japanese' },
    { type: 'submarine', quantity: 1, owner: 'Japanese' },
    { type: 'fighter', quantity: 4, owner: 'Japanese' },
  ];
  gs.units[zone] = [...americans, ...japanese];
  gs.combatQueue = [zone];
  gs.moveHistory = [{ from: 'West Spain Sea Zone', to: zone, player: 'Americans' }];

  // 9 attack dice / 6 hits, then 12 defense dice / 7 hits.
  // The Japanese transport is the need-0 roll.
  const faces = [
    6, 1, 1, 1, 1, 1, 1, 1, 6,
    1, 6, 1, 1, 1, 1, 6, 1, 1, 1, 6, 6,
  ];
  let die = 0;
  gs._rollDie = () => faces[die++] ?? 6;

  const ui = makeUI(gs);
  ui.currentTerritory = zone;
  ui._initCombatState();
  const rolled = ui._rollDice();
  check('attack rolled 9 dice and 6 hits', rolled.attackHits === 6 && ui.lastRolls.attackRolls.length === 9, rolled);
  check('defense rolled 12 dice and 7 hits', rolled.defenseHits === 7 && ui.lastRolls.defenseRolls.length === 12, rolled);
  check('a transport rolled at need 0', ui.lastRolls.defenseRolls.some((roll) => roll.unitType === 'transport' && roll.defenseValue === 0));

  ui.combatState.pendingDefenderCasualties = rolled.attackHits;
  ui.combatState.pendingAttackerCasualties = rolled.defenseHits;
  ui.combatState.phase = 'selectCasualties';
  ui._autoSelectCasualties();

  const defenderDefault = { ...ui.combatState.selectedDefenderCasualties };
  check('defender default damages the battleship', defenderDefault.battleship_damage === 1, defenderDefault);
  check('defender default does not take a carrier', !defenderDefault.carrier, defenderDefault);

  const held = { ...ui.combatState.selectedAttackerCasualties };
  check('the default pick does not take the transport', !held.transport, held);
  check('a combat unit is holding a hit',
    Object.entries(held).some(([type, count]) => type !== 'transport' && count > 0), held);
  ui._adjustCasualty('attacker', 'transport', 1);
  check('the transport pick is refused', !ui.combatState.selectedAttackerCasualties.transport, ui.combatState.selectedAttackerCasualties);
  check('the hit stays on a combat unit',
    JSON.stringify(ui.combatState.selectedAttackerCasualties) === JSON.stringify(held));
  ui._autoSelectCasualties();
  check('a later auto-pick still skips the transport', !ui.combatState.selectedAttackerCasualties.transport);
  check('defender default survived the second auto-pick',
    JSON.stringify(ui.combatState.selectedDefenderCasualties) === JSON.stringify(defenderDefault));

  const reportAttack = picture(
    ui._unitsAfterCasualtyPick(ui.combatState.attackers, ui.combatState.selectedAttackerCasualties),
    'Americans',
  );
  const reportDefense = picture(
    ui._unitsAfterCasualtyPick(ui.combatState.defenders, ui.combatState.selectedDefenderCasualties),
    'Japanese',
  );
  const leftLine = ui._leftWithLine(ui.combatState.defenders, ui.combatState.selectedDefenderCasualties);
  check('casualty report names the damaged battleship', leftLine.includes('1 damaged'));
  check('casualty report keeps both Japanese carriers', leftLine.includes('2x Carrier'));

  ui._applyCasualties();
  const nextAttack = picture(ui.combatState.attackers, 'Americans');
  const nextDefense = picture(ui.combatState.defenders, 'Japanese');
  const savedAttack = picture(gs.units[zone], 'Americans');
  const savedDefense = picture(gs.units[zone], 'Japanese');
  check('attacker report matches the next round', reportAttack === nextAttack, { reportAttack, nextAttack });
  check('attacker next round matches the save', nextAttack === savedAttack, { nextAttack, savedAttack });
  check('defender report matches the next round', reportDefense === nextDefense, { reportDefense, nextDefense });
  check('defender next round matches the save', nextDefense === savedDefense, { nextDefense, savedDefense });
  check('saved Japanese battleship is damaged',
    (gs.units[zone] || []).some((unit) => unit.owner === 'Japanese' && unit.type === 'battleship' && unit.damaged && unit.damagedCount === 1));
  check('both Japanese carrier stacks are still on the board',
    ['carrier_2', 'carrier_3'].every((id) => (gs.units[zone] || []).some((unit) => unit.id === id && unit.quantity === 1)));
  check('the American transport survives',
    (gs.units[zone] || []).some((unit) => unit.owner === 'Americans' && unit.type === 'transport' && (unit.quantity || 0) > 0));
  check('round-2 list shows the damage mark', (ui.el.innerHTML || '').includes('combat-damage-mark'));
  check('round-2 list shows 2 Japanese carriers', (ui.el.innerHTML || '').includes('>2<'));

  const casualtyLog = (gs.combatTelemetry || []).filter((entry) => entry.step === 'casualties');
  check('chosen casualties are logged without the transport',
    casualtyLog.some((entry) => {
      const rows = entry.casualties?.attacker || [];
      return rows.some((row) => row.quantity > 0 && row.type !== 'transport')
        && !rows.some((row) => row.type === 'transport' && row.quantity > 0);
    }),
    casualtyLog);

  const roundLog = (gs.combatTelemetry || []).filter((entry) => entry.step === 'round');
  const attackQty = (roundLog[0]?.attackForce || []).reduce((sum, row) => sum + row.quantity, 0);
  const defenseQty = (roundLog[0]?.defenseForce || []).reduce((sum, row) => sum + row.quantity, 0);
  check('human round log is the pre-roll force', attackQty === 9 && defenseQty === 12, roundLog[0]);
}

console.log('=== A hit carrier keeps the other carrier\'s fighters ===');
{
  const zone = 'East Canada Sea Zone';
  const gs = makeSeaGame();
  gs.units[zone] = [
    { type: 'cruiser', quantity: 1, owner: 'Americans' },
    { type: 'carrier', id: 'carrier_hold', quantity: 1, owner: 'Japanese', aircraft: [{ type: 'fighter', owner: 'Japanese' }] },
    { type: 'carrier', id: 'carrier_safe', quantity: 1, owner: 'Japanese', aircraft: [{ type: 'fighter', owner: 'Japanese' }] },
  ];
  gs.combatQueue = [zone];
  const ui = makeUI(gs);
  ui.currentTerritory = zone;
  ui._initCombatState();
  ui.combatState.attackers = [{ type: 'cruiser', quantity: 1, owner: 'Americans' }];
  ui.combatState.defenders = [
    { type: 'carrier', id: 'carrier_hold', quantity: 1, owner: 'Japanese', aircraft: [{ type: 'fighter', owner: 'Japanese' }] },
    { type: 'carrier', id: 'carrier_safe', quantity: 1, owner: 'Japanese', aircraft: [{ type: 'fighter', owner: 'Japanese' }] },
  ];
  ui.combatState.pendingAttackerCasualties = 0;
  ui.combatState.pendingDefenderCasualties = 1;
  ui.combatState.selectedAttackerCasualties = {};
  ui.combatState.selectedDefenderCasualties = { carrier: 1 };
  ui.combatState.defenderPicksTouched = true;
  ui.combatState.phase = 'selectCasualties';
  const preview = picture(ui._unitsAfterCasualtyPick(ui.combatState.defenders, { carrier: 1 }), 'Japanese');
  ui._applyCasualties();
  const saved = (gs.units[zone] || []).filter((unit) => unit.owner === 'Japanese');
  const safe = saved.find((unit) => unit.id === 'carrier_safe');
  check('the loaded carrier is the one removed', !saved.some((unit) => unit.id === 'carrier_hold'));
  check('the other carrier still holds its fighter', safe && safe.quantity === 1 && (safe.aircraft || []).length === 1);
  check('carrier preview matches the save', preview === picture(saved, 'Japanese'), { preview, saved: picture(saved, 'Japanese') });
  check('the sunk fighter is a loss, not a ghost stack',
    (ui.combatState.totalDefenderLosses.fighter || 0) === 1
    && !saved.some((unit) => unit.type === 'fighter'));
}

console.log('=== Naval retreat keeps the bomber and logs real quantities ===');
{
  const events = [];
  bindGameEventLog({ log(kind, fields) { events.push({ kind, fields }); } });
  const gs = makeSeaGame();
  const east = 'East Canada Sea Zone';
  const west = 'West Spain Sea Zone';
  gs.units[east] = [
    { type: 'transport', id: 'transport_us', quantity: 1, owner: 'Americans', cargo: [] },
    { type: 'battleship', quantity: 1, owner: 'Americans', damaged: true, damagedCount: 1 },
    { type: 'bomber', quantity: 1, owner: 'Americans' },
  ];
  gs.units[west] = [];
  gs.moveHistory = [{ from: west, to: east, player: 'Americans' }];
  gs.friendlyTerritoriesAtTurnStart = new Set(['East Canada']);
  const result = gs.retreatToTerritory(east, west);
  const retreat = events.find((event) => event.kind === 'retreat');
  const logged = retreat?.fields?.payload?.units || [];
  check('retreat succeeds', result.success === true, result);
  check('retreat log quantities are the real ones',
    logged.length === 3 && logged.every((unit) => unit.quantity === 1),
    logged);
  const arrived = (type) => (gs.units[west] || []).some((unit) => unit.type === type && unit.owner === 'Americans' && unit.quantity >= 1);
  check('transport and battleship arrived', arrived('transport') && arrived('battleship'));
  check('retreated battleship keeps its damage',
    (gs.units[west] || []).some((unit) => unit.type === 'battleship' && unit.damaged && unit.damagedCount === 1));
  check('the bomber is not deleted and does not follow the ships',
    (gs.units[east] || []).some((unit) => unit.type === 'bomber' && unit.quantity === 1)
    && !(gs.units[west] || []).some((unit) => unit.type === 'bomber'),
    gs.units);
  unbindGameEventLog();
}

console.log('=== AI telemetry logs pre-roll forces, surprise, and round 2 ===');
{
  const gs = makeSeaGame();
  const zone = 'East Canada Sea Zone';
  gs.units[zone] = [
    { type: 'submarine', quantity: 1, owner: 'Americans' },
    { type: 'cruiser', quantity: 1, owner: 'Japanese' },
  ];
  gs.combatQueue = [zone];
  let face = 0;
  const faces = [6, 6, 6, 6, 6, 6];
  gs._rollDie = () => faces[face++] ?? 6;
  const first = gs.resolveCombat(zone, unitDefs);
  const second = gs.resolveCombat(zone, unitDefs);
  const surprise = (gs.combatTelemetry || []).filter((entry) => entry.step === 'surprise');
  const rounds = (gs.combatTelemetry || []).filter((entry) => entry.step === 'round');
  check('surprise strike is its own entry', surprise.length === 1, surprise);
  check('surprise defense force is the pre-roll cruiser',
    surprise[0] && surprise[0].defenseForce.some((row) => row.type === 'cruiser' && row.quantity === 1)
    && !surprise[0].defenseForce.some((row) => row.quantity === 0),
    surprise[0]);
  check('both rounds are logged', rounds.length === 2 && rounds[0].roundIndex === 1 && rounds[1].roundIndex === 2, rounds.map((row) => row.roundIndex));
  check('round 1 defense force is still 1 cruiser, not the post-casualty board',
    rounds[0] && rounds[0].defenseForce.some((row) => row.type === 'cruiser' && row.quantity === 1));
  check('each round carries casualties for both sides',
    rounds.every((row) => row.casualties && Array.isArray(row.casualties.attacker) && Array.isArray(row.casualties.defender)));
  check('the battle was not resolved by the misses', first?.resolved === false && second?.resolved === false);
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall casualty checks passed');
