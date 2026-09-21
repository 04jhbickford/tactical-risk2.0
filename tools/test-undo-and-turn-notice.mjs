// V2.77: undo default + turn-notice hook (no vendor / no WhatsApp client).
// Run: node tools/test-undo-and-turn-notice.mjs

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GAME_VERSION, SCHEMA_VERSION } =
  await import(pathToFileURL(join(root, 'src/version.js')));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { resolveUndoAction, canUndoLastMove, shouldPassPlacementTurn, shouldApplyUndoAction } =
  await import(pathToFileURL(join(root, 'src/state/undoPolicy.js')));
const {
  resolveTurnNoticeUrl,
  shouldPostTurnNotice,
  buildTurnNoticePayload,
  maybePostTurnNotice,
} = await import(pathToFileURL(join(root, 'src/multiplayer/turnNotice.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures++; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

console.log('=== Version stamps ===');
check('GAME_VERSION is V2.81.57-dual-path.12', GAME_VERSION === 'V2.81.57-dual-path.12');
check('SCHEMA_VERSION stays 11', SCHEMA_VERSION === 11);

console.log('=== Undo is default except combat resolve and Done/pass ===');
check('place/deploy undo shows',
  resolveUndoAction({
    phase: GAME_PHASES.UNIT_PLACEMENT, canUndoPlacement: true,
  }).action === 'undo-placement');
check('capital undo shows',
  resolveUndoAction({
    phase: GAME_PHASES.CAPITAL_PLACEMENT, canUndoCapital: true,
  }).action === 'undo-capital');
check('purchase undo shows',
  resolveUndoAction({
    phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.PURCHASE, canUndoPurchase: true,
  }).action === 'undo-purchase');
check('combat-move undo shows',
  resolveUndoAction({
    phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.COMBAT_MOVE, canUndoMove: true,
  }).action === 'undo-move');
check('non-combat-move undo shows',
  resolveUndoAction({
    phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.NON_COMBAT_MOVE, canUndoMove: true,
  }).action === 'undo-move');
check('mobilize undo shows',
  resolveUndoAction({
    phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.MOBILIZE, canUndoMobilize: true,
  }).action === 'undo-mobilize');
check('combat resolve hides undo',
  resolveUndoAction({
    phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.COMBAT, canUndoMove: true,
  }).show === false
  && resolveUndoAction({
    phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.COMBAT, canUndoMove: true,
  }).reason === 'combat');
check('air-land undo shows during COMBAT (9.20.26.06)',
  resolveUndoAction({
    phase: GAME_PHASES.PLAYING, turnPhase: TURN_PHASES.COMBAT, canUndoAirLanding: true,
  }).action === 'undo-air-landing');
check('Done/pass with empty history hides undo',
  resolveUndoAction({
    phase: GAME_PHASES.UNIT_PLACEMENT, canUndoPlacement: false,
  }).show === false);
check('B33: Undo lock does not pass the turn',
  shouldPassPlacementTurn({
    action: 'finish-placement', lockAction: 'undo-placement',
  }) === false);
check('B33: Undo still applies when the click retargets to Done',
  shouldApplyUndoAction({
    action: 'undo-placement', lockAction: 'undo-placement',
  }) === true);
check('B34: map / overlay click does not Done',
  shouldPassPlacementTurn({
    action: 'finish-placement', fromOverlayCommit: true,
  }) === false
  && shouldPassPlacementTurn({
    action: 'finish-placement', mapClick: true,
  }) === false);
check('B34: an explicit Done lock still passes',
  shouldPassPlacementTurn({
    action: 'finish-placement', lockAction: 'finish-placement',
  }) === true);
check('locked combat moves are not undoable',
  canUndoLastMove({
    turnPhase: TURN_PHASES.NON_COMBAT_MOVE,
    moveHistoryLength: 2,
    undoLockMoveCount: 2,
  }) === false);
check('new NCM move after lock is undoable',
  canUndoLastMove({
    turnPhase: TURN_PHASES.NON_COMBAT_MOVE,
    moveHistoryLength: 3,
    undoLockMoveCount: 2,
  }) === true);

{
  const territories = [
    { name: 'A', isWater: false, connections: ['B'] },
    { name: 'B', isWater: false, connections: ['A'] },
  ];
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.players = [{ id: 'p1', name: 'James', oderId: 'james', isAI: false }];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.PURCHASE;
  gs.playerState = { p1: { ipcs: 20, capitalTerritory: 'A' } };
  gs.territoryState = { A: { owner: 'p1' }, B: { owner: 'p1' } };
  gs.units = { A: [], B: [] };
  const defs = { infantry: { cost: 3, isLand: true } };
  check('purchase 1 ok', gs.addToPendingPurchases('infantry', defs).success === true);
  check('purchase 2 ok', gs.addToPendingPurchases('infantry', defs).success === true);
  check('purchase + is undoable', gs.undoLastPurchase(defs).success === true);
  check('one infantry remains after undo',
    gs.getPendingPurchases().find(p => p.type === 'infantry')?.quantity === 1);

  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT;
  gs.moveHistory = [{ from: 'A', to: 'B', units: [{ type: 'infantry', quantity: 1 }], player: 'p1' }];
  gs.undoLockMoveCount = 1;
  check('undoLastMove refuses after combat resolve',
    gs.undoLastMove().success === false);
  check('retreat still sees the locked move history',
    gs.getRetreatDestinations('B').includes('A'));
}

console.log('=== Turn notice hook is unused without a URL ===');
check('empty config is unused',
  resolveTurnNoticeUrl({ envUrl: '', windowUrl: '' }) === null);
check('garbage URL is unused',
  resolveTurnNoticeUrl({ envUrl: 'not-a-url', windowUrl: '' }) === null);
check('https URL is accepted',
  resolveTurnNoticeUrl({ envUrl: 'https://example.test/hook' }) === 'https://example.test/hook');
check('no URL ⇒ no post',
  shouldPostTurnNotice({
    prevPlayerId: 'a', nextPlayerId: 'b', url: null,
  }) === false);
check('same seat ⇒ no post',
  shouldPostTurnNotice({
    prevPlayerId: 'a', nextPlayerId: 'a', url: 'https://example.test/hook',
  }) === false);
check('missing prev (game start) ⇒ no post',
  shouldPostTurnNotice({
    prevPlayerId: null, nextPlayerId: 'b', url: 'https://example.test/hook',
  }) === false);
check('seat swap + URL ⇒ post',
  shouldPostTurnNotice({
    prevPlayerId: 'a', nextPlayerId: 'b', url: 'https://example.test/hook',
  }) === true);
check('payload has no phone numbers',
  JSON.stringify(buildTurnNoticePayload({
    gameCode: 'ZUJMNP', currentPlayerName: 'James', phase: 'unit_placement',
  })) === JSON.stringify({
    gameCode: 'ZUJMNP', currentPlayerName: 'James', phase: 'unit_placement',
  }));

{
  const posts = [];
  const result = maybePostTurnNotice({
    prevPlayerId: 'host',
    nextPlayerId: 'james',
    nextPlayerName: 'James',
    gameCode: 'ZUJMNP',
    phase: 'unit_placement',
    config: { envUrl: 'https://example.test/hook' },
    post: (url, payload) => {
      posts.push({ url, payload });
      return { ok: true };
    },
  });
  check('configured swap POSTs the hook once',
    result.ok === true && posts.length === 1
    && posts[0].url === 'https://example.test/hook'
    && posts[0].payload.gameCode === 'ZUJMNP'
    && posts[0].payload.currentPlayerName === 'James'
    && posts[0].payload.phase === 'unit_placement');
  const skipped = maybePostTurnNotice({
    prevPlayerId: 'host',
    nextPlayerId: 'james',
    config: { envUrl: '' },
    post: () => { throw new Error('should not post'); },
  });
  check('unconfigured hook stays unused', skipped.reason === 'skipped');
}

console.log(failures === 0 ? '\nALL UNDO + TURN-NOTICE CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
