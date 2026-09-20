// N-client multiplayer robustness harness for Tactical Risk.
// Run: node tools/robustness-harness.mjs   (exit 0 = all matrix cells pass)
//
// Spins up real GameState + AIController instances ("clients") over a mock
// Firestore game doc with the same transaction semantics as
// syncManager._doPush, then drives the ROBUSTNESS_MATRIX.md scenarios:
// compositions (A1–A4), rejoin/refresh, simultaneous actions, surrender in
// every phase, no-shows, and host-failover contention. Async play IS the
// rejoin path (state persists in the doc regardless of elapsed time).

import { pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } = await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { AIController } = await import(pathToFileURL(join(root, 'src/ai/aiController.js')));
const { applySurrenderToState, shouldDeleteGameAfterResign, resolveResignPlayerId } = await import(pathToFileURL(join(root, 'src/multiplayer/surrenderCore.js')));
const { GAME_VERSION, SCHEMA_VERSION, compareGameVersions } = await import(pathToFileURL(join(root, 'src/version.js')));

// ---------- fixtures ----------
const unitDefs = { infantry: { isLand: true, attack: 1, defense: 2, cost: 3, move: 1 } };
const NAMES = ['T1','T2','T3','T4','T5','T6','T7','T8','T9','T10','T11','T12'];
const territories = NAMES.map((name, i) => ({
  name, isWater: false, production: 2,
  connections: NAMES.filter(n => n !== name).slice(0, 3),
  polygons: [], x: i * 10, y: 0
}));

function composition(humans, ais, unitsEach = 12) {
  const players = [];
  for (let h = 0; h < humans; h++) players.push({ id: `h${h}`, name: `Human${h}`, oderId: `user_${h}`, isAI: false });
  for (let a = 0; a < ais; a++) players.push({ id: `a${a}`, name: `Bot${a}`, oderId: `ai_${a}`, isAI: true, aiDifficulty: 'easy' });
  const perPlayer = Math.floor(NAMES.length / players.length);
  const territoryState = {}, units = {}, unitsToPlace = {}, playerState = {};
  players.forEach((p, i) => {
    const owned = NAMES.slice(i * perPlayer, (i + 1) * perPlayer);
    owned.forEach((t, j) => {
      territoryState[t] = { owner: p.id, isCapital: j === 0 };
      units[t] = [{ type: 'infantry', quantity: 1, owner: p.id }];
    });
    unitsToPlace[p.id] = [{ type: 'infantry', quantity: unitsEach }];
    playerState[p.id] = { ipcs: 80, capitalTerritory: owned[0] };
  });
  return {
    version: 11, gameMode: 'risk', alliancesEnabled: false, teamsEnabled: false,
    isMultiplayer: true, players, currentPlayerIndex: 0, round: 1,
    phase: 'unit_placement', turnPhase: 'develop_tech',
    territoryState, units, playerState,
    pendingPurchases: [], combatQueue: [], gameOver: false, winner: null, winCondition: null,
    playerTechs: {}, riskCards: {}, cardTradeCount: {}, unitsToPlace,
    placementRound: 1, airUnitOrigins: {}, turnEvents: [],
  };
}

// ---------- mock Firestore ----------
class MockDoc {
  constructor(json) { this.stateVersion = 1; this.state = json; this.currentPlayerId = json.players[0].oderId; this.writes = []; this.failNext = 0; }
}

class Client {
  constructor(name, oderId, doc, { isHost = false, authorityFn = null, manualPush = false } = {}) {
    this.name = name; this.oderId = oderId; this.doc = doc;
    this.isHost = isHost; this.authorityFn = authorityFn || (() => false);
    this.manualPush = manualPush;
    this.localVersion = doc.stateVersion;
    this.aborted = 0;
    this.pushFailures = 0;
    this.reloadedOnExhaust = 0;
    this.coalesced = 0;
    this._inFlight = null;
    this._dirty = false;
    this.gs = new GameState({ risk: { factions: [] } }, territories, []);
    this.gs.isMultiplayer = true;
    this.gs.unitDefs = unitDefs;
    this.load();
    // Production semantics: main.js pushes on notify using the CACHED
    // isActivePlayer flag, which is still true while your own turn-ending
    // action is being pushed (the live currentPlayer already moved on).
    this.gs.subscribe(() => {
      if (this.loading) return;
      if (this.manualPush) return; // scenario drives pushes explicitly
      if (this.cachedActive || this.hasAIAuthority()) this.push();
    });
    this.ai = new AIController();
    this.ai.setUnitDefs(unitDefs);
    this.ai.setGameState(this.gs);
    this.ai.setCanAct(() => this.hasAIAuthority());
  }
  isActive() { return this.gs.currentPlayer?.oderId === this.oderId; }
  hasAIAuthority() { return this.isHost || this.authorityFn() === true; }
  push() {
    if (this.doc.stateVersion > this.localVersion) { this.aborted++; this.load(); return false; }
    this.doc.stateVersion += 1;
    this.doc.state = structuredClone(this.gs.toJSON());
    this.doc.currentPlayerId = this.gs.currentPlayer?.oderId || null;
    this.doc.writes.push({ by: this.name, v: this.doc.stateVersion, idx: this.doc.state.currentPlayerIndex, phase: this.doc.state.phase, turnPhase: this.doc.state.turnPhase });
    this.localVersion = this.doc.stateVersion;
    this.cachedActive = this.doc.currentPlayerId === this.oderId; // _updateActivePlayer after push
    return true;
  }
  load() {
    this.loading = true;
    this.gs.loadFromJSON(structuredClone(this.doc.state));
    this.loading = false;
    this.localVersion = this.doc.stateVersion;
    this.cachedActive = this.doc.currentPlayerId === this.oderId; // _updateActivePlayer on snapshot
  }
  // Commit one write if not stale and not injected-to-fail. Mirrors _pushOnce:
  // returns 'ok' | 'stale' | 'fail'. doc.failNext lets a scenario inject
  // transient transaction failures.
  _pushOnce() {
    if (this.doc.stateVersion > this.localVersion) { this.aborted++; this.load(); return 'stale'; }
    if (this.doc.failNext > 0) { this.doc.failNext--; this.pushFailures++; return 'fail'; }
    this.doc.stateVersion += 1;
    this.doc.state = structuredClone(this.gs.toJSON());
    this.doc.currentPlayerId = this.gs.currentPlayer?.oderId || null;
    this.doc.writes.push({ by: this.name, v: this.doc.stateVersion, idx: this.doc.state.currentPlayerIndex, phase: this.doc.state.phase, turnPhase: this.doc.state.turnPhase });
    this.localVersion = this.doc.stateVersion;
    this.cachedActive = this.doc.currentPlayerId === this.oderId;
    return 'ok';
  }
  // OLD (V2.55) buggy semantics: on failure, silently drop and return false —
  // local state stays advanced, doc stays frozen → divergence. Used only to
  // REPRODUCE Bug 1 in the harness before proving the fix.
  pushOldBuggy() {
    if (this.doc.stateVersion > this.localVersion) { this.load(); return false; }
    if (this.doc.failNext > 0) { this.doc.failNext--; this.pushFailures++; return false; }
    return this._pushOnce() === 'ok';
  }
  // NEW (V2.56) semantics: retry transient failures, then RELOAD authoritative
  // truth on exhaustion so the client never proceeds on un-persisted state.
  async pushWithRetry(maxAttempts = 3) {
    for (let a = 1; a <= maxAttempts; a++) {
      const r = this._pushOnce();
      if (r === 'ok') return { status: 'ok' };
      if (r === 'stale') return { status: 'stale' };
      // r === 'fail' → retry
    }
    this.reloadedOnExhaust++;
    this.load(); // snap back to last confirmed truth
    return { status: 'exhausted' };
  }
  // Serialize + coalesce (Fix 1): one push in flight; changes during flight
  // collapse into a single follow-up.
  async coalescedPush(maxAttempts = 3) {
    if (this._inFlight) { this._dirty = true; return this._inFlight; }
    this._inFlight = (async () => this.pushWithRetry(maxAttempts))();
    let result;
    try { result = await this._inFlight; } finally { this._inFlight = null; }
    if (this._dirty) { this._dirty = false; this.coalesced++; return this.coalescedPush(maxAttempts); }
    return result;
  }
  // human deployment turn: place up to 6 units then finish the round
  humanDeploy() {
    if (!this.isActive()) return false;
    const me = this.gs.currentPlayer;
    const mine = Object.entries(this.gs.territoryState).filter(([, s]) => s.owner === me.id).map(([t]) => t);
    for (let i = 0; i < 6; i++) {
      const r = this.gs.placeInitialUnit(mine[i % mine.length], 'infantry', unitDefs);
      if (!r.success) break;
    }
    this.gs.finishPlacementRound(unitDefs);
    return true;
  }
  async runAI() { await this.ai.checkAndProcessAI(); }
  destroy() { this.ai.setGameState(null); } // "tab closed"
}

const rejoin = (client, doc) => new Client(client.name, client.oderId, doc, { isHost: client.isHost, authorityFn: client.authorityFn });

// ---------- runner ----------
let failures = 0;
const check = (label, cond) => { if (!cond) { failures++; console.error('FAIL:', label); } else console.log('ok  :', label); };
const noRewind = (doc) => !doc.writes.some((w, i) => {
  if (i === 0) return false;
  const prev = doc.writes[i - 1];
  return w.idx < prev.idx && !(w.idx === 0 && prev.idx >= doc.state.players.length - 1);
});
const sane = (doc, label) => {
  check(`${label}: no invalid phase/turnPhase combo ever pushed`,
    !doc.writes.some(w => w.phase !== 'playing' && w.turnPhase !== 'setup'));
  check(`${label}: turn order never rewound`, noRewind(doc));
};

// drive a full deployment cycle: humans act when active, host runs AI
async function driveDeployment(doc, clients, { maxSteps = 200 } = {}) {
  for (let step = 0; step < maxSteps; step++) {
    if (doc.state.phase !== 'unit_placement') return true;
    const currentId = doc.currentPlayerId;
    const cur = doc.state.players[doc.state.currentPlayerIndex];
    if (cur.isAI) {
      for (const c of clients) { c.load(); await c.runAI(); }
    } else {
      const owner = clients.find(c => c.oderId === currentId);
      if (!owner) return 'noshow'; // current human has no client
      owner.load();
      owner.humanDeploy();
    }
  }
  console.error('   [stall] phase=%s idx=%d placedThisRound=%s toPlace=%o',
    doc.state.phase, doc.state.currentPlayerIndex, doc.state.unitsPlacedThisRound,
    Object.fromEntries(Object.entries(doc.state.unitsToPlace).map(([k, v]) => [k, v.reduce((s, u) => s + u.quantity, 0)])));
  return false; // did not complete
}

console.log('=== A1: 1H+1AI — baseline (covers 1H+2AI, 1H+3AI) ===');
{
  const doc = new MockDoc(composition(1, 1, 6));
  const h = new Client('h0', 'user_0', doc, { isHost: true });
  const done = await driveDeployment(doc, [h]);
  check('A1: deployment completed to playing phase', done === true && doc.state.phase === 'playing');
  sane(doc, 'A1');
}

console.log('=== A2: 2H+0AI — human-only ping-pong + mid-game rejoin ===');
{
  const doc = new MockDoc(composition(2, 0, 6));
  let h0 = new Client('h0', 'user_0', doc, { isHost: true });
  let h1 = new Client('h1', 'user_1', doc);
  // round 1: h0 deploys, then "closes the tab" (async gap), h1 plays 30s/6h later
  h0.load(); h0.humanDeploy(); h0.destroy();
  h1 = rejoin(h1, doc); h1.load(); h1.humanDeploy();
  // h0 returns (rejoin = async return), continues
  h0 = rejoin(h0, doc);
  const done = await driveDeployment(doc, [h0, h1]);
  check('A2: async handoffs completed deployment', done === true && doc.state.phase === 'playing');
  sane(doc, 'A2');
}

console.log('=== A3: 2H+2AI — playtest shape + host refresh mid-AI + failover grace ===');
{
  const doc = new MockDoc(composition(2, 2, 6));
  let hostPresence = 'online';
  let offlineSince = null;
  const GRACE = 90000;
  const graceFn = () => {
    if (hostPresence !== 'offline') { offlineSince = null; return false; }
    if (offlineSince === null) offlineSince = Date.now();
    return Date.now() - offlineSince >= GRACE;
  };
  let host = new Client('host', 'user_0', doc, { isHost: true });
  const other = new Client('h1', 'user_1', doc, { authorityFn: graceFn });

  host.load(); host.humanDeploy();
  other.load(); other.humanDeploy();
  // now an AI is current; host "refreshes" mid-AI-window
  hostPresence = 'offline';
  const writesAtRefresh = doc.writes.length;
  await other.runAI(); // must not act (grace)
  const otherWrites = doc.writes.slice(writesAtRefresh).filter(w => w.by === 'h1').length;
  host = rejoin(host, doc); hostPresence = 'online';
  const done = await driveDeployment(doc, [host, other]);
  check('A3: deployment completed', done === true && doc.state.phase === 'playing');
  check('A3: non-host never ran AI during refresh window', otherWrites === 0);
  sane(doc, 'A3');
}

console.log('=== A4: 3H+1AI — simultaneous actions + simultaneous refresh ===');
{
  const doc = new MockDoc(composition(3, 1, 6));
  let h0 = new Client('h0', 'user_0', doc, { isHost: true });
  let h1 = new Client('h1', 'user_1', doc);
  let h2 = new Client('h2', 'user_2', doc);

  // h0 acts; h1 SIMULTANEOUSLY acts on stale state (thinks it's their turn)
  h0.load(); h0.humanDeploy();
  const vAfterH0 = doc.stateVersion;
  h1.gs.currentPlayerIndex = doc.state.players.findIndex(p => p.oderId === 'user_1'); // force stale illusion
  const stalePush = h1.push(); // must abort (doc moved on) — h1's local was v1
  check('A4: stale simultaneous push rejected + reloaded', stalePush === false && h1.aborted === 1 && h1.localVersion === doc.stateVersion);

  // simultaneous refresh by all humans: doc must be untouched
  const vBefore = doc.stateVersion;
  h0 = rejoin(h0, doc); h1 = rejoin(h1, doc); h2 = rejoin(h2, doc);
  check('A4: simultaneous refresh writes nothing', doc.stateVersion === vBefore);

  const done = await driveDeployment(doc, [h0, h1, h2]);
  check('A4: deployment completed with 3 humans', done === true && doc.state.phase === 'playing');
  sane(doc, 'A4');
}

console.log('=== S: surrender in every phase ===');
{
  // setup (capital placement)
  const cap = composition(2, 1, 6); cap.phase = 'capital_placement';
  const r1 = applySurrenderToState(cap, 'user_0');
  check('S1: surrender during capital placement advances turn', r1.changed && cap.players[cap.currentPlayerIndex].oderId !== 'user_0');
  // deployment
  const dep = composition(2, 1, 6);
  const r2 = applySurrenderToState(dep, 'user_0');
  check('S2: surrender during deployment picks a player with units', r2.changed && !dep.players[dep.currentPlayerIndex].surrendered);
  // playing + last-standing victory
  const play = composition(2, 0, 6); play.phase = 'playing'; play.turnPhase = 'combat_move';
  const r3 = applySurrenderToState(play, 'user_0');
  check('S3: surrender in playing phase → last player standing wins', r3.gameOver && play.winner === 'Human1');
  const last = composition(1, 1, 6);
  const r4 = applySurrenderToState(last, 'user_0');
  check('S4: last human resign → no seated humans remain', r4.changed && r4.humansRemain === false);
  check('S4: all-resign deletes the game doc', shouldDeleteGameAfterResign({ humansRemain: false }) === true);
  check('S4: other humans remaining does not delete', shouldDeleteGameAfterResign({ humansRemain: true }) === false);
  check('S4: resign id prefers the seated auth user',
    resolveResignPlayerId({
      players: [{ id: 'Germans', oderId: 'user_0', isAI: false }, { id: 'AI', isAI: true }],
      authUserId: 'user_0',
    }) === 'user_0');
}

console.log('=== N: permanent no-show ===');
{
  // no-show on an AI turn: host runs it (that IS driveDeployment); no-show HUMAN:
  const doc = new MockDoc(composition(2, 1, 6));
  const h0 = new Client('h0', 'user_0', doc, { isHost: true });
  h0.load(); h0.humanDeploy();
  // h1 never connects. Drive: should stop at h1's turn without corruption.
  const res = await driveDeployment(doc, [h0]);
  check('N1: game waits (no corruption) at absent human turn', res === 'noshow' && doc.state.players[doc.state.currentPlayerIndex].oderId === 'user_1');
  sane(doc, 'N1');
  // escape hatch: absent player surrenders from My Games (doc-level)
  applySurrenderToState(doc.state, 'user_1');
  doc.stateVersion++; doc.currentPlayerId = doc.state.players[doc.state.currentPlayerIndex].oderId;
  const done = await driveDeployment(doc, [h0]);
  check('N2: after surrender escape, game completes', done === true && doc.state.phase === 'playing');
}

console.log('=== C: version-upgrade robustness (Dimension C) ===');
{
  // The refresh banner fires iff a game doc was written by a strictly-newer
  // app version. This is exactly compareGameVersions(remote, local) > 0 — the
  // same predicate syncManager._checkRemoteVersion uses to notify the UI.
  const outdated = (remote, local) => compareGameVersions(remote, local) > 0;

  check('C1: ordering — older < newer', compareGameVersions('V2.54', 'V2.55') < 0);
  check('C1: ordering — equal', compareGameVersions('V2.55', 'V2.55') === 0);
  check('C1: ordering — newer > older', compareGameVersions('V2.55', 'V2.54') > 0);
  check('C1: minor rolls into major boundary', compareGameVersions('V2.9', 'V2.10') < 0);
  check('C1: major dominates minor', compareGameVersions('V3.0', 'V2.99') > 0);

  // A stale tab (older client) reading a doc a newer client just wrote → banner.
  // Derive a strictly-newer version from GAME_VERSION so this stays correct
  // across version bumps (was hardcoded 'V2.56', which broke when we shipped it).
  const bumpMinor = (v) => { const m = /^V?(\d+)\.(\d+)/.exec(v); return `V${m[1]}.${Number(m[2]) + 1}`; };
  check('C2: old client sees newer writer → banner', outdated(bumpMinor(GAME_VERSION), GAME_VERSION) === true);
  // Same version, or a doc an OLDER client wrote → no banner (we are not behind).
  check('C2: same version → no banner', outdated(GAME_VERSION, GAME_VERSION) === false);
  check('C2: older writer → no banner', outdated('V2.53', GAME_VERSION) === false);
  // Missing / malformed stamp (old doc predating the field) → fail safe, no banner.
  check('C2: missing stamp → no banner (fail safe)', outdated(undefined, GAME_VERSION) === false);
  check('C2: garbage stamp → no banner (fail safe)', outdated('banana', GAME_VERSION) === false);

  // schemaVersion the doc carries must match the schema the running code emits,
  // or an old client could silently load a shape it can't represent.
  const emitted = composition(1, 1).version;
  check('C3: emitted schema matches SCHEMA_VERSION constant', emitted === SCHEMA_VERSION);
}

console.log('=== P: push-failure persistence (Bug 1 — Robert/Bastion sequence) ===');
{
  // Robert (host, user_0) plays his turn locally; the waiting human is user_1.
  // In the V2.55 playtest Robert advanced combat→mobilize→next turn locally but
  // NONE of it committed (doc frozen at v132) — he then "played ahead" and could
  // act on the next player's turn after a refresh, because Firestore still said
  // it was his turn.
  const doc = new MockDoc(composition(2, 0, 6));
  const robert = new Client('robert', 'user_0', doc, { isHost: true, manualPush: true });
  const baseVersion = doc.stateVersion;
  const baseCurrent = doc.currentPlayerId;
  const baseIdx = doc.state.currentPlayerIndex;

  // Robert plays his turn — finishPlacementRound advances the LOCAL turn past him.
  robert.humanDeploy();
  check('P0: Robert local turn advanced past his own turn', robert.gs.currentPlayerIndex !== baseIdx);

  // --- REPRODUCE the bug with OLD (V2.55) semantics: every push fails silently
  doc.failNext = 99;
  const buggy = robert.pushOldBuggy();
  check('P1 (repro): buggy push silently drops (returns false)', buggy === false);
  check('P1 (repro): doc frozen at last committed version', doc.stateVersion === baseVersion && doc.currentPlayerId === baseCurrent);
  check('P1 (repro): Robert DIVERGED — local ahead of un-moved doc', robert.gs.currentPlayerIndex !== doc.state.currentPlayerIndex);

  // --- FIX with NEW (V2.56) semantics: retry, then reload authoritative truth
  doc.failNext = 99; // connection still down
  const res = await robert.pushWithRetry(3);
  check('P2: push retried to exhaustion', res.status === 'exhausted' && robert.pushFailures >= 3);
  check('P2: doc turn NEVER passed without a committed write', doc.stateVersion === baseVersion && doc.currentPlayerId === baseCurrent);
  check('P2: Robert reloaded to Firestore truth (no longer playing ahead)',
        robert.gs.currentPlayerIndex === baseIdx && robert.localVersion === baseVersion && robert.reloadedOnExhaust === 1);

  // Waiting human's view: Robert is still the current player; no phantom handoff.
  const waiter = new Client('waiter', 'user_1', doc);
  check('P3: waiting human still sees Robert as current (no phantom handoff)',
        doc.currentPlayerId === 'user_0' && waiter.isActive() === false);

  // --- RECOVERY: connection heals; Robert re-plays and the turn commits.
  doc.failNext = 0;
  robert.humanDeploy();
  const ok = await robert.pushWithRetry(3);
  check('P4: after recovery, push commits and turn advances to the waiting human',
        ok.status === 'ok' && doc.stateVersion > baseVersion && doc.currentPlayerId === 'user_1');
  sane(doc, 'P');
}

console.log('=== P5: serialize + coalesce concurrent pushes (Fix 1) ===');
{
  const doc = new MockDoc(composition(1, 1, 6));
  const h = new Client('h', 'user_0', doc, { isHost: true, manualPush: true });
  // Fire 5 pushes while one is in flight — they must collapse, not stack.
  await Promise.all([h.coalescedPush(), h.coalescedPush(), h.coalescedPush(), h.coalescedPush(), h.coalescedPush()]);
  const commits = doc.writes.filter(w => w.by === 'h').length;
  check('P5: 5 concurrent pushes coalesced into <=2 commits', commits <= 2 && commits >= 1);
  check('P5: local version consistent with doc after coalescing', h.localVersion === doc.stateVersion);
}

console.log('=== P6: auto-battle notify pause + equal-version exhaust reload (V2.58) ===');
{
  // Auto-battle used to _notify() every combat round (100ms debounce → many
  // transactions). Pause collapses that to one flush. Exhausted push must
  // reload even when remote version === local version (the production
  // _reloadRemoteState used to no-op on equality, leaving combat UI ahead).
  const doc = new MockDoc(composition(2, 0, 6));
  const sean = new Client('sean', 'user_0', doc, { isHost: true, manualPush: true });
  const baseVersion = doc.stateVersion;
  const baseUnits = structuredClone(sean.gs.units);

  let notifies = 0;
  sean.gs.subscribe(() => { notifies++; });

  sean.gs.pauseNotifications();
  for (let i = 0; i < 8; i++) {
    const t = Object.keys(sean.gs.units)[0];
    sean.gs.units[t] = [{ type: 'infantry', quantity: 1 + i, owner: sean.gs.currentPlayer.id }];
    sean.gs._notify(); // swallowed while paused
  }
  check('P6: per-round notifies swallowed during pause', notifies === 0);
  sean.gs.resumeNotifications({ flush: true });
  check('P6: resume flushes exactly one notify', notifies === 1);

  doc.failNext = 99;
  const exhausted = await sean.pushWithRetry(3);
  check('P6: exhausted push reloads even when versions are equal',
        exhausted.status === 'exhausted' && sean.localVersion === baseVersion &&
        sean.reloadedOnExhaust === 1 &&
        JSON.stringify(sean.gs.units) === JSON.stringify(baseUnits));
  check('P6: doc never moved (equal-version failed write)',
        doc.stateVersion === baseVersion);
}

console.log('=== B3: turn indicator single source of truth (Bug 3) ===');
{
  // A committed handoff to user_1 is in the doc. A stale cached flag on user_0's
  // client must NOT make it think it's still their turn — live derivation wins.
  const doc = new MockDoc(composition(2, 0, 6));
  doc.state.currentPlayerIndex = 1;
  doc.currentPlayerId = 'user_1';
  doc.stateVersion = 2;
  const c = new Client('c', 'user_0', doc, { isHost: true });
  c.cachedActive = true; // simulate a stale flag left by a failed push
  check('B3: live-derived active check ignores stale cached flag', c.isActive() === false);
  check('B3: live check agrees with doc truth', c.isActive() === (doc.currentPlayerId === 'user_0'));
}

console.log('=== B2: AI-when-unattended policy (Bug 2) ===');
{
  const { anyHumanPresent, mayRunAI, DEFAULT_AI_RUNS_WHEN_UNATTENDED, computeHumanPresent, isLocalHumanSeated } =
    await import(pathToFileURL(join(root, 'src/multiplayer/aiPolicy.js')));
  const players = [{ oderId: 'user_0', isAI: false }, { oderId: 'ai_0', isAI: true }];
  const allOffline = () => 'offline';
  const humanOnline = (id) => (id === 'user_0' ? 'online' : 'offline');

  check('B2: default policy pauses AI when unattended', DEFAULT_AI_RUNS_WHEN_UNATTENDED === false);
  check('B2: no human present → absent', anyHumanPresent(players, allOffline) === false);
  check('B2: human online → present', anyHumanPresent(players, humanOnline) === true);
  check('B2: surrendered human does not count as present',
        anyHumanPresent([{ oderId: 'u', isAI: false, surrendered: true }], () => 'online') === false);
  check('B2: default gate PAUSES AI with no human present',
        mayRunAI({ aiHasAuthority: true, runsWhenUnattended: false, humanPresent: false }) === false);
  check('B2: default gate RUNS AI with a human present',
        mayRunAI({ aiHasAuthority: true, runsWhenUnattended: false, humanPresent: true }) === true);
  check('B2: configured unattended override runs AI with no human',
        mayRunAI({ aiHasAuthority: true, runsWhenUnattended: true, humanPresent: false }) === true);
  check('B2: no authority never runs AI regardless of policy',
        mayRunAI({ aiHasAuthority: false, runsWhenUnattended: true, humanPresent: true }) === false);
  check('B2: seated local human is present even if presence is offline',
        computeHumanPresent({ players, presenceOf: allOffline, localUserId: 'user_0' }) === true);
  check('B2: local seated human + stale presence still runs AI',
        mayRunAI({
          aiHasAuthority: true,
          runsWhenUnattended: false,
          humanPresent: computeHumanPresent({ players, presenceOf: allOffline, localUserId: 'user_0' }),
        }) === true);
  check('B2: unattended (no local seated human, all offline) still pauses',
        computeHumanPresent({ players, presenceOf: allOffline, localUserId: null }) === false);
  check('B2: surrendered local human is not seated-present',
        isLocalHumanSeated([{ oderId: 'user_0', isAI: false, surrendered: true }], 'user_0') === false);
}

console.log('=== B4: roll logging present + gameplay unchanged (Bug 4) ===');
{
  const gs = new GameState({ risk: { factions: [] } }, territories, []);
  gs.unitDefs = unitDefs;
  const before = gs.getRollLog().length;
  const out = gs._rollCombatWithRolls([{ type: 'infantry', quantity: 20, owner: 'x' }], 'attack', unitDefs);
  const log = gs.getRollLog();
  check('B4: getRollLog exists and captured each die', log.length === before + 20 && out.rolls.length === 20);
  check('B4: rolls are valid d6 values with context + timestamp',
        log.every(r => r.roll >= 1 && r.roll <= 6 && typeof r.t === 'number' && typeof r.context === 'string'));
  check('B4: roll log NOT serialized into toJSON (stays out of Firestore)',
        gs.toJSON()._rollLog === undefined && gs.toJSON().rollLog === undefined);
}

console.log('=== H: live host handoff after resign (no rejoin) ===');
{
  const { applyLiveHostHandoff, rewriteLobbyHostAfterResign, resolveIsHost, resolveHostOderId } =
    await import(pathToFileURL(join(root, 'src/multiplayer/hostHandoff.js')));
  const { shouldShowPushExhaustedNotice, resolveWaitingLockAfterExhaust, shouldRematchCombatAfterExhaust } =
    await import(pathToFileURL(join(root, 'src/multiplayer/rematchRecovery.js')));

  const lobby = {
    hostId: 'user_0',
    players: [
      { oderId: 'user_0', isHost: true, isAI: false },
      { oderId: 'user_1', isHost: false, isAI: false },
      { oderId: 'ai_0', isHost: false, isAI: true },
    ],
  };
  const rewritten = rewriteLobbyHostAfterResign({
    lobbyData: lobby,
    leavingUserId: 'user_0',
    surrenderedIds: new Set(['user_0']),
  });
  check('H1: resigning host stamps the next human on lobbyData',
    rewritten.hostId === 'user_1'
    && rewritten.players.find((p) => p.oderId === 'user_1')?.isHost === true
    && rewritten.players.find((p) => p.oderId === 'user_0')?.isHost === false);

  const nextHuman = applyLiveHostHandoff({
    currentHostOderId: 'user_0',
    currentIsHost: false,
    userId: 'user_1',
    lobbyData: rewritten,
  });
  const oldHost = applyLiveHostHandoff({
    currentHostOderId: 'user_0',
    currentIsHost: true,
    userId: 'user_0',
    lobbyData: rewritten,
  });
  check('H2: next human is host for AI without rejoin',
    nextHuman.changed && nextHuman.isHost && nextHuman.hostOderId === 'user_1');
  check('H3: old host client cannot run AI',
    oldHost.changed && oldHost.isHost === false && oldHost.hostOderId === 'user_1');
  check('H4: failover watches the new host id',
    resolveHostOderId({ lobbyData: rewritten }) === 'user_1'
    && resolveIsHost({ userId: 'user_1', lobbyData: rewritten }) === true
    && resolveIsHost({ userId: 'user_0', lobbyData: rewritten }) === false);

  check('H5: push_exhausted toast is not a tight loop',
    shouldShowPushExhaustedNotice({ lastShownAt: 0, now: 1000 }) === true
    && shouldShowPushExhaustedNotice({ lastShownAt: 1000, now: 2000 }) === false
    && shouldShowPushExhaustedNotice({ lastShownAt: 1000, now: 6000 }) === true);
  check('H6: exhaust clears waiting lock; empty rematch stays closed',
    resolveWaitingLockAfterExhaust() === false
    && shouldRematchCombatAfterExhaust({ turnPhase: 'combat', queueHasEnemy: false }) === false
    && shouldRematchCombatAfterExhaust({ turnPhase: 'mobilize', queueHasEnemy: true }) === false
    && shouldRematchCombatAfterExhaust({ turnPhase: 'combat', queueHasEnemy: true }) === true);

  check('H7: SCHEMA 11 stays; all-resign still deletes',
    SCHEMA_VERSION === 11
    && shouldDeleteGameAfterResign({ humansRemain: false }) === true);
}

console.log(failures === 0 ? '\nALL MATRIX CELLS PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
