// V2.81.57-unified.20.2 — standard A&A sub/air rules, retreat landings, .19 fighter load.
// East US Sea Zone, game 6XQ7CN, 28 Sep 5:01pm PT. Run: node tools/test-sub-air-rules.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

globalThis.localStorage ??= { getItem() { return null; }, setItem() {}, removeItem() {} };
const mk = () => {
  const cs = new Set();
  return {
    id: '',
    className: '',
    innerHTML: '',
    style: {},
    children: [],
    classList: {
      add(...n) { n.forEach((x) => cs.add(x)); this.className = [...cs].join(' '); },
      remove(...n) { n.forEach((x) => cs.delete(x)); this.className = [...cs].join(' '); },
      contains(n) { return cs.has(n); },
      toggle(name, force) {
        if (force === undefined) {
          if (cs.has(name)) this.remove(name);
          else this.add(name);
        } else if (force) this.add(name);
        else this.remove(name);
        return cs.has(name);
      },
    },
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {},
    setAttribute() {},
    getAttribute() { return null; },
  };
};
globalThis.document = {
  documentElement: mk(),
  body: mk(),
  createElement() { return mk(); },
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  addEventListener() {},
};
globalThis.window ??= globalThis;

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')).href);
const { CombatUI } = await import(pathToFileURL(join(root, 'src/ui/combatUI.js')).href);
const { NO_LEGAL_AIR_LANDING_NOTE } = await import(pathToFileURL(join(root, 'src/state/combatUnits.js')).href);
const { returnToBaseAssignments } = await import(pathToFileURL(join(root, 'src/state/airLanding.js')).href);
const { listIllegalAir, destroyIllegalAir } = await import(pathToFileURL(join(root, 'src/state/ncmAirCheck.js')).href);
const { bindGameEventLog, unbindGameEventLog } = await import(pathToFileURL(join(root, 'src/multiplayer/gameEventLog.js')).href);
const unitDefs = JSON.parse(readFileSync(join(root, 'data/units.json'), 'utf8'));
const rulesText = readFileSync(join(root, 'src/ui/rulesPanel.js'), 'utf8');

let failures = 0;
const check = (label, cond, extra) => {
  if (!cond) {
    failures += 1;
    console.error('FAIL:', label, extra === undefined ? '' : extra);
  } else console.log('ok  :', label);
};

const EAST = 'East US Sea Zone';
const WEST = 'West Spain Sea Zone';
const CANADA = 'East Canada Sea Zone';
const UKRAINE = 'Ukraine';
const RUSSIA = 'Russia';
const J = 'Japanese';
const G = 'Germans';

const MAP = [
  { name: EAST, isWater: true, connections: [WEST, CANADA] },
  { name: WEST, isWater: true, connections: [EAST] },
  { name: CANADA, isWater: true, connections: [EAST] },
  { name: UKRAINE, isWater: false, connections: [RUSSIA] },
  { name: RUSSIA, isWater: false, connections: [UKRAINE] },
];

function makeState() {
  const gs = new GameState({ risk: { factions: [] } }, MAP, []);
  gs.players = [
    { id: J, name: 'Robert007' },
    { id: G, name: 'German Easy AI', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.playerState = { [J]: { ipcs: 0 }, [G]: { ipcs: 0 } };
  gs.units = { [EAST]: [], [WEST]: [], [CANADA]: [], [UKRAINE]: [], [RUSSIA]: [] };
  gs.territoryState = {
    [EAST]: { owner: null },
    [WEST]: { owner: null },
    [CANADA]: { owner: null },
    [UKRAINE]: { owner: G },
    [RUSSIA]: { owner: J },
  };
  gs._unitDefs = unitDefs;
  gs.unitDefs = unitDefs;
  gs.friendlyTerritoriesAtTurnStart = new Set([RUSSIA]);
  return gs;
}

function qty(gs, territory, type, owner) {
  return (gs.units[territory] || [])
    .filter((unit) => unit.type === type && (!owner || unit.owner === owner))
    .reduce((sum, unit) => sum + (Number(unit.quantity) || 0), 0);
}

function resolveScripted(gs, territory, units, rolls) {
  gs.units[territory] = units.map((unit) => ({ ...unit }));
  gs.combatQueue = [territory];
  gs._combatRoundsTracker = {};
  let used = 0;
  gs._rollDie = () => rolls[used++] ?? 6;
  const result = gs.resolveCombat(territory, unitDefs);
  return { result, used };
}

function openCombat(gs, territory, attackers, defenders) {
  gs.units[territory] = [...attackers, ...defenders].map((unit) => ({ ...unit }));
  gs.combatQueue = [territory];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.showNextCombat();
  return ui;
}

const fighter = (owner = J, quantity = 1) => ({ type: 'fighter', owner, quantity });
const bomber = (owner = J, quantity = 1) => ({ type: 'bomber', owner, quantity });
const sub = (owner = G, quantity = 1) => ({ type: 'submarine', owner, quantity });
const transport = (owner = G, quantity = 1) => ({ type: 'transport', owner, quantity, cargo: [] });
const destroyer = (owner = J) => ({ type: 'destroyer', owner, quantity: 1 });
const cruiser = (owner = J) => ({ type: 'cruiser', owner, quantity: 1 });

console.log('=== East US: fighter vs sub + transport ===');
{
  const gs = makeState();
  // Reported dice: fighter 2 vs 3 hits, sub 4 misses, then a later 1 that must not kill the fighter.
  const first = resolveScripted(gs, EAST, [fighter(), sub(), transport()], [2, 4, 6, 1]);
  check('the battle ends without spending the hit on the transport', first.result?.resolved === true && first.used === 0, {
    used: first.used, result: first.result,
  });
  check('the transport stays while the sub is still in the battle', qty(gs, EAST, 'transport') === 1 && qty(gs, EAST, 'fighter') === 1, {
    transport: qty(gs, EAST, 'transport'), fighter: qty(gs, EAST, 'fighter'),
  });
  check('the sub stays and the battle is submerged', qty(gs, EAST, 'submarine') === 1 && first.result?.submerged === true && first.result?.winner === 'submerged');
  let later = 0;
  gs._rollDie = () => { later += 1; return 1; };
  const second = gs.resolveCombat(EAST, unitDefs);
  check('a later resolve rolls nothing and keeps the fighter', later === 0 && second?.resolved === true && qty(gs, EAST, 'fighter') === 1 && qty(gs, EAST, 'submarine') === 1, {
    later, second, fighter: qty(gs, EAST, 'fighter'),
  });
}

console.log('=== air + destroyer can hit the sub ===');
{
  const gs = makeState();
  const first = resolveScripted(gs, EAST, [fighter(), destroyer(), sub()], [1, 6, 6]);
  check('air sinks the sub while a destroyer is in the battle', first.used === 3 && qty(gs, EAST, 'submarine') === 0 && qty(gs, EAST, 'fighter') === 1, {
    used: first.used, sub: qty(gs, EAST, 'submarine'), fighter: qty(gs, EAST, 'fighter'),
  });
}

console.log('=== sub vs air-only submerges with no hit ===');
{
  const gs = makeState();
  const first = resolveScripted(gs, EAST, [sub(J), fighter(G)], [1, 1]);
  check('a sub does not hit air and does not roll', first.used === 0 && first.result?.submerged === true, {
    used: first.used, result: first.result,
  });
  check('both the sub and the fighter stay', qty(gs, EAST, 'submarine') === 1 && qty(gs, EAST, 'fighter') === 1);
}

console.log('=== undefended transports are removed with no dice ===');
{
  const gs = makeState();
  const first = resolveScripted(gs, EAST, [fighter(), transport(G, 2)], [1, 1, 1]);
  check('two transports die without a roll', first.used === 0 && qty(gs, EAST, 'transport') === 0 && qty(gs, EAST, 'fighter') === 1, {
    used: first.used, transport: qty(gs, EAST, 'transport'),
  });
  check('the fighter wins the transport fight', first.result?.winner === 'attacker' && first.result?.resolved === true);
}

console.log('=== human opening: air versus sub and transport submerges ===');
{
  const gs = makeState();
  const ui = openCombat(gs, EAST, [fighter()], [sub(), transport()]);
  check('the transport is not a casualty while the sub is there',
    ui.combatState?.phase === 'resolved'
    && ui.combatState?.winner === 'submerged'
    && qty(gs, EAST, 'transport') === 1
    && qty(gs, EAST, 'submarine') === 1
    && qty(gs, EAST, 'fighter') === 1);
}

{
  const gs = makeState();
  const ui = openCombat(gs, EAST, [fighter(), cruiser()], [sub()]);
  let i = 0;
  const faces = [6, 6, 1];
  ui._rollD6 = () => faces[i++] ?? 6;
  const rolled = ui._rollDice();
  ui.combatState.pendingDefenderCasualties = rolled.attackHits;
  ui.combatState.pendingAttackerCasualties = rolled.defenseHits;
  ui.combatState.phase = 'selectCasualties';
  ui._autoSelectCasualties();
  check('a sub hit is assigned to the cruiser', ui.combatState.selectedAttackerCasualties.cruiser === 1, ui.combatState.selectedAttackerCasualties);
  ui._adjustCasualty('attacker', 'fighter', 1);
  check('manual plus cannot put the sub hit on the fighter', !ui.combatState.selectedAttackerCasualties.fighter);
}

console.log('=== human opening: transports alone vs a fighter ===');
{
  const gs = makeState();
  let rolls = 0;
  gs._rollDie = () => { rolls += 1; return 1; };
  const ui = openCombat(gs, EAST, [fighter()], [transport(G, 2)]);
  check('the combat screen destroys the transports before dice', rolls === 0 && qty(gs, EAST, 'transport') === 0 && qty(gs, EAST, 'fighter') === 1, {
    rolls, phase: ui.combatState?.phase, transport: qty(gs, EAST, 'transport'),
  });
}

console.log('=== retreat air: sea zone parks the bomber, carrier takes the fighter ===');
{
  const events = [];
  bindGameEventLog({ log(kind, fields) { events.push({ kind, fields }); } });
  const gs = makeState();
  gs.units[EAST] = [fighter(), bomber(), cruiser()];
  gs.units[WEST] = [{ type: 'carrier', id: 'carrier_2', owner: J, quantity: 1, aircraft: [] }];
  gs.moveHistory = [{ from: WEST, to: EAST, player: J }];
  const result = gs.retreatToTerritory(EAST, WEST);
  const retreat = events.find((event) => event.kind === 'retreat');
  const logged = retreat?.fields?.payload?.units || [];
  check('naval retreat succeeds', result.success === true, result);
  check('retreat log keeps real quantities', logged.length === 3 && logged.every((unit) => unit.quantity === 1), logged);
  const carrier = (gs.units[WEST] || []).find((unit) => unit.id === 'carrier_2');
  check('the fighter is not forced onto the retreat carrier', !(carrier?.aircraft || []).some((craft) => craft.type === 'fighter'));
  check('the fighter stays for its own landing', qty(gs, EAST, 'fighter') === 1);
  check('the cruiser retreated', qty(gs, WEST, 'cruiser') === 1);
  const parked = (gs.pendingAirLandings || []).flatMap((entry) => entry.units || []);
  check('the bomber is parked for the end of non-combat movement', parked.some((unit) => unit.type === 'bomber' && unit.quantity === 1 && unit.parked === true), parked);
  unbindGameEventLog();
}

console.log('=== retreat UI shows no legal landing instead of deleting the bomber ===');
{
  const gs = makeState();
  gs.units[EAST] = [bomber(), cruiser(), { type: 'cruiser', owner: G, quantity: 1 }];
  gs.units[WEST] = [];
  gs.moveHistory = [{ from: WEST, to: EAST, player: J }];
  gs.combatQueue = [EAST];
  const ui = new CombatUI();
  ui.setGameState(gs);
  ui.setUnitDefs(unitDefs);
  ui.showNextCombat();
  ui._executeRetreat(WEST);
  check('retreat UI names the missing landing', (ui.el?.innerHTML || '').includes(NO_LEGAL_AIR_LANDING_NOTE), ui.combatState?.phase);
  const before = (gs.pendingAirLandings || []).flatMap((entry) => entry.units || []);
  check('the bomber is parked before confirm', before.some((unit) => unit.type === 'bomber' && unit.quantity === 1));
  ui._confirmAirLandings();
  const after = (gs.pendingAirLandings || []).flatMap((entry) => entry.units || []);
  const onBoard = Object.values(gs.units).flat().some((unit) => unit.type === 'bomber' && (unit.quantity || 0) > 0);
  check('confirm does not delete the parked bomber or put it at sea', after.some((unit) => unit.type === 'bomber' && unit.quantity === 1) && !onBoard, {
    after, units: gs.units,
  });
}

console.log('=== land retreat Ukraine to Russia keeps the bomber and the fighter ===');
{
  const events = [];
  bindGameEventLog({ log(kind, fields) { events.push({ kind, fields }); } });
  const gs = makeState();
  gs.units[UKRAINE] = [bomber(), fighter()];
  gs.units[RUSSIA] = [];
  gs.moveHistory = [{ from: RUSSIA, to: UKRAINE, player: J }];
  const result = gs.retreatToTerritory(UKRAINE, RUSSIA);
  const retreat = events.find((event) => event.kind === 'retreat');
  const logged = retreat?.fields?.payload?.units || [];
  check('land retreat succeeds', result.success === true, result);
  check('land retreat log quantities are 1', logged.length === 2 && logged.every((unit) => unit.quantity === 1), logged);
  check('aircraft are not sent with the land retreat', qty(gs, RUSSIA, 'bomber') === 0 && qty(gs, RUSSIA, 'fighter') === 0);
  check('they stay over the battle for their own landing', qty(gs, UKRAINE, 'bomber') === 1 && qty(gs, UKRAINE, 'fighter') === 1 && !(gs.pendingAirLandings || []).length);
  unbindGameEventLog();
}

console.log('=== return to base does not send a bomber to a sea zone ===');
{
  const seaOnly = returnToBaseAssignments(
    [{ type: 'bomber', quantity: 1, landingOptions: [{ territory: WEST, isCarrier: true, distance: 1 }] }],
    { bomber: { origin: WEST } },
  );
  check('a bomber origin at sea stays unresolved', seaOnly.unresolved.length === 1 && !seaOnly.selections.bomber_0 && !Object.values(seaOnly.selections).includes(WEST), seaOnly);
  const land = returnToBaseAssignments(
    [{ type: 'bomber', quantity: 1, landingOptions: [{ territory: RUSSIA, isCarrier: false, distance: 1 }] }],
    { bomber: { origin: RUSSIA } },
  );
  check('a bomber origin on friendly land is assigned', land.selections.bomber_0 === RUSSIA && land.unresolved.length === 0, land);
  const carrier = returnToBaseAssignments(
    [{ type: 'fighter', quantity: 1, landingOptions: [{ territory: CANADA, isCarrier: true, distance: 0 }] }],
    { fighter: { origin: CANADA } },
  );
  check('a fighter may return to a carrier', carrier.selections.fighter_0 === CANADA, carrier);
}

console.log('=== .19 loose fighters over carriers survive load and the NCM check ===');
{
  const gs = makeState();
  gs.turnPhase = TURN_PHASES.NON_COMBAT_MOVE;
  gs.units[CANADA] = [
    { type: 'fighter', owner: J, quantity: 2 },
    { type: 'carrier', id: 'carrier_2', owner: J, quantity: 1, aircraft: [] },
    { type: 'carrier', id: 'carrier_3', owner: J, quantity: 1, aircraft: [] },
  ];
  const saved = gs.toJSON();
  saved.clientVersion = 'V2.82-unified.19';
  for (const unit of saved.units[CANADA]) {
    if (unit.type === 'carrier') delete unit.aircraft;
  }
  const loaded = new GameState({ risk: { factions: [] } }, MAP, []);
  loaded.loadFromJSON(JSON.parse(JSON.stringify(saved)));
  loaded._unitDefs = unitDefs;
  check('loading the .19 save keeps both loose fighters', qty(loaded, CANADA, 'fighter', J) === 2, loaded.units[CANADA]);
  const carriers = (loaded.units[CANADA] || []).filter((unit) => unit.type === 'carrier');
  check('both carriers are still there', carriers.length === 2 && carriers.every((unit) => unit.id === 'carrier_2' || unit.id === 'carrier_3'));
  const flagged = listIllegalAir(loaded, unitDefs, J);
  check('the NCM check does not flag fighters that fit on those carriers', !flagged.some((row) => row.type === 'fighter'), flagged);
  const removed = destroyIllegalAir(loaded, unitDefs, J);
  check('the NCM check does not destroy those fighters', !removed.some((row) => row.type === 'fighter') && qty(loaded, CANADA, 'fighter', J) === 2, {
    removed, fighter: qty(loaded, CANADA, 'fighter', J),
  });
}

{
  const gs = makeState();
  gs.units[CANADA] = [
    { type: 'fighter', owner: J, quantity: 5 },
    { type: 'bomber', owner: J, quantity: 1 },
    { type: 'carrier', id: 'carrier_2', owner: J, quantity: 1, aircraft: [] },
    { type: 'carrier', id: 'carrier_3', owner: J, quantity: 1, aircraft: [] },
  ];
  const flagged = listIllegalAir(gs, unitDefs, J);
  const fighterDrop = flagged.find((row) => row.type === 'fighter')?.quantity || 0;
  const bomberDrop = flagged.find((row) => row.type === 'bomber')?.quantity || 0;
  check('only the fighter past carrier room is flagged', fighterDrop === 1, flagged);
  check('a bomber does not use carrier room', bomberDrop === 1, flagged);
  destroyIllegalAir(gs, unitDefs, J);
  check('destroy leaves the four fighters the carriers can hold', qty(gs, CANADA, 'fighter', J) === 4 && qty(gs, CANADA, 'bomber', J) === 0);
}

{
  const gs = makeState();
  gs.units[CANADA] = [{ type: 'fighter', owner: J, quantity: 2 }];
  const removed = destroyIllegalAir(gs, unitDefs, J);
  check('fighters with no carrier are still destroyed', removed.some((row) => row.type === 'fighter' && row.quantity === 2) && qty(gs, CANADA, 'fighter') === 0);
}

console.log('=== rules panel states the adopted sub, air, and transport rules ===');
{
  check('subs cannot hit aircraft', rulesText.includes('Cannot hit aircraft'));
  check('aircraft need a destroyer to hit subs', rulesText.includes('Aircraft cannot hit a submarine unless that side has a destroyer'));
  check('air versus subs ends the battle', rulesText.includes('the submarines submerge and the battle ends'));
  check('undefended transports are automatic', rulesText.includes('Destroyed automatically when it is the only unit and the enemy can hit it'));
  check('retreat air is not sent to sea', rulesText.includes('If no legal landing exists, the aircraft stays for the end of non-combat movement'));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nsub/air rule checks passed');
