// Three solo play adapter: GameState + .11 chrome. Do not grow uxPreviewScenario.

import {
  GAME_PHASES,
  TURN_PHASES,
  TURN_PHASE_ORDER,
  TURN_PHASE_NAMES,
  TECHNOLOGIES,
} from '../state/gameState.js';
import {
  countLivingUnits,
  getEnemyCombatUnits,
  getFriendlyCombatUnits,
  territoryCombatAlreadyResolved,
} from '../state/combatUnits.js';
import {
  phoneCombatAttackerWinPercent,
  formatPhoneCombatHeroOdds,
} from '../ui/combatUI.js';
import { dequeueResolvedCombatHeads, applyTerritoryCapture } from '../state/combatFinalize.js';
import { hasLegalAirLandingFrom, remainingAirLandingsToAssign, wasFriendlyAtTurnStart } from '../state/airLanding.js';
import { factoriesAdjacentToSeaZone } from '../state/mobilizeSource.js';
import { airCombatMoveMayOccupy, combatMoveReachableDests, maxMoveSelection, moveSelectionProfile } from '../state/combatMoveEligibility.js';
import { formatRecentMove, listAddressableMoveRows } from '../state/undoPolicy.js';
import { placementBudgetCopy } from '../state/placeQueue.js';
import {
  canPlaceAirOnCarrierInSeaZone,
  seaFirstUnitEntries,
} from '../state/carrierPlacement.js';
import { annotatePoliticalOwner } from './politicalControl.js';

export const BATTLE_STEP = {
  AA_READY: 'aaReady',
  AA_RESULT: 'aaResult',
  COMBAT_READY: 'combatReady',
  COMBAT_RESULT: 'combatResult',
  WON: 'won',
};

// Nested stages: steal xstate-game-phases / bgio-moves-phases-stages.
// Combat-move is origin → units → dest → Confirm; battle/casualty nest after.
export const PLAY_STAGE = {
  IDLE: 'idle',
  ORIGIN: 'origin',
  UNITS: 'units',
  DEST: 'dest',
  CONFIRM: 'confirm',
  AA_READY: BATTLE_STEP.AA_READY,
  AA_RESULT: BATTLE_STEP.AA_RESULT,
  COMBAT_READY: BATTLE_STEP.COMBAT_READY,
  COMBAT_RESULT: BATTLE_STEP.COMBAT_RESULT,
  WON: BATTLE_STEP.WON,
  AIR_LAND: 'airLand',
  INCOME: 'income',
  DONE: 'done',
};

export const STRIP_SHORT = {
  [TURN_PHASES.DEVELOP_TECH]: 'Tech',
  [TURN_PHASES.PURCHASE]: 'Buy',
  [TURN_PHASES.COMBAT_MOVE]: 'Move',
  [TURN_PHASES.COMBAT]: 'Fight',
  [TURN_PHASES.NON_COMBAT_MOVE]: 'NCM',
  [TURN_PHASES.MOBILIZE]: 'Place',
  [TURN_PHASES.COLLECT_INCOME]: 'Income',
};

const COMBAT_ORDER = [
  'infantry', 'artillery', 'armour',
  'fighter', 'tacticalBomber', 'bomber',
  'submarine', 'destroyer', 'cruiser', 'battleship', 'carrier', 'transport',
];

const AIR_ORDER = ['fighter', 'tacticalBomber', 'bomber'];
const BUY_TYPES = [
  'infantry', 'artillery', 'armour',
  'fighter', 'tacticalBomber', 'bomber',
  'aaGun', 'factory',
  'submarine', 'destroyer', 'cruiser', 'battleship', 'carrier', 'transport',
];
const BUY_SHORT = {
  infantry: 'INF', artillery: 'ART', armour: 'TNK',
  fighter: 'FTR', tacticalBomber: 'TAC', bomber: 'BMB',
  aaGun: 'AA', factory: 'FAC',
  submarine: 'SUB', destroyer: 'DD', cruiser: 'CA',
  battleship: 'BB', carrier: 'CV', transport: 'TRN',
};
const TECH_DIE = 'techDie';
const RISK_CARDS = 'riskCards';
const LAND_TEAL = '#5BA8A0';
export { LAND_TEAL, BUY_TYPES, BUY_SHORT, TECH_DIE, RISK_CARDS };

export function createSoloPlay(gameState, unitDefs = {}) {
  return {
    gameState,
    unitDefs,
    selected: null,
    selectedUnits: {},
    destPicked: null,
    stage: PLAY_STAGE.IDLE,
    targetShipId: null,
    battle: null,
    landing: null,
    tech: emptyTech(),
    income: null,
    aiStatus: null,
    rng: null,
    _newGame: false,
    _phase: gameState?.turnPhase || null,
    _player: gameState?.currentPlayer?.id || null,
  };
}

function emptyTech() {
  return { dice: 0, rolls: null, breakthrough: false, pick: null };
}

export function resetUi(play) {
  if (!play) return play;
  play.selected = null;
  play.selectedUnits = {};
  play.destPicked = null;
  play.battle = null;
  play.landing = null;
  play.tech = emptyTech();
  play.income = null;
  play.targetShipId = null;
  refreshStage(play);
  return play;
}

export function isGameOver(play) {
  return !!play?.gameState?.gameOver;
}

export function isHumanTurn(play) {
  const p = play?.gameState?.currentPlayer;
  if (!p || p.isAI) return false;
  const gs = play.gameState;
  if (!gs?.isMultiplayer) return true;
  const me = gs.localUserId || play.localUserId;
  if (!me) return false;
  return p.oderId === me;
}

export function isPlaying(play) {
  return play?.gameState?.phase === GAME_PHASES.PLAYING;
}

export function isSetup(play) {
  const phase = play?.gameState?.phase;
  return phase === GAME_PHASES.CAPITAL_PLACEMENT || phase === GAME_PHASES.UNIT_PLACEMENT;
}

export function capitalDests(play) {
  const gs = play?.gameState;
  const id = gs?.currentPlayer?.id;
  if (!id || gs.phase !== GAME_PHASES.CAPITAL_PLACEMENT) return [];
  return Object.entries(gs.territoryState || {})
    .filter(([name, state]) => state?.owner === id && !gs.territoryByName[name]?.isWater)
    .map(([name]) => name);
}

export function deployPool(play) {
  const gs = play?.gameState;
  const id = gs?.currentPlayer?.id;
  if (!id || gs.phase !== GAME_PHASES.UNIT_PLACEMENT) return [];
  return gs.getKnownUnitsToPlace?.(id, play.unitDefs) || gs.getUnitsToPlace?.(id) || [];
}

export function deployWave(play) {
  const gs = play?.gameState;
  const limit = gs?.getUnitsPerRoundLimit?.() || 6;
  const placed = Number(gs?.unitsPlacedThisRound) || 0;
  const pool = deployPool(play).reduce((n, p) => n + (Number(p.quantity) || 0), 0);
  const copy = placementBudgetCopy({
    deployedThisRound: placed,
    limit,
    poolRemaining: pool,
  });
  const canPass = !!gs?.canFinishPlacementRound?.(
    gs.currentPlayer?.id,
    play.unitDefs,
    { allowNavalSkip: true },
  );
  return {
    limit,
    placed,
    pool,
    canPass,
    copy,
    meter: `${copy.deployedLabel} ${copy.deployedText} · ${copy.remainingLabel} ${copy.remainingText}`,
    passLabel: canPass
      ? (placed >= limit ? `Pass · ${placed} of ${limit}` : `Pass · leftover`)
      : `Deploy ${placed} of ${limit}`,
  };
}

export function deployDests(play) {
  const gs = play?.gameState;
  const player = gs?.currentPlayer;
  if (!player || gs.phase !== GAME_PHASES.UNIT_PLACEMENT) return [];
  const types = Object.entries(play.selectedUnits || {})
    .filter(([, n]) => Number(n) > 0)
    .map(([type]) => type);
  const poolTypes = types.length ? types : deployPool(play).map((p) => p.type);
  const dests = new Set();
  for (const type of poolTypes) {
    const def = play.unitDefs[type] || {};
    if (def.isSea) {
      for (const zone of gs._getValidNavalPlacementZones?.(player.id) || []) dests.add(zone);
    } else if (def.isAir) {
      for (const [name, state] of Object.entries(gs.territoryState || {})) {
        if (state.owner !== player.id) continue;
        if (gs.territoryByName[name]?.isWater) continue;
        dests.add(name);
      }
      for (const [name, t] of Object.entries(gs.territoryByName || {})) {
        if (!t?.isWater) continue;
        if (canPlaceAirOnCarrierInSeaZone(gs, name, type, player.id, play.unitDefs)) {
          dests.add(name);
        }
      }
    } else {
      for (const [name, state] of Object.entries(gs.territoryState || {})) {
        if (state.owner !== player.id) continue;
        if (gs.territoryByName[name]?.isWater) continue;
        dests.add(name);
      }
    }
  }
  return [...dests];
}

export function pickedCount(selectedUnits) {
  return Object.values(selectedUnits || {}).reduce((n, q) => n + (Number(q) || 0), 0);
}

export function selectionBudget(play) {
  if (!play?.gameState) return Infinity;
  const gs = play.gameState;
  if (gs.phase === GAME_PHASES.UNIT_PLACEMENT) {
    const wave = deployWave(play);
    return Math.max(0, wave.limit - wave.placed);
  }
  if (play.battle?.step === BATTLE_STEP.COMBAT_RESULT) {
    const dest = gs.units[play.battle.dest] || [];
    const menu = lossMenu(dest, gs.currentPlayer?.id, play.battle.defenseHits);
    return Math.max(0, Number(menu.need) || 0);
  }
  return Infinity;
}

export function capSelectedToBudget(play, type, next, have) {
  const budget = selectionBudget(play);
  if (!Number.isFinite(budget)) return Math.max(0, Math.min(have, next));
  const used = pickedCount(play.selectedUnits) - (Number(play.selectedUnits?.[type]) || 0);
  const room = Math.max(0, budget - used);
  return Math.max(0, Math.min(have, next, room));
}

export function hasGround(selectedUnits, unitDefs = {}) {
  return Object.entries(selectedUnits || {}).some(([type, qty]) => (
    Number(qty) > 0 && unitDefs[type]?.isLand
  ));
}

export function hasAir(selectedUnits, unitDefs = {}) {
  return Object.entries(selectedUnits || {}).some(([type, qty]) => (
    Number(qty) > 0 && unitDefs[type]?.isAir
  ));
}

export function hasSea(selectedUnits, unitDefs = {}) {
  return Object.entries(selectedUnits || {}).some(([type, qty]) => (
    Number(qty) > 0 && unitDefs[type]?.isSea
  ));
}

function defOf(play, type) {
  return play.unitDefs?.[type] || {};
}

function stackQty(stacks, type, owner = null) {
  return (stacks || [])
    .filter((s) => s.type === type && (!owner || s.owner === owner))
    .reduce((n, s) => n + (Number(s.quantity) || 0), 0);
}

function carrierAirStacks(play, name) {
  const player = play.gameState.currentPlayer;
  if (!player || !name) return [];
  const qty = {};
  for (const ship of play.gameState.units[name] || []) {
    if (ship.type !== 'carrier' || ship.owner !== player.id) continue;
    for (const craft of ship.aircraft || []) {
      if (!craft || craft.moved) continue;
      if (craft.owner && craft.owner !== player.id) continue;
      const type = craft.type || 'fighter';
      qty[type] = (qty[type] || 0) + (Number(craft.quantity) || 1);
    }
  }
  return Object.entries(qty).map(([type, quantity]) => ({
    type,
    quantity,
    owner: player.id,
    carrierAir: true,
  }));
}

function movableStacks(play, name) {
  const player = play.gameState.currentPlayer;
  if (!player || !name) return [];
  const onHex = (play.gameState.units[name] || []).filter((u) => (
    u.owner === player.id
    && (Number(u.quantity) || 0) > 0
    && !u.moved
    && u.type !== 'factory'
    && u.type !== 'aaGun'
  ));
  const extra = [...cargoStacks(play, name), ...carrierAirStacks(play, name)];
  if (!extra.length) return onHex;
  const merged = [...onHex];
  for (const stack of extra) {
    const hit = merged.find((u) => u.type === stack.type && !u.id);
    if (hit) hit.quantity = (Number(hit.quantity) || 0) + stack.quantity;
    else merged.push({ ...stack });
  }
  return merged;
}

export function combatOrigins(play) {
  const player = play.gameState.currentPlayer;
  if (!player) return [];
  return Object.keys(play.gameState.units || {}).filter((name) => movableStacks(play, name).length > 0);
}

function isEnemyLand(play, name) {
  const owner = play.gameState.getOwner(name);
  const player = play.gameState.currentPlayer;
  if (!player || !owner) return false;
  return owner !== player.id && !play.gameState.areAllies(player.id, owner);
}

function isFriendlyLand(play, name) {
  const gs = play.gameState;
  const player = gs.currentPlayer;
  if (!player || !name) return false;
  if (typeof gs.isNcmFriendly === 'function') return gs.isNcmFriendly(name, player.id);
  const owner = gs.getOwner(name);
  if (owner === player.id || gs.areAllies(player.id, owner)) return true;
  return gs.capturedThisTurn instanceof Set && gs.capturedThisTurn.has(name);
}

function hasEnemyShips(play, name) {
  const gs = play.gameState;
  const player = gs.currentPlayer;
  if (!player) return false;
  return (gs.units[name] || []).some((u) => (
    u.owner !== player.id
    && !gs.areAllies(player.id, u.owner)
    && (Number(u.quantity) || 0) > 0
    && u.type !== 'factory'
  ));
}

function hasFriendlyTransport(play, name) {
  const player = play.gameState.currentPlayer;
  if (!player) return false;
  return (play.gameState.units[name] || []).some((u) => (
    u.type === 'transport' && u.owner === player.id && (Number(u.quantity) || 0) > 0
  ));
}

function hasFriendlyCarrier(play, name) {
  const player = play.gameState.currentPlayer;
  if (!player) return false;
  return (play.gameState.units[name] || []).some((u) => (
    u.type === 'carrier' && u.owner === player.id && (Number(u.quantity) || 0) > 0
  ));
}

export function eligibleStacks(play, name) {
  const stacks = movableStacks(play, name);
  const t = play.gameState?.territoryByName?.[name];
  if (!t || !stacks.length) return stacks;
  if (t.isWater) {
    return stacks.filter((s) => {
      const def = defOf(play, s.type);
      return !!(def.isSea || def.isAir || s.cargo);
    });
  }
  return stacks.filter((s) => {
    const def = defOf(play, s.type);
    return !!(def.isLand || def.isAir);
  });
}

export function cargoManifest(play, name) {
  const gs = play?.gameState;
  const id = gs?.currentPlayer?.id;
  if (!gs || !id || !name) return [];
  const raw = typeof gs.getShipsWithCargo === 'function'
    ? gs.getShipsWithCargo(name, id)
    : [];
  return (raw || []).map((ship, index) => {
    const cargo = [...(ship.cargo || [])];
    const aircraft = [...(ship.aircraft || [])];
    return {
      ...ship,
      index,
      key: ship.id || `${ship.type}-${index}`,
      load: [...cargo, ...aircraft],
    };
  });
}

export function shipMatches(ship, shipId) {
  if (!ship || !shipId) return false;
  return ship.id === shipId || ship.key === shipId;
}

function cargoStacks(play, name) {
  const player = play.gameState.currentPlayer;
  if (!player || !name) return [];
  const ships = cargoManifest(play, name).filter((s) => s.type === 'transport');
  const focus = play.targetShipId
    ? ships.filter((s) => shipMatches(s, play.targetShipId))
    : ships;
  const qty = {};
  for (const ship of focus) {
    for (const item of ship.cargo || []) {
      qty[item.type] = (qty[item.type] || 0) + (Number(item.quantity) || 1);
    }
  }
  return Object.entries(qty).map(([type, quantity]) => ({
    type,
    quantity,
    owner: player.id,
    cargo: true,
  }));
}

function transportIndexFor(play, name) {
  const ships = cargoManifest(play, name).filter((s) => s.type === 'transport');
  if (!ships.length) return 0;
  const hit = play.targetShipId
    ? ships.find((s) => shipMatches(s, play.targetShipId))
    : ships.find((s) => (s.cargo || []).length);
  return Math.max(0, hit ? ships.indexOf(hit) : 0);
}

export function legalDests(play) {
  const from = play.selected;
  const picked = play.selectedUnits;
  if (!from || !pickedCount(picked)) return [];
  const gs = play.gameState;
  const dests = new Set();
  const combat = gs.turnPhase === TURN_PHASES.COMBAT_MOVE;
  const ncm = gs.turnPhase === TURN_PHASES.NON_COMBAT_MOVE;
  if (!combat && !ncm) return [];

  const ground = hasGround(picked, play.unitDefs);
  const air = hasAir(picked, play.unitDefs);
  const sea = hasSea(picked, play.unitDefs);
  const fromT = gs.territoryByName[from];
  const adj = gs.getConnections(from) || [];

  if (combat) {
    for (const hit of combatMoveReachableDests(gs, from, picked, play.unitDefs)) {
      dests.add(hit.name);
    }
    let airRange = 1;
    let airType = 'fighter';
    for (const [type, qty] of Object.entries(picked)) {
      if (Number(qty) > 0 && play.unitDefs[type]?.isAir) {
        const move = Number(play.unitDefs[type].movement) || 1;
        if (move >= airRange) {
          airRange = move;
          airType = type;
        }
      }
    }
    const airAttackOk = (to, distance) => hasLegalAirLandingFrom(
      gs, to, airRange - distance, airType, play.unitDefs, gs.currentPlayer.id,
    );
    for (const to of adj) {
      const t = gs.territoryByName[to];
      if (ground && !t?.isWater && isEnemyLand(play, to)) dests.add(to);
      if (sea && t?.isWater && hasEnemyShips(play, to)) dests.add(to);
      if (air && !ground && !sea && isEnemyLand(play, to) && hasEnemyShips(play, to) && airAttackOk(to, 1)) dests.add(to);
      if (ground && fromT?.isWater && !t?.isWater && isEnemyLand(play, to)) dests.add(to);
      if (ground && !fromT?.isWater && t?.isWater && hasFriendlyTransport(play, to) && !hasEnemyShips(play, to)) dests.add(to);
      if (air && t?.isWater && hasEnemyShips(play, to) && airAttackOk(to, 1)) dests.add(to);
      if (air && t?.isWater && hasFriendlyCarrier(play, to) && !hasEnemyShips(play, to)) dests.add(to);
    }
    if (air && !ground && !sea) {
      const reach = gs.getReachableTerritoriesForAir(from, airRange, gs.currentPlayer.id, true);
      for (const [name, info] of reach) {
        if (!isEnemyLand(play, name)) continue;
        if (!airCombatMoveMayOccupy(gs, name, gs.currentPlayer.id)) continue;
        if (!airAttackOk(name, info?.distance || 0)) continue;
        dests.add(name);
      }
    }
  }

  if (ncm) {
    for (const to of adj) {
      const t = gs.territoryByName[to];
      if (ground && !t?.isWater && isFriendlyLand(play, to)) dests.add(to);
      if (sea && t?.isWater && !isEnemyLand(play, to)) dests.add(to);
      if (air && !ground && !sea && !t?.isWater && wasFriendlyAtTurnStart(gs, to, gs.currentPlayer.id)) dests.add(to);
      if (ground && fromT?.isWater && !t?.isWater && isFriendlyLand(play, to)) dests.add(to);
      if (ground && t?.isWater && hasFriendlyTransport(play, to)) dests.add(to);
      if (air && t?.isWater && hasFriendlyCarrier(play, to)) dests.add(to);
    }
    if (air && !ground && !sea) {
      let range = 1;
      for (const [type, qty] of Object.entries(picked)) {
        if (Number(qty) > 0 && play.unitDefs[type]?.isAir) {
          range = Math.max(range, Number(play.unitDefs[type].movement) || 1);
        }
      }
      const reach = gs.getReachableTerritoriesForAir(from, range, gs.currentPlayer.id, false);
      for (const name of reach.keys()) {
        const zone = gs.territoryByName[name];
        if (zone?.isWater) continue;
        if (wasFriendlyAtTurnStart(gs, name, gs.currentPlayer.id)) dests.add(name);
      }
    }
  }

  dests.delete(from);
  if (combat) {
    const profile = moveSelectionProfile(picked, play.unitDefs);
    if (profile.landOnly) {
      for (const name of [...dests]) {
        if (!gs.territoryByName?.[name]?.isWater) continue;
        if (hasFriendlyTransport(play, name) && !hasEnemyShips(play, name)) continue;
        dests.delete(name);
      }
    }
  }
  return [...dests];
}

function moveOriginOk(play) {
  const origins = combatOrigins(play);
  return !!(play.selected && origins.includes(play.selected));
}

function moveUnitsOk(play) {
  return pickedCount(play.selectedUnits) > 0 && moveOriginOk(play);
}

function moveDestLegal(play) {
  if (!play.destPicked || !moveUnitsOk(play)) return false;
  return legalDests(play).includes(play.destPicked);
}

export function playStage(play) {
  if (!play?.gameState) return PLAY_STAGE.IDLE;
  if (isGameOver(play)) return PLAY_STAGE.DONE;
  if (play.income) return PLAY_STAGE.INCOME;
  if (play.landing) return PLAY_STAGE.AIR_LAND;
  if (play.battle?.step) return play.battle.step;
  const phase = play.gameState.turnPhase;
  if (phase !== TURN_PHASES.COMBAT_MOVE && phase !== TURN_PHASES.NON_COMBAT_MOVE) {
    return PLAY_STAGE.IDLE;
  }
  if (moveDestLegal(play)) return PLAY_STAGE.CONFIRM;
  if (play.destPicked && moveUnitsOk(play)) return PLAY_STAGE.DEST;
  if (moveUnitsOk(play)) return PLAY_STAGE.UNITS;
  if (moveOriginOk(play)) return PLAY_STAGE.ORIGIN;
  return PLAY_STAGE.IDLE;
}

function refreshStage(play) {
  play.stage = playStage(play);
  return play.stage;
}

export function phaseStrip(play) {
  if (isSetup(play)) {
    const capital = play.gameState.phase === GAME_PHASES.CAPITAL_PLACEMENT;
    return { steps: ['Capital', 'Deploy'], current: capital ? 1 : 2 };
  }
  const incomeIdx = TURN_PHASE_ORDER.indexOf(TURN_PHASES.COLLECT_INCOME);
  const current = play.income
    ? incomeIdx
    : TURN_PHASE_ORDER.indexOf(play.gameState?.turnPhase);
  return {
    steps: TURN_PHASE_ORDER.map((p) => STRIP_SHORT[p] || TURN_PHASE_NAMES[p]),
    current: current >= 0 ? current + 1 : 1,
  };
}

export function purchasableTypes(play) {
  const defs = play?.unitDefs || {};
  return BUY_TYPES.filter((type) => !!defs[type]);
}

export function incomePreview(play) {
  const gs = play?.gameState;
  const id = gs?.currentPlayer?.id;
  if (!gs || !id) return { amount: 0, blocked: true };
  const blocked = gs.canCollectIncome?.(id) === false;
  const amount = Number(gs.getCollectIncomeAmount?.(id)) || 0;
  return { amount, blocked };
}

export function wouldCollectOnEnd(play) {
  if (!isPlaying(play) || !isHumanTurn(play) || isGameOver(play)) return false;
  if (play.landing || play.battle) return false;
  const phase = play.gameState.turnPhase;
  if (phase === TURN_PHASES.COLLECT_INCOME) return true;
  if (phase === TURN_PHASES.MOBILIZE) {
    return pendingQty(play) <= 0 && !pickedCount(play.selectedUnits);
  }
  if (phase === TURN_PHASES.NON_COMBAT_MOVE) {
    const hasBuy = pendingPurchasesOf(play).some((p) => (Number(p.quantity) || 0) > 0);
    return ncmAirRemaining(play) <= 0 && !pickedCount(play.selectedUnits) && !hasBuy;
  }
  return false;
}

export function ncmAirRemaining(play) {
  const units = (play.gameState?.pendingAirLandings || [])
    .flatMap((entry) => entry.units || [])
    .filter((unit) => !unit.applied);
  return remainingAirLandingsToAssign(units, {});
}

export function pendingPurchasesOf(play) {
  const id = play.gameState?.currentPlayer?.id;
  return (play.gameState?.pendingPurchases || []).filter((p) => p.owner === id);
}

export function pendingQty(play, type = null) {
  return pendingPurchasesOf(play)
    .filter((p) => !type || p.type === type)
    .reduce((n, p) => n + (Number(p.quantity) || 0), 0);
}

export function unitCost(play, type) {
  let cost = Number(play.unitDefs?.[type]?.cost) || 0;
  const id = play.gameState?.currentPlayer?.id;
  if (id && play.gameState.hasTech?.(id, 'industrialTech')) {
    cost = Math.max(1, cost - 1);
  }
  return cost;
}

export function shopCapacity(play) {
  const id = play.gameState?.currentPlayer?.id;
  if (!id) return { used: 0, max: 0, left: 0 };
  const max = play.gameState.getMobilizationCapacity(id);
  const used = play.gameState.getPendingPurchaseCount(id);
  return { used, max, left: Math.max(0, max - used) };
}

export function factoryDests(play) {
  const gs = play.gameState;
  const id = gs?.currentPlayer?.id;
  if (!id) return [];
  const atStart = gs.factoriesAtTurnStart;
  if (atStart instanceof Set && atStart.size) return [...atStart];
  return gs._getFactoryTerritories?.(id) || [];
}

export function legalPlaceDests(play) {
  const gs = play.gameState;
  const player = gs?.currentPlayer;
  if (!player || gs.turnPhase !== TURN_PHASES.MOBILIZE) return [];
  const types = Object.entries(play.selectedUnits || {})
    .filter(([, n]) => Number(n) > 0)
    .map(([type]) => type);
  const pendingTypes = types.length
    ? types
    : pendingPurchasesOf(play).map((p) => p.type);
  const dests = new Set();
  for (const type of pendingTypes) {
    const def = play.unitDefs[type] || {};
    if (def.isSea) {
      for (const zone of gs._getValidNavalPlacementZones?.(player.id) || []) dests.add(zone);
    } else if (def.isBuilding) {
      for (const [name, state] of Object.entries(gs.territoryState || {})) {
        if (state.owner !== player.id) continue;
        if (gs.territoryByName[name]?.isWater) continue;
        const friendly = gs.friendlyTerritoriesAtTurnStart;
        if (friendly instanceof Set && friendly.size && !friendly.has(name)) continue;
        const hasFac = (gs.units[name] || []).some((u) => u.type === 'factory');
        if (!hasFac) dests.add(name);
      }
    } else if (def.isAir) {
      for (const name of factoryDests(play)) dests.add(name);
      for (const zone of gs._getValidNavalPlacementZones?.(player.id) || []) {
        if (canPlaceAirOnCarrierInSeaZone(gs, zone, type, player.id, play.unitDefs, {
          requireFactoryAdjacent: true,
        })) {
          dests.add(zone);
        }
      }
    } else {
      for (const name of factoryDests(play)) dests.add(name);
    }
  }
  return [...dests];
}

export function canEndPhase(play) {
  if (isGameOver(play)) return false;
  if (isSetup(play)) {
    if (!isHumanTurn(play)) return false;
    const gs = play.gameState;
    if (gs.phase === GAME_PHASES.CAPITAL_PLACEMENT) return false;
    const wave = deployWave(play);
    if (wave.placed >= wave.limit) return true;
    return !!gs.canFinishPlacementRound?.(gs.currentPlayer.id, play.unitDefs, { allowNavalSkip: true });
  }
  if (!isPlaying(play) || !isHumanTurn(play)) return false;
  if (play.income) return true;
  if (play.landing) return remainingAirCount(play) <= 0;
  if (play.battle) return play.battle.step === BATTLE_STEP.WON && !play.landing;
  const phase = play.gameState.turnPhase;
  if (phase === TURN_PHASES.DEVELOP_TECH) {
    if (play.tech?.breakthrough) return false;
    if ((play.tech?.dice || 0) > 0 && !play.tech?.rolls) return false;
    return true;
  }
  if (phase === TURN_PHASES.MOBILIZE) {
    return pendingQty(play) <= 0 && !pickedCount(play.selectedUnits);
  }
  if (phase === TURN_PHASES.COMBAT) {
    return (play.gameState.combatQueue || []).length === 0;
  }
  if (phase === TURN_PHASES.NON_COMBAT_MOVE) {
    return ncmAirRemaining(play) <= 0 && !pickedCount(play.selectedUnits);
  }
  if (phase === TURN_PHASES.COMBAT_MOVE) {
    return !play.destPicked;
  }
  return true;
}

function rollDie(play, context) {
  if (typeof play.rng === 'function') return play.rng(context);
  return play.gameState._rollDie(context);
}

function combatUnitsAt(play, name, owner) {
  return (play.gameState.units[name] || []).filter((u) => (
    u.owner === owner
    && (Number(u.quantity) || 0) > 0
    && u.type !== 'factory'
    && u.type !== 'aaGun'
  )).sort((a, b) => COMBAT_ORDER.indexOf(a.type) - COMBAT_ORDER.indexOf(b.type));
}

function removeQty(units, type, owner, qty) {
  let left = qty;
  for (const s of units) {
    if (left <= 0) break;
    if (s.type !== type || (owner && s.owner !== owner)) continue;
    const take = Math.min(Number(s.quantity) || 0, left);
    s.quantity -= take;
    left -= take;
  }
  return units.filter((s) => (Number(s.quantity) || 0) > 0 || s.type === 'factory');
}

function cheapestLosses(stacks, owner, hits, order = COMBAT_ORDER) {
  const taken = {};
  let left = hits;
  for (const type of order) {
    if (left <= 0) break;
    const have = stackQty(stacks, type, owner);
    const n = Math.min(have, left);
    if (n > 0) {
      taken[type] = n;
      left -= n;
    }
  }
  return taken;
}

function assignedCount(taken) {
  return Object.values(taken || {}).reduce((n, q) => n + (Number(q) || 0), 0);
}

function lossMenu(stacks, owner, hits) {
  const list = (stacks || []).filter((s) => (
    s.owner === owner && (Number(s.quantity) || 0) > 0 && s.type !== 'factory' && s.type !== 'aaGun'
  ));
  const total = list.reduce((n, s) => n + (Number(s.quantity) || 0), 0);
  const need = Math.min(Math.max(0, Number(hits) || 0), total);
  const types = list.filter((u) => (u.quantity || 0) > 0);
  const forced = need <= 0 || types.length <= 1 || total <= need;
  return {
    need,
    forced,
    units: types.map((u) => ({ type: u.type, quantity: u.quantity })),
  };
}

export function syncPlay(play) {
  const phase = play.gameState.turnPhase;
  const player = play.gameState.currentPlayer?.id || null;
  if (play._phase !== phase || play._player !== player) {
    const keepBattle = play.battle && phase === TURN_PHASES.COMBAT && play._player === player;
    const keepLand = play.landing && play._player === player;
    play._phase = phase;
    play._player = player;
    if (!keepBattle && !keepLand) {
      play.selectedUnits = {};
      play.destPicked = null;
      play.battle = null;
      play.landing = null;
      play.tech = emptyTech();
      play.income = null;
    }
  }
  if (phase === TURN_PHASES.COMBAT && isHumanTurn(play) && !play.battle && !play.landing && !isGameOver(play)) {
    enterCombat(play);
  }
  if (play.gameState && !play._gestureRestored) {
    const saved = play.gameState.uiGesture;
    if (saved?.active && saved.turnPhase === phase && saved.playerId === player && saved.fork !== 'classic') {
      play.selected = saved.from || play.selected;
      play.selectedUnits = { ...(saved.selectedUnits || {}) };
      play.destPicked = saved.dest || null;
      if (saved.landing) {
        play.landing = {
          ...saved.landing,
          pick: { ...(saved.landing.pick || {}) },
          airLeft: { ...(saved.landing.airLeft || {}) },
          landable: [...(saved.landing.landable || [])],
        };
      }
    }
    play._gestureRestored = true;
  }
  if (play.gameState) {
    const gesturing = !!(
      pickedCount(play.selectedUnits)
      || play.landing
      || play.destPicked
    );
    play.gameState.uiGestureActive = gesturing;
    const gesture = gesturing ? {
      active: true,
      fork: 'experimental',
      from: play.selected || null,
      selectedUnits: { ...(play.selectedUnits || {}) },
      dest: play.destPicked || null,
      landing: play.landing ? {
        origin: play.landing.origin,
        dest: play.landing.dest,
        pick: { ...(play.landing.pick || {}) },
        airLeft: { ...(play.landing.airLeft || {}) },
        landable: [...(play.landing.landable || [])],
      } : null,
      turnPhase: phase,
      playerId: player,
    } : null;
    const prev = JSON.stringify(play.gameState.uiGesture || null);
    const next = JSON.stringify(gesture);
    if (prev !== next) {
      play.gameState.uiGesture = gesture;
      if (!play.gameState._suppressPersist && typeof play.gameState.autoSave === 'function') {
        play.gameState.autoSave();
      }
    }
  }
  refreshStage(play);
  return play;
}

export function resolveNavalQueue(play) {
  const gs = play.gameState;
  gs._detectCombats?.();
  const defs = play.unitDefs;
  dequeueResolvedCombatHeads(gs, { unitDefs: defs || {} });
  let guard = 0;
  while ((gs.combatQueue || []).length && guard++ < 80) {
    const name = gs.combatQueue[0];
    const t = gs.territoryByName[name];
    const units = gs.units[name] || [];
    if (territoryCombatAlreadyResolved(units, gs.currentPlayer?.id, (a, b) => gs.areAllies(a, b))) {
      dequeueResolvedCombatHeads(gs, { unitDefs: defs || {} });
      continue;
    }
    if (!t?.isWater) break;
    let safety = 40;
    while (safety-- > 0) {
      const result = gs.resolveCombat(name, defs);
      if (!result || result.resolved) break;
    }
  }
  return play;
}

export function enterCombat(play) {
  const gs = play.gameState;
  resolveNavalQueue(play);
  dequeueResolvedCombatHeads(gs, { unitDefs: play.unitDefs || {} });
  while ((gs.combatQueue || []).length) {
    const name = gs.combatQueue[0];
    const units = gs.units[name] || [];
    if (territoryCombatAlreadyResolved(units, gs.currentPlayer?.id, (a, b) => gs.areAllies(a, b))) {
      dequeueResolvedCombatHeads(gs, { unitDefs: play.unitDefs || {} });
      continue;
    }
    startBattle(play, name);
    return play;
  }
  return play;
}

function startBattle(play, dest) {
  const gs = play.gameState;
  const player = gs.currentPlayer;
  const stacks = gs.units[dest] || [];
  const enemies = getEnemyCombatUnits(stacks, player.id, (a, b) => gs.areAllies(a, b));
  const friends = getFriendlyCombatUnits(stacks, player.id);
  const aaGuns = stackQty(stacks, 'aaGun', enemies[0]?.owner);
  const planes = friends.filter((s) => defOf(play, s.type).isAir)
    .reduce((n, s) => n + (Number(s.quantity) || 0), 0);
  play.selected = dest;
  play.destPicked = dest;
  play.battle = {
    dest,
    step: aaGuns > 0 && planes > 0 ? BATTLE_STEP.AA_READY : BATTLE_STEP.COMBAT_READY,
    round: 0,
    aaGuns,
    aaPlanes: planes,
    aaHits: 0,
    aaDice: [],
    attackDice: [],
    defenseDice: [],
    attackHits: 0,
    defenseHits: 0,
    pendingAtt: {},
    pendingDef: {},
    attForced: false,
    defForced: false,
    failed: false,
    log: [],
  };
  return play;
}

function rollAA(play) {
  const battle = play.battle;
  const dest = battle.dest;
  const player = play.gameState.currentPlayer;
  const dice = [];
  let hits = 0;
  for (let i = 0; i < battle.aaPlanes; i++) {
    const face = rollDie(play, 'aa');
    dice.push(face);
    if (face === 1) hits += 1;
  }
  battle.aaDice = dice;
  battle.aaHits = hits;
  if (hits > 0) {
    const stacks = play.gameState.units[dest] || [];
    const taken = cheapestLosses(stacks, player.id, hits, AIR_ORDER);
    let next = stacks;
    for (const [type, qty] of Object.entries(taken)) {
      next = removeQty(next, type, player.id, qty);
    }
    play.gameState.units[dest] = next;
  }
  play.gameState.recordCombatTelemetry?.({
    kind: 'aa',
    territory: dest,
    hits,
    rolls: dice,
    wiped: countLivingUnits(getFriendlyCombatUnits(play.gameState.units[dest], player.id)) <= 0,
  });
  battle.step = BATTLE_STEP.AA_RESULT;
  battle.log.push(hits ? `AA hit ×${hits}` : 'AA missed');
  play.gameState._notify();
  return play;
}

function failCloseIfWiped(play) {
  const dest = play.battle.dest;
  const player = play.gameState.currentPlayer;
  const friends = getFriendlyCombatUnits(play.gameState.units[dest] || [], player.id);
  if (countLivingUnits(friends) > 0) return false;
  play.battle.step = BATTLE_STEP.WON;
  play.battle.failed = true;
  play.gameState.combatQueue = (play.gameState.combatQueue || []).filter((t) => t !== dest);
  play.battle.log.push('Attack failed');
  play.gameState._notify();
  return true;
}

// Steal aa-combat-dice-calc-pattern from combatUI: artillery 1:1, jets, superSubs, heavyBombers.
function attackValueOf(play, type, owner, supported) {
  let value = Number(defOf(play, type).attack) || 0;
  if (type === 'infantry' && supported) value += 1;
  if (type === 'fighter' && play.gameState.hasTech?.(owner, 'jets')) value += 1;
  if (type === 'submarine' && play.gameState.hasTech?.(owner, 'superSubs')) value += 1;
  return value;
}

function defenseValueOf(play, type, owner) {
  let value = Number(defOf(play, type).defense) || 0;
  if (type === 'fighter' && play.gameState.hasTech?.(owner, 'jets')) value += 1;
  return value;
}

function attackDicePerUnit(play, type, owner) {
  if (type === 'bomber' && play.gameState.hasTech?.(owner, 'heavyBombers')) return 2;
  return 1;
}

function rollCombat(play) {
  const battle = play.battle;
  const dest = battle.dest;
  const gs = play.gameState;
  const player = gs.currentPlayer;
  const destStacks = gs.units[dest] || [];
  const attackers = combatUnitsAt(play, dest, player.id);
  const defOwner = destStacks.find((s) => (
    s.owner !== player.id && !gs.areAllies(player.id, s.owner) && s.type !== 'factory'
  ))?.owner;
  const defenders = combatUnitsAt(play, dest, defOwner);
  battle.round += 1;

  let supportedInfantry = attackers
    .filter((u) => u.type === 'artillery')
    .reduce((n, u) => n + (Number(u.quantity) || 0), 0);

  const attackDice = [];
  let attackHits = 0;
  for (const unit of attackers) {
    const diceEach = attackDicePerUnit(play, unit.type, player.id);
    for (let i = 0; i < (unit.quantity || 0); i++) {
      const supported = unit.type === 'infantry' && supportedInfantry > 0;
      if (supported) supportedInfantry -= 1;
      const value = attackValueOf(play, unit.type, player.id, supported);
      for (let d = 0; d < diceEach; d++) {
        const face = rollDie(play, 'attack');
        const hit = face <= value;
        attackDice.push({ type: unit.type, face, hit, side: 'atk', value });
        if (hit) attackHits += 1;
      }
    }
  }

  const defenseDice = [];
  let defenseHits = 0;
  for (const unit of defenders) {
    const value = defenseValueOf(play, unit.type, defOwner);
    for (let i = 0; i < (unit.quantity || 0); i++) {
      const face = rollDie(play, 'defense');
      const hit = face <= value;
      defenseDice.push({ type: unit.type, face, hit, side: 'def', value });
      if (hit) defenseHits += 1;
    }
  }

  battle.attackDice = attackDice;
  battle.defenseDice = defenseDice;
  battle.attackHits = attackHits;
  battle.defenseHits = defenseHits;
  const attMenu = lossMenu(destStacks, player.id, defenseHits);
  const defMenu = lossMenu(destStacks, defOwner, attackHits);
  battle.pendingAtt = attMenu.forced ? cheapestLosses(destStacks, player.id, defenseHits) : {};
  battle.pendingDef = cheapestLosses(destStacks, defOwner, attackHits);
  battle.attForced = attMenu.forced;
  battle.defForced = defMenu.forced;
  battle.defOwner = defOwner;
  battle.step = BATTLE_STEP.COMBAT_RESULT;
  battle.log.push(`R${battle.round} ATK ${attackHits} · DEF ${defenseHits}`);
  gs.recordCombatTelemetry?.({
    kind: 'combat',
    territory: dest,
    hits: { attack: attackHits, defense: defenseHits },
    attackRolls: attackDice.map((d) => d.face),
    defenseRolls: defenseDice.map((d) => d.face),
    attackForce: attackers,
    defenseForce: defenders,
  });
  return play;
}

function applyHits(play) {
  const battle = play.battle;
  const dest = battle.dest;
  const gs = play.gameState;
  const player = gs.currentPlayer;
  let stacks = gs.units[dest] || [];
  const attMenu = lossMenu(stacks, player.id, battle.defenseHits);
  const defMenu = lossMenu(stacks, battle.defOwner, battle.attackHits);
  if (assignedCount(battle.pendingAtt) !== attMenu.need) {
    battle.pendingAtt = cheapestLosses(stacks, player.id, battle.defenseHits);
  }
  if (assignedCount(battle.pendingDef) !== defMenu.need) {
    battle.pendingDef = cheapestLosses(stacks, battle.defOwner, battle.attackHits);
  }
  for (const [type, qty] of Object.entries(battle.pendingAtt || {})) {
    stacks = removeQty(stacks, type, player.id, qty);
  }
  for (const [type, qty] of Object.entries(battle.pendingDef || {})) {
    stacks = removeQty(stacks, type, battle.defOwner, qty);
  }
  gs.units[dest] = stacks;
  const attLosses = assignedCount(battle.pendingAtt);
  const defLosses = assignedCount(battle.pendingDef);
  battle.pendingAtt = {};
  battle.pendingDef = {};
  const friends = getFriendlyCombatUnits(stacks, player.id);
  const enemies = getEnemyCombatUnits(stacks, player.id, (a, b) => gs.areAllies(a, b));
  if (countLivingUnits(enemies) <= 0 && countLivingUnits(friends) > 0) {
    const t = gs.territoryByName[dest];
    const hasLand = friends.some((u) => defOf(play, u.type).isLand && u.type !== 'aaGun');
    if (hasLand && !t?.isWater) {
      applyTerritoryCapture(gs, dest, {
        playerId: player.id,
        unitDefs: play.unitDefs || {},
      });
    }
    gs.logCombat?.({
      territory: dest,
      attacker: player.name,
      defender: battle.defOwner,
      winner: 'attacker',
      attackerLosses: attLosses,
      defenderLosses: defLosses,
    });
    gs.combatQueue = (gs.combatQueue || []).filter((n) => n !== dest);
    battle.step = BATTLE_STEP.WON;
    battle.failed = false;
    battle.log.push(`Attacker takes ${dest}`);
    gs._notify();
    return play;
  }
  if (countLivingUnits(friends) <= 0) {
    gs.combatQueue = (gs.combatQueue || []).filter((n) => n !== dest);
    battle.step = BATTLE_STEP.WON;
    battle.failed = true;
    battle.log.push('Attack failed');
    gs._notify();
    return play;
  }
  battle.step = BATTLE_STEP.COMBAT_READY;
  gs._notify();
  return play;
}

function remainingAirCount(play) {
  if (!play.landing) return 0;
  return Object.values(play.landing.airLeft || {}).reduce((n, q) => n + (Number(q) || 0), 0);
}

function startAirLand(play) {
  const battle = play.battle;
  const dest = battle?.dest;
  const player = play.gameState.currentPlayer;
  const stacks = play.gameState.units[dest] || [];
  const air = {};
  for (const type of AIR_ORDER) {
    const n = stackQty(stacks, type, player.id);
    if (n > 0) air[type] = n;
  }
  const planes = Object.values(air).reduce((n, q) => n + q, 0);
  play.battle = null;
  if (planes <= 0 || battle?.failed) {
    play.landing = null;
    enterCombat(play);
    return play;
  }
  const pendingAir = [];
  let airId = 0;
  for (const [type, quantity] of Object.entries(air)) {
    for (let i = 0; i < (Number(quantity) || 0); i++) {
      pendingAir.push({ id: `${type}_${airId++}`, type, quantity: 1 });
    }
  }
  play.gameState.addPendingAirLandings?.(dest, pendingAir);
  const landable = new Set();
  for (const type of Object.keys(air)) {
    for (const opt of play.gameState.getAirLandingOptions(dest, type, play.unitDefs) || []) {
      // Carriers count. Filtering them out left fighters over open water.
      if (opt.territory) landable.add(opt.territory);
    }
  }
  if (!landable.size) {
    play.landing = null;
    play.gameState.resolveLooseAirOverWater?.(play.unitDefs || {});
    enterCombat(play);
    return play;
  }
  play.landing = {
    origin: dest,
    dest: null,
    pick: {},
    airLeft: { ...air },
    landable: [...landable],
  };
  play.selected = dest;
  return play;
}

function applyLanding(play) {
  const land = play.landing;
  if (!land?.dest || !pickedCount(land.pick)) return play;
  const plan = [];
  for (const [type, qty] of Object.entries(land.pick)) {
    const n = Math.min(Number(qty) || 0, Number(land.airLeft[type]) || 0);
    if (n <= 0) continue;
    plan.push({ id: `${type}_${plan.length}`, type, quantity: n, destination: land.dest });
  }
  if (!plan.length) return play;
  const landings = Object.fromEntries(plan.map((p) => [p.id, p.destination]));
  const result = play.gameState.applyAirLandings(land.origin, {
    landings,
    airUnitsToLand: plan,
    unitDefs: play.unitDefs,
  });
  if (result?.success === false) return play;
  for (const item of plan) {
    land.airLeft[item.type] = (Number(land.airLeft[item.type]) || 0) - item.quantity;
    if (land.airLeft[item.type] <= 0) delete land.airLeft[item.type];
  }
  land.pick = {};
  if (remainingAirCount(play) <= 0) {
    play.landing = null;
    enterCombat(play);
  }
  return play;
}

function unitsToMoveFromPick(selectedUnits) {
  return Object.entries(selectedUnits || {})
    .filter(([, n]) => Number(n) > 0)
    .map(([type, quantity]) => ({ type, quantity: Number(quantity) }));
}

export function youLossesReady(play) {
  const battle = play.battle;
  if (!battle || battle.step !== BATTLE_STEP.COMBAT_RESULT) return false;
  const dest = play.gameState.units[battle.dest] || [];
  const player = play.gameState.currentPlayer;
  const menu = lossMenu(dest, player.id, battle.defenseHits);
  return assignedCount(battle.pendingAtt) === menu.need;
}

export function tapLand(play, name) {
  syncPlay(play);
  if (!name) return play;
  if (!isHumanTurn(play)) {
    play.selected = name;
    return play;
  }
  if (play.landing) {
    if (play.landing.landable.includes(name)) {
      play.selected = name;
      play.landing.dest = name;
    }
    refreshStage(play);
    return play;
  }
  if (play.battle) {
    play.selected = play.battle.dest;
    refreshStage(play);
    return play;
  }
  const phase = play.gameState.turnPhase;
  if (play.gameState.phase === GAME_PHASES.CAPITAL_PLACEMENT) {
    if (capitalDests(play).includes(name)) {
      play.destPicked = name;
      play.selected = name;
    } else {
      play.selected = name;
    }
    return play;
  }
  if (play.gameState.phase === GAME_PHASES.UNIT_PLACEMENT) {
    if (deployDests(play).includes(name)) {
      play.destPicked = name;
      play.selected = name;
    } else {
      play.selected = name;
    }
    return play;
  }
  if (phase === TURN_PHASES.MOBILIZE) {
    const gs = play.gameState;
    const playerId = gs.currentPlayer?.id;
    const destWater = play.destPicked && gs.territoryByName?.[play.destPicked]?.isWater;
    if (destWater) {
      const factories = factoriesAdjacentToSeaZone(gs, play.destPicked, playerId);
      if (factories.includes(name)) {
        play.mobilizeFactory = name;
        play.selected = name;
        refreshStage(play);
        return play;
      }
    }
    if (legalPlaceDests(play).includes(name)) {
      if (play.destPicked !== name) play.mobilizeFactory = null;
      play.destPicked = name;
      play.selected = name;
      if (gs.territoryByName?.[name]?.isWater) {
        const factories = factoriesAdjacentToSeaZone(gs, name, playerId);
        if (factories.length === 1) play.mobilizeFactory = factories[0];
      }
    } else {
      play.selected = name;
    }
    return play;
  }
  if (phase !== TURN_PHASES.COMBAT_MOVE && phase !== TURN_PHASES.NON_COMBAT_MOVE) {
    play.selected = name;
    refreshStage(play);
    return play;
  }
  const origins = combatOrigins(play);
  const unitsOn = pickedCount(play.selectedUnits) > 0;
  const dests = legalDests(play);
  const originOk = play.selected && origins.includes(play.selected);

  // bgio nested-stage back: dest → units when origin is re-tapped.
  if (originOk && name === play.selected && play.destPicked && unitsOn) {
    play.destPicked = null;
    refreshStage(play);
    return play;
  }
  if (unitsOn && dests.includes(name)) {
    play.destPicked = name;
    refreshStage(play);
    return play;
  }
  if (origins.includes(name)) {
    if (play.selected === name && !unitsOn) {
      play.selected = null;
      play.selectedUnits = {};
      play.destPicked = null;
      refreshStage(play);
      return play;
    }
    if (play.selected !== name) {
      play.selectedUnits = {};
      play.destPicked = null;
    }
    play.selected = name;
    refreshStage(play);
    return play;
  }
  play.selected = name;
  play.selectedUnits = {};
  play.destPicked = null;
  refreshStage(play);
  return play;
}

export function adjustUnit(play, type, delta = 1) {
  syncPlay(play);
  if (isGameOver(play) || !isHumanTurn(play)) return play;
  const phase = play.gameState.turnPhase;
  if (type === 'ALL' && (phase === TURN_PHASES.COMBAT_MOVE || phase === TURN_PHASES.NON_COMBAT_MOVE)) {
    const stacks = eligibleStacks(play, play.selected);
    play.selectedUnits = maxMoveSelection(stacks);
    if (play.destPicked && !legalDests(play).includes(play.destPicked)) {
      play.destPicked = null;
    }
    refreshStage(play);
    return play;
  }
  const step = Number(delta);
  if (!Number.isFinite(step) || step === 0) return play;

  if (phase === TURN_PHASES.DEVELOP_TECH) {
    if (play.tech?.rolls || play.tech?.breakthrough) {
      if (play.tech.breakthrough && play.gameState.getAvailableTechs(play.gameState.currentPlayer.id).includes(type)) {
        play.tech.pick = step > 0 ? type : (play.tech.pick === type ? null : play.tech.pick);
      }
      return play;
    }
    if (type !== TECH_DIE) return play;
    const ipc = play.gameState.getIPCs(play.gameState.currentPlayer.id);
    const max = Math.floor(ipc / 5);
    play.tech = play.tech || emptyTech();
    play.tech.dice = Math.max(0, Math.min(max, (Number(play.tech.dice) || 0) + step));
    return play;
  }

  if (phase === TURN_PHASES.PURCHASE) {
    if (type === RISK_CARDS) {
      if (step > 0) play.gameState.tradeRiskCards?.(play.gameState.currentPlayer.id);
      return play;
    }
    if (step > 0) play.gameState.addToPendingPurchases(type, play.unitDefs);
    else play.gameState.removeFromPendingPurchases(type, play.unitDefs);
    return play;
  }

  if (play.gameState.phase === GAME_PHASES.UNIT_PLACEMENT) {
    const have = (deployPool(play).find((p) => p.type === type)?.quantity) || 0;
    if (have <= 0) return play;
    const cur = Number(play.selectedUnits[type]) || 0;
    const next = capSelectedToBudget(play, type, cur + step, have);
    if (next <= 0) delete play.selectedUnits[type];
    else play.selectedUnits[type] = next;
    return play;
  }

  if (phase === TURN_PHASES.MOBILIZE) {
    const have = pendingQty(play, type);
    if (have <= 0) return play;
    const cur = Number(play.selectedUnits[type]) || 0;
    const next = Math.max(0, Math.min(have, cur + step));
    if (next <= 0) delete play.selectedUnits[type];
    else play.selectedUnits[type] = next;
    if (!pickedCount(play.selectedUnits)) play.destPicked = play.destPicked;
    return play;
  }

  if (phase !== TURN_PHASES.COMBAT_MOVE && phase !== TURN_PHASES.NON_COMBAT_MOVE) return play;
  if (play.landing) return play;
  const have = stackQty(movableStacks(play, play.selected), type);
  if (have <= 0) return play;
  const cur = Number(play.selectedUnits[type]) || 0;
  const next = Math.max(0, Math.min(have, cur + step));
  if (next <= 0) delete play.selectedUnits[type];
  else play.selectedUnits[type] = next;
  if (!pickedCount(play.selectedUnits)) play.destPicked = null;
  else if (play.destPicked && !legalDests(play).includes(play.destPicked)) {
    play.destPicked = null;
  }
  refreshStage(play);
  return play;
}

export function adjustLanding(play, type, delta = 1) {
  if (!play.landing || !defOf(play, type).isAir) return play;
  const have = Number(play.landing.airLeft?.[type]) || 0;
  if (have <= 0) return play;
  const step = Number(delta);
  if (!Number.isFinite(step) || step === 0) return play;
  const cur = Number(play.landing.pick?.[type]) || 0;
  const next = Math.max(0, Math.min(have, cur + step));
  if (next <= 0) delete play.landing.pick[type];
  else play.landing.pick[type] = next;
  return play;
}

export function adjustLoss(play, side, type, delta = 1) {
  const battle = play.battle;
  if (!battle || battle.step !== BATTLE_STEP.COMBAT_RESULT) return play;
  if (side === 'def') return play;
  const dest = play.gameState.units[battle.dest] || [];
  const player = play.gameState.currentPlayer;
  const menu = lossMenu(dest, player.id, battle.defenseHits);
  if (menu.forced || menu.need <= 0) return play;
  const have = stackQty(dest, type, player.id);
  if (have <= 0) return play;
  const step = Number(delta);
  if (!Number.isFinite(step) || step === 0) return play;
  const cur = { ...(battle.pendingAtt || {}) };
  const thisN = Number(cur[type]) || 0;
  if (menu.need === 1) {
    if (step > 0) battle.pendingAtt = { [type]: 1 };
    else if (thisN > 0) battle.pendingAtt = {};
    return play;
  }
  const used = assignedCount(cur);
  if (step > 0 && thisN < have && used < menu.need) cur[type] = thisN + 1;
  else if (step < 0 && thisN > 0) {
    cur[type] = thisN - 1;
    if (cur[type] <= 0) delete cur[type];
  }
  battle.pendingAtt = cur;
  return play;
}

function rollTech(play) {
  const player = play.gameState.currentPlayer;
  const n = Number(play.tech?.dice) || 0;
  if (n <= 0) return play;
  if (!play.gameState.purchaseTechDice(player.id, n)) return play;
  const prevRoll = play.gameState._rollDie?.bind(play.gameState);
  if (typeof play.rng === 'function' && play.gameState) {
    play.gameState._rollDie = (ctx) => play.rng(ctx);
  }
  const result = play.gameState.rollTechDice(player.id);
  if (prevRoll) play.gameState._rollDie = prevRoll;
  play.tech.dice = 0;
  play.tech.rolls = result.rolls || [];
  play.tech.breakthrough = !!result.success;
  play.tech.pick = null;
  return play;
}

function unlockPickedTech(play) {
  const player = play.gameState.currentPlayer;
  const pick = play.tech?.pick;
  if (play.tech?.breakthrough && pick) {
    play.gameState.unlockTech(player.id, pick);
  }
  play.tech = emptyTech();
  return play;
}

function placePending(play) {
  if (!play.destPicked || !pickedCount(play.selectedUnits)) return play;
  for (const [type, qty] of seaFirstUnitEntries(play.selectedUnits, play.unitDefs)) {
    let left = Number(qty) || 0;
    while (left > 0) {
      const result = play.gameState.mobilizeUnit(type, play.destPicked, play.unitDefs, {
        sourceFactory: play.mobilizeFactory || null,
      });
      if (result?.success === false) break;
      left -= 1;
    }
  }
  play.selectedUnits = {};
  play.destPicked = null;
  return play;
}

export function confirmEnabled(play) {
  syncPlay(play);
  if (isGameOver(play)) return true;
  if (isSetup(play)) {
    if (!isHumanTurn(play)) return false;
    if (play.gameState.phase === GAME_PHASES.CAPITAL_PLACEMENT) {
      return capitalDests(play).includes(play.destPicked);
    }
    if (play.destPicked && pickedCount(play.selectedUnits)) return true;
    return canEndPhase(play);
  }
  if (!isPlaying(play) || !isHumanTurn(play)) return false;
  if (play.income) return true;
  if (play.landing) {
    return !!play.landing.dest && pickedCount(play.landing.pick) > 0;
  }
  if (play.battle) {
    if (play.battle.step === BATTLE_STEP.COMBAT_RESULT) return youLossesReady(play);
    return true;
  }
  const phase = play.gameState.turnPhase;
  if (phase === TURN_PHASES.DEVELOP_TECH) {
    if (play.tech?.breakthrough) return !!play.tech.pick;
    if ((play.tech?.dice || 0) > 0 && !play.tech?.rolls) return true;
    return canEndPhase(play);
  }
  if (phase === TURN_PHASES.MOBILIZE) {
    if (play.destPicked && pickedCount(play.selectedUnits)) {
      const water = play.gameState.territoryByName?.[play.destPicked]?.isWater;
      if (water) {
        const factories = factoriesAdjacentToSeaZone(
          play.gameState,
          play.destPicked,
          play.gameState.currentPlayer?.id,
        );
        if (factories.length > 1 && !play.mobilizeFactory) return false;
      }
      return true;
    }
    return canEndPhase(play);
  }
  if (phase === TURN_PHASES.COMBAT_MOVE || phase === TURN_PHASES.NON_COMBAT_MOVE) {
    const stage = playStage(play);
    if (stage === PLAY_STAGE.CONFIRM) return true;
    if (stage === PLAY_STAGE.IDLE) return canEndPhase(play);
    return false;
  }
  return canEndPhase(play);
}

export function confirmGold(play) {
  return confirmEnabled(play);
}

export function canUndo(play) {
  syncPlay(play);
  if (!play?.gameState || !isHumanTurn(play) || isGameOver(play)) return false;
  if (play.income) return true;
  if (play.battle) return false;
  if (play.landing) {
    return !!(pickedCount(play.landing.pick) || play.landing.dest);
  }
  if (play.tech?.rolls || play.tech?.breakthrough) return false;
  const gs = play.gameState;
  if (gs.phase === GAME_PHASES.CAPITAL_PLACEMENT) return !!gs.canUndoLastCapital?.();
  if (gs.phase === GAME_PHASES.UNIT_PLACEMENT) {
    return (gs.placementHistory || []).length > 0
      || (Number(gs.unitsPlacedThisRound) || 0) > 0;
  }
  const phase = gs.turnPhase;
  if (phase === TURN_PHASES.PURCHASE) {
    return (gs.pendingPurchases || []).some((p) => p.owner === gs.currentPlayer?.id && (Number(p.quantity) || 0) > 0);
  }
  if (phase === TURN_PHASES.COMBAT_MOVE || phase === TURN_PHASES.NON_COMBAT_MOVE) {
    if (play.landing) return false;
    return (gs.moveHistory || []).length > (gs.undoLockMoveCount || 0);
  }
  if (phase === TURN_PHASES.MOBILIZE) return (gs.mobilizationHistory || []).length > 0;
  return false;
}

export function undoMoveById(play, id) {
  if (!play?.gameState) return play;
  play.gameState.undoMoveById?.(id);
  play.selectedUnits = {};
  play.destPicked = null;
  play.targetShipId = null;
  return play;
}

export function undoAllMoves(play) {
  if (!play?.gameState) return play;
  play.gameState.undoAllMoves?.();
  play.selectedUnits = {};
  play.destPicked = null;
  play.targetShipId = null;
  return play;
}

export function undoLast(play) {
  if (!canUndo(play)) return play;
  if (play.income) {
    play.income = null;
    refreshStage(play);
    return play;
  }
  const gs = play.gameState;
  if (play.landing) {
    play.landing.pick = {};
    play.landing.dest = null;
    play.gameState?.clearAirLandingSelections?.(play.landing.origin);
    refreshStage(play);
    return play;
  }
  if (gs.phase === GAME_PHASES.CAPITAL_PLACEMENT) {
    gs.undoLastCapital?.();
    resetUi(play);
    return play;
  }
  if (gs.phase === GAME_PHASES.UNIT_PLACEMENT) {
    gs.undoPlacement?.();
    play.selectedUnits = {};
    play.destPicked = null;
    return play;
  }
  const phase = gs.turnPhase;
  if (phase === TURN_PHASES.PURCHASE) {
    gs.undoLastPurchase?.(play.unitDefs);
    return play;
  }
  if (phase === TURN_PHASES.COMBAT_MOVE || phase === TURN_PHASES.NON_COMBAT_MOVE) {
    gs.undoLastMove?.();
    play.selectedUnits = {};
    play.destPicked = null;
    play.targetShipId = null;
    return play;
  }
  if (phase === TURN_PHASES.MOBILIZE) {
    gs.undoMobilization?.(play.unitDefs);
    play.selectedUnits = {};
    play.destPicked = null;
    return play;
  }
  return play;
}

export function confirmLabel(play) {
  syncPlay(play);
  if (isGameOver(play)) return 'New Game vs AI';
  if (!isHumanTurn(play)) {
    return play.aiStatus || `${play.gameState.currentPlayer?.name || 'AI'} thinking…`;
  }
  if (play.gameState.phase === GAME_PHASES.CAPITAL_PLACEMENT) {
    return play.destPicked ? `Confirm: Capital in ${play.destPicked}` : 'Tap your land';
  }
  if (play.gameState.phase === GAME_PHASES.UNIT_PLACEMENT) {
    const wave = deployWave(play);
    if (play.destPicked && pickedCount(play.selectedUnits)) {
      return `Confirm: Deploy in ${play.destPicked}`;
    }
    if (canEndPhase(play)) return wave.passLabel;
    if (pickedCount(play.selectedUnits)) return `Pick a land · ${wave.placed} of ${wave.limit}`;
    return wave.passLabel;
  }
  if (play.income) {
    if (play.income.blocked) return 'Confirm: No income · capital lost';
    return `Confirm: Collect ${play.income.amount} IPC`;
  }
  if (play.landing) {
    if (!play.landing.dest) return 'Pick a teal land';
    if (!pickedCount(play.landing.pick)) return 'Select planes';
    return `Confirm: Land in ${play.landing.dest}`;
  }
  if (play.battle) {
    const step = play.battle.step;
    if (step === BATTLE_STEP.AA_READY) return 'Confirm: Fire AA';
    if (step === BATTLE_STEP.AA_RESULT) return 'Confirm: Continue';
    if (step === BATTLE_STEP.COMBAT_READY) return 'Confirm: Roll combat';
    if (step === BATTLE_STEP.COMBAT_RESULT) {
      return youLossesReady(play) ? 'Confirm: Take hits' : 'Assign casualties';
    }
    if (step === BATTLE_STEP.WON) {
      return play.battle.failed ? 'Confirm: Next' : `Confirm: Take ${play.battle.dest}`;
    }
  }
  const phase = play.gameState.turnPhase;
  if (phase === TURN_PHASES.DEVELOP_TECH) {
    if (play.tech?.breakthrough) {
      return play.tech.pick
        ? `Confirm: Unlock ${TECHNOLOGIES[play.tech.pick]?.name || play.tech.pick}`
        : 'Pick a technology';
    }
    if ((play.tech?.dice || 0) > 0 && !play.tech?.rolls) {
      return `Confirm: Roll ${play.tech.dice} tech dice`;
    }
  }
  if (phase === TURN_PHASES.MOBILIZE && play.destPicked && pickedCount(play.selectedUnits)) {
    return `Confirm: Place in ${play.destPicked}`;
  }
  if (phase === TURN_PHASES.PURCHASE) {
    const shop = shopCapacity(play);
    if (shop.used) return `End Phase · Purchase · ${shop.used} queued`;
  }
  if ((phase === TURN_PHASES.COMBAT_MOVE || phase === TURN_PHASES.NON_COMBAT_MOVE)
    && playStage(play) === PLAY_STAGE.CONFIRM) {
    const destT = play.gameState.territoryByName[play.destPicked];
    const fromT = play.gameState.territoryByName[play.selected];
    if (!fromT?.isWater && destT?.isWater && hasGround(play.selectedUnits, play.unitDefs)) {
      return `Confirm: Load TRN · ${play.destPicked}`;
    }
    if (!fromT?.isWater && destT?.isWater && hasAir(play.selectedUnits, play.unitDefs)
      && hasFriendlyCarrier(play, play.destPicked) && !hasEnemyShips(play, play.destPicked)) {
      return `Confirm: Land CV · ${play.destPicked}`;
    }
    if (fromT?.isWater && destT && !destT.isWater && hasGround(play.selectedUnits, play.unitDefs)) {
      return `Confirm: Unload · ${play.destPicked}`;
    }
    return phase === TURN_PHASES.COMBAT_MOVE
      ? 'Confirm Attack'
      : `Confirm: Move to ${play.destPicked}`;
  }
  if (phase === TURN_PHASES.COMBAT_MOVE || phase === TURN_PHASES.NON_COMBAT_MOVE) {
    const stage = playStage(play);
    if (stage === PLAY_STAGE.ORIGIN) return 'Tap units';
    if (stage === PLAY_STAGE.UNITS || stage === PLAY_STAGE.DEST) return 'Tap destination';
  }
  if (canEndPhase(play)) return `End Phase · ${TURN_PHASE_NAMES[phase] || phase}`;
  if (phase === TURN_PHASES.NON_COMBAT_MOVE && ncmAirRemaining(play) > 0) {
    return `Land ${ncmAirRemaining(play)} aircraft`;
  }
  return TURN_PHASE_NAMES[phase] || 'Confirm';
}

export function confirm(play) {
  syncPlay(play);
  if (!confirmEnabled(play)) return play;
  if (isGameOver(play)) {
    play._newGame = true;
    return play;
  }
  if (play.gameState.phase === GAME_PHASES.CAPITAL_PLACEMENT) {
    if (play.destPicked) {
      play.gameState.placeCapital(play.destPicked);
      resetUi(play);
    }
    return play;
  }
  if (play.gameState.phase === GAME_PHASES.UNIT_PLACEMENT) {
    if (play.destPicked && pickedCount(play.selectedUnits)) {
      for (const [type, qty] of seaFirstUnitEntries(play.selectedUnits, play.unitDefs)) {
        let left = Number(qty) || 0;
        while (left > 0) {
          const result = play.gameState.placeInitialUnit(play.destPicked, type, play.unitDefs);
          if (result?.success === false) break;
          left -= 1;
        }
      }
      play.selectedUnits = {};
      play.destPicked = null;
      return play;
    }
    if (canEndPhase(play)) {
      resetUi(play);
      play.gameState.finishPlacementRound(play.unitDefs, { allowNavalSkip: true });
    }
    return play;
  }
  if (play.income) {
    play.income = null;
    resetUi(play);
    play.gameState.nextPhase();
    syncPlay(play);
    return play;
  }
  if (play.landing) return applyLanding(play);
  if (play.battle) {
    const step = play.battle.step;
    if (step === BATTLE_STEP.AA_READY) return rollAA(play);
    if (step === BATTLE_STEP.AA_RESULT) {
      if (failCloseIfWiped(play)) return play;
      play.battle.step = BATTLE_STEP.COMBAT_READY;
      return play;
    }
    if (step === BATTLE_STEP.COMBAT_READY) return rollCombat(play);
    if (step === BATTLE_STEP.COMBAT_RESULT) return applyHits(play);
    if (step === BATTLE_STEP.WON) return startAirLand(play);
  }
  const phase = play.gameState.turnPhase;
  if (phase === TURN_PHASES.DEVELOP_TECH) {
    if (play.tech?.breakthrough && play.tech.pick) {
      unlockPickedTech(play);
      resetUi(play);
      play.gameState.nextPhase();
      syncPlay(play);
      return play;
    }
    if ((play.tech?.dice || 0) > 0 && !play.tech?.rolls) return rollTech(play);
  }
  if (phase === TURN_PHASES.MOBILIZE && play.destPicked && pickedCount(play.selectedUnits)) {
    return placePending(play);
  }
  if ((phase === TURN_PHASES.COMBAT_MOVE || phase === TURN_PHASES.NON_COMBAT_MOVE)
    && playStage(play) === PLAY_STAGE.CONFIRM) {
    const from = combatOrigins(play).includes(play.selected)
      ? play.selected
      : combatOrigins(play)[0];
    const fromT = play.gameState.territoryByName[from];
    const destT = play.gameState.territoryByName[play.destPicked];
    const groundOnly = hasGround(play.selectedUnits, play.unitDefs)
      && !hasSea(play.selectedUnits, play.unitDefs);
    if (fromT?.isWater && destT && !destT.isWater && groundOnly) {
      const result = play.gameState.unloadTransport?.(
        from,
        transportIndexFor(play, from),
        play.destPicked,
      );
      if (result?.success !== false) {
        play.selected = null;
        play.selectedUnits = {};
        play.destPicked = null;
        play.targetShipId = null;
      }
      refreshStage(play);
      return play;
    }
    const result = play.gameState.moveUnits(
      from,
      play.destPicked,
      unitsToMoveFromPick(play.selectedUnits),
      play.unitDefs,
      play.targetShipId ? { targetShipId: play.targetShipId } : {},
    );
    if (result?.success !== false) {
      play.selected = null;
      play.selectedUnits = {};
      play.destPicked = null;
      play.targetShipId = null;
    }
    refreshStage(play);
    return play;
  }
  if (canEndPhase(play)) {
    if (wouldCollectOnEnd(play) && !play.income) {
      play.income = incomePreview(play);
      refreshStage(play);
      return play;
    }
    resetUi(play);
    play.gameState.nextPhase();
    syncPlay(play);
  }
  return play;
}

export function highlights(play) {
  syncPlay(play);
  const out = {
    origin: null,
    dest: null,
    legal: [],
    landable: [],
    selected: play.selected || null,
    pulse: [],
    teal: LAND_TEAL,
  };
  if (isGameOver(play)) return out;
  if (play.income) return out;
  if (play.landing) {
    out.dest = play.landing.origin;
    out.landable = [...play.landing.landable];
    if (play.landing.dest) out.selected = play.landing.dest;
    return out;
  }
  if (play.gameState.phase === GAME_PHASES.CAPITAL_PLACEMENT) {
    out.legal = capitalDests(play);
    if (!play.destPicked) out.pulse.push(...out.legal);
    if (play.destPicked) out.dest = play.destPicked;
    return out;
  }
  if (play.gameState.phase === GAME_PHASES.UNIT_PLACEMENT) {
    out.legal = deployDests(play);
    if (!play.destPicked) out.pulse.push(...out.legal);
    if (play.destPicked) out.dest = play.destPicked;
    return out;
  }
  if (play.gameState.turnPhase === TURN_PHASES.MOBILIZE) {
    out.legal = legalPlaceDests(play);
    if (!play.destPicked) out.pulse.push(...out.legal);
    if (play.destPicked) out.dest = play.destPicked;
    return out;
  }
  if (play.battle) {
    out.dest = play.battle.dest;
    out.selected = play.battle.dest;
    return out;
  }
  const phase = play.gameState.turnPhase;
  if (phase === TURN_PHASES.COMBAT_MOVE || phase === TURN_PHASES.NON_COMBAT_MOVE) {
    const stage = playStage(play);
    const origins = combatOrigins(play);
    if (play.selected && origins.includes(play.selected)) out.origin = play.selected;
    if (stage === PLAY_STAGE.IDLE || stage === PLAY_STAGE.ORIGIN) {
      out.pulse.push(...origins);
    }
    if (stage === PLAY_STAGE.UNITS || stage === PLAY_STAGE.DEST || stage === PLAY_STAGE.CONFIRM) {
      out.legal = legalDests(play);
      if (stage === PLAY_STAGE.UNITS || stage === PLAY_STAGE.DEST) out.pulse.push(...out.legal);
    }
    if (play.destPicked) out.dest = play.destPicked;
  }
  return out;
}

export function humanWon(play) {
  const gs = play?.gameState;
  if (!gs?.gameOver) return false;
  const humans = (gs.players || []).filter((p) => !p.isAI);
  if (!humans.length) return false;
  const winner = gs.winner;
  if (winner === 'Allies') return humans.some((p) => p.alliance === 'Allies');
  if (winner === 'Axis') return humans.some((p) => p.alliance === 'Axis');
  if (String(winner || '').startsWith('Team')) {
    return humans.some((p) => `Team ${p.teamId}` === winner);
  }
  return humans.some((p) => p.name === winner || p.id === winner);
}

function victoryCard(play) {
  const gs = play.gameState;
  const winner = gs.winner || 'Victory';
  const won = humanWon(play);
  const title = winner === 'Allies' ? 'Allied Victory!'
    : winner === 'Axis' ? 'Axis Victory!'
      : `${winner} Wins!`;
  return {
    kicker: won ? 'Victory' : 'Defeat',
    title,
    body: `${gs.winCondition || 'Match over'} · Round ${gs.round || 1}`,
    dice: [],
  };
}

function incomeCard(play) {
  const income = play.income || incomePreview(play);
  return {
    kicker: 'Income',
    title: income.blocked ? 'Capital captured' : `+${income.amount} IPC`,
    body: income.blocked
      ? 'No collect this turn · Confirm to hand off'
      : 'Production + continent bonus · Confirm to collect and hand off',
    dice: [],
  };
}

function techCard(play) {
  const tech = play.tech;
  if (!tech?.rolls && !tech?.breakthrough) return null;
  if (tech.breakthrough) {
    const available = play.gameState.getAvailableTechs(play.gameState.currentPlayer.id);
    const name = tech.pick ? (TECHNOLOGIES[tech.pick]?.name || tech.pick) : 'Choose a technology';
    return {
      kicker: 'Breakthrough',
      title: name,
      body: tech.pick
        ? (TECHNOLOGIES[tech.pick]?.description || '')
        : 'Tap a tech, then Confirm',
      dice: (tech.rolls || []).map((face) => ({ face, hit: face === 6 })),
      techs: available.map((id) => ({
        id,
        name: TECHNOLOGIES[id]?.name || id,
        info: TECHNOLOGIES[id]?.description || '',
        on: tech.pick === id,
      })),
      pickers: [],
    };
  }
  return {
    kicker: 'Research',
    title: 'No breakthrough',
    body: 'End Phase when ready',
    dice: (tech.rolls || []).map((face) => ({ face, hit: face === 6 })),
  };
}

export function battleCard(play) {
  if (isGameOver(play)) return victoryCard(play);
  if (play.income) return incomeCard(play);
  if (play.gameState?.turnPhase === TURN_PHASES.DEVELOP_TECH && isHumanTurn(play)) {
    return techCard(play);
  }
  const battle = play.battle;
  if (!battle) return null;
  const dest = battle.dest;
  if (battle.step === BATTLE_STEP.AA_READY) {
    return {
      kicker: 'AA fire',
      title: dest,
      body: `${battle.aaGuns} gun vs ${battle.aaPlanes} aircraft · hit on 1`,
      dice: [],
    };
  }
  if (battle.step === BATTLE_STEP.AA_RESULT) {
    return {
      kicker: 'AA results',
      title: battle.aaHits ? `Hit ×${battle.aaHits}` : 'Missed',
      body: battle.aaHits ? 'Cheapest aircraft removed' : 'Aircraft safe · next is combat',
      dice: battle.aaDice.map((face) => ({ face, hit: face === 1 })),
    };
  }
  if (battle.step === BATTLE_STEP.COMBAT_READY) {
    const stacks = play.gameState.units[dest] || [];
    const player = play.gameState.currentPlayer;
    const attackers = getFriendlyCombatUnits(stacks, player.id);
    const defenders = getEnemyCombatUnits(stacks, player.id, (a, b) => play.gameState.areAllies(a, b));
    const pct = phoneCombatAttackerWinPercent({
      attackers,
      defenders,
      unitDefs: play.unitDefs,
    });
    const odds = formatPhoneCombatHeroOdds({
      attackerWinPercent: pct,
      territoryName: dest,
      hasAttackers: countLivingUnits(attackers) > 0,
      hasDefenders: countLivingUnits(defenders) > 0,
    });
    return {
      kicker: battle.round ? `Round ${battle.round + 1}` : 'Combat',
      title: dest,
      body: `${player?.name || 'You'} attack · ${odds.text} ${odds.label}`,
      dice: [],
    };
  }
  if (battle.step === BATTLE_STEP.COMBAT_RESULT) {
    const stacks = play.gameState.units[dest] || [];
    const player = play.gameState.currentPlayer;
    const attMenu = lossMenu(stacks, player.id, battle.defenseHits);
    const defMenu = lossMenu(stacks, battle.defOwner, battle.attackHits);
    return {
      kicker: `Round ${battle.round} · ${dest}`,
      title: `You ${battle.attackHits} hits · they ${battle.defenseHits} hit${battle.defenseHits === 1 ? '' : 's'}`,
      body: `You take ${attMenu.need} · they take ${defMenu.need}`,
      split: true,
      lanes: [
        { side: 'atk', label: 'You attack', hits: battle.attackHits, dice: battle.attackDice },
        { side: 'def', label: 'They defend', hits: battle.defenseHits, dice: battle.defenseDice },
      ],
      pickers: [
        attMenu.need > 0 && !attMenu.forced ? {
          side: 'att',
          label: `You take ${attMenu.need}`,
          need: attMenu.need,
          taken: { ...(battle.pendingAtt || {}) },
          units: attMenu.units,
        } : null,
        defMenu.need > 0 ? {
          side: 'def',
          readOnly: true,
          label: `They take ${defMenu.need}`,
          need: defMenu.need,
          taken: { ...(battle.pendingDef || {}) },
          units: defMenu.units,
        } : null,
      ].filter(Boolean),
    };
  }
  if (battle.step === BATTLE_STEP.WON) {
    return {
      kicker: battle.failed ? 'Held' : 'Taken',
      title: battle.failed ? 'Defender holds' : dest,
      body: battle.failed ? 'No landing' : 'Land aircraft next',
      dice: [],
    };
  }
  return null;
}

export function chromeModel(play, territories = []) {
  syncPlay(play);
  const marks = highlights(play);
  const strip = phaseStrip(play);
  const phase = play.gameState.turnPhase;
  const player = play.gameState.currentPlayer;
  const landName = play.landing?.dest
    || (play.landing ? null : (play.selected || marks.dest || marks.origin));
  const land = territories.find?.((t) => t.name === landName) || (landName ? { name: landName } : null);
  const movePhase = phase === TURN_PHASES.COMBAT_MOVE || phase === TURN_PHASES.NON_COMBAT_MOVE;
  const origin = play.selected;
  const stage = playStage(play);
  const showSteppers = movePhase && origin && eligibleStacks(play, origin).length
    && (stage === PLAY_STAGE.ORIGIN || stage === PLAY_STAGE.UNITS
      || stage === PLAY_STAGE.DEST || stage === PLAY_STAGE.CONFIRM);
  const budget = selectionBudget(play);
  const usedPick = pickedCount(play.selectedUnits);
  let steppers = showSteppers
    ? eligibleStacks(play, origin).map((s) => ({
      type: s.type,
      have: s.quantity,
      picked: Number(play.selectedUnits?.[s.type]) || 0,
      owner: s.owner,
      plusOff: Number.isFinite(budget) && usedPick >= budget,
    }))
    : null;
  if (phase === TURN_PHASES.PURCHASE && isHumanTurn(play) && !isGameOver(play)) {
    const ipc = play.gameState.getIPCs(player.id);
    const shop = shopCapacity(play);
    steppers = purchasableTypes(play).map((type) => {
      const cost = unitCost(play, type);
      const pending = pendingQty(play, type);
      const can = cost > 0 ? Math.floor(ipc / cost) : 0;
      return {
        type,
        have: pending + Math.min(can, shop.left),
        picked: pending,
        owner: player.id,
        short: `${BUY_SHORT[type] || type.slice(0, 3).toUpperCase()} ${cost}`,
      };
    });
    if (play.gameState.canTradeRiskCards?.(player.id)) {
      const value = play.gameState.getNextRiskCardValue?.(player.id) || 0;
      steppers.unshift({
        type: RISK_CARDS,
        have: 1,
        picked: 0,
        owner: player.id,
        short: `SET +${value}`,
      });
    }
  }
  if (phase === TURN_PHASES.DEVELOP_TECH && isHumanTurn(play) && !isGameOver(play)
    && !play.tech?.rolls && !play.tech?.breakthrough) {
    const ipc = play.gameState.getIPCs(player.id);
    const max = Math.floor(ipc / 5);
    steppers = [{
      type: TECH_DIE,
      have: Math.max(max, play.tech?.dice || 0),
      picked: play.tech?.dice || 0,
      owner: player.id,
      short: 'DIE 5',
    }];
  }
  if (phase === TURN_PHASES.MOBILIZE && isHumanTurn(play) && !isGameOver(play)) {
    steppers = pendingPurchasesOf(play).map((p) => ({
      type: p.type,
      have: p.quantity,
      picked: Number(play.selectedUnits?.[p.type]) || 0,
      owner: player.id,
    }));
  }
  if (play.gameState.phase === GAME_PHASES.UNIT_PLACEMENT && isHumanTurn(play)) {
    steppers = deployPool(play).map((p) => ({
      type: p.type,
      have: p.quantity,
      picked: Number(play.selectedUnits?.[p.type]) || 0,
      owner: player.id,
      plusOff: Number.isFinite(budget) && usedPick >= budget,
    }));
  }
  const planeSteppers = play.landing
    ? Object.entries(play.landing.airLeft || {})
      .filter(([, n]) => Number(n) > 0)
      .map(([type, have]) => ({
        type,
        have: Number(have) || 0,
        picked: Number(play.landing.pick?.[type]) || 0,
        owner: play.gameState.currentPlayer?.id,
      }))
    : null;
  let route = '';
  if (movePhase && play.destPicked) route = `${origin} → ${play.destPicked}`;
  else if (play.income) {
    route = play.income.blocked ? 'No income' : `+${play.income.amount} IPC`;
  } else if (play.landing) route = play.landing.dest ? `Confirm land · ${play.landing.dest}` : 'Pick a teal land';
  else if (phase === TURN_PHASES.PURCHASE) {
    const shop = shopCapacity(play);
    route = `${shop.used}/${shop.max} queued`;
  }   else if (phase === TURN_PHASES.MOBILIZE && play.destPicked) {
    route = play.mobilizeFactory
      ? `Place · ${play.destPicked} from ${play.mobilizeFactory}`
      : `Place · ${play.destPicked}`;
  } else if (play.gameState.phase === GAME_PHASES.CAPITAL_PLACEMENT && play.destPicked) {
    route = `Capital · ${play.destPicked}`;
  } else if (play.gameState.phase === GAME_PHASES.UNIT_PLACEMENT && play.destPicked) {
    route = `Deploy · ${play.destPicked}`;
  }
  let sheetLand = play.landing ? (land || { name: 'Land aircraft' }) : land;
  if (play.income) sheetLand = { name: 'Collect Income' };
  if (!sheetLand && phase === TURN_PHASES.PURCHASE) sheetLand = { name: 'Purchase' };
  if (!sheetLand && phase === TURN_PHASES.MOBILIZE) sheetLand = { name: play.destPicked || 'Mobilize' };
  if (!sheetLand && phase === TURN_PHASES.DEVELOP_TECH && !battleCard(play)) {
    sheetLand = { name: 'Research' };
  }
  if (!sheetLand && play.gameState.phase === GAME_PHASES.CAPITAL_PLACEMENT) {
    sheetLand = { name: play.destPicked || 'Place capital' };
  }
  if (!sheetLand && play.gameState.phase === GAME_PHASES.UNIT_PLACEMENT) {
    sheetLand = { name: play.destPicked || 'Deploy' };
  }
  const wave = play.gameState.phase === GAME_PHASES.UNIT_PLACEMENT ? deployWave(play) : null;
  if (wave && !route) route = wave.meter;
  const destName = play.destPicked;
  const destIsWater = !!(destName && play.gameState.territoryByName?.[destName]?.isWater);
  const seaSelected = !!(landName && play.gameState.territoryByName?.[landName]?.isWater);
  const cargoName = movePhase && (destIsWater ? destName : (seaSelected ? landName : null));
  return {
    land: annotatePoliticalOwner(sheetLand, play.gameState),
    stacks: play.landing
      ? []
      : (landName
        ? (movePhase ? eligibleStacks(play, landName) : (play.gameState.units[landName] || []))
        : []),
    steppers: play.landing ? planeSteppers : steppers,
    showAll: !!(movePhase && !play.landing && showSteppers),
    airLand: !!play.landing,
    label: confirmLabel(play),
    gold: confirmGold(play),
    enabled: confirmEnabled(play),
    battle: battleCard(play),
    route,
    phaseStrip: strip.steps,
    phaseStripCurrent: strip.current,
    highlights: marks,
    canUndo: canUndo(play),
    moves: movePhase ? listAddressableMoveRows(play.gameState.moveHistory, {
      turnPhase: phase,
      undoLockMoveCount: play.gameState.undoLockMoveCount || 0,
    }).map((row) => ({
      id: row.id,
      canUndo: row.canUndo,
      label: formatRecentMove(row.move),
    })).filter((row) => row.label) : [],
    cargo: cargoName ? cargoManifest(play, cargoName) : [],
    targetShipId: play.targetShipId || null,
    researchHint: phase === TURN_PHASES.DEVELOP_TECH && !play.tech?.rolls && !play.tech?.breakthrough,
    stage,
    battleOpen: !!play.battle || !!play.income || stage === PLAY_STAGE.AIR_LAND,
  };
}

export function pickShip(play, shipId) {
  play.targetShipId = shipId || null;
  return play;
}

export const CARGO_SEED = {
  land: 'East US',
  sea: 'East US Sea Zone',
  type: 'infantry',
};

export function applyCargoSeed(play) {
  const gs = play?.gameState;
  if (!gs) return play;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  play._phase = TURN_PHASES.COMBAT_MOVE;
  play._player = gs.currentPlayer?.id || play._player;
  play.selected = CARGO_SEED.land;
  play.selectedUnits = { [CARGO_SEED.type]: 1 };
  play.destPicked = CARGO_SEED.sea;
  const ships = cargoManifest(play, CARGO_SEED.sea);
  play.targetShipId = ships[0]?.id || ships[0]?.key || null;
  return play;
}

export function inspectPlay(play) {
  syncPlay(play);
  const gs = play.gameState;
  return {
    turnPhase: gs.turnPhase,
    turnPhaseName: TURN_PHASE_NAMES[gs.turnPhase] || gs.turnPhase,
    currentPlayer: gs.currentPlayer?.id || null,
    isAI: !!gs.currentPlayer?.isAI,
    selected: play.selected,
    dest: play.destPicked,
    selectedUnits: { ...(play.selectedUnits || {}) },
    stage: playStage(play),
    legalDests: legalDests(play),
    confirmLabel: confirmLabel(play),
    confirmEnabled: confirmEnabled(play),
    canEndPhase: canEndPhase(play),
    canUndo: canUndo(play),
    battleStep: play.battle?.step || null,
    battleDest: play.battle?.dest || null,
    landingDest: play.landing?.dest || null,
    airLeft: { ...(play.landing?.airLeft || {}) },
    queue: [...(gs.combatQueue || [])],
    ncmAirRemaining: ncmAirRemaining(play),
    ipc: gs.getIPCs?.(gs.currentPlayer?.id) ?? 0,
    pending: pendingQty(play),
    shop: shopCapacity(play),
    techDice: play.tech?.dice || 0,
    techRolls: [...(play.tech?.rolls || [])],
    techPick: play.tech?.pick || null,
    breakthrough: !!play.tech?.breakthrough,
    unlocked: [...(gs.playerTechs?.[gs.currentPlayer?.id]?.unlockedTechs || [])],
    income: play.income ? { ...play.income } : null,
    lastIncome: gs.lastIncome ? { ...gs.lastIncome } : null,
    buyTypes: purchasableTypes(play),
    canTradeCards: !!gs.canTradeRiskCards?.(gs.currentPlayer?.id),
    humanWon: humanWon(play),
    gameOver: !!gs.gameOver,
    winner: gs.winner || null,
    wantNewGame: !!play._newGame,
    placeDests: legalPlaceDests(play),
    setupPhase: gs.phase || null,
    capitalDests: capitalDests(play),
    deployDests: deployDests(play),
    deployLeft: deployPool(play).reduce((n, p) => n + (Number(p.quantity) || 0), 0),
    deployWave: deployWave(play),
  };
}
