function escapeAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export function combatBattleRows(gameState) {
  const playerId = gameState?.currentPlayer?.id;
  return (gameState?.combatQueue || []).map((name) => {
    const units = gameState.units?.[name] || [];
    let attackers = 0;
    let defenders = 0;
    for (const unit of units) {
      const qty = Number(unit?.quantity) || 0;
      if (qty <= 0 || !unit?.type || unit.type === 'factory') continue;
      if (unit.owner === playerId) attackers += qty;
      else if (!gameState.areAllies?.(playerId, unit.owner)) defenders += qty;
    }
    const isWater = !!gameState.territoryByName?.[name]?.isWater;
    const blocked = gameState.amphibiousSeaStillQueued?.(name) || '';
    return { name, attackers, defenders, isWater, blocked };
  });
}

export function renderCombatBattleList(gameState, { phone = false } = {}) {
  const rows = combatBattleRows(gameState);
  if (!rows.length) return '';
  const buttons = rows.map((row) => {
    const icon = row.isWater ? '⚓' : '⚔';
    const hint = row.blocked ? `after ${row.blocked}` : '';
    return `<button type="button" class="pp-battle-row${phone ? ' pp-battle-row-phone' : ''}${row.blocked ? ' is-blocked' : ''}" data-action="pick-battle" data-territory="${escapeAttr(row.name)}" ${row.blocked ? 'disabled' : ''} ${hint ? `title="${escapeAttr(hint)}"` : ''}>
      <span class="pp-battle-icon" aria-hidden="true">${icon}</span>
      <span class="pp-battle-name">${escapeAttr(row.name)}</span>
      <span class="pp-battle-counts">${row.attackers} vs ${row.defenders}</span>
      ${hint ? `<span class="pp-battle-hint">${escapeAttr(hint)}</span>` : ''}
    </button>`;
  }).join('');
  return `<div class="pp-battle-list">${buttons}</div>`;
}
