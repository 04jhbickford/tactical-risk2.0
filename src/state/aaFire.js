// One AA shot per attacking aircraft, in listed stack order.
// A hit removes that aircraft. A miss leaves it. Cost does not choose.

export function aaShotTargets(attackers, unitDefs) {
  const targets = [];
  for (const unit of attackers || []) {
    if (!unit || !unitDefs?.[unit.type]?.isAir) continue;
    const qty = Math.max(0, Math.floor(Number(unit.quantity) || 0));
    for (let i = 0; i < qty; i += 1) targets.push(unit);
  }
  return targets;
}

export function applyAaRolls(targets, rolls) {
  const losses = {};
  (rolls || []).forEach((row, index) => {
    if (!row?.hit) return;
    const unit = targets[index];
    const qty = Number(unit?.quantity) || 0;
    if (!unit || qty <= 0) return;
    unit.quantity = qty - 1;
    losses[unit.type] = (losses[unit.type] || 0) + 1;
  });
  return losses;
}
