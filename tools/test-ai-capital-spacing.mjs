// V2.81.57-unified.17 — AI capitals prefer two steps of space.
// Humans are unchanged. Fallback is today's pick on the full owned list.
// Run: node tools/test-ai-capital-spacing.mjs

import { readFileSync } from 'fs';
import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const {
  graphDistance,
  capitalChoicePool,
  pickCapitalFromPool,
} = await import(pathToFileURL(join(root, 'src/ai/capitalSpacing.js')));
const { resolveMovementUndoBar, formatUndoBarLabel } = await import(pathToFileURL(join(root, 'src/state/undoPolicy.js')));
const { GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const links = {
  A: ['B'],
  B: ['A', 'C'],
  C: ['B', 'D'],
  D: ['C'],
};
const neighbors = (name) => links[name] || [];
const connections = { B: 5, C: 2, D: 1 };

console.log('=== spacing pool ===');
check('two steps from A lands on C', graphDistance('A', 'C', neighbors) === 2);
check('B is one step from A', graphDistance('A', 'B', neighbors) === 1);
const owned = ['B', 'C', 'D'];
const spaced = capitalChoicePool(owned, ['A'], neighbors);
check('pool keeps territories that are two or more steps, in order', JSON.stringify(spaced) === JSON.stringify(['C', 'D']));
check('no existing capital leaves the owned list alone', JSON.stringify(capitalChoicePool(owned, [], neighbors)) === JSON.stringify(owned));
const fallback = capitalChoicePool(['B'], ['A'], neighbors);
check('fallback is the full owned list in the same order', JSON.stringify(fallback) === JSON.stringify(['B']));

console.log('=== difficulty rules run on that pool ===');
const connectionCount = (territory) => connections[territory] || 0;
check('hard on the full list still takes the most connected',
  pickCapitalFromPool(owned, 'hard', { connectionCount }) === 'B');
check('hard on the spaced pool skips the adjacent capital neighbor',
  pickCapitalFromPool(spaced, 'hard', { connectionCount }) === 'C');
check('fallback hard pick matches today\'s pick',
  pickCapitalFromPool(fallback, 'hard', { connectionCount })
    === pickCapitalFromPool(['B'], 'hard', { connectionCount }));
check('easy rolls inside the pool',
  pickCapitalFromPool(spaced, 'easy', { random: () => 0 }) === 'C');
check('medium ties keep the first territory',
  pickCapitalFromPool(['C', 'D'], 'medium', { friendlyNeighborCount: () => 2 }) === 'C');
check('medium all-zero keeps the first territory',
  pickCapitalFromPool(['D', 'C'], 'medium', { friendlyNeighborCount: () => 0 }) === 'D');

const aiSrc = readFileSync(join(root, 'src/ai/aiController.js'), 'utf8');
const panelSrc = readFileSync(join(root, 'src/ui/playerPanel.js'), 'utf8');
const mainSrc = readFileSync(join(root, 'src/main.js'), 'utf8');
check('AI capital placement uses the spacing pool', aiSrc.includes('capitalChoicePool(') && aiSrc.includes('pickCapitalFromPool('));
check('human capital click does not use the spacing pool',
  !panelSrc.includes('capitalChoicePool') && !mainSrc.includes('capitalChoicePool'));

console.log('=== Undo (n) bar ===');
const moves = [{ id: 'm1' }, { id: 'm2' }];
const bar = resolveMovementUndoBar({
  phase: GAME_PHASES.PLAYING,
  turnPhase: TURN_PHASES.COMBAT_MOVE,
  moveHistory: moves,
  undoLockMoveCount: 0,
});
check('movement bar counts undoable rows', bar.show && bar.count === 2 && bar.action === 'undo-move');
check('label is Undo (n)', formatUndoBarLabel(bar.count) === 'Undo (2)');
const locked = resolveMovementUndoBar({
  phase: GAME_PHASES.PLAYING,
  turnPhase: TURN_PHASES.COMBAT_MOVE,
  moveHistory: moves,
  undoLockMoveCount: 2,
});
check('locked movement rows hide the bar', locked.show === false);
const air = resolveMovementUndoBar({
  phase: GAME_PHASES.PLAYING,
  turnPhase: TURN_PHASES.COMBAT,
  airLandingCount: 3,
});
check('combat air-landing uses the bar', air.show && air.count === 3 && air.action === 'undo-air-landing');
const place = resolveMovementUndoBar({
  phase: GAME_PHASES.UNIT_PLACEMENT,
  turnPhase: null,
  moveHistory: moves,
});
check('placement does not use the movement bar', place.show === false);
check('desktop shortcut looks for the bar button', mainSrc.includes('[data-undo-bar="1"]') && mainSrc.includes('e.metaKey'));

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll AI capital spacing checks passed');
