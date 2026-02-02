// Combat log panel showing battle history for current round

export class CombatLogPanel {
  constructor() {
    this.gameState = null;
    this.isExpanded = false;
    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'combatLogPanel';
    this.el.className = 'combat-log-panel collapsed hidden';
    this.el.innerHTML = `
      <div class="log-header">
        <span class="log-title">Battle Log</span>
        <button class="log-toggle">▲</button>
      </div>
      <div class="log-content"></div>
    `;
    document.body.appendChild(this.el);

    // Toggle expand/collapse
    this.el.querySelector('.log-header').addEventListener('click', () => {
      this.isExpanded = !this.isExpanded;
      this.el.classList.toggle('collapsed', !this.isExpanded);
      this.el.querySelector('.log-toggle').textContent = this.isExpanded ? '▼' : '▲';
    });
  }

  setGameState(gameState) {
    this.gameState = gameState;

    // Subscribe to updates
    gameState.subscribe(() => {
      this._render();
    });
  }

  show() {
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  _render() {
    if (!this.gameState) return;

    const log = this.gameState.getCombatLog();
    const content = this.el.querySelector('.log-content');

    if (log.length === 0) {
      content.innerHTML = '<div class="log-empty">No battles this round</div>';
      return;
    }

    content.innerHTML = log.map(entry => `
      <div class="log-entry ${entry.winner}">
        <div class="log-territory">${entry.territory}</div>
        <div class="log-result">
          ${entry.winner === 'attacker'
            ? `<span class="log-winner">${entry.attacker}</span> captured from ${entry.defender}`
            : `<span class="log-winner">${entry.defender}</span> defended against ${entry.attacker}`
          }
        </div>
        <div class="log-survivors">
          Survivors: ${entry.winner === 'attacker' ? entry.attackerSurvivors : entry.defenderSurvivors}
        </div>
      </div>
    `).join('');

    // Update title with count
    this.el.querySelector('.log-title').textContent = `Battle Log (${log.length})`;
  }
}
