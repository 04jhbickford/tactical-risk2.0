// Victory screen overlay displayed when the game ends

export class VictoryScreen {
  constructor() {
    this.gameState = null;
    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'victoryOverlay';
    this.el.className = 'victory-overlay hidden';
    document.body.appendChild(this.el);
  }

  setGameState(gameState) {
    this.gameState = gameState;

    // Subscribe to state changes to detect game over
    gameState.subscribe(() => {
      if (gameState.gameOver && !this.el.classList.contains('visible')) {
        this.show();
      }
    });
  }

  show() {
    if (!this.gameState || !this.gameState.gameOver) return;

    const { winner, winCondition, alliancesEnabled } = this.gameState;

    let titleClass = 'player';
    let titleText = `${winner} Wins!`;

    if (winner === 'Allies') {
      titleClass = 'allies';
      titleText = 'Allied Victory!';
    } else if (winner === 'Axis') {
      titleClass = 'axis';
      titleText = 'Axis Victory!';
    }

    this.el.innerHTML = `
      <div class="victory-content">
        <div class="victory-title ${titleClass}">${titleText}</div>
        <div class="victory-subtitle">${winCondition}</div>
        <div class="victory-details">
          ${this._getVictoryDetails()}
        </div>
        <button class="victory-btn" id="victoryNewGame">New Game</button>
      </div>
    `;

    this.el.classList.remove('hidden');

    // Bind new game button
    this.el.querySelector('#victoryNewGame').addEventListener('click', () => {
      window.location.reload();
    });
  }

  _getVictoryDetails() {
    if (!this.gameState) return '';

    const lines = [];
    lines.push(`Game ended on Round ${this.gameState.round}`);

    // Show final territory counts
    const territoryCounts = {};
    for (const [_, state] of Object.entries(this.gameState.territoryState)) {
      if (state.owner) {
        territoryCounts[state.owner] = (territoryCounts[state.owner] || 0) + 1;
      }
    }

    lines.push('<br><strong>Final Territory Control:</strong>');
    for (const player of this.gameState.players) {
      const count = territoryCounts[player.id] || 0;
      const ipcs = this.gameState.playerState[player.id]?.ipcs || 0;
      lines.push(`${player.name}: ${count} territories, ${ipcs} IPCs`);
    }

    return lines.join('<br>');
  }

  hide() {
    this.el.classList.add('hidden');
  }
}
