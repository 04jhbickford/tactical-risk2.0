// Unified 3D Dice Animation Component
// Used for all dice rolls: combat, AA fire, tech research

export class DiceAnimator {
  constructor(container) {
    this.container = container;
    this.isAnimating = false;
  }

  /**
   * Animate dice rolls with 3D effect
   * @param {number} diceCount - Number of dice to roll
   * @param {function} rollFn - Function that returns array of {roll, hit} results
   * @param {object} options - { duration: 1000, color: 'red'|'blue' }
   * @returns {Promise<Array>} - Final roll results
   */
  async animate(diceCount, rollFn, options = {}) {
    const duration = options.duration || 1000;
    const color = options.color || 'neutral';

    this.isAnimating = true;

    // Create dice elements
    this._renderAnimatingDice(diceCount, color);

    // Animate for duration
    const startTime = Date.now();

    return new Promise(resolve => {
      const animateFrame = () => {
        const elapsed = Date.now() - startTime;

        if (elapsed < duration) {
          // Update dice with random values during animation
          this._updateDiceValues(diceCount);
          requestAnimationFrame(animateFrame);
        } else {
          // Final roll
          const results = rollFn();
          this._renderFinalDice(results, color);
          this.isAnimating = false;
          resolve(results);
        }
      };

      requestAnimationFrame(animateFrame);
    });
  }

  _renderAnimatingDice(count, color) {
    const maxVisible = 12;
    const visibleCount = Math.min(count, maxVisible);

    let html = `<div class="dice-3d-container ${color}">`;

    for (let i = 0; i < visibleCount; i++) {
      const roll = Math.floor(Math.random() * 6) + 1;
      const delay = i * 50; // Stagger animation start
      html += `
        <div class="die-3d rolling" style="animation-delay: ${delay}ms">
          <div class="die-face">${roll}</div>
        </div>
      `;
    }

    if (count > maxVisible) {
      html += `<span class="dice-overflow">+${count - maxVisible} more</span>`;
    }

    html += '</div>';
    this.container.innerHTML = html;
  }

  _updateDiceValues(count) {
    const dice = this.container.querySelectorAll('.die-face');
    dice.forEach(die => {
      die.textContent = Math.floor(Math.random() * 6) + 1;
    });
  }

  _renderFinalDice(results, color) {
    const maxVisible = 12;
    const visibleResults = results.slice(0, maxVisible);

    let html = `<div class="dice-3d-container ${color} final">`;

    for (const result of visibleResults) {
      const hitClass = result.hit ? 'hit' : 'miss';
      html += `
        <div class="die-3d ${hitClass}">
          <div class="die-face">${result.roll}</div>
        </div>
      `;
    }

    if (results.length > maxVisible) {
      const extraHits = results.slice(maxVisible).filter(r => r.hit).length;
      html += `<span class="dice-overflow">+${results.length - maxVisible} (${extraHits} hits)</span>`;
    }

    html += '</div>';
    this.container.innerHTML = html;
  }
}

// CSS for 3D dice (add to style.css)
export const DICE_CSS = `
/* 3D Dice Animation */
.dice-3d-container {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  padding: 12px;
  min-height: 60px;
}

.die-3d {
  width: 40px;
  height: 40px;
  perspective: 100px;
  transform-style: preserve-3d;
}

.die-3d .die-face {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: bold;
  background: linear-gradient(145deg, #ffffff, #e6e6e6);
  border-radius: 8px;
  box-shadow:
    2px 2px 4px rgba(0,0,0,0.3),
    inset 1px 1px 2px rgba(255,255,255,0.8);
  color: #333;
}

.die-3d.rolling {
  animation: diceRoll3D 0.15s infinite ease-in-out;
}

.die-3d.rolling .die-face {
  animation: diceFaceSpin 0.1s infinite linear;
}

@keyframes diceRoll3D {
  0%, 100% { transform: rotateX(0deg) rotateY(0deg) scale(1); }
  25% { transform: rotateX(15deg) rotateY(-15deg) scale(1.1); }
  50% { transform: rotateX(-10deg) rotateY(20deg) scale(0.95); }
  75% { transform: rotateX(20deg) rotateY(-10deg) scale(1.05); }
}

@keyframes diceFaceSpin {
  0% { transform: rotateZ(0deg); }
  100% { transform: rotateZ(360deg); }
}

.die-3d.hit .die-face {
  background: linear-gradient(145deg, #4ade80, #22c55e);
  color: #fff;
  box-shadow:
    0 0 12px rgba(74, 222, 128, 0.6),
    2px 2px 4px rgba(0,0,0,0.3);
  animation: hitPulse 0.5s ease-out;
}

.die-3d.miss .die-face {
  background: linear-gradient(145deg, #a0a0a0, #888);
  color: #555;
}

@keyframes hitPulse {
  0% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.dice-3d-container.attacker .die-3d.hit .die-face {
  background: linear-gradient(145deg, #ef4444, #dc2626);
}

.dice-3d-container.defender .die-3d.hit .die-face {
  background: linear-gradient(145deg, #3b82f6, #2563eb);
}

.dice-overflow {
  display: flex;
  align-items: center;
  font-size: 12px;
  color: #888;
  padding: 0 8px;
}
`;
