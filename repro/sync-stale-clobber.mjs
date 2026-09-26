// Logic-level repro of T1 (wrong turn / board reverts). Uses the real
// shouldApplyRemoteGameState and a verbatim copy of syncManager._pushOnce's
// abort predicate. actionSeq is a PER-CLIENT counter (gameState._notify bumps it
// on every local change), but both guards compare it across clients.
import { shouldApplyRemoteGameState } from '../src/state/placementPass.js';
const pushAborts = ({ remoteVersion, localVersion, remoteSeq, localSeq }) =>
  remoteVersion > localVersion && remoteSeq >= localSeq;   // syncManager.js _pushOnce

// Doc after Rob (host) ends round-4 combat move: v50, seq 200, Rob to play.
let doc = { v: 50, seq: 200, who: 'Rob', board: 'R4-Rob-combat-move' };
// Rob's client: offline / asleep for a while (the "you were away" banner). It
// keeps making local changes (his own moves, host-run AI, UI undo etc.); each
// _notify bumps actionSeq; the pushes fail, and push_exhausted's force reload
// is refused because localSeq > remoteSeq.
const rob = { v: 50, seq: 200 + 12, board: 'R4-Rob-combat-move(stale)' };
console.log('force reload applies while Rob offline? ',
  shouldApplyRemoteGameState({ remoteVersion: 50, localVersion: 50, remoteActionSeq: 200, localActionSeq: rob.seq, force: true }));
// Meanwhile the game moves on: Rob's turn finishes elsewhere/AI, Bastion plays 8 actions.
doc = { v: 58, seq: 208, who: 'Bastion', board: 'R4-Bastion-turn' };
// Rob reconnects: snapshot for v58 arrives.
console.log('Rob applies newer snapshot v58?        ',
  shouldApplyRemoteGameState({ remoteVersion: 58, localVersion: rob.v, remoteCurrentPlayerId: 'Bastion', localCurrentPlayerId: 'Rob', remoteActionSeq: 208, localActionSeq: rob.seq }));
// Rob is host => canPushLocalChange() is always true. Any local _notify pushes:
rob.seq++;
const aborted = pushAborts({ remoteVersion: doc.v, localVersion: rob.v, remoteSeq: doc.seq, localSeq: rob.seq });
console.log('Rob stale push aborted?                ', aborted);
if (!aborted) doc = { v: doc.v + 1, seq: rob.seq, who: 'Rob', board: rob.board };
console.log('Doc now:', JSON.stringify(doc));
console.log(doc.who === 'Rob' ? 'BUG REPRODUCED: stale client overwrote a newer doc (turn and board reverted)' : 'ok');
