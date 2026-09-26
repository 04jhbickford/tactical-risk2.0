// Rob 3:16pm: turn ping should list naval units lost and in which sea zones.
import { imp, unitDefs } from './_env.mjs';
const { GameState, GAME_PHASES, TURN_PHASES } = await imp('src/state/gameState.js');
const { formatRecipientLossSummary } = await imp('src/multiplayer/discordTurnPing.js');
const T = (name, isWater, connections) => ({ name, isWater, connections });
const gs = new GameState({ risk: { factions: [] } }, [T('Red Sea', true, ['Egypt']), T('Egypt', false, ['Red Sea'])], []);
gs.players = [{ id: 'Germans', name: 'Robert007' }, { id: 'British', name: 'Easy Bot', isAI: true, aiDifficulty: 'easy' }];
gs.currentPlayerIndex = 1; gs.phase = GAME_PHASES.PLAYING; gs.turnPhase = TURN_PHASES.COMBAT;
gs.territoryState = { Egypt: { owner: 'British' } }; gs.playerState = { Germans: {}, British: {} };
gs.units = { 'Red Sea': [
  { type: 'transport', quantity: 1, owner: 'Germans', id: 'tr1', cargo: [{ type: 'infantry', owner: 'Germans' }, { type: 'infantry', owner: 'Germans' }] },
  { type: 'carrier', quantity: 1, owner: 'Germans', id: 'cv1', aircraft: [{ type: 'fighter', owner: 'Germans' }] },
  { type: 'battleship', quantity: 3, owner: 'British' }, { type: 'fighter', quantity: 4, owner: 'British' },
] };
gs.combatQueue = ['Red Sea'];
let r, n = 0; Math.random = () => 0.01; // every die a 1: all hit
do { r = gs.resolveCombat('Red Sea', unitDefs); } while (!r.resolved && ++n < 20);
console.log('board after:', JSON.stringify(gs.units['Red Sea'].map((u) => `${u.owner}:${u.quantity}x${u.type}${u.aircraft ? '+air' + u.aircraft.length : ''}`)));
console.log(formatRecipientLossSummary(gs.turnEvents, { recipientId: 'Germans', players: gs.players }));
