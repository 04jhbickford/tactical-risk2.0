// Game Rules Panel - Shows current game rules

import { describe, optionRows } from '../gameOptions.js';
import { tacticalBombersEnabled } from '../state/tacticalPairing.js';
import { mechanizedInfantryEnabled } from '../state/mechanizedInfantry.js';
import { garrisonsEnabled } from '../state/garrison.js';

export const CARRIER_BULLET_ON = 'Can carry up to 2 air units (fighters or tactical bombers).';
export const CARRIER_BULLET_OFF = 'Can carry up to 2 fighters.';
export const CARRIER_TABLE_ON = 'Carries 2 air units (fighters or tactical bombers)';
export const CARRIER_TABLE_OFF = 'Carries 2 fighters';

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
                <tr data-rules-mechanized hidden><td>Mechanized Infantry</td><td>4</td><td>1</td><td>2</td><td>2</td><td>Attacks at 2 when paired with artillery, one for one. Stops on entering an enemy territory unless it moves with a tank.</td></tr>
                <tr data-rules-garrison hidden><td>Garrison</td><td>—</td><td>0</td><td>2</td><td>0</td><td>Original capital only. Cannot move or be purchased. Defends like infantry. Lost only after every other unit there is gone. Returns for free at the end of the original owner's turn if it is missing and they still hold that capital.</td></tr>
                <tr><td>Artillery</td><td>4</td><td>2</td><td>2</td><td>1</td><td data-rules-artillery-note>Boosts paired infantry</td></tr>
                <tr><td>Armour (Tank)</td><td>6</td><td>3</td><td>3</td><td>2</td><td>Can blitz through friendly territory</td></tr>
                <tr><td>Fighter</td><td>10</td><td>3</td><td>4</td><td>4</td><td>Air unit, can land on carriers</td></tr>
                <tr data-rules-tactical hidden><td>Tactical Bomber</td><td>11</td><td>3</td><td>3</td><td>4</td><td>Attacks at 4 when paired with a fighter or tank in the same battle. Can land on a carrier.</td></tr>
                <tr><td>Bomber</td><td>12</td><td>4</td><td>1</td><td>6</td><td>Cannot capture. Can strategic-bomb an enemy factory. Factory AA hits on 1, then each survivor rolls 1 die (2 with Heavy Bombers).</td></tr>
                <tr><td>Submarine</td><td>6</td><td>2</td><td>1</td><td>2</td><td>Cannot hit aircraft. Surprise strike replaces that round's roll. Submerges against aircraft</td></tr>
                <tr><td>Destroyer</td><td>8</td><td>2</td><td>2</td><td>2</td><td>Blocks sub surprise strike. Aircraft hit subs only while a destroyer is in the battle</td></tr>
                <tr><td>Cruiser</td><td>12</td><td>3</td><td>3</td><td>2</td><td>Shore bombardment</td></tr>
                <tr><td>Carrier</td><td>14</td><td>1</td><td>2</td><td>2</td><td data-rules-carrier-table>Carries 2 fighters</td></tr>
                <tr><td>Battleship</td><td>20</td><td>4</td><td>4</td><td>2</td><td>2 HP, shore bombardment</td></tr>
                <tr><td>Transport</td><td>7</td><td>0</td><td>0</td><td>2</td><td>Carries 2 infantry or 1 infantry + 1 other. Not a casualty while a unit the enemy can hit is still in the battle. Destroyed automatically when it is the only unit and the enemy can hit it. A submarine aircraft cannot hit does not protect it</td></tr>
              </tbody>
            </table>
          </section>

          <section class="rules-section" id="rules-combat" data-rules-section="combat">
            <h3>Combat Rules</h3>
            <ul>
              <li><strong>Attacking:</strong> Roll dice equal to unit's attack value. Each die showing that number or less = hit.</li>
              <li><strong>Defending:</strong> Roll dice equal to unit's defense value. Same rules for hits.</li>
              <li><strong>Casualties:</strong> Attacker chooses defender casualties, defender chooses attacker casualties.</li>
              <li data-rules-garrison hidden><strong>Garrison:</strong> Defends only. It is taken only after every other unit on that territory is destroyed.</li>
              <li><strong>Submarines:</strong> Cannot hit aircraft. Aircraft cannot hit a submarine unless that side has a destroyer in the battle. If one side has only aircraft and the other has only submarines, the submarines submerge and the battle ends.</li>
              <li><strong>Transports:</strong> A transport is not chosen as a casualty while a unit the enemy can hit is still in the battle. A submarine facing only aircraft, with no enemy destroyer, does not protect transports: they are destroyed with no dice and the submarine submerges. If a side's only units are transports and the enemy can hit them, the transports are destroyed with no dice.</li>
              <li><strong>Air Units:</strong> Cannot capture territory. Fighters and tactical bombers land on friendly land or a friendly carrier with room. Bombers land on friendly land only and never at sea.</li>
              <li><strong>Retreat:</strong> Ships and land units retreat together to one territory they came from. Aircraft will choose their own landing, using remaining movement: friendly land held since the start of the turn, or a friendly carrier for fighters and tactical bombers. A bomber never lands in a sea zone. If no legal landing exists, the aircraft stays for the end of non-combat movement.</li>
              <li><strong>Strategic bombing:</strong> Only bombers can raid, and only a territory that has an enemy factory. Tactical bombers and fighters do not raid and do not escort. The raid is a separate battle from any normal combat in that territory. The factory's AA fires once per bomber and hits on a 1. Each surviving bomber rolls 1 die, or 2 with Heavy Bombers. The total is damage, capped at twice the factory's output (a capital places 20, any other factory places 5). A damaged factory places output minus damage, minimum 0. The owner may repair during Purchase at 1 IPC per point. A bomber that raided fights in no other combat that turn and must land in Non-Combat Move, using only the movement left after the flight to the factory. Fighters in that same territory still fight each other in the normal battle.</li>
            </ul>
          </section>

          <section class="rules-section" id="rules-transport" data-rules-section="transport">
            <h3>Transport & Carrier Rules</h3>
            <ul>
              <li><strong>Transports:</strong> Can carry 2 infantry OR 1 infantry + 1 other land unit. Not a casualty while a unit the enemy can hit is still in the battle. A submarine aircraft cannot hit does not protect it. Undefended transports are destroyed when an enemy unit can hit them.</li>
              <li><strong>Carriers:</strong> <span data-rules-carrier-bullet>Can carry up to 2 fighters.</span></li>
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
              <li data-rules-mechanized hidden><strong>Mechanized infantry:</strong> Must stop when it enters an enemy territory. With a tank, during combat movement, it can enter an empty enemy territory, capture it, and continue. The next territory can be friendly, hostile, or the one it left. An antiaircraft gun or factory in the first territory stops the move.</li>
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
    this._paintUnitRules();
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

  _paintUnitRules() {
    const on = tacticalBombersEnabled(this.gameState?.gameOptions);
    const mech = mechanizedInfantryEnabled(this.gameState?.gameOptions);
    this.el?.querySelectorAll('[data-rules-tactical]').forEach((el) => {
      el.hidden = !on;
    });
    this.el?.querySelectorAll('[data-rules-mechanized]').forEach((el) => {
      el.hidden = !mech;
    });
    const garrison = garrisonsEnabled(this.gameState?.gameOptions);
    this.el?.querySelectorAll('[data-rules-garrison]').forEach((el) => {
      el.hidden = !garrison;
    });
    this.el?.querySelectorAll('[data-rules-artillery-note]').forEach((el) => {
      el.textContent = mech
        ? 'Boosts one infantry or one mechanized infantry'
        : 'Boosts paired infantry';
    });
    const table = on ? CARRIER_TABLE_ON : CARRIER_TABLE_OFF;
    const bullet = on ? CARRIER_BULLET_ON : CARRIER_BULLET_OFF;
    this.el?.querySelectorAll('[data-rules-carrier-table]').forEach((el) => {
      el.textContent = table;
    });
    this.el?.querySelectorAll('[data-rules-carrier-bullet]').forEach((el) => {
      el.textContent = bullet;
    });
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
