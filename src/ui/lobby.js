// Lobby UI for game mode and player selection

// Available colors for faction selection
const FACTION_COLORS = [
  { id: 'red', color: '#B22222', light: '#DC143C', name: 'Crimson' },
  { id: 'blue', color: '#1E90FF', light: '#4169E1', name: 'Blue' },
  { id: 'green', color: '#228B22', light: '#32CD32', name: 'Green' },
  { id: 'orange', color: '#FF8C00', light: '#FFA500', name: 'Orange' },
  { id: 'purple', color: '#8B008B', light: '#9932CC', name: 'Purple' },
  { id: 'gold', color: '#B8860B', light: '#DAA520', name: 'Gold' },
  { id: 'gray', color: '#4A4A4A', light: '#6A6A6A', name: 'Gray' },
  { id: 'olive', color: '#556B2F', light: '#6B8E23', name: 'Olive' },
  { id: 'teal', color: '#008B8B', light: '#20B2AA', name: 'Teal' },
  { id: 'pink', color: '#C71585', light: '#FF69B4', name: 'Pink' },
];

export class Lobby {
  constructor(setup, onStart) {
    this.setup = setup;
    this.onStart = onStart;
    this.selectedMode = null;
    this.selectedPlayers = [];
    this.playerNames = {};
    this.playerColors = {}; // Track selected colors per player
    this.alliancesEnabled = false;
    this.el = null;
    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'lobby';
    this.el.className = 'lobby-overlay';
    this._renderModeSelect();
    document.body.appendChild(this.el);
  }

  _renderModeSelect() {
    const modes = this.setup.gameModes;

    let html = `
      <div class="lobby-content">
        <h1 class="lobby-title">Tactical Risk</h1>
        <p class="lobby-subtitle">World War II Strategy</p>

        <div class="lobby-section">
          <h2>Select Game Mode</h2>
          <div class="mode-grid">
            ${modes.map(mode => `
              <div class="mode-card ${mode.enabled ? '' : 'disabled'}" data-mode="${mode.id}">
                <div class="mode-name">${mode.name}</div>
                <div class="mode-desc">${mode.description}</div>
                ${!mode.enabled ? '<div class="mode-coming">Coming Soon</div>' : ''}
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    this.el.innerHTML = html;

    // Bind mode selection
    this.el.querySelectorAll('.mode-card:not(.disabled)').forEach(card => {
      card.addEventListener('click', () => {
        this.selectedMode = card.dataset.mode;
        this._renderPlayerSelect();
      });
    });
  }

  _renderPlayerSelect() {
    const mode = this.selectedMode;
    const isClassic = mode === 'classic';
    const factions = isClassic ? this.setup.classic.factions : this.setup.risk.factions;
    const modeData = this.setup.gameModes.find(m => m.id === mode);
    const alliances = this.setup.alliances;

    let html = `
      <div class="lobby-content">
        <div class="lobby-header">
          <button class="lobby-back-btn">&larr; Back</button>
          <h1 class="lobby-title-small">${modeData.name}</h1>
        </div>

        <div class="lobby-section">
          <h2>${isClassic ? 'Factions' : 'Select Factions (2-5)'}</h2>
          ${!isClassic ? '<p class="lobby-hint">Click factions to add/remove players</p>' : ''}

          <div class="player-grid classic">
            ${factions.map((p, i) => {
              const defaultColor = FACTION_COLORS[i % FACTION_COLORS.length];
              return `
              <div class="player-card ${isClassic ? 'selected' : ''}" data-player="${p.id}" data-alliance="${p.alliance}">
                <div class="alliance-badge ${p.alliance.toLowerCase()}">${p.alliance}</div>
                <img src="assets/flags/${p.flag}" alt="${p.name}" class="player-flag">
                <input type="text" class="player-name-input"
                       data-player="${p.id}"
                       placeholder="${p.name}"
                       value="${isClassic ? p.name : ''}"
                       maxlength="15"
                       ${isClassic ? '' : 'disabled'}>
                <div class="player-color-select" data-player="${p.id}">
                  <div class="color-current" style="background:${p.color}" data-color="${defaultColor.id}"></div>
                  <div class="color-dropdown hidden">
                    ${FACTION_COLORS.map(c => `
                      <div class="color-option" data-color-id="${c.id}" style="background:${c.color}" title="${c.name}"></div>
                    `).join('')}
                  </div>
                </div>
                ${!isClassic ? '<div class="player-check"></div>' : ''}
                ${isClassic && p.startingPUs ? `<div class="player-pus">${p.startingPUs} PUs</div>` : ''}
              </div>
            `}).join('')}
          </div>
        </div>

        ${!isClassic ? `
          <div class="lobby-section">
            <div class="alliance-toggle">
              <label class="toggle-label">
                <input type="checkbox" id="allianceToggle" ${this.alliancesEnabled ? 'checked' : ''}>
                <span class="toggle-slider"></span>
                <span class="toggle-text">Enable Alliances (Axis vs. Allies)</span>
              </label>
              <p class="toggle-hint">When enabled, players on the same alliance work together</p>
            </div>
          </div>

          <div class="lobby-info">
            <div class="info-item">
              <span class="info-label">Starting IPCs</span>
              <span class="info-value">${this.setup.risk.startingIPCs}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Setup</span>
              <span class="info-value">Random territories + 1 infantry each</span>
            </div>
          </div>
        ` : `
          <div class="lobby-info">
            <div class="info-item alliance-info axis">
              <span class="info-label">Axis Powers</span>
              <span class="info-value">${alliances.Axis.members.join(', ')}</span>
            </div>
            <div class="info-item alliance-info allies">
              <span class="info-label">Allied Forces</span>
              <span class="info-value">${alliances.Allies.members.join(', ')}</span>
            </div>
          </div>
        `}

        <button class="lobby-start-btn" ${isClassic ? '' : 'disabled'}>
          ${isClassic ? 'Start Game' : 'Select at least 2 factions'}
        </button>
      </div>
    `;

    this.el.innerHTML = html;

    // Initialize for classic mode
    if (isClassic) {
      this.selectedPlayers = factions.map(p => p.id);
      factions.forEach((p, i) => {
        this.playerNames[p.id] = p.name;
        // Use faction's default color
        this.playerColors[p.id] = { color: p.color, lightColor: p.lightColor };
      });
    } else {
      this.selectedPlayers = [];
      // Initialize colors for risk mode
      factions.forEach((p, i) => {
        const defaultColor = FACTION_COLORS[i % FACTION_COLORS.length];
        this.playerColors[p.id] = { color: defaultColor.color, lightColor: defaultColor.light };
      });
    }

    this._bindPlayerEvents(isClassic, factions);
  }

  _bindPlayerEvents(isClassic, factions) {
    // Back button
    this.el.querySelector('.lobby-back-btn')?.addEventListener('click', () => {
      this.selectedMode = null;
      this.selectedPlayers = [];
      this.playerNames = {};
      this.playerColors = {};
      this._renderModeSelect();
    });

    // Player cards (for Risk mode)
    if (!isClassic) {
      this.el.querySelectorAll('.player-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.classList.contains('player-name-input')) return;
          if (e.target.closest('.player-color-select')) return; // Don't toggle when clicking color
          this._togglePlayer(card.dataset.player);
        });
      });

      // Alliance toggle
      this.el.querySelector('#allianceToggle')?.addEventListener('change', (e) => {
        this.alliancesEnabled = e.target.checked;
      });
    }

    // Color selectors
    this.el.querySelectorAll('.player-color-select').forEach(colorSelect => {
      const playerId = colorSelect.dataset.player;
      const currentEl = colorSelect.querySelector('.color-current');
      const dropdown = colorSelect.querySelector('.color-dropdown');

      // Toggle dropdown
      currentEl.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close other dropdowns
        this.el.querySelectorAll('.color-dropdown').forEach(d => {
          if (d !== dropdown) d.classList.add('hidden');
        });
        dropdown.classList.toggle('hidden');
      });

      // Select color
      dropdown.querySelectorAll('.color-option').forEach(opt => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const colorId = opt.dataset.colorId;
          const colorDef = FACTION_COLORS.find(c => c.id === colorId);
          if (colorDef) {
            this.playerColors[playerId] = { color: colorDef.color, lightColor: colorDef.light };
            currentEl.style.background = colorDef.color;
            dropdown.classList.add('hidden');
          }
        });
      });
    });

    // Close dropdowns when clicking elsewhere
    document.addEventListener('click', () => {
      this.el.querySelectorAll('.color-dropdown').forEach(d => d.classList.add('hidden'));
    });

    // Name inputs
    this.el.querySelectorAll('.player-name-input').forEach(input => {
      input.addEventListener('input', (e) => {
        this.playerNames[e.target.dataset.player] = e.target.value;
      });
    });

    // Start button
    this.el.querySelector('.lobby-start-btn').addEventListener('click', () => {
      if (isClassic || this.selectedPlayers.length >= 2) {
        this._startGame();
      }
    });
  }

  _togglePlayer(playerId) {
    const card = this.el.querySelector(`.player-card[data-player="${playerId}"]`);
    const input = card.querySelector('.player-name-input');
    const idx = this.selectedPlayers.indexOf(playerId);

    if (idx >= 0) {
      this.selectedPlayers.splice(idx, 1);
      card.classList.remove('selected');
      input.disabled = true;
    } else {
      this.selectedPlayers.push(playerId);
      card.classList.add('selected');
      input.disabled = false;
      input.focus();
    }

    this._updateStartButton();
  }

  _updateStartButton() {
    const btn = this.el.querySelector('.lobby-start-btn');
    const count = this.selectedPlayers.length;

    if (count < 2) {
      btn.disabled = true;
      btn.textContent = 'Select at least 2 factions';
    } else {
      btn.disabled = false;
      btn.textContent = `Start Game (${count} factions)`;
    }
  }

  _startGame() {
    const isClassic = this.selectedMode === 'classic';
    const factionSource = isClassic ? this.setup.classic.factions : this.setup.risk.factions;

    const players = this.selectedPlayers.map(id => {
      const factionDef = factionSource.find(p => p.id === id);
      const customColor = this.playerColors[id];
      return {
        ...factionDef,
        name: this.playerNames[id]?.trim() || factionDef.name,
        // Use custom color if selected, otherwise use faction default
        color: customColor?.color || factionDef.color,
        lightColor: customColor?.lightColor || factionDef.lightColor,
      };
    });

    // Pass alliance setting for Risk mode
    const options = {
      alliancesEnabled: !isClassic && this.alliancesEnabled,
    };

    this.hide();
    this.onStart(this.selectedMode, players, options);
  }

  show() {
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  destroy() {
    if (this.el?.parentNode) {
      this.el.parentNode.removeChild(this.el);
    }
  }
}
