// V2.81.57-unified.16.1 — a stale client must not overwrite the live online game.
// Fake in-memory Firestore transaction, real GameState, real guard functions.
// Run: node tools/test-sync-stale-clobber.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (typeof globalThis.localStorage === 'undefined') {
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
  };
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const { GameState, GAME_PHASES, TURN_PHASES } =
  await import(pathToFileURL(join(root, 'src/state/gameState.js')));
const { shouldApplyRemoteGameState } =
  await import(pathToFileURL(join(root, 'src/state/placementPass.js')));
const {
  canPushFromConfirmedSeat,
  confirmedSeatFromPlayer,
  evaluateAuthoritativePush,
  newSyncSessionId,
} = await import(pathToFileURL(join(root, 'src/multiplayer/syncAuthority.js')));

let failures = 0;
const check = (label, cond) => {
  if (!cond) { failures += 1; console.error('FAIL:', label); }
  else console.log('ok  :', label);
};

function newGs() {
  const gs = new GameState({ risk: { factions: [] } }, [
    { name: 'Home', isWater: false, connections: [] },
  ], []);
  gs.isMultiplayer = true;
  gs.players = [
    { id: 'ger', name: 'Robert007', oderId: 'rob', isAI: false },
    { id: 'uk', name: 'Bastion', oderId: 'bas', isAI: false },
    { id: 'ussr', name: 'German Easy AI', oderId: 'ai-ger', isAI: true },
  ];
  gs.currentPlayerIndex = 0;
  gs.phase = GAME_PHASES.PLAYING;
  gs.turnPhase = TURN_PHASES.COMBAT_MOVE;
  gs.round = 4;
  gs.territoryState = { Home: { owner: 'ger' } };
  gs.playerState = {
    ger: { ipcs: 20 },
    uk: { ipcs: 20 },
    ussr: { ipcs: 20 },
  };
  gs.units = { Home: [{ type: 'infantry', owner: 'ger', quantity: 1 }] };
  gs.actionSeq = 200;
  return gs;
}

function seedDoc(gs, { version = 50, session = 'seed' } = {}) {
  const player = gs.players[gs.currentPlayerIndex];
  return {
    stateVersion: version,
    currentPlayerId: player?.oderId || null,
    lastWriterSession: session,
    state: gs.toJSON(),
  };
}

class MemoryDb {
  constructor(doc) {
    this.doc = doc;
    this.writes = 0;
  }

  async transaction(fn) {
    const snapshot = structuredClone(this.doc);
    let patch = null;
    const tx = {
      get: async () => ({ exists: () => true, data: () => snapshot }),
      update(_ref, data) { patch = data; },
    };
    await fn(tx);
    if (patch) {
      this.doc = { ...this.doc, ...structuredClone(patch) };
      this.writes += 1;
    }
  }
}

class Tab {
  constructor({ userId, isHost, db, sessionId }) {
    this.userId = userId;
    this.isHost = !!isHost;
    this.db = db;
    this.sessionId = sessionId || newSyncSessionId();
    this.gameState = newGs();
    this.localVersion = 0;
    this._confirmedSeat = null;
    this.online = true;
    this.isLoadingRemoteState = false;
    this.events = [];
    this.dirty = false;
    this.gameState.subscribe(() => {
      if (this.isLoadingRemoteState) return;
      this.dirty = true;
    });
  }

  canPush() {
    return canPushFromConfirmedSeat({
      confirmedSeat: this._confirmedSeat,
      userId: this.userId,
      hasAIAuthority: this.isHost,
    });
  }

  noteSeat() {
    const index = this.gameState.currentPlayerIndex;
    this._confirmedSeat = confirmedSeatFromPlayer(this.gameState.players?.[index], index);
  }

  async join() {
    const data = this.db.doc;
    this.localVersion = data.stateVersion || 0;
    this.isLoadingRemoteState = true;
    this.gameState.loadFromJSON(structuredClone(data.state));
    this.isLoadingRemoteState = false;
    this.dirty = false;
    this.noteSeat();
  }

  async applyRemote({ force = false } = {}) {
    const data = this.db.doc;
    const localSeat = this._confirmedSeat ? (this._confirmedSeat.userId ?? null) : null;
    const apply = shouldApplyRemoteGameState({
      remoteVersion: data.stateVersion || 0,
      localVersion: this.localVersion,
      remoteCurrentPlayerId: data.currentPlayerId || null,
      localCurrentPlayerId: localSeat,
      remoteActionSeq: data.state?.actionSeq || 0,
      localActionSeq: this.gameState?.actionSeq || 0,
      force,
    });
    if (!(apply && (force || (data.stateVersion || 0) > this.localVersion))) return false;
    this.localVersion = data.stateVersion || 0;
    this.isLoadingRemoteState = true;
    this.gameState.loadFromJSON(structuredClone(data.state));
    this.isLoadingRemoteState = false;
    this.dirty = false;
    this.noteSeat();
    return true;
  }

  async pushOnce({ updateLocal = true } = {}) {
    const index = this.gameState.currentPlayerIndex;
    const player = this.gameState.players?.[index] || null;
    const writtenSeat = confirmedSeatFromPlayer(player, index);
    const state = this.gameState.toJSON();
    const currentPlayerId = player?.oderId || null;
    let decision = null;
    await this.db.transaction(async (tx) => {
      const snap = await tx.get();
      decision = evaluateAuthoritativePush({
        remoteDoc: snap.data(),
        localVersion: this.localVersion,
        localSeq: Number(this.gameState?.actionSeq) || 0,
        sessionId: this.sessionId,
        confirmedSeat: this._confirmedSeat,
        nextState: state,
        nextCurrentPlayerId: currentPlayerId,
      });
      if (decision.status === 'stale') return;
      tx.update(null, decision.patch);
    });
    if (!decision || decision.status === 'stale') {
      this.events.push({ event: 'push_stale_blocked', ...(decision?.details || {}) });
      await this.applyRemote({ force: true });
      return false;
    }
    if (updateLocal) {
      this.localVersion = decision.version;
      this._confirmedSeat = writtenSeat;
    }
    return true;
  }

  async settle() {
    while (this.dirty) {
      this.dirty = false;
      if (!this.online) return;
      if (!this.canPush()) return;
      await this.pushOnce();
    }
  }
}

function qty(gs) {
  return gs.units?.Home?.[0]?.quantity;
}

console.log('=== 1. offline host cannot overwrite the guest ===');
{
  const db = new MemoryDb(seedDoc(newGs()));
  const host = new Tab({ userId: 'rob', isHost: true, db, sessionId: 'host-tab' });
  await host.join();
  check('host starts authorized on his own seat', host.canPush() === true && host.localVersion === 50);

  host.online = false;
  for (let i = 0; i < 12; i++) {
    host.gameState.units.Home[0].quantity += 1;
    host.gameState._notify();
  }
  await host.settle();
  check('twelve offline edits wrote nothing', db.writes === 0 && qty(host.gameState) === 13);
  check('offline seq is ahead of the doc', host.gameState.actionSeq === 212 && db.doc.state.actionSeq === 200);

  const live = new Tab({ userId: 'rob', isHost: true, db, sessionId: 'live-rob' });
  await live.join();
  check('turn-ending push is still allowed from the confirmed seat', live.canPush() === true);
  live.gameState.currentPlayerIndex = 1;
  live.gameState._notify();
  await live.settle();
  check('turn pass reached Bastion', db.doc.currentPlayerId === 'bas' && live.canPush() === false);

  const guest = new Tab({ userId: 'bas', isHost: false, db, sessionId: 'guest-tab' });
  await guest.join();
  check('guest can push on their seat', guest.canPush() === true);
  for (let i = 0; i < 8; i++) {
    guest.gameState.units.Home[0].quantity = 100 + i;
    guest.gameState._notify();
    await guest.settle();
  }
  check('doc shows the guest seat and board',
    db.doc.currentPlayerId === 'bas' && qty({ units: db.doc.state.units }) === 107);

  const writes = db.writes;
  const remoteVersion = db.doc.stateVersion;
  host.online = true;
  host.gameState.units.Home[0].quantity = 14;
  host.gameState._notify();
  await host.settle();
  check('reconnected host wrote nothing', db.writes === writes);
  check('doc still shows the guest',
    db.doc.currentPlayerId === 'bas' && qty({ units: db.doc.state.units }) === 107 && db.doc.stateVersion === remoteVersion);
  check('host loaded the guest doc',
    host.gameState.currentPlayer?.oderId === 'bas' && qty(host.gameState) === 107);
  const blocked = host.events.filter((e) => e.event === 'push_stale_blocked');
  check('push_stale_blocked logged',
    blocked.length === 1
    && blocked[0].localVersion === 50
    && blocked[0].remoteVersion === remoteVersion
    && blocked[0].localSeq > blocked[0].remoteSeq
    && blocked[0].confirmedSeat?.userId === 'rob'
    && blocked[0].remoteSeat === 'bas');

  console.log('=== 2. host clicks during the guest turn ===');
  const during = db.writes;
  host.gameState.units.Home[0].quantity = 1;
  host.gameState._notify();
  await host.settle();
  check('host is not authorized on the guest seat', host.canPush() === false);
  check('those clicks wrote nothing', db.writes === during && qty({ units: db.doc.state.units }) === 107);
}

console.log('=== 3. host still pushes an AI turn, including the handoff ===');
{
  const template = newGs();
  template.currentPlayerIndex = 2;
  const db = new MemoryDb(seedDoc(template));
  const host = new Tab({ userId: 'rob', isHost: true, db, sessionId: 'host-ai' });
  await host.join();
  check('AI seat authorizes the host', host.canPush() === true && host._confirmedSeat?.isAI === true);
  const start = db.writes;
  for (let step = 0; step < 3; step++) {
    host.gameState.units.Home[0].quantity = 10 + step;
    host.gameState._notify();
    await host.settle();
  }
  check('each AI step pushed', db.writes === start + 3 && qty({ units: db.doc.state.units }) === 12);
  host.gameState.currentPlayerIndex = 1;
  host.gameState._notify();
  await host.settle();
  check('final push handed the turn to a human',
    db.doc.currentPlayerId === 'bas' && db.writes === start + 4);
  check('host does not keep pushing that human seat', host.canPush() === false);
}

console.log('=== 4. in-flight confirm / undo does not snap back ===');
{
  const db = new MemoryDb(seedDoc(newGs(), { session: 'tab' }));
  const tab = new Tab({ userId: 'rob', isHost: true, db, sessionId: 'tab' });
  await tab.join();
  const inflight = await tab.pushOnce({ updateLocal: false });
  check('v51 is in flight under our session',
    inflight === true && db.doc.stateVersion === 51 && db.doc.lastWriterSession === 'tab' && tab.localVersion === 50);
  tab.gameState.units.Home[0].quantity = 77;
  tab.gameState._notify();
  tab.dirty = false;
  const queued = await tab.pushOnce({ updateLocal: true });
  check('v52 queued write was accepted', queued === true && tab.events.length === 0);
  check('doc kept the confirm board', db.doc.stateVersion === 52 && qty({ units: db.doc.state.units }) === 77);
  check('client did not reload v51', qty(tab.gameState) === 77 && tab.localVersion === 52);
}

console.log('=== 5. exhausted retry force-reloads over a higher local seq ===');
{
  const db = new MemoryDb(seedDoc(newGs()));
  const tab = new Tab({ userId: 'rob', isHost: true, db, sessionId: 'tab' });
  await tab.join();
  tab.gameState.units.Home[0].quantity = 9;
  tab.gameState.actionSeq = 220;
  tab.dirty = false;
  const applied = await tab.applyRemote({ force: true });
  check('force applies when localSeq is higher and the seat matches', applied === true);
  check('local board snapped back to the doc', qty(tab.gameState) === 1 && tab.gameState.actionSeq === 200);
}

console.log('=== 6. stale second tab cannot overwrite the same seat ===');
{
  const db = new MemoryDb(seedDoc(newGs(), { session: 'fresh' }));
  const fresh = new Tab({ userId: 'rob', isHost: true, db, sessionId: 'fresh' });
  const stale = new Tab({ userId: 'rob', isHost: true, db, sessionId: 'stale' });
  await fresh.join();
  await stale.join();
  stale.online = false;
  for (let i = 0; i < 5; i++) stale.gameState._notify();
  await stale.settle();
  check('stale tab seq is higher', stale.gameState.actionSeq > fresh.gameState.actionSeq);
  fresh.gameState.units.Home[0].quantity = 3;
  fresh.gameState._notify();
  await fresh.settle();
  const writes = db.writes;
  stale.online = true;
  stale.gameState.units.Home[0].quantity = 9;
  stale.gameState._notify();
  await stale.settle();
  check('stale tab wrote nothing', db.writes === writes && qty({ units: db.doc.state.units }) === 3);
  check('stale tab reloaded the fresh board', qty(stale.gameState) === 3 && stale.localVersion === db.doc.stateVersion);
  check('stale tab logged push_stale_blocked', stale.events.some((e) => e.event === 'push_stale_blocked'));
}

console.log('=== 7. a doc with no lastWriterSession is not our in-flight save ===');
{
  const db = new MemoryDb(seedDoc(newGs()));
  const tab = new Tab({ userId: 'rob', isHost: true, db, sessionId: 'tab' });
  await tab.join();
  const newer = structuredClone(db.doc);
  newer.stateVersion = 51;
  newer.state.units.Home[0].quantity = 4;
  newer.state.actionSeq = 200;
  delete newer.lastWriterSession;
  db.doc = newer;
  tab.gameState.units.Home[0].quantity = 8;
  tab.gameState.actionSeq = 250;
  tab.dirty = false;
  const ok = await tab.pushOnce();
  check('missing lastWriterSession aborts even with a higher local seq', ok === false);
  check('the old doc was not overwritten', qty({ units: db.doc.state.units }) === 4 && db.doc.lastWriterSession == null);
  check('client reloaded that doc', qty(tab.gameState) === 4);
}

console.log('=== apply predicates from the 4:44pm report ===');
{
  check('force reload applies while the tab is offline',
    shouldApplyRemoteGameState({
      remoteVersion: 50, localVersion: 50, remoteActionSeq: 200, localActionSeq: 212, force: true,
    }) === true);
  check('a newer snapshot on the other seat applies',
    shouldApplyRemoteGameState({
      remoteVersion: 58, localVersion: 50,
      remoteCurrentPlayerId: 'Bastion', localCurrentPlayerId: 'Rob',
      remoteActionSeq: 208, localActionSeq: 212,
    }) === true);
  check('same seat and a higher local seq still refuses a non-forced snapshot',
    shouldApplyRemoteGameState({
      remoteVersion: 9, localVersion: 8, remoteActionSeq: 4, localActionSeq: 5,
      remoteCurrentPlayerId: 'a', localCurrentPlayerId: 'a',
    }) === false);
  check('resume re-read would apply the guest doc before a push',
    shouldApplyRemoteGameState({
      remoteVersion: 58, localVersion: 50,
      remoteCurrentPlayerId: 'bas', localCurrentPlayerId: 'rob',
      remoteActionSeq: 208, localActionSeq: 213, force: false,
    }) === true);
}

console.log('=== production wiring ===');
{
  const sync = readFileSync(join(root, 'src/multiplayer/syncManager.js'), 'utf8');
  const main = readFileSync(join(root, 'src/main.js'), 'utf8');
  const authority = readFileSync(join(root, 'src/multiplayer/syncAuthority.js'), 'utf8');
  check('push decision is the shared guard', sync.includes('evaluateAuthoritativePush('));
  check('each tab has a session id', sync.includes('this.sessionId = newSyncSessionId()'));
  check('the doc field is lastWriterSession', authority.includes('lastWriterSession: sessionId'));
  check('blocked push emits push_stale_blocked and force-reloads',
    sync.includes("'push_stale_blocked'") && sync.includes('_reloadRemoteState({ force: true })'));
  check('authorization is the confirmed seat', sync.includes('canPushFromConfirmedSeat('));
  check('resume re-reads the doc before a push',
    sync.includes('_beginResumeRead()') && sync.includes('_pauseForResumeRead') && sync.includes('_awaitingResumeRead'));
  check('main.js logs the stale-block fields',
    main.includes("event === 'push_stale_blocked'") && main.includes('confirmedSeat: data?.confirmedSeat') && main.includes('remoteSeat: data?.remoteSeat'));
  check('forcePush is not the rejoin fallback',
    main.includes('!hasExistingState && typeof syncManager.forcePush'));
  check('exhausted retries still force-reload', sync.includes('_reloadRemoteState({ force: true })'));
}

if (failures) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nAll stale-clobber checks passed');
