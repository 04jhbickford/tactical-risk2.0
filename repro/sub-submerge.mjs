// Rob 3:30–3:40pm: Caspian, Rob's bomber vs Bastion's sub + transport. Sub submerged; afterwards the
// map shows an empty circle with tooltip "Submarine … null".
import { imp, unitDefs } from './_env.mjs';
const { GameState, GAME_PHASES, TURN_PHASES } = await imp('src/state/gameState.js');
const { CombatUI } = await imp('src/ui/combatUI.js');
const T = (name, isWater, connections) => ({ name, isWater, connections });
const gs = new GameState({ risk: { factions: [] } }, [T('Caspian Sea Zone', true, ['Kazakh S.S.R.']), T('Kazakh S.S.R.', false, ['Caspian Sea Zone'])], []);
gs.players = [{ id: 'Germans', name: 'Robert007' }, { id: 'Americans', name: 'Bastion' }];
gs.currentPlayerIndex = 0; gs.phase = GAME_PHASES.PLAYING; gs.turnPhase = TURN_PHASES.COMBAT;
gs.territoryState = { 'Kazakh S.S.R.': { owner: 'Americans' } }; gs.playerState = { Germans: {}, Americans: {} };
gs.friendlyTerritoriesAtTurnStart = new Set();
gs.units = { 'Caspian Sea Zone': [{ type: 'bomber', quantity: 1, owner: 'Germans', moved: true }, { type: 'submarine', quantity: 1, owner: 'Americans' }, { type: 'transport', quantity: 1, owner: 'Americans' }] };
gs.combatQueue = ['Caspian Sea Zone'];
const ui = new CombatUI(); ui.setGameState(gs); ui.setUnitDefs(unitDefs); ui._render = () => {};
ui.showNextCombat();
const cs = ui.combatState;
console.log('initial phase:', cs.phase, '| defenderSubsHaveFirstStrike:', cs.defenderSubsHaveFirstStrike, '| attackers:', cs.attackers.map((u) => u.type).join(','));
ui._submergeSub('defender', 1);
let rolls = 0; const orig = ui._rollD6?.bind(ui); if (orig) ui._rollD6 = (c) => { rolls++; return orig(c); };
ui._rollSubmarineFirstStrike();
console.log('after "Fire First Strike" with 0 active subs: dice rolled =', rolls, '| phase =', ui.combatState.phase);
// Bomber sinks the transport; defender side empty -> attacker wins
ui.combatState.defenders = []; ui.combatState.winner = 'attacker';
ui._finalizeCombat();
console.log('Caspian after battle:', JSON.stringify(gs.units['Caspian Sea Zone']));
console.log('getOwner(sea zone) =', gs.getOwner('Caspian Sea Zone'));
