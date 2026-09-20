// Pass-and-play handoff screen.
// In a local game with 2+ human players, covers the board whenever the turn
// passes to a DIFFERENT human, so the previous player's private info (risk
// cards, plans) isn't on screen while the device changes hands, and the next
// player gets an unmistakable "it's you now" moment.
//
// Never shown in multiplayer (each human has their own screen) or for AI turns.

import { GAME_PHASES } from '../state/gameState.js';
import { setShellFlag } from './mobileShell.js';

export class HandoffScreen {
  constructor() {
    this.gameState = null;
    this.lastConfirmedPlayerId = null;
    this.el = document.createElement('div');
    this.el.id = 'handoffScreen';
    this.el.className = 'handoff-overlay hidden';
    document.body.appendChild(this.el);
  }

  setGameState(gameState) {
    this.gameState = gameState;
    this.lastConfirmedPlayerId = null;
    this.hide();

    gameState.subscribe(() => this._check());
    this._check();
  }

  _isHotseat() {
    const gs = this.gameState;
    if (!gs || gs.isMultiplayer) return false;
    const humans = gs.players?.filter(p => !p.isAI) || [];
    return humans.length >= 2;
  }

  _check() {
    const gs = this.gameState;
    if (!this._isHotseat()) return;
    if (gs.phase === GAME_PHASES.LOBBY || gs.gameOver) {
      this.hide();
      return;
    }

    const current = gs.currentPlayer;
    if (!current || current.isAI || current.surrendered) return;

    if (current.id !== this.lastConfirmedPlayerId && !this.isVisible) {
      this._show(current);
    }
  }

  _show(player) {
    const flagSrc = player.flag ? `assets/flags/${player.flag}` : null;
    this.el.innerHTML = `
      <div class="handoff-content">
        <div class="handoff-label">Pass the device to</div>
        ${flagSrc ? `<img src="${flagSrc}" class="handoff-flag" alt="${player.name}">` : ''}
        <div class="handoff-name" style="color: ${player.color}">${player.name}</div>
        <button class="handoff-start-btn">Start Turn</button>
        <div class="handoff-hint">Other players, look away now!</div>
      </div>
    `;
    this.el.classList.remove('hidden');
    setShellFlag('handoff-active', true);

    this.el.querySelector('.handoff-start-btn').addEventListener('click', () => {
      this.lastConfirmedPlayerId = player.id;
      this.hide();
    });
  }

  hide() {
    this.el.classList.add('hidden');
    setShellFlag('handoff-active', false);
    this.el.dispatchEvent(new CustomEvent('tacticalrisk:handoff-hidden', { bubbles: true }));
  }

  get isVisible() {
    return !this.el.classList.contains('hidden');
  }
}
