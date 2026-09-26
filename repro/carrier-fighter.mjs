// Rob 3:23pm: fighter landed on a carrier in the Red Sea "at the end of combat" is gone by his next turn.
import { imp, unitDefs } from './_env.mjs';
const { GameState, GAME_PHASES, TURN_PHASES } = await imp('src/state/gameState.js');
const { CombatUI } = await imp('src/ui/combatUI.js');
function mk(carrierId) {
  const T = (name, isWater, connections) => ({ name, isWater, connections });
  const gs = new GameState({ risk: { factions: [] } }, [
    T('Red Sea', true, ['Egypt', 'Arabian Sea']), T('Arabian Sea', true, ['Red Sea']), T('Egypt', false, ['Red Sea']),
  ], []);
  gs.players = [{ id: 'Germans', name: 'Robert007' }, { id: 'Americans', name: 'Bastion' }];
  gs.currentPlayerIndex = 0; gs.phase = GAME_PHASES.PLAYING; gs.turnPhase = TURN_PHASES.COMBAT; gs.round = 3;
  gs.territoryState = { Egypt: { owner: 'Germans' } };
  gs.playerState = { Germans: { ipcs: 10 }, Americans: { ipcs: 10 } };
  gs.friendlyTerritoriesAtTurnStart = new Set(['Egypt']);
  const carrier = { type: 'carrier', quantity: 1, owner: 'Germans', moved: true };
  if (carrierId) carrier.id = carrierId;
  gs.units = { 'Red Sea': [carrier, { type: 'fighter', quantity: 1, owner: 'Germans', moved: true }, { type: 'transport', quantity: 1, owner: 'Americans' }] };
  gs.combatQueue = ['Red Sea'];
  return gs;
}
for (const id of [null, 'carrier_Germans_1']) {
  const gs = mk(id);
  const ui = new CombatUI(); ui.setGameState(gs); ui.setUnitDefs(unitDefs); ui._render = () => {};
  ui.showNextCombat();
  // attacker wins: defender wiped
  ui.combatState.defenders = []; ui.combatState.winner = 'attacker';
  ui._checkAirLanding();
  const air = ui.combatState.airUnitsToLand || [];
  const opt = (air[0]?.landingOptions || []).map((o) => `${o.territory}${o.isCarrier ? '(carrier)' : ''}`);
  // Rob picks the carrier in the battle zone
  ui.combatState.selectedLandings = { [air[0].id]: 'Red Sea' };
  ui._confirmAirLandings();
  const rs = gs.units['Red Sea'];
  const onCarrier = rs.filter((u) => u.type === 'carrier').reduce((n, c) => n + (c.aircraft?.length || 0), 0);
  const loose = rs.filter((u) => u.type === 'fighter').reduce((n, u) => n + u.quantity, 0);
  console.log(`carrier id=${id || '(none, grouped)'} options=[${opt}] → after finalize: fighters on carrier=${onCarrier}, loose=${loose}, anywhere=${JSON.stringify(gs.units).includes('fighter')}`);
}
