// Replay ledger events between phase snapshots.
// Read-only. The CLI and the offline fixture share this.

import { canonicalJson, sha256Hex } from '../multiplayer/phaseSnapshot.js';
import { collectUnitIds, totalUnitQuantity } from '../state/unitLedger.js';

const PHASE_ORDER = [
  'develop_tech',
  'purchase',
  'combat_move',
  'combat',
  'non_combat_move',
  'mobilize',
  'collect_income',
];

export function parseSnapshotId(id) {
  const match = /^(\d+)-([A-Za-z0-9_]+)-(\d+)$/.exec(String(id || ''));
  if (!match) return null;
  return { turn: Number(match[1]), phase: match[2], seq: Number(match[3]) };
}

export function phaseRank(phase) {
  const idx = PHASE_ORDER.indexOf(phase);
  return idx === -1 ? PHASE_ORDER.length : idx;
}

export function sortSnapshots(snapshots) {
  return (snapshots || []).slice().sort((a, b) => {
    const at = Number(a?.turn) || 0;
    const bt = Number(b?.turn) || 0;
    if (at !== bt) return at - bt;
    const ap = phaseRank(a?.phase);
    const bp = phaseRank(b?.phase);
    if (ap !== bp) return ap - bp;
    const as = Number(a?.seq) || 0;
    const bs = Number(b?.seq) || 0;
    if (as !== bs) return as - bs;
    return (Number(a?.ts) || 0) - (Number(b?.ts) || 0);
  });
}

export function eventsBetween(events, prev, cur) {
  const from = Number(prev?.ts);
  const to = Number(cur?.ts);
  return (events || [])
    .filter((event) => {
      if (!event) return false;
      const ts = Number(event.ts);
      if (!Number.isFinite(ts)) return false;
      if (Number.isFinite(from) && ts <= from) return false;
      if (Number.isFinite(to) && ts > to) return false;
      return true;
    })
    .sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
}

function asMap(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function replayIpc(start, events) {
  const ipc = { ...asMap(start) };
  for (const event of events || []) {
    const before = asMap(event.ipcBefore);
    const after = asMap(event.ipcAfter);
    for (const player of Object.keys(after)) {
      const from = Number(before[player]);
      const to = Number(after[player]);
      if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
      const base = Number(ipc[player]);
      ipc[player] = (Number.isFinite(base) ? base : 0) + (to - from);
    }
  }
  return ipc;
}

export function replayUnitQuantity(startUnits, events) {
  let n = totalUnitQuantity(startUnits);
  for (const event of events || []) {
    for (const row of event.unitsCreated || []) n += Number(row?.quantity) || 0;
    for (const row of event.unitsDestroyed || []) n -= Number(row?.quantity) || 0;
  }
  return n;
}

function snapshotIds(snapshot) {
  return collectUnitIds(snapshot?.units, snapshot?.pendingAir);
}

function destroyedIds(events) {
  const ids = new Set();
  for (const event of events || []) {
    for (const row of event.unitsDestroyed || []) {
      if (row?.id) ids.add(row.id);
    }
  }
  return ids;
}

export function phaseLabel(snapshot) {
  const turn = Number(snapshot?.turn) || 0;
  const phase = snapshot?.phase || 'phase';
  return `phase ${turn} ${phase}`;
}

export async function checksumMatches(snapshot) {
  if (!snapshot?.checksum) return false;
  const state = {
    units: snapshot.units || {},
    pendingAir: snapshot.pendingAir || [],
    playerState: snapshot.playerState || {},
    ipcs: snapshot.ipcs || {},
  };
  const hex = await sha256Hex(canonicalJson(state));
  return hex === snapshot.checksum;
}

export async function auditSnapshots({ snapshots = [], events = [] } = {}) {
  const ordered = sortSnapshots(snapshots);
  const findings = [];
  for (const snapshot of ordered) {
    const ok = await checksumMatches(snapshot);
    if (!ok) {
      findings.push({
        kind: 'checksum',
        turn: snapshot.turn,
        phase: snapshot.phase,
        seq: snapshot.seq,
        line: `${phaseLabel(snapshot)}: checksum mismatch`,
      });
    }
  }
  for (let i = 1; i < ordered.length; i += 1) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    const window = eventsBetween(events, prev, cur);
    const replayed = replayIpc(prev.ipcs, window);
    const players = new Set([
      ...Object.keys(asMap(cur.ipcs)),
      ...Object.keys(replayed),
    ]);
    for (const player of players) {
      const snap = Number(asMap(cur.ipcs)[player]) || 0;
      const got = Number(replayed[player]) || 0;
      if (snap !== got) {
        findings.push({
          kind: 'ipc',
          turn: cur.turn,
          phase: cur.phase,
          seq: cur.seq,
          player,
          snapshot: snap,
          replayed: got,
          line: `${phaseLabel(cur)}: IPC mismatch ${player} ${snap} vs ${got}`,
        });
      }
    }
    const snapCount = totalUnitQuantity(cur.units);
    const replayCount = replayUnitQuantity(prev.units, window);
    if (snapCount !== replayCount) {
      findings.push({
        kind: 'unit-count',
        turn: cur.turn,
        phase: cur.phase,
        seq: cur.seq,
        snapshot: snapCount,
        replayed: replayCount,
        line: `${phaseLabel(cur)}: unit count drift ${snapCount} vs ${replayCount}`,
      });
    }
    const nextIds = snapshotIds(cur);
    const gone = destroyedIds(window);
    const prevIds = snapshotIds(prev);
    for (const id of prevIds) {
      if (nextIds.has(id) || gone.has(id)) continue;
      findings.push({
        kind: 'vanished',
        turn: cur.turn,
        phase: cur.phase,
        seq: cur.seq,
        id,
        line: `${phaseLabel(cur)}: vanished unit ${id}`,
      });
    }
  }
  return { ok: findings.length === 0, findings, snapshots: ordered.length, events: (events || []).length };
}

export function formatAuditReport(gameId, result) {
  const lines = [`game ${gameId || 'offline'}`];
  if (!result?.findings?.length) {
    lines.push('no mismatches');
    return lines.join('\n');
  }
  for (const finding of result.findings) lines.push(finding.line);
  return lines.join('\n');
}
