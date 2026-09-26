// Rob 4:01pm: 2 inf loaded from South Europe, transport sails to East Med, then no amphibious assault into Syria Jordan.
import { imp, unitDefs } from './_env.mjs';
const { GameState, GAME_PHASES, TURN_PHASES } = await imp('src/state/gameState.js');
const { PlayerPanel } = await imp('src/ui/playerPanel.js');
const T = (name, isWater, connections) => ({ name, isWater, connections });
const terr = [
  T('South Europe', false, ['Central Mediterranean Sea Zone']),
  T('Central Mediterranean Sea Zone', true, ['South Europe', 'East Mediterranean Sea Zone']),
  T('East Mediterranean Sea Zone', true, ['Central Mediterranean Sea Zone', 'Syria Jordan']),
  T('Syria Jordan', false, ['East Mediterranean Sea Zone']),
];
const gs = new GameState({ risk: { factions: [] } }, terr, []);
gs.players = [{ id: 'Germans', name: 'Robert007' }, { id: 'British', name: 'Easy Bot', isAI: true }];
gs.currentPlayerIndex = 0; gs.phase = GAME_PHASES.PLAYING; gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
gs.territoryState = { 'South Europe': { owner: 'Germans' }, 'Syria Jordan': { owner: 'British' } };
gs.playerState = { Germans: { ipcs: 0 }, British: { ipcs: 0 } };
gs.friendlyTerritoriesAtTurnStart = new Set(['South Europe']);
gs.units = { 'South Europe': [{ type: 'infantry', quantity: 2, owner: 'Germans' }], 'East Mediterranean Sea Zone': [{ type: 'transport', quantity: 1, owner: 'Germans' }], 'Syria Jordan': [{ type: 'infantry', quantity: 1, owner: 'British' }] };
const out = gs.moveUnits('East Mediterranean Sea Zone', 'Central Mediterranean Sea Zone', [{ type: 'transport', quantity: 1 }], unitDefs);
console.log('sail out (hop 1):', out.success, out.error || '');
const load = gs.moveUnits('South Europe', 'Central Mediterranean Sea Zone', [{ type: 'infantry', quantity: 2 }], unitDefs);
const tr = gs.units['Central Mediterranean Sea Zone'].find((u) => u.type === 'transport');
console.log('load:', load.success, 'transport', JSON.stringify(tr));
const sail = gs.moveUnits('Central Mediterranean Sea Zone', 'East Mediterranean Sea Zone', [], unitDefs, { shipIds: [tr.id] });
console.log('sail:', sail.success, sail.error || '', JSON.stringify(gs.units['East Mediterranean Sea Zone']));
const pp = Object.create(PlayerPanel.prototype); pp.gameState = gs; pp.unitDefs = unitDefs;
const movable = pp._getMovableUnits({ name: 'East Mediterranean Sea Zone', isWater: true }, gs.currentPlayer);
console.log('movable in East Med:', JSON.stringify(movable.map((m) => m.cargoKey || m.type)));
const t2 = gs.units['East Mediterranean Sea Zone'].filter((u) => u.type === 'transport');
console.log('state-level unloadSingleUnit (bypassing UI):', JSON.stringify(gs.unloadSingleUnit('East Mediterranean Sea Zone', 0, 'infantry', 'Syria Jordan')));
