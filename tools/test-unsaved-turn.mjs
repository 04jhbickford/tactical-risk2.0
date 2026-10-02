// A stale save and an exhausted failed save must keep the local turn.
// They must not force-reload the remote doc. Run: node tools/test-unsaved-turn.mjs
// This does not open Firebase. It proves the retry decision and that
// _runPushWithRetry no longer force-reloads those two failures. A signed-in
// multiplayer game is still required to see the write land on the server.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sync = readFileSync(join(root, 'src/multiplayer/syncManager.js'), 'utf8');

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

const retryStart = sync.indexOf('async _runPushWithRetry()');
const retryEnd = sync.indexOf('async _pushOnce()');
const retry = retryStart >= 0 && retryEnd > retryStart ? sync.slice(retryStart, retryEnd) : '';
const staleAt = retry.indexOf("outcome.status === 'stale'");
const okAt = retry.indexOf("status === 'ok'");
const staleBranch = staleAt >= 0 && okAt > staleAt ? retry.slice(staleAt, okAt) : '';
const catchAt = retry.indexOf('} catch (error)');
const exhaustBranch = catchAt >= 0 ? retry.slice(catchAt) : '';

function reloadsOnItsOwn(branch) {
  const call = '_reloadRemoteState({ force: true })';
  const at = branch.indexOf(call);
  if (at === -1) return false;
  return !branch.slice(Math.max(0, at - 120), at).includes('plan.forceReload');
}

check('retry plans a rejected save', retry.includes('planRejectedSave('));
check('a stale push does not force-reload', staleBranch.length > 0 && !reloadsOnItsOwn(staleBranch));
check('an exhausted failed push does not force-reload', exhaustBranch.length > 0 && !reloadsOnItsOwn(exhaustBranch));

const { planRejectedSave } = await import(new URL('../src/multiplayer/syncAuthority.js', import.meta.url));

function localTurn() {
  return {
    phase: 'playing',
    turnPhase: 'purchase',
    units: { Ukraine: [{ type: 'armour', quantity: 4 }] },
    turnEvents: [{ type: 'combat', territory: 'Ukraine', attackerLosses: { armour: 4 } }],
  };
}

// Same decisions as SyncManager._runPushWithRetry. A push that returns ok
// confirms. A stale or thrown save never force-reloads.
async function replay(pushOnce, { confirmedSeatId = 'bas' } = {}) {
  const MAX_ATTEMPTS = 3;
  const turn = localTurn();
  let localVersion = 5;
  let attempt = 0;
  let pushedLocalAgain = false;
  let reloaded = false;
  let confirmed = false;
  let exhausted = false;
  let notice = '';
  while (attempt < MAX_ATTEMPTS || !pushedLocalAgain) {
    if (attempt >= MAX_ATTEMPTS) pushedLocalAgain = true;
    attempt += 1;
    try {
      const outcome = await pushOnce({ localVersion, turn, attempt });
      if (outcome.status === 'gone') break;
      if (outcome.status === 'stale') {
        const plan = planRejectedSave({
          kind: 'stale',
          attempt,
          maxAttempts: MAX_ATTEMPTS,
          confirmedSeatId,
          remoteSeatId: outcome.remoteSeat ?? null,
          remoteVersion: outcome.remoteVersion,
          localVersion,
          alreadyPushedAgain: attempt > MAX_ATTEMPTS,
        });
        localVersion = plan.localVersion;
        if (plan.forceReload) reloaded = true;
        if (plan.action === 'push-local') continue;
        notice = plan.notice || '';
        break;
      }
      confirmed = true;
      localVersion = outcome.version;
      break;
    } catch (error) {
      const plan = planRejectedSave({
        kind: 'error',
        attempt,
        maxAttempts: MAX_ATTEMPTS,
        localVersion,
        alreadyPushedAgain: attempt > MAX_ATTEMPTS,
      });
      if (plan.forceReload) reloaded = true;
      if (plan.action === 'retry' || plan.action === 'push-local') continue;
      exhausted = true;
      notice = error?.message || '';
      break;
    }
  }
  return { turn, localVersion, reloaded, confirmed, exhausted, notice };
}

{
  let server = 10;
  let calls = 0;
  let wrote = null;
  const result = await replay(async ({ localVersion, turn }) => {
    calls += 1;
    if (calls <= 3) {
      server = Math.max(server, localVersion) + 1;
      return { status: 'stale', remoteVersion: server, remoteSeat: 'bas' };
    }
    wrote = structuredClone(turn);
    return { status: 'ok', version: localVersion + 1 };
  });
  const turn = localTurn();
  check('stale same-seat save keeps the local turn',
    result.reloaded === false
    && result.confirmed === true
    && result.turn.phase === turn.phase
    && result.turn.turnPhase === turn.turnPhase
    && result.turn.units.Ukraine[0].quantity === 4
    && result.turn.turnEvents.length === 1
    && result.turn.turnEvents[0].territory === 'Ukraine');
  check('stale same-seat save takes the server version and pushes the local turn',
    calls === 4
    && wrote?.units?.Ukraine?.[0]?.quantity === 4
    && wrote?.turnEvents?.[0]?.territory === 'Ukraine'
    && result.localVersion === 14);
}

{
  let calls = 0;
  const result = await replay(async () => {
    calls += 1;
    throw new Error('network');
  });
  const turn = localTurn();
  check('exhausted failed save keeps the local turn',
    result.reloaded === false
    && result.confirmed === false
    && result.exhausted === true
    && calls === 4
    && result.turn.phase === turn.phase
    && result.turn.turnPhase === turn.turnPhase
    && result.turn.units.Ukraine[0].quantity === 4
    && result.turn.turnEvents[0].territory === 'Ukraine');
}

{
  const giveUp = planRejectedSave({
    kind: 'stale',
    attempt: 4,
    maxAttempts: 3,
    confirmedSeatId: 'bas',
    remoteSeatId: 'bas',
    remoteVersion: 12,
    localVersion: 5,
    alreadyPushedAgain: true,
  });
  const blown = planRejectedSave({
    kind: 'error',
    attempt: 4,
    maxAttempts: 3,
    localVersion: 5,
    alreadyPushedAgain: true,
  });
  check('a rejected save does not ask for a force-reload',
    giveUp.forceReload === false
    && giveUp.action === 'keep-local'
    && giveUp.localVersion === 12
    && blown.forceReload === false
    && blown.action === 'keep-local'
    && blown.localVersion === 5);
}

{
  const first = await replay(async () => ({ status: 'ok', version: 6 }));
  check('a push that succeeds still confirms', first.confirmed === true && first.reloaded === false && first.localVersion === 6);
}

console.log(failures === 0 ? '\nALL UNSAVED-TURN CHECKS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
