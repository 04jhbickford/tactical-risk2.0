// Bug Tracker - allows users to report bugs with game state context

export class BugTracker {
  constructor() {
    this.el = null;
    this.gameState = null;
    this.actionLog = null;
    this.isOpen = false;
    this.viewMode = 'report'; // 'report' or 'view'
    this._create();
  }

  _create() {
    // Create modal overlay
    this.el = document.createElement('div');
    this.el.id = 'bugTrackerModal';
    this.el.className = 'bug-tracker-modal hidden';
    document.body.appendChild(this.el);
  }

  setGameState(gameState) {
    this.gameState = gameState;
  }

  setActionLog(actionLog) {
    this.actionLog = actionLog;
  }

  show() {
    this.isOpen = true;
    this._render();
    this.el.classList.remove('hidden');
  }

  hide() {
    this.isOpen = false;
    this.el.classList.add('hidden');
  }

  _render() {
    const player = this.gameState?.currentPlayer;
    const phase = this.gameState?.turnPhase || 'unknown';
    const round = this.gameState?.round || 0;
    const reports = BugTracker.getBugReports();
    const combatQueue = this.gameState?.combatQueue || [];
    const isAI = player?.isAI ? `Yes (${player.aiDifficulty})` : 'No';

    this.el.innerHTML = `
      <div class="bug-tracker-overlay" data-action="close"></div>
      <div class="bug-tracker-content">
        <div class="bug-tracker-header">
          <h2>Bug Tracker</h2>
          <button class="bug-close-btn" data-action="close">&times;</button>
        </div>

        <div class="bug-tabs">
          <button class="bug-tab ${this.viewMode === 'report' ? 'active' : ''}" data-tab="report">Report Bug</button>
          <button class="bug-tab ${this.viewMode === 'view' ? 'active' : ''}" data-tab="view">View Reports (${reports.length})</button>
        </div>

        ${this.viewMode === 'report' ? `
        <form class="bug-form" data-action="submit">
          <div class="bug-form-group">
            <label for="bug-description">What went wrong?</label>
            <textarea
              id="bug-description"
              name="description"
              placeholder="Describe what happened, what you expected, and what actually occurred..."
              rows="5"
              required
            ></textarea>
          </div>

          <div class="bug-form-group">
            <label for="bug-severity">Severity</label>
            <select id="bug-severity" name="severity">
              <option value="low">Low - Minor issue, game still playable</option>
              <option value="medium" selected>Medium - Affects gameplay but workaround exists</option>
              <option value="high">High - Game-breaking, can't continue</option>
            </select>
          </div>

          <div class="bug-context">
            <div class="bug-context-header">Captured Context</div>
            <div class="bug-context-item">
              <span class="bug-context-label">Player:</span>
              <span class="bug-context-value">${player?.name || 'None'}</span>
            </div>
            <div class="bug-context-item">
              <span class="bug-context-label">Is AI:</span>
              <span class="bug-context-value">${isAI}</span>
            </div>
            <div class="bug-context-item">
              <span class="bug-context-label">Phase:</span>
              <span class="bug-context-value">${this.gameState?.phase || 'unknown'} / ${phase}</span>
            </div>
            <div class="bug-context-item">
              <span class="bug-context-label">Round:</span>
              <span class="bug-context-value">${round}</span>
            </div>
            <div class="bug-context-item">
              <span class="bug-context-label">Combat Queue:</span>
              <span class="bug-context-value">${combatQueue.length > 0 ? combatQueue.join(', ') : 'Empty'}</span>
            </div>
            <div class="bug-context-item">
              <span class="bug-context-label">Timestamp:</span>
              <span class="bug-context-value">${new Date().toLocaleString()}</span>
            </div>
          </div>

          <div class="bug-form-actions">
            <button type="button" class="bug-btn secondary" data-action="close">Cancel</button>
            <button type="submit" class="bug-btn primary">Submit Report</button>
          </div>
        </form>
        ` : `
        <div class="bug-reports-view">
          ${reports.length === 0 ? `
            <div class="bug-no-reports">No bug reports yet.</div>
          ` : `
            <div class="bug-reports-list">
              ${reports.map((r, i) => `
                <div class="bug-report-item ${r.severity}">
                  <div class="bug-report-header">
                    <span class="bug-report-severity ${r.severity}">${r.severity.toUpperCase()}</span>
                    <span class="bug-report-date">${new Date(r.timestamp).toLocaleString()}</span>
                  </div>
                  <div class="bug-report-desc">${this._escapeHtml(r.description)}</div>
                  <div class="bug-report-context">
                    Phase: ${r.gameStateSnapshot?.phase || 'N/A'}/${r.gamePhase || 'N/A'} |
                    Player: ${r.currentPlayer || 'N/A'}${r.gameStateSnapshot?.aiPlayer ? ' (AI)' : ''} |
                    Round: ${r.round || 'N/A'}
                  </div>
                  ${r.gameStateSnapshot?.combatQueue ? `
                    <div class="bug-report-combat">
                      <strong>Combat Queue:</strong>
                      ${r.gameStateSnapshot.combatQueue.map(c => `
                        <div class="bug-combat-item">
                          ${c.territory}${c.isCapital ? ' (CAPITAL)' : ''}:
                          Att: ${c.attackerCount} (${c.attackers.map(a => a.type).join(', ')}) vs
                          Def: ${c.defenderCount} (${c.defenders.map(d => d.type).join(', ')})
                        </div>
                      `).join('')}
                    </div>
                  ` : ''}
                </div>
              `).join('')}
            </div>
            <div class="bug-reports-actions">
              <button class="bug-btn secondary" data-action="export">Export to File</button>
              <button class="bug-btn danger" data-action="clear">Clear All</button>
            </div>
          `}
        </div>
        `}

        <div class="bug-saved-notice hidden">
          <span class="bug-saved-icon">✓</span>
          <span>Bug report saved locally!</span>
        </div>
      </div>
    `;

    this._bindEvents();
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _bindEvents() {
    // Close buttons and overlay
    this.el.querySelectorAll('[data-action="close"]').forEach(btn => {
      btn.addEventListener('click', () => this.hide());
    });

    // Tab switching
    this.el.querySelectorAll('.bug-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        this.viewMode = tab.dataset.tab;
        this._render();
      });
    });

    // Form submission
    const form = this.el.querySelector('.bug-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this._submitBug();
    });

    // Export button
    const exportBtn = this.el.querySelector('[data-action="export"]');
    exportBtn?.addEventListener('click', () => {
      BugTracker.exportBugReports();
    });

    // Clear button
    const clearBtn = this.el.querySelector('[data-action="clear"]');
    clearBtn?.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all bug reports?')) {
        BugTracker.clearBugReports();
        this._render();
      }
    });

    // Close on Escape
    const escHandler = (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.hide();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  _submitBug() {
    const form = this.el.querySelector('.bug-form');
    const description = form.querySelector('#bug-description').value.trim();
    const severity = form.querySelector('#bug-severity').value;

    if (!description) return;

    const bugReport = {
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      description,
      severity,
      gamePhase: this.gameState?.turnPhase || null,
      currentPlayer: this.gameState?.currentPlayer?.name || null,
      round: this.gameState?.round || null,
      recentActions: this._getRecentActions(),
      gameStateSnapshot: this._getGameStateSnapshot(),
    };

    this._saveBugReport(bugReport);
    this._showSavedNotice();
  }

  _generateId() {
    return 'bug-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
  }

  _getRecentActions() {
    // Get last 10 action log entries if available
    if (this.actionLog && this.actionLog.entries) {
      return this.actionLog.entries.slice(-10).map(e => ({
        text: e.text,
        timestamp: e.timestamp
      }));
    }
    return [];
  }

  _getGameStateSnapshot() {
    if (!this.gameState) return null;

    const snapshot = {
      gameMode: this.gameState.gameMode,
      phase: this.gameState.phase,
      turnPhase: this.gameState.turnPhase,
      round: this.gameState.round,
      currentPlayerIndex: this.gameState.currentPlayerIndex,
      playerCount: this.gameState.players?.length || 0,
      pendingPurchasesCount: this.gameState.pendingPurchases?.length || 0,
    };

    // Combat-specific debugging
    if (this.gameState.combatQueue && this.gameState.combatQueue.length > 0) {
      snapshot.combatQueue = this.gameState.combatQueue.map(territory => {
        const units = this.gameState.units[territory] || [];
        const owner = this.gameState.getOwner(territory);
        const currentPlayer = this.gameState.currentPlayer;

        const attackers = units.filter(u => u.owner === currentPlayer?.id);
        const defenders = units.filter(u => u.owner !== currentPlayer?.id);

        return {
          territory,
          owner,
          isCapital: this.gameState.territoryState[territory]?.isCapital || false,
          attackers: attackers.map(u => ({ type: u.type, qty: u.quantity, owner: u.owner })),
          defenders: defenders.map(u => ({ type: u.type, qty: u.quantity, owner: u.owner })),
          attackerCount: attackers.reduce((sum, u) => sum + u.quantity, 0),
          defenderCount: defenders.reduce((sum, u) => sum + u.quantity, 0),
        };
      });
    }

    // AI state if applicable
    const currentPlayer = this.gameState.currentPlayer;
    if (currentPlayer?.isAI) {
      snapshot.aiPlayer = {
        name: currentPlayer.name,
        id: currentPlayer.id,
        difficulty: currentPlayer.aiDifficulty,
      };
    }

    // Player states summary
    snapshot.players = this.gameState.players?.map(p => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI,
      ipcs: this.gameState.getIPCs(p.id),
      territories: this.gameState.getPlayerTerritories(p.id).length,
      capital: this.gameState.playerState[p.id]?.capitalTerritory,
    }));

    return snapshot;
  }

  _saveBugReport(report) {
    const reports = BugTracker.getBugReports();
    reports.push(report);
    localStorage.setItem('tacticalRiskBugs', JSON.stringify(reports));
  }

  _showSavedNotice() {
    const form = this.el.querySelector('.bug-form');
    const notice = this.el.querySelector('.bug-saved-notice');

    form?.classList.add('hidden');
    notice?.classList.remove('hidden');

    // Auto-close after 2 seconds
    setTimeout(() => {
      this.hide();
      // Reset for next time
      form?.classList.remove('hidden');
      notice?.classList.add('hidden');
    }, 2000);
  }

  static getBugReports() {
    try {
      return JSON.parse(localStorage.getItem('tacticalRiskBugs') || '[]');
    } catch {
      return [];
    }
  }

  static clearBugReports() {
    localStorage.removeItem('tacticalRiskBugs');
  }

  static exportBugReports() {
    const reports = BugTracker.getBugReports();
    const blob = new Blob([JSON.stringify(reports, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tactical-risk-bugs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
