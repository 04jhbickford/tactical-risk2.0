// Income readout. The number is incomePayout, the same figure Collect
// Income adds. Now omits territories captured this turn. End of turn
// does not. There is no second formula.

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;');
}

export function incomeForecast(gameState, playerId) {
  if (!gameState || typeof gameState.incomePayout !== 'function' || !playerId) {
    return {
      now: { amount: 0, lines: [], capitalLost: false },
      end: { amount: 0, lines: [], capitalLost: false },
      differs: false,
    };
  }
  const end = gameState.incomePayout(playerId);
  const captured = gameState.capturedThisTurn;
  const omit = playerId === gameState.currentPlayer?.id
    && captured instanceof Set
    && captured.size > 0
    ? captured
    : null;
  const now = omit ? gameState.incomePayout(playerId, { omitTerritories: omit }) : end;
  return { now, end, differs: now.amount !== end.amount };
}

export function renderIncomeCalculator(gameState, playerId) {
  const forecast = incomeForecast(gameState, playerId);
  const end = forecast.end;
  const now = forecast.now;
  if (end.capitalLost) {
    return `
      <section class="pp-income" data-income-for="${esc(playerId)}" data-now="0" data-end="0">
        <p class="pp-income-verdict">No income</p>
        <p class="pp-income-line">Capital lost</p>
      </section>`;
  }
  const verdict = forecast.differs
    ? `${now.amount} now, ${end.amount} at end of turn`
    : String(end.amount);
  const lines = (end.lines || []).map((line) => {
    const label = line.kind === 'bonus' ? line.name : line.name;
    return `<li class="pp-income-line"><span>${esc(label)}</span><span>${line.ipc}</span></li>`;
  }).join('');
  return `
    <section class="pp-income" data-income-for="${esc(playerId)}" data-now="${now.amount}" data-end="${end.amount}">
      <p class="pp-income-verdict">${esc(verdict)}</p>
      ${lines ? `<ul class="pp-income-lines">${lines}</ul>` : ''}
    </section>`;
}
