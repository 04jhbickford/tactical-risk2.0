// V2.81.57-unified.27 — offline audit fixture.
// Reference case shaped like game 6XQ7CN: stored IPCs do not match the ledger.
// Run: node tools/test-audit-game.mjs

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { auditSnapshots, checksumMatches, formatAuditReport } from '../src/audit/replayGame.js';
import { buildPhaseSnapshot, writeSnapshotWithRetry, SNAPSHOT_VISIBLE_ERROR } from '../src/multiplayer/phaseSnapshot.js';
import { GAME_VERSION, SCHEMA_VERSION } from '../src/version.js';
import { battlesFromDiceSources } from '../src/stats/battleDice.js';
import { renderBattleDiceFromModel } from '../src/ui/battleDicePanel.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

function board({ round, phase, ipcs, units }) {
  return {
    round,
    turnPhase: phase,
    players: [{ id: 'Russians' }, { id: 'Germans' }, { id: 'Americans' }],
    playerState: {
      Russians: { ipcs: ipcs.Russians },
      Germans: { ipcs: ipcs.Germans },
      Americans: { ipcs: ipcs.Americans },
    },
    units,
    pendingAirLandings: [],
  };
}

console.log('=== V2.81.57-unified.27 audit fixture ===');
check('schema stays 11', SCHEMA_VERSION === 11);
check('display stamp is unified.26', GAME_VERSION === 'V2.81.57-unified.27');

const opening = await buildPhaseSnapshot(board({
  round: 4,
  phase: 'develop_tech',
  ipcs: { Russians: 100, Germans: 90, Americans: 30 },
  units: {
    France: [{ type: 'fighter', quantity: 1, owner: 'Russians', ledgerId: 'fighter_air_1' }],
  },
}), { seq: 1, ts: 1000, clientVersion: GAME_VERSION });

const purchase = await buildPhaseSnapshot(board({
  round: 4,
  phase: 'purchase',
  ipcs: { Russians: 134, Germans: 129, Americans: 35 },
  units: { France: [] },
}), { seq: 1, ts: 2000, clientVersion: GAME_VERSION });

const events = [
  {
    ts: 1500,
    kind: 'purchase',
    ipcBefore: { Russians: 100, Germans: 90, Americans: 30 },
    ipcAfter: { Russians: 100, Germans: 90, Americans: 30 },
    unitsCreated: [],
    unitsDestroyed: [],
    unitsMoved: [],
  },
  {
    ts: 1600,
    kind: 'retreat',
    unitsDestroyed: [],
    unitsMoved: [{ id: 'tank_1', type: 'tank', owner: 'Russians', from: 'France', to: 'Germany', quantity: 1 }],
  },
];

const result = await auditSnapshots({ snapshots: [opening, purchase], events });
const report = formatAuditReport('6XQ7CN', result);
console.log(report);
check('reference IPC Russians 134 vs 100', report.includes('IPC mismatch Russians 134 vs 100'));
check('reference IPC Germans 129 vs 90', report.includes('IPC mismatch Germans 129 vs 90'));
check('reference IPC Americans 35 vs 30', report.includes('IPC mismatch Americans 35 vs 30'));
check('unit count drift is reported', result.findings.some((row) => row.kind === 'unit-count' && row.line.includes('unit count drift')));
check('vanished fighter is reported', result.findings.some((row) => row.kind === 'vanished' && row.id === 'fighter_air_1'));
check('findings are on the purchase phase', result.findings.every((row) => row.phase === 'purchase' && row.turn === 4));

const quietStart = await buildPhaseSnapshot(board({
  round: 1,
  phase: 'purchase',
  ipcs: { Russians: 10, Germans: 10, Americans: 10 },
  units: { Berlin: [{ type: 'infantry', quantity: 2, owner: 'Germans', ledgerId: 'inf_1' }] },
}), { seq: 1, ts: 10, clientVersion: GAME_VERSION });
const quietEnd = await buildPhaseSnapshot(board({
  round: 1,
  phase: 'combat_move',
  ipcs: { Russians: 10, Germans: 7, Americans: 10 },
  units: { Berlin: [{ type: 'infantry', quantity: 2, owner: 'Germans', ledgerId: 'inf_1' }] },
}), { seq: 1, ts: 20, clientVersion: GAME_VERSION });
const quiet = await auditSnapshots({
  snapshots: [quietStart, quietEnd],
  events: [{
    ts: 15,
    kind: 'purchase',
    ipcBefore: { Russians: 10, Germans: 10, Americans: 10 },
    ipcAfter: { Russians: 10, Germans: 7, Americans: 10 },
  }],
});
check('a matching ledger has no findings', quiet.ok === true && quiet.findings.length === 0);
check('snapshot mapId defaults to classic', opening.mapId === 'classic');
check('classic snapshot checksum ignores mapId', await checksumMatches(opening));
const namedMap = await buildPhaseSnapshot({
  ...board({
    round: 4,
    phase: 'develop_tech',
    ipcs: { Russians: 100, Germans: 90, Americans: 30 },
    units: {
      France: [{ type: 'fighter', quantity: 1, owner: 'Russians', ledgerId: 'fighter_air_1' }],
    },
  }),
  mapId: 'pacific',
}, { seq: 1, ts: 1000, clientVersion: GAME_VERSION });
check('snapshot records a named mapId outside the checksum',
  namedMap.mapId === 'pacific'
  && namedMap.checksum === opening.checksum
  && await checksumMatches(namedMap));

let attempts = 0;
let surfaced = null;
const failed = await writeSnapshotWithRetry({
  snapshot: { id: '4-purchase-1' },
  attempts: 3,
  wait: async () => {},
  write: async () => {
    attempts += 1;
    const err = new Error('unavailable');
    err.code = 'unavailable';
    throw err;
  },
  onError: (failure) => { surfaced = failure.message; },
});
check('snapshot write retries then surfaces', attempts === 3 && failed.ok === false && surfaced === SNAPSHOT_VISIBLE_ERROR);

let bumped = 0;
const created = await writeSnapshotWithRetry({
  snapshot: { id: '4-purchase-1', seq: 1 },
  attempts: 3,
  wait: async () => {},
  write: async (body) => {
    if (body.seq === 1) {
      const err = new Error('exists');
      err.code = 'already-exists';
      throw err;
    }
  },
  bumpSeq: async (current) => {
    bumped += 1;
    return { ...current, seq: current.seq + 1, id: `4-purchase-${current.seq + 1}` };
  },
});
check('an existing snapshot id bumps seq instead of updating', created.ok === true && created.id === '4-purchase-2' && bumped === 1);

const battles = battlesFromDiceSources({
  batches: [{
    gameId: '6XQ7CN',
    round: 4,
    battleRound: 2,
    territory: 'East US Sea Zone',
    side: 'attacker',
    dice: [{ unit: 'fighter', face: 2, need: 3 }],
  }, {
    gameId: '6XQ7CN',
    round: 4,
    battleRound: 2,
    territory: 'East US Sea Zone',
    side: 'defender',
    dice: [{ unit: 'submarine', face: 4, need: 1 }],
  }],
  events: [],
});
check('past battle keeps territory, round, need, and hit',
  battles.length === 1
  && battles[0].territory === 'East US Sea Zone'
  && battles[0].battleRound === 2
  && battles[0].attacker[0].need === 3
  && battles[0].attacker[0].hit === true
  && battles[0].defender[0].hit === false);

const html = renderBattleDiceFromModel({ status: 'ready', battles, placement: 'sheet', signedIn: true });
check('panel names the battle and the dice',
  html.includes('East US Sea Zone')
  && html.includes('Round 2')
  && html.includes('need 3')
  && html.includes('need 1'));
check('panel rows and close control use the 44px class',
  html.includes('battle-dice-row') && html.includes('battle-dice-close'));

const css = readFileSync(join(root, 'style.css'), 'utf8');
const panelCss = css.slice(css.indexOf('.battle-dice {'));
check('panel CSS forbids horizontal scroll and sets 44px targets',
  panelCss.includes('overflow-x: hidden')
  && panelCss.includes('min-height: 44px')
  && panelCss.includes('min-width: 44px')
  && panelCss.includes('overflow-wrap: anywhere'));

const rules = readFileSync(join(root, 'firestore.rules'), 'utf8');
check('snapshot rules are create-only for members',
  rules.includes('match /snapshots/{snapshotId}')
  && rules.includes('allow update, delete: if false;')
  && rules.includes('canAppendSnapshot()')
  && rules.includes("request.auth.uid in game.playerUserIds"));
const gamesUpdate = rules.slice(rules.indexOf('match /games/{gameId}'), rules.indexOf('match /presence/{userId}'));
check('old clients can still update the game document',
  /allow update: if request\.auth != null;/.test(gamesUpdate));

// Emulator cases, run by tools/rules-snapshots.emulator.mjs when
// FIRESTORE_EMULATOR_HOST is set. Documented here so a machine without
// Java still records the contract:
// 1. A seated member can create games/{id}/snapshots/{turn}-{phase}-{seq}.
// 2. The same id cannot be updated.
// 3. Delete is denied.
// 4. A signed-in user who is not a member cannot create.
// 5. A member can still update the game document (old clients).

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll audit checks passed');
