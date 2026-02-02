// Bottom panel showing continent bonuses

export class ContinentPanel {
  constructor(continents) {
    this.continents = continents;
    this.gameState = null;
    this.el = null;
    this._create();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'continent-panel';
    this.el.className = 'continent-panel hidden';
    document.body.appendChild(this.el);
  }

  setGameState(gameState) {
    this.gameState = gameState;
    gameState.subscribe(() => this._render());
    this._render();
  }

  show() {
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  _render() {
    let html = `
      <div class="continent-panel-header">
        <span class="panel-title">Continent Bonuses</span>
        <button class="panel-toggle" title="Toggle panel">_</button>
      </div>
      <div class="continent-table-wrapper">
        <table class="continent-table">
          <thead>
            <tr>
              <th>Continent</th>
              <th>Bonus</th>
              <th>Territories</th>
              <th>Controller</th>
            </tr>
          </thead>
          <tbody>
    `;

    for (const continent of this.continents) {
      const controller = this._getController(continent);
      const controllerName = controller ? controller.name : '-';
      const controllerColor = controller ? controller.color : 'transparent';
      const territoryCount = continent.territories.length;

      html += `
        <tr>
          <td>
            <span class="continent-color" style="background: ${continent.color}"></span>
            ${continent.name}
          </td>
          <td class="bonus-cell">+${continent.bonus}</td>
          <td class="territory-count">${territoryCount}</td>
          <td class="controller-cell">
            ${controller ? `
              <span class="controller-badge" style="background: ${controllerColor}">${controllerName}</span>
            ` : '<span class="no-controller">Contested</span>'}
          </td>
        </tr>
      `;
    }

    html += `
          </tbody>
        </table>
      </div>
    `;

    this.el.innerHTML = html;

    // Bind toggle
    this.el.querySelector('.panel-toggle')?.addEventListener('click', () => {
      this.el.classList.toggle('collapsed');
    });
  }

  _getController(continent) {
    if (!this.gameState) return null;

    // Check if any single player controls all territories
    let controller = null;
    for (const territoryName of continent.territories) {
      const owner = this.gameState.getOwner(territoryName);
      if (!owner) return null; // Unowned territory
      if (!controller) {
        controller = owner;
      } else if (controller !== owner) {
        return null; // Different owners
      }
    }

    if (controller) {
      const player = this.gameState.players.find(p => p.id === controller);
      return player || null;
    }
    return null;
  }
}
