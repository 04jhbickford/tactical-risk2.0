// Action Log - tracks and displays all player actions during the game
// Now integrated into the sidebar/player panel

import { possessivePhrase } from '../utils/possessive.js';
import { emitGameEvent, mapActionLogTypeToKind, shouldFanOutActionLogType } from '../multiplayer/gameEventLog.js';

export class ActionLog {
  constructor() {
    this.gameState = null;
    this.entries = [];
    this.maxEntries = 200; // Keep last 200 entries
    this._unsubscribe = null;
    this.onHighlightTerritory = null; // Callback for territory highlighting
    this.onHighlightMovement = null; // Callback for movement arrow highlighting
    this.isCollapsed = true; // Start collapsed

    this._create();
  }

  // Set callback for highlighting territories on hover
  setHighlightCallback(callback) {
    this.onHighlightTerritory = callback;
  }

  // Set callback for highlighting movement arrows
  setMovementHighlightCallback(callback) {
    this.onHighlightMovement = callback;
  }

  _create() {
    // Note: Visual display is now handled by PlayerPanel's Log tab
    // This class just stores entries and provides logging methods
    this.el = null;
    this.contentEl = null;
  }

  setGameState(gameState) {
    if (this._unsubscribe) {
      this._unsubscribe();
    }

    this.gameState = gameState;
    this.entries = [];
    // Note: Visual rendering is handled by PlayerPanel
  }

  show() {
    // No-op: display handled by PlayerPanel
  }

  hide() {
    // No-op: display handled by PlayerPanel
  }

  // Log a game action
  log(type, data) {
    const entry = {
      id: Date.now() + Math.random(),
      type,
      data,
      timestamp: new Date(),
      round: this.gameState?.round || 1,
      player: this.gameState?.currentPlayer || null,
    };

    this.entries.push(entry);

    // Trim old entries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }

    // Cloud fan-out for UI-only actions (phase/move/combat already emit from gameState).
    try {
      if (shouldFanOutActionLogType(type)) {
        emitGameEvent(mapActionLogTypeToKind(type), {
          gameState: this.gameState,
          territory: data?.territory || data?.to || null,
          payload: { action: type, ...data },
        });
      }
    } catch {
      // fail-closed
    }

    // Note: Visual rendering is handled by PlayerPanel's Log tab
    // which reads this.entries directly
  }

  // Convenience methods for common actions
  logMove(from, to, units, player) {
    const unitStr = units.map(u => `${u.quantity} ${u.type}`).join(', ');
    this.log('move', {
      message: `${player.name} moved ${unitStr} from ${from} to ${to}`,
      from, to, units,
      color: player.color
    });
  }

  logAttack(from, to, attacker, defender) {
    this.log('attack', {
      message: `${attacker.name} attacks ${to} from ${from}`,
      from, to,
      color: attacker.color
    });
  }

  logCombatResult(territory, result, attacker, defender) {
    const winner = result.winner === 'attacker' ? attacker.name : defender?.name || 'Defender';
    this.log('combat', {
      message: `Battle at ${territory}: ${winner} wins! (${result.attackHits} vs ${result.defenseHits} hits)`,
      territory, result,
      color: result.winner === 'attacker' ? attacker.color : defender?.color || '#888'
    });
  }

  // Log a complete combat summary with attacker, defender, losses, and winner
  logCombatSummary(territory, attacker, defender, attackerLosses, defenderLosses, winner, conquered) {
    const attackerLossStr = attackerLosses.length > 0
      ? attackerLosses.map(u => `${u.quantity} ${u.type}`).join(', ')
      : 'none';
    const defenderLossStr = defenderLosses.length > 0
      ? defenderLosses.map(u => `${u.quantity} ${u.type}`).join(', ')
      : 'none';

    const winnerName = winner === 'attacker' ? attacker.name : defender?.name || 'Defender';
    const outcome = conquered ? 'CONQUERED' : 'DEFENDED';

    this.log('combat-summary', {
      message: `⚔️ ${territory}: ${attacker.name} vs ${defender?.name || 'Defender'} → ${winnerName} ${outcome}`,
      detail: `Losses: ${attacker.name} lost ${attackerLossStr}, ${defender?.name || 'Defender'} lost ${defenderLossStr}`,
      territory,
      attacker: attacker.name,
      defender: defender?.name || 'Defender',
      winner: winnerName,
      conquered,
      color: winner === 'attacker' ? attacker.color : defender?.color || '#888'
    });
  }

  logCapture(territory, player) {
    this.log('capture', {
      message: `${player.name} captures ${territory}!`,
      territory,
      color: player.color
    });
  }

  logPurchase(units, player) {
    const unitStr = units.map(u => `${u.quantity} ${u.type}`).join(', ');
    this.log('purchase', {
      message: `${player.name} purchased ${unitStr}`,
      units,
      color: player.color
    });
  }

  logCapitalPlacement(territory, player) {
    this.log('capital', {
      message: `${player.name} placed capital at ${territory}`,
      territory,
      color: player.color
    });
  }

  logPhaseChange(phase, player) {
    this.log('phase', {
      message: `${player.name}: ${phase}`,
      phase,
      color: player.color
    });
  }

  logTurnStart(player, round) {
    this.log('turn', {
      message: `Round ${round} - ${possessivePhrase(player.name, 'turn')} begins`,
      round,
      color: player.color
    });
  }

  logTechResearch(player, techName, success) {
    if (success) {
      this.log('tech', {
        message: `${player.name} unlocked ${techName}!`,
        tech: techName,
        color: player.color
      });
    } else {
      this.log('tech', {
        message: `${player.name} failed to research technology`,
        color: player.color
      });
    }
  }

  logCardTrade(player, value) {
    this.log('cards', {
      message: `${player.name} traded RISK cards for ${value} IPCs`,
      value,
      color: player.color
    });
  }

  logCardEarned(player, cardType) {
    this.log('card-earned', {
      message: `${player.name} earned a Risk card: ${cardType}`,
      cardType,
      color: player.color
    });
  }

  logIncome(player, amount) {
    this.log('income', {
      message: `${player.name} collected ${amount} IPCs`,
      amount,
      color: player.color
    });
  }

  logInitialPlacement(player, unitType, territory) {
    this.log('placement', {
      message: `${player.name} placed ${unitType} in ${territory}`,
      unitType,
      territory,
      color: player.color
    });
  }

  logNonCombatMove(from, to, units, player) {
    const unitStr = units.map(u => `${u.quantity} ${u.type}`).join(', ');
    this.log('ncm', {
      message: `${player.name} moved ${unitStr} from ${from} to ${to}`,
      from, to, units,
      color: player.color
    });
  }

  logMobilize(player, units, territory) {
    const unitStr = units.map(u => `${u.quantity || 1} ${u.type}`).join(', ');
    this.log('mobilize', {
      message: `${player.name} deployed ${unitStr} to ${territory}`,
      territory, units,
      color: player.color
    });
  }

  // Note: Visual rendering methods removed - display is handled by PlayerPanel's Log tab

  // Get entries for save/load
  toJSON() {
    return this.entries.map(e => ({
      type: e.type,
      data: e.data,
      timestamp: e.timestamp.toISOString(),
      round: e.round,
    }));
  }

  loadFromJSON(data) {
    this.entries = data.map(e => ({
      ...e,
      id: Date.now() + Math.random(),
      timestamp: new Date(e.timestamp),
    }));
    this._render();
  }
}
