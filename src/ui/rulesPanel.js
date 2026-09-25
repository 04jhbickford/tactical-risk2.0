// Game Rules Panel - Shows current game rules

import { describe, optionRows } from '../gameOptions.js';

export class RulesPanel {
  constructor() {
    this.isVisible = false;
    this.gameState = null;
    this._create();
  }

  setGameState(gameState) {
    this.gameState = gameState || null;
    this._paintOptions();
  }

  _create() {
    this.el = document.createElement('div');
    this.el.id = 'rulesPanel';
    this.el.className = 'rules-panel hidden';
    this.el.innerHTML = this._getContent();
    document.body.appendChild(this.el);

    this.el.querySelector('.rules-close')?.addEventListener('click', () => this.hide());
    this.el.querySelector('.rules-contents-select')?.addEventListener('change', (e) => {
      const id = `rules-${e.target.value}`;
      this.el.querySelector(`#${id}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    // Close on background click
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.hide();
    });
  }

  _getContent() {
    return `
      <div class="rules-content">
        <div class="rules-header">
          <div class="rules-header-copy">
            <p class="rules-kicker">How to Play · no sign-in</p>
            <h2>Game Rules</h2>
          </div>
          <button class="rules-close">✕</button>
        </div>
        <label class="rules-contents">
          <span>Contents</span>
          <select class="rules-contents-select" aria-label="Rules contents">
            <option value="this-game" class="rules-options-jump">This game's options</option>
            <option value="phases">Turn Phases</option>
            <option value="units">Unit Types</option>
            <option value="combat">Combat Rules</option>
            <option value="transport">Transport &amp; Carrier</option>
            <option value="territory">Territory Control</option>
            <option value="movement">Movement Rules</option>
          </select>
        </label>

        <div class="rules-sections">
          <section class="rules-section rules-options-section" id="rules-this-game" data-rules-section="this-game" hidden>
            <h3>This game's options</h3>
            <p class="rules-options-summary"></p>
            <ul class="rules-options-list"></ul>
          </section>
          <section class="rules-section" id="rules-phases" data-rules-section="phases">
            <h3>Turn Phases</h3>
            <ol>
              <li><strong>Develop Tech</strong> - Dice tokens cost 5 IPCs each and are spent on the roll. Roll 6 to unlock a technology. If the host chose Keep tokens until success, a roll with no 6 keeps those tokens for the next turn, and a breakthrough spends them. If the host chose Buy directly, there is no research roll: during Purchase, pick a technology for 20 IPCs.</li>
              <li><strong>Purchase Units</strong> - Buy units with IPCs. Units are placed during Mobilize phase. Buy directly also sells technologies here for 20 IPCs.</li>
              <li><strong>Combat Movement</strong> - Move units into enemy territories to attack.</li>
              <li><strong>Combat</strong> - Resolve battles in contested territories.</li>
              <li><strong>Non-Combat Movement</strong> - Move remaining units. Load troops onto transports.</li>
              <li><strong>Mobilize</strong> - Place purchased units at factories (capital or built factories).</li>
              <li><strong>Collect Income</strong> - Gain IPCs from controlled territories + continent bonuses.</li>
            </ol>
          </section>

          <section class="rules-section" id="rules-units" data-rules-section="units">
            <h3>Unit Types</h3>
            <table class="rules-table">
              <thead>
                <tr><th>Unit</th><th>Cost</th><th>Attack</th><th>Defense</th><th>Move</th><th>Notes</th></tr>
              </thead>
              <tbody>
                <tr><td>Infantry</td><td>3</td><td>1</td><td>2</td><td>1</td><td>Cheap, good defense</td></tr>
                <tr><td>Artillery</td><td>4</td><td>2</td><td>2</td><td>1</td><td>Boosts paired infantry</td></tr>
                <tr><td>Armour (Tank)</td><td>6</td><td>3</td><td>3</td><td>2</td><td>Can blitz through friendly territory</td></tr>
                <tr><td>Fighter</td><td>10</td><td>3</td><td>4</td><td>4</td><td>Air unit, can land on carriers</td></tr>
                <tr><td>Tactical Bomber</td><td>11</td><td>3</td><td>3</td><td>4</td><td>Versatile air unit</td></tr>
                <tr><td>Bomber</td><td>12</td><td>4</td><td>1</td><td>6</td><td>Strategic bombing, cannot capture</td></tr>
                <tr><td>Submarine</td><td>6</td><td>2</td><td>1</td><td>2</td><td>First strike, can submerge</td></tr>
                <tr><td>Destroyer</td><td>8</td><td>2</td><td>2</td><td>2</td><td>Blocks sub first strike</td></tr>
                <tr><td>Cruiser</td><td>12</td><td>3</td><td>3</td><td>2</td><td>Shore bombardment</td></tr>
                <tr><td>Carrier</td><td>14</td><td>1</td><td>2</td><td>2</td><td>Carries 2 fighters</td></tr>
                <tr><td>Battleship</td><td>20</td><td>4</td><td>4</td><td>2</td><td>2 HP, shore bombardment</td></tr>
                <tr><td>Transport</td><td>7</td><td>0</td><td>0</td><td>2</td><td>Carries 2 infantry or 1 infantry + 1 other</td></tr>
              </tbody>
            </table>
          </section>

          <section class="rules-section" id="rules-combat" data-rules-section="combat">
            <h3>Combat Rules</h3>
            <ul>
              <li><strong>Attacking:</strong> Roll dice equal to unit's attack value. Each die showing that number or less = hit.</li>
              <li><strong>Defending:</strong> Roll dice equal to unit's defense value. Same rules for hits.</li>
              <li><strong>Casualties:</strong> Attacker chooses defender casualties, defender chooses attacker casualties.</li>
              <li><strong>Air Units:</strong> Cannot capture territory. After combat, must return to friendly territory or carrier.</li>
              <li><strong>Retreat:</strong> Attacker can retreat all units to an adjacent friendly territory.</li>
            </ul>
          </section>

          <section class="rules-section" id="rules-transport" data-rules-section="transport">
            <h3>Transport & Carrier Rules</h3>
            <ul>
              <li><strong>Transports:</strong> Can carry 2 infantry OR 1 infantry + 1 other land unit.</li>
              <li><strong>Carriers:</strong> Can carry up to 2 fighters/tactical bombers.</li>
              <li><strong>Loading:</strong> Units can load during non-combat movement from adjacent coastal territories.</li>
              <li><strong>Unloading:</strong> Units can unload during combat movement for amphibious assault.</li>
            </ul>
          </section>

          <section class="rules-section" id="rules-territory" data-rules-section="territory">
            <h3>Territory Control</h3>
            <ul>
              <li><strong>Capturing:</strong> Only LAND units can capture territory. Air units alone cannot hold ground.</li>
              <li><strong>Capital Bonus:</strong> Capitals provide 10 IPCs per turn.</li>
              <li><strong>Continent Bonus:</strong> Control all territories in a continent for bonus IPCs.</li>
              <li><strong>Risk Cards:</strong> Earn a card when conquering at least one territory per turn. Trade sets for IPCs.</li>
            </ul>
          </section>

          <section class="rules-section" id="rules-movement" data-rules-section="movement">
            <h3>Movement Rules</h3>
            <ul>
              <li><strong>Multi-hop:</strong> Units with movement > 1 can move through friendly territories.</li>
              <li><strong>Tanks:</strong> Can "blitz" through empty enemy territories during combat movement.</li>
              <li><strong>Air Movement:</strong> Air units can fly over any terrain within their movement range.</li>
              <li><strong>Land Bridges:</strong> Some territories are connected across water (e.g., straits).</li>
            </ul>
          </section>
        </div>
      </div>
    `;
  }

  _hasLiveGame() {
    const phase = this.gameState?.phase;
    return !!phase && phase !== 'lobby';
  }

  _paintOptions() {
    const section = this.el?.querySelector('#rules-this-game');
    const jump = this.el?.querySelector('.rules-options-jump');
    if (!section) return;
    const live = this._hasLiveGame();
    section.hidden = !live;
    if (jump) jump.hidden = !live;
    if (!live) return;
    const summary = this.el.querySelector('.rules-options-summary');
    const list = this.el.querySelector('.rules-options-list');
    if (summary) summary.textContent = describe(this.gameState.gameOptions);
    if (list) {
      list.innerHTML = optionRows(this.gameState.gameOptions)
        .map(([label, value]) => `<li><strong>${label}:</strong> ${value}</li>`)
        .join('');
    }
  }

  show() {
    this._paintOptions();
    this.el.classList.remove('hidden');
    this.isVisible = true;
  }

  hide() {
    this.el.classList.add('hidden');
    this.isVisible = false;
  }

  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }
}
